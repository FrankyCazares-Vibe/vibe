/**
 * "Is a newer build live, and is this a safe moment to reload?"
 *
 * Nothing reloaded a tab that was already open when a new build went out, so
 * a tab left open, or the Home Screen app resumed from memory, kept running
 * old code until its next page load. `BuildRefresh`
 * (src/components/build/BuildRefresh.tsx) asks GET /api/version when the
 * person comes back to the tab and reloads when the answer is another build,
 * but never in the middle of something. This file is the rules;
 * page-snapshot.ts reads the page for them. The static desktop profile runs
 * a hand-written twin of the same rules, public/html/_buildRefresh.js
 * (static-build-refresh.test.ts keeps the two in step).
 *
 * Pure: no React, no DOM, no imports and only erasable TypeScript, so
 * `node --test` loads it directly (build-refresh.test.ts).
 */

/** The longest a build id may be. Vercel's are about 32 characters. */
const MAX_BUILD_ID = 128;

/**
 * A usable build id, or "" for anything else (missing, not a string, has a
 * space in it, too long). "" always means "can't tell", and can't tell always
 * means do nothing.
 */
export function cleanBuildId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim();
  if (id.length === 0 || id.length > MAX_BUILD_ID) return "";
  return /^[\x21-\x7e]+$/.test(id) ? id : "";
}

/**
 * The build this code came from. next.config.ts copies Vercel's
 * VERCEL_DEPLOYMENT_ID into NEXT_PUBLIC_BUILD_ID at build time, so the same
 * text is written into the browser files and into the /api/version route of
 * one build: a page and its own build's route can never disagree. Every
 * deployment gets a new id, an empty redeploy of the same commit included
 * (that is how a changed setting goes live), which a commit hash would miss.
 * "" in local dev, where the variable is not set.
 */
export const BUILD_ID = cleanBuildId(process.env.NEXT_PUBLIC_BUILD_ID);

/** Where the browser asks. Public, the same for everyone, never cached. */
export const VERSION_PATH = "/api/version";

/** At most one ask in this long. The page load counts as the first. */
export const ASK_EVERY_MS = 2 * 60 * 1000;

/**
 * An answer slower than this is dropped. The reload is only fair in the
 * moment the person comes back; a second or two later they are reading. A
 * phone waking on a cell connection can take longer than this for its first
 * request, and then that return simply does nothing.
 */
export const ANSWER_WITHIN_MS = 1500;

/**
 * Pages that never reload themselves: sign-in, sign-up and the email steps,
 * onboarding, the waitlist form. Each holds a step in memory ("check your
 * email", the code screen, step 3 of 5) with no typed field on screen to give
 * it away, and each is left by a full page load anyway.
 */
const QUIET_PREFIXES = ["/auth", "/onboarding", "/waitlist"];

export function quietPath(pathname: string): boolean {
  return QUIET_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type AskInput = {
  /** This tab's own build (BUILD_ID). */
  mine: string;
  /** `document.visibilityState === "visible"` */
  visible: boolean;
  /** `navigator.onLine`; only a plain `false` counts as offline. */
  online: boolean;
  /** `location.pathname` */
  path: string;
  /** `Date.now()`: wall-clock time, so hours asleep in a pocket count. */
  now: number;
  /** When this tab last knew where it stood: the page load, or its last ask. */
  checkedAt: number;
};

/**
 * Ask now? Called when the tab becomes visible and when the page comes back
 * from the back-forward cache, never on a timer. A fresh page is the newest
 * build already (pages are served no-store), so the load counts as an ask
 * and nothing is sent in its first two minutes.
 */
export function shouldAsk(input: AskInput): boolean {
  if (!input.mine) return false;
  if (!input.visible || !input.online) return false;
  if (quietPath(input.path)) return false;
  const since = input.now - input.checkedAt;
  // A clock set backwards must not silence the check for hours.
  return since >= ASK_EVERY_MS || since < 0;
}

/**
 * The build to reload for, or "" for "stay".
 *
 * Any other id counts, not only a later one: after a rollback the live build
 * is an older one, and the tab should follow it. `reloadedFor` is the loop
 * guard: this tab already reloaded for that build once and is still not on
 * it (something served the old page again), so it stays put until the live
 * build changes again.
 */
export function reloadTarget(input: { mine: string; live: string; reloadedFor: string }): string {
  const { mine, live, reloadedFor } = input;
  if (!mine || !live) return "";
  if (live === mine) return "";
  if (live === reloadedFor) return "";
  return live;
}

/**
 * How a form control can hold unsaved work, from its tag and `type`:
 * - "text": typed into (a text box, a textarea, a date or number field);
 * - "choice": picked, ticked or dragged (a pick-list, a checkbox, a radio
 *   button, a slider, a colour);
 * - "file": a file input, counted by the file it holds, not by a value;
 * - null: holds nothing of the person's (a button, a hidden input, any
 *   other tag).
 */
export type ControlKind = "text" | "choice" | "file" | null;

const CHOICE_TYPES = new Set(["checkbox", "radio", "range", "color"]);
const NO_VALUE_TYPES = new Set(["button", "hidden", "image", "reset", "submit"]);

export function controlKind(tagName: string, type = ""): ControlKind {
  const tag = tagName.toUpperCase();
  if (tag === "TEXTAREA") return "text";
  if (tag === "SELECT") return "choice";
  if (tag !== "INPUT") return null;
  const kind = type.toLowerCase();
  if (kind === "file") return "file";
  if (CHOICE_TYPES.has(kind)) return "choice";
  return NO_VALUE_TYPES.has(kind) ? null : "text";
}

/**
 * A control the person changed during this page view: what it held just
 * before they first touched it, and what it holds now. `before` is null when
 * nobody saw it before the change (a pick-list changed with no click or key
 * press noticed first).
 */
export type Touched = { before: string | null; now: string };

/**
 * Unsaved work? Yes when it differs from what the person found, spaces
 * aside, and yes when what they found is not known: a wrong yes only delays
 * a reload.
 */
export function isDraft(field: Touched): boolean {
  if (field.before === null) return true;
  return field.now.trim() !== field.before.trim();
}

/**
 * The file input whose picker is open, after one more event; null when none.
 *
 * A pressed file input opens the device's file picker or camera over the
 * page, and until it answers nothing on the page gives it away: no dialog,
 * no text, no file yet. On a phone, closing the picker can itself be the
 * moment the person "comes back to the tab", before the chosen photo has
 * been handed over. So an open picker counts as a picked file:
 * - "click" on a file input opens it (`onFileInput`), whether the person
 *   pressed the input or the app did it for them (`input.click()` behind an
 *   attach button);
 * - "change" or "cancel" on that same input: it answered. A chosen file is
 *   on the page from here on and counts by itself;
 * - the person's next tap or key press: they are back on the page. This is
 *   how it ends in a browser too old to send "cancel", so a closed picker
 *   can never hold the reload for longer than that.
 * Anything else (a wheel turn, a scroll, a click elsewhere) changes nothing.
 */
export function pickerAfter<T>(
  open: T | null,
  event: { type: string; target?: T | null; onFileInput?: boolean },
): T | null {
  const { type, target = null } = event;
  if (type === "click") return event.onFileInput && target ? target : open;
  if (type === "change" || type === "cancel") return target === open ? null : open;
  if (type === "pointerdown" || type === "touchstart" || type === "keydown") return null;
  return open;
}

/**
 * What the page looks like at the moment of deciding, as plain numbers and
 * text (page-snapshot.ts fills it in). One per document: the page itself,
 * and one for each same-origin frame inside it, because the old
 * direct-message screen and onboarding are frames. A frame from another
 * site cannot be read and is left out.
 */
export type PageSnapshot = {
  /**
   * The text of the field the cursor is in; null when the cursor is not in
   * a field. Only a field with text in it holds the reload back: the desktop
   * direct-message box takes the cursor by itself whenever a chat opens, so
   * "the cursor is in a field" alone would mean that tab never reloads.
   */
  focused: string | null;
  /**
   * The controls the person typed in or changed during this page view (text
   * boxes, pick-lists, checkboxes, sliders). One they never touched is not
   * listed, so a prefilled search or a saved profile field cannot hold the
   * reload back for ever.
   */
  typed: Touched[];
  /**
   * Files picked and still on the page: a file input holding one, or a local
   * preview on screen. Also a file being picked right now: the device's
   * picker or camera is open (`pickerAfter`).
   */
  files: number;
  /**
   * Parts of the page that say they hold unsaved work (`data-holds-reload`):
   * the phone profile once something is changed in edit mode, the feed
   * composer with a post in it. For work that is no form control, such as a
   * tapped chip or a picked video.
   */
  holding: number;
  /** Dialogs, sheets, drawers and menus on screen. */
  overlays: number;
  /** Things on screen marked `aria-busy`: a save or a load in flight. */
  busy: number;
  /** Videos and sounds playing (the landing film included). */
  playing: number;
  frames: PageSnapshot[];
};

/** Why now is not the moment, in the order checked. */
export type Blocker = "typing" | "draft" | "file" | "unsaved" | "overlay" | "busy" | "playing";

/**
 * The first thing that makes a reload unsafe, or null when the page is idle.
 * A frame counts exactly like the page around it.
 */
export function blockedBy(page: PageSnapshot): Blocker | null {
  if (page.focused !== null && page.focused.trim() !== "") return "typing";
  if (page.typed.some(isDraft)) return "draft";
  if (page.files > 0) return "file";
  if (page.holding > 0) return "unsaved";
  if (page.overlays > 0) return "overlay";
  if (page.busy > 0) return "busy";
  if (page.playing > 0) return "playing";
  for (const frame of page.frames) {
    const blocker = blockedBy(frame);
    if (blocker) return blocker;
  }
  return null;
}

/**
 * The last look before a reload, at the moment the answer arrives. The
 * person may have left the tab again or moved to a quiet page while it was
 * on its way. `touched`: they tapped, pressed a key or scrolled since the
 * ask went out, so they are already doing something and a reload now would
 * happen under their fingers (the scroll position gone, a tapped link
 * swallowed). The next return to the tab tries again.
 */
export function safeToReload(moment: {
  visible: boolean;
  path: string;
  touched: boolean;
  page: PageSnapshot;
}): boolean {
  if (!moment.visible || moment.touched) return false;
  if (quietPath(moment.path)) return false;
  return blockedBy(moment.page) === null;
}

/**
 * sessionStorage key: the last build this tab reloaded itself for. A build
 * id and nothing else; it goes when the tab closes.
 */
export const RELOADED_FOR_KEY = "vibe_build_reloaded_for";

/**
 * sessionStorage key: the build of the app code this tab last loaded. Also a
 * build id and nothing else. It is there for the one page that has no build
 * id of its own: the desktop profile is a static file
 * (public/html/profile.html) that takes over the whole tab, so nothing can
 * be written into it at build time. Every app page leaves its id here as it
 * loads, /profile hops to the static page a moment later, and the static
 * page's own small check (public/html/_buildRefresh.js) reads it as "my
 * build".
 */
export const LOADED_BUILD_KEY = "vibe_build_loaded";

/** The calls used, so a test can pass a fake. */
type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

/**
 * Leaves this tab's build for the static profile page, or clears the note
 * when there is no build id, so that page never compares against an old one.
 * Never throws: with storage blocked the static page finds nothing and does
 * nothing.
 */
export function noteLoadedBuild(open: () => Store, build: string): void {
  try {
    const store = open();
    if (build) store.setItem(LOADED_BUILD_KEY, build);
    else store.removeItem?.(LOADED_BUILD_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * `open` hands over `window.sessionStorage`. It is a function because merely
 * touching that property throws where storage is blocked.
 */
export function readReloadedFor(open: () => Store): string {
  try {
    return cleanBuildId(open().getItem(RELOADED_FOR_KEY));
  } catch {
    return "";
  }
}

/**
 * Writes the loop guard BEFORE the reload and says whether it stuck. No
 * guard, no reload: where storage is blocked or full the tab simply keeps
 * its build until the person loads a page themselves.
 */
export function rememberReload(open: () => Store, build: string): boolean {
  try {
    const store = open();
    store.setItem(RELOADED_FOR_KEY, build);
    return store.getItem(RELOADED_FOR_KEY) === build;
  } catch {
    return false;
  }
}
