(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'RUTOR';
    var SOURCE_NAME = DEFAULT_SOURCE_NAME;
    var SHEETS_API = 'https://script.google.com/macros/s/AKfycbzkG8EzY7yw2DFwK2tPcKfc5YS1opFKBRcjI6BX6SGmYOwB0NmFHDCkmRNy6kGbErAY/exec';
    var MAX_ITEMS = 12;           // было 15
    var TMDB_CACHE_TIME = 60 * 60 * 24 * 3; // 3 дня
    var MAX_CONCURRENT = 6;       // ограничение параллельных запросов

    var ICON = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <circle cx="256" cy="256" r="200" fill="#ff4d4d"/>
        <text x="256" y="285" font-family="Arial" font-size="180" font-weight="bold" text-anchor="middle" fill="#fff">R</text>
    </svg>`;

    var RUTOR_CATEGORIES = [
        { title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч',      type: 'mixed' },
        { title: 'Зарубежные фильмы',               sheet: 'Зарубежные фильмы', type: 'movie' },
        { title: 'Наши фильмы',                     sheet: 'Наши фильмы',       type: 'movie' },
        { title: 'Зарубежные сериалы',              sheet: 'Зарубежные сериалы', type: 'tv' },
        { title: 'Наши сериалы',                    sheet: 'Наши сериалы',       type: 'tv' },
        { title: 'Телевизор',                       sheet: 'Телевизор',          type: 'tv' }
    ];

    var REQUEST_POOL = {};
    var activeRequests = 0;

    // === Улучшенная очистка + извлечение года ===
    function parseTitle(raw) {
        if (!raw) return { title: '', year: null };

        let title = raw.toString();
        let year = null;

        // Извлекаем год
        const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) year = parseInt(yearMatch[1]);

        title = title
            .replace(/\(\d{4}\).*$/i, '')
            .replace(/\b(2160p|1080p|720p|HDR10?|DV|HDR|BDRip|WEB[- ]?DL|BluRay|HEVC|H\.?264|x264|x265|AAC|AC3|5\.1|2\.0|Rus|Eng|Sub)\b/gi, '')
            .replace(/[\[\]\|\/\\:•·]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return { title, year };
    }

    function getCacheKey(title) {
        return 'rutor_tmdb_' + Lampa.Utils.hash(title);
    }

    // Ограничение параллельных запросов
    function searchTMDB(title, callback) {
        if (!title) return callback(null);

        const cached = Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, null);
        if (cached !== undefined) return callback(cached);

        if (REQUEST_POOL[title]) {
            REQUEST_POOL[title].push(callback);
            return;
        }

        REQUEST_POOL[title] = [callback];

        const doRequest = () => {
            Lampa.Api.sources.tmdb.search({
                query: title,
                page: 1
            }, (data) => {
                const result = (data?.results?.length > 0) ? data.results[0] : null;
                Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, result);
                REQUEST_POOL[title].forEach(cb => cb(result));
                delete REQUEST_POOL[title];
                activeRequests--;
            }, () => {
                Lampa.Storage.cache(getCacheKey(title), TMDB_CACHE_TIME, null);
                REQUEST_POOL[title].forEach(cb => cb(null));
                delete REQUEST_POOL[title];
                activeRequests--;
            });
        };

        // Очередь запросов
        if (activeRequests < MAX_CONCURRENT) {
            activeRequests++;
            doRequest();
        } else {
            // Простая очередь
            setTimeout(() => {
                activeRequests++;
                doRequest();
            }, 300);
        }
    }

    function RutorApi() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.category = function (params, onSuccess, onError) {
            var parts = [];

            RUTOR_CATEGORIES.forEach(function (cat) {
                parts.push(function (callback) {
                    var url = SHEETS_API + '?sheet=' + encodeURIComponent(cat.sheet);

                    self.network.silent(url, function (json) {
                        if (!json || !Array.isArray(json)) {
                            return callback({ title: cat.title, results: [] });
                        }

                        json = json.slice(0, MAX_ITEMS);
                        const results = [];

                        // Сначала сразу возвращаем карточки без TMDB
                        json.forEach((item, idx) => {
                            const rawTitle = item.title || item.name || item.toString();
                            const { title: clean_title, year } = parseTitle(rawTitle);

                            const card = {
                                id: 'rutor_' + cat.sheet + '_' + idx,
                                title: clean_title,
                                name: clean_title,
                                original_title: clean_title,
                                overview: '',
                                poster_path: null,        // будет обновлено позже
                                backdrop_path: null,
                                vote_average: 0,
                                release_date: year ? year.toString() : '',
                                first_air_date: year ? year.toString() : '',
                                media_type: (cat.type === 'movie') ? 'movie' : 'tv',
                                source: SOURCE_NAME.toLowerCase()
                            };

                            results.push(card);

                            // Асинхронно ищем TMDB и обновляем карточку
                            const searchQuery = year ? `${clean_title} ${year}` : clean_title;

                            searchTMDB(searchQuery, function (tmdb) {
                                if (tmdb) {
                                    card.id = tmdb.id;
                                    card.title = tmdb.title || tmdb.name || clean_title;
                                    card.name = tmdb.name || tmdb.title || clean_title;
                                    card.original_title = tmdb.original_title || tmdb.original_name;
                                    card.overview = tmdb.overview || '';
                                    card.poster_path = tmdb.poster_path;
                                    card.backdrop_path = tmdb.backdrop_path;
                                    card.vote_average = parseFloat(tmdb.vote_average) || 0;
                                    card.release_date = tmdb.release_date || card.release_date;
                                    card.first_air_date = tmdb.first_air_date || card.first_air_date;

                                    // Обновляем уже отображённую карточку
                                    Lampa.Listener.send('card', 'update', { card: card });
                                }
                            });
                        });

                        callback({
                            title: cat.title,
                            results: results,
                            page: 1,
                            total_pages: 1,
                            total_results: results.length
                        });

                    }, function () {
                        callback({ title: cat.title, results: [] });
                    });
                });
            });

            Lampa.Api.partNext(parts, 1, onSuccess, onError);
        };

        self.full = function (params, onSuccess, onError) {
            params.source = 'tmdb';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onSuccess, onError) {
            onSuccess({ results: [] });
        };
    }

    // ====================== Запуск ======================
    function startPlugin() {
        if (window.rutor_plugin_installed) return;
        window.rutor_plugin_installed = true;

        var api = new RutorApi();

        Lampa.Api.sources.rutor = api;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: () => api });

        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        // Меню
        var menuItem = $(`
            <li class="menu__item selector">
                <div class="menu__ico">${ICON}</div>
                <div class="menu__text">${SOURCE_NAME}</div>
            </li>
        `);

        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') startPlugin(); });

})();
