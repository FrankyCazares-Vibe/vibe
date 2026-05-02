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

/** Basic US-style .edu check (IU and partners use subdomains like *.iu.edu). */
export function isEduEmail(email: string): boolean {
  const host = email.split("@")[1]?.toLowerCase().trim() ?? "";
  return host.endsWith(".edu");
}
