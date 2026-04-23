(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

const CATEGORIES = [
    { title: '🔥 Топ торренты за 24 часа', path: 'lampac_top24' },
    { title: '🎬 Зарубежные фильмы', path: 'lampac_movies' },
    { title: '🇷🇺 Наши фильмы', path: 'lampac_movies_ru' },
    { title: '📺 Зарубежные сериалы', path: 'lampac_tv_shows' },
    { title: '🇷🇺 Наши сериалы', path: 'lampac_tv_shows_ru' },
    { title: '📡 Телевизор', path: 'lampac_televizor' }
];

async function fetchCategory(path, page = 1) {
    const url = `${PROXY}${path}?page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
}

function Api(){

    this.category = async function (params, onSuccess, onError){
        try{

            let page = params.page || 1;
            let path = params.url;

            // главное меню
            if (!path){
                return onSuccess(CATEGORIES.map(cat => ({
                    title: cat.title,
                    url: cat.path,
                    type: 'line',
                    source: SOURCE
                })));
            }

            const data = await fetchCategory(path, page);

            const response = {
                results: (data.results || []).filter(i => i && i.id),
                page: data.page || page,
                total_pages: data.total_pages || 1,
                more: (data.page || page) < (data.total_pages || 1),
                source: SOURCE,
                url: path,
                card: true
            };

            onSuccess(response);

        }catch(e){
            console.error('Rutor Pro error:', e);
            onError(e);
        }
    };

    this.full = function(params, onSuccess, onError){
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };
}

function addButton(){

    let tryAdd = () => {

        let menu = document.querySelector('.menu .menu__list');
        if(!menu) return setTimeout(tryAdd, 500);

        if(document.querySelector('[data-rutor-pro]')) return;

        let li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-pro', '1');

        li.innerHTML = `
            <div class="menu__ico">🔥</div>
            <div class="menu__text">${SOURCE}</div>
        `;

        li.addEventListener('hover:enter', () => {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE,
                title: SOURCE
            });
        });

        menu.appendChild(li);
    };

    tryAdd();
}

function start(){

    let api = new Api();

    // 🔥 КРИТИЧНЫЙ ФИКС
    Lampa.Api.sources.rutorpro = api;

    Object.defineProperty(Lampa.Api.sources, SOURCE, {
        get: () => api
    });

    addButton();
}

if(window.appready) start();
else{
    Lampa.Listener.follow('app', e=>{
        if(e.type === 'ready') start();
    });
}

})();
