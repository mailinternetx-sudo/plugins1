(function () {
    'use strict';

    const SOURCE_NAME = 'Rutor Pro';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    let cache = {};
    let queue = [];
    let active = 0;
    const MAX = 5;

    // ---------------- QUEUE ----------------
    function runQueue() {
        if (active >= MAX || !queue.length) return;

        let job = queue.shift();
        active++;

        job(() => {
            active--;
            runQueue();
        });

        runQueue();
    }

    function addQueue(fn) {
        queue.push(fn);
        runQueue();
    }

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

    // ---------------- TMDB FIND ----------------
    function findByIMDb(imdb, cb) {

        let key = 'imdb_' + imdb;
        let cached = getCache(key);
        if (cached) return cb(cached);

        addQueue(done => {
            fetch(`https://api.themoviedb.org/3/find/${imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru-RU`)
                .then(r => r.json())
                .then(j => {

                    let res = j.movie_results[0] || j.tv_results[0];

                    if (res) {
                        setCache(key, res);
                        cb(res);
                    } else {
                        cb(null);
                    }

                    done();
                })
                .catch(() => done());
        });
    }

    // ---------------- FALLBACK SEARCH ----------------
    function searchFallback(name, year, cb) {

        addQueue(done => {

            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}&language=ru-RU`)
                .then(r => r.json())
                .then(j => {

                    let res = pick(j.results || [], year);
                    cb(res);

                    done();
                })
                .catch(() => done());

        });
    }

    function pick(results, year) {

        return results
            .map(r => {

                let score = r.popularity || 0;

                let y = (r.release_date || r.first_air_date || '').slice(0, 4);

                if (year && y === year) score += 50;

                return { ...r, score };

            })
            .sort((a, b) => b.score - a.score)[0];
    }

    // ---------------- SMART ----------------
    function resolve(item, cb) {

        if (item.imdb) {
            return findByIMDb(item.imdb, res => {
                if (res) return cb(res);
                fallback();
            });
        }

        fallback();

        function fallback() {
            searchFallback(item.name_clean || item.name, item.year, cb);
        }
    }

    // ---------------- API ----------------
    function RutorApi() {

        this.category = function (params, onSuccess, onError) {

            fetch(PROXY)
                .then(r => r.json())
                .then(data => {

                    let parts = [];

                    Object.keys(data).forEach(cat => {

                        let row = {
                            title: cat,
                            results: []
                        };

                        parts.push(row);

                        (data[cat] || []).forEach(item => {

                            resolve(item, res => {

                                if (!res) return;

                                row.results.push({
                                    id: res.id,
                                    title: res.title || res.name,
                                    original_title: res.original_title || res.original_name,
                                    poster_path: res.poster_path,
                                    backdrop_path: res.backdrop_path,
                                    overview: res.overview,
                                    vote_average: res.vote_average,
                                    type: res.media_type || (res.first_air_date ? 'tv' : 'movie')
                                });

                                if (row.update) row.update();

                            });

                        });

                    });

                    onSuccess(parts);

                })
                .catch(onError);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // ---------------- UI (как топ плагины) ----------------
    function start() {

        let api = new RutorApi();

        Lampa.Api.sources.rutorpro = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: () => api
        });

        // 🔥 кнопка в главном меню (как топ плагины)
        Lampa.Listener.follow('menu', function (e) {

            if (e.type === 'render') {

                e.items.push({
                    title: SOURCE_NAME,
                    icon: '🔥',
                    onSelect: function () {
                        Lampa.Activity.push({
                            title: SOURCE_NAME,
                            component: 'category',
                            source: SOURCE_NAME
                        });
                    }
                });

            }
        });

        // 🔥 авто-добавление на главный экран
        Lampa.Listener.follow('app', function (e) {

            if (e.type === 'ready') {

                setTimeout(() => {

                    try {
                        Lampa.Activity.push({
                            title: SOURCE_NAME,
                            component: 'category',
                            source: SOURCE_NAME
                        });
                    } catch (e) {}

                }, 1000);

            }

        });
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') start();
        });
    }

})();
