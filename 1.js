(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    // ЗАМЕНИ НА СВОЙ URL WORKER!
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    function Api() {
        this.category = function (params, onSuccess) {
            const path = params.url || '';
            fetch(`${PROXY}${path}`)
                .then(res => res.json())
                .then(data => {
                    onSuccess({
                        results: data.results || [],
                        page: 1,
                        total_pages: 1,
                        more: false
                    });
                })
                .catch(() => onSuccess({ results: [] }));
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addMenuItem() {
        // Проверяем, не добавлена ли кнопка уже
        if ($('.menu__list [data-rutor-pro="true"]').length) return;

        // Ищем основной список меню
        const menu = $('.menu__list');
        if (menu.length) {
            const item = $(`<li class="menu__item selector" data-rutor-pro="true">
                <div class="menu__ico">🔥</div>
                <div class="menu__text">${SOURCE}</div>
            </li>`);

            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: SOURCE,
                    component: 'category',
                    source: SOURCE,
                    page: 1
                });
            });

            // Добавляем после пункта "Сериалы" или просто в конец
            const serials = menu.find('.menu__item:contains("Сериалы")');
            if (serials.length) serials.after(item);
            else menu.append(item);
            
            console.log('[Rutor Pro] Кнопка добавлена');
        }
    }

    function start() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        // Регистрация API
        Lampa.Api.sources[SOURCE] = new Api();

        // Запускаем цикличную проверку появления меню (актуально для медленных ТВ)
        const timer = setInterval(() => {
            addMenuItem();
            // Если кнопка появилась, можно снизить частоту проверок, но не выключать
            // (на случай если Lampa перерисует меню полностью)
        }, 1000);

        // На всякий случай дублируем через стандартный слушатель
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuItem();
        });
    }

    // Запуск
    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });

})();
