/**
 * The words on every follow button for a PERSON, on the phone, the desktop
 * React screens and the static pages: one word per meaning (Franky, Oct 16).
 *
 *   Follow        you don't follow them
 *   Following ✓   you follow them; they don't follow you
 *   Follow back   they follow you; you don't follow them
 *   Connected ✓   you follow each other, so DMs go straight to the inbox
 *
 * There is no approval step. A follow takes effect on the tap, so no person
 * button says Connect, Connect back or Pending, and no line talks about a
 * "connection request". "Connections" stays as the name of the mutuals count.
 * Clubs keep their own words (src/lib/orgs/join-copy.ts).
 *
 * Where a mutual's button opens the chat, it reads Connected ✓ and turns into
 * Message on hover; the profile header keeps Message as its main button with
 * the Connected ✓ badge beside it.
 *
 * The static desktop profile (public/html/profile.html) can't import this, so
 * it keeps the same four labels in VIBE_FOLLOW_LABELS. follow-label.test.ts
 * checks they match: change both together.
 *
 * Pure, with no imports, so `node --test` loads it with type stripping alone.
 */

/** Where the viewer stands with one person. "self" never gets a button. */
export type PersonFollowState = "none" | "following" | "followed_by" | "connected";

export const FOLLOW_LABELS: Readonly<Record<PersonFollowState, string>> = Object.freeze({
  none: "Follow",
  following: "Following ✓",
  followed_by: "Follow back",
  connected: "Connected ✓",
});

/** What Connected ✓ means, for a title or a screen reader. */
export const CONNECTED_MEANING = "You follow each other. DMs go straight to the inbox.";

/**
 * How loud the button is. Each screen maps a tone onto its own styles:
 *   "follow"  the filled call to action (Follow)
 *   "back"    they already follow you (Follow back): the warm accent
 *   "quiet"   you already follow them (Following ✓, Connected ✓)
 */
export type FollowTone = "follow" | "back" | "quiet";

/** The two facts every label comes from. */
export type FollowFacts = { iFollow: boolean; followsMe: boolean };

export type FollowButtonCopy = {
  state: PersonFollowState;
  label: string;
  tone: FollowTone;
  /** What a tap asks the server: follow (POST) or unfollow (DELETE). */
  tap: "follow" | "unfollow";
};

export function followStateOf({ iFollow, followsMe }: FollowFacts): PersonFollowState {
  if (iFollow && followsMe) return "connected";
  if (iFollow) return "following";
  if (followsMe) return "followed_by";
  return "none";
}

export function followFactsOf(state: PersonFollowState): FollowFacts {
  return {
    iFollow: state === "following" || state === "connected",
    followsMe: state === "followed_by" || state === "connected",
  };
}

/** The label, tone and tap for one person, from the two facts. */
export function followButton(facts: FollowFacts): FollowButtonCopy {
  const state = followStateOf(facts);
  return {
    state,
    label: FOLLOW_LABELS[state],
    tone: facts.iFollow ? "quiet" : facts.followsMe ? "back" : "follow",
    tap: facts.iFollow ? "unfollow" : "follow",
  };
}

/**
 * A server's own follow_state ("none" | "following" | "followed_by" |
 * "connected" | "self") as one of the four. Anything else, "self" included,
 * reads as "none": callers that hide the button for "self" check it first.
 */
export function asPersonFollowState(state: string | null | undefined): PersonFollowState {
  return state === "following" || state === "followed_by" || state === "connected"
    ? state
    : "none";
}

/** Same as followButton, from the state the server already named. */
export function followButtonFor(state: string | null | undefined): FollowButtonCopy {
  return followButton(followFactsOf(asPersonFollowState(state)));
}

/**
 * The state once the server accepts a tap. A follow or an unfollow changes
 * only the viewer's side: Follow back → Connected ✓, and unfollowing a
 * mutual leaves Follow back, because they still follow you.
 */
export function followStateAfterTap(state: string | null | undefined): PersonFollowState {
  const { iFollow, followsMe } = followFactsOf(asPersonFollowState(state));
  return followStateOf({ iFollow: !iFollow, followsMe });
}

/** How a failure line names someone: their name, else @handle, else null. */
export function personName(p: { name?: string | null; handle?: string | null }): string | null {
  const name = p.name ? p.name.trim() : "";
  if (name) return name;
  return p.handle ? `@${p.handle}` : null;
}

/**
 * The caller's line for vibeRequest when a follow or an unfollow is refused.
 * vibeRequest adds " Try again." where trying again can help, so a server
 * error reads "Couldn't follow Sam. Try again."
 */
export function followFailureLine(tap: "follow" | "unfollow", name?: string | null): string {
  const who = name && name.trim() ? name.trim() : "them";
  return tap === "follow" ? `Couldn't follow ${who}.` : `Couldn't unfollow ${who}.`;
}
