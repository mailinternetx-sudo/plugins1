(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'NUMParser';
    var SOURCE_NAME = Lampa.Storage.get('numparser_source_name', DEFAULT_SOURCE_NAME);
    var newName = SOURCE_NAME;
    var BASE_URL = 'https://num.jac-red.ru';
    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><g><path fill="currentColor" d="M482.909,67.2H29.091C13.05,67.2,0,80.25,0,96.291v319.418C0,431.75,13.05,444.8,29.091,444.8h453.818c16.041,0,29.091-13.05,29.091-29.091V96.291C512,80.25,498.95,67.2,482.909,67.2z M477.091,409.891H34.909V102.109h442.182V409.891z"/></g></g><g><g><rect fill="currentColor" x="126.836" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="350.255" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="367.709" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="367.709" y="292.364" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="292.364" width="126.836" height="34.909"/></g></g></svg>';
    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('numparser_min_progress', DEFAULT_MIN_PROGRESS);
    var newProgress = MIN_PROGRESS;

    // ========== НОВЫЕ НАСТРОЙКИ ==========
    var GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';
    var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    
    // Конфигурация новых категорий
    var CATEGORIES_CONFIG = {
        'top24': {
            title: 'Топ торренты за последние 24 часа',
            sheet: 'Топ 24ч',
            visible: Lampa.Storage.get('numparser_category_top24', true)
        },
        'foreign_movies': {
            title: 'Зарубежные фильмы',
            sheet: 'Зарубежные фильмы',
            visible: Lampa.Storage.get('numparser_category_foreign_movies', true)
        },
        'russian_movies': {
            title: 'Наши фильмы',
            sheet: 'Наши фильмы',
            visible: Lampa.Storage.get('numparser_category_russian_movies', true)
        },
        'foreign_series': {
            title: 'Зарубежные сериалы',
            sheet: 'Зарубежные сериалы',
            visible: Lampa.Storage.get('numparser_category_foreign_series', true)
        },
        'russian_series': {
            title: 'Наши сериалы',
            sheet: 'Наши сериалы',
            visible: Lampa.Storage.get('numparser_category_russian_series', true)
        },
        'tv': {
            title: 'Телевизор',
            sheet: 'Телевизор',
            visible: Lampa.Storage.get('numparser_category_tv', true)
        }
    };

    var CATEGORY_SETTINGS_ORDER = ['top24', 'foreign_movies', 'russian_movies', 'foreign_series', 'russian_series', 'tv'];
    var tmdbCache = {};
    var sheetsCache = {};

    // ========== ФИЛЬТРАЦИЯ ПРОСМОТРЕННОГО ==========
    function filterWatchedContent(results) {
        var hideWatched = Lampa.Storage.get('numparser_hide_watched', false);
        var hieroglyphRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
        var favorite_raw = Lampa.Storage.get('favorite', '{}');
        var favorite = favorite_raw;
        try {
            if (typeof favorite_raw === 'string') {
                favorite = JSON.parse(favorite_raw || '{}');
            }
        } catch (e) { favorite = {}; }
        if (!favorite || typeof favorite !== 'object') favorite = {};
        if (!Array.isArray(favorite.card)) favorite.card = [];
        var timeTable = Lampa.Storage.cache('timetable', 300, []);

        return results.filter(function (item) {
            if (!item) return true;
            var title = item.title || item.name || item.original_title || item.original_name || '';
            if (hieroglyphRegex.test(title)) return false;
            if (!hideWatched) return true;
            
            var mediaType = (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie';
            var checkItem = {
                id: item.id, media_type: mediaType,
                original_title: item.original_title || item.original_name || '',
                title: item.title || item.name || '',
                original_language: item.original_language || 'en',
                poster_path: item.poster_path || '', backdrop_path: item.backdrop_path || ''
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
                if (!hasProgress) return false;
                return true;
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

    function getEpisodesFromHistory(id, favorite) {
        if (!favorite || !Array.isArray(favorite.card)) return [];
        var historyCard = favorite.card.filter(function (card) {
            return card.id === id && Array.isArray(card.seasons) && card.seasons.length > 0;
        })[0];
        if (!historyCard) return [];
        var realSeasons = historyCard.seasons.filter(function (season) {
            return season.season_number > 0 && season.episode_count > 0 && season.air_date && new Date(season.air_date) < new Date();
        });
        if (realSeasons.length === 0) return [];
        var seasonEpisodes = [];
        for (var si = 0; si < realSeasons.length; si++) {
            var season = realSeasons[si];
            for (var ei = 1; ei <= season.episode_count; ei++) {
                seasonEpisodes.push({ season_number: season.season_number, episode_number: ei });
            }
        }
        return seasonEpisodes;
    }

    function getEpisodesFromTimeTable(id, timeTable) {
        if (!Array.isArray(timeTable)) return [];
        var serial = timeTable.find(function (item) { return item.id === id && Array.isArray(item.episodes); });
        return serial ? serial.episodes.filter(function (episode) {
            return episode.season_number > 0 && episode.air_date && new Date(episode.air_date) < new Date();
        }) : [];
    }

    function mergeEpisodes(arr1, arr2) {
        var merged = arr1.concat(arr2), unique = [];
        merged.forEach(function (episode) {
            if (!unique.some(function (e) {
                return e.season_number === episode.season_number && e.episode_number === episode.episode_number;
            })) unique.push(episode);
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

    // ========== ЗАПРОСЫ К TMDB ==========
    function fetchTMDBData(id, mediaType, callback) {
        if (tmdbCache[id]) { callback(tmdbCache[id]); return; }
        var tmdbKey = Lampa.Storage.get('tmdb_key', '');
        var lang = Lampa.Storage.get('tmdb_lang', 'ru');
        var url = TMDB_BASE_URL + '/' + mediaType + '/' + id + '?api_key=' + tmdbKey + '&language=' + lang;
        var request = new Lampa.Reguest();
        request.silent(url, function(json) {
            if (json && json.id) { tmdbCache[id] = json; callback(json); }
            else callback(null);
        }, function() { callback(null); });
    }

    function fetchTMDBDataBatch(ids, mediaType, onComplete) {
        var results = [], completed = 0, total = ids.length;
        if (total === 0) { onComplete([]); return; }
        ids.forEach(function(id) {
            fetchTMDBData(id, mediaType, function(data) {
                if (data) results.push(data);
                if (++completed === total) onComplete(results);
            });
        });
    }

    // ========== ЗАПРОС К GOOGLE SHEETS ==========
    function fetchSheetIDs(sheetName, callback) {
        var cacheKey = sheetName;
        if (sheetsCache[cacheKey] && sheetsCache[cacheKey].timestamp > Date.now() - 300000) {
            callback(sheetsCache[cacheKey].data); return;
        }
        var url = GOOGLE_SHEETS_URL + '?sheet=' + encodeURIComponent(sheetName);
        var request = new Lampa.Reguest();
        request.silent(url, function(json) {
            if (json && Array.isArray(json.data)) {
                var ids = [];
                // Column F = index 5, start from row 2 = index 1
                for (var i = 1; i < json.data.length; i++) {
                    var row = json.data[i];
                    if (row && row[5] && !isNaN(parseInt(row[5]))) {
                        ids.push(parseInt(row[5]));
                    }
                }
                sheetsCache[cacheKey] = { data: ids, timestamp: Date.now() };
                callback(ids);
            } else callback([]);
        }, function() { callback([]); });
    }

    // ========== ОСНОВНОЙ СЕРВИС ==========
    function NumparserApiService() {
        var self = this;
        self.network = new Lampa.Reguest();
        self.discovery = false;

        function normalizeData(json) {
            function toHttps(v) {
                if (!v || typeof v !== 'string') return '';
                if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
                if (/^\/\//.test(v)) return 'https:' + v;
                return '';
            }
            function toTmdbPath(v) {
                if (!v || typeof v !== 'string') return '';
                if (/^https?:\/\//i.test(v)) {
                    var u = v.replace(/^http:\/\//i, 'https://');
                    var m = u.match(/^https?:\/\/(?:image\.tmdb\.org|www\.themoviedb\.org)\/(t\/p\/[^?#]+)/i);
                    return m && m[1] ? '/' + m[1] : '';
                }
                if (v.charAt(0) === '/') return v;
                return '';
            }
            var normalized = {
                results: (json.results || []).map(function (item) {
                    var np_poster_path = toTmdbPath(item.poster_path) || toTmdbPath(item.poster) || toTmdbPath(item.img);
                    var np_poster_url = toHttps(item.poster_path) || toHttps(item.poster) || toHttps(item.img);
                    var np_backdrop_path = toTmdbPath(item.backdrop_path) || toTmdbPath(item.backdrop) || toTmdbPath(item.background_image);
                    var np_backdrop_url = toHttps(item.backdrop_path) || toHttps(item.backdrop) || toHttps(item.background_image);
                    var dataItem = {
                        id: item.id,
                        poster_path: np_poster_path || '',
                        img: np_poster_url || item.img,
                        overview: item.overview || item.description || '',
                        vote_average: item.vote_average || 0,
                        backdrop_path: np_backdrop_path || '',
                        background_image: np_backdrop_url || item.background_image,
                        source: Lampa.Storage.get('numparser_source_name') || SOURCE_NAME,
                        type: (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie',
                        original_title: item.original_title || item.original_name || '',
                        title: item.title || item.name || '',
                        original_language: item.original_language || 'en',
                        first_air_date: item.first_air_date,
                        number_of_seasons: item.number_of_seasons,
                        status: item.status || ''
                    };
                    if (item.release_quality) dataItem.release_quality = item.release_quality;
                    if (item.release_date) dataItem.release_date = item.release_date;
                    if (item.last_air_date) dataItem.last_air_date = item.last_air_date;
                    if (item.last_episode_to_air) dataItem.last_episode_to_air = item.last_episode_to_air;
                    dataItem.promo_title = dataItem.title || dataItem.name || dataItem.original_title || dataItem.original_name;
                    dataItem.promo = dataItem.overview;
                    return dataItem;
                }),
                page: json.page || 1,
                total_pages: json.total_pages || json.pagesCount || 1,
                total_results: json.total_results || json.total || 0
            };
            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        self.get = function (url, params, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json) { onError(new Error('Empty response')); return; }
                onComplete(normalizeData(json));
            }, onError);
        };

        self.list = function (params, onComplete, onError) {
            params = params || {};
            onComplete = onComplete || function(){};
            onError = onError || function(){};
            var categoryKey = params.url;
            var page = params.page || 1;
            var config = CATEGORIES_CONFIG[categoryKey];
            
            if (!config) { onComplete({ results: [], page: page, total_pages: 1, total_results: 0 }); return; }

            fetchSheetIDs(config.sheet, function(ids) {
                var mediaType = (categoryKey.indexOf('series') !== -1 || categoryKey === 'tv') ? 'tv' : 'movie';
                var pageSize = 20;
                var totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
                var startIndex = (page - 1) * pageSize;
                var pageIds = ids.slice(startIndex, startIndex + pageSize);
                
                if (pageIds.length === 0) {
                    onComplete({ results: [], page: page, total_pages: totalPages, total_results: ids.length });
                    return;
                }
                
                fetchTMDBDataBatch(pageIds, mediaType, function(results) {
                    var filtered = filterWatchedContent(results);
                    onComplete({
                        results: filtered,
                        page: page,
                        total_pages: totalPages,
                        total_results: ids.length
                    });
                });
            });
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card;
            params.method = !!(card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.category = function (params, onSuccess, onError) {
            params = params || {};
            var partsData = [];

            CATEGORY_SETTINGS_ORDER.forEach(function(key) {
                var config = CATEGORIES_CONFIG[key];
                if (config && config.visible) {
                    partsData.push(function (callback) {
                        makeRequest(key, config.title, callback);
                    });
                }
            });

            function makeRequest(categoryKey, title, callback) {
                var page = params.page || 1;
                var config = CATEGORIES_CONFIG[categoryKey];
                if (!config) { callback({error: new Error('Invalid category')}); return; }

                fetchSheetIDs(config.sheet, function(ids) {
                    var mediaType = (categoryKey.indexOf('series') !== -1 || categoryKey === 'tv') ? 'tv' : 'movie';
                    var pageSize = 20;
                    var totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
                    var startIndex = (page - 1) * pageSize;
                    var pageIds = ids.slice(startIndex, startIndex + pageSize);
                    
                    if (pageIds.length === 0) {
                        callback({
                            url: categoryKey, title: title, page: page,
                            total_results: ids.length, total_pages: totalPages,
                            more: false, results: [], source: SOURCE_NAME
                        });
                        return;
                    }
                    
                    fetchTMDBDataBatch(pageIds, mediaType, function(results) {
                        var filtered = filterWatchedContent(results);
                        callback({
                            url: categoryKey, title: title, page: page,
                            total_results: ids.length, total_pages: totalPages,
                            more: totalPages > page, results: filtered, source: SOURCE_NAME
                        });
                    }, function(error) { callback({error: error}); });
                });
            }

            function loadPart(partLoaded, partEmpty) {
                Lampa.Api.partNext(partsData, 5, function(result) { partLoaded(result); }, function(error) { partEmpty(error); });
            }
            loadPart(onSuccess, onError);
            return loadPart;
        };

        // Авто-дозагрузка для линии
        Lampa.Listener.follow('line', async function (event) {
            if (event.type !== 'append') return;
            var data = event.data;
            if (!data || !Array.isArray(data.results)) return;
            var desiredCount = 20;
            var allResults = filterWatchedContent(data.results).filter(function (item) {
                return item && item.id && (item.title || item.name || item.original_title || item.original_name);
            });
            var page = data.page || 1;
            var totalPages = data.total_pages || 1;
            var source = data.source;
            var url = data.url;

            while (allResults.length < desiredCount && page < totalPages) {
                page++;
                await new Promise(function (resolve) {
                    self.list({url: url, page: page, source: source}, function (response) {
                        if (response && Array.isArray(response.results)) {
                            var filtered = filterWatchedContent(response.results).filter(function (item) {
                                return item && item.id && (item.title || item.name || item.original_title || item.original_name);
                            });
                            allResults = allResults.concat(filtered);
                        }
                        resolve();
                    });
                });
            }
            allResults = allResults.slice(0, desiredCount);
            data.results = allResults;
            data.page = page;
            data.more = page < totalPages && allResults.length === desiredCount;
            if (event.line && event.line.update) event.line.update();
        });
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    function numparser_img(src, size) {
        if (!src || typeof src !== 'string') return '';
        if (/^https?:\/\//i.test(src)) return src.replace(/^http:\/\//i, 'https://');
        if (/^\/\//.test(src)) return 'https:' + src;
        return Lampa.Api.img(src, size);
    }

    function setImg(node, url, size) {
        if (!node) return;
        url = url ? numparser_img(url, size) : '/img/img_broken.svg';
        node.onerror = function () { node.src = '/img/img_broken.svg'; };
        node.src = url;
    }

    function FullEpisodeCard(episode, raw, title, year) {
        var self = this;
        self.build = function () {
            self.card = el('div', 'card full-episode selector');
            var top = el('div', 'full-episode__top');
            var imgWrap = el('div', 'full-episode__img'), img = el('img', '');
            imgWrap.appendChild(img);
            var info = el('div', 'full-episode__info');
            var num = el('div', 'full-episode__num');
            var name = el('div', 'full-episode__name');
            var date = el('div', 'full-episode__date');
            var s = episode.season_number || episode.season || '?';
            var e = episode.episode_number || episode.episode || '?';
            num.textContent = (e !== '?' ? e : '');
            name.textContent = episode.name || ('s' + s + 'e' + e);
            try { date.textContent = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : ''; }
            catch (e2) { date.textContent = episode.air_date || ''; }
            info.appendChild(num); info.appendChild(name); info.appendChild(date);
            top.appendChild(imgWrap); top.appendChild(info);
            var bottom = el('div', 'full-episode__bottom');
            var poster = el('img', 'full-episode__poster');
            var meta = el('div', 'full-episode__meta');
            var t = el('div', 'full-episode__title');
            var y = el('div', 'full-episode__year');
            t.textContent = title; y.textContent = year !== '0000' ? year : '';
            meta.appendChild(t); meta.appendChild(y);
            bottom.appendChild(poster); bottom.appendChild(meta);
            self.card.appendChild(top); self.card.appendChild(bottom);
            self.img_episode = img; self.img_poster = poster;
        };
        self.visible = function () {
            var still = episode.still_path || '';
            var back = raw.backdrop_path || '';
            var poster = raw.poster_path || raw.img || '';
            setImg(self.img_episode, still || back || poster, 'w500');
            setImg(self.img_poster, raw.poster_path || raw.img || '', 'w300');
            if (self.onVisible) self.onVisible(self.card, raw);
        };
        self.create = function () {
            self.build(); self.visible();
            self.card.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.card, raw); });
            self.card.addEventListener('hover:hover', function () { if (self.onHover) self.onHover(self.card, raw); });
            self.card.addEventListener('hover:enter', function () { if (self.onEnter) self.onEnter(self.card, raw); });
        };
        self.destroy = function () {
            if (self.img_poster) self.img_poster.src = '';
            if (self.img_episode) self.img_episode.src = '';
            if (self.card) self.card.remove(); self.card = null;
        };
        self.render = function (js) { return js ? self.card : $(self.card); };
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ==========
    function startPlugin() {
        if (window.numparser_plugin) return;
        window.numparser_plugin = true;

        newName = Lampa.Storage.get('numparser_settings', SOURCE_NAME);
        if (Lampa.Storage.field('start_page') === SOURCE_NAME) {
            window.start_deep_link = { component: 'category', page: 1, url: '', source: SOURCE_NAME, title: SOURCE_NAME };
        }
        var values = Lampa.Params.values.start_page;
        values[SOURCE_NAME] = SOURCE_NAME;

        Lampa.SettingsApi.addComponent({ component: 'numparser_settings', name: SOURCE_NAME, icon: ICON });

        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: { name: 'numparser_hide_watched', type: 'trigger', default: Lampa.Storage.get('numparser_hide_watched', "false") === "true" },
            field: { name: 'Скрыть просмотренные', description: 'Скрывать просмотренные фильмы и сериалы' },
            onChange: function (value) {
                Lampa.Storage.set('numparser_hide_watched', value === true || value === "true");
                var active = Lampa.Activity.active();
                if (active && active.activity_line && active.activity_line.listener && typeof active.activity_line.listener.send === 'function') {
                    active.activity_line.listener.send({ type: 'append', data: active.activity_line.card_data, line: active.activity_line });
                } else location.reload();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: {
                name: 'numparser_min_progress', type: 'select',
                values: { '50':'50%','55':'55%','60':'60%','65':'65%','70':'70%','75':'75%','80':'80%','85':'85%','90':'90%','95':'95%','100':'100%' },
                default: DEFAULT_MIN_PROGRESS.toString()
            },
            field: { name: 'Порог просмотра', description: 'Минимальный процент просмотра для скрытия контента' },
            onChange: function (value) {
                newProgress = parseInt(value);
                Lampa.Storage.set('numparser_min_progress', newProgress);
                MIN_PROGRESS = newProgress;
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: { name: 'numparser_source_name', type: 'input', placeholder: 'Введите название', values: '', default: DEFAULT_SOURCE_NAME },
            field: { name: 'Название источника', description: 'Изменение названия источника в меню' },
            onChange: function (value) { newName = value; $('.num_text').text(value); Lampa.Settings.update(); }
        });

        // Настройки видимости категорий
        CATEGORY_SETTINGS_ORDER.forEach(function (option) {
            var config = CATEGORIES_CONFIG[option];
            if (!config) return;
            var settingName = 'numparser_category_' + option;
            var visible = Lampa.Storage.get(settingName, "true").toString() === "true";
            config.visible = visible;
            Lampa.SettingsApi.addParam({
                component: "numparser_settings",
                param: { name: settingName, type: "trigger", default: visible },
                field: { name: config.title },
                onChange: function (value) { CATEGORIES_CONFIG[option].visible = (value === true || value === "true"); }
            });
        });

        var numparserApi = new NumparserApiService();
        Lampa.Api.sources.numparser = numparserApi;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () { return numparserApi; }
        });

        // main() - редирект при выборе NUMParser основным источником
        numparserApi.main = function (params, onComplete, onError) {
            if (typeof onComplete === 'function') onComplete([]);
            try { if (Lampa.Storage.get('source', 'tmdb') !== SOURCE_NAME) return; } catch (e) { return; }
            setTimeout(function () {
                try {
                    Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' });
                } catch (e) {}
            }, 0);
        };

        // Сохраняем TMDB для фильмов/сериалов даже при выбранном NUMParser
        (function () {
            if (window.__numparser_keep_movies_tv_tmdb) return;
            window.__numparser_keep_movies_tv_tmdb = true;
            var origPush = Lampa.Activity.push, origReplace = Lampa.Activity.replace;
            function patch(params) {
                if (!params) return params;
                if (Lampa.Storage.get('source', 'tmdb') !== SOURCE_NAME) return params;
                if (params.component === 'category' && (params.url === 'movie' || params.url === 'tv')) {
                    params.source = 'tmdb';
                }
                return params;
            }
            Lampa.Activity.push = function (params) { return origPush.call(this, patch(params)); };
            Lampa.Activity.replace = function (params) { return origReplace.call(this, patch(params)); };
        })();

        // Регистрация источника
        try {
            var sources = Object.assign({}, (Lampa.Params.values && Lampa.Params.values['source']) ? Lampa.Params.values['source'] : {});
            sources[SOURCE_NAME] = SOURCE_NAME;
            Lampa.Params.select('source', sources, 'tmdb');
        } catch (e) {}

        // Пункт меню
        var menuItem = $('<li data-action="numparser" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text num_text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        // Авто-обновление при смене source
        (function () {
            if (window.__numparser_source_watch) return;
            window.__numparser_source_watch = true;
            function isNumSelected() { return Lampa.Storage.get('source', 'tmdb') === SOURCE_NAME; }
            function updateNumMenuVisibility() {
                try { if (isNumSelected()) menuItem.hide(); else menuItem.show(); } catch (e) {}
            }
            updateNumMenuVisibility();
            var origSet = Lampa.Storage.set;
            Lampa.Storage.set = function (key, value) {
                var res = origSet.apply(this, arguments);
                if (key === 'source') {
                    updateNumMenuVisibility();
                    try {
                        var active = Lampa.Activity.active && Lampa.Activity.active();
                        if (active && active.component === 'main') {
                            if (value === SOURCE_NAME) {
                                Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' });
                            } else {
                                Lampa.Activity.replace({ component: 'main' });
                            }
                        }
                    } catch (e) {}
                }
                return res;
            };
        })();

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1 });
        });
    }

    if (window.appready) { startPlugin(); }
    else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
