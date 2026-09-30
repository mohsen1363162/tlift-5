// قاعدهٔ «هر سرویس‌کار هم‌زمان فقط یک سرویس انجام می‌دهد و هر سرویس فقط یک مجری دارد».
//
// فهرست کارهای در حال انجام یک آرایهٔ مشترک است که همهٔ دستگاه‌ها همگام می‌کنند. ادغام نسخه‌های
// قدیمی این آرایه (اتصال دوباره به اینترنت، دو دستگاه، نسخهٔ قدیمی برنامه) می‌تواند برای یک نفر چند
// کار «در حال انجام» بسازد. همهٔ ورودی‌های فهرست از همین توابع می‌گذرند تا قاعده یک جا نگه داشته شود.

export const ACTIVE_ASSIGNMENTS_KEY = "tlift_active_service_assignments_v1";

export type ActiveAssignmentShape = {
  contractId: number;
  monthId: number;
  technicianName: string;
  startedAt: number;
  buildingName: string;
};

/** کلید مقایسهٔ نام افراد: نیم‌فاصله/فاصله، «ي/ی» و «ك/ک» یکسان حساب می‌شوند. */
export function personKey(name: unknown): string {
  return String(name ?? "")
    .replace(/[\u200c\u200e\u200f]/g, " ")
    .replace(/[\u064a\u0649]/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameTechnician(a: unknown, b: unknown): boolean {
  const left = personKey(a);
  return left !== "" && left === personKey(b);
}

/**
 * برای هر سرویس‌کار فقط جدیدترین شروع و برای هر سرویس (قرارداد + ماه) فقط جدیدترین مجری می‌ماند؛
 * شروع سرویس تازه یعنی سرویس قبلی رها شده است. هیچ نفر دیگری تغییر نمی‌کند. اگر چیزی حذف نشود،
 * همان آرایهٔ ورودی برگردانده می‌شود تا نمای React بی‌دلیل تازه نشود.
 */
export function normalizeActiveAssignments<T extends ActiveAssignmentShape>(list: unknown): T[] {
  if (!Array.isArray(list)) return [];
  const items = (list as T[]).filter(
    (item) => item && typeof item === "object" && item.contractId !== undefined && item.monthId !== undefined
  );
  const startedAt = (item: T) => Number(item.startedAt) || 0;
  const newestFirst = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => startedAt(b.item) - startedAt(a.item) || b.index - a.index);
  const seenTechnicians = new Set<string>();
  const seenServices = new Set<string>();
  const keep = new Set<T>();
  for (const { item } of newestFirst) {
    const technician = personKey(item.technicianName);
    const service = `${item.contractId}:${item.monthId}`;
    if ((technician && seenTechnicians.has(technician)) || seenServices.has(service)) continue;
    if (technician) seenTechnicians.add(technician);
    seenServices.add(service);
    keep.add(item);
  }
  const result = items.filter((item) => keep.has(item));
  return result.length === list.length ? (list as T[]) : result;
}

/** ادغام نسخهٔ سرور و نسخهٔ محلی؛ نتیجه همیشه از قاعدهٔ «یک کار برای هر نفر» می‌گذرد. */
export function mergeActiveAssignments<T extends ActiveAssignmentShape>(serverData: unknown, localData: unknown): T[] {
  const server = Array.isArray(serverData) ? (serverData as T[]) : [];
  const local = Array.isArray(localData) ? (localData as T[]) : [];
  return normalizeActiveAssignments<T>([...server, ...local]);
}
