(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    // ================================================================
    //  КАТЕГОРИИ
    //  page_size_preview — сколько карточек тянуть на главной (превью-строке)
    //  page_size         — сколько на полной странице категории
    //  -----------------------------------------------------------------
    //  'tv_shows_ru' (Русские сериалы / Наши сериалы) — воркер берёт
    //  первые 15 названий из колонки «Название» секции
    //  «Наши сериалы» страницы https://rutor.info/top
    //  (https://rutor.info/nashi_seriali), обогащение Kinopoisk+год как tv.
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
    //  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
    // ================================================================
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            if (item.poster_path.startsWith('/t/p/')) {
                return 'https://image.tmdb.org' + item.poster_path;
            }
            return TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) {
            return item.background_image;
        }
        if (item.backdrop_path) {
            if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
            if (item.backdrop_path.startsWith('/t/p/')) {
                return 'https://image.tmdb.org' + item.backdrop_path;
            }
            return TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    // ================================================================
    //  ОПРЕДЕЛЕНИЕ ТИПА
    // ================================================================
    function detectMediaMethod(item) {
        if (!item) return 'movie';
        if (
            item.method === 'tv' ||
            item.type === 'tv' ||
            item.number_of_seasons ||
            item.seasons ||
            item.first_air_date
        ) return 'tv';
        return 'movie';
    }

    // ================================================================
    //  NORMALIZE
    // ================================================================
    function normalizeCard(item) {
        var img = buildImg(item);
        var bg  = buildBg(item);

        var posterPath = item.poster_path || '';
        if (posterPath && !posterPath.startsWith('/t/p/') && !posterPath.startsWith('http')) {
            posterPath = '/t/p/w500' + posterPath;
        }

        var backdropPath = item.backdrop_path || '';
        if (backdropPath && !backdropPath.startsWith('/t/p/') && !backdropPath.startsWith('http')) {
            backdropPath = '/t/p/original' + backdropPath;
        }

        var title  = item.title || item.name || '';
        var method = item.method || detectMediaMethod(item);

        return {
            id: item.id,
            title: title,
            name: item.name || title,
            original_title: item.original_title || title,
            overview: item.overview || '',
            poster_path: posterPath,
            backdrop_path: backdropPath,
            img: img,
            background_image: bg,
            vote_average: item.vote_average || 0,
            release_date: item.release_date || '',
            first_air_date: item.first_air_date || '',
            number_of_seasons: item.number_of_seasons || undefined,
            type: method,
            method: method,
            release_quality: item.release_quality || '',
            source: SOURCE_NAME,
            promo_title: item.promo_title || title,
            promo: item.promo || item.overview || ''
        };
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        // ---------- Сквозной дедуп по категории на стороне клиента ----------
        // (страховка на случай, если воркер вернул дубль)
        var clientSeen = {}; // { url: { Set<string> } }
        function seenKey(card) {
            var id = card && card.id ? String(card.id) : '';
            var t  = ((card && (card.title || card.name)) || '').toLowerCase()
                        .replace(/[^\u0400-\u04ffa-z0-9]/gi, '').slice(0, 80);
            return id + '|' + t;
        }
        function dedupClient(catUrl, cards, resetPage) {
            if (resetPage || !clientSeen[catUrl]) clientSeen[catUrl] = {};
            var bag = clientSeen[catUrl];
            var out = [];
            for (var i = 0; i < cards.length; i++) {
                var k = seenKey(cards[i]);
                if (!k || bag[k]) continue;
                bag[k] = 1;
                out.push(cards[i]);
            }
            return out;
        }

        // ============================================================
        // FETCH RAW
        // ============================================================
        self._fetchRaw = function (url, onComplete, onError) {
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) {
                        onComplete({
                            results: [],
                            total_pages: 1,
                            page: 1,
                            total_results: 0
                        });
                        return;
                    }
                    onComplete({
                        results: json.results.map(normalizeCard),
                        page: json.page || 1,
                        total_pages: json.total_pages || 1,
                        total_results: json.total_results || json.results.length
                    });
                },
                function (err) {
                    console.warn('[V10] fetch error:', url, err);
                    if (onError) onError(err);
                    else {
                        onComplete({
                            results: [],
                            total_pages: 1,
                            page: 1,
                            total_results: 0
                        });
                    }
                }
            );
        };

        // ============================================================
        // SEARCH
        // ============================================================
        self.search = function (params, onComplete) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }
            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) { onComplete({ results: [] }); return; }
                    onComplete({
                        results: json.results.map(normalizeCard),
                        page: json.page || 1,
                        total_pages: json.total_pages || 1
                    });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        // ============================================================
        // CATEGORY (главная — превью-строки)
        // ============================================================
        self.category = function (params, onSuccess) {
            var rows  = [];
            var total = CATEGORIES.length;
            var done  = 0;

            CATEGORIES.forEach(function (cat) {
                var pageSize = cat.page_size_preview || 15;
                var url = WORKER_URL + cat.url + '?page=1&page_size=' + pageSize;

                self._fetchRaw(url, function (data) {
                    // сброс клиентского дедупа при загрузке превью (page=1)
                    var unique = dedupClient(cat.url, data.results, true);

                    rows.push({
                        title: cat.title,
                        results: unique,
                        url: cat.url,
                        source: SOURCE_NAME,
                        total_pages: data.total_pages || 1
                    });

                    done++;
                    if (done === total) {
                        rows.sort(function (a, b) {
                            var ia = CATEGORIES.findIndex(function (c) { return c.url === a.url; });
                            var ib = CATEGORIES.findIndex(function (c) { return c.url === b.url; });
                            return ia - ib;
                        });
                        onSuccess(rows);
                    }
                });
            });
        };

        // ============================================================
        // LIST (полная страница категории с пагинацией)
        // ============================================================
        self.list = function (params, onComplete) {
            var page     = params.page || 1;
            var catUrl   = params.url  || 'top24';

            var meta     = CATEGORIES.find(function (c) { return c.url === catUrl; });
            var pageSize = params.page_size || (meta && meta.page_size) || 15;

            var url = WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize;

            self._fetchRaw(
                url,
                function (data) {
                    // На page=1 сбрасываем клиентский дедуп
                    var unique = dedupClient(catUrl, data.results, page === 1);

                    // Принудительно tv-тип для tv-категорий
                    if (meta && meta.method === 'tv') {
                        unique = unique.map(function (card) {
                            card.type   = 'tv';
                            card.method = 'tv';
                            if (!card.first_air_date && card.release_date) {
                                card.first_air_date = card.release_date;
                            }
                            return card;
                        });
                    }

                    onComplete({
                        results:       unique,
                        page:          data.page          || page,
                        total_pages:   data.total_pages   || 1,
                        total_results: data.total_results || unique.length
                    });
                },
                function () {
                    onComplete({
                        results: [],
                        page: page,
                        total_pages: 1,
                        total_results: 0
                    });
                }
            );
        };

        // ============================================================
        // FULL
        // ============================================================
        self.full = function (params, onSuccess) {
            var card   = params.card || params;
            var method = detectMediaMethod(card);

            params.method = method;
            if (card && typeof card === 'object') {
                card.method = method;
                card.type   = method;
            }

            var savedImg     = params.img || (card && card.img) || '';
            var savedBg      = params.background_image || (card && card.background_image) || '';
            var savedQuality = params.release_quality || (card && card.release_quality) || '';

            function fallbackFull(data) {
                data = data || {};
                if (!data.title)            data.title = card.title || card.name || '';
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg)     data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality  = savedQuality;
                data.type   = method;
                data.method = method;
                for (var k in card) {
                    if (card.hasOwnProperty(k) && data[k] === undefined) data[k] = card[k];
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
                    if (!data || !data.title) {
                        fallbackFull(data);
                    } else {
                        if (!data.img && savedImg) data.img = savedImg;
                        if (!data.background_image && savedBg)     data.background_image = savedBg;
                        if (!data.release_quality && savedQuality) data.release_quality  = savedQuality;
                        data.type   = method;
                        data.method = method;
                        onSuccess(data);
                    }
                },
                function () { fallbackFull({}); }
            );
        };
    }

    // ================================================================
    //  MENU
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action=\"v10\"]').length) return;

        var item = $(
            '<li class=\"menu__item selector\" data-action=\"v10\">' +
                '<div class=\"menu__ico\">' +
                    '<svg height=\"36\" viewBox=\"0 0 24 24\" width=\"36\" fill=\"currentColor\">' +
                        '<path d="M12 2L2 8V20H8V14H16V20H22V8L12 2ZM4 10L12 6L20 10V18H17V12H7V18H4V10Z"/>' +
                        '<path d="M9 13H15V15H9V13Z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class=\"menu__text\">' + SOURCE_NAME + '</div>' +
            '</li>'
        );

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                method: 'category'
            });
        });

        var $after = $('.menu__list [data-action=\"movie\"], .menu__list [data-action=\"tv\"]').first().parent();
        if ($after.length) $after.after(item);
        else               $('.menu__list').append(item);
    }

    // ================================================================
    // INIT
    // ================================================================
    function init() {
        if (window.v10_plugin_ready) return;
        window.v10_plugin_ready = true;

        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') {
                setTimeout(addMenuItem, 1000);
            }
        });
        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
