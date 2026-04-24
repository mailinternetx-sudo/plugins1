(function(){
    var SOURCE = 'Rutor Pro';
    var PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
    var CATEGORIES = [
        { title: '🔥 Топ торренты за 24 часа',   path: 'lampac_top24' },
        { title: '🎬 Зарубежные фильмы',         path: 'lampac_movies' },
        { title: '🇷🇺 Наши фильмы',              path: 'lampac_movies_ru' },
        { title: '📺 Зарубежные сериалы',        path: 'lampac_tv_shows' },
        { title: '🇷🇺 Наши сериалы',             path: 'lampac_tv_shows_ru' },
        { title: '📡 Телевизор (ТВ-передачи)',   path: 'lampac_televizor' }
    ];

    function xhrGet(url, onSuccess, onError) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { onSuccess(JSON.parse(xhr.responseText)); } catch(e) { onError(e); }
                } else { onError(new Error('HTTP '+xhr.status)); }
            }
        };
        xhr.onerror = onError;
        xhr.send();
    }

    function normalizeItem(item) {
        var dateStr = item.release_date || item.first_air_date || '';
        var year = dateStr ? parseInt(dateStr.substring(0, 4)) : 0;

        return {
            id: item.id || 0,
            title: item.title || item.name || 'Без названия',
            original_title: item.original_title || '',
            poster: item.poster_path || '',
            backdrop: item.backdrop_path || '',
            media_type: (item.media_type === 'tv') ? 'tv' : 'movie',
            overview: item.overview || '',
            year: year,
            vote_average: parseFloat(item.vote_average) || 0,
            source: SOURCE
        };
    }

    function Api(){
        this.category = function(params, onSuccess, onError){
            if(!params.url){
                var lines = [];
                for(var i=0; i<CATEGORIES.length; i++){
                    lines.push({
                        id: 'rutor_cat_' + i,
                        title: CATEGORIES[i].title,
                        url: CATEGORIES[i].path
                    });
                }
                onSuccess({ results: lines });
                return;
            }
            
            var page = params.page || 1;
            xhrGet(PROXY + params.url + '?page=' + page,
                function(data){
                    var results = (data.results || []).map(normalizeItem);
                    onSuccess({
                        results: results,
                        page: data.page || page,
                        total_pages: data.total_pages || 1,
                        more: (data.page || page) < (data.total_pages || 1),
                        url: params.url
                    });
                },
                function(err) {
                    console.error('Rutor Pro: Ошибка запроса категории', err);
                    onError(err);
                }
            );
        };

        this.full = function(params, onSuccess, onError){
            if(Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.full) {
                Lampa.Api.sources.tmdb.full(params, onSuccess, function(e) {
                    onError('Skip TMDB, use cached data');
                });
            } else {
                onError('TMDB unavailable');
            }
        };
    }

    if(!Lampa.Api.sources[SOURCE]) Lampa.Api.sources[SOURCE] = new Api();

    function initMenu() {
        var menu = document.querySelector('.menu .menu__list') || document.querySelector('.menu__list');
        
        if (menu && !document.querySelector('[data-rutor-pro-array]')) {
            var li = document.createElement('li');
            li.className = 'menu__item selector';
            li.setAttribute('data-rutor-pro-array','1');
            li.innerHTML = '<div class="menu__ico">🔥</div><div class="menu__text">'+SOURCE+'</div>';
            li.addEventListener('hover:enter', function(){
                Lampa.Activity.push({ component:'category', source:SOURCE, title:SOURCE });
            });
            menu.appendChild(li);
            console.log('Rutor Pro: Успешно загружен!');
            return true;
        }
        return false;
    }

    if (!initMenu()) {
        var observer = new MutationObserver(function(mutations, obs) {
            if (initMenu()) obs.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(function() { observer.disconnect(); }, 10000);
    }
})();
