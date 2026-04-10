(function () {
    'use strict';

    var SOURCE_NAME = 'NUMParser GS';
    var GS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';

    var LIMIT = 20;
    var TMDB_CACHE_TIME = 60 * 60 * 24; // 24h
    var SHEET_CACHE_TIME = 300; // 5 min

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

        function parse(json) {
            var rows = json.data || json;
            if (!Array.isArray(rows)) return [];

            return rows.slice(1).map(function (row) {
                return {
                    id: parseInt(row[5]),
                    title: row[7],
                    poster: row[8]
                };
            }).filter(function (i) {
                return i.id;
            });
        }

        function getSheet(sheet, callback) {

            var cache = Lampa.Storage.cache('gs_sheet_' + sheet, SHEET_CACHE_TIME, null);
            if (cache) return callback(cache);

            network.silent(GS_URL + '?sheet=' + encodeURIComponent(sheet), function (json) {
                var data = parse(json);
                Lampa.Storage.cache('gs_sheet_' + sheet, SHEET_CACHE_TIME, data);
                callback(data);
            }, function () {
                callback([]);
            });
        }

        function getTMDB(id, callback) {

            var cache = Lampa.Storage.cache('tmdb_' + id, TMDB_CACHE_TIME, null);
            if (cache) return callback(cache);

            function tryMovie() {
                Lampa.Api.sources.tmdb.full({
                    card: {id: id, type: 'movie'}
                }, success, tryTV);
            }

            function tryTV() {
                Lampa.Api.sources.tmdb.full({
                    card: {id: id, type: 'tv'}
                }, success, function () {
                    callback(null);
                });
            }

            function success(data) {
                if (!data) return callback(null);

                Lampa.Storage.cache('tmdb_' + id, TMDB_CACHE_TIME, data);
                callback(data);
            }

            tryMovie();
        }

        function preload(ids, done) {

            var results = [];
            var i = 0;
            var batch = 5;

            function next() {

                var chunk = ids.slice(i, i + batch);
                if (!chunk.length) return done(results);

                var loaded = 0;

                chunk.forEach(function (item) {

                    getTMDB(item.id, function (data) {

                        if (data) {
                            var card = data.movie || data.tv || data;

                            if (item.poster) {
                                card.poster_path = item.poster;
                            }

                            results.push(card);
                        }

                        loaded++;

                        if (loaded === chunk.length) {
                            i += batch;
                            next();
                        }
                    });

                });
            }

            next();
        }

        function sortNetflix(items) {
            return items.sort(function (a, b) {

                var scoreA = (a.vote_average || 0) * 10 + (a.popularity || 0);
                var scoreB = (b.vote_average || 0) * 10 + (b.popularity || 0);

                return scoreB - scoreA;
            });
        }

        function build(items, page) {

            var start = (page - 1) * LIMIT;
            var end = start + LIMIT;

            return {
                results: items.slice(start, end),
                page: page,
                total_pages: Math.ceil(items.length / LIMIT),
                total_results: items.length
            };
        }

        this.list = function (params, onSuccess) {

            var sheet = params.url;
            var page = params.page || 1;

            getSheet(sheet, function (items) {

                preload(items, function (fullData) {

                    fullData = sortNetflix(fullData);

                    onSuccess(build(fullData, page));
                });

            });
        };

        this.category = function (params, onSuccess, onError) {

            var parts = [];

            CATEGORIES.forEach(function (cat) {

                parts.push(function (done) {

                    getSheet(cat.sheet, function (items) {

                        preload(items.slice(0, 20), function (data) {

                            data = sortNetflix(data);

                            done({
                                title: cat.title,
                                url: cat.sheet,
                                results: data,
                                total_results: items.length,
                                total_pages: Math.ceil(items.length / LIMIT),
                                page: 1,
                                more: items.length > LIMIT,
                                source: SOURCE_NAME
                            });

                        });

                    });

                });

            });

            Lampa.Api.partNext(parts, 3, onSuccess, onError);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        // lazy load
        Lampa.Listener.follow('line', function (e) {

            if (e.type !== 'append') return;

            var data = e.data;
            if (!data.url) return;

            var next = data.page + 1;

            if (next > data.total_pages) return;

            Lampa.Api.sources[SOURCE_NAME].list({
                url: data.url,
                page: next
            }, function (res) {

                data.results = data.results.concat(res.results);
                data.page = next;
                data.more = next < data.total_pages;

                e.line.update();
            });
        });
    }

    function startPlugin() {

        if (window.gs_v3) return;
        window.gs_v3 = true;

        var service = new GSService();

        Lampa.Api.sources[SOURCE_NAME] = service;
        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        var item = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(item);

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME
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
