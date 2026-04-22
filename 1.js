(function () {
  'use strict';

  const SOURCE = 'Rutor Pro';
  const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

  // ---------- HELPERS ----------
  function norm(s) { 
    return (s || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, ''); 
  }

  function score(a, b, y1, y2) {
    a = norm(a); 
    b = norm(b);
    if (a === b) return 100;

    let same = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) same++;
    }

    let s = (same / Math.max(a.length, b.length)) * 100;
    
    // Исправлен баг с undefined === undefined
    if (y1 && y2 && String(y1) === String(y2)) s += 30;

    return s;
  }

  // Искусственная задержка для защиты от бана TMDB API
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------- TMDB SEARCH ----------
  function tmdb(q) {
    return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`)
      .then(r => r.json())
      .then(j => j.results || [])
      .catch(() => []);
  }

  // ---------- SEARCH ----------
  async function search(item) {
    // Защита: если прокси вернул не объект, а строку или что-то другое
    if (typeof item !== 'object' || !item) return null;

    let query = item.alt || item.title || item.name;
    if (!query) return null;

    let list = await tmdb(query);
    if (!list.length) return null;

    let best = list
      .map(r => ({
        ...r,
        score: score(
          item.title || item.name, 
          r.title || r.name, 
          item.year, 
          (r.release_date || r.first_air_date || '').slice(0, 4)
        )
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
          
          // ВАЖНО: делаем запросы ПО ОДНОМУ с задержкой 200мс, чтобы TMDB не забанил ключ
          for (let item of data[cat].slice(0, 30)) {
            let result = await search(item);
            await delay(200); // Пауза между запросами
            
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

    // Открываем стандартную карточку TMDB
    this.full = function (p, s, e) {
      Lampa.Api.sources.tmdb.full(p, s, e);
    };

    // КРИТИЧЕСКИ ВАЖНЫЙ МЕТОД ДЛЯ ПЛАГИНА
    // Именно сюда Lampa придет, когда пользователь нажмет "Смотреть" в карточке
    this.detail = function (params, onReady, onError) {
      // params.id - это TMDB ID фильма/сериала
      
      // ТЕБЕ СЮДА НУЖНО ДОБАВИТЬ ЛОГИКУ:
      // 1. Искать раздачу на RuTor (через PROXY) по params.original_title или params.title
      // 2. Получать magnet-ссылку или раздачу
      // 3. Формировать объект файлов для Lampa (например, через Lampa.Torrent.parse)
      
      // ВРЕМЕННАЯ ЗАГЛУШКА (показывает сообщение, что парсер еще не готов):
      Lampa.Notice.show('Парсер торрентов для этого плагина еще не реализован');
      
      // Пример того, что должен вернуть onReady (если бы у тебя был magnet):
      /*
      let fake_element = {
        title: params.title,
        quality: '1080p',
        voice: 'Русский',
        torrent_hash: 'ваш_хеш',
        // ... другие данные
      };
      
      Lampa.Torrent.parse(fake_element, magnet_link, {
        onReady: function(files) {
          onReady(files); // Передаем файлы в плеер Lampa
        }
      });
      */
    };

    // Заглушка для поиска через главную строку Lampa (опционально)
    this.search = function (q, onSuccess) {
      onSuccess([]);
    };
  }

  // ---------- INIT ----------
  function start() {
    let api = new Api();

    // Безопасная регистрация источника
    if (!Lampa.Api.sources.rutorpro) {
      Lampa.Api.sources.rutorpro = api;
    }

    try {
      Object.defineProperty(Lampa.Api.sources, SOURCE, {
        configurable: true, // Защита от ошибок при перезагрузке
        get: () => api
      });
    } catch (e) {}

    // Правильное добавление в меню через API Lampa
    if (Lampa.Menu && Lampa.Menu.add) {
      Lampa.Menu.addSeparator();
      Lampa.Menu.add({
        title: SOURCE,
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>', // Замени на свою иконку или оставь эмодзи
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
