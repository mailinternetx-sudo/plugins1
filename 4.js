(function () {
    'use strict';

    var SOURCE_NAME = 'V5.1';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';   // ← укажите ваш URL

    var CATEGORIES = [
        { title: 'Топ 24 часа',          url: 'top24'       },
        { title: 'Зарубежные фильмы',    url: 'movies'      },
        { title: 'Наши фильмы',          url: 'movies_ru'   },
        { title: 'Зарубежные сериалы',   url: 'tv_shows'    },
        { title: 'Русские сериалы',      url: 'tv_shows_ru' },
        { title: 'Телевизор',            url: 'televizor'   },
        { title: 'Юмор',                 url: 'humor'       }
    ];

    // buildImg, buildBg, detectMediaMethod, normalizeCard — оставляем как было
    function buildImg(item) { /* ... копируйте из вашего оригинального файла ... */ }
    function buildBg(item) { /* ... */ }
    function detectMediaMethod(item) { /* ... */ }
    function normalizeCard(item) { /* ... */ }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.fetch = function (url, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json || !json.results) { onComplete([]); return; }
                onComplete(json.results.map(normalizeCard));
            }, function (err) {
                console.warn('[V5.1] fetch error:', url, err);
                if (onError) onError(err);
                else onComplete([]);
            });
        };

        self.search = function (params, onComplete, onError) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }

            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self.network.silent(url, function (json) {
                if (!json || !json.results) { onComplete({ results: [] }); return; }
                onComplete({
                    results: json.results.map(normalizeCard),
                    page: json.page || 1,
                    total_pages: json.total_pages || 1
                });
            }, function () { onComplete({ results: [] }); });
        };

        self.category = function (params, onSuccess, onError) {
            var rows = [];
            var total = CATEGORIES.length;
            var done = 0;

            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=20';

                self.fetch(url, function (items) {
                    rows.push({
                        title: cat.title,
                        results: items,
                        url: cat.url,
                        source: SOURCE_NAME
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
            var page = params.page || 1;
            var pageSize = params.page_size || 30;
            var url = WORKER_URL + params.url + '?page=' + page + '&page_size=' + pageSize;

            self.network.silent(url, function (json) {
                if (!json || !json.results) { onComplete({ results: [] }); return; }
                onComplete({
                    results: json.results.map(normalizeCard),
                    page: json.page || page,
                    total_pages: json.total_pages || 1,
                    total_results: json.total_results || json.results.length
                });
            }, function () { onComplete({ results: [] }); });
        };

        // full — оставляем как было
        self.full = function (params, onSuccess, onError) { /* ... оригинальный код ... */ };
    }

    function addMenuItem() { /* ... оригинальный код ... */ }

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
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
