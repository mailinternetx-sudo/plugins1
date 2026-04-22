(function(){
  const SOURCE = 'Rutor Pro';
  const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/'; // сюда ваш URL
  const TMDB_KEY = 'f348b4586d1791a40d99edd92164cb86';

  let queue = [], running = 0, MAX = 3;
  function addTask(task) {
    queue.push(task);
    runQueue();
  }
  function runQueue() {
    if (running >= MAX || queue.length === 0) return;
    running++;
    let task = queue.shift();
    task(() => { running--; runQueue(); });
    runQueue();
  }

  function searchTMDB(item, callback) {
    let query = item.alt || item.title;
    addTask(done => {
      fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
          let first = data.results?.[0];
          if (first) {
            callback({
              id: first.id,
              title: first.title || first.name,
              poster_path: first.poster_path ? 'https://image.tmdb.org/t/p/w500'+first.poster_path : '',
              backdrop_path: first.backdrop_path ? 'https://image.tmdb.org/t/p/w780'+first.backdrop_path : '',
              type: first.media_type || (first.first_air_date ? 'tv' : 'movie')
            });
          } else callback(null);
          done();
        })
        .catch(e => { console.error(e); callback(null); done(); });
    });
  }

  function Api() {
    this.category = function(params, onSuccess, onError) {
      fetch(PROXY)
        .then(r => r.json())
        .then(categories => {
          let parts = [];
          let categoryTasks = [];

          for (let catName in categories) {
            let row = { title: catName, results: [], type: 'line' };
            parts.push(row);
            let items = categories[catName].slice(0, 30);
            let itemTasks = items.map(item => {
              return new Promise(resolve => {
                searchTMDB(item, card => {
                  if (card) row.results.push(card);
                  resolve();
                });
              });
            });
            categoryTasks.push(...itemTasks);
          }

          Promise.all(categoryTasks).then(() => onSuccess(parts));
        })
        .catch(onError);
    };
    this.full = function(item, onSuccess, onError) {
      Lampa.Api.sources.tmdb.full(item, onSuccess, onError);
    };
  }

  function addMenuButton() {
    let checkExist = setInterval(() => {
      let menu = document.querySelector('.menu .menu__list');
      if (menu && !document.querySelector('[data-rutor-pro]')) {
        clearInterval(checkExist);
        let li = document.createElement('li');
        li.className = 'menu__item selector';
        li.setAttribute('data-rutor-pro', '1');
        li.innerHTML = '<div class="menu__ico">🔥</div><div class="menu__text">Rutor Pro</div>';
        li.addEventListener('hover:enter', () => {
          Lampa.Activity.push({
            component: 'category',
            source: SOURCE,
            title: SOURCE
          });
        });
        menu.appendChild(li);
      }
    }, 500);
  }

  function init() {
    Lampa.Api.sources[SOURCE] = new Api();
    addMenuButton();
  }

  if (window.Lampa && Lampa.Listener) {
    if (Lampa.Listener.follow) {
      Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
    } else {
      setTimeout(init, 1000);
    }
  } else {
    setTimeout(init, 1000);
  }
})();
