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
 */

import type { JoinState, JoinPolicy, OrgAudience, OrgRole } from "./join-state";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Every state a club control renders: the nine signed-in {@link JoinState}
 * values plus signed out. The literal is re-declared rather than imported
 * (`SIGNED_OUT` is a runtime value, and this module takes types only).
 */
export type OrgDisplayState = JoinState | "signed_out";

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
  | "status";

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

/** Officer settings: follow is not a setting (founder decision). */
export const OFFICER_FOLLOW_HELP =
  "Anyone can follow your club. This only sets who becomes a member.";

/** Under "Open to" (invites spec A9: the check happens when they join). */
export const AUDIENCE_HELP =
  "Checked against each student's verified school email when they join.";

/** Settings fields a mod sees but can't change. */
export const MOD_READONLY = "Only owners and admins can change this.";

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
    requestPolicy: "Officers approve requests",
    requestVisiting: "You're visiting, so officers approve requests",
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
 */
function wantsDisclosure(rel: OrgRelation, showsFollow: boolean): boolean {
  return (
    rel.joinPolicy !== "open" &&
    showsFollow &&
    rel.state !== "member" &&
    rel.state !== "hidden" &&
    rel.state !== "signed_out"
  );
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
  // Every state past member/hidden/signed_out renders F.
  const disclosure = wantsDisclosure(rel, isFollowAction(F)) ? FOLLOW_DISCLOSURE : null;
  const view = (membership: OrgAction[]): OrgHeaderView => ({
    follow: F,
    followSub: null,
    membership,
    disclosure,
  });

  switch (rel.state) {
    case "signed_out":
      return { follow: signInAction(rel.handle), followSub: null, membership: [], disclosure };
    case "member":
      // Joining followed them, and a member can't unfollow (409 member_follows).
      return {
        follow: action("status", ORG_COPY.buttons.following, "quiet", { disabled: true }),
        followSub: ORG_COPY.subs.membersFollow,
        membership: [action("status", ORG_COPY.buttons.joined, "quiet", { disabled: true })],
        disclosure,
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
        disclosure,
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

// ── Rows, cards and onboarding ──────────────────────────────────────────────

/**
 * Phone rows, desktop cards and onboarding: one or two controls, a chip that
 * never repeats a control, and meta labels (plan §6 F5a table).
 *
 * The rules this keeps, which `join-copy.test.ts` walks for every state:
 *   - at most one `filled` action;
 *   - `line` layout only for an open club on phone rows and onboarding, where
 *     Follow and Join share a full-width row (critic C16: Join is never hidden
 *     behind Follow);
 *   - onboarding never offers Request — a request is a message to officers,
 *     not a first-run step;
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
    case "can_request":
      // Follow first (Q5). Following → the next step is asking.
      if (!rel.following) {
        actions = [action("follow", ORG_COPY.buttons.follow, "filled")];
      } else if (surface === "phone_row") {
        actions = [action("request", ORG_COPY.buttons.request, "filled")];
        chip = ORG_COPY.chips.following;
      } else if (surface === "card") {
        actions = [
          action("unfollow", ORG_COPY.buttons.following, "quiet"),
          action("request", ORG_COPY.buttons.requestToJoin, "outline"),
        ];
      } else {
        actions = [action("unfollow", ORG_COPY.buttons.following, "quiet")];
      }
      break;
    case "requested":
    case "invite_only":
    case "audience_blocked":
    case "unverified":
      actions = [followToggle(rel.following)];
      break;
  }

  const showsFollow = actions.some(isFollowAction);
  return {
    chip,
    actions,
    layout,
    disclosure: wantsDisclosure(rel, showsFollow) ? FOLLOW_DISCLOSURE : null,
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
    case "request":
      return { state: "requested", following: rel.following, role: rel.role };
    case "decline":
      return {
        state: stateAfterDecline(rel.joinPolicy),
        following: rel.following,
        role: rel.role,
        declined: true,
      };
    default:
      return null;
  }
}
