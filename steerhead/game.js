(function(){
  function load(src){return fetch(src).then(r=>r.text());}
  Promise.all([load('game.part1.js'),load('game.part2.js')]).then(function(parts){
    var s=document.createElement('script');
    s.textContent=parts[0]+parts[1];
    document.body.appendChild(s);
  }).catch(function(e){console.error(e);document.body.innerHTML='<p style="color:#ecece8;font-family:sans-serif;padding:2rem">Failed to load SteerHead. Hard-refresh and try again.</p>';});
})();
