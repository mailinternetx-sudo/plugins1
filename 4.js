(function () {
    'use strict';

    var SOURCE_NAME = 'FIX FINAL';
    var API_URL = 'https://script.google.com/macros/s/AKfycbz_5VESAAFFcrD8BB8DJnj1Q-NBdLFLUbphP5SRb07KQ3RHZT_zoeBj8MYZVdEneHC-/exec'; // вставь свой

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

                    network.silent(API_URL + '?sheet=' + sheet, function (json) {

                        var results = (json.results || []).map(function (item) {
                            return {
                                id: item.id, // ✅ теперь всегда TMDB
                                title: item.title,
                                name: item.title,
                                poster_path: item.poster_path,
                                backdrop_path: item.poster_path,
                                vote_average: item.vote_average || 0,
                                type: item.type || 'movie',
                                source: 'tmdb' // 💥 КРИТИЧНО
                            };
                        });

                        next({
                            title: sheet,
                            results: results,
                            page: 1,
                            total_pages: 1
                        });

                    }, function () {
                        next({ title: sheet, results: [] });
                    });

                });

            });

            Lampa.Api.partNext(parts, 2, onSuccess);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function start() {
        if (window.fix_final_ready) return;
        window.fix_final_ready = true;

        var api = new Api();
        Lampa.Api.sources[SOURCE_NAME] = api;

        $('.menu .menu__list').eq(0).append(
            $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>')
            .on('hover:enter', function () {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE_NAME
                });
            })
        );
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }

})();
