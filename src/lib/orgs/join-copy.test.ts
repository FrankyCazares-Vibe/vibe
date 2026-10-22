/**
 * Tests for `join-copy.ts` — the club buttons, chips and copy every surface
 * shares (wave plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`
 * §6 F5a B). Walks all 11 display states × following × join policy × surface
 * (`declined` since Oct 22, 2026), plus the club page's follow slot and
 * Membership box.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts
 *
 * The module under test has only `import type` lines, which type stripping
 * erases, so it loads through a dynamic import of its ".ts" path — the same
 * pattern as `join-state.test.ts:20`. The specifier goes through a variable
 * because tsc refuses a literal ".ts" specifier.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./join-copy.ts";
const {
  AUDIENCE_HELP,
  CAMPUS_TIME_ZONE,
  FOLLOWER_COUNT_FLOOR,
  FOLLOW_DISCLOSURE,
  LEAVE_DROPS_FOLLOW_SOURCES,
  REQUEST_DISCLOSURE,
  MOD_READONLY,
  OFFICER_FOLLOW_HELP,
  ORG_COPY,
  ORG_DISPLAY_STATES,
  WHO_CAN_JOIN_OPTIONS,
  audienceChip,
  boardCardView,
  cancelOutcome,
  changeAfter,
  channelsGateCopy,
  fillCopy,
  followerCountText,
  followsSinceText,
  inviteRowButton,
  inviteSubText,
  isOrgDisplayState,
  joinOutcome,
  joinPolicyNotice,
  joinPressFailure,
  keepFollowingDefault,
  memberCountText,
  membershipBoxView,
  memoryFor,
  openToFact,
  openToOptions,
  orgErrorCopy,
  orgFollowSlot,
  orgHeaderView,
  orgMenuItems,
  orgRowView,
  pendingInviteText,
  policyChip,
  relationKey,
  relativeAgoText,
  shownRelation,
  stateAfterDecline,
  whoCanJoinFact,
} = (await import(specifier)) as typeof import("./join-copy");

type Relation = import("./join-copy").OrgRelation;
type Action = import("./join-copy").OrgAction;
type DisplayState = import("./join-copy").OrgDisplayState;

const STATES: DisplayState[] = [
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
];
const POLICIES = ["open", "request", "invite", null] as const;
const SURFACES = ["phone_row", "card", "onboarding"] as const;

function rel(over: Partial<Relation>): Relation {
  return {
    handle: "sae",
    orgName: "SAE",
    state: "can_join",
    following: false,
    role: null,
    reason: null,
    audience: "both",
    joinPolicy: "open",
    ...over,
  };
}

/** Every combination the walk covers, with `following` forced for members. */
function* combos() {
  for (const state of STATES) {
    for (const following of [true, false]) {
      for (const joinPolicy of POLICIES) {
        yield rel({
          state,
          following: state === "member" ? true : following,
          role: state === "member" ? "member" : null,
          joinPolicy,
          reason: state === "can_request" ? "policy" : null,
        });
      }
    }
  }
}

const isFollowKind = (a: Action) => a.kind === "follow" || a.kind === "unfollow";
const norm = (s: string) => s.replace(/[✓\s]+/g, " ").trim().toLowerCase();
const label = (r: Relation) => `${r.state}/${r.following ? "following" : "not"}/${r.joinPolicy}`;

// ── orgRowView, the whole walk ──────────────────────────────────────────────

test("row views: 1–2 actions with labels, at most one filled", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const where = `${label(r)} on ${surface}`;
      assert.ok(view.actions.length >= 1 && view.actions.length <= 2, where);
      for (const a of view.actions) assert.ok(a.label.trim().length > 0, where);
      assert.ok(view.actions.filter((a) => a.tone === "filled").length <= 1, where);
    }
  }
});

test("row views: no follow control for members, hidden clubs or signed-out viewers", () => {
  for (const r of combos()) {
    if (r.state !== "member" && r.state !== "hidden" && r.state !== "signed_out") continue;
    for (const surface of SURFACES) {
      assert.ok(!orgRowView(r, surface).actions.some(isFollowKind), `${label(r)} on ${surface}`);
    }
  }
});

test("row views: line layout for Follow + Join and Follow + Request, on phone rows and onboarding", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const twoDoors = r.state === "can_join" || r.state === "can_request";
      const expected = twoDoors && surface !== "card" ? "line" : "slot";
      assert.equal(orgRowView(r, surface).layout, expected, `${label(r)} on ${surface}`);
    }
  }
});

/** The disclosure rule: near a follow control on a club not known to be open, and near any Request. */
function expectsDisclosure(r: Relation, actions: Action[]): boolean {
  if (r.state === "member" || r.state === "hidden" || r.state === "signed_out") return false;
  if (actions.some((a) => a.kind === "request")) return true;
  return r.joinPolicy !== "open" && actions.some(isFollowKind);
}

test("row views: the disclosure shows near Follow on a club not known to be open, and near every Request", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const expected = expectsDisclosure(r, view.actions);
      const asking = !r.following && view.actions.some((a) => a.kind === "request");
      assert.equal(view.disclosure, expected ? (asking ? REQUEST_DISCLOSURE : FOLLOW_DISCLOSURE) : null, `${label(r)} on ${surface}`);
    }
  }
});

test("row views: the chip never repeats a control, and there is no Joined chip", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const where = `${label(r)} on ${surface}`;
      assert.ok(view.chip === null || view.chip === "Invited you" || view.chip === "Following", where);
      if (view.chip === null) continue;
      for (const a of view.actions) assert.notEqual(norm(a.label), norm(view.chip), where);
      if (view.chip === "Following") assert.ok(!view.actions.some(isFollowKind), where);
    }
  }
});

test("row views: Request needs no follow first, on every surface, and only members get a sub", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const where = `${label(r)} on ${surface}`;
      // One request flow everywhere (club model): lists, onboarding and the
      // page all offer Request whether or not they follow yet.
      assert.equal(view.actions.some((a) => a.kind === "request"), r.state === "can_request", where);
      const wantsSub = surface === "onboarding" && r.state === "member";
      assert.equal(view.sub, wantsSub ? "Members follow automatically" : null, where);
    }
  }
});

test("header: Request needs no follow first either", () => {
  for (const r of combos()) {
    if (r.state !== "can_request") continue;
    const view = orgHeaderView(r);
    assert.ok(view.membership.some((a) => a.kind === "request"), label(r));
  }
});

// ── orgRowView, the table rows that matter most ─────────────────────────────

const labels = (actions: Action[]) => actions.map((a) => `${a.kind}:${a.label}:${a.tone}`);

test("open club, not following: Follow + Join on one line (critic C16)", () => {
  const view = orgRowView(rel({ state: "can_join" }), "phone_row");
  assert.deepEqual(labels(view.actions), ["follow:Follow:filled", "join:Join:outline"]);
  assert.equal(view.layout, "line");
  assert.equal(view.chip, null);
});

test("open club, following: Join becomes the filled control", () => {
  const view = orgRowView(rel({ state: "can_join", following: true }), "card");
  assert.deepEqual(labels(view.actions), ["unfollow:Following ✓:quiet", "join:Join:filled"]);
  assert.equal(view.layout, "slot");
});

test("request club: Follow + Request together, the same shape as Follow + Join", () => {
  const notFollowing = rel({ state: "can_request", joinPolicy: "request", reason: "policy" });
  for (const surface of ["phone_row", "onboarding"] as const) {
    const view = orgRowView(notFollowing, surface);
    assert.deepEqual(labels(view.actions), ["follow:Follow:filled", "request:Request:outline"], surface);
    assert.equal(view.layout, "line", surface);
    assert.equal(view.chip, null, surface);
    assert.equal(view.disclosure, REQUEST_DISCLOSURE, surface);
  }
  assert.deepEqual(labels(orgRowView(notFollowing, "card").actions), [
    "follow:Follow:filled",
    "request:Request to join:outline",
  ]);

  const following = { ...notFollowing, following: true };
  for (const surface of ["phone_row", "onboarding"] as const) {
    const view = orgRowView(following, surface);
    assert.deepEqual(labels(view.actions), ["unfollow:Following ✓:quiet", "request:Request:filled"], surface);
    assert.equal(view.chip, null, surface);
  }
  const card = orgRowView(following, "card");
  assert.deepEqual(labels(card.actions), ["unfollow:Following ✓:quiet", "request:Request to join:filled"]);
  assert.equal(card.layout, "slot");
  assert.equal(card.disclosure, FOLLOW_DISCLOSURE);
});

test("visiting an open club: asking follows, so the disclosure shows by the Request", () => {
  const visiting = rel({ state: "can_request", joinPolicy: "open", reason: "visiting" });
  for (const surface of SURFACES) assert.equal(orgRowView(visiting, surface).disclosure, REQUEST_DISCLOSURE, surface);
  assert.equal(orgHeaderView(visiting).disclosure, FOLLOW_DISCLOSURE);
  // An open club you can simply join still needs no line.
  assert.equal(orgRowView(rel({ state: "can_join" }), "phone_row").disclosure, null);
});

test("invited: Accept (and Decline on cards), chipped 'Invited you'", () => {
  const r = rel({ state: "invited", joinPolicy: "invite" });
  assert.deepEqual(labels(orgRowView(r, "phone_row").actions), ["accept:Accept:filled"]);
  assert.deepEqual(labels(orgRowView(r, "card").actions), [
    "accept:Accept invite:filled",
    "decline:Decline:outline",
  ]);
  for (const surface of SURFACES) assert.equal(orgRowView(r, surface).chip, "Invited you");
});

test("member rows are a locked 'Joined ✓'", () => {
  for (const surface of SURFACES) {
    const view = orgRowView(rel({ state: "member", following: true, role: "owner" }), surface);
    assert.deepEqual(labels(view.actions), ["status:Joined ✓:quiet"]);
    assert.equal(view.actions[0]!.disabled, true);
  }
});

test("signed out rows link to sign in and come back to the club", () => {
  const [a] = orgRowView(rel({ state: "signed_out", handle: "sae" }), "card").actions;
  assert.equal(a!.kind, "sign_in");
  assert.equal(a!.label, "Sign in to follow");
  assert.equal(a!.href, "/auth/login?next=%2Forgs%2Fsae");
});

test("row meta: policy, Requested, audience, Hidden — in that order, no counts", () => {
  assert.deepEqual(
    orgRowView(rel({ state: "requested", joinPolicy: "request", audience: "purdue" }), "card").meta,
    ["By request", "Requested", "Purdue only"],
  );
  assert.deepEqual(
    orgRowView(rel({ state: "hidden", joinPolicy: "invite", audience: "iu" }), "phone_row").meta,
    ["Invite only", "IU only", "Hidden"],
  );
  assert.deepEqual(orgRowView(rel({ state: "can_join" }), "onboarding").meta, []);
});

// ── orgHeaderView ───────────────────────────────────────────────────────────

test("header: every state has labelled controls and a membership column of at most 2", () => {
  for (const r of combos()) {
    const view = orgHeaderView(r);
    const where = label(r);
    const all = [...(view.follow ? [view.follow] : []), ...view.membership];
    assert.ok(all.length >= 1, where);
    for (const a of all) assert.ok(a.label.trim().length > 0, where);
    assert.ok(view.membership.length <= 2, where);
    assert.ok(view.membership.filter((a) => a.tone === "filled").length <= 1, where);
    // One filled action across the whole header, follow column included.
    assert.ok(all.filter((a) => a.tone === "filled").length <= 1, where);
    assert.ok(!view.membership.some(isFollowKind), where);
    if (r.state === "member" || r.state === "hidden" || r.state === "signed_out") {
      assert.ok(!(view.follow && isFollowKind(view.follow)), where);
    }
    const expected = expectsDisclosure(r, all);
    assert.equal(view.disclosure, expected ? FOLLOW_DISCLOSURE : null, where);
  }
});

test("header: SAE for a non-member — Follow, disabled Invite only, the disclosure", () => {
  const view = orgHeaderView(rel({ state: "invite_only", joinPolicy: "invite" }));
  assert.equal(view.follow?.label, "Follow");
  assert.equal(view.follow?.tone, "filled");
  assert.deepEqual(labels(view.membership), ["status:Invite only:quiet"]);
  assert.equal(view.membership[0]!.disabled, true);
  assert.equal(view.membership[0]!.sub, "Officers invite members");
  assert.equal(view.disclosure, "Officers can see who follows this club.");
});

test("header: invited — Accept invite is the one filled action, Follow steps down", () => {
  const view = orgHeaderView(rel({ state: "invited", joinPolicy: null }));
  assert.equal(view.follow?.kind, "follow");
  assert.equal(view.follow?.tone, "outline");
  assert.deepEqual(labels(view.membership), ["accept:Accept invite:filled", "decline:Decline:outline"]);
  // An invite row doesn't carry the policy; unknown still gets the disclosure.
  assert.equal(view.disclosure, FOLLOW_DISCLOSURE);
  assert.equal(orgHeaderView(rel({ state: "invited", following: true })).follow?.tone, "quiet");
});

test("header: a member follows automatically and can't unfollow", () => {
  const view = orgHeaderView(rel({ state: "member", following: true, role: "member" }));
  assert.equal(view.follow?.kind, "status");
  assert.equal(view.follow?.label, "Following ✓");
  assert.equal(view.follow?.disabled, true);
  assert.equal(view.followSub, "Members follow automatically");
  assert.deepEqual(labels(view.membership), ["status:Joined ✓:quiet"]);
});

test("header: request subs name the reason; audience subs name the club", () => {
  const policy = orgHeaderView(rel({ state: "can_request", joinPolicy: "request", reason: "policy" }));
  assert.equal(policy.membership[0]!.label, "Request to join");
  assert.equal(policy.membership[0]!.sub, "Officers approve requests. Asking also follows the club.");
  const visiting = orgHeaderView(rel({ state: "can_request", reason: "visiting" }));
  assert.equal(visiting.membership[0]!.sub, "You're visiting, so officers approve requests. Asking also follows the club.");
  const purdue = orgHeaderView(rel({ state: "audience_blocked", audience: "purdue", orgName: "Purdue Club" }));
  assert.equal(purdue.membership[0]!.label, "Purdue students only");
  assert.equal(purdue.membership[0]!.sub, "Purdue Club is open to Purdue students only.");
  const unverified = orgHeaderView(rel({ state: "unverified" }));
  assert.equal(unverified.membership[0]!.href, "/auth/school-email");
  const hidden = orgHeaderView(rel({ state: "hidden" }));
  assert.equal(hidden.follow, null);
  assert.equal(hidden.membership[0]!.sub, "Hidden by Vibe. Only members can see it.");
});

// ── Text helpers ────────────────────────────────────────────────────────────

test("follower counts hide below the floor (critic C13); member counts pluralise", () => {
  assert.equal(FOLLOWER_COUNT_FLOOR, 5);
  assert.equal(followerCountText(null), null);
  assert.equal(followerCountText(4), null);
  assert.equal(followerCountText(5), "5 followers");
  assert.equal(followerCountText(Number.NaN), null);
  assert.equal(memberCountText(null), null);
  assert.equal(memberCountText(1), "1 member");
  assert.equal(memberCountText(0), "0 members");
  assert.equal(memberCountText(12), "12 members");
});

test("dates: follows since, invite subs, a bad timestamp never prints", () => {
  assert.equal(followsSinceText("2026-09-16T12:00:00.000Z"), "Follows since Sep 16");
  assert.equal(followsSinceText("not a date"), null);
  assert.equal(followsSinceText(null), null);
  assert.equal(inviteSubText("Franky", "2026-10-16T12:00:00.000Z"), "Invited by Franky · Expires Oct 16");
  assert.equal(inviteSubText(null, "2026-10-16T12:00:00.000Z"), "Invited by an officer · Expires Oct 16");
  assert.equal(inviteSubText("  ", "garbage"), "Invited by an officer");
  // 02:00 UTC on Oct 17 is still Oct 16 in Indianapolis (EDT, UTC-4).
  const late = "2026-10-17T02:00:00.000Z";
  assert.equal(inviteSubText("Franky", late, "UTC"), "Invited by Franky · Expires Oct 17");
  assert.equal(
    inviteSubText("Franky", late, "America/Indiana/Indianapolis"),
    "Invited by Franky · Expires Oct 16",
  );
});

test("relative times and the pending invite line", () => {
  const now = Date.parse("2026-09-16T12:00:00.000Z");
  assert.equal(relativeAgoText("2026-09-16T11:59:30.000Z", now), "just now");
  assert.equal(relativeAgoText("2026-09-16T11:55:00.000Z", now), "5m ago");
  assert.equal(relativeAgoText("2026-09-16T09:00:00.000Z", now), "3h ago");
  assert.equal(relativeAgoText("2026-09-14T12:00:00.000Z", now), "2d ago");
  assert.equal(relativeAgoText("2026-09-03T12:00:00.000Z", now), "on Sep 3");
  assert.equal(relativeAgoText("2026-09-17T12:00:00.000Z", now), "just now");
  assert.equal(pendingInviteText("2026-09-14T12:00:00.000Z", "Franky", now), "Invited 2d ago by Franky");
  assert.equal(pendingInviteText("2026-09-14T12:00:00.000Z", null, now), "Invited 2d ago by an officer");
});

test("chips, facts and settings options", () => {
  assert.deepEqual([policyChip("open"), policyChip("request"), policyChip("invite"), policyChip(null)], [
    "Open",
    "By request",
    "Invite only",
    null,
  ]);
  assert.deepEqual([audienceChip("iu"), audienceChip("purdue"), audienceChip("both")], ["IU only", "Purdue only", null]);
  assert.deepEqual([whoCanJoinFact("open"), whoCanJoinFact("request"), whoCanJoinFact("invite")], [
    "Anyone",
    "By request",
    "By invitation",
  ]);
  assert.deepEqual([openToFact("both"), openToFact("iu"), openToFact("purdue")], [
    "Anyone",
    "IU students",
    "Purdue students",
  ]);
  assert.deepEqual(
    WHO_CAN_JOIN_OPTIONS.map((o) => [o.value, o.label, o.sub]),
    [
      ["open", "Anyone can join", "Join instantly"],
      ["request", "Request to join", "Officers approve requests"],
      ["invite", "Invite only", "Officers invite members"],
    ],
  );
  assert.equal(openToOptions({ name: "Indianapolis", shared: true })[0]!.label, "All of Indianapolis (IU + Purdue)");
  assert.equal(openToOptions({ name: "Bloomington", shared: false })[0]!.label, "IU and Purdue students");
  assert.deepEqual(openToOptions(null).map((o) => o.label), [
    "IU and Purdue students",
    "IU students only",
    "Purdue students only",
  ]);
  assert.equal(OFFICER_FOLLOW_HELP, "Anyone can follow your club. This only sets who becomes a member.");
  assert.equal(AUDIENCE_HELP, "Checked against each student's verified school email when they join.");
  assert.equal(MOD_READONLY, "Only the owner and officers can change this.");
});

test("join policy notice: hidden first, silent for members and open clubs", () => {
  const base = { state: "can_join" as const, joinPolicy: "open" as const, audience: "both" as const, orgName: "SAE", hidden: false };
  assert.equal(joinPolicyNotice({ ...base, state: "member", hidden: true }), ORG_COPY.notices.hidden);
  assert.equal(joinPolicyNotice({ ...base, state: "member", joinPolicy: "invite" }), null);
  assert.equal(joinPolicyNotice(base), null);
  assert.equal(
    joinPolicyNotice({ ...base, state: "audience_blocked", audience: "iu" }),
    "SAE only takes IU students as members. You can still follow.",
  );
  assert.equal(
    joinPolicyNotice({ ...base, state: "invite_only", joinPolicy: "invite" }),
    "Invite only. Anyone can follow this club — officers add members.",
  );
  assert.equal(
    joinPolicyNotice({ ...base, state: "signed_out", joinPolicy: "request" }),
    "Anyone can follow this club. Officers approve members.",
  );
});

test("channels gate: members see chats; can_join and can_request get one inline control", () => {
  assert.equal(channelsGateCopy(rel({ state: "member", following: true, role: "member" })), null);
  const join = channelsGateCopy(rel({ state: "can_join" }));
  assert.equal(join?.line, "Chats are for members. Join to start talking.");
  assert.equal(join?.inline?.kind, "join");
  const ask = channelsGateCopy(rel({ state: "can_request", joinPolicy: "request" }));
  assert.equal(ask?.inline?.label, "Request to join");
  assert.equal(channelsGateCopy(rel({ state: "invite_only" }))?.line, "Chats are for members. Officers invite members.");
  for (const state of ["requested", "invite_only", "invited", "unverified", "audience_blocked", "hidden", "signed_out"] as const) {
    const gate = channelsGateCopy(rel({ state }));
    assert.ok(gate && gate.line.startsWith("Chats are for members."), state);
    assert.equal(gate.inline, null, state);
  }
});

test("error copy: known club codes toast, state-flipping codes don't", () => {
  assert.equal(orgErrorCopy("not_found"), "This org isn't available.");
  assert.equal(orgErrorCopy(429), "Too many tries. Try again in a minute.");
  assert.equal(orgErrorCopy("member_follows"), "Members follow automatically.");
  assert.equal(orgErrorCopy("org_hidden"), "This org is hidden, so nobody new can join it.");
  assert.equal(orgErrorCopy("invite_not_pending"), "This invite is no longer open.");
  assert.equal(orgErrorCopy("invite_not_found"), "This invite is no longer open.");
  for (const code of ["invite_only", "audience_mismatch", "school_unverified", "terms_required", null]) {
    assert.equal(orgErrorCopy(code), null, String(code));
  }
});

// ── The invite sheet's row button ───────────────────────────────────────────

test("invite rows decide by state first, eligible second", () => {
  const opts = { orgName: "SAE", canInvite: true, blockedReason: null, sent: false } as const;
  const row = (over: Partial<Parameters<typeof inviteRowButton>[0]>) =>
    inviteRowButton({ state: "none", eligible: true, reason: null, ...over }, opts);

  assert.deepEqual(row({}), { kind: "invite", label: "Invite", sub: null, disabled: false, undo: false });
  // A Purdue member of a club later narrowed to IU is still a member.
  assert.equal(row({ state: "member", eligible: false, reason: "audience_iu" }).label, "Member");
  assert.equal(row({ state: "invited", eligible: false }).label, "Invited");
  assert.equal(row({ state: "invited" }).disabled, true);

  const approve = row({ state: "requested", request_id: "req-1" });
  assert.equal(approve.kind, "approve");
  assert.equal(approve.label, "Approve request");
  assert.equal(approve.disabled, false);
  assert.equal(row({ state: "requested" }).disabled, true, "no request id, nothing to approve");

  const declined = row({ state: "declined_recently", available_at: "2026-09-30T12:00:00.000Z" });
  assert.deepEqual([declined.label, declined.sub, declined.disabled], ["Declined", "You can invite again Sep 30", true]);
  const capped = row({ state: "invite_cap_reached", available_at: null });
  assert.deepEqual([capped.label, capped.sub], ["Invited enough", null]);

  assert.equal(row({ eligible: false, reason: "audience_iu" }).sub, "SAE is open to IU students only.");
  assert.equal(row({ eligible: false, reason: "audience_purdue" }).sub, "SAE is open to Purdue students only.");
  assert.equal(row({ eligible: false, reason: "unverified" }).sub, "They haven't verified a school email yet.");
  assert.equal(row({ eligible: false, reason: "unverified" }).label, "Not eligible");
});

test("invite rows: a blocked org disables Invite; hidden also disables Approve; sent shows Undo", () => {
  const base = { state: "none", eligible: true, reason: null } as const;
  const unverifiedOrg = { orgName: "SAE", canInvite: false, blockedReason: "org_unverified", sent: false } as const;
  assert.equal(inviteRowButton(base, unverifiedOrg).disabled, true);
  assert.equal(inviteRowButton({ ...base, state: "requested", request_id: "r" }, unverifiedOrg).disabled, false);
  const hiddenOrg = { ...unverifiedOrg, blockedReason: "org_hidden" } as const;
  assert.equal(inviteRowButton({ ...base, state: "requested", request_id: "r" }, hiddenOrg).disabled, true);

  const sent = { orgName: "SAE", canInvite: true, blockedReason: null, sent: true } as const;
  assert.deepEqual(inviteRowButton(base, sent), {
    kind: "status",
    label: "Invited ✓",
    sub: null,
    disabled: true,
    undo: true,
  });
  // A fresher read that says they joined outranks the tap.
  assert.equal(inviteRowButton({ ...base, state: "member" }, sent).label, "Member");
});

// ── What a tap changes ──────────────────────────────────────────────────────

test("changes: follow toggles, join/accept make a following member, decline follows the policy", () => {
  const r = rel({ state: "invited", joinPolicy: "invite" });
  assert.deepEqual(changeAfter(r, "follow"), { state: "invited", following: true, role: null });
  assert.deepEqual(changeAfter({ ...r, following: true }, "unfollow"), { state: "invited", following: false, role: null });
  assert.deepEqual(changeAfter(r, "accept"), { state: "member", following: true, role: "member" });
  assert.deepEqual(changeAfter(rel({ state: "can_join" }), "join"), { state: "member", following: true, role: "member" });
  // Asking follows the club, whether or not they followed before.
  for (const following of [true, false]) {
    assert.deepEqual(changeAfter(rel({ state: "can_request", following }), "request"), {
      state: "requested",
      following: true,
      role: null,
    });
  }
  assert.deepEqual(changeAfter(r, "decline"), { state: "invite_only", following: false, role: null, declined: true });
  assert.equal(changeAfter(r, "status"), null);
  assert.equal(changeAfter(r, "sign_in"), null);
  assert.deepEqual([stateAfterDecline("open"), stateAfterDecline("invite"), stateAfterDecline("request"), stateAfterDecline(null)], [
    "can_join",
    "invite_only",
    "can_request",
    "can_request",
  ]);
});

// ── The table itself ────────────────────────────────────────────────────────

test("fillCopy fills once and leaves unknown keys visible", () => {
  assert.equal(fillCopy("{org} is open to IU students only.", { org: "{name}" }), "{name} is open to IU students only.");
  assert.equal(fillCopy("Pending invites ({n})", { n: 3 }), "Pending invites (3)");
  assert.equal(fillCopy("Invited by {name}", {}), "Invited by {name}");
});

test("ORG_COPY is frozen all the way down", () => {
  assert.ok(Object.isFrozen(ORG_COPY));
  assert.ok(Object.isFrozen(ORG_COPY.buttons));
  assert.ok(Object.isFrozen(ORG_COPY.facts.whoCanJoin));
  assert.ok(Object.isFrozen(WHO_CAN_JOIN_OPTIONS));
  assert.throws(() => {
    (ORG_COPY.buttons as { follow: string }).follow = "Subscribe";
  });
});

test("join-copy.ts has no runtime imports: every import line is `import type`", () => {
  const source = readFileSync(new URL("./join-copy.ts", import.meta.url), "utf8");
  const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
  assert.ok(imports.length > 0);
  for (const line of imports) assert.ok(line.trimStart().startsWith("import type"), line);
  assert.ok(!/\brequire\(|\bimport\(/.test(source), "no dynamic imports either");
});

test("S67 sec wave 2: the club-refusal copy never names a block", () => {
  const lines = [
    ORG_COPY.errors.joinUnavailable,
    ORG_COPY.errors.approveUnavailable,
    ORG_COPY.errors.removedNeedsAdmin,
    ORG_COPY.meta.removedBefore,
  ];
  for (const line of lines) {
    assert.equal(typeof line, "string");
    assert.ok(line.length > 0);
    assert.ok(!/block/i.test(line), line);
  }
  assert.equal(ORG_COPY.errors.joinUnavailable, "You can't join this club right now.");
  assert.ok(Object.isFrozen(ORG_COPY.errors));
});

test("S67 sec wave 2: the new refusal codes map to their neutral copy", () => {
  assert.equal(orgErrorCopy("join_unavailable"), ORG_COPY.errors.joinUnavailable);
  assert.equal(orgErrorCopy("approve_unavailable"), ORG_COPY.errors.approveUnavailable);
  assert.equal(orgErrorCopy("removed_needs_admin"), ORG_COPY.errors.removedNeedsAdmin);
});

// ── Club model: the Board card and the ⋯ menu ───────────────────────────────

const BOARD = "11111111-1111-4111-8111-111111111111";

function board(over: Partial<Parameters<typeof boardCardView>[0]>) {
  return boardCardView({
    state: "can_join",
    following: false,
    boardId: BOARD,
    boardReadable: null,
    followWouldRead: false,
    orgName: "SAE",
    ...over,
  });
}

test("board card: members Open, readable followers Read, would-be followers Follow", () => {
  const open = board({ state: "member", following: true, boardReadable: true });
  assert.equal(open?.kind, "open");
  assert.equal(open?.cta, "Open");
  assert.equal(open?.href, `/messages?channel=${BOARD}`);
  assert.equal(open?.title, "Announcement Board");

  const read = board({ state: "invite_only", following: true, boardReadable: true });
  assert.equal(read?.kind, "read");
  assert.equal(read?.cta, "Read the Board");
  assert.equal(read?.href, `/messages?channel=${BOARD}`);
  // A request follows, so a waiting request reads like any follower.
  assert.equal(board({ state: "requested", following: true, boardReadable: true })?.kind, "read");

  const follow = board({ state: "can_request", followWouldRead: true });
  assert.equal(follow?.kind, "follow");
  assert.equal(follow?.cta, "Follow to read the Board");
  assert.equal(follow?.href, null);
  // Signed out: no card, so a private window never shows a card the same
  // student, barred, doesn't get (wave-2 repair, finding 15).
  assert.equal(board({ state: "signed_out", followWouldRead: true }), null);
  assert.equal(board({ state: "signed_out", following: true, boardReadable: true, verifyToRead: true }), null);
});

test("board card: only the school email missing says Verify, follower or not; a readable Board never does", () => {
  const verify = board({ state: "unverified", verifyToRead: true });
  assert.equal(verify?.kind, "verify");
  assert.equal(verify?.cta, "Verify school email");
  assert.equal(verify?.href, "/auth/school-email");
  assert.equal(verify?.line, "SAE's officers post news here. Verify your school email to read it.");
  assert.equal(board({ state: "unverified", following: true, boardReadable: false, verifyToRead: true })?.kind, "verify");
  assert.equal(board({ state: "can_join", following: true, boardReadable: true, verifyToRead: true })?.kind, "read");
  assert.equal(board({ state: "member", following: true, boardReadable: true, verifyToRead: true })?.kind, "open");
  assert.equal(board({ state: "unverified", following: true, boardReadable: false }), null, "barred and unverified: nothing");
});

test("board card: anyone else gets no card, so a bar is never revealed", () => {
  // A follower the database says no to (removed, blocked, unverified, or the
  // club turned reading off) looks exactly like a club with no card at all.
  for (const boardReadable of [false, null]) {
    assert.equal(board({ state: "can_join", following: true, boardReadable, followWouldRead: true }), null);
    assert.equal(board({ state: "member", following: true, boardReadable }), null);
  }
  // A follower is never told "Follow to read".
  assert.equal(board({ following: true, boardReadable: false, followWouldRead: true }), null);
  assert.equal(board({ followWouldRead: false }), null);
  assert.equal(board({ boardId: null, state: "member", following: true, boardReadable: true }), null);
  assert.equal(board({ state: "hidden", followWouldRead: true }), null);
});

test("board card: the copy names the club and never says a club follows anyone", () => {
  assert.equal(board({ state: "member", following: true, boardReadable: true })?.line, "News from SAE's officers.");
  // Every sentence fills only {org}; no stray placeholder reaches the page.
  for (const line of [ORG_COPY.board.memberLine, ORG_COPY.board.followerLine, ORG_COPY.board.visitorLine, ORG_COPY.board.verifyLine, ORG_COPY.board.intro]) {
    assert.ok(line.includes("{org}"), line);
    assert.deepEqual(line.match(/\{\w+\}/g), ["{org}"], line);
  }
});

test("leave confirm: Keep following starts checked only for a follow they tapped", () => {
  assert.equal(keepFollowingDefault("profile"), true);
  assert.equal(keepFollowingDefault("discover"), true);
  assert.equal(keepFollowingDefault("onboarding"), true);
  assert.equal(keepFollowingDefault("join"), false);
  assert.equal(keepFollowingDefault("request"), false);
  assert.equal(keepFollowingDefault(null), false);
  assert.equal(keepFollowingDefault(undefined), false);
});

test("⋯ menu: Mute or Unmute for everyone signed in, Leave for members but the owner", () => {
  const kinds = (input: Parameters<typeof orgMenuItems>[0]) => orgMenuItems(input).map((i) => i.kind);
  assert.deepEqual(kinds({ signedIn: false, role: null, muted: false }), []);
  assert.deepEqual(kinds({ signedIn: true, role: null, muted: false }), ["mute"]);
  assert.deepEqual(kinds({ signedIn: true, role: null, muted: true }), ["unmute"]);
  assert.deepEqual(kinds({ signedIn: true, role: "member", muted: false }), ["mute", "leave"]);
  assert.deepEqual(kinds({ signedIn: true, role: "member", muted: true }), ["unmute", "leave"]);
  assert.deepEqual(kinds({ signedIn: true, role: "admin", muted: false }), ["mute", "leave"]);
  assert.deepEqual(kinds({ signedIn: true, role: "owner", muted: false }), ["mute"]);
  assert.deepEqual(
    orgMenuItems({ signedIn: true, role: "member", muted: false }).map((i) => i.label),
    ["Mute posts", "Leave club"],
  );
  assert.equal(orgErrorCopy("owner_cannot_leave"), ORG_COPY.menu.ownerCantLeave);
});

test("no club copy says a club follows a person", () => {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (v && typeof v === "object") for (const child of Object.values(v)) walk(child);
  };
  walk(ORG_COPY);
  for (const s of strings) {
    assert.ok(!/\{org\}\s+follows|club follows (you|them|people)|follow(s|ed)? you back/i.test(s), s);
  }
});

test("joinOutcome: one reading of a Join, Request or Accept answer for every control", () => {
  const base = { state: "can_request" as const, following: false, role: null, audience: "both" as const };
  // Joined: the server's role, following, and the welcome only for an accepted invite.
  const joined = joinOutcome(base, "join", { ok: true, data: { joined: true, role: "admin" } });
  assert.deepEqual(joined, { kind: "change", next: { state: "member", following: true, role: "admin" }, audience: "both", welcome: false });
  const accepted = joinOutcome({ ...base, state: "invited" }, "accept", { ok: true, data: { joined: true, role: "nonsense" } });
  assert.equal(accepted.kind === "change" && accepted.next.role, "member", "an unknown role reads as member");
  assert.equal(accepted.kind === "change" && accepted.welcome, true);
  // Pending: whether asking followed is the server's word.
  const asked = joinOutcome(base, "request", { ok: true, data: { pending: true, org_follow_state: "following" } });
  assert.deepEqual(asked.kind === "change" && asked.next, { state: "requested", following: true, role: null });
  const notFollowed = joinOutcome({ ...base, following: true }, "request", { ok: true, data: { pending: true, org_follow_state: "not_following" } });
  assert.equal(notFollowed.kind === "change" && notFollowed.next.following, false);
  const older = joinOutcome(base, "request", { ok: true, data: { pending: true } });
  assert.equal(older.kind === "change" && older.next.following, false, "an older server leaves the follow as it was");
  // A 2xx that says neither.
  assert.deepEqual(joinOutcome(base, "request", { ok: true, data: {} }), { kind: "unclear", message: `${joinPressFailure("request")} Try again.` });
  // Refusals that flip the state, the school named when the sentence names it.
  const purdue = joinOutcome(base, "join", { ok: false, code: "audience_mismatch", error: "SAE is open to Purdue students only." });
  assert.deepEqual(purdue, { kind: "change", next: { state: "audience_blocked", following: false, role: null }, audience: "purdue", welcome: false });
  const unnamed = joinOutcome({ ...base, audience: "iu" }, "join", { ok: false, code: "audience_mismatch", error: "No." });
  assert.equal(unnamed.kind === "change" && unnamed.audience, "iu");
  assert.equal(joinOutcome(base, "join", { ok: false, code: "invite_only" }).kind, "change");
  assert.equal(joinOutcome(base, "join", { ok: false, code: "school_unverified" }).kind, "change");
  assert.deepEqual(joinOutcome(base, "join", { ok: false, code: "join_unavailable" }), { kind: "refused" });
  assert.equal(joinPressFailure("accept"), ORG_COPY.control.acceptFailed);
  assert.equal(joinPressFailure("join"), ORG_COPY.control.joinFailed);
});

test("the controls read a join answer only through joinOutcome", () => {
  for (const file of ["../../components/orgs/OrgJoinControl.tsx", "../../components/mobile/messages/club/RoomComposer.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /joinOutcome\(rel, a\.kind, r\)/, file);
    assert.ok(!/state: "member", following: true, role: "member"/.test(src), `${file}: no hand-built joined state`);
    assert.ok(!/(=== |case )"audience_mismatch"/.test(src), `${file}: the refusal codes are joinOutcome's`);
  }
});

test("leave and mute words live in ORG_COPY.menu only: desktop Settings, the feed and the profile point at it", () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const home = read("../../app/campus/campus-home.tsx");
  for (const literal of ["You'll lose its chats", "Its posts stay in your feed", "You still follow it.", "keepFollowingStartsOn"]) {
    assert.ok(!home.includes(literal), `campus-home.tsx still spells out: ${literal}`);
  }
  assert.match(home, /keepFollowingDefault\(/);
  const feed = read("../posts/feed-actions.ts");
  assert.match(feed, /fillCopy\(ORG_COPY\.menu\.muted, \{ org: club\.name \}\)/);
  assert.ok(!feed.includes("You won't see"), "feed-actions builds its lines from ORG_COPY.menu");
  const clubs = read("../../components/profile/clubs-model.ts");
  for (const key of ["muted", "mutedMember", "unmuted", "muteFailed", "unmuteFailed"]) {
    assert.match(clubs, new RegExp(`  ${key}: ORG_COPY\\.menu\\.${key},`), key);
  }
  // Every mute confirmation says the club isn't told.
  for (const line of [ORG_COPY.menu.muted, ORG_COPY.menu.mutedMember]) assert.match(line, /the club isn't told\.$/i, line);
  // One list of follows a leave drops, read by the default and the join route.
  assert.deepEqual([...LEAVE_DROPS_FOLLOW_SOURCES], ["join", "request"]);
  assert.match(read("../../app/api/orgs/[slug]/join/route.ts"), /LEAVE_DROPS_SOURCES: readonly string\[\] = LEAVE_DROPS_FOLLOW_SOURCES;/);
});

test("the Announcement Board has one name: no 'announcements' label, and 'admin' never shows to officers", () => {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (v && typeof v === "object") for (const child of Object.values(v)) walk(child);
  };
  walk(ORG_COPY.board);
  for (const s of strings) assert.ok(!/\bannouncements\b/i.test(s), s);
  walk(ORG_COPY);
  for (const s of [...strings, MOD_READONLY]) assert.ok(!/\badmins?\b/i.test(s), s);
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  for (const file of [
    "../../components/mobile/messages/club/FollowerBoard.tsx",
    "../../components/mobile/messages/home/FollowedBoardsRow.tsx",
    "../../components/mobile/messages/club/helpers.ts",
  ]) {
    const src = read(file).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    assert.ok(!/["`][^"`]*\b[Aa]nnouncements?\b[^"`]*["`]/.test(src), `${file}: a string says "announcements"`);
  }
});

// ── Two controls, one page ──────────────────────────────────────────────────

test("the club page's two Follow controls agree after every refresh: an old answer never comes back", () => {
  // The header's control and the Board card's both render the page's one
  // relation; each keeps the server's answer to its own tap until the
  // refresh (`router.refresh()`) hands it a new relation.
  type Memory = import("./join-copy").ControlMemory;
  let page = rel({ state: "can_request", following: false });
  let header: Memory = { seen: relationKey(page), kept: null };
  let card: Memory = { seen: relationKey(page), kept: null };
  const shows = (m: Memory) => shownRelation(page, m).rel.following;
  // A tap the server answered, kept the way OrgJoinControl keeps it.
  const tap = (m: Memory, kind: "follow" | "unfollow"): Memory => {
    const next = changeAfter(shownRelation(page, m).rel, kind);
    assert.ok(next);
    const kept: Memory = { seen: m.seen, kept: { ...next, basis: relationKey(page), audience: page.audience, gone: false } };
    assert.equal(shows(kept), kind === "follow", "the tapped control shows the answer at once");
    return kept;
  };
  const refresh = () => {
    page = { ...page, following: !page.following };
    header = memoryFor(header, page);
    card = memoryFor(card, page);
  };

  // Header Follow, then the header's Following ✓ (unfollow).
  header = tap(header, "follow");
  refresh();
  assert.deepEqual([shows(header), shows(card)], [true, true]);
  header = tap(header, "unfollow");
  refresh();
  assert.deepEqual([shows(header), shows(card)], [false, false]);
  // The Board card's Follow refreshes the page to the very relation the
  // header's Unfollow was tapped on: that answer must stay forgotten.
  card = tap(card, "follow");
  refresh();
  assert.deepEqual([shows(header), shows(card)], [true, true], "the header says Following ✓ after the card's Follow");
  // And the reverse: the header's Unfollow puts the card back on Follow.
  header = tap(header, "unfollow");
  refresh();
  assert.deepEqual([shows(header), shows(card)], [false, false]);
  assert.equal(
    boardCardView({ state: page.state, following: shows(header), boardId: "b1", boardReadable: null, followWouldRead: true, verifyToRead: false, orgName: "SAE" })?.kind,
    "follow",
  );

  // Nothing changed: the same memory, so a kept answer survives a re-render.
  assert.equal(memoryFor(header, { ...page }), header);
  // A member always follows, whatever was kept.
  const member = rel({ state: "member", following: false, role: "member" });
  assert.equal(shownRelation(member, { seen: relationKey(member), kept: null }).rel.following, true);
});

test("both club-page Follow controls read the kept answer through memoryFor and refresh the page", () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const control = read("../../components/orgs/OrgJoinControl.tsx");
  assert.match(control, /memoryFor\(memory, relation\)/);
  assert.match(control, /shownRelation\(relation, current\)/);
  assert.ok(!/\.basis === basis/.test(control), "OrgJoinControl.tsx: the live-answer check is shownRelation's");
  // The header (join-button.tsx) and the Board card (ChannelsSection.tsx):
  // a tap on either refreshes the page, so the other catches up.
  assert.match(read("../../app/orgs/[handle]/join-button.tsx"), /onChange=\{\(\) => router\.refresh\(\)\}/);
  const board = read("../../app/orgs/[handle]/ChannelsSection.tsx").split("export function BoardSection")[1] ?? "";
  assert.match(board, /axis="follow"[\s\S]*?onChange=\{\(\) => router\.refresh\(\)\}/);
});

// ── Joining made clear: the club page's slot and Membership box (Oct 22, 2026) ─

test("display states: the runtime list is exactly the walk's, and the guard reads it", () => {
  assert.deepEqual([...ORG_DISPLAY_STATES].sort(), [...STATES].sort());
  for (const state of STATES) assert.equal(isOrgDisplayState(state), true, state);
  for (const junk of ["owner", "not_found", "", null, 7]) assert.equal(isOrgDisplayState(junk), false, String(junk));
});

test("Membership box: no box for members and hidden clubs; elsewhere one line and at most one way in", () => {
  for (const r of combos()) {
    const view = membershipBoxView(r);
    const where = label(r);
    if (r.state === "member" || r.state === "hidden") {
      assert.equal(view, null, where);
      continue;
    }
    assert.ok(view && view.line.trim().length > 0, where);
    assert.ok(view.actions.length <= 2, where);
    assert.ok(view.actions.filter((a) => a.tone === "filled").length <= 1, where);
    // Following never lives in the box: that is the whole point.
    assert.ok(!view.actions.some(isFollowKind), where);
    const kinds = view.actions.map((a) => a.kind);
    assert.equal(kinds.includes("join"), r.state === "can_join", where);
    assert.equal(kinds.includes("request"), r.state === "can_request", where);
    assert.equal(kinds.includes("cancel"), r.state === "requested", where);
    assert.equal(kinds.includes("accept") && kinds.includes("decline"), r.state === "invited", where);
  }
});

test("Membership box: the plain lines, state by state", () => {
  const line = (over: Partial<Relation>) => membershipBoxView(rel(over))?.line;
  assert.equal(line({ state: "can_join", audience: "both" }), "Anyone at IU or Purdue can join.");
  assert.equal(line({ state: "can_join", audience: "iu" }), "Anyone at IU can join.");
  assert.equal(line({ state: "can_join", audience: "purdue" }), "Anyone at Purdue can join.");
  assert.equal(line({ state: "can_request", reason: "policy" }), "Officers approve new members. Asking also follows the club.");
  assert.match(line({ state: "can_request", reason: "visiting" }) ?? "", /^You're visiting from another campus, so officers approve\./);
  assert.equal(line({ state: "requested" }), "Request sent. An officer will look at it.");
  assert.equal(line({ state: "invite_only" }), "Invite only. Officers invite members.");
  assert.equal(line({ state: "audience_blocked", audience: "iu" }), "Only IU students can join.");
  assert.equal(line({ state: "audience_blocked", audience: "purdue" }), "Only Purdue students can join.");
  assert.equal(line({ state: "unverified" }), "Verify your school email to join.");
  assert.equal(line({ state: "signed_out" }), "Sign in to follow or join.");
  const signIn = membershipBoxView(rel({ state: "signed_out", handle: "sae" }))?.actions[0];
  assert.equal(signIn?.href, "/auth/login?next=%2Forgs%2Fsae");
  assert.equal(membershipBoxView(rel({ state: "unverified" }))?.actions[0]?.href, "/auth/school-email");
  assert.deepEqual(labels(membershipBoxView(rel({ state: "requested" }))?.actions ?? []), ["cancel:Cancel request:outline"]);
});

test("Membership box: 'Not this time' prints the campus's day, or 'later' without one", () => {
  // 03:00 UTC on Nov 5 is still Nov 4 in Indianapolis: the day is pinned to
  // campus time, so the server's HTML and the client's render agree.
  const late = rel({ state: "declined", askAgainAt: "2026-11-05T03:00:00.000Z" });
  assert.equal(CAMPUS_TIME_ZONE, "America/Indiana/Indianapolis");
  // The day after the window ends, so the promise holds all day.
  assert.equal(membershipBoxView(late)?.line, "Not this time. You can ask again on Nov 5.");
  assert.equal(membershipBoxView(late, null, "UTC")?.line, "Not this time. You can ask again on Nov 6.");
  assert.deepEqual(membershipBoxView(late)?.actions, [], "nothing to tap for two weeks");
  for (const askAgainAt of [undefined, null, "nonsense"]) {
    assert.equal(membershipBoxView(rel({ state: "declined", askAgainAt }))?.line, "Not this time. You can ask again later.");
  }
  const header = orgHeaderView(late);
  assert.deepEqual(labels(header.membership), ["status:Not this time:quiet"]);
  assert.equal(header.membership[0]!.sub, "You can ask again on Nov 5.");
  assert.equal(header.membership[0]!.disabled, true);
  assert.deepEqual(channelsGateCopy(late), { line: ORG_COPY.channels.approve, inline: null });
  assert.notEqual(relationKey(late), relationKey({ ...late, askAgainAt: null }), "a new day is a new relation");
});

test("Membership box: the invite folds in, named or not, with its expiry and no second set of buttons elsewhere", () => {
  const invited = rel({ state: "invited", joinPolicy: "invite" });
  const named = membershipBoxView(invited, { inviterFirstName: "Sam", expiresAt: "2026-10-30T15:00:00.000Z" });
  assert.equal(named?.line, "Sam invited you to join.");
  assert.equal(named?.sub, "Expires Oct 30");
  assert.deepEqual(labels(named?.actions ?? []), ["accept:Accept:filled", "decline:Decline:outline"]);
  const anon = membershipBoxView(invited, { inviterFirstName: "  ", expiresAt: "bad" });
  assert.equal(anon?.line, "An officer invited you to join.");
  assert.equal(anon?.sub, null);
  assert.equal(membershipBoxView(invited)?.line, "An officer invited you to join.");
  // The row above only follows: no Accept there.
  assert.ok(!orgFollowSlot(invited).action || isFollowKind(orgFollowSlot(invited).action!));
});

test("follow slot: following only; one 'Member ✓' for members; one coral button across the slot and the box", () => {
  for (const r of combos()) {
    const slot = orgFollowSlot(r);
    const where = label(r);
    const a = slot.action;
    assert.ok(a, where);
    assert.ok(!["join", "request", "accept", "decline", "cancel"].includes(a.kind), `${where}: no door in the row`);
    if (r.state === "member") {
      assert.deepEqual([a.kind, a.label, a.disabled, slot.sub], ["status", "Member ✓", true, null], where);
      continue;
    }
    if (r.state === "hidden") {
      assert.equal(a.label, "Hidden", where);
      continue;
    }
    if (r.state === "signed_out") {
      assert.deepEqual([a.kind, a.label, a.href], ["sign_in", "Follow", "/auth/login?next=%2Forgs%2Fsae"], where);
    } else {
      assert.ok(isFollowKind(a), where);
      assert.equal(a.kind === "unfollow", r.following, where);
      assert.equal(slot.sub, expectsDisclosure(r, [a]) ? FOLLOW_DISCLOSURE : null, where);
    }
    const box = membershipBoxView(r)?.actions ?? [];
    const filled = [a, ...box].filter((x) => x.tone === "filled").length;
    assert.ok(filled <= 1, `${where}: ${filled} filled`);
    // Follow leads only when the box has no way in to offer.
    if (!r.following) assert.equal(a.tone === "filled", !box.some((x) => x.tone === "filled"), where);
  }
});

test("joinOutcome: 'recently_declined' flips to declined and carries the route's sentence for a toast", () => {
  const base = { state: "can_request" as const, following: true, role: null, audience: "both" as const };
  const said = joinOutcome(base, "request", { ok: false, code: "recently_declined", error: "Not this time. You can ask again on Nov 4." });
  assert.deepEqual(said, {
    kind: "change",
    next: { state: "declined", following: true, role: null },
    audience: "both",
    welcome: false,
    notice: "Not this time. You can ask again on Nov 4.",
  });
  const bare = joinOutcome(base, "request", { ok: false, code: "recently_declined", error: null });
  assert.equal(bare.kind === "change" && bare.notice, "Not this time. You can ask again later.");
  // Every other answer carries no notice (the static onboarding mirror deep-compares them).
  const joined = joinOutcome(base, "join", { ok: true, data: { joined: true } });
  assert.ok(joined.kind === "change" && !("notice" in joined));
});

test("cancel: the replay's guess, then the server's standing, and the toast says what changed", () => {
  const asked = rel({ state: "requested", following: true, joinPolicy: "request", orgName: "Chess" });
  assert.deepEqual(changeAfter(asked, "cancel"), { state: "can_request", following: true, role: null });
  assert.equal(changeAfter({ ...asked, joinPolicy: "invite" }, "cancel")?.state, "invite_only");
  // The follow asking made went with it.
  const dropped = cancelOutcome(asked, { ok: true, data: { cancelled: true, join_state: "can_request", org_follow_state: "not_following" } });
  assert.deepEqual(dropped, {
    kind: "change",
    next: { state: "can_request", following: false, role: null },
    message: "Request cancelled. You don't follow Chess anymore.",
  });
  // A follow they tapped stays, and so does the plain toast.
  const kept = cancelOutcome(asked, { ok: true, data: { cancelled: true, join_state: "can_request", org_follow_state: "following" } });
  assert.equal(kept.kind === "change" && kept.message, "Request cancelled.");
  // Let in meanwhile: a member, welcomed, never walked out.
  const inNow = cancelOutcome(asked, { ok: true, data: { cancelled: false, join_state: "member", org_follow_state: "following" } });
  assert.deepEqual(inNow, { kind: "change", next: { state: "member", following: true, role: "member" }, message: "You're in. Welcome to Chess." });
  // An officer answered first: show where they stand, no toast.
  const answered = cancelOutcome(asked, { ok: true, data: { cancelled: false, join_state: "declined" } });
  assert.deepEqual(answered, { kind: "change", next: { state: "declined", following: true, role: null }, message: null });
  // An answer without a readable state keeps the guess; a failure is refused.
  const vague = cancelOutcome(asked, { ok: true, data: { cancelled: true, join_state: "signed_out" } });
  assert.equal(vague.kind === "change" && vague.next.state, "can_request");
  assert.deepEqual(cancelOutcome(asked, { ok: false, code: "cancel_failed" }), { kind: "refused" });
});

test("the club page: the row is the slot, the box uses the shared taps, and Cancel never leaves", () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const row = read("../../app/orgs/[handle]/join-button.tsx");
  assert.match(row, /variant="slot"/);
  assert.ok(!/pendingInviteId/.test(row), "the row has no invite buttons to need it");
  const box = read("../../app/orgs/[handle]/club-page/MembershipBox.tsx");
  assert.match(box, /useOrgControl\(/);
  assert.match(box, /membershipBoxView\(/);
  assert.match(box, /onChange: \(\) => router\.refresh\(\)/);
  const control = read("../../components/orgs/OrgJoinControl.tsx");
  assert.match(control, /json: \{ cancel_request: true \}/, "the flag that keeps a cancel from ever being a leave");
  assert.match(control, /cancelOutcome\(rel, r\)/);
  assert.match(read("../../app/api/orgs/[slug]/join/route.ts"), /if \(cancelling\) return cancelRequest\(/);
});
