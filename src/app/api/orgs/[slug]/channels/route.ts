import { NextResponse } from "next/server";

import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { refusalBody } from "@/lib/chat/types";
import { isCoreRoomName, loadClubOfficer } from "@/lib/club-routes/officer-guard";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const CHANNEL_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;

/** What the list sent before chat rooms, and still sends on a database without `channels.kind`. */
const LIST_COLUMNS = "id, name, topic, is_private, pinned, position, created_at, parent_channel_id";

type Params = { params: Promise<{ slug: string }> };
type CreateBody = {
  name?: unknown;
  topic?: unknown;
  is_private?: unknown;
  position?: unknown;
};

/**
 * GET /api/orgs/[slug]/channels — list visible channels for this org. RLS
 * filters out private channels for non-staff via can_view_org_channel().
 *
 * Channels are for members. The org and the viewer's role load on the SERVICE
 * client: `orgs_select` hides a private org from non-members, so the user
 * client answered every non-member of an invite-only club with 404 and the org
 * page printed a red "Couldn't load" line. Non-members now get 403
 * `members_only`, or 404 `not_found` when the org is hidden (a hidden org does
 * not exist to anyone outside it). The channels read itself stays on the USER
 * client so `can_view_org_channel` keeps filtering private channels.
 *
 * Chat rooms, wave 1 (wave-1-contracts.md section 8): every row carries its
 * `kind`, and an event's chat (`kind = 'event'`) is left out: this is the old
 * list, and event chats are reached from their event. On a database without
 * `channels.kind` the answer is the one from before (section 3.10).
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data: org, error: orgError } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgError) {
    console.error("[orgs/[slug]/channels GET] org", orgError);
    return NextResponse.json(
      { ok: false, error: "Failed to load channels", code: "load_failed" },
      { status: 500 },
    );
  }
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  const { data: membership, error: memberError } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) {
    console.error("[orgs/[slug]/channels GET] membership", memberError);
    return NextResponse.json(
      { ok: false, error: "Failed to load channels", code: "load_failed" },
      { status: 500 },
    );
  }
  if (!membership?.role) {
    return org.hidden_at
      ? NextResponse.json(
          { ok: false, error: "Not found", code: "not_found" },
          { status: 404 },
        )
      : NextResponse.json(
          { ok: false, error: "Channels are for members", code: "members_only" },
          { status: 403 },
        );
  }

  const orgId = org.id as string;
  async function readChannels(withKind: boolean) {
    const base = supabase
      .from("channels")
      .select(withKind ? `${LIST_COLUMNS}, kind` : LIST_COLUMNS)
      .eq("org_id", orgId);
    // Written as "no kind, or a kind that is not event": a plain `neq` would
    // also drop a row whose kind is null.
    const rooms = withKind ? base.or("kind.is.null,kind.neq.event") : base;
    return rooms
      .order("pinned", { ascending: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
  }
  let { data, error } = await readChannels(true);
  if (error && isMissingChatSchema(error)) {
    warnMissingChatSchemaOnce("orgs/[slug]/channels GET");
    const bare = await readChannels(false);
    data = bare.data;
    error = bare.error;
  }
  if (error) {
    console.error("[orgs/[slug]/channels GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load channels", code: "load_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, channels: data || [] });
}

/**
 * POST /api/orgs/[slug]/channels — create a channel. Admin/owner only.
 * Body: { name, topic?, is_private?, position? }
 *
 * `name` must be slug-shaped (lowercase, 2–31 chars, alphanumeric/_-) so it
 * renders cleanly as `#name`. Within an org, channel names must be unique.
 *
 * Security wave 2 (A5b): the insert runs on the service role, so
 * channels_insert_authenticated (officer + consent + can_publish_now) never
 * runs; the route takes the same gate (`requireCanPublish`, Terms refused
 * first with the body `requireTermsAccepted` sent), runs the word filter on
 * the name and topic every member reads, and answers a stranger asking about
 * a hidden club with 404 (`loadClubOfficer`), not 403.
 *
 * Chat rooms, wave 1 (wave-1-contracts.md section 8): what this route makes
 * is always an extra room (`kind: 'room'`). `board`, `lounge` and `officers`
 * (any case) are the names of the three rooms every club already has: 409
 * `room_locked`. No cap on the number of rooms in v1. On a database without
 * `channels.kind` it does what it did before (section 3.10).
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const publishGate = await requireCanPublish(user.id);
  if (publishGate) return publishGate;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `null`, a number or an array parse fine but are not a body: same answer.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : null;
  const isPrivate = body.is_private === true;
  const position = typeof body.position === "number" ? body.position : 100;

  if (!CHANNEL_NAME_RE.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Channel name must be 2–31 chars, lowercase letters/numbers/_-" },
      { status: 400 }
    );
  }

  if (!checkText(name).ok) return contentBlockedResponse("name");
  if (topic && !checkText(topic).ok) return contentBlockedResponse("topic");

  // Owner/admin only for create; 404 to a stranger when the club is hidden.
  const guard = await loadClubOfficer(slug, user.id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const { org, service } = guard;

  // Check name uniqueness within the org. The same read says whether this
  // database has `channels.kind` (it asks for the column). `limit(1)`, not
  // `maybeSingle()`: names are not unique in the table (an event's chat is
  // named after its title), and `maybeSingle()` answers "no row" with an
  // error when two rows match, which read as "no clash".
  async function readNameClash(withKind: boolean) {
    return service
      .from("channels")
      .select(withKind ? "id, kind" : "id")
      .eq("org_id", org.id)
      .eq("name", name)
      .limit(1);
  }
  let hasRoomKinds = true;
  let clash = await readNameClash(true);
  if (clash.error && isMissingChatSchema(clash.error)) {
    hasRoomKinds = false;
    warnMissingChatSchemaOnce("orgs/[slug]/channels POST");
    clash = await readNameClash(false);
  }
  // Before the clash answer: every club has a lounge, so "lounge" would
  // otherwise read as "already exists" and the screen would not know why. A
  // read that failed for another reason is never "old database": still locked.
  if (hasRoomKinds && isCoreRoomName(name)) {
    return NextResponse.json(refusalBody("room_locked"), { status: 409 });
  }
  if (clash.error) {
    // Unknown whether the name is free: never write on a guess.
    console.error("[orgs/[slug]/channels POST name clash]", clash.error);
    return NextResponse.json({ ok: false, error: "Failed to create channel" }, { status: 500 });
  }
  if ((clash.data ?? []).length > 0) {
    return NextResponse.json({ ok: false, error: "Channel name already exists" }, { status: 409 });
  }

  async function insertRoom(withKind: boolean) {
    return service
      .from("channels")
      .insert({
        org_id: org.id,
        type: "org_channel",
        name,
        topic,
        is_private: isPrivate,
        position,
        ...(withKind ? { kind: "room" } : {}),
      })
      .select("id, name, topic, is_private, pinned, position, created_at")
      .single();
  }
  let { data: created, error } = await insertRoom(hasRoomKinds);
  if (hasRoomKinds && error && isMissingChatSchema(error)) {
    warnMissingChatSchemaOnce("orgs/[slug]/channels POST");
    const bare = await insertRoom(false);
    created = bare.data;
    error = bare.error;
  }
  if (error || !created) {
    console.error("[orgs/[slug]/channels POST]", error);
    return NextResponse.json({ ok: false, error: "Failed to create channel" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, channel: created }, { status: 201 });
}
