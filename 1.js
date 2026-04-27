(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const CATEGORIES_FALLBACK = [
        { title: '🔥 Топ торренты за 24 часа', path: 'top24' },
        { title: '🎬 Зарубежные фильмы',      path: 'movies' },
        { title: '🇷🇺 Наши фильмы',           path: 'movies_ru' },
        { title: '📺 Зарубежные сериалы',     path: 'tv_shows' },
        { title: '🇷🇺 Русские сериалы',       path: 'tv_shows_ru' },
        { title: '📡 ТВ передачи',            path: 'televizor' }
    ];

    async function fetchCategory(path) {
        try {
            const url = `${PROXY}${path}?page=1`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            let data = await response.json();

            // Максимально жёсткая нормализация
            if (!data || typeof data !== 'object') {
                data = { results: [] };
            }

            if (Array.isArray(data)) {
                data = { results: data };
            }

            if (!Array.isArray(data.results)) {
                data.results = [];
            }

            // Приводим все id к числу
            data.results = data.results.map(item => {
                if (item && item.id != null) {
                    item.id = parseInt(item.id, 10) || 0;
                }
                return item || {};
            });

            console.log(`[Rutor Pro] Загружено ${data.results.length} элементов для ${path}`);
            return data;

        } catch (e) {
            console.error(`[Rutor Pro] Fetch error for ${path}:`, e.message);
            return { results: [] };
        }
    }

    function Api() {
        this.category = async function (params, onSuccess, onError) {
            console.log(`[Rutor Pro] category() вызвана с url = "${params.url || ''}"`);

            try {
                const categoryPath = (params.url || params.category || '').trim() || 'categories';

                const data = await fetchCategory(categoryPath);

                const safeResponse = {
                    results: Array.isArray(data.results) ? data.results : [],
                    page: 1,
                    total_pages: 1,
                    more: false,
                    source: SOURCE,
                    url: categoryPath
                };

                console.log(`[Rutor Pro] Вызываем onSuccess с ${safeResponse.results.length} элементами`);
                onSuccess(safeResponse);

            } catch (e) {
                console.error('[Rutor Pro] Critical category error:', e);
                // Последняя линия обороны
                onSuccess({
                    results: [],
                    page: 1,
                    total_pages: 1,
                    more: false,
                    source: SOURCE,
                    url: ''
                });
            }
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addButton() {
        let attempts = 0;
        const tryAdd = () => {
            attempts++;
            const menu = document.querySelector('.menu__list') || document.querySelector('.menu .menu__list');
            if (!menu && attempts < 12) {
                setTimeout(tryAdd, 800);
                return;
            }
            if (document.querySelector('[data-rutor-pro]')) return;

            const li = document.createElement('li');
            li.className = 'menu__item selector';
            li.setAttribute('data-rutor-pro', '1');
            li.innerHTML = `<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;

            li.addEventListener('hover:enter', () => {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE,
                    title: SOURCE,
                    url: ''
                });
            });

            if (menu) menu.appendChild(li);
            console.log('[Rutor Pro] Кнопка добавлена');
        };

        setTimeout(tryAdd, 1000);
    }

    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        console.log(`[${SOURCE}] Плагин загружен`);
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });

})();
