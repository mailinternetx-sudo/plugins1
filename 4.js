(function () {
'use strict';
var SOURCE_NAME = 'V10';
var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
var TMDB_BG  = 'https://image.tmdb.org/t/p/original';

// 🎬 Категории с точными URL для парсинга
var CATEGORIES = [
    { title: 'Топ 24 часа',          url: 'top24'       },
    { title: 'Зарубежные фильмы',    url: 'kino'        }, // https://rutor.info/kino
    { title: 'Наши фильмы',          url: 'nashe_kino'  }, // https://rutor.info/nashe_kino
    { title: 'Зарубежные сериалы',   url: 'seriali'     }, // https://rutor.info/seriali
    { title: 'Русские сериалы',      url: 'nashi_seriali' }, // https://rutor.info/nashi_seriali
    { title: 'Телевизор',            url: 'televizor'   }, // https://rutor.info/tv (+ kino.pub/epg)
    { title: 'Юмор',                 url: 'humor'       }  // https://rutor.info/jumor (+ kino.pub/epg)
];

// ================================================================
//  УТИЛИТЫ ДЛЯ ПОСТЕРОВ
// ================================================================
function buildImg(item) {
    if (item.img && item.img.startsWith('http')) return item.img;
    if (item.poster_path) {
        if (item.poster_path.startsWith('http')) return item.poster_path;
        if (item.poster_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.poster_path;
        return TMDB_IMG + item.poster_path;
    }
    return '';
}

function buildBg(item) {
    if (item.background_image && item.background_image.startsWith('http')) return item.background_image;
    if (item.backdrop_path) {
        if (item.backdrop_path.startsWith('http')) return item.backdrop_path;
        if (item.backdrop_path.startsWith('/t/p/')) return 'https://image.tmdb.org' + item.backdrop_path;
        return TMDB_BG + item.backdrop_path;
    }
    return '';
}

// ================================================================
//  ОПРЕДЕЛЯЕМ ТИП КАРТОЧКИ — tv или movie
// ================================================================
function detectMediaMethod(item) {
    if (
        item.type === 'tv' ||
        item.number_of_seasons ||
        item.seasons ||
        item.first_air_date ||
        item.media_type === 'tv'
    ) {
        return 'tv';
    }
    return 'movie';
}

// ================================================================
//  ОПРЕДЕЛЕНИЕ ЯЗЫКА И СТРАНЫ
// ================================================================
function detectLanguageAndCountry(title, category) {
    // Русские категории
    var ruCategories = ['nashe_kino', 'nashi_seriali'];
    if (ruCategories.indexOf(category) !== -1) {
        return { original_language: 'ru', origin_country: ['RU'] };
    }
    
    // Телевизор/Юмор — определяем по наличию кириллицы
    if (category === 'televizor' || category === 'humor') {
        if (/[а-яА-ЯёЁ]/.test(title)) {
            return { original_language: 'ru', origin_country: ['RU'] };
        }
        return { original_language: 'en', origin_country: ['US'] };
    }
    
    // Зарубежные категории
    if (/[а-яА-ЯёЁ]/.test(title)) {
        // Есть кириллица — возможно, русский дубляж
        return { original_language: 'ru', origin_country: ['RU'] };
    }
    return { original_language: 'en', origin_country: ['US'] };
}

// ================================================================
//  НОРМАЛИЗАЦИЯ КАРТОЧКИ
// ================================================================
function normalizeCard(item, category) {
    var img = buildImg(item);
    var bg  = buildBg(item);

    var posterPath = item.poster_path || '';
    if (posterPath &&
        !posterPath.startsWith('/t/p/') &&
        !posterPath.startsWith('http')) {
        posterPath = '/t/p/w500' + posterPath;
    }

    var backdropPath = item.backdrop_path || '';
    if (backdropPath &&
        !backdropPath.startsWith('/t/p/') &&
        !backdropPath.startsWith('http')) {
        backdropPath = '/t/p/original' + backdropPath;
    }

    var title = item.title || item.name || '';
    
    // 🌍 Добавляем язык и страну
    var langData = detectLanguageAndCountry(title, category);

    var type   = item.type || 'movie';
    var method = detectMediaMethod(item);

    return {
        id:                   item.id,
        title:                title,
        name:                 item.name            || title,
        original_title:       item.original_title  || title,
        original_name:        item.original_name   || title,
        overview:             item.overview        || '',

        poster_path:          posterPath,
        backdrop_path:        backdropPath,
        img:                  img,
        background_image:     bg,

        vote_average:         item.vote_average      || 0,
        vote_count:           item.vote_count        || 0,
        release_date:         item.release_date      || '',
        first_air_date:       item.first_air_date    || '',
        number_of_seasons:    item.number_of_seasons || undefined,

        type:                 type,
        method:               method,
        media_type:           method,
        release_quality:      item.release_quality   || '',
        source:               SOURCE_NAME,

        // 🌍 Новые поля для фильтрации
        original_language:    item.original_language || langData.original_language,
        origin_country:       item.origin_country    || langData.origin_country,

        promo_title:          item.promo_title || title,
        promo:                item.promo       || item.overview || ''
    };
}

// ================================================================
//  API SERVICE
// ================================================================
function RutorApiService() {
    var self    = this;
    self.network = new Lampa.Reguest();

    self.fetch = function (url, onComplete, onError) {
        self.network.silent(
            url,
            function (json) {
                if (!json || !json.results) { onComplete([]); return; }
                // Передаём category для корректного определения языка
                var category = url.match(/\/([^\/\?]+)(?:\?|$)/);
                var catName = category ? category[1] : '';
                onComplete(json.results.map(function(item) { 
                    return normalizeCard(item, catName); 
                }));
            },
            function (err) {
                console.warn('[V10] fetch error:', url, err);
                if (onError) onError(err);
                else onComplete([]);
            }
        );
    };

    self.search = function (params, onComplete, onError) {
        var query = (params.query || '').trim();
        if (!query) { onComplete({ results: [] }); return; }

        var url = WORKER_URL + 'search?query=' + encodeURIComponent(query);

        self.network.silent(
            url,
            function (json) {
                if (!json || !json.results) { onComplete({ results: [] }); return; }
                onComplete({
                    results:      json.results.map(function(item) { 
                        return normalizeCard(item, ''); 
                    }),
                    page:         json.page        || 1,
                    total_pages:  json.total_pages || 1
                });
            },
            function () { onComplete({ results: [] }); }
        );
    };

    self.category = function (params, onSuccess, onError) {
        var rows  = [];
        var total = CATEGORIES.length;
        var done  = 0;

        CATEGORIES.forEach(function (cat) {
            var url = WORKER_URL + cat.url + '?page=1&page_size=25'; // 🔹 25 элементов

            self.fetch(url, function (items) {
                // 📺 Телевизор и Юмор — добавляем данные из плагинов
                if (cat.url === 'televizor' || cat.url === 'humor') {
                    mergeWithPlugins(items, cat.url, function(merged) {
                        pushRow(cat, merged);
                    });
                } else {
                    pushRow(cat, items);
                }
            });
        });

        function pushRow(cat, items) {
            rows.push({
                title:   cat.title,
                results: items,
                url:     cat.url,
                source:  SOURCE_NAME
            });

            done++;
            if (done === total) {
                rows.sort(function (a, b) {
                    var ia = CATEGORIES.findIndex(function (c) { return c.url === a.url; });
                    var ib = CATEGORIES.findIndex(function (c) { return c.url === b.url; });
                    return ia - ib;
                });
                onSuccess(rows);
            }
        }
    };

    // 🔄 Объединение с данными из kino.pub / epg
    function mergeWithPlugins(items, category, callback) {
        var pluginItems = [];
        
        // Пробуем kino.pub
        if (window.Lampa && Lampa.Plugin && Lampa.Plugin.kinopub) {
            try {
                var kinopubData = Lampa.Plugin.kinopub.getCategory(category);
                if (kinopubData && Array.isArray(kinopubData)) {
                    pluginItems = pluginItems.concat(kinopubData.slice(0, 10));
                }
            } catch(e) { console.warn('[V10] kinopub error:', e); }
        }
        
        // Пробуем epg
        if (window.Lampa && Lampa.EPG) {
            try {
                var epgData = Lampa.EPG.getProgram(category === 'televizor' ? 'tv' : 'entertainment');
                if (epgData && Array.isArray(epgData)) {
                    pluginItems = pluginItems.concat(epgData.slice(0, 10));
                }
            } catch(e) { console.warn('[V10] epg error:', e); }
        }
        
        // Объединяем, убираем дубликаты по title
        var merged = items.slice(0, 15); // 15 с rutor
        pluginItems.forEach(function(pItem) {
            if (merged.length >= 25) return;
            var exists = merged.some(function(mItem) {
                return mItem.title === pItem.title || mItem.name === pItem.title;
            });
            if (!exists) {
                // Нормализуем элемент плагина
                merged.push(normalizeCard(Object.assign({
                    id: pItem.id || ('plugin_' + Date.now() + Math.random()),
                    title: pItem.title || pItem.name || '',
                    name: pItem.name || pItem.title || '',
                    overview: pItem.description || pItem.overview || '',
                    poster_path: pItem.poster || pItem.img || '',
                    backdrop_path: pItem.backdrop || '',
                    first_air_date: pItem.date || pItem.premiere || '',
                    type: category === 'televizor' ? 'tv' : 'movie'
                }, pItem), category));
            }
        });
        
        callback(merged.slice(0, 25));
    }

    self.list = function (params, onComplete, onError) {
        var page     = params.page     || 1;
        var pageSize = Math.min(params.page_size || 25, 25); // 🔹 Максимум 25
        var url = WORKER_URL + params.url +
                  '?page='      + page +
                  '&page_size=' + pageSize;

        self.network.silent(
            url,
            function (json) {
                if (!json || !json.results) { onComplete({ results: [] }); return; }
                var category = params.url || '';
                onComplete({
                    results:       json.results.map(function(item) { 
                        return normalizeCard(item, category); 
                    }),
                    page:          json.page          || page,
                    total_pages:   json.total_pages   || 1,
                    total_results: json.total_results || json.results.length
                });
            },
            function () { onComplete({ results: [] }); }
        );
    };

    self.full = function (params, onSuccess, onError) {
        var card = params.card || params;

        var method = detectMediaMethod(card);
        params.method = method;
        if (card && typeof card === 'object') {
            card.method = method;
            card.type   = method;
            card.media_type = method;
        }

        var savedImg     = params.img              || (card && card.img)              || '';
        var savedBg      = params.background_image || (card && card.background_image) || '';
        var savedQuality = params.release_quality  || (card && card.release_quality)  || '';
        var savedLang    = card.original_language  || '';
        var savedCountry = card.origin_country     || [];

        function fallbackFull(data) {
            data = data || {};
            if (!data.title) data.title = card.title || card.name || '';
            if (!data.img && savedImg) data.img = savedImg;
            if (!data.background_image && savedBg) data.background_image = savedBg;
            if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
            if (!data.original_language && savedLang) data.original_language = savedLang;
            if (!data.origin_country && savedCountry.length) data.origin_country = savedCountry;
            
            data.type         = method;
            data.method       = method;
            data.media_type   = method;
            
            for (var k in card) {
                if (card.hasOwnProperty(k) && data[k] === undefined) {
                    data[k] = card[k];
                }
            }
            onSuccess(data);
        }

        if (!card.id || card.id <= 0 || String(card.id).length < 3) {
            fallbackFull({});
            return;
        }

        Lampa.Api.sources.tmdb.full(params, function (data) {
            if (!data || !data.title) {
                fallbackFull(data);
            } else {
                if (!data.img && savedImg) data.img = savedImg;
                if (!data.background_image && savedBg) data.background_image = savedBg;
                if (!data.release_quality && savedQuality) data.release_quality = savedQuality;
                // Сохраняем язык/страну из исходной карточки
                if (savedLang) data.original_language = savedLang;
                if (savedCountry.length) data.origin_country = savedCountry;
                
                data.type         = method;
                data.method       = method;
                data.media_type   = method;
                onSuccess(data);
            }
        }, function (err) {
            console.warn('[V10] TMDB full error:', err);
            fallbackFull({});
        });
    };
}

// ================================================================
//  ПУНКТ МЕНЮ (иконка катаны + название V10)
// ================================================================
function addMenuItem() {
    if ($('.menu__item[data-action="v10"]').length) return;

    var item = $(
        '<li class="menu__item selector" data-action="v10">' +
        '<div class="menu__ico">' +
        '<svg height="36" viewBox="0 0 24 24" width="36" fill="currentColor">' +
        '<path d="M12 2L10 22H14L12 2Z M11 6H13V18H11V6Z"/>' +
        '</svg>' +
        '</div>' +
        '<div class="menu__text">' + SOURCE_NAME + '</div>' +
        '</li>'
    );

    item.on('hover:enter', function () {
        Lampa.Activity.push({
            title:     SOURCE_NAME,
            component: 'category',
            source:    SOURCE_NAME,
            method:    'category'
        });
    });

    var $after = $('.menu__list [data-action="movie"], .menu__list [data-action="tv"]').first().parent();
    if ($after.length) $after.after(item);
    else $('.menu__list').append(item);
}

// ================================================================
//   INIT
// ================================================================
function init() {
    if (window.v10_plugin_ready) return;
    window.v10_plugin_ready = true;

    Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();

    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready' || e.type === 'render') {
            setTimeout(addMenuItem, 1000);
        }
    });

    setTimeout(addMenuItem, 2000);
}

if (window.appready) init();
else {
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') init();
    });
}
})();
