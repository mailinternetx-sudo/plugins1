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

        // Определяем тип контента по URL категории
        function getCategoryType(url) {
            if (url.includes('tv_shows') || url.includes('seriali')) return 'tv';
            if (url.includes('televizor')) return 'tv';
            return 'movie';
        }

        self.fetch = function (url, onComplete) {
            self.network.silent(url, function (json) {
                if (!json || !json.results) {
                    onComplete([]);
                    return;
                }

                var results = [];
                var pending = json.results.length;

                if (pending === 0) {
                    onComplete([]);
                    return;
                }

                json.results.forEach(function(rawTitle) {
                    var titleStr = typeof rawTitle === 'string' ? rawTitle : (rawTitle.title || rawTitle.name || '');
                    var catType = getCategoryType(url);

                    // Создаём базовую карточку
                    var card = {
                        title: titleStr,
                        name: titleStr,
                        original_title: titleStr,
                        poster_path: '',
                        backdrop_path: '',
                        overview: 'Загрузка данных...',
                        vote_average: 0,
                        type: catType,
                        source: 'Rutor Pro',
                        url: url
                    };

                    // Пытаемся обогатить карточку через TMDB
                    Lampa.Api.sources.tmdb.search({
                        query: titleStr,
                        type: catType,
                        language: 'ru-RU'
                    }, function(data) {
                        if (data && data.results && data.results[0]) {
                            var found = data.results[0];
                            card.id = found.id;
                            card.title = found.title || found.name || titleStr;
                            card.name = card.title;
                            card.poster_path = found.poster_path ? 'https://image.tmdb.org/t/p/w300' + found.poster_path : '';
                            card.backdrop_path = found.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + found.backdrop_path : '';
                            card.overview = found.overview || card.overview;
                            card.vote_average = found.vote_average || 0;
                            card.release_date = found.release_date || found.first_air_date;
                        }
                        results.push(card);
                        pending--;
                        if (pending === 0) onComplete(results);
                    }, function() {
                        results.push(card);
                        pending--;
                        if (pending === 0) onComplete(results);
                    });
                });
            }, function() {
                onComplete([]);
            });
        };

        self.category = function (params, onSuccess, onError) {
            var rows = [];

            function loadCategory(index) {
                if (index >= CATEGORIES.length) {
                    onSuccess(rows);
                    return;
                }

                var cat = CATEGORIES[index];
                var row = {
                    title: cat.title,
                    results: [],
                    url: cat.url,
                    source: 'Rutor Pro'
                };

                self.fetch(WORKER_URL + cat.url, function(items) {
                    row.results = items;
                    rows.push(row);
                    loadCategory(index + 1);
                });
            }

            loadCategory(0);
        };

        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function(items) {
                onComplete({ results: items, page: 1, total_pages: 1 });
            });
        };

        self.full = function (params, onSuccess, onError) {
            // Для наших карточек используем TMDB
            if (params.id) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
            } else {
                onSuccess(params);
            }
        };
    }

    function addMenuItem() {
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

        var target = $('.menu__list [data-action="movie"], .menu__list [data-action="tv"]').parent();
        if (target.length) target.after(item);
        else $('.menu__list').append(item);
    }

    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') {
                setTimeout(addMenuItem, 1200);
            }
        });
        setTimeout(addMenuItem, 2500);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') init();
    });
})();
