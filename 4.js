(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа', path: 'lampac_top24' },
        { title: '🎬 Зарубежные фильмы', path: 'lampac_movies' },
        { title: '🇷🇺 Наши фильмы', path: 'lampac_movies_ru' },
        { title: '📺 Зарубежные сериалы', path: 'lampac_tv_shows' },
        { title: '🇷🇺 Наши сериалы', path: 'lampac_tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)', path: 'lampac_televizor' }
    ];

    async function fetchCategory(path, page = 1) {
        const url = `${PROXY}${path}?page=${page}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    function normalizeItem(item) {
        // Гарантируем наличие id
        if (!item.id) {
            const str = item.original_title || item.title || Math.random().toString();
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            item.id = Math.abs(hash);
        }
        return {
            id: item.id,
            title: item.title || item.name,
            name: item.name || item.title,
            original_title: item.original_title,
            original_name: item.original_name,
            overview: item.overview,
            poster: item.poster_path,        // Lampa распознает poster
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            img: item.poster_path,
            vote_average: item.vote_average || 0,
            release_date: item.release_date,
            first_air_date: item.first_air_date,
            media_type: item.type === 'tv' ? 'tv' : 'movie',
            type: item.type,
            source: SOURCE
        };
    }

    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                const url = params.url;
                const page = params.page || 1;

                // Главный экран: список категорий
                if (!url) {
                    const lines = CATEGORIES.map(cat => ({
                        title: cat.title,
                        url: cat.path,
                        type: 'line',
                        source: SOURCE,
                        page: 1,
                        more: true
                    }));
                    onSuccess(lines);
                    return;
                }

                // Загрузка конкретной категории
                const data = await fetchCategory(url, page);
                const results = (data.results || []).map(normalizeItem);

                const response = {
                    results: results,
                    page: data.page || page,
                    total_pages: data.total_pages || 1,
                    more: (data.page || page) < (data.total_pages || 1),
                    source: SOURCE,
                    url: url
                };
                onSuccess(response);
            } catch (e) {
                console.error('[Rutor Pro]', e);
                onError(e);
            }
        };

        this.full = function (params, onSuccess, onError) {
            // Детальная карточка через TMDB (можно оставить)
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addButton() {
        const tryAdd = () => {
            const menu = document.querySelector('.menu .menu__list');
            if (!menu) return setTimeout(tryAdd, 500);
            if (document.querySelector('[data-rutor-pro]')) return;

            const li = document.createElement('li');
            li.className = 'menu__item selector';
            li.setAttribute('data-rutor-pro', '1');
            li.innerHTML = `<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;
            li.addEventListener('hover:enter', () => {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE,
                    title: SOURCE
                });
            });
            menu.appendChild(li);
        };
        tryAdd();
    }

    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
