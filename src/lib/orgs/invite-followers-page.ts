import { decodeFollowCursor, encodeFollowCursor, type FollowCursor } from "@/lib/orgs/following";

/**
 * One page of the "Invite people" sheet's default list: the club's followers,
 * newest follow first (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §7 F3, critic
 * `wave-plan-sections/critic-W2.md` H-1 and M-2).
 *
 * THE SHAPE OF THE PROBLEM. `invite-candidates` reads `fetched` (30) follow
 * rows in `first_followed_at desc, id desc` order, then drops some of them in
 * TypeScript: members, blocks against the owner, accounts that aren't finished
 * students. Up to `max` (20) of the survivors go out. The cursor has to say
 * where the NEXT page starts without skipping a survivor and without showing
 * one twice.
 *
 * THE CURSOR RULE (critic M-2):
 *   1. `max` rows went out → the cursor of the raw row that produced the last
 *      one. Survivors after it in this read are shown on the next page, not
 *      skipped. (Using the last row READ here would lose them: the sheet
 *      dedupes by id but can't recover a row it never got.)
 *      Exception: when that row was the end of a short read and nothing kept
 *      comes after it, there is no next page, so the cursor is null rather than
 *      a "Show more" that loads nothing.
 *   2. Fewer than `max` went out, but the read came back full → the cursor of
 *      the last raw row. Everything up to it was looked at; more may follow.
 *   3. Otherwise → null. A short read is the end of the list.
 *
 * AN EMPTY PAGE WITH A CURSOR is legal here (rule 2 with no survivors), but
 * the sheet reads `users: []` as "Nobody follows {org} yet" and draws no
 * "Show more". So the route doesn't send one if it can help it:
 * {@link collectFollowersPage} reads again from that cursor, up to
 * {@link FOLLOWERS_PAGE_MAX_READS} times, and answers with the first read that
 * has a row or ends the list.
 *
 * NO `import "server-only"`: `node --test` loads this file. `keep` must be a
 * pure predicate; it can be called more than once per row.
 */

/** The two columns a follow row must carry to be paged. */
export type FollowPageRow = { id: string; first_followed_at: string };

/** Results per page (`invite-candidates` `MAX_RESULTS`). */
export const FOLLOWERS_PAGE_MAX = 20;

/** Raw rows read per page (`MAX_RESULTS + FILTER_HEADROOM`). */
export const FOLLOWERS_PAGE_FETCHED = 30;

/**
 * @param rawRows the follow rows exactly as the ordered, limited read returned
 *   them (hidden users already excluded in SQL).
 * @param keep whether a row survives the TypeScript filters.
 * @returns the kept rows in read order, at most `max`, and the encoded cursor
 *   for the next page or null.
 */
export function followersPage<R extends FollowPageRow>(
  rawRows: readonly R[],
  keep: (row: R) => boolean,
  max: number = FOLLOWERS_PAGE_MAX,
  fetched: number = FOLLOWERS_PAGE_FETCHED,
): { emitted: R[]; nextCursor: string | null } {
  const emitted: R[] = [];
  let producerIndex = -1;
  for (let i = 0; i < rawRows.length && emitted.length < max; i++) {
    const row = rawRows[i];
    if (!keep(row)) continue;
    emitted.push(row);
    producerIndex = i;
  }

  const readWasFull = rawRows.length >= fetched;

  if (emitted.length >= max) {
    const moreKept = rawRows.slice(producerIndex + 1).some((row) => keep(row));
    if (!moreKept && !readWasFull) return { emitted, nextCursor: null };
    const producer = rawRows[producerIndex];
    return {
      emitted,
      nextCursor: encodeFollowCursor(producer.first_followed_at, producer.id),
    };
  }

  if (readWasFull) {
    const last = rawRows[rawRows.length - 1];
    return { emitted, nextCursor: encodeFollowCursor(last.first_followed_at, last.id) };
  }

  return { emitted, nextCursor: null };
}

/**
 * How many follow reads one request may make looking for a row to show: 4 ×
 * `fetched` (30) = 120 raw rows. Past that the empty page and its cursor go
 * out as they are; the bound keeps one GET from walking a whole chapter.
 */
export const FOLLOWERS_PAGE_MAX_READS = 4;

/**
 * One follow read, filtered: the raw rows in read order, the keep rule for
 * them, and whatever the caller needs to render the kept rows (the account
 * and standings lookups the rule was built from).
 */
export type FollowersRead<R extends FollowPageRow, C> = {
  rows: readonly R[];
  keep: (row: R) => boolean;
  context: C;
};

export type FollowersReadResult<R extends FollowPageRow, C, F> =
  | { ok: true; read: FollowersRead<R, C> }
  | { ok: false; failure: F };

/**
 * One response's worth of followers. Calls `read` from `start`, pages it with
 * {@link followersPage}, and while that page is EMPTY but has a cursor, reads
 * again from the cursor — at most `maxReads` reads in all. Every read goes
 * through `followersPage`, so the cursor rule above holds for whichever read
 * answers, and the rows skipped on the way were all dropped rows: nothing a
 * later page would have shown is lost.
 *
 * Only the answering read's rows are emitted (the earlier reads emitted
 * nothing), so its `context` is the one returned. A failed read stops the
 * loop and its `failure` comes back as is: the caller answers 500, it never
 * sends a partial page.
 */
export async function collectFollowersPage<R extends FollowPageRow, C, F>(
  start: FollowCursor | null,
  read: (cursor: FollowCursor | null) => Promise<FollowersReadResult<R, C, F>>,
  options: { max?: number; fetched?: number; maxReads?: number } = {},
): Promise<
  | { ok: true; emitted: R[]; nextCursor: string | null; context: C; reads: number }
  | { ok: false; failure: F }
> {
  const max = options.max ?? FOLLOWERS_PAGE_MAX;
  const fetched = options.fetched ?? FOLLOWERS_PAGE_FETCHED;
  const maxReads = Math.max(1, options.maxReads ?? FOLLOWERS_PAGE_MAX_READS);

  let cursor = start;
  for (let reads = 1; ; reads++) {
    const res = await read(cursor);
    if (!res.ok) return { ok: false, failure: res.failure };
    const { rows, keep, context } = res.read;
    const page = followersPage(rows, keep, max, fetched);
    const answer = { ok: true as const, ...page, context, reads };
    if (page.emitted.length > 0 || page.nextCursor === null || reads >= maxReads) {
      return answer;
    }
    // Our own encoder wrote this cursor, so it decodes; if it somehow doesn't,
    // send the page as it is rather than loop on a position we can't read.
    const decoded = decodeFollowCursor(page.nextCursor);
    if (!decoded.ok || decoded.cursor === null) return answer;
    cursor = decoded.cursor;
  }
}
