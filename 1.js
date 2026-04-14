(function () {
'use strict';

const SOURCE_NAME = 'v10_max';
const PLUGIN_NAME = 'V10 MAX';
const GS_URL = 'https://script.google.com/macros/s/AKfycbx9HK-M8HAcuw8k5Qbr-1kz8StaqHgopROy9_x3cH9R3UwmkGkTQw0HF9tglopHBpfV/exec';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const CATEGORIES = {
    top24: 'Топ 24ч',
    movies: 'Зарубежные фильмы',
    rus_movies: 'Наши фильмы',
    series: 'Зарубежные сериалы',
    rus_series: 'Наши сериалы',
    tv: 'Телевизор'
};

// ===== API =====
function Api() {

    this.list = function (params, onComplete, onError) {

        const sheet = CATEGORIES[params.url];
        if (!sheet) return onError('no category');

        Lampa.Loader.show();

        fetch(GS_URL + '?sheet=' + encodeURIComponent(sheet))
            .then(r => r.json())
            .then(json => {

                let results = (json.results || []).map(item => {

                    let poster = item.poster_path || '';

                    // если ссылка полная — оставляем
                    if (poster.indexOf('http') === -1 && poster) {
                        poster = TMDB_IMG + poster;
                    }

                    return {
                        id: item.id,
                        title: item.title,
                        name: item.name,
                        original_title: item.original_title,
                        poster_path: poster,
                        backdrop_path: poster,
                        overview: item.overview || '',
                        vote_average: item.vote_average || 0,
                        first_air_date: item.media_type === 'tv' ? '2020' : null,
                        release_date: item.media_type === 'movie' ? '2020' : null
                    };
                });

                Lampa.Loader.hide();

                onComplete({
                    results: results,
                    page: 1,
                    total_pages: 1,
                    total_results: results.length
                });

            })
            .catch(e => {
                Lampa.Loader.hide();
                console.log(e);
                onError(e);
            });
    };

    this.full = function (params, onSuccess, onError) {
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };

    this.main = function (params, onComplete) {
        onComplete([]);
    };
}

Lampa.Api.sources[SOURCE_NAME] = new Api();

// ===== UI =====
Lampa.Component.add('v10_max_menu', {
    render: function () {

        let html = '<div class="selector-list">';

        Object.keys(CATEGORIES).forEach(key => {
            html += `<div class="selector-item" data-key="${key}">${CATEGORIES[key]}</div>`;
        });

        html += '</div>';

        this.html(html);

        this.find('.selector-item').on('click', (e) => {
            let key = $(e.currentTarget).data('key');

            Lampa.Activity.push({
                title: CATEGORIES[key],
                component: 'category',
                source: SOURCE_NAME,
                url: key,
                page: 1
            });
        });
    }
});

// ===== MENU =====
function start() {

    if (window.v10_max) return;
    window.v10_max = true;

    const menu = $(`
        <li class="menu__item selector" data-action="v10_max">
            <div class="menu__text">${PLUGIN_NAME}</div>
        </li>
    `);

    $('.menu .menu__list').append(menu);

    menu.on('hover:enter', () => {
        Lampa.Activity.push({
            title: PLUGIN_NAME,
            component: 'v10_max_menu'
        });
    });
}

if (window.appready) start();
else Lampa.Listener.follow('app', e => e.type === 'ready' && start());

})();
