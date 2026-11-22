#!/usr/bin/env node
/* Vocab admin — localhost only, zero dependencies.
   Users  ← Supabase Auth (secret key from .env, never leaves this PC)
   Sets   → data/sets/<id>.json  +  data/index.json  → git push → app downloads from GitHub
   Also serves the app at /app/ for local preview.                       */
const http=require('http'),fs=require('fs'),path=require('path'),{execFile}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data'),SETS=path.join(DATA,'sets'),WWW=path.join(ROOT,'www');
const env=(()=>{try{return Object.fromEntries(fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)
  .map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,'')]))}catch{return{}}})();
const PORT=+process.env.PORT||+env.ADMIN_PORT||4321;
const BACKS={ko:['en','uz','ru'],en:['en','ko','uz','ru']};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.png':'image/png'};
fs.mkdirSync(SETS,{recursive:true});

// ---------- sets ----------
const crypto=require('crypto');
const BY={name:env.BY_NAME||env.APP_NAME||'Vocab',url:env.BY_URL||'https://t.me/odilxanivich'};
const setFile=id=>path.join(SETS,id+'.json');
const readSet=id=>{try{return JSON.parse(fs.readFileSync(setFile(id),'utf8'))}catch{return null}};
const link=o=>{if(!o||typeof o!=='object')return null;const name=String(o.name||'').trim().slice(0,40),url=String(o.url||'').trim();
  if(!name)return null;if(url&&!/^https:\/\/\S+$/.test(url))throw new Error('Link must start with https://');return url?{name,url}:{name}};
function cleanItems(list,back){
  const seen=new Set(),items=[];
  for(const it of list||[]){
    const word=String(it.word||'').trim();if(!word)continue;
    let iid=String(it.id||'').trim();if(!iid||seen.has(iid))iid=Math.random().toString(36).slice(2,9);seen.add(iid);
    const tr={};
    for(const l of back){const t=(it.tr||{})[l]||{},o={};for(const k of['m','d','x'])if(String(t[k]||'').trim())o[k]=String(t[k]).trim();if(Object.keys(o).length)tr[l]=o}
    const o={id:iid,word};if(String(it.pron||'').trim())o.pron=String(it.pron).trim();if(String(it.ex||'').trim())o.ex=String(it.ex).trim();o.tr=tr;
    items.push(o);
  }
  return items;
}
function clean(set){
  if(!set||typeof set!=='object')throw new Error('Bad set');
  const id=String(set.id||'').trim();
  if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id))throw new Error('id: a-z, 0-9, "-" (2–60)');
  if(!BACKS[set.learn])throw new Error('learn must be ko or en');
  const back=(set.back||[]).filter(l=>BACKS[set.learn].includes(l));
  if(!back.length)throw new Error('Pick at least one back language');
  const o={id,title:String(set.title||id).trim().slice(0,80),learn:set.learn,back,by:link(set.by)||BY};
  const pt=link(set.partner);if(pt)o.partner=pt;
  if(set.lock&&set.enc){o.lock=set.lock;o.enc=String(set.enc);o.count=+set.count||0;o.items=[]}
  else o.items=cleanItems(set.items,back);
  return o;
}
function writeSet(raw){
  const set=clean(raw),prev=readSet(set.id);
  const out={id:set.id,title:set.title,learn:set.learn,back:set.back,by:set.by,...(set.partner?{partner:set.partner}:{}),
    version:((prev&&prev.version)||0)+1,updated:new Date().toISOString(),
    ...(set.lock?{lock:set.lock,count:set.count,enc:set.enc}:{}),items:set.items};
  fs.writeFileSync(setFile(set.id),JSON.stringify(out,null,1)+'\n');
  return buildIndex().sets.find(s=>s.id===set.id);
}
// Unlock codes: items are AES-256-GCM encrypted with a key from the code (PBKDF2-SHA256).
// The app decrypts with WebCrypto — without the code the words can't be read.
const normCode=c=>String(c||'').toUpperCase().replace(/\s+/g,'');
const kdf=(code,salt)=>crypto.pbkdf2Sync(normCode(code),salt,150000,32,'sha256');
function lockSet(id,code){
  const s=readSet(id);if(!s)throw new Error('not found');if(s.lock)throw new Error('Already locked');
  if(normCode(code).length<4)throw new Error('Code: at least 4 characters');
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',kdf(code,salt),iv);
  const ct=Buffer.concat([c.update(JSON.stringify(s.items),'utf8'),c.final(),c.getAuthTag()]);
  return writeSet({...s,lock:{v:1,salt:salt.toString('base64'),iv:iv.toString('base64')},count:s.items.length,enc:ct.toString('base64'),items:[]});
}
function unlockSet(id,code){
  const s=readSet(id);if(!s||!s.lock)throw new Error('Not locked');
  try{
    const buf=Buffer.from(s.enc,'base64'),d=crypto.createDecipheriv('aes-256-gcm',kdf(code,Buffer.from(s.lock.salt,'base64')),Buffer.from(s.lock.iv,'base64'));
    d.setAuthTag(buf.subarray(-16));
    const items=JSON.parse(Buffer.concat([d.update(buf.subarray(0,-16)),d.final()]).toString('utf8'));
    const{lock,enc,count,...rest}=s;return writeSet({...rest,items});
  }catch{throw new Error('Wrong code')}
}
function buildIndex(){
  const sets=fs.readdirSync(SETS).filter(f=>f.endsWith('.json')).map(f=>{
    const s=readSet(f.slice(0,-5));if(!s||!Array.isArray(s.items))return null;
    return{id:s.id,title:s.title,learn:s.learn,back:s.back,count:s.lock?s.count:s.items.length,version:s.version||1,updated:s.updated||null,
      by:s.by||BY,...(s.partner?{partner:s.partner}:{}),...(s.lock?{locked:true}:{}),file:'sets/'+f,size:fs.statSync(path.join(SETS,f)).size};
  }).filter(Boolean).sort((a,b)=>a.learn.localeCompare(b.learn)||a.title.localeCompare(b.title));
  const idx={updated:new Date().toISOString(),sets};
  fs.writeFileSync(path.join(DATA,'index.json'),JSON.stringify(idx,null,1)+'\n');
  return idx;
}
if(process.argv.includes('--index')){const i=buildIndex();console.log(`✓ data/index.json — ${i.sets.length} sets`);process.exit(0)}

// ---------- users (Supabase Auth admin API) ----------
async function users(){
  const U=(env.SUPABASE_URL||'').replace(/\/$/,''),K=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_KEY;
  if(!U||!K)throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (sb_secret_…) in .env');
  const H={apikey:K};if(K.startsWith('eyJ'))H.Authorization='Bearer '+K;   // new sb_secret_ keys: apikey header only
  const out=[];
  for(let page=1;page<50;page++){
    const r=await fetch(`${U}/auth/v1/admin/users?page=${page}&per_page=1000`,{headers:H});
    if(!r.ok)throw new Error('Supabase '+r.status+': '+(await r.text()).slice(0,160));
    const j=await r.json(),list=j.users||[];
    for(const u of list){const m=u.user_metadata||{};out.push({id:u.id,email:u.email,name:m.full_name||m.name||'',provider:(u.app_metadata||{}).provider||'',created:u.created_at,last:u.last_sign_in_at})}
    if(list.length<1000)break;
  }
  return out.sort((a,b)=>String(b.last||'').localeCompare(String(a.last||'')));
}

// ---------- git publish ----------
const git=(...a)=>new Promise(res=>execFile('git',a,{cwd:ROOT},(e,o,er)=>res({ok:!e,out:(o||'')+(er||'')})));
async function publish(){
  let log='';const step=async(...a)=>{const r=await git(...a);log+=`$ git ${a.join(' ')}\n${r.out}\n`;return r};
  await step('add','data');
  const c=await step('commit','-m','vocab: update '+new Date().toISOString().slice(0,16).replace('T',' '));
  if(!c.ok&&!/nothing to commit/.test(c.out))return{ok:false,log};
  const p=await step('push');return{ok:p.ok,log};
}

// ---------- http ----------
const send=(res,code,body,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body))};
const body=req=>new Promise((ok,no)=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(c).toString()||'{}'))}catch(e){no(e)}});req.on('error',no)});
function file(res,base,rel){
  const p=path.normalize(path.join(base,rel));
  if(!p.startsWith(base))return send(res,403,{error:'forbidden'});
  fs.stat(p,(e,st)=>{
    if(e)return send(res,404,{error:'not found'});
    if(st.isDirectory())return file(res,base,path.join(rel,'index.html'));
    res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(p).pipe(res);
  });
}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),P=decodeURIComponent(u.pathname),M=req.method;
  try{
    if(P==='/api/users')return send(res,200,await users());
    if(P==='/api/sets'&&M==='GET')return send(res,200,buildIndex());
    const m=P.match(/^\/api\/sets\/([a-z0-9-]+)$/);
    if(m&&M==='GET'){const s=readSet(m[1]);return s?send(res,200,s):send(res,404,{error:'not found'})}
    if(m&&M==='PUT'){const b=await body(req);b.id=m[1];return send(res,200,writeSet(b))}
    if(m&&M==='DELETE'){fs.rmSync(setFile(m[1]),{force:true});return send(res,200,buildIndex())}
    const x=P.match(/^\/api\/sets\/([a-z0-9-]+)\/(lock|unlock|partner)$/);
    if(x&&M==='POST'){const b=await body(req),id=x[1];
      if(x[2]==='lock')return send(res,200,lockSet(id,b.code));
      if(x[2]==='unlock')return send(res,200,unlockSet(id,b.code));
      const s=readSet(id);if(!s)return send(res,404,{error:'not found'});
      const pt=link(b.partner);const{partner,...rest}=s;return send(res,200,writeSet(pt?{...rest,partner:pt}:rest))}
    if(P==='/api/publish'&&M==='POST')return send(res,200,await publish());
    if(P==='/app')return res.writeHead(302,{Location:'/app/'}).end();
    if(P.startsWith('/app/data/'))return file(res,DATA,P.slice(10));
    if(P.startsWith('/app/'))return file(res,WWW,P.slice(5));
    if(P.startsWith('/fonts/'))return file(res,path.join(WWW,'fonts'),P.slice(7));
    return file(res,__dirname,P==='/'?'index.html':P);
  }catch(e){send(res,400,{error:e.message||String(e)})}
}).listen(PORT,'127.0.0.1',()=>{buildIndex();console.log(`\n  Admin  http://localhost:${PORT}\n  App    http://localhost:${PORT}/app/\n`)});