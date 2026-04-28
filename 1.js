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

        // Основная функция получения данных от worker
        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (json && json.results) {
                    // Преобразуем сырые названия в нормальные карточки Lampa
                    var processed = json.results.map(function(item) {
                        // Если пришёл уже готовый объект — используем его
                        if (item.title && (item.poster_path || item.id)) {
                            if (item.poster_path) {
                                item.poster_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(item.poster_path) + '&w=300';
                            }
                            if (item.backdrop_path) {
                                item.backdrop_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(item.backdrop_path) + '&w=1000';
                            }
                            item.source = 'Rutor Pro';
                            return item;
                        }
                        
                        // Если пришло только название (строка) — создаём карточку
                        var title = typeof item === 'string' ? item : (item.title || item.name || '');
                        return {
                            title: title,
                            name: title,
                            original_title: title,
                            poster_path: '',           // будет пытаться подтянуть позже через full()
                            backdrop_path: '',
                            overview: 'Торрент с Rutor • ' + title,
                            vote_average: 0,
                            type: 'movie',             // по умолчанию
                            source: 'Rutor Pro',
                            url: ''                    // для list
                        };
                    });
                    onComplete(processed);
                } else {
                    onComplete([]);
                }
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
                    row.results = items || [];
                    rows.push(row);
                    loadCategory(index + 1);
                }, function() {
                    row.results = [];
                    rows.push(row);
                    loadCategory(index + 1);
                });
            }

            loadCategory(0);
        };

        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function(items) {
                onComplete({ 
                    results: items || [], 
                    page: 1, 
                    total_pages: 1 
                });
            }, onError);
        };

        // При открытии карточки пытаемся получить полную информацию
        self.full = function (params, onSuccess, onError) {
            // Если у нас уже есть данные от TMDB/KP — используем их
            if (params.source === 'Rutor Pro' && params.id) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
            } else {
                onSuccess(params); // fallback
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
        if (target.length) {
            target.after(item);
        } else {
            $('.menu__list').append(item);
        }
    }

    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render' || e.type === 'full_start') {
                setTimeout(addMenuItem, 1000);
            }
        });

        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') init();
    });
})();
