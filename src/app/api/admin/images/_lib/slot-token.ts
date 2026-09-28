import { createHash } from "node:crypto";

/**
 * The "what you looked at" token of one photo slot (S67 security wave 2,
 * wave B follow-up P2; review-B1 should-fix "stale panel").
 *
 * The Photos panel can sit open for minutes. If the student sets a new photo
 * in the meantime, a Take down pressed on the old view would act on the NEW
 * picture, which the moderator never saw. So GET /api/admin/images hands back
 * a token per slot (a hash of the slot's value as it was read), the panel
 * sends it with Take down, and the remove route answers 409 when the slot's
 * value no longer hashes to it.
 *
 * Not a secret and not a permission: only platform admins reach these routes,
 * and the token only says "this is the value I was shown". The value is the
 * slot's comparable form (the column text, or the logos key), `null` when the
 * slot is empty. Bound to the target and slot, so a token from one slot or
 * account never matches another.
 *
 * Only node:crypto is imported, so node:test loads it directly.
 */

const TOKEN_LEN = 32;

export function slotToken(type: string, id: string, slot: string, value: string | null | undefined): string {
  const input = JSON.stringify([type, id, slot, value ?? null]);
  return createHash("sha256").update(input).digest("hex").slice(0, TOKEN_LEN);
}

/** A token as the panel sends it: 32 lower-case hex characters. */
export function isSlotToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/** Does the slot still hold what the moderator was shown? */
export function slotStillMatches(
  expected: string,
  type: string,
  id: string,
  slot: string,
  value: string | null | undefined,
): boolean {
  return expected === slotToken(type, id, slot, value);
}

export const STALE_PANEL_MESSAGE = "This photo changed since you opened the panel. Refresh and look again.";
