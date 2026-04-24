/**
 * 🔥 Rutor Pro Source for Lampa
 * Интеграция с вашим Cloudflare Worker
 */
(function() {
    'use strict';

    // ====== КОНФИГ ======
    const WORKER_URL = 'https://my-proxy-worker.mail-internetx.workers.dev';
    const SOURCE_ID = 'rutor_pro';
    const SOURCE_NAME = '🔥 Rutor Pro';
    
    const cache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 минут

    // ====== КЭШ ======
    function cachedFetch(key, url) {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            return Promise.resolve(cached.data);
        }
        return fetch(url)
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(data => {
                cache.set(key, { data: data, ts: Date.now() });
                if (cache.size > 20) {
                    const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0];
                    cache.delete(oldest[0]);
                }
                return data;
            });
    }

    // ====== SOURCE OBJECT (обязательные методы) ======
    const RutorSource = {
        
        // 🏠 Главная страница источника — показывает категории
        main: function(params, onComplite, onError) {
            cachedFetch('rutor:main', WORKER_URL + '/categories')
                .then(data => {
                    const collections = (data.results || []).map(cat => ({
                        title: cat.title,
                        url: cat.url,
                        type: 'collection',
                        poster: cat.poster_path,
                        items: [] // пустой массив — Lampa сам загрузит контент при клике
                    }));
                    onComplite({ collections: collections });
                })
                .catch(err => {
                    console.error('[RutorPro]', err);
                    onComplite({ collections: [] });
                });
        },

        // 📁 Коллекция (категория) — показывает фильмы
        collection: function(params, onComplite, onError) {
            const catUrl = params.url;
            if (!catUrl) { onComplite({ items: [] }); return; }
            
            cachedFetch('rutor:cat:' + catUrl, WORKER_URL + '/' + catUrl)
                .then(data => {
                    const items = (data.results || []).map(item => ({
                        id: SOURCE_ID + '_' + item.id,
                        title: item.title,
                        original_title: item.original_title,
                        overview: item.overview || '',
                        poster: item.poster_path,
                        backdrop: item.backdrop_path,
                        rating: item.vote_average || 0,
                        year: item.year || '',
                        type: item.type || item.media_type || 'movie',
                        source: SOURCE_ID,
                        // Для поиска торрента передаём оригинальное название
                        _rutor_title: item.title + (item.year ? ' (' + item.year + ')' : '')
                    }));
                    onComplite({ items: items, page: 1, total_pages: 1, more: false });
                })
                .catch(err => {
                    console.error('[RutorPro]', err);
                    onComplite({ items: [] });
                });
        },

        // 🔍 Поиск (опционально)
        search: function(params, onComplite, onError) {
            // Worker не поддерживает поиск, возвращаем пусто
            onComplite({ items: [] });
        },

        // 🎬 Детали карточки (опционально)
        full: function(params, onComplite, onError) {
            // Возвращаем те же данные — Lampa покажет карточку
            if (params.card) {
                onComplite(params.card);
            } else {
                onComplite({});
            }
        },

        // 🎭 Человек/актёр (не используется)
        person: function(params, onComplite, onError) {
            onComplite({});
        },

        // ⚙️ Метаданные источника
        discovery: function() {
            return {
                title: SOURCE_NAME,
                search: this.search.bind(this),
                params: {
                    align_left: true,
                    object: { source: SOURCE_ID }
                },
                onCancel: function() {}
            };
        }
    };

    // ====== ОБРАБОТЧИК КЛИКА ПО КАРТОЧКЕ ======
    function onCardSelect(card) {
        if (!card || !card._rutor_title) return;
        
        const query = encodeURIComponent(card._rutor_title);
        const searchUrl = 'https://rutor.info/search/0/0/0/' + query;
        
        // Пробуем открыть WebView (если есть в сборке)
        if (window.Lampa && Lampa.WebView) {
            Lampa.WebView.open(searchUrl, {
                title: '🔍 ' + card.title,
                onBack: function() {
                    if (Lampa.Router) Lampa.Router.back();
                }
            });
        } else {
            // Фоллбэк: показать ссылку
            if (window.Lampa && Lampa.Modal) {
                Lampa.Modal.info({
                    title: '🔗 Торрент-поиск',
                    text: 'Откройте в браузере:\n' + searchUrl,
                    onConfirm: function() {}
                });
            }
        }
    }

    // ====== РЕГИСТРАЦИЯ ИСТОЧНИКА ======
    function registerSource() {
        // Проверяем, что Lampa загружен
        if (!window.Lampa || !Lampa.Api || !Lampa.Api.sources) {
            setTimeout(registerSource, 500);
            return;
        }
        
        // Регистрируем источник
        Lampa.Api.sources[SOURCE_ID] = RutorSource;
        
        // Добавляем обработчик выбора карточки
        if (Lampa.Listener) {
            Lampa.Listener.follow('card', function(e) {
                if (e.type === 'select' && e.card && e.card.source === SOURCE_ID) {
                    onCardSelect(e.card);
                    e.abort(); // Отменяем стандартное действие
                }
            });
        }
        
        // Обновляем список источников в настройках
        if (Lampa.Params && Lampa.Params.select) {
            const sources = {
                'tmdb': 'TMDB',
                'cub': 'CUB',
                'pub': 'PUB',
                [SOURCE_ID]: SOURCE_NAME
            };
            Lampa.Params.select('source', sources, 'tmdb');
        }
        
        console.log('[RutorPro] ✅ Source registered');
    }

    // ====== ЗАПУСК ======
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerSource);
    } else {
        registerSource();
    }

})();
