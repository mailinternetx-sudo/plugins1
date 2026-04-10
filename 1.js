(function () {
    'use strict';

    // ---------------------- КОНСТАНТЫ ----------------------
    const PLUGIN_NAME = 'V10 v1';
    const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M4 6h16v2H4V6zm2-4h12v2H6V2zm16 8H2v12h20V10zm-2 10H4v-8h16v8z"/></svg>';
    const GS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

    // Категории: ключ, название, имя листа, тип (movie/tv)
    const CATEGORIES = [
        { id: 'top24', title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч', type: 'movie' },
        { id: 'foreign_movies', title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
        { id: 'russian_movies', title: 'Наши фильмы', sheet: 'Наши фильмы', type: 'movie' },
        { id: 'foreign_series', title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы', type: 'tv' },
        { id: 'russian_series', title: 'Наши сериалы', sheet: 'Наши сериалы', type: 'tv' },
        { id: 'tvshows', title: 'Телевизор', sheet: 'Телевизор', type: 'tv' }
    ];

    // Кэш (ID листов и TMDB данные)
    const cache = {
        ids: {},     // sheet -> { data: [id], time: timestamp }
        tmdb: {},    // id_type -> { data: object, time: timestamp }
        setIds(sheet, ids) {
            this.ids[sheet] = { data: ids, time: Date.now() };
        },
        getIds(sheet) {
            const entry = this.ids[sheet];
            if (entry && (Date.now() - entry.time) < 600000) return entry.data; // 10 минут
            return null;
        },
        setTmdb(key, data) {
            this.tmdb[key] = { data: data, time: Date.now() };
        },
        getTmdb(key) {
            const entry = this.tmdb[key];
            if (entry && (Date.now() - entry.time) < 3600000) return entry.data; // 1 час
            return null;
        }
    };

    // ---------------------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------------------
    function parseCSV(csvText) {
        const lines = csvText.split(/\r?\n/);
        const ids = [];
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length > 5 && row[5]) {
                const id = parseInt(row[5].replace(/"/g, '').trim());
                if (!isNaN(id)) ids.push(id);
            }
        }
        return ids;
    }

    // Получение списка TMDB ID из Google Sheets
    function fetchIdsFromSheet(sheetName) {
        return new Promise((resolve, reject) => {
            const cached = cache.getIds(sheetName);
            if (cached) {
                resolve(cached);
                return;
            }

            const url = GS_URL + '?sheet=' + encodeURIComponent(sheetName);
            fetch(url, { method: 'GET', headers: { 'Accept': 'application/json,text/csv' } })
                .then(response => response.text())
                .then(text => {
                    let ids = [];
                    // Пробуем JSON
                    try {
                        const json = JSON.parse(text);
                        if (Array.isArray(json)) {
                            // Массив массивов: каждая строка - массив
                            json.forEach(row => {
                                if (row && row.length > 5 && row[5]) {
                                    const id = parseInt(row[5]);
                                    if (!isNaN(id)) ids.push(id);
                                }
                            });
                        } else if (json.values && Array.isArray(json.values)) {
                            json.values.forEach(row => {
                                if (row && row.length > 5 && row[5]) {
                                    const id = parseInt(row[5]);
                                    if (!isNaN(id)) ids.push(id);
                                }
                            });
                        } else {
                            // Объект с ключами, содержащими F
                            Object.values(json).forEach(item => {
                                if (item && (item.F || item['F'])) {
                                    const id = parseInt(item.F || item['F']);
                                    if (!isNaN(id)) ids.push(id);
                                }
                            });
                        }
                    } catch(e) {
                        // Не JSON - парсим как CSV
                        ids = parseCSV(text);
                    }

                    if (ids.length === 0) {
                        reject(new Error('Не найдено ID в листе ' + sheetName));
                    } else {
                        cache.setIds(sheetName, ids);
                        resolve(ids);
                    }
                })
                .catch(error => reject(error));
        });
    }

    // Загрузка данных фильма/сериала из TMDB
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
                        const film = {
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
                        cache.setTmdb(cacheKey, film);
                        resolve(film);
                    } else {
                        resolve(null);
                    }
                })
                .catch(() => resolve(null));
        });
    }

    // Загрузка полной категории (ID + TMDB данные)
    async function loadCategory(sheetName, type, categoryTitle) {
        Lampa.Notification.show('Загрузка ' + categoryTitle + '...', 3000);
        Lampa.Loader.show();

        try {
            // 1. Получаем ID из таблицы
            const ids = await fetchIdsFromSheet(sheetName);
            if (!ids.length) throw new Error('Нет ID');

            // 2. Загружаем данные из TMDB
            const items = [];
            let loaded = 0;
            const total = ids.length;

            for (const id of ids) {
                const item = await fetchTmdbItem(id, type);
                if (item) items.push(item);
                loaded++;
                if (loaded % 5 === 0 || loaded === total) {
                    Lampa.Notification.show(`Загружено ${loaded} из ${total}`, 1000);
                }
            }

            Lampa.Loader.hide();

            if (items.length === 0) {
                Lampa.Notification.show('Не удалось загрузить контент для ' + categoryTitle, 5000);
                return;
            }

            // 3. Открываем список в Lampa
            Lampa.Activity.push({
                component: 'list',
                data: {
                    items: items,
                    title: categoryTitle,
                    list_type: type === 'movie' ? 'movie' : 'serial'
                }
            });

        } catch (error) {
            Lampa.Loader.hide();
            console.error(error);
            Lampa.Notification.show('Ошибка: ' + (error.message || 'Неизвестная ошибка'), 5000);
        }
    }

    // ---------------------- КОМПОНЕНТ СПИСКА КАТЕГОРИЙ ----------------------
    Lampa.Component.add('v10_v1_categories', {
        template: 'categories',
        data: function() {
            return { categories: CATEGORIES };
        },
        render: function(data) {
            let html = '<div class="v10-v1-categories selector-list" style="padding: 20px;">';
            data.categories.forEach((cat, idx) => {
                html += `<div class="selector-item" data-index="${idx}">${cat.title}</div>`;
            });
            html += '</div>';

            this.dom.html(html);

            // Обработка кликов
            this.dom.find('.selector-item').on('click', (e) => {
                const index = parseInt($(e.currentTarget).data('index'));
                const cat = data.categories[index];
                if (cat) {
                    loadCategory(cat.sheet, cat.type, cat.title);
                }
            });
        }
    });

    // ---------------------- ДОБАВЛЕНИЕ ПУНКТА В ЛЕВОЕ МЕНЮ ----------------------
    function addMenuItem() {
        // Проверяем, не добавлен ли уже
        if ($('.menu .menu__list .menu__item[data-action="v10_v1"]').length) return;

        const menuItem = $(`
            <li data-action="v10_v1" class="menu__item selector">
                <div class="menu__ico">${ICON}</div>
                <div class="menu__text">${PLUGIN_NAME}</div>
            </li>
        `);
        $('.menu .menu__list').eq(0).append(menuItem);

        menuItem.on('hover:enter', function() {
            Lampa.Activity.push({
                title: PLUGIN_NAME,
                component: 'v10_v1_categories'
            });
        });
    }

    // ---------------------- НАСТРОЙКИ (опционально) ----------------------
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'v10_v1_settings',
            name: PLUGIN_NAME,
            icon: ICON
        });

        // Можно добавить настройку для кэша или видимости категорий, но пока оставим минимально
        Lampa.SettingsApi.addParam({
            component: 'v10_v1_settings',
            param: {
                name: 'v10_v1_clear_cache',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Сбросить кэш',
                description: 'Очистить временные данные (ID и TMDB)'
            },
            onChange: function(value) {
                if (value === true || value === 'true') {
                    cache.ids = {};
                    cache.tmdb = {};
                    Lampa.Notification.show('Кэш очищен', 2000);
                    // Сбросить переключатель обратно
                    Lampa.Storage.set('v10_v1_clear_cache', false);
                }
            }
        });
    }

    // ---------------------- ЗАПУСК ПЛАГИНА ----------------------
    function startPlugin() {
        if (window.v10_v1_plugin_started) return;
        window.v10_v1_plugin_started = true;

        addMenuItem();
        addSettings();
    }

    // Ждём готовности Lampa
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
