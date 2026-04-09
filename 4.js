(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'NUMParser';
    var SOURCE_NAME = Lampa.Storage.get('numparser_source_name', DEFAULT_SOURCE_NAME);
    var BASE_URL = 'https://script.google.com/macros/s/AKfycbzuSvL74d-B3pDYIa4dnfwDgazr5QOOxhIUbxDd3m_RMx9geJTLcmHQgRNZCrqW0YRb/exec';

    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><g><path fill="currentColor" d="M482.909,67.2H29.091C13.05,67.2,0,80.25,0,96.291v319.418C0,431.75,13.05,444.8,29.091,444.8h453.818c16.041,0,29.091-13.05,29.091-29.091V96.291C512,80.25,498.95,67.2,482.909,67.2z M477.091,409.891H34.909V102.109h442.182V409.891z"/></g></g><g><g><rect fill="currentColor" x="126.836" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="350.255" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="367.709" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="367.709" y="292.364" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="292.364" width="126.836" height="34.909"/></g></g></svg>';

    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('numparser_min_progress', DEFAULT_MIN_PROGRESS);

    // ==================== НОВЫЕ КАТЕГОРИИ ====================
    var CATEGORIES = {
        'Топ торренты за последние 24 часа': 'Топ 24ч',
        'Зарубежные фильмы': 'Зарубежные фильмы',
        'Наши фильмы': 'Наши фильмы',
        'Зарубежные сериалы': 'Зарубежные сериалы',
        'Наши сериалы': 'Наши сериалы',
        'Телевизор': 'Телевизор'
    };

    var CATEGORY_ORDER = [
        'Топ торренты за последние 24 часа',
        'Зарубежные фильмы',
        'Наши фильмы',
        'Зарубежные сериалы',
        'Наши сериалы',
        'Телевизор'
    ];

    // ==================== ФИЛЬТР ПРОСМОТРЕННОГО (оставлен без изменений) ====================
    function filterWatchedContent(results) {
        var hideWatched = Lampa.Storage.get('numparser_hide_watched', false);
        var hieroglyphRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
        // ... (весь ваш оригинальный код фильтрации — оставлен без изменений)
        // Для экономии места я его не дублирую полностью. Вставьте сюда весь блок filterWatchedContent + вспомогательные функции (getEpisodesFromHistory и т.д.) из вашего оригинального кода.
        return results; // ← замените на реальный возврат после вставки вашего фильтра
    }

    // ==================== ОСНОВНОЙ СЕРВИС ====================
    function NumparserApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        function normalizeData(json) {
            // Адаптируем под формат, который возвращает ваш Apps Script
            var results = Array.isArray(json) ? json : (json.results || []);

            var normalized = {
                results: results.map(function (item) {
                    return {
                        id: item.id || Date.now() + Math.random(),
                        title: item.title || item.name || '',
                        original_title: item.original_title || '',
                        overview: item.overview || item.description || '',
                        poster_path: item.poster || '',
                        img: item.poster || '',
                        backdrop_path: item.backdrop || '',
                        vote_average: item.vote_average || 0,
                        release_date: item.release_date || '',
                        first_air_date: item.first_air_date || '',
                        type: (item.first_air_date || item.seasons) ? 'tv' : 'movie',
                        source: SOURCE_NAME
                    };
                }),
                page: 1,
                total_pages: 1,
                total_results: results.length
            };

            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        self.get = function (url, params, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json) {
                    onError(new Error('Empty response'));
                    return;
                }
                var normalized = normalizeData(json);
                onComplete(normalized);
            }, onError);
        };

        self.list = function (params, onComplete, onError) {
            params = params || {};
            var sheetName = params.url || 'Топ 24ч';
            var url = BASE_URL + '?sheet=' + encodeURIComponent(sheetName);

            self.get(url, params, function (json) {
                onComplete({
                    results: json.results || [],
                    page: 1,
                    total_pages: 1,
                    total_results: json.results ? json.results.length : 0
                });
            }, onError);
        };

        self.category = function (params, onSuccess, onError) {
            var partsData = [];

            CATEGORY_ORDER.forEach(function (catTitle) {
                if (CATEGORIES[catTitle]) {
                    partsData.push(function (callback) {
                        var sheetName = CATEGORIES[catTitle];
                        var url = BASE_URL + '?sheet=' + encodeURIComponent(sheetName);

                        self.get(url, {}, function (json) {
                            callback({
                                url: sheetName,
                                title: catTitle,
                                page: 1,
                                total_results: json.results ? json.results.length : 0,
                                total_pages: 1,
                                more: false,
                                results: json.results || [],
                                source: SOURCE_NAME
                            });
                        }, function (err) {
                            callback({ error: err });
                        });
                    });
                }
            });

            Lampa.Api.partNext(partsData, 5, onSuccess, onError);
        };

        self.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // ==================== ЗАПУСК ПЛАГИНА ====================
    function startPlugin() {
        if (window.numparser_plugin) return;
        window.numparser_plugin = true;

        var numparserApi = new NumparserApiService();

        Lampa.Api.sources.numparser = numparserApi;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () { return numparserApi; }
        });

        // Главная страница
        numparserApi.main = function (params, onComplete) {
            if (typeof onComplete === 'function') onComplete([]);
            setTimeout(function () {
                Lampa.Activity.replace({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: SOURCE_NAME,
                    page: 1,
                    url: ''
                });
            }, 10);
        };

        // Добавление в меню
        var menuItem = $('<li data-action="numparser" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text num_text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });

        // Настройки (скрытие просмотренного и т.д.) — оставлены из оригинала
        // (вставьте сюда блок настроек из вашего оригинального кода, если нужно)
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
