/**
 * Lampa plugin.js (V10) — v5 "all-in-one + Lumio"
 *
 * Состав:
 *  1) Источник каталога V10 (rutor-воркер) — категории, пагинация,
 *     дедупликация, корректное определение типа карточек (movie/tv).
 *  2) TorrServer Switcher — выбор основного/резервного TorrServer из
 *     списка с живой проверкой (🟢/🔴) и авто-failover раз в 5 минут.
 *  3) Каталог парсеров (по мотивам LME PubTorr) — выбор Jackett/Prowlarr
 *     парсера из списка с проверкой доступности и записью в штатные
 *     ключи Lampa (jackett_url / jackett_key / parser_torrent_type).
 *  4) Lumio (бывший plugin2, v1.26.0) — онлайн-просмотр через Lampac:
 *     кнопка на карточке, выбор источника/озвучки/серии.
 *
 * Всё работает в одном файле, ставится как один плагин.
 * ВАЖНО: если отдельно установлен старый plugin2 (Lumio) — удалите его
 * из списка плагинов, иначе будет работать только тот, что загрузился первым.
 */
(function () {
    'use strict';

    if (window.v10_all_in_one_ready) return;
    window.v10_all_in_one_ready = true;

    var SOURCE_NAME = 'V10_2_lumio';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    // ================================================================
    //  НАСТРОЙКИ ПЛАГИНА
    // ================================================================
    var CONFIG = {
        // Включить модуль онлайн-просмотра Lumio
        lumio: true,
        // Анонимная статистика Lumio (uid + счётчики) → beta.mitsu.tv.
        // В исходном plugin2 была включена, здесь по умолчанию ВЫКЛЮЧЕНА.
        lumioTelemetry: false,
        // Удалённый JavaScript не выполняется.
        // Подробный лог в консоль
        debug: false
    };

    // ================================================================
    //  КАТЕГОРИИ
    // ================================================================
    var CATEGORIES = [
        { title: 'Топ 24 часа',                  url: 'top24',                method: 'movie', page_size_preview: 25, page_size: 25 },
        { title: 'Зарубежные фильмы',            url: 'movies',               method: 'movie', page_size_preview: 15, page_size: 15 },
        { title: 'Наши фильмы',                  url: 'movies_ru',            method: 'movie', page_size_preview: 15, page_size: 15 },
        { title: 'Зарубежные сериалы',           url: 'tv_shows',             method: 'tv',    page_size_preview: 15, page_size: 15 },
        { title: 'Русские сериалы',              url: 'tv_shows_ru',          method: 'tv',    page_size_preview: 15, page_size: 15 },
        { title: 'Русские детективные сериалы',  url: 'russian_detective_tv', method: 'tv',    page_size_preview: 60, page_size: 60 },
        { title: 'Телевизор',                    url: 'televizor',            method: 'tv',    page_size_preview: 15, page_size: 15 },
        { title: 'Юмор',                         url: 'humor',                method: 'tv',    page_size_preview: 15, page_size: 15 }
    ];

    // ================================================================
    //  ОБЩИЕ УТИЛИТЫ
    // ================================================================
    function noty(text) {
        try { Lampa.Noty.show(text); } catch (e) { console.log('[V10] ' + text); }
    }

    function log() {
        if (CONFIG.debug && window.console && console.log) console.log.apply(console, arguments);
    }

    // Выполнить функцию так, чтобы сбой одного модуля не ронял остальные
    function safe(name, fn) {
        try { fn(); } catch (e) { log('[V10] модуль «' + name + '» не запустился:', e); }
    }

    // ================================================================
    //  БЕЗОПАСНОСТЬ URL
    // ================================================================
    // Все URL, пришедшие из удалённых ответов, проходят через safeUrl().
    // По умолчанию разрешён только HTTPS. HTTP допускается исключительно
    // для явно заданных адресов TorrServer/парсеров, чтобы сохранить
    // совместимость со старыми установками без превращения HTTP в общий
    // канал для произвольных удалённых ссылок.
    var SAFE_HTTP_ENDPOINTS = {};

    function endpointKey(url) {
        try {
            var URLCtor = window.URL || window.webkitURL;
            if (!URLCtor) return '';
            var u = new URLCtor(String(url));
            var host = String(u.hostname || '').toLowerCase();
            var port = String(u.port || (u.protocol === 'https:' ? '443' : '80'));
            return host + ':' + port;
        } catch (e) {
            return '';
        }
    }

    function registerSafeHttpEndpoint(raw) {
        try {
            var s = String(raw || '').trim();
            if (!s) return;
            if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
            var URLCtor = window.URL || window.webkitURL;
            if (!URLCtor) return;
            var u = new URLCtor(s);
            if (u.protocol !== 'http:') return;
            var key = endpointKey(u);
            if (key) SAFE_HTTP_ENDPOINTS[key] = true;
        } catch (e) {}
    }

    function isPrivateOrServiceHost(host) {
        host = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
        if (!host) return true;

        if (
            host === 'localhost' ||
            /\.localhost$/i.test(host) ||
            /\.local$/i.test(host) ||
            /\.lan$/i.test(host) ||
            /\.home$/i.test(host) ||
            /\.internal$/i.test(host) ||
            /\.intranet$/i.test(host) ||
            /\.test$/i.test(host) ||
            host === '0.0.0.0' ||
            host === '::' ||
            host === '::1'
        ) return true;

        // IPv4 private, loopback, link-local, multicast/reserved ranges.
        var m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (m) {
            var a = +m[1], b = +m[2], c = +m[3], d = +m[4];
            if ([a,b,c,d].some(function (n) { return n < 0 || n > 255; })) return true;
            if (a === 10 || a === 127 || a === 0) return true;
            if (a === 169 && b === 254) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 100 && b >= 64 && b <= 127) return true;
            if (a >= 224) return true;
        }

        // IPv6 local/loopback/link-local/unique-local.
        if (host.indexOf(':') !== -1) {
            if (host === '::1' || host === '::') return true;
            if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
            if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
        }

        return false;
    }

    function safeUrl(raw, options) {
        options = options || {};
        if (raw === null || raw === undefined) return '';
        if (typeof raw !== 'string') return '';
        var value = raw.trim();

        if (!value || value.length > 4096) return '';
        if (/[\u0000-\u001f\u007f]/.test(value)) return '';
        if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return '';
        if (value.indexOf('\\') !== -1) return '';

        var u;
        try {
            var URLCtor = window.URL || window.webkitURL;
            if (!URLCtor) return '';
            u = new URLCtor(value);
        } catch (e) { return ''; }

        if (String(u.pathname || '').length > 2048 || String(u.search || '').length > 2048 || String(u.hash || '').length > 1024) return '';

        var protocol = String(u.protocol || '').toLowerCase();
        var host = String(u.hostname || '').toLowerCase();
        var port = String(u.port || (protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : ''));

        if (protocol !== 'https:' && protocol !== 'http:') return '';
        if (u.username || u.password) return '';
        if (isPrivateOrServiceHost(host)) return '';

        // Non-standard ports are accepted only for explicitly trusted endpoints.
        var isDefaultPort = (protocol === 'https:' && port === '443') || (protocol === 'http:' && port === '80');
        var endpoint = host + ':' + port;

        if (protocol === 'http:') {
            if (!SAFE_HTTP_ENDPOINTS[endpoint] || options.allowHttp !== true) return '';
        } else if (!isDefaultPort && !SAFE_HTTP_ENDPOINTS[endpoint]) {
            return '';
        }

        // Credentials and unsupported schemes are already rejected above.
        return u.toString().replace(/\/+$/, '');
    }

    function safeUrlList(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (v) { return safeUrl(v); }).filter(Boolean);
    }

    // Запомнить/вернуть активный контроллер (для корректного возврата после Select)
    function captureController() {
        try {
            var c = Lampa.Controller.enabled();
            return (c && c.name) ? c.name : '';
        } catch (e) { return ''; }
    }
    function restoreController(name) {
        try { Lampa.Controller.toggle(name || 'menu'); }
        catch (e) { try { Lampa.Controller.toggle('menu'); } catch (e2) {} }
    }

    // Обновить строку description у кнопки в открытых настройках
    function setSettingsDescr(paramName, text) {
        try {
            var el = $('.settings-param[data-name="' + paramName + '"] .settings-param__descr');
            if (!el.length) return;
            var inner = el.find('div').first();
            if (inner.length) inner.text(text); else el.text(text);
        } catch (e) {}
    }

    // ================================================================
    //  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
    // ================================================================
    function buildImg(item) {
        if (!item || typeof item !== 'object') return '';
        if (typeof item.img === 'string' && /^https?:\/\//i.test(item.img)) return safeUrl(item.img);
        if (typeof item.poster_path === 'string' && item.poster_path) {
            if (/^https?:\/\//i.test(item.poster_path)) return safeUrl(item.poster_path);
            if (item.poster_path.indexOf('/t/p/') === 0) return safeUrl('https://image.tmdb.org' + item.poster_path);
            return safeUrl(TMDB_IMG + item.poster_path);
        }
        return '';
    }

    function buildBg(item) {
        if (!item || typeof item !== 'object') return '';
        if (typeof item.background_image === 'string' && /^https?:\/\//i.test(item.background_image)) return safeUrl(item.background_image);
        if (typeof item.backdrop_path === 'string' && item.backdrop_path) {
            if (/^https?:\/\//i.test(item.backdrop_path)) return safeUrl(item.backdrop_path);
            if (item.backdrop_path.indexOf('/t/p/') === 0) return safeUrl('https://image.tmdb.org' + item.backdrop_path);
            return safeUrl(TMDB_BG + item.backdrop_path);
        }
        return '';
    }

    // ================================================================
    //  ОПРЕДЕЛЕНИЕ ТИПА
    // ================================================================
    function detectMediaMethod(item) {
        if (!item) return 'movie';
        if (item.method === 'tv'    || item.type === 'tv')    return 'tv';
        if (item.method === 'movie' || item.type === 'movie') return 'movie';
        if (item.number_of_seasons || item.seasons || item.first_air_date) return 'tv';
        return 'movie';
    }

    // ================================================================
    //  NORMALIZE
    //  Важно: поле `name` выставляем ТОЛЬКО сериалам. Lampa (и Lumio)
    //  определяют «сериал» по наличию `name`, поэтому раньше фильмы
    //  с `name` открывались как сериалы.
    // ================================================================
    function normalizeCard(item) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) item = {};
        var img = buildImg(item);
        var bg  = buildBg(item);

        var posterPath = item.poster_path || '';
        if (posterPath && posterPath.indexOf('/t/p/') !== 0 && posterPath.indexOf('http') !== 0) posterPath = '/t/p/w500' + posterPath;
        var backdropPath = item.backdrop_path || '';
        if (backdropPath && backdropPath.indexOf('/t/p/') !== 0 && backdropPath.indexOf('http') !== 0) backdropPath = '/t/p/original' + backdropPath;

        var title  = String(item.title || item.name || '').trim();
        var method = item.method || detectMediaMethod(item);
        var isTv   = method === 'tv';
        var out = {
            id: item.id,
            title: title,
            original_title: item.original_title || title,
            overview: item.overview || '',
            poster_path: posterPath,
            backdrop_path: backdropPath,
            img: img,
            background_image: bg,
            vote_average: item.vote_average || 0,
            release_date: item.release_date || '',
            first_air_date: isTv ? (item.first_air_date || item.release_date || '') : '',
            number_of_seasons: isTv ? (item.number_of_seasons || undefined) : undefined,
            type: method,
            method: method,
            release_quality: item.release_quality || '',
            source: SOURCE_NAME,
            promo_title: item.promo_title || title,
            promo: item.promo || item.overview || '',
            genres: item.genres_list || item.genres || [],
            vote_count: item.vote_count_kp || item.vote_count_imdb || item.vote_count || 0,
            episodes_total: item.episodes_total || undefined,
            status: item.status || ''
        };
        if (isTv) {
            out.name = String(item.name || title).trim();
            out.original_name = item.original_name || item.original_title || out.name;
        } else {
            delete out.name;
            delete out.original_name;
        }
        return out;
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();
        try { self.network.timeout(15000); } catch (e) {}

        var clientSeen = {};
        var rawCache   = {};
        var RAW_TTL    = 5 * 60 * 1000;
        var RAW_STALE_TTL = 24 * 60 * 60 * 1000;

        function seenKey(card) {
            var id = card && card.id ? String(card.id) : '';
            var t  = ((card && (card.title || card.name)) || '').toLowerCase()
                        .replace(/[^\u0400-\u04ffa-z0-9]+/gi, ' ').trim();
            var type = card && (card.method || card.type) ? String(card.method || card.type) : '';
            return (id || t) ? (id + '|' + t + '|' + type) : '';
        }

        function dedupClient(catUrl, cards, resetPage) {
            if (resetPage || !clientSeen[catUrl]) clientSeen[catUrl] = {};
            var bag = clientSeen[catUrl];
            var out = [];
            for (var i = 0; i < cards.length; i++) {
                var k = seenKey(cards[i]);
                if (!k) { out.push(cards[i]); continue; }
                if (bag[k]) continue;
                bag[k] = 1;
                out.push(cards[i]);
            }
            return out;
        }

        function forceCardType(meta, cards) {
            if (!Array.isArray(cards)) return [];
            if (!meta || meta.method !== 'tv') return cards.slice();
            return cards.map(function (card) {
                if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
                var out = {};
                Object.keys(card).forEach(function (key) { out[key] = card[key]; });
                out.type = 'tv';
                out.method = 'tv';
                if (!out.name) out.name = out.title || '';
                if (!out.first_air_date && out.release_date) out.first_air_date = out.release_date;
                return out;
            }).filter(Boolean);
        }

        function emptyPage() {
            return { results: [], total_pages: 1, page: 1, total_results: 0 };
        }

        function parseResults(json) {
            if (!json || typeof json !== 'object' || !Array.isArray(json.results)) return emptyPage();
            var results = json.results.filter(function (item) {
                return item && typeof item === 'object' && !Array.isArray(item);
            }).map(normalizeCard);
            return {
                results: results,
                page: parseInt(json.page, 10) || 1,
                total_pages: parseInt(json.total_pages, 10) || 1,
                total_results: parseInt(json.total_results, 10) || results.length
            };
        }

        // ---------------- FETCH RAW (кэш 3 мин + 1 повтор при ошибке) ----------------
        self._fetchRaw = function (url, onComplete, onError) {
            url = safeUrl(url);
            if (!url) {
                if (onError) onError({ msg: 'Недопустимый URL' });
                else onComplete(emptyPage());
                return;
            }
            var cached = rawCache[url];
            if (cached && (Date.now() - cached.t) < RAW_TTL) {
                onComplete(parseResults(cached.json));
                return;
            }

            var attempt = 0;
            function run() {
                self.network.silent(
                    url,
                    function (json) {
                        if (json && json.results && json.results.length) {
                            if (Object.keys(rawCache).length > 60) rawCache = {};
                            rawCache[url] = { t: Date.now(), json: json };
                        }
                        onComplete(parseResults(json));
                    },
                    function (err) {
                        if (attempt < 1) {
                            attempt++;
                            setTimeout(run, 800);
                            return;
                        }
                        // Если Worker временно недоступен, отдаём свежий старый кэш,
                        // чтобы каталог не превращался в пустой экран.
                        var stale = rawCache[url];
                        if (stale && (Date.now() - stale.t) < RAW_STALE_TTL) {
                            onComplete(parseResults(stale.json));
                            return;
                        }
                        log('[V10] fetch error:', url, err);
                        if (onError) onError(err);
                        else onComplete(emptyPage());
                    }
                );
            }
            run();
        };

        // ---------------- SEARCH ----------------
        self.search = function (params, onComplete) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }
            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self._fetchRaw(
                url,
                function (data) {
                    onComplete({
                        results: dedupClient('search', data.results, true),
                        page: data.page,
                        total_pages: data.total_pages
                    });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        // ---------------- CATEGORY ----------------
        self.category = function (params, onSuccess, onError) {
            var rows = new Array(CATEGORIES.length);
            var left = CATEGORIES.length;

            function finish() {
                var out = rows.filter(Boolean);
                if (out.length) onSuccess(out);
                else if (onError) onError();
                else onSuccess([]);
            }

            CATEGORIES.forEach(function (cat, idx) {
                var pageSize = cat.page_size_preview || 15;
                var url = WORKER_URL + cat.url + '?page=1&page_size=' + pageSize;

                self._fetchRaw(url, function (data) {
                    var unique = forceCardType(cat, dedupClient(cat.url, data.results, true));

                    rows[idx] = unique.length ? {
                        title: cat.title,
                        results: unique,
                        url: cat.url,
                        source: SOURCE_NAME,
                        total_pages: data.total_pages || 1
                    } : null;

                    left--;
                    if (left === 0) finish();
                });
            });
        };

        // ---------------- LIST ----------------
        self.list = function (params, onComplete) {
            var page   = params.page || 1;
            var catUrl = params.url  || 'top24';

            var meta = null;
            CATEGORIES.forEach(function (c) { if (c.url === catUrl) meta = c; });
            var pageSize = params.page_size || (meta && meta.page_size) || 15;

            var url = WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize;

            self._fetchRaw(
                url,
                function (data) {
                    var unique = forceCardType(meta, dedupClient(catUrl, data.results, page === 1));
                    onComplete({
                        results:       unique,
                        page:          data.page        || page,
                        total_pages:   data.total_pages || 1,
                        total_results: data.total_results || unique.length
                    });
                },
                function () {
                    onComplete({ results: [], page: page, total_pages: 1, total_results: 0 });
                }
            );
        };

        // ---------------- FULL ----------------
        self.full = function (params, onSuccess) {
            var card   = params.card || params;
            var method = card.method || card.type || detectMediaMethod(card);

            params.method = method;
            if (card && typeof card === 'object') {
                card.method = method;
                card.type   = method;
            }

            var savedImg     = params.img || (card && card.img) || '';
            var savedBg      = params.background_image || (card && card.background_image) || '';
            var savedQuality = params.release_quality || (card && card.release_quality) || '';

            function restoreSaved(data) {
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg)     data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality  = savedQuality;
                data.type   = method;
                data.method = method;
            }

            function fallbackFull(data) {
                data = data || {};
                if (!data.title) data.title = card.title || card.name || '';
                restoreSaved(data);
                for (var k in card) {
                    if (Object.prototype.hasOwnProperty.call(card, k) && data[k] === undefined) data[k] = card[k];
                }
                onSuccess(data);
            }

            if (!card.id || card.id <= 0 || String(card.id).length < 3) {
                fallbackFull({});
                return;
            }

            Lampa.Api.sources.tmdb.full(
                params,
                function (data) {
                    if (!data || !data.title) fallbackFull(data);
                    else {
                        restoreSaved(data);
                        onSuccess(data);
                    }
                },
                function () { fallbackFull({}); }
            );
        };
    }

    // ================================================================
    // ================================================================
    //  МОДУЛЬ 2. TORRSERVER SWITCHER
    // ================================================================
    // ================================================================
    var TS = (function () {
        var COMPONENT = 'torrserver_switcher';

        var DEFAULT_SERVERS = [
            '178.150.255.251:8090', '109.237.108.184:8090', '95.174.115.119:8888',
            '91.201.54.146:8090', '85.113.39.177:8090', '95.67.104.126:43871',
            '178.141.254.11:8090', '212.92.250.83:8090', '195.189.63.152:8090'
        ];
        var CUSTOM_SERVERS_KEY = 'torrserver_switcher_custom_v1';
        var SERVERS = DEFAULT_SERVERS.slice();

        var STORAGE_PRIMARY = 'torrserver_url';
        var STORAGE_BACKUP  = 'torrserver_switcher_backup';

        var CHECK_TIMEOUT       = 4000;
        var AUTO_CHECK_INTERVAL = 5 * 60000;

        var autoTimer = null;
        var autoStartTimer = null;
        var failStreak = 0;
        var checkAllBusy = false;
        var lastCheckStarted = 0;
        var picking   = false;

        function normalizeUserServer(raw) {
            try { registerSafeHttpEndpoint(raw); } catch (e) {}
            return normalizeUrl(raw);
        }
        function loadCustomServers() {
            try {
                var raw = Lampa.Storage.get(CUSTOM_SERVERS_KEY, []);
                if (!Array.isArray(raw)) raw = [];
                return raw.map(normalizeUserServer).filter(Boolean);
            } catch (e) { return []; }
        }
        function saveCustomServers(list) {
            try { Lampa.Storage.set(CUSTOM_SERVERS_KEY, list.slice(0, 20)); } catch (e) {}
        }
        function rebuildServers() {
            var all = DEFAULT_SERVERS.slice();
            loadCustomServers().forEach(function (u) { if (all.indexOf(shortAddr(u)) < 0 && all.indexOf(u) < 0) all.push(shortAddr(u)); });
            SERVERS = all;
            SERVERS.forEach(registerSafeHttpEndpoint);
            return SERVERS;
        }
        function isCustom(addr) {
            var short = shortAddr(addr);
            return loadCustomServers().some(function (u) { return shortAddr(u) === short; });
        }
        rebuildServers();

        function normalizeUrl(raw) {
            var u = (raw || '').trim();
            if (!u) return '';
            if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
            return safeUrl(u, { allowHttp: true });
        }

        function sameUrl(a, b) {
            return !!a && !!b && normalizeUrl(a).toLowerCase() === normalizeUrl(b).toLowerCase();
        }

        function shortAddr(url) {
            return (url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        }

        function nowMs() {
            return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }

        // Проверка через /echo — стандартный health-endpoint TorrServer.
        // При CORS-ошибке сервер считается недоступным: opaque/no-cors
        // больше не используется как ложное подтверждение работоспособности.
        function ping(rawUrl, cb) {
            var base = normalizeUrl(rawUrl);
            if (!base) { cb({ ok: false, ms: 0 }); return; }
            var full = base + '/echo';
            var start = nowMs();
            var done  = false;
            var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var timer;

            function finish(ok) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                cb({ ok: !!ok, ms: ok ? Math.round(nowMs() - start) : 0 });
            }

            timer = setTimeout(function () {
                if (controller) { try { controller.abort(); } catch (e) {} }
                finish(false);
            }, CHECK_TIMEOUT);

            function attempt() {
                try {
                    fetch(full, {
                        method: 'GET',
                        cache: 'no-store',
                        mode: 'cors',
                        signal: controller ? controller.signal : undefined
                    }).then(function (res) {
                        finish(!!res && res.ok === true);
                    })['catch'](function () {
                        finish(false);
                    });
                } catch (e) {
                    finish(false);
                }
            }

            attempt();
        }

        function formatMs(ms) {
            return ms > 0 ? '~' + ms + ' мс' : '';
        }

        function checkAll(onDone) {
            if (checkAllBusy || Date.now() - lastCheckStarted < 1200) return;
            checkAllBusy = true;
            lastCheckStarted = Date.now();
            rebuildServers();
            var results = new Array(SERVERS.length);
            var left = SERVERS.length;
            if (!left) { checkAllBusy = false; onDone([]); return; }
            SERVERS.forEach(function (addr, idx) {
                ping(addr, function (res) {
                    results[idx] = { addr: addr, url: normalizeUrl(addr), ok: res.ok, ms: res.ms, custom: isCustom(addr) };
                    left--;
                    if (left === 0) { checkAllBusy = false; onDone(results); }
                });
            });
        }

        function getPrimary() { return Lampa.Storage.get(STORAGE_PRIMARY, ''); }
        function getBackup()  { return Lampa.Storage.get(STORAGE_BACKUP, ''); }

        function primaryDescr() { return getPrimary() ? shortAddr(getPrimary()) : 'не выбран — нажмите, чтобы выбрать'; }
        function backupDescr()  { return getBackup()  ? shortAddr(getBackup())  : 'не выбран — используется при отказе основного'; }

        function refreshDescr() {
            setSettingsDescr(COMPONENT + '_primary', primaryDescr());
            setSettingsDescr(COMPONENT + '_backup',  backupDescr());
        }

        function setPrimary(url, silent) {
            url = normalizeUrl(url);
            if (!url) { noty('Недопустимый адрес TorrServer'); return; }
            Lampa.Storage.set(STORAGE_PRIMARY, url);
            if (!silent) noty('Основной сервер TorrServer: ' + shortAddr(url));
            refreshDescr();
        }
        function setBackup(url, silent) {
            url = normalizeUrl(url);
            if (!url) { noty('Недопустимый адрес TorrServer'); return; }
            Lampa.Storage.set(STORAGE_BACKUP, url);
            if (!silent) noty('Резервный сервер TorrServer: ' + shortAddr(url));
            refreshDescr();
        }

        function pickServer(mode) {
            if (picking) return;
            picking = true;

            var returnTo = captureController();
            noty('Проверка серверов TorrServer…');

            checkAll(function (results) {
                picking = false;

                var currentUrl = mode === 'primary' ? getPrimary() : getBackup();

                var sorted = results.slice().sort(function (a, b) {
                    if (a.ok !== b.ok) return a.ok ? -1 : 1;
                    return (a.ms || 9e9) - (b.ms || 9e9);
                });

                var items = sorted.map(function (r) {
                    var dot   = r.ok ? '🟢' : '🔴';
                    var mark  = sameUrl(currentUrl, r.url) ? ' ✓' : '';
                    var speed = r.ok ? formatMs(r.ms) : '';
                    return {
                        title: dot + ' ' + r.addr + (speed ? ' (' + speed + ')' : '') + mark,
                        subtitle: r.ok ? 'работает' : 'не отвечает',
                        url: r.url,
                        ok: r.ok
                    };
                });

                items.push({ title: '＋ Добавить свой TorrServer', subtitle: 'Адрес вида http://IP:PORT или https://домен', action: 'add' });
                if (loadCustomServers().length) items.push({ title: '− Удалить свой TorrServer', subtitle: 'Удалить добавленные пользователем адреса', action: 'remove' });

                Lampa.Select.show({
                    title: mode === 'primary' ? 'TorrServer — основной адрес' : 'TorrServer — резервный адрес',
                    items: items,
                    onSelect: function (item) {
                        if (item.action === 'add') {
                            var entered = window.prompt ? window.prompt('Введите адрес TorrServer', 'http://') : '';
                            var u = normalizeUserServer(entered || '');
                            if (!u) { noty('Недопустимый адрес TorrServer'); return; }
                            var custom = loadCustomServers();
                            if (custom.indexOf(u) < 0) custom.push(u);
                            saveCustomServers(custom); rebuildServers();
                            noty('TorrServer добавлен: ' + shortAddr(u));
                            pickServer(mode);
                            return;
                        }
                        if (item.action === 'remove') {
                            var customList = loadCustomServers();
                            if (!customList.length) return;
                            var labels = customList.map(function (u, i) { return { title: (i + 1) + '. ' + shortAddr(u), url: u }; });
                            Lampa.Select.show({ title: 'Удалить свой TorrServer', items: labels, onSelect: function (x) {
                                saveCustomServers(customList.filter(function (u) { return shortAddr(u) !== shortAddr(x.url); }));
                                rebuildServers(); refreshDescr(); noty('Адрес удалён');
                            }, onBack: function () { pickServer(mode); } });
                            return;
                        }
                        if (!item.ok) noty('⚠ Сервер сейчас не отвечает. Выбор сохранён, но он может быть недоступен.');
                        if (mode === 'primary') setPrimary(item.url); else setBackup(item.url);
                    },
                    onBack: function () { restoreController(returnTo); }
                });
            });
        }

        // Авто-failover: только после 2 последовательных неудач основного.
        function autoFailoverCheck() {
            var primary = getPrimary();
            var backup  = getBackup();
            if (!primary || !backup || sameUrl(primary, backup)) { failStreak = 0; return; }
            ping(primary, function (p) {
                if (p.ok) { failStreak = 0; return; }
                failStreak++;
                if (failStreak < 2) return;
                failStreak = 0;
                ping(backup, function (b) {
                    if (!b.ok) return;
                    if (!sameUrl(getPrimary(), primary)) return;
                    setPrimary(backup, true);
                    noty('⚠ TorrServer переключён на резервный: ' + shortAddr(backup));
                });
            });
        }

        function addSettings() {
            try {
                Lampa.SettingsApi.addComponent({
                    component: COMPONENT,
                    icon: '<svg height="60" viewBox="0 0 24 24" width="60" fill="currentColor">' +
                              '<path d="M4 3H20C21.1 3 22 3.9 22 5V9C22 10.1 21.1 11 20 11H4C2.9 11 2 10.1 2 9V5C2 3.9 2.9 3 4 3ZM4 13H20C21.1 13 22 13.9 22 15V19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V15C2 13.9 2.9 13 4 13ZM6 6.5C5.45 6.5 5 6.95 5 7.5C5 8.05 5.45 8.5 6 8.5C6.55 8.5 7 8.05 7 7.5C7 6.95 6.55 6.5 6 6.5ZM6 16.5C5.45 16.5 5 16.95 5 17.5C5 18.05 5.45 18.5 6 18.5C6.55 18.5 7 18.05 7 17.5C7 16.95 6.55 16.5 6 16.5Z"/>' +
                          '</svg>',
                    name: 'TorrServer'
                });

                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: { name: COMPONENT + '_primary', type: 'button', default: '' },
                    field: { name: 'Основной сервер', description: primaryDescr() },
                    onRender: function (item) {
                        item.on('hover:enter', function () { pickServer('primary'); });
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: { name: COMPONENT + '_backup', type: 'button', default: '' },
                    field: { name: 'Резервный сервер', description: backupDescr() },
                    onRender: function (item) {
                        item.on('hover:enter', function () { pickServer('backup'); });
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: { name: COMPONENT + '_recheck', type: 'button', default: '' },
                    field: {
                        name: 'Проверить все сервера сейчас',
                        description: 'Обновить статус (зелёный/красный) списка адресов'
                    },
                    onRender: function (item) {
                        item.on('hover:enter', function () { pickServer('primary'); });
                    }
                });
            } catch (e) {
                if (CONFIG.debug) console.warn('[TS-Switcher] addSettings failed:', e);
            }
        }

        function init() {
            addSettings();
            if (autoStartTimer) clearTimeout(autoStartTimer);
            autoStartTimer = setTimeout(function () { autoStartTimer = null; autoFailoverCheck(); }, 60000);
            if (autoTimer) clearInterval(autoTimer);
            autoTimer = setInterval(function () {
                if (typeof document !== 'undefined' && document.hidden) return;
                autoFailoverCheck();
            }, AUTO_CHECK_INTERVAL);
            if (typeof document !== 'undefined' && document.addEventListener) {
                document.addEventListener('visibilitychange', function () { if (!document.hidden) autoFailoverCheck(); });
            }
        }

        return { init: init, pick: pickServer };
    })();

    // ================================================================
    // ================================================================
    //  МОДУЛЬ 3. КАТАЛОГ ПАРСЕРОВ
    // ================================================================
    // ================================================================
    var PARSERS = (function () {
        var COMPONENT   = 'v10_parsers';
        var STORAGE_KEY = 'v10_selected_parser';
        var NO_PARSER   = 'no_parser';
        var CHECK_TIMEOUT = 5000;

        var LIST = [
            { id: 'lampa_app',           name: 'Lampa.app',    settings: { url: 'lampa.app',            key: '',        parser_torrent_type: 'jackett' } },
            { id: 'jacred_viewbox_dev',  name: 'Viewbox',      settings: { url: 'jacred.viewbox.dev',   key: '', parser_torrent_type: 'jackett' } },
            { id: 'unknown',             name: 'Unknown',      settings: { url: '188.119.113.252:9117', key: '',       parser_torrent_type: 'jackett' } },
            { id: 'trs_my_to',           name: 'Trs.my.to',    settings: { url: 'trs.my.to:9118',       key: '',        parser_torrent_type: 'jackett' } },
            { id: 'jacred_my_to',        name: 'Jacred.my.to', settings: { url: 'jacred.my.to',         key: '',        parser_torrent_type: 'jackett' } },
            { id: 'jacred',              name: 'Jac.red',      settings: { url: 'jac.red',              key: '',        parser_torrent_type: 'jackett' } },
            { id: 'jacred_su',           name: 'JacRed.su',    settings: { url: 'jacred.su',            key: '',        parser_torrent_type: 'jackett' } },
            { id: 'jac_red_ru',          name: 'jac-red.ru',   settings: { url: 'jac-red.ru',           key: '',        parser_torrent_type: 'jackett' } }
        ];

        var cache = {};
        var TTL = 10 * 60 * 1000;

        function protocol() {
            if (Lampa.Utils && typeof Lampa.Utils.protocol === 'function') return Lampa.Utils.protocol();
            return location.protocol === 'https:' ? 'https://' : 'http://';
        }

        function healthUrl(parser) {
            if (!parser || !parser.settings || !parser.settings.url) return '';
            var s    = parser.settings;
            var type = s.parser_torrent_type || 'jackett';
            var pre  = /^https?:\/\//i.test(s.url) ? '' : 'https://';
            // Jackett: /api/v2.0/indexers/status:healthy/results/torznab
            // Prowlarr: /api/v1/health
            var base = type === 'prowlarr'
                ? '/api/v1/health'
                : '/api/v2.0/indexers/status:healthy/results/torznab';
            var baseUrl = safeUrl(pre + s.url);
            if (!baseUrl) return '';
            return baseUrl + base + '?apikey=' + encodeURIComponent(String(s.key || '').slice(0, 256));
        }

        function getById(id) {
            var found = null;
            LIST.forEach(function (p) { if (p.id === id) found = p; });
            return found;
        }

        function getSelectedId() { return Lampa.Storage.get(STORAGE_KEY, NO_PARSER); }

        function currentName() {
            var p = getById(getSelectedId());
            return p ? p.name : 'Не выбран';
        }

        function selectDescr() {
            return 'Текущий выбор: ' + currentName() + ' (всего ' + LIST.length + ')';
        }

        function applySelected(id) {
            var parserId = id || getSelectedId();
            var parser   = getById(parserId);
            if (!parser || !parser.settings) return false;

            var s    = parser.settings;
            var type = s.parser_torrent_type || 'jackett';

            var safeParserUrl = safeUrl((/^https?:\/\//i.test(s.url) ? s.url : 'https://' + s.url));
            if (!safeParserUrl) return false;
            Lampa.Storage.set(type === 'prowlarr' ? 'prowlarr_url' : 'jackett_url', safeParserUrl);
            var keyStorage = type === 'prowlarr' ? 'prowlarr_key' : 'jackett_key';
            var existingParserKey = Lampa.Storage.get(keyStorage, '');
            Lampa.Storage.set(keyStorage, s.key || existingParserKey || '');
            Lampa.Storage.set('parser_torrent_type', type);
            Lampa.Storage.set('parser_use', true);
            return true;
        }

        // 200 → ok; 401/403 → ключ; остальные 4xx → сервер жив (ok);
        // 0 / 5xx / таймаут → недоступен
        function classify(status) {
            status = parseInt(status, 10) || 0;
            if (status >= 200 && status < 300) return 'ok';
            if (status === 401 || status === 403) return 'auth';
            if (status === 429) return 'busy';
            if (status >= 400 && status < 500) return 'bad_endpoint';
            if (status >= 500) return 'server';
            return 'network';
        }

        function checkOne(parser, cb) {
            var url = healthUrl(parser);
            if (!url) { cb('unknown'); return; }

            var key = parser.id + '::' + String(parser.settings.url || '').toLowerCase();
            var c   = cache[key];
            if (c && Date.now() < c.expires) { cb(c.status); return; }

            function done(st) {
                cache[key] = { status: st, expires: Date.now() + (st === 'network' ? 20000 : TTL) };
                cb(st);
            }

            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'text',
                timeout: CHECK_TIMEOUT,
                success: function (resp, textStatus, xhr) { done(classify(xhr ? xhr.status : 200)); },
                error: function (xhr) { done(classify(xhr ? xhr.status : 0)); }
            });
        }

        function checkAll(cb) {
            var res  = {};
            var left = LIST.length;
            if (!left) { cb(res); return; }
            LIST.forEach(function (p) {
                checkOne(p, function (st) {
                    res[p.id] = st;
                    left--;
                    if (left === 0) cb(res);
                });
            });
        }

        function statusIcon(st) {
            if (st === 'ok')   return '🟢';
            if (st === 'auth' || st === 'busy') return '🟡';
            return '🔴';
        }
        function statusText(st) {
            if (st === 'ok')   return 'Доступен';
            if (st === 'auth') return 'Ошибка ключа';
            if (st === 'busy') return 'Слишком много запросов';
            if (st === 'bad_endpoint') return 'Неверный endpoint';
            if (st === 'server') return 'Ошибка сервера';
            return 'Недоступен';
        }

        var opening = false;

        function openCatalog(force, returnTo) {
            if (opening) return;
            opening = true;
            if (force) cache = {};
            if (returnTo === undefined) returnTo = captureController();
            noty('Проверка парсеров…');

            checkAll(function (statuses) {
                opening = false;
                var selected = getSelectedId();

                var items = LIST.map(function (p) {
                    var st = statuses[p.id] || 'unknown';
                    return {
                        title: statusIcon(st) + ' ' + p.name + (selected === p.id ? ' ✓' : ''),
                        subtitle: statusText(st) + ' · ' + p.settings.url,
                        parser: p
                    };
                });

                items.push({ title: '⚪ Не использовать парсер', subtitle: 'Отключить парсер', parser: null });
                items.push({ title: '↻ Обновить проверку', subtitle: 'Сбросить кэш и проверить заново', refresh: true });

                Lampa.Select.show({
                    title: 'Каталог парсеров',
                    items: items,
                    onSelect: function (item) {
                        if (item.refresh) { openCatalog(true, returnTo); return; }

                        if (!item.parser) {
                            Lampa.Storage.set(STORAGE_KEY, NO_PARSER);
                            Lampa.Storage.set('parser_use', false);
                            noty('Парсер отключён');
                            setSettingsDescr(COMPONENT + '_select', selectDescr());
                            return;
                        }

                        Lampa.Storage.set(STORAGE_KEY, item.parser.id);
                        applySelected(item.parser.id);
                        noty('Парсер выбран: ' + item.parser.name);
                        setSettingsDescr(COMPONENT + '_select', selectDescr());
                    },
                    onBack: function () { restoreController(returnTo); }
                });
            });
        }

        function addSettings() {
            try {
                Lampa.SettingsApi.addComponent({
                    component: COMPONENT,
                    icon: '<svg height="60" viewBox="0 0 24 24" width="60" fill="currentColor">' +
                              '<path d="M12 2L2 7L12 12L22 7L12 2ZM2 12L12 17L22 12M2 17L12 22L22 17"/>' +
                          '</svg>',
                    name: 'Каталог парсеров'
                });

                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: { name: COMPONENT + '_select', type: 'button', default: '' },
                    field: { name: 'Выбрать парсер', description: selectDescr() },
                    onRender: function (item) {
                        item.on('hover:enter', function () { openCatalog(false); });
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: { name: COMPONENT + '_refresh', type: 'button', default: '' },
                    field: {
                        name: 'Обновить проверку',
                        description: 'Сбросить кэш статусов и проверить парсеры заново'
                    },
                    onRender: function (item) {
                        item.on('hover:enter', function () { openCatalog(true); });
                    }
                });
            } catch (e) {
                if (CONFIG.debug) console.warn('[V10 parsers] addSettings failed:', e);
            }
        }

        function init() {
            addSettings();
            if (getSelectedId() !== NO_PARSER) applySelected();
        }

        return { init: init, open: openCatalog, current: currentName };
    })();

    // ================================================================
    // ================================================================
    //  МОДУЛЬ 4. LUMIO (бывший plugin2 v1.26.0) — онлайн-просмотр
    //  Код исходного плагина перенесён 1:1 и завёрнут в initLumio().
    //  Изменения относительно оригинала помечены «[V10]».
    // ================================================================
    // ================================================================
    var LUMIO = {
        ready: false,
        version: '1.30.0',
        clearCache: function () {}
    };

    function initLumio() {
    if (window.nexus_online_plugin_started) return;
    window.nexus_online_plugin_started = true;

    var NEXUS_VERSION   = '1.30.0';
    var NEXUS_COMPONENT = 'nexusonline';
    var NEXUS_TITLE     = 'Lumio';
    window.nexusLumioVersion = NEXUS_VERSION;
    // Компактный inline-SVG вместо 100+ КБ base64 PNG.
    var NEXUS_LOGO_SVG =
        '<svg class="nexus-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true" focusable="false">' +
            '<defs><linearGradient id="lumioGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12d6df"/><stop offset="1" stop-color="#9b5cff"/></linearGradient></defs>' +
            '<circle cx="32" cy="32" r="28" fill="url(#lumioGrad)"/>' +
            '<path d="M27 19l18 13-18 13z" fill="#fff"/>' +
        '</svg>';
    var NEXUS_MENU_ICON = NEXUS_LOGO_SVG;
    var NEXUS_DEBUG     = false;
    var NEXUS_CACHE_TTL = 6 * 60 * 60 * 1000;
    var NEXUS_CONTENT_CACHE_TTL = 45 * 60 * 1000;
    var NEXUS_SOURCE_PROBE_TIMEOUT = 6500;
    var NEXUS_SOURCE_PROBE_CONCURRENCY = 4;
    var NEXUS_CONTENT_TIMEOUT = 16000;
var NEXUS_SOURCE_ATTEMPTS = 3;
var NEXUS_OPEN_ATTEMPTS = 3;


function timeoutForAttempt(base, attempt) {
    return base + (attempt * 4000);
}
    
    var NEXUS_SOURCE_ORDER = [
        'zetflix',
        'veoveo',
        'cdnvideohub',
        'kinotochka',
        'phantom',
        'uafilm',
        'leproduction',
        'filmix',
        'vkmovie',
        'lumio_original_subs'
        // 'pidtor' // Temporarily disabled;
    ];
    var NEXUS_ORIGINAL_SUBS_SOURCE = 'lumio_original_subs';
    var NEXUS_ORIGINAL_SUBS_LABEL = '\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b (+\u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b)';
    var NEXUS_SOURCE_ALIASES = {
        videohub: 'cdnvideohub',
        vkvideo: 'vkmovie'
    };
    var NEXUS_DEFAULT_SOURCE = 'zetflix';
    var NEXUS_BALANSER_STORAGE = 'lumio_online_balanser';
    var NEXUS_SUBTITLES_START_BACKUP = 'lumio_original_subs_subtitles_start_backup';
    
    // Clear only Lumio's own cached source lists after this release.
    var NEXUS_STORAGE_SCHEMA = '1.29.0';

function removeStorageKey(key) {
    try {
        if (Lampa.Storage.remove) Lampa.Storage.remove(key);
        else Lampa.Storage.set(key, null);
    } catch (e) {}

    try {
        if (window.localStorage) localStorage.removeItem(key);
    } catch (e2) {}
}

function resetLumioCacheOnce() {
    var saved = Lampa.Storage.get('lumio_storage_schema', '');

    if (saved === NEXUS_STORAGE_SCHEMA) return;

    try {
        if (window.localStorage) {
            Object.keys(localStorage).forEach(function (key) {
                if (
                    key.indexOf('lumio_sources_') === 0 ||
                    key.indexOf('lumio_content_') === 0 ||
                    key.indexOf('lumio_serial_choice_') === 0 ||
                    key.indexOf('lumio_choice_') === 0 ||
                    key.indexOf('nexus_choice_') === 0
                ) {
                    localStorage.removeItem(key);
                }
            });
        }
    } catch (e) {}

    removeStorageKey('lumio_source_latency');
    Lampa.Storage.set('lumio_storage_schema', NEXUS_STORAGE_SCHEMA);
}

resetLumioCacheOnce();

function restoreOriginalSubsAutostart() {
    var saved = Lampa.Storage.get(NEXUS_SUBTITLES_START_BACKUP, null);
    if (saved === null || saved === undefined) return;

    Lampa.Storage.set('subtitles_start', saved === true || saved === 'true');
    removeStorageKey(NEXUS_SUBTITLES_START_BACKUP);
}

restoreOriginalSubsAutostart();

    var NEXUS_HOST = safeUrl('https://beta.mitsu.tv/api');

    function resetTemplates() {

        Lampa.Template.add('nexus_prestige_folder',
            '<div class="lumio-prestige lumio-prestige--folder selector {card_class}" data-nexus-voice="{voice_key}">' +
                '<div class="lumio-prestige__glow"></div>' +
                '<div class="lumio-prestige__media {media_class}" style="{media_style}">' +
                    '<div class="lumio-prestige__episode-mark"><span>{media_overline}</span><b>{media_label}</b></div>' +
                    '<div class="lumio-prestige__logo">' +
                        '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
                            '<path d="M32 4 58 18v28L32 60 6 46V18L32 4Z" fill="#12D6DF"/>' +
                            '<path d="M32 4 58 18 32 33 6 18 32 4Z" fill="#9B5CFF"/>' +
                            '<path d="M25 21v22l18-11-18-11Z" fill="#fff"/>' +
                        '</svg>' +
                    '</div>' +
                '</div>' +
                '<div class="lumio-prestige__body">' +
                    '<div class="lumio-prestige__head">' +
                        '<div class="lumio-prestige__title">{title}</div>' +
                        '<div class="lumio-prestige__head-meta">' +
                            '<div class="lumio-prestige__voice {voice_badge_class}">{voice_badge}</div>' +
                            '<div class="lumio-prestige__time">{time}</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="lumio-prestige__footer">' +
                        '<div class="lumio-prestige__info">{info}</div>' +
                        '<div class="lumio-prestige__badge {badge_class}">{badge}</div>' +
                    '</div>' +
                    '<div class="lumio-prestige__progress {progress_class}"><i style="width:{progress}%"></i></div>' +
                '</div>' +
            '</div>'
        );

        Lampa.Template.add('nexus_content_loading',
            '<div class="lumio-empty nexus-loader">' +
                '<div class="nexus-loader__mark">{logo}</div>' +
                '<div class="nexus-loader__title">{title}</div>' +
                '<div class="nexus-loader__text">{text}</div>' +
                '<div class="nexus-loader__bar"><i></i></div>' +
            '</div>'
        );

        Lampa.Template.add('nexus_doesnotanswer',
            '<div class="lumio-empty">' +
                '<div class="lumio-empty__title">{title}</div>' +
                '<div class="lumio-empty__time">{text}</div>' +
            '</div>'
        );

    }

    resetTemplates();

    if (!document.getElementById('nexus-css')) {
        var styleEl = document.createElement('style');
        styleEl.id = 'nexus-css';
        styleEl.textContent = '.lumio-prestige{position:relative;overflow:hidden;border-radius:.55em;background:linear-gradient(110deg,rgba(15,23,42,.76),rgba(7,11,22,.48));border:1px solid rgba(255,255,255,.12);box-shadow:0 .45em 1.2em rgba(0,0,0,.22);display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;min-height:7.4em}.lumio-prestige__glow{position:absolute;inset:-45% -10% auto auto;width:12em;height:12em;background:radial-gradient(circle,rgba(18,214,223,.25),rgba(155,92,255,0) 68%);pointer-events:none}.lumio-prestige__body{padding:1.05em 1.15em;line-height:1.3;-webkit-box-flex:1;-webkit-flex-grow:1;-moz-box-flex:1;-ms-flex-positive:1;flex-grow:1;position:relative;min-width:0}.lumio-prestige__media{width:5.2em;min-height:7.4em;background-color:rgba(255,255,255,.08);background-position:center;background-size:cover;-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;position:relative}.lumio-prestige__media:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(5,8,16,.44))}.lumio-prestige__media--poster .lumio-prestige__logo{display:none}.lumio-prestige__logo{position:absolute;left:50%;top:50%;width:3.7em;height:3.7em;transform:translate(-50%,-50%);filter:drop-shadow(0 .35em .8em rgba(0,0,0,.38));z-index:1}.lumio-prestige__logo svg{width:100%!important;height:100%!important}.lumio-prestige__head,.lumio-prestige__footer{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;-moz-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center;gap:.8em}.lumio-prestige__title{font-size:1.55em;font-weight:600;overflow:hidden;-o-text-overflow:ellipsis;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}.lumio-prestige__time,.lumio-prestige__badge{font-size:.86em;padding:.28em .58em;border-radius:.45em;background:rgba(18,214,223,.16);color:#bdfaff;white-space:nowrap}.lumio-prestige__time:empty,.lumio-prestige__badge:empty{display:none}.lumio-prestige__info{font-size:1.02em;color:rgba(255,255,255,.72);overflow:hidden;-o-text-overflow:ellipsis;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}.lumio-prestige--folder .lumio-prestige__footer{margin-top:.85em}.lumio-prestige.focus{background:linear-gradient(110deg,rgba(18,214,223,.22),rgba(155,92,255,.24)),rgba(7,11,22,.78)}.lumio-prestige.focus:after{content:"";position:absolute;top:-0.34em;left:-0.34em;right:-0.34em;bottom:-0.34em;border-radius:.75em;border:solid .22em #fff;z-index:-1;pointer-events:none}.lumio-prestige .lumio-prestige{margin-top:1.5em}.lumio-empty{line-height:1.4}.lumio-empty__title{font-size:1.8em;margin-bottom:.3em}.lumio-empty__time{font-size:1.2em;font-weight:300;margin-bottom:1.6em}.nexus-loader{padding:2.2em 1em;text-align:center}.nexus-loader__mark{width:4.8em;height:4.8em;margin:0 auto 1em;animation:nexusPulse 1.3s ease-in-out infinite}.nexus-loader__mark svg{width:100%;height:100%;filter:drop-shadow(0 .6em 1.2em rgba(18,214,223,.28))}.nexus-loader__title{font-size:1.65em;font-weight:600}.nexus-loader__text{font-size:1.05em;color:rgba(255,255,255,.64);margin-top:.35em}.nexus-loader__bar{position:relative;overflow:hidden;width:15em;max-width:78%;height:.28em;margin:1.25em auto 0;border-radius:2em;background:rgba(255,255,255,.14)}.nexus-loader__bar i{position:absolute;inset:0 auto 0 0;width:45%;border-radius:inherit;background:linear-gradient(90deg,#12d6df,#9b5cff);animation:nexusLoad 1.15s ease-in-out infinite}@keyframes nexusPulse{0%,100%{transform:scale(.96);opacity:.72}50%{transform:scale(1);opacity:1}}@keyframes nexusLoad{0%{transform:translateX(-110%)}100%{transform:translateX(240%)}}.nexus--button svg{filter:drop-shadow(0 .2em .45em rgba(18,214,223,.35))}';
        styleEl.textContent += '.nexus-serial-filter{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center;gap:.65em}.nexus-serial-filter__value{font-size:.78em;padding:.32em .55em;border-radius:.36em;background:rgba(255,255,255,.18);white-space:nowrap;color:#fff}.nexus-serial-filter.focus .nexus-serial-filter__value{background:rgba(18,214,223,.28)} .lumio-prestige__badge.nexus-badge--uhd{background:rgba(155,92,255,.22);color:#e4d4ff}.lumio-prestige__badge.nexus-badge--hd{background:rgba(34,197,94,.20);color:#9dffc0}.lumio-prestige__badge.nexus-badge--sd{background:rgba(234,179,8,.22);color:#ffe58a}';
        styleEl.textContent += '.lumio-prestige__media--voice{background:linear-gradient(145deg,rgba(18,214,223,.34),rgba(155,92,255,.20) 58%,rgba(15,23,42,.72));overflow:hidden}.lumio-prestige__media--voice .lumio-prestige__logo{display:none}.lumio-prestige__media--voice:before{content:"";position:absolute;left:50%;top:50%;width:2.75em;height:4.25em;transform:translate(-50%,-50%);background:rgba(255,255,255,.92);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 768 1280%22%3E%3Cg transform=%22translate(0,1280) scale(0.1,-0.1)%22%3E%3Cpath d=%22M3158 12790 c-91 -11 -256 -53 -350 -89 -504 -195 -884 -646 -995 -1184 -16 -76 -17 -285 -21 -2742 -3 -2824 -4 -2785 44 -2975 153 -606 674 -1083 1284 -1175 139 -22 1297 -22 1438 0 532 80 1005 457 1218 971 31 77 84 252 84 282 0 9 -159 12 -760 12 l-760 0 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 773 2 772 3 0 255 0 255 -772 3 -773 2 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 260 0 260 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 760 0 761 0 -7 38 c-12 71 -84 274 -128 361 -193 381 -532 678 -923 806 -213 69 -201 68 -923 71 -360 1 -685 -2 -722 -6z%22/%3E%3Cpath d=%22M3 6903 c4 -1139 2 -1097 68 -1418 104 -504 329 -976 672 -1408 101 -128 380 -408 513 -515 562 -451 1232 -709 1920 -740 l149 -7 0 -895 0 -895 -1087 -3 -1088 -2 0 -510 0 -510 2690 0 2690 0 0 510 0 510 -1087 2 -1088 3 0 895 0 895 149 7 c688 31 1358 289 1920 740 133 107 412 387 513 515 343 432 568 904 672 1408 66 321 64 279 68 1418 l4 1037 -510 0 -510 0 -4 -992 c-3 -960 -4 -998 -25 -1129 -41 -258 -116 -484 -236 -715 -113 -217 -227 -373 -406 -558 -357 -368 -795 -595 -1315 -683 -100 -16 -176 -18 -835 -18 -799 0 -798 0 -1062 66 -631 159 -1186 603 -1494 1193 -120 231 -195 457 -236 715 -21 131 -22 169 -25 1129 l-4 992 -510 0 -510 0 4 -1037z%22/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 768 1280%22%3E%3Cg transform=%22translate(0,1280) scale(0.1,-0.1)%22%3E%3Cpath d=%22M3158 12790 c-91 -11 -256 -53 -350 -89 -504 -195 -884 -646 -995 -1184 -16 -76 -17 -285 -21 -2742 -3 -2824 -4 -2785 44 -2975 153 -606 674 -1083 1284 -1175 139 -22 1297 -22 1438 0 532 80 1005 457 1218 971 31 77 84 252 84 282 0 9 -159 12 -760 12 l-760 0 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 773 2 772 3 0 255 0 255 -772 3 -773 2 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 775 0 775 0 0 255 0 255 -775 0 -775 0 0 260 0 260 775 0 775 0 0 255 0 255 -775 0 -775 0 0 255 0 255 760 0 761 0 -7 38 c-12 71 -84 274 -128 361 -193 381 -532 678 -923 806 -213 69 -201 68 -923 71 -360 1 -685 -2 -722 -6z%22/%3E%3Cpath d=%22M3 6903 c4 -1139 2 -1097 68 -1418 104 -504 329 -976 672 -1408 101 -128 380 -408 513 -515 562 -451 1232 -709 1920 -740 l149 -7 0 -895 0 -895 -1087 -3 -1088 -2 0 -510 0 -510 2690 0 2690 0 0 510 0 510 -1087 2 -1088 3 0 895 0 895 149 7 c688 31 1358 289 1920 740 133 107 412 387 513 515 343 432 568 904 672 1408 66 321 64 279 68 1418 l4 1037 -510 0 -510 0 -4 -992 c-3 -960 -4 -998 -25 -1129 -41 -258 -116 -484 -236 -715 -113 -217 -227 -373 -406 -558 -357 -368 -795 -595 -1315 -683 -100 -16 -176 -18 -835 -18 -799 0 -798 0 -1062 66 -631 159 -1186 603 -1494 1193 -120 231 -195 457 -236 715 -21 131 -22 169 -25 1129 l-4 992 -510 0 -510 0 4 -1037z%22/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat;filter:drop-shadow(0 .45em .85em rgba(0,0,0,.34));z-index:1}.lumio-prestige__media--voice:after{background:linear-gradient(90deg,rgba(0,0,0,.04),rgba(5,8,16,.43))}.nexus-voice-tone-0{background:linear-gradient(145deg,rgba(18,214,223,.34),rgba(155,92,255,.20) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-1{background:linear-gradient(145deg,rgba(34,197,94,.34),rgba(18,214,223,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-2{background:linear-gradient(145deg,rgba(244,114,182,.30),rgba(155,92,255,.22) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-3{background:linear-gradient(145deg,rgba(250,204,21,.30),rgba(34,197,94,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-4{background:linear-gradient(145deg,rgba(96,165,250,.34),rgba(18,214,223,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-5{background:linear-gradient(145deg,rgba(248,113,113,.30),rgba(250,204,21,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-6{background:linear-gradient(145deg,rgba(45,212,191,.34),rgba(96,165,250,.20) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-7{background:linear-gradient(145deg,rgba(192,132,252,.32),rgba(244,114,182,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-8{background:linear-gradient(145deg,rgba(251,146,60,.30),rgba(248,113,113,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-9{background:linear-gradient(145deg,rgba(74,222,128,.30),rgba(250,204,21,.18) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-10{background:linear-gradient(145deg,rgba(56,189,248,.34),rgba(129,140,248,.20) 58%,rgba(15,23,42,.72))}.nexus-voice-tone-11{background:linear-gradient(145deg,rgba(217,70,239,.28),rgba(34,211,238,.18) 58%,rgba(15,23,42,.72))}.lumio-prestige__badge.nexus-badge--voice{background:rgba(18,214,223,.18);color:#bdfaff}';
        styleEl.textContent += '.nexus-logo-svg{display:block;width:48px;height:48px;overflow:visible;shape-rendering:geometricPrecision}.nexus-loader__mark{width:5.2em;height:5.2em;margin-bottom:1.05em}.nexus-loader__mark .nexus-logo-svg{width:100%;height:100%;filter:drop-shadow(0 .55em 1.15em rgba(18,214,223,.24))}.nexus--button{display:flex;align-items:center;gap:.45em}.nexus--button .nexus-menu-icon{display:none!important}.nexus--button .nexus-logo-svg{width:1.55em!important;height:1.55em!important;min-width:1.55em;min-height:1.55em;flex:none;filter:drop-shadow(0 .18em .34em rgba(18,214,223,.26))}.nexus--button span{display:inline-block}.nexus-controls-hidden{display:none!important}';
        styleEl.textContent += '.lumio-prestige__progress{display:none;position:absolute;left:1.15em;right:1.15em;bottom:.78em;height:.22em;overflow:hidden;border-radius:2em;background:rgba(255,255,255,.13)}.lumio-prestige__progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#12d6df,#9b5cff);box-shadow:0 0 .65em rgba(18,214,223,.62)}.lumio-prestige__progress.nexus-progress--visible{display:block}.lumio-prestige__progress.nexus-progress--done i{background:linear-gradient(90deg,#22c55e,#6ee7b7);box-shadow:0 0 .65em rgba(34,197,94,.54)}.lumio-prestige:has(.nexus-progress--visible) .lumio-prestige__footer{margin-bottom:.55em}.lumio-prestige__badge.nexus-badge--dub{background:rgba(155,92,255,.28);color:#eadcff;font-weight:700;letter-spacing:.04em}.lumio-prestige__badge.nexus-badge--continue{background:rgba(18,214,223,.22);color:#c8fbff}.lumio-prestige__badge.nexus-badge--watched{background:rgba(34,197,94,.21);color:#b6ffd0}.lumio-prestige__badge.nexus-badge--subtitles{background:rgba(234,179,8,.22);color:#ffe9a1}';
        styleEl.textContent += '.lumio-prestige__progress.nexus-progress--visible{position:relative;left:auto;right:auto;bottom:auto;margin-top:.55em}';
        styleEl.textContent += '.lumio-prestige__head-meta{display:flex;align-items:center;gap:.45em;flex:none}.lumio-prestige__voice{display:none;font-size:.76em;padding:.24em .48em;border-radius:.4em;white-space:nowrap}.lumio-prestige__voice:not(:empty){display:block}.lumio-prestige__voice.nexus-badge--dub{background:rgba(155,92,255,.28);color:#eadcff;font-weight:700;letter-spacing:.04em}.lumio-prestige__voice.nexus-badge--subtitles{background:rgba(234,179,8,.22);color:#ffe9a1}.lumio-prestige__voice.nexus-badge--voice{background:rgba(18,214,223,.16);color:#bdfaff}';
        styleEl.textContent += '.lumio-prestige__episode-mark{display:none}.lumio-prestige.nexus-episode-card{min-height:6.65em}.nexus-episode-card .lumio-prestige__body{padding:.82em 1.05em .75em}.nexus-episode-card .lumio-prestige__media{width:4.8em;min-height:6.65em}.lumio-prestige__media--episode{display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,rgba(18,214,223,.30),rgba(79,70,229,.24) 60%,rgba(15,23,42,.88))}.lumio-prestige__media--episode .lumio-prestige__logo{display:none}.lumio-prestige__media--episode .lumio-prestige__episode-mark{display:flex;position:relative;z-index:1;flex-direction:column;align-items:center;line-height:1}.lumio-prestige__episode-mark span{font-size:.74em;font-weight:600;letter-spacing:.1em;color:rgba(255,255,255,.62)}.lumio-prestige__episode-mark b{font-size:1.5em;margin-top:.18em;letter-spacing:.02em;color:#fff}.nexus-episode-tone-1{background:linear-gradient(145deg,rgba(34,197,94,.30),rgba(18,214,223,.15) 60%,rgba(15,23,42,.88))}.nexus-episode-tone-2{background:linear-gradient(145deg,rgba(155,92,255,.34),rgba(244,114,182,.15) 60%,rgba(15,23,42,.88))}.nexus-episode-tone-3{background:linear-gradient(145deg,rgba(250,204,21,.27),rgba(249,115,22,.16) 60%,rgba(15,23,42,.88))}.nexus-episode-card .lumio-prestige__footer{margin-top:.35em!important}.nexus-episode-card .lumio-prestige__progress{display:block;position:relative;left:auto;right:auto;bottom:auto;height:.2em;margin-top:.5em;visibility:hidden}.nexus-episode-card .lumio-prestige__progress.nexus-progress--visible{visibility:visible}';
        styleEl.textContent += '.nexus-episode-card .lumio-prestige__title{font-size:1.34em}.nexus-episode-card .lumio-prestige__info{font-size:.94em}';
        document.head.appendChild(styleEl);
    }

    var Network = Lampa.Reguest;

    // Lampac gets a random session-only identifier. It is intentionally NOT
    // stored in Lampa.Storage and therefore cannot become a persistent
    // cross-session pseudonym.
    var unic_id = '';
    try {
        unic_id = (Lampa.Utils.uid ? Lampa.Utils.uid(12) : String(Math.random()).slice(2) + String(Date.now())).toLowerCase();
    } catch (e) {
        unic_id = String(Math.random()).slice(2) + String(Date.now());
    }
    // Remove the legacy persistent identifier; this build never reads it.
    removeStorageKey('lampac_unic_id');

    // Telemetry is opt-in and contains only aggregate counters/source labels.
    var NEXUS_TELEMETRY_ENABLED = !!CONFIG.lumioTelemetry; // [V10] по умолчанию выключена
    var NEXUS_TELEMETRY_URL = 'https://beta.mitsu.tv/lumio-telemetry.php';
    var NEXUS_TELEMETRY_INTERVAL = 15 * 60 * 1000;
    var nexusTelemetry = (function () {
        var counters = {};
        var sources = {};
        var lastSent = 0;
        var flushTimer = 0;

        function add(target, key, amount) {
            target[key] = Math.min(50, (target[key] || 0) + (amount || 1));
        }

        function sourceKey(name) {
            return String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
        }

        function hasData() {
            return Object.keys(counters).length || Object.keys(sources).length;
        }

        function schedule() {
            if (flushTimer || !hasData()) return;
            var delay = Math.max(1000, NEXUS_TELEMETRY_INTERVAL - (Date.now() - lastSent));
            flushTimer = setTimeout(function () {
                flushTimer = 0;
                flush(false);
            }, delay);
        }

        function flush(force) {
            if (!NEXUS_TELEMETRY_ENABLED || !hasData()) return;
            if (!force && Date.now() - lastSent < NEXUS_TELEMETRY_INTERVAL) {
                schedule();
                return;
            }

            var payload = JSON.stringify({
                version: NEXUS_VERSION,
                counters: counters,
                sources: sources
            });

            counters = {};
            sources = {};
            lastSent = Date.now();

            try {
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(NEXUS_TELEMETRY_URL, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
                    return;
                }
            } catch (e) {}

            try {
                if (window.fetch) {
                    window.fetch(NEXUS_TELEMETRY_URL, {
                        method: 'POST',
                        mode: 'cors',
                        credentials: 'omit',
                        keepalive: true,
                        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                        body: payload
                    }).catch(function () {});
                }
            } catch (e2) {}
        }

        function event(name) {
            if (!NEXUS_TELEMETRY_ENABLED) return;
            add(counters, name, 1);
            flush(false);
        }

        function source(name, metric, value) {
            if (!NEXUS_TELEMETRY_ENABLED) return;
            name = sourceKey(name);
            if (!name) return;
            if (!sources[name]) sources[name] = {};
            if (metric === 'latency_ms_sum') {
                sources[name][metric] = Math.min(600000, (sources[name][metric] || 0) + Math.max(0, Math.round(value || 0)));
            } else {
                add(sources[name], metric, value || 1);
            }
            flush(false);
        }

        function latency(name, ms) {
            if (!isFinite(ms) || ms < 0) return;
            source(name, 'latency_count', 1);
            source(name, 'latency_ms_sum', ms);
        }

        try {
            var sessionKey = 'lumio_telemetry_session_' + NEXUS_VERSION;
            var sessionDay = new Date().toISOString().slice(0, 10);
            if (Lampa.Storage.get(sessionKey, '') !== sessionDay) {
                Lampa.Storage.set(sessionKey, sessionDay);
                event('session');
            }
        } catch (e3) {}

        window.addEventListener('pagehide', function () { flush(true); });
        return { event: event, source: source, latency: latency, flush: flush };
    })();
    window.nexusLumioTelemetry = nexusTelemetry;

    function accountUrl(url) {
    var safe = safeUrl(url);
    if (!safe) return '';

    // UID is a per-session protocol value only; it is not persisted.
    var isLampac = /^https:\/\/beta\.mitsu\.tv(?:\/|$)/i.test(safe);

    if (isLampac && safe.indexOf('uid=') === -1 && unic_id) {
        safe = Lampa.Utils.addUrlComponent(safe, 'uid=' + encodeURIComponent(unic_id));
    }

    if (isLampac && safe.indexOf('nws_id=') === -1) {
        var nwsid = Lampa.Storage.get('lampac_nws_id', '') || Lampa.Storage.get('lampac_nwsid', '');
        if (nwsid) safe = Lampa.Utils.addUrlComponent(safe, 'nws_id=' + encodeURIComponent(String(nwsid).slice(0, 128)));
    }

    return safeUrl(safe);
}

function addHeaders() {
    var kit_aesgcmkey = Lampa.Storage.get('kit_aesgcmkey', '');
    if (kit_aesgcmkey) {
        return { 'X-Kit-AesGcm': kit_aesgcmkey };
    }
    return {};
}

    function nexusPlainText(value) {
        return String(value == null ? '' : value)
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function nexusPidtorDetails(item) {
        var details = [];
        var quality = item.quality;
        var size = item.size_name || item.sizeName || item.filesize || item.file_size || item.torrent_size || item.size;
        var seeds = item.seeders || item.seeds || item.sid || item.peers;

        function add(value) {
            value = nexusPlainText(value);
            if (value && details.indexOf(value) === -1) details.push(value);
        }

        if (typeof quality === 'string' && quality) add(quality);
        else if (quality && typeof quality === 'object') {
            var variants = Object.keys(quality).filter(Boolean);
            if (variants.length) add(variants.join(', '));
        } else if (item.maxquality) {
            add(item.maxquality + 'p');
        }

        var voiceParts = nexusPlainText(item.voice_name || '').split(/\s*\/\s*/).filter(Boolean);
        voiceParts.forEach(function (part, index) {
            if (/^\d+$/.test(part) && (index === voiceParts.length - 1 || index > 0)) {
                add('Сиды: ' + part);
            } else {
                add(part);
            }
        });

        if (details.length && item.maxquality) {
            var maxquality = item.maxquality + 'p';
            if (details[0] !== maxquality && details.indexOf(maxquality) === -1) details.unshift(maxquality);
        }

        if (size !== undefined && size !== null && size !== '') {
            if (typeof size === 'number' && size > 1024) {
                var units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
                var index = 0;
                while (size >= 1024 && index < units.length - 1) {
                    size /= 1024;
                    index++;
                }
                size = (size >= 10 || index === 0 ? Math.round(size) : Math.round(size * 10) / 10) + ' ' + units[index];
            }
            add(size);
        }

        if (seeds !== undefined && seeds !== null && seeds !== '') {
            add('Сиды: ' + seeds);
        }

        return details.join(' · ');
    }

    function nexusPidtorKey(item) {
        var url = String(item.stream || item.url || '');

        // Tracker parameters describe the same torrent and should not create
        // several visually identical cards for a single hash.
        url = url.replace(/([?&])tr=[^&]*/gi, '$1').replace(/[?&]$/, '').replace('?&', '?');
        return [url, item.method || '', item.season || '', item.episode || ''].join('|');
    }

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function nexusLog() {
    if (NEXUS_DEBUG && window.console && console.log) {
        console.log.apply(console, arguments);
    }
}

function cleanImageUrl(url) {
    if (!url) return '';

    url = String(url);

    var cssUrl = url.match(/url\((['"]?)(.*?)\1\)/i);
    if (cssUrl && cssUrl[2]) url = cssUrl[2];

    if (url.indexOf('//') === 0) url = 'https:' + url;
    if (/^https?:\/\//i.test(url)) return safeUrl(url);

    if (url.charAt(0) === '/') {
        return safeUrl('https://image.tmdb.org/t/p/w342' + url);
    }

    return '';
}

function movieImage(movie) {
    movie = movie || {};

    var direct = movie.img || movie.poster || movie.cover || movie.image || movie.picture || movie.poster_path || movie.backdrop || movie.backdrop_path;
    if (direct) return cleanImageUrl(direct);

    try {
        if (Lampa.Utils.cardImg) return cleanImageUrl(Lampa.Utils.cardImg(movie));
    } catch (e) {}

    try {
        if (Lampa.Utils.cardImgBackground) return cleanImageUrl(Lampa.Utils.cardImgBackground(movie));
    } catch (e2) {}

    return '';
}

function mediaTemplateData(movie) {
    var img = movieImage(movie);

    return {
        media_class: img ? 'lumio-prestige__media--poster' : 'lumio-prestige__media--logo',
        media_style: img ? 'background-image:url(&quot;' + escapeHtml(img) + '&quot;)' : ''
    };
}

function stableIndex(value, max) {
    value = String(value || '');
    max = max || 1;

    var hash = 0;
    for (var i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash) % max;
}

function voiceMediaTemplateData(title, tone) {
    var index = parseInt(tone, 10);
    if (isNaN(index)) index = stableIndex(title, 12);

    return {
        media_class: 'lumio-prestige__media--voice nexus-voice-tone-' + (index % 12),
        media_style: ''
    };
}

function episodeMediaTemplateData(season, episode) {
    season = parseInt(season || 0, 10) || 1;
    episode = parseInt(episode || 0, 10) || 0;

    return {
        media_class: 'lumio-prestige__media--episode nexus-episode-tone-' + (stableIndex(season + ':' + episode, 4)),
        media_style: '',
        media_overline: 'S' + season,
        media_label: 'E' + (episode < 10 ? '0' : '') + episode
    };
}

function movieCacheKey(movie) {
    movie = movie || {};

    var year = String(movie.release_date || movie.first_air_date || '0000').slice(0, 4);
    var raw = [
        movie.source || Lampa.Storage.field('source') || 'tmdb',
        movie.id || movie.tmdb_id || movie.imdb_id || movie.kinopoisk_id || movie.title || movie.name || '',
        movie.name ? 'serial' : 'movie',
        year
    ].join(':').toLowerCase();

    var forward = 5381;
    var backward = 5381;
    for (var i = 0; i < raw.length; i++) {
        forward = ((forward << 5) + forward) ^ raw.charCodeAt(i);
        backward = ((backward << 5) + backward) ^ raw.charCodeAt(raw.length - 1 - i);
    }

    return 'lumio_sources_v129_' +
        (forward >>> 0).toString(36) + '_' +
        (backward >>> 0).toString(36) + '_' +
        raw.length.toString(36);
}

// [V10] Кэш Lumio раньше рос без ограничений (каждый просмотренный тайтл/серия
// оставляли запись в localStorage навсегда) → на ТВ это приводило к переполнению
// хранилища. Теперь устаревшие записи чистятся при старте, а при ошибке записи
// кэш ужимается и запись повторяется.
function lumioCacheKeys() {
    var out = [];
    try {
        if (!window.localStorage) return out;
        Object.keys(localStorage).forEach(function (key) {
            if (
                key.indexOf('lumio_content_') === 0 ||
                key.indexOf('lumio_sources_') === 0 ||
                key.indexOf('lumio_voice_coverage_') === 0
            ) out.push(key);
        });
    } catch (e) {}
    return out;
}

function lumioPruneCache(hard) {
    try {
        var now = Date.now();
        var entries = [];

        lumioCacheKeys().forEach(function (key) {
            var isContent = key.indexOf('lumio_content_') === 0;
            var isVoiceCoverage = key.indexOf('lumio_voice_coverage_') === 0;
            var time = 0;
            try {
                var v = JSON.parse(localStorage.getItem(key));
                time = v && v.time ? v.time : 0;
            } catch (e) {}

            // списки источников используются как «устаревший» запасной вариант — держим сутки
            var ttl = isContent ? NEXUS_CONTENT_CACHE_TTL :
                (isVoiceCoverage ? 12 * 60 * 60 * 1000 : NEXUS_CACHE_TTL * 4);
            if (!time || (now - time) > ttl) {
                removeStorageKey(key);
                return;
            }
            entries.push({ key: key, time: time });
        });

        var limit = hard ? 20 : 120;
        if (entries.length > limit) {
            entries.sort(function (a, b) { return a.time - b.time; });
            entries.slice(0, entries.length - limit).forEach(function (item) {
                removeStorageKey(item.key);
            });
        }
    } catch (e2) {}
}

function lumioClearCache() {
    lumioCacheKeys().forEach(removeStorageKey);
    removeStorageKey('lumio_source_latency');
}

function lumioCacheSet(key, value) {
    try {
        Lampa.Storage.set(key, value);
    } catch (e) {
        lumioPruneCache(true);
        try { Lampa.Storage.set(key, value); } catch (e2) {}
    }
}

// [V10] Карточки из источника V10 нельзя отдавать в Lumio как есть:
//  - source = «V10_21» серверу Lampac неизвестен → подменяем на tmdb (id — TMDB);
//  - Lumio считает сериалом всё, у чего есть `name`, поэтому фильмам `name` убираем.
function lumioPrepareMovie(movie) {
    if (!movie || movie.source !== SOURCE_NAME) return movie;

    var m = {};
    for (var k in movie) {
        if (Object.prototype.hasOwnProperty.call(movie, k)) m[k] = movie[k];
    }

    var serial = m.method === 'tv' || m.type === 'tv';
    m.source = 'tmdb';

    if (serial) {
        if (!m.name) m.name = m.title || '';
        if (!m.original_name) m.original_name = m.original_title || m.name;
        if (!m.first_air_date && m.release_date) m.first_air_date = m.release_date;
    } else {
        delete m.name;
    }

    return m;
}

function readSourcesCache(movie, allowExpired) {
    var saved = Lampa.Storage.get(movieCacheKey(movie), null);
    if (!saved || !saved.items || !saved.time) return null;
    if (!allowExpired && (Date.now() - saved.time) > NEXUS_CACHE_TTL) return null;
    var clean = filterWorkingSources(saved.items);
    return clean.length ? clean : null;
}

function saveSourcesCache(movie, items) {
    var clean = filterWorkingSources(items);
    if (!clean.length) return;
    lumioCacheSet(movieCacheKey(movie), {
        time: Date.now(),
        items: clean
    });
}

function sanitizeRemotePayload(value, depth) {
    depth = depth || 0;
    if (depth > 8 || value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 4096 ? '' : value;
    if (typeof value !== 'object') return value;

    if (Array.isArray(value)) {
        return value.map(function (v) { return sanitizeRemotePayload(v, depth + 1); }).filter(function (v) {
            return v !== null && v !== undefined;
        });
    }

    var out = {};
    Object.keys(value).forEach(function (key) {
        var v = value[key];

        if (/^(url|stream|subtitle|url_reserve|src|file|link)$/i.test(key)) {
            if (typeof v === 'string') {
                var u = safeUrl(v);
                if (u) out[key] = u;
            }
            return;
        }

        if (/^(subtitles|segments)$/i.test(key)) {
            if (Array.isArray(v)) {
                out[key] = v.map(function (entry) {
                    if (typeof entry === 'string') return safeUrl(entry);
                    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
                    var copy = {};
                    Object.keys(entry).forEach(function (ek) {
                        if (/^(url|src|file|link)$/i.test(ek)) {
                            if (typeof entry[ek] === 'string') {
                                var eu = safeUrl(entry[ek]);
                                if (eu) copy[ek] = eu;
                            }
                        } else {
                            copy[ek] = sanitizeRemotePayload(entry[ek], depth + 1);
                        }
                    });
                    return copy;
                }).filter(Boolean);
            }
            return;
        }

        if (key === 'quality' && v && typeof v === 'object' && !Array.isArray(v)) {
            var q = {};
            Object.keys(v).forEach(function (qk) {
                var qv = v[qk];
                var qu = typeof qv === 'string' ? safeUrl(qv) :
                    (qv && typeof qv === 'object' && !Array.isArray(qv)) ?
                        safeUrl(qv.url || qv.link || qv.file || qv.src || '') : '';
                if (qu) q[qk] = qu;
            });
            out[key] = q;
            return;
        }

        out[key] = sanitizeRemotePayload(v, depth + 1);
    });

    return out;
}

function isWorkingSource(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.url !== 'string') return false;
    var name;
    try { name = balanserName(j); } catch (e) { return false; }
    return NEXUS_SOURCE_ORDER.indexOf(name) >= 0 && !j.rch && !!safeUrl(j.url);
}

function sanitizeSourceItem(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    var out = {};
    Object.keys(j).forEach(function (key) {
        if (/^(url|stream|subtitle|url_reserve)$/i.test(key)) {
            if (typeof j[key] === 'string') {
                var u = safeUrl(j[key]);
                if (u) out[key] = u;
            }
        } else if (key === 'quality') {
            out.quality = sanitizeRemotePayload({ quality: j[key] }).quality || {};
        } else if (/^(subtitles|segments)$/i.test(key)) {
            out[key] = sanitizeRemotePayload(j[key]);
        } else {
            out[key] = j[key];
        }
    });
    return out;
}

function filterWorkingSources(items) {
    if (!Array.isArray(items)) return [];
    return items.map(sanitizeSourceItem).filter(function (j) {
        return !!j && isWorkingSource(j);
    });
}

function sourceRank(name) {
    name = String(name || '').toLowerCase();

    var index = NEXUS_SOURCE_ORDER.indexOf(name);
    return index >= 0 ? index : 1000;
}

function sortSourceKeys(keys) {
    return (keys || []).map(function (key, index) {
        return { key: key, index: index };
    }).sort(function (a, b) {
        var rankA = sourceRank(a.key);
        var rankB = sourceRank(b.key);

        if (rankA !== rankB) return rankA - rankB;
        return a.index - b.index;
    }).map(function (item) {
        return item.key;
    });
}

function contentCacheKey(url) {
    var value = String(url || '');
    var forward = 5381;
    var backward = 5381;
    var i;

    // The former truncated URL key treated a long normal request and its
    // `quality=true` variant as the same cache entry. Hash the complete URL
    // while keeping the storage key compact for older Lampa environments.
    for (i = 0; i < value.length; i++) {
        forward = ((forward << 5) + forward) ^ value.charCodeAt(i);
        backward = ((backward << 5) + backward) ^ value.charCodeAt(value.length - 1 - i);
    }

    return 'lumio_content_v128_' +
        (forward >>> 0).toString(36) + '_' +
        (backward >>> 0).toString(36) + '_' +
        value.length;
}

function readContentCache(url) {
    url = safeUrl(url);
    if (!url) return null;
    var saved = Lampa.Storage.get(contentCacheKey(url), null);
    if (!saved || !saved.data || !saved.time) return null;
    if ((Date.now() - saved.time) > NEXUS_CONTENT_CACHE_TTL) return null;
    return saved.data;
}

function saveContentCache(url, data) {
    url = safeUrl(url);
    if (!url || data === null || data === undefined || data === '') return;

    // HTML responses may contain arbitrary data-json/data-url attributes.
    // Do not persist raw remote HTML. JSON responses are sanitized first.
    if (typeof data === 'string') {
        try {
            var parsed = JSON.parse(data);
            if (!parsed || typeof parsed !== 'object') return;
            data = sanitizeRemotePayload(parsed);
        } catch (e) {
            return;
        }
    } else if (typeof data === 'object') {
        data = sanitizeRemotePayload(data);
    } else {
        return;
    }

    lumioCacheSet(contentCacheKey(url), {
        time: Date.now(),
        data: data
    });
}

var nexusPrefetch = {};
var nexusContentPrefetch = {};

function loadContent(url, options, call, fail) {
    options = options || {};
    url = safeUrl(url);

    if (!url) {
        if (fail) fail({ msg: 'Недопустимый URL' });
        return;
    }

    var cached = options.cache === false ? null : readContentCache(url);
    if (cached) {
        if (call) call(cached, true);
        return;
    }

    if (nexusContentPrefetch[url]) {
        nexusContentPrefetch[url].calls.push(call);
        nexusContentPrefetch[url].fails.push(fail);
        return;
    }

    nexusContentPrefetch[url] = {
        calls: [call],
        fails: [fail]
    };

    var contentNetwork = new Network();

    contentNetwork.timeout(options.timeout || NEXUS_CONTENT_TIMEOUT);
    var contentUrl = accountUrl(url);
    if (!contentUrl) {
        delete nexusContentPrefetch[url];
        if (fail) fail({ msg: 'Недопустимый URL' });
        return;
    }

    contentNetwork['native'](
        contentUrl,
        function (data) {
            var waiters = nexusContentPrefetch[url];
            saveContentCache(url, data);
            delete nexusContentPrefetch[url];

            waiters.calls.forEach(function (fn) {
                if (fn) fn(data, false);
            });
        },
        function (e) {
            var waiters = nexusContentPrefetch[url];
            delete nexusContentPrefetch[url];

            waiters.fails.forEach(function (fn) {
                if (fn) fn(e || {});
            });
        },
        false,
        {
            dataType: 'text',
            headers: addHeaders()
        }
    );
}

function loadSources(movie, call, fail, fast, idsReady) {
    if (!movie) {
        fail && fail({});
        return;
    }

    if (!idsReady) {
        resolveExternalIds(movie, function () {
            loadSources(movie, call, fail, fast, true);
        });
        return;
    }

    var key = movieCacheKey(movie) + (fast ? ':fast' : ':open');
    var cached = readSourcesCache(movie);

    if (cached && cached.length) {
        call(cached);
        return;
    }

    if (nexusPrefetch[key]) {
        nexusPrefetch[key].calls.push(call);
        nexusPrefetch[key].fails.push(fail);
        return;
    }

    nexusPrefetch[key] = {
        calls: [call],
        fails: [fail]
    };

    var url = requestParams(NEXUS_HOST + '/lite/events?life=false', movie);
    if (!safeUrl(url)) {
        delete nexusPrefetch[key];
        if (fail) fail({ msg: 'Недопустимый URL источников' });
        return;
    }

    function finishSuccess(items) {
        var waiters = nexusPrefetch[key];
        delete nexusPrefetch[key];

        saveSourcesCache(movie, items);

        waiters.calls.forEach(function (fn) {
            if (fn) fn(items);
        });
    }

    function finishFail(e) {
        var waiters = nexusPrefetch[key];
        var stale = readSourcesCache(movie, true);
        delete nexusPrefetch[key];

        if (stale && stale.length) {
            waiters.calls.forEach(function (fn) {
                if (fn) fn(stale);
            });
            return;
        }

        waiters.fails.forEach(function (fn) {
            if (fn) fn(e || {});
        });
    }

    function requestAttempt(attempt) {
        var sourceNetwork = new Network();
        var maxAttempts = fast ? 2 : NEXUS_SOURCE_ATTEMPTS;

        sourceNetwork.timeout(timeoutForAttempt(fast ? 8000 : 14000, attempt));
        sourceNetwork.silent(
            url,
            function (json) {
                var filtered = filterWorkingSources(Array.isArray(json) ? json : []);

                if (filtered.length) {
                    finishSuccess(filtered);
                } else if (attempt + 1 < maxAttempts) {
                    setTimeout(function () {
                        requestAttempt(attempt + 1);
                    }, 500 + attempt * 700);
                } else {
                    finishFail({ msg: 'Server did not return working sources' });
                }
            },
            function (e) {
                if (attempt + 1 < maxAttempts) {
                    setTimeout(function () {
                        requestAttempt(attempt + 1);
                    }, 650 + attempt * 850);
                    return;
                }

                finishFail(e || {});
            },
            false,
            {
                headers: addHeaders()
            }
        );
    }

    requestAttempt(0);
}

    function requestParams(baseUrl, movie, extraParams) {
    baseUrl = safeUrl(baseUrl);
    if (!baseUrl || !movie || typeof movie !== 'object') return '';
    var cardSource = movie.source || Lampa.Storage.field('source') || 'tmdb';
    var q = [];

    q.push('id=' + encodeURIComponent(movie.id || ''));
    q.push('title=' + encodeURIComponent(movie.title || movie.name || ''));
    q.push('original_title=' + encodeURIComponent(movie.original_title || movie.originaltitle || movie.original_name || movie.originalname || ''));
    q.push('serial=' + (movie.name ? 1 : 0));
    q.push('year=' + String(movie.release_date || movie.first_air_date || '0000').slice(0, 4));
    q.push('source=' + encodeURIComponent(cardSource));
    q.push('original_language=' + encodeURIComponent(movie.original_language || ''));

    if (movie.imdb_id || movie.imdbid) {
        q.push('imdb_id=' + encodeURIComponent(movie.imdb_id || movie.imdbid));
    }

    if (movie.kinopoisk_id || movie.kinopoiskid) {
        q.push('kinopoisk_id=' + encodeURIComponent(movie.kinopoisk_id || movie.kinopoiskid));
    }

    if (movie.tmdb_id) {
        q.push('tmdb_id=' + encodeURIComponent(movie.tmdb_id));
    }

    if (extraParams) {
        Object.keys(extraParams).forEach(function (key) {
            if (extraParams[key] !== undefined && extraParams[key] !== null && extraParams[key] !== '') {
                q.push(encodeURIComponent(key) + '=' + encodeURIComponent(extraParams[key]));
            }
        });
    }

    var sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
    return accountUrl(baseUrl + sep + q.join('&'));
}

var nexusExternalIdRequests = {};

function resolveExternalIds(movie, done) {
    if (!movie || (movie.imdb_id && movie.kinopoisk_id)) {
        done();
        return;
    }

    var key = [
        movie.source || Lampa.Storage.field('source') || 'tmdb',
        movie.id || movie.tmdb_id || '',
        movie.name ? 'serial' : 'movie'
    ].join(':');

    if (nexusExternalIdRequests[key]) {
        nexusExternalIdRequests[key].push(done);
        return;
    }

    nexusExternalIdRequests[key] = [done];

    function finish(data) {
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { data = null; }
        }

        if (data && typeof data === 'object') {
            var imdb = data.imdb_id || data.imdbid;
            var kinopoisk = data.kinopoisk_id || data.kinopoiskid || data.kp_id;

            if (imdb) movie.imdb_id = imdb;
            if (kinopoisk) movie.kinopoisk_id = kinopoisk;
        }

        var callbacks = nexusExternalIdRequests[key] || [];
        delete nexusExternalIdRequests[key];
        callbacks.forEach(function (callback) { callback(); });
    }

    var network = new Network();
    var query = [
        'id=' + encodeURIComponent(movie.id || ''),
        'serial=' + (movie.name ? 1 : 0)
    ];

    if (movie.imdb_id || movie.imdbid) {
        query.push('imdb_id=' + encodeURIComponent(movie.imdb_id || movie.imdbid));
    }

    if (movie.kinopoisk_id || movie.kinopoiskid) {
        query.push('kinopoisk_id=' + encodeURIComponent(movie.kinopoisk_id || movie.kinopoiskid));
    }

    network.timeout(6000);
    network.silent(
        accountUrl(NEXUS_HOST + '/externalids?' + query.join('&')),
        finish,
        function () { finish(null); },
        false,
        { headers: addHeaders() }
    );
}

    function balanserName(j) {
        if (!j || typeof j !== 'object') return '';
        var bals = typeof j.balanser === 'string' ? j.balanser : '';
        var rawName = typeof j.name === 'string' ? j.name : '';
        var name = rawName.split(' ')[0];
        var key = String(bals || name || '').toLowerCase();
        return NEXUS_SOURCE_ALIASES[key] || key;
    }

    function sourceDisplayName(j, name) {
        if (name === 'pidtor') return 'PidTor (beta)';
        if (name === NEXUS_ORIGINAL_SUBS_SOURCE) return NEXUS_ORIGINAL_SUBS_LABEL;
        return (j && typeof j.name === 'string' ? j.name : name);
    }

    function nexusSourceKey(name) {
        name = String(name || '').toLowerCase();
        return NEXUS_SOURCE_ALIASES[name] || name;
    }

    function nexusQualityRequestUrl(name, url) {
        name = nexusSourceKey(name);

        if (
            (name !== 'cdnvideohub' && name !== 'veoveo') ||
            !url ||
            String(url).indexOf('/lite/' + name) === -1 ||
            /[?&]quality=/i.test(url)
        ) {
            return url;
        }

        return safeUrl(Lampa.Utils.addUrlComponent(url, 'quality=true'));
    }

    function nexusQualityLabels(quality) {
        if (quality && typeof quality === 'object') return Object.keys(quality).join(', ');
        if (typeof quality === 'string') return quality;
        return '';
    }

    function nexusQualityHeight(value) {
        var match = String(value || '').match(/(\d{3,4})/);
        if (!match) return 0;

        var height = parseInt(match[1], 10);
        if (height >= 1800) return 2160;
        if (height >= 1200) return 1440;
        if (height >= 900) return 1080;
        if (height >= 600) return 720;
        if (height >= 420) return 480;
        if (height >= 300) return 360;
        return 0;
    }

    function nexusQualityLadder(value) {
        var height = nexusQualityHeight(value);
        var ladders = {
            2160: ['2160p', '1440p', '1080p', '720p', '480p', '360p'],
            1440: ['1440p', '1080p', '720p', '480p', '360p'],
            1080: ['1080p', '720p', '480p', '360p'],
            720: ['720p', '480p', '360p'],
            480: ['480p', '360p'],
            360: ['360p']
        };

        return ladders[height] || [];
    }
    
    function qualityBadge(quality) {
    if (!quality || typeof quality !== 'object') return null;

    var keys = Object.keys(quality).join(' ').toLowerCase();

    if (/2160|4k|uhd/.test(keys)) return { label: '4K', css: 'nexus-badge--uhd' };
    if (/1440|2k/.test(keys)) return { label: '2K', css: 'nexus-badge--uhd' };
    if (/1080|720|hd/.test(keys)) return { label: 'HD', css: 'nexus-badge--hd' };
    if (/480|360|240|sd/.test(keys)) return { label: 'SD', css: 'nexus-badge--sd' };

    return null;
}

    // Keep the ranking deterministic and source-independent.  A source only
    // decides which tracks exist; Lumio decides how familiar labels are shown.
    function nexusVoiceMeta(value) {
        var raw = String(value || '').replace(/\s+/g, ' ').trim();
        var search = raw.toLowerCase().replace(/\u0451/g, '\u0435');
        var compact = search.replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ').replace(/\s+/g, ' ').trim();
        var type = 'unknown';
        var label = '\u041e\u0437\u0432\u0443\u0447\u043a\u0430';
        var badge = '';
        var badgeClass = 'nexus-badge--voice';

        if (/\b(sub|subs|subtitle|subtitles)\b|\u0441\u0443\u0431\u0442\u0438\u0442\u0440/.test(search)) {
            type = 'subtitles';
            label = '\u0421\u0443\u0431\u0442\u0438\u0442\u0440\u044b';
            badge = 'SUB';
            badgeClass = 'nexus-badge--subtitles';
        } else if (/\b(original|orig|eng|en)\b|\u043e\u0440\u0438\u0433\u0438\u043d\u0430\u043b/.test(search)) {
            type = 'original';
            label = '\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b';
            badge = 'ORIG';
        } else if (/\b(dub|dubbing|dubbed)\b|\u0434\u0443\u0431\u043b\u044f\u0436|\u0434\u0443\u0431\u043b\u0438\u0440|dragon money|movie dubbing|red head sound|pifagor/.test(search)) {
            type = 'dub';
            label = '\u0414\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0439';
            badge = 'DUB';
            badgeClass = 'nexus-badge--dub';
        } else if (/\b(mvo|multi voice|multivoice)\b|\u043c\u043d\u043e\u0433\u043e\u0433\u043e\u043b/.test(search)) {
            type = 'mvo';
            label = '\u041c\u043d\u043e\u0433\u043e\u0433\u043e\u043b\u043e\u0441\u044b\u0439';
            badge = 'MVO';
        } else if (/\b(avo|author voice)\b|\u0430\u0432\u0442\u043e\u0440\u0441\u043a/.test(search)) {
            type = 'avo';
            label = '\u0410\u0432\u0442\u043e\u0440\u0441\u043a\u0438\u0439';
            badge = 'AVO';
        } else if (/\b(vo|voice over)\b|\u043e\u0434\u043d\u043e\u0433\u043e\u043b/.test(search)) {
            type = 'vo';
            label = '\u041e\u0434\u043d\u043e\u0433\u043e\u043b\u043e\u0441\u044b\u0439';
            badge = 'VO';
        } else if (/hd\s*rezka|hdrezka|rezka|lostfilm|newstudio|tvshows|le\s*production|coldfilm|baibako|alexfilm|jaskier|kerob|rudub|flarrow/.test(compact)) {
            type = 'studio';
        }

        var providerOrder = [
            /dragon money/, /movie dubbing/, /red head sound/, /pifagor/,
            /hd\s*rezka|hdrezka|rezka/, /lostfilm/, /newstudio/, /tvshows/,
            /le\s*production/, /alexfilm/, /jaskier/, /coldfilm/, /baibako/,
            /kerob/, /rudub/, /flarrow/
        ];
        // A bare "DUB"/"Дублированный" is normally the source's primary
        // official track, so it wins inside the dubbed group too.
        var providerRank = (type === 'dub' && /^(?:dub|dubbing|dubbed|\u0434\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0439|\u0434\u0443\u0431\u043b\u044f\u0436)$/.test(compact)) ? -1 : 5000;
        for (var i = 0; i < providerOrder.length; i++) {
            if (providerOrder[i].test(compact)) {
                providerRank = i;
                break;
            }
        }

        var typeRank = { dub: 0, studio: 1, mvo: 1, avo: 2, vo: 3, unknown: 4, original: 9, subtitles: 10 };
        var display = raw.replace(/^\s*(?:(?:dub|mvo|avo|vo)|\u0434\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0439|\u0434\u0443\u0431\u043b\u044f\u0436)\s*(?:[|:\/-]\s*)?/i, '').trim();
        var canonicalTitles = [
            [/dragon money/, 'Dragon Money Studio'], [/movie dubbing/, 'Movie Dubbing'],
            [/red head sound/, 'Red Head Sound'], [/pifagor/, 'Пифагор'],
            [/hd\s*rezka|hdrezka|rezka/, 'HDRezka Studio'], [/lostfilm/, 'LostFilm'],
            [/newstudio/, 'NewStudio'], [/tvshows/, 'TVShows'], [/le\s*production/, 'LE-Production'],
            [/alexfilm/, 'AlexFilm'], [/jaskier/, 'Jaskier'], [/coldfilm/, 'Coldfilm'],
            [/baibako/, 'BaibaKo'], [/kerob/, 'Kerob'], [/rudub/, 'RuDub'], [/flarrow/, 'Flarrow Films']
        ];
        for (var j = 0; j < canonicalTitles.length; j++) {
            if (canonicalTitles[j][0].test(compact)) {
                display = canonicalTitles[j][1];
                break;
            }
        }
        var providerKey = (display || (type === 'dub' ? 'generic' : raw) || 'default').toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]+/g, '');

        return {
            key: type + ':' + providerKey,
            type: type,
            label: label,
            badge: badge,
            badge_class: badgeClass,
            rank: (Object.prototype.hasOwnProperty.call(typeRank, type) ? typeRank[type] : 4) * 10000 + providerRank,
            title: display || (type === 'dub' ? label : raw) || '\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e'
        };
    }

    function nexusTimelineProgress(timeline) {
        if (!timeline || typeof timeline !== 'object') return null;

        var percent = parseFloat(timeline.percent || timeline.progress || timeline.percentage || 0);
        var position = parseFloat(timeline.time || timeline.position || timeline.currentTime || timeline.current || 0);
        var duration = parseFloat(timeline.duration || timeline.total || timeline.length || 0);

        if (percent > 0 && percent <= 1) percent *= 100;
        if ((!percent || percent > 100) && position > 0 && duration > 0) percent = position / duration * 100;
        if (!isFinite(percent) || percent < 2) return null;

        percent = Math.max(0, Math.min(100, Math.round(percent)));
        var done = percent >= 90;

        return {
            percent: percent,
            done: done,
            label: done ? '\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u043e' : ('\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c ' + percent + '%')
        };
    }

    function sanitizePlayData(play) {
        if (!play || typeof play !== 'object') return null;
        var out = {};
        Object.keys(play).forEach(function (key) {
            if (key === 'url' || key === 'subtitle' || key === 'url_reserve') {
                var u = safeUrl(play[key]);
                if (u) out[key] = u;
                return;
            }
            if (key === 'quality') {
                out.quality = {};
                if (play.quality && typeof play.quality === 'object' && !Array.isArray(play.quality)) {
                    Object.keys(play.quality).forEach(function (q) {
                        var qv = play.quality[q];
                        var qu = typeof qv === 'string' ? safeUrl(qv) :
                            (qv && typeof qv === 'object' && !Array.isArray(qv)) ?
                                safeUrl(qv.url || qv.link || qv.file || qv.src || '') : '';
                        if (!qu) return;
                        if (qv && typeof qv === 'object' && !Array.isArray(qv)) {
                            var copy = {};
                            Object.keys(qv).forEach(function (qk) {
                                if (!/^(url|link|file|src)$/i.test(qk)) copy[qk] = qv[qk];
                            });
                            copy.url = qu;
                            out.quality[q] = copy;
                        } else {
                            out.quality[q] = qu;
                        }
                    });
                }
                return;
            }
            if (key === 'subtitles' || key === 'segments') {
                out[key] = sanitizeRemotePayload(play[key]);
                return;
            }
            out[key] = play[key];
        });
        return out.url ? out : null;
    }

    function component(object) {
        object.movie = lumioPrepareMovie(object.movie); // [V10]
        var _this    = this;
        var network  = new Network();
        var scroll   = new Lampa.Scroll({ mask: true, over: true });
        var files    = new Lampa.Explorer(object);
        var filter   = new Lampa.Filter(object);
        var last;

        var sources        = {};
        var filter_sources = [];
        var balanser       = '';
        var source_url     = '';
        var initialized    = false;
        var number_requests = 0;
        var number_requests_timer;
        var request_token = 0;
        var native_subtitles_item = null;
        var is_serial = !!(object.movie && object.movie.name);
        var filter_render = null;
        var serial_filter_button = null;
        var serial_choice_key = 'lumio_serial_choice_' + movieCacheKey(object.movie || {});
        var serial_choice = Lampa.Storage.get(serial_choice_key, { season: 0, voice: '', voice_name: '', episode: 0 });
        var serial_seasons = {};
        var serial_episode_url = '';
        var serial_auto_transition = false;
        var serial_quality_hint = '';
        var serial_coverage_queue = [];
        var serial_coverage_active = false;
        var serial_coverage_timer = null;
        var serial_coverage_token = 0;
        var serial_player_close_listener = null;
        var serial_veoveo_seasons = {};
        var loading_status_timer = null;
        var loading_status_token = 0;
        var destroyed = false;

        this.activity = object.activity;

        this.stopLoadingStatus = function () {
            loading_status_token++;

            if (loading_status_timer) {
                clearInterval(loading_status_timer);
                loading_status_timer = null;
            }
        };

        this.setLoadingStatus = function (title, text) {
            if (destroyed) return;
            var loader = $('.nexus-loader').last();

            if (!loader.length) return;

            loader.find('.nexus-loader__title').text(title || '');
            loader.find('.nexus-loader__text').text(text || '');
        };

        this.loadingStatusSteps = function (title, text) {
            return [
                {
                    title: title || 'Запускаем просмотр',
                    text: text || 'Подключение к серверу'
                },
                {
                    title: 'Подбираем варианты',
                    text: 'Ищем доступные источники'
                },
                {
                    title: 'Проверяем доступность',
                    text: 'Оставляем рабочие варианты'
                },
                {
                    title: 'Готовим просмотр',
                    text: 'Уточняем качество видео'
                },
                {
                    title: 'Почти готово',
                    text: 'Осталось совсем немного'
                }
            ];
        };

        this.startLoadingStatus = function (title, text) {
            var token = ++loading_status_token;
            var index = 0;
            var steps = _this.loadingStatusSteps(title, text);

            if (loading_status_timer) {
                clearInterval(loading_status_timer);
                loading_status_timer = null;
            }

            _this.setLoadingStatus(steps[0].title, steps[0].text);

            loading_status_timer = setInterval(function () {
                if (token !== loading_status_token) return;

                index = Math.min(index + 1, steps.length - 1);
                _this.setLoadingStatus(steps[index].title, steps[index].text);
            }, 3000);
        };
        
        this.loading = function (status) {
            if (destroyed) return;
            if (!status) _this.stopLoadingStatus();

            if (!_this.activity) return;

            if (status) {
                if ($('.nexus-loader').length) _this.activity.loader(false);
                else _this.activity.loader(true);
            }
            else {
                _this.setControlsVisible(true);
                _this.activity.loader(false);
            }
        };

        this.setControlsVisible = function (visible) {
            if (destroyed) return;
            if (!filter_render) return;

            filter_render.toggleClass('nexus-controls-hidden', !visible);
        };

        this.showLoading = function (title, text) {
            if (destroyed) return;
            _this.stopLoadingStatus();
            _this.setControlsVisible(false);
            scroll.clear();
            scroll.append(Lampa.Template.get('nexus_content_loading', {
                logo: NEXUS_LOGO_SVG,
                title: escapeHtml(title || 'Запускаем просмотр'),
                text: escapeHtml(text || 'Подключение к серверу')
            }));
            _this.startLoadingStatus(title, text);
            _this.loading(true);
        };

        this.updateSourceFilter = function () {
            if (!filter_sources.length || !sources[balanser]) return;

            filter.set('sort', filter_sources.map(function (k) {
                return { title: sources[k].name, source: k, selected: k === balanser, ghost: !sources[k].show };
            }));

            filter.chosen('sort', [sources[balanser].name || balanser]);
        };

        this.installSerialFilterButton = function (render) {
            if (!is_serial || serial_filter_button) return;

            serial_filter_button = $('<div class="filter--serial selector nexus-serial-filter"><span>Фильтры</span><div class="nexus-serial-filter__value"></div></div>');
            serial_filter_button.on('hover:enter', function () {
                _this.openSerialFilter();
            });

            var holder = render.find('.torrent-filter');
            if (holder.length) holder.append(serial_filter_button);
            else render.append(serial_filter_button);

            _this.updateSerialFilterButton();
        };

        this.updateSerialFilterButton = function () {
            if (!serial_filter_button) return;

            var value = serial_choice.season ?
                (serial_choice.season + ' \u0441\u0435\u0437\u043e\u043d' +
                    (serial_choice.voice_name ? ' / ' + serial_choice.voice_name : '') +
                    (serial_choice.episode ? ' / ' + serial_choice.episode + ' \u0441\u0435\u0440\u0438\u044f' : '')) :
                '\u0421\u0435\u0437\u043e\u043d, \u043e\u0437\u0432\u0443\u0447\u043a\u0430, \u0441\u0435\u0440\u0438\u044f';

            serial_filter_button.find('.nexus-serial-filter__value').text(value);
        };

        this.saveSerialChoice = function () {
            Lampa.Storage.set(serial_choice_key, serial_choice);
            _this.updateSerialFilterButton();
        };

        this.voiceKey = function (item) {
            return nexusVoiceMeta(_this.voiceName(item)).key;
        };

        this.defaultVoiceTitle = function () {
            return '\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e';
        };

        this.isSeasonText = function (text) {
            return /(\d+)\s*(?:\u0441\u0435\u0437\u043e\u043d|season)/i.test(String(text || ''));
        };

        this.isEpisodeText = function (text) {
            return /(\d+)\s*(?:\u0441\u0435\u0440\u0438\u044f|episode)/i.test(String(text || ''));
        };

        this.voiceName = function (item) {
            item = item || {};

            var name = item.voice_name || item.voice || item.translation || item.translate || item.t || item.translator || item.dubbing || item.sound || item.details || '';
            var text = item.text || item.title || item.name || '';

            if (!name && !item.episode && text && !_this.isSeasonText(text) && !_this.isEpisodeText(text)) {
                name = text;
            }

            return String(name || _this.defaultVoiceTitle()).trim();
        };

        this.ensureSerialSeason = function (season, title, url) {
            season = parseInt(season || 0, 10);
            if (!season) return null;

            if (!serial_seasons[season]) {
                serial_seasons[season] = {
                    season: season,
                    title: title || (season + ' \u0441\u0435\u0437\u043e\u043d'),
                    url: '',
                    episodes: {},
                    voices: {}
                };
            }

            if (title && _this.isSeasonText(title)) serial_seasons[season].title = title;
            if (url && !serial_seasons[season].url) serial_seasons[season].url = url;
            if (!serial_seasons[season].voices) serial_seasons[season].voices = {};

            return serial_seasons[season];
        };

        this.ensureSerialVoice = function (season, voice) {
            var info = _this.ensureSerialSeason(season);
            if (!info) return null;

            voice = voice || {};
            var title = String(voice.title || _this.defaultVoiceTitle()).trim();
            var meta = nexusVoiceMeta(title);
            var key = String(voice.key || meta.key).toLowerCase();

            if (!key) key = 'default';

            if (!info.voices[key]) {
                info.voices[key] = {
                    key: key,
                    title: title,
                    meta: meta,
                    url: '',
                    episodes: {}
                };
            }

            if (title && info.voices[key].title === _this.defaultVoiceTitle()) info.voices[key].title = title;
            if (!info.voices[key].meta) info.voices[key].meta = meta;
            if (voice.url && !info.voices[key].url) info.voices[key].url = voice.url;

            return info.voices[key];
        };

        this.addSerialEpisode = function (season, episode, item, voice) {
            var info = _this.ensureSerialSeason(season);
            if (!info) return false;

            episode = parseInt(episode || 0, 10);
            if (!episode) return false;

            item = item || {};

            var ep = info.episodes[episode] || {
                season: parseInt(season, 10),
                episode: episode,
                title: episode + ' \u0441\u0435\u0440\u0438\u044f',
                original_title: '',
                url: ''
            };

            ep.title = episode + ' \u0441\u0435\u0440\u0438\u044f';
            ep.original_title = ep.original_title || item.text || item.title || '';
            if (item.url && !ep.url) ep.url = item.url;
            if (item.method || item.stream || item.quality) ep.item = item;

            info.episodes[episode] = ep;

            if (voice) {
                var v = _this.ensureSerialVoice(season, voice);
                if (v) v.episodes[episode] = ep;
            }

            return true;
        };

        this.collectSerialVoices = function (items) {
            return _this.collectSerialOptions(items);
        };

        this.currentVoiceList = function (season) {
            season = parseInt(season || serial_choice.season || 0, 10);
            var info = serial_seasons[season];
            if (!info) return [];

            var voices = info.voices || {};
            var keys = Lampa.Arrays.getKeys(voices);
            var hasNamedVoices = keys.some(function (key) {
                return key !== 'default';
            });

            if (hasNamedVoices) {
                keys = keys.filter(function (key) {
                    return key !== 'default';
                });
            } else if (!keys.length && Lampa.Arrays.getKeys(info.episodes || {}).length) {
                _this.ensureSerialVoice(season, { key: 'default', title: _this.defaultVoiceTitle() });
                voices = info.voices || {};
                keys = Lampa.Arrays.getKeys(voices);
            }

            return keys.map(function (key) {
                return voices[key];
            }).sort(function (a, b) {
                var am = a.meta || nexusVoiceMeta(a.title);
                var bm = b.meta || nexusVoiceMeta(b.title);
                var byRank = am.rank - bm.rank;
                if (byRank) return byRank;
                return String(a.title).localeCompare(String(b.title));
            });
        };

        this.serialVoiceCoverage = function (voice, season) {
            season = parseInt(season || serial_choice.season || 0, 10);
            var info = serial_seasons[season] || {};
            var total = Lampa.Arrays.getKeys(info.episodes || {}).length;
            var available = Lampa.Arrays.getKeys((voice && voice.episodes) || {}).length;

            if (total && available) return available + ' \u0438\u0437 ' + total + ' \u0441\u0435\u0440\u0438\u0439';

            var cached = _this.readSerialVoiceCoverage(voice, season);
            return cached ? (cached.available + ' \u0438\u0437 ' + cached.total + ' \u0441\u0435\u0440\u0438\u0439') : '';
        };

        this.serialCoverageCacheKey = function () {
            return 'lumio_voice_coverage_v1_' + movieCacheKey(object.movie || {}) + '_' + nexusSourceKey(balanser);
        };

        this.readSerialVoiceCoverage = function (voice, season) {
            if (!voice || !voice.key || !season) return null;

            try {
                var saved = Lampa.Storage.get(_this.serialCoverageCacheKey(), null);
                if (!saved || !saved.time || Date.now() - saved.time > 12 * 60 * 60 * 1000) return null;
                return saved.items && saved.items[season + ':' + voice.key] || null;
            } catch (e) {
                return null;
            }
        };

        this.saveSerialVoiceCoverage = function (voice, season) {
            if (!voice || !voice.key || !season) return;

            var info = serial_seasons[season] || {};
            var total = Lampa.Arrays.getKeys(info.episodes || {}).length;
            var available = Lampa.Arrays.getKeys(voice.episodes || {}).length;
            if (!total || !available) return;

            try {
                var key = _this.serialCoverageCacheKey();
                var saved = Lampa.Storage.get(key, null) || { items: {} };
                if (!saved.items || typeof saved.items !== 'object') saved.items = {};
                saved.items[season + ':' + voice.key] = { available: available, total: total };
                saved.time = Date.now();
                Lampa.Storage.set(key, saved);
            } catch (e) {}
        };

        this.updateSerialVoiceCoverageCard = function (voice, season) {
            var coverage = _this.serialVoiceCoverage(voice, season);
            if (!coverage || !scroll || !scroll.render) return;

            scroll.render().find('.nexus-voice-card').filter(function () {
                return $(this).attr('data-nexus-voice') === voice.key;
            }).find('.lumio-prestige__info').text(season + ' \u0441\u0435\u0437\u043e\u043d \u00b7 ' + coverage);
        };

        this.stopSerialCoveragePrefetch = function () {
            serial_coverage_token++;
            serial_coverage_queue = [];
            serial_coverage_active = false;
            if (serial_coverage_timer) clearTimeout(serial_coverage_timer);
            serial_coverage_timer = null;
        };

        this.collectSerialVoiceCoverage = function (voice, season, items) {
            if (!voice || !season || !items) return;

            items.forEach(function (item) {
                item = item || {};
                var currentSeason = parseInt(item.season || item.s || season, 10);
                var episode = parseInt(item.episode || item.e || 0, 10);
                if (currentSeason !== season || !episode) return;

                _this.addSerialEpisode(season, episode, item, {
                    key: voice.key,
                    title: voice.title
                });
            });

            _this.saveSerialVoiceCoverage(voice, season);
            _this.updateSerialVoiceCoverageCard(voice, season);
        };

        this.runSerialCoveragePrefetch = function () {
            if (destroyed || serial_coverage_active || !serial_coverage_queue.length) return;

            var task = serial_coverage_queue.shift();
            var token = serial_coverage_token;
            serial_coverage_active = true;

            loadContent(
                _this.normalizeUrl(task.voice.url),
                { timeout: 9000, cache: true },
                function (data) {
                    if (!destroyed && token === serial_coverage_token) {
                        _this.collectSerialVoiceCoverage(task.voice, task.season, _this.parseItems(data));
                    }
                    serial_coverage_active = false;
                    serial_coverage_timer = setTimeout(_this.runSerialCoveragePrefetch, 800);
                },
                function () {
                    serial_coverage_active = false;
                    serial_coverage_timer = setTimeout(_this.runSerialCoveragePrefetch, 800);
                }
            );
        };

        this.queueSerialCoveragePrefetch = function (season) {
            season = parseInt(season || serial_choice.season || 0, 10);
            if (!season || serial_choice.voice) return;

            _this.currentVoiceList(season).slice(0, 2).forEach(function (voice) {
                if (!voice || !voice.url || _this.serialVoiceCoverage(voice, season)) return;
                var queued = serial_coverage_queue.some(function (task) {
                    return task.season === season && task.voice && task.voice.key === voice.key;
                });
                if (!queued) serial_coverage_queue.push({ season: season, voice: voice });
            });

            if (!serial_coverage_active && serial_coverage_queue.length && !serial_coverage_timer) {
                serial_coverage_timer = setTimeout(function () {
                    serial_coverage_timer = null;
                    _this.runSerialCoveragePrefetch();
                }, 250);
            }
        };

        this.sortItemsByVoice = function (items) {
            return (items || []).map(function (item, index) {
                return { item: item, index: index, meta: nexusVoiceMeta(_this.voiceName(item)) };
            }).sort(function (a, b) {
                var byRank = a.meta.rank - b.meta.rank;
                if (byRank) return byRank;
                var byName = String(a.meta.title).localeCompare(String(b.meta.title));
                return byName || (a.index - b.index);
            }).map(function (entry) {
                return entry.item;
            });
        };

        this.currentEpisodeMap = function (season, voice) {
            var info = serial_seasons[season];
            if (!info) return {};

            var selected = voice && info.voices && info.voices[voice] ? info.voices[voice] : null;
            if (selected && selected.episodes && Lampa.Arrays.getKeys(selected.episodes).length) {
                return selected.episodes;
            }

            return info.episodes || {};
        };

        this.rememberVeoVeoSeasons = function () {
            if (!_this.isVeoVeoSource()) return;

            Lampa.Arrays.getKeys(serial_seasons).forEach(function (key) {
                var season = parseInt(key, 10);
                var info = serial_seasons[season];

                if (!season || !info) return;

                if (!serial_veoveo_seasons[season]) {
                    serial_veoveo_seasons[season] = {
                        season: season,
                        title: info.title || (season + ' \u0441\u0435\u0437\u043e\u043d'),
                        url: info.url || ''
                    };
                }

                if (info.title) serial_veoveo_seasons[season].title = info.title;
                if (info.url) serial_veoveo_seasons[season].url = info.url;
            });
        };

        this.restoreVeoVeoSeasons = function () {
            if (!_this.isVeoVeoSource()) return;

            Lampa.Arrays.getKeys(serial_veoveo_seasons).forEach(function (key) {
                var season = parseInt(key, 10);
                var cached = serial_veoveo_seasons[season];

                if (!season || !cached) return;

                var info = _this.ensureSerialSeason(season, cached.title, cached.url);
                if (cached.url && info && !info.url) info.url = cached.url;
            });
        };

        this.collectSerialOptions = function (items) {
            if (!is_serial || !items || !items.length) return false;

            var changed = false;
            var contextSeason = parseInt(serial_choice.season || 0, 10);
            var contextVoice = serial_choice.voice || '';
            var contextVoiceName = serial_choice.voice_name || '';

            items.forEach(function (item) {
                item = item || {};

                var season = parseInt(item.season || item.s || 0, 10);
                var episode = parseInt(item.episode || item.e || 0, 10);
                var title = item.text || item.title || item.name || '';

                if (!season && title) {
                    var sm = String(title).match(/(\d+)\s*(?:\u0441\u0435\u0437\u043e\u043d|season)/i);
                    if (sm) season = parseInt(sm[1], 10);
                }

                if (!episode && title) {
                    var em = String(title).match(/(\d+)\s*(?:\u0441\u0435\u0440\u0438\u044f|episode)/i);
                    if (em) episode = parseInt(em[1], 10);
                }

                if (!season && contextSeason) season = contextSeason;
                if (!season) return;

                item.season = season;
                if (episode) item.episode = episode;

                var hasLink = !!(item.url || item.method || item.stream || item.quality);

                if (!episode) {
                    if (!contextSeason || _this.isSeasonText(title)) {
                        _this.ensureSerialSeason(season, title || (season + ' \u0441\u0435\u0437\u043e\u043d'), item.url || '');
                        changed = true;
                        return;
                    }

                    if (!contextVoice && hasLink && title && !_this.isEpisodeText(title)) {
                        _this.ensureSerialVoice(season, {
                            key: _this.voiceKey(item),
                            title: _this.voiceName(item),
                            url: item.url || ''
                        });
                        changed = true;
                        return;
                    }
                }

                if (episode) {
                    var voiceTitle = contextVoiceName;
                    var voiceKey = contextVoice;
                    var explicitVoice = _this.voiceName(item);

                    if (!voiceKey && explicitVoice !== _this.defaultVoiceTitle()) {
                        voiceTitle = explicitVoice;
                        voiceKey = _this.voiceKey(item);
                    }

                    if (!voiceKey && hasLink) {
                        voiceKey = 'default';
                        voiceTitle = _this.defaultVoiceTitle();
                    }

                    _this.addSerialEpisode(season, episode, item, voiceKey ? {
                        key: voiceKey,
                        title: voiceTitle || _this.defaultVoiceTitle()
                    } : null);
                    changed = true;
                }
            });

            _this.rememberVeoVeoSeasons();

            return changed;
        };

        this.serialSeasonItems = function () {
            _this.restoreVeoVeoSeasons();

            return Lampa.Arrays.getKeys(serial_seasons).map(function (k) {
                return parseInt(k, 10);
            }).filter(function (season) {
                return !!season;
            }).sort(function (a, b) {
                return a - b;
            }).map(function (season) {
                var info = serial_seasons[season] || {};
                return {
                    text: info.title || (season + ' \u0441\u0435\u0437\u043e\u043d'),
                    season: season,
                    url: info.url || '',
                    folder: true,
                    nexus_serial_action: 'season'
                };
            });
        };

        this.serialVoiceItems = function () {
            var items = _this.currentVoiceList(serial_choice.season).map(function (voice, index) {
                var meta = voice.meta || nexusVoiceMeta(voice.title);
                var coverage = _this.serialVoiceCoverage(voice, serial_choice.season);
                return {
                    text: meta.title,
                    info: serial_choice.season ? (serial_choice.season + ' \u0441\u0435\u0437\u043e\u043d \u00b7 ' + (coverage || meta.label)) : (coverage || meta.label),
                    badge: meta.badge,
                    badge_class: meta.badge_class,
                    voice_tone: index,
                    season: serial_choice.season,
                    voice: voice.key,
                    voice_name: meta.title,
                    voice_key: voice.key,
                    url: voice.url || '',
                    folder: true,
                    nexus_serial_action: 'voice',
                    nexus_card_class: 'nexus-voice-card'
                };
            });

            _this.queueSerialCoveragePrefetch(serial_choice.season);
            return items;
        };

        this.serialEpisodeItems = function () {
            var episodes = _this.currentEpisodeMap(serial_choice.season, serial_choice.voice);

            return Lampa.Arrays.getKeys(episodes).map(function (k) {
                return parseInt(k, 10);
            }).filter(function (episode) {
                return !!episode;
            }).sort(function (a, b) {
                return a - b;
            }).map(function (episode) {
                var ep = episodes[episode] || {};
                var stream = ep.item || {};
                return {
                    text: episode + ' \u0441\u0435\u0440\u0438\u044f',
                    season: serial_choice.season,
                    episode: episode,
                    url: ep.url || '',
                    quality: stream.quality || ep.quality || {},
                    maxquality: stream.maxquality || ep.maxquality || '',
                    folder: false,
                    nexus_serial_action: 'episode'
                };
            });
        };

        this.serialStepItems = function (items) {
            if (!is_serial) return null;

            if (serial_choice.season && serial_choice.voice && serial_choice.episode) {
                return null;
            }

            if (!serial_choice.season) {
                return _this.serialSeasonItems();
            }

            if (!serial_choice.voice) {
                var voices = _this.currentVoiceList(serial_choice.season);

                if (voices.length === 1) {
                    serial_choice.voice = voices[0].key;
                    serial_choice.voice_name = voices[0].title;
                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();

                    if (voices[0].url && !Lampa.Arrays.getKeys(voices[0].episodes || {}).length) {
                        serial_auto_transition = true;
                        setTimeout(function () {
                            _this.selectSerialVoice({
                                voice: voices[0].key,
                                voice_name: voices[0].title
                            });
                        }, 0);

                        return [];
                    }

                    return _this.serialEpisodeItems();
                }

                return _this.serialVoiceItems();
            }

            return _this.serialEpisodeItems();
        };

        this.selectSerialSeason = function (season) {
            _this.stopSerialCoveragePrefetch();
            var info = serial_seasons[season];

            serial_choice.season = parseInt(season || 0, 10);
            serial_choice.voice = '';
            serial_choice.voice_name = '';
            serial_choice.episode = 0;
            serial_episode_url = '';
            _this.saveSerialChoice();

            var hasSeasonData = info && (
                Lampa.Arrays.getKeys(info.voices || {}).length ||
                Lampa.Arrays.getKeys(info.episodes || {}).length
            );

            if (_this.isVeoVeoSource() && !hasSeasonData) {
                var seasonUrl = _this.serialSeasonRequestUrl(serial_choice.season);

                if (seasonUrl) {
                    var token = ++request_token;

                    _this.showLoading('\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0435\u0437\u043e\u043d', serial_choice.season + ' \u0441\u0435\u0437\u043e\u043d');

                    loadContent(
                        seasonUrl,
                        { timeout: timeoutForAttempt(NEXUS_CONTENT_TIMEOUT, 1), cache: false },
                        function (data) {
                            if (token !== request_token) return;
                            _this.parse(data);
                        },
                        function () {
                            if (token !== request_token) return;

                            if (info && info.url) {
                                _this.request(accountUrl(_this.normalizeUrl(info.url)));
                                return;
                            }

                            _this.doesNotAnswer({});
                        }
                    );

                    return;
                }
            }

            if (info && info.url && !Lampa.Arrays.getKeys(info.voices || {}).length && !Lampa.Arrays.getKeys(info.episodes || {}).length) {
                _this.showLoading('\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0435\u0437\u043e\u043d', serial_choice.season + ' \u0441\u0435\u0437\u043e\u043d');
                _this.request(accountUrl(_this.normalizeUrl(info.url)));
            } else {
                _this.parse([]);
            }
        };

        this.selectSerialVoice = function (voice) {
            _this.stopSerialCoveragePrefetch();
            var info = serial_seasons[serial_choice.season] || {};
            var voices = info.voices || {};
            var selected = voices[voice.voice] || voice || {};

            serial_choice.voice = selected.key || voice.voice || '';
            serial_choice.voice_name = selected.title || voice.voice_name || '';
            serial_choice.episode = 0;
            serial_episode_url = '';
            _this.saveSerialChoice();

            if (selected.url && !Lampa.Arrays.getKeys(selected.episodes || {}).length) {
                _this.showLoading('\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043e\u0437\u0432\u0443\u0447\u043a\u0443', serial_choice.voice_name);
                _this.request(accountUrl(_this.normalizeUrl(selected.url)));
            } else {
                _this.parse([]);
            }
        };

        this.playSerialEpisode = function () {
            _this.syncEpisodeUrl();

            var url = serial_episode_url ?
                accountUrl(_this.normalizeUrl(serial_episode_url)) :
                requestParams(source_url, object.movie, _this.getSerialParams());

            _this.showLoading('\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0435\u0440\u0438\u044e', serial_choice.season + ' \u0441\u0435\u0437\u043e\u043d / ' + serial_choice.episode + ' \u0441\u0435\u0440\u0438\u044f');

            loadContent(
                url,
                { timeout: timeoutForAttempt(NEXUS_CONTENT_TIMEOUT, 1), cache: false },
                function (data) {
                    var items = _this.parseItems(data);

                    _this.collectSerialOptions(items);
                    _this.collectSerialVoices(items);

                    var item = _this.pickEpisodeItem(items, serial_choice.season, serial_choice.episode);

                    if (!item) {
                        _this.parse(items);
                        return;
                    }

                    _this.loading(false);
                    _this.open(item);
                },
                function () {
                    _this.doesNotAnswer({ msg: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0441\u0435\u0440\u0438\u0438' });
                }
            );
        };

        this.selectSerialEpisode = function (episode) {
            var episodes = _this.currentEpisodeMap(serial_choice.season, serial_choice.voice);
            var ep = episodes[episode.episode] || episode || {};

            serial_choice.episode = parseInt(episode.episode || 0, 10);
            serial_episode_url = ep.url || '';
            _this.saveSerialChoice();

            if (ep.item && (ep.item.method || ep.item.stream || ep.item.quality)) {
                _this.open(ep.item);
                return;
            }

            _this.playSerialEpisode();
        };

        this.getSerialParams = function () {
            if (!is_serial || !serial_choice.season || !serial_choice.episode) return null;

            return {
                s: serial_choice.season,
                e: serial_choice.episode,
                season: serial_choice.season,
                episode: serial_choice.episode
            };
        };

        this.filterItemsBySerialChoice = function (items) {
            if (!is_serial || !serial_choice.season || !serial_choice.episode) return items;

            var filtered = items.filter(function (item) {
                return parseInt(item.season || 0, 10) === parseInt(serial_choice.season, 10) &&
                    parseInt(item.episode || 0, 10) === parseInt(serial_choice.episode, 10);
            });

            return filtered;
        };

        this.onlySerialFolders = function (items) {
            if (!is_serial || !items || !items.length) return false;

            return items.every(function (item) {
                return item.season && !item.episode && !item.method && !item.stream && !item.quality;
            });
        };

        this.showSerialPrompt = function (text) {
            scroll.clear();
            scroll.append(Lampa.Template.get('nexus_doesnotanswer', {
                title: 'Выберите серию',
                text: text || 'Откройте Фильтры и выберите сезон и серию'
            }));
            _this.loading(false);

            setTimeout(function () {
                try {
                    Lampa.Controller.toggle('content');
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                } catch (e) {
                    if (NEXUS_DEBUG) console.error('[Lumio] serial prompt focus error:', e);
                }
            }, 50);
        };

        this.openSerialFilter = function () {
            if (!is_serial) return;

            if (serial_choice.season && serial_choice.voice && serial_choice.episode) {
                _this.openSerialFilterMenu();
            } else if (serial_choice.season && !serial_choice.voice) {
                _this.openVoiceFilter();
            } else if (serial_choice.season && serial_choice.voice) {
                _this.openEpisodeFilter(serial_choice.season);
            } else {
                _this.openSeasonFilter();
            }
        };

        this.syncEpisodeUrl = function () {
            if (!is_serial || serial_episode_url || !serial_choice.season || !serial_choice.episode) return;

            var info = serial_seasons[serial_choice.season];
            var ep = info && info.episodes ? info.episodes[serial_choice.episode] : null;
            if (ep && ep.url) serial_episode_url = ep.url;
        };

        this.openSerialFilterMenu = function () {
            if (!is_serial) return;

            Lampa.Select.show({
                title: '\u0424\u0438\u043b\u044c\u0442\u0440\u044b',
                items: [
                    { title: '\u0421\u0435\u0437\u043e\u043d: ' + serial_choice.season, action: 'season' },
                    { title: '\u041e\u0437\u0432\u0443\u0447\u043a\u0430: ' + (serial_choice.voice_name || _this.defaultVoiceTitle()), action: 'voice' },
                    { title: '\u0421\u0435\u0440\u0438\u044f: ' + serial_choice.episode, action: 'episode' }
                ],
                onSelect: function (a) {
                    Lampa.Select.close();

                    if (a.action === 'season') {
                        _this.openSeasonFilter();
                    } else if (a.action === 'voice') {
                        _this.openVoiceFilter();
                    } else if (a.action === 'episode') {
                        _this.openEpisodeFilter(serial_choice.season);
                    }
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        };

        this.openSeasonFilter = function () {
            if (!is_serial) return;

            var seasons = Lampa.Arrays.getKeys(serial_seasons).map(function (k) {
                return parseInt(k, 10);
            }).filter(function (n) {
                return !!n;
            }).sort(function (a, b) {
                return a - b;
            });

            if (!seasons.length) {
                Lampa.Noty.show('Сезоны еще загружаются, попробуйте через пару секунд');
                _this.find();
                return;
            }

            Lampa.Select.show({
                title: 'Сезон',
                items: seasons.map(function (season) {
                    return {
                        title: (serial_seasons[season].title || (season + ' сезон')),
                        season: season,
                        selected: parseInt(serial_choice.season || 0, 10) === season
                    };
                }),
                onSelect: function (a) {
                    Lampa.Select.close();
                    serial_choice.season = a.season;
                    serial_choice.voice = '';
                    serial_choice.voice_name = '';
                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();
                    _this.loadSeasonEpisodes(a.season, function () {
                        _this.openVoiceFilter();
                    });
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        };

        this.openEpisodeFilter = function (season) {
            var info = serial_seasons[season];
            if (!info) return;

            var episodeMap = _this.currentEpisodeMap(season, serial_choice.voice);
            var episodes = Lampa.Arrays.getKeys(episodeMap).map(function (k) {
                return parseInt(k, 10);
            }).filter(function (n) {
                return !!n;
            }).sort(function (a, b) {
                return a - b;
            });

            if (!episodes.length) {
                Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0441\u0435\u0440\u0438\u0438 \u0434\u043b\u044f \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043e\u0437\u0432\u0443\u0447\u043a\u0438');
                return;
            }

            Lampa.Select.show({
                title: season + ' \u0441\u0435\u0437\u043e\u043d',
                items: episodes.map(function (episode) {
                    var ep = episodeMap[episode] || {};
                    return {
                        title: episode + ' \u0441\u0435\u0440\u0438\u044f',
                        season: season,
                        episode: episode,
                        url: ep.url,
                        selected: parseInt(serial_choice.episode || 0, 10) === episode
                    };
                }),
                onSelect: function (a) {
                    Lampa.Select.close();
                    _this.selectSerialEpisode(a);
                },
                onBack: function () {
                    if (_this.currentVoiceList(serial_choice.season).length <= 1) {
                        _this.openSeasonFilter();
                    } else {
                        _this.openVoiceFilter();
                    }
                }
            });
        };

        this.prepareEpisodeVoices = function (call) {
            _this.syncEpisodeUrl();

            if (!serial_episode_url) {
                call();
                return;
            }

            var url = accountUrl(_this.normalizeUrl(serial_episode_url));

            Lampa.Loading.start();
            loadContent(
                url,
                { timeout: NEXUS_CONTENT_TIMEOUT },
                function (data) {
                    Lampa.Loading.stop();
                    _this.collectSerialOptions(_this.parseItems(data));
                    call();
                },
                function (e) {
                    Lampa.Loading.stop();
                    call();
                }
            );
        };

        this.openVoiceFilter = function () {
            var voices = _this.currentVoiceList(serial_choice.season);

            if (!voices.length) {
                Lampa.Noty.show('\u041e\u0437\u0432\u0443\u0447\u043a\u0438 \u0435\u0449\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044e\u0442\u0441\u044f');
                return;
            }

            if (voices.length === 1) {
                _this.selectSerialVoice({
                    voice: voices[0].key,
                    voice_name: voices[0].title
                });
                return;
            }

            Lampa.Select.show({
                title: '\u041e\u0437\u0432\u0443\u0447\u043a\u0430',
                items: voices.map(function (voice) {
                    return {
                        title: voice.title,
                        voice: voice.key,
                        voice_name: voice.title,
                        selected: serial_choice.voice === voice.key
                    };
                }),
                onSelect: function (a) {
                    Lampa.Select.close();
                    _this.selectSerialVoice(a);
                },
                onBack: function () {
                    _this.openSeasonFilter();
                }
            });
        };

        this.loadSeasonEpisodes = function (season, call) {
            var info = serial_seasons[season];
            var hasEpisodes = info && Lampa.Arrays.getKeys(info.episodes).length;
            if (hasEpisodes) {
                call(true);
                return;
            }

            if (!info || !info.url) {
                call(false);
                return;
            }

            var url = accountUrl(_this.normalizeUrl(info.url));

            Lampa.Loading.start();
            loadContent(
                url,
                { timeout: NEXUS_CONTENT_TIMEOUT },
                function (data) {
                    Lampa.Loading.stop();
                    _this.collectSerialOptions(_this.parseItems(data));
                    call(true);
                },
                function (e) {
                    Lampa.Loading.stop();
                    call(false);
                }
            );
        };


        this.initialize = function () {
    _this.stopLoadingStatus();
    if (_this.activity) _this.activity.loader(false);

    filter.onBack = function () {
    Lampa.Controller.toggle('content');
};

    var filterRender = filter.render();
    filter_render = filterRender;
    var search = filterRender.find('.filter--search');
    var torrent = filterRender.find('.torrent-filter');

    if (search.length && torrent.length) {
        search.appendTo(torrent);
    }

    filter.onSelect = function (type, a) {
        if (type === 'sort') {
            Lampa.Select.close();
            object.nexus_custom_select = a.source;
            _this.changeBalanser(a.source);
        }
    };

    if (filter.addButtonBack) filter.addButtonBack();

    filterRender.find('.filter--sort span').text(
        Lampa.Lang.translate('lumio_balanser') || 'Источник'
    );

    scroll.body().addClass('torrent-list');
    files.appendFiles(scroll.render());
    files.appendHead(filterRender);
    scroll.minus(files.render().find('.explorer__files-head'));
    scroll.body().append(Lampa.Template.get('nexus_content_loading', {
        logo: NEXUS_LOGO_SVG,
        title: 'Запускаем просмотр',
        text: 'Подключение к серверу'
    }));
    _this.setControlsVisible(false);
    _this.startLoadingStatus('Запускаем просмотр', 'Подключение к серверу');

    if (object.balanser) {
        sources[object.balanser] = { name: object.balanser, url: object.url };
        balanser = object.balanser;
        source_url = object.url;
        filter_sources = [balanser];
        _this.request(accountUrl(object.url));
        return;
    }

    _this.createSource();
};

        this.createSource = function (attempt) {
    if (destroyed) return;
    attempt = attempt || 0;

    if (attempt === 0) nexusTelemetry.event('content_open');

    var cached = readSourcesCache(object.movie, true);

    nexusLog('[Lumio] createSource attempt:', attempt + 1);

    if (cached && cached.length) {
        nexusLog('[Lumio] sources cache hit:', cached.length);
        _this.startSource(cached);

        loadSources(object.movie, function (json) {
            if (destroyed) return;
            saveSourcesCache(object.movie, json);
        }, function () {}, true);

        return;
    }

    _this.showLoading('Запускаем просмотр', 'Подключение к серверу');

    loadSources(
        object.movie,
        function (json) {
            if (destroyed) return;
            _this.startSource(json);
        },
        function (e) {
            if (destroyed) return;
            if (NEXUS_DEBUG) console.error('[Lumio] createSource error:', e);
            if (attempt + 1 < NEXUS_OPEN_ATTEMPTS) {
                _this.showLoading('Пробуем снова', 'Сервер отвечает чуть дольше обычного');
                setTimeout(function () {
                    if (destroyed) return;
                    _this.createSource(attempt + 1);
                }, 1200 + attempt * 1400);
                return;
            }
            nexusTelemetry.event('source_no_response');
            _this.doesNotAnswer({ msg: (e && e.msg) || 'Ошибка подключения к серверу' });
        },
        false
    );
};

        // ── startSource ─────────────────────────────────────────────────────
        this.resetSerialSourceState = function () {
            if (!is_serial) return;

            _this.stopSerialCoveragePrefetch();
            serial_seasons = {};
            serial_episode_url = '';
            serial_quality_hint = '';
        };

        this.activateSource = function (name, saveChoice) {
            if (!sources[name]) return false;

            balanser = name;
            source_url = sources[name].url;
            nexusTelemetry.source(name, 'selected');
            if (saveChoice) nexusTelemetry.source(name, 'manual_switch');
            if (saveChoice && name !== NEXUS_ORIGINAL_SUBS_SOURCE) {
                Lampa.Storage.set(NEXUS_BALANSER_STORAGE, name);
            }
            _this.updateSourceFilter();

            return true;
        };

        this.sourceRequestUrl = function (name) {
            if (!sources[name]) return '';

            return safeUrl(requestParams(sources[name].url, object.movie, _this.getSerialParams()));
        };

        this.withSourceReady = function (name, success, error) {
            if (!sources[name]) {
                if (error) error({ msg: 'Источник недоступен' });
                return;
            }
            success();
        };

        this.isVeoVeoSource = function () {
            return String(balanser || '').toLowerCase() === 'veoveo';
        };

        this.isOriginalSubsSource = function () {
            return balanser === NEXUS_ORIGINAL_SUBS_SOURCE;
        };

        this.addOriginalSubsSource = function () {
            // This is a virtual source: it never participates in the startup
            // probe and does not make a request until the user selects it.
            if (is_serial) return;

            sources[NEXUS_ORIGINAL_SUBS_SOURCE] = {
                name: NEXUS_ORIGINAL_SUBS_LABEL,
                url: '',
                show: true,
                virtual: true,
                rch: false
            };

            filter_sources = sortSourceKeys(Lampa.Arrays.getKeys(sources));
        };

        this.requestNativeSubtitleTrack = function (done) {
            var url = requestParams(NEXUS_HOST + '/lite/phantom', object.movie);

            loadContent(
                url,
                { timeout: 12000 },
                function (data) {
                    var item = _this.parseItems(data).filter(function (candidate) {
                        var translation = String(candidate.translate || candidate.translation || '').trim().toLowerCase();
                        return translation === '\u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b';
                    })[0] || null;

                    if (item && item.url && item.url.indexOf('subtitles=true') === -1) {
                        item.url += (item.url.indexOf('?') === -1 ? '?' : '&') + 'subtitles=true';
                    }

                    done(item);
                },
                function () {
                    done(null);
                }
            );
        };

        this.originalSubsUnavailable = function (message, reason) {
            if (reason) nexusTelemetry.source(NEXUS_ORIGINAL_SUBS_SOURCE, reason);
            _this.doesNotAnswer({ msg: message });
        };

        this.originalSubsQuality = function (item) {
            item = item || {};

            var stream = item.url || item.stream || '';
            var current = item.quality;
            var maxquality = item.maxquality || (
                current && typeof current === 'object' ? Object.keys(current)[0] : current
            );
            var labels = nexusQualityLadder(maxquality);
            var quality = {};

            if (labels.length && stream) {
                labels.forEach(function (label) {
                    quality[label] = stream;
                });
                return quality;
            }

            return current && typeof current === 'object' ? Lampa.Arrays.clone(current) : quality;
        };

        this.showOriginalSubsCard = function (item) {
            item = item || native_subtitles_item || {};

            _this.parse([{
                text: '\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b (+\u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b)',
                quality: _this.originalSubsQuality(item),
                maxquality: item.maxquality || '',
                method: 'call',
                nexus_original_subs_action: true
            }]);
        };

        this.loadOriginalSubsCard = function () {
            var token = ++request_token;
            native_subtitles_item = null;

            _this.showLoading('Загружаем субтитры', 'Получаем видео и синхронные дорожки');

            _this.requestNativeSubtitleTrack(function (item) {
                if (destroyed || token !== request_token) return;

                if (!item || !item.url) {
                    _this.originalSubsUnavailable('Для этого фильма пока нет оригинала с русскими субтитрами.', 'native_not_found');
                    return;
                }

                native_subtitles_item = item;
                _this.showOriginalSubsCard(item);
            });
        };

        this.openOriginalSubs = function () {
            if (is_serial) {
                _this.originalSubsUnavailable('\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b (+\u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b) \u043f\u043e\u043a\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0444\u0438\u043b\u044c\u043c\u043e\u0432.');
                return;
            }

            if (!native_subtitles_item || !native_subtitles_item.url) {
                _this.loadOriginalSubsCard();
                return;
            }

            var token = ++request_token;
            var item = Lampa.Arrays.clone(native_subtitles_item);
            item.nexus_quiet_loading = true;

            _this.showLoading('Загружаем субтитры', 'Получаем видео и синхронные дорожки');

            _this.getFileUrl(item, function (stream, original) {
                    if (destroyed || token !== request_token) return;

                    if (!stream || !stream.url) {
                        _this.originalSubsUnavailable('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043d\u0430 \u043e\u0440\u0438\u0433\u0438\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u0432\u0438\u0434\u0435\u043e Phantom.', 'native_video_unavailable');
                        return;
                    }

                    var play = _this.makePlayData(item, stream, original);
                    var subtitles = play.subtitles;

                    if (!Array.isArray(subtitles) || !subtitles.length) {
                        _this.originalSubsUnavailable('\u0414\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0444\u0438\u043b\u044c\u043c\u0430 Phantom \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b.', 'native_subtitles_unavailable');
                        return;
                    }

                    var russian = subtitles.filter(function (subtitle) {
                        return /\u0440\u0443\u0441\u0441\u043a/i.test(String(subtitle.label || subtitle.title || ''));
                    })[0];

                    if (russian && russian.url) {
                        // Lampa's automatic subtitle mode opens the first custom
                        // track when no "full" label is present. Keep Russian first.
                        play.subtitles = [russian].concat(subtitles.filter(function (subtitle) {
                            return subtitle !== russian;
                        }));
                        play.subtitle = russian.url;
                    }

                    var title = object.movie.title || object.movie.name || item.text || item.title || 'Video';
                    play.title = title + ' - ' + NEXUS_ORIGINAL_SUBS_LABEL;

                    nexusTelemetry.event('original_subs_play_intent');
                    nexusTelemetry.event('original_subs_native_ready');
                    nexusTelemetry.source(NEXUS_ORIGINAL_SUBS_SOURCE, 'play_intent');
                    nexusTelemetry.source(NEXUS_ORIGINAL_SUBS_SOURCE, 'native_subtitles_ok');
                    // parse() restores controller focus asynchronously. Let it
                    // finish before Player.play(), otherwise that focus update
                    // can immediately close the just-opened player.
                    _this.showOriginalSubsCard(native_subtitles_item);

                    setTimeout(function () {
                        if (destroyed || token !== request_token) return;

                        // Lampa reads this setting only after the external tracks
                        // are loaded. Restore the user's original value on close.
                        var subtitlesStartBefore = !!Lampa.Storage.field('subtitles_start');
                        var subtitlesStartRestored = false;
                        var restoreSubtitlesStart = function () {
                            if (subtitlesStartRestored) return;
                            subtitlesStartRestored = true;
                            Lampa.Player.listener.remove('destroy', restoreSubtitlesStart);
                            Lampa.Storage.set('subtitles_start', subtitlesStartBefore);
                            removeStorageKey(NEXUS_SUBTITLES_START_BACKUP);
                        };

                        Lampa.Storage.set(NEXUS_SUBTITLES_START_BACKUP, subtitlesStartBefore);
                        Lampa.Storage.set('subtitles_start', true);
                        Lampa.Player.listener.follow('destroy', restoreSubtitlesStart);
                        play = sanitizePlayData(play);
                        if (!play || !play.url) {
                            Lampa.Noty.show('Заблокирована небезопасная ссылка видео');
                            return;
                        }
                         Lampa.Player.play(play);
                    }, 80);
                });
        };

        this.serialSeasonRequestUrl = function (season) {
            season = parseInt(season || 0, 10);
            if (!source_url || !season) return '';

            return requestParams(source_url, object.movie, {
                s: season,
                season: season
            });
        };

        this.previewItems = function (data) {
            var items = _this.parseItems(data);

            if (is_serial && serial_choice.season && serial_choice.episode) {
                items = _this.filterItemsBySerialChoice(items);
            }

            return items;
        };

        this.hasUsablePreview = function (items) {
            if (!items || !items.length) return false;
            if (is_serial && serial_choice.season && serial_choice.episode && _this.onlySerialFolders(items)) return false;

            return true;
        };

        this.startSource = function (json) {
            if (destroyed || !Array.isArray(json)) return;
            sources        = {};
            filter_sources = [];

            json.forEach(function (j) {
                if (!isWorkingSource(j) || j.rch) return;
                var name = balanserName(j);
                var safeSourceUrl = _this.normalizeUrl(j.url);
                if (!safeSourceUrl) return;
                sources[name] = {
                    url: safeSourceUrl,
                    name: nexusPlainText(sourceDisplayName(j, name)).slice(0, 120),
                    show: true,
                    rch: false
                };
            });

            filter_sources = sortSourceKeys(Lampa.Arrays.getKeys(sources));

            if (!filter_sources.length) {
                nexusTelemetry.event('sources_empty');
                _this.doesNotAnswer({});
                return;
            }

            _this.showLoading('Ищем доступные источники', 'Проверяем варианты для этого видео');
            _this.probeSources(function () {
                if (destroyed) return;
                _this.addOriginalSubsSource();

                if (!filter_sources.length) {
                    nexusTelemetry.event('sources_empty');
                    _this.doesNotAnswer({});
                    return;
                }

                nexusTelemetry.event('sources_ready');

                var saved = Lampa.Storage.get(NEXUS_BALANSER_STORAGE, '');
                balanser = (saved !== NEXUS_ORIGINAL_SUBS_SOURCE && sources[saved]) ? saved : (sources[NEXUS_DEFAULT_SOURCE] ? NEXUS_DEFAULT_SOURCE : filter_sources[0]);
                _this.resetSerialSourceState();
                _this.activateSource(balanser, false);
                _this.updateSourceFilter();
                _this.showLoading('Загружаем видео', 'Источник: ' + sources[balanser].name);
                _this.find();
            });
        };

        this.probeSources = function (done) {
            if (destroyed) return;
            var queue = filter_sources.slice();
            var available = {};
            var active = 0;
            var finished = false;

            function complete() {
                if (destroyed) return;
                if (finished) return;
                if (queue.length || active) return;

                finished = true;
                sources = available;
                filter_sources = sortSourceKeys(Lampa.Arrays.getKeys(sources));
                done();
            }

            function next() {
                if (destroyed) return;
                while (active < NEXUS_SOURCE_PROBE_CONCURRENCY && queue.length) {
                    var nextName = queue.shift();

                    (function (name, source) {
                        active++;
                        var probeStartedAt = Date.now();

                        function finish(ok) {
                            if (destroyed) return;
                            if (ok) {
                                available[name] = source;
                                nexusTelemetry.source(name, 'probe_ok');
                                nexusTelemetry.latency(name, Date.now() - probeStartedAt);
                            } else {
                                nexusTelemetry.source(name, 'probe_fail');
                            }
                            active--;
                            next();
                            complete();
                        }

                        function probe() {
                            if (destroyed) return;
                            var url = _this.sourceRequestUrl(name);
                            if (!url) {
                                finish(false);
                                return;
                            }

                            loadContent(
                                url,
                                { timeout: NEXUS_SOURCE_PROBE_TIMEOUT },
                                function (data) {
                                    if (destroyed) return;
                                    finish(_this.hasUsablePreview(_this.previewItems(data)));
                                },
                                function () {
                                    if (destroyed) return;
                                    finish(false);
                                }
                            );
                        }

                        _this.withSourceReady(name, probe, function () {
                            finish(false);
                        });
                    })(nextName, sources[nextName]);
                }

                complete();
            }

            next();
        };

        // ── changeBalanser ──────────────────────────────────────────────────
        this.changeBalanser = function (name) {
            if (!sources[name]) return;

            _this.activateSource(name, true);
            _this.resetSerialSourceState();
            serial_choice.season = 0;
            serial_choice.voice = '';
            serial_choice.voice_name = '';
            serial_choice.episode = 0;
            _this.saveSerialChoice();
            _this.updateSourceFilter();
            _this.showLoading('Загружаем видео', 'Источник: ' + sources[name].name);
            _this.find();
        };

        // ── find / request ──────────────────────────────────────────────────
        this.find = function () {
            if (destroyed) return;
            var selected = balanser;

            if (_this.isOriginalSubsSource()) {
                _this.loadOriginalSubsCard();
                return;
            }

            _this.withSourceReady(selected, function () {
                var serialParams = _this.getSerialParams();
                var episodeUrl = _this.normalizeUrl(serial_episode_url);
                var url = (is_serial && serial_episode_url) ? accountUrl(episodeUrl) : requestParams(source_url, object.movie, serialParams);
                url = nexusQualityRequestUrl(selected, url);
                _this.request(url);
            }, function () {
                nexusTelemetry.event('source_no_response');
                nexusTelemetry.source(selected, 'probe_fail');
                _this.doesNotAnswer({ msg: 'Не удалось подключить источник' });
            });
        };

        this.request = function (url, attempt, token) {
    if (destroyed || !url) return;
    url = safeUrl(nexusQualityRequestUrl(balanser, url));
    if (!url) {
        _this.doesNotAnswer({ msg: 'Недопустимый URL запроса' });
        return;
    }
    attempt = attempt || 0;
    token = token || (++request_token);

    nexusLog('[Lumio] request url:', url, 'attempt:', attempt + 1);
    number_requests++;

    if (number_requests >= 14) {
        _this.doesNotAnswer({ msg: 'Слишком много запросов' });
        return;
    }

    clearTimeout(number_requests_timer);
    number_requests_timer = setTimeout(function () { number_requests = 0; }, 5000);

    var requestStartedAt = Date.now();

    loadContent(
        url,
        { timeout: timeoutForAttempt(NEXUS_CONTENT_TIMEOUT, attempt) },
        function (data) {
            if (destroyed || token !== request_token) return;

            if (data && typeof data === 'object' && data.rch) {
                nexusTelemetry.event('rch_unsupported');
                nexusTelemetry.source(balanser, 'rch_unsupported');
                _this.doesNotAnswer({ msg: 'Источник не поддерживается этим плагином' });
                return;
            }

            nexusLog('[Lumio] request success');
            nexusTelemetry.event('content_ok');
            nexusTelemetry.source(balanser, 'content_ok');
            nexusTelemetry.latency(balanser, Date.now() - requestStartedAt);
            _this.parse(data);
        },
        function (e) {
            if (destroyed || token !== request_token) return;
            if (NEXUS_DEBUG) console.error('[Lumio] request error:', e);
            nexusLog('[Lumio] source response details:', {
                status: e && e.status,
                text: String((e && (e.responseText || e.statusText)) || '').slice(0, 500),
                url: url
            });
            if (attempt < 1) {
                setTimeout(function () {
                    if (!destroyed) _this.request(url, attempt + 1, token);
                }, 450 + attempt * 650);
                return;
            }
            nexusTelemetry.event('content_fail');
            nexusTelemetry.source(balanser, 'content_fail');
            _this.doesNotAnswer({ msg: 'Ошибка загрузки контента' });
        }
    );
};

        // ── parse ────────────────────────────────────────────────────────────
        this.parse = function (data) {
    if (destroyed) return;
    last = null;
    scroll.clear();

    var items = _this.parseItems(data);

    if (is_serial) {
    _this.collectSerialOptions(items); // можно оставить, просто не используется для гейтинга
}

    if (is_serial) {
        var serialItems = _this.serialStepItems(items);
        if (serialItems) items = serialItems;
        else if (serial_choice.season && serial_choice.episode) {
            items = _this.filterItemsBySerialChoice(items);
        }
    } else {
        // Movie sources use different labels for the same kind of voice.
        // Apply the very same deterministic ordering as serial voice menus.
        items = _this.sortItemsByVoice(items);
    }

    if (is_serial && serial_auto_transition && !items.length) {
        serial_auto_transition = false;
        _this.loading(true);
        return;
    }

    if (!items.length) {
        scroll.append(Lampa.Template.get('nexus_doesnotanswer', {
            title: Lampa.Lang.translate('lumio_error_title') || 'Ничего не найдено',
            text: Lampa.Lang.translate('lumio_no_sources') || 'Нет источников'
        }));
        _this.loading(false);
        return;
    }

    items.forEach(function (item) {
        var title = item.text || item.title || 'Видео';
        var voiceMeta = nexusVoiceMeta(_this.voiceName(item));
        if (!is_serial && voiceMeta.type !== 'unknown') title = voiceMeta.title;
        var media = mediaTemplateData(object.movie);
var cardClass = '';
var allowedCardClasses = { 'nexus-episode-card': true };
if (typeof item.nexus_card_class === 'string' && allowedCardClasses[item.nexus_card_class]) {
    cardClass = item.nexus_card_class;
}
var mediaOverline = '';
var mediaLabel = '';
var progress = null;
var qBadge = qualityBadge(item.quality);
var resolutionText = nexusQualityLabels(item.quality);
 var sourceText = nexusPlainText(sources[balanser] ? sources[balanser].name : '');
 var pidtorInfo = balanser === 'pidtor' ? nexusPidtorDetails(item) : '';
 var infoText = pidtorInfo || resolutionText || nexusPlainText(item.info) || sourceText;
var badgeText = qBadge ? qBadge.label : (item.badge || '');
var badgeClass = qBadge ? qBadge.css : '';
var allowedBadgeClasses = {
    'nexus-badge--uhd': true,
    'nexus-badge--hd': true,
    'nexus-badge--sd': true,
    'nexus-badge--voice': true,
    'nexus-badge--subtitles': true,
    'nexus-badge--dub': true
};
if (!qBadge && typeof item.badge_class === 'string' && allowedBadgeClasses[item.badge_class]) {
    badgeClass = item.badge_class;
}
var timeText = item.episode !== undefined && item.nexus_serial_action !== 'episode' ? ('\u00b7 ' + item.episode) : '';

if (is_serial && item.nexus_serial_action === 'voice') {
    media = voiceMediaTemplateData(item.voice_name || title, item.voice_tone);
    infoText = item.info || '';
    badgeText = item.badge || '\u041e\u0437\u0432\u0443\u0447\u043a\u0430';
    badgeClass = item.badge_class || 'nexus-badge--voice';
    timeText = '';
}

if (is_serial && item.nexus_serial_action === 'episode') {
    media = episodeMediaTemplateData(item.season || serial_choice.season, item.episode);
    cardClass = 'nexus-episode-card';
    mediaOverline = media.media_overline;
    mediaLabel = media.media_label;
    progress = _this.episodeProgress(item);
}

var el = Lampa.Template.get('nexus_prestige_folder', {
    title: escapeHtml(title),
    time: escapeHtml(timeText),
    info: escapeHtml(infoText),
    voice_badge: escapeHtml(!is_serial ? voiceMeta.badge : ''),
    voice_badge_class: !is_serial ? voiceMeta.badge_class : '',
    badge: escapeHtml(badgeText),
    badge_class: badgeClass,
    media_class: media.media_class,
    media_style: media.media_style,
    media_overline: escapeHtml(mediaOverline),
    media_label: escapeHtml(mediaLabel),
    card_class: cardClass,
    voice_key: escapeHtml(item.voice_key || ''),
    progress: progress ? progress.percent : 0,
    progress_class: progress ? ('nexus-progress--visible' + (progress.done ? ' nexus-progress--done' : '')) : ''
});

        el.on('hover:enter', (function (it) {
            return function () {
                _this.open(it);
            };
        })(item)).on('hover:focus', function (e) {
    var current = $(e.currentTarget || e.target).closest('.selector');
    last = current.length ? current[0] : e.target;

    try {
        scroll.update(current.length ? current : $(e.target), true);
    } catch (err) {
        if (NEXUS_DEBUG) console.error('[Lumio] hover:focus scroll.update error:', err);
    }
});
            

        scroll.append(el);

        if (item.active) last = el[0];
    });

    var first = scroll.render().find('.selector').first();
var target = null;

if (last && $(last).closest(scroll.render()).length) {
    target = $(last).closest('.selector')[0];
}

if (!target && first.length) {
    target = first[0];
}

_this.loading(false);

setTimeout(function () {
    if (destroyed) return;
    try {
        Lampa.Controller.toggle('content');
        Lampa.Controller.collectionSet(scroll.render(), files.render());

        if (target) {
            Lampa.Controller.collectionFocus(target, scroll.render());
            last = target;
            scroll.update($(target), true);
        }
    } catch (e) {
        if (NEXUS_DEBUG) console.error('[Lumio] parse focus error:', e);
    }
}, 50);
};
        
                // ── orUrlReserve ────────────────────────────────────────────────────
        this.orUrlReserve = function (data) {
            if (!data || typeof data !== 'object') return data;
            if (typeof data.url === 'string' && data.url.indexOf(' or ') !== -1) {
                var urls = data.url.split(' or ');
                data.url = urls[0];
                data.url_reserve = urls[1] || '';
            }
            if (typeof data.url === 'string') data.url = _this.normalizeUrl(data.url);
            if (typeof data.stream === 'string') data.stream = _this.normalizeUrl(data.stream);
            if (typeof data.subtitle === 'string') data.subtitle = _this.normalizeUrl(data.subtitle);
            if (typeof data.url_reserve === 'string') data.url_reserve = _this.normalizeUrl(data.url_reserve);
            return data;
        };
        
                // ── getFileUrl ──────────────────────────────────────────────────────
        this.getFileUrl = function (file, call) {
            if (destroyed) return;
            if (!file) {
                call(false);
                return;
            }

            if (file.method === 'play' && file.url) {
    var direct = Lampa.Arrays.clone(file);
    direct.url = _this.normalizeUrl(direct.url);
    direct = _this.orUrlReserve(direct);
    call(direct, file);
    return;
}

if (file.url) {
    var useGlobalLoading = !file.nexus_quiet_loading;
    if (useGlobalLoading) Lampa.Loading.start();
    file = _this.orUrlReserve(Lampa.Arrays.clone(file));

    network.clear();
    network.timeout(timeoutForAttempt(NEXUS_CONTENT_TIMEOUT, 1));
    var nativeUrl = accountUrl(_this.normalizeUrl(file.url));
    if (!nativeUrl) {
        if (useGlobalLoading) Lampa.Loading.stop();
        call(false, file);
        return;
    }

    network['native'](
        nativeUrl,
        function (stream) {
            if (destroyed) return;
            if (useGlobalLoading) Lampa.Loading.stop();

            if (typeof stream === 'string') {
                try {
                    stream = JSON.parse(stream);
                } catch (e) {}
            }

            if (stream && typeof stream === 'object' && stream.rch) {
                call(false, file);
                return;
            }

            if (stream && typeof stream === 'object' && typeof stream.url === 'string') {
                stream = sanitizeRemotePayload(stream);
                stream.url = _this.normalizeUrl(stream.url);
                stream = _this.orUrlReserve(stream);
                if (!stream.url) {
                    call(false, file);
                    return;
                }
                call(stream, file);
            } else {
                if (file.url_reserve) {
                    file.url = file.url_reserve;
                    file.url_reserve = '';
                    _this.getFileUrl(file, call);
                    return;
                }
                call(false, file);
            }
        },
        function () {
            if (destroyed) return;
            if (useGlobalLoading) Lampa.Loading.stop();
            if (file.url_reserve) {
                file.url = file.url_reserve;
                file.url_reserve = '';
                _this.getFileUrl(file, call);
                return;
            }
            call(false, file);
        },
        false,
        {
            dataType: 'text',
            headers: addHeaders()
        }
    );

    return;
}

if (file.stream) {
    var prepared = Lampa.Arrays.clone(file);
    prepared.url = _this.normalizeUrl(file.stream);
    prepared.method = 'play';
    prepared = _this.orUrlReserve(prepared);
    call(prepared, file);
    return;
}

call(false, file);
};

                // ── normalizeUrl ─────────────────────────────────────────────────────
        this.normalizeUrl = function (url) {
            if (!url || typeof url !== 'string') return '';
            var value = url.trim();
            value = value.replace(/^https?:\/\/127\.0\.0\.1:9118/i, NEXUS_HOST);
            value = value.replace(/^https?:\/\/localhost:9118/i, NEXUS_HOST);
            return safeUrl(value);
        };

        this.decorateDisplayQuality = function (data) {
            if (!data || typeof data !== 'object') return data;

            var source = nexusSourceKey(balanser);
            var stream = data.url || data.stream || '';
            var current = data.quality;
            var labels = [];
            var hasQualityObject = current && typeof current === 'object' && Object.keys(current).length;

            if (typeof stream !== 'string' || !stream) return data;

            if (source === 'phantom') {
                labels = nexusQualityLadder(data.maxquality || (hasQualityObject ? Object.keys(current)[0] : current));
            } else if (hasQualityObject) {
                return data;
            }

            if (source === 'kinotochka') labels = ['720p'];
            if (source === 'uafilm') labels = ['1080p'];

            if (!labels.length) return data;

            if (!hasQualityObject) data.quality = {};

            labels.forEach(function (label) {
                if (!data.quality[label]) data.quality[label] = stream;
            });

            return data;
        };

        this.applySerialQualityHint = function (data, hint) {
            if (!is_serial || !data || !data.episode || data.quality && Object.keys(data.quality).length) return data;

            hint = String(hint || serial_quality_hint || '');
            var labels = nexusQualityLadder(hint);
            var stream = data.stream || data.url || '';
            if (!labels.length || !stream) return data;

            data.quality = {};
            labels.forEach(function (label) {
                data.quality[label] = stream;
            });

            return data;
        };

        this.qualityUrl = function (value) {
            if (!value) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'object' && !Array.isArray(value)) {
                var candidates = [value.url, value.link, value.file, value.src];
                for (var i = 0; i < candidates.length; i++) {
                    if (typeof candidates[i] === 'string' && candidates[i].trim()) return candidates[i];
                }
            }
            return '';
        };

        this.normalizeQuality = function (quality) {
            if (!quality || typeof quality !== 'object') return {};

            var normalized = {};

            Object.keys(quality).forEach(function (q) {
                var value = quality[q];
                var url = _this.qualityUrl(value);
                if (!url) return;

                url = _this.normalizeUrl(url);
                if (!url) return;

                if (typeof value === 'object' && !Array.isArray(value)) {
                    var copy = {};
                    Object.keys(value).forEach(function (k) {
                        if (/^(url|link|file|src)$/i.test(k)) return;
                        copy[k] = value[k];
                    });
                    copy.url = url;
                    normalized[q] = copy;
                } else {
                    normalized[q] = url;
                }
            });

            return normalized;
        };

        this.rememberSerialQuality = function (item, stream) {
            if (!is_serial || !serial_choice.season || !serial_choice.voice) return;

            var quality = _this.normalizeQuality(stream && stream.quality || item && item.quality || {});
            if (!Object.keys(quality).length) return;

            var info = serial_seasons[serial_choice.season] || {};
            var voice = info.voices && info.voices[serial_choice.voice];
            if (!voice || !voice.episodes) return;

            Lampa.Arrays.getKeys(voice.episodes).forEach(function (key) {
                var episode = voice.episodes[key];
                if (!episode) return;
                episode.quality = Lampa.Arrays.clone(quality);
                if (episode.item) episode.item.quality = Lampa.Arrays.clone(quality);
            });
        };

        this.qualityScore = function (name) {
            name = String(name || '').toLowerCase();

            if (/2160|4k|uhd/.test(name)) return 2160;
            if (/1440|2k/.test(name)) return 1440;
            if (/1080|fhd|full/.test(name)) return 1080;
            if (/720|hd/.test(name)) return 720;
            if (/480/.test(name)) return 480;
            if (/360/.test(name)) return 360;
            if (/240/.test(name)) return 240;

            var n = parseInt(name, 10);
            return isNaN(n) ? 0 : n;
        };

        this.bestQualityUrl = function (quality) {
            if (!quality || typeof quality !== 'object') return '';

            var keys = Object.keys(quality).sort(function (a, b) {
                return _this.qualityScore(b) - _this.qualityScore(a);
            });

            for (var i = 0; i < keys.length; i++) {
                var url = _this.qualityUrl(quality[keys[i]]);
                if (url) return _this.normalizeUrl(url);
            }

            return '';
        };

        this.timelineHash = function (item) {
            if (!Lampa.Timeline || !Lampa.Utils || !Lampa.Utils.hash) return 0;

            item = item || {};

            var movie = object.movie || {};
            var season = parseInt(item.season || serial_choice.season || 0, 10);
            var episode = parseInt(item.episode || serial_choice.episode || 0, 10);

            if (is_serial && season && episode) {
                var serialName = movie.original_name || movie.original_title || movie.name || movie.title || movie.id || '';
                return serialName ? Lampa.Utils.hash([season, season > 10 ? ':' : '', episode, serialName].join('')) : 0;
            }

            var movieName = movie.original_title || movie.original_name || movie.title || movie.name || movie.id || '';
            return movieName ? Lampa.Utils.hash(movieName) : 0;
        };

        this.timelineForItem = function (item) {
            var hash = _this.timelineHash(item);
            return hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;
        };

        this.episodeProgress = function (item) {
            return nexusTimelineProgress(_this.timelineForItem(item));
        };

        this.refreshSerialEpisodesAfterPlayer = function () {
            if (!is_serial || !serial_choice.season || !Lampa.Player || !Lampa.Player.listener) return;

            if (serial_player_close_listener) {
                try { Lampa.Player.listener.remove('destroy', serial_player_close_listener); } catch (e) {}
            }

            serial_player_close_listener = function () {
                try { Lampa.Player.listener.remove('destroy', serial_player_close_listener); } catch (e) {}
                serial_player_close_listener = null;

                // Timeline is written by the player on close. Defer the redraw
                // one tick so the episode list receives the freshly saved value.
                setTimeout(function () {
                    if (destroyed || !serial_choice.season) return;

                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();
                    _this.parse([]);
                }, 80);
            };

            Lampa.Player.listener.follow('destroy', serial_player_close_listener);
        };

        this.pickEpisodeItem = function (items, season, episode) {
            if (!items || !items.length) return null;

            var filtered = items.filter(function (item) {
                var s = parseInt(item.season || 0, 10);
                var e = parseInt(item.episode || 0, 10);

                if (s && e) return s === season && e === episode;
                return true;
            }).filter(function (item) {
                return !item.folder && (item.url || item.method || item.stream || item.quality);
            });

            if (!filtered.length) filtered = items.filter(function (item) {
                return !item.folder && (item.url || item.method || item.stream || item.quality);
            });

            if (serial_choice.voice) {
                var voiced = filtered.filter(function (item) {
                    return _this.voiceKey(item) === serial_choice.voice;
                });

                if (voiced.length) filtered = voiced;
            }

            filtered.sort(function (a, b) {
                var aq = a.quality && typeof a.quality === 'object' ? Object.keys(a.quality).sort(function (x, y) {
                    return _this.qualityScore(y) - _this.qualityScore(x);
                })[0] : '';
                var bq = b.quality && typeof b.quality === 'object' ? Object.keys(b.quality).sort(function (x, y) {
                    return _this.qualityScore(y) - _this.qualityScore(x);
                })[0] : '';

                return _this.qualityScore(bq) - _this.qualityScore(aq);
            });

            return filtered[0] || null;
        };

        this.makePlayData = function (item, stream, original) {
            item = item || {};
            stream = stream || {};
            original = original || {};

            var quality = _this.normalizeQuality(stream.quality || original.quality || item.quality || {});
            var bestUrl = _this.bestQualityUrl(quality);
            var title = item.text || item.title || object.movie.title || object.movie.name || 'Video';

            var play = {
                url: bestUrl || _this.normalizeUrl(stream.url || original.url || item.url || ''),
                title: title,
                quality: quality,
                headers: original.headers || stream.headers,
                segments: original.segments || stream.segments || item.segments,
                hls_manifest_timeout: original.hls_manifest_timeout || stream.hls_manifest_timeout,
                subtitle: stream.subtitle || item.subtitle || '',
                subtitles: stream.subtitles || item.subtitles,
                subtitles_call: original.subtitles_call || stream.subtitles_call,
                timeline: original.timeline || stream.timeline || _this.timelineForItem(item),
                url_reserve: stream.url_reserve || original.url_reserve || item.url_reserve || '',
                card: object.movie,
                isonline: true
            };

            play.url = safeUrl(play.url);
            play.subtitle = safeUrl(play.subtitle);
            play.url_reserve = safeUrl(play.url_reserve);

            if (play.subtitles && Array.isArray(play.subtitles)) {
                play.subtitles = play.subtitles.map(function (s) {
                    if (!s || typeof s !== 'object') return null;
                    var su = safeUrl(typeof s.url === 'string' ? s.url : '');
                    if (!su) return null;
                    return {
                        label: String(s.label || s.title || '').slice(0, 120),
                        url: su,
                        method: String(s.method || 'link').slice(0, 32)
                    };
                }).filter(Boolean);
            } else {
                play.subtitles = [];
            }

            if (play.segments && Array.isArray(play.segments)) {
                play.segments = play.segments.map(function (seg) {
                    if (typeof seg === 'string') return safeUrl(seg);
                    if (!seg || typeof seg !== 'object') return null;
                    var copy = {};
                    Object.keys(seg).forEach(function (k) {
                        if (/^(url|src|file|link)$/i.test(k)) {
                            if (typeof seg[k] === 'string') {
                                var su = safeUrl(seg[k]);
                                if (su) copy[k] = su;
                            }
                        } else {
                            copy[k] = seg[k];
                        }
                    });
                    return copy;
                }).filter(Boolean);
            } else {
                play.segments = [];
            }

            return play;
        };

        this.resolveEpisodePlaylistEntry = function (entry, done) {
            if (destroyed) return;
            var season = parseInt(entry.season || 0, 10);
            var episode = parseInt(entry.episode || 0, 10);
            var episodeUrl = safeUrl(entry.nexus_episode_url || '');

            serial_choice.season = season;
            serial_choice.episode = episode;
            serial_episode_url = episodeUrl;
            _this.saveSerialChoice();

            var url = episodeUrl ?
                accountUrl(_this.normalizeUrl(episodeUrl)) :
                requestParams(source_url, object.movie, { s: season, e: episode, season: season, episode: episode });

            loadContent(
                url,
                { timeout: timeoutForAttempt(NEXUS_CONTENT_TIMEOUT, 1), cache: false },
                function (data) {
                    if (destroyed) return;
                    var items = _this.parseItems(data);
                    _this.collectSerialOptions(items);
                    _this.collectSerialVoices(items);

                    var item = _this.pickEpisodeItem(items, season, episode);

                    if (!item) {
                        Lampa.Noty.show('Video was not found for this episode');
                        return;
                    }

                    _this.getFileUrl(item, function (stream, original) {
                        if (!stream || !stream.url) {
                            Lampa.Noty.show('Could not get video link');
                            return;
                        }

                        var play = _this.makePlayData(item, stream, original);
                        play.playlist = _this.buildEpisodePlaylist(item, play);

                        Object.keys(play).forEach(function (key) {
                            entry[key] = play[key];
                        });

                        entry.nexus_episode_url = episodeUrl || item.url || '';

                        if (done) done();
                    });
                },
                function () {
                    if (destroyed) return;
                    Lampa.Noty.show('Episode loading error');
                }
            );
        };

        this.buildEpisodePlaylist = function (item, play) {
            if (!is_serial || !serial_choice.season) return null;

            var season = parseInt((item && item.season) || serial_choice.season || 0, 10);
            var currentEpisode = parseInt((item && item.episode) || serial_choice.episode || 0, 10);
            var info = serial_seasons[season];

            if (!info || !info.episodes) return null;

            var episodeMap = _this.currentEpisodeMap(season, serial_choice.voice);
            var episodes = Lampa.Arrays.getKeys(episodeMap).map(function (k) {
                return parseInt(k, 10);
            }).filter(function (n) {
                return !!n;
            }).sort(function (a, b) {
                return a - b;
            });

            if (episodes.length < 2) return null;

            return episodes.map(function (episode) {
                var ep = episodeMap[episode] || {};
                var entry = {
                    title: episode + ' \u0441\u0435\u0440\u0438\u044f',
                    season: season,
                    episode: episode,
                    nexus_episode_url: safeUrl(ep.url || ''),
                    timeline: _this.timelineForItem({ season: season, episode: episode }),
                    card: object.movie,
                    isonline: true,
                    callback: function () {
                        serial_choice.season = season;
                        serial_choice.episode = episode;
                        serial_episode_url = safeUrl(ep.url || '');
                        _this.saveSerialChoice();
                    }
                };

                if (episode === currentEpisode) {
                    entry.url = play.url;
                    entry.quality = play.quality;
                    entry.subtitles = play.subtitles;
                    entry.subtitle = play.subtitle;
                    entry.headers = play.headers;
                    entry.segments = play.segments;
                    entry.url_reserve = play.url_reserve;
                } else {
                    entry.url = function (next) {
                        _this.resolveEpisodePlaylistEntry(entry, next);
                    };
                }

                return entry;
            });
        };

        // ── open ─────────────────────────────────────────────────────────────
                // ── open ─────────────────────────────────────────────────────────────
        this.open = function (item) {
            if (destroyed) return;

            if (item && item.nexus_original_subs_action) {
                _this.openOriginalSubs();
                return;
            }

            if (is_serial && item && item.nexus_serial_action) {
                if (item.nexus_serial_action === 'season') {
                    _this.selectSerialSeason(item.season);
                } else if (item.nexus_serial_action === 'voice') {
                    _this.selectSerialVoice(item);
                } else if (item.nexus_serial_action === 'episode') {
                    _this.selectSerialEpisode(item);
                }
                return;
            }

            if (item.folder || (!item.url && !item.method && !item.stream)) {
                Lampa.Activity.push({
                    url:          item.url || '',
                    title:        NEXUS_TITLE,
                    component:    NEXUS_COMPONENT,
                    movie:        object.movie,
                    page:         1,
                    balanser:     balanser,
                    nexus_folder: true
                });
                return;
            }

            _this.getFileUrl(item, function (stream, original) {
                if (destroyed) return;
                nexusLog('[Lumio] PLAY item:', item);
                nexusLog('[Lumio] PLAY stream:', stream);
                original = original || {};

                if (!stream || !stream.url) {
                    Lampa.Noty.show('Не удалось получить ссылку на видео');
                    return;
                }

                var play = _this.makePlayData(item, stream, original);
                _this.rememberSerialQuality(item, stream);

                var episodePlaylist = _this.buildEpisodePlaylist(item, play);
                if (episodePlaylist && episodePlaylist.length) {
                    play.playlist = episodePlaylist;
                }
                
                nexusLog('[Lumio] FINAL URL:', play.url);
nexusLog('[Lumio] FINAL SUBTITLE:', play.subtitle);
nexusLog('[Lumio] FINAL QUALITY:', play.quality);


                nexusTelemetry.event('play_intent');
                nexusTelemetry.source(balanser, 'play_intent');
                _this.refreshSerialEpisodesAfterPlayer();
                play = sanitizePlayData(play);
                if (!play || !play.url) {
                    Lampa.Noty.show('Заблокирована небезопасная ссылка видео');
                    return;
                }
                Lampa.Player.play(play);
            });
        };
        // ── parseItems ───────────────────────────────────────────────────────
        this.parseItems = function (str) {
            if (!str) return [];

            var responseQualityHint = '';
            if (typeof str === 'string') {
                var qualityMatch = str.match(/<!--\s*q\s*:\s*(\d{3,4}\s*p?)\s*-->/i);
                if (qualityMatch) responseQualityHint = qualityMatch[1].replace(/\s+/g, '');
            }
            if (is_serial && responseQualityHint) serial_quality_hint = responseQualityHint;

            function finish(items) {
                items = Array.isArray(items) ? items.filter(function (item) {
                    return item && typeof item === 'object' && !Array.isArray(item);
                }) : [];
                if (balanser !== 'pidtor') return items;

                var seen = {};
                return items.filter(function (item) {
                    var key = nexusPidtorKey(item);
                    if (!key || seen[key]) return false;
                    seen[key] = true;
                    return true;
                });
            }

            try {
    var j = (typeof str === 'object') ? str : JSON.parse(str);
    if (Array.isArray(j)) {
        return finish(j.map(function (data) {
            data = data || {};
            if (typeof data !== 'object' || Array.isArray(data)) return null;
            data = sanitizeRemotePayload(data);

            var season  = parseInt(data.season || data.s || 0, 10);
var episode = parseInt(data.episode || data.e || 0, 10);
var titleText = data.text || data.title || '';

if (!season && titleText) {
    var sm = titleText.match(/(\d+)\s*(?:сезон|season)/i);
    if (sm) season = parseInt(sm[1], 10);
}
if (!episode && titleText) {
    var em = titleText.match(/(\d+)\s*(?:серия|episode)/i);
    if (em) episode = parseInt(em[1], 10);
}

if (season)  data.season  = season;
if (episode) data.episode = episode;

if (object.movie.name && data.season && !data.episode) {
    data.folder = true;
}

            if (data.quality && typeof data.quality === 'object' && !Array.isArray(data.quality)) {
                data.quality = _this.normalizeQuality(data.quality);
            }

            if (balanser === 'pidtor' && data.maxquality && !data.quality) {
                data.quality = {};
                data.quality[String(data.maxquality) + 'p'] = data.url || data.stream || '';
            }

            _this.decorateDisplayQuality(data);
            _this.applySerialQualityHint(data, responseQualityHint);
            return data;
        }));
    }
} catch (e1) {}

            var result = [];
            try {
                var html = $('<div>' + str + '</div>');
                html.find('[data-json]').each(function () {
                    var el   = $(this);
                    var data = {};
                    try { data = JSON.parse(el.attr('data-json') || '{}'); } catch (e2) { data = {}; }
                    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
                    data = sanitizeRemotePayload(data);
                    var s    = el.attr('s');
                    var ep   = el.attr('e');
                    var text = el.text();

                    if (!object.movie.name) {
                        if (text && /\d+p/i.test(text)) {
                            if (!data.quality) { data.quality = {}; data.quality[text] = data.url; }
                            text = object.movie.title;
                        }
                        if (text === 'По умолчанию') text = object.movie.title;
                    }

                    if (ep)   data.episode = parseInt(ep, 10);
if (s)    data.season  = parseInt(s, 10);
if (text) data.text    = text;

if (!data.season && text) {
    var smh = text.match(/(\d+)\s*(?:сезон|season)/i);
    if (smh) data.season = parseInt(smh[1], 10);
}
if (!data.episode && text) {
    var emh = text.match(/(\d+)\s*(?:серия|episode)/i);
    if (emh) data.episode = parseInt(emh[1], 10);
}

if (object.movie.name && data.season && !data.episode) {
    data.folder = true;
}
                    data.active = el.hasClass('active');

                    if (data.quality && typeof data.quality === 'object' && !Array.isArray(data.quality)) {
    data.quality = _this.normalizeQuality(data.quality);
}

if (balanser === 'pidtor' && data.maxquality && !data.quality) {
    data.quality = {};
    data.quality[String(data.maxquality) + 'p'] = data.url || data.stream || '';
}

_this.decorateDisplayQuality(data);
_this.applySerialQualityHint(data, responseQualityHint);
if (data.url || data.method || data.stream) result.push(data);
                });
            } catch (e3) {}

            return finish(result);
        };

        // ── doesNotAnswer ────────────────────────────────────────────────────
        this.doesNotAnswer = function (er) {
    if (destroyed) return;
    er = er || {};

    var msg = 'Нет соединения';

    if (er.readyState === 0) {
        msg = 'Запрос к Lampac заблокирован (CORS) или сервер недоступен';
    } else if (er.msg) {
        msg = er.msg;
    }

    scroll.clear();
    var html = Lampa.Template.get('nexus_doesnotanswer', {
        title: Lampa.Lang.translate('lumio_error_title') || 'Ошибка',
        text: msg
    });

    scroll.append(html);
    _this.loading(false);
};
        var controller_ready = false;
        
        this.create = function () {
            return this.render();
        };

        this.start = function () {
            if (destroyed) return;
            if (Lampa.Activity.active().activity !== _this.activity) return;

            if (!initialized) {
                initialized = true;
                _this.initialize();
            }

            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!controller_ready) {
                controller_ready = true;

                Lampa.Controller.add('content', {
    toggle: function () {
        try {
            var first = scroll.render().find('.selector').first();
            var target = null;

            if (last && $(last).closest(scroll.render()).length) {
                target = $(last).closest('.selector')[0];
            }

            if (!target && first.length) {
                target = first[0];
            }

            Lampa.Controller.collectionSet(scroll.render(), files.render());

            if (target) {
                Lampa.Controller.collectionFocus(target, scroll.render());
                last = target;
                scroll.update($(target), true);
            }
        } catch (e) {
            if (NEXUS_DEBUG) console.error('[Lumio] controller toggle error:', e);
        }
    },
    gone: function () {},
    up: function () {
        if (Navigator.canmove('up')) {
            Navigator.move('up');
        } else {
            Lampa.Controller.toggle('head');
        }
    },
    down: function () {
        Navigator.move('down');
    },
    right: function () {
        if (Navigator.canmove('right')) {
            Navigator.move('right');
        } else {
            filter.show(Lampa.Lang.translate('title_filter'), 'filter');
        }
    },
    left: function () {
        if (Navigator.canmove('left')) {
            Navigator.move('left');
        } else {
            Lampa.Controller.toggle('menu');
        }
    },
    back: function () {
        try {
            _this.back();
        } catch (e) {
            if (NEXUS_DEBUG) console.error('[Lumio] back error:', e);
        }
    }
});
}

            Lampa.Controller.toggle('content');
        };

        this.render = function () {
            return files.render();
        };

        this.pause = function () {};

        this.stop = function () {
            _this.destroy();
        };

        this.destroy = function () {
            if (destroyed) return;

            destroyed = true;
            request_token++;
            _this.stopSerialCoveragePrefetch();
            _this.stopLoadingStatus();
            clearTimeout(number_requests_timer);
            number_requests_timer = null;
            network.clear();
            if (serial_player_close_listener && Lampa.Player && Lampa.Player.listener) {
                try { Lampa.Player.listener.remove('destroy', serial_player_close_listener); } catch (e) {}
                serial_player_close_listener = null;
            }
            try { files.destroy(); } catch (e) {}
            try { scroll.destroy(); } catch (e) {}
            try { filter.destroy(); } catch (e) {}
        };

        this.back = function () {
            if (is_serial) {
                if (serial_choice.episode) {
                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();
                    _this.parse([]);
                    return;
                }

                if (serial_choice.voice) {
                    if (_this.currentVoiceList(serial_choice.season).length <= 1) {
                        serial_choice.season = 0;
                    }

                    serial_choice.voice = '';
                    serial_choice.voice_name = '';
                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();
                    _this.parse([]);
                    return;
                }

                if (serial_choice.season) {
                    serial_choice.season = 0;
                    serial_choice.voice = '';
                    serial_choice.voice_name = '';
                    serial_choice.episode = 0;
                    serial_episode_url = '';
                    _this.saveSerialChoice();
                    _this.parse([]);
                    return;
                }
            }

            try {
                Lampa.Activity.backward();
            } catch (e) {
                if (NEXUS_DEBUG) console.error('[Lumio] backward error:', e);
            }
        };

        this.getChoice = function (name) {
            return Lampa.Storage.get('lumio_choice_' + (name || balanser), {
                season: 0,
                voice: 0,
                voice_url: '',
                voice_name: ''
            });
        };

        this.saveChoice = function (val, name) {
            Lampa.Storage.set('lumio_choice_' + (name || balanser), val);
        };

        this.replaceChoice = function (val) {
            _this.saveChoice(val);
        };

}

    Lampa.Component.add(NEXUS_COMPONENT, component);

    function openNexus(movie) {
        if (!movie) return;
        Lampa.Activity.push({
            url:       '',
            title:     NEXUS_TITLE,
            component: NEXUS_COMPONENT,
            movie:     movie,
            page:      1
        });
    }


var nexusCardButtonHtml =
    '<div class="full-start__button selector view--online nexus--button" data-subtitle="V' + NEXUS_VERSION + '">' +
        NEXUS_MENU_ICON +
        NEXUS_LOGO_SVG +
        '<span>' + NEXUS_TITLE + '</span>' +
    '</div>';

var nexusButtonObserverTimer = null;

// [V10] Последняя загруженная «полная» карточка: в ней есть imdb_id, original_language
// и корректные title/name — Lumio точнее находит источники.
var lumioLastFullMovie = null;

function getActiveMovie() {
    try {
        var act = Lampa.Activity.active();
        if (!act) return null;
        var card = act.card || act.movie || (act.activity && act.activity.card) || null;
        var full = lumioLastFullMovie;

        if (card && full && String(full.id) === String(card.id)) {
            var merged = {};
            var k;
            for (k in card) if (Object.prototype.hasOwnProperty.call(card, k)) merged[k] = card[k];
            for (k in full) if (Object.prototype.hasOwnProperty.call(full, k) && full[k] !== undefined) merged[k] = full[k];
            if (card.source) merged.source = card.source;
            if (card.method) merged.method = card.method;
            if (card.type)   merged.type   = card.type;
            return merged;
        }

        return card;
    } catch (e) {
        return null;
    }
}

function insertNexusButton() {
    try {
        var act = Lampa.Activity.active();
        if (!act || act.component !== 'full') return false;

        var render = act.activity && act.activity.render ? act.activity.render() : $();
        var scope = render && render.length ? render : $('.full').last();
        var buttons = scope.find('.full-start__button').filter(function () {
            return !$(this).closest('.modal, .selectbox, .settings, .menu, .nexus-container').length;
        });

        // .view--online only exists when another online plugin already added it.
        // Prefer the stable Watch/Torrent button and fall back to any full-card action.
        var anchor = buttons.filter('.view--torrent').first();
        if (!anchor.length) anchor = buttons.filter('.view--online:not(.nexus--button)').first();
        if (!anchor.length) anchor = buttons.not('.nexus--button').last();

        if (!anchor.length) return false;

        var holder = anchor.parent();
        var current = holder.children('.nexus--button');

        $('.full-start__button.nexus--button').not(current).remove();

        if (current.length) return true;

        var btn = $(nexusCardButtonHtml);

        btn.on('hover:enter', function () {
            var activeMovie = getActiveMovie();
            if (activeMovie) openNexus(activeMovie);
        });

        anchor.after(btn);
        nexusLog('[Lumio] button inserted into full-card actions');
        return true;
    } catch (e) {
        if (NEXUS_DEBUG) console.error('[Lumio] insertNexusButton error:', e);
        return false;
    }
}

var nexusButtonScheduleTimer = null;
function scheduleNexusButtonWatcher(delay) {
    delay = Math.max(0, parseInt(delay, 10) || 0);
    if (nexusButtonScheduleTimer) clearTimeout(nexusButtonScheduleTimer);
    nexusButtonScheduleTimer = setTimeout(function () {
        nexusButtonScheduleTimer = null;
        startNexusButtonWatcher();
    }, delay);
}

function startNexusButtonWatcher() {
    try {
        if (nexusButtonObserverTimer) return;
        var attempts = 0;
        nexusButtonObserverTimer = setInterval(function () {
            attempts++;
            var inserted = insertNexusButton();
            if (inserted || attempts >= 24) {
                clearInterval(nexusButtonObserverTimer);
                nexusButtonObserverTimer = null;
                nexusLog('[Lumio] watcher stop, inserted:', inserted, 'attempts:', attempts);
            }
        }, 300);
    } catch (e) {
        nexusButtonObserverTimer = null;
        if (NEXUS_DEBUG) console.warn('[Lumio] startNexusButtonWatcher error:', e);
    }
}

if (Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            scheduleNexusButtonWatcher(100);
        }
    });

    Lampa.Listener.follow('full', function (e) {
        nexusLog('[Lumio] full event:', e.type);
        // [V10] в Lampa событие называется «complite» (с опечаткой) — поддерживаем оба написания
        if ((e.type === 'complite' || e.type === 'complete') && e.data && e.data.movie) lumioLastFullMovie = e.data.movie;
        registerNexusManifest();
        scheduleNexusButtonWatcher(200);
    });

    Lampa.Listener.follow('activity', function (e) {
        scheduleNexusButtonWatcher(150);
    });
}

    var manifst = {
        type:    'video',
        version: NEXUS_VERSION,
        name:    NEXUS_TITLE,
        description: 'Онлайн просмотр через Lampac',
        icon:    NEXUS_MENU_ICON,
        component: NEXUS_COMPONENT,
        onContextMenu: function (obj) {
            return {
                name:        NEXUS_TITLE,
                description: Lampa.Lang.translate('lumio_watch') || 'Смотреть онлайн',
                icon:        NEXUS_MENU_ICON
            };
        },
        onContextLauch: function (obj) {
            openNexus(obj);
        }
    };

    function registerNexusManifest() {
        if (!Lampa.Manifest) return false;

        var plugins = Lampa.Manifest.plugins;

        Lampa.Component.add(NEXUS_COMPONENT, component);
        resetTemplates();

        // Preserve an existing manifest array by mutating it in place.
        if (Object.prototype.toString.call(plugins) !== '[object Array]') {
            plugins = plugins && typeof plugins === 'object' ? [plugins] : [];
            Lampa.Manifest.plugins = plugins;
        }

        for (var i = plugins.length - 1; i >= 0; i--) {
            if (plugins[i] && plugins[i].component === manifst.component) {
                plugins.splice(i, 1);
            }
        }

        plugins.unshift(manifst);
        Lampa.Manifest.plugins = plugins;
        return true;
    }

    registerNexusManifest();



    if (Lampa.Lang && Lampa.Lang.add) {
    Lampa.Lang.add({
        lumio_watch: {
            ru: 'Смотреть онлайн',
            uk: 'Дивитися онлайн',
            en: 'Watch online'
        },
        lumio_balanser: {
            ru: 'Источник',
            uk: 'Джерело',
            en: 'Source'
        },
        lumio_no_sources: {
            ru: 'Нет соединения с сервером или сервер не вернул источники',
            uk: 'Немає зʼєднання з сервером або сервер не повернув джерела',
            en: 'No connection to server or no sources returned'
        },
        lumio_error_title: {
            ru: 'Ошибка',
            uk: 'Помилка',
            en: 'Error'
        }
    });
}

    nexusLog('[Lumio] v' + NEXUS_VERSION + ' loaded | server: ' + NEXUS_HOST);

    // [V10] initLumio() вызывается уже после события app:ready — запускаем то, что оригинал делал по нему
    LUMIO.clearCache = lumioClearCache;
    LUMIO.ready = true;
    setTimeout(lumioPruneCache, 3000);
    scheduleNexusButtonWatcher(250);
    }

    // Настройки Lumio (очистка кэша)
    function addLumioSettings() {
        try {
            Lampa.SettingsApi.addComponent({
                component: 'v10_lumio',
                icon: '<svg height="60" viewBox="0 0 24 24" width="60" fill="currentColor">' +
                          '<path d="M8 5v14l11-7L8 5Z"/>' +
                      '</svg>',
                name: 'Lumio (онлайн)'
            });

            Lampa.SettingsApi.addParam({
                component: 'v10_lumio',
                param: { name: 'v10_lumio_clear', type: 'button', default: '' },
                field: {
                    name: 'Очистить кэш Lumio',
                    description: 'Версия ' + LUMIO.version + ' · сбросить кэш списков источников и ответов'
                },
                onRender: function (item) {
                    item.on('hover:enter', function () {
                        LUMIO.clearCache();
                        noty('Кэш Lumio очищен');
                    });
                }
            });
        } catch (e) {
            if (CONFIG.debug) console.warn('[V10 lumio] addSettings failed:', e);
        }
    }

    // ================================================================
    //  МЕНЮ
    // ================================================================
    function buildMenuItem(action, text, svg, onEnter) {
        var item = $(
            '<li class="menu__item selector" data-action="' + action + '">' +
                '<div class="menu__ico">' + svg + '</div>' +
                '<div class="menu__text">' + text + '</div>' +
            '</li>'
        );
        item.on('hover:enter', onEnter);
        return item;
    }

    var MENU_ITEMS = [
        {
            action: 'v10',
            text: SOURCE_NAME,
            svg: '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
                     '<path d="M12 2L2 8V20H8V14H16V20H22V8L12 2ZM4 10L12 6L20 10V18H17V12H7V18H4V10Z"/>' +
                     '<path d="M9 13H15V15H9V13Z"/>' +
                 '</svg>',
            onEnter: function () {
                Lampa.Activity.push({
                    title: SOURCE_NAME,
                    component: 'category',
                    source: SOURCE_NAME,
                    method: 'category'
                });
            }
        },
        {
            action: 'torrserver_switcher',
            text: 'TorrServer',
            svg: '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
                     '<path d="M4 3H20C21.1 3 22 3.9 22 5V9C22 10.1 21.1 11 20 11H4C2.9 11 2 10.1 2 9V5C2 3.9 2.9 3 4 3ZM4 13H20C21.1 13 22 13.9 22 15V19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V15C2 13.9 2.9 13 4 13ZM6 6.5C5.45 6.5 5 6.95 5 7.5C5 8.05 5.45 8.5 6 8.5C6.55 8.5 7 8.05 7 7.5C7 6.95 6.55 6.5 6 6.5Z"/>' +
                 '</svg>',
            onEnter: function () { TS.pick('primary'); }
        },
        {
            action: 'v10_parsers',
            text: 'Парсеры',
            svg: '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
                     '<path d="M12 2L2 7L12 12L22 7L12 2Z"/>' +
                     '<path d="M2 12L12 17L22 12L20 11L12 15L4 11L2 12Z"/>' +
                     '<path d="M2 17L12 22L22 17L20 16L12 20L4 16L2 17Z"/>' +
                 '</svg>',
            onEnter: function () { PARSERS.open(false); }
        }
    ];

    // Возвращает true, когда меню найдено и пункты на месте
    function addAllMenuItems() {
        var list = $('.menu .menu__list').eq(0);
        if (!list.length) list = $('.menu__list').eq(0);
        if (!list.length) return false;

        var fresh = [];
        MENU_ITEMS.forEach(function (m) {
            if ($('.menu__item[data-action="' + m.action + '"]').length) return;
            fresh.push(buildMenuItem(m.action, m.text, m.svg, m.onEnter));
        });
        if (!fresh.length) return true;

        // вставляем группой сразу после «Фильмы/Сериалы» (порядок пунктов сохраняется)
        var anchor = list.find('[data-action="movie"], [data-action="tv"]').last();
        if (anchor.length) {
            for (var i = fresh.length - 1; i >= 0; i--) anchor.after(fresh[i]);
        } else {
            fresh.forEach(function (el) { list.append(el); });
        }
        return true;
    }

    var menuRetryTimer = null;
    function ensureMenuItems() {
        if (menuRetryTimer) clearInterval(menuRetryTimer);
        var attempts = 0;
        menuRetryTimer = setInterval(function () {
            attempts++;
            var ok = false;
            try { ok = addAllMenuItems(); } catch (e) { if (CONFIG.debug) console.warn('[V10] menu error:', e); }
            if (ok || attempts >= 40) {
                clearInterval(menuRetryTimer);
                menuRetryTimer = null;
            }
        }, 500);
    }

    // ================================================================
    //  INIT
    // ================================================================
    var started = false;

    function init() {
        if (started) return;
        started = true;

        safe('V10 source', function () { Lampa.Api.sources[SOURCE_NAME] = new RutorApiService(); });
        safe('TorrServer', function () { TS.init(); });
        safe('Parsers',    function () { PARSERS.init(); });

        if (CONFIG.lumio) {
            safe('Lumio', function () { initLumio(); });
            safe('Lumio settings', addLumioSettings);
        }

        safe('Menu', function () {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'render') ensureMenuItems();
            });
            ensureMenuItems();
        });

        log('[V10] all-in-one запущен');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
