/**
 * The cookie notice's rules (`src/components/legal/CookieNotice.tsx`).
 *
 * Vibe sets only the cookies that keep a person signed in, so there is no
 * consent to ask for and nothing to decline. The notice says so once, on the
 * signed-out pages. Closing it writes ONE note in the browser, under the key
 * below. Nothing is sent to Vibe, nothing is counted, and no cookie is set
 * (Privacy Policy section 7 says the same: change both together).
 *
 * No imports, so the test loads this file directly.
 */

/** The one browser-storage key. The value says only "closed". */
export const COOKIE_NOTICE_STORAGE_KEY = "vibe_cookie_notice_closed";
const CLOSED = "1";

/** The words on the notice. No "Accept" and no "Decline": there is no choice to make. */
export const COOKIE_NOTICE_COPY = {
  label: "Cookie notice",
  text: "Vibe only uses the cookies that keep you signed in. No ads, no trackers.",
  link: "Privacy Policy",
  linkHref: "/legal/privacy",
  button: "Got it",
} as const;

/**
 * What the notice must never sit on top of: the landing's and the waitlist's
 * buttons, the sign-in forms' submit button, and the box that checks you are
 * a person (TurnstileBox carries the attribute). While one of them is under
 * the notice's place, the notice steps out of the way.
 */
export const COOKIE_NOTICE_KEEP_CLEAR = ".vln-btn, .vibe-auth-submit, [data-keep-clear]";

/** Clear space kept around those, in px. */
export const COOKIE_NOTICE_GAP = 8;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Has this browser closed the notice before? False when storage can't be read. */
export function cookieNoticeClosed(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(COOKIE_NOTICE_STORAGE_KEY) === CLOSED;
  } catch {
    return false;
  }
}

/** Remember the close. False when the browser refused (private mode, storage off). */
export function rememberCookieNoticeClosed(storage: StorageLike | null | undefined): boolean {
  try {
    if (!storage) return false;
    storage.setItem(COOKIE_NOTICE_STORAGE_KEY, CLOSED);
    return true;
  } catch {
    return false;
  }
}

/**
 * Never inside another page's frame (the mini messenger frames
 * `/messages?mini=1`, and a signed-out frame can land on the log-in page),
 * and never on an address that carries `mini=1` itself.
 */
export function cookieNoticeAllowedHere(framed: boolean, search: string): boolean {
  if (framed) return false;
  return !/(^|[?&])mini=1(&|$)/.test(search);
}

export type Box = { left: number; top: number; right: number; bottom: number };

/** Do two boxes come within `gap` px of each other? An empty box touches nothing. */
export function boxesTouch(a: Box, b: Box, gap = 0): boolean {
  if (a.right <= a.left || a.bottom <= a.top || b.right <= b.left || b.bottom <= b.top) return false;
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}
