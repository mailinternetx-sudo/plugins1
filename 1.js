(function () {
    'use strict';
    const PROXY_URL = 'https://твой-воркер.workers.dev/'; // ПРОВЕРЬ ЭТУ ССЫЛКУ!

    function Api() {
        this.category = function (params, onSuccess) {
            const url = (params.url || '').replace(/^\/|\/$/g, '');
            
            fetch(PROXY_URL + url)
                .then(res => res.json())
                .then(data => {
                    // ПРЕДОХРАНИТЕЛЬ: Проверяем, что результаты - это массив
                    if (data && Array.isArray(data.results)) {
                        onSuccess(data);
                    } else {
                        console.error('Worker returned invalid data format');
                        onSuccess({ results: [] });
                    }
                })
                .catch(e => {
                    console.error('Network error or invalid Worker URL');
                    onSuccess({ results: [] });
                });
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    function start() {
        window.rutor_plugin = true;
        Lampa.Api.sources['Rutor Pro'] = new Api();
        
        const initMenu = function() {
            if ($('.menu__list [data-rutor="true"]').length) return;
            const item = $(`<li class="menu__item selector" data-rutor="true"><div class="menu__ico">🔥</div><div class="menu__text">Rutor Pro</div></li>`);
            item.on('hover:enter', () => {
                Lampa.Activity.push({ title: 'Rutor Pro', component: 'category', source: 'Rutor Pro', url: '' });
            });
            $('.menu .menu__list').append(item);
        };

        Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') initMenu(); });
        setInterval(initMenu, 2000);
    }

    start();
})();
