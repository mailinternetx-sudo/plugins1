(function () {
  'use strict';

  const SOURCE = 'Rutor Pro';
  const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

  // ---------- HELPERS ----------
  function norm(s) { return (s || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, ''); }

  function score(a, b, y1, y2) {
    a = norm(a); b = norm(b);
    if (a === b) return 100;
    let same = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) same++;
    }
    let s = (same / Math.max(a.length, b.length)) * 100;
    if (y1 && y2 && String(y1) === String(y2)) s += 30;
    return s;
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------- TMDB SEARCH ----------
  function tmdb(q) {
    return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`)
      .then(r => r.json())
      .then(j => j.results || [])
      .catch(() => []);
  }

  // ---------- SEARCH (Каталог) ----------
  async function search(item) {
    if (typeof item !== 'object' || !item) return null;
    let query = item.alt || item.title || item.name;
    if (!query) return null;

    let list = await tmdb(query);
    if (!list.length) return null;

    let best = list
      .map(r => ({
        ...r,
        score: score(item.title || item.name, r.title || r.name, item.year, (r.release_date || r.first_air_date || '').slice(0, 4))
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < 40) return null;

    return {
      id: best.id,
      title: best.title || best.name,
      name: best.title || best.name,
      original_title: best.original_title || best.original_name,
      poster_path: best.poster_path,
      backdrop_path: best.backdrop_path,
      overview: best.overview,
      vote_average: best.vote_average,
      media_type: best.media_type,
      release_date: best.release_date,
      first_air_date: best.first_air_date,
      source: 'tmdb'
    };
  }

  // ---------- ПАРСИНГ ФАЙЛОВ ДЛЯ LAMPA ----------
  function extractVideoFiles(parsedTorrent) {
    let files = parsedTorrent.files || [];
    let videos = files.filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.name || f.path));
    videos.sort((a, b) => (b.size || 0) - (a.size || 0));

    let playlist = [];
    let seasons = {};

    videos.forEach(file => {
      let path = file.path || file.name;
      let match = path.match(/(?:сезон|season)[\s_-]*(\d+)/i) || path.match(/s(\d{2})e/i);

      if (match) {
        let seasonNum = parseInt(match[1]);
        let epMatch = path.match(/(?:серия|серии|episode|e)[\s_-]*(\d+)/i) || path.match(/s\d{2}e(\d{2})/i);
        let epNum = epMatch ? parseInt(epMatch[1]) : 1;

        if (!seasons[seasonNum]) seasons[seasonNum] = [];
        seasons[seasonNum].push({
          title: `Серия ${epNum}`,
          file: file.stream,
          quality: file.quality || '',
          info: {}
        });
      } else {
        playlist.push({
          title: file.name || path.split('/').pop(),
          file: file.stream,
          quality: file.quality || '',
          info: {}
        });
      }
    });

    if (Object.keys(seasons).length > 0) {
      return Object.keys(seasons).sort((a, b) => a - b).map(s => ({
        title: `Сезон ${s}`,
        episodes: seasons[s]
      }));
    }
    return playlist;
  }

  // ---------- API ----------
  function Api() {

    this.category = async function (params, onSuccess, onError) {
      try {
        let data = await fetch(PROXY + '?v=' + Date.now()).then(r => r.json());
        let parts = [];
        for (let cat in data) {
          let row = { title: cat, results: [], type: 'line' };
          parts.push(row);
          let seen = new Set();
          for (let item of data[cat].slice(0, 30)) {
            let result = await search(item);
            await delay(200); 
            if (result && !seen.has(result.id)) {
              seen.add(result.id);
              row.results.push(result);
            }
          }
        }
        onSuccess(parts);
      } catch (e) {
        onError(e);
      }
    };

    this.full = function (p, s, e) {
      Lampa.Api.sources.tmdb.full(p, s, e);
    };

    // ==========================================
    // НАЖАТИЕ "СМОТРЕТЬ"
    // ==========================================
    this.detail = function (params, onReady, onError) {
      // Формируем запрос. Пробуем оригинальное название, если есть
      let searchQuery = (params.original_title || params.title) + ' ' + (params.year || '');
      
      Lampa.Template.show('loading', { title: 'Поиск раздач на Rutor...' });

      // Шлем запрос на поиск к нашему воркеру
      fetch(PROXY + '?search=' + encodeURIComponent(searchQuery))
        .then(r => r.json())
        .then(data => {
          Lampa.Template.hide('loading');
          
          if (!data || !data.length) {
            Lampa.Notice.show('По данному фильму нет раздач');
            return;
          }

          // Меню выбора раздачи
          let items = data.map(torrent => ({
            title: torrent.title,
            subtitle: `Размер: ${torrent.size || '?'} | Сиды: ${torrent.seeders || '?'}`,
            torrent_link: torrent.link
          }));

          Lampa.Select.show({
            title: 'Выберите раздачу',
            items: items,
            onSelect: function (selectedItem) {
              getMagnetAndPlay(selectedItem.torrent_link, onReady);
            },
            onBack: function () {}
          });
        })
        .catch(e => {
          Lampa.Template.hide('loading');
          Lampa.Notice.show('Ошибка поиска');
          onError(e);
        });
    };

    // Достаем Magnet и запускаем
    async function getMagnetAndPlay(link, onReady) {
      Lampa.Template.show('loading', { title: 'Получение magnet-ссылки...' });
      
      try {
        // Просим воркер зайти на страницу раздачи и достать magnet
        let response = await fetch(PROXY + '?torrent=' + encodeURIComponent(link));
        if (!response.ok) throw new Error('Worker error');
        
        let magnet = await response.text();
        
        if (!magnet.startsWith('magnet:')) {
          Lampa.Template.hide('loading');
          Lampa.Notice.show('Не удалось получить magnet-ссылку');
          return;
        }

        Lampa.Template.show('loading', { title: 'Запуск TorrServer...' });

        // Передаем magnet во внутренний парсер Lampa
        Lampa.Torrent.parseKnown(magnet, null, (parsedData) => {
          Lampa.Template.hide('loading');

          if (!parsedData || !parsedData.files || !parsedData.files.length) {
            Lampa.Notice.show('В торренте не найдено видео файлов');
            return;
          }

          let playlist = extractVideoFiles(parsedData);
          if (!playlist.length) {
            Lampa.Notice.show('Не удалось извлечь видео');
            return;
          }

          let resultForLampa = {
            title: 'Rutor Pro',
            hash: parsedData.hash,
            results: []
          };

          if (Array.isArray(playlist[0]) || playlist[0].episodes) {
            resultForLampa.results = [{
              title: 'Rutor Pro',
              translation: 'Найдено',
              episodes: Array.isArray(playlist[0]) ? playlist : playlist[0].episodes,
              stream: ''
            }];
          } else {
            resultForLampa.results = [{
              title: playlist[0].title || 'Файл',
              quality: playlist[0].quality || '',
              translation: 'Найдено',
              stream: playlist[0].file,
              info: {}
            }];
          }

          onReady(resultForLampa);

        }, (err) => {
          Lampa.Template.hide('loading');
          Lampa.Notice.show('Ошибка TorrServer: ' + err.message);
        });

      } catch (e) {
        Lampa.Template.hide('loading');
        Lampa.Notice.show('Ошибка сети');
      }
    }

    this.search = function (q, onSuccess) {
      onSuccess([]);
    };
  }

  // ---------- INIT ----------
  function start() {
    let api = new Api();
    if (!Lampa.Api.sources.rutorpro) Lampa.Api.sources.rutorpro = api;

    try {
      Object.defineProperty(Lampa.Api.sources, SOURCE, {
        configurable: true,
        get: () => api
      });
    } catch (e) {}

    if (Lampa.Menu && Lampa.Menu.add) {
      Lampa.Menu.addSeparator();
      Lampa.Menu.add({
        title: SOURCE,
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#ff6600"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
        separator: false,
        onSelect: function () {
          Lampa.Activity.push({
            component: 'category',
            source: SOURCE,
            title: SOURCE
          });
        }
      });
    }
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', e => {
    if (e.type === 'ready') start();
  });

})();
