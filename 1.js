(function () {
    'use strict';

    var SOURCE_NAME = 'Rutor Pro';
    var WORKER_URL  = 'https://my-proxy-worker.mail-internetx.workers.dev/';

    function detectMediaMethod(item) {
        // Приоритет явному типу из воркера
        if (item.type === 'tv') return 'tv';
        if (item.type === 'movie') return 'movie';
        // Фолбэк по наличию полей сериала
        return (item.number_of_seasons || item.first_air_date) ? 'tv' : 'movie';
    }

    function normalizeCard(item) {
        var method = detectMediaMethod(item);
        return {
            id: item.id,
            title: item.title || '',
            type: item.type || method,
            method: method, // Поле важно для API Lampa
            img: item.img || '',
            release_date: item.release_date || '',
            first_air_date: item.first_air_date || '',
            source: SOURCE_NAME
        };
    }

    function RutorApiService() {
        var self = this;
        self.network = new Lampa.Reguest();

        self.category = function (params, onSuccess) {
             // Реализация аналогична вашему коду, вызывает fetch для каждой категории
        };

        self.list = function (params, onComplete) {
            var url = WORKER_URL + params.url;
            self.network.silent(url, function (json) {
                onComplete({ results: (json.results || []).map(normalizeCard) });
            }, function () { onComplete({ results: [] }); });
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card || params;
            
            // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: принудительно задаем метод для TMDB API
            params.method = detectMediaMethod(card);

            Lampa.Api.sources.tmdb.full(params, function (data) {
                if (data && params.method === 'tv') data.type = 'tv';
                onSuccess(data);
            }, onError);
        };
    }

    function init() {
        if (window.rutor_pro_ready) return;
        window.rutor_pro_ready = true;
        Lampa.Api.sources[SOURCE_NAME] = new RutorApiService();
        // Добавление в меню...
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
