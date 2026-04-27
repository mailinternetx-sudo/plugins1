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

            // Жёсткая защита
            if (Array.isArray(data)) {
                return { results: data };
            }
            if (data && Array.isArray(data.results)) {
                return data;
            }
            return { results: [] };

        } catch (e) {
            console.error(`[Rutor Pro] Ошибка запроса ${path}:`, e.message);
            return { results: [] };
        }
    }

    function Api() {
        this.category = async function (params, onSuccess) {
            console.log(`[Rutor Pro] Запуск категории, url="${params.url || ''}"`);

            const categoryPath = (params.url || '').trim() || 'categories';

            const data = await fetchCategory(categoryPath);

            // Самый важный момент — правильная структура
            const response = {
                results: Array.isArray(data.results) ? data.results : [],
                page: 1,
                total_pages: 1,
                more: false,
                source: SOURCE,
                url: categoryPath
            };

            console.log(`[Rutor Pro] Передаём в Lampa ${response.results.length} элементов`);
            onSuccess(response);
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // Добавление кнопки
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
        }, 1500);
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
