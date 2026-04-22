(function () {
  'use strict';

  const SOURCE = 'Rutor Pro';
  // Твой воркер должен отдавать заголовки CORS (Access-Control-Allow-Origin: *)
  const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
  const TMDB_API_KEY = "f348b4586d1791a40d99edd92164cb86";

  // ---------- HELPERS ----------
  function norm(s) { return (s || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, ''); }

  function score(a, b, y1, y2) {
    a = norm(a); b = norm(b);
    if (a === b) return 100;
    let same = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) same++;
    }
    let s = (same / Math.max(a.length, b.length)) * 100;
    if (y1 && y2 && String(y1) === String(y2)) s += 30; // Исправлен баг с undefined
    return s;
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------- TMDB SEARCH ----------
  function tmdb(q) {
    return fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`)
      .then(r => r.json())
      .then(j => j.results || [])
      .catch(() => []);
  }

  // ---------- SEARCH (для каталога) ----------
  async function search(item) {
    if (typeof item !== 'object' || !item) return null;
    let query = item.alt || item.title || item.name;
    if (!query) return null;

    let list = await tmdb(query);
    if (!list.length) return null;

    let best = list
      .map(r => ({
        ...r,
        score: score(item.title || item.name, r.title || r.name, item.year, (r.release_date || r.first_air_date ||
