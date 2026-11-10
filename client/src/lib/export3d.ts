/**
 * "3D presentation" download: one self-contained .html file that plays the
 * deck full screen in any browser, offline (no internet, no data): slides in
 * 3D layers that tilt with the mouse, 3D transitions (cube, flip, zoom), rows
 * that slide in one by one, numbers that count up. Clicker / arrow keys / tap.
 *
 * Input: slides already laid out by looks.ts (1280×720 shapes), one set per
 * look offered in the file (the first is shown first).
 */
import type { Shape } from './deck';

export interface Laid3D {
  bg: string;
  shapes: Shape[];
}

export interface Look3D {
  name: string;
  slides: Laid3D[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function build3dHtml(title: string, looks: Look3D[], opts: { transition?: 'cube' | 'flip' | 'zoom' | 'slide' } = {}): string {
  // JSON inside <script>: make "</script>" impossible.
  const data = JSON.stringify({ title, looks, transition: opts.transition ?? 'cube' }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div id="nojs">
  <div>
    <strong>${esc(title)}</strong>
    <p>This app opened the presentation without its player, so it can't play here.</p>
    <p>Open it in <b>Chrome</b> or <b>Safari</b> instead: tap <b>⋮</b> or <b>Share</b>, then <b>Open in browser</b> (or save it and open it from Chrome).</p>
    <p>WhatsApp, Gmail and the Files app only preview it. Easier still: ask for the WeekDeck <b>share link</b>, which plays on any phone.</p>
  </div>
</div>
<div id="app">
  <div id="stage"></div>
  <div id="grid" hidden></div>
  <div id="black" hidden></div>
  <div id="bar">
    <button id="prev" aria-label="Previous slide">‹</button>
    <span id="count"></span>
    <button id="next" aria-label="Next slide">›</button>
    <span class="sep"></span>
    <select id="fx" aria-label="Transition"><option value="cube">Cube</option><option value="flip">Flip</option><option value="zoom">Zoom</option><option value="slide">Slide</option></select>
    <select id="look" aria-label="Look"></select>
    <button id="all" aria-label="All slides" title="All slides (G)">▦</button>
    <button id="full" aria-label="Full screen" title="Full screen (F)">⛶</button>
  </div>
  <div id="progress"><i></i></div>
  <div id="hint">← → or clicker to move · F full screen · G all slides · B black screen</div>
  <div id="rotate">Turn your phone sideways for a bigger view · swipe to move</div>
</div>
<script id="deck" type="application/json">${data}</script>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = `
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
html,body{height:100%;background:#05070d;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#fff;-webkit-tap-highlight-color:transparent}
#app{position:fixed;inset:0;background:radial-gradient(1200px 700px at 50% 40%,var(--glow,#1b2a55) 0%,#05070d 70%);transition:background .8s}
#stage{position:absolute;inset:0;perspective:1800px;perspective-origin:50% 45%;cursor:pointer}
.slide{position:absolute;left:50%;top:50%;width:1280px;height:720px;transform-style:preserve-3d;will-change:transform,opacity;backface-visibility:hidden}
.tilt{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.layer{position:absolute;inset:0;overflow:hidden;border-radius:18px;pointer-events:none}
.layer.back{box-shadow:0 40px 120px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06)}
.layer.mid{transform:translateZ(28px)}
.layer.front{transform:translateZ(56px)}
.sheen{position:absolute;inset:0;border-radius:18px;transform:translateZ(57px);pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.16),rgba(255,255,255,0) 38%);opacity:.5;mix-blend-mode:screen}
.s{position:absolute}
.t{display:flex;flex-direction:column;line-height:1.18;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere}
table.s{border-collapse:collapse;table-layout:fixed}
table.s td,table.s th{padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.on .in{animation:in .6s cubic-bezier(.2,.8,.2,1) both}
.on .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) both;transform-origin:left center}
.on tr.row{animation:row .55s cubic-bezier(.2,.8,.2,1) both}
.on .photo{animation:photo 1.1s cubic-bezier(.65,0,.35,1) both}
.on .photo img{animation:settle 1.6s cubic-bezier(.2,.8,.2,1) both,drift 16s ease-in-out infinite alternate}
.on .pop{animation:pop .7s cubic-bezier(.2,.8,.2,1) both}
@keyframes photo{from{opacity:0;clip-path:inset(0 100% 0 0)}35%{opacity:1}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes settle{from{transform:scale(1.18)}to{transform:none}}
@keyframes drift{from{transform:none}to{transform:scale(1.07) translate(-1.2%,-.8%)}}
@keyframes pop{from{opacity:0;transform:scale(.6) rotate(-6deg)}70%{opacity:1;transform:scale(1.06) rotate(1deg)}to{opacity:1;transform:none}}
@keyframes in{from{opacity:0;transform:translateY(22px) translateZ(-30px)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleX(0)}to{transform:none}}
@keyframes row{from{opacity:0;transform:translateX(-40px) rotateY(-12deg)}to{opacity:1;transform:none}}
#bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:16px;background:rgba(10,14,26,.72);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.4);transition:opacity .4s,transform .4s;z-index:5}
#app.idle #bar,#app.idle #hint{opacity:0;transform:translateX(-50%) translateY(14px)}
#app.idle{cursor:none}
#bar button,#bar select{height:38px;min-width:38px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font:700 15px Arial;padding:0 10px;cursor:pointer}
#bar button:hover,#bar select:hover{background:rgba(255,255,255,.18)}
#bar select option{color:#000}
#count{min-width:64px;text-align:center;font:700 14px Arial;opacity:.85}
.sep{width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 4px}
#progress{position:fixed;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.08);z-index:4}
#progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffb020,#ff5a7a);transition:width .6s cubic-bezier(.2,.8,.2,1)}
#hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);font:600 13px Arial;opacity:.55;transition:opacity .4s,transform .4s;white-space:nowrap;z-index:5}
#black{position:fixed;inset:0;background:#000;z-index:8}
#grid{position:fixed;inset:0;overflow:auto;padding:40px 4vw 90px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:22px;background:rgba(5,7,13,.92);z-index:6;perspective:1400px}
#grid .g{position:relative;height:0;padding-bottom:56.25%;border-radius:12px;overflow:hidden;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.5);transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s;animation:in .5s cubic-bezier(.2,.8,.2,1) both}
#grid .g:hover{transform:translateZ(40px) rotateX(6deg);box-shadow:0 24px 60px rgba(0,0,0,.6)}
#grid .g.cur{outline:3px solid #ffb020;outline-offset:3px}
#grid .g>div{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:top left}
#grid .g b{position:absolute;left:8px;bottom:6px;font:700 12px Arial;background:rgba(0,0,0,.55);padding:2px 7px;border-radius:6px}
@media (prefers-reduced-motion:reduce){.on .in,.on .grow,.on tr.row,.on .photo,.on .photo img,.on .pop{animation:none}.tilt{transition:none}}
#nojs{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#0b1220;color:#fff;font:16px/1.5 Arial,sans-serif;z-index:20}
#nojs>div{max-width:440px}#nojs strong{display:block;font-size:20px;margin-bottom:10px}#nojs p{margin:0 0 12px;opacity:.9}
.js #nojs{display:none}
#rotate{display:none;position:fixed;top:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(10,14,26,.78);font:700 13px Arial;white-space:nowrap;z-index:5;animation:rot 6s ease both}
@keyframes rot{0%,80%{opacity:1}to{opacity:0;visibility:hidden}}
@media (orientation:portrait) and (max-width:640px){#rotate{display:block}}
@media (pointer:coarse){#hint{display:none}}
.nofs #full{display:none}
@media (max-width:640px){#hint{display:none}#bar{bottom:10px;gap:4px;max-width:96vw}#fx{display:none}#bar select{max-width:110px}#count{min-width:48px}}
`;

const JS = String.raw`
(function(){
document.documentElement.className+=' js';
if(!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen))document.documentElement.className+=' nofs';
var D=JSON.parse(document.getElementById('deck').textContent);
var FONTS={sans:'Arial, Helvetica, sans-serif',serif:'Georgia, "Times New Roman", serif',display:'"Arial Black", "Arial Bold", Gadget, Arial, sans-serif'};
var app=document.getElementById('app'),stage=document.getElementById('stage'),grid=document.getElementById('grid'),black=document.getElementById('black');
var look=0,cur=0,busy=false,fx=D.transition||'cube',reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var slides=function(){return D.looks[look].slides};
var hex=function(c){return c?'#'+c:'transparent'};
var isFig=function(t){return /^[₦$]?-?\d[\d,]*(\.\d+)?%?$/.test(String(t).trim())};
var lsel=document.getElementById('look');
D.looks.forEach(function(l,i){var o=document.createElement('option');o.value=i;o.textContent=l.name;lsel.appendChild(o)});
if(D.looks.length<2)lsel.style.display='none';

function el(tag,css,cls){var e=document.createElement(tag);if(cls)e.className=cls;Object.assign(e.style,css||{});return e}
/* Which 3D layer a shape sits on: big panels at the back, text and tables in front. */
function depth(s){
  if(s.type==='text'||s.type==='table')return 'front';
  var area=(s.w||0)*(s.h||0);
  if(area>1280*720*0.3)return 'back';
  return 'mid';
}
function delayOf(i){return Math.min(1400,i*32)}
function count(node,text,delay){
  var m=/^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(text);
  if(!m||reduce){node.textContent=text;return}
  var target=Number(m[2].replace(/,/g,''));node.textContent=m[1]+'0'+m[3];
  var start=performance.now()+delay;
  (function tick(now){var p=Math.min(1,Math.max(0,(now-start)/1200)),e=1-Math.pow(1-p,3);
    if(p>=1){node.textContent=text;return}
    node.textContent=m[1]+Math.round(target*e).toLocaleString('en-US')+m[3];requestAnimationFrame(tick)})(performance.now());
}
function shape(s,i,live){
  var box={left:s.x+'px',top:s.y+'px'},d=delayOf(i);
  var st=s.stroke?{border:(s.strokeW||2)+'px solid #'+s.stroke}:{};
  var anim=live?(s.type==='rect'&&s.anim==='grow'?'grow':'in'):'';
  var e;
  if(s.type==='rect'||s.type==='ellipse'){
    e=el('div',Object.assign(box,{width:s.w+'px',height:s.h+'px',background:hex(s.fill),borderRadius:s.type==='ellipse'?'50%':(s.radius||0)+'px'},st),'s '+anim);
  }else if(s.type==='image'){
    var sz={width:s.w+'px',height:s.h+'px',borderRadius:(s.radius||0)+'px'};
    if(live&&s.anim!=='pop'){
      e=el('div',Object.assign(box,sz,{overflow:'hidden'}),'s photo');e.style.animationDelay=d+'ms';
      var im=el('img',{width:'100%',height:'100%',objectFit:'cover',display:'block',animationDelay:d+'ms, '+(d+1600)+'ms'},'');im.src=s.src;im.alt='';e.appendChild(im);
      return e;
    }
    e=el('img',Object.assign(box,sz,{objectFit:'cover'}),'s '+(live?'pop':''));e.src=s.src;e.alt='';
    if(live){e.style.animationDelay=(d+500)+'ms';return e}
  }else if(s.type==='text'){
    e=el('div',Object.assign(box,{width:s.w+'px',height:s.h+'px',justifyContent:s.valign==='middle'?'center':s.valign==='bottom'?'flex-end':'flex-start',textAlign:s.align||'left',color:hex(s.color),fontSize:s.size+'px',fontWeight:s.font==='display'?900:s.bold?700:400,fontFamily:FONTS[s.font||'sans'],fontStyle:s.italic?'italic':'normal',letterSpacing:(s.spacing||0)+'px'}),'s t '+anim);
    if(live&&s.anim==='count')count(e,s.text,d+200);else e.textContent=s.text;
  }else if(s.type==='table'){
    e=el('table',Object.assign(box,{width:s.colW.reduce(function(a,b){return a+b},0)+'px',color:hex(s.ink),fontFamily:FONTS[s.font||'sans']}),'s');
    var cg=document.createElement('colgroup');s.colW.forEach(function(w){var c=document.createElement('col');c.style.width=w+'px';cg.appendChild(c)});e.appendChild(cg);
    var cell=function(tag,txt,css,ci,rowDelay){var c=el(tag,Object.assign({height:s.rowH+'px',border:'1px solid #'+s.line,fontSize:s.size+'px',textAlign:ci===0?'left':'center'},css));
      if(live&&ci>0&&isFig(txt))count(c,txt,rowDelay+80);else c.textContent=txt;return c};
    var row=function(cells,k,css,tag){var tr=document.createElement('tr');var rd=d+180+k*90;if(live){tr.className='row';tr.style.animationDelay=rd+'ms'}
      cells.forEach(function(t,ci){tr.appendChild(cell(tag||'td',t,typeof css==='function'?css(ci):css,ci,rd))});return tr};
    var th=document.createElement('thead');th.appendChild(row(s.head,-1,{background:hex(s.headFill),color:hex(s.headInk),fontWeight:700},'th'));e.appendChild(th);
    var tb=document.createElement('tbody');
    s.rows.forEach(function(r,ri){tb.appendChild(row(r,ri,function(ci){return{background:hex(ri%2?s.stripe:s.bg),fontWeight:s.boldEdges!==false&&(ci===0||ci===r.length-1)?700:400}}))});
    if(s.total.length)tb.appendChild(row(s.total,s.rows.length+1,{background:hex(s.totalFill),color:hex(s.totalInk),fontWeight:700}));e.appendChild(tb);
    return e;
  }
  if(e&&anim)e.style.animationDelay=(anim==='grow'?d+250:d)+'ms';
  return e;
}
function render(sl,live){
  var root=el('div',{},'slide'),tilt=el('div',{},'tilt');root.appendChild(tilt);
  var L={back:el('div',{background:hex(sl.bg)},'layer back'),mid:el('div',{},'layer mid'),front:el('div',{},'layer front')};
  tilt.appendChild(L.back);tilt.appendChild(L.mid);tilt.appendChild(L.front);tilt.appendChild(el('div',{},'sheen'));
  sl.shapes.forEach(function(s,i){var e=shape(s,i,live);if(e)L[depth(s)].appendChild(e)});
  return root;
}
var scale=1;
function fit(){var small=innerWidth<700||innerHeight<500;scale=Math.min(innerWidth*(small?0.98:0.92)/1280,innerHeight*(small?0.94:0.86)/720);Array.prototype.forEach.call(stage.children,function(n){n.style.setProperty('--k',scale);place(n,n._pose||'here')})}
var POSES={
  cube:{l:'translateX(-62%) rotateY(70deg) translateZ(-240px)',r:'translateX(62%) rotateY(-70deg) translateZ(-240px)'},
  flip:{l:'rotateX(-90deg) translateZ(-200px)',r:'rotateX(90deg) translateZ(-200px)'},
  zoom:{l:'translateZ(700px)',r:'translateZ(-1400px)'},
  slide:{l:'translateX(-120%) rotateY(18deg)',r:'translateX(120%) rotateY(-18deg)'}
};
function place(n,pose){
  n._pose=pose;var base='translate(-50%,-50%) scale('+scale+')';
  var extra=pose==='here'?'':POSES[fx][pose];
  n.style.transform=base+' '+extra;n.style.opacity=pose==='here'?1:0;
}
function glow(){
  /* The light behind the slide: the slide's own colour, kept dark so white slides still sit on a dark room. */
  var bg=(slides()[cur].bg||'1b2a55').replace('#','');var c=[0,2,4].map(function(i){return parseInt(bg.substr(i,2),16)||0});
  var light=(c[0]*299+c[1]*587+c[2]*114)/1000;var k=light>150?0.16:0.42;
  var m=c.map(function(v,i){return Math.round(v*k+[5,7,13][i]*(1-k))});
  app.style.setProperty('--glow','rgb('+m.join(',')+')');
}
function counter(){document.getElementById('count').textContent=(cur+1)+' / '+slides().length;document.querySelector('#progress i').style.width=((cur+1)/slides().length*100)+'%';try{if(location.protocol!=='about:'&&location.hash!=='#'+(cur+1))history.replaceState(null,'','#'+(cur+1))}catch(e){}}
function show(i,dir){
  var n=slides().length;if(i<0||i>=n||busy)return;
  var old=stage.querySelector('.slide.on');
  var next=render(slides()[i],true);next.classList.add('on');
  next.style.transition='none';place(next,old?(dir>0?'r':'l'):'here');stage.appendChild(next);
  cur=i;counter();glow();
  if(!old||reduce){if(old)old.remove();place(next,'here');return}
  busy=true;void next.offsetWidth;
  var t='transform 900ms cubic-bezier(.65,0,.25,1), opacity 700ms ease';
  next.style.transition=t;old.style.transition=t;
  place(next,'here');place(old,dir>0?'l':'r');old.classList.remove('on');
  setTimeout(function(){old.remove();busy=false},920);
}
function go(d){show(cur+d,d)}
/* Mouse / phone tilt: the layers move apart a little, so the slide looks solid. */
function tiltTo(x,y){var t=stage.querySelector('.slide.on .tilt');if(t&&!reduce)t.style.transform='rotateY('+(x*7)+'deg) rotateX('+(-y*5)+'deg)'}
addEventListener('mousemove',function(e){tiltTo(e.clientX/innerWidth-.5,e.clientY/innerHeight-.5);wake()});
addEventListener('deviceorientation',function(e){if(e.gamma!=null)tiltTo(Math.max(-1,Math.min(1,e.gamma/30))/2,Math.max(-1,Math.min(1,(e.beta-40)/30))/2)});
/* Controls hide while presenting. */
addEventListener('touchstart',function(){wake()},{passive:true});
var idleT;function wake(){app.classList.remove('idle');clearTimeout(idleT);idleT=setTimeout(function(){app.classList.add('idle')},2600)}
wake();
addEventListener('keydown',function(e){
  var k=e.key;wake();
  if(!black.hidden&&k!=='b'&&k!=='B'&&k!=='.'){black.hidden=true;return}
  if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'||k==='ArrowDown'){e.preventDefault();if(!grid.hidden)return;go(1)}
  else if(k==='ArrowLeft'||k==='PageUp'||k==='ArrowUp'||k==='Backspace'){e.preventDefault();if(!grid.hidden)return;go(-1)}
  else if(k==='Home')show(0,-1);else if(k==='End')show(slides().length-1,1);
  else if(k==='f'||k==='F'||k==='F5')full();
  else if(k==='g'||k==='G'||(k==='Escape'&&!grid.hidden))toggleGrid();
  else if(k==='Escape'&&!document.fullscreenElement&&window.parent!==window)window.parent.postMessage('weekdeck-3d-close','*');
  else if(k==='b'||k==='B'||k==='.')black.hidden=!black.hidden;
});
stage.addEventListener('click',function(e){if(e.clientX<innerWidth*0.25)go(-1);else go(1)});
var sx=null;stage.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
stage.addEventListener('touchend',function(e){if(sx==null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>40){e.preventDefault();go(dx<0?1:-1)}});
black.addEventListener('click',function(){black.hidden=true});
document.getElementById('prev').onclick=function(e){e.stopPropagation();go(-1)};
document.getElementById('next').onclick=function(e){e.stopPropagation();go(1)};
document.getElementById('full').onclick=full;
document.getElementById('all').onclick=toggleGrid;
document.getElementById('fx').onchange=function(e){fx=e.target.value;e.target.blur()};
document.getElementById('fx').value=fx;
lsel.onchange=function(e){look=Number(e.target.value);e.target.blur();stage.innerHTML='';show(Math.min(cur,slides().length-1),1)};
function full(){var d=document;if(!d.fullscreenElement)(d.documentElement.requestFullscreen||d.documentElement.webkitRequestFullscreen||function(){}).call(d.documentElement);else(d.exitFullscreen||d.webkitExitFullscreen).call(d)}
function toggleGrid(){
  if(!grid.hidden){grid.hidden=true;return}
  grid.innerHTML='';
  slides().forEach(function(sl,i){var g=el('div',{animationDelay:Math.min(600,i*25)+'ms'},'g'+(i===cur?' cur':''));var inner=render(sl,false);inner.className='';inner.style.position='absolute';
    g.appendChild(inner);var b=document.createElement('b');b.textContent=i+1;g.appendChild(b);
    g.onclick=function(){grid.hidden=true;show(i,i>cur?1:-1)};grid.appendChild(g)});
  grid.hidden=false;
  requestAnimationFrame(function(){Array.prototype.forEach.call(grid.children,function(g){g.firstChild.style.transform='scale('+(g.clientWidth/1280)+')'})});
}
addEventListener('resize',fit);
fit();
var start=Number((location.hash||'').slice(1))-1;show(start>=0&&start<slides().length?start:0,1);fit();
})();
`;
