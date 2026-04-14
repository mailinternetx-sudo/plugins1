(function () {
    'use strict';

    const PLUGIN_NAME = 'V10 MAX';
    const SOURCE_NAME = 'v10_max';

    const GS_URL = 'https://script.google.com/macros/s/AKfycbw8Uz9ponRX6wUGKMRIiY_gc6_Pjv-B2l3S77_TdlrM9W-dR4ioflxm1QLurzmVO5s-/exec';
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';

    const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

    const ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4z"/></svg>';

    const CATEGORIES = {
        top24: { title: 'Топ 24ч', sheet: 'Топ 24ч', type: 'movie' },
        films: { title: 'Фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
        rusfilms: { title: 'Наши фильмы', sheet: 'Наши фильмы', type: 'movie' },
        series: { title: 'Сериалы', sheet: 'Зарубежные сериалы', type: 'tv' },
        russeries: { title: 'Наши сериалы', sheet: 'Наши сериалы', type: 'tv' }
    };

    const cache = {
        ids: {},
        tmdb: {}
    };

    function img(url) {
        if (!url) return '/img/img_broken.svg';
        if (url.startsWith('http')) return url.replace('http://', 'https://');
        return TMDB_IMG + url;
    }

    function normalize(item, type) {
        return {
            id: item.id,
            title: item.title || item.name,
            original_title: item.original_title || item.original_name,
            poster_path: img(item.poster_path),
            backdrop_path: img(item.backdrop_path),
            overview: item.overview || '',
            vote_average: item.vote_average || 0,
            release_date: item.release_date || item.first_air_date,
            type: type
        };
    }

    async function getIds(sheet) {
        if (cache.ids[sheet]) return cache.ids[sheet];

        const res = await fetch(GS_URL + '?sheet=' + encodeURIComponent(sheet));
        const json = await res.json();

        const ids = json.results || [];
        cache.ids[sheet] = ids;

        return ids;
    }

    async function getTMDB(id, type) {
        const key = id + type;
        if (cache.tmdb[key]) return cache.tmdb[key];

        const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=ru-RU`;

        try {
            const res = await fetch(url);
            const json = await res.json();

            if (!json || json.status_code) return null;

            const data = normalize(json, type);

            cache.tmdb[key] = data;
            return data;
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

                const promises = ids.map(id => getTMDB(id, cat.type));
                const results = (await Promise.all(promises)).filter(Boolean);

                Lampa.Loader.hide();

                onComplete({
                    results: results,
                    page: 1,
                    total_pages: 1,
                    total_results: results.length
                });

            } catch (e) {
                Lampa.Loader.hide();
                onError(e);
            }
        };

        this.full = function (params, onSuccess, onError) {
            params.method = params.card.type || 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    const api = new Api();
    Lampa.Api.sources[SOURCE_NAME] = api;

    function addMenu() {
        const el = $(`<li class="menu__item selector">
            <div class="menu__ico">${ICON}</div>
            <div class="menu__text">${PLUGIN_NAME}</div>
        </li>`);

        $('.menu .menu__list').append(el);

        el.on('hover:enter', () => {
            Lampa.Activity.push({
                title: PLUGIN_NAME,
                component: 'v10_max'
            });
        });
    }

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
                    url: key
                });
            });
        }
    });

    function start() {
        addMenu();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && start());

})();
