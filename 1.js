(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    var CATEGORIES = [
        { title: 'Топ 24 часа',                url: 'top24',        method: 'movie' },
        { title: 'Зарубежные фильмы',           url: 'movies',       method: 'movie' },
        { title: 'Наши фильмы',                 url: 'movies_ru',    method: 'movie' },
        { title: 'Зарубежные сериалы',          url: 'tv_shows',     method: 'tv'    },
        { title: 'Русские сериалы',             url: 'tv_shows_ru',  method: 'tv'    },
        { title: 'Телевизор',                   url: 'televizor',    method: 'tv'    },
        { title: 'Юмор',                        url: 'humor',        method: 'tv'    },
        { title: 'Русские детективные сериалы', url: 'detective_ru', method: 'tv'    }
    ];

    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            return TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
            return TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    function detectMediaMethod(item) {
        if (item.method === 'tv' || item.type === 'tv' || item.number_of_seasons || item.first_air_date) {
            return 'tv';
        }
        return 'movie';
    }

    function normalizeCard(item) {
        var title  = item.title || item.name || '';
        var method = item.method || detectMediaMethod(item);

        return {
            id:               item.id,
            title:            title,
            name:             item.name           || title,
            original_title:   item.original_title  || title,
            overview:         item.overview        || '',
            poster_path:      item.poster_path     || '',
            backdrop_path:    item.backdrop_path   || '',
            img:              buildImg(item),
            background_image: buildBg(item),
            vote_average:      item.vote_average      || 0,
            release_date:      item.release_date       || '',
            first_air_date:    item.first_air_date     || '',
            number_of_seasons: item.number_of_seasons  || undefined,
            type:             method,
            method:           method,
            release_quality:  item.release_quality   || '1080p',
            source:           SOURCE_NAME,
            promo_title:      item.promo_title || title,
            promo:            item.promo       || item.overview || ''
        };
    }

    function RutorApiService() {
        var self     = this;
        self.network = new Lampa.Reguest();

        self._fetchRaw = function (url, onComplete, onError) {
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results || json.results.length === 0) { 
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
                    if (onError) onError(err);
                    else onComplete({ results: [], total_pages: 1, page: 1, total_results: 0 });
                }
            );
        };

        self.search = function (params, onComplete, onError) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }
            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self.network.silent(url, function (json) {
                if (!json || !json.results) { onComplete({ results: [] }); return; }
                onComplete({ results: json.results.map(normalizeCard), page: 1, total_pages: 1 });
            }, function () { onComplete({ results: [] }); });
        };

        self.category = function (params, onSuccess, onError) {
            var rows  = [];
            var total = CATEGORIES.length;
            var done  = 0;

            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=15';
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
                            return CATEGORIES.findIndex(function (c) { return c.url === a.url; }) - CATEGORIES.findIndex(function (c) { return c.url === b.url; });
                        });
                        onSuccess(rows);
                    }
                });
            });
        };

        self.list = function (params, onComplete, onError) {
            var page     = params.page     || 1;
            var pageSize = params.page_size || 20;
            var catUrl   = params.url || 'top24';
            var url      = WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize;

            self._fetchRaw(url, function (data) {
                onComplete(data);
            }, function () { onComplete({ results: [], page: 1, total_pages: 1, total_results: 0 }); });
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card || params;
            var method = detectMediaMethod(card);
            
            if (!card.id || card.id <= 0) {
                onSuccess(normalizeCard(card));
                return;
            }

            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (!data || !data.title) onSuccess(normalizeCard(card));
                else {
                    data.type = method;
                    data.method = method;
                    onSuccess(data);
                }
            }, function () {
                onSuccess(normalizeCard(card));
            });
        };
    }

    function addMenuItem() {
        if ($('.menu__item[data-action="v10"]').length) return;

        var saluteIcon = [
            '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor" xmlns="http://www.w3.org/2000/svg">',
            '  <line x1="12" y1="14" x2="12" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="12" y2="4"  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="4"  y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="6"  y2="6"  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="18" y2="6"  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="6"  y2="18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <line x1="12" y1="12" x2="18" y2="18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '  <circle cx="12" cy="3"  r="1.2" fill="currentColor"/>',
            '  <circle cx="3"  cy="12" r="1.2" fill="currentColor"/>',
            '  <circle cx="21" cy="12" r="1.2" fill="currentColor"/>',
            '  <circle cx="12" cy="12" r="2"   fill="currentColor"/>',
            '</svg>'
        ].join('');

        var item = $(
            '<li class="menu__item selector" data-action="v10">' +
            '<div class="menu__ico">' + saluteIcon + '</div>' +
            '<div class="menu__text">' + SOURCE_NAME + '</div>' +
            '</li>'
        );

        item.on('hover:enter', function () {
            Lampa.Activity.push({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, method: 'category' });
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
            if (e.type === 'ready' || e.type === 'render') setTimeout(addMenuItem, 500);
        });
        setTimeout(addMenuItem, 1000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });

})();
