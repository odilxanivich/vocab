/* Offline storage.
   Android: Documents/<FOLDER>/  (fallback: internal storage → app-private)
   Web:     IndexedDB
   Files:   state.json · library.json · sets/<id>.json                        */
(()=>{
const C=window.Capacitor,native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
const FS=native?C.Plugins.Filesystem:null,DIR=(window.CFG&&CFG.FOLDER)||'vocab';
let base=null;
async function root(){
  if(base)return base;
  try{await FS.requestPermissions()}catch{}
  for(const d of['DOCUMENTS','EXTERNAL_STORAGE','DATA']){
    try{await FS.mkdir({path:DIR+'/sets',directory:d,recursive:true})}catch{}
    try{await FS.writeFile({path:DIR+'/.probe',data:'1',directory:d,encoding:'utf8'});await FS.deleteFile({path:DIR+'/.probe',directory:d});return base=d}catch{}
  }
  throw new Error('Storage unavailable');
}
const idb=(()=>{let p;
  const db=()=>p||(p=new Promise((ok,no)=>{const r=indexedDB.open('vocab',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
  const tx=async(m,f)=>{const d=await db();return new Promise((ok,no)=>{const t=d.transaction('kv',m),r=f(t.objectStore('kv'));t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error)})};
  return{get:k=>tx('readonly',s=>s.get(k)),put:(k,v)=>tx('readwrite',s=>s.put(v,k)),del:k=>tx('readwrite',s=>s.delete(k))};
})();
window.V={
  native,
  async get(name,fb){
    try{
      if(!native){const v=await idb.get(name);return v===undefined?fb:v}
      const r=await FS.readFile({path:DIR+'/'+name,directory:await root(),encoding:'utf8'});return JSON.parse(r.data)??fb;
    }catch{return fb}
  },
  async put(name,data){
    if(!native)return idb.put(name,data);
    return FS.writeFile({path:DIR+'/'+name,directory:await root(),data:JSON.stringify(data),encoding:'utf8',recursive:true});
  },
  async del(name){
    if(!native)return idb.del(name);
    try{await FS.deleteFile({path:DIR+'/'+name,directory:await root()})}catch{}
  },
  where(){
    if(!native)return'Browser storage';
    return({DOCUMENTS:'Documents',EXTERNAL_STORAGE:'Internal storage',DATA:'App storage'}[base]||'Documents')+'/'+DIR;
  }
};
})();
