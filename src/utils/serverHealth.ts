import { pushKey } from "../cloudSync";
import { APP_VERSION } from "./appUpdater";
import { getDeviceToken } from "./deviceAuth";
const TOKEN=(import.meta.env.VITE_SYNC_TOKEN as string|undefined)||"tlift-asemansara-1405";
const endpoint=()=>{const custom=import.meta.env.VITE_SYNC_API as string|undefined;if(custom)return custom;return location.hostname==="emami-asemansara.ir"||location.hostname==="www.emami-asemansara.ir"?"/api/sync.php":"https://emami-asemansara.ir/api/sync.php"};
export type DeviceHeartbeat={id:string;name:string;platform:string;lastSeen:number;version:string;online:boolean};
export type ServerHealth={ok:boolean;serverTime:string;writable:boolean;records:number;diskFree:number|false;diskTotal:number|false;backupCount:number;latestBackup:string|null;devices:DeviceHeartbeat[]};
const deviceId=()=>{let id=localStorage.getItem("tlift_device_id_v1");if(!id){id=`${Date.now().toString(36)}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;localStorage.setItem("tlift_device_id_v1",id)}return id};
const deviceName=()=>localStorage.getItem("tlift_device_name_v1")||(/Android|iPhone|iPad/i.test(navigator.userAgent)?"گوشی همراه":"رایانه");
export function setDeviceName(name:string){localStorage.setItem("tlift_device_name_v1",name.trim()||deviceName());sendDeviceHeartbeat()}
export function getDeviceName(){return deviceName()}
export function sendDeviceHeartbeat(){const id=deviceId();const data:DeviceHeartbeat={id,name:deviceName(),platform:navigator.platform||"نامشخص",lastSeen:Date.now(),version:APP_VERSION,online:navigator.onLine};pushKey(`tlift_device_heartbeat_${id.replace(/[^A-Za-z0-9_-]/g,"")}`,data)}
export async function fetchServerHealth():Promise<ServerHealth>{const url=new URL(endpoint(),location.origin);url.searchParams.set("action","health");url.searchParams.set("token",await getDeviceToken());const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);try{const res=await fetch(url,{signal:controller.signal,cache:"no-store"});if(!res.ok)throw new Error(`HTTP ${res.status}`);return await res.json()}finally{clearTimeout(timer)}}
export function startDeviceHeartbeat(){sendDeviceHeartbeat();const timer=setInterval(sendDeviceHeartbeat,5*60*1000);addEventListener("online",sendDeviceHeartbeat);return()=>clearInterval(timer)}
