(function () {
    'use strict';

    // Конфигурация
    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev'; // ЗАМЕНИТЕ НА ВАШ URL
    var ICON = '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>';

    // Хранилище настроек
    var MIN_PROGRESS = Lampa.Storage.get('rutor_min_progress', 90);

    /**
     * Фильтрация контента (как в NUM)
     */
    function filterWatchedContent(results) {
        var hideWatched = Lampa.Storage.get('rutor_hide_watched', false);
        if (!hideWatched) return results;

        return results.filter(function (item) {
            if (!item) return false;
            
            var mediaType = (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie';
            var checkItem = {
                id: item.id,
                media_type: mediaType,
                title: item.title || item.name || ''
            };

            var favoriteItem = Lampa.Favorite.check(checkItem);
            
            // Если фильм просмотрен полностью (по таймлайну)
            if (favoriteItem && favoriteItem.history && mediaType === 'movie') {
                var hash = Lampa.Utils.hash(String(item.id));
                var view = Lampa.Storage.cache('file_view', 300, [])[hash];
                if (view && view.percent >= MIN_PROGRESS) return false;
            }
            
            if (favoriteItem && favoriteItem.thrown) return false; // В корзине

            return true;
        });
    }

    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // Приведение ссылок к безопасному виду (FIX CORS & SSL)
        function normalizeData(json) {
            var normalized = {
                results: (json.results || []).map(function (item) {
                    // Исправляем пути для TMDB картинок через прокси Lampa или Weserv
                    var poster = item.poster_path || '';
                    if (poster && !poster.indexOf('http')) {
                         poster = 'https://images.weserv.nl/?url=' + encodeURIComponent(poster) + '&w=300';
                    }

                    return {
                        id: item.id,
                        title: item.title || item.name,
                        original_title: item.original_title || item.original_name || '',
                        poster_path: poster,
                        img: poster,
                        backdrop_path: item.backdrop_path || '',
                        vote_average: item.vote_average || 0,
                        release_date: item.release_date || item.first_air_date || '0000',
                        overview: item.overview || '',
                        type: (item.media_type === 'tv' || /сезон|серия/i.test(item.title)) ? 'tv' : 'movie',
                        source: 'rutor'
                    };
                })
            };
            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        self.get = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json) return onError();
                onComplete(normalizeData(json));
            }, onError);
        };

        // Для главной страницы (категории)
        self.category = function (params, onSuccess, onError) {
            var categories = [
                { title: '🔥 Топ 24 часа', url: '/top' },
                { title: '🎬 Фильмы', url: '/kino' },
                { title: '📺 Сериалы', url: '/serial' }
            ];

            var partsData = categories.map(function (cat) {
                return function (callback) {
                    self.get(WORKER_URL + cat.url, function (json) {
                        callback({
                            title: cat.title,
                            results: json.results,
                            url: cat.url,
                            source: 'rutor'
                        });
                    }, callback);
                };
            });

            Lampa.Api.partNext(partsData, 3, onSuccess, onError);
        };

        // Для подгрузки при скролле (список)
        self.list = function (params, onComplete, onError) {
            self.get(WORKER_URL + params.url, onComplete, onError);
        };

        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function startPlugin() {
        if (window.rutor_pro_plugin) return;
        window.rutor_pro_plugin = true;

        // 1. Добавляем компонент в настройки
        Lampa.SettingsApi.addComponent({
            component: 'rutor_settings',
            name: 'Rutor Pro',
            icon: ICON
        });

        // 2. Параметр: Скрыть просмотренные
        Lampa.SettingsApi.addParam({
            component: 'rutor_settings',
            param: {
                name: 'rutor_hide_watched',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Скрыть просмотренные',
                description: 'Убирает из списка контент, который вы уже видели'
            },
            onChange: function () {
                Lampa.Activity.replace(); // Обновляем текущую страницу
            }
        });

        // 3. Параметр: Порог прогресса
        Lampa.SettingsApi.addParam({
            component: 'rutor_settings',
            param: {
                name: 'rutor_min_progress',
                type: 'select',
                values: { '50': '50%', '80': '80%', '90': '90%', '95': '95%' },
                default: '90'
            },
            field: {
                name: 'Порог просмотра',
                description: 'Процент, после которого фильм считается просмотренным'
            },
            onChange: function (value) {
                MIN_PROGRESS = parseInt(value);
            }
        });

        // Регистрация API
        Lampa.Api.sources['Rutor Pro'] = new RutorApiService();

        // Добавление в меню
        var addMenuItem = function () {
            var menu = $('[data-action="main"]').parent(); // Ищем куда воткнуть
            if (!$('.menu__item[data-action="rutor_pro"]').length) {
                var item = $('<li class="menu__item selector" data-action="rutor_pro"><div class="menu__ico">' + ICON + '</div><div class="menu__text">Rutor Pro</div></li>');
                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        title: 'Rutor Pro',
                        component: 'category',
                        source: 'Rutor Pro',
                        method: 'category',
                        url: ''
                    });
                });
                menu.after(item);
            }
        };

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuItem();
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });

})();
