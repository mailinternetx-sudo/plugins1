(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

// ---------------- TMDB SEARCH ----------------
async function tmdbSearch(query, type){

  let url = type === 'tv'
    ? `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`
    : `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`;

  try{
    let res = await fetch(url).then(r=>r.json());
    return res.results || [];
  }catch(e){
    return [];
  }
}

// ---------------- SMART SEARCH ----------------
async function search(item){

  let query = item.alt || item.title;
  let year = item.year;
  let results = [];

  // 🔥 сначала правильный тип
  if(item.is_tv){
    results = await tmdbSearch(query, 'tv');
    if(!results.length) results = await tmdbSearch(query, 'movie');
  }else{
    results = await tmdbSearch(query, 'movie');
    if(!results.length) results = await tmdbSearch(query, 'tv');
  }

  if(!results.length) return null;

  // 🔥 фильтр по году
  let best = results.find(r=>{
    let y = (r.release_date || r.first_air_date || '').slice(0,4);
    return !year || y === year;
  }) || results[0];

  if(!best) return null;

  return {
    id: best.id,
    title: best.title || best.name,
    name: best.title || best.name,
    original_title: best.original_title || best.original_name,
    poster_path: best.poster_path,
    backdrop_path: best.backdrop_path,
    overview: best.overview,
    vote_average: best.vote_average,
    media_type: item.is_tv ? 'tv' : 'movie',
    release_date: best.release_date,
    first_air_date: best.first_air_date,
    source: 'tmdb'
  };
}

// ---------------- API ----------------
function Api(){

  this.category = async function (params, onSuccess, onError){
    try{

      let data = await fetch(PROXY + '?v=' + Date.now()).then(r=>r.json());

      let parts = [];

      for(let cat in data){

        let line = {
          title: cat,
          results: [],
          type: 'line'
        };

        parts.push(line);

        let results = await Promise.all(
          (data[cat] || []).slice(0,40).map(search)
        );

        // 🔥 анти-дубликаты
        let seen = new Set();

        line.results = results
          .filter(Boolean)
          .filter(r=>{
            if(seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          });
      }

      onSuccess(parts);

    }catch(e){
      console.error('Rutor error:', e);
      onError(e);
    }
  };

  this.full = function(params, onSuccess, onError){
    Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
  };
}

// ---------------- UI BUTTON ----------------
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

// ---------------- INIT ----------------
function start(){

  let api = new Api();

  Lampa.Api.sources.rutorpro = api;

  Object.defineProperty(Lampa.Api.sources, SOURCE, {
    get: () => api
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
