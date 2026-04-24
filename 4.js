(function () {
  'use strict';

  // === КОНФИГУРАЦИЯ ===
  var SOURCE_NAME = 'Rutor Pro';
  var PROXY_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  var ICON = '🔥'; // Можно заменить на SVG иконку при желании

  // === КЭШ ПОСМОТРЕННЫХ (опционально, как в NUMParser) ===
  var watchedCache = {};
  var CACHE_TTL = 1000 * 60 * 30; // 30 минут

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

  // Проверка, просмотрен ли элемент (упрощённая версия)
  function isWatched(item) {
    var key = item.type + ':' + item.id;
    var cached = watchedCache[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.watched;
    }
    // Здесь можно добавить интеграцию с Lampa.Favorite или Lampa.Timeline
    // Пока возвращаем false
    watchedCache[key] = { watched: false, ts: Date.now() };
    return false;
  }

  // Нормализация данных от Worker'а под формат Lampa
  function normalizeItem(item) {
    if (!item) return null;

    // Пропускаем дубликаты по ID + типу
    var dedupKey = (item.type || 'movie') + ':' + (item.id || '');
    if (normalizeItem._seen && normalizeItem._seen[dedupKey]) {
      return null;
    }
    if (!normalizeItem._seen) normalizeItem._seen = {};
    normalizeItem._seen[dedupKey] = true;

    var dateStr = item.release_date || item.first_air_date || '';
    var year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : 0;

    return {
      // Обязательные поля для Lampa
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
      source: item.source || SOURCE_NAME,

      // Для сериалов
      number_of_seasons: item.number_of_seasons,

      // Мета для отладки (можно убрать в продакшене)
      _source_data: null // item._debug || null
    };
  }

  // HTTP-запрос с таймаутом
  function xhrGet(url, onSuccess, onError, timeout) {
    timeout = timeout || 15000;
    var xhr = new XMLHttpRequest();
    var timedOut = false;

    var timer = setTimeout(function () {
      timedOut = true;
      xhr.abort();
      onError(new Error('Timeout'));
    }, timeout);

    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && !timedOut) {
        clearTimeout(timer);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var json = JSON.parse(xhr.responseText);
            onSuccess(json);
          } catch (e) {
            onError(new Error('JSON parse: ' + e.message));
          }
        } else {
          onError(new Error('HTTP ' + xhr.status + ': ' + xhr.statusText));
        }
      }
    };
    xhr.onerror = function () {
      clearTimeout(timer);
      if (!timedOut) onError(new Error('Network error'));
    };
    xhr.send();
  }

  // === API SERVICE ===
  function Api() {
    var self = this;

    // Получение списка категорий (главное меню источника)
    self.category = function (params, onSuccess, onError) {
      // Если нет URL — отдаём список категорий
      if (!params.url) {
        var categories = [
          { id: 'rutor_top24', title: '🔥 Топ за 24 часа', url: 'lampac_top24' },
          { id: 'rutor_movies', title: '🎬 Зарубежные фильмы', url: 'lampac_movies' },
          { id: 'rutor_movies_ru', title: '🇷🇺 Наши фильмы', url: 'lampac_movies_ru' },
          { id: 'rutor_tv', title: '📺 Зарубежные сериалы', url: 'lampac_tv_shows' },
          { id: 'rutor_tv_ru', title: '🇷🇺 Наши сериалы', url: 'lampac_tv_shows_ru' },
          { id: 'rutor_televizor', title: '📡 ТВ-передачи', url: 'lampac_televizor' }
        ];
        onSuccess(categories);
        return;
      }

      // Запрос списка фильмов/сериалов
      var page = params.page || 1;
      var url = PROXY_URL + params.url + '?page=' + page;

      xhrGet(url,
        function (data) {
          if (!data || !Array.isArray(data.results)) {
            onError(new Error('Invalid response format'));
            return;
          }

          // Сброс кэша дедупликации для нового запроса
          normalizeItem._seen = {};

          // Нормализация + фильтрация просмотренных (опционально)
          var results = data.results
            .map(normalizeItem)
            .filter(function (item) {
              return item && !isWatched(item);
            });

          onSuccess({
            results: results,
            page: data.page || page,
            total_pages: data.total_pages || 1,
            total_results: data.total_results || results.length,
            source: SOURCE_NAME
          });
        },
        function (err) {
          console.error('Rutor Pro: Request failed', err);
          onError(err);
        }
      );
    };

    // Получение полной информации о карточке (делегирование TMDB)
    self.full = function (params, onSuccess, onError) {
      var card = params.card || {};
      var type = (card.number_of_seasons || card.type === 'tv') ? 'tv' : 'movie';

      // Пробуем получить данные через TMDB (если есть ID)
      if (card.id && Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
        Lampa.Api.sources.tmdb.full(
          { card: card, method: type },
          onSuccess,
          function (e) {
            // Fallback: возвращаем то, что есть
            console.warn('TMDB full failed, using cached data');
            onSuccess(card);
          }
        );
      } else {
        // Если TMDB недоступен — отдаём исходные данные
        onSuccess(card);
      }
    };

    // Поиск (опционально, можно реализовать позже)
    self.search = function (params, onSuccess, onError) {
      // Поиск через Worker не реализован — можно добавить позже
      onError(new Error('Search not implemented'));
    };
  }

  // === РЕГИСТРАЦИЯ ИСТОЧНИКА ===
  if (!Lampa.Api.sources[SOURCE_NAME]) {
    Lampa.Api.sources[SOURCE_NAME] = new Api();
  }

  // === ИНТЕГРАЦИЯ В МЕНЮ ===
  function addToMenu() {
    var menu = document.querySelector('.menu .menu__list') || 
               document.querySelector('.menu__list');
    
    if (!menu) return false;
    
    // Проверка, что пункт ещё не добавлен
    if (menu.querySelector('[data-source="' + SOURCE_NAME + '"]')) {
      return true;
    }

    var li = document.createElement('li');
    li.className = 'menu__item selector';
    li.setAttribute('data-source', SOURCE_NAME);
    li.innerHTML = 
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">' + SOURCE_NAME + '</div>';
    
    li.addEventListener('hover:enter', function () {
      Lampa.Activity.push({
        title: SOURCE_NAME,
        component: 'category',
        source: SOURCE_NAME,
        page: 1
      });
    });

    menu.appendChild(li);
    console.log('✅ ' + SOURCE_NAME + ': added to menu');
    return true;
  }

  // === ИНИЦИАЛИЗАЦИЯ ===
  function init() {
    // Пробуем добавить в меню
    if (!addToMenu()) {
      // Если меню ещё не готово — ждём через MutationObserver
      var observer = new MutationObserver(function () {
        if (addToMenu()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      
      // Таймаут на случай, если меню не появится
      setTimeout(function () { observer.disconnect(); }, 10000);
    }

    // Обработчик обновления линии (для подгрузки следующих страниц)
    Lampa.Listener.follow('line', function (event) {
      if (event.type !== 'append') return;
      var data = event.data;
      if (!data || data.source !== SOURCE_NAME) return;

      // Авто-подгрузка при скролле (если нужно больше элементов)
      if (data.results.length < 20 && data.page < data.total_pages) {
        var api = Lampa.Api.sources[SOURCE_NAME];
        if (api && api.category) {
          api.category(
            { url: data.url, page: data.page + 1, source: SOURCE_NAME },
            function (nextData) {
              if (nextData && nextData.results && nextData.results.length) {
                data.results = data.results.concat(
                  nextData.results.map(normalizeItem).filter(Boolean)
                );
                data.page = nextData.page;
                data.more = nextData.page < nextData.total_pages;
                if (event.line && event.line.update) {
                  event.line.update();
                }
              }
            },
            function () {}
          );
        }
      }
    });

    console.log('✅ ' + SOURCE_NAME + ': plugin initialized');
  }

  // === ЗАПУСК ===
  if (window.appready) {
    init();
  } else {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') {
        init();
      }
    });
  }

})();
