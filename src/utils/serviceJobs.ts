/*
 * منطق خالص ساخت فهرست «سرویس‌ها» در نسخهٔ موبایل (بدون React تا بتوان جدا تست کرد).
 *
 * نتیجهٔ این توابع دقیقاً همان ترتیب و همان انتخاب‌های کد قبلی است؛ فقط هزینه‌شان کم شده:
 *  - مرتب‌سازی قبلاً در هر مقایسه دو بار تاریخ را دوباره نرمال و با localeCompare مقایسه می‌کرد (حدود ۸۰ هزار بار برای ۵۰۰ قرارداد)؛
 *  - «اولین سرویس انجام‌نشدهٔ هر قرارداد» با findIndex تو در تو (O(n²)) پیدا می‌شد.
 */

/** کلید استاندارد تاریخ سرویس: YYYY/MM/DD با ارقام انگلیسی و صفر پر شده. */
const CANONICAL_DATE = /^\d{4}\/\d{2}\/\d{2}$/;

export type OrderableJob<T> = { job: T; done: boolean; date: string };

/**
 * انجام‌نشده‌ها اول، سپس به ترتیب تاریخ (پایدار). برای کلیدهای استاندارد مقایسهٔ ساده همان ترتیب localeCompare را می‌دهد
 * (رقم‌ها و «/» در جای ثابت‌اند)؛ هر کلید غیرمعمول مثل قبل با localeCompare مقایسه می‌شود.
 */
export function orderJobs<T>(entries: Array<OrderableJob<T>>): T[] {
  const decorated = entries.map((entry, index) => ({ ...entry, index, canonical: CANONICAL_DATE.test(entry.date) }));
  decorated.sort((a, b) => {
    const byDone = Number(a.done) - Number(b.done);
    if (byDone) return byDone;
    if (a.date === b.date) return a.index - b.index;
    const byDate = a.canonical && b.canonical ? (a.date < b.date ? -1 : 1) : a.date.localeCompare(b.date);
    return byDate || a.index - b.index;
  });
  return decorated.map((entry) => entry.job);
}

type JobLike = { contract: { id: number }; month: { done?: boolean } };

/** اولین سرویس انجام‌نشدهٔ هر قرارداد به ترتیب فهرست (یک گذر، نه O(n²)). */
export function firstPendingPerContract<T extends JobLike>(jobs: readonly T[]): T[] {
  const seen = new Set<number>();
  const picked: T[] = [];
  for (const job of jobs) {
    if (job.month.done || seen.has(job.contract.id)) continue;
    seen.add(job.contract.id);
    picked.push(job);
  }
  return picked;
}
