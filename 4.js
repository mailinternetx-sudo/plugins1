(function () {
    'use strict';
    const SOURCE = 'Rutor Pro Test';
    const CATEGORIES = [
        { title: 'Тестовая категория 1' },
        { title: 'Тестовая категория 2' }
    ];
    function Api() {
        this.category = function (params, onSuccess, onError) {
            try {
                if (!params.url) {
                    const lines = CATEGORIES.map(cat => ({
                        title: cat.title,
                        url: 'test',
                        type: 'line',
                        source: SOURCE,
                        page: 1,
                        more: false
                    }));
                    onSuccess({ results: lines, page: 1, total_pages: 1, more: false });
                } else {
                    onSuccess({ results: [], page: 1, total_pages: 1, more: false });
                }
            } catch(e) {
                console.error('Test error:', e);
                onError(e);
            }
        };
        this.full = function(params, onSuccess, onError) { onError('no'); };
    }
    function addButton() {
        const menu = document.querySelector('.menu .menu__list');
        if (!menu) return setTimeout(addButton, 500);
        if (document.querySelector('[data-rutor-test]')) return;
        const li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-test', '1');
        li.innerHTML = '<div class="menu__ico">🧪</div><div class="menu__text">Test</div>';
        li.addEventListener('hover:enter', () => {
            Lampa.Activity.push({ component: 'category', source: SOURCE, title: SOURCE });
        });
        menu.appendChild(li);
    }
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        addButton();
    }
    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
