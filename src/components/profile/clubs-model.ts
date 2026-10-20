/**
 * The phone profile's clubs, as data (batch 2E; club model spec D; Franky's
 * rules, Oct 18 2026). `ClubsSection.tsx` and `ClubFlair.tsx` draw it.
 *
 * WHO SEES WHAT:
 *   - "Member of": the clubs a person shows. Public, signed-out visitors
 *     included (`/api/users/[handle]/bootstrap?clubs=1`). Clubs show by
 *     default and are hidden one by one.
 *   - On your own profile (`/api/me/clubs`): every club you're in, hidden
 *     ones marked, plus "Following", which only you see.
 *   - Role words (Owner, Officer) never show. A title the officers gave
 *     does ("President · SAE"), unless the member hid it.
 *   - "Member since Sep 2026" only in the Clubs section, never on the chips.
 *
 * PURE ON PURPOSE: its imports (join-copy.ts, club-flair.ts) have no value
 * imports of their own, so `clubs-model.test.ts` loads it under `node --test`
 * with a resolve hook. The mute lines are the club page's (`ORG_COPY.menu`),
 * one set of words everywhere (wave-2 repair, finding 5). The static desktop
 * profile (wave 3A) copies `CLUBS_COPY` character for character.
 */

import { ORG_COPY, fillCopy } from "@/lib/orgs/join-copy";
import { PROFILE_RANK_MAX } from "@/lib/profile/club-flair";

export const CLUBS_COPY = Object.freeze({
  title: "Clubs",
  memberOf: "Member of",
  following: "Following",
  onlyYou: "Only you see this",
  memberOfNote: "Anyone can see the clubs you show.",
  memberSince: "Member since {month}",
  titleHidden: "{title} (hidden)",
  hiddenTag: "Hidden from profile",
  mutedTag: "Muted",
  newTitleTag: "New title · shows on your profile",
  emptyMemberOf: "Clubs you join show here.",
  emptyFollowing: "Clubs you follow show here.",
  loadFailed: "Couldn't load your clubs.",
  loadMoreFailed: "Couldn't load more clubs.",
  showMore: "Show more",
  loadingMore: "Loading…",
  options: "Options for {org}",
  hide: "Hide from my profile",
  show: "Show on my profile",
  hideTitle: "Hide my title",
  showTitle: "Show my title",
  moveUp: "Move up",
  moveDown: "Move down",
  mute: ORG_COPY.menu.mute,
  unmute: ORG_COPY.menu.unmute,
  unfollow: "Unfollow",
  unfollowFailed: ORG_COPY.control.unfollowFailed,
  unfollowed: "You unfollowed {org}.",
  mutedGroup: "Muted",
  mutedGroupNote: "Clubs whose posts you muted. Only you see this.",
  muteNote: "Muting keeps {org}'s posts out of your feed. The club isn't told.",
  muteNoteMember: "Muting keeps {org}'s posts out of your feed. You stay in its chats, and the club isn't told.",
  open: "Go to club page",
  cancel: "Cancel",
  hideFailed: "Couldn't hide {org} from your profile.",
  showFailed: "Couldn't show {org} on your profile.",
  titleFailed: "Couldn't change your title.",
  orderFailed: "Couldn't save your order.",
  muteFailed: ORG_COPY.menu.muteFailed,
  unmuteFailed: ORG_COPY.menu.unmuteFailed,
  muted: ORG_COPY.menu.muted,
  mutedMember: ORG_COPY.menu.mutedMember,
  unmuted: ORG_COPY.menu.unmuted,
});

/** Fills `{key}` in one pass; a value is never re-scanned. join-copy's `fillCopy`. */
export const fillClubCopy: (template: string, vars: Record<string, string>) => string = fillCopy;

// ── Shapes ──────────────────────────────────────────────────────────────────

/** What a chip needs. `title` is null when there is none or it is hidden. */
export type FlairClub = {
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  title: string | null;
};

/** One "Member of" row anyone may see: `since` is `"2026-09"` or null. */
export type ShownClub = FlairClub & { since: string | null };

/** One of MY memberships (`/api/me/clubs` `member_of`). */
export type MyMemberClub = {
  org_id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  title: string | null;
  show_title: boolean;
  since: string | null;
  show_on_profile: boolean;
  profile_rank: number | null;
  muted: boolean;
};

/** A club I follow but am not in. Only I see these. */
export type MyFollowedClub = {
  org_id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  muted: boolean;
};

export type MyClubs = {
  member_of: MyMemberClub[];
  following: MyFollowedClub[];
  next_cursor: string | null;
  /** Clubs whose posts I muted but neither follow nor belong to (`muted` always true). */
  muted_only: MyFollowedClub[];
};

// ── Reading the routes ──────────────────────────────────────────────────────

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function text(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t : null;
}

function month(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
}

/** The parts every club row shares; null when the handle or name is missing. */
function card(o: Record<string, unknown>) {
  const handle = text(o.handle);
  const name = text(o.name);
  if (!handle || !name) return null;
  return { handle, name, logo_url: text(o.logo_url), verified: o.verified === true };
}

/**
 * `clubs` from the public bootstrap. Null when it is absent or not a list (the
 * read failed): draw no Clubs section rather than a wrong one.
 */
export function readPublicClubs(raw: unknown): ShownClub[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ShownClub[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const o = obj(item);
    const c = o ? card(o) : null;
    if (!o || !c || seen.has(c.handle)) continue;
    seen.add(c.handle);
    out.push({ ...c, title: text(o.title), since: month(o.since) });
  }
  return out;
}

function readMember(raw: unknown): MyMemberClub | null {
  const o = obj(raw);
  const c = o ? card(o) : null;
  const orgId = o ? text(o.org_id) : null;
  if (!o || !c || !orgId) return null;
  const rank = o.profile_rank;
  return {
    org_id: orgId,
    ...c,
    title: text(o.title),
    show_title: o.show_title !== false,
    since: month(o.since),
    show_on_profile: o.show_on_profile !== false,
    profile_rank: typeof rank === "number" && Number.isInteger(rank) ? rank : null,
    muted: o.muted === true,
  };
}

/** A followed club; `idKey` is "org_id" on `/api/me/clubs`, "id" on `/api/me/followed-orgs`. */
function readFollowed(raw: unknown, idKey: "org_id" | "id"): MyFollowedClub | null {
  const o = obj(raw);
  const c = o ? card(o) : null;
  const orgId = o ? text(o[idKey]) : null;
  if (!o || !c || !orgId) return null;
  return { org_id: orgId, ...c, muted: o.muted === true };
}

/** `/api/me/clubs`. Null when the body isn't that shape. */
export function readMyClubs(raw: unknown): MyClubs | null {
  const o = obj(raw);
  if (!o || !Array.isArray(o.member_of) || !Array.isArray(o.following)) return null;
  const member_of = o.member_of.flatMap((m) => {
    const r = readMember(m);
    return r ? [r] : [];
  });
  const memberIds = new Set(member_of.map((m) => m.org_id));
  const following = o.following.flatMap((f) => {
    const r = readFollowed(f, "org_id");
    return r && !memberIds.has(r.org_id) ? [r] : [];
  });
  const listed = new Set([...memberIds, ...following.map((f) => f.org_id)]);
  const muted_only = (Array.isArray(o.muted_only) ? o.muted_only : []).flatMap((f) => {
    const r = readFollowed(f, "org_id");
    return r && !listed.has(r.org_id) ? [{ ...r, muted: true }] : [];
  });
  return { member_of, following, next_cursor: text(o.following_next_cursor), muted_only };
}

/**
 * One more page of Following from `/api/me/followed-orgs`. Drops clubs I'm in
 * (`member_role` set) and any already on screen. Null on a bad body.
 */
export function readFollowedPage(
  raw: unknown,
  have: ReadonlySet<string>,
): { following: MyFollowedClub[]; next_cursor: string | null } | null {
  const o = obj(raw);
  if (!o || !Array.isArray(o.orgs)) return null;
  const seen = new Set(have);
  const following: MyFollowedClub[] = [];
  for (const item of o.orgs) {
    const io = obj(item);
    if (!io || io.member_role) continue;
    const r = readFollowed(io, "id");
    if (!r || seen.has(r.org_id)) continue;
    seen.add(r.org_id);
    following.push(r);
  }
  return { following, next_cursor: text(o.next_cursor) };
}

// ── What shows ──────────────────────────────────────────────────────────────

/** What a visitor sees of my clubs, in my order: shown clubs, titles I didn't hide. */
export function shownFromMine(memberOf: readonly MyMemberClub[]): ShownClub[] {
  return memberOf
    .filter((m) => m.show_on_profile)
    .map((m) => ({
      handle: m.handle,
      name: m.name,
      logo_url: m.logo_url,
      verified: m.verified,
      title: m.show_title ? m.title : null,
      since: m.since,
    }));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `"2026-09"` → `"Member since Sep 2026"`; anything else → `""`. */
export function memberSinceText(since: string | null | undefined): string {
  const m = typeof since === "string" ? /^(\d{4})-(\d{2})$/.exec(since) : null;
  const name = m ? MONTH_NAMES[Number(m[2]) - 1] : undefined;
  return m && name ? fillClubCopy(CLUBS_COPY.memberSince, { month: `${name} ${m[1]}` }) : "";
}

// ── My changes ──────────────────────────────────────────────────────────────

/** Matches the CHECK on `org_members.profile_rank` (0 to 50). */
export const RANK_MAX = PROFILE_RANK_MAX;

export type MemberPatch = Partial<
  Pick<MyMemberClub, "show_on_profile" | "show_title" | "profile_rank" | "muted">
>;

/** The list with one club changed. A club not in it leaves the list as it was. */
export function patchMember(
  list: readonly MyMemberClub[],
  orgId: string,
  patch: MemberPatch,
): MyMemberClub[] {
  return list.map((m) => (m.org_id === orgId ? { ...m, ...patch } : m));
}

/** Whether a club can move one place up (-1) or down (+1) and keep a rank. */
export function canMove(list: readonly MyMemberClub[], orgId: string, dir: -1 | 1): boolean {
  const i = list.findIndex((m) => m.org_id === orgId);
  const j = i + dir;
  return i >= 0 && j >= 0 && j < list.length && Math.max(i, j) <= RANK_MAX;
}

/**
 * Moves a club one place and numbers the list 0, 1, 2… so the order sticks.
 * `writes` holds only the clubs whose rank changed: the first move numbers
 * them all, later ones touch two. Null when the move can't happen.
 */
export function moveClub(
  list: readonly MyMemberClub[],
  orgId: string,
  dir: -1 | 1,
): { list: MyMemberClub[]; writes: { org_id: string; profile_rank: number }[] } | null {
  if (!canMove(list, orgId, dir)) return null;
  const i = list.findIndex((m) => m.org_id === orgId);
  const moved = list.slice();
  [moved[i], moved[i + dir]] = [moved[i + dir], moved[i]];
  const writes: { org_id: string; profile_rank: number }[] = [];
  const next = moved.map((m, k) => {
    if (k > RANK_MAX) return m;
    if (m.profile_rank !== k) writes.push({ org_id: m.org_id, profile_rank: k });
    return { ...m, profile_rank: k };
  });
  return { list: next, writes };
}

export type ClubSheetAction =
  | "toggle_show"
  | "toggle_title"
  | "move_up"
  | "move_down"
  | "toggle_mute"
  | "unfollow"
  | "open";

/** Which list of my own profile a club's row sits in. */
export type ClubStanding = "member" | "following" | "muted";

/**
 * The rows of a club's ⋯ sheet on my own profile. A followed club offers
 * muting, Unfollow and its page; a muted club I don't follow, the Unmute and
 * its page (wave-2 repair, finding 7). Showing, titles and order are for
 * members.
 */
export function clubSheetActions(
  list: readonly MyMemberClub[],
  orgId: string,
  standing: ClubStanding,
): ClubSheetAction[] {
  if (standing === "following") return ["toggle_mute", "unfollow", "open"];
  if (standing === "muted") return ["toggle_mute", "open"];
  const club = list.find((m) => m.org_id === orgId);
  if (!club) return ["open"];
  const out: ClubSheetAction[] = ["toggle_show"];
  if (club.title) out.push("toggle_title");
  if (canMove(list, orgId, -1)) out.push("move_up");
  if (canMove(list, orgId, 1)) out.push("move_down");
  out.push("toggle_mute", "open");
  return out;
}

/**
 * An officer gave me a title I haven't looked at yet (wave-2 repair, finding
 * 10): it shows on my public profile at once, so my own Clubs section marks
 * it until I open that club's ⋯ (where Hide my title is). `seen` is the
 * title I last opened the sheet on, per club, kept in this browser.
 */
export function titleIsNew(club: Pick<MyMemberClub, "org_id" | "title">, seen: Readonly<Record<string, string>>): boolean {
  return club.title !== null && seen[club.org_id] !== club.title;
}

/**
 * The "New title · shows on your profile" mark: a new title that really shows,
 * so never on a club I hid from my profile or a title I hid (wave-3 review,
 * finding 6). Unhiding later brings the mark back if I still haven't looked.
 */
export function showsNewTitleMark(
  club: Pick<MyMemberClub, "org_id" | "title" | "show_title" | "show_on_profile">,
  seen: Readonly<Record<string, string>>,
): boolean {
  return club.show_on_profile && club.show_title && titleIsNew(club, seen);
}

/** A row's second line on my own profile: the title (marked when hidden) and the month. */
export function myClubSubline(club: MyMemberClub): string {
  const parts: string[] = [];
  if (club.title) {
    parts.push(
      club.show_title ? club.title : fillClubCopy(CLUBS_COPY.titleHidden, { title: club.title }),
    );
  }
  const since = memberSinceText(club.since);
  if (since) parts.push(since);
  return parts.join(" · ");
}

/** A public row's second line: "President · Member since Sep 2026". */
export function shownClubSubline(club: ShownClub): string {
  return [club.title ?? "", memberSinceText(club.since)].filter(Boolean).join(" · ");
}
