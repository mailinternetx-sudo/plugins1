(function () {
    'use strict';
    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://твой-воркер.workers.dev/'; // ЗАМЕНИТЬ НА СВОЙ

    function Api() {
        this.category = function (params, onSuccess) {
            const url = (params.url || '').replace(/^\/|\/$/g, '');
            fetch(PROXY + url)
                .then(res => res.json())
                .then(data => {
                    if (data && Array.isArray(data.results)) onSuccess(data);
                    else onSuccess({ results: [] });
                })
                .catch(() => onSuccess({ results: [] }));
        };
        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function start() {
        if (window.rutor_inited) return;
        window.rutor_inited = true;
        Lampa.Api.sources[SOURCE] = new Api();
        
        const add = () => {
            if ($('.menu__list [data-rutor="true"]').length) return;
            const item = $(`<li class="menu__item selector" data-rutor="true"><div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div></li>`);
            item.on('hover:enter', () => {
                Lampa.Activity.push({ title: SOURCE, component: 'category', source: SOURCE, url: '' });
            });
            $('.menu .menu__list').append(item);
        };
        
        Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') add(); });
        setInterval(add, 2000); // Страховка для WebOS
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
