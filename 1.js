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

    async function fetchCategory(path, page = 1) {
        try {
            const url = `${PROXY}${path}?page=${page}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            let data = await response.json();

            // КРИТИЧНЫЙ ФИКС: всегда возвращаем объект { results: [...] }
            if (Array.isArray(data)) {
                data = { results: data };
            } else if (data && !data.results) {
                data.results = [];
            }

            // Приводим id к числу
            if (data.results && Array.isArray(data.results)) {
                data.results = data.results.map(item => {
                    if (item && item.id !== undefined) {
                        item.id = typeof item.id === 'number' ? item.id : parseInt(item.id, 10) || 0;
                    }
                    return item;
                });
            }

            return data;
        } catch (e) {
            console.error(`[Rutor Pro] Fetch failed for "${path}":`, e.message);
            throw e;
        }
    }

    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                let categoryPath = (params.url || params.category || '').trim();

                let data;

                if (!categoryPath || categoryPath === 'categories' || categoryPath === 'menu') {
                    // Список категорий
                    data = await fetchCategory('categories');
                } else {
                    // Конкретная категория (movies, top24 и т.д.)
                    data = await fetchCategory(categoryPath);
                }

                // Финальная гарантия правильного формата
                const response = {
                    results: (data && data.results) ? data.results : [],
                    page: data.page || 1,
                    total_pages: data.total_pages || 1,
                    more: false,
                    source: SOURCE,
                    url: categoryPath
                };

                onSuccess(response);

            } catch (e) {
                console.error('[Rutor Pro] Category error:', e);
                if (onError) onError(e);
                else Lampa.Noty.show('Rutor Pro: Ошибка загрузки данных', { timeout: 5000 });
            }
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        this.search = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.search(params, onSuccess, onError);
        };
    }

    function addButton() {
        let attempts = 0;
        const tryAdd = () => {
            attempts++;
            const menu = document.querySelector('.menu__list') || document.querySelector('.menu .menu__list');
            if (!menu && attempts < 15) {
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

            menu.appendChild(li);
        };

        setTimeout(tryAdd, 1000);
    }

    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        console.log(`[${SOURCE}] Плагин успешно загружен`);
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });

})();
