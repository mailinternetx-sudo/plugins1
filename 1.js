(function () {
    'use strict';

    // ВАЖНО: Укажи здесь свой URL воркера (обязательно с / в конце)
    const WORKER_URL = 'https://your-worker-name.workers.dev/'; 
    const SOURCE_ID = 'rutor_pro_v2';
    const SOURCE_NAME = 'Rutor Pro';

    function RutorApi() {
        this.category = function (params, onSuccess, onError) {
            const route = (params.url || 'menu').replace(/^\/|\/$/g, '');
            
            fetch(WORKER_URL + route)
                .then(response => {
                    if (!response.ok) throw new Error('Network error');
                    return response.json();
                })
                .then(json => {
                    // ГАРАНТИЯ: Проверяем наличие массива результатов
                    if (json && Array.isArray(json.results)) {
                        onSuccess(json);
                    } else {
                        onSuccess({ results: [] });
                    }
                })
                .catch(e => {
                    console.error('[Rutor] Error:', e);
                    onSuccess({ results: [] }); // Не даем Lampa упасть
                });
        };

        this.full = function (params, onSuccess, onError) {
            // Используем стандартный TMDB для открытия полной информации
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function init() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        // Регистрируем источник данных
        Lampa.Api.sources[SOURCE_NAME] = new RutorApi();

        const addMenuItem = function () {
            if ($(`.menu__list [data-action="${SOURCE_ID}"]`).length) return;

            const menu = $('.menu__list');
            const item = $(`
                <li class="menu__item selector" data-action="${SOURCE_ID}">
                    <div class="menu__ico"><svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg></div>
                    <div class="menu__text">${SOURCE_NAME}</div>
                </li>
            `);

            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    title: SOURCE_NAME,
                    url: 'menu',
                    component: 'category',
                    source: SOURCE_NAME,
                    page: 1
                });
            });

            menu.append(item);
        };

        // Ждем готовности приложения
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                addMenuItem();
            }
        });

        // Резервный запуск для WebOS
        setInterval(addMenuItem, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
