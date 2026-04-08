(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'RUTOR';
    var SOURCE_NAME = DEFAULT_SOURCE_NAME;
    var SHEETS_API = 'https://script.google.com/macros/s/AKfycbzkG8EzY7yw2DFwK2tPcKfc5YS1opFKBRcjI6BX6SGmYOwB0NmFHDCkmRNy6kGbErAY/exec';
    var MAX_ITEMS = 15;
    var TMDB_CACHE_TIME = 60 * 60 * 24 * 2; // 2 дня

    var ICON = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <circle cx="256" cy="256" r="200" fill="#ff4d4d"/>
        <text x="256" y="285" font-family="Arial" font-size="180" font-weight="bold" text-anchor="middle" fill="#fff">R</text>
    </svg>`;

    var RUTOR_CATEGORIES = [
        { title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч',      type: 'mixed' },
        { title: 'Зарубежные фильмы',               sheet: 'Зарубежные фильмы', type: 'movie' },
        { title: 'Наши фильмы',                     sheet: 'Наши фильмы',       type: 'movie' },
        { title: 'Зарубежные сериалы',              sheet: 'Зарубежные сериалы', type: 'tv' },
        { title: 'Наши сериалы',                    sheet: 'Наши сериалы',       type: 'tv' },
        { title: 'Телевизор',                       sheet: 'Телевизор',          type: 'tv' }
    ];

    var REQUEST_POOL = {};

    // Улучшенная очистка названия
    function cleanTitle(title) {
        if (!title) return '';
        return title.toString()
            .replace(/\(\d{4}\).*$/i, '')                    // год в скобках
            .replace(/\b(2160p|1080p|720p|HDR10?|DV|HDR|BDRip|WEB[- ]?DL|BluRay|HEVC|H\.?264|x264|x265|AAC|AC3|5\.1|2\.0|Rus|Eng|Sub)\b/gi, '')
            .replace(/[\[\]\|\/\\:•·]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getCacheKey(title) {
        return 'rutor_tmdb_' + Lampa.Utils.hash(title);
    }

    function searchTMDB(title, callback) {
        if (!title) return callback(null);

        const cached = Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, null);
        if (cached !== undefined) {  // null — это тоже валидный результат (не найдено)
            return callback(cached);
        }

        if (REQUEST_POOL[title]) {
            REQUEST_POOL[title].push(callback);
            return;
        }

        REQUEST_POOL[title] = [callback];

        Lampa.Api.sources.tmdb.search({
            query: title,
            page: 1
        }, function (data) {
            const result = (data && data.results && data.results.length > 0) ? data.results[0] : null;
            Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, result);
            REQUEST_POOL[title].forEach(cb => cb(result));
            delete REQUEST_POOL[title];
        }, function () {
            Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, null);
            REQUEST_POOL[title].forEach(cb => cb(null));
            delete REQUEST_POOL[title];
        });
    }

    function RutorApi() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.category = function (params, onSuccess, onError) {
            var parts = [];

            RUTOR_CATEGORIES.forEach(function (cat) {
                parts.push(function (callback) {
                    var url = SHEETS_API + '?sheet=' + encodeURIComponent(cat.sheet);

                    self.network.silent(url, function (json) {
                        if (!json || !Array.isArray(json)) {
                            return callback({ results: [] });
                        }

                        json = json.slice(0, MAX_ITEMS);
                        var results = new Array(json.length);
                        var pending = json.length;

                        if (pending === 0) {
                            return callback({
                                title: cat.title,
                                results: [],
                                page: 1,
                                total_pages: 1,
                                total_results: 0
                            });
                        }

                        json.forEach(function (item, idx) {
                            var rawTitle = item.title || item.name || item.toString();
                            var clean_title = cleanTitle(rawTitle);

                            searchTMDB(clean_title, function (tmdb) {
                                results[idx] = {
                                    id: tmdb ? tmdb.id : 'rutor_' + cat.sheet + '_' + idx,
                                    title: tmdb ? (tmdb.title || tmdb.name) : clean_title,
                                    name: tmdb ? (tmdb.name || tmdb.title) : clean_title,
                                    original_title: tmdb ? (tmdb.original_title || tmdb.original_name) : clean_title,
                                    overview: tmdb ? tmdb.overview : '',
                                    poster_path: tmdb ? tmdb.poster_path : null,
                                    backdrop_path: tmdb ? tmdb.backdrop_path : null,
                                    vote_average: tmdb ? parseFloat(tmdb.vote_average) || 0 : 0,
                                    release_date: tmdb ? tmdb.release_date : '',
                                    first_air_date: tmdb ? tmdb.first_air_date : '',
                                    media_type: (cat.type === 'movie') ? 'movie' : 'tv',
                                    source: SOURCE_NAME.toLowerCase()
                                };

                                if (--pending === 0) {
                                    callback({
                                        title: cat.title,
                                        results: results.filter(Boolean),
                                        page: 1,
                                        total_pages: 1,
                                        total_results: results.length
                                    });
                                }
                            });
                        });
                    }, function () {
                        callback({ results: [] });
                    });
                });
            });

            Lampa.Api.partNext(parts, 1, onSuccess, onError);
        };

        self.full = function (params, onSuccess, onError) {
            // Проксируем на TMDB
            params.source = 'tmdb';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onSuccess, onError) {
            onSuccess({ results: [] });
        };
    }

    function startPlugin() {
        if (window.rutor_plugin_installed) return;
        window.rutor_plugin_installed = true;

        var api = new RutorApi();

        // Регистрация источника
        Lampa.Api.sources.rutor = api;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () { return api; }
        });

        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        // Добавление в меню
        var menuItem = $(`
            <li class="menu__item selector">
                <div class="menu__ico">${ICON}</div>
                <div class="menu__text">${SOURCE_NAME}</div>
            </li>
        `);

        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });

        // Перехват смены источника
        var originalSet = Lampa.Storage.set;
        Lampa.Storage.set = function (key, value) {
            var result = originalSet.apply(this, arguments);
            if (key === 'source' && value === SOURCE_NAME) {
                Lampa.Activity.replace({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: SOURCE_NAME,
                    page: 1
                });
            }
            return result;
        };
    }

    // Запуск плагина
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
