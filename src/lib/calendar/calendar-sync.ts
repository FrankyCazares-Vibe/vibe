/**
 * One way to say "the viewer's calendar changed" (Oct 19, 2026, critique D12).
 *
 * Why: an RSVP made in the Otto-corner window (an iframe of /messages), in a
 * second tab, or on the club page never reached My Calendar until a reload.
 * The old `emitCalendarChanged` fired a window event only, and an iframe or
 * another tab has its own window.
 *
 * Now `emitCalendarChanged()` does two things, once per tick however many
 * places call it (an RSVP in the desktop club panel reaches it twice, through
 * the sheet and through the shell):
 *   1. fires `CALENDAR_CHANGED_EVENT` on this page's window, as before, so
 *      every existing `window.addEventListener(CALENDAR_CHANGED_EVENT, …)`
 *      keeps working unchanged;
 *   2. posts one message on `BroadcastChannel("vibe-calendar")`.
 * A page that hears the channel fires its own window event and never posts
 * back, so there is no echo. A hidden tab waits and fires once when it is
 * looked at again, so ten RSVPs in one tab cost a background tab one read.
 *
 * One channel per page: the instance lives on `window.__vibeCalendarSync`,
 * so a second copy of this module (HMR, two bundles) shares it. The channel
 * opens as soon as the module loads in a browser, so pages that only listen
 * (MessagesDesktop, ClubPane) hear other tabs too.
 *
 * The static desktop profile (public/html/profile.html) can't import this.
 * Its twin is the message shape below: `{ type: "calendar-changed", v: 1 }`
 * on the channel named `vibe-calendar` (batch-B8.md has the snippet).
 *
 * No imports: node's test runner loads it bare (calendar-sync.test.ts).
 */

export const CALENDAR_CHANGED_EVENT = "vibe:calendar-changed";
export const CALENDAR_CHANNEL = "vibe-calendar";
export const CALENDAR_MESSAGE = Object.freeze({ type: "calendar-changed", v: 1 });

/** My Calendar re-reads on return to the tab at most this often (another
 *  device's RSVP has no channel to arrive on). */
export const RETURN_REFRESH_MS = 30_000;

export type SyncChannel = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (ev: { data: unknown }) => void): void;
  close(): void;
};

/** What the sync needs from the page: a seam so the tests can fake it. */
export type SyncHost = {
  /** Fire this page's own `CALENDAR_CHANGED_EVENT`. */
  dispatch(): void;
  isHidden(): boolean;
  /** Call `fn` each time the page becomes visible again. */
  onVisible(fn: () => void): void;
  /** Null when the browser has no BroadcastChannel. May throw. */
  openChannel(name: string): SyncChannel | null;
  /** Run `fn` after the current task's other calls (a microtask). */
  schedule(fn: () => void): void;
};

export type CalendarSync = {
  connect(): void;
  emit(): void;
};

export function isCalendarMessage(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { type?: unknown; v?: unknown };
  return d.type === CALENDAR_MESSAGE.type && d.v === CALENDAR_MESSAGE.v;
}

/** True when a return to the tab should re-read: the last read is at least
 *  `gapMs` old (or there was none). */
export function shouldRefreshOnReturn(lastReadAt: number | null, now: number, gapMs = RETURN_REFRESH_MS): boolean {
  return lastReadAt === null || now - lastReadAt >= gapMs;
}

export function createCalendarSync(host: SyncHost): CalendarSync {
  let channel: SyncChannel | null = null;
  let connected = false;
  let queued = false;
  let heardWhileHidden = false;

  const heard = () => {
    if (host.isHidden()) {
      heardWhileHidden = true;
      return;
    }
    host.dispatch();
  };

  const connect = () => {
    if (connected) return;
    connected = true;
    try {
      channel = host.openChannel(CALENDAR_CHANNEL);
    } catch {
      channel = null;
    }
    channel?.addEventListener("message", (ev) => {
      if (isCalendarMessage(ev.data)) heard();
    });
    host.onVisible(() => {
      if (!heardWhileHidden) return;
      heardWhileHidden = false;
      host.dispatch();
    });
  };

  const emit = () => {
    connect();
    if (queued) return;
    queued = true;
    host.schedule(() => {
      queued = false;
      host.dispatch();
      try {
        channel?.postMessage(CALENDAR_MESSAGE);
      } catch {
        // A closed or refused channel: this page still heard it.
      }
    });
  };

  return { connect, emit };
}

type SyncWindow = Window & { __vibeCalendarSync?: CalendarSync };

function browserSync(): CalendarSync | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const w = window as SyncWindow;
  if (!w.__vibeCalendarSync) {
    w.__vibeCalendarSync = createCalendarSync({
      dispatch: () => window.dispatchEvent(new CustomEvent(CALENDAR_CHANGED_EVENT)),
      isHidden: () => document.visibilityState === "hidden",
      onVisible: (fn) => {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") fn();
        });
      },
      openChannel: (name) =>
        typeof BroadcastChannel === "function" ? (new BroadcastChannel(name) as unknown as SyncChannel) : null,
      schedule: (fn) => queueMicrotask(fn),
    });
  }
  return w.__vibeCalendarSync;
}

/** Tell every place that shows the viewer's plans, on this page, in its
 *  iframes and parent, and in the viewer's other tabs, to read them again. */
export function emitCalendarChanged(): void {
  browserSync()?.emit();
}

/** Start hearing other tabs and frames (also done when this module loads). */
export function connectCalendarSync(): void {
  browserSync()?.connect();
}

connectCalendarSync();
