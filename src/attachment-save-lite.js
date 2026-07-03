const API='https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const KEY='cuentas-pwa:session-token';
const MAX=1500000;
window.saveCuentasAttachment=async function(owner_type,owner_id,file,note=''){if(!file)return null;if(file.size>MAX)throw new Error('Archivo mayor a 1,5 MB. Comprime antes de subir.');const data_url=await read(file);return post('/attachments',{owner_type,owner_id,file_name:file.name,file_type:file.type||'archivo',size_bytes:file.size,data_url,note});};
window.addCuentasAudit=async function(action,entity_type,entity_id,detail={}){return post('/audit',{action,entity_type,entity_id,detail}).catch(()=>null);};
async function post(path,body){const r=await fetch(API+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+localStorage.getItem(KEY)},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'Error API');return d;}
function read(file){return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||''));r.onerror=()=>fail(new Error('No se pudo leer archivo'));r.readAsDataURL(file);});}
