import { useState, useSyncExternalStore } from "react";
import {
  getInstallState,
  isRunningStandalone,
  promptInstall,
  startInstallCapture,
  subscribeInstallState,
} from "../utils/pwaInstall";

/**
 * State of the «install T_lift» offer. The browser's install event is captured once, early, by `startInstallCapture`
 * (main.tsx), so it is available here no matter when this hook is mounted.
 */
export function usePWAInstall() {
  startInstallCapture(); // no-op when main.tsx already started it (harmless in tests / other entry points)
  const { promptEvent, installed } = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [standalone] = useState(() => isRunningStandalone());
  const ua = typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase() : "";

  const install = async () => (await promptInstall()) === "accepted";

  return {
    isInstallable: !!promptEvent,
    isInstalled: standalone || installed,
    isAndroid: /android/.test(ua),
    isIOS: /iphone|ipad|ipod/.test(ua),
    // مرورگر داخلی برنامه‌ها (تلگرام، ایتا، بله، …) در اندروید نشانهٔ «wv» دارد و نصب PWA در آن ممکن نیست
    isWebView: /android/.test(ua) && /; wv\)/.test(ua),
    install,
  };
}
