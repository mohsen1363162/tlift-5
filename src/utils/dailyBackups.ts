import { createFullBackup, type FullBackupFile } from "./fullBackup";
import { pushKey } from "../cloudSync";
import { getDeviceToken } from "./deviceAuth";

const DB_NAME = "tlift-device-backups";
const STORE = "daily";
const LAST_KEY = "tlift_last_device_backup_day_v1";
const RETENTION_DAYS = 30;
const day = () => new Date().toISOString().slice(0, 10);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    work(tx.objectStore(STORE), resolve, reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  }));
}
export async function createDeviceDailyBackup(force = false): Promise<{ created: boolean; date: string }> {
  const date = day();
  if (!force && localStorage.getItem(LAST_KEY) === date) return { created: false, date };
  const backup = createFullBackup();
  await transaction<void>("readwrite", (store, done, fail) => { const r = store.put(backup, date); r.onsuccess = () => done(); r.onerror = () => fail(r.error); });
  const dates = await listDeviceBackupDates();
  await Promise.all(dates.slice(RETENTION_DAYS).map(old => deleteDeviceBackup(old)));
  localStorage.setItem(LAST_KEY, date);
  void requestServerDailyBackup();
  return { created: true, date };
}
export async function listDeviceBackupDates(): Promise<string[]> {
  return transaction<string[]>("readonly", (store, done, fail) => { const r = store.getAllKeys(); r.onsuccess = () => done((r.result as string[]).sort().reverse()); r.onerror = () => fail(r.error); });
}
export async function getDeviceBackup(date: string): Promise<FullBackupFile | undefined> {
  return transaction<FullBackupFile | undefined>("readonly", (store, done, fail) => { const r = store.get(date); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
}
async function deleteDeviceBackup(date: string) { return transaction<void>("readwrite", (store, done, fail) => { const r = store.delete(date); r.onsuccess=()=>done(); r.onerror=()=>fail(r.error); }); }
export async function restoreDeviceBackup(date: string) {
  const backup = await getDeviceBackup(date);
  if (!backup) throw new Error("نسخه پشتیبان روی این دستگاه پیدا نشد");
  Object.entries(backup.entries).forEach(([key, value]) => { localStorage.setItem(key, JSON.stringify(value)); pushKey(key, value); });
  return Object.keys(backup.entries).length;
}
export async function downloadDeviceBackup(date: string) {
  const backup = await getDeviceBackup(date);
  if (!backup) throw new Error("نسخه پشتیبان پیدا نشد");
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `tlift-device-backup-${date}.json`; a.click(); URL.revokeObjectURL(url);
}
export async function requestServerDailyBackup() {
  const token = await getDeviceToken();
  const urls = location.hostname.includes("emami-asemansara.ir") ? ["/api/sync.php", "/sync.php"] : ["https://emami-asemansara.ir/api/sync.php", "https://emami-asemansara.ir/sync.php"];
  for (const endpoint of urls) { try { const url = new URL(endpoint, location.origin); url.searchParams.set("action","create_backup"); url.searchParams.set("token",token); const response = await fetch(url.toString()); if (response.ok) return true; } catch { /* local backup remains safe */ } }
  return false;
}
export function startDailyDeviceBackups() {
  if (typeof indexedDB === "undefined") return;
  // نسخه همان روز هر ساعت تازه می‌شود تا آخرین کارهای آفلاین نیز محفوظ باشند.
  const run = () => void createDeviceDailyBackup(true).catch(error => console.warn("[dailyBackup]", error));
  run();
  const timer = window.setInterval(run, 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run(); });
  return () => window.clearInterval(timer);
}
