import { type ParentPreview, type ThreadEntry } from "./types";

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = (Date.now() - then) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function initialsOf(s: string | null | undefined): string {
  if (!s) return "?";
  return s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function threadTitle(t: ThreadEntry): string {
  if (t.type === "dm") return t.peer?.name || (t.peer?.handle ? `@${t.peer.handle}` : "Direct message");
  return t.name || "Group";
}

export function threadAvatar(t: ThreadEntry): { url: string | null; initials: string } {
  if (t.type === "dm") {
    return {
      url: t.peer?.avatar_url ?? null,
      initials: initialsOf(t.peer?.name || t.peer?.handle),
    };
  }
  return {
    url: t.photo_url ?? null,
    initials: initialsOf(t.name),
  };
}

/** The one line a quote stub or the reply pill shows: the quoted text,
 *  else what the message carried. */
export function quotedBody(p: ParentPreview): string {
  return (
    p.content?.trim() ||
    (p.media_kind === "video"
      ? "Video"
      : p.media_kind === "image"
        ? "Photo"
        : p.attachment_kind === "clip"
          ? "Shared clip"
          : p.attachment_kind === "post"
            ? "Shared post"
            : "Attachment")
  );
}

/**
 * Club chat v1: whether the viewer may post here, as far as the list entry
 * knows. Null for a club's room whose entry doesn't say (Campus > Chat hands
 * one over without `can_post`): unknown until the thread read answers.
 */
export function entryCanPost(thread: ThreadEntry | null): boolean | null {
  if (typeof thread?.can_post === "boolean") return thread.can_post;
  if (!thread || thread.type === "dm" || thread.type === "group") return true;
  return null;
}
