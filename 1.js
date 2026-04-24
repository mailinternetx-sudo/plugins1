/**
 * 🎬 Rutor Pro Plugin for Lampa
 * Добавляет источник в раздел "Источники"
 */
(function() {
    'use strict';

    const CONFIG = {
        workerUrl: 'https://my-proxy-worker.mail-internetx.workers.dev',
        pluginId: 'rutor_pro',
        sourceTitle: '🔥 Rutor Pro',
        sourceDesc: 'Торренты с постерами',
        sourceIcon: '🗂️'
    };

    const cache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    function cachedFetch(url, key) {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            return Promise.resolve(cached.data);
        }
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                cache.set(key, { data, ts: Date.now() });
                if (cache.size > 30) {
                    const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0];
                    cache.delete(oldest[0]);
                }
                return data;
            });
    }

    const RutorPro = {
        init: function() {
            // Ждём готовности Lampa
            if (typeof Lampa === 'undefined' || !Lampa.Source) {
                setTimeout(() => this.init(), 500);
                return;
            }
            this.registerSource();
            this.bindRoutes();
            console.log('[RutorPro] ✅ Loaded');
        },

        // 📁 Регистрация источника
        registerSource: function() {
            Lampa.Source.add({
                id: CONFIG.pluginId,
                title: CONFIG.sourceTitle,
                subtitle: CONFIG.sourceDesc,
                icon: CONFIG.sourceIcon,
                // ✅ Это добавит плитку в раздел "Источники"
                onReady: (view, params) => this.showCategories(view, params),
                onBack: () => Lampa.Router.back(),
                // Долгое нажатие — инфо
                onMore: () => {
                    Lampa.Modal.info({
                        title: CONFIG.sourceTitle,
                        text: 'Торрент-каталог с постерами из TMDB/KinoPoisk\n\nИсточник: rutor.info\nПрокси: Cloudflare Workers'
                    });
                }
            });
        },

        // 🗺️ Маршруты
        bindRoutes: function() {
            Lampa.Router.add(CONFIG.pluginId + '/categories', () => this.showCategories());
            Lampa.Router.add(CONFIG.pluginId + '/category/:url', (p) => this.showCategory(p.url));
        },

        // 📂 Показать категории
        showCategories: function(view, params) {
            Lampa.Loading.show();
            
            cachedFetch(CONFIG.workerUrl + '/categories', 'rutor:categories')
                .then(data => {
                    Lampa.Loading.hide();
                    if (data.error) throw new Error(data.message);

                    const items = (data.results || []).map(cat => ({
                        title: cat.title,
                        subtitle: 'Раздел',
                        poster: cat.poster_path,
                        id: cat.id,
                        url: cat.url,
                        onEnter: () => {
                            Lampa.Router.open(CONFIG.pluginId + '/category/' + cat.url);
                        },
                        onMore: () => {
                            Lampa.Modal.open({
                                title: cat.title,
                                items: [{
                                    title: '🔄 Обновить',
                                    onSelect: () => {
                                        cache.delete('rutor:categories');
                                        this.showCategories(view, params);
                                    }
                                }]
                            });
                        }
                    }));

                    // Если вызван через onReady — рендерим в view
                    if (view && view.render) {
                        view.render(items, {
                            title: CONFIG.sourceTitle,
                            subtitle: 'Категории',
                            type: 'grid',
                            onBack: () => Lampa.Router.back()
                        });
                    } else {
                        // Или через Screen (альтернатива)
                        Lampa.Screen.show({
                            title: CONFIG.sourceTitle,
                            items: items,
                            type: 'grid',
                            onBack: () => Lampa.Router.back()
                        });
                    }
                })
                .catch(err => {
                    Lampa.Loading.hide();
                    Lampa.Notice.show('Ошибка: ' + err.message, 4000);
                    console.error('[RutorPro]', err);
                });
        },

        // 🎬 Показать контент категории
        showCategory: function(categoryUrl) {
            Lampa.Loading.show();
            
            cachedFetch(CONFIG.workerUrl + '/' + categoryUrl, 'rutor:cat:' + categoryUrl)
                .then(data => {
                    Lampa.Loading.hide();
                    if (data.error) throw new Error(data.message);

                    const items = (data.results || []).map(item => ({
                        title: item.title,
                        subtitle: this.formatSubtitle(item),
                        poster: item.poster_path,
                        backdrop: item.backdrop_path,
                        id: item.id,
                        year: item.year,
                        rating: item.vote_average,
                        type: item.type || 'movie',
                        onEnter: () => this.openTorrentSearch(item),
                        onMore: () => this.showItemMenu(item)
                    }));

                    Lampa.Screen.show({
                        title: CONFIG.sourceTitle,
                        subtitle: categoryUrl,
                        items: items,
                        type: 'media',
                        backdrop: items[0]?.backdrop,
                        onBack: () => Lampa.Router.back()
                    });
                })
                .catch(err => {
                    Lampa.Loading.hide();
                    Lampa.Notice.show('Ошибка загрузки: ' + err.message, 4000);
                });
        },

        // 🔍 Поиск торрента
        openTorrentSearch: function(item) {
            const query = encodeURIComponent(item.title + (item.year ? ' ' + item.year : ''));
            const url = 'https://rutor.info/search/0/0/0/' + query;
            
            if (Lampa.WebView) {
                Lampa.WebView.open(url, { title: '🔍 ' + item.title });
            } else {
                Lampa.Modal.info({
                    title: '🔗 Торрент-поиск',
                    text: url,
                    onConfirm: () => {}
                });
            }
        },

        // 📋 Меню элемента
        showItemMenu: function(item) {
            Lampa.Modal.open({
                title: item.title,
                items: [
                    { title: '🔍 Найти торрент', onSelect: () => this.openTorrentSearch(item) },
                    { title: 'ℹ️ Описание', onSelect: () => Lampa.Modal.info({ title: item.title, text: item.overview || 'Нет описания' }) },
                    { title: '⭐ ' + (item.vote_average || 'N/A'), disabled: true },
                    { title: '📅 ' + (item.year || '?'), disabled: true }
                ]
            });
        },

        formatSubtitle: function(item) {
            const parts = [];
            if (item.year) parts.push(item.year);
            if (item.vote_average > 0) parts.push('⭐ ' + item.vote_average.toFixed(1));
            return parts.join(' • ') || '—';
        }
    };

    // Автозапуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => RutorPro.init());
    } else {
        RutorPro.init();
    }

    window.RutorPro = RutorPro;
})();
