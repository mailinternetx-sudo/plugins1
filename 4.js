(function () {
'use strict';

/* ================= CONFIG ================= */

const Config = {
    SOURCE_NAME: Lampa.Storage.get('numparser_source_name', 'NUMParser'),
    GAS_ID: 'AKfycbwksF9gfbyP_ZxvublZ_sidsEuXW_fJs0EqHu-s6NwCxnsVJT60qa-Y6tBrVlHd8hSJ',
    TMDB_TOKEN: 'eyJhbGciOiJIUzI1NiJ9...',
    BASE_URL() {
        return `https://script.google.com/macros/s/${this.GAS_ID}/exec`;
    },
    DELAY: 120,
    CACHE_TIME: 300
};

/* ================= CACHE ================= */

const Cache = {
    data: {},
    get(key) {
        const item = this.data[key];
        if (!item) return null;
        if (Date.now() > item.expire) return null;
        return item.value;
    },
    set(key, value, ttl = Config.CACHE_TIME * 1000) {
        this.data[key] = {
            value,
            expire: Date.now() + ttl
        };
    }
};

/* ================= PARSER ================= */

const Parser = {
    parse(str) {
        const m = String(str).match(/^(.+?)\s*\((\d{4})\)$/);
        return m ? { title: m[1], year: m[2] } : { title: str, year: null };
    }
};

/* ================= TMDB ================= */

const TMDB = {
    queue: [],
    active: false,

    search(title, year) {
        return new Promise(resolve => {
            this.queue.push({ title, year, resolve });
            this.run();
        });
    },

    run() {
        if (this.active || !this.queue.length) return;

        this.active = true;
        const task = this.queue.shift();

        const key = task.title + task.year;
        const cached = Cache.get(key);
        if (cached) {
            task.resolve(cached);
            this.active = false;
            this.run();
            return;
        }

        const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(task.title)}&year=${task.year || ''}`;

        new Lampa.Reguest().silent(url, {
            headers: {
                Authorization: `Bearer ${Config.TMDB_TOKEN}`
            }
        }, json => {

            let result = null;

            if (json?.results?.length) {
                const item = json.results[0];
                result = {
                    id: item.id,
                    title: item.title || item.name,
                    original_title: item.original_title || item.original_name,
                    poster_path: item.poster_path,
                    backdrop_path: item.backdrop_path,
                    overview: item.overview,
                    vote_average: item.vote_average,
                    first_air_date: item.first_air_date,
                    number_of_seasons: item.number_of_seasons,
                    source: Config.SOURCE_NAME
                };
            }

            Cache.set(key, result);
            task.resolve(result);

            setTimeout(() => {
                this.active = false;
                this.run();
            }, Config.DELAY);

        }, () => {
            task.resolve(null);
            this.active = false;
            this.run();
        });
    }
};

/* ================= SHEETS ================= */

const Sheets = {
    load(sheet) {
        return new Promise(resolve => {
            const url = `${Config.BASE_URL()}?sheet=${encodeURIComponent(sheet)}`;

            const cached = Cache.get(url);
            if (cached) return resolve(cached);

            new Lampa.Reguest().silent(url, {}, res => {
                const data = res?.data || [];
                Cache.set(url, data);
                resolve(data);
            }, () => resolve([]));
        });
    }
};

/* ================= FILTER ================= */

const Filter = {
    apply(list) {
        if (!Lampa.Storage.get('numparser_hide_watched', false)) return list;

        return list.filter(item => {
            const fav = Lampa.Favorite.check(item);
            return !(fav && fav.history);
        });
    }
};

/* ================= BUILDER ================= */

const Builder = {
    async buildFromSheet(sheet) {
        const rows = await Sheets.load(sheet);

        const results = [];

        for (let row of rows) {
            if (!row) continue;

            const parsed = Parser.parse(row);
            const item = await TMDB.search(parsed.title, parsed.year);

            if (item) results.push(item);
        }

        return Filter.apply(results);
    }
};

/* ================= API ================= */

function NumparserApi() {

    this.list = async (params, onComplete) => {
        const sheet = Categories[params.url].sheet;
        const results = await Builder.buildFromSheet(sheet);

        onComplete({
            results,
            page: 1,
            total_pages: 1,
            total_results: results.length
        });
    };

    this.full = function (params, onSuccess, onError) {
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };

    this.category = function (params, onSuccess) {

        const parts = Object.keys(Categories).map(key => {
            return async callback => {
                const cat = Categories[key];
                if (!cat.visible) return callback({ results: [] });

                const results = await Builder.buildFromSheet(cat.sheet);

                callback({
                    title: cat.title,
                    url: key,
                    results
                });
            };
        });

        Lampa.Api.partNext(parts, 5, onSuccess);
    };
}

/* ================= CATEGORIES ================= */

const Categories = {
    top: { title: 'Топ 24ч', sheet: 'Топ 24ч', visible: true },
    movies: { title: 'Фильмы', sheet: 'Фильмы', visible: true },
    series: { title: 'Сериалы', sheet: 'Сериалы', visible: true }
};

/* ================= UI ================= */

const UI = {
    init() {
        const menu = $('<li class="menu__item selector"><div class="menu__text">' + Config.SOURCE_NAME + '</div></li>');

        $('.menu .menu__list').eq(0).append(menu);

        menu.on('hover:enter', () => {
            Lampa.Activity.push({
                component: 'category',
                source: Config.SOURCE_NAME
            });
        });
    }
};

/* ================= INIT ================= */

function start() {
    if (window.__numparser_modular) return;
    window.__numparser_modular = true;

    const api = new NumparserApi();

    Lampa.Api.sources[Config.SOURCE_NAME] = api;

    UI.init();
}

if (window.appready) start();
else Lampa.Listener.follow('app', e => e.type === 'ready' && start());

})();
