/**
 * Holds on to Chrome's install offer (`beforeinstallprompt`) so a later
 * "Install Vibe" button can use it.
 *
 * Chrome fires the event once per page load, on whatever page loads first, and
 * only to listeners already attached. So this module attaches at load: the
 * ServiceWorkerRegistrar in the root layout imports it for that side effect.
 * An event that fires before the app's JavaScript arrives is simply missed
 * for that page view.
 *
 * Wave 1 only CAPTURES the event. It does not call preventDefault(), so
 * Chrome keeps showing its own install UI until wave 3's install coach
 * exists. Safari and Firefox never fire it (iOS installs from the Share
 * sheet), so getInstallPrompt() stays null there.
 *
 * Module-level store, like src/lib/feedback/toast.ts: any client component
 * can read it with useSyncExternalStore(onInstallPromptChange,
 * getInstallPrompt, () => null).
 */

/** Chrome's event. TypeScript's DOM lib has no type for it. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallPromptListener = (prompt: BeforeInstallPromptEvent | null) => void;

let stashed: BeforeInstallPromptEvent | null = null;
let installedThisSession = false;
const listeners = new Set<InstallPromptListener>();

function emit() {
  for (const listener of listeners) listener(stashed);
}

// A "use client" module still runs during the server render of the root
// layout, where there is no window. Everything below needs one.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    stashed = event as BeforeInstallPromptEvent;
    emit();
  });
  // Fires however the install happened: our prompt, Chrome's menu or its
  // address-bar button. The stashed offer is spent either way.
  window.addEventListener("appinstalled", () => {
    installedThisSession = true;
    stashed = null;
    emit();
  });
}

/** The offer Chrome made on this page load, or null (not offered, spent by an install, or on the server). */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return stashed;
}

/** Called with the current offer whenever it arrives or is spent. Returns the unsubscribe. */
export function onInstallPromptChange(listener: InstallPromptListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once `appinstalled` fired on this page load, so a coach can say "done" instead of offering again. */
export function wasInstalledThisSession(): boolean {
  return installedThisSession;
}
