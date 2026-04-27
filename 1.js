(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    // !!! ЗАМЕНИ ЭТУ ССЫЛКУ НА СВОЙ URL ИЗ CLOUDFLARE !!!
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    function Api() {
        this.category = function (params, onSuccess) {
            const path = params.url || '';
            fetch(`${PROXY}${path}`)
                .then(res => res.json())
                .then(data => {
                    // Исправление ошибки "data.forEach is not a function"
                    // Lampa ожидает объект, в котором есть массив results
                    if (data && Array.isArray(data.results)) {
                        onSuccess(data);
                    } else {
                        console.error('[Rutor Pro] Формат данных неверный', data);
                        onSuccess({ results: [] });
                    }
                })
                .catch(e => {
                    console.error('[Rutor Pro] Ошибка загрузки', e);
                    onSuccess({ results: [] });
                });
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addMenuItem() {
        if ($('.menu__list [data-rutor-pro="true"]').length) return;

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

            const target = menu.find('.menu__item:contains("Сериалы")');
            if (target.length) target.after(item);
            else menu.append(item);
        }
    }

    function start() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        Lampa.Api.sources[SOURCE] = new Api();

        setInterval(addMenuItem, 1000);
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuItem();
        });
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
