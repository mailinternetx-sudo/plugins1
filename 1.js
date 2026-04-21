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

    // ---------------- PARSE ----------------
    function variants(item) {
        let arr = [];

        if (item.original) arr.push(item.original);

        let clean = item.name
            .replace(/\(.*?\)/g, '')
            .replace(/\/.*/, '')
            .replace(/(WEB|HDR|1080p|720p|BDRip)/gi, '')
            .trim();

        arr.push(clean);
        arr.push(clean.split(' ').slice(0, 2).join(' '));

        return arr;
    }

    // ---------------- TMDB ----------------
    function search(query, year, cb) {
        addQueue((done) => {
            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
                .then(r => r.json())
                .then(json => {
                    let res = pick(json.results, year);
                    cb(res);
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

                if (r.original_language === 'en') score += 10;

                return { ...r, score };
            })
            .sort((a, b) => b.score - a.score)[0];
    }

    function smart(item, cb) {
        let list = variants(item);

        function tryOne(i = 0) {
            if (i >= list.length) return cb(null);

            search(list[i], item.year, (res) => {
                if (res) return cb(res);
                tryOne(i + 1);
            });
        }

        tryOne();
    }

    // ---------------- LOAD ----------------
    function load(category) {

        if (!category) return;

        Lampa.Activity.push({
            title: category,
            component: 'category_full',
            results: [],
            page: 1
        });

        fetch(PROXY)
            .then(r => r.json())
            .then(list => {

                let seen = new Set();

                list.slice(0, 40).forEach(item => {

                    if (!item || !item.name) return;
                    if (item.name.includes('XXX')) return;

                    smart(item, (res) => {
                        if (!res) return;
                        if (seen.has(res.id)) return;

                        seen.add(res.id);

                        Lampa.Activity.active().append([res]);
                    });

                });

            })
            .catch(e => console.log('FETCH ERROR:', e));
    }

    // ---------------- UI (ГЛАВНЫЙ ЭКРАН) ----------------
    function init() {

        console.log('RUTOR INIT');

        Lampa.Listener.follow('menu', function (e) {

            if (e.type === 'ready') {

                console.log('MENU READY → ADD BUTTON');

                Lampa.Menu.add({
                    title: 'Rutor Pro',
                    icon: '🔥',
                    type: 'button',   // 🔥 ключ для главного экрана
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
