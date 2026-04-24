(function () {
  'use strict';

  // === КОНФИГУРАЦИЯ ===
  var SOURCE_NAME = 'Rutor Pro';
  var PROXY_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  var ICON = '🔥';

  // === НОРМАЛИЗАЦИЯ ЭЛЕМЕНТА ===
  function normalizeItem(item) {
    if (!item) return null;
    
    var dateStr = item.release_date || item.first_air_date || '';
    var year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : 0;

    return {
      id: item.id || 0,
      title: item.title || item.name || 'Без названия',
      name: item.name || item.title || 'Без названия',
      original_title: item.original_title || '',
      poster_path: item.poster_path || '',
      backdrop_path: item.backdrop_path || '',
      overview: item.overview || '',
      vote_average: parseFloat(item.vote_average) || 0,
      type: item.type === 'tv' ? 'tv' : 'movie',
      media_type: item.type === 'tv' ? 'tv' : 'movie',
      original_language: item.original_language || 'en',
      release_date: item.release_date || '',
      first_air_date: item.first_air_date || '',
      year: year,
      promo_title: item.promo_title || item.title || '',
      promo: item.promo || item.overview || '',
      source: SOURCE_NAME
    };
  }

  // === HTTP ЗАПРОС ===
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
    xhr.onerror = function () { onError(new Error('Network error')); };
    xhr.send();
  }

  // === API SERVICE ===
  function Api() {
    var self = this;

    self.category = function (params, onSuccess, onError) {
      params = params || {};

      // 🔹 1. СПИСОК КАТЕГОРИЙ (если url не указан)
      if (!params.url) {
        var categories = [
          { id: 'rutor_top24', title: '🔥 Топ за 24 часа', url: 'lampac_top24', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' },
          { id: 'rutor_movies', title: '🎬 Зарубежные фильмы', url: 'lampac_movies', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' },
          { id: 'rutor_movies_ru', title: '🇷🇺 Наши фильмы', url: 'lampac_movies_ru', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' },
          { id: 'rutor_tv', title: '📺 Зарубежные сериалы', url: 'lampac_tv_shows', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' },
          { id: 'rutor_tv_ru', title: '🇷🇺 Наши сериалы', url: 'lampac_tv_shows_ru', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' },
          { id: 'rutor_televizor', title: '📡 ТВ-передачи', url: 'lampac_televizor', source: SOURCE_NAME, type: 'category', poster_path: '', backdrop_path: '' }
        ];

        // ✅ КРИТИЧНО: всегда возвращаем объект с полем results
        onSuccess({
          results: categories,
          page: 1,
          total_pages: 1,
          total_results: categories.length,
          source: SOURCE_NAME
        });
        return;
      }

      // 🔹 2. СПИСОК ФИЛЬМОВ/СЕРИАЛОВ
      var page = params.page || 1;
      var requestUrl = PROXY_URL + params.url + '?page=' + page;

      xhrGet(requestUrl,
        function (data) {
          if (!data || !Array.isArray(data.results)) {
            onError(new Error('Invalid response structure'));
            return;
          }
          
          var items = data.results
            .map(normalizeItem)
            .filter(function (item) { return item && item.id; });

          // ✅ Единый формат ответа
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
          console.error('Rutor Pro error:', err);
          onError(err);
        }
      );
    };

    // Полная информация о карточке (делегирование TMDB)
    self.full = function (params, onSuccess, onError) {
      var card = params.card || {};
      var method = (card.type === 'tv' || card.number_of_seasons) ? 'tv' : 'movie';
      
      if (Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
        Lampa.Api.sources.tmdb.full({ card: card, method: method }, onSuccess, function() {
          onSuccess(card); // fallback если TMDB недоступен
        });
      } else {
        onSuccess(card);
      }
    };
  }

  // === РЕГИСТРАЦИЯ ИСТОЧНИКА ===
  if (!Lampa.Api.sources[SOURCE_NAME]) {
    Lampa.Api.sources[SOURCE_NAME] = new Api();
  }

  // === ДОБАВЛЕНИЕ В МЕНЮ ===
  function addMenuItem() {
    var menu = document.querySelector('.menu .menu__list') || 
               document.querySelector('.menu__list');
    if (!menu) return false;
    if (menu.querySelector('[data-rutor-source]')) return true;

    var li = document.createElement('li');
    li.className = 'menu__item selector';
    li.setAttribute('data-rutor-source', '1');
    li.innerHTML = '<div class="menu__ico">' + ICON + '</div><div class="menu__text">' + SOURCE_NAME + '</div>';
    
    li.addEventListener('hover:enter', function () {
      Lampa.Activity.push({
        title: SOURCE_NAME,
        component: 'category',
        source: SOURCE_NAME,
        url: '' // пустой url -> покажет список категорий
      });
    });

    menu.appendChild(li);
    console.log('✅ ' + SOURCE_NAME + ': menu item added');
    return true;
  }

  // === ИНИЦИАЛИЗАЦИЯ ===
  function init() {
    if (!addMenuItem()) {
      var obs = new MutationObserver(function () {
        if (addMenuItem()) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); }, 10000);
    }
    console.log('✅ ' + SOURCE_NAME + ': plugin initialized');
  }

  // Запуск
  if (window.appready) {
    init();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') init();
    });
  }

})();
