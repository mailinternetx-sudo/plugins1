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

async function fetchCategory(path, page){
    const res = await fetch(`${PROXY}${path}?page=${page||1}`);
    return await res.json();
}

function Api(){

    this.category = async function (params, onSuccess){

        let page = params.page || 1;
        let path = params.url;

        if(!path){
            return onSuccess(CATEGORIES.map(c => ({
                title: c.title,
                url: c.path,
                type: 'line',
                source: SOURCE
            })));
        }

        let data = await fetchCategory(path, page);

        onSuccess({
            results: (data.results||[]).filter(i=>i && i.id),
            page: data.page || 1,
            total_pages: data.total_pages || 1,
            more: false,
            source: SOURCE,
            url: path,
            card: true
        });
    };

    this.full = function(params, onSuccess, onError){
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };
}

function addButton(){

    let wait = () => {
        let menu = document.querySelector('.menu .menu__list');
        if(!menu) return setTimeout(wait,500);

        if(document.querySelector('[data-rutor]')) return;

        let li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor','1');

        li.innerHTML = `<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;

        // 🔥 click вместо hover
        li.addEventListener('click', () => {
            Lampa.Activity.push({
                component: 'category_full',
                source: SOURCE,
                title: SOURCE
            });
        });

        menu.appendChild(li);
    };

    wait();
}

function start(){

    let api = new Api();

    Lampa.Api.sources.rutorpro = api;

    Object.defineProperty(Lampa.Api.sources, SOURCE, {
        configurable: true,
        get: () => api
    });

    addButton();
}

if(window.appready) start();
else Lampa.Listener.follow('app', e=>{
    if(e.type==='ready') start();
});

})();
