(function () {
    'use strict';

    var SOURCE_NAME = 'V10';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

    const CACHE_TTL = 3600;
    const CACHE_NAME = 'RUTOR_PLUGIN_CACHE';

    // ================================================================
    //  КАТЕГОРИИ (синхронизированы с worker.js)
    // ================================================================
    var CATEGORIES = [
        { title: 'Топ 24 часа',                  url: 'top24',                method: 'movie' },
        { title: 'Зарубежные фильмы',            url: 'kino',                 method: 'movie' },
        { title: 'Наши фильмы',                  url: 'nashe_kino',           method: 'movie' },
        { title: 'Зарубежные сериалы',           url: 'seriali',              method: 'tv'    },
        { title: 'Русские сериалы',              url: 'nashi_seriali',        method: 'tv'    },
        { title: 'Русские детективные сериалы',  url: 'russian_detective_tv', method: 'tv'    },
        { title: 'Телевизор',                    url: 'televizor',            method: 'tv'    },
        { title: 'Юмор',                         url: 'humor',                method: 'tv'    }
    ];

    // ================================================================
    // RUTOR PLUGIN КАТЕГОРИИ (для внутреннего использования)
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
            itemsPerPage: 15,
            rutorUrl: 'https://rutor.info/search/0/16/010/0/%D0%94%D0%B5%D1%82%D0%B5%D0%BA%D1%82%D0%B8%D0%B2',
            rutorCategory: '',
            maxItems: 30,
            searchPriority: ['Kinopoisk']
        }
    };

    // ================================================================
    //  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
    // ================================================================
    function buildImg(item) {
        if (item.img && item.img.startsWith('http')) return item.img;
        if (item.poster_path) {
            if (item.poster_path.startsWith('http')) return item.poster_path;
            if (item.poster_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.poster_path;
            return TMDB_IMG + item.poster_path;
        }
        return '';
    }

    function buildBg(item) {
        if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
        if (item.backdrop_path) {
            if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
            if (item.backdrop_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.backdrop_path;
            return TMDB_BG + item.backdrop_path;
        }
        return '';
    }

    function detectMediaMethod(item) {
        if (!item) return 'movie';
        if (item.method === 'tv' || item.type === 'tv' || item.number_of_seasons || item.seasons || item.first_air_date) return 'tv';
        return 'movie';
    }

    function normalizeCard(item) {
        var img = buildImg(item);
        var bg  = buildBg(item);
        var posterPath = item.poster_path || '';
        if (posterPath && !posterPath.startsWith('/t/p/') && !posterPath.startsWith('http')) posterPath = '/t/p/w500' + posterPath;
        var backdropPath = item.backdrop_path || '';
        if (backdropPath && !backdropPath.startsWith('/t/p/') && !backdropPath.startsWith('http')) backdropPath = '/t/p/original' + backdropPath;
        var title  = item.title || item.name || '';
        var method = item.method || detectMediaMethod(item);
        return {
            id: item.id,
            title: title,
            name: item.name || title,
            original_title: item.original_title || title,
            overview: item.overview || '',
            poster_path: posterPath,
            backdrop_path: backdropPath,
            img: img,
            background_image: bg,
            vote_average: item.vote_average || 0,
            release_date: item.release_date || '',
            first_air_date: item.first_air_date || '',
            number_of_seasons: item.number_of_seasons || undefined,
            type: method,
            method: method,
            release_quality: item.release_quality || '',
            source: SOURCE_NAME,
            promo_title: item.promo_title || title,
            promo: item.promo || item.overview || ''
        };
    }

    // ================================================================
    //  RUTOR PLUGIN CLASS
    // ================================================================
    class RutorPlugin {
        constructor() {
            this.cache = {};
            this.items = {};
            this.totalPages = {};
        }

        async initialize() {
            try {
                const data = await this._getAllCategoriesData();
                this.items = data.items;
                this.totalPages = data.totalPages;
            } catch (error) {
                console.error('[RutorPlugin] Ошибка инициализации:', error);
            }
        }

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

                // Для детективов — дополнительная фильтрация
                if (categoryKey === 'RUSSIAN_DETECTIVE_SERIES') {
                    items = items.filter(t => /детектив|триллер|криминал/i.test(t));
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
                if (!name) return;

                // Фильтрация по секции
                if (categoryKey === 'TOP_24H' || 
                    !category.rutorCategory || 
                    name.includes(category.rutorCategory) || 
                    el.textContent.includes(category.rutorCategory)) {
                    if (items.length < category.maxItems) {
                        items.push(name);
                    }
                }
            });

            return items;
        }

        async getCardInfo(title, categoryKey) {
            const cat = RUTOR_CATEGORIES[categoryKey] || { searchPriority: ['TMDB'] };
            const isTV = ['RUSSIAN_SERIES', 'RUSSIAN_DETECTIVE_SERIES', 'TV', 'HUMOR', 'FOREIGN_SERIES'].includes(categoryKey);

            for (const api of cat.searchPriority) {
                try {
                    if (api === 'TMDB') {
                        const result = await this._searchInTMDB(title, isTV);
                        if (result) return result;
                    } else if (api === 'Kinopoisk') {
                        const result = await this._searchInKinopoisk(title);
                        if (result) return result;
                    }
                } catch (e) {}
            }
            return null;
        }

        async _searchInTMDB(query, isTV = false) {
            const year = this._extractYear(query);
            const q = year ? `${query.replace(/ \(\d{4}\)/, '')} ${year}` : query;
            const endpoint = isTV ? 'tv' : 'movie';
            const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ru-RU`;

            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data.results?.[0] || null;
        }

        async _searchInKinopoisk(query) {
            const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}`;
            const res = await fetch(url, { headers: { 'X-API-KEY': KINOPOISK_API_KEY } });
            if (!res.ok) return null;
            const data = await res.json();
            return data.films?.[0] || null;
        }

        _extractYear(title) {
            const m = title.match(/\((\d{4})\)/);
            return m ? m[1] : null;
        }

        getItems(category, page = 1) {
            if (!this.items[category]) return [];
            const { itemsPerPage } = RUTOR_CATEGORIES[category];
            const start = (page - 1) * itemsPerPage;
            return this.items[category].slice(start, start + itemsPerPage);
        }

        getTotalPages(category) {
            return this.totalPages[category] || 1;
        }
    }

    // ================================================================
    //  API SERVICE (обращается к worker'у)
    // ================================================================
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self._fetchRaw = function (url, onComplete, onError) {
            self.network.silent(url,
                function (json) {
                    if (!json || !json.results) {
                        onComplete({ results: [], total_pages: 1, page: 1, total_results: 0 });
                        return;
                    }
                    onComplete({
                        results: json.results.map(normalizeCard),
                        page: json.page || 1,
                        total_pages: json.total_pages || 1,
                        total_results: json.total_results || json.results.length
                    });
                },
                function (err) {
                    console.warn('[V10] fetch error:', url, err);
                    if (onError) onError(err);
                    else onComplete({ results: [], total_pages: 1, page: 1, total_results: 0 });
                }
            );
        };

        self.search = function (params, onComplete) {
            var query = (params.query || '').trim();
            if (!query) { onComplete({ results: [] }); return; }
            var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);
            self.network.silent(url,
                function (json) {
                    if (!json || !json.results) { onComplete({ results: [] }); return; }
                    onComplete({ results: json.results.map(normalizeCard), page: json.page || 1, total_pages: json.total_pages || 1 });
                },
                function () { onComplete({ results: [] }); }
            );
        };

        self.category = function (params, onSuccess) {
            var rows = [];
            var total = CATEGORIES.length;
            var done = 0;
            CATEGORIES.forEach(function (cat) {
                var url = WORKER_URL + cat.url + '?page=1&page_size=20';
                self._fetchRaw(url, function (data) {
                    rows.push({
                        title: cat.title,
                        results: data.results,
                        url: cat.url,
                        source: SOURCE_NAME,
                        total_pages: data.total_pages || 1
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

        self.list = function (params, onComplete) {
            var page = params.page || 1;
            var pageSize = params.page_size || 20;
            var catUrl = params.url || 'top24';
            var url = WORKER_URL + catUrl + '?page=' + page + '&page_size=' + pageSize;
            self._fetchRaw(url, function (data) {
                onComplete({
                    results: data.results,
                    page: data.page,
                    total_pages: data.total_pages,
                    total_results: data.total_results
                });
            }, function () {
                onComplete({ results: [], page: 1, total_pages: 1, total_results: 0 });
            });
        };

        self.full = function (params, onSuccess) {
            var card = params.card || params;
            var method = detectMediaMethod(card);
            params.method = method;
            if (card && typeof card === 'object') { card.method = method; card.type = method; }
            var savedImg = params.img || (card && card.img) || '';
            var savedBg = params.background_image || (card && card.background_image) || '';
            var savedQuality = params.release_quality || (card && card.release_quality) || '';

            function fallbackFull(data) {
                data = data || {};
                if (!data.title) data.title = card.title || card.name || '';
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg) data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                data.type = method; data.method = method;
                for (var k in card) { if (card.hasOwnProperty(k) && data[k] === undefined) data[k] = card[k]; }
                onSuccess(data);
            }

            if (!card.id || card.id <= 0 || String(card.id).length < 3) {
                fallbackFull({});
                return;
            }

            Lampa.Api.sources.tmdb.full(params,
                function (data) {
                    if (!data || !data.title) { fallbackFull(data); }
                    else {
                        if (!data.img && savedImg) data.img = savedImg;
                        if (!data.background_image && savedBg) data.background_image = savedBg;
                        if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                        data.type = method; data.method = method;
                        onSuccess(data);
                    }
                },
                function () { fallbackFull({}); }
            );
        };
    }

    // ================================================================
    //  МЕНЮ
    // ================================================================
    function addMenuItem() {
        if ($('.menu__item[data-action=\"v10\"]').length) return;
        var item = $('<li class=\"menu__item selector\" data-action=\"v10\">' +
            '<div class=\"menu__ico\">' +
            '<svg height=\"36\" viewBox=\"0 0 24 24\" width=\"36\" fill=\"currentColor\">' +
            '<path d=\"M12 2L2 8V20H8V14H16V20H22V8L12 2ZM4 10L12 6L20 10V18H17V12H7V18H4V10Z\"/>' +
            '<path d=\"M9 13H15V15H9V13Z\"/>' +
            '</svg></div><div class=\"menu__text\">' + SOURCE_NAME + '</div></li>');
        item.on('hover:enter', function () {
            Lampa.Activity.push({ title: SOURCE_NAME, component: 'category', source: SOURCE_NAME, method: 'category' });
        });
        var $after = $('.menu__list [data-action=\"movie\"], .menu__list [data-action=\"tv\"]').first().parent();
        if ($after.length) $after.after(item);
        else $('.menu__list').append(item);
    }

    // ================================================================
    //  ИНИЦИАЛИЗАЦИЯ
    // ================================================================
    var rutorPlugin = null;

    function init() {
        if (window.v10_plugin_ready) return;
        window.v10_plugin_ready = true;

        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

        rutorPlugin = new RutorPlugin();
        rutorPlugin.initialize().then(() => {
            console.log('[V10] Rutor Plugin инициализирован');
        });

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' || e.type === 'render') setTimeout(addMenuItem, 800);
        });
        setTimeout(addMenuItem, 2000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
