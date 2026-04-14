(function () {
    'use strict';

    const PLUGIN_NAME = 'V10 ULTRA';
    const SOURCE_NAME = 'v10_ultra';

    const GS_URL = 'https://script.google.com/macros/s/AKfycbzhYIM6Gkn2VjiBZlRpfQpOa8W7eJkSAeBn3Fw6_sgeIoJMJffOfL14SuiY0zaniZvS/exec';

    const ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4z"/></svg>';

    const CATEGORIES = {
        top24: { title: 'Топ 24ч', sheet: 'Топ 24ч' },
        films: { title: 'Фильмы', sheet: 'Зарубежные фильмы' },
        rusfilms: { title: 'Наши фильмы', sheet: 'Наши фильмы' },
        series: { title: 'Сериалы', sheet: 'Зарубежные сериалы' },
        russeries: { title: 'Наши сериалы', sheet: 'Наши сериалы' }
    };

    function normalize(item) {
        return {
            id: item.id,
            title: item.title,
            original_title: item.title,
            poster_path: item.poster_path,
            backdrop_path: item.poster_path,
            overview: '',
            vote_average: item.vote_average,
            type: item.type
        };
    }

    function Api() {
        this.discovery = false;

        this.list = function (params, onComplete, onError) {
            const cat = CATEGORIES[params.url];
            if (!cat) return onError();

            Lampa.Loader.show();

            fetch(GS_URL + '?sheet=' + encodeURIComponent(cat.sheet))
                .then(r => r.json())
                .then(json => {
                    const items = (json.results || []).map(normalize);

                    Lampa.Loader.hide();

                    onComplete({
                        results: items,
                        page: 1,
                        total_pages: 1
                    });
                })
                .catch(err => {
                    Lampa.Loader.hide();
                    Lampa.Notification.show('Ошибка API');
                    onError(err);
                });
        };

        this.full = function (params, onSuccess, onError) {
            params.method = params.card.type;
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    Lampa.Api.sources[SOURCE_NAME] = new Api();

    Lampa.Component.add('v10_ultra', {
        render: function () {
            let html = '<div class="selector-list">';

            Object.keys(CATEGORIES).forEach(key => {
                html += `<div class="selector-item" data-key="${key}">${CATEGORIES[key].title}</div>`;
            });

            html += '</div>';
            this.html(html);

            this.find('.selector-item').on('click', (e) => {
                const key = $(e.currentTarget).data('key');

                Lampa.Activity.push({
                    title: CATEGORIES[key].title,
                    component: 'category',
                    source: SOURCE_NAME,
                    url: key
                });
            });
        }
    });

    function start() {
        if ($('.menu__item[data-action="v10_ultra"]').length) return;

        const item = $(`
            <li data-action="v10_ultra" class="menu__item selector">
                <div class="menu__ico">${ICON}</div>
                <div class="menu__text">${PLUGIN_NAME}</div>
            </li>
        `);

        $('.menu .menu__list').eq(0).append(item);

        item.on('hover:enter', () => {
            Lampa.Activity.push({
                title: PLUGIN_NAME,
                component: 'v10_ultra'
            });
        });
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') start();
        });
    }

})();
