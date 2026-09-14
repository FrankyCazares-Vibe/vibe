import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Who looked at a post, and who saved it — the owner-only, identity-bearing
 * half of post metrics.
 *
 * WHY THIS FILE EXISTS AT ALL. src/lib/posts/honest-views.ts reads the same
 * ledger, but it states an invariant in its own docblock (honest-views.ts:26-29):
 * `user_id` is used to drop the author's rows and is then thrown away, so no
 * viewer identity can escape through it. That guarantee is worth keeping, so
 * the identity read lives here instead of growing a back door there. Anything
 * that only needs a NUMBER should keep calling honest-views; this file is for
 * the two routes that are allowed to name people:
 * src/app/api/me/posts/[id]/viewers/route.ts and .../savers/route.ts.
 *
 * WHY THE SERVICE ROLE, AND WHY `assertPostOwner` IS NOT OPTIONAL.
 * `post_views` has RLS enabled with ZERO select policies
 * (supabase/migrations/20260508110000_post_views.sql:28), and `bookmarks` is
 * scoped to the owner OF THE BOOKMARK (`bookmarks_all_own`,
 * 20260430190000_phase1_initial_schema.sql:300) — so a post's author reading
 * either table with their cookie client gets an empty list, silently, with no
 * error. Both reads therefore have to use the service role, which means the
 * database is no longer enforcing anything: the ownership check in the calling
 * route IS the security boundary. Call `assertPostOwner` with the COOKIE
 * client first, in the same function, and never let a user id that came out of
 * a service-role query reach a response without it.
 *
 * WHY THE LOADS PAGE. PostgREST truncates at `max_rows = 1000`
 * (supabase/config.toml:18) with no error, so an unpaged row read would
 * silently return a short list — fewer viewers than really exist, presented as
 * the whole truth. Same loop as honest-views.ts:105-139: order by a unique key
 * so the pages form one total order, advance by rows actually returned, and
 * stop on an EMPTY page rather than a short one (a lower deployed cap makes
 * every page short).
 *
 * WHY `{ ok: false }` AND NEVER `[]` ON FAILURE. An empty list renders as
 * "nobody looked". These loaders say "we do not know" instead, and the routes
 * turn that into a 500 — the same call creator-stats makes for the ledger
 * (src/app/api/me/creator-stats/route.ts:136). Design rule: a refused read
 * never paints a 0.
 */

/**
 * Refuse rather than answer from a partial scan. One post's audience is
 * nowhere near this (the whole ledger was 149 rows across 25 posts, measured
 * live 2026-09-12), and creator-stats asks about every post an account owns,
 * which is why this is generous rather than tight.
 *
 * WHY IT IS LOWER THAN honest-views' LEDGER_SCAN_CAP (50,000). Both tables
 * feed the same stats screen, so the asymmetry is deliberate, not an
 * oversight: `post_views` holds one row per person PER DAY, so a popular post
 * accumulates rows every day forever, while `bookmarks` is UNIQUE
 * (user_id, post_id) — one row per person, ever. Ten thousand distinct savers
 * across a pilot account's whole post list is far past anything this campus
 * can produce, whereas the view ledger can reach that from ordinary repeat
 * traffic. If an account ever does trip this, creator-stats 500s as a WHOLE
 * (route.ts:167-170) and the view tiles go with it — so raise this number
 * before that becomes reachable rather than after.
 */
const AUDIENCE_SCAN_CAP = 10_000;

/** Rows per request. The loop stops on an empty page, so this is a ceiling, not an assumption. */
const AUDIENCE_PAGE = 1000;

/** A person who viewed the post, and the last day they did. */
export type PostViewerEntry = {
  user_id: string;
  /** `YYYY-MM-DD`. The ledger stores a DATE — there is no time of day, so
   *  two viewers on the same day have no order between them, and the copy
   *  must say "Tuesday", never "2 hours ago". */
  viewed_on: string;
};

/** A person who saved the post, and when. */
export type PostSaverEntry = {
  user_id: string;
  /** ISO timestamp — `bookmarks.created_at`, a real timestamptz. */
  saved_at: string;
};

/**
 * `ok: false` means the read failed or ran away, NOT that the audience is
 * empty. An empty audience is `{ ok: true, entries: [] }`.
 */
export type AudienceResult<T> = { ok: true; entries: T[] } | { ok: false };

/** One raw bookmark row, author's own saves already dropped. */
export type PostSaveRow = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
};

export type PostOwnerCheck =
  | { ok: true; postId: string; authorId: string }
  /** Missing post OR someone else's post — the caller must not tell them apart. */
  | { ok: false; reason: "not_found" }
  /** The ownership read itself failed; answering would be guessing. */
  | { ok: false; reason: "error" };

/**
 * Is this post the caller's? Pass the COOKIE client — the point is to ask the
 * database as the signed-in user before any service-role read happens.
 *
 * A post that does not exist and a post that belongs to someone else return
 * the same `not_found`, and the routes turn both into a 404. A 403 would
 * confirm that a post id exists and has another owner, which is a fact this
 * feature has no reason to hand out.
 */
export async function assertPostOwner(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
): Promise<PostOwnerCheck> {
  const { data, error } = await supabase
    .from("posts")
    .select("id,user_id")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    // 22P02 is Postgres's "invalid input syntax for type uuid": `posts.id` is a
    // uuid (20260430190000_phase1_initial_schema.sql:49), so a garbage segment
    // — /api/me/posts/banana/viewers, or an id truncated while copying a URL —
    // errors here instead of returning no row. That is the missing-post case,
    // not a server fault, so it gets the same 404 as a post that really is
    // gone. Everything else still says "error", because a check we could not
    // run must not be reported as "no such post".
    if ((error as { code?: string }).code === "22P02") {
      return { ok: false, reason: "not_found" };
    }
    console.error("[post-audience] ownership check", error);
    return { ok: false, reason: "error" };
  }
  const row = data as { id: string; user_id: string } | null;
  if (!row || row.user_id !== userId) return { ok: false, reason: "not_found" };
  return { ok: true, postId: row.id, authorId: row.user_id };
}

/**
 * Everyone who viewed one post, most recent day first, one row per person.
 *
 * `authorId` must come from `assertPostOwner` — the author's own rows are
 * excluded in SQL because 71 pre-guard self-view rows still exist on the live
 * database (the self-view guard, 20260912100500, only stops NEW ones and the
 * old rows were deliberately left alone). Without this the founder's own face
 * would be the first thing in his own viewers list.
 *
 * `hiddenIds` is `loadHiddenUsers(...).hidden.ids` — blocked or muted people
 * are dropped from identity LISTS only. Counts elsewhere are unfiltered on
 * purpose; filtering them would make the list and the number on the same
 * screen disagree.
 */
export async function loadPostViewers(opts: {
  postId: string;
  authorId: string;
  hiddenIds: readonly string[];
}): Promise<AudienceResult<PostViewerEntry>> {
  const { postId, authorId, hiddenIds } = opts;

  if (!isSupabaseServiceConfigured()) {
    console.error(
      "[post-audience] SUPABASE_SERVICE_ROLE_KEY missing — post viewers cannot be read",
    );
    return { ok: false };
  }

  const service = createSupabaseServiceClient();
  type LedgerRow = { user_id: string; viewed_on: string };
  /** user_id -> the most recent day that person looked. */
  const lastSeen = new Map<string, string>();
  let scanned = 0;

  for (;;) {
    const { data, error } = await service
      .from("post_views")
      .select("user_id,viewed_on")
      .eq("post_id", postId)
      // The author's own rows never enter the process, let alone the page.
      .neq("user_id", authorId)
      // Within one post_id the rest of the primary key is (user_id, viewed_on),
      // so this is a unique total order and no row lands in two pages.
      .order("user_id", { ascending: true })
      .order("viewed_on", { ascending: true })
      .range(scanned, scanned + AUDIENCE_PAGE - 1);

    if (error) {
      console.error("[post-audience] viewers", error);
      return { ok: false };
    }

    const page = (data ?? []) as LedgerRow[];
    if (page.length === 0) break;

    for (const r of page) {
      // One row per person: keep the LAST day they looked, so "Tuesday" next
      // to a name is the most recent truth rather than the first sighting.
      const prev = lastSeen.get(r.user_id);
      if (prev === undefined || r.viewed_on > prev) lastSeen.set(r.user_id, r.viewed_on);
    }
    scanned += page.length;

    // Only bail when the page came back FULL — a short page means the table is
    // exhausted, so a post with exactly AUDIENCE_SCAN_CAP rows has been read in
    // its entirety and must not 500 for a scan that finished. (A short page
    // still costs one more round trip to see the empty page; that is the price
    // of breaking on empty rather than short, see the note at the top.)
    if (page.length === AUDIENCE_PAGE && scanned >= AUDIENCE_SCAN_CAP) {
      console.error(
        `[post-audience] viewer scan hit ${AUDIENCE_SCAN_CAP} rows for post ${postId} — refusing to report a partial list`,
      );
      return { ok: false };
    }
  }

  const hidden = new Set(hiddenIds);
  const entries: PostViewerEntry[] = [];
  for (const [user_id, viewed_on] of lastSeen) {
    if (hidden.has(user_id)) continue;
    entries.push({ user_id, viewed_on });
  }
  // Newest day first; user id breaks the tie because the ledger has no time of
  // day, and an arbitrary order would shuffle rows between two pages of the
  // same list.
  entries.sort((a, b) =>
    a.viewed_on === b.viewed_on
      ? a.user_id.localeCompare(b.user_id)
      : b.viewed_on.localeCompare(a.viewed_on),
  );
  return { ok: true, entries };
}

/**
 * Raw bookmark rows for a set of posts, minus each post's own author.
 *
 * Deliberately shaped like `loadHonestViewRows` (same arguments, same
 * "`null` means we do not know" contract) because it answers the same kind of
 * question about the other table: creator-stats needs per-post save tallies
 * across every post an account owns, and the savers route needs one post's
 * rows. Both go through here so there is exactly one service-role read of
 * `bookmarks` that is not scoped to the caller's own saves.
 *
 * `authorByPostId` maps post id -> `posts.user_id`; the caller already has it
 * from the rows it checked ownership on, which keeps this to one query with no
 * join. Excluding the author matches the view numbers: "12 saves" should mean
 * twelve other people, not eleven plus me.
 *
 * `bookmarks` is UNIQUE (user_id, post_id), so within one post these rows are
 * already one per person — no dedupe needed, unlike the per-day view ledger.
 */
export async function loadPostSaveRows(
  postIds: string[],
  authorByPostId: Map<string, string>,
): Promise<PostSaveRow[] | null> {
  if (postIds.length === 0) return [];

  if (!isSupabaseServiceConfigured()) {
    console.error(
      "[post-audience] SUPABASE_SERVICE_ROLE_KEY missing — saves cannot be counted",
    );
    return null;
  }

  const service = createSupabaseServiceClient();
  const kept: PostSaveRow[] = [];
  let scanned = 0;

  for (;;) {
    const { data, error } = await service
      .from("bookmarks")
      .select("id,post_id,user_id,created_at")
      .in("post_id", postIds)
      // Newest save first, id breaking ties — unique, so the pages form one
      // total order and the list ships in the order it was read.
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(scanned, scanned + AUDIENCE_PAGE - 1);

    if (error) {
      console.error("[post-audience] saves", error);
      return null;
    }

    const page = (data ?? []) as PostSaveRow[];
    // Empty, not short — see the paging note at the top of this file.
    if (page.length === 0) break;

    for (const r of page) {
      if (r.user_id !== authorByPostId.get(r.post_id)) kept.push(r);
    }
    scanned += page.length;

    // Full page only — same reason as loadPostViewers: an exactly-full scan is
    // a complete one, and a 500 for a list we finished reading would take the
    // whole stats screen down with it.
    if (page.length === AUDIENCE_PAGE && scanned >= AUDIENCE_SCAN_CAP) {
      console.error(
        `[post-audience] save scan hit ${AUDIENCE_SCAN_CAP} rows for ${postIds.length} posts — refusing to report a partial count`,
      );
      return null;
    }
  }

  return kept;
}

/**
 * Everyone who saved one post, newest save first. Same exclusions as
 * `loadPostViewers`: the author's own bookmark never appears, and blocked or
 * muted people are dropped from the list.
 */
export async function loadPostSavers(opts: {
  postId: string;
  authorId: string;
  hiddenIds: readonly string[];
}): Promise<AudienceResult<PostSaverEntry>> {
  const { postId, authorId, hiddenIds } = opts;

  const rows = await loadPostSaveRows([postId], new Map([[postId, authorId]]));
  if (rows === null) return { ok: false };

  const hidden = new Set(hiddenIds);
  const entries: PostSaverEntry[] = [];
  for (const r of rows) {
    if (hidden.has(r.user_id)) continue;
    entries.push({ user_id: r.user_id, saved_at: r.created_at });
  }
  // Already ordered by the query (created_at desc, id asc); the filter above
  // only removes rows, so the order survives.
  return { ok: true, entries };
}
