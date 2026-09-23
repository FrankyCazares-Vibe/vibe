import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADMIN_READ_LIMIT,
  adminFail,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { getActiveRestriction } from "@/lib/moderation/access";
import {
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
} from "@/lib/orgs/following";
import { ilikeOrFilter } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const PAGE_MAX = 25;
const MAX_Q = 120;

type UserRow = {
  id: string;
  handle: string | null;
  name: string | null;
  school_verified: boolean | null;
  created_at: string;
};

/**
 * GET /api/admin/users?q=&cursor=&limit=
 *
 * Find a student to act on. `q` matches a handle or a name; an address (one
 * with an `@` in it) is matched exactly against the sign-up email and the
 * school email. No `q` lists the newest accounts.
 *
 * THE SEARCH TEXT NEVER LEAVES THIS FUNCTION. It is not logged, not echoed
 * back in the answer and never written to `moderation_actions.meta` — an email
 * typed into a search box is still the student's email, and a query string is
 * the easiest place in the system to leak one. No email is returned either:
 * you search by address, you get back a handle.
 *
 * AN ADDRESS IS MATCHED, NOT PATTERNED. `.eq` on the two columns, so the
 * address never becomes part of a PostgREST filter string, and a partial
 * address cannot be used to walk the user table a character at a time.
 *
 * THIS READ BYPASSES RLS (service role). Restriction state is therefore asked
 * for explicitly, per student, through batch B's helper.
 *
 * RESPONSES
 *   200 {ok, users:[{id, handle, name, school_verified, restriction,
 *        restrictionKnown, openReportCount}], next_cursor}
 *   400 invalid_cursor · 401 · 403 · 429 · 500 request_failed
 */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, MAX_Q);
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return adminFail(400, "invalid_cursor", "Invalid cursor");
  const limit = parseLimit(url.searchParams.get("limit"));

  const rl = await rateLimit(`admin-users:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();
  const columns = "id, handle, name, school_verified, created_at";

  let rows: UserRow[] = [];
  let next_cursor: string | null = null;

  if (q.includes("@")) {
    // An address: two exact lookups, merged. There is no paging to do — one
    // address belongs to one account, and school emails are unique too.
    const address = q.toLowerCase();
    const [byLogin, bySchool] = await Promise.all([
      service.from("users").select(columns).eq("email", address).limit(2),
      service.from("users").select(columns).eq("school_email", address).limit(2),
    ]);
    if (byLogin.error || bySchool.error) {
      console.error("[admin/users address]", (byLogin.error ?? bySchool.error)?.message);
      return adminFail(500, "request_failed", "Request failed");
    }
    const merged = new Map<string, UserRow>();
    for (const row of [...(byLogin.data ?? []), ...(bySchool.data ?? [])] as unknown as UserRow[]) {
      merged.set(row.id, row);
    }
    rows = [...merged.values()];
  } else {
    let query = service.from("users").select(columns);
    if (q) {
      const filter = ilikeOrFilter(["handle", "name"], q);
      // Nothing searchable survived the strip (punctuation only): an empty
      // list beats a query that would match everyone.
      if (!filter) return NextResponse.json({ ok: true, users: [], next_cursor: null });
      query = query.or(filter);
    }
    if (decoded.cursor) query = query.or(followKeysetOrFilter("created_at", decoded.cursor));
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (error) {
      console.error("[admin/users search]", error.message);
      return adminFail(500, "request_failed", "Request failed");
    }
    const all = (data ?? []) as unknown as UserRow[];
    rows = all.slice(0, limit);
    const last = rows[rows.length - 1];
    next_cursor =
      all.length > limit && last ? encodeFollowCursor(last.created_at, last.id) : null;
  }

  const ids = rows.map((r) => r.id);
  const [restrictions, openCounts] = await Promise.all([
    // One read per student on the page, through batch B's helper, so "in
    // force" is decided in one place. A read that FAILED is reported as
    // `restrictionKnown: false`, never as "not restricted" — on this screen
    // that difference decides whether someone gets banned twice.
    Promise.all(ids.map(async (id) => [id, await getActiveRestriction(id)] as const)),
    loadOpenReportCounts(service, ids),
  ]);
  const restrictionById = new Map(restrictions);

  const users = rows.map((r) => {
    const lookup = restrictionById.get(r.id);
    return {
      id: r.id,
      handle: r.handle,
      name: r.name,
      school_verified: !!r.school_verified,
      restriction: lookup?.ok ? lookup.restriction : null,
      restrictionKnown: !!lookup?.ok,
      openReportCount: openCounts.get(r.id) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, users, next_cursor });
}

function parseLimit(raw: string | null): number {
  const n = raw == null || raw.trim() === "" ? NaN : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return PAGE_MAX;
  return Math.min(n, PAGE_MAX);
}

/**
 * How many open reports name each of these students as the owner of what was
 * reported. `target_owner_id` is stamped when the report is filed, so this
 * counts reports about their posts and comments as well as about them.
 *
 * Reports filed before that column existed have none and are not counted —
 * there are no such rows in production today, and a count that quietly guessed
 * would be worse than one that is honestly short.
 */
async function loadOpenReportCounts(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const { data, error } = await service
    .from("reports")
    .select("target_owner_id")
    .eq("status", "open")
    .in("target_owner_id", ids)
    .limit(2000);
  if (error) {
    console.error("[admin/users open reports]", error.message);
    return counts;
  }
  for (const row of (data ?? []) as Array<{ target_owner_id: string | null }>) {
    if (!row.target_owner_id) continue;
    counts.set(row.target_owner_id, (counts.get(row.target_owner_id) ?? 0) + 1);
  }
  return counts;
}
