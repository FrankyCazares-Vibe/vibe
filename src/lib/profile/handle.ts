/**
 * Handle validation + reserved list, shared by the availability check
 * and the PATCH /api/me/handle endpoint so they agree on what's legal.
 *
 * Format: 3-20 chars, lowercase letters / digits / underscore. That is the
 * shape of every handle that EXISTS (links, @mentions and routes recognize
 * it). A handle someone CHOOSES now needs 7 or more (Franky, Oct 25 2026):
 * `NEW_HANDLE_MIN`, enforced where a handle changes (changeHandleForUser,
 * the availability check). Keeping your own shorter handle is always fine.
 * Reserved: short list of system / route names that we never want to
 * surface as user handles (https://vibe/admin would be a problem).
 */

export const HANDLE_FORMAT_RE = /^[a-z0-9_]{3,20}$/;

/** The shortest handle anyone can newly choose (existing shorter ones stay). */
export const NEW_HANDLE_MIN = 7;

/** The refusal for a new handle under NEW_HANDLE_MIN. */
export const NEW_HANDLE_TOO_SHORT = `Too short — ${NEW_HANDLE_MIN} characters minimum`;

/**
 * True when `handle` (already through validateHandle) is too short to be
 * newly chosen: under NEW_HANDLE_MIN and not the one the person already has.
 */
export function tooShortForNewHandle(handle: string, current: string | null | undefined): boolean {
  return handle.length < NEW_HANDLE_MIN && handle !== (current ?? "");
}
export const HANDLE_COOLDOWN_DAYS = 14;
export const HANDLE_COOLDOWN_MS = HANDLE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

const RESERVED = new Set([
  "admin",
  "vibe",
  "otto",
  "support",
  "help",
  "api",
  "me",
  "www",
  "root",
  "system",
  "official",
  "staff",
  "team",
  "moderator",
  "mod",
  "test",
  "null",
  "undefined",
  "true",
  "false",
  "delete",
  "edit",
  "settings",
  "profile",
  "messages",
  "campus",
  "feed",
  "network",
  "search",
  "login",
  "signup",
  "logout",
  "auth",
]);

export type HandleValidation =
  | { ok: true; handle: string }
  | { ok: false; reason: string };

/** Normalize + format-check + reserved-check. Does NOT hit the DB. */
export function validateHandle(input: unknown): HandleValidation {
  if (typeof input !== "string") {
    return { ok: false, reason: "Handle is required" };
  }
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: "Handle is required" };
  if (trimmed.length < 3) return { ok: false, reason: "Too short — 3 characters minimum" };
  if (trimmed.length > 20) return { ok: false, reason: "Too long — 20 characters max" };
  if (!HANDLE_FORMAT_RE.test(trimmed)) {
    return {
      ok: false,
      reason: "Letters, numbers, and underscore only",
    };
  }
  if (RESERVED.has(trimmed)) {
    return { ok: false, reason: "That handle is reserved" };
  }
  return { ok: true, handle: trimmed };
}

/**
 * Days remaining on the cooldown clock. NULL `handleChangedAt` means
 * the user has never picked a handle (still on the auto-generated one)
 * — they get a free claim, no cooldown.
 */
export function handleCooldownDaysLeft(handleChangedAt: string | null | undefined): number {
  if (!handleChangedAt) return 0;
  const elapsed = Date.now() - new Date(handleChangedAt).getTime();
  if (elapsed >= HANDLE_COOLDOWN_MS) return 0;
  return Math.ceil((HANDLE_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
}
