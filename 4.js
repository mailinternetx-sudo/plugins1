(function () {
    'use strict';

    const SOURCE_NAME = 'Rutor Pro';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const KP_API_KEY = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
    const OMDB_API_KEY = '38756ce6';

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

    // ---------------- PARSE ----------------
    function parseItem(str) {

        let year = (str.match(/\((\d{4})\)/) || [])[1] || '';
        let imdb = (str.match(/tt\d+/) || [])[0] || '';

        let name = str
            .split('(')[0]
            .split('[')[0]
            .replace(/\/.*/, '')
            .replace(/(CAMRip|TS|WEBRip|HDRip|Trailer|720p|1080p|2160p|x264|HEVC)/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        return { name, year, imdb };
    }

    // ---------------- SIMILARITY ----------------
    function similarity(a, b) {
        if (!a || !b) return 0;

        a = a.toLowerCase();
        b = b.toLowerCase();

        let matrix = [];

        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
                );
            }
        }

        return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
    }

    // ---------------- TMDB ----------------
    function findIMDB(id, cb) {

        let key = 'imdb_' + id;
        let cached = getCache(key);
        if (cached) return cb(cached);

        addQueue(done => {
            fetch(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru-RU`)
                .then(r => r.json())
                .then(j => {
                    let res = j.movie_results[0] || j.tv_results[0];
                    setCache(key, res);
                    cb(res);
                    done();
                })
                .catch(() => done());
        });
    }

    function searchTMDB(q, lang, cb) {
        addQueue(done => {
            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=${lang}`)
                .then(r => r.json())
                .then(j => {
                    cb(j.results || []);
                    done();
                })
                .catch(() => done());
        });
    }

    // ---------------- KP ----------------
    function kpToIMDb(kp_id, cb) {

        addQueue(done => {
            fetch(`https://kinopoiskapiunofficial.tech/api/v2.2/films/${kp_id}`, {
                headers: { 'X-API-KEY': KP_API_KEY }
            })
                .then(r => r.json())
                .then(j => {
                    cb(j.imdbId || null);
                    done();
                })
                .catch(() => done());
        });
    }

    // ---------------- OMDB ----------------
    function searchOMDB(q, cb) {
        addQueue(done => {
            fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(j => {
                    cb(j.Search || []);
                    done();
                })
                .catch(() => done());
        });
    }

    // ---------------- SMART ----------------
    function smart(item, cb) {

        let parsed = parseItem(item.name);

        // 1 IMDb
        if (item.imdb) {
            return findIMDB(item.imdb, res => {
                if (res) return cb(res);
                fallback();
            });
        }

        // 2 KP → IMDb
        if (item.kp) {
            return kpToIMDb(item.kp, imdb => {
                if (imdb) {
                    return findIMDB(imdb, res => {
                        if (res) return cb(res);
                        fallback();
                    });
                }
                fallback();
            });
        }

        // 3 IMDb из строки
        if (parsed.imdb) {
            return findIMDB(parsed.imdb, res => {
                if (res) return cb(res);
                fallback();
            });
        }

        fallback();

        function fallback() {

            let candidates = [];

            searchTMDB(parsed.name, 'ru-RU', ru => {

                ru.slice(0, 5).forEach(r => {
                    candidates.push({
                        title: r.title || r.name,
                        year: (r.release_date || r.first_air_date || '').slice(0,4),
                        score: 0.9,
                        raw: r
                    });
                });

                searchTMDB(parsed.name, 'en-US', en => {

                    en.slice(0, 5).forEach(r => {
                        candidates.push({
                            title: r.title || r.name,
                            year: (r.release_date || r.first_air_date || '').slice(0,4),
                            score: 0.8,
                            raw: r
                        });
                    });

                    searchOMDB(parsed.name, omdb => {

                        omdb.slice(0, 5).forEach(r => {
                            candidates.push({
                                title: r.Title,
                                year: r.Year,
                                score: 0.7,
                                imdb: r.imdbID
                            });
                        });

                        pick(candidates);
                    });
                });
            });

            function pick(list) {

                let best = null;
                let bestScore = 0;

                list.forEach(c => {

                    let s = similarity(parsed.name, c.title);

                    if (parsed.year && c.year && parsed.year === c.year) s += 0.2;

                    s += c.score;

                    if (s > bestScore) {
                        bestScore = s;
                        best = c;
                    }
                });

                if (best?.imdb) {
                    return findIMDB(best.imdb, cb);
                }

                cb(best?.raw || null);
            }
        }
    }

    // ---------------- API ----------------
    function RutorApi() {

        this.category = function (params, onSuccess, onError) {

            fetch(PROXY)
                .then(r => r.json())
                .then(data => {

                    let parts = [];

                    CATEGORIES.forEach(cat => {

                        let row = { title: cat, results: [] };
                        parts.push(row);

                        (data || []).forEach(item => {

                            smart(item, res => {

                                if (!res) return;

                                row.results.push({
                                    id: res.id,
                                    title: res.title || res.name,
                                    original_title: res.original_title || res.original_name,
                                    poster_path: res.poster_path,
                                    backdrop_path: res.backdrop_path,
                                    overview: res.overview,
                                    vote_average: res.vote_average,
                                    type: res.media_type
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

    // ---------------- INIT ----------------
    function start() {

        let api = new RutorApi();

        Lampa.Api.sources.rutorpro = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: () => api
        });

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
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') start();
        });
    }

})();
