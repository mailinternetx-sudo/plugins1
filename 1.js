(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'RUTOR';
    var SOURCE_NAME = DEFAULT_SOURCE_NAME;

    var SHEETS_API = 'https://script.google.com/macros/s/AKfycbzuSvL74d-B3pDYIa4dnfwDgazr5QOOxhIUbxDd3m_RMx9geJTLcmHQgRNZCrqW0YRb/exec';

    var MAX_ITEMS = 20;
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

        var cached = getFromCache(title);
        if (cached) {
            callback(cached);
            return;
        }

        Lampa.Api.sources.tmdb.search({
            query: title,
            page: 1
        }, function (data) {

            if (!data || !data.results || !data.results.length) {
                saveToCache(title, null);
                callback(null);
                return;
            }

            var result = data.results[0];
            saveToCache(title, result);

            callback(result);

        }, function () {
            callback(null);
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
                            var title = item.title || item.name || item;

                            searchTMDB(title, function (tmdb) {

                                results.push({
                                    id: tmdb ? tmdb.id : index + '_' + cat.sheet,
                                    title: title,
                                    name: title,
                                    original_title: title,
                                    overview: tmdb ? tmdb.overview : '',
                                    poster_path: tmdb ? tmdb.poster_path : '',
                                    backdrop_path: tmdb ? tmdb.backdrop_path : '',
                                    vote_average: tmdb ? tmdb.vote_average : 0,
                                    type: tmdb && tmdb.media_type ? tmdb.media_type : 'movie',
                                    source: SOURCE_NAME
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
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onSuccess) {
            onSuccess({ results: [] });
        };
    }    function startPlugin() {

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

        // авто редирект если выбран источник
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
