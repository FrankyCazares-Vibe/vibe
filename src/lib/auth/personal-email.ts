import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { isSchoolEmail } from "@/lib/auth/school-email-domains";

/**
 * The personal email an account can add after sign-up (school email first,
 * S75): "so you keep your account after you graduate". Proven with an
 * 8-digit code sent to it, the same stateless scheme as the school code
 * (school-email-token.ts): HMAC over the account, the address and a
 * 30-minute window, checked for the current window and the one before. A
 * resend inside a window repeats the code; guesses are bounded by the
 * confirm route's fail-closed limiters, not here.
 *
 * Its own label, so a school code is never a personal code for the same
 * account and address.
 */

export const PERSONAL_CODE_LENGTH = 8;
export const PERSONAL_CODE_WINDOW_SEC = 1800;

const LABEL = "vibe-personal-code-v1";
const CODE_RE = /^\d{8}$/;
const ADDRESS_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function secret(): string {
  const s = process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim();
  if (!s || s.length < 16) throw new Error("Set SCHOOL_EMAIL_VERIFY_SECRET (min 16 chars) for email codes.");
  return s;
}

/**
 * The address as it is stored (trimmed, lowercased), or null when it is not
 * one. A school address is refused by the caller, not here.
 */
export function normalizePersonalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !ADDRESS_RE.test(email)) return null;
  return email;
}

/** A personal address is anything that is not a school one: that is the point of it. */
export function isSchoolAddress(email: string): boolean {
  return isSchoolEmail(email);
}

function codeForWindow(userId: string, email: string, windowIndex: number): string {
  const digest = createHmac("sha256", secret()).update(`${LABEL}|${userId}|${email}|${windowIndex}`).digest();
  return String(digest.readUIntBE(0, 5) % 10 ** PERSONAL_CODE_LENGTH).padStart(PERSONAL_CODE_LENGTH, "0");
}

const windowNow = (nowSec?: number) => Math.floor((nowSec ?? Math.floor(Date.now() / 1000)) / PERSONAL_CODE_WINDOW_SEC);

/** The code to email. `email` is `normalizePersonalEmail` output. */
export function personalEmailCode(userId: string, email: string, nowSec?: number): string {
  return codeForWindow(userId, email, windowNow(nowSec));
}

/** Digits only, exactly 8 (callers strip spaces and dashes first). Constant-time; both windows always checked. */
export function verifyPersonalEmailCode(userId: string, email: string, code: string, nowSec?: number): boolean {
  if (!CODE_RE.test(code)) return false;
  const w = windowNow(nowSec);
  const given = Buffer.from(code, "utf8");
  let ok = false;
  for (const index of [w, w - 1]) {
    const expected = Buffer.from(codeForWindow(userId, email, index), "utf8");
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}
