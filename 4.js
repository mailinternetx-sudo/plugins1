/**
 * RutorParser Plugin for Lampa Framework (WebOS)
 * Источник: rutor.info / new-rutor.org
 * Интеграция: TMDB API для метаданных
 * 
 * ⚠️ ВНИМАНИЕ: Замените TMDB_API_KEY на ваш новый ключ!
 */
(function () {
    'use strict';

    // ==================== ГЛОБАЛЬНЫЕ КОНСТАНТЫ ====================
    var PLUGIN_VERSION = '1.0.0';
    var DEFAULT_SOURCE_NAME = 'RutorParser';
    var SOURCE_NAME = Lampa.Storage.get('rutorparser_source_name', DEFAULT_SOURCE_NAME);
    
    // Базовые URL (можно менять на зеркала)
    var RUTOR_BASE = 'https://new-rutor.org';
    var RUTOR_MIRROR = 'https://rutor.info';
    var TMDB_BASE = 'https://api.themoviedb.org/3';
    
    // ⚠️ ЗАМЕНИТЕ НА ВАШ НОВЫЙ КЛЮЧ!
    var TMDB_API_KEY = 'f348b4586d1791a40d99edd92164cb86';
    
    // Кэширование
    var TMDB_CACHE_TTL = 3600000; // 1 час в миллисекундах
    var REQUEST_TIMEOUT = 15000; // 15 секунд
    
    // Иконка плагина (SVG)
    var PLUGIN_ICON = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="60" fill="#1a1a2e"/><path d="M256 80c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176S353.2 80 256 80zm0 288c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" fill="#e94560"/><polygon points="200,180 200,332 340,256" fill="#e94560"/></svg>';
    
    // Настройки по умолчанию
    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('rutorparser_min_progress', DEFAULT_MIN_PROGRESS);

    // ==================== КАТЕГОРИИ ====================
    var CATEGORIES = {
        top_24h: {
            key: 'top_24h',
            title: '🔥 Топ за 24 часа',
            rutorUrl: '/top',
            rutorCategoryId: null,
            enabled: Lampa.Storage.get('rutorparser_top_24h_enabled', true)
        },
        foreign_movies: {
            key: 'foreign_movies',
            title: '🎬 Зарубежные фильмы',
            rutorUrl: '/browse/0/1/0/0',
            rutorCategoryId: 1,
            enabled: Lampa.Storage.get('rutorparser_foreign_movies_enabled', true)
        },
        russian_movies: {
            key: 'russian_movies',
            title: '🇷🇺 Наши фильмы',
            rutorUrl: '/browse/0/2/0/0',
            rutorCategoryId: 2,
            enabled: Lampa.Storage.get('rutorparser_russian_movies_enabled', true)
        },
        foreign_series: {
            key: 'foreign_series',
            title: '📺 Зарубежные сериалы',
            rutorUrl: '/browse/0/3/0/0',
            rutorCategoryId: 3,
            enabled: Lampa.Storage.get('rutorparser_foreign_series_enabled', true)
        },
        russian_series: {
            key: 'russian_series',
            title: '🇷🇺 Наши сериалы',
            rutorUrl: '/browse/0/4/0/0',
            rutorCategoryId: 4,
            enabled: Lampa.Storage.get('rutorparser_russian_series_enabled', true)
        },
        tv_shows: {
            key: 'tv_shows',
            title: '📡 Телевизор',
            rutorUrl: '/browse/0/5/0/0',
            rutorCategoryId: 5,
            enabled: Lampa.Storage.get('rutorparser_tv_shows_enabled', true)
        }
    };

    var CATEGORY_ORDER = ['top_24h', 'foreign_movies', 'russian_movies', 'foreign_series', 'russian_series', 'tv_shows'];

    // ==================== ГЛОБАЛЬНЫЙ КЭШ ====================
    var globalCache = {
        tmdb: {},
        rutor: {},
        magnets: {}
    };

    // ==================== УТИЛИТЫ ====================
    
    /**
     * Безопасный запрос к API с таймаутом и обработкой ошибок
     */
    function apiRequest(url, onSuccess, onError, useTmdbKey) {
        var fullUrl = url;
        if (useTmdbKey && url.indexOf('api_key=') === -1) {
            fullUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'api_key=' + TMDB_API_KEY;
        }
        
        var request = new Lampa.Reguest();
        var timeoutId = setTimeout(function() {
            request.abort && request.abort();
            onError && onError(new Error('Request timeout'));
        }, REQUEST_TIMEOUT);
        
        request.silent(fullUrl, function(response) {
            clearTimeout(timeoutId);
            if (response && typeof response === 'object') {
                onSuccess && onSuccess(response);
            } else {
                onError && onError(new Error('Invalid response'));
            }
        }, function(error) {
            clearTimeout(timeoutId);
            onError && onError(error);
        });
        
        return request;
    }

    /**
     * Парсинг заголовка торрента
     * Пример: "Союз / The Union (2024) WEB-DL 1080p от New-Team | D"
     */
    function parseTorrentTitle(rawTitle) {
        var result = {
            ruTitle: '',
            enTitle: '',
            year: null,
            quality: '',
            cleanTitle: ''
        };

        if (!rawTitle || typeof rawTitle !== 'string') return result;

        // Извлечение года
        var yearMatch = rawTitle.match(/\((\d{4})\)/);
        if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
        }

        // Извлечение качества
        var qualityPatterns = [
            /(?:2160p|4K|UHD)[^\|]*/i,
            /(?:1080p|720p|480p)[^\|]*/i,
            /(?:WEB-DL|WEBRip|BDRip|HDRip|HDTV|DVDRip|BluRay)[^\|]*/i
        ];
        for (var i = 0; i < qualityPatterns.length; i++) {
            var qMatch = rawTitle.match(qualityPatterns[i]);
            if (qMatch) {
                result.quality = qMatch[0].trim().split(' ')[0];
                break;
            }
        }

        // Разделение русского и английского названия
        if (rawTitle.indexOf('/') !== -1) {
            var parts = rawTitle.split('/');
            result.ruTitle = parts[0].trim().split('(')[0].trim();
            if (parts[1]) {
                result.enTitle = parts[1].trim().split('(')[0].trim().split(' ')[0];
            }
        } else {
            result.ruTitle = rawTitle.split('(')[0].trim();
        }

        // Очистка от служебных пометок
        var cleanPatterns = [/\s*\[.*?\]/g, /\s*\(.*?\)/g, /\s*\|.*$/g, /\s*от\s+.*$/i];
        result.cleanTitle = result.ruTitle || result.enTitle;
        for (var j = 0; j < cleanPatterns.length; j++) {
            result.cleanTitle = result.cleanTitle.replace(cleanPatterns[j], '');
        }
        result.cleanTitle = result.cleanTitle.trim();

        return result;
    }

    /**
     * Определение типа контента (movie/series)
     */
    function detectContentType(title, rutorCategoryId) {
        var tvPatterns = [
            /\[S\d+\]/i, /\[Season\s*\d+\]/i, /сезон/i, /серия/i,
            /season/i, /episode/i, /\d+x\d+/i, /s\d+e\d+/i
        ];
        
        var isTV = false;
        for (var i = 0; i < tvPatterns.length; i++) {
            if (tvPatterns[i].test(title)) {
                isTV = true;
                break;
            }
        }
        
        // Категории 3,4,5 = сериалы/ТВ на rutor
        if ([3, 4, 5].indexOf(rutorCategoryId) !== -1) {
            isTV = true;
        }
        
        return isTV ? 'tv' : 'movie';
    }

    /**
     * Конвертация размера в байты
     */
    function parseSize(sizeStr) {
        if (!sizeStr) return 0;
        var match = sizeStr.match(/([\d.,]+)\s*(GB|MB|TB|KB)/i);
        if (!match) return 0;
        
        var value = parseFloat(match[1].replace(',', '.'));
        var unit = match[2].toUpperCase();
        
        switch(unit) {
            case 'TB': return value * 1024 * 1024 * 1024 * 1024;
            case 'GB': return value * 1024 * 1024 * 1024;
            case 'MB': return value * 1024 * 1024;
            case 'KB': return value * 1024;
            default: return 0;
        }
    }

    /**
     * Генерация уникального хэша для кэша
     */
    function generateCacheKey(type, title, year) {
        return type + '_' + (title || '').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + (year || '0');
    }

    // ==================== TMDB ИНТЕГРАЦИЯ ====================
    
    /**
     * Поиск фильма/сериала в TMDB
     */
    function searchTMDB(title, year, type, callback) {
        if (!title || !TMDB_API_KEY || TMDB_API_KEY === 'ВАШ_НОВЫЙ_TMDB_API_КЛЮЧ') {
            callback && callback(null);
            return;
        }

        var cacheKey = generateCacheKey(type, title, year);
        var cached = globalCache.tmdb[cacheKey];
        var now = Date.now();

        // Проверка кэша
        if (cached && (now - cached.timestamp) < TMDB_CACHE_TTL) {
            callback && callback(cached.data);
            return;
        }

        var endpoint = '/search/' + type;
        var params = {
            query: title,
            language: 'ru-RU',
            include_adult: false
        };
        if (year) params.year = year;

        var queryString = Object.keys(params).map(function(key) {
            return key + '=' + encodeURIComponent(params[key]);
        }).join('&');

        apiRequest(TMDB_BASE + endpoint + '?' + queryString, function(response) {
            var results = response && response.results ? response.results : [];
            var bestMatch = null;

            // Поиск лучшего совпадения по году
            for (var i = 0; i < Math.min(results.length, 5); i++) {
                var item = results[i];
                var itemYear = (item.release_date || item.first_air_date || '').substring(0, 4);
                
                if (year && itemYear == year) {
                    bestMatch = item;
                    break;
                }
                if (!bestMatch && (!year || Math.abs(itemYear - year) <= 1)) {
                    bestMatch = item;
                }
            }

            // Кэширование результата
            if (bestMatch) {
                globalCache.tmdb[cacheKey] = {
                    data: bestMatch,
                    timestamp: now
                };
            }

            callback && callback(bestMatch);
        }, function(error) {
            console.log('TMDB search error:', error);
            callback && callback(null);
        }, true);
    }

    /**
     * Получение детальной информации из TMDB по ID
     */
    function getTMDBDetails(tmdbId, type, callback) {
        if (!tmdbId || !TMDB_API_KEY) {
            callback && callback(null);
            return;
        }

        var cacheKey = 'details_' + type + '_' + tmdbId;
        var cached = globalCache.tmdb[cacheKey];
        var now = Date.now();

        if (cached && (now - cached.timestamp) < TMDB_CACHE_TTL) {
            callback && callback(cached.data);
            return;
        }

        apiRequest(TMDB_BASE + '/' + type + '/' + tmdbId + '?language=ru-RU&append_to_response=videos,credits', function(response) {
            globalCache.tmdb[cacheKey] = {
                data: response,
                timestamp: now
            };
            callback && callback(response);
        }, function(error) {
            console.log('TMDB details error:', error);
            callback && callback(null);
        }, true);
    }

    // ==================== ПАРСИНГ RUTOR ====================
    
    /**
     * Парсинг списка торрентов из HTML Rutor
     */
    function parseRutorList(html, categoryKey) {
        var results = [];
        if (!html || typeof html !== 'string') return results;

        try {
            // Простой парсинг без DOM (для совместимости с WebOS)
            var lines = html.split('\n');
            var inTable = false;
            var currentRow = null;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                
                // Поиск начала таблицы торрентов
                if (line.indexOf('<table') !== -1 && line.indexOf('downloads') !== -1) {
                    inTable = true;
                    continue;
                }
                
                if (!inTable) continue;
                
                // Конец таблицы
                if (line.indexOf('</table') !== -1) {
                    break;
                }
                
                // Поиск строки с торрентом
                if (line.indexOf('<tr') !== -1 && line.indexOf('ga-torrent') !== -1) {
                    currentRow = { html: line };
                    continue;
                }
                
                if (currentRow) {
                    currentRow.html += line;
                    
                    if (line.indexOf('</tr>') !== -1) {
                        var torrent = parseRutorRow(currentRow.html, categoryKey);
                        if (torrent && torrent.id) {
                            results.push(torrent);
                        }
                        currentRow = null;
                    }
                }
            }
        } catch (e) {
            console.log('Rutor parse error:', e);
        }

        return results.slice(0, 50); // Лимит на количество
    }

    /**
     * Парсинг одной строки таблицы торрентов
     */
    function parseRutorRow(rowHtml, categoryKey) {
        try {
            var result = {
                id: null,
                title: '',
                date: '',
                size: '',
                seeders: 0,
                leechers: 0,
                category: categoryKey,
                magnet: null
            };

            // Извлечение ID из ссылки
            var idMatch = rowHtml.match(/\/torrent\/(\d+)\//);
            if (idMatch) {
                result.id = idMatch[1];
            }

            // Извлечение заголовка
            var titleMatch = rowHtml.match(/<a[^>]*>([^<]+)<\/a>/);
            if (titleMatch) {
                // Убираем HTML-теги из названия
                result.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            // Извлечение даты, размера, сидов/личей
            var cells = rowHtml.split(/<\/td>\s*<td/);
            if (cells.length >= 4) {
                // Дата (первая ячейка после названия)
                var dateMatch = cells[0].match(/(\d{2}[.-]\d{2}[.-]\d{2,4})/);
                if (dateMatch) result.date = dateMatch[1];

                // Размер
                var sizeMatch = cells[1] ? cells[1].match(/([\d.,]+\s*(?:GB|MB|TB|KB))/i) : null;
                if (sizeMatch) result.size = sizeMatch[1].trim();

                // Сиды/личи
                var peersMatch = cells[2] ? cells[2].match(/(\d+)\s*\/\s*(\d+)/) : null;
                if (peersMatch) {
                    result.seeders = parseInt(peersMatch[1], 10) || 0;
                    result.leechers = parseInt(peersMatch[2], 10) || 0;
                }
            }

            // Извлечение magnet ссылки (отдельный запрос)
            var magnetMatch = rowHtml.match(/href="(magnet:[^"]+)"/);
            if (magnetMatch) {
                result.magnet = magnetMatch[1];
            }

            return result.id ? result : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Получение magnet ссылки для торрента
     */
    function getMagnetLink(torrentId, callback) {
        // Проверка кэша
        if (globalCache.magnets[torrentId]) {
            callback && callback(globalCache.magnets[torrentId]);
            return;
        }

        var url = RUTOR_BASE + '/torrent/' + torrentId;
        
        apiRequest(url, function(html) {
            var magnetMatch = html.match(/href="(magnet:[^"]+)"/);
            var magnet = magnetMatch ? magnetMatch[1] : null;
            
            if (magnet) {
                globalCache.magnets[torrentId] = magnet;
            }
            callback && callback(magnet);
        }, function() {
            callback && callback(null);
        });
    }

    // ==================== КОНВЕРТЕР ФОРМАТА ====================
    
    /**
     * Конвертация данных Rutor в формат Lampa плагина
     */
    function convertToPluginFormat(rutorItem, tmdbData) {
        var parsed = parseTorrentTitle(rutorItem.title);
        var type = detectContentType(rutorItem.title, CATEGORIES[rutorItem.category].rutorCategoryId);
        var isRussian = rutorItem.category === 'russian_movies' || rutorItem.category === 'russian_series';

        var result = {
            // Идентификаторы
            id: tmdbData && tmdbData.id ? tmdbData.id : 'rutor_' + rutorItem.id,
            rutor_id: rutorItem.id,
            
            // Заголовки
            title: parsed.ruTitle || parsed.cleanTitle || rutorItem.title,
            original_title: parsed.enTitle || parsed.cleanTitle || parsed.ruTitle || rutorItem.title,
            original_language: isRussian ? 'ru' : (tmdbData ? tmdbData.original_language : 'en'),
            
            // Медиа (приоритет: TMDB → заглушка)
            poster_path: tmdbData ? tmdbData.poster_path : null,
            img: tmdbData && tmdbData.poster_path 
                ? 'https://image.tmdb.org/t/p/w500' + tmdbData.poster_path 
                : '/img/img_broken.svg',
            backdrop_path: tmdbData ? tmdbData.backdrop_path : null,
            background_image: tmdbData && tmdbData.backdrop_path
                ? 'https://image.tmdb.org/t/p/original' + tmdbData.backdrop_path
                : null,
            
            // Описание
            overview: tmdbData ? tmdbData.overview : '',
            
            // Рейтинги
            vote_average: tmdbData ? tmdbData.vote_average : 0,
            vote_count: tmdbData ? tmdbData.vote_count : 0,
            
            // Тип и даты
            type: type,
            release_date: parsed.year ? parsed.year + '-01-01' : null,
            first_air_date: type === 'tv' && parsed.year ? parsed.year + '-01-01' : null,
            number_of_seasons: type === 'tv' ? 1 : null,
            
            // Технические данные торрента
            release_quality: parsed.quality || 'Unknown',
            size: rutorItem.size,
            size_bytes: parseSize(rutorItem.size),
            seeders: rutorItem.seeders,
            leechers: rutorItem.leechers,
            peers: (rutorItem.seeders || 0) + (rutorItem.leechers || 0),
            
            // Ссылки
            magnet: rutorItem.magnet,
            torrent_url: RUTOR_BASE + '/torrent/' + rutorItem.id,
            
            // Мета для отображения
            promo_title: parsed.cleanTitle,
            promo: tmdbData ? (tmdbData.overview ? tmdbData.overview.substring(0, 150) + '...' : '') : '',
            source: SOURCE_NAME,
            
            // Внутренние поля для фильтрации
            _category: rutorItem.category,
            _parsed_year: parsed.year,
            _rutor_title: rutorItem.title,
            _has_magnet: !!rutorItem.magnet
        };

        return result;
    }

    // ==================== API SERVICE ====================
    
    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        /**
         * Загрузка данных с Rutor (с fallback на зеркало)
         */
        function fetchRutorPage(url, page, onSuccess, onError) {
            var fullUrl = RUTOR_BASE + url + (url.indexOf('?') === -1 ? '?' : '&') + 'page=' + page;
            
            self.network.silent(fullUrl, function(html) {
                if (html && html.indexOf('<table') !== -1) {
                    onSuccess && onSuccess(html);
                } else {
                    // Fallback на зеркало
                    var mirrorUrl = RUTOR_MIRROR + url + (url.indexOf('?') === -1 ? '?' : '&') + 'page=' + page;
                    self.network.silent(mirrorUrl, function(mirrorHtml) {
                        if (mirrorHtml && mirrorHtml.indexOf('<table') !== -1) {
                            onSuccess && onSuccess(mirrorHtml);
                        } else {
                            onError && onError(new Error('Failed to load from both mirrors'));
                        }
                    }, onError);
                }
            }, onError);
        }

        /**
         * Получение списка торрентов для категории
         */
        self.list = function(params, onComplete, onError) {
            params = params || {};
            var categoryKey = params.url || 'top_24h';
            var page = params.page || 1;
            var category = CATEGORIES[categoryKey];

            if (!category) {
                onError && onError(new Error('Unknown category: ' + categoryKey));
                return;
            }

            fetchRutorPage(category.rutorUrl, page, function(html) {
                var rutorItems = parseRutorList(html, categoryKey);
                
                if (rutorItems.length === 0) {
                    onComplete && onComplete({
                        results: [],
                        page: page,
                        total_pages: 1,
                        total_results: 0
                    });
                    return;
                }

                // Конвертация с обогащением TMDB
                var results = [];
                var pending = rutorItems.length;
                
                function checkComplete() {
                    pending--;
                    if (pending === 0) {
                        onComplete && onComplete({
                            results: results,
                            page: page,
                            total_pages: 10, // Примерное значение для пагинации
                            total_results: results.length * 10
                        });
                    }
                }

                for (var i = 0; i < rutorItems.length; i++) {
                    (function(item) {
                        var parsed = parseTorrentTitle(item.title);
                        var type = detectContentType(item.title, category.rutorCategoryId);
                        
                        searchTMDB(parsed.enTitle || parsed.cleanTitle, parsed.year, type, function(tmdbData) {
                            var converted = convertToPluginFormat(item, tmdbData);
                            results.push(converted);
                            checkComplete();
                        });
                    })(rutorItems[i]);
                }
            }, function(error) {
                console.log('Rutor fetch error:', error);
                onError && onError(error);
            });
        };

        /**
         * Получение полной информации о карточке
         */
        self.full = function(params, onSuccess, onError) {
            var card = params.card || {};
            
            // Если есть валидный TMDB ID, используем стандартный источник
            if (typeof card.id === 'number' && !String(card.id).startsWith('rutor_')) {
                var tmdbParams = Object.assign({}, params, {
                    method: card.type === 'tv' ? 'tv' : 'movie'
                });
                Lampa.Api.sources.tmdb.full(tmdbParams, onSuccess, onError);
                return;
            }

            // Для торрентов без TMDB — возвращаем расширенные данные
            if (card.rutor_id && !card._has_magnet) {
                getMagnetLink(card.rutor_id, function(magnet) {
                    if (magnet) {
                        card.magnet = magnet;
                        card._has_magnet = true;
                    }
                    onSuccess && onSuccess(card);
                });
            } else {
                onSuccess && onSuccess(card);
            }
        };

        /**
         * Категория для главной страницы (параллельная загрузка)
         */
        self.category = function(params, onSuccess, onError) {
            var partsData = [];
            var page = params.page || 1;

            // Формирование задач для видимых категорий
            CATEGORY_ORDER.forEach(function(catKey) {
                var cat = CATEGORIES[catKey];
                if (cat.enabled) {
                    partsData.push(function(callback) {
                        self.list({url: catKey, page: page}, function(response) {
                            callback({
                                url: catKey,
                                title: cat.title,
                                page: response.page,
                                total_results: response.total_results,
                                total_pages: response.total_pages,
                                more: response.page < response.total_pages,
                                results: response.results,
                                source: SOURCE_NAME
                            });
                        }, function(error) {
                            callback({
                                error: error,
                                title: cat.title,
                                url: catKey,
                                results: []
                            });
                        });
                    });
                }
            });

            // Загрузка частями для производительности
            function loadPart(partLoaded, partEmpty) {
                Lampa.Api.partNext(partsData, 3, function(result) {
                    partLoaded(result);
                }, function(error) {
                    partEmpty(error);
                });
            }

            loadPart(onSuccess, onError);
            return loadPart;
        };

        /**
         * Главная страница (редирект на категории)
         */
        self.main = function(params, onComplete, onError) {
            // Возвращаем пустой массив для совместимости
            onComplete && onComplete([]);

            // Редирект на категории если плагин выбран основным источником
            setTimeout(function() {
                try {
                    var currentSource = Lampa.Storage.get('source', 'tmdb');
                    if (currentSource === SOURCE_NAME) {
                        Lampa.Activity.replace({
                            title: SOURCE_NAME,
                            component: 'category',
                            source: SOURCE_NAME,
                            page: 1,
                            url: ''
                        });
                    }
                } catch (e) {
                    // Игнорируем ошибки при редиректе
                }
            }, 100);
        };

        /**
         * Поиск (заглушка — можно расширить)
         */
        self.search = function(params, onComplete, onError) {
            // В будущем: реализовать поиск по Rutor через API или парсинг
            onComplete && onComplete({
                results: [],
                page: 1,
                total_pages: 1,
                total_results: 0
            });
        };
    }

    // ==================== ФИЛЬТРАЦИЯ ПРОСМОТРЕННОГО ====================
    
    function filterWatchedContent(items) {
        var hideWatched = Lampa.Storage.get('rutorparser_hide_watched', false);
        if (!hideWatched) return items;

        return items.filter(function(item) {
            if (!item || !item.id) return true;
            
            // Проверка через систему избранного Lampa
            var checkData = {
                id: typeof item.id === 'number' ? item.id : null,
                media_type: item.type || 'movie',
                title: item.title || '',
                original_title: item.original_title || '',
                poster_path: item.poster_path || ''
            };
            
            if (!checkData.id) return true; // Не фильтруем без TMDB ID
            
            var favorite = Lampa.Favorite.check(checkData);
            if (!favorite || !favorite.history) return true;
            
            // Проверка прогресса просмотра
            var hash = Lampa.Utils.hash(String(checkData.id));
            var view = Lampa.Storage.cache('file_view', 300, {})[hash];
            
            if (view && view.percent && view.percent >= MIN_PROGRESS) {
                return false; // Скрыть просмотренное
            }
            
            return true;
        });
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ====================
    
    function initPlugin() {
        if (window.rutorparser_initialized) return;
        window.rutorparser_initialized = true;

        console.log('RutorParser v' + PLUGIN_VERSION + ' initializing...');

        // Регистрация API сервиса
        var apiService = new RutorApiService();
        Lampa.Api.sources.rutorparser = apiService;
        
        // Алиас для имени источника
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function() { return apiService; },
            configurable: true
        });

        // === Настройки плагина ===
        
        // Компонент настроек
        Lampa.SettingsApi.addComponent({
            component: 'rutorparser_settings',
            name: SOURCE_NAME,
            icon: PLUGIN_ICON,
            description: 'Торренты с rutor.info + метаданные TMDB'
        });

        // Настройки видимости категорий
        CATEGORY_ORDER.forEach(function(catKey) {
            var cat = CATEGORIES[catKey];
            var settingKey = 'rutorparser_' + catKey + '_enabled';
            
            Lampa.SettingsApi.addParam({
                component: 'rutorparser_settings',
                param: {
                    name: settingKey,
                    type: 'trigger',
                    default: cat.enabled
                },
                field: {
                    name: cat.title,
                    description: 'Показывать в списке категорий'
                },
                onChange: function(value) {
                    CATEGORIES[catKey].enabled = (value === true || value === 'true');
                    Lampa.Storage.set(settingKey, CATEGORIES[catKey].enabled);
                }
            });
        });

        // Порог просмотра для фильтрации
        Lampa.SettingsApi.addParam({
            component: 'rutorparser_settings',
            param: {
                name: 'rutorparser_min_progress',
                type: 'select',
                values: {
                    '75': '75%',
                    '80': '80%',
                    '85': '85%',
                    '90': '90%',
                    '95': '95%',
                    '100': '100%'
                },
                default: String(DEFAULT_MIN_PROGRESS)
            },
            field: {
                name: 'Порог просмотра',
                description: 'Скрывать контент при достижении процента'
            },
            onChange: function(value) {
                MIN_PROGRESS = parseInt(value, 10) || DEFAULT_MIN_PROGRESS;
                Lampa.Storage.set('rutorparser_min_progress', MIN_PROGRESS);
            }
        });

        // Скрытие просмотренного
        Lampa.SettingsApi.addParam({
            component: 'rutorparser_settings',
            param: {
                name: 'rutorparser_hide_watched',
                type: 'trigger',
                default: Lampa.Storage.get('rutorparser_hide_watched', false)
            },
            field: {
                name: 'Скрыть просмотренные',
                description: 'Не показывать уже просмотренный контент'
            },
            onChange: function(value) {
                var hide = (value === true || value === 'true');
                Lampa.Storage.set('rutorparser_hide_watched', hide);
                
                // Обновить активную страницу
                var active = Lampa.Activity.active();
                if (active && active.component === 'category' && active.source === SOURCE_NAME) {
                    Lampa.Activity.replace({
                        component: 'category',
                        source: SOURCE_NAME,
                        page: 1
                    });
                }
            }
        });

        // Название источника в меню
        Lampa.SettingsApi.addParam({
            component: 'rutorparser_settings',
            param: {
                name: 'rutorparser_source_name',
                type: 'input',
                placeholder: 'Название в меню',
                default: DEFAULT_SOURCE_NAME
            },
            field: {
                name: 'Название источника',
                description: 'Как отображать плагин в главном меню'
            },
            onChange: function(value) {
                if (value && value.trim()) {
                    $('.num_text').text(value.trim());
                }
            }
        });

        // === Интеграция в интерфейс ===
        
        // Добавление пункта в главное меню
        var menuItem = $('<li data-action="rutorparser" class="menu__item selector">' +
            '<div class="menu__ico">' + PLUGIN_ICON + '</div>' +
            '<div class="menu__text num_text">' + SOURCE_NAME + '</div>' +
            '</li>');
        
        $('.menu .menu__list').eq(0).append(menuItem);

        // Обработчик перехода
        menuItem.on('hover:enter', function() {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1,
                url: ''
            });
        });

        // === Патч для совместимости с основным источником ===
        (function() {
            var origPush = Lampa.Activity.push;
            var origReplace = Lampa.Activity.replace;

            function shouldUseTMDB(params) {
                if (!params) return false;
                var currentSource = Lampa.Storage.get('source', 'tmdb');
                if (currentSource !== SOURCE_NAME) return false;
                
                // Фильмы/Сериалы из TMDB должны использовать оригинальный источник
                return (params.component === 'category' && 
                       (params.url === 'movie' || params.url === 'tv'));
            }

            Lampa.Activity.push = function(params) {
                return origPush.call(this, shouldUseTMDB(params) ? 
                    Object.assign({}, params, {source: 'tmdb'}) : params);
            };

            Lampa.Activity.replace = function(params) {
                return origReplace.call(this, shouldUseTMDB(params) ? 
                    Object.assign({}, params, {source: 'tmdb'}) : params);
            };
        })();

        // === Глобальный обработчик для подгрузки элементов ===
        Lampa.Listener.follow('line', function(event) {
            if (event.type !== 'append') return;
            var data = event.data;
            if (!data || !Array.isArray(data.results)) return;
            if (data.source !== SOURCE_NAME) return;

            // Фильтрация просмотренного при подгрузке
            var filtered = filterWatchedContent(data.results);
            if (filtered.length !== data.results.length) {
                data.results = filtered;
                if (event.line && event.line.update) {
                    event.line.update();
                }
            }
        });

        console.log('RutorParser initialized successfully');
    }

    // === ЗАПУСК ===
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') {
                initPlugin();
            }
        });
    }

})();
