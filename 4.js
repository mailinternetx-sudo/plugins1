(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'RUTOR';
    var SOURCE_NAME = DEFAULT_SOURCE_NAME;

    var SHEETS_API = 'https://script.google.com/macros/s/AKfycbyYt99szrMUM3HL62kMV1mWOSJs8Hd2criTzp4GhULSKe6V1RJnKT2KMvcO6Kt6NSI/exec';

    var MAX_ITEMS = 15;
    var TMDB_CACHE_TIME = 60 * 60 * 24;

    var ICON = '<svg width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200" fill="currentColor"/></svg>';

    var RUTOR_CATEGORIES = [
        { title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч' },
        { title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы' },
        { title: 'Наши фильмы', sheet: 'Наши фильмы' },
        { title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы' },
        { title: 'Наши сериалы', sheet: 'Наши сериалы' },
        { title: 'Телевизор', sheet: 'Телевизор' }
    ];

    var REQUEST_POOL = {};

    function cleanTitle(title) {
        if (!title) return '';

        title = title.toString();

        title = title.replace(/\(\d{4}\).*/, '');
        title = title.replace(/\b(2160p|1080p|720p|HDR|BDRip|WEB-DL|BluRay|HEVC|H264|x264|x265)\b/gi, '');
        title = title.replace(/[\[\]\|]/g, '');
        title = title.replace(/\s+/g, ' ').trim();

        return title;
    }

    function getCacheKey(title) {
        return 'rutor_tmdb_' + Lampa.Utils.hash(title);
    }

    function getFromCache(title) {
        return Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, null);
    }

    function saveToCache(title, data) {
        Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, data);
    }

    function searchTMDB(title, callback) {
        if (!title) {
            callback(null);
            return;
        }

        // Проверка готовности TMDB источника
        if (!Lampa.Api.sources.tmdb) {
            console.warn('TMDB source not ready');
            callback(null);
            return;
        }

        if (REQUEST_POOL[title]) {
            REQUEST_POOL[title].push(callback);
            return;
        }

        var cached = getFromCache(title);
        if (cached) {
            callback(cached);
            return;
        }

        REQUEST_POOL[title] = [callback];

        Lampa.Api.sources.tmdb.search({
            query: title,
            page: 1
        }, function (data) {
            var result = null;
            if (data && data.results && data.results.length) {
                result = data.results[0];
            }
            saveToCache(title, result);

            REQUEST_POOL[title].forEach(function (cb) {
                cb(result);
            });
            delete REQUEST_POOL[title];
        }, function () {
            REQUEST_POOL[title].forEach(function (cb) {
                cb(null);
            });
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
                        // Логирование ответа от API
                        console.log('Response from', cat.sheet, json);

                        if (!json || !Array.isArray(json)) {
                            callback({ results: [] });
                            return;
                        }

                        json = json.slice(0, MAX_ITEMS);

                        var results = [];
                        var index = 0;

                        function next() {
                            if (index >= json.length) {
                                callback({
                                    title: cat.title,
                                    url: cat.sheet,
                                    results: results,
                                    page: 1,
                                    total_pages: 1,
                                    total_results: results.length
                                });
                                return;
                            }

                            var item = json[index];
                            var rawTitle = item.title || item.name || item;
                            var title = cleanTitle(rawTitle);

                            searchTMDB(title, function (tmdb) {
                                results.push({
                                    id: tmdb && tmdb.id ? tmdb.id : index + '_' + cat.sheet,

                                    title: tmdb ? (tmdb.title || tmdb.name) : title,
                                    name: tmdb ? (tmdb.name || tmdb.title) : title,

                                    original_title: tmdb ? (tmdb.original_title || tmdb.original_name) : title,

                                    overview: tmdb ? tmdb.overview : '',
                                    poster_path: tmdb && tmdb.poster_path ? tmdb.poster_path : '/img/img_broken.svg',
                                    backdrop_path: tmdb ? tmdb.backdrop_path : '',

                                    vote_average: tmdb ? tmdb.vote_average : 0,
                                    release_date: tmdb ? tmdb.release_date : '',
                                    first_air_date: tmdb ? tmdb.first_air_date : '',

                                    // Определяем media_type по названию листа
                                    media_type: cat.sheet.includes('фильмы') ? 'movie' : 'tv',

                                    source: 'tmdb'
                                });
                                index++;
                                next();
                            });
                        }

                        next();
                    }, function () {
                        callback({ results: [] });
                    });
                });
            });

            function load(partLoaded, partEmpty) {
                Lampa.Api.partNext(parts, 1, partLoaded, partEmpty);
            }

            load(onSuccess, onError);
            return load;
        };

        self.full = function (params, onSuccess, onError) {
            params.source = 'tmdb';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onSuccess) {
            onSuccess({ results: [] });
        };
    }

    function startPlugin() {
        if (window.rutor_plugin) return;
        window.rutor_plugin = true;

        var api = new RutorApi();

        Lampa.Api.sources.rutor = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () {
                return api;
            }
        });

        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        var menuItem = $('<li class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text">' + SOURCE_NAME + '</div></li>');

        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });

        var origSet = Lampa.Storage.set;

        Lampa.Storage.set = function (key, value) {
            var res = origSet.apply(this, arguments);
            if (key === 'source' && value === SOURCE_NAME) {
                Lampa.Activity.replace({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: SOURCE_NAME,
                    page: 1
                });
            }
            return res;
        };
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
