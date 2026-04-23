(function () {
    'use strict';

    var SOURCE = 'Rutor Pro';
    var PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа',   path: 'lampac_top24' },
        { title: '🎬 Зарубежные фильмы',         path: 'lampac_movies' },
        { title: '🇷🇺 Наши фильмы',              path: 'lampac_movies_ru' },
        { title: '📺 Зарубежные сериалы',        path: 'lampac_tv_shows' },
        { title: '🇷🇺 Наши сериалы',             path: 'lampac_tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)',   path: 'lampac_televizor' }
    ];

    // Простой XMLHttpRequest вместо fetch (совместимость)
    function xhrGet(url, callback, errorCallback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var json = JSON.parse(xhr.responseText);
                        callback(null, json);
                    } catch (e) {
                        callback(e, null);
                    }
                } else {
                    callback(new Error('HTTP ' + xhr.status), null);
                }
            }
        };
        xhr.onerror = function (e) { callback(e, null); };
        xhr.send();
    }

    // Нормализация карточки для Lampa
    function normalizeItem(item) {
        var id = item.id || 0;
        var poster = item.poster_path || '';
        var title = item.title || item.name || 'Без названия';
        var mediaType = (item.type === 'tv') ? 'tv' : 'movie';
        return {
            id: id,
            title: title,
            name: title,
            original_title: item.original_title || title,
            overview: item.overview || '',
            poster: poster,
            poster_path: poster,
            backdrop_path: item.backdrop_path || '',
            vote_average: item.vote_average || 0,
            release_date: item.release_date,
            first_air_date: item.first_air_date,
            media_type: mediaType,
            source: SOURCE
        };
    }

    function Api() {
        this.category = function (params, onSuccess, onError) {
            try {
                var url = params.url;
                var page = params.page || 1;

                // Главный экран – список категорий (линии)
                if (!url) {
                    var lines = [];
                    for (var i = 0; i < CATEGORIES.length; i++) {
                        lines.push({
                            title: CATEGORIES[i].title,
                            url: CATEGORIES[i].path,
                            type: 'line',
                            source: SOURCE,
                            page: 1,
                            more: true
                        });
                    }
                    // КЛЮЧЕВОЙ МОМЕНТ: всегда передаём объект с полем results
                    onSuccess({ results: lines, page: 1, total_pages: 1, more: false });
                    return;
                }

                // Запрос к worker за конкретной категорией
                var fullUrl = PROXY + url + '?page=' + page;
                xhrGet(fullUrl, function (err, data) {
                    if (err) {
                        console.error('[Rutor Pro] XHR error:', err);
                        onError(err);
                        return;
                    }
                    var items = data.results || [];
                    var normalized = [];
                    for (var j = 0; j < items.length; j++) {
                        normalized.push(normalizeItem(items[j]));
                    }
                    var response = {
                        results: normalized,
                        page: data.page || page,
                        total_pages: data.total_pages || 1,
                        more: (data.page || page) < (data.total_pages || 1),
                        source: SOURCE,
                        url: url
                    };
                    onSuccess(response);
                }, onError);
            } catch (e) {
                console.error('[Rutor Pro] category exception:', e);
                onError(e);
            }
        };

        this.full = function (params, onSuccess, onError) {
            // Детальная страница – используем штатный TMDB (можно заменить, но для начала оставим)
            if (Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
            } else {
                onError('TMDB not available');
            }
        };
    }

    // Добавление кнопки в меню
    function addButton() {
        var menu = document.querySelector('.menu .menu__list');
        if (!menu) {
            setTimeout(addButton, 500);
            return;
        }
        if (document.querySelector('[data-rutor-pro]')) return;

        var li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-pro', '1');
        li.innerHTML = '<div class="menu__ico">🔥</div><div class="menu__text">' + SOURCE + '</div>';
        li.addEventListener('hover:enter', function () {
            Lampa.Activity.push({
                component: 'category',
                source: SOURCE,
                title: SOURCE
            });
        });
        menu.appendChild(li);
    }

    // Старт плагина
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        addButton();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
