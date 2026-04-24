(function () {
  'use strict';

  // === CONFIG ===
  var SOURCE_NAME = 'Rutor Pro';
  var PROXY_URL = 'https://my-proxy-worker.mail-internetx.workers.dev';
  var ICON = '🔥';

  // === NORMALIZE ===
  function normalizeItem(item) {
    if (!item) return null;

    var dateStr = item.release_date || item.first_air_date || '';
    var year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : 0;

    var type = item.media_type || item.type || 'movie';

    return {
      id: item.id || 0,
      title: item.title || item.name || 'Без названия',
      name: item.name || item.title || 'Без названия',
      original_title: item.original_title || '',
      poster_path: item.poster_path || '',
      backdrop_path: item.backdrop_path || '',
      overview: item.overview || '',
      vote_average: parseFloat(item.vote_average) || 0,

      type: type,
      media_type: type,

      original_language: item.original_language || 'en',
      release_date: item.release_date || '',
      first_air_date: item.first_air_date || '',
      year: year,

      promo_title: item.title || '',
      promo: item.overview || '',
      source: SOURCE_NAME
    };
  }

  // === HTTP ===
  function xhrGet(url, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            onSuccess(JSON.parse(xhr.responseText));
          } catch (e) {
            onError(new Error('JSON parse error'));
          }
        } else {
          onError(new Error('HTTP ' + xhr.status));
        }
      }
    };

    xhr.onerror = function () {
      onError(new Error('Network error'));
    };

    xhr.send();
  }

  // === API ===
  function Api() {
    var self = this;

    self.category = function (params, onSuccess, onError) {
      params = params || {};

      // 🔥 1. ПОЛУЧЕНИЕ КАТЕГОРИЙ С WORKER
      if (!params.url || params.url === '__categories__') {
        xhrGet(PROXY_URL + '/',
          function (data) {
            if (!data || !Array.isArray(data.results)) {
              onError(new Error('Invalid categories'));
              return;
            }

            var cats = data.results.map(function (cat) {
              return {
                id: cat.id,
                title: cat.title,
                name: cat.title,
                url: cat.url, // 🔥 ВАЖНО: теперь берем из worker

                // 👇 чтобы Lampa показала
                poster_path: '/img/img_broken.svg',
                backdrop_path: '',
                type: 'movie',
                media_type: 'movie',
                vote_average: 0,
                overview: 'Открыть категорию',
                source: SOURCE_NAME
              };
            });

            onSuccess({
              results: cats,
              page: 1,
              total_pages: 1,
              total_results: cats.length,
              source: SOURCE_NAME
            });
          },
          onError
        );
        return;
      }

      // 🔥 2. ЗАГРУЗКА КОНТЕНТА КАТЕГОРИИ
      var page = params.page || 1;

      var url = PROXY_URL + params.url;

      xhrGet(url,
        function (data) {

          if (!data || !Array.isArray(data.results)) {
            onError(new Error('Invalid response'));
            return;
          }

          var items = data.results
            .map(normalizeItem)
            .filter(function (x) { return x && x.id; });

          onSuccess({
            results: items,
            page: data.page || page,
            total_pages: data.total_pages || 1,
            total_results: data.total_results || items.length,
            source: SOURCE_NAME,
            url: params.url
          });
        },
        function (err) {
          console.error('Rutor error:', err);
          onError(err);
        }
      );
    };

    // === FULL ===
    self.full = function (params, onSuccess, onError) {
      var card = params.card || {};
      var method = (card.media_type === 'tv') ? 'tv' : 'movie';

      if (Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
        Lampa.Api.sources.tmdb.full(
          { card: card, method: method },
          onSuccess,
          function () { onSuccess(card); }
        );
      } else {
        onSuccess(card);
      }
    };
  }

  // === REGISTER ===
  if (!Lampa.Api.sources[SOURCE_NAME]) {
    Lampa.Api.sources[SOURCE_NAME] = new Api();
  }

  // === MENU ===
  function addMenuItem() {
    var menu = document.querySelector('.menu .menu__list') ||
               document.querySelector('.menu__list');

    if (!menu) return false;
    if (menu.querySelector('[data-rutor-source]')) return true;

    var li = document.createElement('li');
    li.className = 'menu__item selector';
    li.setAttribute('data-rutor-source', '1');

    li.innerHTML =
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">' + SOURCE_NAME + '</div>';

    li.addEventListener('hover:enter', function () {
      Lampa.Activity.push({
        title: SOURCE_NAME,
        component: 'category',
        source: SOURCE_NAME,
        url: '__categories__'
      });
    });

    menu.appendChild(li);
    return true;
  }

  // === INIT ===
  function init() {
    if (!addMenuItem()) {
      var obs = new MutationObserver(function () {
        if (addMenuItem()) obs.disconnect();
      });

      obs.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () {
        obs.disconnect();
      }, 10000);
    }
  }

  if (window.appready) {
    init();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') init();
    });
  }

})();
