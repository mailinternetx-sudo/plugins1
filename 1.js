(function () {
    'use strict';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const categories = [
        { title: "Топ 24ч" },
        { title: "Зарубежные фильмы" },
        { title: "Наши фильмы" },
        { title: "Зарубежные сериалы" },
        { title: "Наши сериалы" },
        { title: "Телевизор" }
    ];

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

    // ---------------- CLEAN TITLE ----------------
    function cleanTitle(str) {
        return str
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\/.*/, '')
            .replace(/(WEB|HDR|BDRip|1080p|720p|2160p|x264|H\.264|HEVC|AAC)/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function getOriginal(str) {
        let m = str.match(/\/\s*([^(]+)/);
        return m ? m[1].trim() : '';
    }

    function getYear(str) {
        let m = str.match(/\((\d{4})\)/);
        return m ? m[1] : '';
    }

    // ---------------- SEARCH VARIANTS ----------------
    function buildQueries(item) {
        let arr = [];

        if (item.original) arr.push(item.original);     // EN
        arr.push(cleanTitle(item.name));                // RU
        arr.push(cleanTitle(item.name).split(' ').slice(0,2).join(' ')); // fallback

        return arr.filter(Boolean);
    }

    // ---------------- TMDB SEARCH ----------------
    function searchTMDB(query, year, cb) {

        addQueue((done) => {

            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`)
                .then(r => r.json())
                .then(json => {

                    let res = pickBest(json.results, year);

                    cb(res);
                    done();

                })
                .catch(() => done());

        });
    }

    function pickBest(results = [], year) {

        return results
            .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
            .map(r => {

                let score = r.popularity || 0;

                if (year) {
                    if ((r.release_date || '').includes(year)) score += 40;
                    if ((r.first_air_date || '').includes(year)) score += 40;
                }

                if (r.original_language === 'en') score += 10;

                return { ...r, score };
            })
            .sort((a, b) => b.score - a.score)[0];
    }

    // ---------------- SMART SEARCH ----------------
    function smartSearch(item, cb) {

        let queries = buildQueries(item);

        function tryOne(i = 0) {
            if (i >= queries.length) return cb(null);

            searchTMDB(queries[i], item.year, (res) => {
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

        fetch(PROXY)
            .then(r => r.json())
            .then(data => {

                let list = data[category] || [];
                let seen = new Set();

                list.slice(0, 40).forEach(raw => {

                    if (!raw || !raw.name) return;
                    if (raw.name.includes('XXX')) return;

                    let item = {
                        name: raw.name,
                        original: getOriginal(raw.name),
                        year: getYear(raw.name)
                    };

                    smartSearch(item, (res) => {

                        if (!res) return;
                        if (seen.has(res.id)) return;

                        seen.add(res.id);

                        // 👉 Точное определение типа
                        res.type = res.media_type === 'tv' ? 'tv' : 'movie';

                        Lampa.Activity.active().append([res]);

                    });

                });

            })
            .catch(e => console.log('FETCH ERROR:', e));
    }

    // ---------------- UI ----------------
    function init() {

        Lampa.Listener.follow('menu', function (e) {

            if (e.type === 'ready') {

                Lampa.Menu.add({
                    title: 'Rutor Pro',
                    icon: '🔥',
                    type: 'button',
                    position: 0,

                    onSelect: function () {

                        Lampa.Select.show({
                            title: 'Категории',
                            items: categories,

                            onSelect: function (item) {
                                load(item.title);
                            }
                        });

                    }
                });

            }
        });
    }

    // ---------------- START ----------------
    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
