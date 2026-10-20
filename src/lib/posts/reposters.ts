/**
 * "Reposted by" (Franky's critique, Oct 19, 2026, decision 1a): who reposted
 * a post, the way the viewer is allowed to see it. Counts public, identities
 * private: the list NAMES only the people the viewer follows, and everyone
 * else is a number ("+ 12 others reposted"). That is the same rule the feed's
 * "Maya and 6 others reposted" line already follows (/api/feed
 * loadFriendReposters), so the line and the list can never disagree about who
 * gets named.
 *
 * The route is GET /api/posts/[id]/reposters; the screens are
 * src/components/feed/RepostersSheet.tsx (phone) and RepostersPopover.tsx
 * (desktop). This file holds the parts with no database in them, so
 * `node --test` loads it with type stripping alone: no `@/` imports.
 *
 * Privacy Policy: "Your comments and reposts" and "The people you follow and
 * who follows you" are visible to any signed-in account (sections-4-5.tsx),
 * so naming a followed reposter and saying whether they follow you back needs
 * no policy change. Naming people the viewer does NOT follow would be allowed
 * too, but Franky chose not to (decision 1a): it would be a new surface.
 */

const lower = (s: string) => s.toLowerCase();

/** The most people one answer names. Past this the rest are still counted (in `followed_total`). */
export const MAX_NAMED_REPOSTERS = 100;

/**
 * The most repost rows the route reads for one post, newest first. 1,000 is
 * the real ceiling, not a choice: PostgREST's `max_rows` is 1000
 * (supabase/config.toml, and Supabase's hosted default) and it cuts any
 * larger `.limit()` to 1000 without a word. It said 2,000 until Oct 19, 2026
 * (review of B2), which no read could ever return. A post with more reposts
 * than this names only the followed people among its newest 1,000; the rest
 * are still in the number.
 */
export const MAX_REPOST_ROWS = 1000;

/**
 * How many reposter ids one follow check asks about. The route asks
 * `connections` "which of THESE do I follow?" (`.in()` of the reposters)
 * instead of reading the viewer's whole follow list, which past 1,000 follows
 * came back as an arbitrary, unordered 1,000 (max_rows again), so two opens
 * of one list could name different people (Oct 19, 2026). 100 uuids keep each
 * URL near 4 KB; a typical post needs one ask, a full 1,000 needs ten, sent
 * together.
 */
export const FOLLOW_CHECK_CHUNK = 100;

/**
 * The people who reposted, other than the viewer, each once, in the rows'
 * order (lower case, as Postgres returns uuids), cut into asks of `size` for
 * the follow check. A malformed row is skipped.
 */
export function reposterIdChunks(rows: unknown, viewerId: string, size = FOLLOW_CHECK_CHUNK): string[][] {
  if (!Array.isArray(rows)) return [];
  const me = lower(viewerId);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row && typeof row === "object" ? (row as { user_id?: unknown }).user_id : null;
    if (typeof id !== "string" || !id) continue;
    const key = lower(id);
    if (key === me || seen.has(key)) continue;
    seen.add(key);
    ids.push(key);
  }
  const step = Math.max(1, Math.trunc(size));
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += step) out.push(ids.slice(i, i + step));
  return out;
}

/** One person the list names: someone the viewer follows who reposted the post. */
export type NamedReposter = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  /** They follow the viewer back, so the button reads Connected ✓, not Following ✓. */
  follows_you: boolean;
};

/**
 * The route's answer (the contract B1 builds on):
 *   - `followed`: the named people, newest repost first;
 *   - `followed_total`: how many people the viewer follows reposted it (equal
 *     to `followed.length` unless more than MAX_NAMED_REPOSTERS did);
 *   - `others_total`: everyone else, as a number. Never below 0. The viewer's
 *     own repost is not in it: `viewer_reposted` says that one;
 *   - `total`: the post's repost count as this answer read it, the viewer's
 *     own included (added Oct 19, 2026, review of B2). It is the number the
 *     feed's line must count from, so "Maya and 14 others reposted" and the
 *     list's "+ 12 others reposted" mean the same group: everyone the words
 *     on screen haven't named. The line's "N others" is `total` minus the
 *     people the line names, never the followed count minus one.
 */
export type RepostersAnswer = {
  followed: NamedReposter[];
  followed_total: number;
  others_total: number;
  viewer_reposted: boolean;
  total: number;
};

export type RepostersResponse = { ok: true } & RepostersAnswer;

/** A count as a whole number: NaN, negatives, non-finite or missing → 0. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}


/**
 * Of a post's repost rows (`{ user_id, created_at }`, as the service read
 * returns them), the people the viewer may see named, newest first: someone
 * the viewer follows, not blocked either way or muted (`hidden`), and not the
 * viewer. Each person once. A malformed row is skipped. Ids compare in lower
 * case (Postgres returns uuids in lower case; a set built elsewhere might not).
 */
export function followedReposterIds(
  rows: unknown,
  follows: Iterable<string>,
  hidden: Iterable<string>,
  viewerId: string,
): string[] {
  if (!Array.isArray(rows)) return [];
  const followSet = new Set(Array.from(follows, lower));
  const hiddenSet = new Set(Array.from(hidden, lower));
  const me = lower(viewerId);
  const picked: { id: string; at: number }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { user_id?: unknown; created_at?: unknown };
    if (typeof r.user_id !== "string" || !r.user_id) continue;
    const id = lower(r.user_id);
    if (id === me || seen.has(id) || !followSet.has(id) || hiddenSet.has(id)) continue;
    seen.add(id);
    const at = typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN;
    picked.push({ id: r.user_id, at: Number.isFinite(at) ? at : 0 });
  }
  // The read is already newest first; sorted again so the order never rests
  // on the query alone. A stable sort keeps the read's order for equal times.
  picked.sort((a, b) => b.at - a.at);
  return picked.map((p) => p.id);
}

/**
 * The answer, from what the route read:
 *   - `repostCount`: the post's repost total (the count RPC, the same number
 *     the post shows), the viewer's own repost included;
 *   - `followedIds`: followedReposterIds' list, newest first;
 *   - `users`: the profile rows read for the first MAX_NAMED_REPOSTERS of them;
 *   - `followsYou`: which of those follow the viewer back.
 *
 * Someone whose profile row didn't come back (deleted a moment ago) is not
 * named, and so falls into `others_total`: a number is never wrong to show,
 * a name might be. `others_total` is clamped at 0, because the count and the
 * rows are two reads and a repost can land or leave between them.
 */
export function shapeReposters(input: {
  repostCount: unknown;
  followedIds: readonly string[];
  users: unknown;
  followsYou: Iterable<string>;
  viewerReposted: boolean;
  maxNamed?: number;
}): RepostersAnswer {
  const maxNamed = Math.max(0, Math.trunc(input.maxNamed ?? MAX_NAMED_REPOSTERS));
  const byId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(input.users)) {
    for (const row of input.users) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string" && id) byId.set(lower(id), row as Record<string, unknown>);
    }
  }
  const back = new Set(Array.from(input.followsYou, lower));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  const slice = input.followedIds.slice(0, maxNamed);
  const followed: NamedReposter[] = [];
  for (const id of slice) {
    const u = byId.get(lower(id));
    if (!u) continue;
    followed.push({
      id: String(u.id),
      name: str(u.name),
      handle: str(u.handle),
      avatar_url: str(u.avatar_url),
      follows_you: back.has(lower(id)),
    });
  }
  const followedTotal = followed.length + Math.max(0, input.followedIds.length - maxNamed);
  const total = toCount(input.repostCount);
  const others = total - followedTotal - (input.viewerReposted ? 1 : 0);
  return {
    followed,
    followed_total: followedTotal,
    others_total: Math.max(0, others),
    viewer_reposted: input.viewerReposted,
    total,
  };
}

/**
 * The words around the list, on the phone and on desktop alike:
 *   - `you`: "You reposted this." when the viewer did;
 *   - `others`: the number line. "+ 12 others reposted" under named people
 *     (or under "You"), "12 people reposted this" when nobody is named;
 *   - `note`: why there are no names, shown only when nobody is named but
 *     people did repost: names show only for people you follow;
 *   - `empty`: "No reposts yet." when there is nothing at all.
 * `followed_total` past the named rows (more than MAX_NAMED_REPOSTERS) joins
 * the number, so the words always add up to the post's total.
 */
export function repostersCopy(a: RepostersAnswer): {
  you: string | null;
  others: string | null;
  note: string | null;
  empty: string | null;
} {
  const named = a.followed.length;
  const unnamed = Math.max(0, a.followed_total - named) + Math.max(0, a.others_total);
  const you = a.viewer_reposted ? "You reposted this." : null;
  if (named === 0 && unnamed === 0) {
    return { you, others: null, note: null, empty: a.viewer_reposted ? null : "No reposts yet." };
  }
  if (unnamed === 0) return { you, others: null, note: null, empty: null };
  const anyoneShown = named > 0 || a.viewer_reposted;
  const others = anyoneShown
    ? `+ ${unnamed} ${unnamed === 1 ? "other" : "others"} reposted`
    : `${unnamed} ${unnamed === 1 ? "person" : "people"} reposted this`;
  const note = named === 0 ? "You see names only for people you follow." : null;
  return { you, others, note, empty: null };
}
