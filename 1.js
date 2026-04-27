(function () {
    'use strict';

    function RutorPlugin() {
        const WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';

        // Описания категорий
        const categories = [
            { id: 'top24', title: 'Rutor: Топ 24ч' },
            { id: 'movies', title: 'Rutor: Зарубежное кино' },
            { id: 'movies_ru', title: 'Rutor: Наше кино' },
            { id: 'tv_shows', title: 'Rutor: Зарубежные сериалы' },
            { id: 'tv_shows_ru', title: 'Rutor: Наши сериалы' },
            { id: 'televizor', title: 'Rutor: ТВ Передачи' }
        ];

        // 1. Компонент отображения списка
        Lampa.Component.add('rutor_plugin', function (object) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var items = [];
            var html = $('<div class="category-full"></div>');

            this.create = function () {
                var _this = this;
                this.activity.loader(true);
                
                // Запрос к вашему воркеру
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
                    // Подготовка путей, если воркер прислал только хвосты
                    if (item.poster_path && !item.poster_path.includes('http')) {
                        item.poster_path = 'https://image.tmdb.org/t/p/w500' + item.poster_path;
                    }
                    if (item.backdrop_path && !item.backdrop_path.includes('http')) {
                        item.backdrop_path = 'https://image.tmdb.org/t/p/original' + item.backdrop_path;
                    }

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
                html.append('<div class="empty">Ничего не найдено</div>');
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

        // 2. Функция добавления кнопок
        function addItems() {
            if (window.rutor_plugin_installed) return; // Защита от дублей

            categories.forEach(function (cat) {
                var button = $(`<div class="menu__item selector" data-action="rutor">
                    <svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" fill="white"/></svg>
                    <div class="menu__text">${cat.title}</div>
                </div>`);

                button.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: cat.title,
                        component: 'rutor_plugin',
                        id: cat.id,
                        page: 1
                    });
                });

                // Вставляем в меню перед пунктом "Настройки" или в конец
                $('.menu .menu__list').append(button);
            });

            window.rutor_plugin_installed = true;
        }

        // Ждем отрисовки интерфейса Lampa
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready' || e.type == 'render') {
                setTimeout(addItems, 100);
            }
        });
    }

    // Запуск
    if (window.appready) RutorPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') RutorPlugin();
        });
    }
})();
