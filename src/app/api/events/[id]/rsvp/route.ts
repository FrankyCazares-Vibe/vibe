import { NextResponse } from "next/server";

import { RSVP_CAMPUS_VISITING_COPY, rsvpCampusDecision } from "@/lib/iu/campus-request";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };
type RsvpBody = { status?: unknown };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * May the viewer RSVP to this event? Two refusals, in this order:
 *
 * 1. The event's org is hidden. A hidden org is out of every list, and
 *    nothing new attaches to it (spec §3.4), so RSVPing to its events answers
 *    the same 404 as an event id that doesn't exist.
 * 2. The event is on another campus (S67 E3): 403 `campus_visiting`. Any
 *    verified student may LOOK AROUND another campus, but RSVP works at home.
 *    The event's campus is its club's, else its creator's home campus; the
 *    rule itself is `rsvpCampusDecision` (pure, unit-tested), which refuses
 *    only when both campuses are known and differ, and never refuses a
 *    member of the event's club (members keep their clubs wherever home is).
 *
 * Every read is SERVICE-role: `orgs_select` hides a hidden org from
 * non-members, so on the viewer's own client `hidden_at` would come back as
 * "no such org" and be indistinguishable from an event with no org at all
 * (critic A5, the same trap the events list avoids). Any read failure fails
 * closed.
 *
 * Returns null when the RSVP may proceed, or the response to send.
 */
async function rsvpBlocked(eventId: string, viewerId: string) {
  const service = createSupabaseServiceClient();
  const [eventRes, viewerRes] = await Promise.all([
    service.from("events").select("id, org_id, creator_id").eq("id", eventId).maybeSingle(),
    service.from("users").select("campus_id").eq("id", viewerId).maybeSingle(),
  ]);
  const { data: event, error } = eventRes;
  if (error) {
    console.error("[events/:id/rsvp event load]", error);
    return fail(500, "request_failed", "Request failed");
  }
  if (!event) {
    return fail(404, "not_found", "Event not found");
  }
  const { org_id: orgId, creator_id: creatorId } = event as {
    org_id: string | null;
    creator_id: string | null;
  };

  let orgCampusId: string | null = null;
  if (orgId) {
    const { data: org, error: orgErr } = await service
      .from("orgs")
      .select("hidden_at, campus_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("[events/:id/rsvp org load]", orgErr);
      return fail(500, "request_failed", "Request failed");
    }
    if (org?.hidden_at) {
      return fail(404, "not_found", "Event not found");
    }
    orgCampusId = (org?.campus_id as string | null | undefined) ?? null;
  }

  if (viewerRes.error) {
    console.error("[events/:id/rsvp viewer load]", viewerRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const viewerCampusId = viewerRes.data?.campus_id ?? null;
  // Nothing to compare without a home campus; skip the creator read.
  if (!viewerCampusId) return null;

  // An org-less event (or a club with no campus yet) is on its creator's campus.
  let creatorCampusId: string | null = null;
  if (!orgCampusId && creatorId) {
    const { data: creator, error: creatorErr } = await service
      .from("users")
      .select("campus_id")
      .eq("id", creatorId)
      .maybeSingle();
    if (creatorErr) {
      console.error("[events/:id/rsvp creator load]", creatorErr);
      return fail(500, "request_failed", "Request failed");
    }
    creatorCampusId = (creator?.campus_id as string | null | undefined) ?? null;
  }

  if (rsvpCampusDecision({ orgCampusId, creatorCampusId, viewerCampusId }) === "ok") return null;

  // Away from home, members of the event's club still RSVP: members keep their
  // clubs wherever home is. Read only on the refusal path, so a home-campus
  // RSVP costs nothing extra.
  if (orgId) {
    const { data: membership, error: memberErr } = await service
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", viewerId)
      .maybeSingle();
    if (memberErr) {
      console.error("[events/:id/rsvp membership load]", memberErr);
      return fail(500, "request_failed", "Request failed");
    }
    if (membership) return null;
  }
  return fail(403, "campus_visiting", RSVP_CAMPUS_VISITING_COPY);
}

/**
 * PUT /api/events/[id]/rsvp — set or update the viewer's RSVP. `status`
 * accepts 'going' | 'maybe' (UI label: Interested). Call DELETE to remove.
 *
 * Idempotent: posting the same status twice is fine. Posting a different
 * status overwrites.
 *
 * Plan §2.6 (B8): this route had neither a rate limit nor a Terms gate, the
 * only write on the campus tab without them. Both are here now. An event
 * whose org is hidden answers 404 (spec §3.4); an event on a campus that
 * isn't the viewer's home answers 403 `campus_visiting` (S67 E3).
 */
export async function PUT(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return fail(400, "invalid_event_id", "Missing event id");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // 60 per 10 minutes: a student tapping Going / Interested across a full
  // campus tab stays far under it, a script walking every event does not.
  const rl = await rateLimit(`rsvp:${user.id}`, { limit: 60, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: RsvpBody;
  try {
    body = (await req.json()) as RsvpBody;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (status !== "going" && status !== "maybe") {
    return fail(400, "invalid_status", "status must be 'going' or 'maybe'");
  }

  const blocked = await rsvpBlocked(id, user.id);
  if (blocked) return blocked;

  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { event_id: id, user_id: user.id, status },
      { onConflict: "event_id,user_id" },
    );

  if (error) {
    console.error("[events/:id/rsvp PUT]", error);
    return fail(500, "request_failed", "Request failed");
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/events/[id]/rsvp — remove the viewer's RSVP. Idempotent:
 * deleting zero rows is success.
 *
 * DELIBERATELY NOT GATED ON THE HIDDEN ORG, THE CAMPUS OR TERMS, unlike PUT.
 * A student who RSVP'd at home and later moved home campus can still take
 * their name off (S67 E3). Spec §4.2 lists both verbs under the hidden-org
 * 404, but §3.4 also promises that a
 * member of a hidden org keeps "their own RSVPs and calendar entries — no
 * change", and `/api/me/upcoming-events` still shows them. Refusing the
 * removal would strand a student with an RSVP they can see and cannot cancel,
 * which is a worse outcome than letting them take their name off a list
 * nobody else can find. Taking something back is never the write a consent
 * gate is protecting, so Terms guards PUT only. The rate limit applies to both.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return fail(400, "invalid_event_id", "Missing event id");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const rl = await rateLimit(`rsvp:${user.id}`, { limit: 60, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("event_id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[events/:id/rsvp DELETE]", error);
    return fail(500, "request_failed", "Request failed");
  }
  return NextResponse.json({ ok: true });
}
