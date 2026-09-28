import { useSyncExternalStore } from "react";
import { pushKey, registerApplier } from "./cloudSync";

export type AuditEntity = "contract" | "part" | "assignment" | "inventory" | "settings" | "service";
export type AuditEvent = { id:string; at:number; actor:string; action:string; entityType:AuditEntity; entityId:string; title:string; before?:unknown; after?:unknown; rollbackOf?:string };
const KEY="tlift_audit_log_v1";
const clean = (value: any) => { if (!value || typeof value !== "object") return value; const copy={...value}; if (Array.isArray(copy.photos)) copy.photos=`${copy.photos.length} عکس (در تاریخچه ذخیره نشد)`; if (Array.isArray(copy.attachments)) copy.attachments=`${copy.attachments.length} پیوست`; return copy; };
const load=():AuditEvent[]=>{try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}};
let events=load(); const listeners=new Set<()=>void>();
const actor=()=>{try{return JSON.parse(localStorage.getItem("tlift_customer_session")||"{}").name||"کاربر سیستم"}catch{return "کاربر سیستم"}};
const save=()=>{events=events.slice(0,1000);localStorage.setItem(KEY,JSON.stringify(events));pushKey(KEY,events);listeners.forEach(fn=>fn());};
export function recordAudit(input:Omit<AuditEvent,"id"|"at"|"actor"> & {actor?:string}) { const item:AuditEvent={...input,id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:Date.now(),actor:input.actor||actor(),before:clean(input.before),after:clean(input.after)};events=[item,...events];save();return item; }
export function useAuditEvents(){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb)},()=>events)}
registerApplier((key,data)=>{if(key!==KEY||!Array.isArray(data))return;events=data as AuditEvent[];localStorage.setItem(KEY,JSON.stringify(events));listeners.forEach(fn=>fn());});
