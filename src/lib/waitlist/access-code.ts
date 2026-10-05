/**
 * Waitlist access codes, pure (BUILD.md section 3c). Shared by the server
 * routes, the sign-up page and the tests, so: no `server-only`, no `node:`
 * imports, erasable TypeScript only (loads under Node's type stripping).
 *
 * A code is "VIBE-" plus 8 Crockford base32 characters, shown as
 * `VIBE-7KQ2-M9XD`: 40 random bits, no I, L, O or U. Only the SHA-256 of the
 * 8 normalised characters is stored (`waitlist.code_hash`), and the database
 * hook normalises a typed code with `public.waitlist_normalize_code`, which
 * follows {@link normalizeAccessCode} rule for rule. Change one, change both,
 * and the shared vectors in `access-code.test.ts` and
 * `scripts/sql/waitlist-gate-check.sql` (S3).
 */

/** Crockford base32: 0-9 and A-Z without I, L, O and U. */
export const ACCESS_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ACCESS_CODE_LENGTH = 8;
export const ACCESS_CODE_TTL_DAYS = 14;
export const ACCESS_CODE_PREFIX = "VIBE";

/**
 * The sign-up link's query parameter. Never `code`: supabase-js reads any
 * `?code=` as a PKCE sign-in callback when a code verifier is stored.
 */
export const ACCESS_CODE_URL_PARAM = "access_code";
/** The key in `supabase.auth.signUp` `options.data` the hook reads. */
export const ACCESS_CODE_METADATA_KEY = "access_code";
/**
 * Tests and the dev `?signup=closed` view set this in `options.data` to make
 * the hook act as if sign-up were closed. It can only make the gate
 * stricter; it never opens anything.
 */
export const GATE_PROBE_METADATA_KEY = "vibe_gate_probe";

const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A fresh code, formatted (`VIBE-XXXX-XXXX`). Each random byte keeps its low
 * five bits: 256 is a multiple of 32, so every character is equally likely.
 * `random` is injectable for tests; the default is Web Crypto, which works in
 * the browser and in Node.
 */
export function generateAccessCode(
  random: (n: number) => Uint8Array = defaultRandom,
): string {
  const bytes = random(ACCESS_CODE_LENGTH);
  if (bytes.length < ACCESS_CODE_LENGTH) {
    throw new Error("generateAccessCode: the random source returned too few bytes");
  }
  let raw = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    raw += ACCESS_CODE_ALPHABET[bytes[i] & 31];
  }
  return formatAccessCode(raw);
}

/**
 * The 8 characters a typed code stands for, or null. Forgiving the way a
 * person types: case, spaces, hyphens and any other punctuation are ignored,
 * a leading `VIBE` is dropped, and O reads as 0, I and L as 1.
 *
 * The steps, identical to `public.waitlist_normalize_code`:
 *   1. drop every character that is not an ASCII letter or digit
 *      (done BEFORE uppercasing, so no non-ASCII letter can uppercase into
 *      an ASCII one in one language and not the other);
 *   2. uppercase;
 *   3. if 12 characters long and starting with VIBE, drop those 4;
 *   4. O to 0, I and L to 1;
 *   5. the result must be exactly 8 alphabet characters.
 */
export function normalizeAccessCode(input: string): string | null {
  if (typeof input !== "string") return null;
  let v = input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (v.length === ACCESS_CODE_LENGTH + ACCESS_CODE_PREFIX.length && v.startsWith(ACCESS_CODE_PREFIX)) {
    v = v.slice(ACCESS_CODE_PREFIX.length);
  }
  v = v.replace(/O/g, "0").replace(/[IL]/g, "1");
  return CODE_RE.test(v) ? v : null;
}

/**
 * A code cut short: text that starts with the letters VIBE and has fewer
 * than 12 letters and digits, like `VIBE-7KQ2` from a link that lost its
 * end. Counted the way {@link normalizeAccessCode} counts (ASCII letters and
 * digits only, any case).
 */
export function isUnfinishedAccessCode(input: string): boolean {
  if (typeof input !== "string") return false;
  const v = input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return v.startsWith(ACCESS_CODE_PREFIX) && v.length < ACCESS_CODE_LENGTH + ACCESS_CODE_PREFIX.length;
}

/**
 * What the sign-up page makes of a typed or linked code: the 8 characters,
 * or null. {@link normalizeAccessCode} plus one rule the page alone has (the
 * database does not): an unfinished code is not a code. Without it the 8
 * characters of `VIBE-7KQ2` read as a whole code, the I as a 1 (`V1BE7KQ2`),
 * and the person is shown, and sends, a code they never had.
 *
 * The one full code this turns away is one whose own 8 characters start
 * V1BE, typed with the letter I and without the prefix. Typed in full
 * (`VIBE-VIBE-7KQ2`) or with the digit (`V1BE-7KQ2`) it still reads.
 */
export function readTypedAccessCode(input: string): string | null {
  return isUnfinishedAccessCode(input) ? null : normalizeAccessCode(input);
}

/** `7KQ2M9XD` to `VIBE-7KQ2-M9XD`. Takes the output of {@link normalizeAccessCode}. */
export function formatAccessCode(normalized: string): string {
  return `${ACCESS_CODE_PREFIX}-${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}
