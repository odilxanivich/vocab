/* Pronunciation = the phone's own TTS engine. No audio files stored.
   Android: @capacitor-community/text-to-speech → Google Speech Services / Samsung TTS.
   "Auto" picks the most natural voice: neural/network voices online, best local voice offline.
   Web: speechSynthesis.                                                                */
window.Speech=(()=>{
const C=window.Capacitor,P=C&&C.Plugins&&C.Plugins.TextToSpeech,native=!!(P&&C.isNativePlatform&&C.isNativePlatform());
const TAG={ko:'ko-KR',en:'en-US',uz:'uz-UZ',ru:'ru-RU'};
const norm=l=>String(l||'').replace('_','-').toLowerCase();
let all=null;
async function list(){
  if(all&&all.length)return all;
  if(native){
    try{const r=await P.getSupportedVoices();all=(r.voices||[]).map((v,i)=>({id:String(i),name:v.name||v.voiceURI||'Voice '+(i+1),lang:norm(v.lang),local:v.localService!==false}))}catch{all=[]}
    return all;
  }
  const ss=window.speechSynthesis;if(!ss)return all=[];
  let v=ss.getVoices();
  if(!v.length){await new Promise(r=>{ss.addEventListener('voiceschanged',r,{once:true});setTimeout(r,1500)});v=ss.getVoices()}
  return all=v.map(x=>({id:x.voiceURI,name:x.name,lang:norm(x.lang),local:x.localService,_v:x}));
}
const voices=async lang=>(await list()).filter(v=>v.lang.startsWith(lang));
function score(v,online){
  const n=v.name.toLowerCase();let s=0;
  if(/neural|natural|premium|enhanced|wavenet|studio|google/.test(n))s+=3;
  if(/network|online/.test(n)||!v.local)s+=online?4:-20;
  if(/local/.test(n))s+=1;
  if(/compact|espeak/.test(n))s-=3;
  return s;
}
async function pick(lang,pref,online){
  const vs=await voices(lang);
  if(pref&&pref!=='auto'){const v=vs.find(x=>x.id===pref);if(v&&(online||v.local))return v}
  return vs.slice().sort((a,b)=>score(b,online)-score(a,online))[0]||null;
}
async function say(text,lang,o={}){
  const v=await pick(lang,o.voice,o.online),rate=o.rate||1;
  if(native){
    try{await P.stop()}catch{}
    const opt={text,lang:TAG[lang]||lang,rate,pitch:1,volume:1,category:'playback'};
    if(v)opt.voice=+v.id;
    try{return await P.speak(opt)}catch(e){if('voice'in opt){delete opt.voice;return P.speak(opt)}throw e}
  }
  const ss=window.speechSynthesis;if(!ss)throw new Error('This browser has no speech');
  ss.cancel();
  return new Promise((ok,no)=>{
    const u=new SpeechSynthesisUtterance(text);u.lang=TAG[lang]||lang;u.rate=rate;if(v&&v._v)u.voice=v._v;
    u.onend=ok;u.onerror=e=>/interrupted|canceled/.test(e.error)?ok():no(new Error('Voice error'));
    ss.speak(u);setTimeout(ok,10000);
  });
}
async function has(lang){
  if(native){try{return(await P.isLanguageSupported({lang:TAG[lang]})).supported}catch{return true}}
  return(await voices(lang)).length>0;
}
return{native,voices,say,has,
  install:()=>native?P.openInstall():Promise.reject(new Error('Android only')),
  stop:()=>{try{native?P.stop():window.speechSynthesis&&speechSynthesis.cancel()}catch{}},
  reset:()=>{all=null}};
})();
