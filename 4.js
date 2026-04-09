(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'NUMParser';
    var SOURCE_NAME = Lampa.Storage.get('numparser_source_name', DEFAULT_SOURCE_NAME);
    var newName = SOURCE_NAME;
    
    // === КОНФИГУРАЦИЯ GOOGLE SHEETS ===
    var GOOGLE_SHEETS_DEPLOY_ID = 'AKfycbyEPt_OA6zROZ4heZBBcSerNh7B0TAAT53By01ulkbN77s06Q3-7Barz2U6yZ5z_527';
    var GOOGLE_SHEETS_BASE_URL = 'https://script.google.com/macros/s/' + GOOGLE_SHEETS_DEPLOY_ID + '/exec';
    
    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><g><path fill="currentColor" d="M482.909,67.2H29.091C13.05,67.2,0,80.25,0,96.291v319.418C0,431.75,13.05,444.8,29.091,444.8h453.818c16.041,0,29.091-13.05,29.091-29.091V96.291C512,80.25,498.95,67.2,482.909,67.2z M477.091,409.891H34.909V102.109h442.182V409.891z"/></g></g><g><g><rect fill="currentColor" x="126.836" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="350.255" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="367.709" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="367.709" y="292.364" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="292.364" width="126.836" height="34.909"/></g></g></svg>';
    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('numparser_min_progress', DEFAULT_MIN_PROGRESS);
    var newProgress = MIN_PROGRESS;

    // === НОВЫЕ КАТЕГОРИИ ===
    var CATEGORY_VISIBILITY = {
        top_24h: {
            title: 'Топ торренты за последние 24 часа',
            visible: Lampa.Storage.get('numparser_category_top_24h', true),
            sheet: 'Топ 24ч'
        },
        foreign_movies: {
            title: 'Зарубежные фильмы',
            visible: Lampa.Storage.get('numparser_category_foreign_movies', true),
            sheet: 'Зарубежные фильмы'
        },
        russian_movies: {
            title: 'Наши фильмы',
            visible: Lampa.Storage.get('numparser_category_russian_movies', true),
            sheet: 'Наши фильмы'
        },
        foreign_series: {
            title: 'Зарубежные сериалы',
            visible: Lampa.Storage.get('numparser_category_foreign_series', true),
            sheet: 'Зарубежные сериалы'
        },
        russian_series: {
            title: 'Наши сериалы',
            visible: Lampa.Storage.get('numparser_category_russian_series', true),
            sheet: 'Наши сериалы'
        },
        tv: {
            title: 'Телевизор',
            visible: Lampa.Storage.get('numparser_category_tv', true),
            sheet: 'Телевизор'
        }
    };

    var CATEGORY_SETTINGS_ORDER = [
        'top_24h',
        'foreign_movies',
        'russian_movies',
        'foreign_series',
        'russian_series',
        'tv'
    ];

    var CATEGORIES = {
        top_24h: 'top_24h',
        foreign_movies: 'foreign_movies',
        russian_movies: 'russian_movies',
        foreign_series: 'foreign_series',
        russian_series: 'russian_series',
        tv: 'tv'
    };

    // === ПАРСЕР НАЗВАНИЯ И ГОДА ===
    function parseTitleYear(str) {
        var match = String(str).match(/^(.+?)\s*\((\d{4})\)\s*$/);
        return match ? { title: match[1].trim(), year: match[2] } : { title: String(str).trim(), year: null };
    }

    // === ПОИСК В TMDB ПО НАЗВАНИЮ И ГОДУ ===
    function searchTMDB(title, year) {
        return new Promise(function(resolve) {
            var apiKey = Lampa.Storage.get('tmdb_api_key', '');
            if (!apiKey) { resolve(null); return; }
            
            var url = 'https://api.themoviedb.org/3/search/multi?api_key=' + apiKey + 
                      '&query=' + encodeURIComponent(title) + 
                      '&language=ru&include_adult=false';
            if (year) url += '&year=' + year;

            var req = new Lampa.Reguest();
            req.silent(url, {}, function(json) {
                if (json && json.results && json.results.length > 0) {
                    var item = json.results[0];
                    resolve({
                        id: item.id,
                        title: item.title || item.name || title,
                        original_title: item.original_title || item.original_name || '',
                        poster_path: item.poster_path || '',
                        backdrop_path: item.backdrop_path || '',
                        overview: item.overview || '',
                        vote_average: item.vote_average || 0,
                        release_date: item.release_date || item.first_air_date || '',
                        first_air_date: item.first_air_date || item.release_date || '',
                        number_of_seasons: item.number_of_seasons || 0,
                        media_type: item.media_type || (item.first_air_date || item.number_of_seasons ? 'tv' : 'movie'),
                        source: SOURCE_NAME
                    });
                } else {
                    resolve(null);
                }
            }, function() { resolve(null); });
        });
    }

    // === ОБРАБОТКА СТРОК ИЗ GOOGLE SHEETS ===
    async function processSheetRows(rawRows) {
        if (!Array.isArray(rawRows)) return [];
        var results = [];
        
        for (var i = 0; i < rawRows.length; i++) {
            var cell = rawRows[i];
            if (!cell || typeof cell !== 'string' || cell.trim() === '') continue;
            
            var parsed = parseTitleYear(cell);
            var tmdbItem = await searchTMDB(parsed.title, parsed.year);
            
            if (tmdbItem) {
                tmdbItem.promo_title = tmdbItem.title;
                tmdbItem.promo = tmdbItem.overview || '';
                results.push(tmdbItem);
            }
            // Небольшая задержка, чтобы не превышать лимиты TMDB API (40 запросов/10с)
            await new Promise(r => setTimeout(r, 150));
        }
        return results;
    }

    // === ФИЛЬТРАЦИЯ ПРОСМОТРЕННОГО КОНТЕНТА (без изменений) ===
    function filterWatchedContent(results) {
        var hideWatched = Lampa.Storage.get('numparser_hide_watched', false);
        var hieroglyphRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
        var favorite_raw = Lampa.Storage.get('favorite', '{}');
        var favorite = favorite_raw;
        try {
            if (typeof favorite_raw === 'string') { favorite = JSON.parse(favorite_raw || '{}'); }
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
        for (var i = 0; i < realSeasons.length; i++) {
            var s = realSeasons[i];
            for (var e = 1; e <= s.episode_count; e++) seasonEpisodes.push({ season_number: s.season_number, episode_number: e });
        }
        return seasonEpisodes;
    }

    function getEpisodesFromTimeTable(id, timeTable) {
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
                        poster_path: toTmdbPath(item.poster_path) || toTmdbPath(item.poster) || '',
                        img: toHttps(item.poster_path) || toHttps(item.poster) || '',
                        overview: item.overview || item.description || '',
                        vote_average: item.vote_average || 0,
                        backdrop_path: toTmdbPath(item.backdrop_path) || toTmdbPath(item.backdrop) || '',
                        background_image: toHttps(item.backdrop_path) || toHttps(item.backdrop) || '',
                        source: SOURCE_NAME,
                        type: (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie',
                        original_title: item.original_title || item.original_name || '',
                        title: item.title || item.name || '',
                        original_language: item.original_language || 'en',
                        first_air_date: item.first_air_date,
                        number_of_seasons: item.number_of_seasons,
                        status: item.status || '',
                        promo_title: item.title || item.name || '',
                        promo: item.overview || ''
                    };
                }),
                page: json.page || 1,
                total_pages: json.total_pages || json.pagesCount || 1,
                total_results: json.total_results || json.total || 0
            };
            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        self.list = function (params, onComplete, onError) {
            params = params || {};
            var categoryKey = params.url;
            var catConfig = CATEGORY_VISIBILITY[categoryKey];
            if (!catConfig || !catConfig.sheet) { onError(new Error('Category not found')); return; }

            var url = GOOGLE_SHEETS_BASE_URL + '?sheet=' + encodeURIComponent(catConfig.sheet);
            self.network.silent(url, {}, async function (response) {
                try {
                    var rawRows = (response && response.data) ? response.data : [];
                    var tmdbResults = await processSheetRows(rawRows);
                    onComplete(normalizeData({ results: tmdbResults, page: 1, total_pages: 1, total_results: tmdbResults.length }));
                } catch (e) { onError(e); }
            }, onError);
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card;
            params.method = !!(card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.category = function (params, onSuccess, onError) {
            params = params || {};
            var partsData = [];

            CATEGORY_SETTINGS_ORDER.forEach(function (key) {
                var cat = CATEGORY_VISIBILITY[key];
                if (cat && cat.visible) {
                    partsData.push(function (callback) {
                        var url = GOOGLE_SHEETS_BASE_URL + '?sheet=' + encodeURIComponent(cat.sheet);
                        self.network.silent(url, {}, async function (response) {
                            try {
                                var rawRows = (response && response.data) ? response.data : [];
                                var tmdbResults = await processSheetRows(rawRows);
                                var filtered = filterWatchedContent(tmdbResults);
                                callback({
                                    url: key, title: cat.title, page: 1,
                                    total_results: filtered.length, total_pages: 1, more: false,
                                    results: filtered, source: SOURCE_NAME,
                                    _original_total_results: tmdbResults.length,
                                    _original_total_pages: 1,
                                    _original_results: tmdbResults
                                });
                            } catch (e) { callback({ error: e }); }
                        }, function () { callback({ error: new Error('Network error') }); });
                    });
                }
            });

            function loadPart(partLoaded, partEmpty) {
                Lampa.Api.partNext(partsData, 5, partLoaded, partEmpty);
            }
            loadPart(onSuccess, onError);
            return loadPart;
        };

        // Дозагрузка карточек при скролле (без изменений)
        Lampa.Listener.follow('line', async function (event) {
            if (event.type !== 'append') return;
            var data = event.data;
            if (!data || !Array.isArray(data.results)) return;
            var desiredCount = 20;
            var allResults = filterWatchedContent(data.results).filter(function (item) {
                return item && item.id && (item.title || item.name || item.original_title || item.original_name);
            });
            var page = data.page || 1;
            var totalPages = data._original_total_pages || data.total_pages || 1;
            var source = data.source;
            var url = data.url;

            while (allResults.length < desiredCount && page < totalPages) {
                page++;
                var params = { url: url, page: page, source: source };
                await new Promise(function (resolve) {
                    Lampa.Api.sources[source].list(params, function (response) {
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
            data.results = allResults; data.page = page;
            data.more = page < totalPages && allResults.length === desiredCount;
            if (event.line && event.line.update) event.line.update();
        });
    }

    // === UI ХЕЛПЕРЫ (без изменений) ===
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
            var imgWrap = el('div', 'full-episode__img');
            var img = el('img', ''); imgWrap.appendChild(img);
            var info = el('div', 'full-episode__info');
            var num = el('div', 'full-episode__num'); var name = el('div', 'full-episode__name'); var date = el('div', 'full-episode__date');
            var s = episode.season_number || episode.season || '?'; var e = episode.episode_number || episode.episode || '?';
            num.textContent = (e !== '?' ? e : ''); name.textContent = episode.name || ('s' + s + 'e' + e);
            try { date.textContent = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : ''; } catch (e2) { date.textContent = episode.air_date || ''; }
            info.appendChild(num); info.appendChild(name); info.appendChild(date);
            top.appendChild(imgWrap); top.appendChild(info);
            var bottom = el('div', 'full-episode__bottom');
            var poster = el('img', 'full-episode__poster'); var meta = el('div', 'full-episode__meta');
            var t = el('div', 'full-episode__title'); var y = el('div', 'full-episode__year');
            t.textContent = title; y.textContent = year !== '0000' ? year : '';
            meta.appendChild(t); meta.appendChild(y); bottom.appendChild(poster); bottom.appendChild(meta);
            self.card.appendChild(top); self.card.appendChild(bottom);
            self.img_episode = img; self.img_poster = poster;
        };
        self.visible = function () {
            setImg(self.img_episode, episode.still_path || raw.backdrop_path || raw.poster_path || raw.img || '', 'w500');
            setImg(self.img_poster, raw.poster_path || raw.img || '', 'w300');
            if (self.onVisible) self.onVisible(self.card, raw);
        };
        self.create = function () { self.build(); self.visible(); self.card.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.card, raw); }); self.card.addEventListener('hover:hover', function () { if (self.onHover) self.onHover(self.card, raw); }); self.card.addEventListener('hover:enter', function () { if (self.onEnter) self.onEnter(self.card, raw); }); };
        self.destroy = function () { if (self.img_poster) self.img_poster.src = ''; if (self.img_episode) self.img_episode.src = ''; if (self.card) self.card.remove(); self.card = null; };
        self.render = function (js) { return js ? self.card : $(self.card); };
    }

    // === ЗАПУСК ПЛАГИНА (без изменений логики, адаптирован под новые категории) ===
    function startPlugin() {
        if (window.numparser_plugin) return;
        window.numparser_plugin = true;

        newName = Lampa.Storage.get('numparser_settings', SOURCE_NAME);
        if (Lampa.Storage.field('start_page') === SOURCE_NAME) {
            window.start_deep_link = { component: 'category', page: 1, url: '', source: SOURCE_NAME, title: SOURCE_NAME };
        }
        var values = Lampa.Params.values.start_page; values[SOURCE_NAME] = SOURCE_NAME;

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
                } else { location.reload(); }
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: { name: 'numparser_min_progress', type: 'select', values: { '50': '50%', '55': '55%', '60': '60%', '65': '65%', '70': '70%', '75': '75%', '80': '80%', '85': '85%', '90': '90%', '95': '95%', '100': '100%' }, default: DEFAULT_MIN_PROGRESS.toString() },
            field: { name: 'Порог просмотра', description: 'Минимальный процент просмотра для скрытия контента' },
            onChange: function (value) { newProgress = parseInt(value); Lampa.Storage.set('numparser_min_progress', newProgress); MIN_PROGRESS = newProgress; }
        });

        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: { name: 'numparser_source_name', type: 'input', placeholder: 'Введите название', values: '', default: DEFAULT_SOURCE_NAME },
            field: { name: 'Название источника', description: 'Изменение названия источника в меню' },
            onChange: function (value) { newName = value; $('.num_text').text(value); Lampa.Settings.update(); }
        });

        // Настройки видимости новых категорий
        CATEGORY_SETTINGS_ORDER.forEach(function (option) {
            if (!CATEGORY_VISIBILITY[option]) return;
            var settingName = 'numparser_category_' + option + '_visible';
            var visible = Lampa.Storage.get(settingName, "true").toString() === "true";
            CATEGORY_VISIBILITY[option].visible = visible;
            Lampa.SettingsApi.addParam({
                component: "numparser_settings",
                param: { name: settingName, type: "trigger", default: visible },
                field: { name: CATEGORY_VISIBILITY[option].title },
                onChange: function (value) { CATEGORY_VISIBILITY[option].visible = (value === true || value === "true"); }
            });
        });

        var numparserApi = new NumparserApiService();
        Lampa.Api.sources.numparser = numparserApi;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: function () { return numparserApi; } });

        numparserApi.main = function (params, onComplete, onError) {
            if (typeof onComplete === 'function') onComplete([]);
            try { if (Lampa.Storage.get('source', 'tmdb') !== SOURCE_NAME) return; } catch (e) { return; }
            setTimeout(function () {
                try { Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' }); } catch (e) {}
            }, 0);
        };

        (function () {
            if (window.__numparser_keep_movies_tv_tmdb) return;
            window.__numparser_keep_movies_tv_tmdb = true;
            var origPush = Lampa.Activity.push; var origReplace = Lampa.Activity.replace;
            function patch(params) {
                if (!params) return params;
                if (Lampa.Storage.get('source', 'tmdb') === SOURCE_NAME && params.component === 'category' && (params.url === 'movie' || params.url === 'tv')) params.source = 'tmdb';
                return params;
            }
            Lampa.Activity.push = function (params) { return origPush.call(this, patch(params)); };
            Lampa.Activity.replace = function (params) { return origReplace.call(this, patch(params)); };
        })();

        try {
            var sources = Object.assign({}, (Lampa.Params.values && Lampa.Params.values['source']) ? Lampa.Params.values['source'] : {});
            sources[SOURCE_NAME] = SOURCE_NAME;
            Lampa.Params.select('source', sources, 'tmdb');
        } catch (e) {}

        var menuItem = $('<li data-action="numparser" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text num_text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        (function () {
            if (window.__numparser_source_watch) return; window.__numparser_source_watch = true;
            function isNumSelected() { return Lampa.Storage.get('source', 'tmdb') === SOURCE_NAME; }
            function updateNumMenuVisibility() { try { isNumSelected() ? menuItem.hide() : menuItem.show(); } catch (e) {} }
            updateNumMenuVisibility();
            var origSet = Lampa.Storage.set;
            Lampa.Storage.set = function (key, value) {
                var res = origSet.apply(this, arguments);
                if (key === 'source') {
                    updateNumMenuVisibility();
                    try {
                        var active = Lampa.Activity.active && Lampa.Activity.active();
                        if (active && active.component === 'main') {
                            if (value === SOURCE_NAME) Lampa.Activity.replace({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, page: 1, url: '' });
                            else Lampa.Activity.replace({ component: 'main' });
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
    else { Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') startPlugin(); }); }
})();
