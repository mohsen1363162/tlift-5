const KEY="tlift_device_api_token_v1";
const ID_KEY="tlift_device_id_v1";
const LEGACY=(import.meta.env.VITE_SYNC_TOKEN as string|undefined)||"tlift-asemansara-1405";
let pending:Promise<string>|null=null;
const endpoint=()=>{const custom=import.meta.env.VITE_SYNC_API as string|undefined;if(custom)return custom;return location.hostname==="emami-asemansara.ir"||location.hostname==="www.emami-asemansara.ir"?"/api/sync.php":"https://emami-asemansara.ir/api/sync.php"};
export const getDeviceId=()=>{let id=localStorage.getItem(ID_KEY);if(!id){id=`${Date.now().toString(36)}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;localStorage.setItem(ID_KEY,id)}return id};
export async function getDeviceToken(){const saved=localStorage.getItem(KEY);if(saved)return saved;if(pending)return pending;pending=(async()=>{try{const url=new URL(endpoint(),location.origin);url.searchParams.set("action","register_device");url.searchParams.set("token",LEGACY);const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:getDeviceId(),name:localStorage.getItem("tlift_device_name_v1")||"دستگاه تلیفت"})});if(!res.ok)throw new Error();const data=await res.json();if(!data.token)throw new Error();localStorage.setItem(KEY,data.token);return data.token}catch{return LEGACY}finally{pending=null}})();return pending}
export function clearDeviceToken(){localStorage.removeItem(KEY)}
