(function () {
    var SOURCE = 'Тест Категории';
    function Api() {
        this.category = function (params, onSuccess, onError) {
            try {
                // Всегда возвращаем список линий
                var lines = [
                    { title: 'Линия 1', url: 'test1', type: 'line', source: SOURCE, more: true },
                    { title: 'Линия 2', url: 'test2', type: 'line', source: SOURCE, more: true }
                ];
                onSuccess({ results: lines, page: 1, total_pages: 1 });
            } catch (e) {
                console.error('[Test] error', e);
                onError(e);
            }
        };
        this.full = function (params, onSuccess, onError) { onError('no'); };
    }
    function addButton() {
        var menu = document.querySelector('.menu .menu__list');
        if (!menu) return setTimeout(addButton, 500);
        if (document.querySelector('[data-test-cat]')) return;
        var li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-test-cat', '1');
        li.innerHTML = '<div class="menu__ico">🔧</div><div class="menu__text">Test</div>';
        li.addEventListener('hover:enter', function () {
            Lampa.Activity.push({ component: 'category', source: SOURCE, title: SOURCE });
        });
        menu.appendChild(li);
    }
    if (window.appready) {
        Lampa.Api.sources[SOURCE] = new Api();
        addButton();
    } else {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') { Lampa.Api.sources[SOURCE] = new Api(); addButton(); } });
    }
})();
