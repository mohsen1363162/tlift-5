import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import BrandLogo from './components/BrandLogo';
import { Toaster } from './components/ui/toaster';
import './index.css';
import { startCloudSync } from './cloudSync';
import { startDailyDeviceBackups } from './utils/dailyBackups';
import { migrateInlinePhotos } from './utils/photoStorage';
import { startDeviceHeartbeat } from './utils/serverHealth';
import AppErrorBoundary from './components/AppErrorBoundary';
import { startGlobalErrorLogging } from './utils/errorLogger';
import { APP_VERSION } from './utils/appUpdater';

// بروزرسانی PWA: در هر بار ورود/بازگشت به صفحه، نسخه جدید Service Worker
// مستقیماً از سرور بررسی می‌شود. پس از فعال‌شدن نسخه تازه فقط یک‌بار صفحه
// بازنشانی می‌شود تا کاربر روی فایل‌های نسخه قبلی باقی نماند.
// در Preview توسعه، Service Worker قبلی را حذف می‌کنیم تا کش قدیمی باعث
// صفحه سفید یا reload پی‌درپی نشود. در نسخه production رفتار PWA حفظ می‌شود.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // تعویض Service Worker نباید وسط تکمیل فرم یا ثبت قرارداد صفحه را به خانه برگرداند.
  // نسخه تازه در بازشدن بعدی برنامه اعمال می‌شود و آپدیت دستی همچنان در دسترس است.
  const updateServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      await registration?.update();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    } catch {
      /* آفلاین است؛ نسخه موجود بدون اختلال اجرا می‌شود */
    }
  };

  window.addEventListener("load", updateServiceWorker);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") updateServiceWorker();
  });
  window.setInterval(updateServiceWorker, 30 * 60 * 1000);
}

try {
  startGlobalErrorLogging(APP_VERSION);
  // شروع همگام‌سازی ابری (Supabase) — در صورت قطع بودن اینترنت، آفلاین ادامه می‌دهد
  startCloudSync().catch(() => {
    /* بدون اینترنت یا خطای سرور: اپ به‌صورت آفلاین کار می‌کند */
  });
  // بک‌آپ مستقل روزانه روی هر کامپیوتر و موبایل، حتی هنگام قطعی چندروزه سرور.
  startDailyDeviceBackups();
  startDeviceHeartbeat();
  // مهاجرت تدریجی عکس‌های قدیمی Base64؛ هر اجرا محدود است تا برنامه کند نشود.
  void migrateInlinePhotos().catch(() => { /* در حالت آفلاین اجرای بعدی تلاش می‌کند */ });
} catch (e) {
  console.warn("Non-critical background bootstrap failed:", e);
}

/** صفحه بارگذاری — هنگام بررسی session */
const LoadingScreen: React.FC = () => (
  <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f3f4f6]">
    <BrandLogo className="h-14 w-14 shadow-sm" />
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8d7fc9] border-t-transparent" />
    <p className="text-[13px] text-gray-500">در حال بارگذاری سیستم...</p>
  </div>
);

/**
 * درگاه ورود:
 * - در حال بررسی session → صفحه بارگذاری
 * - کاربر لاگین شده است   → سیستم اصلی (App)
 * - کاربر لاگین نشده است  → صفحه ورود (LoginPage)
 */
const AppGate: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  return user ? <App /> : <LoginPage />;
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <AppGate />
        <Toaster />
      </AuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
