/* Vocab admin UI — left: users, right: vocabulary sets (files in data/sets). */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j};
const LANG={ko:'Korean',en:'English',uz:'Uzbek',ru:'Russian'},BACKS={ko:['en','uz'],en:['ko','uz','ru']};
const ago=t=>{if(!t)return'never';const s=(Date.now()-new Date(t))/1e3;return s<3600?Math.max(1,s/60|0)+'m ago':s<86400?(s/3600|0)+'h ago':s<2592e3?(s/86400|0)+'d ago':new Date(t).toLocaleDateString()};
let tt;const toast=m=>{const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('show'),2600)};
const rid=()=>Math.random().toString(36).slice(2,9);

/* ---------- users ---------- */
let U=[];
async function loadUsers(){
  try{U=await api('/api/users');drawUsers()}
  catch(e){$('#uL').innerHTML=`<p class="empty">${esc(e.message)}</p>`}
}
function drawUsers(){
  const q=$('#uQ').value.trim().toLowerCase(),l=U.filter(u=>!q||(u.name+' '+u.email).toLowerCase().includes(q));
  $('#uN').textContent=U.length+' total';
  $('#uL').innerHTML=l.map(u=>`<div class="u"><div><b>${esc(u.name||u.email)}</b><br><small>${esc(u.email)}</small></div><div class="r">${esc(u.provider)}<br>${ago(u.last)}</div></div>`).join('')||'<p class="empty">No users</p>';
}
$('#uQ').oninput=drawUsers;

/* ---------- sets ---------- */
let IDX=[],S=null,editId=null;
async function loadIndex(sel){
  IDX=(await api('/api/sets')).sets;
  $('#sSel').innerHTML=IDX.length?IDX.map(s=>`<option value="${s.id}">${esc(s.title)} · ${s.learn.toUpperCase()} · ${s.count}</option>`).join(''):'<option value="">No sets yet</option>';
  const id=sel||S&&S.id||IDX[0]&&IDX[0].id;
  if(id){$('#sSel').value=id;await openSet(id)}else{S=null;drawSet()}
}
async function openSet(id){S=await api('/api/sets/'+id);editId=null;drawSet()}
$('#sSel').onchange=e=>openSet(e.target.value);
async function saveSet(msg){
  const m=await api('/api/sets/'+S.id,{method:'PUT',body:JSON.stringify(S)});
  S.version=m.version;toast(msg||'Saved');
  const o=[...$('#sSel').options].find(o=>o.value===S.id);if(o)o.textContent=`${S.title} · ${S.learn.toUpperCase()} · ${S.items.length}`;
  drawMeta();
}
function drawSet(){
  const on=!!S;$('#wF').style.display=$('#bulkD').style.display=on?'':'none';
  if(!on){$('#sMeta').innerHTML='<span class="mut">Create your first set → “New set”.</span>';$('#wL').innerHTML='';$('#wN').textContent='';return}
  drawMeta();drawForm();drawWords();
}
function drawMeta(){
  $('#sMeta').innerHTML=`<div><b>${esc(S.title)}</b><span class="chip">${S.learn.toUpperCase()} → ${S.back.map(x=>x.toUpperCase()).join(' · ')}</span><br><span class="mut">${S.id}.json · v${S.version||0} · ${S.items.length} words</span></div>
  <div class="hr"><button class="btn ghost" id="sEd">Edit</button><button class="btn wn" id="sDel">Delete</button></div>`;
  $('#sEd').onclick=()=>setDialog(S);
  $('#sDel').onclick=async()=>{if(!confirm(`Delete “${S.title}” (${S.items.length} words)?`))return;await api('/api/sets/'+S.id,{method:'DELETE'});S=null;toast('Deleted');loadIndex()};
}
function drawForm(it){
  it=it||{tr:{}};
  $('#wF').innerHTML=`<div class="g3">
    <label>Word (${LANG[S.learn]})<input name="word" value="${esc(it.word)}" required></label>
    <label>Pronunciation<input name="pron" value="${esc(it.pron)}"></label>
    <label>Example (${LANG[S.learn]})<input name="ex" value="${esc(it.ex)}"></label></div>`+
  S.back.map(l=>{const t=it.tr[l]||{};return`<fieldset><legend>${LANG[l].toUpperCase()}</legend>
    <label>Meaning<input name="${l}.m" value="${esc(t.m)}"></label>
    <label>Definition<input name="${l}.d" value="${esc(t.d)}"></label>
    <label>Example translation<input name="${l}.x" value="${esc(t.x)}"></label></fieldset>`}).join('')+
  `<div class="fa">${editId?'<button class="btn ghost" type="button" id="wC">Cancel</button>':''}<button class="btn pri">${editId?'Save changes':'Add word'}</button></div>`;
  if(editId)$('#wC').onclick=()=>{editId=null;drawForm()};
}
$('#wF').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target),g=k=>String(f.get(k)||'').trim();
  const it={id:editId||rid(),word:g('word'),pron:g('pron'),ex:g('ex'),tr:{}};
  if(!it.word)return;
  S.back.forEach(l=>{const t={m:g(l+'.m'),d:g(l+'.d'),x:g(l+'.x')};if(t.m||t.d||t.x)it.tr[l]=t});
  if(editId){const i=S.items.findIndex(x=>x.id===editId);S.items[i]=it}else S.items.unshift(it);
  const was=editId;editId=null;await saveSet(was?'Updated':`Added “${it.word}”`);drawForm();drawWords();
  e.target.querySelector('input').focus();
};
function drawWords(){
  const q=$('#wQ').value.trim().toLowerCase(),all=S.items.filter(it=>!q||JSON.stringify(it).toLowerCase().includes(q)),l=all.slice(0,300);
  $('#wN').textContent=`${S.items.length}`+(q?` · ${all.length} found`:'');
  $('#wL').innerHTML=l.map(it=>{const t=it.tr[S.back[0]]||{};return`<div class="w" data-id="${it.id}"><div><b>${esc(it.word)}</b> <small>${esc(it.pron)}</small><br><small>${S.back.map(b=>esc((it.tr[b]||{}).m||'—')).join(' · ')}</small></div><button class="btn wn x" data-del="${it.id}" type="button">Delete</button></div>`}).join('')+(all.length>300?`<p class="empty">+${all.length-300} more — search to narrow</p>`:'')||'<p class="empty">No words yet</p>';
}
$('#wQ').oninput=()=>S&&drawWords();
$('#wL').onclick=async e=>{
  const d=e.target.closest('[data-del]');
  if(d){const it=S.items.find(x=>x.id===d.dataset.del);S.items=S.items.filter(x=>x.id!==d.dataset.del);await saveSet(`Deleted “${it.word}”`);return drawWords()}
  const w=e.target.closest('.w');if(!w)return;
  editId=w.dataset.id;drawForm(S.items.find(x=>x.id===editId));scrollTo({top:0,behavior:'smooth'});
};

/* bulk: header row + rows, separated by tab or | */
$('#bulkGo').onclick=async()=>{
  const lines=$('#bulk').value.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return toast('Need header + rows');
  const sep=lines[0].includes('\t')?'\t':'|',cols=lines[0].split(sep).map(c=>c.trim().toLowerCase());
  if(!cols.includes('word'))return toast('Header must include “word”');
  const have=new Map(S.items.map(x=>[x.word,x]));let add=0,upd=0;
  for(const ln of lines.slice(1)){
    const v=ln.split(sep).map(c=>c.trim()),o={};cols.forEach((c,i)=>o[c]=v[i]||'');
    if(!o.word)continue;
    const it=have.get(o.word)||{id:rid(),word:o.word,tr:{}};
    if(o.pron)it.pron=o.pron;if(o.ex)it.ex=o.ex;
    S.back.forEach(l=>['m','d','x'].forEach(k=>{const val=o[l+'.'+k];if(val){it.tr[l]=it.tr[l]||{};it.tr[l][k]=val}}));
    if(have.has(o.word))upd++;else{S.items.push(it);have.set(o.word,it);add++}
  }
  await saveSet(`Imported: ${add} new, ${upd} updated`);$('#bulk').value='';drawWords();
};

/* new / edit set dialog */
function setDialog(cur){
  const d=$('#dlg'),isNew=!cur;cur=cur||{title:'',id:'',learn:'ko',back:['en','uz']};
  d.innerHTML=`<form class="card" id="sF"><h2>${isNew?'New set':'Edit set'}</h2>
    <label>Title<input name="title" value="${esc(cur.title)}" placeholder="Numbers" required></label>
    <label>File id<input name="id" value="${esc(cur.id)}" placeholder="ko-numbers" ${isNew?'':'disabled'} pattern="[a-z0-9][a-z0-9-]{1,59}"></label>
    <label>Learning<select name="learn" ${isNew?'':'disabled'}><option value="ko">Korean</option><option value="en">English</option></select></label>
    <label>Back side languages<div class="ck" id="bk"></div></label>
    <div class="fa"><button class="btn ghost" type="button" id="sX">Cancel</button><button class="btn pri">${isNew?'Create':'Save'}</button></div></form>`;
  const F=$('#sF');F.learn.value=cur.learn;
  const bk=()=>{$('#bk').innerHTML=BACKS[F.learn.value].map(l=>`<label><input type="checkbox" name="b" value="${l}" ${cur.back.includes(l)?'checked':''}>${LANG[l]}</label>`).join('')};bk();
  F.learn.onchange=()=>{cur.back=BACKS[F.learn.value];bk();if(isNew&&!F.id.dataset.touched)F.id.value=slug()};
  const slug=()=>F.learn.value+'-'+F.title.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  F.title.oninput=()=>{if(isNew&&!F.id.dataset.touched)F.id.value=slug()};F.id.oninput=()=>F.id.dataset.touched=1;
  $('#sX').onclick=()=>d.classList.remove('open');
  F.onsubmit=async e=>{e.preventDefault();
    const back=[...F.querySelectorAll('[name=b]:checked')].map(x=>x.value);if(!back.length)return toast('Pick a back language');
    try{
      if(isNew){if(IDX.some(s=>s.id===F.id.value))return toast('That id exists');S={id:F.id.value,title:F.title.value.trim(),learn:F.learn.value,back,items:[]}}
      else{S.title=F.title.value.trim();S.back=back}
      await saveSet(isNew?'Set created':'Set saved');d.classList.remove('open');await loadIndex(S.id);
    }catch(err){toast(err.message)}
  };
  d.classList.add('open');F.title.focus();
}
$('#sNew').onclick=()=>setDialog(null);
$('#dlg').onclick=e=>{if(e.target.id==='dlg')e.target.classList.remove('open')};

/* publish = git add data && commit && push */
$('#pub').onclick=async()=>{
  const b=$('#pub');b.disabled=true;b.textContent='Publishing…';
  try{const r=await api('/api/publish',{method:'POST'});
    $('#dlg').innerHTML=`<div class="card"><h2>${r.ok?'Published ✓':'Publish failed'}</h2><p class="mut">${r.ok?'Users get the new sets next time they open Vocabulary.':'Check git remote / credentials.'}</p><pre>${esc(r.log)}</pre><div class="fa"><button class="btn pri" onclick="this.closest('#dlg').classList.remove('open')">Close</button></div></div>`;
    $('#dlg').classList.add('open');
  }catch(e){toast(e.message)}
  b.disabled=false;b.textContent='Publish';
};

loadUsers();loadIndex();
