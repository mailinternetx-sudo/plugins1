/**
 * 🔥 Rutor Pro Source для Lampa (webOS Compatible)
 * Совместимость: Lampa 3.0+ | webOS 3.0+
 */
(function() {
    'use strict';

    // ===== КОНФИГ =====
    var CONFIG = {
        id: 'rutor_pro',
        title: '🔥 Rutor Pro',
        worker: 'https://my-proxy-worker.mail-internetx.workers.dev',
        cacheTTL: 300000 // 5 минут
    };

    // ===== КЭШ =====
    var cache = {};
    var CACHE_KEYS = [];

    function cachedFetch(key, url) {
        var now = Date.now();
        if (cache[key] && now - cache[key].ts < CONFIG.cacheTTL) {
            return Promise.resolve(cache[key].data);
        }
        return fetch(url, { 
            headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } 
        })
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            cache[key] = { data: data, ts: now };
            CACHE_KEYS.push(key);
            if (CACHE_KEYS.length > 15) {
                delete cache[CACHE_KEYS.shift()];
            }
            return data;
        });
    }

    // ===== SOURCE OBJECT =====
    var RutorSource = {
        name: CONFIG.id,
        title: CONFIG.title,

        // Главная страница источника
        main: function(params, onComplite, onError) {
            cachedFetch('rutor_cats', CONFIG.worker + '/categories')
                .then(function(data) {
                    var items = (data.results || []).map(function(c) {
                        return {
                            title: c.title,
                            subtitle: 'Раздел торрентов',
                            poster: c.poster_path,
                            url: c.url,
                            type: 'collection',
                            source: CONFIG.id
                        };
                    });
                    onComplite({ items: items, page: 1, total_pages: 1 });
                })
                .catch(function(e) {
                    if (onError) onError(e);
                    else onComplite({ items: [] });
                });
        },

        // Открытие категории
        collection: function(params, onComplite, onError) {
            if (!params.url) { 
                onComplite({ items: [], page: 1, total_pages: 0 }); 
                return; 
            }
            var key = 'rutor_cat_' + params.url;
            cachedFetch(key, CONFIG.worker + '/' + params.url)
                .then(function(data) {
                    var items = (data.results || []).map(function(i) {
                        return {
                            id: CONFIG.id + '_' + (i.id || Math.random().toString(36).substr(2, 9)),
                            title: i.title || 'Без названия',
                            original_title: i.original_title || '',
                            overview: i.overview || '',
                            poster: i.poster_path,
                            backdrop: i.backdrop_path,
                            rating: parseFloat(i.vote_average) || 0,
                            year: i.year || '',
                            type: i.type || 'movie',
                            source: CONFIG.id,
                            _rutor_query: i.title + (i.year ? ' (' + i.year + ')' : '')
                        };
                    });
                    onComplite({ items: items, page: 1, total_pages: 1, more: false });
                })
                .catch(function(e) {
                    if (onError) onError(e);
                    else onComplite({ items: [] });
                });
        },

        // Поиск (опционально)
        search: function(params, onComplite, onError) {
            onComplite({ items: [], page: 1, total_pages: 0 });
        },

        // Полная карточка (вызывается при нажатии ОК)
        full: function(params, onComplite, onError) {
            var card = params.card || {};
            if (card.source === CONFIG.id && card._rutor_query) {
                openRutorSearch(card._rutor_query, card.title);
            }
            onComplite(card); // Возвращаем данные, чтобы Lampa не падала
        },

        // Заглушки для обязательных методов
        person: function(p, ok, err) { ok({}); },
        company: function(p, ok, err) { ok({}); },
        keyword: function(p, ok, err) { ok({}); },
        recommend: function(p, ok, err) { ok({ items: [] }); },
        similar: function(p, ok, err) { ok({ items: [] }); },
        discover: function(p, ok, err) { ok({ items: [] }); },
        history: function(p, ok, err) { ok({ items: [] }); }
    };

    // ===== ПОИСК ТОРРЕНТА =====
    function openRutorSearch(query, title) {
        var encoded = encodeURIComponent(query);
        var url = 'https://rutor.info/search/0/0/0/' + encoded;

        try {
            // webOS Lampa поддерживает WebView
            if (typeof Lampa !== 'undefined' && Lampa.WebView) {
                Lampa.WebView.open(url, { 
                    title: '🔍 ' + (title || 'Поиск'),
                    onBack: function() {
                        if (Lampa.Router) Lampa.Router.back();
                    }
                });
            } else if (typeof Lampa !== 'undefined' && Lampa.Modal) {
                Lampa.Modal.info({
                    title: '🔗 Торрент-поиск',
                    text: 'Откройте в браузере:\n' + url,
                    onConfirm: function() {}
                });
            }
        } catch (e) {
            console.error('[RutorPro] WebView error:', e);
        }
    }

    // ===== РЕГИСТРАЦИЯ =====
    function register() {
        if (typeof Lampa === 'undefined' || !Lampa.Source) {
            setTimeout(register, 300);
            return;
        }

        try {
            Lampa.Source.add(RutorSource);
            
            // Уведомление об успехе (опционально)
            if (Lampa.Notice) {
                Lampa.Notice.show('🔥 Rutor Pro подключен', 2000);
            }
            console.log('[RutorPro] Source registered successfully');
        } catch (e) {
            console.error('[RutorPro] Registration failed:', e);
        }
    }

    // ===== АВТОЗАПУСК =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', register);
    } else {
        register();
    }

    // Глобальный доступ (для отладки)
    if (typeof window !== 'undefined') {
        window.RutorProSource = RutorSource;
    }
})();
