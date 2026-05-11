(function () {

    'use strict';

    /**
     * Конфигурация плагина V10
     */
    var SOURCE_NAME = 'V10';
    var WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev/';
    var REQUEST_TIMEOUT = 30000; // 30 секунд
    var MAX_RETRIES = 2;

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    var TMDB_BG = 'https://image.tmdb.org/t/p/original';

    /**
     * Категории для загрузки контента
     * @type {Array<{title: string, url: string}>}
     */
    var CATEGORIES = [
        { title: 'Топ 24 часа', url: 'top24' },
        { title: 'Зарубежные фильмы', url: 'movies' },
        { title: 'Наши фильмы', url: 'movies_ru' },
        { title: 'Зарубежные сериалы', url: 'tv_shows' },
        { title: 'Русские сериалы', url: 'tv_shows_ru' },
        { title: 'Телевизор', url: 'televizor' },
        { title: 'Юмор', url: 'humor' }
    ];

    /**
     * Проверка, является ли значение валидной строкой URL
     * @param {*} value
     * @returns {boolean}
     */
    function isValidUrl(value) {
        if (typeof value !== 'string') return false;
        return value.startsWith('http://') || value.startsWith('https://');
    }

    /**
     * Безопасное приведение к строке
     * @param {*} value
     * @returns {string}
     */
    function safeString(value) {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return '';
    }

    /**
     * Безопасное получение начального значения URL изображения
     * @param {Object} item - Объект с данными
     * @returns {string} URL изображения или пустая строка
     */
    function buildImg(item) {

        if (!item || typeof item !== 'object') {
            return '';
        }

        // Проверяем img
        if (item.img && isValidUrl(item.img)) {
            return item.img;
        }

        // Проверяем poster_path
        if (item.poster_path) {

            var posterPath = safeString(item.poster_path);

            if (!posterPath) return '';

            if (isValidUrl(posterPath)) {
                return posterPath;
            }

            if (posterPath.startsWith('/t/p/')) {
                return 'https://image.tmdb.org' + posterPath;
            }

            return TMDB_IMG + posterPath;
        }

        return '';
    }

    /**
     * Безопасное получение фонового изображения
     * @param {Object} item - Объект с данными
     * @returns {string} URL фонового изображения или пустая строка
     */
    function buildBg(item) {

        if (!item || typeof item !== 'object') {
            return '';
        }

        // Проверяем background_image
        if (
            item.background_image &&
            isValidUrl(item.background_image)
        ) {
            return item.background_image;
        }

        // Проверяем backdrop_path
        if (item.backdrop_path) {

            var backdropPath = safeString(item.backdrop_path);

            if (!backdropPath) return '';

            if (isValidUrl(backdropPath)) {
                return backdropPath;
            }

            if (backdropPath.startsWith('/t/p/')) {
                return 'https://image.tmdb.org' + backdropPath;
            }

            return TMDB_BG + backdropPath;
        }

        return '';
    }

    /**
     * Определение типа контента (фильм или сериал)
     * @param {Object} item - Объект с данными
     * @returns {string} 'tv' или 'movie'
     */
    function detectMediaMethod(item) {

        if (!item || typeof item !== 'object') {
            return 'movie';
        }

        // Проверяем type и media_type
        if (item.type === 'tv' || item.media_type === 'tv') {
            return 'tv';
        }

        // Безопасная проверка number_of_seasons
        var numSeasons = item.number_of_seasons;
        if (typeof numSeasons === 'number' && numSeasons > 0) {
            return 'tv';
        }

        // Проверяем seasons массив
        if (Array.isArray(item.seasons) && item.seasons.length > 0) {
            return 'tv';
        }

        // Проверяем first_air_date
        if (item.first_air_date) {
            var airDate = safeString(item.first_air_date);
            if (airDate && airDate.length > 3) {
                return 'tv';
            }
        }

        return 'movie';
    }

    /**
     * Нормализация карточки контента
     * @param {Object} item - Исходные данные
     * @returns {Object} Нормализованный объект карточки
     */
    function normalizeCard(item) {

        if (!item || typeof item !== 'object') {
            console.warn('[V10] normalizeCard: invalid item', item);
            return null;
        }

        var img = buildImg(item);
        var bg = buildBg(item);

        // Обработка poster_path
        var posterPath = safeString(item.poster_path || '');
        if (
            posterPath &&
            !posterPath.startsWith('/t/p/') &&
            !isValidUrl(posterPath)
        ) {
            posterPath = '/t/p/w500' + posterPath;
        }

        // Обработка backdrop_path
        var backdropPath = safeString(item.backdrop_path || '');
        if (
            backdropPath &&
            !backdropPath.startsWith('/t/p/') &&
            !isValidUrl(backdropPath)
        ) {
            backdropPath = '/t/p/original' + backdropPath;
        }

        var title = safeString(item.title || item.name || '');
        var type = safeString(item.type || 'movie');
        var method = detectMediaMethod(item);

        // Безопасное получение origin_country
        var originCountry = ['US'];
        if (Array.isArray(item.origin_country) && item.origin_country.length > 0) {
            originCountry = item.origin_country;
        } else if (item.original_language === 'ru') {
            originCountry = ['RU'];
        }

        // Безопасное получение original_language
        var originalLanguage = 'en';
        if (typeof item.original_language === 'string' && item.original_language) {
            originalLanguage = item.original_language;
        } else if (Array.isArray(originCountry) && originCountry[0] === 'RU') {
            originalLanguage = 'ru';
        }

        // Безопасное приведение vote_average
        var voteAverage = 0;
        if (typeof item.vote_average === 'number') {
            voteAverage = item.vote_average;
        } else if (typeof item.vote_average === 'string') {
            var parsed = parseFloat(item.vote_average);
            voteAverage = !isNaN(parsed) ? parsed : 0;
        }

        // Безопасное приведение number_of_seasons
        var numOfSeasons;
        if (typeof item.number_of_seasons === 'number' && item.number_of_seasons > 0) {
            numOfSeasons = item.number_of_seasons;
        }

        return {
            id: item.id || null,
            title: title,
            name: safeString(item.name || title),
            original_title: safeString(item.original_title || title),
            overview: safeString(item.overview || ''),
            poster_path: posterPath,
            backdrop_path: backdropPath,
            img: img,
            background_image: bg,
            vote_average: voteAverage,
            release_date: safeString(item.release_date || ''),
            first_air_date: safeString(item.first_air_date || ''),
            number_of_seasons: numOfSeasons,
            origin_country: originCountry,
            original_language: originalLanguage,
            type: type,
            method: method,
            release_quality: safeString(item.release_quality || ''),
            source: SOURCE_NAME,
            promo_title: safeString(item.promo_title || title),
            promo: safeString(item.promo || item.overview || '')
        };
    }

    /**
     * Фильтрация нормализованных карточек
     * @param {Array} items
     * @returns {Array}
     */
    function filterValidCards(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map(normalizeCard)
            .filter(function (card) {
                return card !== null && card.id;
            });
    }

    /**
     * API сервис для работы с контентом V10
     * @constructor
     */
    function RutorApiService() {

        var self = this;

        // Инициализация сетевого класса с правильным названием
        self.network = (
            Lampa &&
            Lampa.Reguest
        ) ? new Lampa.Reguest() : null;

        if (!self.network) {
            console.error('[V10] RutorApiService: Lampa.Reguest not available');
        }

        /**
         * Валидация URL
         * @param {string} url
         * @returns {boolean}
         */
        function isValidServiceUrl(url) {
            return typeof url === 'string' && (
                url.startsWith('http://') ||
                url.startsWith('https://')
            );
        }

        /**
         * Fetch данных с API
         * @param {string} url
         * @param {Function} onComplete
         * @param {Function} onError
         * @param {number} retries
         */
        self.fetch = function (
            url,
            onComplete,
            onError,
            retries
        ) {

            retries = retries || 0;

            // Валидация параметров
            if (!self.network) {
                console.error('[V10] fetch: network not initialized');
                if (onError) onError(new Error('Network not initialized'));
                else if (onComplete) onComplete([]);
                return;
            }

            if (!isValidServiceUrl(url)) {
                console.error('[V10] fetch: invalid URL', url);
                if (onError) onError(new Error('Invalid URL'));
                else if (onComplete) onComplete([]);
                return;
            }

            if (typeof onComplete !== 'function') {
                console.error('[V10] fetch: onComplete is not a function');
                return;
            }

            self.network.silent(
                url,
                function (json) {

                    if (
                        !json ||
                        typeof json !== 'object'
                    ) {
                        console.warn('[V10] fetch: invalid response', url);
                        onComplete([]);
                        return;
                    }

                    if (!Array.isArray(json.results)) {
                        console.warn('[V10] fetch: no results array', url);
                        onComplete([]);
                        return;
                    }

                    var filtered = filterValidCards(json.results);
                    onComplete(filtered);
                },
                function (err) {

                    console.warn(
                        '[V10] fetch error:',
                        url,
                        err
                    );

                    if (retries < MAX_RETRIES) {
                        console.log('[V10] retrying fetch, attempt', retries + 1);
                        self.fetch(url, onComplete, onError, retries + 1);
                    } else {
                        if (typeof onError === 'function') {
                            onError(err);
                        } else if (typeof onComplete === 'function') {
                            onComplete([]);
                        }
                    }
                }
            );
        };

        /**
         * Поиск контента
         * @param {Object} params
         * @param {Function} onComplete
         */
        self.search = function (
            params,
            onComplete
        ) {

            // Валидация параметров
            if (!params || typeof params !== 'object') {
                console.warn('[V10] search: invalid params');
                if (typeof onComplete === 'function') {
                    onComplete({ results: [] });
                }
                return;
            }

            var query = safeString(params.query || '').trim();

            if (!query) {
                if (typeof onComplete === 'function') {
                    onComplete({ results: [] });
                }
                return;
            }

            if (!isValidServiceUrl(WORKER_URL)) {
                console.error('[V10] search: invalid WORKER_URL');
                if (typeof onComplete === 'function') {
                    onComplete({ results: [] });
                }
                return;
            }

            var url = WORKER_URL +
                'search?query=' +
                encodeURIComponent(query);

            self.network.silent(
                url,
                function (json) {

                    if (
                        !json ||
                        typeof json !== 'object'
                    ) {
                        console.warn('[V10] search: invalid response');
                        if (typeof onComplete === 'function') {
                            onComplete({ results: [] });
                        }
                        return;
                    }

                    if (!Array.isArray(json.results)) {
                        console.warn('[V10] search: no results array');
                        if (typeof onComplete === 'function') {
                            onComplete({ results: [] });
                        }
                        return;
                    }

                    var filtered = filterValidCards(json.results);

                    if (typeof onComplete === 'function') {
                        onComplete({
                            results: filtered,
                            page: json.page || 1,
                            total_pages: json.total_pages || 1
                        });
                    }
                },
                function (err) {

                    console.warn('[V10] search error:', err);

                    if (typeof onComplete === 'function') {
                        onComplete({ results: [] });
                    }
                }
            );
        };

        /**
         * Загрузка категорий
         * @param {Object} params
         * @param {Function} onSuccess
         */
        self.category = function (
            params,
            onSuccess
        ) {

            if (typeof onSuccess !== 'function') {
                console.error('[V10] category: onSuccess is not a function');
                return;
            }

            var rows = [];
            var total = CATEGORIES.length;
            var done = 0;

            CATEGORIES.forEach(function (cat) {

                if (!cat || !cat.url) {
                    console.warn('[V10] category: invalid category', cat);
                    done++;
                    if (done === total) {
                        onSuccess(rows);
                    }
                    return;
                }

                var url = WORKER_URL +
                    cat.url +
                    '?page=1&page_size=25';

                self.fetch(
                    url,
                    function (items) {

                        rows.push({
                            title: safeString(cat.title),
                            results: Array.isArray(items) ? items : [],
                            url: cat.url,
                            source: SOURCE_NAME
                        });

                        done++;

                        if (done === total) {

                            // Сортировка по исходному порядку категорий
                            rows.sort(function (a, b) {

                                var ia = CATEGORIES.findIndex(
                                    function (c) {
                                        return c.url === a.url;
                                    }
                                );

                                var ib = CATEGORIES.findIndex(
                                    function (c) {
                                        return c.url === b.url;
                                    }
                                );

                                return ia - ib;
                            });

                            onSuccess(rows);
                        }
                    },
                    function (err) {
                        console.warn('[V10] category fetch error:', cat.url, err);
                        done++;
                        if (done === total) {
                            onSuccess(rows);
                        }
                    }
                );
            });
        };

        /**
         * Загрузка списка контента с пагинацией
         * @param {Object} params
         * @param {Function} onComplete
         */
        self.list = function (
            params,
            onComplete
        ) {

            // Валидация параметров
            if (!params || typeof params !== 'object') {
                console.warn('[V10] list: invalid params');
                if (typeof onComplete === 'function') {
                    onComplete({ results: [] });
                }
                return;
            }

            if (typeof onComplete !== 'function') {
                console.error('[V10] list: onComplete is not a function');
                return;
            }

            var page = Math.max(1, parseInt(params.page) || 1);
            var pageSize = Math.max(1, Math.min(100, parseInt(params.page_size) || 25));
            var listUrl = safeString(params.url || '');

            if (!listUrl) {
                console.warn('[V10] list: missing url');
                onComplete({ results: [] });
                return;
            }

            if (!isValidServiceUrl(WORKER_URL)) {
                console.error('[V10] list: invalid WORKER_URL');
                onComplete({ results: [] });
                return;
            }

            var url = WORKER_URL +
                listUrl +
                '?page=' + page +
                '&page_size=' + pageSize;

            self.network.silent(
                url,
                function (json) {

                    if (
                        !json ||
                        typeof json !== 'object'
                    ) {
                        console.warn('[V10] list: invalid response');
                        onComplete({ results: [] });
                        return;
                    }

                    if (!Array.isArray(json.results)) {
                        console.warn('[V10] list: no results array');
                        onComplete({ results: [] });
                        return;
                    }

                    var filtered = filterValidCards(json.results);

                    onComplete({
                        results: filtered,
                        page: json.page || page,
                        total_pages: json.total_pages || 1,
                        total_results: json.total_results ||
                            json.results.length
                    });
                },
                function (err) {

                    console.warn('[V10] list error:', err);
                    onComplete({ results: [] });
                }
            );
        };

        /**
         * Получение полной информации о контенте
         * @param {Object} params
         * @param {Function} onSuccess
         */
        self.full = function (
            params,
            onSuccess
        ) {

            // Валидация параметров
            if (!params || typeof params !== 'object') {
                console.warn('[V10] full: invalid params');
                if (typeof onSuccess === 'function') {
                    onSuccess({});
                }
                return;
            }

            if (typeof onSuccess !== 'function') {
                console.error('[V10] full: onSuccess is not a function');
                return;
            }

            var card = params.card || params;

            if (!card || typeof card !== 'object') {
                console.warn('[V10] full: invalid card');
                onSuccess({});
                return;
            }

            var method = detectMediaMethod(card);
            params.method = method;

            if (card && typeof card === 'object') {
                card.method = method;
                card.type = method;
            }

            var savedImg = safeString(params.img || (card && card.img) || '');
            var savedBg = safeString(params.background_image || (card && card.background_image) || '');
            var savedQuality = safeString(params.release_quality || (card && card.release_quality) || '');

            /**
             * Fallback функция при ошибке получения полной информации
             * @param {Object} data
             */
            function fallbackFull(data) {

                data = data || {};

                if (!data.title) {
                    data.title = safeString(card.title || card.name || '');
                }

                if (!data.img && savedImg) {
                    data.img = savedImg;
                }

                if (!data.background_image && savedBg) {
                    data.background_image = savedBg;
                }

                if (!data.release_quality && savedQuality) {
                    data.release_quality = savedQuality;
                }

                data.type = method;
                data.method = method;

                var originCountry = ['US'];
                if (Array.isArray(data.origin_country) && data.origin_country.length > 0) {
                    originCountry = data.origin_country;
                } else if (Array.isArray(card.origin_country) && card.origin_country.length > 0) {
                    originCountry = card.origin_country;
                } else if (data.original_language === 'ru' || card.original_language === 'ru') {
                    originCountry = ['RU'];
                }

                data.origin_country = originCountry;

                var originalLanguage = 'en';
                if (typeof data.original_language === 'string' && data.original_language) {
                    originalLanguage = data.original_language;
                } else if (typeof card.original_language === 'string' && card.original_language) {
                    originalLanguage = card.original_language;
                }

                data.original_language = originalLanguage;

                // Копирование свойств карточки в data, если они отсутствуют
                for (var k in card) {

                    if (
                        card.hasOwnProperty(k) &&
                        data[k] === undefined
                    ) {
                        data[k] = card[k];
                    }
                }

                onSuccess(data);
            }

            // Проверка валидности ID
            var cardId = card.id;
            if (!cardId || cardId <= 0 || String(cardId).length < 1) {
                fallbackFull({});
                return;
            }

            // Попытка получить полную информацию из TMDB
            if (
                Lampa &&
                Lampa.Api &&
                Lampa.Api.sources &&
                typeof Lampa.Api.sources.tmdb === 'object' &&
                typeof Lampa.Api.sources.tmdb.full === 'function'
            ) {

                Lampa.Api.sources.tmdb.full(

                    params,

                    function (data) {

                        if (!data || typeof data !== 'object') {
                            fallbackFull(data);
                            return;
                        }

                        if (!data.title) {
                            fallbackFull(data);
                            return;
                        }

                        // Восстановление сохраненных данных
                        if (!data.img && savedImg) {
                            data.img = savedImg;
                        }

                        if (!data.background_image && savedBg) {
                            data.background_image = savedBg;
                        }

                        if (!data.release_quality && savedQuality) {
                            data.release_quality = savedQuality;
                        }

                        data.type = method;
                        data.method = method;

                        var originCountry = Array.isArray(data.origin_country) && data.origin_country.length > 0
                            ? data.origin_country
                            : ['US'];

                        var originalLanguage = typeof data.original_language === 'string' && data.original_language
                            ? data.original_language
                            : 'en';

                        data.origin_country = originCountry;
                        data.original_language = originalLanguage;

                        onSuccess(data);
                    },

                    function (err) {
                        console.warn('[V10] full TMDB error:', err);
                        fallbackFull({});
                    }
                );

            } else {

                console.warn('[V10] full: Lampa.Api.sources.tmdb.full not available');
                fallbackFull({});
            }
        };
    }

    // Регистрация плагина в Lampa
    if (
        typeof Lampa !== 'undefined' &&
        Lampa &&
        Lampa.Api &&
        Lampa.Api.sources &&
        typeof Lampa.Api.sources.define === 'function'
    ) {

        Lampa.Api.sources.define(SOURCE_NAME, new RutorApiService());

    } else {

        console.error('[V10] Lampa API not available');
    }

})();
