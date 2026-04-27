(function () {
    'use strict';

    function RutorPlugin() {
        const WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';

        const categories = [
            { id: 'top24', title: 'Rutor: Топ 24ч' },
            { id: 'movies', title: 'Rutor: Зарубежное кино' },
            { id: 'movies_ru', title: 'Rutor: Наше кино' },
            { id: 'tv_shows', title: 'Rutor: Зарубежные сериалы' },
            { id: 'tv_shows_ru', title: 'Rutor: Наши сериалы' },
            { id: 'televizor', title: 'Rutor: ТВ Передачи' }
        ];

        // 1. Создаем компонент отображения карточек
        Lampa.Component.add('rutor_plugin', function (object) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var items = [];
            var html = $('<div class="category-full"></div>');

            this.create = function () {
                var _this = this;
                this.activity.loader(true);
                
                network.silent(WORKER_URL + object.id, function (data) {
                    if (data && data.results && data.results.length > 0) {
                        _this.build(data.results);
                    } else {
                        _this.empty();
                    }
                    _this.activity.loader(false);
                }, function () {
                    _this.empty();
                    _this.activity.loader(false);
                });

                return this.render();
            };

            this.build = function (data) {
                var _this = this;
                data.forEach(function (item) {
                    var card = Lampa.Template.get('card', item);
                    card.on('hover:focus', function () {
                        Lampa.Background.change(item.backdrop_path);
                    });
                    
                    card.on('hover:enter', function () {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Карточка',
                            component: 'full',
                            id: item.id,
                            method: item.type == 'tv' ? 'tv' : 'movie',
                            card: item,
                            source: 'tmdb'
                        });
                    });

                    html.append(card);
                    items.push(card);
                });
                scroll.append(html);
            };

            this.empty = function () {
                html.append('<div class="empty">Список пуст или сервер недоступен</div>');
                scroll.append(html);
            };

            this.render = function () { return scroll.render(); };
            this.back = function () { Lampa.Activity.backward(); };
            this.destroy = function () {
                network.clear();
                scroll.destroy();
                html.remove();
                items = [];
            };
        });

        // 2. Функция принудительного добавления в меню
        function addMenuItems() {
            categories.forEach(function (cat) {
                var menu_item = {
                    id: 'rutor_' + cat.id,
                    title: cat.title,
                    icon: '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="white"/></svg>',
                    onSelect: function () {
                        Lampa.Activity.push({
                            url: '',
                            title: cat.title,
                            component: 'rutor_plugin',
                            id: cat.id,
                            page: 1
                        });
                    }
                };
                
                // Проверяем, нет ли уже такого пункта, и добавляем
                if ($('.menu [data-action="rutor_' + cat.id + '"]').length === 0) {
                    Lampa.Menu.add(menu_item);
                }
            });
        }

        addMenuItems();
        console.log('Rutor Plugin: Loaded successfully');
    }

    // Запуск плагина
    if (window.appready) RutorPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') RutorPlugin();
        });
    }
})();
