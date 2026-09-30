/*
 * بهترین موقعیت GPS در یک بازهٔ کوتاه؛ برای «ثبت موقعیت همین‌جا».
 *
 * اولین جوابی که مرورگر می‌دهد معمولاً تقریبی است (شبکه/وای‌فای، صدها متر) و GPS چند ثانیه بعد دقیق می‌شود.
 * برای ثبت دائمی موقعیت ساختمان چند ثانیه گوش می‌دهیم و به‌محض رسیدن به دقت کافی تمام می‌کنیم؛ اگر دقت کافی نشد،
 * بهترین مقدار همان بازه برگردانده می‌شود و تصمیم (قبول یا رد) با فراخوان است.
 */

export type FixLike = { coords: { latitude: number; longitude: number; accuracy: number } };
export type GeolocationLike = {
  watchPosition(success: (position: FixLike) => void, error?: (error: { code?: number }) => void, options?: PositionOptions): number;
  clearWatch(id: number): void;
};

/** با دقت بهتر از این، بلافاصله تمام می‌شود. */
export const REGISTER_GOOD_ENOUGH_M = 25;
/** بدتر از این برای ثبت دائمی موقعیت ساختمان پذیرفته نمی‌شود (داخل ساختمان‌ها معمولاً ۳۰ تا ۱۵۰ متر می‌شود). */
export const REGISTER_MAX_ACCURACY_M = 100;
export const REGISTER_WINDOW_MS = 10_000;

export type BestPositionOptions = {
  goodEnoughMeters?: number;
  windowMs?: number;
  /** برای تست؛ پیش‌فرض navigator.geolocation */
  geolocation?: GeolocationLike | null;
};

/** خطاها همان شکل GeolocationPositionError را دارند: code 1 = اجازه داده نشد، 2 = در دسترس نیست، 3 = زمان تمام شد، 0 = پشتیبانی نمی‌شود. */
export function acquireBestPosition(options: BestPositionOptions = {}): Promise<FixLike> {
  const geolocation = options.geolocation !== undefined ? options.geolocation : typeof navigator !== "undefined" ? (navigator.geolocation as GeolocationLike) : null;
  const goodEnough = options.goodEnoughMeters ?? REGISTER_GOOD_ENOUGH_M;
  const windowMs = options.windowMs ?? REGISTER_WINDOW_MS;

  return new Promise<FixLike>((resolve, reject) => {
    if (!geolocation) return reject({ code: 0, message: "unsupported" });
    let best: FixLike | null = null;
    let lastError: { code?: number } | null = null;
    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (result: FixLike | null, error?: { code?: number } | null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (watchId !== null) geolocation.clearWatch(watchId);
      if (result) resolve(result);
      else reject(error || { code: 3, message: "timeout" });
    };

    timer = setTimeout(() => settle(best, lastError), windowMs);
    watchId = geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite)) return; // یک جواب خراب جای جواب خوب را نمی‌گیرد
        if (!best || accuracy < best.coords.accuracy) best = position;
        if (best.coords.accuracy <= goodEnough) settle(best);
      },
      (error) => {
        lastError = error;
        if (error?.code === 1) settle(null, error); // اجازه داده نشده؛ صبر کردن فایده ندارد
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: windowMs }
    );
    // اگر مرورگر همان لحظه جواب را هم‌زمان داد و تمام شد، نگهدارندهٔ watch را بعد از ثبت شناسه پاک می‌کنیم.
    if (settled) geolocation.clearWatch(watchId);
  });
}
