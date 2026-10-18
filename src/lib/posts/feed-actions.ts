/**
 * Which rows the phone feed card's ⋯ "Post options" sheet shows
 * (PostActionsSheet in `src/components/mobile/CampusMobile.tsx`).
 *
 * Delete moved onto the card on Oct 14 2026 at Franky's ask, reversing the
 * Sept 16 call "Delete stays in the viewer"
 * (`handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`). It shows where
 * the desktop FeedRow menu shows it: on your own post, and for a current club
 * owner / admin on a club post someone else wrote (S68 C3/C5). Both come from
 * one server answer, `viewer_can_delete` (`viewer-can-delete.ts`), so the row
 * and `DELETE /api/posts/[id]` can't disagree. Nobody edits or deletes a
 * moderator-removed post.
 *
 * Mute a club's posts (club model, Franky, Oct 16): a club post someone else
 * wrote offers "Mute SAE's posts". It takes that club's posts out of this
 * student's feed and nothing else: a member stays in every chat, a follower
 * keeps following, and nobody who runs the club is told. The write is
 * `/api/orgs/[slug]/mute`; the feed takes the club's cards off at once (and
 * reloads), and a toast offers Undo. The same row is on the desktop feed's ⋯
 * (`campus-home.tsx` FeedRow) and in the phone post viewer's ⋯. The mute
 * lines are the club page's own (`ORG_COPY.menu`), so every surface says the
 * same thing (wave-2 repair, finding 5).
 *
 * PURE ON PURPOSE: its one import, join-copy.ts, has only type imports, so
 * `feed-actions.test.ts` loads it with node's type stripping and no bundler.
 */

import { ORG_COPY, fillCopy } from "@/lib/orgs/join-copy";

/** One row of the sheet, top to bottom; Cancel always closes it. */
export type PostSheetRow = "send" | "copy" | "mute" | "edit" | "report" | "delete" | "block";

export type PostSheetFacts = {
  /** The viewer wrote the post (its author, club posts included). */
  isOwner: boolean;
  /** The server's `viewer_can_delete` is exactly true; missing = false. */
  viewerCanDelete: boolean;
  /** `removed_at` is set: a moderator took it down. */
  removed: boolean;
  /** The author's id is known, so "Block author" has someone to block. */
  canBlock: boolean;
  /** The card shows a club (`post.org` with a handle), so "Mute <club>'s posts"
   *  has a club to mute. Missing = false: a personal post has none. */
  clubPost?: boolean;
};

/**
 * The rows, in order. Your own post: Send to chats, Copy link, Edit post,
 * Delete post. Anyone else's: Send to chats, Copy link, Mute <club>'s posts on
 * a club post, Report post, then Delete post for a club officer (the desktop
 * menu's order), then Block author. Your own club post offers no Mute: a mute
 * never hides what you wrote, so the row would do nothing you could see.
 */
export function postSheetRows(facts: PostSheetFacts): PostSheetRow[] {
  const rows: PostSheetRow[] = ["send", "copy"];
  const canDelete = facts.viewerCanDelete && !facts.removed;
  if (facts.isOwner) {
    if (!facts.removed) rows.push("edit");
    if (canDelete) rows.push("delete");
  } else {
    if (facts.clubPost === true) rows.push("mute");
    rows.push("report");
    if (canDelete) rows.push("delete");
    if (facts.canBlock) rows.push("block");
  }
  return rows;
}

/**
 * The Delete row is an officer's, on a club post someone else wrote: the
 * confirm names the club and a toast says it went (the author's own card
 * just leaves).
 */
export function deletesAsOfficer(facts: Pick<PostSheetFacts, "isOwner" | "viewerCanDelete">): boolean {
  return facts.viewerCanDelete && !facts.isOwner;
}

// ── Mute a club's posts ──────────────────────────────────────────────────────

/** The club a post card shows, as the mute needs it: its handle and its name. */
export type FeedClub = { handle: string; name: string };

/**
 * The club of a feed post's card, or null for a personal post (the feed sends
 * `org: null`, and a hidden club's card never goes out at all). The name
 * falls back to the @handle, so a row never reads "Mute 's posts".
 */
export function feedClubOf(org: { handle?: unknown; name?: unknown } | null | undefined): FeedClub | null {
  if (!org || typeof org.handle !== "string" || !org.handle.trim()) return null;
  const handle = org.handle.trim();
  const name = typeof org.name === "string" && org.name.trim() ? org.name.trim() : `@${handle}`;
  return { handle, name };
}

/** POST mutes, DELETE unmutes (`src/app/api/orgs/[slug]/mute/route.ts`). */
export function clubMuteUrl(handle: string): string {
  return `/api/orgs/${encodeURIComponent(handle)}/mute`;
}

/**
 * The ⋯ row: `Mute SAE's posts`. The words match the club page's ⋯ menu
 * (`ORG_COPY.menu` in join-copy.ts), which says "Mute posts" there because
 * the club is the page.
 */
export function muteClubRowLabel(club: FeedClub): string {
  return `Mute ${club.name}'s posts`;
}

/** The row while its request is out. */
export const MUTING_LABEL = "Muting…";

/** The toast after a mute went through; its button is {@link MUTE_UNDO_LABEL}. */
export function clubMutedLine(club: FeedClub): string {
  return fillCopy(ORG_COPY.menu.muted, { org: club.name });
}

/** The toast's button. */
export const MUTE_UNDO_LABEL = "Undo";

/** After Undo went through. */
export function clubUnmutedLine(club: FeedClub): string {
  return fillCopy(ORG_COPY.menu.unmuted, { org: club.name });
}

/** A mute that didn't go through (vibeRequest's fallback line). */
export function muteFailureLine(club: FeedClub): string {
  return fillCopy(ORG_COPY.menu.muteFailed, { org: club.name });
}

/** An Undo that didn't go through. */
export function unmuteFailureLine(club: FeedClub): string {
  return fillCopy(ORG_COPY.menu.unmuteFailed, { org: club.name });
}

/** How long the Undo toast stays: the error toast's time with an action, time to reach the button. */
export const MUTE_UNDO_MS = 8_000;

/**
 * The feed's cards once `club`'s posts are muted (wave-2 repair, finding 1):
 * the club's posts leave at once, as the server's next answer would take
 * them out (`postHiddenByOrgMute`), except the viewer's own, which a mute
 * never hides. The same list back when nothing goes.
 */
export function withoutClubPosts<T extends { org?: { handle?: unknown } | null; user_id?: string | null }>(
  posts: T[],
  club: FeedClub,
  viewerId: string | null,
): T[] {
  const handle = club.handle.toLowerCase();
  const me = viewerId?.toLowerCase() ?? null;
  const kept = posts.filter((p) => {
    const h = typeof p.org?.handle === "string" ? p.org.handle.toLowerCase() : null;
    return h !== handle || (me !== null && p.user_id?.toLowerCase() === me);
  });
  return kept.length === posts.length ? posts : kept;
}
