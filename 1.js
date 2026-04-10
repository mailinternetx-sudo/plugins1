(function(){
    /**
     * Плагин V10 v1 для Lampa WebOS
     * Добавляет пункт меню с категориями из Google Sheets
     * Данные TMDB загружаются по ID из колонки F
     */

    // Ждём готовности Lampa
    function init() {
        if (typeof Lampa === 'undefined') {
            setTimeout(init, 100);
            return;
        }

        // ---------------------- КОНСТАНТЫ ----------------------
        const GS_URL = 'https://script.google.com/macros/s/AKfycbyjSGRPjqyn3FgfmnMI9H9Y9X8fuDkDqj7nBSvdip6d6Orwe9fqIS_3OcVNB9UMiHBm/exec';
        const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
        const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

        // Список категорий
        const categories = [
            { title: 'Топ торренты за последние 24 часа', sheet: 'Топ 24ч', type: 'movie' },
            { title: 'Зарубежные фильмы', sheet: 'Зарубежные фильмы', type: 'movie' },
            { title: 'Наши фильмы', sheet: 'Наши фильмы', type: 'movie' },
            { title: 'Зарубежные сериалы', sheet: 'Зарубежные сериалы', type: 'tv' },
            { title: 'Наши сериалы', sheet: 'Наши сериалы', type: 'tv' },
            { title: 'Телевизор', sheet: 'Телевизор', type: 'tv' }
        ];

        // Кэш для ID (сохраняем на 10 минут)
        const cache = {
            ids: {},
            tmdb: {},
            setIds: function(sheet, ids) {
                this.ids[sheet] = { data: ids, time: Date.now() };
            },
            getIds: function(sheet) {
                const entry = this.ids[sheet];
                if (entry && (Date.now() - entry.time) < 600000) return entry.data;
                return null;
            },
            setTmdb: function(id, data) {
                this.tmdb[id] = { data: data, time: Date.now() };
            },
            getTmdb: function(id) {
                const entry = this.tmdb[id];
                if (entry && (Date.now() - entry.time) < 3600000) return entry.data;
                return null;
            }
        };

        // ---------------------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------------------
        // Парсинг CSV (если скрипт вернёт CSV вместо JSON)
        function parseCSV(csvText) {
            const lines = csvText.split(/\r?\n/);
            const result = [];
            for (let i = 1; i < lines.length; i++) { // пропускаем заголовок
                const row = lines[i].split(',');
                if (row.length > 5 && row[5]) {
                    const id = parseInt(row[5].replace(/"/g, ''));
                    if (!isNaN(id)) result.push(id);
                }
            }
            return result;
        }

        // Получение списка TMDB ID из Google Sheets
        function fetchIdsFromSheet(sheetName) {
            return new Promise((resolve, reject) => {
                // Проверяем кэш
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
                        // Пытаемся распарсить JSON
                        try {
                            const json = JSON.parse(text);
                            if (Array.isArray(json)) {
                                // Массив массивов
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
                                // Массив объектов с ключом F
                                Object.values(json).forEach(item => {
                                    if (item && (item.F || item['F'])) {
                                        const id = parseInt(item.F || item['F']);
                                        if (!isNaN(id)) ids.push(id);
                                    }
                                });
                            }
                        } catch(e) {
                            // Не JSON – пробуем CSV
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
                const cached = cache.getTmdb(id + '_' + type);
                if (cached) {
                    resolve(cached);
                    return;
                }

                const endpoint = type === 'movie' ? 'movie/' + id : 'tv/' + id;
                const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&language=ru-RU`;
                fetch(url)
                    .then(res => res.json())
                    .then(item => {
                        if (item && !item.status_code) {
                            const film = {
                                id: item.id,
                                title: item.title || item.name,
                                original_title: item.original_title || item.original_name,
                                poster: item.poster_path ? TMDB_IMG_BASE + item.poster_path : null,
                                year: (item.release_date || item.first_air_date || '').substring(0, 4),
                                description: item.overview,
                                type: type
                            };
                            cache.setTmdb(id + '_' + type, film);
                            resolve(film);
                        } else {
                            resolve(null);
                        }
                    })
                    .catch(() => resolve(null));
            });
        }

        // Загрузка полной категории (ID + TMDB данные)
        async function loadCategory(sheetName, type, title) {
            Lampa.Notification.show('Загрузка ' + title + '...', 3000);
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
                    // Обновляем прогресс каждые 5 элементов
                    if (loaded % 5 === 0 || loaded === total) {
                        Lampa.Notification.show(`Загружено ${loaded} из ${total}`, 1000);
                    }
                }

                Lampa.Loader.hide();

                if (items.length === 0) {
                    Lampa.Notification.show('Не удалось загрузить контент для ' + title, 5000);
                    return;
                }

                // 3. Открываем список в Lampa
                // Используем стандартный компонент 'list' с массивом items
                Lampa.Activity.push({
                    component: 'list',
                    data: {
                        items: items,
                        title: title,
                        list_type: type === 'movie' ? 'movie' : 'serial'
                    }
                });

            } catch (error) {
                Lampa.Loader.hide();
                console.error(error);
                Lampa.Notification.show('Ошибка: ' + (error.message || 'Неизвестная ошибка'), 5000);
            }
        }

        // ---------------------- КОМПОНЕНТ КАТЕГОРИЙ ----------------------
        Lampa.Component.add('v10_v1_categories', {
            template: 'categories',
            data: function() {
                return { categories: categories };
            },
            render: function(data) {
                // Генерируем HTML
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

        // ---------------------- ДОБАВЛЕНИЕ ПУНКТА В МЕНЮ ----------------------
        Lampa.Menu.add({
            title: 'V10 v1',
            icon: 'video_library',
            component: 'v10_v1_categories'
        });
    }

    // Запуск плагина
    init();
})();
