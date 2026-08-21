(function(){
function load(s){return fetch(s).then(function(r){return r.text()})}
Promise.all([load('g0.js'),load('g1.js'),load('g2.js'),load('g3.js')]).then(function(p){
var s=document.createElement('script');s.textContent=p.join('');document.body.appendChild(s)
}).catch(function(e){console.error(e);document.body.insertAdjacentHTML('beforeend','<p style="color:#ecece8;padding:2rem;font-family:sans-serif">Failed to load. Hard-refresh.</p>')})
})();
