(function(){
'use strict';

/**************** CONFIG ****************/
const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
const OMDB_API_KEY = '38756ce6';
const KP_API_KEY   = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
const PROXY        = 'https://my-proxy-worker.mail-internetx.workers.dev/';

/**************** SAFE FETCH ****************/
function safeFetch(url, options, cb){
  fetch(url, options || {})
    .then(r => r.text())
    .then(t => {
      try{ cb(JSON.parse(t)); }
      catch(e){ cb(null); }
    })
    .catch(()=>cb(null));
}

/**************** API ****************/
function tmdbSearch(query, type, cb){
  safeFetch(
    'https://api.themoviedb.org/3/search/'+type+
    '?api_key='+TMDB_API_KEY+
    '&query='+encodeURIComponent(query)+'&language=ru',
    null,
    j => cb(j && j.results ? j.results : [])
  );
}

function omdbSearch(query, cb){
  safeFetch(
    'https://www.omdbapi.com/?apikey='+OMDB_API_KEY+'&s='+encodeURIComponent(query),
    null,
    j=>{
      let arr = (j && j.Search) || [];
      arr = arr.map(i=>({
        id: i.imdbID,
        title: i.Title,
        name: i.Title,
        poster_path: '',
        backdrop_path: '',
        media_type: i.Type === 'series' ? 'tv':'movie'
      }));
      cb(arr);
    }
  );
}

function kpSearch(query, cb){
  safeFetch(
    'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword='+encodeURIComponent(query),
    { headers: { 'X-API-KEY': KP_API_KEY } },
    j=>{
      let arr = (j && j.films) || [];
      arr = arr.map(i=>({
        id: i.filmId,
        title: i.nameRu || i.nameEn,
        name: i.nameRu || i.nameEn,
        poster_path: '',
        backdrop_path: '',
        media_type: i.type === 'TV_SERIES' ? 'tv':'movie'
      }));
      cb(arr);
    }
  );
}

/**************** HELPERS ****************/
function isTV(item){
  let t = (item.search || item.title || '').toLowerCase();
  return (
    item.is_tv ||
    /\[s\d+/i.test(t) ||
    /сериал/i.test(t)
  );
}

function appendSafe(card){
  let act = Lampa.Activity.active();
  if(!act) return;
  try{ act.append([card]); }catch(e){}
}

/**************** MULTI SEARCH ****************/
function multiSearch(item, cb){

  let queries = [item.search, item.alt, item.title].filter(Boolean);
  let tv = isTV(item);

  function step(i){
    if(i >= queries.length) return cb(null);

    let q = queries[i];

    if(/^[а-яё]/i.test(q)){
      kpSearch(q, res=>{
        if(res.length) return cb(res[0]);
        tmdbStage(q, i);
      });
    } else {
      tmdbStage(q, i);
    }
  }

  function tmdbStage(q, i){
    tmdbSearch(q, tv ? 'tv':'movie', r=>{
      if(r.length) return cb(r[0]);

      tmdbSearch(q, tv ? 'movie':'tv', r2=>{
        if(r2.length) return cb(r2[0]);

        omdbSearch(q, o=>{
          if(o.length) return cb(o[0]);
          step(i+1);
        });
      });
    });
  }

  step(0);
}

/**************** LOAD CATEGORY ****************/
function loadCategory(name){

  Lampa.Activity.push({
    title: name,
    component: 'category_full',
    results: []
  });

  safeFetch(PROXY, null, data=>{

    let list = (data && data[name]) || [];
    let seen = {};

    list.forEach(item=>{
      if(!item || !item.title) return;

      multiSearch(item, res=>{
        if(!res || !res.id) return;
        if(seen[res.id]) return;

        seen[res.id] = true;
        appendSafe(res);
      });
    });

  });
}

/**************** MENU ****************/
function start(){

  const ICON = '🔥';

  let item = $('<li class="menu__item selector">\
    <div class="menu__ico">'+ICON+'</div>\
    <div class="menu__text">Rutor ULTRA</div>\
  </li>');

  $('.menu .menu__list').eq(0).append(item);

  item.on('hover:enter', function(){

    Lampa.Select.show({
      title: 'Rutor категории',
      items: [
        {title: "Топ торренты за последние 24 часа"},
        {title: "Зарубежные фильмы"},
        {title: "Наши фильмы"},
        {title: "Зарубежные сериалы"},
        {title: "Наши сериалы"},
        {title: "Телевизор"}
      ],
      onSelect: function(it){
        loadCategory(it.title);
      }
    });

  });
}

/**************** INIT ****************/
if(window.appready) start();
else Lampa.Listener.follow('app', e=>{
  if(e.type === 'ready') start();
});

})();
