(function () {
    'use strict';

    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/'; // ПРОВЕРЬ ССЫЛКУ (с / на конце)
    var ICON = '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>';

    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.get = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json) return onError();
                onComplete(json);
            }, onError);
        };

        self.category = function (params, onSuccess, onError) {
            var categories = [
                { title: '🔥 Топ 24 часа', url: 'top' },
                { title: '🎬 Фильмы', url: 'kino' },
                { title: '📺 Сериалы', url: 'serial' }
            ];

            var partsData = categories.map(function (cat) {
                return function (callback) {
                    self.get(WORKER_URL + cat.url, function (json) {
                        callback({
                            title: cat.title,
                            results: json.results || [],
                            url: cat.url,
                            source: 'Rutor Pro'
                        });
                    }, function() { callback({results: []}); });
                };
            });

            Lampa.Api.partNext(partsData, 3, onSuccess, onError);
        };

        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onComplete, onError) {
            self.get(WORKER_URL + params.url, onComplete, onError);
        };
    }

    function startPlugin() {
        if (window.rutor_pro_plugin_inited) return;
        window.rutor_pro_plugin_inited = true;

        // Регистрация API
        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        // ФУНКЦИЯ ДОБАВЛЕНИЯ КНОПКИ (Усиленная)
        var addMenuItem = function () {
            var menu = $('.menu__list');
            // Если меню еще не загрузилось или кнопка уже есть — выходим
            if (!menu.length || $('.menu__item[data-action="rutor_pro"]').length) return;

            var item = $(`
                <li class="menu__item selector" data-action="rutor_pro">
                    <div class="menu__ico">${ICON}</div>
                    <div class="menu__text">${SOURCE_NAME}</div>
                </li>
            `);

            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: 'Rutor Pro',
                    method: 'category',
                    url: ''
                });
            });

            // Вставляем после кнопки "Главная" или просто в конец
            var mainButton = menu.find('[data-action="main"]').parent();
            if (mainButton.length) mainButton.after(item);
            else menu.append(item);
            
            console.log('Rutor Pro: Button added to menu');
        };

        // Запускаем проверку наличия меню
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuItem();
        });

        // Резервный цикл для ТВ (многие ТВ не сразу рендерят меню)
        var timer = setInterval(function() {
            addMenuItem();
            // Если кнопка появилась, можно замедлить или остановить таймер
            if ($('.menu__item[data-action="rutor_pro"]').length) clearInterval(timer);
        }, 2000);
    }

    // Запуск
    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });

})();
