import { NextResponse } from "next/server";

import {
  ADMIN_READ_LIMIT,
  adminFail,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { getActiveRestriction } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

const HISTORY_LIMIT = 50;

/** The columns of one log row, listed by name so a later column can't join the answer. */
const ACTION_COLUMNS =
  "id, actor_id, action, target_type, target_id, report_id, reason, meta, created_at";

/**
 * Takedowns are filed against the POST, the comment or the message, with the
 * student's id only in `meta.author_id`. Reading `target_type = 'user'` alone
 * would show a student with four posts and two comments removed as having a
 * clean record — the exact evidence a suspension rests on, silently missing.
 */
const CONTENT_ACTIONS = [
  "post_remove",
  "post_restore",
  "comment_remove",
  "comment_restore",
  "message_remove",
  "message_restore",
];

type ActionRow = { id: string; actor_id: string | null; created_at: string };

/** Newest first, id as the tie-break — the same order the queue uses. */
function newestFirst(a: ActionRow, b: ActionRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/**
 * GET /api/admin/users/[id]
 *
 * One student, for the moment before a moderator decides: who they are, what
 * is in force now, every restriction they have ever had, and what moderators
 * have already done about them.
 *
 * NO EMAIL, EVER, AND NO `identity_key`. The key is a keyed hash of the
 * canonical school address; handing it back over HTTP turns a column only the
 * server can read into something a screen, a log or a screenshot can carry.
 * The restriction history is listed by column, never `select("*")`, so a
 * column added later cannot quietly join the answer.
 *
 * THIS READ BYPASSES RLS (service role). `restriction` is the live answer from
 * batch B's helper, not something inferred from the rows below — an expired
 * suspension is history, not a restriction in force.
 *
 * `actions` MEANS "ABOUT THIS STUDENT", NOT "target_type = user". It is the
 * restrict/ban/lift rows filed against them PLUS every takedown of their own
 * posts, comments and messages, which are filed against the content and carry
 * the student only in `meta.author_id`. Merged newest-first and capped at
 * {@link HISTORY_LIMIT}, so a moderator sees the record the decision rests on.
 *
 * RESPONSES
 *   200 {ok, user:{id,handle,name,school_verified,is_platform_admin,createdAt,
 *        restriction,openReportCount}, restrictions:[…], actions:[…]}
 *   400 invalid_id · 401 · 403 · 404 not_found · 429 · 500 request_failed
 */
export async function GET(req: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return adminFail(400, "invalid_id", "Invalid id");

  const rl = await rateLimit(`admin-users:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();

  const { data: row, error: userErr } = await service
    .from("users")
    .select("id, handle, name, school_verified, is_platform_admin, created_at")
    .eq("id", id)
    .maybeSingle();
  if (userErr) {
    console.error("[admin/users/[id] user]", userErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!row) return adminFail(404, "not_found", "Not found");
  const user = row as {
    id: string;
    handle: string | null;
    name: string | null;
    school_verified: boolean | null;
    is_platform_admin: boolean | null;
    created_at: string;
  };

  const [restriction, historyRes, actionsRes, contentRes, openRes] = await Promise.all([
    getActiveRestriction(id),
    service
      .from("account_restrictions")
      .select(
        "id, key_kind, kind, starts_at, ends_at, reason_code, note, created_by, created_at, lifted_at, lifted_by",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    service
      .from("moderation_actions")
      .select(ACTION_COLUMNS)
      .eq("target_type", "user")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    // The takedowns filed against this student's own posts, comments and
    // messages. `meta` is jsonb with no index for this, so it is a sequential
    // scan — fine on a log this size, and worth revisiting when it isn't.
    service
      .from("moderation_actions")
      .select(ACTION_COLUMNS)
      .in("action", CONTENT_ACTIONS)
      .eq("meta->>author_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    service
      .from("reports")
      .select("id")
      .eq("status", "open")
      .eq("target_owner_id", id)
      .limit(500),
  ]);

  // The one place a failed restriction read is fatal. This is the screen a
  // moderator reads immediately before suspending someone; "no restriction"
  // when we could not tell is how a student gets banned twice.
  if (!restriction.ok) return adminFail(500, "request_failed", "Request failed");
  if (historyRes.error) console.error("[admin/users/[id] history]", historyRes.error.message);
  if (actionsRes.error) console.error("[admin/users/[id] actions]", actionsRes.error.message);
  if (contentRes.error) console.error("[admin/users/[id] content]", contentRes.error.message);
  if (openRes.error) console.error("[admin/users/[id] open reports]", openRes.error.message);

  // One history, not two lists the screen has to interleave. Deduped by id in
  // case a row ever matches both reads, newest first, capped like either half.
  const byId = new Map<string, ActionRow>();
  for (const a of [...(actionsRes.data ?? []), ...(contentRes.data ?? [])] as ActionRow[]) {
    byId.set(a.id, a);
  }
  const actions = [...byId.values()].sort(newestFirst).slice(0, HISTORY_LIMIT);
  const actorIds = [...new Set(actions.map((a) => a.actor_id).filter((v): v is string => !!v))];
  const actorHandles = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: actorRows } = await service
      .from("users")
      .select("id, handle")
      .in("id", actorIds);
    for (const a of (actorRows ?? []) as Array<{ id: string; handle: string | null }>) {
      actorHandles.set(a.id, a.handle);
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      handle: user.handle,
      name: user.name,
      school_verified: !!user.school_verified,
      // The screen needs this to grey out Restrict: an admin cannot restrict
      // another admin, and being told so only after the tap is a worse way
      // to find out.
      is_platform_admin: !!user.is_platform_admin,
      createdAt: user.created_at,
      restriction: restriction.restriction,
      openReportCount: (openRes.data ?? []).length,
    },
    restrictions: historyRes.data ?? [],
    actions: actions.map((a) => ({
      ...a,
      actorHandle: a.actor_id ? actorHandles.get(a.actor_id) ?? null : null,
    })),
  });
}
