(function() {
    'use strict';

    const API_URL = 'https://script.google.com/macros/s/AKfycbxEh9L6lmVtOAJsDH4N34bzvc2AbFJcosvY6E1SZ1Wc5Dozi4pN_-4480LWUvAtwehe/exec'; // ← ЗАМЕНИ НА СВОЙ /exec URL

    var network = new Lampa.Reguest(); // webOS-совместимо

    function findField(row, keys) {
        for (let k of keys) {
            if (row[k] !== undefined) return row[k];
        }
        return '';
    }

    // Добавляем кнопку в левое меню (автоматически при запуске плагина)
    function addToMenu() {
        Lampa.Activity.push({
            title: 'V10 v3',
            component: 'v10_v3',
            page: 1
        });
        Lampa.Noty.show('V10 v3 добавлен в левое меню');
    }

    // Основной компонент
    Lampa.Component.add('v10_v3', {
        init: function() {
            this.activity = Lampa.Activity.active();
            this.render();
        },

        render: function() {
            var _this = this;
            var html = Lampa.Template.get('cub_block', { title: 'V10 v3 — Категории' });
            this.activity.body.html(html);

            // Загружаем категории
            this.loadCategories();
            return this.activity;
        },

        loadCategories: function() {
            var _this = this;
            var cached = Lampa.Storage.get('v10_categories', false);

            if (cached && (Date.now() - cached.time < 3600000)) {
                this.showCategories(cached.data);
                return;
            }

            network.silent(API_URL + '?action=categories', function(data) {
                if (data.success) {
                    Lampa.Storage.set('v10_categories', { time: Date.now(), data: data.categories });
                    _this.showCategories(data.categories);
                } else {
                    Lampa.Noty.show('Ошибка получения категорий');
                }
            }, function() {
                Lampa.Noty.show('Не удалось загрузить категории (проверьте интернет)');
            });
        },

        showCategories: function(categories) {
            var _this = this;
            var scroll = Lampa.Scroll.create();

            categories.forEach(function(cat) {
                var card = Lampa.Card.create({
                    title: cat,
                    poster: '', // можно добавить эмодзи или иконку
                    background: ''
                });

                card.on('select', function() {
                    _this.loadMovies(cat);
                });

                scroll.append(card);
            });

            this.activity.body.append(scroll.render());
            scroll.toggle();
        },

        loadMovies: function(sheetName) {
            var _this = this;
            Lampa.Loading.start();

            var cached = Lampa.Storage.get('v10_data_' + sheetName, false);
            if (cached && (Date.now() - cached.time < 3600000)) {
                this.showMovies(cached.data);
                Lampa.Loading.stop();
                return;
            }

            network.silent(API_URL + '?action=data&sheet=' + encodeURIComponent(sheetName), function(resp) {
                if (resp.success) {
                    Lampa.Storage.set('v10_data_' + sheetName, { time: Date.now(), data: resp.data });
                    _this.showMovies(resp.data);
                } else {
                    Lampa.Noty.show(resp.error || 'Ошибка данных');
                }
                Lampa.Loading.stop();
            }, function() {
                Lampa.Noty.show('Ошибка загрузки фильмов');
                Lampa.Loading.stop();
            });
        },

        showMovies: function(movies) {
            var _this = this;
            var scroll = Lampa.Scroll.create();

            movies.forEach(function(row) {
                var title = findField(row, ['Название', 'title', 'Name']) || 'Без названия';
                var poster = findField(row, ['Постер', 'poster', 'image']) || '';
                var playerUrl = findField(row, ['Ссылка', 'url', 'player', 'link']) || '';

                var card = Lampa.Card.create({
                    title: title,
                    poster: poster,
                    background: findField(row, ['Фон', 'background']) || poster,
                    description: findField(row, ['Описание', 'description']) || '',
                    year: findField(row, ['Год', 'year']) || ''
                });

                card.on('select', function() {
                    if (playerUrl) {
                        Lampa.Player.open({
                            url: playerUrl,
                            title: title,
                            poster: poster
                        });
                    } else {
                        Lampa.Noty.show('Ссылка на плеер отсутствует');
                    }
                });

                scroll.append(card);
            });

            this.activity.body.empty().append(scroll.render());
            scroll.toggle();
        }
    });

    // Автозапуск при установке плагина
    Lampa.onReady(function() {
        addToMenu();
    });

    console.log('✅ Плагин V10 v3 загружен');
})();
