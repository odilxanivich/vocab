/* Web only: app shell offline. Vocabulary lives in IndexedDB (js/store.js). */
const C='vocab-v1',SHELL=['./','index.html','css/app.css','js/config.js','js/store.js','js/auth.js','js/tts.js','js/app.js','icon.svg','manifest.webmanifest','fonts/PretendardVariable.woff2','fonts/inter-cyrillic.woff2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/data/'))return;
  e.respondWith(caches.open(C).then(async c=>{
    const hit=await c.match(e.request,{ignoreSearch:true});
    const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
    return hit||net;
  }));
});
