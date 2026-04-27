(function () {
    'use strict';
    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/'; // Твой URL

    function Api() {
        this.category = function (params, onSuccess) {
            // Если url пустой — запрашиваем меню, если нет — конкретный путь
            const path = (params.url || '').replace(/^\/|\/$/g, ''); 
            
            fetch(`${PROXY}${path}`)
                .then(res => res.json())
                .then(data => {
                    // КРИТИЧЕСКАЯ ПРОВЕРКА ДЛЯ FIX FOR_EACH
                    if (data && Array.isArray(data.results)) {
                        onSuccess(data);
                    } else {
                        onSuccess({ results: [] });
                    }
                })
                .catch(() => onSuccess({ results: [] }));
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function addMenuItem() {
        if ($('.menu__list [data-rutor-pro="true"]').length) return;
        const menu = $('.menu__list');
        if (menu.length) {
            const item = $(`<li class="menu__item selector" data-rutor-pro="true"><div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div></li>`);
            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '', // Оставляем пустым для вызова корневого меню категорий
                    title: SOURCE,
                    component: 'category',
                    source: SOURCE,
                    page: 1
                });
            });
            menu.append(item);
        }
    }

    function start() {
        if (window.rutor_pro_inited) return;
        window.rutor_pro_inited = true;
        Lampa.Api.sources[SOURCE] = new Api();
        setInterval(addMenuItem, 1000);
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
