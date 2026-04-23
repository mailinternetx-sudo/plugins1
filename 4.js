(function () {
'use strict';

const SOURCE = 'rutor_pro'; // ⚠️ важно: без пробелов
const TITLE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

const CATEGORIES = [
    { title: '🔥 Топ торренты за 24 часа', path: 'lampac_top24' },
    { title: '🎬 Зарубежные фильмы', path: 'lampac_movies' },
    { title: '🇷🇺 Наши фильмы', path: 'lampac_movies_ru' },
    { title: '📺 Зарубежные сериалы', path: 'lampac_tv_shows' },
    { title: '🇷🇺 Наши сериалы', path: 'lampac_tv_shows_ru' },
    { title: '📡 Телевизор', path: 'lampac_televizor' }
];

// ---------------- API ----------------
function Api(){

    this.category = async function (params, onSuccess, onError){

        try{

            let page = params.page || 1;
            let url = params.url;

            // главный экран (категории)
            if(!url){
                return onSuccess(CATEGORIES.map(c => ({
                    title: c.title,
                    url: c.path,
                    type: 'line',
                    source: SOURCE
                })));
            }

            // загрузка категории
            let res = await fetch(`${PROXY}${url}?page=${page}`);
            let data = await res.json();

            onSuccess({
                results: (data.results || []).filter(i => i && i.id),
                page: data.page || 1,
                total_pages: data.total_pages || 1,
                more: false,
                source: SOURCE,
                url: url,
                card: true
            });

        }catch(e){
            console.error('Rutor error:', e);
            onError(e);
        }
    };

    this.full = function(params, onSuccess, onError){
        Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
    };
}

// ---------------- BUTTON ----------------
function addButton(){

    let wait = () => {

        let menu = document.querySelector('.menu .menu__list');
        if(!menu) return setTimeout(wait, 500);

        if(document.querySelector('[data-rutor-pro]')) return;

        let li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-pro', '1');

        li.innerHTML = `
            <div class="menu__ico">🔥</div>
            <div class="menu__text">${TITLE}</div>
        `;

        li.addEventListener('click', () => {
            Lampa.Activity.push({
                component: 'category_full',
                source: SOURCE,
                title: TITLE
            });
        });

        menu.appendChild(li);
    };

    wait();
}

// ---------------- INIT ----------------
function start(){

    let api = new Api();

    // 🔥 САМЫЙ ВАЖНЫЙ ФИКС
    Lampa.Api.addSource({
        key: SOURCE,
        name: TITLE,
        api: api
    });

    addButton();
}

// ---------------- START ----------------
if(window.appready) start();
else{
    Lampa.Listener.follow('app', e=>{
        if(e.type === 'ready') start();
    });
}

})();
