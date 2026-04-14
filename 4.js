/*
=====================================================
📺 LAMPA PLUGIN: V10 v4 PRO (Optimized + Cache + UI)
=====================================================
*/

(function () {
    'use strict';

    const API_URL = 'https://script.google.com/macros/s/AKfycbyN7CBdDLc8H4zsAdOO6dGI4eaUlw16V1s74Cdvj8RZgL2jyfDMWC6kepjulDUcnYNW/exec';

    // ⏱ Кеш (5 минут)
    const CACHE_TIME = 5 * 60 * 1000;
    let cache = {};

    function fetchJSON(url, callback) {
        const now = Date.now();

        if (cache[url] && (now - cache[url].time < CACHE_TIME)) {
            return callback(cache[url].data);
        }

        fetch(url)
            .then(res => res.json())
            .then(data => {
                cache[url] = { data: data, time: now };
                callback(data);
            })
            .catch(() => callback(null));
    }

    function createCard(item) {
        return {
            id: item.id,
            type: item.type || 'movie',
            title: item.title,
            name: item.name,
            original_title: item.original_title || item.title,
            poster: item.poster_path || '',
            backdrop: item.backdrop_path || item.poster_path || '',
            vote_average: item.vote_average || 0
        };
    }

    function openCategory(sheetName) {
        const url = API_URL + '?sheet=' + encodeURIComponent(sheetName);

        Lampa.Activity.push({
            url: url,
            title: sheetName,
            component: 'category_full',
            page: 1,
            source: 'v10_pro',
            cardClass: 'card--collection',

            onMore: function (data, resolve) {
                resolve([]);
            },

            onLoad: function (data, resolve) {
                fetchJSON(url, function (json) {
                    if (!json || !json.results) return resolve([]);

                    let items = json.results.map(createCard);

                    // ⭐ сортировка по рейтингу
                    items.sort((a, b) => b.vote_average - a.vote_average);

                    resolve(items);
                });
            }
        });
    }

    function loadCategories(callback) {
        fetchJSON(API_URL, function (json) {
            if (!json || !json.sheets) return callback([]);

            // ❌ фильтр мусорных листов
            const clean = json.sheets.filter(name =>
                name &&
                !name.startsWith('_') &&
                !name.toLowerCase().includes('tmp')
            );

            callback(clean);
        });
    }

    function initPlugin() {
        loadCategories(function (categories) {
            if (!categories.length) return;

            const items = categories.map(name => ({
                title: name,
                action: function () {
                    openCategory(name);
                }
            }));

            Lampa.Menu.add({
                title: 'V10 v4',
                icon: 'movie_filter',
                items: items
            });
        });
    }

    // 🚀 запуск
    if (window.appready) initPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') initPlugin();
        });
    }
})();
