(function () {
    'use strict';

    // === НАСТРОЙКИ ===
    var SOURCE_NAME = 'Rutor Pro';
    // ВАЖНО: Замени на свой актуальный URL воркера (обязательно с / в конце)
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/'; 
    var ICON = '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>';

    /**
     * Логика фильтрации просмотренного контента
     */
    function filterWatched(results) {
        var hideWatched = Lampa.Storage.get('rutor_hide_watched', false);
        if (!hideWatched) return results;

        var minPercent = Lampa.Storage.get('rutor_min_progress', 90);

        return results.filter(function (item) {
            if (!item || !item.id) return false;
            
            var mediaType = (item.media_type === 'tv' || item.type === 'tv') ? 'tv' : 'movie';
            var favorite = Lampa.Favorite.check(item);
            
            // Если в корзине - скрываем
            if (favorite && favorite.thrown) return false;

            // Если есть история просмотров
            if (favorite && favorite.history) {
                var hash = Lampa.Utils.hash(String(item.id));
                var view = Lampa.Storage.cache('file_view', 500, [])[hash];
                if (view && view.percent >= minPercent) return false;
            }
            return true;
        });
    }

    /**
     * Сервис запросов
     */
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // Универсальный загрузчик JSON
        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (json && json.results) {
                    json.results = json.results.map(function(item) {
                        // Фикс картинок через прокси для обхода CORS
                        if (item.poster_path && item.poster_path.indexOf('http') === 0) {
                            item.poster_path = 'https://images.weserv.nl/?url=' + encodeURIComponent(item.poster_path) + '&w=300';
                        }
                        item.source = 'Rutor Pro';
                        return item;
                    });
                    onComplete(filterWatched(json.results));
                } else {
                    onComplete([]);
                }
            }, function() {
                onComplete([]); // Возвращаем пустой массив при ошибке
            });
        };

        // Главная страница (Категории из воркера)
        self.category = function (params, onSuccess, onError) {
            self.fetch(WORKER_URL + 'categories', function (data) {
                // Превращаем массив объектов в формат строк Lampa
                var rows = data.map(function(cat) {
                    return {
                        title: cat.title,
                        results: [], // Будут загружены через list
                        url: cat.url,
                        source: 'Rutor Pro'
                    };
                });

                // Используем механизм подгрузки строк как в NUM
                var partsData = rows.map(function(row) {
                    return function(callback) {
                        self.fetch(WORKER_URL + row.url, function(items) {
                            row.results = items;
                            callback(row);
                        }, callback);
                    };
                });

                Lampa.Api.partNext(partsData, 3, onSuccess, onError);
            }, onError);
        };

        // Подгрузка конкретной категории
        self.list = function (params, onComplete, onError) {
            self.fetch(WORKER_URL + params.url, function(items) {
                onComplete({
                    results: items,
                    page: 1,
                    total_pages: 1
                });
            }, onError);
        };

        // Открытие карточки (через TMDB)
        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    /**
     * Инициализация плагина
     */
    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        // Регистрация в системе Lampa
        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        // Добавление настроек
        Lampa.SettingsApi.addComponent({
            component: 'rutor_settings',
            name: 'Rutor Pro',
            icon: ICON
        });

        Lampa.SettingsApi.addParam({
            component: 'rutor_settings',
            param: { name: 'rutor_hide_watched', type: 'trigger', default: false },
            field: { name: 'Скрыть просмотренные', description: 'Скрывать из выдачи уже увиденное' },
            onChange: function() { Lampa.Activity.replace(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'rutor_settings',
            param: { 
                name: 'rutor_min_progress', 
                type: 'select', 
                values: { '50': '50%', '80': '80%', '90': '90%', '95': '95%' }, 
                default: '90' 
            },
            field: { name: 'Порог просмотра', description: 'Процент прогресса для скрытия' }
        });

        // Функция вставки кнопки в меню
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

            // Ставим после "Главная"
            var main = menu.find('[data-action="main"]').parent();
            if (main.length) main.after(item);
            else menu.append(item);
        };

        // Следим за готовностью приложения
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuItem();
        });

        // Резервный таймер (для WebOS)
        var timer = setInterval(function() {
            addMenuItem();
            if ($('.menu__item[data-action="rutor_pro"]').length) clearInterval(timer);
        }, 2000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });

})();
