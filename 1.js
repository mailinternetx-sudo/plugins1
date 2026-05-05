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
    //  НОРМАЛИЗАЦИЯ КАРТОЧКИ
    //
    //  Воркер уже присылает правильный type ('tv' или 'movie').
    //  Здесь мы его строго сохраняем — НЕ перезаписываем дефолтом 'movie'.
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

        // ВАЖНО: type берём строго из воркера. Воркер знает категорию и
        // правильно выставляет 'tv'/'movie'. Дефолт только если поле отсутствует.
        var type = item.type || 'movie';

        return {
            // ── обязательные поля Lampa ────────────────────────────────
            id:               item.id,
            title:            title,
            name:             item.name          || title,
            original_title:   item.original_title || title,
            overview:         item.overview       || '',

            // ── постеры ───────────────────────────────────────────────
            poster_path:      posterPath,
            backdrop_path:    backdropPath,
            img:              img,
            background_image: bg,

            // ── метаданные ────────────────────────────────────────────
            vote_average:      item.vote_average      || 0,
            release_date:      item.release_date       || '',
            first_air_date:    item.first_air_date     || '',
            number_of_seasons: item.number_of_seasons  || undefined,

            // КРИТИЧНО: сохраняем тип как есть — 'tv' или 'movie'
            type:             type,
            release_quality:  item.release_quality  || '',
            source:           SOURCE_NAME,

            // ── промо ─────────────────────────────────────────────────
            promo_title: item.promo_title || title,
            promo:       item.promo       || item.overview || '',

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

        // ── список (при открытии категории) ─────────────────────────
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

        // ── полная карточка ──────────────────────────────────────────
        // ИСПРАВЛЕНИЕ: используем правильный тип при обращении к TMDB.
        // Если item.type === 'tv' — вызываем TMDB как сериал, иначе как фильм.
        // Это ключевое исправление: раньше всегда вызывался tmdb.full без учёта типа,
        // поэтому сериалы открывались как фильмы.
        self.full = function (params, onSuccess, onError) {
            var itemId   = params.id;
            var itemType = params.type || 'movie';

            if (itemId && typeof itemId === 'number' && itemId > 0) {

                if (itemType === 'tv') {
                    // Для сериалов используем TMDB TV endpoint через sources.tmdb
                    // Lampa.Api.sources.tmdb.full определяет тип по наличию поля type
                    // Поэтому передаём params с type='tv' — Lampa сама выберет endpoint
                    var tvParams = Object.assign({}, params, { type: 'tv' });

                    Lampa.Api.sources.tmdb.full(tvParams, function (data) {
                        if (!data.img && params.img)
                            data.img = params.img;
                        if (!data.background_image && params.background_image)
                            data.background_image = params.background_image;
                        if (!data.release_quality && params.release_quality)
                            data.release_quality = params.release_quality;
                        // Гарантируем что тип не потеряется после обогащения
                        data.type = 'tv';
                        onSuccess(data);
                    }, function () {
                        // Fallback: прямой запрос к TMDB TV API
                        self._fetchTmdbTvDirect(params, onSuccess);
                    });

                } else {
                    // Фильм — стандартное поведение
                    Lampa.Api.sources.tmdb.full(params, function (data) {
                        if (!data.img && params.img)
                            data.img = params.img;
                        if (!data.background_image && params.background_image)
                            data.background_image = params.background_image;
                        if (!data.release_quality && params.release_quality)
                            data.release_quality = params.release_quality;
                        data.type = 'movie';
                        onSuccess(data);
                    }, function () {
                        onSuccess(params);
                    });
                }

            } else {
                // Нет числового id — возвращаем как есть
                onSuccess(params);
            }
        };

        // Прямой запрос к TMDB /tv/{id} — резервный путь для сериалов
        self._fetchTmdbTvDirect = function (params, onSuccess) {
            var tmdbKey = 'f348b4586d1791a40d99edd92164cb86';
            var url = 'https://api.themoviedb.org/3/tv/' + params.id +
                      '?api_key=' + tmdbKey + '&language=ru-RU' +
                      '&append_to_response=external_ids,content_ratings,credits,videos';

            self.network.silent(url, function (data) {
                if (!data) { onSuccess(params); return; }

                // Приводим к формату Lampa
                var title = data.name || data.original_name || params.title || '';

                var posterPath = data.poster_path
                    ? '/t/p/w500' + data.poster_path
                    : (params.poster_path || '');
                var bgPath = data.backdrop_path
                    ? '/t/p/original' + data.backdrop_path
                    : (params.backdrop_path || '');
                var imgFull = data.poster_path
                    ? 'https://image.tmdb.org/t/p/w500' + data.poster_path
                    : (params.img || '');
                var bgFull = data.backdrop_path
                    ? 'https://image.tmdb.org/t/p/original' + data.backdrop_path
                    : (params.background_image || '');

                var result = Object.assign({}, params, {
                    id:               data.id || params.id,
                    title:            title,
                    name:             title,
                    original_title:   data.original_name || params.original_title || title,
                    overview:         data.overview || params.overview || '',
                    poster_path:      posterPath,
                    backdrop_path:    bgPath,
                    img:              imgFull,
                    background_image: bgFull,
                    vote_average:     data.vote_average || params.vote_average || 0,
                    first_air_date:   data.first_air_date || params.first_air_date || '',
                    number_of_seasons: data.number_of_seasons || params.number_of_seasons,
                    type:             'tv',
                    method:           'full'
                });

                onSuccess(result);
            }, function () {
                onSuccess(params);
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
