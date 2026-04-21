(function() {
    'use strict';

    const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/?url=';  // ВАЖНО: заканчивается на ?url=
    const TMDB_KEY = 'f348b4586d1791a40d99edd92164cb86';

    const CATEGORIES = {
        'Топ 24ч': 'https://new-rutor.org/top/',
        'Зарубежные фильмы': 'https://new-rutor.org/top/foreign_films/',
        'Наши фильмы': 'https://new-rutor.org/top/russian_films/',
        'Зарубежные сериалы': 'https://new-rutor.org/top/foreign_series/',
        'Наши сериалы': 'https://new-rutor.org/top/russian_series/',
        'Телевизор': 'https://new-rutor.org/top/tv/'
    };

    function extractYear(name) {
        let match = name.match(/\((\d{4})\)/);
        return match ? match[1] : null;
    }

    function loadCategory(title) {
        let url = CATEGORIES[title];
        if (!url) return;

        Lampa.Activity.push({
            title: title,
            component: 'category_full',
            results: [],
            loading: true
        });

        // ПРАВИЛЬНЫЙ ЗАПРОС: параметр url передаётся явно
        fetch(PROXY + encodeURIComponent(url))
            .then(r => r.json())
            .then(items => {
                let activity = Lampa.Activity.active();
                if (!activity) return;
                activity.loading(false);

                if (!Array.isArray(items)) {
                    console.error('Worker вернул не массив:', items);
                    Lampa.Notify.show('Ошибка: Worker вернул не массив', 3000);
                    return;
                }

                items.slice(0, 40).forEach(item => {
                    let rawName = item.name;
                    if (!rawName || rawName.includes('XXX')) return;

                    let year = extractYear(rawName);
                    let cleanName = rawName.replace(/\(?\d{4}\)?/, '').trim();

                    let tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanName)}`;
                    fetch(tmdbUrl)
                        .then(res => res.json())
                        .then(data => {
                            let results = data.results || [];
                            let best = results.find(r => year ? (r.release_date || r.first_air_date || '').includes(year) : true);
                            if (!best && results.length) best = results[0];
                            if (best) {
                                activity.append([{
                                    id: best.id,
                                    title: best.title || best.name,
                                    poster: best.poster_path ? 'https://image.tmdb.org/t/p/w500' + best.poster_path : null,
                                    description: best.overview,
                                    year: (best.release_date || best.first_air_date || '').slice(0, 4),
                                    type: best.media_type === 'tv' ? 'tv' : 'movie'
                                }]);
                            }
                        })
                        .catch(e => console.warn('TMDB error:', e));
                });
            })
            .catch(e => {
                console.error('Proxy error:', e);
                Lampa.Notify.show('Ошибка загрузки с прокси', 3000);
                let activity = Lampa.Activity.active();
                if (activity) activity.loading(false);
            });
    }

    // Добавляем пункт в меню
    Lampa.Menu.add({
        title: 'Rutor Pro',
        icon: '🔥',
        onSelect: () => {
            Lampa.Select.show({
                title: 'Категории new-rutor',
                items: Object.keys(CATEGORIES).map(t => ({ title: t })),
                onSelect: (item) => loadCategory(item.title)
            });
        }
    });
})();
