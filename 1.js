(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    const CATEGORIES = [
        { title: '🔥 Топ за 24 часа', path: 'top24' },
        { title: '🎬 Зарубежные фильмы', path: 'movies' },
        { title: '🇷🇺 Наши фильмы', path: 'movies_ru' },
        { title: '📺 Зарубежные сериалы', path: 'tv_shows' },
        { title: '🇷🇺 Русские сериалы', path: 'tv_shows_ru' },
        { title: '📡 ТВ передачи', path: 'televizor' }
    ];

    function Api() {
        this.category = function (params, onSuccess, onError) {
            console.log(`[Rutor Pro] category() вызвана | url = "${params.url || ''}"`);

            const path = (params.url || '').trim();

            if (!path) {
                // Показываем меню — простой формат
                const results = CATEGORIES.map(cat => ({
                    title: cat.title,
                    url: cat.path,
                    source: SOURCE
                }));

                console.log(`[Rutor Pro] Показываем меню (${results.length} категорий)`);
                onSuccess({ results: results });
                return;
            }

            // Для конкретных категорий — запрос к Worker
            fetch(`${PROXY}${path}?page=1`)
                .then(r => r.json())
                .then(data => {
                    const results = Array.isArray(data.results) ? data.results : [];
                    console.log(`[Rutor Pro] Загружено ${results.length} тайтлов из ${path}`);
                    onSuccess({
                        results: results,
                        page: 1,
                        total_pages: 1,
                        more: false,
                        source: SOURCE
                    });
                })
                .catch(err => {
                    console.error('[Rutor Pro] Ошибка загрузки категории:', err);
                    onSuccess({ results: [], source: SOURCE });
                });
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
