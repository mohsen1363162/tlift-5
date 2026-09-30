import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * ساعت‌ها و وضعیت‌هایی که نسخهٔ موبایل از مرورگر می‌گیرد، بدون اینکه کل برنامه هر ثانیه رندر شود.
 *
 * قبلاً یک state «تیک» در ریشهٔ TechnicianMobileApp هر ثانیه کل برنامه را دوباره رندر می‌کرد تا دو عدد کوچک
 * (زمان روز کاری و زمان سرویس) عوض شوند؛ با چند صد قرارداد هر رندر و هر بازسازی فهرست سرویس‌ها چند ده میلی‌ثانیه
 * تا چند صد میلی‌ثانیه CPU می‌برد و گوشی را گرم و کند می‌کرد. اعداد زنده حالا کامپوننت کوچک LiveTicker هستند.
 */

/** ثانیه‌های گذشته از یک لحظهٔ شروع (بدون شروع = ۰؛ هرگز منفی نمی‌شود). */
export const secondsSince = (startMs: number | null | undefined, nowMs: number = Date.now()): number =>
  startMs ? Math.max(0, Math.floor((nowMs - startMs) / 1000)) : 0;

/**
 * کلید «امروز» (تاریخ محلی). فقط وقتی روز عوض می‌شود تغییر می‌کند، پس برنامه به‌جای هر ثانیه روزی یک‌بار
 * رندر می‌شود؛ ماه/تاریخ جاری و ماه گذشتهٔ شمسی از روی آن دوباره حساب می‌شوند.
 */
export function useLocalDayKey(): string {
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const refresh = () => setDayKey(new Date().toDateString()); // مقدار یکسان = بدون رندر
    const id = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return dayKey;
}

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

/**
 * وضعیت اینترنت مرورگر. قبلاً فقط به‌خاطر رندر هر ثانیه تازه می‌شد؛ حالا با رویداد online/offline
 * (بنر قطع اینترنت و دکمهٔ انتقال گزارش آفلاین همان لحظه درست می‌شوند). همگام‌سازی ابری هم با همین رویدادها
 * وضعیت خودش را عوض می‌کند، ولی درستی بنر نباید به آن اتفاق وابسته باشد.
 */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    () => true,
  );
}
