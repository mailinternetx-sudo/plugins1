(function () {
  'use strict';

  var DEFAULT_SOURCE_NAME = 'Rutor Pro';
  var BASE_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  var ICON = '🔥';
  var DEFAULT_MIN_PROGRESS = 90;

  function getStorage(key, fallback) {
    try { return window.Lampa && Lampa.Storage ? Lampa.Storage.get(key, fallback) : fallback; }
    catch (e) { return fallback; }
  }
  function setStorage(key, value) {
    try { if (window.Lampa && Lampa.Storage) Lampa.Storage.set(key, value); } catch (e) {}
  }

  var SOURCE_NAME = DEFAULT_SOURCE_NAME;
  var MIN_PROGRESS = DEFAULT_MIN_PROGRESS;

  var CATEGORY_SETTINGS_ORDER = ['top24', 'movies', 'movies_ru', 'tv', 'tv_ru', 'televizor'];
  var CATEGORIES = {
    top24: 'lampac_top24',
    movies: 'lampac_movies',
    movies_ru: 'lampac_movies_ru',
    tv: 'lampac_tv_shows',
    tv_ru: 'lampac_tv_shows_ru',
    televizor: 'lampac_televizor'
  };

  function getCategoryVisibility() {
    return {
      top24: { title: '🔥 Топ за 24 часа', visible: getStorage('rutor_cat_top24', true) },
      movies: { title: '🎬 Зарубежные фильмы', visible: getStorage('rutor_cat_movies', true) },
      movies_ru: { title: '🇷🇺 Наши фильмы', visible: getStorage('rutor_cat_movies_ru', true) },
      tv: { title: '📺 Зарубежные сериалы', visible: getStorage('rutor_cat_tv', true) },
      tv_ru: { title: '🇷🇺 Наши сериалы', visible: getStorage('rutor_cat_tv_ru', true) },
      televizor: { title: '📡 ТВ-передачи', visible: getStorage('rutor_cat_televizor', true) }
    };
  }

  function filterWatchedContent(results) {
    try {
      var hideWatched = getStorage('rutor_hide_watched', false);
      if (!hideWatched) return results;

      var favData = getStorage('favorite', '{}');
      var favorite = {};
      try { favorite = typeof favData === 'string' ? JSON.parse(favData || '{}') : favData; }
      catch (e) { favorite = {}; }
      if (!Array.isArray(favorite.card)) favorite.card = [];

      return results.filter(function (item) {
        if (!item || !item.id) return true;
        var mediaType = (item.first_air_date || item.number_of_seasons || item.type === 'tv') ? 'tv' : 'movie';
        var checkItem = {
          id: item.id, media_type: mediaType, title: item.title || item.name || '',
          original_title: item.original_title || '', poster_path: item.poster_path || '', backdrop_path: item.backdrop_path || ''
        };
        var fav = Lampa.Favorite.check(checkItem);
        if (fav && fav.thrown) return false;
        if (!fav || !fav.history) return true;
        if (mediaType === 'movie') {
          var hash = Lampa.Utils.hash(String(item.id));
          var view = Lampa.Storage.cache('file_view', 300, {})[hash];
          if (view && view.percent && view.percent >= MIN_PROGRESS) return false;
          return true;
        }
        return true;
      });
    } catch (e) { return results; }
  }

  function normalizeData(json, categoryUrl) {
    function toTmdbPath(v) {
      if (!v || typeof v !== 'string') return '';
      if (v.charAt(0) === '/') return v;
      if (/^https?:\/\//i.test(v)) {
        var m = v.match(/^https?:\/\/image\.tmdb\.org\/t\/p\/[^?#]+\/(.+)$/i);
        return m ? '/' + m[1] : '';
      }
      return '';
    }

    var results = (json.results || []).map(function (item) {
      var posterPath = toTmdbPath(item.poster_path);
      var backdropPath = toTmdbPath(item.backdrop_path);
      if (!posterPath && item.poster_path) posterPath = '/t/p/w500' + item.poster_path.replace(/^https?:\/\/[^\/]+\/t\/p\/w\d+\//, '');
      if (!backdropPath && item.backdrop_path) backdropPath = '/t/p/original' + item.backdrop_path.replace(/^https?:\/\/[^\/]+\/t\/p\/original\//, '');

      return {
        id: item.id,
        title: item.title || item.name || 'Без названия',
        name: item.name || item.title || 'Без названия',
        original_title: item.original_title || '',
        original_name: item.original_name || '',
        poster_path: posterPath || '',
        backdrop_path: backdropPath || '',
        overview: item.overview || '',
        vote_average: parseFloat(item.vote_average) || 0,
        rating: { kp: parseFloat(item.vote_average) || 0, tmdb: parseFloat(item.vote_average) || 0 },
        type: item.type === 'tv' ? 'tv' : 'movie',
        media_type: item.type === 'tv' ? 'tv' : 'movie',
        original_language: item.original_language || 'en',
        release_date: item.release_date || '',
        first_air_date: item.first_air_date || '',
        year: item.year || (item.release_date ? parseInt(item.release_date.substring(0,4),10) : 0),
        promo_title: item.promo_title || item.title || '',
        promo: item.promo || item.overview || '',
        source: SOURCE_NAME,
        number_of_seasons: item.number_of_seasons,
        status: item.status || ''
      };
    });

    if (categoryUrl && categoryUrl !== '__categories__') {
      results = filterWatchedContent(results);
    }

    return {
      results: results,
      page: json.page || 1,
      total_pages: json.total_pages || 1,
      total_results: json.total_results || results.length,
      url: categoryUrl,
      source: SOURCE_NAME
    };
  }

  function RutorApiService() {
    var self = this;
    try { self.network = new Lampa.Reguest(); }
    catch (e) {
      self.network = {
        silent: function(url, onSuccess, onError) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
              if (xhr.status >= 200 && xhr.status < 300) {
                try { onSuccess(JSON.parse(xhr.responseText)); } catch (e) { onError(e); }
              } else { onError(new Error('HTTP ' + xhr.status)); }
            }
          };
          xhr.onerror = function() { onError(new Error('Network')); };
          xhr.send();
        }
      };
    }

    self.get = function (url, params, onComplete, onError) {
      self.network.silent(url, function (json) {
        if (!json) { onError(new Error('Empty response')); return; }
        onComplete(normalizeData(json, params.url));
      }, onError);
    };

    self.list = function (params, onComplete, onError) {
      params = params || {};
      var category = params.url || CATEGORIES.movies;
      var page = params.page || 1;
      self.get(BASE_URL + category + '?page=' + page, params, function (data) {
        onComplete({
          results: data.results, page: data.page,
          total_pages: data.total_pages, total_results: data.total_results
        });
      }, onError);
    };

    self.full = function (params, onSuccess, onError) {
      params = params || {};
      var card = params.card || params.item || params.data || {};
      
      if (card.url && (card.type === 'category' || card.media_type === 'category')) {
        try { Lampa.Activity.push({ title: card.title, component: 'category', source: SOURCE_NAME, url: card.url, page: 1 }); }
        catch (e) { console.warn('Nav failed:', e); }
        onSuccess(card); return;
      }
      
      var rawId = card.id || card.tmdb_id || card.kinopoisk_id;
      var idStr = String(rawId || '').trim();
      var isTmdbId = /^\d+$/.test(idStr);
      
      if (!isTmdbId || !rawId) {
        onSuccess({
          id: rawId || 0, title: card.title || card.name || 'Без названия', name: card.name || card.title || '',
          original_title: card.original_title || '', poster_path: card.poster_path || '', backdrop_path: card.backdrop_path || '',
          overview: card.overview || '', vote_average: card.vote_average || 0,
          type: card.type === 'tv' ? 'tv' : 'movie', media_type: card.type === 'tv' ? 'tv' : 'movie', source: SOURCE_NAME
        });
        return;
      }
      
      var method = (card.type === 'tv' || card.media_type === 'tv' || card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
      var tmdbParams = {
        card: { id: parseInt(idStr, 10), title: card.title, name: card.name, original_title: card.original_title,
                poster_path: card.poster_path, backdrop_path: card.backdrop_path, overview: card.overview,
                vote_average: card.vote_average, type: card.type, media_type: card.media_type,
                release_date: card.release_date, first_air_date: card.first_air_date, number_of_seasons: card.number_of_seasons },
        method: method, lang: params.lang, language: params.language
      };
      
      try {
        if (Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
          Lampa.Api.sources.tmdb.full(tmdbParams, onSuccess, function() { onSuccess(tmdbParams.card); });
        } else { onSuccess(tmdbParams.card); }
      } catch (e) { console.error('TMDB call error:', e); onSuccess(tmdbParams.card); }
    };

    self.category = function (params, onSuccess, onError) {
      params = params || {};
      
      if (!params.url || params.url === '' || params.url === '__categories__') {
        var cats = [];
        var catVis = getCategoryVisibility();
        
        CATEGORY_SETTINGS_ORDER.forEach(function (key) {
          if (catVis[key].visible) {
            cats.push({
              id: 'rutor_cat_' + key,
              title: catVis[key].title,
              name: catVis[key].title,
              original_title: catVis[key].title,
              url: CATEGORIES[key],
              source: SOURCE_NAME,
              type: 'movie',
              media_type: 'movie',
              poster_path: '',
              backdrop_path: '',
              overview: '',
              vote_average: 0,
              rating: { kp: 0, tmdb: 0 },
              year: 0,
              promo_title: catVis[key].title,
              promo: ''
            });
          }
        });

        console.log('📂 Rutor Pro: возвращаю', cats.length, 'категорий');
        onSuccess({ results: cats, page: 1, total_pages: 1, total_results: cats.length, source: SOURCE_NAME });
        return;
      }

      self.list(params, function (data) {
        onSuccess({
          results: data.results, page: data.page,
          total_pages: data.total_pages, total_results: data.total_results,
          url: params.url, source: SOURCE_NAME
        });
      }, onError);
    };
  }

  var rutorApi = new RutorApiService();
  try {
    if (Lampa.Api && Lampa.Api.sources) {
      Lampa.Api.sources.rutorpro = rutorApi;
      Object.defineProperty(Lampa.Api.sources, DEFAULT_SOURCE_NAME, {
        get: function () { return rutorApi; }, configurable: true
      });
    }
  } catch (e) { console.warn('Source registration failed:', e); }

  function registerSettings() {
    try {
      if (!Lampa.SettingsApi) return;
      Lampa.SettingsApi.addComponent({ component: 'rutor_settings', name: DEFAULT_SOURCE_NAME, icon: ICON });

      Lampa.SettingsApi.addParam({
        component: 'rutor_settings',
        param: { name: 'rutor_hide_watched', type: 'trigger', default: getStorage('rutor_hide_watched', false) },
        field: { name: 'Скрыть просмотренные', description: 'Не показывать просмотренные' },
        onChange: function (v) {
          setStorage('rutor_hide_watched', v === true);
          try {
            var active = Lampa.Activity.active();
            if (active && active.source === DEFAULT_SOURCE_NAME && active.activity_line) {
              // ✅ ИСПРАВЛЕНО: добавлен ключ data:
              active.activity_line.listener.send({ type: 'append', data: active.activity_line.card_data, line: active.activity_line });
            }
          } catch (e) {}
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rutor_settings',
        param: { name: 'rutor_min_progress', type: 'select',
                 values: { '50':'50%','70':'70%','80':'80%','90':'90%','95':'95%','100':'100%' }, default: String(DEFAULT_MIN_PROGRESS) },
        field: { name: 'Порог просмотра', description: 'Мин. % для скрытия' },
        onChange: function (v) { var val = parseInt(v) || DEFAULT_MIN_PROGRESS; setStorage('rutor_min_progress', val); MIN_PROGRESS = val; }
      });

      Lampa.SettingsApi.addParam({
        component: 'rutor_settings',
        param: { name: 'rutor_source_name', type: 'input', default: DEFAULT_SOURCE_NAME },
        field: { name: 'Название в меню', description: 'Как отображать источник' },
        onChange: function (v) { 
          setStorage('rutor_source_name', v); 
          SOURCE_NAME = v || DEFAULT_SOURCE_NAME;
          try { var item = document.querySelector('[data-rutor-source] .menu__text'); if (item) item.textContent = SOURCE_NAME; } catch(e){} 
        }
      });

      CATEGORY_SETTINGS_ORDER.forEach(function (key) {
        Lampa.SettingsApi.addParam({
          component: 'rutor_settings',
          param: { name: 'rutor_cat_' + key, type: 'trigger', default: getCategoryVisibility()[key].visible },
          field: { name: getCategoryVisibility()[key].title }, onChange: function() {}
        });
      });
    } catch (e) { console.warn('Settings registration failed:', e); }
  }

  function addMenuItem() {
    try {
      var menu = document.querySelector('.menu .menu__list') || document.querySelector('.menu__list');
      if (!menu) return false;
      if (menu.querySelector('[data-rutor-source]')) return true;

      var li = document.createElement('li');
      li.className = 'menu__item selector';
      li.setAttribute('data-rutor-source', '1');
      li.innerHTML = '<div class="menu__ico">' + ICON + '</div><div class="menu__text">' + DEFAULT_SOURCE_NAME + '</div>';
      
      li.addEventListener('hover:enter', function () {
        try { Lampa.Activity.push({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, url: '' }); }
        catch (e) { console.warn('Menu nav failed:', e); }
      });
      menu.appendChild(li);
      return true;
    } catch (e) { return false; }
  }

  function registerLineListener() {
    try {
      if (!Lampa.Listener) return;
      Lampa.Listener.follow('line', function (event) {
        if (event.type !== 'append') return;
        var data = event.data;
        if (!data || data.source !== SOURCE_NAME || !data.url || data.url === '') return;

        var desired = 20;
        var results = filterWatchedContent(data.results || []).filter(function (i) { return i && i.id; });
        var page = data.page || 1;
        var totalPages = data.total_pages || 1;

        function loadNext() {
          if (results.length >= desired || page >= totalPages) {
            data.results = results.slice(0, desired);
            data.more = page < totalPages && results.length === desired;
            if (event.line && event.line.update) event.line.update();
            return;
          }
          page++;
          rutorApi.list({ url: data.url, page: page }, function (resp) {
            var more = filterWatchedContent(resp.results || []).filter(function (i) { return i && i.id; });
            results = results.concat(more);
            loadNext();
          }, function () { loadNext(); });
        }
        loadNext();
      });
    } catch (e) { console.warn('Line listener failed:', e); }
  }

  function init() {
    try {
      SOURCE_NAME = getStorage('rutor_source_name', DEFAULT_SOURCE_NAME);
      MIN_PROGRESS = parseInt(getStorage('rutor_min_progress', DEFAULT_MIN_PROGRESS)) || DEFAULT_MIN_PROGRESS;
    } catch (e) {}
    
    registerSettings();
    if (!addMenuItem()) {
      var obs = new MutationObserver(function () { if (addMenuItem()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); }, 10000);
    }
    registerLineListener();
    console.log('✅ ' + SOURCE_NAME + ': initialized safely');
  }

  if (window.Lampa && window.appready) { init(); }
  else if (window.Lampa) { Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); }); }
  else {
    var checkLampa = setInterval(function () {
      if (window.Lampa) {
        clearInterval(checkLampa);
        if (window.appready) { init(); }
        else { Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); }); }
      }
    }, 100);
    setTimeout(function () { clearInterval(checkLampa); }, 15000);
  }
})();
