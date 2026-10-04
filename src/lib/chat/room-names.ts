/**
 * The name of an extra room, as it is stored and as it is shown
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4c.3, decision C14).
 *
 * STORED NAMES STAY SLUGS. The create and rename routes take only
 * `^[a-z0-9][a-z0-9_-]{1,30}$` (`api/orgs/[slug]/channels/route.ts`), and old
 * desktop prints the name as `#exec-only`. The new screens show the same room
 * as `Exec only` (`roomDisplayName`), and the Rooms dialog turns the words an
 * officer types into the slug the route accepts (`roomSlug`).
 *
 * Pure: no import, so every screen and `node --test` can load it. Never used
 * on an event chat's name (that is the event's title, shown as written).
 */

/** The rule the two room routes hold a name to. */
const ROOM_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;

/** The longest name the rule lets through. */
const ROOM_SLUG_MAX = 31;

/**
 * A stored room name as words: every run of "-" and "_" becomes one space,
 * the first letter is upper-cased, the rest is left as it was written.
 * `exec-only` -> `Exec only`, `Alumni` -> `Alumni`, `` -> ``.
 *
 * A space left at either end (a name that began or ended with a dash) is
 * dropped, so applying it twice gives what applying it once gave.
 */
export function roomDisplayName(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The slug for what a person typed, or null when no slug the routes accept
 * can be made of it: trimmed, lower-cased, every run of anything outside
 * `[a-z0-9_-]` turned into one "-", the dashes at both ends dropped, cut to
 * 31 characters. `Exec only` -> `exec-only`, `Rush Chairs!` -> `rush-chairs`,
 * `a` -> null (two characters at least), `!!!` -> null.
 */
export function roomSlug(input: string): string | null {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ROOM_SLUG_MAX);
  return ROOM_SLUG_RE.test(slug) ? slug : null;
}
