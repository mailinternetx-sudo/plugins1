(function () {
    'use strict';

    var SOURCE_NAME = 'NUMParser GS';
    var ICON = '<svg width="512" height="512"><circle cx="256" cy="256" r="200" fill="currentColor"/></svg>';

    var GS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';

    // категории = листы
    var CATEGORIES = [
        {title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч'},
        {title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы'},
        {title: 'Наши фильмы', sheet: 'Наши фильмы'},
        {title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы'},
        {title: 'Наши сериалы', sheet: 'Наши сериалы'},
        {title: 'Телевизор', sheet: 'Телевизор'}
    ];

    function GSService() {
        var network = new Lampa.Reguest();

        function loadSheet(sheet, callback) {
            network.silent(GS_URL + '?sheet=' + encodeURIComponent(sheet), function (json) {
                if (!json || !json.data) {
                    callback([]);
                    return;
                }

                var results = json.data.slice(1).map(function (row) {
                    return {
                        id: parseInt(row[5]), // колонка F
                        poster: row[8]        // колонка I
                    };
                }).filter(function (item) {
                    return item.id;
                });

                callback(results);
            }, function () {
                callback([]);
            });
        }

        function loadTMDB(ids, callback) {
            var results = [];
            var loaded = 0;

            if (!ids.length) return callback([]);

            ids.forEach(function (item) {
                Lampa.Api.sources.tmdb.full({
                    card: {
                        id: item.id,
                        type: 'movie'
                    }
                }, function (data) {
                    if (data && data.movie) {
                        var card = data.movie;

                        // подмена постера если есть из таблицы
                        if (item.poster) {
                            card.poster_path = item.poster;
                        }

                        results.push(card);
                    }

                    loaded++;
                    if (loaded === ids.length) callback(results);
                }, function () {
                    loaded++;
                    if (loaded === ids.length) callback(results);
                });
            });
        }

        this.category = function (params, onSuccess, onError) {
            var parts = [];

            CATEGORIES.forEach(function (cat) {
                parts.push(function (done) {
                    loadSheet(cat.sheet, function (ids) {
                        loadTMDB(ids, function (items) {
                            done({
                                title: cat.title,
                                results: items,
                                total_results: items.length,
                                total_pages: 1,
                                page: 1,
                                more: false
                            });
                        });
                    });
                });
            });

            Lampa.Api.partNext(parts, 1, onSuccess, onError);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        this.list = function (params, onSuccess) {
            onSuccess({results: []});
        };
    }

    function startPlugin() {
        if (window.gs_plugin) return;
        window.gs_plugin = true;

        var service = new GSService();

        Lampa.Api.sources.gs = service;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () {
                return service;
            }
        });

        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        var menuItem = $('<li class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });
    }

    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
