(function () {

    'use strict';

    var SOURCE_NAME = 'V10';

    var WORKER_URL =
        'https://my-proxy-worker.mail-internetx.workers.dev/';

    var TMDB_IMG =
        'https://image.tmdb.org/t/p/w500';

    var TMDB_BG =
        'https://image.tmdb.org/t/p/original';

    var CATEGORIES = [

        {
            title: 'Топ 24 часа',
            url: 'top24'
        },

        {
            title: 'Зарубежные фильмы',
            url: 'movies'
        },

        {
            title: 'Наши фильмы',
            url: 'movies_ru'
        },

        {
            title: 'Зарубежные сериалы',
            url: 'tv_shows'
        },

        {
            title: 'Русские сериалы',
            url: 'tv_shows_ru'
        },

        {
            title: 'Телевизор',
            url: 'televizor'
        },

        {
            title: 'Юмор',
            url: 'humor'
        }
    ];

    function buildImg(item) {

        if (
            item.img &&
            item.img.startsWith('http')
        ) {
            return item.img;
        }

        if (item.poster_path) {

            if (
                item.poster_path.startsWith('http')
            ) {
                return item.poster_path;
            }

            if (
                item.poster_path.startsWith('/t/p/')
            ) {
                return 'https://image.tmdb.org' +
                    item.poster_path;
            }

            return TMDB_IMG + item.poster_path;
        }

        return '';
    }

    function buildBg(item) {

        if (
            item.background_image &&
            item.background_image.startsWith('http')
        ) {
            return item.background_image;
        }

        if (item.backdrop_path) {

            if (
                item.backdrop_path.startsWith('http')
            ) {
                return item.backdrop_path;
            }

            if (
                item.backdrop_path.startsWith('/t/p/')
            ) {
                return 'https://image.tmdb.org' +
                    item.backdrop_path;
            }

            return TMDB_BG + item.backdrop_path;
        }

        return '';
    }

    function detectMediaMethod(item) {

        if (!item) return 'movie';

        if (

            item.type === 'tv' ||

            item.media_type === 'tv' ||

            item.number_of_seasons > 0 ||

            (
                Array.isArray(item.seasons) &&
                item.seasons.length
            ) ||

            (
                item.first_air_date &&
                String(item.first_air_date).length > 3
            )
        ) {
            return 'tv';
        }

        return 'movie';
    }

    function normalizeCard(item) {

        var img = buildImg(item);
        var bg  = buildBg(item);

        var posterPath =
            item.poster_path || '';

        if (

            posterPath &&

            !posterPath.startsWith('/t/p/') &&

            !posterPath.startsWith('http')

        ) {
            posterPath =
                '/t/p/w500' + posterPath;
        }

        var backdropPath =
            item.backdrop_path || '';

        if (

            backdropPath &&

            !backdropPath.startsWith('/t/p/') &&

            !backdropPath.startsWith('http')

        ) {
            backdropPath =
                '/t/p/original' + backdropPath;
        }

        var title =
            item.title ||
            item.name ||
            '';

        var type =
            item.type || 'movie';

        var method =
            detectMediaMethod(item);

        return {

            id:
                item.id,

            title:
                title,

            name:
                item.name || title,

            original_title:
                item.original_title || title,

            overview:
                item.overview || '',

            poster_path:
                posterPath,

            backdrop_path:
                backdropPath,

            img:
                img,

            background_image:
                bg,

            vote_average:

                isNaN(
                    parseFloat(item.vote_average)
                )

                    ? 0

                    : parseFloat(item.vote_average),

            release_date:
                item.release_date || '',

            first_air_date:
                item.first_air_date || '',

            number_of_seasons:
                item.number_of_seasons || undefined,

            origin_country:

                item.origin_country &&
                item.origin_country.length

                    ? item.origin_country

                    : (

                        item.original_language === 'ru'

                            ? ['RU']

                            : ['US']
                    ),

            original_language:

                item.original_language ||

                (
                    item.origin_country &&
                    item.origin_country[0] === 'RU'

                        ? 'ru'

                        : 'en'
                ),

            type:
                type,

            method:
                method,

            release_quality:
                item.release_quality || '',

            source:
                SOURCE_NAME,

            promo_title:
                item.promo_title || title,

            promo:
                item.promo ||
                item.overview ||
                ''
        };
    }

    function RutorApiService() {

        var self = this;

        self.network =
            new Lampa.Reguest();

        self.fetch = function (
            url,
            onComplete,
            onError
        ) {

            self.network.silent(

                url,

                function (json) {

                    if (
                        !json ||
                        !json.results
                    ) {

                        onComplete([]);
                        return;
                    }

                    onComplete(

                        json.results.map(
                            normalizeCard
                        )
                    );
                },

                function (err) {

                    console.warn(
                        '[V10] fetch error:',
                        url,
                        err
                    );

                    if (onError) {
                        onError(err);
                    }
                    else {
                        onComplete([]);
                    }
                }
            );
        };

        self.search = function (
            params,
            onComplete
        ) {

            var query =
                (params.query || '').trim();

            if (!query) {

                onComplete({
                    results: []
                });

                return;
            }

            var url =

                WORKER_URL +

                'search?query=' +

                encodeURIComponent(query);

            self.network.silent(

                url,

                function (json) {

                    if (
                        !json ||
                        !json.results
                    ) {

                        onComplete({
                            results: []
                        });

                        return;
                    }

                    onComplete({

                        results:

                            json.results.map(
                                normalizeCard
                            ),

                        page:
                            json.page || 1,

                        total_pages:
                            json.total_pages || 1
                    });
                },

                function () {

                    onComplete({
                        results: []
                    });
                }
            );
        };
