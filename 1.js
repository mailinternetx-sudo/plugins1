(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
const TMDB = 'https://api.themoviedb.org/3/search/multi?api_key=f348b4586d1791a40d99edd92164cb86&query=';
const OMDB = 'https://www.omdbapi.com/?apikey=38756ce6&s=';
const KP = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=';
const KP_KEY = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';

let cache = {};
let queue = [];
let active = 0;
const MAX = 5;

// ---------------- CACHE ----------------
function getCache(k) {
  if (cache[k]) return cache[k];
  let raw = localStorage.getItem(k);
  if (!raw) return null;
  let data = JSON.parse(raw);
  if (Date.now() - data.time > 1000*60*60*6) return null;
  return data.value;
}

function setCache(k,v){
  cache[k]=v;
  localStorage.setItem(k,JSON.stringify({time:Date.now(),value:v}));
}

// ---------------- QUEUE ----------------
function run(){
  if(active>=MAX||!queue.length)return;
  let job=queue.shift();active++;
  job(()=>{active--;run();});
  run();
}

function add(fn){queue.push(fn);run();}

// ---------------- SEARCH ----------------
function search(item,cb){

  let key = item.title + item.year;
  let c = getCache(key);
  if(c) return cb(c);

  add(done=>{

    if(item.lang==='ru') return searchKP(item,cb,done);

    searchTMDB(item,(res)=>{
      if(res) return finish(res);
      searchOMDB(item,finish);
    });

    function finish(res){
      setCache(key,res);
      cb(res);
      done();
    }

  });
}

// ---------------- KP ----------------
function searchKP(item,cb,done){

  fetch(KP + encodeURIComponent(item.title), {
    headers:{'X-API-KEY':KP_KEY}
  })
  .then(r=>r.json())
  .then(j=>{
    let f = (j.films||[])[0];
    if(!f) return done();

    cb({
      id:f.filmId,
      title:f.nameRu,
      poster_path:f.posterUrlPreview,
      backdrop_path:f.posterUrl,
      type:f.type==='TV_SERIES'?'tv':'movie'
    });

    done();
  }).catch(()=>done());
}

// ---------------- TMDB ----------------
function searchTMDB(item,cb){
  fetch(TMDB+encodeURIComponent(item.title))
  .then(r=>r.json())
  .then(j=>{
    let r = (j.results||[])[0];
    if(!r) return cb(null);

    cb({
      id:r.id,
      title:r.title||r.name,
      poster_path:r.poster_path,
      backdrop_path:r.backdrop_path,
      type:r.media_type
    });
  }).catch(()=>cb(null));
}

// ---------------- OMDB ----------------
function searchOMDB(item,cb){
  fetch(OMDB+encodeURIComponent(item.title))
  .then(r=>r.json())
  .then(j=>{
    let r = (j.Search||[])[0];
    if(!r) return cb(null);

    cb({
      id:r.imdbID,
      title:r.Title,
      poster_path:r.Poster,
      type:r.Type==='series'?'tv':'movie'
    });
  }).catch(()=>cb(null));
}

// ---------------- API ----------------
function Api(){

  this.category = function (p, ok, err){

    fetch(PROXY+'?v='+Date.now())
    .then(r=>r.json())
    .then(data=>{

      let parts=[];

      Object.keys(data).forEach(cat=>{

        let row={title:cat,results:[]};
        parts.push(row);

        (data[cat]||[]).forEach(item=>{

          search(item,res=>{
            if(!res)return;

            row.results.push(res);
            if(row.update) row.update();
          });

        });

      });

      ok(parts);

    }).catch(err);
  };

  this.full = function(p,s,e){
    Lampa.Api.sources.tmdb.full(p,s,e);
  };
}

// ---------------- START ----------------
function start(){

  let api = new Api();

  Lampa.Api.sources.rutorpro = api;

  Object.defineProperty(Lampa.Api.sources, SOURCE, {
    get:()=>api
  });

  // 💥 кнопка (фикс)
  setTimeout(()=>{
    let menu=document.querySelector('.menu__list');
    if(!menu) return;

    let li=document.createElement('li');
    li.className='menu__item selector';
    li.innerHTML='<div class="menu__ico">🔥</div><div class="menu__text">'+SOURCE+'</div>';

    li.addEventListener('hover:enter',()=>{
      Lampa.Activity.push({
        component:'category',
        source:SOURCE,
        title:SOURCE
      });
    });

    menu.appendChild(li);

  },1000);
}

if(window.appready) start();
else Lampa.Listener.follow('app',e=>{
  if(e.type==='ready') start();
});

})();
