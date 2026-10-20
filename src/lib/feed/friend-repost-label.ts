/**
 * The words of the quiet repost line above a post's author (Oct 19, 2026,
 * critique M2, decisions 1 and 2): "Maya reposted", "Maya and Jonah
 * reposted", "Maya and 6 others reposted". It replaces the green pill on the
 * phone card and the desktop row, and tapping it opens the "Reposted by" list
 * (B2's RepostersSheet / RepostersPopover).
 *
 * WHO IS NAMED. Only `reposters`, the people the viewer follows that /api/feed
 * already sends (`friend_reposters`, at most 3, newest first). Everyone else
 * is a number. Nothing new about anyone is shown: the names are the ones the
 * old pill showed, and the repost count is already public on the card.
 *
 * THE NUMBER (B2's contract, batch-B2.md "The line's number"). "Others" is
 * everyone who reposted that the words don't name, so it is the post's
 * repost count minus the people named, NOT the old `friend_reposter_count -
 * 1`. One judgement call on top of that: the viewer's own repost is left out
 * too. The list names it apart ("You reposted this.") and doesn't count it
 * in its "+ N others", and "Maya and 1 other" must never secretly mean you.
 * So: others = repostCount - named - (viewerReposted ? 1 : 0), never below 0.
 *
 * First names only, as the plan says; a person with no name shows as their
 * @handle. The number prints the way the card's own buttons print theirs
 * ("and 1.2K others", via compactCount; Oct 19, 2026, review r3). Pure.
 */

import { compactCount } from "./compact-count";

export type RepostLinePerson = {
  name?: string | null;
  handle?: string | null;
};

export type FriendRepostLine = {
  /** The names shown in bold, in order (one or two). */
  names: string[];
  /** Everyone else who reposted, as a number ("and 6 others"); 0 for none. */
  others: number;
};

/** "Maya Okafor" → "Maya"; no name → "@mayaokafor"; neither → "Someone". */
export function repostFirstName(p: RepostLinePerson | null | undefined): string {
  const first = (p?.name ?? "").trim().split(/\s+/)[0];
  if (first) return first;
  const handle = (p?.handle ?? "").trim().replace(/^@+/, "");
  return handle ? `@${handle}` : "Someone";
}

function whole(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/**
 * The line for one post, or null when nobody the viewer follows reposted it
 * (then there is no line at all: no generic popularity here).
 */
export function friendRepostLine(input: {
  reposters: readonly (RepostLinePerson | null | undefined)[] | null | undefined;
  repostCount: number;
  viewerReposted: boolean;
}): FriendRepostLine | null {
  const people = (input.reposters ?? []).filter((p): p is RepostLinePerson => !!p);
  if (people.length === 0) return null;
  // Everyone but the viewer. Never fewer than the people we were sent: the
  // count and the names come from two reads and can be a beat apart.
  const everyone = Math.max(
    people.length,
    whole(input.repostCount) - (input.viewerReposted ? 1 : 0),
  );
  const first = repostFirstName(people[0]);
  if (everyone <= 1) return { names: [first], others: 0 };
  if (everyone === 2 && people[1]) return { names: [first, repostFirstName(people[1])], others: 0 };
  return { names: [first], others: everyone - 1 };
}

/** " and 6 others" / " and 1.2K others" (empty for none): the part after the names. */
export function friendRepostOthers(line: FriendRepostLine): string {
  if (line.others <= 0) return "";
  return ` and ${compactCount(line.others)} ${line.others === 1 ? "other" : "others"}`;
}

/** The line as plain words, for a label and the tests. */
export function friendRepostText(line: FriendRepostLine): string {
  return `${line.names.join(" and ")}${friendRepostOthers(line)} reposted`;
}
