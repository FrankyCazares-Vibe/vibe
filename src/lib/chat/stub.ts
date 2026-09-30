/**
 * Blocking in club rooms, both ways (handoffs/chat-redesign/wave-2-contracts.md
 * section 8): the rule that hides a message from a viewer (8.2) and the stub
 * that takes its place in the page (8.1).
 *
 * PURE: `room-rules.ts` (a list) and types are the only imports, so
 * `node --test` loads it (stub.test.ts) and the screens could import it.
 *
 * The rule, 8.2:
 *
 *   hidden = room !== null
 *         && blocked.has(row.user_id)
 *         && !(room.kind === "board" && row.thread_root_id === null && authorRole ∈ BOARD_POSTER_ROLES)
 *
 * `room !== null` first: a dm or a group never stubs (and never reads
 * `blocks`). `blocked` is the viewer's block set both ways, the viewer
 * removed (blocks.ts `blockedIdsFor`), so the viewer's own rows are never
 * stubs. `authorRole` is the author's CURRENT role from the page's
 * `org_members` read. The one exception (Franky, Sept 29): a top-level Board
 * post by a current officer shows to every member; a reply never does, and
 * a demoted or departed officer's old posts become stubs.
 */

import { BOARD_POSTER_ROLES } from "./room-rules";
import type { ChatMessage, ClubRole, Room } from "./types";

/** What the rule reads of a message row. */
export type HiddenInput = { user_id: string; thread_root_id?: string | null };

/** What the stub keeps of a message row: the three fields the screens key and page on. */
export type StubInput = { id: string; created_at: string; thread_root_id?: string | null };

export function isHiddenFrom(
  row: HiddenInput,
  blocked: ReadonlySet<string>,
  room: Room | null,
  authorRole: ClubRole | null,
): boolean {
  if (room === null) return false;
  if (!blocked.has(row.user_id)) return false;
  const officerPost =
    room.kind === "board" &&
    (row.thread_root_id ?? null) === null &&
    authorRole !== null &&
    BOARD_POSTER_ROLES.includes(authorRole);
  return !officerPost;
}

/**
 * The stub of 8.1, the exact shape: `id`, `created_at`, `thread_root_id`
 * unchanged (keys, `?after=` and `?root=` paging, the every-5th drop rule),
 * `kind: "text"` always (a card's kind would say what the hidden thing is),
 * `hidden: true`, and every other field at its empty default. `user_id: ""`
 * matches no viewer and no author. Screens render nothing for a stub and
 * keep it in the array.
 */
export function asStub(row: StubInput): ChatMessage {
  return {
    id: row.id,
    created_at: row.created_at,
    thread_root_id: row.thread_root_id ?? null,
    kind: "text",
    hidden: true,
    content: "",
    user_id: "",
    users: null,
    card: null,
    reactions: [],
    attachment: null,
    attachment_id: null,
    attachment_kind: null,
    media_url: null,
    media_kind: null,
    parent_message_id: null,
    parent_preview: null,
    reply_count: null,
    author_role: null,
    removed: null,
  };
}
