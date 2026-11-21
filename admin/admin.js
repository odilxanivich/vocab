/* Vocab admin — left: users · right: vocabulary files (upload / delete, then Publish). */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j};
const ago=t=>{if(!t)return'never';const s=(Date.now()-new Date(t))/1e3;return s<3600?Math.max(1,s/60|0)+'m ago':s<86400?(s/3600|0)+'h ago':s<2592e3?(s/86400|0)+'d ago':new Date(t).toLocaleDateString()};
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,n/1024|0)+' KB';
let tt;const toast=m=>{const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('show'),3000)};
const dialog=(title,html)=>{$('#dlg').innerHTML=`<div class="card"><h2>${title}</h2>${html}<div class="fa"><button class="btn pri" onclick="this.closest('#dlg').classList.remove('open')">Close</button></div></div>`;$('#dlg').classList.add('open')};
$('#dlg').onclick=e=>{if(e.target.id==='dlg')e.target.classList.remove('open')};

/* ---------- users ---------- */
let U=[];
async function loadUsers(){try{U=await api('/api/users');drawUsers()}catch(e){$('#uL').innerHTML=`<p class="empty">${esc(e.message)}</p>`}}
function drawUsers(){
  const q=$('#uQ').value.trim().toLowerCase(),l=U.filter(u=>!q||(u.name+' '+u.email).toLowerCase().includes(q));
  $('#uN').textContent=U.length+' total';
  $('#uL').innerHTML=l.map(u=>`<div class="u"><div><b>${esc(u.name||u.email)}</b><br><small>${esc(u.email)}</small></div><div class="r">${esc(u.provider)}<br>${ago(u.last)}</div></div>`).join('')||'<p class="empty">No users</p>';
}
$('#uQ').oninput=drawUsers;

/* ---------- files ---------- */
let F=[];
async function loadFiles(){
  F=(await api('/api/sets')).sets;
  const words=F.reduce((a,s)=>a+s.count,0);
  $('#fN').textContent=`${F.length} files · ${words.toLocaleString()} words`;
  $('#fL').innerHTML=F.map(s=>`<div class="f"><div><b>${esc(s.title)}</b><br><small>${esc(s.id)}.json · ${s.learn.toUpperCase()} → ${s.back.map(x=>x.toUpperCase()).join(' · ')} · v${s.version} · ${kb(s.size)} · ${ago(s.updated)}</small></div>
    <div class="n"><b>${s.count.toLocaleString()}</b><small>words</small></div><button class="btn wn" data-del="${s.id}">Delete</button></div>`).join('')||'<p class="empty">No files yet — drop one above.</p>';
}
$('#fL').onclick=async e=>{
  const b=e.target.closest('[data-del]');if(!b)return;const s=F.find(x=>x.id===b.dataset.del);
  if(!confirm(`Delete “${s.title}” (${s.count} words)?\nPhones keep their copy until you Publish.`))return;
  await api('/api/sets/'+s.id,{method:'DELETE'});toast('Deleted · press Publish');loadFiles();
};
const slug=n=>n.toLowerCase().replace(/\.json$/,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
async function upload(files){
  const ok=[],bad=[];
  for(const f of files){
    try{
      if(!/\.json$/i.test(f.name))throw new Error('not a .json file');
      const d=JSON.parse(await f.text());
      if(!d||Array.isArray(d)||!Array.isArray(d.items))throw new Error('missing "items" array — use the app format');
      d.id=d.id||slug(f.name);
      if(F.some(x=>x.id===d.id)&&!confirm(`“${d.id}” already exists. Replace it?`))continue;
      const m=await api('/api/sets/'+d.id,{method:'PUT',body:JSON.stringify(d)});
      ok.push(`${m.title} — ${m.count} words (v${m.version})`);
    }catch(e){bad.push(`${f.name}: ${e.message}`)}
  }
  await loadFiles();
  if(bad.length)dialog('Some files failed',`<pre>${esc([...ok.map(x=>'✓ '+x),...bad.map(x=>'✗ '+x)].join('\n'))}</pre>`);
  else if(ok.length)toast(`Uploaded ${ok.length} file${ok.length>1?'s':''} · press Publish`);
}
const drop=$('#drop');
$('#fIn').onchange=e=>{upload([...e.target.files]);e.target.value=''};
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>upload([...e.dataTransfer.files]));

/* ---------- publish = git add data && commit && push ---------- */
$('#pub').onclick=async()=>{
  const b=$('#pub');b.disabled=true;b.textContent='Publishing…';
  try{const r=await api('/api/publish',{method:'POST'});
    dialog(r.ok?'Published ✓':'Publish failed',`<p class="mut">${r.ok?'Phones see the changes in Vocabulary within ~5 minutes.':'Check git remote / login.'}</p><pre>${esc(r.log)}</pre>`);
  }catch(e){toast(e.message)}
  b.disabled=false;b.textContent='Publish';
};
loadUsers();loadFiles();
