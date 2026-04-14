(function () {
    'use strict';

    const PLUGIN_NAME = 'V10 Ultra';
    const SOURCE_NAME = 'v10_ultra';

    const GS_URL = 'https://script.google.com/macros/s/AKfycbw4AwJsLhB_AAP7cmBcAvTGbCbVtiIUVH58OgbKQC9LIDLNlV8_Nl5xR8tbhPMQImCd/exec';

    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

    const CATEGORIES = {
        top24: { title: '🔥 Топ 24ч', sheet: 'Топ 24ч' },
        movies: { title: '🎬 Фильмы', sheet: 'Зарубежные фильмы' },
        serials: { title: '📺 Сериалы', sheet: 'Зарубежные сериалы' }
    };

    const cache = {};

    function fetchSheet(sheet) {
        if (cache[sheet]) return Promise.resolve(cache[sheet]);

        return fetch(GS_URL + '?sheet=' + encodeURIComponent(sheet))
            .then(r => r.json())
            .then(j => {
                cache[sheet] = j.results || [];
                return cache[sheet];
            });
    }

    function fetchTMDB(item) {
        const key = item.id + '_' + item.type;
        if (cache[key]) return Promise.resolve(cache[key]);

        const url = `https://api.themoviedb.org/3/${item.type}/${item.id}?api_key=${TMDB_API_KEY}&language=ru-RU`;

        return fetch(url)
            .then(r => r.json())
            .then(d => {
                const result = {
                    id: d.id,
                    title: d.title || d.name,
                    poster_path: d.poster_path ? TMDB_IMG + d.poster_path : '',
                    backdrop_path: d.backdrop_path ? TMDB_IMG + d.backdrop_path : '',
                    overview: d.overview,
                    vote_average: d.vote_average,
                    release_date: d.release_date || d.first_air_date
                };
                cache[key] = result;
                return result;
            });
    }

    function Api() {
        this.list = function (params, onComplete) {
            const cat = CATEGORIES[params.url];

            Lampa.Loader.show();

            fetchSheet(cat.sheet).then(async list => {

                // ⚡ ПАРАЛЛЕЛЬНАЯ загрузка (важно!)
                const promises = list.map(i => fetchTMDB(i));
                const results = await Promise.all(promises);

                Lampa.Loader.hide();

                onComplete({
                    results: results,
                    page: 1,
                    total_pages: 1
                });
            });
        };

        this.full = function (params, onSuccess, onError) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    Lampa.Api.sources[SOURCE_NAME] = new Api();

    Lampa.Component.add('v10_ultra', {
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
                    source: SOURCE_NAME,
                    url: key
                });
            });
        }
    });

    function start() {
        Lampa.Activity.push({
            title: PLUGIN_NAME,
            component: 'v10_ultra'
        });
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && start());

})();
