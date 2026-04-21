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

    let cache = {};
    let queue = [];
    let active = 0;
    const MAX = 5;

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

    // ---------------- CACHE ----------------
    function getCache(key) {
        if (cache[key]) return cache[key];

        let local = localStorage.getItem(key);
        if (!local) return null;

        let data = JSON.parse(local);
        if (Date.now() - data.time > 1000 * 60 * 20) return null;

        return data.value;
    }

    function setCache(key, value) {
        cache[key] = value;

        localStorage.setItem(key, JSON.stringify({
            time: Date.now(),
            value
        }));
    }

    // ---------------- SEARCH VARIANTS ----------------
    function variants(item) {
        let arr = [];

        if (item.original) arr.push(item.original);

        let clean = item.name
            .replace(/\(.*?\)/g, '')
            .replace(/\/.*/, '')
            .trim();

        arr.push(clean);
        arr.push(clean.split(' ').slice(0, 2).join(' '));

        return arr;
    }

    // ---------------- TMDB ----------------
    function searchTMDB(query, year, callback) {
        let key = 'tmdb_' + query + year;
        let cached = getCache(key);
        if (cached) return callback(cached);

        addQueue((done) => {
            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
                .then(r => r.json())
                .then(json => {
                    let res = pick(json.results, year);

                    setCache(key, res);
                    callback(res);

                    done();
                })
                .catch(() => done());
        });
    }

    function pick(results = [], year) {
        return results
            .map(r => {
                let score = r.popularity || 0;

                if (year) {
                    if ((r.release_date || '').includes(year)) score += 40;
                    if ((r.first_air_date || '').includes(year)) score += 40;
                }

                return { ...r, score };
            })
            .sort((a, b) => b.score - a.score)[0];
    }

    // ---------------- SMART SEARCH ----------------
    function smart(item, cb) {
        let list = variants(item);

        function tryOne(i = 0) {
            if (i >= list.length) return cb(null);

            searchTMDB(list[i], item.year, (res) => {
                if (res) return cb(res);
                tryOne(i + 1);
            });
        }

        tryOne();
    }

    // ---------------- LOAD CATEGORY ----------------
    function load(category) {
        Lampa.Activity.push({
            title: category,
            component: 'category_full',
            results: [],
            page: 1
        });

        fetch(PROXY + '?cat=' + encodeURIComponent(category))
            .then(r => r.json())
            .then(list => {

                let seen = new Set();

                list.slice(0, 40).forEach(item => {

                    if (item.name.includes('XXX')) return;

                    smart(item, (res) => {
                        if (!res) return;
                        if (seen.has(res.id)) return;

                        seen.add(res.id);

                        Lampa.Activity.active().append([res]);
                    });

                });

            });
    }

    // ---------------- UI ----------------
    function init() {
        Lampa.Menu.add({
            title: 'Rutor Pro',
            icon: '🔥',
            onSelect: function () {
                Lampa.Select.show({
                    title: 'Категории',
                    items: categories,
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
