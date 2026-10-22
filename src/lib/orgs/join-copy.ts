/**
 * Every word a club button, chip or notice says, and which buttons a surface
 * shows (wave plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`
 * §6 F5a, §4.2; founder decisions §2.1).
 *
 * PURE ON PURPOSE. The only import is `import type` from `./join-state`, which
 * type stripping erases, so `join-copy.test.ts` loads this file under plain
 * `node --test` and walks every state without a browser. Client components,
 * server components and the static desktop pages (by copying `ORG_COPY`
 * character for character, B13) all read the same table.
 *
 * TWO AXES, NEVER ONE. Following a club (you → club: its posts reach your
 * feed) and being a member (you're in: chats, officer approval) are separate.
 * Anyone can follow any visible club; membership keeps its policy and
 * audience. So a row is "the follow toggle" plus "the membership control",
 * and the rules below decide how many of those fit on each surface:
 *   - `orgHeaderView`: the org page, which has room for both columns.
 *   - `orgRowView`: phone rows, desktop cards and onboarding, which don't.
 *
 * A member always follows (the join trigger adds the follow, and DELETE
 * /follow answers 409 `member_follows`), so a member never sees an unfollow.
 * Callers derive `following = role != null || org_follow_state === "following"`.
 *
 * ONE REQUEST FLOW (club model, Franky, Oct 16). Asking to join needs no
 * follow first, and asking follows the club (the join route writes it). So a
 * request club offers Follow and Request side by side on every surface,
 * onboarding included, the same shape as Follow and Join on an open club.
 * Clubs never follow people: no line here says a club follows anyone.
 *
 * THE CLUB PAGE SPLITS THEM (Franky, Oct 22, 2026: "I don't want people to
 * confuse following for request to join"). Its button row keeps only the
 * follow slot ({@link orgFollowSlot}: Follow / Following ✓, or one
 * "Member ✓"), and joining moves into its own Membership box under the row
 * ({@link membershipBoxView}): one plain line for where they stand, one
 * action. Rows, cards and onboarding keep their two-pill shape; they have no
 * room for a box. `orgHeaderView` stays for the Board card and the
 * follower's Board tile.
 */

import type { JoinState, JoinPolicy, OrgAudience, OrgRole } from "./join-state";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Every state a club control renders: the ten signed-in {@link JoinState}
 * values plus signed out. The literal is re-declared rather than imported
 * (`SIGNED_OUT` is a runtime value, and this module takes types only).
 */
export type OrgDisplayState = JoinState | "signed_out";

/**
 * The eleven, as a runtime list, for reading a state out of a server answer
 * ({@link isOrgDisplayState}). Spelled out here because this module imports
 * nothing at runtime; `join-copy.test.ts` checks it against every state the
 * views switch on.
 */
export const ORG_DISPLAY_STATES: readonly OrgDisplayState[] = Object.freeze([
  "member",
  "invited",
  "requested",
  "can_join",
  "can_request",
  "invite_only",
  "audience_blocked",
  "unverified",
  "hidden",
  "declined",
  "signed_out",
]);

/** Is this one of the {@link ORG_DISPLAY_STATES}? */
export function isOrgDisplayState(value: unknown): value is OrgDisplayState {
  return typeof value === "string" && (ORG_DISPLAY_STATES as readonly string[]).includes(value);
}

/**
 * The calendar the club pages print days in: a server render runs in UTC on
 * Vercel, which would move an evening date to the next day, and the client's
 * own zone would then disagree with the server's HTML (the same pin as
 * `OrgInviteBanner`).
 */
export const CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis";

/** Where a follow came from. Mirrors the sources the follow route accepts. */
export type FollowSource = "profile" | "discover" | "onboarding";

export type OrgActionKind =
  | "follow"
  | "unfollow"
  | "join"
  | "request"
  | "accept"
  | "decline"
  | "sign_in"
  | "verify_email"
  | "status"
  // Take back a pending request (DELETE /join with `{cancel_request: true}`;
  // Oct 22, 2026). Only the club page's Membership box offers it.
  | "cancel";

export type OrgAction = {
  kind: OrgActionKind;
  label: string;
  sub: string | null;
  /** At most one `filled` per row view: the one thing we'd tap. */
  tone: "filled" | "outline" | "quiet";
  disabled: boolean;
  /** Only `sign_in` and `verify_email` are links. */
  href: string | null;
};

/**
 * One viewer's standing with one club. `joinPolicy` is null only for rows
 * from `/api/me/org-invites`, which don't carry it. Callers force `following`
 * true when `state === "member"`.
 */
export type OrgRelation = {
  handle: string;
  orgName: string;
  state: OrgDisplayState;
  following: boolean;
  role: OrgRole | null;
  reason: "policy" | "visiting" | null;
  audience: OrgAudience;
  joinPolicy: JoinPolicy | null;
  /**
   * Only on `declined`: when they may ask again (the decision's
   * `askAgainAt`, ISO). Optional, so every surface that builds a relation
   * without it still type-checks; the copy then says "later" instead of a
   * day (Oct 22, 2026).
   */
  askAgainAt?: string | null;
};

export type OrgRowSurface = "phone_row" | "card" | "onboarding";

export type OrgHeaderView = {
  /** Null only for a hidden club: there is nothing to follow. */
  follow: OrgAction | null;
  followSub: string | null;
  membership: OrgAction[];
  disclosure: string | null;
};

export type OrgRowView = {
  chip: "Invited you" | "Following" | null;
  actions: OrgAction[];
  /** `line`: two pills side by side on their own full-width row. */
  layout: "slot" | "line";
  disclosure: string | null;
  /** Policy, requested, audience and hidden labels. The caller adds '@handle' and counts. */
  meta: string[];
  sub: string | null;
};

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Below this many followers only the club's owner and admins see the number:
 * a count of 1 is an identity (critic C13). Keep equal to `following.ts`
 * FOLLOWER_COUNT_FLOOR — duplicated on purpose, because this file must not
 * import server code (plan §4.2).
 */
export const FOLLOWER_COUNT_FLOOR = 5;

/** Said near Follow on any club not known to be open (critic C14). */
export const FOLLOW_DISCLOSURE = "Officers can see who follows this club.";

/**
 * Said instead on a row or card whose Request would also follow (club model:
 * asking follows; wave-2 repair, finding 9). The header says it in the
 * Request sub (`ORG_COPY.subs.requestPolicy`).
 */
export const REQUEST_DISCLOSURE = "Asking to join also follows the club. Officers can see who follows it.";

/** Officer settings: follow is not a setting (founder decision). */
export const OFFICER_FOLLOW_HELP =
  "Anyone can follow your club. This only sets who becomes a member.";

/** Under "Open to" (invites spec A9: the check happens when they join). */
export const AUDIENCE_HELP =
  "Checked against each student's verified school email when they join.";

/**
 * Said when someone who is not the owner or an officer tries to change a
 * setting. The name is from when mods saw the fields read-only; clubs have
 * no mods since 20261021100000.
 */
export const MOD_READONLY = "Only the owner and officers can change this.";

// ── The strings ─────────────────────────────────────────────────────────────

/**
 * Every string a club control, notice, banner or invite sheet shows, in one
 * frozen table, so the static desktop onboarding (`public/html/onboarding.html`,
 * B13) can copy it character for character and a parity test can compare the
 * two. Placeholders — `{org}`, `{name}`, `{date}`, `{n}`, `{campus}`,
 * `{relative}` — are filled by {@link fillCopy}, never by string concatenation
 * at a call site.
 */
export const ORG_COPY = freezeDeep({
  buttons: {
    follow: "Follow",
    following: "Following ✓",
    signInToFollow: "Sign in to follow",
    joined: "Joined ✓",
    hidden: "Hidden",
    acceptInvite: "Accept invite",
    accept: "Accept",
    decline: "Decline",
    join: "Join",
    requestToJoin: "Request to join",
    request: "Request",
    requested: "Requested",
    inviteOnly: "Invite only",
    iuStudentsOnly: "IU students only",
    purdueStudentsOnly: "Purdue students only",
    verifyToJoin: "Verify your school email to join",
    busy: "…",
  },
  subs: {
    membersFollow: "Members follow automatically",
    hidden: "Hidden by Vibe. Only members can see it.",
    // Asking to join also follows the club (club model), and officers can see
    // who follows: the sub says so before the tap (wave-2 repair, finding 9).
    requestPolicy: "Officers approve requests. Asking also follows the club.",
    requestVisiting: "You're visiting, so officers approve requests. Asking also follows the club.",
    inviteOnly: "Officers invite members",
    audienceIu: "{org} is open to IU students only.",
    audiencePurdue: "{org} is open to Purdue students only.",
  },
  chips: {
    invitedYou: "Invited you",
    following: "Following",
  },
  meta: {
    byRequest: "By request",
    inviteOnly: "Invite only",
    requested: "Requested",
    iuOnly: "IU only",
    purdueOnly: "Purdue only",
    hidden: "Hidden",
    /** On a join request from someone an officer removed (S67 sec wave 2 #15). */
    removedBefore: "Removed before",
  },
  policyChips: {
    open: "Open",
    request: "By request",
    invite: "Invite only",
  },
  counts: {
    followers: "{n} followers",
    oneMember: "1 member",
    members: "{n} members",
  },
  followsSince: "Follows since {date}",
  inviteSub: {
    byName: "Invited by {name} · Expires {date}",
    byOfficer: "Invited by an officer · Expires {date}",
  },
  facts: {
    whoCanJoin: { open: "Anyone", request: "By request", invite: "By invitation" },
    openTo: { both: "Anyone", iu: "IU students", purdue: "Purdue students" },
  },
  whoCanJoinOptions: {
    open: { label: "Anyone can join", sub: "Join instantly" },
    request: { label: "Request to join", sub: "Officers approve requests" },
    invite: { label: "Invite only", sub: "Officers invite members" },
  },
  openToOptions: {
    bothShared: "All of {campus} (IU + Purdue)",
    both: "IU and Purdue students",
    iu: "IU students only",
    purdue: "Purdue students only",
  },
  notices: {
    hidden: "This org is hidden. Only its members can find it. It's out of lists, search and events.",
    audienceIu: "{org} only takes IU students as members. You can still follow.",
    audiencePurdue: "{org} only takes Purdue students as members. You can still follow.",
    invite: "Invite only. Anyone can follow this club — officers add members.",
    request: "Anyone can follow this club. Officers approve members.",
  },
  channels: {
    canJoin: "Chats are for members. Join to start talking.",
    approve: "Chats are for members. Officers approve who joins.",
    inviteOnly: "Chats are for members. Officers invite members.",
    invited: "Chats are for members. Accept the invite to start talking.",
    unverified: "Chats are for members. Verify your school email to join.",
    membersOnly: "Chats are for members.",
  },
  errors: {
    notFound: "This org isn't available.",
    tooMany: "Too many tries. Try again in a minute.",
    memberFollows: "Members follow automatically.",
    orgHidden: "This org is hidden, so nobody new can join it.",
    inviteClosed: "This invite is no longer open.",
    // S67 security wave 2 #15. Never names a block (waveA-build copy rule).
    joinUnavailable: "You can't join this club right now.",
    approveUnavailable: "You can't approve this request right now.",
    removedNeedsAdmin: "Only the owner or an officer can let back someone who was removed.",
  },
  // The Announcement Board, by one name: "Announcement Board" in full, "the
  // Board" after (wave-2 repair, findings 6 and 20). The club page's card:
  // members open it; followers the database lets in read it; a visitor whom
  // following would let in is asked to follow. Anyone else sees no card, so
  // the card never tells a barred follower they were barred. Then the
  // follower's view, the Messages list and the officers' switch.
  board: {
    title: "Announcement Board",
    memberLine: "News from {org}'s officers.",
    followerLine: "Posts from {org}'s officers, for members and followers.",
    visitorLine: "{org}'s officers post news here. Followers can read it.",
    verifyLine: "{org}'s officers post news here. Verify your school email to read it.",
    open: "Open",
    read: "Read the Board",
    followToRead: "Follow to read the Board",
    verify: "Verify school email",
    intro: "News from {org}'s officers.",
    empty: "Nothing on the Board yet.",
    onlyMembersPost: "Only members post here.",
    followedHeading: "Boards you follow",
    followedEmpty: "Nothing on the Board yet",
    followedLoadFailed: "Couldn't load the Boards you follow.",
    readersLabel: "Followers can read the Board",
    readersOnHelp: "Followers read officers' posts on the Board. They can't reply, react or vote, and never see who did.",
    readersOffHelp: "Only members read the Board. Followers still see the club's posts and events.",
    readersHidden: "This club is hidden, so followers can't read the Board either way.",
    readersOn: "Followers can read the Board.",
    readersOff: "Only members can read the Board now.",
    readersLoadFailed: "Couldn't load the Board setting.",
    readersFailed: "Couldn't change the Board setting.",
    menuReadersOff: "Stop followers reading the Board",
    menuReadersOn: "Let followers read the Board",
  },
  // The club page's ⋯ menu (club model gaps 1 and 2).
  menu: {
    label: "More for {org}",
    mute: "Mute posts",
    unmute: "Unmute posts",
    leave: "Leave club",
    // Every mute confirmation, on every surface (club page, feed, profile):
    // one set of words (wave-2 repair, findings 5 and 18).
    muted: "You won't see {org}'s posts in your feed. The club isn't told.",
    mutedMember: "You won't see {org}'s posts in your feed. You're still in its chats, and the club isn't told.",
    unmuted: "{org}'s posts are back in your feed.",
    muteFailed: "Couldn't mute {org}'s posts.",
    unmuteFailed: "Couldn't unmute {org}'s posts.",
    leaveTitle: "Leave {org}?",
    leaveBody: "You'll lose its chats and their history. Your messages stay.",
    // Desktop Settings → Danger, before the confirm opens.
    leaveIntroTitle: "Leave this club",
    leaveIntro: "You'll lose its chats and their history. Your messages stay. You choose whether to keep following it.",
    keepFollowing: "Keep following {org}",
    keepFollowingSub: "Its posts stay in your feed.",
    keepFollowingSubBoard: "Its posts stay in your feed, and you can still read its Board.",
    leaving: "Leaving…",
    leaveConfirm: "Leave",
    cancel: "Cancel",
    left: "You left {org}.",
    leftFollowing: "You left {org}. You still follow it.",
    leaveFailed: "Couldn't leave {org}.",
    ownerCantLeave: "Owners can't leave. Hand the club to another officer first.",
  },
  control: {
    followFailed: "Couldn't follow this club.",
    unfollowFailed: "Couldn't unfollow this club.",
    joinFailed: "Couldn't join this org.",
    requestFailed: "Couldn't send your join request.",
    acceptFailed: "Couldn't accept the invite.",
    declineFailed: "Couldn't decline the invite.",
    welcome: "You're in. Welcome to {org}.",
    declineConfirm: "Decline the invite to {org}? An officer can invite you again later.",
  },
  banner: {
    title: "You're invited to join {org}",
  },
  // The club page's Membership box (Franky, Oct 22, 2026: following and
  // joining are two different things, so joining gets its own box under the
  // Follow / Share row). One line for where they stand, one action. Its own
  // section, so the static onboarding's whole-section copies (buttons, subs,
  // control…) don't change: onboarding has no box.
  membership: {
    title: "Membership",
    canJoinBoth: "Anyone at IU or Purdue can join.",
    canJoinIu: "Anyone at IU can join.",
    canJoinPurdue: "Anyone at Purdue can join.",
    join: "Join",
    // Asking follows the club (club model, Oct 16): said before the tap.
    requestPolicy: "Officers approve new members. Asking also follows the club.",
    requestVisiting: "You're visiting from another campus, so officers approve. Asking also follows the club.",
    requestToJoin: "Request to join",
    requested: "Request sent. An officer will look at it.",
    cancel: "Cancel request",
    cancelled: "Request cancelled.",
    // Cancelling drops the follow that asking made, never one they tapped.
    cancelledUnfollowed: "Request cancelled. You don't follow {org} anymore.",
    cancelFailed: "Couldn't cancel your request.",
    // A 14-day wait after an officer says no (REQUEST_COOLDOWN_DAYS).
    declined: "Not this time. You can ask again on {date}.",
    declinedLater: "Not this time. You can ask again later.",
    notThisTime: "Not this time",
    askAgainOn: "You can ask again on {date}.",
    askAgainLater: "You can ask again later.",
    inviteOnly: "Invite only. Officers invite members.",
    invitedByName: "{name} invited you to join.",
    invitedByOfficer: "An officer invited you to join.",
    inviteExpires: "Expires {date}",
    accept: "Accept",
    decline: "Decline",
    audienceIu: "Only IU students can join.",
    audiencePurdue: "Only Purdue students can join.",
    unverified: "Verify your school email to join.",
    verify: "Verify",
    signedOut: "Sign in to follow or join.",
    signIn: "Sign in",
    member: "Member ✓",
  },
  inviteSheet: {
    title: "Invite people",
    close: "Close",
    searchPlaceholder: "Search by name or @handle",
    followersLabel: "Followers",
    noFollowers: "Nobody follows {org} yet. Share the club's page — people who follow it show up here.",
    typeMore: "Type at least 2 letters",
    noResults: "No one found. Check the spelling of their handle.",
    loadFailed: "Couldn't load people.",
    loadMoreFailed: "Couldn't load more people.",
    showMore: "Show more",
    loadingMore: "Loading…",
    blockedUnverified: "Get this org verified before inviting people. Message Vibe to start that.",
    blockedHidden: "This org is hidden, so it can't invite anyone.",
    invite: "Invite",
    invitedDone: "Invited ✓",
    undo: "Undo",
    invited: "Invited",
    member: "Member",
    approve: "Approve request",
    declined: "Declined",
    capReached: "Invited enough",
    inviteAgain: "You can invite again {date}",
    notEligible: "Not eligible",
    ineligibleUnverified: "They haven't verified a school email yet.",
    inviteFailed: "Couldn't send the invite.",
    undoFailed: "Couldn't undo the invite.",
    revokeFailed: "Couldn't revoke the invite.",
    approveFailed: "Couldn't approve the request.",
    sent: "Invite sent",
    revoked: "Invite revoked",
    approved: "They're in. Their request was approved.",
    tooManyInvites: "You've sent a lot of invites. Try again in an hour.",
    pendingTitle: "Pending invites ({n})",
    pendingByName: "Invited {relative} by {name}",
    pendingByOfficer: "Invited {relative} by an officer",
    pendingLoadFailed: "Couldn't load pending invites.",
    noPending: "No pending invites.",
    revoke: "Revoke",
    revokeConfirm: "Revoke this invite?",
    keep: "Keep",
    // Deny on a join request (wave B, B5): one tap, like the desktop Requests
    // tab. The row then reads "Denied" for as long as the sheet is open.
    deny: "Deny",
    denied: "Denied",
    denyFailed: "Couldn't deny the request.",
    deniedToast: "Request denied.",
  },
} as const);

// ── Small pieces ────────────────────────────────────────────────────────────

/** `Object.freeze`, all the way down, so no importer can edit the shared table. */
function freezeDeep<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freezeDeep(child as object);
  }
  return Object.freeze(value);
}

/**
 * Fills `{key}` placeholders in one pass. A value is never re-scanned, so a
 * club named "{org}" stays "{org}". Unknown keys are left as written, which
 * makes a missing variable visible instead of silently blank.
 */
export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

/**
 * 'Sep 16' in US English, or null for a missing or unparseable timestamp.
 * `timeZone` (an IANA name) pins the calendar day; left out, it is the
 * runtime's zone, which on a Vercel server is UTC.
 */
export function shortDateText(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

/**
 * 'just now' / '5m ago' / '3h ago' / '2d ago' / 'on Sep 3'. `nowMs` is passed
 * in, never read here, so a render stays pure and a test pins the clock. A
 * future or unparseable timestamp reads as 'just now' rather than a negative
 * age.
 */
export function relativeAgoText(iso: string | null | undefined, nowMs: number): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return "just now";
  const minutes = (nowMs - at) / 60_000;
  if (!(minutes >= 1)) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  const date = shortDateText(iso);
  return date ? `on ${date}` : "just now";
}

function orgLabel(orgName: string): string {
  return orgName.trim() || "This org";
}

function action(
  kind: OrgActionKind,
  label: string,
  tone: OrgAction["tone"],
  extra?: { sub?: string | null; disabled?: boolean; href?: string | null },
): OrgAction {
  return {
    kind,
    label,
    sub: extra?.sub ?? null,
    tone,
    disabled: extra?.disabled ?? false,
    href: extra?.href ?? null,
  };
}

/**
 * F in the plan: the follow toggle, whatever the membership says. `followTone`
 * steps Follow down when another control on the same surface is the filled one.
 */
function followToggle(following: boolean, followTone: OrgAction["tone"] = "filled"): OrgAction {
  return following
    ? action("unfollow", ORG_COPY.buttons.following, "quiet")
    : action("follow", ORG_COPY.buttons.follow, followTone);
}

function signInAction(handle: string): OrgAction {
  return action("sign_in", ORG_COPY.buttons.signInToFollow, "filled", {
    href: "/auth/login?next=" + encodeURIComponent("/orgs/" + handle),
  });
}

/**
 * Any club that isn't known to be open says, near Follow, that officers see
 * followers. An unknown policy (null) gets the line too: extra on an open club
 * is harmless, missing on an invite-only one is not. Only where a follow or
 * unfollow control is actually rendered, and never for members, hidden clubs
 * or signed-out viewers.
 *
 * A Request control gets the line too, whatever the policy (a visitor asks to
 * join an open club): asking follows the club, so the officers who read the
 * request also see the follow.
 */
function wantsDisclosure(rel: OrgRelation, actions: readonly (OrgAction | null)[]): boolean {
  if (rel.state === "member" || rel.state === "hidden" || rel.state === "signed_out") return false;
  if (actions.some((a) => a?.kind === "request")) return true;
  return rel.joinPolicy !== "open" && actions.some(isFollowAction);
}

function isFollowAction(a: OrgAction | null): boolean {
  return a != null && (a.kind === "follow" || a.kind === "unfollow");
}

function audienceStatus(rel: OrgRelation): OrgAction {
  const purdue = rel.audience === "purdue";
  return action(
    "status",
    purdue ? ORG_COPY.buttons.purdueStudentsOnly : ORG_COPY.buttons.iuStudentsOnly,
    "quiet",
    {
      disabled: true,
      sub: fillCopy(purdue ? ORG_COPY.subs.audiencePurdue : ORG_COPY.subs.audienceIu, {
        org: orgLabel(rel.orgName),
      }),
    },
  );
}

// ── The org page header ─────────────────────────────────────────────────────

/**
 * The org page (`/orgs/[handle]`): a follow column and a membership column.
 * First match wins, in the order below.
 */
export function orgHeaderView(rel: OrgRelation): OrgHeaderView {
  // Accept invite is the header's one filled action, so Follow steps down.
  const F = followToggle(rel.following, rel.state === "invited" ? "outline" : "filled");
  // Every state past member/hidden/signed_out renders F; those three never
  // get the disclosure.
  const view = (membership: OrgAction[]): OrgHeaderView => ({
    follow: F,
    followSub: null,
    membership,
    disclosure: wantsDisclosure(rel, [F, ...membership]) ? FOLLOW_DISCLOSURE : null,
  });

  switch (rel.state) {
    case "signed_out":
      return { follow: signInAction(rel.handle), followSub: null, membership: [], disclosure: null };
    case "member":
      // Joining followed them, and a member can't unfollow (409 member_follows).
      return {
        follow: action("status", ORG_COPY.buttons.following, "quiet", { disabled: true }),
        followSub: ORG_COPY.subs.membersFollow,
        membership: [action("status", ORG_COPY.buttons.joined, "quiet", { disabled: true })],
        disclosure: null,
      };
    case "hidden":
      return {
        follow: null,
        followSub: null,
        membership: [
          action("status", ORG_COPY.buttons.hidden, "quiet", {
            disabled: true,
            sub: ORG_COPY.subs.hidden,
          }),
        ],
        disclosure: null,
      };
    case "invited":
      return view([
        action("accept", ORG_COPY.buttons.acceptInvite, "filled"),
        action("decline", ORG_COPY.buttons.decline, "outline"),
      ]);
    case "can_join":
      return view([action("join", ORG_COPY.buttons.join, "outline")]);
    case "can_request":
      return view([
        action("request", ORG_COPY.buttons.requestToJoin, "outline", {
          sub:
            rel.reason === "visiting"
              ? ORG_COPY.subs.requestVisiting
              : ORG_COPY.subs.requestPolicy,
        }),
      ]);
    case "requested":
      return view([action("status", ORG_COPY.buttons.requested, "quiet", { disabled: true })]);
    // A recent "no" (Oct 22, 2026): a label and the day, never a Request the
    // join route would answer 409.
    case "declined":
      return view([
        action("status", ORG_COPY.membership.notThisTime, "quiet", {
          disabled: true,
          sub: askAgainText(rel.askAgainAt),
        }),
      ]);
    case "invite_only":
      return view([
        action("status", ORG_COPY.buttons.inviteOnly, "quiet", {
          disabled: true,
          sub: ORG_COPY.subs.inviteOnly,
        }),
      ]);
    case "audience_blocked":
      return view([audienceStatus(rel)]);
    case "unverified":
      return view([
        action("verify_email", ORG_COPY.buttons.verifyToJoin, "outline", {
          href: "/auth/school-email",
        }),
      ]);
  }
}

// ── The club page: the follow slot and the Membership box ───────────────────

/**
 * The day a turned-down student may ask again, as "Nov 6": the day AFTER the
 * two weeks run out, so the promise holds all day (the window ends at the
 * hour the officer said no; "on Nov 5" would be refused on Nov 5's morning).
 * Null when the moment is unknown.
 */
export function askAgainDayText(iso: string | null | undefined, timeZone: string = CAMPUS_TIME_ZONE): string | null {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  return shortDateText(new Date(at + 24 * 60 * 60 * 1000).toISOString(), timeZone);
}

/** 'You can ask again on Nov 6.', or '… later.' when the day is unknown. */
function askAgainText(iso: string | null | undefined, timeZone: string = CAMPUS_TIME_ZONE): string {
  const date = askAgainDayText(iso, timeZone);
  return date ? fillCopy(ORG_COPY.membership.askAgainOn, { date }) : ORG_COPY.membership.askAgainLater;
}

/** The invite on screen, for the Membership box's invited line. */
export type MembershipInvite = {
  /** `visibleInviterFirstName`'s answer: null reads "An officer". */
  inviterFirstName: string | null;
  expiresAt: string | null;
};

export type MembershipBoxView = {
  line: string;
  /** A second, smaller line (the invite's expiry), or null. */
  sub: string | null;
  /** Zero to two; at most one `filled`. */
  actions: OrgAction[];
};

/**
 * The club page's Membership box (Franky, Oct 22, 2026), or null for no box:
 * members and officers (they are in), and a hidden club seen by a platform
 * admin (nobody new can join it, and the notice above already says why).
 * Everyone else gets one plain line for where they stand and at most one
 * thing to do, so "Follow" in the row above can never be mistaken for the
 * way in.
 *
 * Pass `timeZone` only to override {@link CAMPUS_TIME_ZONE}: the box renders
 * on the server and again on the client, and both must print the same day.
 */
export function membershipBoxView(
  rel: OrgRelation,
  invite: MembershipInvite | null = null,
  timeZone: string = CAMPUS_TIME_ZONE,
): MembershipBoxView | null {
  const copy = ORG_COPY.membership;
  const box = (line: string, actions: OrgAction[] = [], sub: string | null = null): MembershipBoxView => ({
    line,
    sub,
    actions,
  });
  switch (rel.state) {
    case "member":
    case "hidden":
      return null;
    case "signed_out":
      return box(copy.signedOut, [
        action("sign_in", copy.signIn, "filled", {
          href: "/auth/login?next=" + encodeURIComponent("/orgs/" + rel.handle),
        }),
      ]);
    case "can_join":
      return box(
        rel.audience === "iu" ? copy.canJoinIu : rel.audience === "purdue" ? copy.canJoinPurdue : copy.canJoinBoth,
        [action("join", copy.join, "filled")],
      );
    case "can_request":
      return box(rel.reason === "visiting" ? copy.requestVisiting : copy.requestPolicy, [
        action("request", copy.requestToJoin, "filled"),
      ]);
    case "requested":
      return box(copy.requested, [action("cancel", copy.cancel, "outline")]);
    case "declined": {
      const date = askAgainDayText(rel.askAgainAt, timeZone);
      return box(date ? fillCopy(copy.declined, { date }) : copy.declinedLater);
    }
    case "invite_only":
      return box(copy.inviteOnly);
    case "invited": {
      const name = (invite?.inviterFirstName ?? "").trim();
      const expires = shortDateText(invite?.expiresAt, timeZone);
      return box(
        name ? fillCopy(copy.invitedByName, { name }) : copy.invitedByOfficer,
        [action("accept", copy.accept, "filled"), action("decline", copy.decline, "outline")],
        expires ? fillCopy(copy.inviteExpires, { date: expires }) : null,
      );
    }
    case "audience_blocked":
      return box(rel.audience === "purdue" ? copy.audiencePurdue : copy.audienceIu);
    case "unverified":
      return box(copy.unverified, [action("verify_email", copy.verify, "filled", { href: "/auth/school-email" })]);
  }
}

/**
 * The club page's button-row slot (Oct 22, 2026): following only. A member
 * gets one locked "Member ✓" (they follow automatically; leaving stays in
 * the ⋯ menu), a hidden club its "Hidden" label, and everyone else Follow or
 * Following ✓. Signed out it is a Follow that goes to sign in, next to the
 * box's "Sign in to follow or join.".
 *
 * Follow is the filled control only when the Membership box below has no
 * filled action of its own, so the page shows one coral button at a time
 * (the header's old rule for an invite, now for every door in). `sub` is
 * the follow disclosure on a club not known to be open.
 */
export function orgFollowSlot(rel: OrgRelation): { action: OrgAction | null; sub: string | null } {
  if (rel.state === "member") {
    return { action: action("status", ORG_COPY.membership.member, "quiet", { disabled: true }), sub: null };
  }
  if (rel.state === "hidden") {
    return {
      action: action("status", ORG_COPY.buttons.hidden, "quiet", { disabled: true }),
      sub: ORG_COPY.subs.hidden,
    };
  }
  const boxLeads = membershipBoxView(rel)?.actions.some((a) => a.tone === "filled") ?? false;
  const tone: OrgAction["tone"] = boxLeads ? "outline" : "filled";
  if (rel.state === "signed_out") {
    return {
      action: action("sign_in", ORG_COPY.buttons.follow, tone, {
        href: "/auth/login?next=" + encodeURIComponent("/orgs/" + rel.handle),
      }),
      sub: null,
    };
  }
  const F = followToggle(rel.following, tone);
  return { action: F, sub: wantsDisclosure(rel, [F]) ? FOLLOW_DISCLOSURE : null };
}

// ── Rows, cards and onboarding ──────────────────────────────────────────────

/**
 * Phone rows, desktop cards and onboarding: one or two controls, a chip that
 * never repeats a control, and meta labels (plan §6 F5a table).
 *
 * The rules this keeps, which `join-copy.test.ts` walks for every state:
 *   - at most one `filled` action;
 *   - `line` layout only where a club offers Follow next to Join or Request,
 *     on phone rows and onboarding: the two share a full-width row (critic
 *     C16: the door in is never hidden behind Follow);
 *   - Request needs no follow first, and onboarding offers it like every
 *     other surface (club model, Oct 16: one request flow everywhere);
 *   - no 'Joined' chip in v1.
 */
export function orgRowView(rel: OrgRelation, surface: OrgRowSurface): OrgRowView {
  let actions: OrgAction[];
  let chip: OrgRowView["chip"] = null;
  let layout: OrgRowView["layout"] = "slot";
  let sub: string | null = null;

  switch (rel.state) {
    case "signed_out":
      actions = [signInAction(rel.handle)];
      break;
    case "member":
      actions = [action("status", ORG_COPY.buttons.joined, "quiet", { disabled: true })];
      if (surface === "onboarding") sub = ORG_COPY.subs.membersFollow;
      break;
    case "hidden":
      actions = [action("status", ORG_COPY.buttons.hidden, "quiet", { disabled: true })];
      break;
    case "invited":
      chip = ORG_COPY.chips.invitedYou;
      actions =
        surface === "card"
          ? [
              action("accept", ORG_COPY.buttons.acceptInvite, "filled"),
              action("decline", ORG_COPY.buttons.decline, "outline"),
            ]
          : [action("accept", ORG_COPY.buttons.accept, "filled")];
      break;
    case "can_join":
      // Follow and Join together (founder decision). Once they follow, Join
      // becomes the one filled control.
      actions = rel.following
        ? [
            action("unfollow", ORG_COPY.buttons.following, "quiet"),
            action("join", ORG_COPY.buttons.join, "filled"),
          ]
        : [
            action("follow", ORG_COPY.buttons.follow, "filled"),
            action("join", ORG_COPY.buttons.join, "outline"),
          ];
      if (surface !== "card") layout = "line";
      break;
    case "can_request": {
      // Follow and Request together, like Follow and Join: asking needs no
      // follow first, and asking follows (club model, Oct 16). Once they
      // follow, Request becomes the one filled control. Cards have room for
      // the long label; a shared line keeps it to one word.
      const ask = surface === "card" ? ORG_COPY.buttons.requestToJoin : ORG_COPY.buttons.request;
      actions = rel.following
        ? [action("unfollow", ORG_COPY.buttons.following, "quiet"), action("request", ask, "filled")]
        : [action("follow", ORG_COPY.buttons.follow, "filled"), action("request", ask, "outline")];
      if (surface !== "card") layout = "line";
      break;
    }
    // `declined` (Oct 22, 2026) has no door for two weeks, so a row offers
    // what it offers a club they already asked: the follow toggle only.
    case "requested":
    case "invite_only":
    case "audience_blocked":
    case "unverified":
    case "declined":
      actions = [followToggle(rel.following)];
      break;
  }

  return {
    chip,
    actions,
    layout,
    disclosure: wantsDisclosure(rel, actions)
      ? !rel.following && actions.some((a) => a?.kind === "request")
        ? REQUEST_DISCLOSURE
        : FOLLOW_DISCLOSURE
      : null,
    meta: rowMeta(rel),
    sub,
  };
}

/** Policy, then Requested, then audience, then Hidden. No counts: the caller adds those. */
function rowMeta(rel: OrgRelation): string[] {
  const meta: string[] = [];
  if (rel.joinPolicy === "request") meta.push(ORG_COPY.meta.byRequest);
  else if (rel.joinPolicy === "invite") meta.push(ORG_COPY.meta.inviteOnly);
  if (rel.state === "requested") meta.push(ORG_COPY.meta.requested);
  if (rel.audience === "iu") meta.push(ORG_COPY.meta.iuOnly);
  else if (rel.audience === "purdue") meta.push(ORG_COPY.meta.purdueOnly);
  if (rel.state === "hidden") meta.push(ORG_COPY.meta.hidden);
  return meta;
}

// ── Text helpers ────────────────────────────────────────────────────────────

/** 'Open' / 'By request' / 'Invite only'. */
export function policyChip(policy: JoinPolicy | null | undefined): string | null {
  if (policy === "open") return ORG_COPY.policyChips.open;
  if (policy === "request") return ORG_COPY.policyChips.request;
  if (policy === "invite") return ORG_COPY.policyChips.invite;
  return null;
}

/** 'IU only' / 'Purdue only'; nothing for a club open to both. */
export function audienceChip(audience: OrgAudience | null | undefined): string | null {
  if (audience === "iu") return ORG_COPY.meta.iuOnly;
  if (audience === "purdue") return ORG_COPY.meta.purdueOnly;
  return null;
}

/** '{n} followers', or null when unknown or below {@link FOLLOWER_COUNT_FLOOR}. */
export function followerCountText(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < FOLLOWER_COUNT_FLOOR) return null;
  return fillCopy(ORG_COPY.counts.followers, { n });
}

/** '1 member' / '{n} members', or null when the count couldn't be read (C27). */
export function memberCountText(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n === 1) return ORG_COPY.counts.oneMember;
  return fillCopy(ORG_COPY.counts.members, { n });
}

/** 'Follows since Sep 16', or null for a bad timestamp. */
export function followsSinceText(iso: string | null | undefined): string | null {
  const date = shortDateText(iso);
  return date ? fillCopy(ORG_COPY.followsSince, { date }) : null;
}

/**
 * 'Invited by Franky · Expires Oct 16'. A null inviter (deleted account, or
 * somebody the viewer blocked or muted — critic A7) reads "an officer". A bad
 * expiry drops the date rather than printing "Invalid Date". Pass `timeZone`
 * when rendering on a server, so the expiry day is the campus's day.
 */
export function inviteSubText(
  firstName: string | null | undefined,
  expiresIso: string | null | undefined,
  timeZone?: string,
): string | null {
  const name = (firstName ?? "").trim();
  const date = shortDateText(expiresIso, timeZone);
  const template = name ? ORG_COPY.inviteSub.byName : ORG_COPY.inviteSub.byOfficer;
  const filled = fillCopy(template, { name, date: date ?? "" });
  return date ? filled : filled.replace(/ · Expires $/, "");
}

/** Facts row 'Who can join'. */
export function whoCanJoinFact(policy: JoinPolicy | null | undefined): string | null {
  if (policy === "open") return ORG_COPY.facts.whoCanJoin.open;
  if (policy === "request") return ORG_COPY.facts.whoCanJoin.request;
  if (policy === "invite") return ORG_COPY.facts.whoCanJoin.invite;
  return null;
}

/** Facts row 'Open to'. */
export function openToFact(audience: OrgAudience | null | undefined): string | null {
  if (audience === "both") return ORG_COPY.facts.openTo.both;
  if (audience === "iu") return ORG_COPY.facts.openTo.iu;
  if (audience === "purdue") return ORG_COPY.facts.openTo.purdue;
  return null;
}

export type WhoCanJoinOption = { value: JoinPolicy; label: string; sub: string };

/** Officer settings 'Who can join', in display order. */
export const WHO_CAN_JOIN_OPTIONS: readonly WhoCanJoinOption[] = Object.freeze(
  (["open", "request", "invite"] as const).map((value) =>
    Object.freeze({ value, ...ORG_COPY.whoCanJoinOptions[value] }),
  ),
);

export type OpenToOption = { value: OrgAudience; label: string };

/**
 * Officer settings 'Open to'. A shared campus (Indianapolis: IU Indy and
 * Purdue Indy, one community) names itself in the "both" option.
 */
export function openToOptions(
  campus: { name: string; shared: boolean } | null,
): OpenToOption[] {
  const name = campus?.name.trim() ?? "";
  return [
    {
      value: "both",
      label:
        campus?.shared && name
          ? fillCopy(ORG_COPY.openToOptions.bothShared, { campus: name })
          : ORG_COPY.openToOptions.both,
    },
    { value: "iu", label: ORG_COPY.openToOptions.iu },
    { value: "purdue", label: ORG_COPY.openToOptions.purdue },
  ];
}

/**
 * The line under the org page header. Hidden first (even members are told why
 * the club is out of lists), then nothing for a member, then the audience,
 * then the policy. Open clubs need no notice.
 */
export function joinPolicyNotice(input: {
  state: OrgDisplayState;
  joinPolicy: JoinPolicy | null;
  audience: OrgAudience;
  orgName: string;
  hidden: boolean;
}): string | null {
  if (input.hidden || input.state === "hidden") return ORG_COPY.notices.hidden;
  if (input.state === "member") return null;
  if (input.state === "audience_blocked") {
    return fillCopy(
      input.audience === "purdue" ? ORG_COPY.notices.audiencePurdue : ORG_COPY.notices.audienceIu,
      { org: orgLabel(input.orgName) },
    );
  }
  if (input.joinPolicy === "invite") return ORG_COPY.notices.invite;
  if (input.joinPolicy === "request") return ORG_COPY.notices.request;
  return null;
}

/**
 * The org page's Channels card for a non-member: chats are for members, and
 * what (if anything) they can do about it. `inline` is the one membership
 * control worth putting in the card. Null for a member, who sees the chats.
 */
export function channelsGateCopy(
  rel: OrgRelation,
): { line: string; inline: OrgAction | null } | null {
  switch (rel.state) {
    case "member":
      return null;
    case "can_join":
      return {
        line: ORG_COPY.channels.canJoin,
        inline: action("join", ORG_COPY.buttons.join, "outline"),
      };
    case "can_request":
      return {
        line: ORG_COPY.channels.approve,
        inline: action("request", ORG_COPY.buttons.requestToJoin, "outline"),
      };
    case "requested":
    case "declined":
      return { line: ORG_COPY.channels.approve, inline: null };
    case "invite_only":
      return { line: ORG_COPY.channels.inviteOnly, inline: null };
    case "invited":
      return { line: ORG_COPY.channels.invited, inline: null };
    case "unverified":
      return { line: ORG_COPY.channels.unverified, inline: null };
    case "audience_blocked":
    case "hidden":
    case "signed_out":
      return { line: ORG_COPY.channels.membersOnly, inline: null };
  }
}

// ── The Announcement Board card ─────────────────────────────────────────────

export type BoardCardInput = {
  /** The viewer's standing (`OrgRelation.state`). */
  state: OrgDisplayState;
  following: boolean;
  /** The club's Board, or null when it has none (or the read failed). */
  boardId: string | null;
  /**
   * The database's answer for THIS viewer (`can_view_org_channel` on their
   * own client, as `GET /api/orgs/[slug]` returns `board_readable`). Null
   * when unknown or not asked.
   */
  boardReadable: boolean | null;
  /**
   * For a signed-in viewer who doesn't follow: would following let them
   * read it? The club lets followers read, and nothing the page can see bars
   * this viewer. False signed out and on any doubt (`board-facts.ts`).
   */
  followWouldRead: boolean;
  /** Everything holds but the viewer's school email (`board-facts.ts`). */
  verifyToRead?: boolean;
  orgName: string;
};

export type BoardCard = {
  kind: "open" | "read" | "follow" | "verify";
  title: string;
  line: string;
  /** The button's words. "follow" renders the follow control with this label. */
  cta: string;
  /** Where "open", "read" and "verify" go; null for "follow". */
  href: string | null;
};

/**
 * The club page's Board card, or null for no card (club model; repair of
 * review findings 4 and 9). Members get "Open", followers the database lets
 * in "Read the Board", a visitor whom following would let in "Follow to read
 * the Board", and one whose school email is the only thing missing "Verify
 * school email". ANYONE ELSE GETS NOTHING: a follower who was removed or
 * blocked sees the same empty space as a club that turned follower reading
 * off, so the card never reveals a bar. The answer
 * for a member or follower is the database's own (`boardReadable === true`),
 * never re-derived from follow state plus the club's switch.
 */
export function boardCardView(input: BoardCardInput): BoardCard | null {
  if (!input.boardId || input.state === "hidden") return null;
  const org = orgLabel(input.orgName);
  const href = "/messages?channel=" + encodeURIComponent(input.boardId);
  const card = (kind: BoardCard["kind"], line: string, cta: string, to: string | null): BoardCard => ({
    kind,
    title: ORG_COPY.board.title,
    line: fillCopy(line, { org }),
    cta,
    href: to,
  });
  if (input.state === "member") {
    return input.boardReadable === true
      ? card("open", ORG_COPY.board.memberLine, ORG_COPY.board.open, href)
      : null;
  }
  if (input.state === "signed_out") return null;
  if (input.verifyToRead && input.boardReadable !== true) {
    return card("verify", ORG_COPY.board.verifyLine, ORG_COPY.board.verify, "/auth/school-email");
  }
  if (input.following) {
    return input.boardReadable === true
      ? card("read", ORG_COPY.board.followerLine, ORG_COPY.board.read, href)
      : null;
  }
  return input.followWouldRead
    ? card("follow", ORG_COPY.board.visitorLine, ORG_COPY.board.followToRead, null)
    : null;
}

// ── The ⋯ menu ──────────────────────────────────────────────────────────────

/**
 * The follows the club's own flow made (joining, asking to join), which a
 * leave drops unless the student keeps following: the one list the join
 * route's DELETE, `followMadeByJoining` (following.ts) and the leave
 * confirms read (wave-2 repair, finding 18).
 */
export const LEAVE_DROPS_FOLLOW_SOURCES: readonly string[] = Object.freeze(["join", "request"]);

/**
 * Whether the leave confirm's "Keep following" box starts checked (spec E1),
 * on the club page's ⋯ and desktop Settings alike: yes when the student
 * tapped Follow themselves, no when joining or asking to join made the
 * follow (`LEAVE_DROPS_FOLLOW_SOURCES`), and no when there is no follow row.
 */
export function keepFollowingDefault(source: string | null | undefined): boolean {
  return typeof source === "string" && !LEAVE_DROPS_FOLLOW_SOURCES.includes(source);
}

/**
 * The ⋯ menu's rows, in order. Everyone signed in can mute a club's posts
 * (its posts reach the whole campus); the owner and officers can turn the
 * followers' Board reading on or off (`readersOn`, the club's switch, known
 * only to members), the phone's home for that setting (wave-2 repair,
 * finding 3); members can also leave, except the owner, who has to hand the
 * club on first (`join/route.ts` DELETE).
 */
export function orgMenuItems(input: {
  signedIn: boolean;
  role: OrgRole | null;
  muted: boolean;
  readersOn?: boolean | null;
}): Array<{ kind: "mute" | "unmute" | "readers" | "leave"; label: string }> {
  if (!input.signedIn) return [];
  const items: Array<{ kind: "mute" | "unmute" | "readers" | "leave"; label: string }> = [
    input.muted
      ? { kind: "unmute", label: ORG_COPY.menu.unmute }
      : { kind: "mute", label: ORG_COPY.menu.mute },
  ];
  if ((input.role === "owner" || input.role === "admin") && typeof input.readersOn === "boolean") {
    items.push({ kind: "readers", label: input.readersOn ? ORG_COPY.board.menuReadersOff : ORG_COPY.board.menuReadersOn });
  }
  if (input.role != null && input.role !== "owner") {
    items.push({ kind: "leave", label: ORG_COPY.menu.leave });
  }
  return items;
}

/**
 * The toast for a refused club request, by `code` (or HTTP status 429, which
 * `tooManyRequests` sends without a code). Null means "no toast": either the
 * control flips to the state the code names (`invite_only`,
 * `audience_mismatch`, `school_unverified`), or the code is not a club code
 * and the caller shows vibeRequest's mapped line instead.
 */
export function orgErrorCopy(code: string | number | null | undefined): string | null {
  switch (code) {
    case 429:
    case "429":
      return ORG_COPY.errors.tooMany;
    case "not_found":
      return ORG_COPY.errors.notFound;
    case "member_follows":
      return ORG_COPY.errors.memberFollows;
    case "org_hidden":
      return ORG_COPY.errors.orgHidden;
    case "invite_not_found":
    case "invite_not_pending":
      return ORG_COPY.errors.inviteClosed;
    // S67 security wave 2 #15 (join, approve).
    case "join_unavailable":
      return ORG_COPY.errors.joinUnavailable;
    case "approve_unavailable":
      return ORG_COPY.errors.approveUnavailable;
    case "removed_needs_admin":
      return ORG_COPY.errors.removedNeedsAdmin;
    // DELETE /join (leave): the owner hands the club on first.
    case "owner_cannot_leave":
      return ORG_COPY.menu.ownerCantLeave;
    default:
      return null;
  }
}

// ── The invite sheet's row button ───────────────────────────────────────────

/** Mirrors `CandidateState` in `api/orgs/[slug]/invite-candidates/route.ts`. */
export type InviteCandidateState =
  | "member"
  | "invited"
  | "requested"
  | "declined_recently"
  | "invite_cap_reached"
  | "none";

/** Mirrors `IneligibleReason` in the same route. */
export type InviteIneligibleReason = "audience_iu" | "audience_purdue" | "unverified" | null;

export type InviteRowButton = {
  kind: "invite" | "approve" | "status";
  label: string;
  sub: string | null;
  disabled: boolean;
  /** "Invited ✓" from this sheet, which can still be taken back. */
  undo: boolean;
};

/**
 * What the right-hand button on an invite sheet row says. `state` FIRST, and
 * `eligible` only when `state` is "none" (invite-candidates docblock): a
 * Purdue member of a club later narrowed to IU comes back
 * `{state:"member", eligible:false}` and must read "Member", never
 * "Not eligible".
 *
 * `sent` is this sheet's own successful invite, shown while the row still
 * reads "none" or "invited". A requested row approves the
 * REQUEST (critic A11), never sends an invite; it can't without the request id,
 * and nothing approves into a hidden club.
 */
export function inviteRowButton(
  candidate: {
    state: InviteCandidateState;
    eligible: boolean;
    reason: InviteIneligibleReason;
    available_at?: string | null;
    request_id?: string | null;
  },
  options: {
    orgName: string;
    canInvite: boolean;
    blockedReason: "org_hidden" | "org_unverified" | null;
    sent: boolean;
  },
): InviteRowButton {
  const copy = ORG_COPY.inviteSheet;
  const status = (label: string, sub: string | null = null): InviteRowButton => ({
    kind: "status",
    label,
    sub,
    disabled: true,
    undo: false,
  });
  const againSub = (): string | null => {
    const date = shortDateText(candidate.available_at);
    return date ? fillCopy(copy.inviteAgain, { date }) : null;
  };

  // A fresher read that says they joined, asked or declined outranks our tap.
  if (options.sent && (candidate.state === "none" || candidate.state === "invited")) {
    return { ...status(copy.invitedDone), undo: true };
  }
  switch (candidate.state) {
    case "member":
      return status(copy.member);
    case "invited":
      return status(copy.invited);
    case "requested":
      return {
        kind: "approve",
        label: copy.approve,
        sub: null,
        disabled: !candidate.request_id || options.blockedReason === "org_hidden",
        undo: false,
      };
    case "declined_recently":
      return status(copy.declined, againSub());
    case "invite_cap_reached":
      return status(copy.capReached, againSub());
    case "none":
      break;
  }
  if (candidate.eligible) {
    return {
      kind: "invite",
      label: copy.invite,
      sub: null,
      disabled: !options.canInvite,
      undo: false,
    };
  }
  const org = orgLabel(options.orgName);
  const sub =
    candidate.reason === "audience_iu"
      ? fillCopy(ORG_COPY.subs.audienceIu, { org })
      : candidate.reason === "audience_purdue"
        ? fillCopy(ORG_COPY.subs.audiencePurdue, { org })
        : candidate.reason === "unverified"
          ? copy.ineligibleUnverified
          : null;
  return status(copy.notEligible, sub);
}

/** 'Invited 3d ago by Franky' / 'Invited just now by an officer'. */
export function pendingInviteText(
  createdIso: string | null | undefined,
  inviterFirstName: string | null | undefined,
  nowMs: number,
): string {
  const name = (inviterFirstName ?? "").trim();
  const relative = relativeAgoText(createdIso, nowMs);
  return name
    ? fillCopy(ORG_COPY.inviteSheet.pendingByName, { relative, name })
    : fillCopy(ORG_COPY.inviteSheet.pendingByOfficer, { relative });
}

// ── What a tap changes ──────────────────────────────────────────────────────

/** The standing a control reports up after a tap. */
export type OrgControlChange = {
  state: OrgDisplayState;
  following: boolean;
  role: OrgRole | null;
  declined?: true;
};

/**
 * Where a declined invite leaves them: back to what the policy offers anyone.
 * A null policy (an `/api/me/org-invites` row) reads as "ask", the answer that
 * promises least.
 */
export function stateAfterDecline(joinPolicy: JoinPolicy | null): OrgDisplayState {
  if (joinPolicy === "open") return "can_join";
  if (joinPolicy === "invite") return "invite_only";
  return "can_request";
}

/**
 * The next standing for a tap that succeeded — or, in onboarding's replay
 * walkthrough, for a tap that is never sent. Null for kinds that change
 * nothing (links and status labels).
 */
export function changeAfter(
  rel: Pick<OrgRelation, "state" | "following" | "role" | "joinPolicy">,
  kind: OrgActionKind,
): OrgControlChange | null {
  switch (kind) {
    case "follow":
      return { state: rel.state, following: true, role: rel.role };
    case "unfollow":
      return { state: rel.state, following: false, role: rel.role };
    case "join":
    case "accept":
      return { state: "member", following: true, role: rel.role ?? "member" };
    // Asking follows the club (the join route writes it, source `request`).
    case "request":
      return { state: "requested", following: true, role: rel.role };
    case "decline":
      return {
        state: stateAfterDecline(rel.joinPolicy),
        following: rel.following,
        role: rel.role,
        declined: true,
      };
    // Taking a request back (Oct 22, 2026). The server's answer replaces
    // this ({@link cancelOutcome}); it is only the replay's guess: what the
    // policy offers anyone, with the follow left as it was.
    case "cancel":
      return {
        state: rel.joinPolicy === "invite" ? "invite_only" : "can_request",
        following: rel.following,
        role: rel.role,
      };
    default:
      return null;
  }
}

/** What `DELETE /api/orgs/<handle>/join` with `{cancel_request: true}` answered. */
export type CancelAnswer =
  | { ok: true; data: { cancelled?: unknown; join_state?: unknown; org_follow_state?: unknown } }
  | { ok: false; code?: string | null; error?: string | null };

/**
 * What a Cancel request tap's answer means for the control (Oct 22, 2026):
 *   - `change`: the standing the server read back after the cancel, and the
 *     toast to show (null for none). The server's `join_state` wins; an
 *     answer without one falls back to {@link changeAfter}'s guess. A
 *     cancel that found they were let in meanwhile reads `member` and
 *     welcomes them; one that found the request already answered just
 *     shows the new state.
 *   - `refused`: any failure, which the caller toasts its own way.
 */
export function cancelOutcome(
  rel: Pick<OrgRelation, "state" | "following" | "role" | "joinPolicy" | "orgName">,
  r: CancelAnswer,
): { kind: "change"; next: OrgControlChange; message: string | null } | { kind: "refused" } {
  if (!r.ok) return { kind: "refused" };
  const guess = changeAfter(rel, "cancel") as OrgControlChange;
  const state = isOrgDisplayState(r.data.join_state) && r.data.join_state !== "signed_out" ? r.data.join_state : guess.state;
  const f = r.data.org_follow_state;
  const following = state === "member" || (f === "following" ? true : f === "not_following" ? false : rel.following);
  const org = orgLabel(rel.orgName);
  const next: OrgControlChange = { state, following, role: state === "member" ? (rel.role ?? "member") : rel.role };
  if (state === "member") return { kind: "change", next, message: fillCopy(ORG_COPY.control.welcome, { org }) };
  if (r.data.cancelled !== true) return { kind: "change", next, message: null };
  return {
    kind: "change",
    next,
    message:
      rel.following && !following
        ? fillCopy(ORG_COPY.membership.cancelledUnfollowed, { org })
        : ORG_COPY.membership.cancelled,
  };
}

// ── What a Join, Request or Accept answered ─────────────────────────────────

/** The taps that go through the one door, `POST /api/orgs/<handle>/join`. */
export type JoinPressKind = "join" | "request" | "accept";

/** vibeRequest's fallback line for each. */
export function joinPressFailure(kind: JoinPressKind): string {
  if (kind === "accept") return ORG_COPY.control.acceptFailed;
  return kind === "request" ? ORG_COPY.control.requestFailed : ORG_COPY.control.joinFailed;
}

/** The answer, as vibeRequest hands it over (only the fields read here). */
export type JoinAnswer =
  | { ok: true; data: { joined?: unknown; pending?: unknown; role?: unknown; org_follow_state?: unknown } }
  | { ok: false; code?: string | null; error?: string | null };

/**
 * What the answer means for the control, in one place for `OrgJoinControl`
 * and the follower's Board tile (wave-2 repair, finding 17):
 *   - `change`: the standing to show (`audience` when a refusal named the
 *     school), with the welcome toast only for an accepted invite (a Join's
 *     own button says Joined);
 *   - `unclear`: a 2xx that says neither joined nor pending, toast `message`;
 *   - `refused`: any other refusal, which the caller toasts its own way.
 * The role is the server's, and whether asking followed is the server's
 * `org_follow_state` (an older server that doesn't say leaves it as it was).
 */
export function joinOutcome(
  rel: Pick<OrgRelation, "state" | "following" | "role" | "audience">,
  kind: JoinPressKind,
  r: JoinAnswer,
):
  | { kind: "change"; next: OrgControlChange; audience: OrgAudience; welcome: boolean; notice?: string }
  | { kind: "unclear"; message: string }
  | { kind: "refused" } {
  const keep = (state: OrgDisplayState, audience: OrgAudience = rel.audience) =>
    ({ kind: "change", next: { state, following: rel.following, role: rel.role }, audience, welcome: false }) as const;
  if (r.ok) {
    if (r.data.joined === true) {
      const role = typeof r.data.role === "string" && ["owner", "admin", "member"].includes(r.data.role) ? (r.data.role as OrgRole) : "member";
      return { kind: "change", next: { state: "member", following: true, role }, audience: rel.audience, welcome: kind === "accept" };
    }
    if (r.data.pending === true) {
      const f = r.data.org_follow_state;
      const following = f === "following" ? true : f === "not_following" ? false : rel.following;
      return { kind: "change", next: { state: "requested", following, role: rel.role }, audience: rel.audience, welcome: false };
    }
    return { kind: "unclear", message: `${joinPressFailure(kind)} Try again.` };
  }
  if (r.code === "invite_only") return keep("invite_only");
  if (r.code === "school_unverified") return keep("unverified");
  // An officer said no less than two weeks ago (Oct 22, 2026): the control
  // stops offering Request, and `notice` is the route's own sentence with
  // the day ("Not this time. You can ask again on Nov 5."), for a toast.
  if (r.code === "recently_declined") {
    const said = typeof r.error === "string" ? r.error.trim() : "";
    return { ...keep("declined"), notice: said || ORG_COPY.membership.declinedLater };
  }
  if (r.code === "audience_mismatch") {
    const error = r.error ?? "";
    const audience = /open to Purdue students only\.?$/.test(error) ? "purdue" : /open to IU students only\.?$/.test(error) ? "iu" : rel.audience;
    return keep("audience_blocked", audience);
  }
  return { kind: "refused" };
}

// ── What a control shows between its tap and the page's refresh ─────────────

/** What the server said to a control's own tap, and the relation it was tapped on. */
export type KeptAnswer = OrgControlChange & {
  basis: string;
  audience: OrgAudience;
  /** The server said the club is gone (hidden or deleted): every control disables. */
  gone: boolean;
};

/** A control's memory: the relation it last rendered (`seen`) and its own tap's answer. */
export type ControlMemory = { seen: string; kept: KeptAnswer | null };

/** One key per relation a parent can pass: any field that differs is a new relation. */
export function relationKey(r: OrgRelation): string {
  return [r.handle, r.state, r.following, r.role, r.reason, r.audience, r.joinPolicy, r.askAgainAt ?? ""].join("|");
}

/**
 * The memory once the parent passes `relation`. A new relation (a refresh
 * landed, or the parent's own state caught up) forgets the kept answer FOR
 * GOOD, even when a later refresh brings back the relation it was tapped on.
 * Two controls on one page both follow (the club page's header and its Board
 * card), so a header's old Unfollow answer must not come back to life when
 * the card's Follow refreshes the page to the relation that Unfollow was
 * tapped on: the two would disagree until a reload. The same object when
 * nothing changed, so a caller can tell.
 */
export function memoryFor(m: ControlMemory, relation: OrgRelation): ControlMemory {
  const seen = relationKey(relation);
  return m.seen === seen ? m : { seen, kept: null };
}

/**
 * What a control renders: the parent's relation, with the control's own kept
 * answer laid over it while that answer is for the relation on screen. A
 * member always follows.
 */
export function shownRelation(relation: OrgRelation, m: ControlMemory): { rel: OrgRelation; gone: boolean } {
  const basis = relationKey(relation);
  const live = m.seen === basis && m.kept?.basis === basis ? m.kept : null;
  const state = live?.state ?? relation.state;
  return {
    rel: {
      ...relation,
      state,
      following: state === "member" ? true : (live?.following ?? relation.following),
      role: live ? live.role : relation.role,
      audience: live?.audience ?? relation.audience,
    },
    gone: live?.gone ?? false,
  };
}
