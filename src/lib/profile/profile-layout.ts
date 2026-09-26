/**
 * The profile layout document (S67 wave 2, contracts C3): which of the six
 * profile widgets a student shows, in what order, and whether the bio is
 * docked to the side column on the desktop page.
 *
 * Stored as `public.users.profile_layout` (jsonb, default `'{}'`, service
 * role only — migration 20260926100000). Written by POST /api/me/profile-sync
 * (desktop) and PATCH /api/me/profile (phone) under the key `profile_layout`,
 * read back by both bootstraps as `vibeUser.profileLayout`. The sanitizer
 * runs on every write AND on every read (`normalizeProfileView`), so the
 * legacy page and the phone only ever see a full document of known ids —
 * never a partial, never a string they didn't expect.
 *
 * Not widgets, never in here: the header (cover, avatar, stats, name, handle,
 * tagline, meta, Here for, interest tags), the pinned post, the Otto hero.
 * `posts` can be moved but never hidden: it is the profile.
 *
 * How the surfaces read `order` (contracts C3):
 *   * desktop LEFT = order minus resume / working_on (minus bio when
 *     bioSide); RIGHT = (bio when bioSide) + resume, working_on, in order;
 *   * phone: the header keeps bio whatever bioSide says; the Portfolio tab
 *     renders order filtered to working_on, experience, skills, resume; the
 *     Posts tab is posts.
 *
 * Pure: zero imports. node:test loads it through a dynamic ".ts" import.
 */

export type WidgetId = "bio" | "experience" | "skills" | "working_on" | "resume" | "posts";

export type ProfileLayout = {
  v: 1;
  /** Every widget id exactly once; the surfaces derive columns and tabs from it. */
  order: WidgetId[];
  /** Widgets the owner hid. Never `posts`. A view flag: hiding deletes nothing. */
  hidden: WidgetId[];
  /** Desktop only: the bio card sits at the top of the side column. The phone ignores it. */
  bioSide: boolean;
};

/**
 * The six ids in the default order — today's desktop markup, left column
 * (bio, experience, skills, posts) then right (resume, working_on).
 */
export const WIDGET_IDS: readonly WidgetId[] = Object.freeze([
  "bio",
  "experience",
  "skills",
  "posts",
  "resume",
  "working_on",
] as const);

/**
 * What `'{}'` in the column means. Deep-frozen: a caller that wants to change
 * a layout starts from `sanitizeProfileLayout(...)`, which always hands back
 * fresh arrays.
 */
export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = Object.freeze({
  v: 1 as const,
  order: Object.freeze([...WIDGET_IDS]) as WidgetId[],
  hidden: Object.freeze([] as WidgetId[]) as WidgetId[],
  bioSide: false,
});

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGET_IDS as readonly string[]).includes(value);
}

/** Known ids only, first occurrence wins, in the order given. `[]` for a non-array. */
function knownIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  const out: WidgetId[] = [];
  for (const item of value) {
    if (isWidgetId(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Coerce anything (a stored jsonb, a request body, `undefined` from a select
 * that didn't ask) into a FULL layout document:
 *   * not a plain object → the default;
 *   * `order` → known ids in the order given, deduped, then every missing id
 *     appended in default order, so all six are always present;
 *   * `hidden` → known ids minus `posts`, deduped;
 *   * `bioSide` → `=== true`, anything else false;
 *   * `v` is not read: whatever came in, what goes out is v1.
 * The arrays are always new, so a caller may reorder them in place.
 */
export function sanitizeProfileLayout(raw: unknown): ProfileLayout {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { v: 1, order: [...WIDGET_IDS], hidden: [], bioSide: false };
  }
  const doc = raw as Record<string, unknown>;
  const order = knownIds(doc.order);
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);
  const hidden = knownIds(doc.hidden).filter((id) => id !== "posts");
  return { v: 1, order, hidden, bioSide: doc.bioSide === true };
}

/** True when nothing differs from `DEFAULT_PROFILE_LAYOUT` (the phone sheet's "Back to the default order" state). */
export function isDefaultLayout(l: ProfileLayout): boolean {
  return (
    !l.bioSide &&
    l.hidden.length === 0 &&
    l.order.length === WIDGET_IDS.length &&
    l.order.every((id, i) => id === WIDGET_IDS[i])
  );
}
