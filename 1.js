(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    
    // ⚠️ Убедись, что адрес актуальный
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    // Пути должны точно совпадать с тем, что обрабатывает Worker
    const CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа', path: 'top24' },
        { title: '🎬 Зарубежные фильмы',      path: 'movies' },
        { title: '🇷🇺 Наши фильмы',           path: 'movies_ru' },
        { title: '📺 Зарубежные сериалы',     path: 'tv_shows' },
        { title: '🇷🇺 Русские сериалы',       path: 'tv_shows_ru' },
        { title: '📡 ТВ передачи',            path: 'televizor' }
    ];

    // Основная функция запроса к Worker
    async function fetchCategory(path, page = 1) {
        try {
            const url = `${PROXY}${path}?page=${page}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут (важно для WebOS)

            const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Гарантируем, что id всегда число (критично для Lampa)
            if (data.results && Array.isArray(data.results)) {
                data.results = data.results.map(item => {
                    if (item.id !== undefined) {
                        item.id = typeof item.id === 'number' ? item.id : parseInt(item.id, 10) || 0;
                    }
                    return item;
                });
            }

            return data;
        } catch (e) {
            console.error(`[Rutor Pro] Fetch error for ${path}:`, e);
            throw e;
        }
    }
    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                const currentPage = params.page || 1;
                let categoryPath = params.url || params.category || '';

                // Если категория не выбрана — показываем список рубрик (главный экран плагина)
                if (!categoryPath) {
                    const lines = CATEGORIES.map(cat => ({
                        title: cat.title,
                        url: cat.path,           // важно: именно path
                        type: 'line',
                        source: SOURCE,
                        page: 1,
                        more: true
                    }));

                    onSuccess({ results: lines });
                    return;
                }

                // Запрашиваем контент категории
                const data = await fetchCategory(categoryPath, currentPage);

                const results = data.results || [];
                const totalPages = data.total_pages || 1;

                const response = {
                    results: results,
                    page: data.page || currentPage,
                    total_pages: totalPages,
                    more: currentPage < totalPages,
                    source: SOURCE,
                    url: categoryPath
                };

                onSuccess(response);
            } catch (e) {
                console.error('[Rutor Pro] Category error:', e);
                onError(e);
            }
        };

        // Детальная информация — делегируем TMDB (самый стабильный вариант)
        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        // Поиск (опционально, можно оставить пустым или тоже через TMDB)
        this.search = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.search(params, onSuccess, onError);
        };
    }
    // Добавление кнопки в главное меню Lampa
    function addButton() {
        let tryAdd = () => {
            const menu = document.querySelector('.menu .menu__list') || 
                        document.querySelector('.menu__list');
            
            if (!menu) {
                setTimeout(tryAdd, 600);
                return;
            }

            // Защита от дублирования
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
                    url: ''                    // пустой url = показать категории
                });
            });

            menu.appendChild(li);
        };

        // Запускаем с небольшой задержкой
        setTimeout(tryAdd, 800);
    }

    // Запуск плагина
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;

        const api = new Api();
        Lampa.Api.sources[SOURCE] = api;

        console.log(`[${SOURCE}] Плагин успешно загружен`);
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


