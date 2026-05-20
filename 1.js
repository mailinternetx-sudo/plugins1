(function () {
    'use strict';

    var SOURCE_NAME = 'RuTracker';
    // Ссылка на ваш развернутый Cloudflare воркер
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    // ================================================================
    //  КАТЕГОРИИ РУТРЕКЕРА
    // ================================================================
    var CATEGORIES = [
        { title: 'Топ 24 часа (Самые скачиваемые)', url: 'top24',        method: 'movie' },
        { title: 'Зарубежные фильмы',              url: 'movies',       method: 'movie' },
        { title: 'Русские / Наше кино',            url: 'movies_ru',    method: 'movie' },
        { title: 'Зарубежные сериалы',             url: 'tv_shows',     method: 'tv'    },
        { title: 'Русские сериалы',                url: 'tv_shows_ru',  method: 'tv'    },
        { title: 'Телевизор и шоу',                url: 'televizor',    method: 'tv'    },
        { title: 'Юмор',                           url: 'humor',        method: 'tv'    },
        { title: 'Русские детективные сериалы',    url: 'detective_ru', method: 'tv'    }
    ];

    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            return 'https://image.tmdb.org' + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
            return 'https://image.tmdb.org" + item.backdrop_path;
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
        var img = buildImg(item);
        var bg  = buildBg(item);
        var title  = item.title || item.name || '';
        var method = item.method || detectMediaMethod(item);

        return {
            id:               item.id,
            title:            title,
            name:             item.name || title,
            original_title:   item.original_title || title,
            overview:         item.overview || '',
            poster_path:      item.poster_path || '',
            backdrop_path:    item.backdrop_path || '',
            img:              img,
            background_image: bg,
            vote_average:      item.vote_average || 0,
            release_date:      item.release_date || '',
            first_air_date:    item.first_air_date || '',
            type:             method,
            method:           method,
            release_quality:  item.release_quality || '',
            source:           SOURCE_NAME
        };
    }

    function RutorApiService() {
        var self     = this;
        self.network = new Lampa.Reguest();

        self._fetchRaw = function (url, onComplete, onError) {
            self.network.silent(
                url,
                function (json) {
                    if (!json || !json.results) { onComplete({ results: [] }); return; }
                    onComplete({
                        results:       json.results.map(normalizeCard),
                        page:          json.page || 1,
                        total_pages:   json.total_pages || 1,
                        total_results: json.total_results || json.results.length
                    });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        self.search = function (params, onComplete, onError) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }
            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self._fetchRaw(url, onComplete);
        };

        self.category = function (params, onSuccess, onError) {
            var rows  = [];
            var total = CATEGORIES.length;
            var done  = 0;

            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=24';
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
                            return CATEGORIES.findIndex(c => c.url === a.url) - CATEGORIES.findIndex(c => c.url === b.url);
                        });
                        onSuccess(rows);
                    }
                });
            });
        };

        self.list = function (params, onComplete, onError) {
            var page = params.page || 1;
            var url = WORKER_URL + (params.url || 'top24') + '?page=' + page + '&page_size=30';
            self._fetchRaw(url, onComplete);
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card || params;
            var method = detectMediaMethod(card);
            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (!data || !data.title) onSuccess(card);
                else {
                    data.type = method;
                    data.method = method;
                    onSuccess(data);
                }
            }, function () { onSuccess(card); });
        };
    }

    function addMenuItem() {
        if ($('.menu__item[data-action="rutracker"]').length) return;

        var rutrackerIcon = [
            '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor" xmlns="http://www.w3.org/2000/svg">',
            '  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/>',
            '  <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '</svg>'
        ].join('');

        var item = $(
            '<li class="menu__item selector" data-action="rutracker">' +
            '<div class="menu__ico">' + rutrackerIcon + '</div>' +
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
        if (window.rutracker_plugin_ready) return;
        window.rutracker_plugin_ready = true;
        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') setTimeout(addMenuItem, 1000);
        });
        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
