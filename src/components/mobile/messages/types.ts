import { type RoomKind } from "@/lib/chat/types";

export type ThreadType = "dm" | "group" | "org";

export type ThreadPeer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  school: string | null;
};

export type ThreadMember = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
};

export type ThreadEntry = {
  id: string;
  type: ThreadType;
  name: string;
  photo_url: string | null;
  peer: ThreadPeer | null;
  /** media_kind / attachment_kind let a photo-only message preview as
   *  "Photo". Optional: older servers send only the first three. */
  last_message: {
    content: string;
    created_at: string;
    user_id: string;
    media_kind?: "image" | "video" | null;
    attachment_kind?: "post" | "clip" | null;
    /** Its sender deleted it (Oct 19, 2026): `content` is "Message deleted". */
    deleted?: boolean;
  } | null;
  /** Server-computed: the last message is someone else's and newer than
   *  the viewer's last_read_at. The API never sends last_read_at, so this
   *  flag is the only source for the unread dot and the badge. Optional
   *  because CampusMobile's synthesized org-channel entries omit it. */
  unread?: boolean;
  accepted_at: string | null;
  /** Server-computed: the viewer hasn't accepted this thread yet. Optional
   *  because CampusMobile's org-channel entries omit it (never a request). */
  is_request?: boolean;
  pinned_at?: string | null;
  hidden_at?: string | null;
  muted_until?: string | null;
  members?: ThreadMember[];
  viewer_role?: "admin" | "member";
  /** Club chat v1: set on a club's room only ("Salsa Club · Lounge"). Such
   *  a thread can't be left, deleted from the inbox or sent photos. Absent
   *  on a dm, a group, and from a server without the chat schema. */
  room_kind?: RoomKind;
  /** Club chat v1: false on a Board for anyone who isn't an officer. */
  can_post?: boolean;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  viewer_reacted: boolean;
};

/** A shared post/clip as joined by the messages API. Its media URLs are
 *  opaque src values — use them as-is, never parse them. */
export type MessageAttachment = {
  id: string;
  type: "post" | "clip";
  content: string | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  user_id: string;
  author: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
};

/** The message a reply quotes, as the messages API embeds it. The two
 *  kinds let a stub for a photo or shared-post parent say so; older
 *  servers omit them. */
export type ParentPreview = {
  id: string;
  content: string | null;
  user_id: string;
  author: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
  media_kind?: "image" | "video" | null;
  attachment_kind?: "post" | "clip" | null;
  /** The quoted message was deleted by its sender (Oct 19, 2026); `content` then reads "Message deleted". */
  deleted?: boolean;
};

export type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users?: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
  /** Inline photo/video. media_url is an opaque same-origin src (the
   *  server redirects it to storage) — never parse it. */
  media_url?: string | null;
  media_kind?: "image" | "video" | null;
  /** Shared post/clip. `attachment` is null when the post isn't visible to
   *  the viewer, or was deleted — then attachment_id is nulled too (FK is
   *  ON DELETE SET NULL) and only attachment_kind remains. */
  attachment_id?: string | null;
  attachment_kind?: "post" | "clip" | null;
  attachment?: MessageAttachment | null;
  parent_message_id?: string | null;
  /** Set on a reply; null when the parent was deleted (FK is ON DELETE
   *  SET NULL, so the stub quietly goes away). */
  parent_preview?: ParentPreview | null;
  reactions?: MessageReaction[];
  /**
   * It was taken down, and the viewer is its sender (nobody else is served
   * the row): who did it, when, and a moderator's reason. The thread read
   * sends it (`removedInfo` in src/lib/chat/message-read.ts); null or absent
   * on every other message.
   */
  removed?: { by: "officer" | "moderator"; at: string; reason: string | null } | null;
  /**
   * A stub: a message hidden from the viewer by a block in a club room
   * (wave-2 contract 8.1). The screens filter these out of the array before
   * grouping (12.1); never sent for a dm or a group.
   */
  hidden?: boolean;
  /**
   * Its sender deleted it (Oct 19, 2026, decision 8): the bubble is the grey
   * "Message deleted" line, with no words, file, quote, reactions or menu.
   */
  deleted?: boolean;
};

export type Tab = "all" | "requests";
