/**
 * Who gets a Delete control on a post (S68 officer tools, contract C3 in
 * `handoffs/wave-plan-s68/officer-tools.md`; ruling from
 * `handoffs/wave-plan-sec2/waveB-build.md` call 2).
 *
 * `viewer_can_delete` is true iff the post is NOT moderator-removed AND the
 * viewer is its author (an ex-officer included, for a club post they wrote),
 * OR the viewer is a CURRENT owner / admin of the post's club with no
 * suspension or ban in force. Mods can't; nobody deletes a removed post.
 *
 * `GET /api/posts/[id]` computes the flag and `DELETE /api/posts/[id]` refuses
 * with the same role rule ({@link isClubPostDeleteRole}) and the same officer
 * check (`clubOfficerMayDelete` in that route file), so the button and the
 * route can never disagree. The database says the same thing:
 * posts_delete_own / posts_delete_club_officer (20260929110000).
 *
 * PURE ON PURPOSE: `import type` only, so `viewer-can-delete.test.ts` loads it
 * with node's type stripping and no bundler.
 */

import type { OrgRole } from "../orgs/join-state";

/**
 * The club roles that may delete any post in their club: owner and admin
 * (the same roles that may publish and edit as the club). Mods moderate chat,
 * not content, so they can't.
 */
export const CLUB_POST_DELETE_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

/** True when `role` may delete another student's post in its club. */
export function isClubPostDeleteRole(role: OrgRole | null | undefined): boolean {
  return typeof role === "string" && CLUB_POST_DELETE_ROLES.includes(role);
}

/** A post's `removed_at` says a moderator took it down (any non-empty value). */
export function isModeratorRemoved(removedAt: unknown): boolean {
  return removedAt !== null && removedAt !== undefined && removedAt !== "";
}

export type ViewerDeleteFacts = {
  /** `posts.removed_at` is set. */
  removed: boolean;
  /** The viewer wrote the post. */
  isAuthor: boolean;
  /**
   * The viewer is a CURRENT owner / admin of the post's club and has no
   * restriction in force. Always false for a post with no club, and false
   * when the check could not be made (fail closed: no button).
   */
  clubOfficer: boolean;
};

/** The `viewer_can_delete` flag (contract C3). */
export function viewerCanDeletePost(facts: ViewerDeleteFacts): boolean {
  if (facts.removed) return false;
  return facts.isAuthor || facts.clubOfficer;
}
