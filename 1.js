(function () {
    'use strict';

    function RutorPlugin(api) {
        const WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';

        // Описание категорий для бокового меню Lampa
        const categories = [
            { id: 'top24', title: 'Rutor: Топ 24ч' },
            { id: 'movies', title: 'Rutor: Зарубежное кино' },
            { id: 'movies_ru', title: 'Rutor: Наше кино' },
            { id: 'tv_shows', title: 'Rutor: Зарубежные сериалы' },
            { id: 'tv_shows_ru', title: 'Rutor: Наши сериалы' },
            { id: 'televizor', title: 'Rutor: ТВ Передачи' }
        ];

        // Добавляем пункт в главное меню Lampa
        Lampa.Component.add('rutor_plugin', function (object) {
            let network = new Lampa.Reguest();
            let scroll = new Lampa.Scroll({ mask: true, over: true });
            let items = [];
            let html = $('<div></div>');

            this.create = function () {
                this.activity.loader(true);
                
                // Запрос к вашему воркеру
                network.silent(WORKER_URL + object.id, (data) => {
                    if (data && data.results) {
                        this.build(data.results);
                    } else {
                        this.empty();
                    }
                    this.activity.loader(false);
                }, () => {
                    this.empty();
                    this.activity.loader(false);
                });

                return this.render();
            };

            this.build = function (data) {
                data.forEach(item => {
                    // Создаем карточку в стиле Lampa
                    let card = Lampa.Template.get('card', item);
                    card.on('hover:focus', () => {
                        Lampa.Background.change(item.backdrop_path);
                    });
                    
                    // При клике открываем стандартную карточку фильма/сериала
                    card.on('hover:enter', () => {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Карточка',
                            component: 'full',
                            id: item.id,
                            method: item.type == 'tv' ? 'tv' : 'movie',
                            card: item,
                            source: 'tmdb' // Используем TMDB для деталей
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

            this.render = function () {
                return scroll.render();
            };

            this.back = function () {
                Lampa.Activity.backward();
            };

            this.destroy = function () {
                network.clear();
                scroll.destroy();
                html.remove();
                items = [];
            };
        });

        // Регистрация кнопок в меню
        categories.forEach(cat => {
            Lampa.Menu.add({
                id: 'rutor_' + cat.id,
                title: cat.title,
                icon: '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/></svg>',
                onSelect: () => {
                    Lampa.Activity.push({
                        url: '',
                        title: cat.title,
                        component: 'rutor_plugin',
                        id: cat.id,
                        page: 1
                    });
                }
            });
        });
    }

    if (window.appready) RutorPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') RutorPlugin();
        });
    }
})();
