/* Vocab — offline-first flashcards. One endless line of every downloaded word.
   Hold = peek back side · release = front · swipe = next / previous (loops).          */
(()=>{
const CAP=(window.Capacitor&&Capacitor.Plugins)||{},NATIVE=!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-US');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const debounce=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const hap=(s='LIGHT')=>{try{CAP.Haptics&&CAP.Haptics.impact({style:s})}catch{}};
const LANG={ko:'Korean',en:'English',uz:'Uzbek',ru:'Russian'};
const BACKS={ko:['en','uz'],en:['en','uz','ko','ru']};
const DATA=(NATIVE?CFG.GITHUB_RAW:'data').replace(/\/$/,'');   // web: same origin (Pages / local admin)
const BRAND={name:CFG.BY_NAME||CFG.APP_NAME||'Vocab',url:CFG.BY_URL||'https://t.me/odilxanivich'};
function openLink(url){if(!/^https:\/\//.test(url||''))return;if(NATIVE)location.href=url;else window.open(url,'_blank','noopener')}  // native: Android opens Telegram app
document.addEventListener('click',e=>{const a=e.target.closest('[data-url]');if(a){e.preventDefault();e.stopPropagation();openLink(a.dataset.url)}},true);
const normCode=c=>String(c||'').toUpperCase().replace(/\s+/g,'');
async function decrypt(d,code){   // unlock codes: AES-256-GCM, key = PBKDF2(code) — same as admin/server.js
  const b64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0)),C=crypto.subtle;
  const base=await C.importKey('raw',new TextEncoder().encode(normCode(code)),'PBKDF2',false,['deriveKey']);
  const key=await C.deriveKey({name:'PBKDF2',salt:b64(d.lock.salt),iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
  return JSON.parse(new TextDecoder().decode(await C.decrypt({name:'AES-GCM',iv:b64(d.lock.iv)},key,b64(d.enc))));
}

/* ---------- state ---------- */
const DEF={mode:'ko',back:{ko:'en',en:'en'},fav:{},known:{},pos:{},filter:'all',rate:1,voice:{ko:'auto',en:'auto'},swipe:'right',order:'seq',seed:0,codes:{},mile:0};
let S=JSON.parse(JSON.stringify(DEF)),lib=[],sets=new Map(),deck=[],idx=0,online=navigator.onLine,anim=false,asked=false;
const save=debounce(()=>V.put('state.json',S).catch(()=>{}),350);
const posKey=()=>S.mode+'|'+S.filter;
const savePos=()=>{S.pos[posKey()]=idx;save()};
const cur=()=>deck[idx];

async function loadSets(){
  for(const l of lib)if(l.learn===S.mode&&!sets.has(l.id)){const d=await V.get('sets/'+l.id+'.json',null);if(d&&Array.isArray(d.items))sets.set(l.id,d)}
}
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function build(keepKey){
  const mine=lib.filter(l=>l.learn===S.mode);
  if(!['all','fav'].includes(S.filter)&&!mine.some(l=>l.id===S.filter))S.filter='all';
  const f=S.filter,out=[];
  for(const l of mine){
    if(f!=='all'&&f!=='fav'&&f!==l.id)continue;
    const set=sets.get(l.id);if(!set)continue;
    for(const it of set.items){const k=set.id+':'+it.id;if(S.known[k]||(f==='fav'&&!S.fav[k]))continue;out.push({k,s:set,it})}
  }
  if(S.order==='shuffle'){const r=rng(S.seed);for(let i=out.length-1;i>0;i--){const j=r()*(i+1)|0;[out[i],out[j]]=[out[j],out[i]]}}
  deck=out;
  idx=Math.min(S.pos[posKey()]||0,Math.max(0,deck.length-1));
  if(keepKey){const j=deck.findIndex(d=>d.k===keepKey);if(j>=0)idx=j}
  paint();
}

/* ---------- paint ---------- */
const filterName=()=>S.filter==='all'?'All words':S.filter==='fav'?'Saved':(lib.find(l=>l.id===S.filter)||{}).title||'All words';
function fit(w){
  const L=[...w].length,ko=/[ㄱ-힝]/.test(w),k=Math.min(1,innerWidth/390);
  return Math.round(Math.max(30,Math.min(ko?84:68,(ko?310:430)/Math.max(L,1)))*k);
}
function pickBack(it){const p=S.back[S.mode];return it.tr&&it.tr[p]?p:Object.keys(it.tr||{})[0]||p}
function paint(){
  const n=deck.length;
  $('#selT').textContent=filterName();
  $('#selN').textContent=n?fmt(n)+(n===1?' word':' words'):'';
  $('#cnt').textContent=n?`${fmt(idx+1)} / ${fmt(n)}`:'';
  $('#barI').style.width=n?((idx+1)/n*100)+'%':'0';
  paintCard();paintActs();
}
function paintCard(){
  const d=cur(),F=$('#front'),B=$('#back');
  document.body.classList.toggle('empty',!d);
  if(!d){F.innerHTML=emptyHTML();B.innerHTML='';return}
  const it=d.it,b=pickBack(it),t=(it.tr&&it.tr[b])||{};
  F.innerHTML=`<div class="tag">${esc(d.s.title)}${d.s.partner?' · '+esc(d.s.partner.name):''}</div><div class="word" lang="${S.mode}" style="font-size:${fit(it.word)}px">${esc(it.word)}</div>${it.pron?`<div class="pron">${esc(it.pron)}</div>`:''}`;
  B.innerHTML=`<div class="tag">${esc(LANG[b]||b)}</div><div class="mean" lang="${b}">${esc(t.m||it.word)}</div>${t.d?`<p class="def" lang="${b}">${esc(t.d)}</p>`:''}`+
    (it.ex||t.x?`<div class="ex">${it.ex?`<p lang="${S.mode}">${esc(it.ex)}</p>`:''}${t.x?`<p class="tx" lang="${b}">${esc(t.x)}</p>`:''}</div>`:'');
}
function emptyHTML(){
  const has=lib.some(l=>l.learn===S.mode);
  if(!has)return`<div class="none"><h2>Nothing here yet</h2><p>Download a ${LANG[S.mode]} set once — it stays on your phone, offline.</p><button class="btn pri" data-go="library" style="width:240px">Browse vocabulary</button></div>`;
  if(S.filter==='fav')return`<div class="none"><h2>No saved words</h2><p>Tap the heart under any word to keep it here.</p><button class="btn" data-go="all" style="width:200px">All words</button></div>`;
  return`<div class="none"><h2>You know them all</h2><p>Every word here is learned. Check for new sets.</p><button class="btn pri" data-go="library" style="width:240px">Browse new sets</button></div>`;
}
function paintActs(){const d=cur(),on=!!(d&&S.fav[d.k]);$('#aFav').classList.toggle('on',on);$('#aFav span').textContent=on?'Saved':'Save'}
const first=u=>u?String(u.name||u.email||'').trim().split(/[\s@]/)[0].slice(0,12):'Guest';
function paintMe(){const u=Auth.user(),m=$('#me');m.classList.toggle('in',!!u);m.classList.toggle('off',!online);$('#meT').textContent=first(u)}

/* ---------- toast ---------- */
let tt;
function toast(msg,undo,label='Undo'){
  const e=$('#toast');e.innerHTML=`<span>${esc(msg)}</span>${undo?`<button>${esc(label)}</button>`:''}`;e.classList.add('show');
  if(undo)e.querySelector('button').onclick=()=>{e.classList.remove('show');undo()};
  clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('show'),undo?4200:2400);
}

/* ---------- motion ---------- */
const card=$('#card'),stage=$('#stage');
function setT(tr,op,ms){card.style.transition=ms?`transform ${ms}ms cubic-bezier(.2,.8,.2,1),opacity ${ms}ms`:'none';card.style.transform=tr;card.style.opacity=op}
const nextDir=()=>S.swipe==='right'?1:-1;   // which finger direction means "next"
async function go(step,dx){
  if(deck.length<1||anim)return;
  if(deck.length===1){setT('none',1,220);return}
  anim=true;Speech.stop();
  const W=stage.clientWidth,exit=dx?Math.sign(dx):step*nextDir();
  setT(`translateX(${exit*W*.85}px) rotate(${exit*7}deg)`,0,210);await wait(190);
  idx=(idx+step+deck.length)%deck.length;savePos();paint();
  setT(`translateX(${-exit*W*.3}px)`,0,0);void card.offsetWidth;
  setT('none',1,300);await wait(260);anim=false;
}
const next=()=>go(1),prev=()=>go(-1);
function flip(on){stage.classList.toggle('flip',on);if(on)hap()}

/* hold-to-peek + swipe, without stealing button taps */
let g=null;
stage.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')||!deck.length||anim||g)return;
  try{stage.setPointerCapture(e.pointerId)}catch{}
  g={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),dx:0,drag:false,flip:false};
  g.ft=setTimeout(()=>{if(g&&!g.drag){g.flip=true;flip(true)}},70);
});
stage.addEventListener('pointermove',e=>{
  if(!g||e.pointerId!==g.id)return;
  g.dx=e.clientX-g.x;const dy=e.clientY-g.y;
  if(!g.drag&&Math.abs(g.dx)>10&&Math.abs(g.dx)>Math.abs(dy)*1.2){g.drag=true;clearTimeout(g.ft);if(g.flip){g.flip=false;flip(false)}}
  if(g.drag)setT(`translateX(${g.dx}px) rotate(${g.dx/36}deg)`,Math.max(.25,1-Math.abs(g.dx)/(stage.clientWidth*1.2)),0);
});
function end(e){
  if(!g||e.pointerId!==g.id)return;
  clearTimeout(g.ft);const G=g;g=null;
  if(G.flip)flip(false);
  if(!G.drag)return;
  const v=G.dx/Math.max(1,performance.now()-G.t);
  if(Math.abs(G.dx)>stage.clientWidth*.2||Math.abs(v)>.55)go(Math.sign(G.dx)*nextDir(),G.dx);else setT('none',1,240);
}
stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- three actions ---------- */
$('#aFav').onclick=()=>{
  const d=cur();if(!d)return;
  if(S.fav[d.k])delete S.fav[d.k];else{S.fav[d.k]=Date.now();hap('MEDIUM')}
  save();paintActs();
};
$('#aSay').onclick=async()=>{
  const d=cur();if(!d)return;const b=$('#aSay');
  if(b.classList.contains('play')){Speech.stop();return b.classList.remove('play')}
  b.classList.add('play');
  try{await Speech.say(d.it.word,S.mode,{rate:S.rate,voice:S.voice[S.mode],online})}
  catch(e){
    if(Speech.native&&!(await Speech.has(S.mode)))toast(`No ${LANG[S.mode]} voice on this phone`,()=>Speech.install(),'Install');
    else toast(e.message||'Voice unavailable');
  }
  b.classList.remove('play');
};
$('#aKnow').onclick=async()=>{
  const d=cur();if(!d||anim)return;anim=true;hap('MEDIUM');Speech.stop();
  setT('translateY(-40px) scale(.96)',0,230);await wait(210);
  S.known[d.k]=Date.now();const at=idx;deck.splice(idx,1);if(idx>=deck.length)idx=0;savePos();
  setT('translateY(24px)',0,0);paint();void card.offsetWidth;setT('none',1,300);await wait(260);anim=false;
  toast('Marked as known',()=>{delete S.known[d.k];deck.splice(at,0,d);idx=at;savePos();paint()});
  checkMile();
};

/* ---------- milestones ---------- */
const MILES=[25,100,250,500,1000,2000,3000,5000,10000];
function checkMile(){const n=Object.keys(S.known).length,m=MILES.filter(x=>x<=n).pop();if(m&&m>(S.mile||0)){S.mile=m;save();setTimeout(()=>showMile(m),450)}}
function showMile(n){
  L.mile.innerHTML=`<div class="mw"><small class="ey">Milestone</small><b class="mn" id="mN">0</b><p>words learned</p>
    <span class="mut">${n>=1000?'That’s serious vocabulary.':n>=250?'You’re building real fluency.':'A strong start. Keep the streak.'}</span></div>
    <div class="mb"><button class="btn pri" id="mShare">Share</button><button class="btn" id="mOk">Continue</button></div>`;
  $('#toast').classList.remove('show');open('mile');hap('HEAVY');
  const t0=performance.now(),el=$('#mN'),tick=t=>{const k=Math.min(1,(t-t0)/900);el.textContent=fmt(Math.round(n*(1-Math.pow(1-k,3))));if(k<1)requestAnimationFrame(tick)};requestAnimationFrame(tick);
  $('#mOk').onclick=()=>close('mile');
  $('#mShare').onclick=()=>shareMile(n).catch(e=>toast(e.message||'Could not share'));
}
async function mileImage(n){
  try{await document.fonts.load('700 100px Pretendard')}catch{}
  const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.fillStyle='#050505';x.fillRect(0,0,W,H);
  let g=x.createRadialGradient(W/2,0,0,W/2,0,900);g.addColorStop(0,'rgba(79,90,42,.55)');g.addColorStop(1,'rgba(5,5,5,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
  g=x.createRadialGradient(W/2,H+120,0,W/2,H+120,800);g.addColorStop(0,'rgba(94,22,36,.5)');g.addColorStop(1,'rgba(5,5,5,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
  const F='Pretendard,InterC,system-ui,sans-serif';x.textAlign='center';x.fillStyle='#f3efe7';
  const sp=(t,y,font,ls,col)=>{x.font=font;x.fillStyle=col;if('letterSpacing'in x)x.letterSpacing=ls+'px';x.fillText(t,W/2,y);if('letterSpacing'in x)x.letterSpacing='0px'};
  sp('MILESTONE',300,`600 30px ${F}`,12,'rgba(119,132,63,1)');
  const num=fmt(n);sp(num,640,`700 ${num.length>4?250:320}px ${F}`,-8,'#f3efe7');
  sp('words learned',740,`500 60px ${F}`,0,'rgba(243,239,231,.75)');
  sp(S.mode==='ko'?'Korean · 한국어':'English',820,`500 38px ${F}`,2,'rgba(243,239,231,.45)');
  x.fillStyle='rgba(243,239,231,.12)';x.fillRect(W/2-180,1060,360,2);
  sp(CFG.APP_NAME||'Vocab',1190,`700 92px ${F}`,-3,'#f3efe7');
  return c;
}
async function shareMile(n){
  const c=await mileImage(n),text=`I learned ${fmt(n)} words with ${CFG.APP_NAME||'Vocab'}.`;
  if(NATIVE&&CAP.Share&&CAP.Filesystem){
    const data=c.toDataURL('image/png').split(',')[1],path='vocab-'+n+'.png';
    await CAP.Filesystem.writeFile({path,data,directory:'CACHE'});
    const {uri}=await CAP.Filesystem.getUri({path,directory:'CACHE'});
    return CAP.Share.share({title:'Milestone',text,files:[uri],dialogTitle:'Share'});
  }
  const blob=await new Promise(r=>c.toBlob(r,'image/png')),file=new File([blob],'vocab-'+n+'.png',{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[file]}))return navigator.share({files:[file],text});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();toast('Image saved');
}

/* ---------- layers ---------- */
const L={drawer:$('#drawer'),menu:$('#menu'),page:$('#page'),gate:$('#gate'),sheet:$('#sheet'),mile:$('#mile')};
const isOpen=k=>L[k].classList.contains('open');
const SCR=['drawer','menu','sheet'];
function open(k){L[k].classList.add('open');if(SCR.includes(k))$('#scrim').classList.add('open')}
function close(k){L[k].classList.remove('open');if(!SCR.some(isOpen))$('#scrim').classList.remove('open')}
$('#scrim').onclick=()=>SCR.forEach(close);
function back(){
  if(isOpen('mile'))return close('mile'),true;
  if(isOpen('sheet'))return close('sheet'),true;
  if(isOpen('page'))return close('page'),true;
  if(isOpen('menu'))return close('menu'),true;
  if(isOpen('drawer'))return close('drawer'),true;
  if(isOpen('gate'))return skipGate(),true;
  return false;
}
if(CAP.App)CAP.App.addListener('backButton',()=>{if(!back())CAP.App.exitApp()});

/* left: sets */
function leftIn(id){let n=0;const s=sets.get(id);if(s)for(const it of s.items)if(!S.known[id+':'+it.id])n++;return n}
function openDrawer(){
  const mine=lib.filter(l=>l.learn===S.mode),all=mine.reduce((a,l)=>a+leftIn(l.id),0);
  const fav=Object.keys(S.fav).filter(k=>!S.known[k]&&mine.some(l=>k.startsWith(l.id+':'))).length;
  const item=(id,t,n,sub)=>`<button class="dr${S.filter===id?' on':''}" data-f="${esc(id)}"><span><b>${esc(t)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span><em>${fmt(n)}</em></button>`;
  L.drawer.innerHTML=`<div class="dh"><small>Learning ${LANG[S.mode]}</small><h2>Vocabulary</h2></div>`+
    item('all','All words',all)+item('fav','Saved',fav)+'<div class="dsep"></div>'+
    (mine.length?mine.map(l=>item(l.id,l.title,leftIn(l.id),l.back.map(x=>x.toUpperCase()).join(' · ')+(l.partner?' · with '+l.partner.name:''))).join(''):'<p class="mut small" style="padding:10px 24px">No sets on this phone yet.</p>')+
    '<div style="padding:18px 24px"><button class="btn" data-go="library">Get more sets</button></div>';
  open('drawer');
}
L.drawer.onclick=e=>{
  const f=e.target.closest('[data-f]');
  if(f){S.filter=f.dataset.f;save();close('drawer');setT('translateY(10px)',0,0);build();void card.offsetWidth;setT('none',1,320);return}
};
$('#sel').onclick=openDrawer;

/* right: capsule menu */
function openMenu(){
  const u=Auth.user();
  L.menu.innerHTML=`<div class="mh"><b>${u?esc(u.name):'Guest'}</b><small>${u?esc(u.email):online?'Not signed in':'Offline'}</small></div>
    <button class="mi" data-go="profile">Profile</button><button class="mi" data-go="library">Vocabulary</button>
    <div class="seg"><button data-mode="ko" class="${S.mode==='ko'?'on':''}">KR</button><button data-mode="en" class="${S.mode==='en'?'on':''}">EN</button></div>
    <button class="mi" data-go="settings">Settings</button>`;
  open('menu');
}
$('#me').onclick=()=>isOpen('menu')?close('menu'):openMenu();
L.menu.onclick=e=>{const m=e.target.closest('[data-mode]');if(m){close('menu');setMode(m.dataset.mode)}};
async function setMode(m){
  if(m===S.mode)return;
  S.mode=m;S.filter='all';save();await loadSets();
  setT('scale(.97)',0,0);build();void card.offsetWidth;setT('none',1,340);
  toast('Learning '+LANG[m]);
}

/* global [data-go] router */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-go]');if(!t)return;const p=t.dataset.go;
  close('menu');close('drawer');
  if(p==='all'){S.filter='all';save();return build()}
  ({profile:pageProfile,library:pageLibrary,settings:pageSettings})[p]?.();
});

/* ---------- pages ---------- */
function page(title,html){$('#pgT').textContent=title;$('#pgB').innerHTML=html;$('#pgB').scrollTop=0;open('page');return $('#pgB')}
$('#pgBack').onclick=()=>close('page');

function pageProfile(){
  const u=Auth.user(),words=lib.reduce((a,l)=>a+(l.count||0),0);
  const B=page('Profile',`<div class="pf"><div class="me ${u?'in':''}"><span>${esc(first(u))}</span></div><h2>${u?esc(u.name):'Guest'}</h2><p class="mut">${u?esc(u.email):'Progress is saved on this device.'}</p></div>
    <div class="stats"><div><b>${fmt(words)}</b><small>Words</small></div><div><b>${fmt(Object.keys(S.known).length)}</b><small>Known</small></div><div><b>${fmt(Object.keys(S.fav).length)}</b><small>Saved</small></div></div>
    ${u?'<button class="btn" id="pOut">Sign out</button>':`<button class="btn pri" id="pIn" ${online?'':'disabled'}>Continue with Google</button>${online?'':'<p class="mut small center" style="margin-top:10px">Connect to the internet to sign in.</p>'}`}
    <p class="mut small center" style="margin-top:22px">Files · ${esc(V.where())}</p>`);
  const o=B.querySelector('#pOut');if(o)o.onclick=async()=>{await Auth.logout();toast('Signed out · your words stay on this phone');pageProfile()};
  const i=B.querySelector('#pIn');if(i)i.onclick=signIn;
}

let remote=null;
async function fetchIndex(){
  if(!DATA)throw new Error('GITHUB_RAW is empty (.env)');
  const r=await fetch(DATA+'/index.json?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('Index '+r.status);
  const j=await r.json();return remote=j.sets||[];
}
const codeErr=(msg,wrong)=>Object.assign(new Error(msg),{needCode:true,wrong});
async function download(m,code){
  const r=await fetch(DATA+'/'+m.file+'?v='+m.version,{cache:'no-store'});
  if(!r.ok)throw new Error(m.title+': '+r.status);
  const d=await r.json();if(!d||!Array.isArray(d.items))throw new Error(m.title+': bad file');
  if(d.lock&&d.enc){
    code=code||S.codes[d.id];if(!code)throw codeErr('Code needed');
    try{d.items=await decrypt(d,code)}catch{throw codeErr('Wrong code',true)}
    delete d.enc;delete d.lock;S.codes[d.id]=normCode(code);save();
  }
  await V.put('sets/'+d.id+'.json',d);sets.set(d.id,d);
  lib=lib.filter(x=>x.id!==d.id).concat({id:d.id,title:d.title,learn:d.learn,back:d.back,count:d.items.length,version:d.version||m.version,by:d.by,partner:d.partner});
  await V.put('library.json',lib);
}
async function removeSet(id){
  await V.del('sets/'+id+'.json');sets.delete(id);lib=lib.filter(x=>x.id!==id);await V.put('library.json',lib);
  if(S.filter===id)S.filter='all';save();build();
}
const credits=x=>{const b=x.by||BRAND,p=x.partner;return`<small class="cr"><a ${b.url?`data-url="${esc(b.url)}"`:''}>by ${esc(b.name)}</a>${p?` · <a ${p.url?`data-url="${esc(p.url)}"`:''}>with ${esc(p.name)}</a>`:''}</small>`};
function askCode(m){
  return new Promise(done=>{
    L.sheet.innerHTML=`<small class="ey">Locked set</small><h2>${esc(m.title)}</h2><p class="mut">${fmt(m.count)} words. Enter the code from our Telegram channel.</p>
      <input id="cIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" maxlength="40"><p class="err" id="cErr"></p>
      <button class="btn pri" id="cGo">Unlock</button><button class="btn" data-url="${esc(BRAND.url)}">Get the code on Telegram</button>`;
    open('sheet');const inp=$('#cIn');setTimeout(()=>inp.focus(),300);
    const go=async()=>{
      const c=normCode(inp.value);if(c.length<4)return $('#cErr').textContent='Enter the code';
      $('#cGo').disabled=true;$('#cGo').textContent='Checking…';
      try{await download(m,c);close('sheet');hap('HEAVY');done(true)}
      catch(e){$('#cErr').textContent=e.wrong?'Wrong code — check the latest post':e.message;$('#cGo').disabled=false;$('#cGo').textContent='Unlock'}
    };
    $('#cGo').onclick=go;inp.onkeydown=e=>{if(e.key==='Enter')go()};
  });
}
async function pageLibrary(){
  const B=page('Vocabulary','<p class="mut center" style="padding:40px 0">Loading…</p>');
  let err='';
  if(online){try{await fetchIndex()}catch(e){err=e.message}}
  if(!isOpen('page')||$('#pgT').textContent!=='Vocabulary')return;
  const u=Auth.user()||(!Auth.ready()&&{dev:1}),loc=new Map(lib.map(l=>[l.id,l]));  // no Supabase configured → dev mode, no login needed
  const rows=new Map();(remote&&online?remote:[]).forEach(r=>rows.set(r.id,{...r,local:loc.get(r.id)}));
  lib.forEach(l=>{if(!rows.has(l.id))rows.set(l.id,{...l,local:l,gone:online&&!!remote})});
  const btn=x=>{
    if(x.local&&x.version>x.local.version)return`<button class="lk ol" data-dl="${x.id}" ${u&&online?'':'disabled'}>Update</button>`;
    if(x.local)return`<button class="lk wn" data-rm="${x.id}">Remove</button>`;
    return`<button class="lk ${x.locked&&!S.codes[x.id]?'ol':'pri'}" data-dl="${x.id}" ${u&&online?'':'disabled'}>${x.locked&&!S.codes[x.id]?'Unlock':'Get'}</button>`;
  };
  const sec=m=>{const l=[...rows.values()].filter(x=>x.learn===m);if(!l.length)return'';
    const miss=l.filter(x=>!x.local&&!x.gone&&(!x.locked||S.codes[x.id])).length;
    return`<div class="sec"><h3>Learn ${LANG[m]}${miss&&u&&online?` · <a data-all="${m}" style="color:var(--fg)">get all ${miss}</a>`:''}</h3>`+
      l.sort((p,q)=>!!p.local-!!q.local).map(x=>`<div class="row"><div><b>${esc(x.title)}${x.locked&&!x.local?'<span class="new wine">Code</span>':!x.local&&!x.gone?'<span class="new">New</span>':''}</b><small>${fmt(x.count)} words · ${x.learn.toUpperCase()} → ${(x.back||[]).map(b=>b.toUpperCase()).join(' · ')}${x.local?' · on phone':''}</small>${credits(x)}</div>${btn(x)}</div>`).join('')+'</div>'};
  B.innerHTML=(!online?`<div class="note">Offline · showing sets on this phone. They all work without internet.</div>`:
      !u?`<div class="note">Sign in with Google to download sets.</div><button class="btn pri" id="lIn">Continue with Google</button>`:'')+
    (err?`<div class="note wn">Could not reach the library (${esc(err)}).</div>`:'')+
    (S.mode==='en'?sec('en')+sec('ko'):sec('ko')+sec('en'))||'<p class="mut center" style="padding:40px 0">No sets yet.</p>';
  const li=B.querySelector('#lIn');if(li)li.onclick=signIn;
  B.onclick=async e=>{
    const d=e.target.closest('[data-dl]'),r=e.target.closest('[data-rm]'),a=e.target.closest('[data-all]');
    try{
      if(d){const x=rows.get(d.dataset.dl);
        if(x.locked&&!S.codes[x.id]){await askCode(x);await afterChange();toast('Unlocked · works offline');return pageLibrary()}
        d.disabled=true;d.textContent='…';
        try{await download(x)}catch(er){if(!er.needCode)throw er;delete S.codes[x.id];await askCode(x)}
        await afterChange();toast('Downloaded · works offline');return pageLibrary()}
      if(r){const x=rows.get(r.dataset.rm);if(!confirm(`Remove “${x.title}” from this phone?`))return;await removeSet(x.id);toast('Removed');return pageLibrary()}
      if(a){const l=[...rows.values()].filter(x=>x.learn===a.dataset.all&&!x.local&&!x.gone&&(!x.locked||S.codes[x.id]));let n=0;
        for(const x of l){toast(`Downloading ${++n}/${l.length}…`);await download(x)}await afterChange();toast(`${l.length} set${l.length>1?"s":""} ready offline`);return pageLibrary()}
    }catch(err){toast(err.message||'Download failed');pageLibrary()}
  };
}
async function afterChange(){const k=cur()&&cur().k;await loadSets();build(k)}

function pageSettings(){
  const m=S.mode,seg=(name,opts,val)=>`<div class="seg" data-set="${name}">${opts.map(([v,t])=>`<button data-v="${v}" class="${v===val?'on':''}">${t}</button>`).join('')}</div>`;
  const B=page('Settings',`
    <div class="sec"><h3>Learning</h3>
      <div class="row"><div><b>Language</b><small>What you are learning</small></div>${seg('mode',[['ko','Korean'],['en','English']],m)}</div>
      <div class="row"><div><b>Back side</b><small>Meaning, definition, example</small></div>${seg('back',BACKS[m].map(l=>[l,l.toUpperCase()]),S.back[m])}</div>
    </div>
    <div class="sec"><h3>Voice · ${LANG[m]}</h3>
      <div class="row"><div><b>Voice</b><small>Phone's own engine, no downloads</small></div><select id="sVoice"><option value="auto">Auto · most natural</option></select></div>
      <div class="row"><div><b>Speed</b><small id="sRateV">${S.rate.toFixed(2)}×</small></div><input type="range" id="sRate" min="0.5" max="1.4" step="0.05" value="${S.rate}"></div>
      <div class="row"><div><b>Test</b><small>${esc(m==='ko'?'안녕하세요':'Hello, nice to meet you')}</small></div><button class="lk" id="sTest">Play</button></div>
      ${Speech.native?`<div class="row"><div><b>Better voices</b><small>Settings → Install voice data → ${LANG[m]} (high quality)</small></div><button class="lk ol" id="sInst">Open</button></div>`:''}
    </div>
    <div class="sec"><h3>Cards</h3>
      <div class="row"><div><b>Next word</b><small>Swipe direction</small></div>${seg('swipe',[['right','→ Right'],['left','← Left']],S.swipe)}</div>
      <div class="row"><div><b>Order</b><small>Across all your sets</small></div>${seg('order',[['seq','In order'],['shuffle','Shuffle']],S.order)}</div>
      <div class="row"><div><b>Known words</b><small>${fmt(Object.keys(S.known).length)} hidden</small></div><button class="lk wn" id="sReset" ${Object.keys(S.known).length?'':'disabled'}>Reset</button></div>
    </div>
    <p class="mut small center" style="margin-top:28px">${esc(CFG.APP_NAME)} · files in ${esc(V.where())}</p>`);
  B.querySelectorAll('[data-set]').forEach(sg=>sg.onclick=async e=>{
    const b=e.target.closest('[data-v]');if(!b)return;const k=sg.dataset.set,v=b.dataset.v;
    if(k==='mode'){await setMode(v);return pageSettings()}
    if(k==='back'){S.back[S.mode]=v;paintCard()}
    if(k==='swipe')S.swipe=v;
    if(k==='order'){S.order=v;S.seed=(Math.random()*1e9)|0;S.pos={};build()}
    save();sg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  });
  Speech.voices(m).then(vs=>{
    const sel=B.querySelector('#sVoice');if(!sel)return;
    sel.innerHTML='<option value="auto">Auto · most natural</option>'+vs.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}${v.local?'':' · online'}</option>`).join('');
    sel.value=vs.some(v=>v.id===S.voice[m])?S.voice[m]:'auto';
    if(!vs.length&&!Speech.native)sel.insertAdjacentHTML('beforeend','<option disabled>No voices in this browser</option>');
  });
  B.querySelector('#sVoice').onchange=e=>{S.voice[m]=e.target.value;save()};
  B.querySelector('#sRate').oninput=e=>{S.rate=+e.target.value;B.querySelector('#sRateV').textContent=S.rate.toFixed(2)+'×';save()};
  B.querySelector('#sTest').onclick=()=>Speech.say(m==='ko'?'안녕하세요':'Hello, nice to meet you',m,{rate:S.rate,voice:S.voice[m],online}).catch(e=>toast(e.message));
  const inst=B.querySelector('#sInst');if(inst)inst.onclick=()=>Speech.install().then(()=>Speech.reset()).catch(()=>toast('Open Android Settings → Text-to-speech'));
  B.querySelector('#sReset').onclick=()=>{const old=S.known;S.known={};save();build();toast('Known words are back',()=>{S.known=old;save();build()});pageSettings()};
}

/* ---------- login gate (online + not signed in) ---------- */
async function signIn(){
  if(!online)return toast('No internet');
  try{await Auth.login()}catch(e){toast(e.message)}
}
function gate(){
  asked=true;
  L.gate.innerHTML=`<div class="gw"><b>${esc(CFG.APP_NAME)}</b><span>Korean · English</span></div>
    <p>Sign in to download vocabulary sets. After that, everything works offline.</p>
    <button class="btn pri" id="gIn">Continue with Google</button><button class="btn" id="gNo">Not now</button>`;
  $('#gIn').onclick=signIn;$('#gNo').onclick=skipGate;
  open('gate');
}
function skipGate(){localStorage.setItem('skipUntil',Date.now()+864e5);close('gate')}

Auth.on(u=>{
  paintMe();
  if(u){close('gate');toast('Signed in · '+u.name);autoUpdate();if(isOpen('page')&&/Vocabulary|Profile/.test($('#pgT').textContent))($('#pgT').textContent==='Profile'?pageProfile:pageLibrary)()}
  const e=Auth.error();if(e)toast(e);
});

/* ---------- network ---------- */
async function checkNet(first){
  let on=navigator.onLine;
  if(CAP.Network){try{on=(await CAP.Network.getStatus()).connected}catch{}}
  const changed=on!==online;online=on;paintMe();
  if(changed&&!first)toast(on?'Online':'Offline · everything still works');
  if(on&&(changed||first))onOnline();
}
async function onOnline(){
  await Auth.refresh();paintMe();
  if(Auth.user())return autoUpdate();
  if(!asked&&Auth.ready()&&Date.now()>(+localStorage.getItem('skipUntil')||0))gate();
}
let upd=false;
async function autoUpdate(){       // silently refresh downloaded sets that changed on GitHub
  if(upd||!online||!Auth.user()||!lib.length)return;upd=true;
  try{
    const r=await fetchIndex(),loc=new Map(lib.map(l=>[l.id,l]));let n=0;
    for(const x of r){const l=loc.get(x.id);if(l&&x.version>l.version){try{await download(x);n++}catch{}}}
    if(n){await afterChange();toast(`${n} set${n>1?'s':''} updated`)}
  }catch{}finally{upd=false}
}
addEventListener('online',()=>checkNet());addEventListener('offline',()=>checkNet());
if(CAP.Network)CAP.Network.addListener('networkStatusChange',()=>checkNet());
if(CAP.App)CAP.App.addListener('resume',()=>checkNet());

/* ---------- keyboard (web) ---------- */
addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea')||e.repeat&&e.code==='Space')return;
  if(e.key==='Escape')return back();
  if(isOpen('page')||isOpen('gate'))return;
  if(e.key==='ArrowRight')go(nextDir()>0?1:-1,1);
  else if(e.key==='ArrowLeft')go(nextDir()>0?-1:1,-1);
  else if(e.code==='Space'){e.preventDefault();deck.length&&flip(true)}
  else if(e.key==='s')$('#aFav').click();else if(e.key==='l')$('#aSay').click();else if(e.key==='k')$('#aKnow').click();
});
addEventListener('keyup',e=>{if(e.code==='Space')flip(false)});
addEventListener('resize',debounce(paintCard,150));

/* ---------- boot ---------- */
(async()=>{
  try{if(CAP.StatusBar){CAP.StatusBar.setBackgroundColor({color:'#050505'});CAP.StatusBar.setStyle({style:'DARK'})}}catch{}
  const s=await V.get('state.json',null);
  if(s)S={...DEF,...s,back:{...DEF.back,...(s.back||{})},voice:{...DEF.voice,...(s.voice||{})},codes:{...(s.codes||{})}};
  if(!S.seed)S.seed=(Math.random()*1e9)|0;
  lib=await V.get('library.json',[]);
  await loadSets();build();paintMe();
  requestAnimationFrame(()=>document.body.classList.add('ready'));
  if(!NATIVE&&'serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
  await checkNet(true);
})();
})();