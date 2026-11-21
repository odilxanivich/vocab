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
const BACKS={ko:['en','uz'],en:['en','uz','ko','ru']};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.png':'image/png'};
fs.mkdirSync(SETS,{recursive:true});

// ---------- sets ----------
const setFile=id=>path.join(SETS,id+'.json');
const readSet=id=>{try{return JSON.parse(fs.readFileSync(setFile(id),'utf8'))}catch{return null}};
function clean(set){
  if(!set||typeof set!=='object')throw new Error('Bad set');
  const id=String(set.id||'').trim();
  if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id))throw new Error('id: a-z, 0-9, "-" (2–60)');
  if(!BACKS[set.learn])throw new Error('learn must be ko or en');
  const back=(set.back||[]).filter(l=>BACKS[set.learn].includes(l));
  if(!back.length)throw new Error('Pick at least one back language');
  const seen=new Set(),items=[];
  for(const it of set.items||[]){
    const word=String(it.word||'').trim();if(!word)continue;
    let iid=String(it.id||'').trim();if(!iid||seen.has(iid))iid=Math.random().toString(36).slice(2,9);seen.add(iid);
    const tr={};
    for(const l of back){const t=(it.tr||{})[l]||{},o={};for(const k of['m','d','x'])if(String(t[k]||'').trim())o[k]=String(t[k]).trim();if(Object.keys(o).length)tr[l]=o}
    const o={id:iid,word};if(String(it.pron||'').trim())o.pron=String(it.pron).trim();if(String(it.ex||'').trim())o.ex=String(it.ex).trim();o.tr=tr;
    items.push(o);
  }
  return{id,title:String(set.title||id).trim().slice(0,80),learn:set.learn,back,items};
}
function writeSet(raw){
  const set=clean(raw),prev=readSet(set.id);
  set.version=((prev&&prev.version)||0)+1;set.updated=new Date().toISOString();
  fs.writeFileSync(setFile(set.id),JSON.stringify({id:set.id,title:set.title,learn:set.learn,back:set.back,version:set.version,updated:set.updated,items:set.items},null,1)+'\n');
  return buildIndex().sets.find(s=>s.id===set.id);
}
function buildIndex(){
  const sets=fs.readdirSync(SETS).filter(f=>f.endsWith('.json')).map(f=>{
    const s=readSet(f.slice(0,-5));if(!s||!Array.isArray(s.items))return null;
    return{id:s.id,title:s.title,learn:s.learn,back:s.back,count:s.items.length,version:s.version||1,updated:s.updated||null,file:'sets/'+f,size:fs.statSync(path.join(SETS,f)).size};
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
    if(P==='/api/publish'&&M==='POST')return send(res,200,await publish());
    if(P==='/app')return res.writeHead(302,{Location:'/app/'}).end();
    if(P.startsWith('/app/data/'))return file(res,DATA,P.slice(10));
    if(P.startsWith('/app/'))return file(res,WWW,P.slice(5));
    if(P.startsWith('/fonts/'))return file(res,path.join(WWW,'fonts'),P.slice(7));
    return file(res,__dirname,P==='/'?'index.html':P);
  }catch(e){send(res,400,{error:e.message||String(e)})}
}).listen(PORT,'127.0.0.1',()=>{buildIndex();console.log(`\n  Admin  http://localhost:${PORT}\n  App    http://localhost:${PORT}/app/\n`)});