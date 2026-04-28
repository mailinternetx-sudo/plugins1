/**
 * Rutor Pro Worker для Lampa (Исправленная версия с зеркалом)
 */

const TMDB_KEY = 'f348b4586d1791a40d99edd92164cb86';
const KP_KEY = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';
const RUTOR_URLS = [
  'https://rutor.info/top/',
  'https://rutor.is/top'
];
const MAX_ITEMS = 20;
const FETCH_TIMEOUT = 6000;
const CACHE_TTL = 3600000;
const CACHE_MAX = 300;

const cache = new Map();
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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1);

    if (!path || path === 'health') {
      return json({ status: 'ok', cache: cache.size });
    }

    try {
      const category = detect(path);
      const rawTitles = await fetchRutor(category);
      const enriched = await enrich(rawTitles.slice(0, MAX_ITEMS));

      return json({
        results: enriched,
        page: 1,
        total_pages: 1,
        total_results: enriched.length
      });
    } catch (e) {
      return json({ error: true, message: e.message }, 500);
    }
  }
};

function detect(p) {
  p = p.toLowerCase();
  if (p.includes('top24')) return 'top24';
  if (p.includes('movies_ru')) return 'nashe_kino';
  if (p.includes('movies')) return 'kino';
  if (p.includes('tv_shows_ru') || p.includes('nashi_seriali')) return 'nashi_seriali';
  if (p.includes('tv_shows') || p.includes('seriali')) return 'seriali';
  if (p.includes('televizor')) return 'televizor';
  return 'kino';
}

// ==================== ИСПРАВЛЕННАЯ ФУНКЦИЯ С ЗЕРКАЛОМ ====================
async function fetchRutor(category) {
  let html = '';
  let usedUrl = '';

  // Пробуем все зеркала по очереди
  for (const url of RUTOR_URLS) {
    try {
      html = await safeFetch(url);
      if (html && html.length > 5000) {
        usedUrl = url;
        break;
      }
    } catch (e) {
      console.warn(`Failed to fetch ${url}: ${e.message}`);
    }
  }

  if (!html) throw new Error('Не удалось получить данные с Rutor (info и is)');

  const catNames = {
    top24:         ['Топ торренты за последние 24 часа', 'Топ торренты за 24 часа'],
    kino:          ['Зарубежные фильмы', 'Самые популярные торренты в категории [Зарубежные фильмы'],
    nashe_kino:    ['Наши фильмы', 'Самые популярные торренты в категории [Наши фильмы'],
    seriali:       ['Зарубежные сериалы', 'Самые популярные торренты в категории [Зарубежные сериалы'],
    nashi_seriali: ['Русские сериалы', 'Наши сериалы', 'Самые популярные торренты в категории [Наши сериалы', 'Самые популярные торренты в категории [Русские сериалы'],
    televizor:     ['Телевизор', 'Самые популярные торренты в категории [Телевизор']
  };

  const targets = catNames[category] || ['Зарубежные фильмы'];
  let block = '';

  // Ищем блок нужной категории
  for (const target of targets) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}[\\s\\S]*?((?:<table[^>]*>|<h[1-6][^>]*>)[\\s\\S]*?)(?=</table>|##|Самые популярные)`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
      block = match[0];
      break;
    }
  }

  if (!block || block.length < 100) {
    block = html; // fallback
  }

  // Извлекаем названия только из колонки "Название"
  const titleRegex = /<a\s+href="\/torrent\/\d+[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  
  const links = [...block.matchAll(titleRegex)];

  return links
    .slice(0, 40)
    .map(m => m[1]
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(Boolean);
}
// =================================================================

async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout || FETCH_TIMEOUT;
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; RutorPro/1.0)', ...(opts.headers || {}) };
    const res = await fetch(url, { ...opts, headers, signal: controller.signal });
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

async function enrich(titles) {
  const results = [];
  for (let i = 0; i < titles.length; i++) {
    try {
      const parsed = parseTitle(titles[i]);
      const cacheKey = `v2:${parsed.mainTitle}|${parsed.year}`;

      const cached = getCache(cacheKey);
      if (cached) { results.push(cached); continue; }

      let apiData = null;
      if (parsed.isRussian) {
        apiData = await fetchKP(parsed);
      }
      if (!apiData) {
        apiData = await fetchTMDB(parsed);
      }

      if (apiData) {
        const normalized = normalize(apiData, parsed);
        setCache(cacheKey, normalized);
        results.push(normalized);
      }
    } catch (e) {
      console.warn(`Skip: ${titles[i]}`);
    }
    if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

function parseTitle(raw) {
  const yearMatch = raw.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : '';
  const is_tv = /\[S\d+|S\d+E\d+|Season\s*\d+/i.test(raw);
  const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
  
  let ru = parts[0].replace(/\s*[\[\(\/|].*$/, '').trim();
  let en = parts.length > 1 ? parts[1].replace(/\s*[\[\(\/|].*$/, '').trim() : ru;

  return {
    mainTitle: en,
    ruTitle: ru,
    year,
    is_tv,
    isRussian: /[а-яА-ЯёЁ]/.test(parts[0])
  };
}

async function fetchTMDB(p) {
  const type = p.is_tv ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(p.mainTitle)}&language=ru-RU${p.year ? `&year=${p.year}` : ''}`;
  const text = await safeFetch(url);
  const data = JSON.parse(text);
  const item = data.results?.[0];
  return item ? { ...item, media_type: type } : null;
}

async function fetchKP(p) {
  const type = p.is_tv ? 'tv-series' : 'movie';
  const url = `https://api.kinopoisk.dev/v1.4/movie/search?page=1&limit=1&query=${encodeURIComponent(p.ruTitle)}${p.year ? `&year=${p.year}` : ''}`;
  const text = await safeFetch(url, { headers: { 'X-API-KEY': KP_KEY } });
  const data = JSON.parse(text);
  return data.docs?.[0] || null;
}

function normalize(item, parsed) {
  const isTv = item.media_type === 'tv' || item.type === 'tv-series' || parsed.is_tv;
  
  const title = item.name || item.title || item.russianName || parsed.ruTitle;
  
  let p = item.poster_path || item.poster?.url || '';
  let b = item.backdrop_path || item.backdrop?.url || '';

  return {
    id: item.id || Math.floor(Math.random() * 1000000),
    title: title,
    name: title,
    original_title: item.original_title || item.alternativeName || parsed.mainTitle,
    poster_path: p, 
    backdrop_path: b,
    overview: item.overview || item.description || '',
    vote_average: parseFloat(item.vote_average || item.rating?.kp || 0),
    type: isTv ? 'tv' : 'movie',
    release_date: item.release_date || (item.year ? `${item.year}-01-01` : ''),
    first_air_date: item.first_air_date || (item.year ? `${item.year}-01-01` : ''),
    source: 'Rutor Pro'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
