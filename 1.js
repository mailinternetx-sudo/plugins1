(function(){
'use strict';

/** ================== CONFIG ================== **/
const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
const OMDB_API_KEY = '38756ce6';
const KP_API_KEY   = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
const PROXY        = 'https://my-proxy-worker.mail-internetx.workers.dev/';

// лимиты параллельности (важно для webOS)
const MAX_CONCURRENT = 5;
const CACHE_TTL = 1000 * 60 * 30; // 30 минут

/** ================== CACHE ================== **/
const mem = {};
function getCache(key){
  const m = mem[key];
  if(m && (Date.now() - m.t) < CACHE_TTL) return m.v;

  try{
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const j = JSON.parse(raw);
    if((Date.now() - j.t) > CACHE_TTL) return null;
    mem[key] = j;
    return j.v;
  }catch(e){ return null; }
}
function setCache(key, val){
  const rec = { t: Date.now(), v: val };
  mem[key] = rec;
  try{ localStorage.setItem(key, JSON.stringify(rec)); }catch(e){}
}

/** ================== QUEUE ================== **/
let q = [], active = 0;
function runQ(){
  if(active >= MAX_CONCURRENT || !q.length) return;
  const job = q.shift();
  active++;
  job(()=>{ active--; runQ(); });
  runQ();
}
function enqueue(fn){ q.push(fn); runQ(); }

/** ================== NORMALIZE ================== **/
function norm(s){
  return (s||'')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/&nbsp;/g,' ')
    .replace(/[^\wа-я0-9\s]/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function baseTitle(s){
  return (s||'')
    .split('(')[0]
    .split('[')[0]
    .trim();
}
function isCyrillicStart(s){
  return /^[а-яё]/i.test((s||'').trim());
}

/** ================== LEVENSHTEIN SCORE ================== **/
function lev(a,b){
  if(!a||!b) return 0;
  const m = Array.from({length:b.length+1},(_,i)=>[i]);
  for(let j=0;j<=a.length;j++) m[0][j]=j;
  for(let i=1;i<=b.length;i++){
    for(let j=1;j<=a.length;j++){
      m[i][j] = b[i-1]===a[j-1]
        ? m[i-1][j-1]
        : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
    }
  }
  return m[b.length][a.length];
}
function sim(a,b){
  a = norm(a); b = norm(b);
  if(!a || !b) return 0;
  const d = lev(a,b);
  return 1 - d / Math.max(a.length, b.length);
}

/** ================== DETECT TYPE ================== **/
function detectTV(item){
  const t = (item.search || item.title || '') + ' ' + (item.alt||'');
  const text = t.toLowerCase();
  return (
    item.is_tv === true ||
    /сериал/i.test(text) ||
    /\bseason\b/i.test(text) ||
    /\[s\d+/i.test(text) ||
    /\d+\s*сер/i.test(text)
  );
}

/** ================== API: TMDB ================== **/
function tmdbSearch(query, type, cb){
  const key = `tmdb_${type}_${query}`;
  const c = getCache(key);
  if(c) return cb(c);

  enqueue(done=>{
    fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru`)
      .then(r=>r.json())
      .then(j=>{
        const res = j.results || [];
        setCache(key, res);
        cb(res);
        done();
      })
      .catch(()=>{ cb([]); done(); });
  });
}

// если у тебя позже появится imdbID из worker — включишь это:
function tmdbFindByImdb(imdbId, cb){
  const key = `tmdb_find_${imdbId}`;
  const c = getCache(key);
  if(c) return cb(c);

  enqueue(done=>{
    fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru`)
      .then(r=>r.json())
      .then(j=>{
        const all = []
          .concat(j.movie_results||[])
          .concat(j.tv_results||[]);
        setCache(key, all);
        cb(all);
        done();
      })
      .catch(()=>{ cb([]); done(); });
  });
}

/** ================== API: OMDb ================== **/
function omdbSearch(query, cb){
  const key = `omdb_${query}`;
  const c = getCache(key);
  if(c) return cb(c);

  enqueue(done=>{
    fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(query)}`)
      .then(r=>r.json())
      .then(j=>{
        const res = j.Search || [];
        setCache(key, res);
        cb(res);
        done();
      })
      .catch(()=>{ cb([]); done(); });
  });
}

/** ================== API: KINOPOISK ================== **/
function kpSearch(query, cb){
  const key = `kp_${query}`;
  const c = getCache(key);
  if(c) return cb(c);

  enqueue(done=>{
    fetch(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}`, {
      headers: { 'X-API-KEY': KP_API_KEY }
    })
    .then(r=>r.json())
    .then(j=>{
      const res = (j.films || []).map(i=>({
        id: i.filmId,
        title: i.nameRu || i.nameEn,
        name: i.nameRu || i.nameEn,
        original_title: i.nameEn,
        poster_path: i.posterUrlPreview,
        backdrop_path: i.posterUrl,
        vote_average: parseFloat(i.rating) || 0,
        media_type: i.type === 'TV_SERIES' ? 'tv' : 'movie',
        _src: 'kp'
      }));
      setCache(key, res);
      cb(res);
      done();
    })
    .catch(()=>{ cb([]); done(); });
  });
}

/** ================== PICK BEST ================== **/
function pickBest(list, item, wantTV){
  if(!list || !list.length) return null;

  const target = baseTitle(item.title || item.search || '');
  const year = item.year;

  let best = null;
  let bestScore = -1;

  list.forEach(r=>{
    const t = r.title || r.name || '';
    const s = sim(t, target);

    let score = s * 100;

    // тип
    const isTV = (r.media_type === 'tv') || !!r.first_air_date;
    if(wantTV === isTV) score += 10;

    // год
    if(year){
      const y = (r.release_date || r.first_air_date || '').slice(0,4);
      if(y === year) score += 15;
    }

    // популярность/рейтинг
    if(r.vote_average) score += Math.min(10, r.vote_average);

    if(score > bestScore){
      bestScore = score;
      best = r;
    }
  });

  return best;
}

/** ================== NORMALIZE CARD ================== **/
function toCard(r, forceTV){
  const isTV = forceTV || (r.media_type === 'tv') || !!r.first_air_date;

  return {
    id: r.id,
    title: r.title || r.name,
    name: r.title || r.name,
    original_title: r.original_title || r.original_name || '',
    poster_path: r.poster_path || '',
    backdrop_path: r.backdrop_path || '',
    overview: r.overview || '',
    vote_average: r.vote_average || 0,
    media_type: isTV ? 'tv' : 'movie',
    release_date: r.release_date,
    first_air_date: r.first_air_date,
    source: 'tmdb'
  };
}

/** ================== MULTI-STAGE SEARCH ================== **/
function multiSearch(item, done){

  const wantTV = detectTV(item);

  // очередность запросов (Filmix-style)
  const queries = [
    item.search,     // самый точный (с [S01])
    item.alt,        // EN
    item.title       // fallback
  ].filter(Boolean);

  function tryQuery(i){
    if(i >= queries.length) return done(null);

    const q = queries[i];
    const key = `final_${q}_${item.year}_${wantTV}`;
    const cached = getCache(key);
    if(cached) return done(cached);

    // 1) Kinopoisk (если кириллица)
    if(isCyrillicStart(q)){
      kpSearch(q, (kpRes)=>{
        const best = pickBest(kpRes, item, wantTV);
        if(best){
          const card = toCard(best, wantTV);
          setCache(key, card);
          return done(card);
        }
        // дальше
        tmdbStage(q);
      });
    } else {
      tmdbStage(q);
    }

    function tmdbStage(q){
      // 2) TMDB (приоритет по типу)
      tmdbSearch(q, wantTV ? 'tv':'movie', (r1)=>{
        if(r1 && r1.length){
          const best = pickBest(r1, item, wantTV);
          if(best){
            const card = toCard(best, wantTV);
            setCache(key, card);
            return done(card);
          }
        }
        // fallback тип
        tmdbSearch(q, wantTV ? 'movie':'tv', (r2)=>{
          if(r2 && r2.length){
            const best = pickBest(r2, item, wantTV);
            if(best){
              const card = toCard(best, wantTV);
              setCache(key, card);
              return done(card);
            }
          }
          // 3) OMDb
          omdbSearch(q, (om)=>{
            if(om && om.length){
              const o = om[0];
              const card = {
                id: o.imdbID,
                title: o.Title,
                name: o.Title,
                original_title: o.Title,
                poster_path: o.Poster && o.Poster !== 'N/A' ? o.Poster : '',
                backdrop_path: '',
                overview: '',
                vote_average: 0,
                media_type: o.Type === 'series' ? 'tv' : 'movie',
                release_date: o.Year,
                source: 'omdb'
              };
              setCache(key, card);
              return done(card);
            }
            // следующий вариант запроса
            tryQuery(i+1);
          });
        });
      });
    }
  }

  tryQuery(0);
}

/** ================== LOAD CATEGORY ================== **/
function loadCategory(name){

  Lampa.Activity.push({
    title: name,
    component: 'category_full',
    results: [],
    page: 1
  });

  fetch(PROXY)
    .then(r=>r.json())
    .then(list=>{

      const items = (list && list[name]) ? list[name] : [];
      const seen = new Set();

      items.slice(0, 60).forEach(item=>{
        // фильтр мусора
        if(!item || !item.title) return;

        multiSearch(item, (card)=>{
          if(!card || !card.id) return;
          if(seen.has(card.id)) return;

          seen.add(card.id);
          Lampa.Activity.active().append([card]);
        });
      });

    });
}

/** ================== MENU / START ================== **/
function start(){

  const ICON = '🔥';

  const item = $('<li class="menu__item selector"><div class="menu__ico">'+ICON+'</div><div class="menu__text">Rutor ULTRA</div></li>');
  $('.menu .menu__list').eq(0).append(item);

  item.on('hover:enter', function(){
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
  if(e.type === 'ready') start();
});

})();
