/**
 * The waitlist's manage token (BUILD.md section 3d): the `?token=` in every
 * waitlist email. It opens `/waitlist/confirm`, which shows the person's
 * state, confirms their spot when they tap the button, and takes them off
 * the list when they ask. Only its SHA-256 hex is stored: the confirm email's
 * in `waitlist.manage_token_hash` (a new confirm email replaces it), the
 * access-code email's in `waitlist.invite_token_hash` (a new code replaces
 * it). An invite never replaces the confirm token, so the first email's link
 * keeps showing the person's state.
 *
 * Pure apart from `node:crypto`: no `server-only` and no `@/` imports, so the
 * node test runner can load it. Server code only (the browser never mints or
 * hashes a token).
 */

import { createHash, randomBytes } from "node:crypto";

import type { WaitlistPublicState } from "./types";

/** 32 random bytes = 256 bits, base64url without padding: 43 characters. */
export const MANAGE_TOKEN_BYTES = 32;
const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** A confirm link works for 7 days after the email that carried it. */
export const CONFIRM_WINDOW_DAYS = 7;
const CONFIRM_WINDOW_MS = CONFIRM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** True for a string shaped like a token {@link mintManageToken} makes. */
export function isManageToken(value: unknown): value is string {
  return typeof value === "string" && MANAGE_TOKEN_RE.test(value);
}

/** SHA-256 hex of a well-formed token, or null for anything else. */
export function hashManageToken(token: unknown): string | null {
  if (!isManageToken(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A fresh token and the hash to store. `random` is injectable for tests; the
 * default is `crypto.randomBytes`.
 */
export function mintManageToken(
  random: (n: number) => Uint8Array = randomBytes,
): { token: string; hash: string } {
  const bytes = random(MANAGE_TOKEN_BYTES);
  if (bytes.length < MANAGE_TOKEN_BYTES) {
    throw new Error("mintManageToken: the random source returned too few bytes");
  }
  const token = Buffer.from(bytes.subarray(0, MANAGE_TOKEN_BYTES)).toString("base64url");
  return { token, hash: hashManageToken(token) as string };
}

/**
 * The body of `POST /api/waitlist/status`, `/confirm` and `/leave`:
 * `{ token: string }`. `ok: false` (answer 400) when the body is not an
 * object with a string `token`. A string that is not shaped like a token
 * comes back as `hash: null`: no row can match it, so the route answers
 * "unknown" without reading the database.
 */
export function parseTokenRequest(raw: unknown): { ok: false } | { ok: true; hash: string | null } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const token = (raw as Record<string, unknown>).token;
  if (typeof token !== "string") return { ok: false };
  return { ok: true, hash: hashManageToken(token.trim()) };
}

/** The `waitlist` columns {@link waitlistPublicState} reads. */
export type WaitlistPublicRow = {
  confirmed_at: string | null;
  confirm_sent_at: string | null;
  code_hash: string | null;
  code_expires_at: string | null;
  redeemed_at: string | null;
};

/** True while an unconfirmed row's newest confirm email is under 7 days old. */
export function confirmWindowOpen(row: WaitlistPublicRow, now: Date): boolean {
  if (row.confirmed_at) return false;
  const sent = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : NaN;
  return Number.isFinite(sent) && now.getTime() - sent < CONFIRM_WINDOW_MS;
}

/**
 * What the confirm page may show for a token's row: the state only. No row
 * is "unknown". Joined beats a code, a code beats confirmed, and an
 * unconfirmed row whose email is 7 days old (or was never sent) is
 * "confirm_expired": sending the form again mails a fresh link.
 */
export function waitlistPublicState(row: WaitlistPublicRow | null, now: Date): WaitlistPublicState {
  if (!row) return "unknown";
  if (row.redeemed_at) return "joined";
  if (row.code_hash) {
    const expires = row.code_expires_at ? Date.parse(row.code_expires_at) : NaN;
    return Number.isFinite(expires) && expires > now.getTime() ? "invited" : "invite_expired";
  }
  if (row.confirmed_at) return "waiting";
  return confirmWindowOpen(row, now) ? "unconfirmed" : "confirm_expired";
}
