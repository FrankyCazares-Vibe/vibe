import { POST_EMAIL_CONFIRM_PATH } from "@/lib/auth/email-confirm-redirect";
import { isSafeRelativePath } from "@/lib/auth/login-next";

/**
 * Where the "Choose your password" screen lives, and how to link to it
 * (pre-registration fix, Oct 2026).
 *
 * The first confirmation of an address removes any password chosen before
 * the inbox was proven (see src/lib/auth/password-needed.ts). The sign-up
 * page and the login code box set it again right after the code; everyone
 * who confirmed some other way is sent here by `/auth/terms`.
 *
 * Pure and client-safe: the Terms page, its form, the choose screen and the
 * confirmation clients all build the same link from here.
 */
export const CHOOSE_PASSWORD_PATH = "/auth/choose-password";

/** Pages that must never be the `next` of the choose screen: each can send back to it. */
const NO_LOOP_PATHS = [CHOOSE_PASSWORD_PATH, "/auth/terms"] as const;

/**
 * The path part of a safe relative `next`, as the router will see it: query
 * and hash dropped, dot segments folded, percent escapes decoded, and runs of
 * slashes squeezed to one (Next answers any `//` with a 308 to the
 * single-slash form), so `/auth/./terms#x`, `/auth/%74erms` and
 * `/auth//terms` are all caught like `/auth/terms`. Backslashes need no
 * folding here: `isSafeRelativePath` has already refused them.
 */
function routedPath(next: string): string {
  const pathname = new URL(next, "https://x.invalid").pathname;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  return decoded.replace(/\/{2,}/g, "/");
}

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Where to go once the password is chosen. A same-origin path only
 * (`isSafeRelativePath`, the one open-redirect gate), never the choose
 * screen or the Terms page themselves (no loops); anything else, or nothing,
 * is `POST_EMAIL_CONFIRM_PATH`, which carries on to school check and
 * onboarding.
 */
export function resolveChooseNext(raw: string | string[] | null | undefined): string {
  const next = Array.isArray(raw) ? raw[0] : raw;
  if (!isSafeRelativePath(next)) return POST_EMAIL_CONFIRM_PATH;
  const path = routedPath(next);
  if (NO_LOOP_PATHS.some((base) => isUnder(path, base))) return POST_EMAIL_CONFIRM_PATH;
  return next;
}

/**
 * `/auth/choose-password?next=…`, with `&again=1` when the sign-up page or the
 * login code box tried to save the password and could not ("your password
 * did not save, type it once more").
 */
export function choosePasswordHref(
  next: string | string[] | null | undefined,
  { again = false }: { again?: boolean } = {},
): string {
  const href = `${CHOOSE_PASSWORD_PATH}?next=${encodeURIComponent(resolveChooseNext(next))}`;
  return again ? `${href}&again=1` : href;
}
