const KP_API_KEY = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
const OMDB_API_KEY = '38756ce6';

// ---------------- CLEAN ----------------
function parseItem(str) {

    let year = (str.match(/\((\d{4})\)/) || [])[1] || '';
    let imdb = (str.match(/tt\d+/) || [])[0] || '';

    let isTV = /\[.*?\]/.test(str);

    let name = str
        .split('(')[0]
        .split('[')[0]
        .replace(/\/.*/, '')
        .replace(/(CAMRip|TS|WEBRip|HDRip|Trailer|720p|1080p|2160p|x264|HEVC)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    return { name, year, imdb, isTV };
}

// ---------------- LEVENSHTEIN ----------------
function similarity(a, b) {
    if (!a || !b) return 0;

    a = a.toLowerCase();
    b = b.toLowerCase();

    let matrix = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
            );
        }
    }

    return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
}

// ---------------- KP ----------------
function searchKP(q, cb) {
    fetch(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(q)}`, {
        headers: { 'X-API-KEY': KP_API_KEY }
    })
        .then(r => r.json())
        .then(j => cb(j.films?.[0]))
        .catch(() => cb(null));
}

// ---------------- TMDB ----------------
function searchTMDB(q, lang, cb) {
    fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=${lang}`)
        .then(r => r.json())
        .then(j => cb(j.results || []))
        .catch(() => cb([]));
}

// ---------------- OMDB ----------------
function searchOMDB(q, cb) {
    fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => cb(j.Search || []))
        .catch(() => cb([]));
}

// ---------------- FIND BY IMDB ----------------
function findByIMDB(id, cb) {
    fetch(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ru-RU`)
        .then(r => r.json())
        .then(j => cb(j.movie_results[0] || j.tv_results[0]))
        .catch(() => cb(null));
}

// ---------------- ULTRA SMART ----------------
function smart(item, cb) {

    let p = parseItem(item.name);

    // 1️⃣ IMDb сразу
    if (p.imdb) {
        return findByIMDB(p.imdb, res => {
            if (res) return cb(res);
            runChain();
        });
    }

    runChain();

    function runChain() {

        let candidates = [];

        // 2️⃣ KP
        searchKP(p.name, kp => {
            if (kp) {
                candidates.push({
                    title: kp.nameRu || kp.nameEn,
                    year: kp.year,
                    score: 0.9,
                    source: 'kp',
                    raw: kp
                });
            }

            // 3️⃣ TMDB RU
            searchTMDB(p.name, 'ru-RU', tmdbRU => {

                tmdbRU.slice(0,5).forEach(r => {
                    candidates.push({
                        title: r.title || r.name,
                        year: (r.release_date || r.first_air_date || '').slice(0,4),
                        score: 0.8,
                        raw: r
                    });
                });

                // 4️⃣ TMDB EN fallback
                searchTMDB(p.name, 'en-US', tmdbEN => {

                    tmdbEN.slice(0,5).forEach(r => {
                        candidates.push({
                            title: r.title || r.name,
                            year: (r.release_date || r.first_air_date || '').slice(0,4),
                            score: 0.7,
                            raw: r
                        });
                    });

                    // 5️⃣ OMDb
                    searchOMDB(p.name, omdb => {

                        omdb.slice(0,5).forEach(r => {
                            candidates.push({
                                title: r.Title,
                                year: r.Year,
                                score: 0.6,
                                imdb: r.imdbID
                            });
                        });

                        pickBest(candidates);
                    });

                });

            });

        });
    }

    function pickBest(list) {

        let best = null;
        let bestScore = 0;

        list.forEach(c => {

            let s = similarity(p.name, c.title);

            if (p.year && c.year && p.year === c.year) s += 0.2;

            s += c.score;

            if (s > bestScore) {
                bestScore = s;
                best = c;
            }
        });

        // если нашли imdb → финальный точный матч
        if (best?.imdb) {
            return findByIMDB(best.imdb, cb);
        }

        cb(best?.raw || null);
    }
}
