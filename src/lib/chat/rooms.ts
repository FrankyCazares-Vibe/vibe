/**
 * The room rules that need a database client
 * (handoffs/chat-redesign/wave-1-contracts.md section 8, second bullet).
 *
 * SIGNATURE STUB (batch B0). Batch B1b owns this file and fills the four
 * bodies in its first commit; until then every call throws, so nothing can
 * ship on a stub by accident. The names, parameters and return types are the
 * contract's: B4 and wave 2 build against them as they stand here.
 *
 * The pure rules (`postRefusal`, `canModerate`, `outranks`, `clubRoomLabel`,
 * the two role lists) live in room-rules.ts.
 */

import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ClubRole, Room } from "./types";

/** The viewer's cookie client: RLS and `auth.uid()` answer for the person asking. */
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const NOT_BUILT = "rooms.ts: not built yet (B1b)";

/**
 * The room behind a channel id, read with the service role: its kind, name,
 * club and, for an event's chat, the event. Null for a dm, a group, an id
 * that names nothing, or a database without `channels.kind`.
 *
 * It answers "what is this room", never "may this person see it":
 * `ensureMember` is asked first.
 */
export async function loadRoom(channelId: string): Promise<Room | null> {
  void channelId;
  throw new Error(NOT_BUILT);
}

/**
 * May this person send this message here? The yes / no of
 * `can_post_org_channel(cid, uid, root)`, asked through the viewer's cookie
 * `client`. `rootId` is null for a new top-level message and the Board
 * post's id for a reply.
 *
 * On a database without the function it answers true, today's rule (section
 * 3.10). After a no, `postRefusal` (room-rules.ts) picks the code.
 */
export async function canPost(
  client: ServerClient,
  channelId: string,
  userId: string,
  rootId: string | null,
): Promise<boolean> {
  void client;
  void channelId;
  void userId;
  void rootId;
  throw new Error(NOT_BUILT);
}

/**
 * Of `userIds`, the people who can read THIS room (service role). The
 * @mention fan-out notifies only them, so a mention in a private room never
 * reaches a member who cannot open it (section 6.2).
 */
export async function filterRoomReaders(channelId: string, userIds: string[]): Promise<string[]> {
  void channelId;
  void userIds;
  throw new Error(NOT_BUILT);
}

/**
 * This person's role in this club (service role), or null when they are not
 * a member (any more).
 */
export async function clubRole(orgId: string, userId: string): Promise<ClubRole | null> {
  void orgId;
  void userId;
  throw new Error(NOT_BUILT);
}
