(function () {
    'use strict';

    var SOURCE_NAME = 'V10 v2';
    var API_URL = 'https://script.google.com/macros/s/AKfycbzWY8zczGqH_a_8mJzRQbgiGkOoP48yyIj_B9or8xAVrUYcfxn-zoTWCyD3gKEfsN3a/exec';

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

                    network.silent(url, function (json) {
                        if (!json || json.error) {
                            return next(makeEmpty(sheet));
                        }

                        var results = (json.results || []).map(function (item) {
                            return {
                                id: item.id,
                                title: item.title,
                                name: item.title,
                                original_title: item.title, // Добавлено для корректного поиска
                                poster_path: normalize(item.poster_path),
                                backdrop_path: normalize(item.poster_path),
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
                        next(makeEmpty(sheet));
                    });
                });
            });

            Lampa.Api.partNext(parts, 2, function (data) {
                // 🔥 Улучшение: Скрываем пустые категории, чтобы не мусорить в меню
                var filteredData = data.filter(function(cat) {
                    return cat.results && cat.results.length > 0;
                });

                // Если все пустые (например таблица еще не обновилась), показываем хотя бы заглушку
                if (filteredData.length === 0) {
                    filteredData = [{
                        title: 'Загрузка данных...',
                        results: [],
                        page: 1,
                        total_pages: 1
                    }];
                }

                onSuccess(filteredData);
            });
        };

        this.full = function (params, onSuccess, onError) {
            // При клике на фильм ищем его через стандартный метод TMDB внутри Lamp'ы
            if (params.id) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
            } else {
                onError('No ID');
            }
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
        // Google скрипт теперь отдает полные URL, проверяем это
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
