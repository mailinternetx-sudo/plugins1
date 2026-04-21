(function () {
    'use strict';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const categories = [
        "Топ 24ч",
        "Зарубежные фильмы",
        "Наши фильмы",
        "Зарубежные сериалы",
        "Наши сериалы",
        "Телевизор"
    ];

    let queue = [];
    let active = 0;
    const MAX = 5;

    let cache = {};

    // ---------------- CACHE ----------------
    function getCache(key) {
        if (cache[key]) return cache[key];

        let local = localStorage.getItem(key);
        if (!local) return null;

        let data = JSON.parse(local);
        if (Date.now() - data.time > 1000 * 60 * 60 * 6) return null;

        return data.value;
    }

    function setCache(key, value) {
        cache[key] = value;

        localStorage.setItem(key, JSON.stringify({
            time: Date.now(),
            value
        }));
    }

    // ---------------- QUEUE ----------------
    function runQueue() {
        if (active >= MAX || !queue.length) return;

        const job = queue.shift();
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

    // ---------------- CLEAN ----------------
    function clean(str) {
        return str
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\/.*/, '')
            .replace(/(WEB|HDR|BDRip|1080p|720p|2160p|x264|HEVC|AAC)/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function original(str) {
        let m = str.match(/\/\s*([^(]+)/);
        return m ? m[1].trim() : '';
    }

    function year(str) {
        let m = str.match(/\((\d{4})\)/);
        return m ? m[1] : '';
    }

    function imdb(str) {
        let m = str.match(/tt\d+/);
        return m ? m[0] : '';
    }

    // ---------------- TMDB FIND (IMDb) ----------------
    function findByIMDB(id, cb) {
        let key = 'imdb_' + id;

        let cached = getCache(key);
        if (cached) return cb(cached);

        addQueue((done) => {

            fetch(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru-RU`)
                .then(r => r.json())
                .then(json => {

                    let res = json.movie_results[0] || json.tv_results[0];

                    setCache(key, res);
                    cb(res);

                    done();
                })
                .catch(() => done());

        });
    }

    // ---------------- SEARCH ----------------
    function search(query, cb) {
        addQueue((done) => {
            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`)
                .then(r => r.json())
                .then(j => {
                    cb(j.results[0]);
                    done();
                })
                .catch(() => done());
        });
    }

    // ---------------- SMART ----------------
    function smart(item, cb) {

        let id = imdb(item.name);

        if (id) {
            return findByIMDB(id, (res) => {
                if (res) return cb(res);
                fallback();
            });
        }

        fallback();

        function fallback() {
            let q = original(item.name) || clean(item.name);
            search(q, cb);
        }
    }

    // ---------------- NETFLIX UI ----------------
    function renderRows(data) {

        let activity = Lampa.Activity.push({
            title: 'Rutor Pro',
            component: 'category'
        });

        categories.forEach(cat => {

            let list = data[cat] || [];

            let results = [];

            list.slice(0, 20).forEach(item => {

                smart(item, (res) => {
                    if (!res) return;

                    // авто перевод
                    res.title = res.title || res.name;
                    res.original_title = res.original_title || res.original_name;

                    results.push(res);

                    activity.append({
                        title: cat,
                        results: [res]
                    });
                });

            });

        });

    }

    // ---------------- LOAD ----------------
    function load() {
        fetch(PROXY)
            .then(r => r.json())
            .then(renderRows);
    }

    // ---------------- BUTTON (FIXED) ----------------
    function init() {

        Lampa.Listener.follow('menu', function (e) {

            if (e.type === 'render') {

                e.items.push({
                    title: 'Rutor Pro',
                    icon: '🔥',

                    onSelect: load
                });

            }

        });

    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => {
        if (e.type === 'ready') init();
    });

})();
