/**
 * Club link codes, pure (the club's view, wave 1; handoffs/2026-10-20-club-view/
 * WAVE1-DESIGN.md). Shared by the routes, the pages and the tests, so: no
 * `server-only`, no `node:` imports, erasable TypeScript only (loads under
 * Node's type stripping).
 *
 * A club link is `/c/<code>`: 16 Crockford base32 characters, 80 random bits,
 * opened or scanned, never typed. Only the SHA-256 of `club:` and the 16
 * normalised characters is looked up (`club_links.code_hash`), and the
 * database normalises with `public.club_link_normalize_code`, which follows
 * {@link normalizeClubLinkCode} rule for rule. Change one, change both, and
 * the shared vectors in `code.test.ts` and the POST-CHECK of
 * `supabase/migrations/20261021110000_club_links.sql`.
 */

/** Crockford base32: 0-9 and A-Z without I, L, O and U. */
export const CLUB_LINK_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CLUB_LINK_CODE_LENGTH = 16;

/** The page a link opens: `/c/<code>`. */
export const CLUB_LINK_PATH = "/c";
/** The key in `supabase.auth.signUp` `options.data` the sign-up gate reads. */
export const CLUB_CODE_METADATA_KEY = "club_code";

/** A setup link: works once, for 7 days (Admin › Clubs). */
export const SETUP_LINK_TTL_DAYS = 7;
/** A members' link: ends 3 weeks after it was made, 150 sign-ups. */
export const MEMBERS_LINK_TTL_DAYS = 21;
export const MEMBERS_LINK_MAX_SIGNUPS = 150;

export type ClubLinkKind = "setup" | "members";

const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/;

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A fresh code, normalised (16 characters, no separators). Each random byte
 * keeps its low five bits: 256 is a multiple of 32, so every character is
 * equally likely. `random` is injectable for tests.
 */
export function generateClubLinkCode(
  random: (n: number) => Uint8Array = defaultRandom,
): string {
  const bytes = random(CLUB_LINK_CODE_LENGTH);
  if (bytes.length < CLUB_LINK_CODE_LENGTH) {
    throw new Error("generateClubLinkCode: the random source returned too few bytes");
  }
  let out = "";
  for (let i = 0; i < CLUB_LINK_CODE_LENGTH; i++) {
    out += CLUB_LINK_ALPHABET[bytes[i] & 31];
  }
  return out;
}

/**
 * The 16 characters a code stands for, or null. The steps, identical to
 * `public.club_link_normalize_code`:
 *   1. anything longer than 64 characters is not a code;
 *   2. drop every character that is not an ASCII letter or digit (before
 *      uppercasing);
 *   3. uppercase; 4. O to 0, I and L to 1;
 *   5. the result must be exactly 16 alphabet characters.
 */
export function normalizeClubLinkCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const v = input
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return CODE_RE.test(v) ? v : null;
}

/** The link's path for a normalised code. */
export function clubLinkPath(code: string): string {
  return `${CLUB_LINK_PATH}/${code}`;
}

/** The link as a person shares it: `https://connectvibe.app/c/<code>`. */
export function clubLinkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}${clubLinkPath(code)}`;
}

/**
 * A handle suggested from a club's name, the rules of POST /api/orgs
 * (`/^[a-z0-9][a-z0-9_-]{2,30}$/`): lowercase letters and digits, words
 * joined with nothing, at most 31 characters. Null when nothing usable is left.
 */
export function suggestClubHandle(name: string): string | null {
  const v = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 31);
  return /^[a-z0-9][a-z0-9_-]{2,30}$/.test(v) ? v : null;
}

export const CLUB_HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,30}$/;
