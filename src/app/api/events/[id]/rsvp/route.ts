import { NextResponse } from "next/server";

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
 * Is this event's org hidden? A hidden org is out of every list, and nothing
 * new attaches to it (spec §3.4), so RSVPing to its events answers the same
 * 404 as an event id that doesn't exist.
 *
 * The org read is SERVICE-role: `orgs_select` hides a hidden org from
 * non-members, so on the viewer's own client `hidden_at` would come back as
 * "no such org" and be indistinguishable from an event with no org at all
 * (critic A5, the same trap the events list avoids).
 *
 * Returns null when the RSVP may proceed, or the response to send.
 */
async function blockedByHiddenOrg(eventId: string) {
  const service = createSupabaseServiceClient();
  const { data: event, error } = await service
    .from("events")
    .select("id, org_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[events/:id/rsvp event load]", error);
    return fail(500, "request_failed", "Request failed");
  }
  if (!event) {
    return fail(404, "not_found", "Event not found");
  }
  const orgId = (event as { org_id: string | null }).org_id;
  if (!orgId) return null;

  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("hidden_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) {
    console.error("[events/:id/rsvp org load]", orgErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (org?.hidden_at) {
    return fail(404, "not_found", "Event not found");
  }
  return null;
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
 * whose org is hidden answers 404 (spec §3.4).
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

  const blocked = await blockedByHiddenOrg(id);
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
 * DELIBERATELY NOT GATED ON THE HIDDEN ORG OR ON TERMS, unlike PUT. Spec §4.2
 * lists both verbs under the hidden-org 404, but §3.4 also promises that a
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
