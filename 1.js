/**
 * 🎬 Rutor Pro Plugin for Lampa
 * Интеграция с Cloudflare Worker
 * Позиция в меню: 1
 */

(function() {
    'use strict';

    // ================= CONFIG =================
    const CONFIG = {
        workerUrl: 'https://my-proxy-worker.mail-internetx.workers.dev',
        pluginId: 'rutor_pro',
        menuPosition: 1,        // Позиция кнопки в главном меню (1 = первая)
        menuTitle: '🔥 Rutor Pro',
        menuSubtitle: 'Торренты с постерами',
        cacheTTL: 5 * 60 * 1000 // 5 минут кэш для ответов
    };

    // ================= CACHE =================
    const cache = new Map();
    
    function cachedFetch(url, key) {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.ts < CONFIG.cacheTTL) {
            return Promise.resolve(cached.data);
        }
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                cache.set(key, { data, ts: Date.now() });
                // Очистка старого кэша
                if (cache.size > 50) {
                    const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0];
                    cache.delete(oldest[0]);
                }
                return data;
            });
    }

    // ================= PLUGIN CORE =================
    const RutorPro = {
        
        // Инициализация плагина
        init: function() {
            this.registerSource();
            this.bindRouter();
            console.log('[RutorPro] ✅ Plugin loaded');
        },

        // Регистрация источника в меню Lampa
        registerSource: function() {
            if (typeof Lampa.Source === 'undefined') {
                console.warn('[RutorPro] ⚠️ Lampa.Source not available');
                return;
            }

            Lampa.Source.add({
                id: CONFIG.pluginId,
                title: CONFIG.menuTitle,
                subtitle: CONFIG.menuSubtitle,
                icon: '🗂️',
                position: CONFIG.menuPosition,
                // При нажатии — показываем категории
                onSelect: () => this.showCategories(),
                // Долгое нажатие — инфо о плагине
                onLongPress: () => {
                    Lampa.Modal.info({
                        title: CONFIG.menuTitle,
                        text: [
                            'Плагин для просмотра торрентов с постерами',
                            '',
                            '📡 Источник: rutor.info',
                            '🎬 Метаданные: TMDB / KinoPoisk',
                            '⚡ Прокси: Cloudflare Workers',
                            '',
                            'Нажмите ОК для входа в раздел'
                        ].join('\n'),
                        onConfirm: () => {}
                    });
                }
            });
        },

        // Обработчик маршрутов плагина
        bindRouter: function() {
            Lampa.Router.add(CONFIG.pluginId + '/categories', () => this.showCategories());
            Lampa.Router.add(CONFIG.pluginId + '/category/:url', (params) => this.showCategory(params.url));
            Lampa.Router.add(CONFIG.pluginId + '/item/:id', (params) => this.showItemDetails(params.id));
        },

        // 📁 Показать категории
        showCategories: function() {
            Lampa.Loading.show();

            cachedFetch(CONFIG.workerUrl + '/categories', 'categories')
                .then(data => {
                    Lampa.Loading.hide();
                    
                    if (data.error) throw new Error(data.message || 'Ошибка API');

                    const items = (data.results || []).map(cat => ({
                        title: cat.title,
                        subtitle: 'Раздел торрентов',
                        poster: cat.poster_path,
                        backdrop: cat.backdrop_path,
                        id: cat.id,
                        url: cat.url,
                        type: 'folder',
                        source: CONFIG.pluginId,
                        
                        onEnter: () => {
                            Lampa.Router.open(CONFIG.pluginId + '/category/' + cat.url);
                        },
                        
                        onMore: () => {
                            Lampa.Modal.open({
                                title: cat.title,
                                items: [
                                    {
                                        title: '🔄 Обновить',
                                        onSelect: () => {
                                            cache.delete('categories');
                                            this.showCategories();
                                        }
                                    },
                                    {
                                        title: 'ℹ️ О разделе',
                                        onSelect: () => {
                                            Lampa.Modal.info({
                                                title: cat.title,
                                                text: 'Раздел содержит торрент-раздачи с постерами и рейтингами из баз данных.'
                                            });
                                        }
                                    }
                                ]
                            });
                        }
                    }));

                    Lampa.Screen.show({
                        title: CONFIG.menuTitle,
                        subtitle: 'Выберите категорию',
                        items: items,
                        type: 'grid',
                        backdrop: '',
                        onBack: () => Lampa.Router.back(),
                        onEmpty: () => ({
                            title: '😕 Пусто',
                            text: 'В этом разделе пока нет контента'
                        })
                    });
                })
                .catch(err => {
                    Lampa.Loading.hide();
                    this.showError('Не удалось загрузить категории', err.message);
                    console.error('[RutorPro]', err);
                });
        },

        // 🎬 Показать контент категории
        showCategory: function(categoryUrl) {
            Lampa.Loading.show();

            cachedFetch(CONFIG.workerUrl + '/' + categoryUrl, 'cat:' + categoryUrl)
                .then(data => {
                    Lampa.Loading.hide();
                    
                    if (data.error) throw new Error(data.message || 'Ошибка загрузки контента');

                    const items = (data.results || []).map(item => ({
                        title: item.title,
                        subtitle: this.formatSubtitle(item),
                        poster: item.poster_path || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmMyYzJjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjQwcHgiIGZpbGw9IiM4ODgiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuKckuKcqDwvdGV4dD48L3N2Zz4=',
                        backdrop: item.backdrop_path,
                        id: item.id,
                        type: item.type || 'movie',
                        media_type: item.media_type || item.type || 'movie',
                        overview: item.overview || '',
                        year: item.year,
                        rating: item.vote_average,
                        source: item.source || CONFIG.pluginId,
                        
                        // Клик — детали / поиск торрента
                        onEnter: () => {
                            this.handleItemSelect(item);
                        },
                        
                        // Долгое нажатие — меню действий
                        onMore: () => {
                            this.showItemMenu(item);
                        }
                    }));

                    Lampa.Screen.show({
                        title: data.results?.[0]?.source || 'Контент',
                        subtitle: categoryUrl,
                        items: items,
                        type: 'media', // Сетка постеров
                        backdrop: items[0]?.backdrop,
                        onBack: () => Lampa.Router.back(),
                        onLoadMore: () => {
                            // Пагинация: текущий воркер отдаёт 1 страницу
                            return false;
                        },
                        onEmpty: () => ({
                            title: '🔍 Ничего не найдено',
                            text: 'Попробуйте другую категорию'
                        })
                    });
                })
                .catch(err => {
                    Lampa.Loading.hide();
                    this.showError('Ошибка загрузки контента', err.message);
                    console.error('[RutorPro]', err);
                });
        },

        // 🎯 Обработка выбора элемента
        handleItemSelect: function(item) {
            // Вариант 1: Показать детали
            // Lampa.Router.open(CONFIG.pluginId + '/item/' + item.id);
            
            // Вариант 2: Сразу искать торрент (рекомендуется)
            this.searchTorrent(item.title + (item.year ? ' ' + item.year : ''));
        },

        // 🔍 Поиск торрента по названию
        searchTorrent: function(query) {
            Lampa.Loading.show();
            
            // Здесь можно интегрировать:
            // 1. Открытие поиска в торрент-плеере (TorLook, Jacked, etc.)
            // 2. Парсинг страницы с rutor.info
            // 3. Вызов внешнего приложения
            
            // Пример: открытие веб-поиска Rutor
            const searchUrl = 'https://rutor.info/search/0/0/0/' + encodeURIComponent(query);
            
            Lampa.Loading.hide();
            
            // Если в Lampa есть Webview:
            if (Lampa.WebView) {
                Lampa.WebView.open(searchUrl, {
                    title: '🔍 Поиск: ' + query,
                    onBack: () => Lampa.Router.back()
                });
            } else {
                // Фоллбэк: показать уведомление
                Lampa.Modal.info({
                    title: '🔗 Торрент-поиск',
                    text: 'Откройте в браузере:\n' + searchUrl,
                    buttons: [
                        {
                            title: '📋 Копировать ссылку',
                            onSelect: () => {
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(searchUrl);
                                    Lampa.Notice.show('Ссылка скопирована!', 2000);
                                }
                            }
                        },
                        {
                            title: '✅ Понятно',
                            onSelect: () => {}
                        }
                    ]
                });
            }
        },

        // 📋 Меню действий для элемента
        showItemMenu: function(item) {
            Lampa.Modal.open({
                title: item.title,
                items: [
                    {
                        title: '🔍 Найти торрент',
                        icon: '🔗',
                        onSelect: () => this.searchTorrent(item.title + (item.year ? ' ' + item.year : ''))
                    },
                    {
                        title: 'ℹ️ Описание',
                        icon: '📝',
                        onSelect: () => {
                            Lampa.Modal.info({
                                title: item.title,
                                text: item.overview || 'Описание отсутствует',
                                backdrop: item.backdrop
                            });
                        }
                    },
                    {
                        title: '⭐ Рейтинг: ' + (item.vote_average || 'N/A'),
                        icon: '🌟',
                        disabled: true
                    },
                    {
                        title: '📅 ' + (item.year || 'Год неизвестен'),
                        icon: '🗓️',
                        disabled: true
                    },
                    {
                        title: '↩️ Назад',
                        icon: '⬅️',
                        onSelect: () => {}
                    }
                ]
            });
        },

        // ℹ️ Детали элемента (заглушка)
        showItemDetails: function(itemId) {
            Lampa.Modal.info({
                title: 'ℹ️ Детали',
                text: 'Страница деталей в разработке.\n\nID: ' + itemId
            });
        },

        // 📝 Форматирование подписи карточки
        formatSubtitle: function(item) {
            const parts = [];
            if (item.year) parts.push(item.year);
            if (item.vote_average > 0) parts.push('⭐ ' + item.vote_average.toFixed(1));
            if (item.number_of_seasons > 0) parts.push(item.number_of_seasons + ' сез.');
            return parts.join(' • ') || 'Без данных';
        },

        // ❌ Показать ошибку
        showError: function(title, message) {
            Lampa.Modal.open({
                title: '❌ ' + title,
                items: [
                    {
                        title: '🔄 Повторить',
                        onSelect: () => Lampa.Router.reload()
                    },
                    {
                        title: '📋 Скопировать ошибку',
                        onSelect: () => {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(message);
                                Lampa.Notice.show('Текст ошибки скопирован', 2000);
                            }
                        }
                    },
                    {
                        title: '✅ Закрыть',
                        onSelect: () => Lampa.Router.back()
                    }
                ]
            });
            Lampa.Notice.show(title + ': ' + message, 4000);
        }
    };

    // ================= AUTO-INIT =================
    function initPlugin() {
        if (typeof Lampa === 'undefined') {
            console.warn('[RutorPro] ⏳ Lampa not ready, retrying...');
            setTimeout(initPlugin, 500);
            return;
        }
        RutorPro.init();
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlugin);
    } else {
        initPlugin();
    }

    // Глобальный доступ (опционально)
    window.RutorPro = RutorPro;

})();
