(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const BASE = 'https://my-proxy-worker.mail-internetx.workers.dev/';

// === КАТЕГОРИИ (ВАЖНО: ТАК КАК WORKER ИХ НЕ ДАЕТ) ===
const CATEGORIES = [
  { id:'top24', title:'🔥 Топ за 24 часа', url:'lampac_top24' },
  { id:'movies', title:'🎬 Зарубежные фильмы', url:'lampac_movies' },
  { id:'movies_ru', title:'🇷🇺 Наши фильмы', url:'lampac_movies_ru' },
  { id:'tv', title:'📺 Зарубежные сериалы', url:'lampac_tv_shows' },
  { id:'tv_ru', title:'🇷🇺 Наши сериалы', url:'lampac_tv_shows_ru' },
  { id:'tvz', title:'📡 ТВ', url:'lampac_televizor' }
];

// === API ===
function Api() {

  this.get = function (url, ok, err) {
    fetch(url)
      .then(r => r.json())
      .then(ok)
      .catch(err || function(){});
  };

  // ✅ КАТЕГОРИИ (КЛЮЧЕВОЙ ФИКС)
  this.category = (params, onSuccess) => {
    params = params || {};

    if (!params.url) {
      onSuccess({
        results: CATEGORIES.map(c => ({
          id: 'rutor_' + c.id,
          title: c.title,
          name: c.title,
          url: c.url,
          type: 'category',
          poster_path: '/img/img_broken.svg',
          source: SOURCE
        }))
      });
      return;
    }

    this.list(params, onSuccess);
  };

  // ✅ СПИСОК
  this.list = (params, onSuccess, onError) => {
    const url = BASE + params.url;

    this.get(url, (json) => {
      onSuccess({
        results: json.results || [],
        page: json.page || 1,
        total_pages: json.total_pages || 1,
        total_results: json.total_results || 0
      });
    }, onError);
  };

  // ✅ FULL (МИНИМАЛЬНЫЙ И СТАБИЛЬНЫЙ)
  this.full = (params, onSuccess) => {
    const card = params.card || {};

    // переход в категорию
    if (card.type === 'category') {
      Lampa.Activity.push({
        title: card.title,
        component: 'category',
        source: SOURCE,
        url: card.url
      });
      onSuccess(card);
      return;
    }

    // TMDB подхватит автоматически
    onSuccess(card);
  };
}

// === РЕГИСТРАЦИЯ ===
const api = new Api();

if (window.Lampa && Lampa.Api && Lampa.Api.sources) {
  Lampa.Api.sources.rutorpro = api;

  Object.defineProperty(Lampa.Api.sources, SOURCE, {
    get: () => api
  });
}

// === МЕНЮ ===
Lampa.Listener.follow('app', function (e) {
  if (e.type === 'ready') {

    Lampa.Component.add('rutor', {
      render: function () {
        Lampa.Activity.push({
          title: SOURCE,
          component: 'category',
          source: SOURCE
        });
      }
    });

    Lampa.Menu.add({
      title: SOURCE,
      component: 'rutor',
      icon: '🔥'
    });

  }
});

})();
