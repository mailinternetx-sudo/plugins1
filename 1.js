(function () {
    'use strict';

    var SOURCE_NAME = 'V10 v2';
    var API_URL = 'https://script.google.com/macros/s/AKfycbxildpf3OrmIbfLsP3F2Kg0SC2JgKoFf-4R6ZV7pjGP8td9KU-oA8hvH2DcYx-B77Fq/exec';

    // ⚠️ ВАЖНО: категории вручную (как в GAS)
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
                    loadSheet(sheet, next);
                });
            });

            Lampa.Api.partNext(parts, 3, function (data) {
                onSuccess(data);
            });
        };

        function loadSheet(sheet, next) {
            var url = API_URL + '?sheet=' + encodeURIComponent(sheet);

            network.silent(url, function (json) {

                if (!json || json.error) {
                    next({ title: sheet, results: [] });
                    return;
                }

                var results = (json.results || []).map(function (item) {
                    return {
                        id: item.id,
                        title: item.title,
                        name: item.title,
                        poster_path: normalizeImg(item.poster_path),
                        backdrop_path: normalizeImg(item.poster_path),
                        vote_average: item.vote_average || 0,
                        type: item.type || 'movie',
                        source: SOURCE_NAME
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
        }

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function normalizeImg(url) {
        if (!url) return '';
        if (url.indexOf('http') === 0) return url;
        return 'https://image.tmdb.org/t/p/w500' + url;
    }

    function start() {
        if (window.v10v2_ready) return;
        window.v10v2_ready = true;

        var api = new Api();
        Lampa.Api.sources[SOURCE_NAME] = api;

        // кнопка в меню
        var button = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME,
                title: SOURCE_NAME,
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }

})();
