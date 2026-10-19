import { NextResponse } from "next/server";

import {
  loadEventCardMessages,
  refreshEventCardTexts,
  rewriteEventCardTexts,
} from "@/lib/chat/cards/refresh-event-cards";
import { cancelSendsNotices } from "@/lib/events/cancel-notice";
import { parseCheckinStateRows } from "@/lib/events/event-checkin";
import {
  EVENT_ROW_COLUMNS,
  toCount,
  toEventListItem,
  type EventListRow,
  type EventOrgCard,
} from "@/lib/events/event-item";
import { collectCancelRecipients, sendCancelNotices } from "@/lib/events/notify-cancel";
import { checkEventFields, readEventFields } from "@/lib/events/validate";
import {
  contentBlockedResponse,
  requireCanPublish,
  requireNotRestricted,
} from "@/lib/moderation/access";
import { loadOrgRole } from "@/lib/orgs/following";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * One club event: DELETE (the "Cancel event" AND "Delete event" buttons) and
 * PATCH ("Edit event"). S68 officer tools, contract C2 in
 * handoffs/wave-plan-s68/officer-tools.md.
 *
 * WHO. A CURRENT owner / admin of the event's club who isn't suspended or
 * banned (mods moderate chat, not content; the creator gets nothing for
 * having made it, security wave A call 8). The database says the same for
 * DELETE (events_delete_manager); UPDATE is revoked from every client, so
 * PATCH writes with the service role after these checks. An org-less
 * (legacy) event and a missing one answer 404: neither is in any list an
 * officer can press a button on. A club moderators hid is frozen evidence
 * (wave B call 1): its officers get 403 org_hidden, anyone else 404.
 *
 * ERRORS speak the events routes' shape, `{ ok: false, error: <sentence>,
 * code: <code> }` (what describeFailure reads), plus `message` (the same
 * sentence) for callers written to C2's wording. The shared gates
 * (requireNotRestricted, requireCanPublish, contentBlockedResponse,
 * tooManyRequests) answer in their own standard shapes.
 */

type RouteContext = { params: Promise<{ id: string }> };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code, message: error }, { status });
}

const GONE = "That event is no longer available.";
const NOT_OFFICER = "Only the club's owner and admins can change its events.";
const FAILED = "Request failed";

/** The event as both handlers read it (service role: `org_id` must be trusted). */
type EventRecord = Omit<EventListRow, "creator">;
type OrgRecord = EventOrgCard & { hidden_at: string | null };

type Access =
  | { ok: true; event: EventRecord & { org_id: string }; org: OrgRecord }
  | { ok: false; response: NextResponse };

/**
 * The event, its club, and whether the caller is a current owner / admin of
 * it. Restriction is checked by the caller (DELETE and PATCH use different
 * gates). SERVICE role throughout: `orgs_select` hides a private club and
 * `org_members` hides its roster from non-members.
 */
async function loadForOfficer(id: string, userId: string, logTag: string): Promise<Access> {
  const failed = (): Access => ({ ok: false, response: fail(500, "request_failed", FAILED) });
  if (!isSupabaseServiceConfigured()) {
    console.error(`${logTag} service role not configured`);
    return failed();
  }
  const service = createSupabaseServiceClient();
  const { data: event, error } = await service
    .from("events")
    .select(EVENT_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`${logTag} read`, error);
    return failed();
  }
  if (!event || !event.org_id) return { ok: false, response: fail(404, "not_found", GONE) };
  const orgId: string = event.org_id;

  const [orgRes, roleRes] = await Promise.all([
    service
      .from("orgs")
      .select("id,handle,name,logo_url,verified,hidden_at")
      .eq("id", orgId)
      .maybeSingle(),
    loadOrgRole(service, orgId, userId),
  ]);
  if (orgRes.error || !roleRes.ok) {
    if (orgRes.error) console.error(`${logTag} org`, orgRes.error);
    return failed();
  }
  const org = orgRes.data as OrgRecord | null;
  if (!org) return { ok: false, response: fail(404, "not_found", GONE) };
  const isOfficer = roleRes.role === "owner" || roleRes.role === "admin";
  if (org.hidden_at) {
    // Frozen (wave B call 1). Its officers still see the event (members can)
    // and the Cancel button, so they hear why instead of a "gone" that would
    // drop the card until the next refresh. Anyone else: not found.
    return {
      ok: false,
      response: isOfficer
        ? fail(403, "org_hidden", "You can't change this club's events right now.")
        : fail(404, "not_found", GONE),
    };
  }
  if (!isOfficer) {
    return { ok: false, response: fail(403, "org_role_required", NOT_OFFICER) };
  }
  return { ok: true, event: { ...(event as EventRecord), org_id: orgId }, org };
}

/**
 * DELETE /api/events/[id] -> { ok: true, notified: <n> }
 *
 * Cancel and Delete are this one call ("Cancel = gone": there is no cancelled
 * state). If the event hasn't ended, everyone who RSVP'd going or maybe
 * (not the officer) gets an `event_cancelled` notice from the club; an ended
 * event goes quietly.
 *
 * ORDER: collect the RSVP'd ids (rsvps cascade with the event, so this is
 * the last moment anyone can know them; a failed read stops here, nothing
 * deleted) -> load the event's chat cards (only when notices go out: the FK
 * `messages.card_event_id` nulls itself with the event, so this is the last
 * moment anyone can find them; S71 F03) -> delete with the caller's OWN
 * client, so events_delete_manager stays the boundary, and require exactly
 * one row (an RLS refusal is a silent 0) -> rewrite the cards' stored text
 * to "Event cancelled: <title>" -> insert the notices with the service role
 * and kick the push drain. A failed send never undoes the delete: it is
 * logged and the answer is { ok: true, notified: 0, notify_failed: true }.
 * A failed card read or rewrite is logged by the helper and changes nothing:
 * not the answer, not the notices. An event that had ended deletes quietly
 * and its cards keep their history text.
 *
 * Errors: 401 unauthorized · 429 (tooManyRequests) · 404 not_found ·
 * 403 org_role_required / org_hidden · 403 account_restricted / terms_required
 * (requireNotRestricted) · 500 request_failed.
 * Rate limited: 30 per 10 minutes per officer, like post deletes.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !isUuid(id)) return fail(404, "not_found", GONE);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`event-delete:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const access = await loadForOfficer(id, user.id, "[events/:id DELETE]");
  if (!access.ok) return access.response;
  // After the role step, like post deletes: a stranger hears 403 / 404 only.
  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  const { event } = access;
  const service = createSupabaseServiceClient();
  // One clock for the whole request: "has it ended?" is asked once.
  const notify = cancelSendsNotices(event.ends_at, Date.now());

  let recipientIds: string[] = [];
  if (notify) {
    const collected = await collectCancelRecipients(service, event.id, user.id);
    if (!collected.ok) return fail(500, "request_failed", FAILED);
    recipientIds = collected.ids;
  }

  // The event's chat cards, BEFORE the delete: the FK nulls their
  // `card_event_id` afterwards (S71 F03). Null = the read failed (logged by
  // the helper); the delete goes on and the cards keep their old text.
  const cards = notify ? await loadEventCardMessages(service, event.id) : null;

  const { data: gone, error: delErr } = await supabase
    .from("events")
    .delete()
    .eq("id", event.id)
    .select("id");
  if (delErr) {
    console.error("[events/:id DELETE]", delErr);
    return fail(500, "request_failed", FAILED);
  }
  if (!gone || gone.length !== 1) return fail(404, "not_found", GONE);

  // Only after the confirmed delete: the old screens say "Event cancelled",
  // not the old day and time. The result is only logged.
  if (cards && cards.ids.length > 0) {
    const rewritten = await rewriteEventCardTexts(service, cards, { kind: "cancel", title: event.title });
    if (!rewritten.ok) {
      console.error("[events/:id DELETE cards] some event cards kept their old text", {
        eventId: event.id,
        cards: cards.ids.length,
        updated: rewritten.updated,
      });
    }
  }

  if (!notify || recipientIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }
  const sent = await sendCancelNotices(service, { event, recipientIds, actorId: user.id });
  if (sent.failed) {
    // The event is gone either way. `notified` is what really went out
    // (0 unless a very large list was split and only part of it failed).
    console.error("[events/:id DELETE notify] notices not sent", {
      eventId: event.id,
      recipients: recipientIds.length,
      notified: sent.notified,
    });
    return NextResponse.json({ ok: true, notified: sent.notified, notify_failed: true });
  }
  return NextResponse.json({ ok: true, notified: sent.notified });
}

/**
 * The edited event as one GET /api/events item: counts from the same
 * `event_rsvp_counts` RPC (numbers only), the caller's own RSVP, the club
 * card. The caller was just checked as a current owner / admin, so
 * viewer_can_manage is true. A failed count read answers null (the edit is
 * saved; the client refetches) rather than "0 going", which would be wrong.
 * Event check-in's fields come from `event_checkin_state` in the same round
 * trip; a failure there only leaves them "nothing known" (the edit is saved,
 * and no check-in shown is honest).
 */
async function itemFor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  row: EventRecord,
  org: OrgRecord,
  viewerId: string,
) {
  const [countsRes, mine, checkinRes] = await Promise.all([
    supabase.rpc("event_rsvp_counts", { p_event_ids: [row.id] }),
    supabase
      .from("rsvps")
      .select("status")
      .eq("event_id", row.id)
      .eq("user_id", viewerId)
      .maybeSingle(),
    supabase.rpc("event_checkin_state", { p_event_ids: [row.id] }),
  ]);
  if (countsRes.error) {
    console.error("[events/:id PATCH rsvp counts]", countsRes.error);
    return null;
  }
  if (checkinRes.error) {
    // The code only: the message can carry ids.
    console.error("[events/:id PATCH checkin state]", { code: checkinRes.error.code });
  }
  // undefined, never null, on a failure: toEventListItem reads it as "nothing known".
  const checkin = checkinRes.error ? undefined : parseCheckinStateRows(checkinRes.data).get(row.id);
  const counts = (Array.isArray(countsRes.data) ? countsRes.data : []).find(
    (r) => (r as { event_id?: unknown }).event_id === row.id,
  ) as { going_count?: unknown; maybe_count?: unknown } | undefined;
  const status = (mine.data as { status?: unknown } | null)?.status;
  return toEventListItem(
    { ...row, creator: null },
    {
      viewerId,
      viewerIsOfficer: true,
      org: { id: org.id, handle: org.handle, name: org.name, logo_url: org.logo_url, verified: org.verified },
      goingCount: toCount(counts?.going_count),
      interestedCount: toCount(counts?.maybe_count),
      viewerStatus: status === "going" || status === "maybe" ? status : null,
      checkin,
    },
  );
}

/**
 * PATCH /api/events/[id] -> { ok: true, event: <one GET /api/events item> }
 *
 * Edits title, description, location, starts_at, ends_at (POST's names); a
 * field left out keeps its stored value. Only while the event hasn't ended.
 * Validation is POST's own (src/lib/events/validate.ts), checking only what
 * changed: an unchanged title isn't re-run through a word list that grew
 * since, and an event already under way keeps its past start (a moved start
 * can't be in the past, and the end must stay in the future). `org_id` may
 * be sent only unchanged. Written with the SERVICE role after every check
 * (UPDATE on events is revoked from clients); the write also requires the
 * event to be the same club's and not ended, so a delete or the end landing
 * in between answers 404, never a stale edit. No notice goes out on an edit
 * (v1). `event` is null only if the edit saved but couldn't be read back.
 * When the title or the start changed, the stored text of the event's chat
 * cards follows (S71 F03: `refreshEventCardTexts`, awaited, its result only
 * logged; a failure there never changes this answer). The refresh is bounded
 * (at most 50 update statements, 10 at a time, none started after 5 s: S71
 * repair R2), so a room full of Event cards cannot hold this request.
 *
 * Gate: requireCanPublish, like POST (editing is publishing: Terms, a
 * verified school email, no restriction), then a current owner / admin.
 * Errors: 401 unauthorized · 429 · 403 terms_required / account_restricted /
 * school_email_required · 400 invalid_json · 404 not_found ·
 * 403 org_role_required / org_hidden · 403 org_unverified · 409 event_ended ·
 * 400 org_cannot_change · 400 title_required / title_too_long /
 * description_too_long / location_too_long / invalid_times ·
 * 422 content_blocked (+ field) · 500 request_failed.
 * Rate limited: 30 per 10 minutes per officer, like post edits.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !isUuid(id)) return fail(404, "not_found", GONE);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`event-edit:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  const body = parsed as Record<string, unknown>;

  const access = await loadForOfficer(id, user.id, "[events/:id PATCH]");
  if (!access.ok) return access.response;
  const { event, org } = access;
  // POST's rule: only a verified club puts an event in front of a campus.
  if (!org.verified) return fail(403, "org_unverified", "Only verified orgs can post events");

  const nowMs = Date.now();
  if (!(Date.parse(event.ends_at) > nowMs)) {
    return fail(409, "event_ended", "This event has already ended, so it can't be edited.");
  }
  if (body.org_id !== undefined && body.org_id !== event.org_id) {
    return fail(400, "org_cannot_change", "An event can't move to another club.");
  }

  const checked = checkEventFields(readEventFields(body, event), nowMs, event);
  if (!checked.ok) {
    const p = checked.problem;
    return p.kind === "content_blocked"
      ? contentBlockedResponse(p.field)
      : fail(p.status, p.code, p.error);
  }

  const service = createSupabaseServiceClient();
  const { data: updated, error: updErr } = await service
    .from("events")
    .update(checked.value)
    .eq("id", event.id)
    .eq("org_id", event.org_id)
    .gt("ends_at", new Date(nowMs).toISOString())
    .select(EVENT_ROW_COLUMNS)
    .maybeSingle();
  if (updErr) {
    console.error("[events/:id PATCH]", updErr);
    return fail(500, "request_failed", FAILED);
  }
  if (!updated) return fail(404, "not_found", GONE);

  // The Event cards' stored text carries the title and the day and time, so
  // it follows an edit of either (S71 F03). Awaited, never throws, result
  // only logged: the answer below is the same whatever happens here.
  const saved = updated as EventRecord;
  if (saved.title !== event.title || Date.parse(saved.starts_at) !== Date.parse(event.starts_at)) {
    const refreshed = await refreshEventCardTexts(service, event.id, {
      kind: "update",
      title: saved.title,
      starts_at: saved.starts_at,
    });
    if (!refreshed.ok) {
      console.error("[events/:id PATCH cards] some event cards kept their old text", {
        eventId: event.id,
        updated: refreshed.updated,
      });
    }
  }

  const item = await itemFor(supabase, saved, org, user.id);
  return NextResponse.json({ ok: true, event: item });
}
