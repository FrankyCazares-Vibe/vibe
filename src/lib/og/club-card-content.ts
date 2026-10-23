/**
 * The club's link picture, the pure parts (the club's view, wave 3, B2,
 * Oct 23, 2026; design M_Cards.png, the club card, in landscape): what the
 * picture says for a club, and which picture a club page's link names.
 *
 * Two rules live here so a test can hold them:
 *
 * - A hidden or missing club gets the site's own card, never its name.
 *   `clubCardContent` returns null for both, and the picture route then
 *   draws the generic card (src/lib/og/club-card.tsx), the same bytes for a
 *   hidden club as for a handle nobody registered.
 * - `clubPageMetadata` (the club page's generateMetadata) names the site's
 *   picture outright for a hidden or missing club, on Open Graph AND on X,
 *   and names none for a visible one, so Next uses the segment's own files
 *   (orgs/[handle]/opengraph-image.tsx and twitter-image.tsx). Next only
 *   adds a segment's picture where the page's own block has no `images`
 *   key (resolve-metadata.js, mergeStaticMetadata), so a missing key here
 *   is what lets the club's card through, and a present one is what keeps
 *   it out.
 *
 * The picture shows only what the public club page already shows: the
 * name, the campus, the first line of the bio, the logo and @handle. No
 * counts, no people.
 *
 * PURE ON PURPOSE: no React, no `@/` imports, so club-card-content.test.ts
 * loads it under plain `node --test`. The campus name comes in as an
 * argument (src/lib/iu/campuses.ts is read by the caller).
 */

/** The club row as the picture route reads it. */
export type ClubCardRow = {
  handle: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  backdrop_preset: string | null;
  hidden_at: string | null;
  campus_id: string | null;
};

/** What the club card draws. */
export type ClubCardContent = {
  /** Without the @. */
  handle: string;
  /** The club's name, with a full stop unless it ends in one already. */
  name: string;
  /** "INDIANAPOLIS · CLUB", or "CLUB" for a club with no campus. */
  eyebrow: string;
  /** The bio's first line, cut at a word near BIO_MAX; null when there is none. */
  bio: string | null;
  /** For the tile when there is no logo (or it can't be drawn). */
  initials: string;
  /** The stored `orgs.backdrop_preset`; the renderer paints the default for an unknown key. */
  backdropKey: string | null;
  /** The stored `orgs.logo_url` (an `orgs/…` key or a Supabase https URL), or null. */
  logo: string | null;
  /** The name's type size in px, smaller for a longer name, so it fits in two lines. */
  nameSize: number;
};

/** How much of the bio's first line the card carries (two lines at 32px). */
export const BIO_MAX = 110;

/** share-card.tsx's SHARE_CARD_ALT (a .tsx file, so not imported here). */
const SITE_PICTURE_ALT = "vibe. Your campus. Your people. Yourself.";

/**
 * The site's picture (src/app/opengraph-image.tsx). Add `?v=2` to the
 * address if the card art is ever redrawn.
 */
export const SITE_PICTURE = Object.freeze({
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_PICTURE_ALT,
});

/** "Sixty-Four Chess." but never "Vibe Inc..". */
export function withStop(name: string): string {
  const t = name.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The club header's rule (ClubHeader.tsx): the first letter of the first two words. */
export function clubInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => Array.from(s)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** The bio's first line with text in it, spaces folded, cut at a word with "…". */
export function bioFirstLine(description: string | null | undefined, max: number = BIO_MAX): string | null {
  if (!description) return null;
  const line = description
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const chars = Array.from(line);
  if (chars.length <= max) return line;
  const cut = chars.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  // A word near the end to stop on, else the hard cut.
  const head = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** The name's size: one line for a short name, two at most for the longest (50). */
export function nameSizeFor(name: string): number {
  const n = Array.from(name).length;
  if (n <= 14) return 96;
  if (n <= 26) return 80;
  if (n <= 38) return 68;
  return 58;
}

/**
 * What the club card says, or null for the generic card: no club, a hidden
 * club, or a row with no name to show.
 */
export function clubCardContent(row: ClubCardRow | null, campusName: string | null): ClubCardContent | null {
  if (!row || row.hidden_at) return null;
  const name = row.name?.trim();
  if (!name || !row.handle) return null;
  const shown = withStop(name);
  return {
    handle: row.handle,
    name: shown,
    eyebrow: campusName ? `${campusName.toUpperCase()} · CLUB` : "CLUB",
    bio: bioFirstLine(row.description),
    initials: clubInitials(name),
    backdropKey: row.backdrop_preset,
    logo: row.logo_url,
    nameSize: nameSizeFor(shown),
  };
}

/** The club row as the page's generateMetadata reads it. */
export type ClubMetaRow = {
  name: string;
  description: string | null;
  is_public: boolean | null;
  hidden_at: string | null;
};

const GENERIC = Object.freeze({
  title: "Vibe",
  description: "Vibe is the social app for students at IU and Purdue.",
});

/** The plain preview: the site's words and the site's picture, on both cards. */
function genericPreview(title: string) {
  return {
    title,
    openGraph: { ...GENERIC, images: [{ ...SITE_PICTURE }] },
    twitter: { card: "summary_large_image" as const, ...GENERIC, images: [{ ...SITE_PICTURE }] },
  };
}

/**
 * The club page's metadata (orgs/[handle]/page.tsx). A missing club and a
 * hidden one get the plain preview, which names the site's picture on both
 * cards so the segment's club picture is never used for them (and a hidden
 * club's name never reaches the tab title or a preview). A visible club gets
 * its own words and NO `images` key on either card: the segment's
 * opengraph-image.tsx and twitter-image.tsx fill them with the club's card.
 */
export function clubPageMetadata(org: ClubMetaRow | null) {
  if (!org) return genericPreview("Not found · Vibe");
  if (org.hidden_at) return genericPreview("Vibe");
  const description =
    org.description?.slice(0, 200) || (org.is_public ? "An org on Vibe." : "A private org on Vibe.");
  return {
    title: `${org.name} · Vibe`,
    description,
    openGraph: { title: org.name, description, type: "profile" as const },
    twitter: { card: "summary_large_image" as const, title: org.name, description },
  };
}
