(function () {
    'use strict';
    const SOURCE = 'Rutor Pro';
    // ⚠️ ЗАМЕНИТЕ НА РЕАЛЬНЫЙ АДРЕС ВАШЕГО WORKER'А
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
    
    // Пути должны совпадать с теми, что обрабатывает worker (detectRutorCategory)
    const CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа',    path: 'top24' },
        { title: '🎬 Зарубежные фильмы',          path: 'movies' },
        { title: '🇷🇺 Наши фильмы',                path: 'movies_ru' },
        { title: '📺 Зарубежные сериалы',         path: 'tv_shows' },
        { title: '🇷🇺 Наши сериалы',               path: 'tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)',    path: 'televizor' }
    ];

    // Запрос к worker'у (worker игнорирует page, но оставим для совместимости)
    async function fetchCategory(path, page = 1) {
        const url = `${PROXY}${path}?page=${page}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // Гарантируем, что id – число (worker иногда отдаёт строку)
        if (data.results) {
            data.results = data.results.map(item => {
                if (item.id && typeof item.id !== 'number') {
                    item.id = parseInt(item.id, 10) || 0;
                }
                return item;
            });
        }
        return data; // { results, page, total_pages, total_results }
    }

    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                let currentPage = params.page || 1;
                let categoryPath = params.url;

                // Если категория не выбрана – показываем список рубрик (главный экран)
                if (!categoryPath) {
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
                console.error('Rutor Pro error:', e);
                onError(e);
            }
        };

        // Детальная карточка – используем встроенный TMDB (можно оставить)
        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // Добавление кнопки в главное меню
    function addButton() {
        let tryAdd = () => {
            let menu = document.querySelector('.menu .menu__list');
            if (!menu) return setTimeout(tryAdd, 500);
            if (document.querySelector('[data-rutor-pro]')) return;
            let li = document.createElement('li');
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
                    title: SOURCE
                });
            });
            menu.appendChild(li);
        };
        tryAdd();
    }

    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        let api = new Api();
        Lampa.Api.sources[SOURCE] = api;
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
