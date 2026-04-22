const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

// 🔥 отдельный поиск
async function tmdbSearch(query, type){
  let url = type === 'tv'
    ? `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`
    : `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`;

  return fetch(url).then(r=>r.json()).then(j=>j.results||[]);
}

// 🔥 главный поиск
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

  let best = results.find(r=>{
    let y = (r.release_date || r.first_air_date || '').slice(0,4);
    return !year || y === year;
  }) || results[0];

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
