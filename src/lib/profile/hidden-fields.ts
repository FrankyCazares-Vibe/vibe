/**
 * What a hidden profile widget means for everyone who is NOT the profile's
 * owner (S67 security wave 2, batch A1; security report 2026-09-27 #3, #5,
 * #7 and #2b). Before this, hiding a widget only stopped the page drawing it:
 * the public bootstrap still shipped the bio, experience, skills, "working
 * on" and the résumé keys, plus the list of what was hidden.
 *
 * The rule now: for a non-owner the server blanks every hidden widget's
 * fields AND sends an empty `hidden` list, so a hidden widget looks exactly
 * like one never filled in (both surfaces already skip an empty widget for
 * visitors: profile.html `.widget-empty`, ProfileMobile's "visitors skip
 * it"). The owner always gets everything back, hidden list included.
 *
 * Callers must blank the ProfileView BEFORE `buildVibeUserV1FromProfile`:
 * the builder fills an empty tagline from the first line of `bio`, so a
 * blank after the build would still leak a hidden bio as the header tagline.
 *
 * Pure: `import type` only, so node:test loads it through a dynamic ".ts"
 * import (see hidden-fields.test.ts).
 */

import type { ProfileLayout } from "./profile-layout";

/** The slice of a profile that hiding touches. `ProfileView` satisfies it. */
export type HideableProfile = {
  bio: string;
  skills: string[];
  work_experience: unknown[];
  work_order_manual: boolean;
  current_on: unknown[];
  resume_url: string | null;
  resume_docs: unknown[];
  resume_redactions: unknown[];
  profile_layout: ProfileLayout;
};

type ResumeKeys = Pick<HideableProfile, "resume_url" | "resume_docs" | "resume_redactions">;

/**
 * The profile as a non-owner may see it. For the owner the same object comes
 * back untouched. For anyone else a copy (the input is never changed) where:
 *   bio        → ""
 *   experience → work_experience [] and work_order_manual false
 *   skills     → []
 *   working_on → current_on []
 *   resume     → resume_url null, resume_docs [] and resume_redactions []
 *   clubs      → nothing here: see clubsVisibleToViewer
 * and `profile_layout.hidden` is always [] (order and bioSide stay: all seven
 * ids are always present, so they say nothing). Posts can't be hidden.
 */
export function blankHiddenWidgets<T extends HideableProfile>(
  profile: T,
  opts: { isOwner: boolean },
): T {
  if (opts.isOwner) return profile;
  const layout = profile.profile_layout;
  const hidden = new Set<string>(layout.hidden);
  const out: T = {
    ...profile,
    profile_layout: { ...layout, order: layout.order.slice(), hidden: [] },
  };
  const w = out as HideableProfile;
  if (hidden.has("bio")) w.bio = "";
  if (hidden.has("experience")) {
    w.work_experience = [];
    w.work_order_manual = false;
  }
  if (hidden.has("skills")) w.skills = [];
  if (hidden.has("working_on")) w.current_on = [];
  if (hidden.has("resume")) Object.assign(w, noResume());
  return out;
}

/**
 * The Clubs widget (Oct 18 2026). Its rows are not on the ProfileView (the
 * bootstrap reads them from org_members, `?clubs=1`), so blankHiddenWidgets
 * can't empty them; the route asks this instead, BEFORE blanking, while
 * `hidden` still says what the owner hid. False → the route sends `clubs: []`
 * without reading them, so a hidden Clubs reads like one with no clubs shown
 * (the section and the chips under the name both draw nothing). Each club's
 * own "Hide from my profile" stays the finer switch. The Map's club zones
 * read both: campus-map/zone asks this too, for every member it would list.
 */
export function clubsVisibleToViewer(f: { isOwner: boolean; layout: Pick<ProfileLayout, "hidden"> }): boolean {
  return f.isOwner || !f.layout.hidden.includes("clubs");
}

function noResume(): ResumeKeys {
  return { resume_url: null, resume_docs: [], resume_redactions: [] };
}

/** A copy with every résumé key emptied (the signed-out branch's strip). */
export function stripResumeKeys<T extends ResumeKeys>(profile: T): T {
  return { ...profile, ...noResume() };
}

/** True when the profile still carries any résumé document. */
export function hasResume(profile: Pick<HideableProfile, "resume_url" | "resume_docs">): boolean {
  return profile.resume_url != null || profile.resume_docs.length > 0;
}

/**
 * Product call 4 (waveA-build.md): a résumé opens for its owner always, and
 * for anyone else only when ALL of: the viewer is school-verified, the owner
 * has no suspension or ban in force, and the owner's layout does not hide the
 * résumé. Pass `ownerRestricted: true` when the restriction read FAILED as
 * well (fail closed). The bootstrap (which keys it hands out) and
 * /api/resume (which it signs) answer from this one rule.
 */
export function resumeVisibleToViewer(f: {
  isOwner: boolean;
  viewerVerified: boolean;
  ownerRestricted: boolean;
  layoutHidesResume: boolean;
}): boolean {
  if (f.isOwner) return true;
  return f.viewerVerified && !f.ownerRestricted && !f.layoutHidesResume;
}

/**
 * The `/profile/<handle>` link-preview description: tagline, else the bio's
 * first 160 characters when the bio is NOT hidden, else "<name>'s profile".
 */
export function profilePreviewDescription(p: {
  name: string;
  tagline: string | null;
  bio: string | null;
  bioHidden: boolean;
}): string {
  const tagline = (p.tagline || "").trim();
  if (tagline) return tagline;
  const bio = p.bioHidden ? "" : (p.bio || "").trim().slice(0, 160);
  return bio || `${p.name}'s profile on Vibe`;
}

/** What `getActiveRestriction` said about someone, flattened. */
export type RestrictionState = "none" | "restricted" | "unknown";

/**
 * Whether `/posts/<id>` may show the post's author and text in its link
 * preview. Not when a moderator removed the post, when it belongs to a club
 * that is hidden (or whose row could not be read), or when the author is
 * suspended / banned or that could not be checked. Public clubs' posts keep
 * their preview (product call 3).
 */
export function postPreviewIsPublic(f: {
  removedAt: string | null;
  orgId: string | null;
  /** The club's hidden_at; `undefined` when the club row came back empty. */
  orgHiddenAt: string | null | undefined;
  author: RestrictionState;
}): boolean {
  if (f.removedAt != null) return false;
  if (f.orgId != null && f.orgHiddenAt !== null) return false;
  return f.author === "none";
}
