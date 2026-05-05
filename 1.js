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
    //  Lampa ищет постер в таком порядке:
    //    1. item.img              — прямой URL
    //    2. item.poster_path      — если начинается с http, берёт как есть,
    //                               иначе добавляет свой TMDB-префикс
    //    3. item.poster?.url      — KP формат
    // ================================================================

    /**
     * Строим полный URL постера из того, что пришло с воркера.
     * Воркер уже должен присылать img/background_image, но на случай
     * если запущен старый воркер — восстанавливаем здесь.
     */
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            // вид "/t/p/w500/xxx.jpg" или просто "/xxx.jpg"
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
    //  НОРМАЛИЗАЦИЯ КАРТОЧКИ (то, что Lampa ждёт от источника)
    // ================================================================
    function normalizeCard(item) {
        var img = buildImg(item);
        var bg  = buildBg(item);

        // poster_path должен быть в формате /t/p/w500/xxx.jpg,
        // чтобы Lampa смогла построить картинку через свой cdn-механизм
        var posterPath = item.poster_path || '';
        if (posterPath && !posterPath.startsWith('/t/p/') && !posterPath.startsWith('http')) {
            posterPath = '/t/p/w500' + posterPath;
        }

        var backdropPath = item.backdrop_path || '';
        if (backdropPath && !backdropPath.startsWith('/t/p/') && !backdropPath.startsWith('http')) {
            backdropPath = '/t/p/original' + backdropPath;
        }

        var title = item.title || item.name || '';

        return {
            // ── обязательные поля Lampa ────────────────────────────────
            id:               item.id,
            title:            title,
            name:             item.name  || title,
            original_title:   item.original_title || title,
            overview:         item.overview || '',

            // ── постеры ───────────────────────────────────────────────
            poster_path:      posterPath,     // /t/p/w500/xxx.jpg
            backdrop_path:    backdropPath,   // /t/p/original/xxx.jpg
            img:              img,            // https://image.tmdb.org/t/p/w500/xxx.jpg
            background_image: bg,            // https://image.tmdb.org/t/p/original/xxx.jpg

            // ── метаданные ────────────────────────────────────────────
            vote_average:     item.vote_average || 0,
            release_date:     item.release_date     || '',
            first_air_date:   item.first_air_date   || '',
            number_of_seasons: item.number_of_seasons || undefined,

            type:             item.type || 'movie',
            release_quality:  item.release_quality  || '',
            source:           SOURCE_NAME,

            // ── промо (используется на карточке) ─────────────────────
            promo_title: title,
            promo:       item.overview || '',

            // ── служебное ─────────────────────────────────────────────
            method: 'full'
        };
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self    = this;
        self.network = new Lampa.Reguest();

        // ── универсальный запрос к воркеру ──────────────────────────
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

        // ── поиск ───────────────────────────────────────────────────
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

        // ── главная: список категорий ────────────────────────────────
        self.category = function (params, onSuccess, onError) {
            var rows  = [];
            var total = CATEGORIES.length;
            var done  = 0;

            // Загружаем все категории параллельно для скорости
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
                        // Возвращаем в исходном порядке категорий
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

        // ── список (при открытии категории) ─────────────────────────
        self.list = function (params, onComplete, onError) {
            var page     = params.page     || 1;
            var pageSize = params.page_size || 30;
            var url = WORKER_URL + params.url +
                      '?page=' + page +
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

        // ── полная карточка ──────────────────────────────────────────
        // Если есть числовой id — делегируем TMDB для получения деталей,
        // иначе возвращаем данные как есть.
        self.full = function (params, onSuccess, onError) {
            if (params.id && typeof params.id === 'number' && params.id > 0) {
                Lampa.Api.sources.tmdb.full(params, function (data) {
                    // Дополняем ответ TMDB нашими прямыми URL, если TMDB не вернул
                    if (!data.img && params.img)              data.img              = params.img;
                    if (!data.background_image && params.background_image)
                        data.background_image = params.background_image;
                    onSuccess(data);
                }, function () {
                    // fallback — вернуть то, что уже есть
                    onSuccess(params);
                });
            } else {
                onSuccess(params);
            }
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
