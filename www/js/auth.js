/* Google login via Supabase Auth — no SDK, ~60 lines.
   Android: system browser → <APP_ID>://auth#access_token=…   Web: same page #access_token=…
   Session is kept on the device, so the account stays "known" offline.            */
window.Auth=(()=>{
const C=window.Capacitor,P=(C&&C.Plugins)||{},native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
const U=(CFG.SUPABASE_URL||'').replace(/\/$/,''),K=CFG.SUPABASE_ANON,RED=CFG.APP_ID+'://auth';
let s=null;try{s=JSON.parse(localStorage.getItem('sess'))}catch{}
const subs=new Set(),emit=()=>subs.forEach(f=>{try{f(s&&s.user)}catch{}});
const save=x=>{s=x;x?localStorage.setItem('sess',JSON.stringify(x)):localStorage.removeItem('sess');emit()};
const jwt=t=>{try{const b=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b))))}catch{return{}}};
const userOf=(j,u)=>{const m=(u&&u.user_metadata)||j.user_metadata||{};return{id:(u&&u.id)||j.sub,email:(u&&u.email)||j.email||'',name:m.full_name||m.name||((u&&u.email)||j.email||'').split('@')[0]}};
function take(str){
  const p=new URLSearchParams(str),at=p.get('access_token'),rt=p.get('refresh_token');
  if(p.get('error_description'))throw new Error(p.get('error_description'));
  if(!at||!rt)return false;
  save({at,rt,exp:Date.now()+(+p.get('expires_in')||3600)*1e3,user:userOf(jwt(at))});return true;
}
const ready=()=>!!(U&&K);
async function login(){
  if(!ready())throw new Error('Supabase is not configured (.env → ./install.sh config)');
  const red=native?RED:location.origin+location.pathname;
  const url=`${U}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(red)}`;
  if(native&&P.Browser)return P.Browser.open({url,presentationStyle:'popover'});
  location.href=url;
}
async function refresh(){
  if(!s||!ready()||Date.now()<s.exp-12e4)return s&&s.user;
  try{
    const r=await fetch(`${U}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:K,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.rt})});
    if(r.status===400||r.status===401){save(null);return null}   // revoked → signed out
    if(r.ok){const d=await r.json();save({at:d.access_token,rt:d.refresh_token,exp:Date.now()+d.expires_in*1e3,user:userOf(jwt(d.access_token),d.user)})}
  }catch{}  // offline → keep local session
  return s&&s.user;
}
async function logout(){
  const t=s&&s.at;save(null);
  if(t&&ready())fetch(`${U}/auth/v1/logout`,{method:'POST',headers:{apikey:K,Authorization:'Bearer '+t}}).catch(()=>{});
}
// return from Google
let pendingErr=null;
if(!native&&/access_token|error_description/.test(location.hash)){try{take(location.hash.slice(1))}catch(e){pendingErr=e.message}history.replaceState(null,'',location.pathname+location.search)}
if(native&&P.App)P.App.addListener('appUrlOpen',({url})=>{
  if(!url||!url.startsWith(RED))return;
  try{P.Browser&&P.Browser.close()}catch{}
  try{take((url.split('#')[1]||url.split('?')[1]||''))}catch(e){pendingErr=e.message;emit()}
});
return{user:()=>s&&s.user,login,logout,refresh,ready,on:f=>subs.add(f),error:()=>{const e=pendingErr;pendingErr=null;return e}};
})();
