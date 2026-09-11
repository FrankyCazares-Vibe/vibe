import type { ToastAction } from "@/lib/feedback/failure-copy";

/**
 * App-wide toast store (silent-failure design §3a). Module-level rather than
 * a context provider, so any client component, hook or plain helper can call
 * `toast()`. <ToastHost /> in the root layout reads it with
 * useSyncExternalStore and renders the one toast on screen.
 *
 * One toast at a time: a new one replaces the old, and the same message
 * again within 1.5 s is dropped (a double tap, or one refusal per recipient
 * in a send loop). Static pages have their own twin, window.vibeToast in
 * public/html/_persistence.js.
 */
export type ToastTone = "info" | "error";

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number;
};

export type ToastItem = {
  /** Bumps on every toast so the host remounts (and re-animates) a replacement. */
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  durationMs: number;
};

const DEDUPE_MS = 1_500;

let current: ToastItem | null = null;
let nextId = 1;
let lastMessage = "";
let lastShownAt = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Info 2.4 s, error 5 s, error with an action 8 s (time to reach the button). */
function defaultDuration(tone: ToastTone, action?: ToastAction): number {
  if (tone === "info") return 2_400;
  return action ? 8_000 : 5_000;
}

export function toast(input: string | ToastInput): void {
  // Server renders share this module across requests; a toast only means
  // something in a browser.
  if (typeof window === "undefined") return;
  const t = typeof input === "string" ? { message: input } : input;
  const message = (t.message ?? "").trim();
  if (!message) return;
  const now = Date.now();
  if (message === lastMessage && now - lastShownAt < DEDUPE_MS) return;
  lastMessage = message;
  lastShownAt = now;

  const tone = t.tone ?? "info";
  const durationMs = t.durationMs ?? defaultDuration(tone, t.action);
  current = { id: nextId++, message, tone, action: t.action, durationMs };
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(dismissToast, durationMs);
  emit();
}

export function dismissToast(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!current) return;
  current = null;
  emit();
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot(): ToastItem | null {
  return current;
}
