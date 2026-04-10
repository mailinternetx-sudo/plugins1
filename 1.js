(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'V10 v1';
    var SOURCE_NAME = Lampa.Storage.get('v10_source_name', DEFAULT_SOURCE_NAME);
    var BASE_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';
    var TMDB_KEY = 'f348b4586d1791a40d99edd92164cb86';
    var TMDB_BASE = 'https://api.themoviedb.org/3';

    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><path fill="currentColor" d="M256,0C114.6,0,0,114.6,0,256s114.6,256,256,256s256-114.6,256-256S397.4,0,256,0z M256,448c-106,0-192-86-192-192S150,64,256,64s192,86,192,192S362,448,256,448z"/><circle fill="currentColor" cx="176" cy="208" r="32"/><circle fill="currentColor" cx="336" cy="208" r="32"/><path fill="currentColor" d="M256,320c-44.2,0-80-35.8-80-80s35.8-80,80-80s80,35.8,80,80S300.2,320,256,320z"/></g></svg>';

    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('v10_min_progress', DEFAULT_MIN_PROGRESS);

    // ==================== ОБЩИЕ УТИЛИТЫ (скопированы из оригинала) ====================
    function filterWatchedContent(results) {
        var hideWatched = Lampa.Storage.get('v10_hide_watched', false);
        if (!hideWatched) return results;

        var favorite_raw = Lampa.Storage.get('favorite', '{}');
        var favorite = {};
        try {
            if (typeof favorite_raw === 'string') favorite = JSON.parse(favorite_raw || '{}');
        } catch (e) {}
        if (!favorite || typeof favorite !== 'object') favorite = {};
        if (!Array.isArray(favorite.card)) favorite.card = [];

        var timeTable = Lampa.Storage.cache('timetable', 300, []);

        return results.filter(function (item) {
            if (!item) return true;

            var mediaType = (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie';
            var checkItem = {
                id: item.id,
                media_type: mediaType,
                original_title: item.original_title || item.original_name || '',
                title: item.title || item.name || '',
                original_language: item.original_language || 'en',
                poster_path: item.poster_path || '',
                backdrop_path: item.backdrop_path || ''
            };

            var favoriteItem = Lampa.Favorite.check(checkItem);
            var watched = !!favoriteItem && !!favoriteItem.history;
            var thrown = !!favoriteItem && favoriteItem.thrown;

            if (thrown) return false;
            if (!watched) return true;

            if (watched && mediaType === 'movie') {
                var hashes = [];
                if (item.id) hashes.push(Lampa.Utils.hash(String(item.id)));
                if (item.original_title) hashes.push(Lampa.Utils.hash(item.original_title));

                var hasProgress = false;
                for (var i = 0; i < hashes.length; i++) {
                    var view = Lampa.Storage.cache('file_view', 300, [])[hashes[i]];
                    if (view) {
                        hasProgress = true;
                        if (!view.percent || view.percent >= MIN_PROGRESS) return false;
                    }
                }
                return !hasProgress;
            }

            if (mediaType === 'tv') {
                var historyEpisodes = getEpisodesFromHistory(item.id, favorite);
                var timeTableEpisodes = getEpisodesFromTimeTable(item.id, timeTable);
                var releasedEpisodes = mergeEpisodes(historyEpisodes, timeTableEpisodes);
                return !allEpisodesWatched(item.original_title || item.original_name || item.title || item.name, releasedEpisodes);
            }
            return true;
        });
    }

    function getEpisodesFromHistory(id, favorite) { /* оригинальная функция */ 
        if (!favorite || !Array.isArray(favorite.card)) return [];
        var historyCard = favorite.card.filter(function (card) { return card.id === id && Array.isArray(card.seasons) && card.seasons.length > 0; })[0];
        if (!historyCard) return [];
        var realSeasons = historyCard.seasons.filter(function (season) { return season.season_number > 0 && season.episode_count > 0 && season.air_date && new Date(season.air_date) < new Date(); });
        if (realSeasons.length === 0) return [];
        var seasonEpisodes = [];
        for (var i = 0; i < realSeasons.length; i++) {
            var season = realSeasons[i];
            for (var e = 1; e <= season.episode_count; e++) {
                seasonEpisodes.push({ season_number: season.season_number, episode_number: e });
            }
        }
        return seasonEpisodes;
    }

    function getEpisodesFromTimeTable(id, timeTable) { /* оригинальная функция */ 
        if (!Array.isArray(timeTable)) return [];
        var serial = timeTable.find(function (item) { return item.id === id && Array.isArray(item.episodes); });
        return serial ? serial.episodes.filter(function (episode) { return episode.season_number > 0 && episode.air_date && new Date(episode.air_date) < new Date(); }) : [];
    }

    function mergeEpisodes(arr1, arr2) {
        var merged = arr1.concat(arr2);
        var unique = [];
        merged.forEach(function (episode) {
            if (!unique.some(function (e) { return e.season_number === episode.season_number && e.episode_number === episode.episode_number; })) {
                unique.push(episode);
            }
        });
        return unique;
    }

    function allEpisodesWatched(title, episodes) {
        if (!episodes || !episodes.length) return false;
        return episodes.every(function (episode) {
            var hash = Lampa.Utils.hash([episode.season_number, episode.season_number > 10 ? ':' : '', episode.episode_number, title].join(''));
            var view = Lampa.Timeline.view(hash);
            return view.percent > MIN_PROGRESS;
        });
    }

    // ==================== КАТЕГОРИИ ПЛАГИНА ====================
    var CATEGORIES = {
        top: { sheet: 'Топ 24ч', title: 'Топ торренты за последние 24 часа', type: 'movie' },
        foreign_movies: { sheet: 'Зарубежные фильмы', title: 'Зарубежные фильмы', type: 'movie' },
        russian_movies: { sheet: 'Наши фильмы', title: 'Наши фильмы', type: 'movie' },
        foreign_series: { sheet: 'Зарубежные сериалы', title: 'Зарубежные сериалы', type: 'tv' },
        russian_series: { sheet: 'Наши сериалы', title: 'Наши сериалы', type: 'tv' },
        tv: { sheet: 'Телевизор', title: 'Телевизор', type: 'tv' }
    };

    // ==================== ОСНОВНОЙ СЕРВИС API ====================
    function V10ApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // Получение TMDB-карточки по ID
        function fetchTMDBCard(id, type, onSuccess, onError) {
            var lang = Lampa.Storage.get('tmdb_lang', 'ru');
            var url = TMDB_BASE + '/' + type + '/' + id + '?api_key=' + TMDB_KEY + '&language=' + lang;
            self.network.silent(url, function (data) {
                if (!data || !data.id) return onError(new Error('Нет данных от TMDB'));
                var item = {
                    id: data.id,
                    poster_path: data.poster_path || '',
                    backdrop_path: data.backdrop_path || '',
                    overview: data.overview || '',
                    vote_average: data.vote_average || 0,
                    title: data.title || data.name || '',
                    original_title: data.original_title || data.original_name || '',
                    original_language: data.original_language || 'ru',
                    first_air_date: data.first_air_date || data.release_date || '',
                    number_of_seasons: data.number_of_seasons || 0,
                    type: type,
                    source: SOURCE_NAME
                };
                onSuccess(item);
            }, onError);
        }

        // Основная функция получения списка из Google Sheets + TMDB
        self.getList = function (sheetName, type, onComplete, onError) {
            var url = BASE_URL + '?sheet=' + encodeURIComponent(sheetName);
            self.network.silent(url, function (raw) {
                if (!raw) return onError(new Error('Пустой ответ от Google'));

                // Поддержка разных форматов ответа Google Apps Script
                var ids = [];
                if (Array.isArray(raw)) {
                    ids = raw.flat().filter(Boolean);
                } else if (raw.values && Array.isArray(raw.values)) {
                    // Классический формат Google Sheets API (values)
                    ids = raw.values.slice(1).map(function (row) {
                        return row[5] || row[0]; // колонка F = индекс 5 (0-based)
                    }).filter(Boolean);
                } else if (typeof raw === 'string') {
                    try { ids = JSON.parse(raw); if (!Array.isArray(ids)) ids = [ids]; } catch (e) {}
                }

                // Ограничиваем количество (чтобы не грузить сотни карточек)
                ids = ids.slice(0, 60);

                var results = [];
                var index = 0;

                function next() {
                    if (index >= ids.length) {
                        results = filterWatchedContent(results);
                        onComplete({
                            results: results,
                            page: 1,
                            total_pages: 1,
                            total_results: results.length
                        });
                        return;
                    }
                    fetchTMDBCard(ids[index], type, function (card) {
                        results.push(card);
                        index++;
                        next();
                    }, function () {
                        index++; // пропускаем ошибочные ID
                        next();
                    });
                }
                next();
            }, onError);
        };

        // Метод list (вызывается при открытии категории)
        self.list = function (params, onComplete, onError) {
            params = params || {};
            var key = params.url || 'top';
            var cat = CATEGORIES[key];
            if (!cat) return onComplete({ results: [], page: 1, total_pages: 1 });

            self.getList(cat.sheet, cat.type, function (data) {
                onComplete(data);
            }, onError);
        };

        // Полная карточка (используем стандартный TMDB)
        self.full = function (params, onSuccess, onError) {
            var card = params.card;
            params.method = !!(card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        // Главная страница категории (6 подборок)
        self.category = function (params, onSuccess, onError) {
            var partsData = [];

            Object.keys(CATEGORIES).forEach(function (key) {
                var cat = CATEGORIES[key];
                partsData.push(function (callback) {
                    self.getList(cat.sheet, cat.type, function (json) {
                        var result = {
                            url: key,
                            title: cat.title,
                            page: 1,
                            total_results: json.results.length,
                            total_pages: 1,
                            more: false,
                            results: json.results,
                            source: SOURCE_NAME
                        };
                        callback(result);
                    }, function (err) {
                        callback({ error: err });
                    });
                });
            });

            function loadPart(partLoaded, partEmpty) {
                Lampa.Api.partNext(partsData, 6, function (result) {
                    partLoaded(result);
                }, function (error) {
                    partEmpty(error);
                });
            }
            loadPart(onSuccess, onError);
            return loadPart;
        };

        // main — редирект на категорию
        self.main = function (params, onComplete, onError) {
            if (typeof onComplete === 'function') onComplete([]);
            try {
                var current = Lampa.Storage.get('source', 'tmdb');
                if (current !== SOURCE_NAME) return;
                setTimeout(function () {
                    Lampa.Activity.replace({
                        title: SOURCE_NAME,
                        component: 'category',
                        source: SOURCE_NAME,
                        page: 1,
                        url: ''
                    });
                }, 0);
            } catch (e) {}
        };
    }

    // ==================== ЗАПУСК ПЛАГИНА ====================
    function startPlugin() {
        if (window.v10_plugin) return;
        window.v10_plugin = true;

        var newName = Lampa.Storage.get('v10_settings', SOURCE_NAME);

        // Настройки
        Lampa.SettingsApi.addComponent({ component: 'v10_settings', name: SOURCE_NAME, icon: ICON });

        Lampa.SettingsApi.addParam({
            component: 'v10_settings',
            param: { name: 'v10_hide_watched', type: 'trigger', default: Lampa.Storage.get('v10_hide_watched', false) },
            field: { name: 'Скрыть просмотренное', description: 'Скрывать просмотренные фильмы и сериалы' },
            onChange: function (value) {
                Lampa.Storage.set('v10_hide_watched', value);
                var active = Lampa.Activity.active();
                if (active && active.activity_line && active.activity_line.listener) {
                    active.activity_line.listener.send({ type: 'append', data: active.activity_line.card_data, line: active.activity_line });
                } else {
                    location.reload();
                }
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'v10_settings',
            param: { name: 'v10_min_progress', type: 'select', values: { '50': '50%', '60': '60%', '70': '70%', '80': '80%', '90': '90%', '100': '100%' }, default: DEFAULT_MIN_PROGRESS.toString() },
            field: { name: 'Порог просмотра', description: 'Минимальный процент для скрытия' },
            onChange: function (value) {
                MIN_PROGRESS = parseInt(value);
                Lampa.Storage.set('v10_min_progress', MIN_PROGRESS);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'v10_settings',
            param: { name: 'v10_source_name', type: 'input', default: DEFAULT_SOURCE_NAME },
            field: { name: 'Название источника', description: 'Как отображается в меню' },
            onChange: function (value) {
                newName = value;
                $('.v10_text').text(value);
                Lampa.Settings.update();
            }
        });

        var v10Api = new V10ApiService();
        Lampa.Api.sources.v10 = v10Api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () { return v10Api; }
        });

        // Добавляем пункт в левое меню
        var menuItem = $('<li data-action="v10" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text v10_text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });

        // Авто-редирект если выбран как основной источник
        (function () {
            if (window.__v10_source_watch) return;
            window.__v10_source_watch = true;

            var origSet = Lampa.Storage.set;
            Lampa.Storage.set = function (key, value) {
                var res = origSet.apply(this, arguments);
                if (key === 'source' && value === SOURCE_NAME) {
                    setTimeout(function () {
                        Lampa.Activity.replace({
                            title: SOURCE_NAME,
                            component: 'category',
                            source: SOURCE_NAME,
                            page: 1,
                            url: ''
                        });
                    }, 100);
                }
                return res;
            };
        })();

        // Регистрация источника в списке
        try {
            var sources = Object.assign({}, Lampa.Params.values && Lampa.Params.values['source'] ? Lampa.Params.values['source'] : {});
            sources[SOURCE_NAME] = SOURCE_NAME;
            Lampa.Params.select('source', sources, 'tmdb');
        } catch (e) {}
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
