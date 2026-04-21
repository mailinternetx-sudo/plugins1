(function () {
    'use strict';

    const SOURCE_NAME = 'Rutor Pro';
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const CATEGORIES = [
        "Топ 24ч",
        "Зарубежные фильмы",
        "Наши фильмы",
        "Зарубежные сериалы",
        "Наши сериалы",
        "Телевизор"
    ];

    let cache = {};

    // ---------------- CACHE ----------------
    function getCache(key) {
        if (cache[key]) return cache[key];

        let raw = localStorage.getItem(key);
        if (!raw) return null;

        try {
            let data = JSON.parse(raw);
            if (Date.now() - data.time > 1000 * 60 * 60 * 6) return null;
            return data.value;
        } catch {
            return null;
        }
    }

    function setCache(key, value) {
        cache[key] = value;

        localStorage.setItem(key, JSON.stringify({
            time: Date.now(),
            value
        }));
    }

    // ---------------- CLEAN ----------------
    function clean(str) {
        return str
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\/.*/, '')
            .replace(/(WEB|HDR|BDRip|1080p|720p|2160p|x264|HEVC|AAC)/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function imdb(str) {
        let m = str.match(/tt\d+/);
        return m ? m[0] : '';
    }

    // ---------------- TMDB ----------------
    function findIMDB(id, cb) {
        let key = 'imdb_' + id;
        let cached = getCache(key);
        if (cached) return cb(cached);

        fetch(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru-RU`)
            .then(r => r.json())
            .then(j => {
                let res = j.movie_results[0] || j.tv_results[0];
                setCache(key, res);
                cb(res);
            })
            .catch(() => cb(null));
    }

    function search(query, cb) {
        let key = 'search_' + query;
        let cached = getCache(key);
        if (cached) return cb(cached);

        fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`)
            .then(r => r.json())
            .then(j => {
                let res = j.results?.[0];
                setCache(key, res);
                cb(res);
            })
            .catch(() => cb(null));
    }

    function smart(item, cb) {
        let id = imdb(item.name);

        if (id) {
            return findIMDB(id, res => {
                if (res) return cb(res);
                fallback();
            });
        }

        fallback();

        function fallback() {
            search(clean(item.name), cb);
        }
    }

    // ---------------- API ----------------
    function RutorApi() {

        this.category = function (params, onSuccess) {

            fetch(PROXY)
                .then(r => r.json())
                .then(data => {

                    let parts = [];

                    CATEGORIES.forEach(cat => {

                        let results = [];

                        (data[cat] || []).slice(0, 20).forEach(item => {

                            smart(item, res => {
                                if (!res) return;

                                results.push({
                                    id: res.id,
                                    title: res.title || res.name,
                                    original_title: res.original_title || res.original_name,
                                    poster_path: res.poster_path,
                                    backdrop_path: res.backdrop_path,
                                    overview: res.overview,
                                    vote_average: res.vote_average,
                                    type: res.media_type
                                });

                                if (results.length === 20) {
                                    parts.push({
                                        title: cat,
                                        results: results
                                    });

                                    if (parts.length === CATEGORIES.length) {
                                        onSuccess(parts);
                                    }
                                }
                            });

                        });

                    });

                });
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // ---------------- INIT ----------------
    function start() {

        let api = new RutorApi();

        Lampa.Api.sources.rutorpro = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: () => api
        });

        // кнопка
        let btn = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');

        $('.menu .menu__list').eq(0).append(btn);

        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME
            });
        });
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') start();
        });
    }

})();
