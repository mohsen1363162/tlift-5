/**
 * همگام‌سازی ابری با سرور (Supabase / Cloud State)
 * با پشتیبانی کامل از حالت آفلاین، صف ذخیره‌سازی محلی پایدار و همگام‌سازی خودکار
 * با امکان تنظیم فاصله زمانی همگام‌سازی توسط کاربر
 */
import { supabase } from "@/integrations/supabase/client";
import { clearDeviceToken, getDeviceToken } from "./utils/deviceAuth";

export type SyncStatus = "idle" | "syncing" | "online" | "offline" | "error";

export type OfflineServiceRecord = {
  id: string;
  contractId: number;
  monthId: number;
  buildingName?: string;
  customerName?: string;
  doneDate: string;
  amount: number;
  recordedAt: number;
};

export type SyncState = {
  status: SyncStatus;
  lastSync: number | null;
  pending: number;
  offlineServicesCount: number;
  isManualOffline: boolean;
  intervalMinutes: number; // 0 = دستی (بدون چک دوره‌ای)، ۲، ۵، ۱۰، ۱۵، ۳۰، ۶۰ دقیقه
  conflicts: number;
  error?: string;
};

type Listener = (s: SyncState) => void;

const TABLE = "app_state";
const META_KEY = "tlift_cloud_meta_v1";
const QUEUE_KEY = "tlift_offline_queue_v2";
const OFFLINE_SERVICES_KEY = "tlift_offline_services_v1";
const MANUAL_OFFLINE_KEY = "tlift_manual_offline_v1";
const SYNC_INTERVAL_KEY = "tlift_sync_interval_minutes_v1";
const LAST_SYNC_KEY = "tlift_last_successful_sync_v1";
const CONFLICTS_KEY = "tlift_sync_conflicts_v1";
const DEFAULT_INTERVAL_MINUTES = 5; // پیش‌فرض: هر ۵ دقیقه

// ── بک‌اند همگام‌سازی ──
// پیش‌فرض: سرویس ابری رسمی آسمانسرا (emami-asemansara.ir) یا فایل api/sync.php روی هاست خود سایت
const REMOTE_PROD_SYNC_API = "https://emami-asemansara.ir/api/sync.php";

// تشخیص اینکه آیا در دامنهٔ تولیدی (هاست اصلی آسمانسرا) هستیم یا محیط پیش‌نمایش/توسعه
const isProductionDomain =
  typeof window !== "undefined" &&
  (window.location.hostname === "emami-asemansara.ir" ||
    window.location.hostname === "www.emami-asemansara.ir");

// در محیط‌های کلود/پیش‌نمایش (مانند Google Cloud Run *.run.app، *.e2b.app، localhost، و نسخه PWA موبایل)
// سرور ابری رسمی آسمانسرا مستقیماً فراخوانی می‌شود تا از خطای 403 پروکسی جلوگیری شود.
const SYNC_API =
  (import.meta.env.VITE_SYNC_API as string | undefined) ||
  (isProductionDomain ? "/api/sync.php" : REMOTE_PROD_SYNC_API);
const SYNC_TOKEN =
  (import.meta.env.VITE_SYNC_TOKEN as string | undefined) ||
  "tlift-asemansara-1405";
const USE_SUPABASE =
  typeof import.meta.env.VITE_SUPABASE_URL === "string" &&
  import.meta.env.VITE_SUPABASE_URL.trim() !== "";

// خواندن مدت زمان همگام‌سازی
export const getSyncInterval = (): number => {
  try {
    const v = localStorage.getItem(SYNC_INTERVAL_KEY);
    if (v !== null) return Number(v);
  } catch {
    /* ignore */
  }
  return DEFAULT_INTERVAL_MINUTES;
};

// خواندن صف ذخیره‌سازی محلی پایدار
const loadQueue = (): Record<string, unknown> => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveQueue = (q: Record<string, unknown>) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
};

// خواندن سرویس‌های ثبت‌شده در حالت آفلاین
export const getOfflineServices = (): OfflineServiceRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_SERVICES_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveOfflineServices = (items: OfflineServiceRecord[]) => {
  try {
    localStorage.setItem(OFFLINE_SERVICES_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
};

export const recordOfflineService = (item: OfflineServiceRecord) => {
  const current = getOfflineServices();
  const updated = [item, ...current.filter((x) => x.id !== item.id)];
  saveOfflineServices(updated);
  setState({ offlineServicesCount: updated.length });
};

export const clearOfflineServices = () => {
  saveOfflineServices([]);
  setState({ offlineServicesCount: 0 });
};

const getInitialManualOffline = (): boolean => {
  try {
    return localStorage.getItem(MANUAL_OFFLINE_KEY) === "true";
  } catch {
    return false;
  }
};

const queue: Record<string, unknown> = loadQueue();
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
let applyingRemote = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
export type SyncConflict = { local: unknown; server?: { key?: string; data?: unknown; updated_at?: string }; detectedAt: number };
export const getSyncConflicts = (): Record<string, SyncConflict> => {
  try { return JSON.parse(localStorage.getItem(CONFLICTS_KEY) || "{}"); } catch { return {}; }
};
const loadConflicts = getSyncConflicts;

let state: SyncState = {
  status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
  lastSync: Number(localStorage.getItem(LAST_SYNC_KEY) || 0) || null,
  pending: Object.keys(queue).length,
  offlineServicesCount: getOfflineServices().length,
  isManualOffline: getInitialManualOffline(),
  intervalMinutes: getSyncInterval(),
  conflicts: Object.keys(loadConflicts()).length,
};

const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l({ ...state }));
const setState = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  emit();
};

export const subscribeSync = (l: Listener) => {
  listeners.add(l);
  l({ ...state });
  return () => {
    listeners.delete(l);
  };
};

export const getSyncState = () => state;

export const setManualOffline = (enabled: boolean) => {
  try {
    localStorage.setItem(MANUAL_OFFLINE_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
  setState({
    isManualOffline: enabled,
    status: enabled ? "offline" : navigator.onLine ? "idle" : "offline",
  });
  if (!enabled && navigator.onLine) {
    syncNow();
  }
};

export const toggleManualOffline = () => {
  setManualOffline(!state.isManualOffline);
};

export const setSyncInterval = (minutes: number) => {
  try {
    localStorage.setItem(SYNC_INTERVAL_KEY, String(minutes));
  } catch {
    /* ignore */
  }
  setState({ intervalMinutes: minutes });
  restartPeriodicSync();
};

function restartPeriodicSync() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  const min = state.intervalMinutes;
  if (min <= 0) {
    // حالت فقط دستی؛ هیچ چک دوره‌ای در پس‌زمینه اجرا نشود
    return;
  }
  const ms = Math.max(min, 1) * 60 * 1000;
  periodicTimer = setInterval(() => {
    if (!state.isManualOffline && typeof navigator !== "undefined" && navigator.onLine) {
      if (Object.keys(queue).length) flushAll();
      else pullAll();
    }
  }, ms);
}

// ---- local meta (updated_at per key) ----
const loadMeta = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveMeta = (m: Record<string, string>) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

const db = () => (supabase as any).from(TABLE);

// تایم‌اوت برای جلوگیری از معلق ماندن در اینترنت ضعیف (۲۵ ثانیه برای تبادل امن دیتابیس)
function withTimeout(promise: Promise<any>, ms = 25000): Promise<any> {
  return Promise.race([
    promise,
    new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error("مهلت اتصال به سرور به پایان رسید (Timeout)")), ms)
    ),
  ]);
}

// تبدیل خطاهای خام به پیام قابل‌فهم برای کاربر
function describeSyncError(e: unknown): string {
  const raw = String((e as Error)?.message || e || "خطای نامشخص");
  const s = raw.toLowerCase();
  if (raw.includes("مهلت اتصال")) return "سرور به‌موقع پاسخ نداد (تایم‌اوت). اینترنت کند است یا سرور همگام‌سازی در دسترس نیست.";
  if (s.includes("failed to fetch") || s.includes("networkerror") || s.includes("load failed") || s.includes("network request failed"))
    return "اتصال به سرور همگام‌سازی برقرار نشد؛ اینترنت، فیلترشکن یا در دسترس نبودن سرور را بررسی کنید.";
  if (s.includes("403") || raw.includes("forbidden") || raw.includes("دسترسی غیرمجاز"))
    return "دسترسی به سرور همگام‌سازی مسدود شد (HTTP 403) — تنظیمات فایروال یا اتصال اینترنت را بررسی کنید.";
  if (s.includes("404") || raw.includes("پیدا نشد"))
    return "فایل api/sync.php روی هاست پیدا نشد — نسخهٔ جدید خروجی سی‌پنل را آپلود کنید.";
  if (s.includes("401") || s.includes("invalid token"))
    return "توکن همگام‌سازی نامعتبر است — رمز داخل api/sync.php باید با VITE_SYNC_TOKEN یکسان باشد.";
  if (s.includes("could not find the table"))
    return "جدول app_state در دیتابیس وجود ندارد — مایگریشن (supabase/migrations) هنوز اجرا نشده است.";
  if (s.includes("invalid api key") || s.includes("jwt") || s.includes("apikey"))
    return "کلید دسترسی سوپابیس (anon key) نامعتبر است.";
  if (s.includes("paused")) return "پروژهٔ سوپابیس متوقف (Paused) شده است — از داشبورد سوپابیس آن را Restore کنید.";
  return raw;
}

// ── توابع سرویس PHP روی هاست (api/sync.php) ──
const syncApiCandidates = (): string[] => {
  const custom = import.meta.env.VITE_SYNC_API as string | undefined;
  if (custom) return [custom];

  if (isProductionDomain) {
    // روی دامنهٔ اختصاصی cPanel، ابتدا مسیر محلی و سپس آدرس کامل آنلاین
    return ["/api/sync.php", "/sync.php", REMOTE_PROD_SYNC_API];
  }

  // در تمامی محیط‌های پیش‌نمایش و کلود (مانند Google Cloud Run *.run.app، *.e2b.app، localhost، و نسخه موبایل):
  // اولویت اول سرور ابری مستقیم https://emami-asemansara.ir/api/sync.php است تا بدون خطای پروکسی 403 مستقیماً ارتباط برقرار شود.
  return [
    REMOTE_PROD_SYNC_API,
    "https://emami-asemansara.ir/sync.php",
    "/api/sync.php",
  ];
};

function mergeById(serverItems: any[] = [], localItems: any[] = []) {
  const map = new Map<string, any>();
  serverItems.forEach((item, index) => {
    const k = String(item?.id ?? item?.contractId ?? item?.no ?? `server-${index}`);
    map.set(k, item);
  });
  localItems.forEach((item, index) => {
    const k = String(item?.id ?? item?.contractId ?? item?.no ?? `local-${index}`);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, item);
    } else {
      map.set(k, { ...existing, ...item });
    }
  });
  return Array.from(map.values());
}

// گزارش‌های قرارداد ماه‌به‌ماه ادغام می‌شوند تا ثبت هم‌زمان دو سرویس‌کار
// روی ساختمان‌های متفاوت، کل نقشه جزئیات را بازنویسی نکند.
function mergeContractDetails(serverData: any, localData: any) {
  const server = serverData && typeof serverData === "object" ? serverData : {};
  const local = localData && typeof localData === "object" ? localData : {};
  const merged: Record<string, any> = { ...server };
  for (const contractId of new Set([...Object.keys(server), ...Object.keys(local)])) {
    const s = server[contractId] || {}, l = local[contractId] || {};
    const monthMap = new Map<string, any>();
    (s.months || []).forEach((month: any) => monthMap.set(String(month.id), month));
    (l.months || []).forEach((month: any) => {
      const previous = monthMap.get(String(month.id));
      const localEdited = Number(month.postCompletionEditedAt || 0);
      if (
        !previous ||
        (month.done && !previous.done) ||
        (localEdited > 0 && localEdited >= Number(previous.postCompletionEditedAt || 0))
      ) {
        monthMap.set(String(month.id), { ...previous, ...month });
      }
    });
    merged[contractId] = {
      ...s, ...l,
      months: Array.from(monthMap.values()),
      payments: mergeById(s.payments, l.payments),
      breakdowns: mergeById(s.breakdowns, l.breakdowns),
      invoices: mergeById(s.invoices, l.invoices),
    };
  }
  return merged;
}

function autoMergeConflict(key: string, serverData: unknown, localData: unknown): unknown {
  if (key === "tlift_contract_details") return mergeContractDetails(serverData, localData);
  if (Array.isArray(serverData) && Array.isArray(localData)) {
    if (key === "tlift_pinned_contracts_v1") {
      return Array.from(new Set([...serverData, ...localData]));
    }
    return mergeById(serverData, localData);
  }
  if (serverData && typeof serverData === "object" && localData && typeof localData === "object") {
    return { ...(localData as object), ...(serverData as object) };
  }
  return serverData !== undefined ? serverData : localData;
}

async function fetchWithDeviceAuth(endpoint: string, init?: RequestInit) {
  let token = await getDeviceToken();
  const separator = endpoint.includes("?") ? "&" : "?";
  let response = await withTimeout(fetch(`${endpoint}${separator}token=${encodeURIComponent(token)}`, init));
  if (response.status === 401) {
    // توکن دستگاه ممکن است بعد از تعویض فایل‌های هاست یا پاک‌شدن registry منقضی شده باشد.
    clearDeviceToken();
    token = await getDeviceToken();
    response = await withTimeout(fetch(`${endpoint}${separator}token=${encodeURIComponent(token)}`, init));
  }
  return response;
}

async function apiUpsert(key: string, data: unknown, updated_at: string) {
  let lastError: unknown;
  for (const endpoint of syncApiCandidates()) {
    try {
      const res = await fetchWithDeviceAuth(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, data, updated_at, base_updated_at: loadMeta()[key] || null }),
      });
      if (res.status === 409) {
        const conflict = await res.json().catch(() => ({}));
        const merged = autoMergeConflict(key, conflict.server?.data, data);
        if (merged !== undefined && conflict.server?.updated_at) {
          const retry = await fetchWithDeviceAuth(endpoint, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, data: merged, updated_at, base_updated_at: conflict.server.updated_at }),
          });
          if (retry.ok) {
            delete queue[key];
            saveQueue(queue);
            forceApplyMerged(key, merged);
            const meta = loadMeta();
            meta[key] = conflict.server.updated_at;
            saveMeta(meta);
            const conflicts = loadConflicts(); delete conflicts[key];
            localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
            setState({ conflicts: Object.keys(conflicts).length, pending: Object.keys(queue).length });
            return;
          }
        }
        const conflicts = loadConflicts();
        conflicts[key] = { local: data, server: conflict.server, detectedAt: Date.now() };
        localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
        setState({ conflicts: Object.keys(conflicts).length });
        const conflictError = new Error("تداخل اطلاعات: این رکورد در دستگاه دیگری تغییر کرده و برای بررسی نگهداری شد.");
        (conflictError as Error & { isConflict?: boolean }).isConflict = true;
        throw conflictError;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return;
    } catch (error) { if ((error as Error & { isConflict?: boolean })?.isConflict) throw error; lastError = error; }
  }
  throw new Error(`خطای سرور همگام‌سازی: ${String((lastError as Error)?.message || lastError)}`);
}

async function apiSelectPrefix(prefix: string): Promise<{ key: string; data: unknown; updated_at: string }[]> {
  let lastError: unknown;
  for (const endpoint of syncApiCandidates()) {
    try {
      const res = await fetchWithDeviceAuth(`${endpoint}?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch (error) { lastError = error; }
  }
  throw new Error(`خطای سرور همگام‌سازی: ${String((lastError as Error)?.message || lastError)}`);
}

// ---- push (debounced per key) ----
export function pushKey(key: string, data: unknown) {
  if (applyingRemote) return; // تغییر از سمت سرور آمده؛ بازتاب نده
  queue[key] = data;
  saveQueue(queue);
  clearTimeout(timers[key]);
  setState({ pending: Object.keys(queue).length });

  // اگر در حالت آفلاین دستی است، در صف بماند و فعلا ارسال نشود
  if (state.isManualOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
    setState({ status: "offline" });
    return;
  }

  timers[key] = setTimeout(() => flushKey(key), 800);
}

async function flushKey(key: string): Promise<boolean> {
  if (state.isManualOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
    setState({ status: "offline" });
    return false;
  }

  const data = queue[key];
  if (data === undefined) return true;

  const updated_at = new Date().toISOString();
  try {
    setState({ status: "syncing" });
    if (USE_SUPABASE) {
      const res = await withTimeout(
        db().upsert({ key, data, updated_at }, { onConflict: "key" })
      );
      if (res.error) throw res.error;
    } else {
      await apiUpsert(key, data, updated_at);
    }

    delete queue[key];
    saveQueue(queue);

    const meta = loadMeta();
    meta[key] = updated_at;
    saveMeta(meta);

    const syncedAt = Date.now();
    localStorage.setItem(LAST_SYNC_KEY, String(syncedAt));
    setState({
      status: "online",
      lastSync: syncedAt,
      pending: Object.keys(queue).length,
      error: undefined,
    });
    return true;
  } catch (e: unknown) {
    console.warn("[cloudSync] flushKey:", e);
    // در صف نگه‌دار و وضعیت را به آفلاین تغییر بده
    queue[key] = data;
    saveQueue(queue);
    setState({
      status: "offline",
      pending: Object.keys(queue).length,
      error: describeSyncError(e),
    });
    clearTimeout(timers[key]);
    // تلاش مجدد با فاصله بر مبنای تایمر یا حداقل ۲۰ ثانیه
    timers[key] = setTimeout(() => flushKey(key), 25000);
    return false;
  }
}

export async function flushAll(): Promise<boolean> {
  if (state.isManualOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
    setState({ status: "offline" });
    return false;
  }
  const keys = Object.keys(queue);
  if (keys.length === 0) return true;

  // ارسال ترتیبی برای جلوگیری از اشباع پهنای باند و همزمانی در هاست اشتراکی
  let allOk = true;
  for (const k of keys) {
    const ok = await flushKey(k);
    if (!ok) allOk = false;
  }
  if (allOk) {
    clearOfflineServices();
  }
  return allOk;
}

// ---- pull ----
type Applier = (key: string, data: unknown) => void;
const appliers = new Set<Applier>();

export function registerApplier(fn: Applier) {
  appliers.add(fn);
  return () => appliers.delete(fn);
}

export async function resolveSyncConflict(key: string, choice: "local" | "server") {
  const conflicts = getSyncConflicts();
  const conflict = conflicts[key];
  if (!conflict) return false;
  if (choice === "server") {
    delete queue[key]; saveQueue(queue);
    const row = conflict.server;
    if (row && row.data !== undefined) {
      const meta = loadMeta(); delete meta[key]; saveMeta(meta);
      applyRemote(key, row.data, row.updated_at || new Date().toISOString());
    }
  } else {
    queue[key] = conflict.local; saveQueue(queue);
    if (conflict.server?.updated_at) { const meta=loadMeta(); meta[key]=conflict.server.updated_at; saveMeta(meta); }
  }
  delete conflicts[key]; localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
  setState({ conflicts: Object.keys(conflicts).length, pending: Object.keys(queue).length });
  if (choice === "local" && navigator.onLine && !state.isManualOffline) return flushKey(key);
  return true;
}

function forceApplyMerged(key: string, data: unknown) {
  applyingRemote = true;
  try { appliers.forEach(applier => applier(key, data)); }
  finally { applyingRemote = false; }
}

function prepareStoredConflictMerges() {
  const conflicts = getSyncConflicts();
  let changed = false;
  Object.entries(conflicts).forEach(([key, conflict]) => {
    const merged = autoMergeConflict(key, conflict.server?.data, conflict.local);
    if (merged === undefined || !conflict.server?.updated_at) return;
    queue[key] = merged;
    const meta = loadMeta(); meta[key] = conflict.server.updated_at; saveMeta(meta);
    forceApplyMerged(key, merged);
    delete conflicts[key]; changed = true;
  });
  if (changed) {
    saveQueue(queue);
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
    setState({ conflicts: Object.keys(conflicts).length, pending: Object.keys(queue).length });
  }
}

function applyRemote(key: string, data: unknown, updated_at: string) {
  const meta = loadMeta();

  // اگر برای این کلید داده‌ای در صف داریم، آن را ادغام کنیم یا اگر تفاوتی ندارد از صف حذف کنیم
  if (queue[key] !== undefined) {
    try {
      const merged = autoMergeConflict(key, data, queue[key]);
      if (merged !== undefined) {
        const isIdentical = JSON.stringify(merged) === JSON.stringify(data);
        if (isIdentical) {
          // تغییرات محلی در واقع نسخه قدیمی/بوت‌استرپ بود یا تفاوتی با سرور ندارد؛ از صف پاک می‌شود
          delete queue[key];
          saveQueue(queue);
          setState({ pending: Object.keys(queue).length });
        } else {
          // تغییرات واقعی محلی وجود دارد؛ نسخه ادغام‌شده را در صف و متا ذخیره می‌کنیم
          queue[key] = merged;
          saveQueue(queue);
          setState({ pending: Object.keys(queue).length });
        }
        // اعمال نسخه به‌روزشده در برنامه تا خدمات همکاران فوراً در صفحه دیده شوند
        applyingRemote = true;
        try {
          appliers.forEach((applier) => applier(key, merged));
        } finally {
          applyingRemote = false;
        }
        meta[key] = updated_at;
        saveMeta(meta);
        return;
      }
    } catch (e) {
      console.warn("[cloudSync] applyRemote autoMerge error:", e);
    }
    if (JSON.stringify(queue[key]) === JSON.stringify(data)) {
      delete queue[key];
      saveQueue(queue);
      setState({ pending: Object.keys(queue).length });
    }
  }

  if (meta[key] && meta[key] >= updated_at && queue[key] === undefined) return; // قبلاً داریم یا جدیدتر است

  applyingRemote = true;
  try {
    appliers.forEach((applier) => applier(key, data));
  } finally {
    applyingRemote = false;
  }
  meta[key] = updated_at;
  saveMeta(meta);
}

export async function pullAll(prefix = "tlift_"): Promise<boolean> {
  if (state.isManualOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
    setState({ status: "offline" });
    return false;
  }
  try {
    setState({ status: "syncing" });
    let rows: { key: string; data: unknown; updated_at: string }[];
    if (USE_SUPABASE) {
      const res = await withTimeout(
        db().select("key,data,updated_at").like("key", `${prefix}%`)
      );
      if (res.error) throw res.error;
      rows = (res.data || []) as { key: string; data: unknown; updated_at: string }[];
    } else {
      rows = await apiSelectPrefix(prefix);
    }

    rows.forEach((r) => applyRemote(r.key, r.data, r.updated_at));
    const syncedAt = Date.now();
    localStorage.setItem(LAST_SYNC_KEY, String(syncedAt));
    setState({ status: "online", lastSync: syncedAt, error: undefined });
    return true;
  } catch (e: unknown) {
    console.warn("[cloudSync] pullAll:", e);
    setState({ status: "offline", error: describeSyncError(e) });
    return false;
  }
}

// ---- realtime ----
let channelStarted = false;
export function startRealtime() {
  if (channelStarted) return;
  channelStarted = true;
  try {
    supabase
      .channel("app_state_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        (payload: { new?: { key?: string; data?: unknown; updated_at?: string } }) => {
          const r = payload.new;
          if (r?.key && r.updated_at) applyRemote(r.key, r.data, r.updated_at);
        }
      )
      .subscribe();
  } catch {
    /* realtime optional */
  }
}

// پاک‌سازی صف‌های قدیمی که در راه‌اندازی اولیه بدون تغییر کاربر در صف مانده‌اند
function purgeBootstrapFromQueue() {
  const bootstrapRestored = localStorage.getItem("tlift_bootstrap_restored_v1");
  if (!bootstrapRestored) return;
  const meta = loadMeta();
  let changed = false;
  const BOOTSTRAP_KEYS = [
    "tlift_company_access_settings_v1",
    "tlift_contract_geo_locations_v1",
    "tlift_customers",
    "tlift_contracts",
    "tlift_active_service_assignments_v1",
    "tlift_contract_ribbon_v2",
    "tlift_pinned_contracts_v1",
    "tlift_scheduled_services",
    "tlift_contract_details",
  ];
  for (const k of BOOTSTRAP_KEYS) {
    if (queue[k] !== undefined && !meta[k]) {
      delete queue[k];
      changed = true;
    }
  }
  if (changed) {
    saveQueue(queue);
    setState({ pending: Object.keys(queue).length });
  }
}

// ---- bootstrap ----
let started = false;
export async function startCloudSync() {
  if (started) return;
  started = true;

  // پاک‌سازی صف‌های کاذب حاصل از راه‌اندازی اولیه بوت‌استرپ
  purgeBootstrapFromQueue();

  // تداخل‌های نسخه‌های قبلی برای داده‌های قابل‌ادغام، بدون حذف گزارش هیچ سرویس‌کار آماده ارسال می‌شوند.
  prepareStoredConflictMerges();

  // مقداردهی اولیه تعداد صف و وضعیت
  setState({
    pending: Object.keys(queue).length,
    offlineServicesCount: getOfflineServices().length,
    intervalMinutes: getSyncInterval(),
  });

  if (!state.isManualOffline && navigator.onLine) {
    await pullAll();
    if (Object.keys(queue).length > 0) {
      await flushAll();
    }
    // realtime فقط در حالت سوپابیس وجود دارد؛ در حالت هاست، همگام‌سازی دوره‌ای کافی است
    if (USE_SUPABASE) startRealtime();
  } else {
    setState({ status: "offline" });
  }

  // راه‌اندازی تایمر همگام‌سازی دوره‌ای بر اساس فاصله تنظیم‌شده توسط کاربر
  restartPeriodicSync();

  window.addEventListener("online", () => {
    if (!state.isManualOffline) {
      setState({ status: "syncing" });
      pullAll().then(() => flushAll());
    }
  });

  window.addEventListener("offline", () => {
    setState({ status: "offline" });
  });
}

/** همگام‌سازی دستی یا خودکار */
export async function syncNow(): Promise<{ success: boolean; message: string }> {
  if (state.isManualOffline) {
    return {
      success: false,
      message: "حالت آفلاین دستی فعال است. ابتدا آن را غیرفعال کنید.",
    };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setState({ status: "offline" });
    return {
      success: false,
      message: "اتصال به اینترنت برقرار نیست. داده‌ها در صف آفلاین محفوظ هستند.",
    };
  }

  setState({ status: "syncing" });
  try {
    // اول: دریافت آخرین ثبت‌های همکاران از سرور و ادغام با تغییرات محلی
    const pulled = await pullAll();
    // دوم: ارسال تغییرات باقیمانده به سرور
    const pushed = await flushAll();

    if (pushed && pulled) {
      clearOfflineServices();
      const syncedAt = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(syncedAt));
      setState({
        status: "online",
        lastSync: syncedAt,
        pending: 0,
        offlineServicesCount: 0,
        error: undefined,
      });
      return {
        success: true,
        message: "همگام‌سازی کامل با سرور انجام شد و همه اطلاعات به‌روزرسانی شدند.",
      };
    } else if (pulled) {
      // داده‌های همکاران با موفقیت دانلود و در برنامه بارگذاری شد
      const syncedAt = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(syncedAt));
      setState({
        status: "online",
        lastSync: syncedAt,
        pending: Object.keys(queue).length,
        error: undefined,
      });
      return {
        success: true,
        message: "اطلاعات همکاران با موفقیت دریافت و همگام شد. موارد باقیمانده صف به زودی ارسال می‌شوند.",
      };
    } else {
      setState({ status: navigator.onLine ? "error" : "offline" });
      return {
        success: false,
        message: navigator.onLine
          ? "سرور همگام‌سازی موقتاً در دسترس نیست؛ اطلاعات محفوظ است و خودکار دوباره ارسال می‌شود."
          : "برخی داده‌ها در صف باقی ماندند. به محض اتصال مجدد ارسال خواهند شد.",
      };
    }
  } catch (err: unknown) {
    console.warn("[cloudSync] syncNow:", err);
    setState({ status: navigator.onLine ? "error" : "offline", error: describeSyncError(err) });
    return {
      success: false,
      message: navigator.onLine
        ? "اینترنت برقرار است؛ سرور همگام‌سازی موقتاً پاسخ نداد. اطلاعات محفوظ است و دوباره تلاش می‌شود."
        : "اتصال اینترنت قطع است. اطلاعات در حافظه محلی محفوظ است.",
    };
  }
}
