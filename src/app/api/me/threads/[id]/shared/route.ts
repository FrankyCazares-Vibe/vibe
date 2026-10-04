import { NextResponse } from "next/server";

import { chatV2For } from "@/lib/chat/flag-server";
import { MESSAGE_SELECT, cleanAfterParam, type MessageRow } from "@/lib/chat/message-read";
import { SHARED_READS_MAX, clampSharedLimit, toSharedItems } from "@/lib/chat/pins-read";
import { isMissingChatSchema } from "@/lib/chat/schema";
import { refusalBody, type RefusalCode, type SharedItem, type SharedResponse } from "@/lib/chat/types";
import { ensureMember } from "@/lib/messages/channel-access";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

const LOG = "shared.GET";

/** Per person and never stored: the list follows the viewer's "Clear chat history" and what RLS shows them. */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** A refusal from the contract's table (wave-3 contract 4.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status, headers: NO_STORE });
}

/**
 * GET `?before=<iso>&limit=<1..60, default 30>`: the photos, videos and
 * shared posts of a dm or a group chat, newest first: the "Shared" half of
 * the Pinned and Shared panel (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4.3, R10; the gates in its order). The thread GET does not
 * change; this reads the same `messages` rows a second way.
 *
 * Read on the VIEWER's client with the thread read's select, so RLS and the
 * same last pass decide what comes back: a removed message never, nothing
 * from before the viewer's "Clear chat history" mark, `media_url` as the
 * same-origin proxy URL (never the stored key), a shared post as the thread
 * sends it. A row whose post is gone or hidden and that has no photo or
 * video is skipped (`toSharedItems`).
 *
 * `limit + 1` rows are read: the extra one only says `has_more`. The next
 * page is `?before=<the last item's created_at>`. Because rows are skipped
 * AFTER the read, one read may leave the page short or empty while older
 * rows remain: the route then reads on from that read's last raw row, up to
 * `SHARED_READS_MAX` reads, until it has `limit` items or the rows run out.
 * `has_more` is true only beside at least one item (the client's cursor is
 * an item), so a chat whose next 4 reads are all skipped rows simply ends
 * there. A `before` that is not a timestamp the server could have sent
 * answers 400 `invalid_after`, the thread read's own code for it. Read-only,
 * so no rate limit.
 */
export async function GET(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  // 1. auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // 2. the flag (`chat_desktop` implies `chat_v2`)
  if (!(await chatV2For(user.id))) return refuse("not_found", 404);

  // 3. an [id] that cannot name a chat
  if (!isUuid(channelId)) return refuse("not_found", 404);

  // 4. membership, and a dm or a group (the panel is not built for a club room)
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status, headers: NO_STORE });
  }
  if (member.isOrgChannel) return refuse("pins_chats_only", 400);

  // 5. the page
  const params = new URL(req.url).searchParams;
  const limit = clampSharedLimit(params.get("limit"));
  const rawBefore = params.get("before");
  let before: string | null = null;
  if (rawBefore !== null && rawBefore !== "") {
    before = cleanAfterParam(rawBefore);
    if (!before) return refuse("invalid_after", 400);
  }

  // 6. the rows that carry a photo, a video or a shared post. Paged on the
  // RAW rows: a read whose rows are all skipped is followed by the next one
  // (from its last row), so the answer is never "nothing here, but more".
  const items: SharedItem[] = [];
  let cursor = before;
  let hasMore = false;
  for (let reads = 0; reads < SHARED_READS_MAX; reads += 1) {
    let query = supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("channel_id", channelId)
      .or("media_url.not.is.null,attachment_id.not.is.null")
      .is("removed_at", null);
    if (member.cleared_at) query = query.gt("created_at", member.cleared_at);
    if (cursor) query = query.lt("created_at", cursor);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit + 1);
    if (error) {
      if (isMissingChatSchema(error)) return refuse("not_found", 404);
      console.error(`[${LOG}]`, error.code, error.message);
      return refuse("try_again", 503);
    }

    const rows = (data ?? []) as unknown as MessageRow[];
    const page = rows.slice(0, limit);
    const rowsLeft = rows.length > limit;
    const found = toSharedItems(page, channelId);
    const room = limit - items.length;
    items.push(...found.slice(0, room));
    // Full: whatever this read still held, and whatever is under it, is the next page.
    if (items.length >= limit) {
      hasMore = found.length > room || rowsLeft;
      break;
    }
    // Not full. No older row with a photo, a video or a post: the end.
    hasMore = rowsLeft;
    if (!rowsLeft) break;
    // Rows were skipped and older ones remain: read on from the last RAW row.
    cursor = page[page.length - 1].created_at;
  }

  // The client asks for the next page by its last item's time: with no item
  // it could only repeat this request, so "more" is never said alone.
  const body: SharedResponse = { ok: true, items, has_more: hasMore && items.length > 0 };
  return NextResponse.json(body, { headers: NO_STORE });
}
