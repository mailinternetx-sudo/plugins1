(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/'; // Ваш worker

    // Список категорий с заголовками и путями для worker'а
    const CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа', path: 'lampac_top24' },
        { title: '🎬 Зарубежные фильмы', path: 'lampac_movies' },
        { title: '🇷🇺 Наши фильмы', path: 'lampac_movies_ru' },
        { title: '📺 Зарубежные сериалы', path: 'lampac_tv_shows' },
        { title: '🇷🇺 Наши сериалы', path: 'lampac_tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)', path: 'lampac_televizor' }
    ];

    // Запрос к worker'у для получения данных категории с пагинацией
    async function fetchCategory(path, page = 1) {
        const url = `${PROXY}${path}?page=${page}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data; // { results, page, total_pages, total_results }
    }

    // API для интеграции с Lampa
    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                // params может содержать url (выбранная категория) и page
                let currentPage = params.page || 1;
                let categoryPath = params.url;

                // Если категория не указана – отображаем список всех (главная)
                if (!categoryPath) {
                    // Возвращаем "линии" (категории) для главного экрана
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

                // Запрашиваем конкретную категорию
                const data = await fetchCategory(categoryPath, currentPage);
                const results = data.results || [];

                // Формируем ответ для Lampa
                const response = {
                    results: results,
                    page: data.page || currentPage,
                    total_pages: data.total_pages || 1,
                    more: (data.page || currentPage) < (data.total_pages || 1),
                    source: SOURCE,
                    url: categoryPath
                };
                onSuccess(response);
            } catch (e) {
                console.error('Rutor Pro error:', e);
                onError(e);
            }
        };

        // Детальная карточка – используем TMDB (можно оставить как есть)
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

    // Инициализация
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        let api = new Api();
        Lampa.Api.sources[SOURCE] = api;
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
