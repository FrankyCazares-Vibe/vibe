/**
 * Small pure rules for recorded club removals (`public.org_removals`, S67
 * security wave 2 #15, migration 20260928100000_club_membership_rules.sql).
 *
 * The database side: the members DELETE route upserts a row BEFORE it deletes
 * the membership (so the org_members AFTER DELETE trigger sees it and also
 * drops the member's RSVPs to the club's events that haven't ended), and an
 * AFTER INSERT trigger on org_members deletes it again when they are let back
 * in. Only the service role can read or write the table.
 *
 * PURE ON PURPOSE (no imports), so `removals.test.ts` runs under plain
 * `node --test`; `membership.ts` (server-only) does the queries.
 */

/** The table, named once for the reads, writes and the lag check below. */
export const ORG_REMOVALS_TABLE = "org_removals";

type PgLikeError = { code?: unknown; message?: unknown } | null | undefined;

/**
 * Is this "the table isn't there"? Postgres says 42P01, PostgREST says
 * PGRST205 ("Could not find the table 'public.org_removals' in the schema
 * cache"). Matched by code AND by the table's name in the message, so a
 * missing table somewhere else (a trigger's, say) is never mistaken for it.
 *
 * WHY IT EXISTS. The migration goes in BEFORE the deploy, and rolling back is
 * code first, then the migration. Both orders are safe only if a build that
 * finds no table reads "nobody was removed" (the truth: nothing could have
 * been recorded) instead of failing every join and every org page. Any OTHER
 * error still fails closed.
 */
export function isMissingRemovalsTable(error: PgLikeError): boolean {
  if (!error || typeof error !== "object") return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (code !== "42P01" && code !== "PGRST205") return false;
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes(ORG_REMOVALS_TABLE);
}

/**
 * The ids from `candidateIds` that have a removal row, as a Set (the requests
 * list tags each of those "Removed before"). Rows for anyone else are ignored;
 * ids are compared in lower case, the way Postgres returns uuids.
 */
export function removedIdSet(
  candidateIds: readonly string[],
  rows: ReadonlyArray<{ user_id?: unknown }> | null | undefined,
): Set<string> {
  const wanted = new Set(candidateIds.map((id) => id.toLowerCase()));
  const out = new Set<string>();
  for (const row of rows ?? []) {
    const id = typeof row?.user_id === "string" ? row.user_id.toLowerCase() : null;
    if (id && wanted.has(id)) out.add(id);
  }
  return out;
}
