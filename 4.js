(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

// ---------- HELPERS ----------
function norm(s){ return (s||'').toLowerCase().replace(/[^a-zа-я0-9]/gi,''); }

function score(a,b,y1,y2){
  a = norm(a); b = norm(b);
  if(a===b) return 100;

  let same=0;
  for(let i=0;i<Math.min(a.length,b.length);i++){
    if(a[i]===b[i]) same++;
  }

  let s = same/Math.max(a.length,b.length)*100;
  if(y1 && y2 && y1===y2) s+=30;

  return s;
}

// ---------- TMDB SEARCH ----------
function tmdb(q){
  return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`)
  .then(r=>r.json())
  .then(j=>j.results||[])
  .catch(()=>[]);
}

// ---------- SEARCH ----------
async function search(item){

  let isRU = !item.alt;
  let query = isRU ? item.title : item.alt;

  let list = await tmdb(query);

  if(!list.length) return null;

  let best = list
    .map(r=>({
      ...r,
      score: score(item.title, r.title||r.name, item.year, (r.release_date||r.first_air_date||'').slice(0,4))
    }))
    .sort((a,b)=>b.score-a.score)[0];

  if(!best || best.score < 40) return null;

  // 🔥 ВАЖНО: TMDB формат (фикс открытия)
  return {
    id: best.id,
    title: best.title || best.name,
    name: best.title || best.name,
    original_title: best.original_title || best.original_name,
    poster_path: best.poster_path,
    backdrop_path: best.backdrop_path,
    overview: best.overview,
    vote_average: best.vote_average,
    media_type: best.media_type,
    release_date: best.release_date,
    first_air_date: best.first_air_date,
    source: 'tmdb'
  };
}

// ---------- API ----------
function Api(){

  this.category = async function (params, onSuccess, onError){
    try{
      let data = await fetch(PROXY+'?v='+Date.now()).then(r=>r.json());

      let parts = [];

      for(let cat in data){

        let row = { title:cat, results:[], type:'line' };
        parts.push(row);

        let results = await Promise.all(
          data[cat].slice(0,30).map(search)
        );

        // анти-дубликаты
        let seen = new Set();

        row.results = results
          .filter(Boolean)
          .filter(r=>{
            if(seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          });
      }

      onSuccess(parts);

    }catch(e){
      onError(e);
    }
  };

  this.full = function(p,s,e){
    Lampa.Api.sources.tmdb.full(p,s,e);
  };
}

// ---------- INIT ----------
function start(){

  let api = new Api();

  Lampa.Api.sources.rutorpro = api;

  Object.defineProperty(Lampa.Api.sources, SOURCE, {
    get:()=>api
  });

  function btn(){
    let menu = document.querySelector('.menu .menu__list');
    if(!menu) return setTimeout(btn,500);

    if(document.querySelector('[data-rutor]')) return;

    let li = document.createElement('li');
    li.className='menu__item selector';
    li.setAttribute('data-rutor','1');

    li.innerHTML=`<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;

    li.addEventListener('hover:enter',()=>{
      Lampa.Activity.push({
        component:'category',
        source:SOURCE,
        title:SOURCE
      });
    });

    menu.appendChild(li);
  }

  btn();
}

if(window.appready) start();
else Lampa.Listener.follow('app',e=>{
  if(e.type==='ready') start();
});

})();
