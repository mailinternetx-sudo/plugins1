(function () {
    'use strict';

    var SOURCE_NAME = 'V10 v3';
    var API_URL = 'https://script.google.com/macros/s/AKfycbzkobwLKiGc0hmqE39UA2dwt10jo9iv-Fxzf3TsXF7GKumYeN5XelwX2uxNd0uzNICj/exec';

    var SHEETS = [
        'Топ 24ч',
        'Зарубежные фильмы',
        'Наши фильмы',
        'Зарубежные сериалы',
        'Наши сериалы',
        'Телевизор'
    ];

    function Api() {
        var network = new Lampa.Reguest();

        this.category = function (params, onSuccess) {

            var parts = [];

            SHEETS.forEach(function (sheet) {

                parts.push(function (next) {

                    var url = API_URL + '?sheet=' + encodeURIComponent(sheet);

                    console.log('LOAD:', sheet, url);

                    network.silent(url, function (json) {

                        if (!json) {
                            console.log('EMPTY JSON:', sheet);
                            return next(makeEmpty(sheet));
                        }

                        if (json.error) {
                            console.log('API ERROR:', sheet, json.error);
                            return next(makeEmpty(sheet));
                        }

                        var results = (json.results || []).map(function (item) {
                            return {
                                id: item.id,
                                title: item.title,
                                name: item.title,
                                poster_path: normalize(item.poster_path),
                                backdrop_path: normalize(item.poster_path),
                                vote_average: item.vote_average || 0,
                                type: item.type || 'movie',
                                source: SOURCE_NAME
                            };
                        });

                        console.log('SUCCESS:', sheet, results.length);

                        next({
                            title: sheet,
                            results: results, // даже если 0 — покажется категория
                            page: 1,
                            total_pages: 1
                        });

                    }, function () {
                        console.log('NETWORK ERROR:', sheet);
                        next(makeEmpty(sheet));
                    });

                });

            });

            Lampa.Api.partNext(parts, 2, function (data) {
                onSuccess(data);
            });
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        function makeEmpty(sheet) {
            return {
                title: sheet,
                results: [],
                page: 1,
                total_pages: 1
            };
        }
    }

    function normalize(url) {
        if (!url) return '';
        if (url.indexOf('http') === 0) return url;
        return 'https://image.tmdb.org/t/p/w500' + url;
    }

    function start() {
        if (window.v10v2_ready) return;
        window.v10v2_ready = true;

        var api = new Api();
        Lampa.Api.sources[SOURCE_NAME] = api;

        var btn = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');

        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME,
                title: SOURCE_NAME,
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(btn);
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }

})();
