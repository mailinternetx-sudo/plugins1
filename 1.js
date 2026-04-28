(function () {
    'use strict';

    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/'; 

    // ✅ ИСПРАВЛЕННЫЕ КАТЕГОРИИ (ТОЛЬКО ЭТО ИЗМЕНЕНО)
    var CATEGORIES = [
        { title: 'Топ торренты за последние 24 часа', url: 'top24' },
        { title: 'Зарубежные фильмы', url: 'movies' },
        { title: 'Наши фильмы', url: 'movies_ru' },
        { title: 'Зарубежные сериалы', url: 'tv_shows' },
        { title: 'Русские сериалы', url: 'tv_shows_ru' },
        { title: 'Телевизор', url: 'televizor' }
    ];

    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (json && json.results) {
                    var processed = json.results.map(function(item) {
                        if (item.poster_path) {
                            item.poster_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(item.poster_path) + '&w=300';
                        }
                        if (item.backdrop_path) {
                            item.backdrop_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(item.backdrop_path) + '&w=1000';
                        }
                        item.source = 'Rutor Pro';
                        return item;
                    });
                    onComplete(processed);
                } else onComplete([]);
            }, function() { onComplete([]); });
        };

        self.category = function (params, onSuccess, onError) {
            var rows = CATEGORIES.map(function(cat) {
                return {
                    title: cat.title,
                    results: [],
                    url: cat.url,
                    source: 'Rutor Pro'
                };
            });

            var partsData = rows.map(function(row) {
                return function(callback) {
                    self.fetch(WORKER_URL + row.url, function(items) {
                        row.results = items;
                        callback(row);
                    }, callback);
                };
            });

            Lampa.Api.partNext(partsData, 3, onSuccess, onError);
        };

        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function(items) {
                onComplete({ results: items, page: 1, total_pages: 1 });
            }, onError);
        };

        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        var addMenuItem = function () {
            if ($('.menu__item[data-action="rutor_pro"]').length) return;
            var item = $('<li class="menu__item selector" data-action="rutor_pro">' +
                '<div class="menu__ico"><svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg></div>' +
                '<div class="menu__text">' + SOURCE_NAME + '</div>' +
            '</li>');

            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: 'Rutor Pro',
                    method: 'category',
                    url: ''
                });
            });

            var target = $('.menu__list [data-action="movie"]').parent();
            if (target.length) target.after(item);
        };

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') addMenuItem();
        });
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
