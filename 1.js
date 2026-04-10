(function () {
    'use strict';

    var SOURCE_NAME = 'NUMParser GS';
    var GS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';

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

        function parseSheet(json) {
            var rows = json.data || json.results || json;

            if (!Array.isArray(rows)) return [];

            return rows.slice(1).map(function (row) {
                return {
                    id: parseInt(row[5]),
                    poster: row[8]
                };
            }).filter(function (item) {
                return item.id;
            });
        }

        function loadSheet(sheet, callback) {
            network.silent(GS_URL + '?sheet=' + encodeURIComponent(sheet), function (json) {
                callback(parseSheet(json));
            }, function () {
                callback([]);
            });
        }

        function buildCards(items) {
            return items.map(function (item) {
                return {
                    id: item.id,
                    type: 'movie', // можно улучшить позже
                    title: 'TMDB #' + item.id,
                    name: 'TMDB #' + item.id,
                    poster_path: item.poster || '',
                    img: item.poster || '',
                    source: SOURCE_NAME
                };
            });
        }

        this.category = function (params, onSuccess, onError) {

            var parts = [];

            CATEGORIES.forEach(function (cat) {
                parts.push(function (done) {

                    loadSheet(cat.sheet, function (items) {

                        var cards = buildCards(items);

                        done({
                            title: cat.title,
                            results: cards,
                            total_results: cards.length,
                            total_pages: 1,
                            page: 1,
                            more: false
                        });
                    });

                });
            });

            Lampa.Api.partNext(parts, 1, onSuccess, onError);
        };

        this.full = function (params, onSuccess, onError) {
            // тут уже подтянется норм инфа с TMDB
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

        var menuItem = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');
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
