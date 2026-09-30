import { useEffect, useState, type ReactNode } from "react";

/**
 * فقط خودش را هر `everyMs` میلی‌ثانیه دوباره رندر می‌کند و `render(اکنون)` را نشان می‌دهد؛ ریشهٔ برنامه ساکن می‌ماند.
 * هنگام برگشتن به برنامه (visibilitychange) بلافاصله عدد درست را نشان می‌دهد، نه بعد از یک تیک.
 */
export default function LiveTicker({ render, everyMs = 1000 }: { render: (nowMs: number) => ReactNode; everyMs?: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    refresh();
    const id = window.setInterval(refresh, everyMs);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [everyMs]);
  return <>{render(nowMs)}</>;
}
