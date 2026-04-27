(function () {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/'; 
    var ICON = '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>';

    // Список категорий, которые ваш воркер умеет обрабатывать
    var CATEGORIES = [
        { title: 'Топ торренты за 24 часа', url: 'top24' },
        { title: 'Зарубежные фильмы', url: 'movies' },
        { title: 'Наши фильмы', url: 'movies_ru' },
        { title: 'Зарубежные сериалы', url: 'tv_shows' },
        { title: 'Наши сериалы', url: 'tv_shows_ru' },
        { title: 'Телевизор', url: 'televizor' }
    ];

    /**
     * Сервис запросов к вашему воркеру
     */
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // Базовый загрузчик
        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (json && json.results) {
                    var processed = json.results.map(function(item) {
                        // Очистка и проксирование картинок для WebOS
                        if (item.poster_path) {
                            var img = item.poster_path.indexOf('http') === 0 ? item.poster_path : 'https://image.tmdb.org/t/p/w300' + item.poster_path;
                            item.poster_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(img) + '&w=300';
                        }
                        if (item.backdrop_path) {
                            var bg = item.backdrop_path.indexOf('http') === 0 ? item.backdrop_path : 'https://image.tmdb.org/t/p/original' + item.backdrop_path;
                            item.backdrop_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(bg) + '&w=1000';
                        }
                        item.source = 'Rutor Pro';
                        return item;
                    });
                    onComplete(processed);
                } else {
                    onComplete([]);
                }
            }, function() {
                onComplete([]);
            });
        };

        // Главная страница плагина (список рядов)
        self.category = function (params, onSuccess, onError) {
            // Формируем структуру рядов для Lampa
            var rows = CATEGORIES.map(function(cat) {
                return {
                    title: cat.title,
                    results: [],
                    url: cat.url,
                    source: 'Rutor Pro'
                };
            });

            // Запускаем последовательную подгрузку данных в каждый ряд
            var partsData = rows.map(function(row) {
                return function(callback) {
                    self.fetch(WORKER_URL + row.url, function(items) {
                        row.results = items;
                        callback(row);
                    }, callback);
                };
            });

            Lampa.Api.partNext(partsData, 3, onSuccess, onError);
        };

        // Метод для открытия "Показать все" в категории
        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function(items) {
                onComplete({
                    results: items,
                    page: 1,
                    total_pages: 1
                });
            }, onError);
        };

        // При клике на карточку открываем детали через TMDB (стандарт Lampa)
        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    /**
     * Регистрация и вставка в интерфейс
     */
    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        // Регистрируем источник данных
        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        // Функция вставки кнопки в левое меню
        var addMenuItem = function () {
            var menu = $('.menu__list');
            if (!menu.length || $('.menu__item[data-action="rutor_pro"]').length) return;

            var item = $('<li class="menu__item selector" data-action="rutor_pro">' +
                '<div class="menu__ico">' + ICON + '</div>' +
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

            // Вставляем после пункта "Фильмы" или "Главная"
            var target = menu.find('[data-action="movie"]').parent();
            if (!target.length) target = menu.find('[data-action="main"]').parent();
            
            if (target.length) target.after(item);
            else menu.append(item);
        };

        // Слушатель для WebOS (появление меню)
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') addMenuItem();
        });

        // Резервный таймер прокрутки DOM
        var timer = setInterval(function() {
            addMenuItem();
            if ($('.menu__item[data-action="rutor_pro"]').length) clearInterval(timer);
        }, 1000);
    }

    // Запуск инициализации
    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });

})();
