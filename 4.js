(function () {
    'use strict';

    const PLUGIN = 'V10 MAX';
    const SOURCE = 'v10_max';

    const GS_URL = 'https://script.google.com/macros/s/AKfycbzGzQVf65Fk9xL9Z9az0dANO7T2BzCIzr-H1xdUnVhWcdLy15NE2yZf_x4ZpgxO3kgT/exec';

    const CATEGORIES = {
        top: { title: '🔥 Топ 24ч', sheet: 'Топ 24ч' },
        movies: { title: '🎬 Фильмы', sheet: 'Зарубежные фильмы' },
        serials: { title: '📺 Сериалы', sheet: 'Зарубежные сериалы' }
    };

    function Api() {

        this.list = function (params, onComplete, onError) {
            const cat = CATEGORIES[params.url];

            Lampa.Loader.show();

            fetch(GS_URL + '?sheet=' + encodeURIComponent(cat.sheet))
                .then(r => r.json())
                .then(json => {
                    Lampa.Loader.hide();

                    onComplete({
                        results: json.results,
                        page: 1,
                        total_pages: 1
                    });
                })
                .catch(err => {
                    Lampa.Loader.hide();
                    onError(err);
                });
        };

        this.full = function (params, onSuccess, onError) {
            // 🔥 используем стандарт TMDB full
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    Lampa.Api.sources[SOURCE] = new Api();

    Lampa.Component.add('v10_max', {
        template: 'categories',
        data: function () {
            return {
                categories: Object.keys(CATEGORIES).map(k => ({
                    key: k,
                    title: CATEGORIES[k].title
                }))
            };
        },
        render: function (data) {
            let html = '<div class="selector-list">';
            data.categories.forEach(c => {
                html += `<div class="selector-item" data-key="${c.key}">${c.title}</div>`;
            });
            html += '</div>';

            this.dom.html(html);

            this.dom.find('.selector-item').on('click', (e) => {
                const key = $(e.currentTarget).data('key');

                Lampa.Activity.push({
                    title: CATEGORIES[key].title,
                    component: 'category',
                    source: SOURCE,
                    url: key
                });
            });
        }
    });

    function start() {
        Lampa.Activity.push({
            title: PLUGIN,
            component: 'v10_max'
        });
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && start());

})();
