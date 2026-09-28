import { reloadLocalSyncState } from "../cloudSync";

export interface FullBackupFile {
  format: "tlift-full-backup";
  version: 1;
  createdAt: string;
  entries: Record<string, unknown>;
  /** Optional, backward-compatible encoding metadata for exact localStorage round trips. */
  rawEntries?: Record<string, string>;
}

const QUEUE_KEY = "tlift_offline_queue_v2";
const LOCAL_LISTS = new Set(["tlift_offline_services_v1", "tlift_unassigned_offline_services_v1"]);
// Device identity and synchronization bookkeeping must not be restored onto another
// device or uploaded as business data. Existing backups and live values are untouched.
const DEVICE_KEYS = new Set([
  "tlift_customer_session", "tlift_device_api_token_v1", "tlift_device_id_v1",
  "tlift_cloud_meta_v1", "tlift_last_successful_sync_v1", "tlift_sync_conflicts_v1",
  "tlift_last_device_backup_day_v1", "tlift_bootstrap_restored_v1",
]);
const isDataKey = (key: string) => key.startsWith("tlift_") &&
  !key.endsWith("__backup") && !DEVICE_KEYS.has(key) &&
  !key.includes("sync_queue") && !key.includes("sync_interval") && !key.includes("manual_offline");
const isCloudKey = (key: string) => isDataKey(key) && key !== QUEUE_KEY && !LOCAL_LISTS.has(key) &&
  !key.startsWith("tlift_device_") && !key.startsWith("tlift_error_");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function createFullBackup(): FullBackupFile {
  const entries: Record<string, unknown> = {};
  const rawEntries: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || !isDataKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    rawEntries[key] = raw;
    try { entries[key] = JSON.parse(raw); }
    catch { entries[key] = raw; }
  }
  return { format: "tlift-full-backup", version: 1, createdAt: new Date().toISOString(), entries, rawEntries };
}

export function downloadFullBackup() {
  const backup = createFullBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tlift-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return Object.keys(backup.entries).length;
}

function validateBackup(value: unknown): FullBackupFile {
  if (!isRecord(value) || value.format !== "tlift-full-backup" || value.version !== 1 ||
      !isRecord(value.entries) || typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      (value.rawEntries !== undefined && !isRecord(value.rawEntries))) {
    throw new Error("این فایل، پشتیبان کامل معتبر تلیفت نیست.");
  }
  for (const [key, raw] of Object.entries(value.rawEntries || {})) {
    if (typeof raw !== "string" || !Object.hasOwnProperty.call(value.entries, key)) throw new Error("قالب داده خام پشتیبان معتبر نیست.");
    let decoded: unknown = raw;
    try { decoded = JSON.parse(raw); } catch { /* raw localStorage string */ }
    if (JSON.stringify(decoded) !== JSON.stringify(value.entries[key])) throw new Error("داده خام پشتیبان با محتوای آن مطابقت ندارد.");
  }
  for (const key of ["tlift_contracts", "tlift_customers", "tlift_staff", "tlift_parts"]) {
    const items = value.entries[key];
    if (items !== undefined && (!Array.isArray(items) || items.some(item => !isRecord(item)))) {
      throw new Error(`ساختار بخش ${key} در پشتیبان معتبر نیست.`);
    }
  }
  const details = value.entries.tlift_contract_details;
  if (details !== undefined && (!isRecord(details) || Object.values(details).some(detail =>
    !isRecord(detail) || (detail.months !== undefined && (!Array.isArray(detail.months) || detail.months.some(month => !isRecord(month))))))) {
    throw new Error("ساختار گزارش‌های سرویس در پشتیبان معتبر نیست.");
  }
  if (value.entries[QUEUE_KEY] !== undefined && !isRecord(value.entries[QUEUE_KEY])) throw new Error("صف پشتیبان معتبر نیست.");
  for (const key of LOCAL_LISTS) {
    if (value.entries[key] !== undefined && !Array.isArray(value.entries[key])) throw new Error("فهرست سرویس آفلاین معتبر نیست.");
  }
  return value as unknown as FullBackupFile;
}

function readRecord(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  const value = raw === null ? {} : JSON.parse(raw);
  if (!isRecord(value)) throw new Error("صف فعلی دستگاه معتبر نیست؛ بازیابی متوقف شد.");
  return value;
}

/** Shared restore path for file and IndexedDB. Synchronous writes are rolled back
 * on storage failure; synchronization remains paused until the user reviews data. */
export function restoreBackupData(value: unknown) {
  const backup = validateBackup(value);
  const currentQueue = readRecord(QUEUE_KEY);
  const incomingQueue = (backup.entries[QUEUE_KEY] || {}) as Record<string, unknown>;
  const pending: Record<string, unknown> = { ...currentQueue };
  for (const [key, data] of Object.entries(incomingQueue)) {
    if (isCloudKey(key) && !Object.hasOwnProperty.call(pending, key)) pending[key] = data;
  }
  const writes = new Map<string, string>();
  let restored = 0;
  for (const [key, saved] of Object.entries(backup.entries)) {
    if (!isDataKey(key) || key === QUEUE_KEY) continue;
    let data = Object.hasOwnProperty.call(pending, key) ? pending[key] : saved;
    let raw = backup.rawEntries?.[key];
    if (LOCAL_LISTS.has(key)) {
      const current = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(current)) throw new Error("فهرست سرویس‌های فعلی معتبر نیست؛ بازیابی متوقف شد.");
      const merged = new Map<string, unknown>();
      [...(saved as unknown[]), ...current].forEach((item, index) => {
        // Keep anonymous legacy records rather than silently dropping them.
        const id = isRecord(item) && item.id != null ? String(item.id) : `legacy-${index}`;
        merged.set(id, item);
      });
      data = [...merged.values()];
      raw = undefined;
    } else if (Object.hasOwnProperty.call(pending, key)) raw = undefined;
    const encoded = raw ?? (typeof data === "string" ? data : JSON.stringify(data));
    writes.set(key, encoded);
    writes.set(`${key}__backup`, encoded);
    if (isCloudKey(key)) pending[key] = data;
    restored++;
  }
  writes.set(QUEUE_KEY, JSON.stringify(pending));
  writes.set("tlift_manual_offline_v1", "true");
  const previous = new Map([...writes.keys()].map(key => [key, localStorage.getItem(key)]));
  const written: string[] = [];
  try {
    for (const [key, raw] of writes) { localStorage.setItem(key, raw); written.push(key); }
  } catch (error) {
    // Restore overwritten values; remove only keys created by this failed attempt.
    for (const key of written.reverse()) {
      const raw = previous.get(key);
      if (raw == null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
    }
    throw error;
  }
  reloadLocalSyncState();
  return { restored, createdAt: backup.createdAt };
}

export async function restoreFullBackup(file: File) {
  return restoreBackupData(JSON.parse(await file.text()));
}
