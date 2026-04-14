(function () {
    'use strict';

    var API = 'https://script.google.com/macros/s/AKfycbzt3knVR1LoUPS8LqNlTAkoFquNFC6LzIGwYySdSQ3R_RoytZGR7OqawB40LtcdLuk/exec';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var CACHE = {};

    // 🔥 список листов (жёстко, как в GAS)
    var SHEETS = [
        'Топ 24ч',
        'Зарубежные фильмы',
        'Наши фильмы',
        'Зарубежные сериалы',
        'Наши сериалы',
        'Телевизор'
    ];

    function getTMDB(id, callback) {

        if (CACHE[id]) return callback(CACHE[id]);

        Lampa.Api.get('movie/' + id, {}, function (data) {
            if (!data || !data.id) {
                // пробуем как сериал
                Lampa.Api.get('tv/' + id, {}, function (tv) {
                    if (tv && tv.id) {
                        CACHE[id] = format(tv, 'tv');
                        callback(CACHE[id]);
                    } else callback(null);
                });
            } else {
                CACHE[id] = format(data, 'movie');
                callback(CACHE[id]);
            }
        });
    }

    function format(data, type) {
        return {
            id: data.id,
            type: type,
            title: data.title || data.name,
            poster_path: data.poster_path ? TMDB_IMG + data.poster_path : '',
            backdrop_path: data.backdrop_path,
            vote_average: data.vote_average || 0,
            overview: data.overview || ''
        };
    }

    function loadSheet(sheet, callback) {
        Lampa.Reguest.get(API + '?sheet=' + encodeURIComponent(sheet), function (data) {

            var json = JSON.parse(data);
            var ids = json.results || [];

            var results = [];
            var loaded = 0;

            if (!ids.length) return callback([]);

            ids.forEach(function (id, index) {

                getTMDB(id, function (card) {
                    loaded++;

                    if (card) results.push(card);

                    if (loaded === ids.length) {
                        callback(results);
                    }
                });

            });

        });
    }

    function Source() {

        this.category = function (params, onSuccess) {

            var parts = [];

            SHEETS.forEach(function (sheet) {

                parts.push(function (callback) {

                    loadSheet(sheet, function (results) {

                        callback({
                            title: sheet,
                            results: results,
                            source: 'V14'
                        });

                    });

                });

            });

            Lampa.Api.partNext(parts, 3, onSuccess);
        };
    }

    var source = new Source();

    Lampa.Api.sources.V14 = source;

    Lampa.Component.add('V14', {
        name: 'V14 PRO',
        icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>',
        onCreate: function () {

            var activity = this.activity;

            activity.loader(true);

            source.category({}, function (data) {
                activity.loader(false);
                activity.append(data);
            });
        }
    });

    Lampa.Menu.add({
        name: 'V14 PRO',
        component: 'V14',
        icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>'
    });

})();
