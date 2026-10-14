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
 * PURE ON PURPOSE: no imports, so `feed-actions.test.ts` loads it with node's
 * type stripping and no bundler.
 */

/** One row of the sheet, top to bottom; Cancel always closes it. */
export type PostSheetRow = "send" | "copy" | "edit" | "report" | "delete" | "block";

export type PostSheetFacts = {
  /** The viewer wrote the post (its author, club posts included). */
  isOwner: boolean;
  /** The server's `viewer_can_delete` is exactly true; missing = false. */
  viewerCanDelete: boolean;
  /** `removed_at` is set: a moderator took it down. */
  removed: boolean;
  /** The author's id is known, so "Block author" has someone to block. */
  canBlock: boolean;
};

/**
 * The rows, in order. Your own post: Send to chats, Copy link, Edit post,
 * Delete post. Anyone else's: Send to chats, Copy link, Report post, then
 * Delete post for a club officer (the desktop menu's order), then Block author.
 */
export function postSheetRows(facts: PostSheetFacts): PostSheetRow[] {
  const rows: PostSheetRow[] = ["send", "copy"];
  const canDelete = facts.viewerCanDelete && !facts.removed;
  if (facts.isOwner) {
    if (!facts.removed) rows.push("edit");
    if (canDelete) rows.push("delete");
  } else {
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
