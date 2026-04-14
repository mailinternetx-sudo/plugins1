(function () {
    'use strict';

    const PLUGIN_NAME = 'V10 MAX';
    const SOURCE_NAME = 'v10_max';

    const GS_URL = 'https://script.google.com/macros/s/AKfycbyyl-D2v4BIqJtc6dg2HDG7ilZwc5JZrCV5r4oHZtc4hJiuMN08oCTRYp7lkySwTDCB/exec';
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

    const ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4z"/></svg>';

    const CATEGORIES = {
        top24: { title: 'Топ 24ч', sheet: 'Топ 24ч', type: 'movie' },
        films: { title: 'Фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
        series: { title: 'Сериалы', sheet: 'Зарубежные сериалы', type: 'tv' }
    };

    function img(url) {
        if (!url) return '/img/img_broken.svg';
        if (url.startsWith('http')) return url.replace('http://', 'https://');
        return TMDB_IMG + url;
    }

    async function getIds(sheet) {
        const res = await fetch(GS_URL + '?sheet=' + encodeURIComponent(sheet));
        const json = await res.json();
        return json.results || [];
    }

    async function getTMDB(id, type) {
        const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=ru-RU`;

        try {
            const res = await fetch(url);
            const j = await res.json();

            if (!j || j.status_code) return null;

            return {
                id: j.id,
                title: j.title || j.name,
                original_title: j.original_title || j.original_name,
                poster_path: img(j.poster_path),
                backdrop_path: img(j.backdrop_path),
                overview: j.overview,
                vote_average: j.vote_average,
                release_date: j.release_date || j.first_air_date,
                type: type
            };
        } catch (e) {
            return null;
        }
    }

    function Api() {
        this.discovery = false;

        this.list = async function (params, onComplete, onError) {
            const cat = CATEGORIES[params.url];
            if (!cat) return onError();

            try {
                Lampa.Loader.show();

                const ids = await getIds(cat.sheet);
                const results = [];

                for (let id of ids) {
                    const item = await getTMDB(id, cat.type);
                    if (item) results.push(item);
                }

                Lampa.Loader.hide();

                onComplete({
                    results: results,
                    page: 1,
                    total_pages: 1
                });

            } catch (e) {
                Lampa.Loader.hide();
                onError(e);
            }
        };

        this.full = function (params, onSuccess, onError) {
            params.method = params.card.type;
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    const api = new Api();
    Lampa.Api.sources[SOURCE_NAME] = api;

    // ✅ КОМПОНЕНТ
    Lampa.Component.add('v10_max', {
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
                    url: key,
                    page: 1
                });
            });
        }
    });

    // ✅ МЕНЮ (ФИКС)
    function addMenu() {
        if ($('.menu__item[data-action="v10_max"]').length) return;

        const item = $(`
            <li data-action="v10_max" class="menu__item selector">
                <div class="menu__ico">${ICON}</div>
                <div class="menu__text">${PLUGIN_NAME}</div>
            </li>
        `);

        $('.menu .menu__list').eq(0).append(item);

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                title: PLUGIN_NAME,
                component: 'v10_max'
            });
        });
    }

    function start() {
        if (window.v10_max_started) return;
        window.v10_max_started = true;

        addMenu();
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }

})();
