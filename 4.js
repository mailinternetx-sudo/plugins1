(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    const CACHE_TTL = 3600; // 1 час в секундах
    const CACHE_NAME = 'RUTOR_PLUGIN_CACHE';
    const TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    const KINOPOISK_API_KEY = 'JVGPMHQ-40AMAHD-MG87Z21-R490RWA';

    // ================================================================
    //  КАТЕГОРИИ
    // ================================================================
    var CATEGORIES = [
        { title: 'Топ 24 часа',                  url: 'top24',                method: 'movie' },
        { title: 'Зарубежные фильмы',            url: 'movies',               method: 'movie' },
        { title: 'Наши фильмы',                  url: 'movies_ru',            method: 'movie' },
        { title: 'Зарубежные сериалы',           url: 'tv_shows',             method: 'tv'    },
        { title: 'Русские сериалы',              url: 'tv_shows_ru',          method: 'tv'    },
        { title: 'Русские детективные сериалы',  url: 'russian_detective_tv', method: 'tv'    },
        { title: 'Телевизор',                    url: 'televizor',            method: 'tv'    },
        { title: 'Юмор',                         url: 'humor',                method: 'tv'    }
    ];

    // ================================================================
    //  RUTOR PLUGIN КАТЕГОРИИ
    // ================================================================
    const RUTOR_CATEGORIES = {
        TOP_24H: {
            name: 'Топ 24 часа',
            itemsPerPage: 25,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Топ торренты за последние 24 часа',
            maxItems: 25,
            searchPriority: ['TMDB']
        },
        OUR_MOVIES: {
            name: 'Наши фильмы',
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Самые популярные торренты в категории Наши фильмы',
            maxItems: 15,
            searchPriority: ['Kinopoisk', 'TMDB']
        },
        RUSSIAN_SERIES: {
            name: 'Русские сериалы',
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Самые популярные торренты в категории Наши сериалы',
            maxItems: 15,
            searchPriority: ['Kinopoisk', 'TMDB']
        },
        FOREIGN_SERIES: {
            name: 'Зарубежные сериалы',
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Самые популярные торренты в категории Зарубежные сериалы',
            maxItems: 15,
            searchPriority: ['TMDB', 'Kinopoisk']
        },
        TV: {
            name: 'Телевизор',
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Самые популярные торренты в категории Телевизор',
            maxItems: 15,
            searchPriority: ['Kinopoisk']
        },
        HUMOR: {
            name: 'Юмор',
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/top',
            rutorCategory: 'Самые популярные торренты в категории Юмор',
            maxItems: 15,
            searchPriority: ['Kinopoisk']
        },
        RUSSIAN_DETECTIVE_SERIES: {
            name: 'Русские детективные сериалы',
            itemsPerPage: 20,
            rutorUrl: 'https://rutor.info/search/0/16/010/0/%D0%94%D0%B5%D1%82%D0%B5%D0%BA%D1%82%D0%B8%D0%B2',
            rutorCategory: '',
            maxItems: 40,
            searchPriority: ['Kinopoisk']
        }
    };

    // ================================================================
    //  RUTOR PLUGIN CLASS
    // ================================================================
    class RutorPlugin {
        constructor() {
            this.cache = {};
            this.items = {};
            this.totalPages = {};
        }

        // Инициализация плагина
        async initialize() {
            try {
                const data = await this._getAllCategoriesData();
                this.items = data.items;
                this.totalPages = data.totalPages;
                console.log('[V10] Rutor Plugin успешно инициализирован');
            } catch (error) {
                console.error('[RutorPlugin] Ошибка инициализации:', error);
            }
        }

        // Получение данных всех категорий
        async _getAllCategoriesData() {
            const data = { items: {}, totalPages: {} };
            for (const [key, category] of Object.entries(RUTOR_CATEGORIES)) {
                try {
                    const categoryData = await this._getCategoryData(key, category);
                    data.items[key] = categoryData.items;
                    data.totalPages[key] = categoryData.totalPages;
                } catch (error) {
                    console.error(`[RutorPlugin] Ошибка категории ${key}:`, error);
                    data.items[key] = [];
                    data.totalPages[key] = 1;
                }
            }
            return data;
        }

        // Получение данных для одной категории
        async _getCategoryData(categoryKey, category) {
            const cacheKey = `rutor_${categoryKey}`;

            if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < CACHE_TTL * 1000) {
                return this.cache[cacheKey].data;
            }

            try {
                const response = await fetch(category.rutorUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();

                let items = this._extractCategoryItems(html, category, categoryKey);

                if (categoryKey === 'RUSSIAN_DETECTIVE_SERIES') {
                    items = items.filter(t => /детектив|триллер|криминал|расследование/i.test(t));
                }

                const totalPages = Math.ceil(items.length / category.itemsPerPage);
                const result = { items, totalPages };

                this.cache[cacheKey] = { data: result, timestamp: Date.now() };
                return result;
            } catch (error) {
                console.error(`[RutorPlugin] Ошибка загрузки ${categoryKey}:`, error);
                return { items: [], totalPages: 1 };
            }
        }

        // Извлечение элементов категории из HTML
        _extractCategoryItems(html, category, categoryKey) {
            const items = [];
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('table.tor-top tr, table.tor-t tr');

            rows.forEach((el, i) => {
                if (i === 0) return;
                const nameCell = el.querySelector('td:nth-child(2) a');
                if (!nameCell) return;

                const name = nameCell.textContent.trim();
                if (name.length < 3) return;

                if (categoryKey === 'TOP_24H' || !category.rutorCategory || 
                    el.textContent.includes(category.rutorCategory)) {
                    if (items.length < category.maxItems) {
                        items.push(name);
                    }
                }
            });

            return items;
        }

        // Поиск в TMDB API
        async _searchInTMDB(query, isTV = false) {
            const year = this._extractYear(query);
            const q = year ? query.replace(/ \(\d{4}\)/, '') + ' ' + year : query;
            const endpoint = isTV ? 'tv' : 'movie';
            const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`;

            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return data.results?.[0] || null;
            } catch (e) {
                return null;
            }
        }

        // Поиск в Kinopoisk API
        async _searchInKinopoisk(query) {
            const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}`;

            try {
                const res = await fetch(url, { headers: { 'X-API-KEY': KINOPOISK_API_KEY } });
                if (!res.ok) return null;
                const data = await res.json();
                return data.films?.[0] || null;
            } catch (e) {
                return null;
            }
        }

        // Получение информации о карточке
        async getCardInfo(title, categoryKey) {
            const cat = RUTOR_CATEGORIES[categoryKey] || { searchPriority: ['TMDB'] };
            const isTV = ['RUSSIAN_SERIES', 'RUSSIAN_DETECTIVE_SERIES', 'TV', 'HUMOR', 'FOREIGN_SERIES'].includes(categoryKey);

            for (const api of cat.searchPriority) {
                try {
                    let result = null;
                    if (api === 'TMDB') {
                        result = await this._searchInTMDB(title, isTV);
                    } else if (api === 'Kinopoisk') {
                        result = await this._searchInKinopoisk(title);
                    }
                    if (result) return result;
                } catch (e) {}
            }

            return null;
        }

        // Извлечение года из названия
        _extractYear(title) {
            const m = title.match(/\((\d{4})\)/);
            return m ? m[1] : null;
        }

        // Получение элементов категории с пагинацией
        getItems(category, page = 1) {
            if (!this.items[category]) return [];
            const { itemsPerPage } = RUTOR_CATEGORIES[category];
            const start = (page - 1) * itemsPerPage;
            return this.items[category].slice(start, start + itemsPerPage);
        }

        // Получение общего количества страниц для категории
        getTotalPages(category) {
            return this.totalPages[category] || 1;
        }
    }

    // ================================================================
    //  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
    // ================================================================
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            return item.poster_path.startsWith('http') ? item.poster_path : TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            return item.backdrop_path.startsWith('http') ? item.backdrop_path : TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    // ================================================================
    //  ОПРЕДЕЛЕНИЕ ТИПА
    // ================================================================
    function detectMediaMethod(item) {
        if (!item) return 'movie';
        return (item.method === 'tv' || item.type === 'tv' || item.number_of_seasons || item.first_air_date) ? 'tv' : 'movie';
    }

    // ================================================================
    //  NORMALIZE
    // ================================================================
    function normalizeCard(item) {
        const method = item.method || detectMediaMethod(item);

        return {
            id: item.id,
            title: item.title || item.name || '',
            name: item.name || item.title || '',
            original_title: item.original_title || '',
            overview: item.overview || '',
            poster_path: item.poster_path || '',
            backdrop_path: item.backdrop_path || '',
            img: buildImg(item),
            background_image: buildBg(item),
            vote_average: item.vote_average || 0,
            release_date: item.release_date || '',
            first_air_date: item.first_air_date || '',
            number_of_seasons: item.number_of_seasons,
            type: method,
            method: method,
            release_quality: item.release_quality || '',
            source: SOURCE_NAME,
            promo_title: item.title || item.name || '',
            promo: item.overview || ''
        };
    }

    // ================================================================
    //  API SERVICE
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.search = function (params, onComplete) {
            var query = (params.query || '').trim();
            if (!query) return onComplete({ results: [] });

            self.network.silent(
                WORKER_URL + 'search?query=' + encodeURIComponent(query),
                json => onComplete({ results: (json.results || []).map(normalizeCard) }),
                () => onComplete({ results: [] })
            );
        };

        self.category = function (params, onSuccess) {
            var rows = [], done = 0, total = CATEGORIES.length;

            CATEGORIES.forEach(cat => {
                self.network.silent(
                    WORKER_URL + cat.url + '?page=1&page_size=20',
                    data => {
                        rows.push({
                            title: cat.title,
                            results: (data.results || []).map(normalizeCard),
                            url: cat.url,
                            source: SOURCE_NAME,
                            total_pages: data.total_pages || 1
                        });
                        done++;
                        if (done === total) {
                            onSuccess(rows.sort((a, b) => 
                                CATEGORIES.findIndex(c => c.url === a.url) - 
                                CATEGORIES.findIndex(c => c.url === b.url)
                            ));
                        }
                    }
                );
            });
        };

        self.list = function (params, onComplete) {
            var page = params.page || 1;
            var pageSize = params.page_size || 30;
            var catUrl = params.url || 'top24';

            self.network.silent(
                WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize,
                data => onComplete({
                    results: (data.results || []).map(normalizeCard),
                    page: data.page,
                    total_pages: data.total_pages,
                    total_results: data.total_results
                }),
                () => onComplete({ results: [], page: 1, total_pages: 1 })
            );
        };

        self.full = function (params, onSuccess) {
            Lampa.Api.sources.tmdb.full(params, onSuccess, () => onSuccess(params.card || params));
        };
    }

    // ================================================================
    //  MENU
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action="v10"]').length) return;

        var item = $(`<li class="menu__item selector" data-action="v10">
            <div class="menu__ico">
                <svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">
                    <path d="M12 2L2 8V20H8V14H16V20H22V8L12 2ZM4 10L12 6L20 10V18H17V12H7V18H4V10Z"/>
                    <path d="M9 13H15V15H9V13Z"/>
                </svg>
            </div>
            <div class="menu__text">${SOURCE_NAME}</div>
        </li>`);

        item.on('hover:enter', () => {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                method: 'category'
            });
        });

        var after = $('.menu__list [data-action="movie"], .menu__list [data-action="tv"]').first().parent();
        after ? after.after(item) : $('.menu__list').append(item);
    }

    // ================================================================
    // INIT
    // ================================================================
    var rutorPlugin = null;

    function init() {
        if (window.v10_plugin_ready) return;
        window.v10_plugin_ready = true;

        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

        rutorPlugin = new RutorPlugin();
        rutorPlugin.initialize();

        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready' || e.type === 'render') {
                setTimeout(addMenuItem, 1000);
            }
        });

        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') {
                init();
            }
        });
    }
})();
