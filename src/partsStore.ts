import { useSyncExternalStore } from "react";
import { pushKey, registerApplier } from "./cloudSync";
import { recordAudit } from "./auditLog";
import { planMaterialImport } from "./utils/materialCatalog";

export type PartItem = {
  id: number;
  code: string;
  name: string;
  alias: string;
  unit: string;
  brand: string;
  country: string;
  desc: string;
  consumable: boolean;
  price: number;
  stock: number;
  minimumStock?: number;
  /** Compatible catalogue migration: archived IDs stay available to old deliveries. */
  mergedInto?: number;
  catalogAliases?: string[];
  catalogRevision?: string;
};

const seed: [string, string, string, number][] = [
  ["1", "روغن دوزمانه", "عدد", 3500000],
  ["2", "دستمزد نصب تابلو", "عدد", 50000000],
  ["3", "بست ان اف", "عدد", 200000],
  ["5", "رنگ زدن شاخص طبقات", "عدد", 400000],
  ["2222", "رفع عیب", "عدد", 2000000],
  ["4587", "هزینه نظافت کامل آسانسور 2", "عدد", 2000000],
  ["6543", "خرابی", "عدد", 3000000],
  ["29039", "هزینه نظافت کامل آسانسور", "عدد", 3000000],
  ["29290", "روغن 4 لیتری", "عدد", 30000000],
  ["29291", "روغن 1 لیتری بهران", "لیتر", 280000],
  ["29292", "دستمزد تعویض روغن گیربکس", "عدد", 2000000],
  ["29309", "دستمزد تعویض کفشک", "عدد", 1000000],
];

function loadParts(): PartItem[] {
  try {
    const raw = localStorage.getItem("tlift_parts");
    if (raw) return (JSON.parse(raw) as PartItem[]).map((item) => ({ ...item, stock: Number(item.stock || 0), minimumStock: Number(item.minimumStock || 0) }));
  } catch (e) {
    console.warn("Error reading tlift_parts", e);
  }
  return planMaterialImport(seed.map(([code, name, unit, price], i) => ({
    id: i + 1,
    code,
    name,
    alias: "",
    unit,
    brand: "",
    country: "",
    desc: "",
    consumable: true,
    price,
    stock: 0,
    minimumStock: 0,
  }))).records;
}

function saveParts(data: PartItem[]) {
  try {
    localStorage.setItem("tlift_parts", JSON.stringify(data));
  } catch (e) {
    console.warn("Error saving tlift_parts", e);
  }
}

let parts: PartItem[] = loadParts();
let visibleParts = parts.filter(item => !item.mergedInto);
const refreshVisible = () => { visibleParts = parts.filter(item => !item.mergedInto); };

const listeners = new Set<() => void>();
const emit = () => {
  saveParts(parts);
  pushKey("tlift_parts", parts);
  refreshVisible();
  listeners.forEach((l) => l());
};
registerApplier((key, data) => {
  if (key !== "tlift_parts" || !Array.isArray(data)) return;
  parts = (data as PartItem[]).map((item) => ({ ...item, stock: Number(item.stock || 0) }));
  saveParts(parts);
  refreshVisible();
  listeners.forEach((listener) => listener());
});

export const partsApi = {
  all: () => visibleParts,
  previewMaterialImport: () => planMaterialImport(parts),
  applyMaterialImport: () => {
    const plan = planMaterialImport(parts);
    if (!plan.added && !plan.updated && !plan.archived) return plan;
    // Write the complete pre-import snapshot first. A quota failure must not
    // change the current list, queue, IDs or inventory.
    const backupKey = "tlift_parts_before_material_catalog_v1__backup";
    if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, JSON.stringify(parts));
    const previousRaw = localStorage.getItem("tlift_parts");
    const pending = JSON.parse(localStorage.getItem("tlift_offline_queue_v2") || "{}");
    if (!pending || Array.isArray(pending) || typeof pending !== "object") throw new Error("صف فعلی دستگاه معتبر نیست؛ فهرست تغییر نکرد.");
    // Reserve space for both the catalog and its offline upload before committing
    // the in-memory list. Storage.setItem is atomic per key, not across keys.
    let wroteParts = false;
    try {
      localStorage.setItem("tlift_parts", JSON.stringify(plan.records));
      wroteParts = true;
      localStorage.setItem("tlift_offline_queue_v2", JSON.stringify({ ...pending, tlift_parts: plan.records }));
    } catch (error) {
      if (wroteParts) {
        if (previousRaw === null) localStorage.removeItem("tlift_parts");
        else localStorage.setItem("tlift_parts", previousRaw);
      }
      throw error;
    }
    parts = plan.records;
    pushKey("tlift_parts", parts);
    refreshVisible();
    listeners.forEach(listener => listener());
    try {
      recordAudit({ action: "اعمال فهرست بازبینی‌شده قطعات", entityType: "part", entityId: "material-catalog",
        title: `${plan.added} جدید، ${plan.updated} به‌روزرسانی، ${plan.archived} ادغام`,
        after: { added: plan.added, updated: plan.updated, archived: plan.archived, warnings: plan.warnings, backupKey } });
    } catch { plan.warnings.push("فهرست ذخیره شد؛ ثبت گزارش حسابرسی به علت محدودیت حافظه انجام نشد."); }
    return plan;
  },
  add: (p: Omit<PartItem, "id">) => {
    parts = [{ ...p, id: Math.max(0, ...parts.map(item => item.id)) + 1 }, ...parts];
    emit();
  },
  update: (p: PartItem) => {
    const previous = parts.find((x) => x.id === p.id);
    if (previous) recordAudit({ action: previous.price !== p.price ? "تغییر قیمت قطعه" : previous.stock !== p.stock ? "انبارگردانی موجودی اصلی" : "ویرایش قطعه", entityType: "part", entityId: String(p.id), title: p.name, before: previous, after: p });
    parts = parts.map((x) => (x.id === p.id ? p : x));
    emit();
  },
  remove: (id: number) => {
    parts = parts.filter((x) => x.id !== id);
    emit();
  },
  adjustStock: (id: number, delta: number) => {
    let target = parts.find((item) => item.id === id);
    const visited = new Set<number>();
    while (target?.mergedInto) {
      if (visited.has(target.id)) return false;
      visited.add(target.id);
      target = parts.find(item => item.id === target!.mergedInto);
    }
    if (!target || target.stock + delta < 0) return false;
    parts = parts.map((item) => item.id === target.id ? { ...item, stock: item.stock + delta } : item);
    emit();
    return true;
  },
};

export function useParts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => visibleParts
  );
}

export const UNITS = ["عدد", "لیتر", "متر", "کیلوگرم", "بسته", "حلقه", "جفت"];
export const COUNTRIES = ["ایران", "چین", "ترکیه", "آلمان", "ایتالیا", "کره جنوبی", "اسپانیا"];
export const CURRENCIES = ["ریال", "دلار", "یورو", "درهم", "لیر"];
