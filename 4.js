/**
Rutor Pro Worker для Lampa (v5) — модифицированная версия
Категории и точные URL:
kino          → https://rutor.info/kino          (25 фильмов)
nashe_kino    → https://rutor.info/nashe_kino    (25 фильмов)
seriali       → https://rutor.info/seriali       (25 сериалов)
nashi_seriali → https://rutor.info/nashi_seriali (25 сериалов)
televizor     → https://rutor.info/tv            (25 + плагины)
humor         → https://rutor.info/jumor         (25 + плагины)
top24         → https://rutor.info/new/          (блок секции)
*/
// ⚠️ API ключи должны передаваться через env (Cloudflare Workers)
const TMDB_KEY = globalThis.TMDB_KEY || 'f348b4586d1791a40d99edd92164cb86';
const KP_KEY   = globalThis.KP_KEY   || 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BG  = 'https://image.tmdb.org/t/p/original';

// 🎯 Зеркала для категорийных страниц
const RUTOR_MIRRORS = [
    'https://rutor.info',
    'https://rutor.is',
    'https://rutor.org'
];

// 📺 Зеркала для ТВ/Юмор страниц
const RUTOR_TV_URLS = [
    'https://rutor.info/tv',
    'https://rutor.is/tv'
];

const RUTOR_HUMOR_URLS = [
    'https://rutor.info/jumor',
    'https://rutor.is/jumor'
];

const NUMPARSER_URL = 'https://num.jac-red.ru';
const DEFAULT_PAGE_SIZE = 25;  // 🔹 Всегда 25 элементов
const MAX_PAGE_SIZE     = 25;
const CACHE_TTL         = 3_600_000;
const CACHE_MAX         = 400;

// 🔹 Категории, которые являются ТВ-шоу
const TV_CATEGORIES = new Set(['seriali', 'nashi_seriali', 'televizor']);

// 🔹 Категории с отдельной страницей: ключ → путь на rutor
const DEDICATED_PAGE = {
    kino:          'kino',
    nashe_kino:    'nashe_kino',
    seriali:       'seriali',
    nashi_seriali: 'nashi_seriali',
    televizor:     'tv',      // 🔹 Новый
    humor:         'jumor'    // 🔹 Новый
};

const cache = new Map();

// ========================== CACHE ==========================
function cacheCleanup() {
    if (cache.size > CACHE_MAX) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
        for (let i = 0; i < Math.ceil(CACHE_MAX * 0.3); i++) cache.delete(oldest[i][0]);
    }
}

function getCache(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.ts < CACHE_TTL) return item.data;
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
    cacheCleanup();
}

// ========================== MAIN ===========================
export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin':  '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age':       '86400'
                }
            });
        }
        
        const url  = new URL(request.url);
        const path = url.pathname.slice(1);

        if (!path || path === 'health') {
            return json({ status: 'ok', cache: cache.size });
        }

        try {
            const category = detect(path);
            const page     = parseInt(url.searchParams.get('page')) || 1;
            const pageSize = Math.min(
                parseInt(url.searchParams.get('page_size') || DEFAULT_PAGE_SIZE),
                MAX_PAGE_SIZE
            );

            // 🔹 nashi_seriali: сначала num.jac-red.ru
            if (category === 'nashi_seriali') {
                try {
                    const numData = await fetchNumparserCategory('nashi_seriali', page, pageSize);
                    if (numData.results && numData.results.length > 0) return json(numData);
                } catch (e) {
                    console.warn('[V10] num.jac-red.ru failed, fallback to rutor:', e.message);
                }
            }

            // 🔹 Парсим Rutor → обогащаем TMDB/KP
            const rawItems     = await fetchRutor(category);
            const totalResults = rawItems.length;
            const start        = (page - 1) * pageSize;
            const paginated    = rawItems.slice(start, start + pageSize);
            const enriched     = await enrich(paginated, category);

            return json({
                results:       enriched,
                page,
                total_pages:   Math.ceil(totalResults / pageSize),
                total_results: totalResults,
                page_size:     pageSize
            });
        } catch (e) {
            console.error('[V10] Main error:', e);
            return json({ error: true, message: e.message }, 500);
        }
    }
};

// ========================== DETECT =========================
function detect(p) {
    p = p.toLowerCase();
    if (p.includes('top24'))                                       return 'top24';
    if (p.includes('movies_ru') || p.includes('nashe'))           return 'nashe_kino';
    if (p.includes('movies'))                                      return 'kino';
    if (p.includes('tv_shows_ru') || p.includes('nashi_seriali')) return 'nashi_seriali';
    if (p.includes('tv_shows') || p.includes('seriali'))          return 'seriali';
    if (p.includes('televizor') || p === 'tv')                    return 'televizor';
    if (p.includes('humor') || p.includes('jumor') || p === 'humor') return 'humor';
    return 'kino';
}

// ===================== NUM.JAC-RED.RU ======================
async function fetchNumparserCategory(category, page, pageSize) {
    const mapping = {
        nashi_seriali: 'lampac_all_tv_shows_ru',
        tv_shows_ru:   'lampac_all_tv_shows_ru'
    };
    const numCategory = mapping[category] || 'lampac_all_tv_shows_ru';
    const fetchUrl = `${NUMPARSER_URL}/${numCategory}?page=${page}&language=ru`;
    
    const text = await safeFetch(fetchUrl);
    const data = JSON.parse(text);
    
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
        return { results: [], page, total_pages: 1, total_results: 0, page_size: pageSize };
    }
    
    const results = data.results.map(item => normalizeNumItem(item));
    return {
        results,
        page:          data.page          || page,
        total_pages:   data.total_pages   || 1,
        total_results: data.total_results || results.length,
        page_size:     pageSize
    };
}

function normalizeNumItem(item) {
    const posterPath   = normalizePosterPath(item.poster_path);
    const backdropPath = normalizeBackdropPath(item.backdrop_path);
    const img  = buildImg(item.poster_path   || '');
    const bg   = buildBg(item.backdrop_path  || '');
    const title  = item.title || item.name || '';
    const isTv   = !!(item.first_air_date || item.number_of_seasons);
    const method = detectMediaMethod(isTv);
    
    // 🌍 Язык и страна для российских сериалов
    const langData = isTv || /[а-яА-ЯёЁ]/.test(title) 
        ? { original_language: 'ru', origin_country: ['RU'] }
        : { original_language: 'en', origin_country: ['US'] };

    return {
        id:                   item.id,
        title,
        name:                 item.name           || title,
        original_title:       item.original_title || item.original_name || title,
        original_name:        item.original_name  || title,
        overview:             item.overview       || item.description   || '',
        poster_path:          posterPath,
        backdrop_path:        backdropPath,
        img,
        background_image:     bg,
        vote_average:         item.vote_average      || 0,
        vote_count:           item.vote_count        || 0,
        release_date:         item.release_date      || '',
        first_air_date:       item.first_air_date    || '',
        number_of_seasons:    item.number_of_seasons || undefined,
        type:                 method,
        method,
        media_type:           method,
        release_quality:      item.release_quality  || '',
        source:               'V10',
        // 🌍 Новые поля
        original_language:    item.original_language || langData.original_language,
        origin_country:       item.origin_country    || langData.origin_country,
        promo_title:          title,
        promo:                item.overview || item.description || ''
    };
}

// ====================== FETCH RUTOR ========================
async function fetchRutor(category) {
    // ---------- категории с отдельной страницей ----------
    if (DEDICATED_PAGE[category]) {
        const pagePath = DEDICATED_PAGE[category];
        let html = '';
        
        // Выбираем зеркала в зависимости от категории
        const mirrors = (category === 'televizor') ? RUTOR_TV_URLS :
                       (category === 'humor') ? RUTOR_HUMOR_URLS :
                       RUTOR_MIRRORS;
        
        for (const mirror of mirrors) {
            try {
                html = await safeFetch(`${mirror}/${pagePath}`);
                if (html && html.length > 3000) break;
            } catch (e) {
                console.warn(`[V10] ${mirror}/${pagePath} failed: ${e.message}`);
            }
        }
        
        if (!html || html.length < 3000) {
            throw new Error(`Не удалось загрузить /${pagePath} с rutor`);
        }

        return parseTorrentRows(html, 25); // 🔹 Строго 25 элементов
    }
    
    // ---------- /new-страница (top24) ----------
    let html = '';
    for (const baseUrl of RUTOR_MIRRORS) {
        try {
            html = await safeFetch(`${baseUrl}/new/`);
            if (html && html.length > 5000) break;
        } catch (e) {
            console.warn(`[V10] ${baseUrl}/new/ failed: ${e.message}`);
        }
    }
    if (!html) throw new Error('Не удалось загрузить /new с rutor');
    
    // Для top24 берём первую секцию
    return parseTorrentRows(html, 25);
}

// =================== TR-BASED PARSER =======================
function parseTorrentRows(html, limit) {
    // Ищем основную таблицу
    let tableHtml = '';
    const idxMatch = html.match(/<table[^>]+id=["']index["'][^>]*>([\s\S]*?)<\/table>/i);
    if (idxMatch) {
        tableHtml = idxMatch[1];
    } else {
        const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
        if (tables.length > 0) {
            // ✅ FIX: Проверяем, что массив не пуст
            tableHtml = tables.reduce((a, b) => (a[1]?.length || 0) > (b[1]?.length || 0) ? a : b)[1] || '';
        } else {
            tableHtml = html;
        }
    }
    
    // Разбиваем на строки <tr>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows     = [...tableHtml.matchAll(rowRegex)].map(m => m[1]);
    
    // Regex для первой ссылки /torrent/DIGITS с названием
    const linkRegex = /<a\s[^>]*href=["']\/torrent\/\d+[^"']*["'][^>]*>\s*([^<]{3,}?)\s*<\/a>/i;
    
    // Технические метки для пропуска
    const skipLabels = /^(скачать|magnet|magnet-link|↓|⬇|загрузить|\d+(?:\.\d+)?\s*(gb|mb|kb)|new|hd|full|trail)/i;
    
    const result = [];
    for (const row of rows) {
        if (result.length >= limit) break;
        const m = linkRegex.exec(row);
        if (!m) continue;

        let raw = m[1]
            .replace(/&nbsp;/g, ' ')
            .replace(/&#\d+;/g, '')
            .replace(/&[a-z]+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!raw || raw.length < 3) continue;
        if (skipLabels.test(raw))   continue;
        if (/^\d+$/.test(raw))      continue;
        if (raw.toLowerCase().includes('торрент')) continue;

        result.push(raw);
    }
    return result;
}

// ====================== SAFE FETCH =========================
async function safeFetch(url, opts = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), opts.timeout || 8000);
    try {
        const res = await fetch(url, {
            ...opts,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(opts.headers || {})
            },
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (e) {
        // ✅ FIX: Правильная обработка AbortError при timeout
        if (e.name === 'AbortError') throw new Error(`Request timeout after ${opts.timeout || 8000}ms`);
        throw e;
    } finally {
        clearTimeout(id);
    }
}

// =================== POSTER / BG UTILS =====================
function buildImg(posterPath) {
    if (!posterPath) return '';
    if (posterPath.startsWith('http')) return posterPath;
    if (posterPath.startsWith('/t/p/')) return 'https://image.tmdb.org' + posterPath;
    return TMDB_IMG + posterPath;
}

function buildBg(backdropPath) {
    if (!backdropPath) return '';
    if (backdropPath.startsWith('http')) return backdropPath;
    if (backdropPath.startsWith('/t/p/')) return 'https://image.tmdb.org' + backdropPath;
    return TMDB_BG + backdropPath;
}

function normalizePosterPath(p) {
    if (!p) return '';
    if (p.startsWith('http') || p.startsWith('/t/p/')) return p;
    return '/t/p/w500' + p;
}

function normalizeBackdropPath(p) {
    if (!p) return '';
    if (p.startsWith('http') || p.startsWith('/t/p/')) return p;
    return '/t/p/original' + p;
}

function detectMediaMethod(isTv) {
    return isTv ? 'tv' : 'movie';
}

// =================== DETECT QUALITY ========================
function detectQuality(raw) {
    if (!raw) return '';
    const s = raw.toUpperCase();
    const tags = [];
    
    if (/\b2160[PI]?\b|4K|UHD/.test(s))              tags.push('4K');
    else if (/\b1080[PI]\b|FULLHD|FULL\s*HD/.test(s)) tags.push('1080p');
    else if (/\b720[PI]\b/.test(s))                    tags.push('720p');
    
    if (/\bHDR10\+/.test(s))                          tags.push('HDR10+');
    else if (/\bHDR10\b/.test(s))                      tags.push('HDR10');
    else if (/\bDOLBY\s*VISION|\bDV\b/.test(s))        tags.push('DV');
    else if (/\bHDR\b/.test(s))                        tags.push('HDR');
    
    if (/\bBLU[- ]?RAY|BLURAY|REMUX/.test(s))         tags.push('BluRay');
    else if (/\bBDRIP\b/.test(s))                      tags.push('BDRip');
    else if (/\bWEB[- ]?DL\b/.test(s))                tags.push('WEB-DL');
    else if (/\bWEB[- ]?RIP\b/.test(s))               tags.push('WEBRip');
    
    return tags.join(' ');
}

// ========================= ENRICH ==========================
async function enrich(titles, category) {
    const results = [];
    const forceTv = TV_CATEGORIES.has(category);
    
    for (let i = 0; i < titles.length; i++) {
        try {
            const parsed   = parseTitle(titles[i], forceTv);
            const cacheKey = `v5:${parsed.mainTitle}|${parsed.year || 'ny'}|${parsed.is_tv ? 'tv' : 'mv'}|${category}`;
            
            const cached = getCache(cacheKey);
            if (cached) { results.push(cached); continue; }

            let apiData = await fetchTMDB(parsed);
            if (!apiData) apiData = await fetchKP(parsed);

            const norm = apiData
                ? normalize(apiData, parsed, titles[i], category)
                : makeFallback(parsed, i, titles[i], category);

            setCache(cacheKey, norm);
            results.push(norm);
        } catch (e) {
            console.warn(`Enrich error [${titles[i]}]: ${e.message}`);
            // Добавляем фоллбэк даже при ошибке
            results.push(makeFallback(parseTitle(titles[i], forceTv), i, titles[i], category));
        }
        
        // 🔹 Throttle: пауза каждые 4 запроса
        if ((i + 1) % 4 === 0) await new Promise(r => setTimeout(r, 200));
    }
    return results;
}

// ====================== PARSE TITLE ========================
function parseTitle(raw, forceTv = false) {
    const yearMatch = raw.match(/\b((?:19|20)\d{2}(?:-\d{2})?)\b/);
    const year      = yearMatch ? yearMatch[1].slice(0, 4) : '';
    
    const tvMarkers = /\bS\d+|\bS\d+E\d+\b|\bSeason\s*\d+|\bсезон\b|\bсерия\b|\d+[xх]\d+/i;
    const is_tv     = forceTv || tvMarkers.test(raw);
    
    // Разбиваем «Русское / English» и убираем год/теги
    const cleaned = raw
        .replace(/\s*\[\s*[^\]]*\]\s*/g, ' ')  // убираем [теги]
        .replace(/\s*\(\s*\d{4}[^)]*\)\s*/g, ' ') // убираем (год)
        .split('/')
        .map(p => p.trim())
        .filter(Boolean);
    
    const ru = cleaned[0] || raw.replace(/\s*[\[\(].*$/, '').trim();
    // ✅ FIX: Если нет второго названия, не копируем русское
    const en = cleaned.length > 1 ? cleaned[1] : (ru !== cleaned[0] ? ru : '');
    
    return {
        mainTitle: en || ru,
        ruTitle:   ru,
        year,
        is_tv,
        forceTv,
        isRussian: /[а-яА-ЯёЁ]/.test(ru),
        raw
    };
}

// ======================= TMDB ==============================
async function fetchTMDB(p) {
    const types = p.forceTv ? ['tv'] : (p.is_tv ? ['tv', 'movie'] : ['movie', 'tv']);
    return await searchTypes(types, p);
}

async function searchTypes(types, p) {
    for (const type of types) {
        try {
            // Поиск на русском
            const r1 = await tmdbRequest(type, p.mainTitle, p.year, 'ru-RU');
            if (r1) return { ...r1, media_type: type };
            
            // Поиск без языка
            const r2 = await tmdbRequest(type, p.mainTitle, p.year, null);
            if (r2) return { ...r2, media_type: type };

            // Если русское название отличается — пробуем его
            if (p.isRussian && p.ruTitle && p.ruTitle !== p.mainTitle) {
                const r3 = await tmdbRequest(type, p.ruTitle, p.year, 'ru-RU');
                if (r3) return { ...r3, media_type: type };
            }
        } catch (e) {
            console.warn(`TMDB [${p.mainTitle}, ${type}]: ${e.message}`);
        }
    }
    return null;
}

async function tmdbRequest(type, query, year, lang) {
    let url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}` +
              `&query=${encodeURIComponent(query)}`;
    if (lang) url += `&language=${lang}`;
    if (year) url += `&year=${year}`;
    
    const text = await safeFetch(url);
    const data = JSON.parse(text);
    return data.results?.[0] || null;
}

// ===================== KINOPOISK ===========================
async function fetchKP(p) {
    try {
        const queries = [p.mainTitle];
        if (p.ruTitle && p.ruTitle !== p.mainTitle) queries.push(p.ruTitle);
        
        for (const q of queries) {
            let url = `https://api.kinopoisk.dev/v1.4/movie/search?page=1&limit=1` +
                      `&query=${encodeURIComponent(q)}`;
            if (p.year)    url += `&year=${p.year}`;
            if (p.forceTv) url += '&type=tv-series';

            const text = await safeFetch(url, { 
                headers: { 'X-API-KEY': KP_KEY } 
            });
            const data = JSON.parse(text);

            if (data.docs?.[0]) {
                const doc    = data.docs[0];
                const kpType = doc.type || '';
                const isTvKp = /series|show|сериал/i.test(kpType);
                if (p.forceTv && !isTvKp) continue;
                return { ...doc, _source: 'kp', _isTv: isTvKp || p.is_tv };
            }
        }
    } catch (e) {
        console.warn(`KP [${p.mainTitle}]: ${e.message}`);
    }
    return null;
}

// ====================== NORMALIZE ==========================
function normalize(item, parsed, rawTitle, category) {
    const isKP = item._source === 'kp';
    const isTv =
        (isKP  && item._isTv) ||
        (!isKP && item.media_type === 'tv') ||
        item.type === 'tv-series' ||
        parsed.is_tv;
    
    const method = detectMediaMethod(isTv);
    
    // 🌍 Определяем язык и страну
    let original_language = 'en';
    let origin_country = ['US'];
    
    if (category === 'nashe_kino' || category === 'nashi_seriali') {
        original_language = 'ru';
        origin_country = ['RU'];
    } else if (category === 'televizor' || category === 'humor') {
        if (/[а-яА-ЯёЁ]/.test(parsed.ruTitle || parsed.mainTitle)) {
            original_language = 'ru';
            origin_country = ['RU'];
        }
    } else if (/[а-яА-ЯёЁ]/.test(parsed.ruTitle)) {
        original_language = 'ru';
        origin_country = ['RU'];
    }
    
    // Постер
    const rawPoster  = item.poster_path || 
                      (item.poster?.url ? item.poster.url : '') ||
                      (item.posterUrl ? item.posterUrl : '');
    const posterRel  = normalizePosterPath(rawPoster);
    const posterFull = buildImg(rawPoster);
    
    // Фон
    const rawBg  = item.backdrop_path ||
                  (item.backdrop?.url ? item.backdrop.url : '') ||
                  (item.backdropUrl ? item.backdropUrl : '');
    const bgRel  = normalizeBackdropPath(rawBg);
    const bgFull = buildBg(rawBg);
    
    const title = item.name        ||
                  item.title       ||
                  item.russianName ||
                  parsed.ruTitle   ||
                  parsed.mainTitle;
    
    // ✅ FIX: Правильная валидация vote_average с проверкой NaN
    let vote_average = 0;
    if (item.vote_average !== undefined && item.vote_average !== null) {
        const parsed_val = parseFloat(item.vote_average);
        if (!isNaN(parsed_val)) vote_average = parsed_val;
    } else if (item.rating?.kp) {
        const parsed_val = parseFloat(item.rating.kp);
        if (!isNaN(parsed_val)) vote_average = parsed_val;
    } else if (item.rating?.imdb) {
        const parsed_val = parseFloat(item.rating.imdb);
        if (!isNaN(parsed_val)) vote_average = parsed_val;
    } else if (item.voteCount) {
        const parsed_val = parseFloat(item.voteCount) / 10;
        if (!isNaN(parsed_val)) vote_average = parsed_val;
    }
    
    const release_quality = detectQuality(rawTitle || parsed.raw || '');
    const releaseDate     = item.release_date   || (item.year ? `${item.year}-01-01` : '');
    const firstAirDate    = item.first_air_date || (item.year ? `${item.year}-01-01` : '');
    
    return {
        id:                   item.id || Math.floor(Math.random() * 1_000_000),
        title,
        name:                 title,
        original_title:       item.original_title || item.alternativeName || parsed.mainTitle,
        original_name:        item.original_name || item.alternativeName || parsed.mainTitle,
        overview:             item.overview || item.description || item.annotation || '',
        poster_path:          posterRel,
        backdrop_path:        bgRel,
        img:                  posterFull,
        background_image:     bgFull,
        vote_average,
        vote_count:           item.vote_count || item.votes || 0,
        release_date:         releaseDate,
        first_air_date:       firstAirDate,
        number_of_seasons:    item.number_of_seasons || item.seasonsCount,
        type:                 method,
        method,
        media_type:           method,
        release_quality,
        source:               'V10',
        // 🌍 Новые обязательные поля
        original_language,
        origin_country,
        promo_title:          title,
        promo:                item.overview || item.description || ''
    };
}

// ====================== FALLBACK ===========================
function makeFallback(parsed, i, rawTitle, category) {
    const method = detectMediaMethod(parsed.is_tv);
    
    // 🌍 Язык/страна для фоллбэка
    let original_language = 'en';
    let origin_country = ['US'];
    
    if (category === 'nashe_kino' || category === 'nashi_seriali') {
        original_language = 'ru';
        origin_country = ['RU'];
    } else if (category === 'televizor' || category === 'humor') {
        if (/[а-яА-ЯёЁ]/.test(parsed.ruTitle || parsed.mainTitle)) {
            original_language = 'ru';
            origin_country = ['RU'];
        }
    } else if (/[а-яА-ЯёЁ]/.test(parsed.ruTitle)) {
        original_language = 'ru';
        origin_country = ['RU'];
    }
    
    return {
        id:                   -(Date.now() + i),
        title:                parsed.ruTitle || parsed.mainTitle,
        name:                 parsed.ruTitle || parsed.mainTitle,
        original_title:       parsed.mainTitle,
        original_name:        parsed.mainTitle,
        overview:             '',
        poster_path:          '',
        backdrop_path:        '',
        img:                  '',
        background_image:     '',
        vote_average:         0,
        vote_count:           0,
        release_date:         parsed.year ? `${parsed.year}-01-01` : '',
        first_air_date:       parsed.year ? `${parsed.year}-01-01` : '',
        number_of_seasons:    undefined,
        type:                 method,
        method,
        media_type:           method,
        release_quality:      detectQuality(rawTitle || ''),
        source:               'V10',
        // 🌍 Новые поля
        original_language,
        origin_country,
        promo_title:          parsed.ruTitle || parsed.mainTitle,
        promo:                ''
    };
}

// =================== JSON RESPONSE =========================
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type':                'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control':               'public, max-age=300'
        }
    });
}
