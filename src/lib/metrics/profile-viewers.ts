import type { SupabaseClient } from "@supabase/supabase-js";

import { hydrateUserCards, type UserCardData } from "@/lib/connections/queries";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";

/**
 * "Who viewed you" — the one definition of the paid profile-viewer list.
 *
 * Two routes read it and they must never disagree: the first page is what
 * GET /api/me/profile-views returns as `recent` (src/app/api/me/profile-views/route.ts),
 * and every page — including that first one — is what
 * GET /api/me/profile-viewers returns as `users`
 * (src/app/api/me/profile-viewers/route.ts). Two queries with "the same"
 * window and ordering written twice is how a "Show more" ends up repeating
 * or skipping a person, so there is one loader and both call it.
 *
 * OWNER-ONLY, ALWAYS. Every read here is scoped to `userId` and the caller is
 * responsible for having proved that is the signed-in person. RLS
 * `profile_views_owner_select` (supabase/migrations/20260513000000_profile_views_and_user_view_count.sql:47)
 * is the real backstop, which is also why the cookie client is enough and no
 * service role appears in this file: nothing here can read another account's
 * ledger even if a route's entitlement branch were wrong.
 *
 * PEOPLE, NOT VIEWS. The ledger's primary key is
 * (profile_user_id, viewer_user_id, viewed_on), so one person who looked on
 * Monday and again on Thursday is two rows. This list is people: rows are
 * deduped per viewer, keeping the most recent one, so the day label beside a
 * name is the last time they looked. `total` here will therefore be smaller
 * than the `seven_days`/`thirty_days` VIEW tiles next to it, legitimately.
 *
 * NINETY DAYS, UTC. `viewed_on` is a DATE written in UTC, so the window is
 * computed on UTC calendar dates — `today - 89 days`, inclusive of today, is
 * ninety days of dates. Local-time math here would slide the edge by a day for
 * a student looking at 8pm Eastern.
 *
 * HIDDEN PEOPLE ARE FILTERED OUT OF THE LIST, NOT OUT OF THE COUNTS. Someone
 * the owner has blocked or muted should not turn up in a list of names; the
 * tiles keep counting them, because a count that quietly shrinks when you mute
 * someone is a number nobody can reconcile (and `users.profile_view_count`,
 * the all-time tile, cannot be filtered at all).
 *
 * A REFUSED READ RETURNS `null`, NEVER AN EMPTY PAGE. `{ users: [], total: 0 }`
 * reads as "nobody has looked at you", which is a lie a paying account would
 * believe. Callers turn `null` into a 500 and the client shows its own
 * "couldn't load" line.
 */

/**
 * Rows per ledger request, and the same trick as
 * src/lib/posts/honest-views.ts:52 — advance by the rows actually returned and
 * stop on an EMPTY page, not a short one, because a deployed PostgREST row cap
 * below this number makes every page short and stopping there would silently
 * truncate the list.
 */
const LEDGER_PAGE = 1000;

/**
 * Refuse to answer rather than scan the world. Past this many rows we return
 * `null` ("we do not know") instead of a list built from part of the ledger.
 * The primary key allows at most one row per viewer per day, so ninety days
 * hold ~111 distinct viewers per 10,000 rows — orders of magnitude past
 * anything on the pilot campus (the busiest profile had 8 rows all-time,
 * measured 2026-09-12).
 *
 * The cap is a ceiling on what we will scan, not on what we will answer:
 * a window holding EXACTLY this many rows was scanned completely and gets a
 * real list. Only evidence of a row past the cap — see `scanLedger`, which
 * reaches one row beyond it — turns into `null`.
 */
const LEDGER_SCAN_CAP = 10_000;

/** Days of history the paid list covers, counting today. */
const WINDOW_DAYS = 90;

/**
 * A person who looked at you, as a normal people-row plus when they looked.
 *
 * `UserCardData` — not a hand-rolled `{id, handle, name, avatar_url}` — so a
 * viewer row carries `mutual_count` and `follow_state` and renders through the
 * same `UserCard` path as every other list of people, follow button included.
 */
export type ProfileViewerRow = UserCardData & {
  /**
   * `YYYY-MM-DD`, UTC. A date, not a timestamp: say "Tuesday", not "2 hours ago".
   *
   * THIS is the field a day label renders from (`dayLabelFromDate`, UTC
   * calendar). The two fields on one row can name different days — a look at
   * 2026-09-14T01:00Z is `viewed_on` "2026-09-14" but 9pm on the 13th in
   * Eastern time — and this is the day the per-person dedupe actually kept.
   */
  viewed_on: string;
  /**
   * ISO timestamptz of their first look that day. The ordering key.
   *
   * Order by it; do not label from it (see `viewed_on`): reading it in local
   * time would print "Yesterday" beside a row whose date says today.
   */
  first_viewed_at: string;
};

export type ProfileViewersPage = {
  users: ProfileViewerRow[];
  total: number;
  has_more: boolean;
  /**
   * Where the next page starts, counted in PEOPLE CONSUMED from the list — not
   * in rows returned. Hydration can drop an id (deleted or hidden profile), so
   * `users.length` can be smaller than the slice this page consumed; a client
   * that advances by `users.length` re-asks for people it already had, and a
   * page whose ids were all dropped would never advance at all. Page on this.
   */
  next_offset: number;
};

type LedgerRow = {
  viewer_user_id: string;
  viewed_on: string;
  first_viewed_at: string;
};

/** UTC `YYYY-MM-DD` for the first day of the window, inclusive. */
function windowStartUtc(now: Date): string {
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcToday - (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
}

/**
 * One page of "who viewed you", plus the honest total behind it.
 *
 * `null` means the read failed — a query error, a scan past the cap, or an
 * unreadable block/mute list — and the caller must 500 rather than paint a
 * zero. It never means "nobody".
 *
 * `supabase` must be the caller's own cookie client: `users` is readable by
 * any signed-in student and `profile_views` is owner-scoped by RLS, so nothing
 * here needs the service role.
 */
export async function loadProfileViewers(
  supabase: SupabaseClient,
  userId: string,
  opts: { limit: number; offset: number },
  now: Date = new Date(),
): Promise<ProfileViewersPage | null> {
  const since = windowStartUtc(now);

  const [scan, hiddenRes] = await Promise.all([
    scanLedger(supabase, userId, since),
    loadHiddenUsers(supabase, userId),
  ]);
  if (scan === null) return null;
  // A block list we could not read is not an empty block list: showing a
  // blocked person's name is the failure this filter exists to prevent.
  if (!hiddenRes.ok) {
    console.error("[profile-viewers] hidden users", hiddenRes.error);
    return null;
  }

  const hidden = new Set(hiddenRes.hidden.ids);
  // Deduped per person, most recent look first — `scanLedger` already returns
  // the rows in `first_viewed_at desc` order, so the FIRST row seen for a
  // viewer is their latest.
  const seen = new Set<string>();
  const people: LedgerRow[] = [];
  for (const row of scan) {
    if (seen.has(row.viewer_user_id)) continue;
    seen.add(row.viewer_user_id);
    if (hidden.has(row.viewer_user_id)) continue;
    people.push(row);
  }

  const total = people.length;
  const pageRows = people.slice(opts.offset, opts.offset + opts.limit);
  const pageIds = pageRows.map((r) => r.viewer_user_id);
  const lookedOn = new Map(pageRows.map((r) => [r.viewer_user_id, r]));

  // `hydrateUserCards` drops ids with no visible `users` row (deleted or
  // hidden profiles). Those rows leave the page but stay in `total`, so a page
  // can be shorter than `limit` while `has_more` is still true — the same
  // asymmetry the six existing list routes already live with
  // (src/app/api/me/followers/route.ts:66-73). Matching them beats fixing it
  // in one place and leaving the others inconsistent.
  //
  // THE OFFSET IS COUNTED IN PEOPLE CONSUMED, NOT ROWS RENDERED. `has_more`
  // below advances by `pageRows.length` (what this page consumed from the
  // deduped list), which is what a client's next `offset` must be. When
  // hydration drops an id, `users.length < pageRows.length`, so a caller that
  // pages by `rows.length` of what it RENDERED would re-request a person it
  // already has. Every list route in the app pages this way and the drop needs
  // a `users` row to have vanished under a live ledger row
  // (`profile_views.viewer_user_id` is ON DELETE CASCADE and
  // `users_select_authenticated` is USING(true)), so it cannot happen today —
  // but if a future cursor is added here, count consumed rows, not sent ones.
  const cards = await hydrateUserCards(supabase, userId, pageIds);
  const users: ProfileViewerRow[] = cards.flatMap((card) => {
    const row = lookedOn.get(card.id);
    return row ? [{ ...card, viewed_on: row.viewed_on, first_viewed_at: row.first_viewed_at }] : [];
  });

  return {
    users,
    total,
    has_more: opts.offset + pageRows.length < total,
    next_offset: opts.offset + pageRows.length,
  };
}

/**
 * Every ledger row in the window, newest look first. `null` on any failure.
 *
 * The ORDER IS A TOTAL ORDER on purpose. `first_viewed_at` alone is not
 * unique — two people can land in the same millisecond, and two rows for the
 * same person on different days share nothing but it — and PostgREST pages an
 * ambiguous sort by re-running the query per page, so a tie can put one row on
 * two pages and push another off the end entirely. Adding the rest of the
 * primary key makes the pages one sequence.
 *
 * The cap refuses on EVIDENCE OF MORE, not on arithmetic. The last request is
 * allowed to reach exactly one row past `LEDGER_SCAN_CAP`: if that row comes
 * back, the ledger is bigger than we are willing to scan and the answer would
 * be partial, so we return `null`. If it does not, a window of exactly
 * `LEDGER_SCAN_CAP` rows was read in full and deserves a real list — refusing
 * there would 500 both routes forever on complete, readable data.
 */
async function scanLedger(
  supabase: SupabaseClient,
  userId: string,
  since: string,
): Promise<LedgerRow[] | null> {
  const rows: LedgerRow[] = [];
  let scanned = 0;

  for (;;) {
    // Never ask for more than one row past the cap: that row is the evidence,
    // and there is no reason to pay for the rest of the page behind it.
    const end = Math.min(scanned + LEDGER_PAGE, LEDGER_SCAN_CAP + 1) - 1;
    const { data, error } = await supabase
      .from("profile_views")
      .select("viewer_user_id,viewed_on,first_viewed_at")
      .eq("profile_user_id", userId)
      .gte("viewed_on", since)
      .order("first_viewed_at", { ascending: false })
      .order("viewer_user_id", { ascending: true })
      .order("viewed_on", { ascending: true })
      .range(scanned, end);

    if (error) {
      console.error("[profile-viewers] ledger", error);
      return null;
    }

    const page = (data ?? []) as unknown as LedgerRow[];
    if (page.length === 0) break;
    rows.push(...page);
    scanned += page.length;

    if (scanned > LEDGER_SCAN_CAP) {
      console.error(
        `[profile-viewers] ledger scan passed ${LEDGER_SCAN_CAP} rows for one profile — refusing to report a partial list`,
      );
      return null;
    }
  }

  return rows;
}
