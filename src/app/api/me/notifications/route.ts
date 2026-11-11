import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { attachNotificationOrgs } from "@/lib/orgs/notification-orgs";
import { isUuid } from "@/lib/pgrest";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { visibleActorFilter, withEventNotices } from "@/lib/push/event-notice";
import { tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Returns the signed-in user's notifications, newest first. Joins each
 * row with the actor (who did the thing), the post excerpt (when
 * relevant) and the club (for invites and approvals) so Otto can render
 * readable rows without follow-up fetches.
 *
 * "Recent" includes both unread and recently-read so the user can scan
 * what just happened. Marking-as-read happens via POST mark-read.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // Pull the post's author handle so mention rows can route the click
  // to /profile/<authorHandle>?post=<id> — landing the mentionee on the
  // post in its actual context instead of dropping them onto their own
  // profile with the post-viewer query param.
  //
  // Try the full select first (includes message_id from the mention
  // migration). If that column isn't in the DB yet (deploy lag), fall
  // back to the older shape so the panel still renders.
  //
  // `org_id` is selected bare, never embedded: the club behind an invite or
  // an approval is resolved below with the service client (see
  // attachNotificationOrgs for why the user client can't read it).
  const FULL_SELECT =
    "id,type,post_id,comment_id,message_id,org_id,read_at,created_at," +
    "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
    "post:posts!notifications_post_id_fkey(id,type,content,media_thumbnail_url,author:users!posts_user_id_fkey(handle))," +
    "comment:post_comments!notifications_comment_id_fkey(id,content)";
  const FALLBACK_SELECT =
    "id,type,post_id,comment_id,read_at,created_at," +
    "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
    "post:posts!notifications_post_id_fkey(id,type,content,media_thumbnail_url,author:users!posts_user_id_fkey(handle))," +
    "comment:post_comments!notifications_comment_id_fkey(id,content)";

  // Nothing from someone blocked either way, or muted right now. It's
  // excluded in the query, before the limit, so the page stays full. The
  // actor is the right column: every type's post is either the viewer's own
  // (like, comment) or the actor's (mention), so a hidden person can't
  // reach the viewer through another actor's row. Fail closed on error.
  // The one exception is a club's cancelled-event notice (ruling 14): it's
  // from the club, so blocking or muting the officer who sent it never
  // hides it (visibleActorFilter).
  // ./count (the unread badge) must exclude the same people: OttoCorner
  // peeks `?limit=1` when that count rises, and a count that includes a
  // hidden row makes the peek return an older, visible row instead.
  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[me/notifications hidden-users]", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const hiddenIds = hiddenRes.hidden.ids;

  let fullQuery = supabase
    .from("notifications")
    .select(FULL_SELECT)
    .eq("user_id", user.id);
  if (hiddenIds.length > 0) fullQuery = fullQuery.or(visibleActorFilter(hiddenIds));
  let { data, error } = await fullQuery
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error && /message_id|column .* does not exist/i.test(error.message ?? "")) {
    let fbQuery = supabase
      .from("notifications")
      .select(FALLBACK_SELECT)
      .eq("user_id", user.id);
    if (hiddenIds.length > 0) fbQuery = fbQuery.or(visibleActorFilter(hiddenIds));
    const fb = await fbQuery
      .order("created_at", { ascending: false })
      .limit(limit);
    data = fb.data;
    error = fb.error;
  }

  if (error) {
    console.error("[me/notifications GET]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Every row gains `org` ({handle, name, logo_url} or null). Invites,
  // approvals and cancelled-event notices for a club that has since been
  // hidden or deleted drop here; no other type ever drops. The fallback
  // select has no org_id, so its rows all come back with `org: null`.
  // Then every row gains `event_title` / `event_starts_at` (null except on a
  // cancelled-event notice), and those notices lose their actor: the officer
  // who cancelled is never sent to the client (withEventNotices).
  type NotificationRow = Record<string, unknown> & {
    id: string;
    type?: string;
    org_id?: string | null;
    post?: { id: string } | null;
  };
  const withOrgs = await withEventNotices(
    supabase,
    await attachNotificationOrgs(
      createSupabaseServiceClient(),
      (data ?? []) as unknown as NotificationRow[],
    ),
  );

  // The embedded post's thumbnail goes out as a proxy URL, never a raw
  // R2 key (see withPostMediaUrls).
  const notifications = withOrgs.map((n) =>
    n.post ? { ...n, post: withPostMediaUrls(n.post) } : n,
  );

  return NextResponse.json({ ok: true, notifications });
}

/** The most ids one clear may name: a page of the desk's Otto saw and then some. */
const MAX_CLEAR_IDS = 200;

/**
 * Clear (delete for good) the signed-in person's own notifications (Otto
 * polish, Nov 11, 2026: the × on an Otto saw row and "Clear all"). The
 * client holds the delete for ~5 s behind an Undo toast and only then calls
 * this (src/lib/otto/clear-notifications.ts).
 *
 *   { ids: ["uuid", …] } → delete those rows, only where they are the caller's
 *   { all: true, before } → delete the caller's rows created at or before `before` (ISO; the newest row the list loaded)
 *
 * Anything else is a 400 before a row is touched: an empty body, an empty
 * list, a non-uuid id (never a silent filter), more than 200 ids, or both
 * shapes at once. Ownership is the `user_id` filter AND row security
 * (notifications_delete_own: auth.uid() = user_id), so naming someone else's
 * id deletes nothing. Order: the `notificationsClear` budget right after
 * sign-in, then the body, then a restriction in force refuses the write (the
 * proxy refuses it first; this is the wall behind it), then the delete.
 * Returns how many rows went.
 */
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await limitFor("notificationsClear", user.id);
  if (!rl.allowed) return tooManyRequests(rl, "Too many changes at once. Try again in a few minutes.");

  let body: { ids?: unknown; all?: unknown; before?: unknown } | null = null;
  try {
    body = (await req.json()) as { ids?: unknown; all?: unknown; before?: unknown } | null;
  } catch {
    body = null;
  }
  const refuse = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });
  const shapes = "Pass { all: true, before } or { ids: [...] }";
  if (!body || typeof body !== "object" || Array.isArray(body)) return refuse(shapes);

  const all = body.all === true;
  let ids: string[] = [];
  // Clear all takes only rows at or before `before` (the newest row the list
  // loaded), never one that arrived after it was drawn; a time past now is
  // read as now (review, Nov 11).
  let before = "";
  if (all) {
    if (body.ids !== undefined) return refuse(`${shapes}, not both`);
    const at = typeof body.before === "string" && body.before.length <= 40 ? Date.parse(body.before) : NaN;
    if (!Number.isFinite(at)) return refuse("Clear all needs before: the newest time the list loaded");
    before = new Date(Math.min(at, Date.now())).toISOString();
  } else {
    if (body.before !== undefined) return refuse(shapes);
    if (!Array.isArray(body.ids) || body.ids.length === 0) return refuse(shapes);
    if (body.ids.length > MAX_CLEAR_IDS) return refuse(`Pass at most ${MAX_CLEAR_IDS} ids`);
    if (!body.ids.every(isUuid)) return refuse("Every id must be a notification id");
    ids = [...new Set(body.ids as string[])];
  }

  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  let query = supabase.from("notifications").delete({ count: "exact" }).eq("user_id", user.id);
  query = all ? query.lte("created_at", before) : query.in("id", ids);
  const { error, count } = await query;
  if (error) {
    console.error("[me/notifications DELETE]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
