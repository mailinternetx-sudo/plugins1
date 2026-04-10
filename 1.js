(function () {
    'use strict';

    const PLUGIN_NAME = 'V10 v1';
    const SOURCE_NAME = 'v10_v1';
    const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M4 6h16v2H4V6zm2-4h12v2H6V2zm16 8H2v12h20V10zm-2 10H4v-8h16v8z"/></svg>';
    
    // 👇 СЮДА ВСТАВЬТЕ ВАШ НОВЫЙ URL ОТ PUBLISH (из Apps Script)
    const GS_URL = 'https://script.google.com/macros/s/AKfycbyyl-D2v4BIqJtc6dg2HDG7ilZwc5JZrCV5r4oHZtc4hJiuMN08oCTRYp7lkySwTDCB/exec'; 
    
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

    const CATEGORIES = {
        top24:       { title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч', type: 'movie' },
        foreign_movies: { title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
        russian_movies: { title: 'Наши фильмы', sheet: 'Наши фильмы', type: 'movie' },
        foreign_series: { title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы', type: 'tv' },
        russian_series: { title: 'Наши сериалы', sheet: 'Наши сериалы', type: 'tv' },
        tvshows:     { title: 'Телевизор', sheet: 'Телевизор', type: 'tv' }
    };

    // Кэш ID и TMDB
    const cache = {
        ids: {},
        tmdb: {},
        setIds(sheet, ids) {
            this.ids[sheet] = { data: ids, time: Date.now() };
        },
        getIds(sheet) {
            const entry = this.ids[sheet];
            if (entry && (Date.now() - entry.time) < 600000) return entry.data;
            return null;
        },
        setTmdb(key, data) {
            this.tmdb[key] = { data: data, time: Date.now() };
        },
        getTmdb(key) {
            const entry = this.tmdb[key];
            if (entry && (Date.now() - entry.time) < 3600000) return entry.data;
            return null;
        }
    };

    // Получить массив ID из Google Sheets (формат { results: [...] })
    function fetchIdsFromSheet(sheetName) {
        return new Promise((resolve, reject) => {
            const cached = cache.getIds(sheetName);
            if (cached) {
                resolve(cached);
                return;
            }

            const url = GS_URL + '?sheet=' + encodeURIComponent(sheetName);
            fetch(url)
                .then(response => response.json())
                .then(json => {
                    let ids = [];
                    if (json.results && Array.isArray(json.results)) {
                        ids = json.results;
                    } else if (Array.isArray(json)) {
                        ids = json;
                    } else if (json.data && Array.isArray(json.data)) {
                        // fallback для старого формата
                        for (let i = 1; i < json.data.length; i++) {
                            const row = json.data[i];
                            if (row && row.length > 5 && row[5]) {
                                const id = parseInt(row[5]);
                                if (!isNaN(id)) ids.push(id);
                            }
                        }
                    }
                    if (ids.length === 0) {
                        reject(new Error('Нет ID в листе ' + sheetName));
                    } else {
                        cache.setIds(sheetName, ids);
                        resolve(ids);
                    }
                })
                .catch(reject);
        });
    }

    // Загрузить данные из TMDB
    function fetchTmdbItem(id, type) {
        return new Promise((resolve) => {
            const cacheKey = id + '_' + type;
            const cached = cache.getTmdb(cacheKey);
            if (cached) {
                resolve(cached);
                return;
            }

            const endpoint = type === 'movie' ? `movie/${id}` : `tv/${id}`;
            const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&language=ru-RU`;
            fetch(url)
                .then(res => res.json())
                .then(item => {
                    if (item && !item.status_code) {
                        const result = {
                            id: item.id,
                            title: item.title || item.name,
                            original_title: item.original_title || item.original_name,
                            poster_path: item.poster_path ? TMDB_IMG_BASE + item.poster_path : null,
                            backdrop_path: item.backdrop_path ? TMDB_IMG_BASE + item.backdrop_path : null,
                            overview: item.overview,
                            release_date: item.release_date || item.first_air_date,
                            vote_average: item.vote_average,
                            type: type
                        };
                        cache.setTmdb(cacheKey, result);
                        resolve(result);
                    } else {
                        resolve(null);
                    }
                })
                .catch(() => resolve(null));
        });
    }

    // API-источник для Lampa
    function V10V1ApiService() {
        const self = this;
        self.discovery = false;

        self.list = function(params, onComplete, onError) {
            const categoryKey = params.url;
            const category = CATEGORIES[categoryKey];
            if (!category) {
                onError(new Error('Неизвестная категория'));
                return;
            }

            Lampa.Loader.show();
            fetchIdsFromSheet(category.sheet)
                .then(async (ids) => {
                    const items = [];
                    for (const id of ids) {
                        const tmdbItem = await fetchTmdbItem(id, category.type);
                        if (tmdbItem) items.push(tmdbItem);
                    }
                    Lampa.Loader.hide();
                    onComplete({
                        results: items,
                        page: 1,
                        total_pages: 1,
                        total_results: items.length
                    });
                })
                .catch(error => {
                    Lampa.Loader.hide();
                    console.error(error);
                    onError(error);
                });
        };

        self.main = function(params, onComplete) {
            onComplete([]);
        };

        self.full = function(params, onSuccess, onError) {
            const card = params.card;
            const type = (card.first_air_date || card.number_of_seasons) ? 'tv' : 'movie';
            params.method = type;
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        };
    }

    // Регистрация источника
    const v10Api = new V10V1ApiService();
    Lampa.Api.sources[SOURCE_NAME] = v10Api;

    // Добавление пункта меню
    function addMenuItem() {
        if ($('.menu .menu__list .menu__item[data-action="v10_v1"]').length) return;
        const menuItem = $(`<li data-action="v10_v1" class="menu__item selector"><div class="menu__ico">${ICON}</div><div class="menu__text">${PLUGIN_NAME}</div></li>`);
        $('.menu .menu__list').eq(0).append(menuItem);
        menuItem.on('hover:enter', function() {
            Lampa.Activity.push({
                title: PLUGIN_NAME,
                component: 'v10_v1_categories'
            });
        });
    }

    // Компонент выбора категории
    Lampa.Component.add('v10_v1_categories', {
        template: 'categories',
        data: function() {
            return { categories: Object.keys(CATEGORIES).map(key => ({ key: key, title: CATEGORIES[key].title })) };
        },
        render: function(data) {
            let html = '<div class="selector-list" style="padding: 20px;">';
            data.categories.forEach(cat => {
                html += `<div class="selector-item" data-key="${cat.key}">${cat.title}</div>`;
            });
            html += '</div>';
            this.dom.html(html);
            this.dom.find('.selector-item').on('click', (e) => {
                const key = $(e.currentTarget).data('key');
                Lampa.Activity.push({
                    title: CATEGORIES[key].title,
                    component: 'category',
                    source: SOURCE_NAME,
                    url: key,
                    page: 1
                });
            });
        }
    });

    // Настройки
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'v10_v1_settings',
            name: PLUGIN_NAME,
            icon: ICON
        });
        Lampa.SettingsApi.addParam({
            component: 'v10_v1_settings',
            param: {
                name: 'v10_v1_clear_cache',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Сбросить кэш',
                description: 'Очистить временные данные'
            },
            onChange: function(value) {
                if (value === true || value === 'true') {
                    cache.ids = {};
                    cache.tmdb = {};
                    Lampa.Notification.show('Кэш очищен', 2000);
                    Lampa.Storage.set('v10_v1_clear_cache', false);
                }
            }
        });
    }

    // Запуск
    function startPlugin() {
        if (window.v10_v1_started) return;
        window.v10_v1_started = true;
        addMenuItem();
        addSettings();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
