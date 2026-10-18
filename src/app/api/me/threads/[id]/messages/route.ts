import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import {
  MESSAGE_SELECT,
  MESSAGE_SELECT_BEFORE_ROOMS,
  VIEWER_OUTSIDE_ROOMS,
  cleanAfterParam,
  clampReadLimit,
  describeRoom,
  followerInRoom,
  readChatMessages,
  roomOf,
  toChatMessages,
  viewerInRoom,
  type MessageRow,
} from "@/lib/chat/message-read";
import { postRefusal } from "@/lib/chat/room-rules";
import { canPostAnswer, clubRoleAnswer, filterRoomReaders } from "@/lib/chat/rooms";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import {
  refusalBody,
  type ClubRole,
  type PostRefusalCode,
  type RefusalCode,
  type ThreadMessagesResponse,
  type ThreadRoom,
  type ViewerInRoom,
} from "@/lib/chat/types";
import {
  extractMentionHandles,
  insertMentionNotifications,
  resolveMentionedUserIds,
} from "@/lib/mentions";
import { ensureMember, isChannelMessageMediaKey } from "@/lib/messages/channel-access";
import { enqueueMessagePush, kickPushDrain } from "@/lib/push/dispatch";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { dmSendBlocked } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

const MAX_CONTENT = 4000;

type SendBody = {
  content?: unknown;
  attachment_id?: unknown;
  attachment_kind?: unknown; // 'post' | 'clip'
  media_url?: unknown;        // R2 object key (messages/<channel>/<uuid>.ext)
  media_kind?: unknown;       // 'image' | 'video'
  parent_message_id?: unknown; // quote-reply parent
  thread_root_id?: unknown;    // the Board post a reply stands under (club chat, wave 1)
};

type RouteCtx = { params: Promise<{ id: string }> };

/** A refusal from the contract's table (section 6.0): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status });
}

/** The status each send refusal answers with (contract 6.2). */
const POST_REFUSAL_STATUS: Record<PostRefusalCode, number> = {
  board_officers_only: 403,
  board_post_missing: 409,
  thread_root_not_allowed: 400,
  room_closed: 403,
  room_posters_only: 403,
};

/**
 * GET: list messages in a channel, oldest-first.
 * `?before=<iso>` paginates older messages; `?limit=<n>` caps results.
 *
 * Club chat, wave 1 (contract 6.1), all of it additive:
 *   - `?after=<a created_at the server sent, unchanged>`: the messages from
 *     that moment on, oldest first.
 *   - `?root=<messageId>`: the replies under one Board post, oldest first.
 *   - In a club room, without `root`, replies are never listed as posts.
 *   - `room` and `viewer` on every answer; `viewer_id` for club rooms too.
 * The read itself lives in src/lib/chat/message-read.ts.
 *
 * Wave 2 (handoffs/chat-redesign/wave-2-contracts.md 9.1, 9.2): in a club
 * room the viewer's block set is read ONCE here and handed to the page read
 * and to the room's description (the stubs of section 8, the quotes, the
 * people going); an `after` that is not a timestamp answers 400
 * `invalid_after`.
 *
 * Club model (Franky's calls of Oct 16): a FOLLOWER the database lets read
 * a club's Board (`can_view_org_channel`'s follower arm) gets the Board's
 * page as followers get it (counts only on cards and reactions, no reply
 * counts, no `?root=`: message-read.ts) and `viewer` = `followerInRoom`:
 * no role, nothing to post, `standing: "follower"`. Who reads is known from
 * the page's own roles read (`viewerStanding`), so nothing is asked twice.
 */
export async function GET(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  const url = new URL(req.url);
  // A blank param is a param that was not sent, as `before` has always been.
  const before = url.searchParams.get("before") || undefined;
  const afterRaw = (url.searchParams.get("after") ?? "").trim();
  const root = (url.searchParams.get("root") ?? "").trim() || undefined;
  // 1 to 200. The replies under one post come whole (at most 200) unless a
  // limit is sent.
  const limitParam = url.searchParams.get("limit");
  const limit = clampReadLimit(limitParam === null ? undefined : Number(limitParam), root !== undefined);

  // `after` is a `created_at` string this route sent, echoed unchanged.
  // Anything else never reaches the database (contract 9.2).
  let after: string | undefined;
  if (afterRaw) {
    const cleaned = cleanAfterParam(afterRaw);
    if (!cleaned) return refuse("invalid_after", 400);
    after = cleaned;
  }

  // Which room this is. `ensureMember` named a kind and the room cannot be
  // read: the read failed. Never answered as a dm, never with the defaults.
  const found = await roomOf(channelId, member);
  if (found.failed) return refuse("try_again", 503);

  // The viewer's block set, read once for the whole request in a club room
  // (contract 9.1; a dm or a group never reads it). A failed read is a read
  // that failed: never a page that shows a blocked person's messages.
  const blocked = found.room ? await blockedIdsFor(supabase, user.id) : new Set<string>();
  if (!blocked) return refuse("try_again", 503);

  // The page and the room's description side by side. The read keeps the
  // viewer's "Clear chat" line for a dm or a group, and in a club room lists
  // top-level messages only unless `root` asks for the replies under a post.
  // The viewer's role comes with the page (the same `org_members` read as the
  // authors' roles), not with the description.
  const [read, described] = await Promise.all([
    readChatMessages(
      supabase,
      channelId,
      { before, after, root, limit },
      { viewerId: user.id, access: member, room: found.room, blocked },
    ),
    found.room ? describeRoom(supabase, found.room, user.id, blocked) : Promise.resolve(null),
  ]);
  if (!read.ok) return NextResponse.json(read.body, { status: read.status });

  // A club's room. `peer_last_read_at` and `peer_typing` stay empty there
  // (read state and typing in club rooms are not in v1). On a database
  // without the chat rooms schema there is no room to describe: the answer is
  // today's data with every new field at its default (contract 3.10).
  if (member.isOrgChannel) {
    let room: ThreadRoom | null = null;
    let viewer: ViewerInRoom = VIEWER_OUTSIDE_ROOMS;
    if (found.room) {
      // A follower's viewer comes from the room alone (the Board, or 503);
      // a member's from their role and the database's answer to "may I post".
      const inRoom = !described
        ? null
        : read.viewerStanding === "follower"
          ? followerInRoom(found.room)
          : viewerInRoom(found.room, read.viewerRole, described.mayPost);
      if (!described || !inRoom) return refuse("try_again", 503);
      room = described.room;
      viewer = inRoom;
    }
    const body: ThreadMessagesResponse = {
      ok: true,
      messages: read.messages,
      viewer_id: user.id,
      peer_last_read_at: null,
      peer_typing: [],
      room,
      viewer,
    };
    return NextResponse.json(body);
  }

  // Peer last_read_at + typing — both come from the same query so we only
  // hit channel_members once per poll cycle. typing_until column is optional
  // (separate migration) so we try-include and ignore on column-missing.
  type OtherSnapshot = {
    user_id: string;
    last_read_at: string | null;
    typing_until: string | null;
    users: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
  };
  let others: OtherSnapshot[] = [];
  const tryFull = await supabase
    .from("channel_members")
    .select(
      "user_id, last_read_at, typing_until, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url)",
    )
    .eq("channel_id", channelId)
    .neq("user_id", user.id);
  if (tryFull.error && /typing_until|column/i.test(tryFull.error.message)) {
    const fallback = await supabase
      .from("channel_members")
      .select(
        "user_id, last_read_at, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url)",
      )
      .eq("channel_id", channelId)
      .neq("user_id", user.id);
    others = (fallback.data ?? []).map((o) => ({
      user_id: o.user_id as string,
      last_read_at: (o.last_read_at as string | null) ?? null,
      typing_until: null,
      users: (o.users as unknown as OtherSnapshot["users"]) ?? null,
    }));
  } else {
    others = (tryFull.data ?? []) as unknown as OtherSnapshot[];
  }

  const peerLastReadAt = others
    .map((o) => o.last_read_at ?? "")
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const now = Date.now();
  const peerTyping = others
    .filter((o) => o.users && o.typing_until && new Date(o.typing_until).getTime() > now)
    .map((o) => ({
      user_id: o.users!.id,
      handle: o.users!.handle,
      name: o.users!.name,
      avatar_url: o.users!.avatar_url,
    }));

  // Oldest-first (the read's order) so the UI can append straight to the
  // bottom. A dm or a group is not a room: `room` null, and the viewer may
  // always write a new message as far as rooms go.
  const body: ThreadMessagesResponse = {
    ok: true,
    messages: read.messages,
    viewer_id: user.id,
    peer_last_read_at: peerLastReadAt,
    peer_typing: peerTyping,
    room: null,
    viewer: VIEWER_OUTSIDE_ROOMS,
  };
  return NextResponse.json(body);
}

/**
 * POST: send a message in a channel.
 * If the sender's own row is still pending (request state), this reply
 * implicitly accepts the request.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`message-send:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Sending a message is a publishing surface: Terms, a verified school
  // email, no restriction in force. Same place the Terms gate held, after
  // the limiter. GET is untouched: a restricted student can still read.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const parentMessageIdRaw =
    typeof body.parent_message_id === "string" && body.parent_message_id.length > 0
      ? body.parent_message_id
      : null;
  const attachmentId =
    typeof body.attachment_id === "string" && body.attachment_id.length > 0
      ? body.attachment_id
      : null;
  const attachmentKindRaw =
    typeof body.attachment_kind === "string" ? body.attachment_kind : null;
  const mediaUrlRaw =
    typeof body.media_url === "string" && body.media_url.length > 0
      ? body.media_url
      : null;
  const mediaKindRaw =
    typeof body.media_kind === "string" ? body.media_kind : null;

  if (!content && !attachmentId && !mediaUrlRaw) {
    return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ ok: false, error: "Message too long" }, { status: 400 });
  }
  if (content && !checkText(content).ok) return contentBlockedResponse("content");

  // Validate media: only accept R2 keys we'd have signed ourselves
  // (channel-scoped path), and only known kinds.
  let mediaUrl: string | null = null;
  let mediaKind: "image" | "video" | null = null;
  if (mediaUrlRaw) {
    const badKey = !isChannelMessageMediaKey(mediaUrlRaw, channelId);
    const badKind = mediaKindRaw !== "image" && mediaKindRaw !== "video";
    if (badKey || badKind) {
      // ANY media sent to a club room answers with the club rooms' rule
      // (contract 6.2), a key this route would refuse anyway included. Asked
      // only on this path, so a dm or a group answers as it always has.
      const room = await ensureMember(supabase, channelId, user.id);
      if (room.ok && room.isOrgChannel) return refuse("club_media_off", 400);
      return NextResponse.json(
        { ok: false, error: badKey ? "Invalid media key" : "Invalid media_kind" },
        { status: 400 },
      );
    }
    mediaUrl = mediaUrlRaw;
    mediaKind = mediaKindRaw === "video" ? "video" : "image";
  }

  // Verify the attachment exists and is visible to the sender (RLS gates
  // SELECT, so a SELECT that returns null = either missing or invisible —
  // both should reject). Ensure attachment_kind agrees with posts.type.
  let attachmentKind: "post" | "clip" | null = null;
  if (attachmentId) {
    if (attachmentKindRaw !== "post" && attachmentKindRaw !== "clip") {
      return NextResponse.json(
        { ok: false, error: "Invalid attachment_kind" },
        { status: 400 },
      );
    }
    const { data: post } = await supabase
      .from("posts")
      .select("id, type")
      .eq("id", attachmentId)
      .maybeSingle();
    if (!post) {
      return NextResponse.json(
        { ok: false, error: "Attachment not found" },
        { status: 404 },
      );
    }
    const expected = post.type === "clip" ? "clip" : "post";
    if (attachmentKindRaw !== expected) {
      return NextResponse.json(
        { ok: false, error: "Attachment kind mismatch" },
        { status: 400 },
      );
    }
    attachmentKind = expected;
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  // ── The club rooms gate (contract 6.2), before anything is written ────────
  // The database decides (`can_post_org_channel`, asked as the sender); this
  // route only turns its no into the contract's code and sentence. The insert
  // policy below is the second wall.

  // No photos or videos in club rooms in v1.
  if (member.isOrgChannel && mediaUrlRaw) return refuse("club_media_off", 400);

  // ONLY MEMBERS TYPE (club model, Franky's call of Oct 16). A follower may
  // read a club's Board, so `ensureMember` lets them this far; a send by
  // anyone without a role in the club stops here, before the gate, the
  // insert and the mention fan-out (critique #3). The database refuses it
  // too (`can_post_org_channel`, the insert policy). A role that could not
  // be read is a read that failed, never "Members only.".
  let senderRole: ClubRole | null = null;
  if (member.isOrgChannel) {
    const answer = await clubRoleAnswer(member.orgId, user.id);
    if (answer === "failed") return refuse("try_again", 503);
    if (answer === null) return refuse("members_only", 403);
    senderRole = answer;
  }

  // `thread_root_id`, cleaned ONCE: the same value goes to the gate, to
  // `postRefusal` and to the insert. Blank is no root. There but not text
  // (a number, a list) is a root that can never name a post.
  const rootRaw = body.thread_root_id;
  if (rootRaw !== undefined && rootRaw !== null && typeof rootRaw !== "string") {
    return refuse("thread_root_not_allowed", 400);
  }
  const rootId = typeof rootRaw === "string" && rootRaw.trim() !== "" ? rootRaw.trim() : null;

  // A dm or a group has no Board: a root sent there is refused, and nothing
  // else about them changes.
  if (!member.isOrgChannel && rootId) {
    const code = postRefusal(null, rootId, null);
    return refuse(code, POST_REFUSAL_STATUS[code]);
  }

  // A club room. `room` stays null on a database without the chat rooms
  // schema (`kind` null): there the gate answers "allowed", today's rule.
  const found = await roomOf(channelId, member);
  if (found.failed) return refuse("try_again", 503);
  const room = found.room;
  if (member.isOrgChannel) {
    const answer = await canPostAnswer(supabase, channelId, user.id, rootId);
    // The question could not be asked: nobody was refused.
    if (answer === "failed") return refuse("try_again", 503);
    if (answer === "no") {
      // The role was read a moment ago, for the members-only rule above.
      const code = postRefusal(room, rootId, senderRole);
      return refuse(code, POST_REFUSAL_STATUS[code]);
    }
  }
  const inBoard = room !== null && room.kind === "board";

  // Verify the parent message (if any) belongs to this channel — prevents
  // cross-channel quote-replies. Stale deploys without the column degrade
  // silently to a non-reply.
  // In a Board `parent_message_id` is ignored and stored null: a reply there
  // stands under its post (`thread_root_id`), it quotes nothing.
  let parentMessageId: string | null = null;
  if (parentMessageIdRaw && !inBoard) {
    const { data: parent, error: parentErr } = await supabase
      .from("messages")
      .select("id, channel_id")
      .eq("id", parentMessageIdRaw)
      .maybeSingle();
    if (parentErr) {
      console.error("[messages.POST parent check]", parentErr);
    } else if (parent && parent.channel_id === channelId) {
      parentMessageId = parentMessageIdRaw;
    } else if (parent) {
      return NextResponse.json(
        { ok: false, error: "Parent message belongs to a different channel" },
        { status: 400 },
      );
    }
    // No row found → silently drop the parent rather than rejecting the send.
  }

  // Block guard: in DM/group channels, if any peer blocks the sender (or
  // vice versa), reject the send. Skipped on org channels — orgs are larger
  // groups where one block shouldn't silence a whole community channel.
  // Fails CLOSED (T2 E): if the check can't run, nothing is sent. The
  // messages_insert_member policy refuses the same sends in the database.
  if (!member.isOrgChannel) {
    const check = await dmSendBlocked(supabase, channelId, user.id);
    if (!check.ok) {
      console.error("[messages.POST block-check]", check.error);
      return NextResponse.json(
        { ok: false, error: "Request failed", code: "block_check_failed" },
        { status: 500 },
      );
    }
    if (check.blocked) {
      return NextResponse.json(
        { ok: false, error: "Couldn't send this message" },
        { status: 403 },
      );
    }
  }

  const insertRow: Record<string, string | null> = {
    channel_id: channelId,
    user_id: user.id,
    content: content,
    attachment_id: attachmentId,
    attachment_kind: attachmentKind,
    media_url: mediaUrl,
    media_kind: mediaKind,
    parent_message_id: parentMessageId,
  };
  // Only a reply carries the column: every other send writes the same row
  // it always has. `kind` is never written here (this route sends text, the
  // column's default).
  if (rootId) insertRow.thread_root_id = rootId;

  // The insert stays on the sender's own client: the policies are the wall.
  let insertResult = await supabase
    .from("messages")
    .insert(insertRow)
    .select(MESSAGE_SELECT)
    .single();
  // A database without the chat rooms columns (contract 3.10). A reply cannot
  // be stored there, and is never sent as something else. Any other message
  // is sent again whole, read back with the columns the database has.
  if (insertResult.error && isMissingChatSchema(insertResult.error)) {
    warnMissingChatSchemaOnce("messages.POST");
    if (rootId) return refuse("try_again", 503);
    insertResult = await supabase
      .from("messages")
      .insert(insertRow)
      .select(MESSAGE_SELECT_BEFORE_ROOMS)
      .single();
  }
  // Defensive for migration lag — if either pair of optional columns is
  // missing, retry with the bare minimum so the message still goes through.
  // Never for a reply: the bare row has no `thread_root_id`, and the reply
  // would land on the Board as a post.
  if (insertResult.error && /attachment|media|column/i.test(insertResult.error.message)) {
    if (rootId) {
      console.error("[messages.POST insert] reply not sent", insertResult.error);
      return refuse("try_again", 503);
    }
    insertResult = await supabase
      .from("messages")
      .insert({ channel_id: channelId, user_id: user.id, content })
      .select(
        "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)",
      )
      .single();
  }
  const { data: inserted, error: insErr } = insertResult;

  if (insErr || !inserted) {
    if (member.isOrgChannel && insErr?.code === "42501") {
      // The gate said yes and the policy said no. Asked once more: the world
      // may have moved in between (the event's week ended, the Board post was
      // deleted, the sender left the club), and then the send is refused with
      // the code of what changed.
      const again = await canPostAnswer(supabase, channelId, user.id, rootId);
      if (again === "no") {
        const role = await clubRoleAnswer(member.orgId, user.id);
        // They left the club in between: only members type.
        if (role === null) return refuse("members_only", 403);
        const code = postRefusal(room, rootId, role === "failed" ? null : role);
        return refuse(code, POST_REFUSAL_STATUS[code]);
      }
      // The gate still says yes (or cannot be asked) while the policy says
      // no: the two disagree, which the contract calls a bug (6.2). A 500,
      // and said in the log.
      console.error(
        "[messages.POST insert] CONTRACT BUG: can_post_org_channel allowed a send the insert policy refused",
        { channelId, kind: room?.kind ?? null, reply: rootId !== null, gateAgain: again },
      );
    }
    console.error("[messages.POST insert]", insErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Push: a DM or group message queues one push per other member and drains
  // them in the same after() callback, so the drain can't run before the rows
  // exist. It returns at once, never throws and does nothing while push is off,
  // so the send never waits on push or fails because of it. Called right after
  // the insert so a later step failing can't lose the push. Club channels
  // skip this: they push only through their @mention rows, kicked below.
  const insertedMessageId = (inserted as unknown as { id?: unknown }).id;
  if (!member.isOrgChannel && typeof insertedMessageId === "string") {
    enqueueMessagePush({ messageId: insertedMessageId, channelId, senderId: user.id });
  }

  // DM/group housekeeping: implicit-accept on first reply, bump last_read_at.
  // Org channels skip both — they don't use channel_members.
  if (!member.isOrgChannel) {
    if (member.accepted_at === null) {
      const { error: accErr } = await supabase
        .from("channel_members")
        .update({ accepted_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", user.id);
      if (accErr) {
        console.error("[messages.POST implicit-accept]", accErr);
        // Non-fatal; the message went through.
      }
    }
    await supabase
      .from("channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);
  }

  // @mention fan-out — only notifies people who can actually see this
  // channel, so a stray @somebody outside the chat doesn't ping strangers.
  // For DM/group: members come from channel_members. For a club's room: the
  // club's MEMBERS who can read THAT room (`can_view_org_channel`, one by
  // one), so a mention in Officers or in an event's chat never reaches a
  // member who cannot open it, and a follower reading the Board is never
  // mentioned or pushed (club model, Oct 16). A mention inside a Board reply
  // notifies that one person like any other; nothing else is written for
  // Board posts or replies.
  // Best-effort; failures don't block the send.
  if (content) {
    const handles = extractMentionHandles(content);
    if (handles.length > 0) {
      try {
        const ids = await resolveMentionedUserIds(supabase, handles, user.id);
        if (ids.length > 0) {
          let validTargets: string[] = [];
          if (member.isOrgChannel) {
            validTargets = await filterRoomReaders(channelId, ids, member.orgId);
          } else {
            const { data: chMembers } = await supabase
              .from("channel_members")
              .select("user_id")
              .eq("channel_id", channelId)
              .in("user_id", ids);
            validTargets = (chMembers ?? []).map((m) => m.user_id as string);
          }
          const insertedRow = inserted as { id?: string } | null;
          if (validTargets.length > 0 && insertedRow?.id) {
            // Students can't insert notifications; the service role writes
            // them, only after the send above succeeded. actorId is the
            // session user.
            if (!isSupabaseServiceConfigured()) {
              console.error("[messages.POST mentions] service role not configured");
            } else {
              const mentioned = await insertMentionNotifications(createSupabaseServiceClient(), {
                actorId: user.id,
                targetUserIds: validTargets,
                kind: "message",
                messageId: insertedRow.id,
              });
              // A club chat pushes only through these rows (their trigger
              // queued them), so drain once any were written. In a DM or
              // group the message push above already covers the mention.
              if (member.isOrgChannel && mentioned.inserted > 0) kickPushDrain();
            }
          }
        }
      } catch (e) {
        console.error("[messages.POST mentions]", e);
      }
    }
  }

  // Same client shape as the GET (`ChatMessage`): proxy media URLs, the
  // parent preview so the optimistic-render quote stub is correct, the new
  // fields, and none of the columns that are only read. A new row has no
  // reactions and no replies yet, so neither is looked up.
  const [message] = await toChatMessages(supabase, [inserted as unknown as MessageRow], {
    channelId,
    viewerId: user.id,
    room,
    skipReplyCounts: true,
    skipReactions: true,
  });
  return NextResponse.json({ ok: true, message: message ?? null });
}
