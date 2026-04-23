(function () {
    const SOURCE = 'SimpleTest';
    const CATEGORIES = ['Категория A', 'Категория B'];

    function Api() {
        this.category = function (params, callback, errorCallback) {
            try {
                // Если нет url – показываем список категорий (линии)
                if (!params.url) {
                    var lines = [];
                    for (var i = 0; i < CATEGORIES.length; i++) {
                        lines.push({
                            title: CATEGORIES[i],
                            url: 'cat' + i,
                            type: 'line',
                            source: SOURCE,
                            more: true
                        });
                    }
                    callback({ results: lines, total_pages: 1 });
                } else {
                    // При клике на категорию показываем пустой список (для теста)
                    callback({ results: [], total_pages: 1 });
                }
            } catch (e) {
                console.error('SimpleTest error:', e);
                errorCallback(e);
            }
        };
        this.full = function (params, callback, errorCallback) {
            errorCallback('not implemented');
        };
    }

    // Добавляем кнопку в меню
    var menu = document.querySelector('.menu .menu__list');
    if (menu && !document.querySelector('[data-simpletest]')) {
        var li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-simpletest', '1');
        li.innerHTML = '<div class="menu__ico">🧪</div><div class="menu__text">Simple</div>';
        li.addEventListener('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE,
                title: SOURCE
            });
        });
        menu.appendChild(li);
    } else {
        setTimeout(arguments.callee, 300);
    }
})();
