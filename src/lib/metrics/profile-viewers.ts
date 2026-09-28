import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hydrateUserCards, type UserCardData } from "@/lib/connections/queries";
import { pageAudience, splitAudience } from "@/lib/metrics/audience-split";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

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
 * SERVER-ONLY LEDGER, AND THE CALLER IS THE BOUNDARY (security report
 * 2026-09-27 #17). The owner used to read their own `profile_views` rows
 * through RLS `profile_views_owner_select`, which meant any signed-in student
 * could skip the paywall and pull their full named viewer history straight
 * from the data API. Migration 20260928140000_profile_views_server_only drops
 * that policy and revokes the table from anon/authenticated, so the ledger is
 * now read here with the SERVICE ROLE, always `.eq("profile_user_id",
 * userId)`. The database no longer scopes it, so the caller must pass the
 * signed-in id from `auth.getUser()` and must have run the entitlement check
 * (`requirePlus` / `hasPlus`) before calling. Names still come from
 * `hydrateUserCards` on the caller's cookie client.
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
 * HIDDEN PEOPLE ARE FILTERED OUT OF THE LIST, NOT OUT OF ANY COUNT. Someone
 * the owner has blocked or muted should not turn up in a list of names; the
 * tiles and this list's own `total` keep counting them, because a count that
 * quietly shrinks when you mute someone is a number nobody can reconcile and,
 * worse, an oracle (mute, re-read, see who drops out: #18). `total` is every
 * distinct viewer in the window; `has_more`/`next_offset` page the list.
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
 * `supabase` must be the caller's own cookie client (used for the block/mute
 * read and for the name cards). The ledger itself is read with the service
 * role inside `scanLedger`, scoped to `userId`: pass the signed-in id, and
 * only after the entitlement check. `null` also covers a missing service key.
 */
export async function loadProfileViewers(
  supabase: SupabaseClient,
  userId: string,
  opts: { limit: number; offset: number },
  now: Date = new Date(),
): Promise<ProfileViewersPage | null> {
  const since = windowStartUtc(now);

  const [scan, hiddenRes] = await Promise.all([
    scanLedger(userId, since),
    loadHiddenUsers(supabase, userId),
  ]);
  if (scan === null) return null;
  // A block list we could not read is not an empty block list: showing a
  // blocked person's name is the failure this filter exists to prevent.
  if (!hiddenRes.ok) {
    console.error("[profile-viewers] hidden users", hiddenRes.error);
    return null;
  }

  // Deduped per person, most recent look first — `scanLedger` already returns
  // the rows in `first_viewed_at desc` order, so the FIRST row seen for a
  // viewer is their latest.
  const seen = new Set<string>();
  const everyone: LedgerRow[] = [];
  for (const row of scan) {
    if (seen.has(row.viewer_user_id)) continue;
    seen.add(row.viewer_user_id);
    everyone.push(row);
  }

  // `total` is everyone who looked; only the list loses hidden people, and
  // the page is cut from the list, so "Show more" ends where the list does.
  const { total, listed: people } = splitAudience(
    everyone,
    hiddenRes.hidden.ids,
    (r) => r.viewer_user_id,
  );
  const {
    page: pageRows,
    has_more,
    next_offset,
  } = pageAudience(people, opts.offset, opts.limit);
  const pageIds = pageRows.map((r) => r.viewer_user_id);
  const lookedOn = new Map(pageRows.map((r) => [r.viewer_user_id, r]));

  // `hydrateUserCards` drops ids with no visible `users` row (deleted or
  // hidden profiles). Those rows leave the page but stay in `total`, so a page
  // can be shorter than `limit` while `has_more` is still true — the same
  // asymmetry the six existing list routes already live with
  // (src/app/api/me/followers/route.ts:66-73). Matching them beats fixing it
  // in one place and leaving the others inconsistent.
  //
  // THE OFFSET IS COUNTED IN PEOPLE CONSUMED, NOT ROWS RENDERED.
  // `next_offset` above advances by `pageRows.length` (what this page consumed
  // from the visible list), which is what a client's next `offset` must be. When
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

  return { users, total, has_more, next_offset };
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
 *
 * SERVICE ROLE, SCOPED BY HAND. After 20260928140000 no client role can read
 * `profile_views` at all (no policy, no grant), so this is the only way in,
 * and `.eq("profile_user_id", userId)` is the whole of the scoping. A missing
 * service key is `null` (a 500), never an empty ledger that paints "nobody
 * looked".
 */
async function scanLedger(userId: string, since: string): Promise<LedgerRow[] | null> {
  if (!isSupabaseServiceConfigured()) {
    console.error(
      "[profile-viewers] SUPABASE_SERVICE_ROLE_KEY missing — the viewer ledger cannot be read",
    );
    return null;
  }
  const service = createSupabaseServiceClient();
  const rows: LedgerRow[] = [];
  let scanned = 0;

  for (;;) {
    // Never ask for more than one row past the cap: that row is the evidence,
    // and there is no reason to pay for the rest of the page behind it.
    const end = Math.min(scanned + LEDGER_PAGE, LEDGER_SCAN_CAP + 1) - 1;
    const { data, error } = await service
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
