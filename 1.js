(function () {
  'use strict';

  const SOURCE = 'Rutor Pro';
  const PROXY = 'https://ваш-worker.workers.dev/'; // замените на свой URL
  const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

  // очередь для ограничения параллельных запросов (оставляем как есть)
  let q = [], a = 0, MAX = 5;
  function run() { if (a >= MAX || !q.length) return; let j = q.shift(); a++; j(() => { a--; run(); }); run(); }
  function add(fn) { q.push(fn); run(); }

  // ---- поиск через TMDB (единый для всех) ----
  function search(item, cb) {
    let query = item.alt || item.title;
    add(done => {
      fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(j => {
          let r = (j.results || [])[0];
          if (!r) return done();
          cb({
            id: r.id,
            title: r.title || r.name,
            poster_path: r.poster_path ? 'https://image.tmdb.org/t/p/w500' + r.poster_path : '',
            backdrop_path: r.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + r.backdrop_path : '',
            type: r.media_type
          });
          done();
        })
        .catch(() => done());
    });
  }

  // ---- API для Lampa ----
  function Api() {
    this.category = function (params, onSuccess, onError) {
      fetch(PROXY)
        .then(r => r.json())
        .then(data => {
          let parts = [];
          let allPromises = [];

          Object.keys(data).forEach(cat => {
            let row = { title: cat, results: [], type: 'line' };
            parts.push(row);

            let items = data[cat] || [];
            let catPromises = items.slice(0, 30).map(item => {
              return new Promise(resolve => {
                search(item, res => {
                  if (res) {
                    res.poster_path = res.poster_path || '/img/img_broken.svg';
                    row.results.push(res);
                  }
                  resolve();
                });
              });
            });
            allPromises.push(...catPromises);
          });

          Promise.all(allPromises).then(() => onSuccess(parts));
        })
        .catch(onError);
    };

    // полная информация через TMDB (работает, т.к. id всегда от TMDB)
    this.full = function (item, onSuccess, onError) {
      Lampa.Api.sources.tmdb.full(item, onSuccess, onError);
    };
  }

  // ---- добавление кнопки в меню ----
  function start() {
    let api = new Api();
    Lampa.Api.sources.rutorpro = api;
    Object.defineProperty(Lampa.Api.sources, SOURCE, { get: () => api });

    function btn() {
      let m = document.querySelector('.menu .menu__list');
      if (!m) return setTimeout(btn, 500);
      if (document.querySelector('[data-rutor]')) return;

      let li = document.createElement('li');
      li.className = 'menu__item selector';
      li.setAttribute('data-rutor', '1');
      li.innerHTML = `<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;
      li.addEventListener('hover:enter', () => {
        Lampa.Activity.push({ component: 'category', source: SOURCE, title: SOURCE });
      });
      m.appendChild(li);
    }
    btn();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
