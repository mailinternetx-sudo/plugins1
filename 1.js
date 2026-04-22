(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";
const OMDB_API_KEY = "38756ce6";
const KP_KEY = "JVGPMHQ-40AMAHD-MG87Z21-R490RWA";

// ---------------- SEARCH ----------------
function search(item){

  let query = item.alt || item.title;

  // возвращаем PROMISE
  return new Promise(resolve=>{

    if(item.lang === 'ru'){
      return kp(item.title).then(res=>{
        if(res) return resolve(res);
        tmdb(query).then(resolve);
      });
    }

    tmdb(query).then(res=>{
      if(res) return resolve(res);
      omdb(query).then(resolve);
    });

  });
}

// --- TMDB ---
function tmdb(q){
  return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}`)
    .then(r=>r.json())
    .then(j=>{
      let r = (j.results||[])[0];
      if(!r) return null;

      return {
        id:r.id,
        title:r.title||r.name,
        poster_path: r.poster_path ? 'https://image.tmdb.org/t/p/w500'+r.poster_path : '',
        backdrop_path: r.backdrop_path ? 'https://image.tmdb.org/t/p/w780'+r.backdrop_path : '',
        type:r.media_type
      };
    })
    .catch(()=>null);
}

// --- KP ---
function kp(q){
  return fetch(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(q)}`,{
    headers:{'X-API-KEY':KP_KEY}
  })
  .then(r=>r.json())
  .then(j=>{
    let f = (j.films||[])[0];
    if(!f) return null;

    return {
      id:f.filmId,
      title:f.nameRu,
      poster_path:f.posterUrlPreview,
      backdrop_path:f.posterUrl,
      type:f.type === 'TV_SERIES' ? 'tv':'movie'
    };
  })
  .catch(()=>null);
}

// --- OMDB ---
function omdb(q){
  return fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(q)}`)
  .then(r=>r.json())
  .then(j=>{
    if(j.Response==="False") return null;

    return {
      id:j.imdbID,
      title:j.Title,
      poster_path:j.Poster!=="N/A"?j.Poster:'',
      type:j.Type==='series'?'tv':'movie'
    };
  })
  .catch(()=>null);
}

// ---------------- API ----------------
function Api(){

  this.category = function (params, onSuccess, onError){

    fetch(PROXY+'?v='+Date.now())
    .then(r=>r.json())
    .then(async data=>{

      let parts = [];

      for(let cat of Object.keys(data)){

        let row = {
          title: cat,
          results: [],
          type: 'line'
        };

        parts.push(row);

        // 🔥 ГЛАВНОЕ
        let promises = (data[cat]||[])
          .slice(0,30)
          .map(item => search(item));

        let results = await Promise.all(promises);

        row.results = results
          .filter(Boolean)
          .map(r=>{
            r.poster_path = r.poster_path || '/img/img_broken.svg';
            return r;
          });

      }

      onSuccess(parts);

    })
    .catch(onError);
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
