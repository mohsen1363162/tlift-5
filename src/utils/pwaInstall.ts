/**
 * Early, app-wide capture of Chrome's install offer.
 *
 * Chrome fires `beforeinstallprompt` only ONCE per page load, as soon as the page is installable. The old code listened
 * for it inside the install dialog's hook, which only exists after the (lazy) mobile screen has loaded. On a slow
 * connection the event fired before that, was lost, the dialog never got its «نصب» button and the user fell back to the
 * browser's «Add to Home screen» – which only creates a shortcut with a small Chrome badge on the icon.
 *
 * `startInstallCapture()` is called from main.tsx before React renders, keeps the event, and lets any component read it
 * later through `useSyncExternalStore`.
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export interface InstallState {
  promptEvent: InstallPromptEvent | null;
  installed: boolean;
}

let state: InstallState = { promptEvent: null, installed: false };
const listeners = new Set<() => void>();
let started = false;

const setState = (next: InstallState) => {
  state = next; // a new object per change: useSyncExternalStore compares snapshots by reference
  listeners.forEach((listener) => listener());
};

export function startInstallCapture(target: Window | undefined = typeof window === "undefined" ? undefined : window) {
  if (started || !target) return;
  started = true;
  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we offer our own «نصب» button instead of the browser's mini-bar
    setState({ ...state, promptEvent: event as InstallPromptEvent });
  });
  target.addEventListener("appinstalled", () => setState({ promptEvent: null, installed: true }));
}

export const getInstallState = (): InstallState => state;

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows Chrome's install sheet. Resolves to the user's choice, or "unavailable" when Chrome has not offered it (yet). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = state.promptEvent;
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const choice = await event.userChoice;
    // an offer can be used only once; Chrome fires a new one later if the user can still install
    setState({ promptEvent: null, installed: choice.outcome === "accepted" ? true : state.installed });
    return choice.outcome;
  } catch {
    setState({ ...state, promptEvent: null });
    return "dismissed";
  }
}

/** Is the page running as an installed app (standalone window) rather than in a browser tab? */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
