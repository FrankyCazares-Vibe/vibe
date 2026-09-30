import { NextResponse } from "next/server";

import { refusalBody } from "@/lib/chat/types";
import { isCoreRoomKind, isCoreRoomName, loadClubOfficer } from "@/lib/club-routes/officer-guard";
import { contentBlockedResponse, requireNotRestricted } from "@/lib/moderation/access";
import { checkChangedText } from "@/lib/moderation/text-filter";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHANNEL_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;
const MIN_POSITION = 0;
const MAX_POSITION = 10000;

type Params = { params: Promise<{ slug: string; channelId: string }> };
type PatchBody = {
  name?: unknown;
  topic?: unknown;
  is_private?: unknown;
  position?: unknown;
  pinned?: unknown;
};

/**
 * Owner/admin of THIS club, and not restricted. The write runs on the service
 * role, so the policies' `NOT is_restricted_now()` never runs: the route asks
 * (security wave 2, A5b). `loadClubOfficer` answers a stranger asking about a
 * hidden club with 404, not the old 403 "Admin only".
 */
async function requireStaff(slug: string, channelId: string, viewerId: string) {
  const restricted = await requireNotRestricted(viewerId);
  if (restricted) return { response: restricted } as const;
  const guard = await loadClubOfficer(slug, viewerId, { channelId });
  if (!guard.ok) {
    return {
      response: NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }),
    } as const;
  }
  if (!guard.channel) {
    return {
      response: NextResponse.json({ ok: false, error: "Channel not found" }, { status: 404 }),
    } as const;
  }
  return { org: guard.org, channel: guard.channel, service: guard.service } as const;
}

/** 409 `room_locked`: "This room can't be renamed, hidden or deleted." */
function roomLocked() {
  return NextResponse.json(refusalBody("room_locked"), { status: 409 });
}

/**
 * PATCH /api/orgs/[slug]/channels/[channelId]
 * Body: { name?, topic?, is_private?, position? }
 * Permissions: owner/admin only.
 *
 * Renames must stay slug-shaped + unique within the org.
 *
 * Chat rooms, wave 1 (wave-1-contracts.md section 8), by the room's `kind`:
 *   - board, lounge, officers: a new name or a new `is_private` is refused,
 *     409 `room_locked`; `topic`, `position` and `pinned` are allowed. A
 *     `name` or `is_private` equal to what the room already has changes
 *     nothing and is not a refusal: the settings screen sends all three
 *     fields on every save, and the topic must stay editable.
 *   - event: everything is refused, 409 `room_locked` (its name follows the
 *     event's title).
 *   - room: renaming it to `board`, `lounge` or `officers` (any case) is
 *     refused, 409 `room_locked`.
 *   - kind unreadable (a database without `channels.kind`): what this route
 *     did before, its own row purge included (section 3.10).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, channelId, user.id);
  if ("response" in guard) return guard.response;

  const kind = guard.channel.kind;
  const coreRoom = isCoreRoomKind(kind);
  // Whatever the body says.
  if (kind === "event") return roomLocked();

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `null`, a number or an array parse fine but are not a body: same answer.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  const sentName = typeof body.name === "string" ? body.name.trim().toLowerCase() : null;
  const renamed = sentName !== null && sentName !== guard.channel.name.trim().toLowerCase();
  if (renamed && kind !== null && (coreRoom || isCoreRoomName(sentName))) return roomLocked();
  if (coreRoom && typeof body.is_private === "boolean" && body.is_private !== guard.channel.is_private) {
    return roomLocked();
  }

  // A core room's name can only arrive here unchanged: not written.
  if (typeof body.name === "string" && !coreRoom) {
    const v = body.name.trim().toLowerCase();
    if (!CHANNEL_NAME_RE.test(v)) {
      return NextResponse.json(
        { ok: false, error: "Channel name must be 2–31 chars, lowercase letters/numbers/_-" },
        { status: 400 }
      );
    }
    // Uniqueness within the org (excluding self). `limit(1)`, not
    // `maybeSingle()`: names are not unique in the table (an event's chat is
    // named after its title), and `maybeSingle()` answers "no row" with an
    // error when two rows match, which read as "no clash".
    const { data: clash, error: clashErr } = await guard.service
      .from("channels")
      .select("id")
      .eq("org_id", guard.org.id)
      .eq("name", v)
      .neq("id", channelId)
      .limit(1);
    if (clashErr) {
      // Unknown whether the name is free: never write on a guess.
      console.error("[orgs/[slug]/channels/[channelId] PATCH name clash]", clashErr);
      return NextResponse.json({ ok: false, error: "Failed to update channel" }, { status: 500 });
    }
    if ((clash ?? []).length > 0) {
      return NextResponse.json({ ok: false, error: "Channel name already exists" }, { status: 409 });
    }
    // Every member reads the name and topic; the word filter judges only
    // what changed, so an old name never blocks a pin or a reorder.
    if (!checkChangedText(v, guard.channel.name).ok) return contentBlockedResponse("name");
    patch.name = v;
  }

  if (typeof body.topic === "string" || body.topic === null) {
    const topic = typeof body.topic === "string" ? body.topic.slice(0, 200) : null;
    if (!checkChangedText(topic, guard.channel.topic).ok) return contentBlockedResponse("topic");
    patch.topic = topic;
  }
  // A core room's `is_private` can only arrive here unchanged: not written.
  if (typeof body.is_private === "boolean" && !coreRoom) {
    patch.is_private = body.is_private;
  }
  if (body.position !== undefined) {
    const pos = body.position;
    if (
      typeof pos !== "number" ||
      !Number.isInteger(pos) ||
      pos < MIN_POSITION ||
      pos > MAX_POSITION
    ) {
      return NextResponse.json(
        { ok: false, error: `position must be an integer ${MIN_POSITION}–${MAX_POSITION}` },
        { status: 400 }
      );
    }
    patch.position = pos;
  }
  if (typeof body.pinned === "boolean") {
    patch.pinned = body.pinned;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data: updated, error } = await guard.service
    .from("channels")
    .update(patch)
    .eq("id", channelId)
    .select("id, name, topic, is_private, pinned, position, created_at, parent_channel_id")
    .single();
  if (error || !updated) {
    console.error("[orgs/[slug]/channels/[channelId] PATCH]", error);
    return NextResponse.json({ ok: false, error: "Failed to update channel" }, { status: 500 });
  }

  // Public → private flip: drop the legacy auto-subscription rows. Every
  // org member got a `channel_members` row while the channel was public;
  // leaving them would keep read access through older policies. Owner /
  // admin still auto-pass via can_view_org_channel; everyone else must be
  // re-added to the explicit allow list.
  //
  // Where `kind` can be read the database does this itself
  // (`chat_channels_subscribe`, in the same statement as the flip), so the
  // purge here runs only on a database without the column.
  if (patch.is_private === true && guard.channel.is_private === false && kind === null) {
    const { error: purgeErr } = await guard.service
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId);
    if (purgeErr) {
      console.error("[orgs/[slug]/channels/[channelId] PATCH purge-members]", purgeErr);
    }
  }
  return NextResponse.json({ ok: true, channel: updated });
}

/**
 * DELETE /api/orgs/[slug]/channels/[channelId]
 * Permissions: owner/admin only. Cascades to messages (FK ON DELETE CASCADE
 * on messages.channel_id, set up in the original Phase 1 schema).
 *
 * Chat rooms, wave 1: only an extra room (`kind = 'room'`) can be deleted. A
 * Board, a Lounge, an Officers room and an event's chat answer 409
 * `room_locked` (an event's chat goes when its event is cancelled). On a
 * database without `channels.kind` every channel can be deleted, as before.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, channelId, user.id);
  if ("response" in guard) return guard.response;

  const kind = guard.channel.kind;
  if (kind !== null && kind !== "room") return roomLocked();

  const { error } = await guard.service.from("channels").delete().eq("id", channelId);
  if (error) {
    console.error("[orgs/[slug]/channels/[channelId] DELETE]", error);
    return NextResponse.json({ ok: false, error: "Failed to delete channel" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
