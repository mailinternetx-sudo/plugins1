(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    var CATEGORIES = [
        { title: 'Топ 24 часа',        url: 'top24'          },
        { title: 'Зарубежные фильмы',  url: 'kino'           },
        { title: 'Наши фильмы',        url: 'nashe_kino'     },
        { title: 'Зарубежные сериалы', url: 'seriali'        },
        { title: 'Русские сериалы',    url: 'nashi_seriali'  },
        { title: 'Телевизор',          url: 'tv'             },
        { title: 'Юмор',               url: 'jumor'          }
    ];

    // ================================================================
    //  УТИЛИТЫ
    // ================================================================
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            return item.poster_path.startsWith('http') ? item.poster_path : TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            return item.backdrop_path.startsWith('http') ? item.backdrop_path : TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    function detectMediaMethod(item) {
        if (item.type === 'tv' || item.number_of_seasons || item.seasons || item.first_air_date) {
            return 'tv';
        }
        return 'movie';
    }

    function normalizeCard(item) {
        var img = buildImg(item);
        var bg  = buildBg(item);

        var title = item.title || item.name || '';

        var method = detectMediaMethod(item);

        return {
            id:                item.id,
            title:             title,
            name:              item.name || title,
            original_title:    item.original_title || title,
            overview:          item.overview || '',

            poster_path:       item.poster_path || '',
            backdrop_path:     item.backdrop_path || '',
            img:               img,
            background_image:  bg,

            vote_average:      item.vote_average || 0,
            release_date:      item.release_date || '',
            first_air_date:    item.first_air_date || '',
            number_of_seasons: item.number_of_seasons,

            type:              item.type || 'movie',
            method:            method,
            release_quality:   item.release_quality || '',
            source:            SOURCE_NAME,

            promo_title: item.promo_title || title,
            promo:       item.promo || item.overview || ''
        };
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json || !json.results) {
                    onComplete([]);
                    return;
                }
                onComplete(json.results.map(normalizeCard));
            }, function (err) {
                console.warn('[V10] fetch error:', url, err);
                onComplete([]);
            });
        };

        self.search = function (params, onComplete) {
            var query = (params.query || '').trim();
            if (!query) return onComplete({ results: [] });

            self.network.silent(
                WORKER_URL + 'search?query=' + encodeURIComponent(query),
                function (json) {
                    onComplete({
                        results: json?.results?.map(normalizeCard) || [],
                        page: json?.page || 1,
                        total_pages: json?.total_pages || 1
                    });
                },
                () => onComplete({ results: [] })
            );
        };

        self.category = function (params, onSuccess) {
            var rows = [];
            var total = CATEGORIES.length;
            var done = 0;

            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=25';

                self.fetch(url, function (items) {
                    rows.push({
                        title: cat.title,
                        results: items,
                        url: cat.url,
                        source: SOURCE_NAME
                    });

                    done++;
                    if (done === total) {
                        rows.sort((a, b) => {
                            var ia = CATEGORIES.findIndex(c => c.url === a.url);
                            var ib = CATEGORIES.findIndex(c => c.url === b.url);
                            return ia - ib;
                        });
                        onSuccess(rows);
                    }
                });
            });
        };

        self.list = function (params, onComplete) {
            var page = params.page || 1;
            var pageSize = Math.min(params.page_size || 30, 60);

            var url = WORKER_URL + params.url + 
                      '?page=' + page + 
                      '&page_size=' + pageSize;

            self.network.silent(url, function (json) {
                onComplete({
                    results: json?.results?.map(normalizeCard) || [],
                    page: json?.page || page,
                    total_pages: json?.total_pages || 1,
                    total_results: json?.total_results || json?.results?.length || 0
                });
            }, () => onComplete({ results: [] }));
        };

        self.full = function (params, onSuccess) {
            var card = params.card || params;
            var method = detectMediaMethod(card);

            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (data && data.title) {
                    data.type = method;
                    data.method = method;
                    onSuccess(data);
                } else {
                    onSuccess(Object.assign({}, card, { type: method, method: method }));
                }
            }, function () {
                onSuccess(Object.assign({}, card, { type: method, method: method }));
            });
        };
    }

    // ================================================================
    //  МЕНЮ
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action="v10"]').length) return;

        var item = $(`
            <li class="menu__item selector" data-action="v10">
                <div class="menu__ico">
                    <svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">
                        <path d="M12 2L10 22H14L12 2Z M11 6H13V18H11V6Z"/>
                    </svg>
                </div>
                <div class="menu__text">${SOURCE_NAME}</div>
            </li>
        `);

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                method: 'category'
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
        if (window.v10_plugin_ready) return;
        window.v10_plugin_ready = true;

        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') {
                setTimeout(addMenuItem, 800);
            }
        });

        setTimeout(addMenuItem, 1500);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
