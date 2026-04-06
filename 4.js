(function () {
    'use strict';

    if (window.v10_3_rutor_netflix_seeds) return;
    window.v10_3_rutor_netflix_seeds = true;

    // ==================== Локализация ====================
    Lampa.Lang.add({
        v10_3_rutor: { ru: 'V10 3', en: 'V10 3' },
        v10_3_top: { ru: 'Топ за 24ч', en: 'Top 24h' },
        v10_3_new: { ru: 'Новинки', en: 'New' },
        v10_3_recommend: { ru: 'Рекомендации', en: 'Recommended' },
        v10_3_categories: { ru: 'Категории', en: 'Categories' },
        v10_3_search: { ru: 'Поиск', en: 'Search' },
        v10_3_continue: { ru: 'Продолжить', en: 'Continue' },
        v10_3_favorite: { ru: 'Избранное', en: 'Favorites' },
        v10_3_parser: { ru: 'Парсер', en: 'Parser' },
        v10_3_seeds_filter: { ru: 'Мин. сиды', en: 'Min seeds' },
        v10_3_sort_filter: { ru: 'Сортировка', en: 'Sort by' },
        v10_3_magnet_only: { ru: 'Только magnet', en: 'Magnet only' },
        v10_3_loading: { ru: 'Загрузка...', en: 'Loading...' },
        v10_3_error: { ru: 'Ошибка загрузки', en: 'Error' }
    });

    const network = new Lampa.Reguest();
    const CACHE_TTL = 18 * 60 * 1000;
    const PROXIES = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];

    // ==================== Кэш ====================
    const getCache = key => {
        const d = Lampa.Storage.get('v10_3_rutor_' + key);
        return d && Date.now() - d.time < CACHE_TTL ? d.data : null;
    };
    const setCache = (key, data) => Lampa.Storage.set('v10_3_rutor_' + key, { time: Date.now(), data });

    // ==================== Парсер торрентов ====================
    function parseTorrentList(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = Array.from(doc.querySelectorAll('tr')).filter(tr => tr.querySelector('a[href^="/torrent/"]'));
        return rows.slice(0, 50).map(row => {
            const titleLink = row.querySelector('a[href^="/torrent/"]');
            const title = titleLink.textContent.trim();
            const url = 'https://rutor.info' + titleLink.getAttribute('href');
            let magnet = row.querySelector('a[href^="magnet:"]')?.href || (row.innerHTML.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'\s&]*/i) || [])[0] || null;
            const size = (row.querySelector('td:nth-child(3)')?.textContent || '').trim();
            const seeds = parseInt(row.querySelector('.green')?.textContent) || 0;
            const yearMatch = title.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').trim();
            return { title, original_title: title, url, magnet, size, seeds, year, search_title: cleanTitle, poster: '' };
        });
    }

    // ==================== Загрузка с прокси ====================
    async function fetchRutor(url, cacheKey) {
        const cached = getCache(cacheKey);
        if (cached) return cached;
        for (let proxy of PROXIES) {
            try {
                const html = await network.promise(proxy + encodeURIComponent(url));
                const list = parseTorrentList(html);
                setCache(cacheKey, list);
                return list;
            } catch (e) {}
        }
        const html = await network.promise(url);
        const list = parseTorrentList(html);
        setCache(cacheKey, list);
        return list;
    }

    const getTop = () => fetchRutor('https://rutor.info/top', 'top');
    const getNew = () => fetchRutor('https://rutor.info/new', 'new');
    const getCategory = url => fetchRutor(url, 'cat_' + btoa(url).slice(-15));

    const categories = [
        { title: 'Топ торренты за 24ч', url: 'https://rutor.info/top' },
        { title: 'Зарубежные фильмы', url: 'https://rutor.info/browse/0/1/0/0' },
        { title: 'Наши фильмы', url: 'https://rutor.info/browse/0/1/1/0' },
        { title: 'Зарубежные сериалы', url: 'https://rutor.info/browse/0/5/0/0' },
        { title: 'Наши сериалы', url: 'https://rutor.info/browse/0/5/1/0' },
        { title: 'Телевизор', url: 'https://rutor.info/browse/0/6/0/0' }
    ];

    // ==================== Фильтры ====================
    const seedsOptions = [0, 5, 10, 20, 50, 100];
    const sortOptions = ['seeds', 'size'];

    function applyFilters(list, minSeeds, magnetOnly, sortBy) {
        let result = list;
        if (minSeeds) result = result.filter(i => i.seeds >= minSeeds);
        if (magnetOnly) result = result.filter(i => i.magnet);
        if (sortBy === 'seeds') result = result.sort((a, b) => b.seeds - a.seeds);
        if (sortBy === 'size') result = result.sort((a, b) => {
            const parseSize = s => s ? parseFloat(s.replace(',', '.')) * (/GB/i.test(s) ? 1024 : 1) : 0;
            return parseSize(b.size) - parseSize(a.size);
        });
        return result;
    }

    // ==================== Работа с парсерами Lampa ====================
    function getActiveParsers() {
        let parsers = [];
        if (Lampa.Parser && Lampa.Parser.list) {
            parsers = Lampa.Parser.list();
        } else if (Lampa.Settings && Lampa.Settings.get('parsers')) {
            parsers = Lampa.Settings.get('parsers');
        }
        return parsers.filter(p => p.active !== false);
    }

    function getSelectedParser() {
        let saved = Lampa.Storage.get('v10_3_selected_parser');
        if (saved) return saved;
        const parsers = getActiveParsers();
        if (parsers.length) {
            const defaultParser = parsers[0].id;
            Lampa.Storage.set('v10_3_selected_parser', defaultParser);
            return defaultParser;
        }
        return null;
    }

    function setSelectedParser(parserId) {
        Lampa.Storage.set('v10_3_selected_parser', parserId);
    }

    // ==================== Воспроизведение через выбранный парсер ====================
    function playTorrent(item) {
        if (!item.magnet) {
            Lampa.Notification.show('Нет magnet-ссылки', 3000);
            return;
        }
        const parserId = getSelectedParser();
        if (!parserId) {
            Lampa.Notification.show('Нет активных парсеров', 3000);
            return;
        }
        const parsers = getActiveParsers();
        const parser = parsers.find(p => p.id === parserId);
        if (!parser) {
            Lampa.Notification.show('Выбранный парсер не найден', 3000);
            return;
        }
        // Используем стандартный механизм Lampa для торрентов
        if (Lampa.Torrent && Lampa.Torrent.play) {
            Lampa.Torrent.play(item.magnet, {
                title: item.search_title || item.title,
                parser: parser
            });
        } else if (Lampa.Player && Lampa.Player.play) {
            Lampa.Player.play(item.magnet, {
                title: item.search_title || item.title,
                type: 'torrent'
            });
        } else {
            // Fallback: открыть как обычное видео
            Lampa.Activity.push({
                component: 'movie',
                title: item.search_title || item.title,
                url: item.magnet,
                source: 'torrent'
            });
        }
    }

    // ==================== Компонент V10 3 ====================
    function V10_3_RutorNetflix(object) {
        const component = new Lampa.InteractionCategory(object);
        let scroll, tabs, filtersBar, parserSelect;
        let currentTab = 'top';
        let minSeeds = Lampa.Storage.get('v10_3_min_seeds') || 0;
        let sortBy = Lampa.Storage.get('v10_3_sort_by') || 'seeds';
        let magnetOnly = Lampa.Storage.get('v10_3_magnet_only') || false;

        component.create = function () {
            // Вкладки
            tabs = new Lampa.Tabs({
                tabs: [
                    { title: Lampa.Lang.translate('v10_3_top'), value: 'top' },
                    { title: Lampa.Lang.translate('v10_3_new'), value: 'new' },
                    { title: Lampa.Lang.translate('v10_3_recommend'), value: 'recommend' },
                    { title: Lampa.Lang.translate('v10_3_categories'), value: 'categories' },
                    { title: Lampa.Lang.translate('v10_3_search'), value: 'search' },
                    { title: Lampa.Lang.translate('v10_3_continue'), value: 'continue' },
                    { title: Lampa.Lang.translate('v10_3_favorite'), value: 'favorite' }
                ],
                onSelect: tab => {
                    currentTab = tab.value;
                    component.reload(true);
                }
            });
            component.html(tabs.render());

            // Панель фильтров + выбор парсера (Netflix-стиль)
            filtersBar = $('<div class="v10-3-filters" style="display:flex; justify-content:space-between; padding:10px 20px; background:#111; color:#fff; flex-wrap:wrap;"></div>');
            const leftGroup = $('<div style="display:flex; gap:20px;"></div>');
            const rightGroup = $('<div style="display:flex; gap:20px;"></div>');

            const seedsEl = $('<div class="filter-item" style="cursor:pointer;">Сиды: ' + minSeeds + '</div>');
            const sortEl = $('<div class="filter-item" style="cursor:pointer;">Сорт: ' + sortBy + '</div>');
            const magnetEl = $('<div class="filter-item" style="cursor:pointer;">Magnet: ' + (magnetOnly ? 'Да' : 'Нет') + '</div>');

            seedsEl.on('hover:enter', () => {
                let idx = seedsOptions.indexOf(minSeeds);
                minSeeds = seedsOptions[(idx + 1) % seedsOptions.length];
                seedsEl.text('Сиды: ' + minSeeds);
                Lampa.Storage.set('v10_3_min_seeds', minSeeds);
                component.reload(true);
            });

            sortEl.on('hover:enter', () => {
                let idx = sortOptions.indexOf(sortBy);
                sortBy = sortOptions[(idx + 1) % sortOptions.length];
                sortEl.text('Сорт: ' + sortBy);
                Lampa.Storage.set('v10_3_sort_by', sortBy);
                component.reload(true);
            });

            magnetEl.on('hover:enter', () => {
                magnetOnly = !magnetOnly;
                magnetEl.text('Magnet: ' + (magnetOnly ? 'Да' : 'Нет'));
                Lampa.Storage.set('v10_3_magnet_only', magnetOnly);
                component.reload(true);
            });

            leftGroup.append(seedsEl, sortEl, magnetEl);

            // Выпадающий список парсеров
            const parserId = getSelectedParser();
            const parsers = getActiveParsers();
            const parserTitle = parsers.find(p => p.id === parserId)?.name || parserId || 'Не выбран';
            const parserEl = $('<div class="filter-item" style="cursor:pointer;">Парсер: ' + parserTitle + '</div>');
            parserEl.on('hover:enter', () => {
                const items = parsers.map(p => ({ value: p.id, name: p.name || p.id }));
                if (items.length === 0) {
                    Lampa.Notification.show('Нет активных парсеров', 2000);
                    return;
                }
                new Lampa.Select({
                    title: Lampa.Lang.translate('v10_3_parser'),
                    items: items,
                    value: getSelectedParser(),
                    onSelect: (val) => {
                        setSelectedParser(val);
                        const newParser = parsers.find(p => p.id === val);
                        parserEl.text('Парсер: ' + (newParser?.name || val));
                        Lampa.Notification.show('Парсер изменён', 1500);
                    }
                }).open();
            });
            rightGroup.append(parserEl);

            filtersBar.append(leftGroup, rightGroup);
            component.html(filtersBar);

            scroll = new Lampa.Scroll({ mask: true, over: true, step: 290 });
            component.html(scroll.render());

            component.reload();
        };

        component.reload = async function (force) {
            if (!force && Date.now() - (component.lastUpdate || 0) < 25000) return;
            component.lastUpdate = Date.now();

            scroll.clear();
            scroll.append(Lampa.Template.get('loader', { text: Lampa.Lang.translate('v10_3_loading') }));

            try {
                let rawList = [];
                if (currentTab === 'top') rawList = await getTop();
                else if (currentTab === 'new') rawList = await getNew();
                else if (currentTab === 'recommend') {
                    const list = await getTop();
                    rawList = list.sort(() => Math.random() - 0.5);
                }
                else if (currentTab === 'categories') {
                    scroll.clear();
                    categories.forEach(cat => {
                        const card = Lampa.Card.create({ title: cat.title }, { large: true });
                        card.onEnter = () => getCategory(cat.url).then(list => renderList(list));
                        scroll.append(card);
                    });
                    return;
                }
                else if (currentTab === 'search') {
                    scroll.clear();
                    Lampa.Search.open({ onSearch: q => getCategory('https://rutor.info/search/' + encodeURIComponent(q)).then(list => renderList(list)) });
                    return;
                }
                else if (currentTab === 'continue') rawList = (Lampa.Storage.get('history') || []).slice(0, 30);
                else if (currentTab === 'favorite') rawList = Lampa.Favorite.get('movie') || [];

                renderList(rawList);
            } catch (e) {
                scroll.clear();
                scroll.append(Lampa.Template.get('empty', { text: Lampa.Lang.translate('v10_3_error') + ': ' + e.message }));
            }
        };

        function renderList(list) {
            scroll.clear();
            const filteredList = applyFilters(list, minSeeds, magnetOnly, sortBy);

            if (!filteredList.length) {
                scroll.append(Lampa.Template.get('empty'));
                return;
            }

            filteredList.forEach(item => {
                const card = Lampa.Card.create(item, { large: true });
                card.onHover = () => Lampa.Player?.preview?.(item.search_title || item.title, item.year);
                card.onEnter = () => playTorrent(item); // Используем новый метод с парсером
                scroll.append(card);
            });
        }

        component.onBack = () => component.reload(true);
        component.destroy = () => {
            scroll?.destroy();
            tabs?.destroy();
            filtersBar?.remove();
            network.clear();
        };
        return component;
    }

    // ==================== Добавление кнопки в левое меню ====================
    function addMenuButton() {
        const btn = $('<div class="menu__item menu__item--full"><div class="menu__ico" style="color:#e50914">🎬</div><div class="menu__text">V10 3</div></div>');
        btn.on('hover:enter', () => Lampa.Activity.push({ component: 'v10_3_rutor_netflix', title: 'V10 3 — RuTor с выбором парсера', page: 1 }));
        $('.menu .menu__list').eq(0).append(btn);
    }

    // ==================== Регистрация компонента и инициализация ====================
    function init() {
        Lampa.Component.add('v10_3_rutor_netflix', V10_3_RutorNetflix);
        addMenuButton();
        console.log('%c✅ V10 3 RuTor Netflix с выбором парсера загружен', 'color:#e50914;font-weight:bold');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();