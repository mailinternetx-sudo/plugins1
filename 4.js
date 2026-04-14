(function () {
    'use strict';

    var SOURCE_NAME = 'V10 v2';
    var API_URL = 'https://script.google.com/macros/s/AKfycbxyaaNuijcKm82446FRog5td-fLk7I9znDnwe5tndCLognWr-JV4osxWZ9R6LW7oE2_/exec';

    function V10Api() {
        var network = new Lampa.Reguest();

        // 🔥 получить список листов (категорий)
        this.getSheets = function (onSuccess, onError) {
            network.silent(API_URL + '?list=sheets', function (json) {
                onSuccess(json.sheets || []);
            }, onError);
        };

        // 🎬 получить фильмы
        this.getList = function (sheet, onSuccess, onError) {
            network.silent(API_URL + '?sheet=' + encodeURIComponent(sheet), function (json) {

                var results = (json.results || []).map(function (item) {
                    return {
                        id: item.id,
                        type: item.type || 'movie',
                        title: item.title,
                        name: item.title,
                        poster_path: item.poster_path,
                        backdrop_path: item.poster_path,
                        vote_average: item.vote_average || 0,
                        source: SOURCE_NAME
                    };
                });

                onSuccess({
                    results: results,
                    page: 1,
                    total_pages: 1
                });

            }, onError);
        };

        // 📂 категории (динамика)
        this.category = function (params, onSuccess, onError) {
            var self = this;

            this.getSheets(function (sheets) {

                var parts = [];

                sheets.forEach(function (sheet) {
                    parts.push(function (callback) {
                        self.getList(sheet, function (data) {
                            callback({
                                title: sheet,
                                results: data.results,
                                url: sheet,
                                source: SOURCE_NAME
                            });
                        }, function () {
                            callback({ error: true });
                        });
                    });
                });

                Lampa.Api.partNext(parts, 5, onSuccess, onError);

            }, onError);
        };

        // 📄 full (карточка)
        this.full = function (params, onSuccess, onError) {
            params.method = params.card.type || 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };

        // 📜 list (если открыта категория)
        this.list = function (params, onSuccess, onError) {
            this.getList(params.url, onSuccess, onError);
        };
    }

    function startPlugin() {
        if (window.v12_plugin) return;
        window.v12_plugin = true;

        var api = new V10Api();

        Lampa.Api.sources.v10v2 = api;

        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () {
                return api;
            }
        });

        // меню
        var menuItem = $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>');

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME
            });
        });

        $('.menu .menu__list').eq(0).append(menuItem);
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
