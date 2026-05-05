(function () {
    'use strict';

    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    var CATEGORIES = [
        { title: 'Топ 24 часа',          url: 'top24'       },
        { title: 'Зарубежные фильмы',    url: 'movies'      },
        { title: 'Наши фильмы',          url: 'movies_ru'   },
        { title: 'Зарубежные сериалы',   url: 'tv_shows'    },
        { title: 'Русские сериалы',      url: 'tv_shows_ru' },
        { title: 'Телевизор',            url: 'televizor'   }
    ];

    // ================================================================
    //  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
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

    // ================================================================
    //  ОПРЕДЕЛЯЕМ ТИП КАРТОЧКИ — tv или movie
    // ================================================================
    function detectMediaMethod(item) {
        if (
            item.type === 'tv' ||
            item.number_of_seasons ||
            item.seasons ||
            item.first_air_date
        ) {
            return 'tv';
        }
        return 'movie';
    }

    // ================================================================
    //  НОРМАЛИЗАЦИЯ КАРТОЧКИ
    // ================================================================
    function normalizeCard(item) {
        var img = buildImg(item);
        var bg  = buildBg(item);

        var posterPath = item.poster_path || '';
        if (posterPath &&
            !posterPath.startsWith('/t/p/') &&
            !posterPath.startsWith('http')) {
            posterPath = '/t/p/w500' + posterPath;
        }

        var backdropPath = item.backdrop_path || '';
        if (backdropPath &&
            !backdropPath.startsWith('/t/p/') &&
            !backdropPath.startsWith('http')) {
            backdropPath = '/t/p/original' + backdropPath;
        }

        var title = item.title || item.name || '';

        var type   = item.type || 'movie';
        var method = detectMediaMethod(item);

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

            type:             type,
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
        var self    = this;
        self.network = new Lampa.Reguest();

        self.fetch = function (url, onComplete, onError) {
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) { onComplete([]); return; }
                    onComplete(json.results.map(normalizeCard));
                },
                function (err) {
                    console.warn('[RutorPro] fetch error:', url, err);
                    if (onError) onError(err);
                    else onComplete([]);
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

                self.fetch(url, function (items) {
                    rows.push({
                        title:   cat.title,
                        results: items,
                        url:     cat.url,
                        source:  SOURCE_NAME
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
            var url = WORKER_URL + params.url +
                      '?page='      + page +
                      '&page_size=' + pageSize;

            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) { onComplete({ results: [] }); return; }
                    onComplete({
                        results:       json.results.map(normalizeCard),
                        page:          json.page          || page,
                        total_pages:   json.total_pages   || 1,
                        total_results: json.total_results || json.results.length
                    });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        // ================================================================
        //  ПОЛНАЯ КАРТОЧКА (исправлено: fallback и обработка ошибок)
        // ================================================================
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

            // Функция для создания полной карточки из кэшированных данных, если TMDB не сработал
            function fallbackFull(data) {
                data = data || {};
                if (!data.title) data.title = card.title || card.name || '';
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg) data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                data.type   = method;
                data.method = method;
                // Копируем недостающие поля из исходной карточки
                for (var k in card) {
                    if (card.hasOwnProperty(k) && data[k] === undefined) {
                        data[k] = card[k];
                    }
                }
                onSuccess(data);
            }

            // Если ID не похож на настоящий TMDB ID (отрицательный, 0, слишком короткий),
            // сразу отдаём то, что есть, не дёргая API.
            if (!card.id || card.id <= 0 || String(card.id).length < 3) {
                fallbackFull({});
                return;
            }

            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (!data || !data.title) {
                    // TMDB вернул пустой результат
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
                console.warn('[RutorPro] TMDB full error:', err);
                fallbackFull({});
            });
        };
    }

    // ================================================================
    //  ПУНКТ МЕНЮ
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action="rutor_pro"]').length) return;

        var item = $(
            '<li class="menu__item selector" data-action="rutor_pro">' +
            '<div class="menu__ico">' +
            '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
            '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' +
            'M10 16.5v-9l6 4.5-6 4.5z"/>' +
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

    // ================================================================
    //  INIT
    // ================================================================
    function init() {
        if (window.rutor_pro_ready) return;
        window.rutor_pro_ready = true;

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
