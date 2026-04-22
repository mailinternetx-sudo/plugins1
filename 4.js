(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";
const OMDB_API_KEY = "38756ce6";
const KP_KEY = "JVGPMHQ-40AMAHD-MG87Z21-R490RWA";

// ---------------- NORMALIZE ----------------
function norm(str){
  return (str||'').toLowerCase().replace(/[^a-zа-я0-9]/gi,'');
}

function score(a,b){
  a = norm(a); b = norm(b);
  if(a === b) return 100;

  let same = 0;
  for(let i=0;i<Math.min(a.length,b.length);i++){
    if(a[i] === b[i]) same++;
  }

  return same / Math.max(a.length,b.length) * 100;
}

// ---------------- SEARCH ----------------
async function search(item){

  let query = item.alt || item.title;

  let results = [];

  if(item.lang === 'ru'){
    let r = await kp(item.title);
    if(r) results.push(r);
  }

  let t = await tmdb(query);
  if(t) results.push(t);

  let o = await omdb(query);
  if(o) results.push(o);

  let f = await filmix(query);
  if(f) results.push(f);

  let c = await cub(query);
  if(c) results.push(c);

  let best = results
    .map(r=>({...r, score: score(item.title, r.title)}))
    .sort((a,b)=>b.score-a.score)[0];

  if(!best || best.score < 40) return null;

  best.poster_path = best.poster_path || '/img/img_broken.svg';

  return best;
}

// ---------------- API SOURCES ----------------
function tmdb(q){
  return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`)
    .then(r=>r.json())
    .then(j=>{
      let r = (j.results||[])[0];
      if(!r) return null;

      return {
        id: 'tmdb_'+r.id,
        title:r.title||r.name,
        poster_path: r.poster_path ? 'https://image.tmdb.org/t/p/w500'+r.poster_path : '',
        type:r.media_type
      };
    }).catch(()=>null);
}

function kp(q){
  return fetch(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(q)}`,{
    headers:{'X-API-KEY':KP_KEY}
  })
  .then(r=>r.json())
  .then(j=>{
    let f = (j.films||[])[0];
    if(!f) return null;

    return {
      id:'kp_'+f.filmId,
      title:f.nameRu,
      poster_path:f.posterUrlPreview,
      type:f.type === 'TV_SERIES' ? 'tv':'movie'
    };
  }).catch(()=>null);
}

function omdb(q){
  return fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(q)}`)
  .then(r=>r.json())
  .then(j=>{
    if(j.Response==="False") return null;

    return {
      id:'imdb_'+j.imdbID,
      title:j.Title,
      poster_path:j.Poster!=="N/A"?j.Poster:'',
      type:j.Type==='series'?'tv':'movie'
    };
  }).catch(()=>null);
}

function filmix(q){
  return fetch(`https://filmixapp.cyou/api/v2/search?story=${encodeURIComponent(q)}`)
  .then(r=>r.json())
  .then(j=>{
    let f = (j||[])[0];
    if(!f) return null;

    return {
      id:'filmix_'+f.id,
      title:f.title,
      poster_path:f.poster,
      type:f.type === 'serial' ? 'tv':'movie'
    };
  }).catch(()=>null);
}

function cub(q){
  return fetch(`https://cub.red/api/search?q=${encodeURIComponent(q)}`)
  .then(r=>r.json())
  .then(j=>{
    let f = (j.results||[])[0];
    if(!f) return null;

    return {
      id:'cub_'+f.id,
      title:f.title,
      poster_path:f.poster,
      type:f.type
    };
  }).catch(()=>null);
}

// ---------------- API ----------------
function Api(){

  this.category = async function (params, onSuccess, onError){

    try{

      let data = await fetch(PROXY+'?v='+Date.now()).then(r=>r.json());

      let parts = [];

      for(let cat of Object.keys(data)){

        let row = { title:cat, results:[], type:'line' };
        parts.push(row);

        let promises = (data[cat]||[])
          .slice(0,30)
          .map(item => search(item));

        let results = await Promise.all(promises);

        // 🔥 АНТИ-ДУБЛИКАТЫ
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

// ---------------- START ----------------
function start(){

  let api=new Api();

  Lampa.Api.sources.rutorpro=api;

  Object.defineProperty(Lampa.Api.sources,SOURCE,{
    get:()=>api
  });

  function btn(){
    let m=document.querySelector('.menu .menu__list');
    if(!m) return setTimeout(btn,500);

    if(document.querySelector('[data-rutor]')) return;

    let li=document.createElement('li');
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

    m.appendChild(li);
  }

  btn();
}

if(window.appready) start();
else Lampa.Listener.follow('app',e=>{
  if(e.type==='ready') start();
});

})();
