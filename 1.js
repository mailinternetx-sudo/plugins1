(function () {
'use strict';

const SOURCE = 'Rutor Pro';
const PROXY = 'https://my-proxy-worker.mail-internetx.workers.dev/';
const TMDB = 'https://api.themoviedb.org/3/search/multi?api_key=f348b4586d1791a40d99edd92164cb86&query=';

let queue = [];
let active = 0;
const MAX = 5;

// ---------------- QUEUE ----------------
function run(){
  if(active>=MAX||!queue.length)return;
  let job=queue.shift();active++;
  job(()=>{active--;run();});
  run();
}

function add(fn){queue.push(fn);run();}

// ---------------- SEARCH ----------------
function search(item,cb){

  add(done=>{
    fetch(TMDB + encodeURIComponent(item.title))
      .then(r=>r.json())
      .then(j=>{
        let r = (j.results||[])[0];
        if(!r) return done();

        cb({
          id:r.id,
          title:r.title||r.name,
          poster_path:r.poster_path,
          backdrop_path:r.backdrop_path,
          type:r.media_type
        });

        done();
      })
      .catch(()=>done());
  });
}

// ---------------- API ----------------
function Api(){

  this.category = function (params, onSuccess, onError){

    fetch(PROXY + '?v=' + Date.now())
    .then(r=>r.json())
    .then(data=>{

      let parts = [];

      Object.keys(data).forEach(cat=>{

        let row = {
          title: cat,
          results: [],
          type: 'line'
        };

        parts.push(row);

        (data[cat] || []).slice(0,30).forEach(item=>{

          search(item,res=>{
            if(!res) return;

            row.results.push(res);

            // 💥 КЛЮЧЕВОЙ ФИКС
            if (row.update) row.update();
          });

        });

      });

      onSuccess(parts);

    })
    .catch(onError);
  };

  this.full = function(p,s,e){
    Lampa.Api.sources.tmdb.full(p,s,e);
  };
}

// ---------------- START ----------------
function start(){

  let api = new Api();

  Lampa.Api.sources.rutorpro = api;

  Object.defineProperty(Lampa.Api.sources, SOURCE, {
    get:()=>api
  });

  // 💥 кнопка (жёсткий фикс)
  function addBtn(){

    let menu = document.querySelector('.menu .menu__list');
    if(!menu) return setTimeout(addBtn,500);

    if(document.querySelector('[data-rutor]')) return;

    let li=document.createElement('li');
    li.className='menu__item selector';
    li.setAttribute('data-rutor','1');

    li.innerHTML = `
      <div class="menu__ico">🔥</div>
      <div class="menu__text">${SOURCE}</div>
    `;

    li.addEventListener('hover:enter',()=>{
      Lampa.Activity.push({
        component:'category',
        source:SOURCE,
        title:SOURCE
      });
    });

    menu.appendChild(li);
  }

  addBtn();
}

if(window.appready) start();
else Lampa.Listener.follow('app',e=>{
  if(e.type==='ready') start();
});

})();
