(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'NUMParser';
    var SOURCE_NAME = Lampa.Storage.get('numparser_source_name', DEFAULT_SOURCE_NAME);
    
    // НОВЫЙ ИДЕНТИФИКАТОР РАЗВЕРТЫВАНИЯ
    var GAS_DEPLOY_ID = 'AKfycbwksF9gfbyP_ZxvublZ_sidsEuXW_fJs0EqHu-s6NwCxnsVJT60qa-Y6tBrVlHd8hSJ';
    var GAS_URL = 'https://script.google.com/macros/s/' + GAS_DEPLOY_ID + '/exec';
    
    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><g><path fill="currentColor" d="M482.909,67.2H29.091C13.05,67.2,0,80.25,0,96.291v319.418C0,431.75,13.05,444.8,29.091,444.8h453.818c16.041,0,29.091-13.05,29.091-29.091V96.291C512,80.25,498.95,67.2,482.909,67.2z M477.091,409.891H34.909V102.109h442.182V409.891z"/></g></g><g><g><rect fill="currentColor" x="126.836" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="350.255" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="367.709" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="367.709" y="292.364" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="292.364" width="126.836" height="34.909"/></g></g></svg>';
    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('numparser_min_progress', DEFAULT_MIN_PROGRESS);

    // === КАТЕГОРИИ ===
    var CATEGORY_VISIBILITY = {
        top_24h: { title: 'Топ торренты за последние 24 часа', visible: Lampa.Storage.get('numparser_category_top_24h', true), sheet: 'Топ 24ч' },
        foreign_movies: { title: 'Зарубежные фильмы', visible: Lampa.Storage.get('numparser_category_foreign_movies', true), sheet: 'Зарубежные фильмы' },
        russian_movies: { title: 'Наши фильмы', visible: Lampa.Storage.get('numparser_category_russian_movies', true), sheet: 'Наши фильмы' },
        foreign_series: { title: 'Зарубежные сериалы', visible: Lampa.Storage.get('numparser_category_foreign_series', true), sheet: 'Зарубежные сериалы' },
        russian_series: { title: 'Наши сериалы', visible: Lampa.Storage.get('numparser_category_russian_series', true), sheet: 'Наши сериалы' },
        tv: { title: 'Телевизор', visible: Lampa.Storage.get('numparser_category_tv', true), sheet: 'Телевизор' }
    };

    var CATEGORY_SETTINGS_ORDER = ['top_24h', 'foreign_movies', 'russian_movies', 'foreign_series', 'russian_series', 'tv'];

    // === ФИЛЬТРАЦИЯ (оптимизировано для слабых TV) ===
    function filterWatchedContent(results) {
        if (!results || results.length === 0) return [];
        var hideWatched = Lampa.Storage.get('numparser_hide_watched', false);
        if (!hideWatched) return results;

        var hieroglyphRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
        var favRaw = Lampa.Storage.get('favorite', '{}');
        var favorite = {};
        try { if (typeof favRaw === 'string') favorite = JSON.parse(favRaw || '{}'); } catch (e) {}
        if (!Array.isArray(favorite.card)) favorite.card = [];

        return results.filter(function (item) {
            if (!item) return true;
            var title = item.title || item.name || item.original_title || item.original_name || '';
            if (hieroglyphRegex.test(title)) return false;

            var mediaType = (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie';
            var checkItem = {
                id: item.id, media_type: mediaType,
                original_title: item.original_title || '', title: title,
                original_language: item.original_language || 'en',
                poster_path: item.poster_path || '', backdrop_path: item.backdrop_path || ''
            };

            var fav = Lampa.Favorite.check(checkItem);
            var watched = !!fav && !!fav.history;
            var thrown = !!fav && fav.thrown;

            if (thrown) return false;
            if (!watched) return true;

            if (mediaType === 'movie') {
                var hashes = [];
                if (item.id) hashes.push(Lampa.Utils.hash(String(item.id)));
                if (item.original_title) hashes.push(Lampa.Utils.hash(item.original_title));
                var fileView = Lampa.Storage.cache('file_view', 300, []);
                for (var i = 0; i < hashes.length; i++) {
                    var view = fileView[hashes[i]];
                    if (view && view.percent && view.percent >= MIN_PROGRESS) return false;
                }
                return true;
            }
            return true; // Для сериалов оставляем, если не отмечено как "Брошено"
        });
    }

    // === API СЕРВИС ===
    function NumparserApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        function normalizeData(json) {
            function toHttps(v) { if (!v || typeof v !== 'string') return ''; if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://'); if (/^\/\//.test(v)) return 'https:' + v; return ''; }
            function toTmdbPath(v) { if (!v || typeof v !== 'string') return ''; if (/^https?:\/\//i.test(v)) { var m = v.replace(/^http:\/\//i, 'https://').match(/^https?:\/\/(?:image\.tmdb\.org|www\.themoviedb\.org)\/(t\/p\/[^?#]+)/i); return m && m[1] ? '/' + m[1] : ''; } return v.charAt(0) === '/' ? v : ''; }

            var normalized = {
                results: (json.results || []).map(function (item) {
                    return {
                        id: item.id,
                        poster_path: toTmdbPath(item.poster_path) || '',
                        img: toHttps(item.poster_path) || '',
                        overview: item.overview || '',
                        vote_average: item.vote_average || 0,
                        backdrop_path: toTmdbPath(item.backdrop_path) || '',
                        background_image: toHttps(item.backdrop_path) || '',
                        source: SOURCE_NAME,
                        type: item.type || (item.media_type || 'movie'),
                        original_title: item.original_title || '',
                        title: item.title || '',
                        original_language: item.original_language || 'en',
                        first_air_date: item.first_air_date,
                        number_of_seasons: item.number_of_seasons,
                        status: item.status || '',
                        promo_title: item.promo_title || item.title || '',
                        promo: item.promo || item.overview || ''
                    };
                }),
                page: json.page || 1,
                total_pages: json.total_pages || 1,
                total_results: json.total_results || 0
            };
            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        function fetchData(url, params, onComplete, onError) {
            self.network.silent(url, params, function(json) {
                if (!json || json.error) { onError(new Error(json ? json.error : 'Empty response')); return; }
                onComplete(normalizeData(json));
            }, onError);
        }

        self.list = function (params, onComplete, onError) {
            params = params || {};
            var cat = CATEGORY_VISIBILITY[params.url];
            if (!cat) { onError(new Error('Category not found')); return; }
            var reqUrl = GAS_URL + '?sheet=' + encodeURIComponent(cat.sheet) + '&page=' + (params.page || 1);
            fetchData(reqUrl, {}, onComplete, onError);
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card;
            params.method = !!(card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
            try { Lampa.Api.sources.tmdb.full(params, onSuccess, onError); } catch (e) { onError(e); }
        };

        self.category = function (params, onSuccess, onError) {
            params = params || {};
            var partsData = [];

            CATEGORY_SETTINGS_ORDER.forEach(function (key) {
                var cat = CATEGORY_VISIBILITY[key];
                if (cat && cat.visible) {
                    partsData.push(function (callback) {
                        var reqUrl = GAS_URL + '?sheet=' + encodeURIComponent(cat.sheet);
                        self.network.silent(reqUrl, {}, function(json) {
                            if (!json || json.error) { callback({error: new Error(json ? json.error : 'Load error')}); return; }
                            var norm = normalizeData(json);
                            callback({
                                url: key, title: cat.title, page: 1,
                                total_results: norm.total_results, total_pages: norm.total_pages, more: norm.total_pages > 1,
                                results: norm.results, source: SOURCE_NAME,
                                _original_total_results: json.total_results || 0,
                                _original_total_pages: json.total_pages || 1,
                                _original_results: json.results || []
                            });
                        }, function() { callback({error: new Error('Network error')}); });
                    });
                }
            });

            Lampa.Api.partNext(partsData, 5, onSuccess, onError);
            return function(partLoaded, partEmpty) { Lampa.Api.partNext(partsData, 5, partLoaded, partEmpty); };
        };

        self.main = function (params, onComplete, onError) {
            if (typeof onComplete === 'function') onComplete([]);
            try { if (Lampa.Storage.get('source', 'tmdb') !== SOURCE_NAME) return; } catch (e) { return; }
            setTimeout(function () {
                try { Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' }); } catch (e) {}
            }, 0);
        };

        // Безопасная дозагрузка при скролле
        Lampa.Listener.follow('line', function (event) {
            if (event.type !== 'append') return;
            var data = event.data;
            if (!data || !Array.isArray(data.results)) return;
            var desiredCount = 20;
            var allResults = filterWatchedContent(data.results).filter(function (item) { return item && item.id && (item.title || item.name); });
            var page = data.page || 1;
            var totalPages = data._original_total_pages || data.total_pages || 1;
            var source = data.source;
            var url = data.url;

            if (allResults.length >= desiredCount || page >= totalPages) {
                data.results = allResults.slice(0, desiredCount);
                data.page = page;
                data.more = page < totalPages;
                if (event.line && event.line.update) event.line.update();
                return;
            }

            function loadNext(p) {
                self.list({ url: url, page: p, source: source }, function (resp) {
                    if (resp && Array.isArray(resp.results)) {
                        var filtered = filterWatchedContent(resp.results).filter(function (it) { return it && it.id && (it.title || it.name); });
                        allResults = allResults.concat(filtered);
                    }
                    if (allResults.length >= desiredCount || p >= totalPages) {
                        data.results = allResults.slice(0, desiredCount);
                        data.page = p;
                        data.more = p < totalPages;
                        if (event.line && event.line.update) event.line.update();
                    } else {
                        setTimeout(function() { loadNext(p + 1); }, 150); // Щадящий интервал для слабых CPU
                    }
                });
            }
            loadNext(page + 1);
        });
    }

    // === UI ХЕЛПЕРЫ ===
    function numparser_img(src, size) {
        if (!src || typeof src !== 'string') return '';
        if (/^https?:\/\//i.test(src)) return src.replace(/^http:\/\//i, 'https://');
        if (/^\/\//.test(src)) return 'https:' + src;
        try { return Lampa.Api.img(src, size); } catch(e) { return ''; }
    }
    function setImg(node, url, size) {
        if (!node) return;
        url = url ? numparser_img(url, size) : '/img/img_broken.svg';
        node.onerror = function () { this.src = '/img/img_broken.svg'; };
        node.src = url;
    }

    // === ЗАПУСК ПЛАГИНА ===
    function startPlugin() {
        if (window.numparser_plugin) return;
        window.numparser_plugin = true;

        try {
            if (Lampa.Storage.field('start_page') === SOURCE_NAME) {
                window.start_deep_link = { component: 'category', page: 1, url: '', source: SOURCE_NAME, title: SOURCE_NAME };
            }
            if (Lampa.Params.values && Lampa.Params.values.start_page) {
                Lampa.Params.values.start_page[SOURCE_NAME] = SOURCE_NAME;
            }
        } catch(e) {}

        try { Lampa.SettingsApi.addComponent({ component: 'numparser_settings', name: SOURCE_NAME, icon: ICON }); } catch(e) {}

        try {
            Lampa.SettingsApi.addParam({
                component: 'numparser_settings',
                param: { name: 'numparser_hide_watched', type: 'trigger', default: Lampa.Storage.get('numparser_hide_watched', "false") === "true" },
                field: { name: 'Скрыть просмотренные', description: 'Скрывать просмотренные фильмы и сериалы' },
                onChange: function (value) {
                    Lampa.Storage.set('numparser_hide_watched', value === true || value === "true");
                    try {
                        var active = Lampa.Activity.active();
                        if (active && active.activity_line && active.activity_line.listener && typeof active.activity_line.listener.send === 'function') {
                            active.activity_line.listener.send({ type: 'append', data: active.activity_line.card_data, line: active.activity_line });
                        } else { location.reload(); }
                    } catch(e) { location.reload(); }
                }
            });
        } catch(e) {}

        try {
            Lampa.SettingsApi.addParam({
                component: 'numparser_settings',
                param: { name: 'numparser_min_progress', type: 'select', values: { '50': '50%', '60': '60%', '70': '70%', '80': '80%', '90': '90%', '100': '100%' }, default: DEFAULT_MIN_PROGRESS.toString() },
                field: { name: 'Порог просмотра', description: 'Минимальный процент просмотра для скрытия контента' },
                onChange: function (value) { Lampa.Storage.set('numparser_min_progress', parseInt(value)); }
            });
        } catch(e) {}

        try {
            Lampa.SettingsApi.addParam({
                component: 'numparser_settings',
                param: { name: 'numparser_source_name', type: 'input', placeholder: 'Введите название', default: DEFAULT_SOURCE_NAME },
                field: { name: 'Название источника', description: 'Изменение названия источника в меню' },
                onChange: function (value) { try { $('.num_text').text(value); } catch(e){} Lampa.Settings.update(); }
            });
        } catch(e) {}

        CATEGORY_SETTINGS_ORDER.forEach(function (option) {
            if (!CATEGORY_VISIBILITY[option]) return;
            var settingName = 'numparser_category_' + option + '_visible';
            var visible = Lampa.Storage.get(settingName, "true").toString() === "true";
            CATEGORY_VISIBILITY[option].visible = visible;
            try {
                Lampa.SettingsApi.addParam({
                    component: "numparser_settings",
                    param: { name: settingName, type: "trigger", default: visible },
                    field: { name: CATEGORY_VISIBILITY[option].title },
                    onChange: function (value) { CATEGORY_VISIBILITY[option].visible = (value === true || value === "true"); }
                });
            } catch(e) {}
        });

        var numparserApi = new NumparserApiService();
        Lampa.Api.sources.numparser = numparserApi;
        try { Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: function () { return numparserApi; } }); } catch(e) { Lampa.Api.sources[SOURCE_NAME] = numparserApi; }

        try {
            var origPush = Lampa.Activity.push; var origReplace = Lampa.Activity.replace;
            function patch(params) {
                if (!params) return params;
                if (Lampa.Storage.get('source', 'tmdb') === SOURCE_NAME && params.component === 'category' && (params.url === 'movie' || params.url === 'tv')) {
                    params.source = 'tmdb';
                }
                return params;
            }
            Lampa.Activity.push = function (params) { return origPush.call(this, patch(params)); };
            Lampa.Activity.replace = function (params) { return origReplace.call(this, patch(params)); };
        } catch(e) {}

        try {
            var sources = Object.assign({}, (Lampa.Params.values && Lampa.Params.values['source']) ? Lampa.Params.values['source'] : {});
            sources[SOURCE_NAME] = SOURCE_NAME;
            Lampa.Params.select('source', sources, 'tmdb');
        } catch(e) {}

        try {
            var menuItem = $('<li data-action="numparser" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text num_text">' + SOURCE_NAME + '</div></li>');
            $('.menu .menu__list').eq(0).append(menuItem);

            var origSet = Lampa.Storage.set;
            Lampa.Storage.set = function (key, value) {
                var res = origSet.apply(this, arguments);
                if (key === 'source') {
                    try {
                        if (value === SOURCE_NAME) menuItem.hide(); else menuItem.show();
                        var active = Lampa.Activity.active && Lampa.Activity.active();
                        if (active && active.component === 'main') {
                            if (value === SOURCE_NAME) Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' });
                            else Lampa.Activity.replace({ component: 'main' });
                        }
                    } catch(e) {}
                }
                return res;
            };

            menuItem.on('hover:enter', function () {
                Lampa.Activity.push({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1 });
            });
        } catch(e) {}
    }

    if (window.appready) { startPlugin(); } 
    else { Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') startPlugin(); }); }
})();
