(function () {
'use strict';

const SOURCE_NAME = 'v10_v2';
const PLUGIN_NAME = 'V10 v2';

const GS_URL = 'https://script.google.com/macros/s/AKfycbyh1aLms2UcDjImg0Y3F_vDLqQsCiOQpbCWHigXUfFbxwgorldX8LnG-nW5yCISn7TO/exec';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

// ⚠️ ЛИСТЫ = КАТЕГОРИИ (можешь менять под свою таблицу)
const SHEETS = [
    'Топ 24ч',
    'Зарубежные фильмы',
    'Наши фильмы',
    'Зарубежные сериалы',
    'Наши сериалы',
    'Телевизор'
];

// ===== API =====
function V10Api() {

    this.list = function (params, onComplete, onError) {

        let sheet = params.url;
        if (!sheet) return onError('no sheet');

        Lampa.Loader.show();

        fetch(GS_URL + '?sheet=' + encodeURIComponent(sheet))
            .then(r => r.json())
            .then(json => {

                let results = (json.results || []).map(item => {

                    let poster = item.poster_path || '';

                    // нормализация постера
                    if (poster && poster.indexOf('http') === -1) {
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
            .catch(err => {
                Lampa.Loader.hide();
                console.error(err);
                onError(err);
            });
    };

    this.full = function (params, onSuccess, onError) {
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };

    this.main = function (params, onComplete) {
        onComplete([]);
    };
}

// регистрация источника
Lampa.Api.sources[SOURCE_NAME] = new V10Api();

// ===== КАТЕГОРИИ =====
Lampa.Component.add('v10_v2_categories', {
    render: function () {

        let html = '<div class="selector-list" style="padding:20px;">';

        SHEETS.forEach(sheet => {
            html += `<div class="selector-item" data-sheet="${sheet}">${sheet}</div>`;
        });

        html += '</div>';

        this.html(html);

        this.find('.selector-item').on('click', (e) => {

            let sheet = $(e.currentTarget).data('sheet');

            Lampa.Activity.push({
                title: sheet,
                component: 'category',
                source: SOURCE_NAME,
                url: sheet,
                page: 1
            });
        });
    }
});

// ===== МЕНЮ =====
function startPlugin() {

    if (window.v10_v2_ready) return;
    window.v10_v2_ready = true;

    const menu = $(`
        <li class="menu__item selector" data-action="v10_v2">
            <div class="menu__ico">🎬</div>
            <div class="menu__text">${PLUGIN_NAME}</div>
        </li>
    `);

    $('.menu .menu__list').eq(0).append(menu);

    menu.on('hover:enter', () => {
        Lampa.Activity.push({
            title: PLUGIN_NAME,
            component: 'v10_v2_categories'
        });
    });
}

// запуск
if (window.appready) {
    startPlugin();
} else {
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') startPlugin();
    });
}

})();
