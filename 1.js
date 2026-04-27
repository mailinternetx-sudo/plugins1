(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    // Статический список категорий — самый надёжный вариант
    const CATEGORIES = [
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
            setTimeout(() => controller.abort(), 10000);

            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            let data = await res.json();

            if (Array.isArray(data)) return { results: data };
            if (data && Array.isArray(data.results)) return data;

            return { results: [] };
        } catch (e) {
            console.error(`[Rutor Pro] Fetch error ${path}:`, e.message);
            return { results: [] };
        }
    }

    function Api() {
        this.category = async function (params, onSuccess) {
            console.log(`[Rutor Pro] category() вызвана | url="${params.url || ''}"`);

            const path = (params.url || '').trim();

            if (!path || path === 'categories') {
                // Показываем статическое меню — самый стабильный способ
                const results = CATEGORIES.map(cat => ({
                    title: cat.title,
                    url: cat.path,
                    type: 'line',
                    source: SOURCE,
                    page: 1,
                    more: true
                }));

                console.log(`[Rutor Pro] Показываем статическое меню (${results.length} категорий)`);
                onSuccess({ results: results });
                return;
            }

            // Для конкретных категорий запрашиваем с Worker
            console.log(`[Rutor Pro] Загружаем категорию: ${path}`);
            const data = await fetchCategory(path);

            const response = {
                results: Array.isArray(data.results) ? data.results : [],
                page: 1,
                total_pages: 1,
                more: false,
                source: SOURCE,
                url: path
            };

            onSuccess(response);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addButton() {
        setTimeout(() => {
            const menu = document.querySelector('.menu__list') || document.querySelector('.menu .menu__list');
            if (!menu) return;
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

            menu.appendChild(li);
            console.log('[Rutor Pro] Кнопка добавлена в меню');
        }, 1200);
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
