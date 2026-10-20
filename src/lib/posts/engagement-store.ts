/**
 * One like / save / repost / comment-count record per post, shared by every
 * screen that shows the post (Oct 19, 2026, critique M1).
 *
 * WHY. The phone feed card and the open post each kept their own copy of
 * like, save and repost, so a like inside the post didn't show on the card
 * under it, and an unlike on one came back on the other. Now the feed card
 * (CampusMobile FeedCard), the open post (PostViewerMobile) and the desktop
 * card (campus-home FeedRow) all read and write this one record, keyed by the
 * post's id, so a tap in one shows in the other at once, both ways.
 *
 * THE RULES.
 * - The feed seeds it, and every fresh server read (opening a post, a feed
 *   refresh) overwrites it with {@link applyServerEngagement}.
 * - A read never overwrites a group (like, save, repost, comment) that has a
 *   tap still in flight, nor one tapped or settled AFTER the read was sent:
 *   the answer may have been made before the tap's write and would undo it
 *   on screen. Hence the read token, taken with {@link engagementReadToken}
 *   just before the request, and the fresh stamp when a tap settles.
 * - A tap ({@link beginEngagementTap}) flips the record first; a refusal
 *   rolls the record back (not some local copy), so every screen goes back
 *   together. One tap per group at a time: a second one while the first is
 *   out is dropped, so a fast double tap can't send two requests.
 *
 * Nothing here is new data about anyone: it holds what the feed and the post
 * read already send this viewer (their own like / save / repost, and the
 * public counts), in this tab's memory only. No React state outside the hook,
 * no storage, no network.
 */

import { useCallback, useSyncExternalStore } from "react";

export type PostEngagement = {
  liked: boolean;
  likeCount: number;
  saved: boolean;
  reposted: boolean;
  repostCount: number;
  commentCount: number;
};

/** The fields that move together on one tap. */
export type EngagementGroup = "like" | "save" | "repost" | "comment";

const GROUP_FIELDS: Readonly<Record<EngagementGroup, readonly (keyof PostEngagement)[]>> = {
  like: ["liked", "likeCount"],
  save: ["saved"],
  repost: ["reposted", "repostCount"],
  comment: ["commentCount"],
};
const GROUPS = Object.keys(GROUP_FIELDS) as EngagementGroup[];

/** A feed of 50 posts a page, scrolled for a long while, stays well under this. */
const MAX_POSTS = 2000;

type Slot = {
  value: PostEngagement;
  inFlight: Set<EngagementGroup>;
  /** The clock reading of the latest local change to each group. */
  touched: Map<EngagementGroup, number>;
};

const slots = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();
let clock = 0;

const EMPTY: PostEngagement = Object.freeze({
  liked: false,
  likeCount: 0,
  saved: false,
  reposted: false,
  repostCount: 0,
  commentCount: 0,
});

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/** Only real values get through: a count is a whole number from 0 up, a flag is a boolean. */
function clean(values: Partial<PostEngagement>): Partial<PostEngagement> {
  const out: Partial<PostEngagement> = {};
  for (const k of ["liked", "saved", "reposted"] as const) {
    if (typeof values[k] === "boolean") out[k] = values[k];
  }
  for (const k of ["likeCount", "repostCount", "commentCount"] as const) {
    if (values[k] !== undefined) out[k] = count(values[k]);
  }
  return out;
}

function pick(v: Partial<PostEngagement>, group: EngagementGroup): Partial<PostEngagement> {
  const out: Partial<PostEngagement> = {};
  for (const k of GROUP_FIELDS[group]) {
    if (v[k] !== undefined) (out as Record<string, unknown>)[k] = v[k];
  }
  return out;
}

function notify(postId: string): void {
  for (const fn of listeners.get(postId) ?? []) fn();
}

function slotFor(postId: string, base: Partial<PostEngagement>): Slot {
  let slot = slots.get(postId);
  if (!slot) {
    slot = { value: { ...EMPTY, ...clean(base) }, inFlight: new Set(), touched: new Map() };
    slots.set(postId, slot);
    trim();
  }
  return slot;
}

/** Forget the oldest posts nobody is tapping or watching, past {@link MAX_POSTS}. */
function trim(): void {
  if (slots.size <= MAX_POSTS) return;
  for (const [id, slot] of slots) {
    if (slots.size <= MAX_POSTS) break;
    if (slot.inFlight.size > 0 || (listeners.get(id)?.size ?? 0) > 0) continue;
    slots.delete(id);
  }
}

/** Take one just before a server read is sent, and hand it to {@link applyServerEngagement}. */
export function engagementReadToken(): number {
  clock += 1;
  return clock;
}

/** What this tab knows about a post right now; undefined until something seeds it. */
export function readEngagement(postId: string): PostEngagement | undefined {
  return slots.get(postId)?.value;
}

export function subscribeEngagement(postId: string, fn: () => void): () => void {
  let set = listeners.get(postId);
  if (!set) {
    set = new Set();
    listeners.set(postId, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(postId);
  };
}

/**
 * A server answer about a post: the feed, a feed refresh, the post read.
 * Overwrites every group it carries, except one with a tap still out and one
 * changed here after `readToken` was taken (see the header). Missing or
 * malformed fields are left as they are.
 */
export function applyServerEngagement(
  postId: string,
  values: Partial<PostEngagement>,
  readToken: number,
): void {
  if (!postId) return;
  const fresh = clean(values);
  const slot = slots.get(postId);
  if (!slot) {
    slotFor(postId, fresh);
    notify(postId);
    return;
  }
  let next = slot.value;
  for (const group of GROUPS) {
    if (slot.inFlight.has(group)) continue;
    if ((slot.touched.get(group) ?? 0) > readToken) continue;
    const part = pick(fresh, group);
    if (Object.keys(part).length > 0) next = { ...next, ...part };
  }
  const prev = slot.value;
  if ((Object.keys(next) as (keyof PostEngagement)[]).every((k) => next[k] === prev[k])) return;
  slot.value = next;
  notify(postId);
}

/**
 * {@link applyServerEngagement} for every post of one feed answer. Only the
 * fields the answer really carries go in (Oct 19, 2026, review r2): a field
 * that is missing or null ("couldn't read it") leaves the record's value
 * alone rather than writing a 0 or a false over a good one on every screen.
 */
export function seedEngagementFromFeed(
  posts: readonly FeedEngagementFields[],
  readToken: number,
): void {
  for (const p of posts) {
    if (p && typeof p.id === "string") applyServerEngagement(p.id, engagementReadFromFeedPost(p), readToken);
  }
}

/** The feed post's fields that were actually read: booleans and finite numbers only. */
function engagementReadFromFeedPost(p: FeedEngagementFields): Partial<PostEngagement> {
  const out: Partial<PostEngagement> = {};
  const flag = (v: unknown) => typeof v === "boolean";
  const real = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (flag(p.viewer_liked)) out.liked = p.viewer_liked as boolean;
  if (flag(p.viewer_saved)) out.saved = p.viewer_saved as boolean;
  if (flag(p.viewer_reposted)) out.reposted = p.viewer_reposted as boolean;
  if (real(p.like_count)) out.likeCount = p.like_count as number;
  if (real(p.repost_count)) out.repostCount = p.repost_count as number;
  if (real(p.comment_count)) out.commentCount = p.comment_count as number;
  return out;
}

/** The engagement fields an /api/feed post carries (phone and desktop share the shape). */
export type FeedEngagementFields = {
  id: string;
  viewer_liked?: boolean | null;
  like_count?: number | null;
  viewer_saved?: boolean | null;
  viewer_reposted?: boolean | null;
  repost_count?: number | null;
  comment_count?: number | null;
};

/** A feed post's own fields as a record: the card's fallback before the store has it. */
export function engagementFromFeedPost(p: FeedEngagementFields): PostEngagement {
  return {
    liked: p.viewer_liked === true,
    likeCount: count(p.like_count),
    saved: p.viewer_saved === true,
    reposted: p.viewer_reposted === true,
    repostCount: count(p.repost_count),
    commentCount: count(p.comment_count),
  };
}

export type EngagementTap = {
  /** The server said yes: the change stays. */
  commit: () => void;
  /** The server said no: this group goes back to what it was, on every screen. */
  rollback: () => void;
};

/**
 * Start a tap: the record changes at once (`change` gets the current record
 * and returns the new values of this group's fields; other fields are
 * ignored). Returns null while a tap on the same group is still out, which
 * drops the second tap. `base` is the record to start from when nothing has
 * seeded this post yet (the card's own fields).
 */
export function beginEngagementTap(
  postId: string,
  group: EngagementGroup,
  base: PostEngagement,
  change: (current: PostEngagement) => Partial<PostEngagement>,
): EngagementTap | null {
  const slot = slotFor(postId, base);
  if (slot.inFlight.has(group)) return null;
  const before = pick(slot.value, group);
  slot.value = { ...slot.value, ...pick(clean(change(slot.value)), group) };
  slot.inFlight.add(group);
  slot.touched.set(group, engagementReadToken());
  notify(postId);
  let settled = false;
  // Why the re-stamp on settle (Oct 19, 2026, review r3): a read sent WHILE
  // the tap was out carries a token newer than the tap's start, and the
  // server may have answered it before the write committed. Without a fresh
  // stamp here, that answer lands after commit and undoes the like on every
  // screen. Stamping as the tap settles makes every read sent before this
  // moment too old for this group; a read sent after it overwrites as usual.
  const settle = () => {
    settled = true;
    slot.touched.set(group, engagementReadToken());
    slot.inFlight.delete(group);
  };
  return {
    commit: () => {
      if (settled) return;
      settle();
    },
    rollback: () => {
      if (settled) return;
      settle();
      // Nothing else wrote this group meanwhile (reads skip a group in
      // flight, and a second tap was dropped), so `before` is exact. The
      // slot can't have been trimmed: trim() keeps posts with a tap out.
      slot.value = { ...slot.value, ...before };
      notify(postId);
    },
  };
}

/**
 * A change the server already confirmed (a comment posted, a quote repost
 * the desktop menu sent): applied at once, and marked as newer than any read
 * already out, so a stale answer can't take it back.
 */
export function patchEngagement(
  postId: string,
  group: EngagementGroup,
  base: PostEngagement,
  change: (current: PostEngagement) => Partial<PostEngagement>,
): void {
  const slot = slotFor(postId, base);
  slot.value = { ...slot.value, ...pick(clean(change(slot.value)), group) };
  slot.touched.set(group, engagementReadToken());
  notify(postId);
}

/**
 * The record for `postId`, re-rendering when any screen changes it.
 * `fallback` (the card's own feed fields) shows until something seeds the
 * store, so a card is never blank.
 */
export function usePostEngagement(postId: string, fallback: PostEngagement): PostEngagement {
  const subscribe = useCallback((fn: () => void) => subscribeEngagement(postId, fn), [postId]);
  const snap = useSyncExternalStore(
    subscribe,
    () => slots.get(postId)?.value,
    () => undefined,
  );
  return snap ?? fallback;
}
