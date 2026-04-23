(function () {
    var SOURCE = 'Rutor Simple';
    function Api() {
        this.category = function (params, onSuccess, onError) {
            if (!params.url) {
                // Главный экран – возвращаем массив линий
                var lines = [
                    { title: 'Зарубежные фильмы', url: 'movies', type: 'line', source: SOURCE, more: true },
                    { title: 'Наши фильмы', url: 'movies_ru', type: 'line', source: SOURCE, more: true },
                    { title: 'Зарубежные сериалы', url: 'tv', type: 'line', source: SOURCE, more: true },
                    { title: 'Наши сериалы', url: 'tv_ru', type: 'line', source: SOURCE, more: true }
                ];
                onSuccess(lines);
            } else {
                // При клике на категорию – показываем пустой результат
                onSuccess({ results: [], page: 1, total_pages: 1 });
            }
        };
        this.full = function (params, onSuccess, onError) { onError('no'); };
    }
    // Добавляем кнопку в меню
    var menu = document.querySelector('.menu .menu__list');
    if (menu && !document.querySelector('[data-rutor-simple]')) {
        var li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-simple', '1');
        li.innerHTML = '<div class="menu__ico">📁</div><div class="menu__text">Rutor Simple</div>';
        li.addEventListener('hover:enter', function () {
            Lampa.Activity.push({ component: 'category', source: SOURCE, title: SOURCE });
        });
        menu.appendChild(li);
        Lampa.Api.sources[SOURCE] = new Api();
    }
})();
