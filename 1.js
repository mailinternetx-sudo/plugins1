(function () {
    'use strict';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const PROXY_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/?url='; // замените на свой прокси

    const CATEGORIES = [
        { title: 'Топ 24ч',        url: 'https://new-rutor.org/top/' },
        { title: 'Зарубежные фильмы', url: 'https://new-rutor.org/top/foreign_films/' },
        { title: 'Наши фильмы',     url: 'https://new-rutor.org/top/russian_films/' },
        { title: 'Зарубежные сериалы', url: 'https://new-rutor.org/top/foreign_series/' },
        { title: 'Наши сериалы',    url: 'https://new-rutor.org/top/russian_series/' },
        { title: 'Телевизор',       url: 'https://new-rutor.org/top/tv/' }
    ];

    // ---------- Кеш ----------
    let tmdbCache = new Map();

    function getCached(key) {
        const raw = localStorage.getItem('tmdb_' + key);
        if (!raw) return null;
        try {
            const { value, time } = JSON.parse(raw);
            if (Date.now() - time > 20 * 60 * 1000) return null; // 20 минут
            return value;
        } catch { return null; }
    }

    function setCache(key, value) {
        localStorage.setItem('tmdb_' + key, JSON.stringify({ value, time: Date.now() }));
        tmdbCache.set(key, value);
    }

    // ---------- Очередь запросов (не более 5 параллельно) ----------
    let queue = [];
    let active = 0;
    const MAX_CONCURRENT = 5;

    function runQueue() {
        while (active < MAX_CONCURRENT && queue.length) {
            const task = queue.shift();
            active++;
            task(() => { active--; runQueue(); });
        }
    }

    function enqueue(fn) {
        queue.push(fn);
        runQueue();
    }

    // ---------- Поиск в TMDB ----------
    function searchTMDB(query, year, callback) {
        const cacheKey = query + (year || '');
        const cached = getCached(cacheKey);
        if (cached) return callback(cached);

        enqueue((done) => {
            const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
            fetch(url)
                .then(r => r.json())
                .then(data => {
                    let best = null;
                    let bestScore = -1;

                    (data.results || []).forEach(item => {
                        let score = item.popularity || 0;
                        if (year) {
                            const itemYear = (item.release_date || item.first_air_date || '').slice(0, 4);
                            if (itemYear === year) score += 50;
                        }
                        if (score > bestScore) {
                            bestScore = score;
                            best = item;
                        }
                    });

                    setCache(cacheKey, best);
                    callback(best);
                    done();
                })
                .catch(() => { callback(null); done(); });
        });
    }

    // Извлечение года из названия (например "Дюна (2024)" → "2024")
    function extractYear(name) {
        const match = name.match(/\((\d{4})\)/);
        return match ? match[1] : null;
    }

    // Очистка названия от года и лишнего
    function cleanName(name) {
        return name.replace(/\s*\(?\d{4}\)?\s*/, '').replace(/\[.*?\]/, '').trim();
    }

    // Умный поиск: пробуем оригинал, потом очищенное название, потом короткое
    function smartSearch(item, callback) {
        const year = item.year || extractYear(item.name);
        const clean = cleanName(item.name);
        const variants = [item.name, clean, clean.split(' ').slice(0, 2).join(' ')];

        let idx = 0;
        function tryNext() {
            if (idx >= variants.length) return callback(null);
            searchTMDB(variants[idx], year, (res) => {
                if (res) callback(res);
                else { idx++; tryNext(); }
            });
        }
        tryNext();
    }

    // ---------- Загрузка категории ----------
    function loadCategory(category) {
        if (!category || !category.url) return;

        Lampa.Activity.push({
            title: category.title,
            component: 'category_full',
            results: [],
            page: 1,
            loading: true
        });

        const fullUrl = PROXY_URL + encodeURIComponent(category.url);
        fetch(fullUrl)
            .then(res => res.json())
            .then(items => {
                const activity = Lampa.Activity.active();
                if (!activity) return;

                activity.loading(false);
                let loaded = 0;
                const total = Math.min(items.length, 40);
                const seen = new Set();

                items.slice(0, 40).forEach(item => {
                    if (!item.name || item.name.toLowerCase().includes('xxx')) return;

                    smartSearch(item, (tmdbItem) => {
                        if (!tmdbItem) return;
                        if (seen.has(tmdbItem.id)) return;
                        seen.add(tmdbItem.id);

                        // Формируем карточку, совместимую с Lampa
                        const card = {
                            id: tmdbItem.id,
                            title: tmdbItem.title || tmdbItem.name,
                            poster: tmdbItem.poster_path ? 'https://image.tmdb.org/t/p/w500' + tmdbItem.poster_path : null,
                            description: tmdbItem.overview,
                            year: (tmdbItem.release_date || tmdbItem.first_air_date || '').slice(0, 4),
                            type: tmdbItem.media_type === 'tv' ? 'tv' : 'movie'
                        };
                        activity.append([card]);
                        loaded++;

                        if (loaded === total) {
                            activity.setLoading(false);
                        }
                    });
                });
            })
            .catch(err => {
                console.error('Rutor fetch error:', err);
                const activity = Lampa.Activity.active();
                if (activity) {
                    activity.loading(false);
                    Lampa.Notify.show('Ошибка загрузки с new-rutor.org', 3000);
                }
            });
    }

    // ---------- Добавление пункта в меню ----------
    function initPlugin() {
        Lampa.Menu.add({
            title: 'Rutor Pro',
            icon: '🔥',
            component: 'category',
            onSelect: () => {
                Lampa.Select.show({
                    title: 'Категории new-rutor',
                    items: CATEGORIES.map(c => ({ title: c.title })),
                    onSelect: (selected) => {
                        const cat = CATEGORIES.find(c => c.title === selected.title);
                        if (cat) loadCategory(cat);
                    }
                });
            }
        });
        console.log('Rutor Pro plugin initialized');
    }

    // Старт
    if (window.appready) initPlugin();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') initPlugin(); });
})();
