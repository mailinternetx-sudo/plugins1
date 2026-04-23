(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    // Категории, которые будут отображаться (соответствуют путям worker'а)
    const CATEGORIES = [
        { title: 'Зарубежные фильмы', path: 'lampac_movies_new' },
        { title: 'Русские фильмы', path: 'lampac_movies_ru_new' },
        { title: 'Зарубежные сериалы', path: 'lampac_all_tv_shows' },
        { title: 'Русские сериалы', path: 'lampac_all_tv_shows_ru' }
    ];

    // Запрос к worker'у для получения данных категории
    async function fetchCategory(path) {
        const url = `${PROXY}${path}?page=1`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.results || [];   // worker возвращает { results, page, total_pages, total_results }
    }

    // API для интеграции с Lampa
    function Api() {
        this.category = async function (params, onSuccess, onError) {
            try {
                const parts = [];

                // Параллельно загружаем все категории
                const results = await Promise.all(
                    CATEGORIES.map(async (cat) => {
                        try {
                            const items = await fetchCategory(cat.path);
                            return {
                                title: cat.title,
                                results: items.slice(0, 40), // ограничим количество (опционально)
                                type: 'line',
                                source: SOURCE
                            };
                        } catch (err) {
                            console.error(`Ошибка загрузки ${cat.title}:`, err);
                            return null;
                        }
                    })
                );

                // Фильтруем успешно загруженные линии с результатами
                for (const part of results) {
                    if (part && part.results.length) {
                        parts.push(part);
                    }
                }

                onSuccess(parts);
            } catch (e) {
                console.error('Rutor Pro error:', e);
                onError(e);
            }
        };

        // Детальная карточка — используем TMDB (можно оставить или заменить)
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
