(function(){
'use strict';

const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";
const OMDB_API_KEY = "38756ce6";
const KP_API_KEY   = "JVGPMHQ-40AMAHD-MG87Z21-R490RWA";
const PROXY = "https://my-proxy-worker.mail-internetx.workers.dev/";

let cache = {};

// ---------------- UTILS ----------------
function levenshtein(a,b){
  if(!a || !b) return 0;
  const matrix = [];
  for(let i=0;i<=b.length;i++){matrix[i]=[i];}
  for(let j=0;j<=a.length;j++){matrix[0][j]=j;}
  for(let i=1;i<=b.length;i++){
    for(let j=1;j<=a.length;j++){
      matrix[i][j]=b.charAt(i-1)==a.charAt(j-1)
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1]+1,matrix[i][j-1]+1,matrix[i-1][j]+1);
    }
  }
  return matrix[b.length][a.length];
}

function score(a,b){
  a=a.toLowerCase(); b=b.toLowerCase();
  return 1 - (levenshtein(a,b) / Math.max(a.length,b.length));
}

// ---------------- TMDB ----------------
async function tmdb(query,type){
  let url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru`;
  let r = await fetch(url).then(r=>r.json());
  return r.results || [];
}

// ---------------- OMDB ----------------
async function omdb(query){
  let url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(query)}`;
  let r = await fetch(url).then(r=>r.json());
  return r.Search || [];
}

// ---------------- KINOPOISK ----------------
async function kp(query){
  let url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}`;
  let r = await fetch(url,{
    headers:{ 'X-API-KEY': KP_API_KEY }
  }).then(r=>r.json());

  return (r.films || []).map(i=>({
    id: i.filmId,
    title: i.nameRu || i.nameEn,
    original_title: i.nameEn,
    poster_path: i.posterUrlPreview,
    backdrop_path: i.posterUrl,
    vote_average: i.rating,
    media_type: i.type === 'TV_SERIES' ? 'tv' : 'movie'
  }));
}

// ---------------- MAIN SEARCH ----------------
async function multiSearch(item){

  let queries = [
    item.search,
    item.alt,
    item.title
  ].filter(Boolean);

  let isTV = item.is_tv;

  for(let q of queries){

    // 1️⃣ Kinopoisk (если кириллица)
    if(/^[а-яё]/i.test(q)){
      let r = await kp(q);
      if(r.length) return r[0];
    }

    // 2️⃣ TMDB
    let tm = await tmdb(q, isTV ? 'tv':'movie');
    if(!tm.length) tm = await tmdb(q, isTV ? 'movie':'tv');

    if(tm.length){
      return normalize(tm[0], isTV);
    }

    // 3️⃣ OMDB fallback
    let om = await omdb(q);
    if(om.length){
      return {
        id: om[0].imdbID,
        title: om[0].Title,
        poster_path: om[0].Poster,
        media_type: om[0].Type === 'series' ? 'tv' : 'movie'
      };
    }
  }

  return null;
}

// ---------------- NORMALIZE ----------------
function normalize(r,isTV){
  return {
    id: r.id,
    title: r.title || r.name,
    name: r.title || r.name,
    original_title: r.original_title || r.original_name,
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    overview: r.overview,
    vote_average: r.vote_average,
    media_type: isTV ? 'tv':'movie',
    release_date: r.release_date,
    first_air_date: r.first_air_date
  };
}

// ---------------- UI ----------------
function loadCategory(name){

  Lampa.Activity.push({
    title: name,
    component: 'category_full',
    results: []
  });

  fetch(PROXY)
    .then(r=>r.json())
    .then(async data=>{

      let list = data[name] || [];
      let seen = new Set();

      for(let item of list){

        let res = await multiSearch(item);
        if(!res) continue;

        if(seen.has(res.id)) continue;
        seen.add(res.id);

        Lampa.Activity.active().append([res]);
      }

    });
}

// ---------------- START ----------------
function start(){

  let btn = $('<li class="menu__item selector"><div class="menu__text">Rutor ULTRA</div></li>');

  $('.menu .menu__list').eq(0).append(btn);

  btn.on('hover:enter', function(){

    Lampa.Select.show({
      title: 'Категории',
      items: [
        "Топ торренты за последние 24 часа",
        "Зарубежные фильмы",
        "Наши фильмы",
        "Зарубежные сериалы",
        "Наши сериалы",
        "Телевизор"
      ],
      onSelect: loadCategory
    });

  });
}

if(window.appready) start();
else Lampa.Listener.follow('app', e=>{
  if(e.type==='ready') start();
});

})();
