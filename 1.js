(function () {
    'use strict';

    var SOURCE_NAME = 'V10 v1';
    var API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    var SCRIPT_ID = 'AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm';

    var SHEETS = {
        top: 'Топ 24ч',
        foreign_movies: 'Зарубежные фильмы',
        ru_movies: 'Наши фильмы',
        foreign_tv: 'Зарубежные сериалы',
        ru_tv: 'Наши сериалы',
        tv: 'Телевизор'
    };

    function V10Api() {
        var network = new Lampa.Reguest();

        function getSheet(sheet, callback, error) {
            var url = 'https://script.google.com/macros/s/' + SCRIPT_ID + '/exec?sheet=' + encodeURIComponent(sheet);

            network.silent(url, function (json) {
                if (!json || !json.results) {
                    error();
                    return;
                }
                loadTMDB(json.results, callback);
            }, error);
        }

        function loadTMDB(ids, callback) {
            var results = [];
            var loaded = 0;

            if (!ids.length) {
                callback(empty());
                return;
            }

            ids.forEach(function (id) {
                var url = 'https://api.themoviedb.org/3/movie/' + id + '?api_key=' + API_KEY + '&language=ru';

                network.silent(url, function (data) {
                    if (!data || data.status_code) {
                        // пробуем как сериал
                        var tv_url = 'https://api.themoviedb.org/3/tv/' + id + '?api_key=' + API_KEY + '&language=ru';

                        network.silent(tv_url, function (tv) {
                            if (tv && !tv.status_code) results.push(normalize(tv, 'tv'));
                            done();
                        }, done);
                    } else {
                        results.push(normalize(data, 'movie'));
                        done();
                    }
                }, done);
            });

            function done() {
                loaded++;
                if (loaded >= ids.length) {
                    callback({
                        results: results,
                        page: 1,
                        total_pages: 1,
                        total_results: results.length
                    });
                }
            }
        }

        function normalize(item, type) {
            return {
                id: item.id,
                title: item.title || item.name,
                original_title: item.original_title || item.original_name,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                overview: item.overview,
                vote_average: item.vote_average,
                type: type
            };
        }

        function empty() {
            return {
                results: [],
                page: 1,
                total_pages: 1,
                total_results: 0
            };
        }

        this.category = function (params, onSuccess) {

            var parts = [
                {title: 'Топ торренты за последние 24 часа', sheet: SHEETS.top},
                {title: 'Зарубежные фильмы', sheet: SHEETS.foreign_movies},
                {title: 'Наши фильмы', sheet: SHEETS.ru_movies},
                {title: 'Зарубежные сериалы', sheet: SHEETS.foreign_tv},
                {title: 'Наши сериалы', sheet: SHEETS.ru_tv},
                {title: 'Телевизор', sheet: SHEETS.tv}
            ];

            var index = 0;

            function next() {
                if (index >= parts.length) return;

                var part = parts[index++];

                getSheet(part.sheet, function (data) {
                    onSuccess({
                        title: part.title,
                        results: data.results,
                        page: 1,
                        total_pages: 1,
                        total_results: data.results.length
                    });
                    next();
                }, function () {
                    next();
                });
            }

            next();
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        this.main = function (params, onComplete) {
            onComplete([]);
            setTimeout(function () {
                Lampa.Activity.replace({
                    component: 'category',
                    source: SOURCE_NAME,
                    title: SOURCE_NAME
                });
            }, 0);
        };
    }

    function startPlugin() {
        if (window.v10_plugin) return;
        window.v10_plugin = true;

        var api = new V10Api();

        Lampa.Api.sources.v10 = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () {
                return api;
            }
        });

        var menuItem = $('<li class="menu__item selector">' + SOURCE_NAME + '</li>');

        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME,
                title: SOURCE_NAME
            });
        });
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
