(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    // ================================================================
    //  КАТЕГОРИИ
    // ================================================================
    var CATEGORIES = [
        { title: 'Топ 24 часа',              url: 'top24',               method: 'movie' },
        { title: 'Зарубежные фильмы',        url: 'movies',              method: 'movie' },
        { title: 'Наши фильмы',              url: 'movies_ru',           method: 'movie' },
        { title: 'Зарубежные сериалы',       url: 'tv_shows',            method: 'tv'    },
        { title: 'Русские сериалы',          url: 'tv_shows_ru',         method: 'tv'    },
        { title: 'Русские детективные сериалы', url: 'russian_detectives', method: 'tv' },
        { title: 'Телевизор',                url: 'televizor',           method: 'tv'    },
        { title: 'Юмор',                     url: 'humor',               method: 'tv'    }
    ];

    // ================================================================
    //  УТИЛИТЫ
    // ================================================================
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            if (item.poster_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.poster_path;
            return TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
            if (item.backdrop_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.backdrop_path;
            return TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    function detectMediaMethod(item) {
        if (
            item.method === 'tv' ||
            item.type   === 'tv' ||
            item.number_of_seasons ||
            item.seasons ||
            item.first_air_date
        ) {
            return 'tv';
        }
        return 'movie';
    }

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
            id:               item.id,
            title:            title,
            name:             item.name           || title,
            original_title:   item.original_title  || title,
            overview:         item.overview        || '',

            poster_path:      posterPath,
            backdrop_path:    backdropPath,
            img:              img,
            background_image: bg,

            vote_average:      item.vote_average      || 0,
            release_date:      item.release_date       || '',
            first_air_date:    item.first_air_date     || '',
            number_of_seasons: item.number_of_seasons  || undefined,

            type:             method,
            method:           method,
            release_quality:  item.release_quality   || '',
            source:           SOURCE_NAME,

            promo_title: item.promo_title || title,
            promo:       item.promo       || item.overview || ''
        };
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self     = this;
        self.network = new Lampa.Reguest();

        self._fetchRaw = function (url, onComplete, onError) {
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) {
                        onComplete({ results: [], total_pages: 1, page: 1, total_results: 0 });
                        return;
                    }
                    onComplete({
                        results:       json.results.map(normalizeCard),
                        page:          json.page          || 1,
                        total_pages:   json.total_pages   || 1,
                        total_results: json.total_results || json.results.length
                    });
                },
                function (err) {
                    console.warn('[V10] fetch error:', url, err);
                    if (onError) onError(err);
                    else onComplete({ results: [], total_pages: 1, page: 1, total_results: 0 });
                }
            );
        };

        self.search = function (params, onComplete, onError) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }

            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);

            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) { onComplete({ results: [] }); return; }
                    onComplete({
                        results:     json.results.map(normalizeCard),
                        page:        json.page        || 1,
                        total_pages: json.total_pages || 1
                    });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        self.category = function (params, onSuccess, onError) {
            var rows  = [];
            var total = CATEGORIES.length;
            var done  = 0;

            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=20';

                self._fetchRaw(url, function (data) {
                    rows.push({
                        title:       cat.title,
                        results:     data.results,
                        url:         cat.url,
                        source:      SOURCE_NAME,
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

        self.list = function (params, onComplete, onError) {
            var page     = params.page     || 1;
            var pageSize = params.page_size || 30;

            var catUrl = params.url || 'top24';
            var url = WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize;

            self._fetchRaw(url, function (data) {
                onComplete({
                    results:       data.results,
                    page:          data.page,
                    total_pages:   data.total_pages,
                    total_results: data.total_results
                });
            }, function () { onComplete({ results: [], page: 1, total_pages: 1, total_results: 0 }); });
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card || params;
            var method = detectMediaMethod(card);
            params.method = method;
            if (card && typeof card === 'object') {
                card.method = method;
                card.type   = method;
            }

            var savedImg     = params.img              || (card && card.img)              || '';
            var savedBg      = params.background_image || (card && card.background_image) || '';
            var savedQuality = params.release_quality  || (card && card.release_quality)  || '';

            function fallbackFull(data) {
                data = data || {};
                if (!data.title) data.title = card.title || card.name || '';
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg) data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                data.type   = method;
                data.method = method;
                for (var k in card) {
                    if (card.hasOwnProperty(k) && data[k] === undefined) {
                        data[k] = card[k];
                    }
                }
                onSuccess(data);
            }

            if (!card.id || card.id <= 0 || String(card.id).length < 3) {
                fallbackFull({});
                return;
            }
            if (card.id < 0) {
                fallbackFull({});
                return;
            }

            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (!data || !data.title) {
                    fallbackFull(data);
                } else {
                    if (!data.img && savedImg) data.img = savedImg;
                    if (!data.background_image && savedBg) data.background_image = savedBg;
                    if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                    data.type   = method;
                    data.method = method;
                    onSuccess(data);
                }
            }, function (err) {
                console.warn('[V10] TMDB full error:', err);
                fallbackFull({});
            });
        };
    }

    // ================================================================
    //  МЕНЮ
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action="v10"]').length) return;

        var item = $(
            '<li class="menu__item selector" data-action="v10">' +
            '<div class="menu__ico">' +
            '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
            '<path d="M12 2L10 22H14L12 2Z M11 6H13V18H11V6Z"/>' +
            '</svg>' +
            '</div>' +
            '<div class="menu__text">' + SOURCE_NAME + '</div>' +
            '</li>'
        );

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                title:     SOURCE_NAME,
                component: 'category',
                source:    SOURCE_NAME,
                method:    'category'
            });
        });

        var $after = $('.menu__list [data-action="movie"], .menu__list [data-action="tv"]').first().parent();
        if ($after.length) $after.after(item);
        else $('.menu__list').append(item);
    }

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

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
