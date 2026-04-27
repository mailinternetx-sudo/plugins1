(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

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

            if (Array.isArray(data)) data = { results: data };
            if (!data || !Array.isArray(data.results)) data = { results: [] };

            return data;
        } catch (e) {
            console.error(`[Rutor Pro] Fetch error ${path}:`, e.message);
            return { results: [] };
        }
    }

    function Api() {
        this.category = async function (params, onSuccess) {
            console.log(`[Rutor Pro] category() вызвана, url="${params.url || ''}"`);

            const isMenu = !params.url || params.url === '' || params.url === 'categories';

            if (isMenu) {
                // === СПИСОК КАТЕГОРИЙ ===
                const data = await fetchCategory('categories');

                const results = (data.results || []).map((cat, index) => ({
                    id: index + 1000,                    // обязательно число
                    title: cat.title || cat.name || 'Категория',
                    url: cat.url || cat.path || '',
                    type: 'line',
                    card_type: 'line',                   // добавлено
                    source: SOURCE,
                    page: 1,
                    more: true,
                    action: 'category'                   // добавлено
                }));

                const response = {
                    results: results,
                    page: 1,
                    total_pages: 1,
                    more: false,
                    source: SOURCE
                };

                console.log(`[Rutor Pro] Передаём меню с ${results.length} категориями`);
                onSuccess(response);

            } else {
                // === КОНКРЕТНАЯ КАТЕГОРИЯ ===
                const data = await fetchCategory(params.url);

                const response = {
                    results: Array.isArray(data.results) ? data.results : [],
                    page: 1,
                    total_pages: 1,
                    more: false,
                    source: SOURCE,
                    url: params.url
                };

                onSuccess(response);
            }
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
            console.log('[Rutor Pro] Кнопка добавлена');
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
