(function () {
    'use strict';

    var PLUGIN_NAME = 'v10_plugin';

    // =========================
    // НАСТРОЙКИ
    // =========================
    var PROXY = 'https://api.allorigins.win/raw?url=';
    var RUTOR = 'http://rutor.info';

    // Категории rutor
    var CATEGORIES = {
        top: '/top',
        foreign_films: '/browse/1/0/0/0',
        ru_films: '/browse/5/0/0/0',
        foreign_series: '/browse/4/0/0/0',
        ru_series: '/browse/7/0/0/0',
        tv: '/browse/6/0/0/0'
    };

    function log() {
        console.log.apply(console, ['[V10]'].concat([].slice.call(arguments)));
    }

    // =========================
    // ЗАГРУЗКА HTML
    // =========================
    function load(url, callback) {
        var full = PROXY + encodeURIComponent(url);

        fetch(full)
            .then(function (res) { return res.text(); })
            .then(function (html) {
                callback(html);
            })
            .catch(function (e) {
                log('Ошибка загрузки', e);
                Lampa.Noty.show('Ошибка загрузки. Проверь прокси!');
            });
    }

    // =========================
    // ПАРСИНГ RUTOR
    // =========================
    function parse(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        var rows = doc.querySelectorAll('tr.gai, tr.tum');

        var list = [];

        rows.forEach(function (row) {
            var title = row.querySelector('a:nth-child(2)');
            var magnet = row.querySelector('a[href^="magnet:"]');

            if (!title || !magnet) return;

            list.push({
                title: title.textContent.trim(),
                magnet: magnet.href
            });
        });

        return list;
    }

    // =========================
    // ОТРИСОВКА
    // =========================
    function openCategory(title, path) {
        Lampa.Activity.push({
            url: title,
            title: title,
            component: 'list',
            onCreate: function (activity) {
                activity.empty();

                load(RUTOR + path, function (html) {
                    var items = parse(html);

                    if (!items.length) {
                        Lampa.Noty.show('Пусто или ошибка прокси');
                        return;
                    }

                    items.forEach(function (item) {
                        activity.append({
                            title: item.title,
                            info: 'Rutor',
                            onEnter: function () {
                                play(item);
                            }
                        });
                    });
                });
            }
        });
    }

    // =========================
    // ВОСПРОИЗВЕДЕНИЕ
    // =========================
    function play(item) {
        Lampa.Player.play({
            title: item.title,
            url: item.magnet,
            torrent: true
        });
    }

    // =========================
    // МЕНЮ
    // =========================
    function createMenu() {
        return {
            title: 'V10 v1',
            component: 'category',
            onEnter: function () {
                Lampa.Activity.push({
                    title: 'V10 v1',
                    component: 'list',
                    onCreate: function (activity) {
                        activity.append({
                            title: '🔥 Топ за 24 часа',
                            onEnter: function () {
                                openCategory('Топ', CATEGORIES.top);
                            }
                        });

                        activity.append({
                            title: '🌍 Зарубежные фильмы',
                            onEnter: function () {
                                openCategory('Зарубежные фильмы', CATEGORIES.foreign_films);
                            }
                        });

                        activity.append({
                            title: '🇷🇺 Наши фильмы',
                            onEnter: function () {
                                openCategory('Наши фильмы', CATEGORIES.ru_films);
                            }
                        });

                        activity.append({
                            title: '📺 Зарубежные сериалы',
                            onEnter: function () {
                                openCategory('Зарубежные сериалы', CATEGORIES.foreign_series);
                            }
                        });

                        activity.append({
                            title: '🎬 Наши сериалы',
                            onEnter: function () {
                                openCategory('Наши сериалы', CATEGORIES.ru_series);
                            }
                        });

                        activity.append({
                            title: '📡 Телевизор',
                            onEnter: function () {
                                openCategory('Телевизор', CATEGORIES.tv);
                            }
                        });
                    }
                });
            }
        };
    }

    // =========================
    // ИНИЦИАЛИЗАЦИЯ
    // =========================
    function init() {
        if (!window.Lampa) {
            setTimeout(init, 500);
            return;
        }

        log('Плагин загружен');

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                Lampa.Menu.add(createMenu());
            }
        });
    }

    init();

})();
