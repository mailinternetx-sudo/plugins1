(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    
    // ⚠️ Замените на ваш актуальный адрес Worker
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    // Fallback категории, если Worker недоступен
    const CATEGORIES_FALLBACK = [
        { title: '🔥 Топ торренты за 24 часа', path: 'top24' },
        { title: '🎬 Зарубежные фильмы',      path: 'movies' },
        { title: '🇷🇺 Наши фильмы',           path: 'movies_ru' },
        { title: '📺 Зарубежные сериалы',     path: 'tv_shows' },
        { title: '🇷🇺 Русские сериалы',       path: 'tv_shows_ru' },
        { title: '📡 ТВ передачи',            path: 'televizor' }
    ];

    // Основная функция запроса к Worker (исправлена CORS ошибка)
    async function fetchCategory(path, page = 1) {
        try {
            const url = `${PROXY}${path}?page=${page}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 секунд

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Принудительно делаем id числом (критично для Lampa)
            if (data.results && Array.isArray(data.results)) {
                data.results = data.results.map(item => {
                    if (item.id !== undefined && item.id !== null) {
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
                const currentPage = params.page || 1;
                let categoryPath = (params.url || params.category || '').trim();

                // Если нет пути — запрашиваем список категорий
                if (!categoryPath || categoryPath === '' || categoryPath === 'categories' || categoryPath === 'menu') {
                    const data = await fetchCategory('categories', 1);
                    
                    if (data && data.results && data.results.length > 0) {
                        onSuccess(data);
                        return;
                    }
                    
                    // Fallback, если Worker не ответил
                    console.warn('[Rutor Pro] Используем fallback категорий');
                    const fallbackLines = CATEGORIES_FALLBACK.map(cat => ({
                        title: cat.title,
                        url: cat.path,
                        type: 'line',
                        source: SOURCE,
                        page: 1,
                        more: true
                    }));
                    onSuccess({ results: fallbackLines });
                    return;
                }

                // Запрос конкретной категории
                const data = await fetchCategory(categoryPath, currentPage);

                const response = {
                    results: data.results || [],
                    page: data.page || currentPage,
                    total_pages: data.total_pages || 1,
                    more: currentPage < (data.total_pages || 1),
                    source: SOURCE,
                    url: categoryPath
                };

                onSuccess(response);

            } catch (e) {
                console.error('[Rutor Pro] Category error:', e);
                if (onError) {
                    onError(e);
                } else {
                    Lampa.Noty.show('Rutor Pro: Не удалось загрузить данные. Проверьте подключение.', { timeout: 5000 });
                }
            }
        };

        // Детальная карточка через TMDB
        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        // Поиск через TMDB
        this.search = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.search(params, onSuccess, onError);
        };
    }

    // Добавление кнопки в главное меню
    function addButton() {
        let attempts = 0;
        const maxAttempts = 15;

        let tryAdd = () => {
            attempts++;
            const menu = document.querySelector('.menu__list') || document.querySelector('.menu .menu__list');

            if (!menu) {
                if (attempts < maxAttempts) {
                    setTimeout(tryAdd, 800);
                }
                return;
            }

            if (document.querySelector('[data-rutor-pro]')) return;

            const li = document.createElement('li');
            li.className = 'menu__item selector';
            li.setAttribute('data-rutor-pro', '1');
            li.innerHTML = `
                <div class="menu__ico">🔥</div>
                <div class="menu__text">${SOURCE}</div>
            `;

            li.addEventListener('hover:enter', () => {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE,
                    title: SOURCE,
                    url: ''
                });
            });

            menu.appendChild(li);
            console.log(`[${SOURCE}] Кнопка добавлена в меню`);
        };

        setTimeout(tryAdd, 1200);
    }

    // Запуск плагина
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;

        const api = new Api();
        Lampa.Api.sources[SOURCE] = api;

        console.log(`[${SOURCE}] Плагин успешно инициализирован`);
        addButton();
    }

    // Автозапуск
    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') start();
        });
    }

})();
