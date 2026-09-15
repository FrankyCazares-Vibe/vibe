import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type SchoolEmailPayload = {
  userId: string;
  email: string;
  exp: number;
};

function getSecret(): string {
  const s = process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error(
      "Set SCHOOL_EMAIL_VERIFY_SECRET (min 16 chars) for .edu verification tokens.",
    );
  }
  return s;
}

export function isSchoolVerifySecretConfigured(): boolean {
  const s = process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim();
  return Boolean(s && s.length >= 16);
}

function encode(payload: SchoolEmailPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decode(b64: string): SchoolEmailPayload | null {
  try {
    const raw = Buffer.from(b64, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as SchoolEmailPayload;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.exp === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function signSchoolEmailToken(
  userId: string,
  email: string,
  ttlSeconds = 60 * 60 * 48,
): string {
  const secret = getSecret();
  const payload: SchoolEmailPayload = {
    userId,
    email: email.toLowerCase().trim(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const nonce = randomBytes(8).toString("base64url");
  const body = `${encode(payload)}.${nonce}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySchoolEmailToken(
  token: string,
): SchoolEmailPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [payloadB64, nonce, sig] = parts;
  if (!payloadB64 || !nonce || !sig) return null;

  const secret = getSecret();
  const body = `${payloadB64}.${nonce}`;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");

  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const payload = decode(payloadB64);
  if (!payload) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/**
 * Typed code for the IU step — the cross-device companion to the link.
 *
 * The link only verifies in a browser signed in as the requesting account
 * (see confirm/route.ts), which fails when the student reads the email in
 * Outlook's in-app browser. The code proves the same thing — the person can
 * read the inbox — and is typed where they are already signed in.
 *
 * Stateless (no table): HMAC over user id + canonical address + a 30-minute
 * window. Verification accepts the current and previous window, so a code
 * lives at least 30 minutes, and a resend inside a window repeats the same
 * code instead of invalidating the old email. Brute force is bounded by the
 * fail-closed limiters on the confirm-code route, not here.
 */
export const SCHOOL_CODE_LENGTH = 8;
export const SCHOOL_CODE_WINDOW_SEC = 1800;

const SCHOOL_CODE_RE = /^\d{8}$/;

function schoolEmailCodeForWindow(
  userId: string,
  email: string,
  windowIndex: number,
): string {
  const digest = createHmac("sha256", getSecret())
    .update(`vibe-school-code-v1|${userId}|${email.toLowerCase().trim()}|${windowIndex}`)
    .digest();
  // 40 bits mod 1e8: the modulo bias is ~1e-4 relative, irrelevant here.
  return String(digest.readUIntBE(0, 5) % 10 ** SCHOOL_CODE_LENGTH).padStart(
    SCHOOL_CODE_LENGTH,
    "0",
  );
}

function currentSchoolCodeWindow(nowSec?: number): number {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  return Math.floor(now / SCHOOL_CODE_WINDOW_SEC);
}

export function schoolEmailCode(
  userId: string,
  email: string,
  nowSec?: number,
): string {
  return schoolEmailCodeForWindow(userId, email, currentSchoolCodeWindow(nowSec));
}

/** Digits only, exactly 8 — callers strip spaces/dashes first. Constant-time compare. */
export function verifySchoolEmailCode(
  userId: string,
  email: string,
  code: string,
  nowSec?: number,
): boolean {
  if (!SCHOOL_CODE_RE.test(code)) return false;
  const w = currentSchoolCodeWindow(nowSec);
  const given = Buffer.from(code, "utf8");
  // Check both windows without short-circuiting so timing doesn't say which matched.
  let ok = false;
  for (const windowIndex of [w, w - 1]) {
    const expected = Buffer.from(
      schoolEmailCodeForWindow(userId, email, windowIndex),
      "utf8",
    );
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      ok = true;
    }
  }
  return ok;
}

// Campus allowlist (SCHOOL_EMAIL_DOMAINS, default iu.edu + iupui.edu). The
// helpers live in a client-safe module; re-exported here so server callers
// keep a single import.
export {
  isSchoolEmail,
  normalizeSchoolEmail,
  schoolEmailDomains,
  schoolEmailDomainsLabel,
  schoolEmailHost,
} from "./school-email-domains";

/**
 * @deprecated Accepts any .edu address. Verification is scoped to the IU
 * allowlist — use `isSchoolEmail` instead. Kept exported for compatibility.
 */
export function isEduEmail(email: string): boolean {
  const host = email.split("@")[1]?.toLowerCase().trim() ?? "";
  return host.endsWith(".edu");
}
