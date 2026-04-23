(function () {
    'use strict';

    const SOURCE = 'Rutor Pro';
    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/'; // Замените на адрес вашего worker'а

    const CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа',   path: 'lampac_top24' },
        { title: '🎬 Зарубежные фильмы',         path: 'lampac_movies' },
        { title: '🇷🇺 Наши фильмы',              path: 'lampac_movies_ru' },
        { title: '📺 Зарубежные сериалы',        path: 'lampac_tv_shows' },
        { title: '🇷🇺 Наши сериалы',             path: 'lampac_tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)',   path: 'lampac_televizor' }
    ];

    // Универсальный запрос к worker'у
    async function apiRequest(endpoint, params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = `${PROXY}${endpoint}${query ? '?' + query : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    // Генерация временного ID, если API не дал
    function generateId(str) {
        if (!str) return Math.floor(Math.random() * 1000000);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    // Нормализация элемента для Lampa
    function normalizeItem(item, provider = null) {
        const id = item.id || generateId(item.original_title || item.title);
        const poster = item.poster_path || item.img || '';
        const finalPoster = poster || 'https://via.placeholder.com/300x450?text=No+Poster';

        return {
            id: id,
            title: item.title || item.name,
            name: item.name || item.title,
            original_title: item.original_title,
            original_name: item.original_name,
            overview: item.overview || 'Описание временно отсутствует',
            poster: finalPoster,
            poster_path: finalPoster,
            backdrop_path: item.backdrop_path || finalPoster,
            img: finalPoster,
            vote_average: item.vote_average || 0,
            release_date: item.release_date,
            first_air_date: item.first_air_date,
            media_type: (item.type === 'tv' || item.is_tv) ? 'tv' : 'movie',
            type: item.type,
            provider: provider || (item.original_language === 'ru' ? 'kinopoisk' : 'tmdb'),
            source: SOURCE
        };
    }

    // API для Lampa
    function Api() {
        // Список категорий или результатов
        this.category = async function (params, onSuccess, onError) {
            try {
                const url = params.url;      // если пусто – главный экран
                const page = params.page || 1;

                // Главный экран – показываем строки-категории
                if (!url) {
                    const lines = CATEGORIES.map(cat => ({
                        title: cat.title,
                        url: cat.path,
                        type: 'line',
                        source: SOURCE,
                        page: 1,
                        more: true
                    }));
                    onSuccess({ results: lines, page: 1, total_pages: 1, more: false });
                    return;
                }

                // Загрузка конкретной категории
                const data = await apiRequest(url, { page });
                const results = (data.results || []).map(item => normalizeItem(item));
                const response = {
                    results: results,
                    page: data.page || page,
                    total_pages: data.total_pages || 1,
                    more: (data.page || page) < (data.total_pages || 1),
                    source: SOURCE,
                    url: url
                };
                onSuccess(response);
            } catch (e) {
                console.error('[Rutor Pro] category error:', e);
                onError(e);
            }
        };

        // Детальная карточка (full)
        this.full = async function (params, onSuccess, onError) {
            try {
                const card = params.card;
                if (!card || !card.id) throw new Error('Invalid card');

                const provider = card.provider || (card.original_language === 'ru' ? 'kinopoisk' : 'tmdb');
                const type = card.media_type === 'tv' ? 'tv' : 'movie';

                if (provider === 'kinopoisk') {
                    // Запрашиваем полную информацию через worker
                    const fullData = await apiRequest('full', { id: card.id, type: type, provider: 'kinopoisk' });
                    const normalized = normalizeItem(fullData, 'kinopoisk');
                    onSuccess(normalized);
                } else {
                    // Для TMDB используем штатный метод Lampa (можно и через worker, но оставим стандарт)
                    Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
                }
            } catch (e) {
                console.error('[Rutor Pro] full error:', e);
                onError(e);
            }
        };
    }

    // Добавление кнопки в главное меню
    function addButton() {
        const tryAdd = () => {
            const menu = document.querySelector('.menu .menu__list');
            if (!menu) return setTimeout(tryAdd, 500);
            if (document.querySelector('[data-rutor-pro]')) return;

            const li = document.createElement('li');
            li.className = 'menu__item selector';
            li.setAttribute('data-rutor-pro', '1');
            li.innerHTML = `<div class="menu__ico">🔥</div><div class="menu__text">${SOURCE}</div>`;
            li.addEventListener('hover:enter', () => {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE,
                    title: SOURCE
                });
            });
            menu.appendChild(li);
        };
        tryAdd();
    }

    // Инициализация
    function start() {
        if (Lampa.Api.sources[SOURCE]) return;
        Lampa.Api.sources[SOURCE] = new Api();
        addButton();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });
})();
