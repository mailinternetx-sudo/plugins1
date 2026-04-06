(function() {
    // Проверяем, что Lampa загружена
    if (typeof Lampa === 'undefined') {
        console.error('[RuTor] Lampa не найдена');
        return;
    }

    // Конфигурация плагина
    const PLUGIN_NAME = 'RuTor';
    const PLUGIN_VERSION = '1.0.0';
    const CACHE_TTL = 30 * 60 * 1000; // 30 минут
    const PROXY_URL = 'https://cors-anywhere.herokuapp.com/'; // Прокси для обхода CORS (можно заменить на другой)
    const BASE_URL = 'http://rutor.info';

    // Ключи для хранения в Lampa.Storage
    const STORAGE_KEYS = {
        SETTINGS: 'rutor_settings',
        CACHE_TOP: 'rutor_cache_top',
        CACHE_NEW: 'rutor_cache_new',
        CACHE_CATEGORIES: 'rutor_cache_categories',
        CACHE_CATEGORY_PREFIX: 'rutor_cache_cat_'
    };

    // Настройки по умолчанию
    const DEFAULT_SETTINGS = {
        selectedParser: null,
        useProxy: true,
        proxyUrl: PROXY_URL
    };

    // Класс плагина
    class RuTorPlugin {
        constructor() {
            this.settings = null;
            this.activeTab = 'top';
            this.currentScroll = null;
            this.currentAbortController = null;
            this.categoriesList = [];
            this.init();
        }

        // Инициализация
        init() {
            this.loadSettings();
            this.registerMenuButton();
            this.registerEvents();
            console.log(`[RuTor] Плагин версии ${PLUGIN_VERSION} загружен`);
        }

        // Загрузка настроек
        loadSettings() {
            const saved = Lampa.Storage.get(STORAGE_KEYS.SETTINGS);
            if (saved) {
                this.settings = { ...DEFAULT_SETTINGS, ...saved };
            } else {
                this.settings = { ...DEFAULT_SETTINGS };
            }
            // Если выбранный парсер не установлен, пробуем взять первый активный
            if (!this.settings.selectedParser) {
                const parsers = this.getActiveParsers();
                if (parsers.length > 0) {
                    this.settings.selectedParser = parsers[0].id;
                    this.saveSettings();
                }
            }
        }

        // Сохранение настроек
        saveSettings() {
            Lampa.Storage.set(STORAGE_KEYS.SETTINGS, this.settings);
        }

        // Получение списка активных парсеров
        getActiveParsers() {
            // Lampa может хранить парсеры в разных местах
            let parsers = [];
            if (Lampa.Parser && Lampa.Parser.list) {
                parsers = Lampa.Parser.list();
            } else if (Lampa.Settings && Lampa.Settings.get('parsers')) {
                parsers = Lampa.Settings.get('parsers');
            }
            // Фильтруем активные
            return parsers.filter(p => p.active !== false);
        }

        // Регистрация кнопки в левом меню
        registerMenuButton() {
            // Ждём загрузки приложения
            Lampa.Listener.follow('app', () => {
                // Проверяем, не добавлена ли уже кнопка
                const existing = Lampa.Menu.all().find(item => item.id === 'rutor_plugin');
                if (!existing) {
                    Lampa.Menu.add({
                        id: 'rutor_plugin',
                        title: 'RuTor',
                        icon: 'lampa/img/menu/torrent.png', // Стандартная иконка торрента
                        component: 'rutor_component',
                        after: 'torrents' // Размещаем после пункта "Торренты"
                    });
                    console.log('[RuTor] Кнопка меню добавлена');
                }
            });
        }

        // Регистрация кастомного компонента
        registerEvents() {
            // Регистрируем компонент через Lampa.Component
            if (Lampa.Component && Lampa.Component.add) {
                Lampa.Component.add('rutor_component', RuTorComponent);
            } else {
                // Fallback: через Listener
                Lampa.Listener.on('component', (name, callback) => {
                    if (name === 'rutor_component') {
                        callback(new RuTorComponent());
                    }
                });
            }
        }
    }

    // Компонент экрана RuTor
    class RuTorComponent {
        constructor() {
            this.activeTab = 'top';
            this.currentData = [];
            this.scrollView = null;
            this.abortController = null;
            this.parserSelect = null;
            this.pluginSettings = new RuTorPlugin().settings; // Получаем настройки плагина
            this.init();
        }

        init() {
            // Создаём корневой элемент
            this.root = $('<div class="rutor-component" style="width:100%;height:100%;"></div>');
            this.renderTabs();
            this.renderContentArea();
            this.renderParserSelect();
            this.loadTab(this.activeTab);
        }

        renderTabs() {
            const tabs = ['top', 'categories', 'new'];
            const titles = { top: 'Топ', categories: 'Категории', new: 'Новинки' };
            this.tabs = new Lampa.Tabs({
                root: this.root,
                items: tabs.map(tab => ({ name: titles[tab], id: tab })),
                onSelect: (item) => {
                    this.activeTab = item.id;
                    this.loadTab(this.activeTab);
                }
            });
        }

        renderContentArea() {
            // Контейнер для контента
            this.contentContainer = $('<div class="rutor-content" style="width:100%;height:calc(100% - 100px);"></div>');
            this.root.append(this.contentContainer);
        }

        renderParserSelect() {
            // Получаем активные парсеры
            const parsers = this.getParsers();
            const options = parsers.map(p => ({ value: p.id, name: p.name || p.id }));
            this.parserSelect = new Lampa.Select({
                root: this.root,
                title: 'Парсер для воспроизведения:',
                items: options,
                value: this.pluginSettings.selectedParser,
                position: 'bottom',
                onSelect: (value) => {
                    this.pluginSettings.selectedParser = value;
                    // Сохраняем настройки
                    const plugin = new RuTorPlugin();
                    plugin.settings.selectedParser = value;
                    plugin.saveSettings();
                }
            });
        }

        getParsers() {
            const plugin = new RuTorPlugin();
            return plugin.getActiveParsers();
        }

        async loadTab(tabId) {
            // Отменяем предыдущий запрос
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();

            // Показываем индикатор загрузки
            this.showLoader();

            try {
                let data = [];
                if (tabId === 'top') {
                    data = await this.getTop();
                } else if (tabId === 'new') {
                    data = await this.getNew();
                } else if (tabId === 'categories') {
                    data = await this.getCategoriesList();
                    // Для категорий показываем список категорий, а не торренты
                    this.renderCategoriesList(data);
                    this.hideLoader();
                    return;
                }
                this.renderTorrents(data);
            } catch (error) {
                console.error('[RuTor] Ошибка загрузки:', error);
                this.showError('Не удалось загрузить данные. Проверьте соединение или прокси.');
            } finally {
                this.hideLoader();
            }
        }

        async getTop() {
            // Проверяем кэш
            const cached = Lampa.Storage.get(STORAGE_KEYS.CACHE_TOP);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.data;
            }
            const url = `${BASE_URL}/top`;
            const html = await this.fetchWithProxy(url);
            const torrents = this.parseTorrentList(html);
            // Сохраняем в кэш
            Lampa.Storage.set(STORAGE_KEYS.CACHE_TOP, { data: torrents, timestamp: Date.now() });
            return torrents;
        }

        async getNew() {
            const cached = Lampa.Storage.get(STORAGE_KEYS.CACHE_NEW);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.data;
            }
            const url = `${BASE_URL}/new`;
            const html = await this.fetchWithProxy(url);
            const torrents = this.parseTorrentList(html);
            Lampa.Storage.set(STORAGE_KEYS.CACHE_NEW, { data: torrents, timestamp: Date.now() });
            return torrents;
        }

        async getCategoriesList() {
            const cached = Lampa.Storage.get(STORAGE_KEYS.CACHE_CATEGORIES);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.data;
            }
            const url = `${BASE_URL}/browse`;
            const html = await this.fetchWithProxy(url);
            const categories = this.parseCategories(html);
            Lampa.Storage.set(STORAGE_KEYS.CACHE_CATEGORIES, { data: categories, timestamp: Date.now() });
            return categories;
        }

        async getCategoryTorrents(categoryId, categoryUrl) {
            const cacheKey = STORAGE_KEYS.CACHE_CATEGORY_PREFIX + categoryId;
            const cached = Lampa.Storage.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.data;
            }
            const url = categoryUrl.startsWith('http') ? categoryUrl : `${BASE_URL}${categoryUrl}`;
            const html = await this.fetchWithProxy(url);
            const torrents = this.parseTorrentList(html);
            Lampa.Storage.set(cacheKey, { data: torrents, timestamp: Date.now() });
            return torrents;
        }

        async fetchWithProxy(url) {
            let fullUrl = url;
            if (this.pluginSettings.useProxy && this.pluginSettings.proxyUrl) {
                fullUrl = this.pluginSettings.proxyUrl + encodeURIComponent(url);
            }
            const response = await fetch(fullUrl, {
                signal: this.abortController.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WebOS; LG TV) AppleWebKit/537.36'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        }

        parseTorrentList(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('table tr:not(:first-child)');
            const torrents = [];
            for (let row of rows) {
                const cols = row.querySelectorAll('td');
                if (cols.length < 5) continue;
                // Название и ссылка
                const titleLink = cols[1].querySelector('a');
                if (!titleLink) continue;
                const title = titleLink.textContent.trim();
                const detailUrl = titleLink.getAttribute('href');
                // Магнет-ссылка (обычно в колонке 2 или 3)
                let magnet = '';
                const magnetLink = cols[2]?.querySelector('a[href^="magnet:"]') || cols[3]?.querySelector('a[href^="magnet:"]');
                if (magnetLink) magnet = magnetLink.getAttribute('href');
                // Сиды и пиры
                const seeds = parseInt(cols[4]?.textContent.trim()) || 0;
                const peers = parseInt(cols[5]?.textContent.trim()) || 0;
                // Размер
                const size = cols[3]?.textContent.trim() || '';
                // Постер (на rutor.info нет постеров, можно заглушку)
                const poster = 'lampa/img/poster.png';
                torrents.push({
                    title: title,
                    url: detailUrl ? (detailUrl.startsWith('http') ? detailUrl : BASE_URL + detailUrl) : '',
                    poster: poster,
                    size: size,
                    seeds: seeds,
                    peers: peers,
                    magnet: magnet
                });
                if (torrents.length >= 40) break;
            }
            return torrents;
        }

        parseCategories(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const categoryLinks = doc.querySelectorAll('a[href*="/browse/"]');
            const categories = [];
            const unique = new Set();
            for (let link of categoryLinks) {
                let href = link.getAttribute('href');
                let name = link.textContent.trim();
                if (href && name && !unique.has(href) && href.match(/\/browse\/\d+/)) {
                    unique.add(href);
                    categories.push({ id: href.split('/').pop(), name: name, url: href });
                }
            }
            return categories;
        }

        renderCategoriesList(categories) {
            this.contentContainer.empty();
            // Используем Lampa.Scroll с карточками категорий
            const scroll = new Lampa.Scroll({
                root: this.contentContainer,
                template: (item) => {
                    return new Lampa.Card({
                        title: item.name,
                        poster: 'lampa/img/folder.png',
                        style: 'folder'
                    }).render();
                },
                onSelect: (item) => {
                    // При выборе категории загружаем её торренты
                    this.loadCategoryTorrents(item);
                }
            });
            scroll.setItems(categories);
            this.currentScroll = scroll;
        }

        async loadCategoryTorrents(category) {
            this.showLoader();
            try {
                const torrents = await this.getCategoryTorrents(category.id, category.url);
                this.renderTorrents(torrents);
            } catch (error) {
                this.showError('Ошибка загрузки категории');
            } finally {
                this.hideLoader();
            }
        }

        renderTorrents(torrents) {
            this.contentContainer.empty();
            const scroll = new Lampa.Scroll({
                root: this.contentContainer,
                template: (item) => {
                    const card = new Lampa.Card({
                        title: item.title,
                        poster: item.poster,
                        description: `Размер: ${item.size} | Сиды: ${item.seeds} | Пиры: ${item.peers}`,
                        style: 'torrent'
                    });
                    card.on('select', () => {
                        this.playTorrent(item);
                    });
                    return card.render();
                }
            });
            scroll.setItems(torrents);
            this.currentScroll = scroll;
        }

        playTorrent(torrent) {
            if (!torrent.magnet) {
                Lampa.Notification.show('Нет магнет-ссылки', 3000);
                return;
            }
            const parserId = this.pluginSettings.selectedParser;
            if (!parserId) {
                Lampa.Notification.show('Выберите парсер в настройках плагина', 3000);
                return;
            }
            // Получаем выбранный парсер
            const parsers = this.getParsers();
            const parser = parsers.find(p => p.id === parserId);
            if (!parser) {
                Lampa.Notification.show('Парсер не найден', 3000);
                return;
            }
            // Запускаем торрент через Lampa.Torrent
            if (Lampa.Torrent && Lampa.Torrent.play) {
                Lampa.Torrent.play(torrent.magnet, {
                    title: torrent.title,
                    parser: parser
                });
            } else if (Lampa.Player && Lampa.Player.play) {
                Lampa.Player.play(torrent.magnet, {
                    title: torrent.title,
                    type: 'torrent'
                });
            } else {
                Lampa.Notification.show('Плеер не доступен', 3000);
            }
        }

        showLoader() {
            if (this.loader) this.loader.remove();
            this.loader = $('<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;">Загрузка...</div>');
            this.contentContainer.append(this.loader);
        }

        hideLoader() {
            if (this.loader) {
                this.loader.remove();
                this.loader = null;
            }
        }

        showError(message) {
            Lampa.Notification.show(message, 4000);
        }

        getRoot() {
            return this.root;
        }
    }

    // Запуск плагина
    new RuTorPlugin();
})();