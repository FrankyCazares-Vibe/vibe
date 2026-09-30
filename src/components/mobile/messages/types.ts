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
   * A moderator took it down. OPTIONAL and never sent today:
   * `/api/me/threads/[id]/messages` selects an explicit column list without
   * `removed_at` or `removed_reason`, and that route is not this batch's. So
   * the card below never renders, and a student's own removed message still
   * sits in their thread looking sent.
   */
  removed_at?: string | null;
  removed_reason?: string | null;
};

export type Tab = "all" | "requests";
