(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'RUTOR';
    var SOURCE_NAME = DEFAULT_SOURCE_NAME;

    var SHEETS_API = 'https://script.google.com/macros/s/AKfycbzkG8EzY7yw2DFwK2tPcKfc5YS1opFKBRcjI6BX6SGmYOwB0NmFHDCkmRNy6kGbErAY/exec';

    var MAX_ITEMS = 12;
    var TMDB_CACHE_TIME = 60 * 60 * 24 * 3;
    var MAX_CONCURRENT = 6;

    var MIN_PROGRESS = Lampa.Storage.get('rutor_min_progress', 90);
    var HIDE_WATCHED = Lampa.Storage.get('rutor_hide_watched', false);

    var ICON = `<svg width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200" fill="#ff4d4d"/><text x="256" y="285" font-size="180" text-anchor="middle" fill="#fff">R</text></svg>`;

    var RUTOR_CATEGORIES = [
        { title: 'Топ 24ч', sheet: 'Топ 24ч', type: 'mixed' },
        { title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
        { title: 'Наши фильмы', sheet: 'Наши фильмы', type: 'movie' },
        { title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы', type: 'tv' },
        { title: 'Наши сериалы', sheet: 'Наши сериалы', type: 'tv' },
        { title: 'Телевизор', sheet: 'Телевизор', type: 'tv' }
    ];

    var REQUEST_POOL = {};
    var activeRequests = 0;

    function normalizeImg(url) {
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, 'https://');
        if (/^\/\//.test(url)) return 'https:' + url;
        return '';
    }

    function getImg(path, size) {
        if (!path) return '';
        if (path.charAt(0) === '/') return Lampa.Api.img(path, size || 'w300');
        return normalizeImg(path);
    }

    function parseTitle(raw) {
        let title = raw || '';
        let year = null;

        const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) year = parseInt(yearMatch[1]);

        title = title
            .replace(/\(\d{4}\).*$/i, '')
            .replace(/\b(2160p|1080p|720p|HDR|BDRip|WEB|BluRay|x264|x265)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        return { title, year };
    }

    function filterWatched(card) {
        if (!HIDE_WATCHED) return true;

        let favorite = Lampa.Favorite.check(card);
        if (!favorite || !favorite.history) return true;

        return favorite.percent < MIN_PROGRESS;
    }

    function searchTMDB(title, cb) {
        if (!title) return cb(null);

        const cacheKey = 'rutor_tmdb_' + Lampa.Utils.hash(title);
        const cached = Lampa.Storage.cache(cacheKey, TMDB_CACHE_TIME, null);
        if (cached !== undefined) return cb(cached);

        if (REQUEST_POOL[title]) {
            REQUEST_POOL[title].push(cb);
            return;
        }

        REQUEST_POOL[title] = [cb];

        function done(result) {
            Lampa.Storage.cache(cacheKey, TMDB_CACHE_TIME, result);
            REQUEST_POOL[title].forEach(f => f(result));
            delete REQUEST_POOL[title];
            activeRequests--;
        }

        function request(query) {
            Lampa.Api.sources.tmdb.search({ query: query }, function (data) {
                const res = data && data.results && data.results.length ? data.results[0] : null;
                if (res || query === title) done(res);
                else request(title);
            }, () => done(null));
        }

        if (activeRequests < MAX_CONCURRENT) {
            activeRequests++;
            request(title);
        } else {
            setTimeout(() => {
                activeRequests++;
                request(title);
            }, 200);
        }
    }

    function RutorApi() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.category = function (params, onSuccess, onError) {
            let parts = [];

            RUTOR_CATEGORIES.forEach(cat => {
                parts.push(cb => {
                    let url = SHEETS_API + '?sheet=' + encodeURIComponent(cat.sheet);

                    self.network.silent(url, json => {
                        if (!Array.isArray(json)) return cb({ title: cat.title, results: [] });

                        let results = [];

                        json.slice(0, MAX_ITEMS * 2).forEach((item, i) => {
                            let { title, year } = parseTitle(item.title || item);

                            let card = {
                                id: 'rutor_' + i,
                                title: title,
                                original_title: title,
                                media_type: cat.type,
                                poster_path: '',
                                backdrop_path: '',
                                source: SOURCE_NAME
                            };

                            results.push(card);

                            let query = year ? title + ' ' + year : title;

                            searchTMDB(query, tmdb => {
                                if (!tmdb) return;

                                card.id = tmdb.id;
                                card.title = tmdb.title || tmdb.name;
                                card.original_title = tmdb.original_title;
                                card.poster_path = tmdb.poster_path;
                                card.backdrop_path = tmdb.backdrop_path;
                                card.media_type = tmdb.media_type || cat.type;

                                Lampa.Listener.send('card', 'update', { card: card });
                            });
                        });

                        results = results.filter(filterWatched).slice(0, MAX_ITEMS);

                        cb({
                            title: cat.title,
                            results: results,
                            page: 1
                        });

                    }, () => cb({ title: cat.title, results: [] }));
                });
            });

            Lampa.Api.partNext(parts, 2, onSuccess, onError);
        };

        self.full = function (params, onSuccess, onError) {
            params.source = 'tmdb';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        self.list = function (params, onSuccess) {
            onSuccess({ results: [] });
        };
    }

    function startPlugin() {
        if (window.rutor_plugin) return;
        window.rutor_plugin = true;

        let api = new RutorApi();

        Lampa.Api.sources.rutor = api;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: () => api });

        Lampa.Params.values.source[SOURCE_NAME] = SOURCE_NAME;

        let menu = $(`<li class="menu__item selector"><div>${ICON}</div><div>${SOURCE_NAME}</div></li>`);
        $('.menu .menu__list').eq(0).append(menu);

        menu.on('hover:enter', () => {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE_NAME
            });
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && startPlugin());

})();
