/**
 * Clubs on a profile: the flair, the Clubs section, and the rules for a title
 * (club model spec D and E3; Franky's calls, Oct 16 2026).
 *
 * WHAT SHOWS, AND TO WHOM:
 *   - "Member of": every club the person belongs to, unless they hid it
 *     (`org_members.show_on_profile`, on by default) or Vibe hid the club
 *     (`orgs.hidden_at`). Anyone may see it, signed out included, because
 *     profiles are public (Privacy Policy 5a).
 *   - "Following": only the person themselves (`/api/me/clubs`). It never
 *     goes through the public profile loader.
 *   - A role word (Owner, Officer, Mod) never shows. "Owner" only means
 *     whoever made the club on Vibe. A title the officers gave ("President")
 *     shows instead, unless the member hid it (`org_members.show_title`).
 *   - "Member since" is the month they joined on Vibe, shown in the Clubs
 *     section only, never on the chips. It starts again if they leave and
 *     rejoin. Only the month leaves the server, never the day or the time.
 *
 * PURE ON PURPOSE: no imports, so `club-flair.test.ts` loads it under plain
 * `node --test`. The word filter (`moderation/text-filter.ts`) is the route's
 * job; this file checks only shape and the reserved words.
 */

/** Matches the CHECK on `org_members.title`: 1 to 32 characters once trimmed. */
export const CLUB_TITLE_MAX = 32;

/** Matches the CHECK on `org_members.profile_rank`. */
export const PROFILE_RANK_MAX = 50;

/** The most clubs one public profile lists. Nobody is in this many. */
export const MAX_PROFILE_CLUBS = 30;

/** Flair chips under the @handle (the Clubs section lists the rest). */
export const FLAIR_CHIP_MAX = 3;

/** Every campus Vibe serves keeps Indianapolis time (`push/event-notice.ts`). */
const CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis";

/**
 * Words a title may not use, so nobody's flair reads as Vibe speaking (review
 * item 32). Whole words, any case, accents folded: "Vibes Chair" is fine,
 * "Official Photographer" is not. Mirrors `org_members_title_check`
 * (migration 20261017100000), which is the backstop; this check is a little
 * stricter (accents, underscores), never looser.
 */
export const RESERVED_TITLE_WORDS: readonly string[] = Object.freeze([
  "vibe",
  "admin",
  "administrator",
  "moderator",
  "verified",
  "official",
]);

/**
 * Format characters (zero-width marks, direction overrides, soft hyphens):
 * dropped, never stored. All of them, so the database's `[[:cntrl:]]` CHECK
 * never meets one this let through.
 */
const INVISIBLE_OR_BIDI = /\p{Cf}/gu;

/** A line break, a tab or any other control character. */
const CONTROL = /\p{Cc}/u;

export type TitleRefusal = "title_invalid" | "title_too_long" | "title_reserved";

export type TitleCheck =
  | { ok: true; title: string | null }
  | { ok: false; code: TitleRefusal; error: string };

/** The refusal lines, in the house voice. */
export const TITLE_ERRORS: Readonly<Record<TitleRefusal, string>> = Object.freeze({
  title_invalid: "A title is one line of text.",
  title_too_long: `Keep a title to ${CLUB_TITLE_MAX} characters.`,
  title_reserved: "A title can't use Vibe, Admin, Moderator, Verified or Official.",
});

function refuse(code: TitleRefusal): TitleCheck {
  return { ok: false, code, error: TITLE_ERRORS[code] };
}

/** Lower case with accents folded, for the reserved-word check only. */
function folded(text: string): string {
  return text.normalize("NFKD").replace(/\p{Mn}+/gu, "").toLowerCase();
}

/**
 * A title from a request body. `null`, `""` and blank text clear it. A title
 * keeps its own capitals; runs of spaces become one. The length counts
 * characters the way Postgres does (code points), so the CHECK never sees
 * one this passed.
 */
export function normalizeClubTitle(raw: unknown): TitleCheck {
  if (raw === null) return { ok: true, title: null };
  if (typeof raw !== "string") return refuse("title_invalid");
  const stripped = raw.replace(INVISIBLE_OR_BIDI, "");
  if (CONTROL.test(stripped)) return refuse("title_invalid");
  const title = stripped.replace(/\s+/g, " ").trim();
  if (!title) return { ok: true, title: null };
  if (Array.from(title).length > CLUB_TITLE_MAX) return refuse("title_too_long");
  const words = folded(title).split(/[^\p{L}\p{N}]+/u);
  if (words.some((w) => RESERVED_TITLE_WORDS.includes(w))) return refuse("title_reserved");
  return { ok: true, title };
}

/** A stored title as it may be shown: a non-blank string, or null. */
export function storedClubTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  return title ? title : null;
}

/** `profile_rank` from a request body: null clears it, else a whole number 0 to 50. */
export function parseProfileRank(
  raw: unknown,
): { ok: true; rank: number | null } | { ok: false } {
  if (raw === null) return { ok: true, rank: null };
  if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false };
  if (raw < 0 || raw > PROFILE_RANK_MAX) return { ok: false };
  return { ok: true, rank: raw };
}

const MONTH_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

/** `joined_at` as `"2026-09"` in campus time, or null when it isn't a date. */
export function memberSinceMonth(joinedAt: unknown): string | null {
  if (typeof joinedAt !== "string" || !joinedAt) return null;
  const ms = Date.parse(joinedAt);
  if (!Number.isFinite(ms)) return null;
  const parts = MONTH_PARTS.formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
}

// The words for a month ("Member since Sep 2026") are the profile's own,
// `memberSinceText` in src/components/profile/clubs-model.ts: one formatter
// (wave-2 repair, finding 22). This module sends the month as "2026-09".

/** A chip's words: "President · SAE" with a title, otherwise just "SAE". */
export function clubFlairLabel(name: string, title: string | null | undefined): string {
  const t = storedClubTitle(title);
  return t ? `${t} · ${name}` : name;
}

// ── The public list ─────────────────────────────────────────────────────────

/** One `org_members` row the profile loader read (`show_on_profile` already true). */
export type ShownClubRow = {
  org_id: string;
  title?: unknown;
  /** The member's own switch; false keeps the title off their profile. */
  show_title?: unknown;
  profile_rank?: unknown;
  joined_at?: unknown;
};

/** A visible club, its logo already proxied (`orgAssetProxyUrl`). */
export type ProfileClubCard = {
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
};

/** One club on a public profile. Everything here is public. */
export type PublicProfileClub = ProfileClubCard & {
  /** The title the officers gave, e.g. "President", or null. */
  title: string | null;
  /** The month they joined on Vibe, `"2026-09"`, or null. */
  since: string | null;
};

function rankOf(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

function joinedMs(raw: unknown): number {
  const ms = typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * The order a profile lists clubs in: the person's own order first (a rank,
 * smallest first; no rank goes last), then the club they joined first, then
 * by name so the order never wobbles between loads.
 */
export function compareProfileClubs(
  a: { profile_rank?: unknown; joined_at?: unknown; name: string },
  b: { profile_rank?: unknown; joined_at?: unknown; name: string },
): number {
  const ra = rankOf(a.profile_rank);
  const rb = rankOf(b.profile_rank);
  if (ra !== rb) {
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  }
  const ja = joinedMs(a.joined_at);
  const jb = joinedMs(b.joined_at);
  if (ja !== jb) return ja < jb ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * The public "Member of" list. A row whose club is missing from `cards` (Vibe
 * hid it, or it was deleted) is dropped, so a hidden club and a deleted one
 * look the same. A title the member hid is left out. Nothing about the
 * person's role leaves.
 */
export function buildPublicProfileClubs(
  rows: readonly ShownClubRow[],
  cards: ReadonlyMap<string, ProfileClubCard>,
  limit: number = MAX_PROFILE_CLUBS,
): PublicProfileClub[] {
  const seen = new Set<string>();
  const joined: { row: ShownClubRow; card: ProfileClubCard; name: string }[] = [];
  for (const row of rows) {
    const card = cards.get(row.org_id);
    if (!card || seen.has(row.org_id)) continue;
    seen.add(row.org_id);
    joined.push({ row, card, name: card.name });
  }
  joined.sort((a, b) =>
    compareProfileClubs(
      { profile_rank: a.row.profile_rank, joined_at: a.row.joined_at, name: a.name },
      { profile_rank: b.row.profile_rank, joined_at: b.row.joined_at, name: b.name },
    ),
  );
  return joined.slice(0, Math.max(0, limit)).map(({ row, card }) => ({
    handle: card.handle,
    name: card.name,
    logo_url: card.logo_url,
    verified: card.verified,
    title: row.show_title === false ? null : storedClubTitle(row.title),
    since: memberSinceMonth(row.joined_at),
  }));
}

/**
 * The chips under the @handle: up to {@link FLAIR_CHIP_MAX}, clubs with a
 * title first, each group keeping the profile's order.
 */
export function flairChips<T extends { title: string | null }>(
  clubs: readonly T[],
  max: number = FLAIR_CHIP_MAX,
): T[] {
  const titled = clubs.filter((c) => storedClubTitle(c.title) !== null);
  const plain = clubs.filter((c) => storedClubTitle(c.title) === null);
  return [...titled, ...plain].slice(0, Math.max(0, max));
}
