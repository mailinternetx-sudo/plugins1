(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
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

    function start() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;

        Lampa.Api.sources[SOURCE] = new Api();

        // Добавление в меню через стандартный механизм Lampa
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                const menu_item = $(`<li class="menu__item selector" data-rutor-pro="true">
                    <div class="menu__ico">🔥</div>
                    <div class="menu__text">${SOURCE}</div>
                </li>`);

                menu_item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: SOURCE,
                        component: 'category',
                        source: SOURCE,
                        page: 1
                    });
                });

                $('.menu .menu__list').append(menu_item);
            }
        });
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
