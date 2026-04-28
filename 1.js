(function () {
    'use strict';

    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var CATEGORIES = [
        { title: 'Топ 24 часа', url: 'top24' },
        { title: 'Зарубежные фильмы', url: 'movies' },
        { title: 'Наши фильмы', url: 'movies_ru' },
        { title: 'Зарубежные сериалы', url: 'tv_shows' },
        { title: 'Русские сериалы', url: 'tv_shows_ru' },
        { title: 'Телевизор', url: 'televizor' }
    ];

    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // ===== FETCH (универсальный) =====
        self.fetch = function (url, onComplete) {
            self.network.silent(url, function (json) {
                if (!json || !json.results) {
                    onComplete([]);
                    return;
                }

                var results = json.results.map(function (item) {
                    return normalizeCard(item, url);
                });

                onComplete(results);
            }, function () {
                onComplete([]);
            });
        };

        // ===== SEARCH (КАК В NMPRS) =====
        self.search = function (params, onComplete, onError) {
            var query = params.query || '';

            if (!query) {
                onComplete({ results: [] });
                return;
            }

            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);

            self.network.silent(url, function (json) {
                if (!json || !json.results) {
                    onComplete({ results: [] });
                    return;
                }

                var results = json.results.map(function (item) {
                    return normalizeCard(item, 'search');
                });

                onComplete({
                    results: results,
                    page: 1,
                    total_pages: 1
                });
            }, function () {
                onComplete({ results: [] });
            });
        };

        // ===== CATEGORY =====
        self.category = function (params, onSuccess, onError) {
            var rows = [];

            function load(index) {
                if (index >= CATEGORIES.length) {
                    onSuccess(rows);
                    return;
                }

                var cat = CATEGORIES[index];

                self.fetch(WORKER_URL + cat.url, function (items) {
                    rows.push({
                        title: cat.title,
                        results: items,
                        url: cat.url,
                        source: SOURCE_NAME
                    });

                    load(index + 1);
                });
            }

            load(0);
        };

        // ===== LIST =====
        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function (items) {
                onComplete({
                    results: items,
                    page: 1,
                    total_pages: 1
                });
            });
        };

        // ===== FULL =====
        self.full = function (params, onSuccess, onError) {
            if (params.id) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
            } else {
                onSuccess(params);
            }
        };

        // ===== NORMALIZE =====
        function normalizeCard(item, url) {
            return {
                id: item.id || Math.random(),
                title: item.title || item.name,
                name: item.name || item.title,
                original_title: item.original_title || item.title,
                poster_path: item.poster_path || '',
                backdrop_path: item.backdrop_path || '',
                overview: item.overview || '',
                vote_average: item.vote_average || 0,
                release_date: item.release_date || item.first_air_date || '',
                first_air_date: item.first_air_date || '',
                type: item.type || detectType(url),
                source: SOURCE_NAME,
                method: 'full'
            };
        }

        function detectType(url) {
            if (!url) return 'movie';
            if (url.includes('tv') || url.includes('serial')) return 'tv';
            return 'movie';
        }
    }

    // ===== MENU =====
    function addMenuItem() {
        if ($('.menu__item[data-action="rutor_pro"]').length) return;

        var item = $('<li class="menu__item selector" data-action="rutor_pro">' +
            '<div class="menu__ico"><svg height="36" viewBox="0 0 24 24" width="36"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg></div>' +
            '<div class="menu__text">' + SOURCE_NAME + '</div>' +
        '</li>');

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                method: 'category'
            });
        });

        var target = $('.menu__list [data-action="movie"], .menu__list [data-action="tv"]').parent();

        if (target.length) target.after(item);
        else $('.menu__list').append(item);
    }

    // ===== INIT =====
    function init() {
        if (window.rutor_pro_ready) return;
        window.rutor_pro_ready = true;

        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') {
                setTimeout(addMenuItem, 1000);
            }
        });

        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
