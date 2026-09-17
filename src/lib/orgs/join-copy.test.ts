/**
 * Tests for `join-copy.ts` — the club buttons, chips and copy every surface
 * shares (wave plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`
 * §6 F5a B). Walks all 10 display states × following × join policy × surface.
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
  FOLLOWER_COUNT_FLOOR,
  FOLLOW_DISCLOSURE,
  MOD_READONLY,
  OFFICER_FOLLOW_HELP,
  ORG_COPY,
  WHO_CAN_JOIN_OPTIONS,
  audienceChip,
  changeAfter,
  channelsGateCopy,
  fillCopy,
  followerCountText,
  followsSinceText,
  inviteRowButton,
  inviteSubText,
  joinPolicyNotice,
  memberCountText,
  openToFact,
  openToOptions,
  orgErrorCopy,
  orgHeaderView,
  orgRowView,
  pendingInviteText,
  policyChip,
  relativeAgoText,
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

test("row views: line layout only for an open club on phone rows and onboarding", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const expected = r.state === "can_join" && surface !== "card" ? "line" : "slot";
      assert.equal(orgRowView(r, surface).layout, expected, `${label(r)} on ${surface}`);
    }
  }
});

test("row views: the disclosure shows iff a club not known to be open renders a follow control", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const expected =
        r.joinPolicy !== "open" &&
        view.actions.some(isFollowKind) &&
        r.state !== "member" &&
        r.state !== "hidden" &&
        r.state !== "signed_out";
      assert.equal(view.disclosure, expected ? FOLLOW_DISCLOSURE : null, `${label(r)} on ${surface}`);
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

test("row views: onboarding never offers Request, and only members get a sub", () => {
  for (const r of combos()) {
    for (const surface of SURFACES) {
      const view = orgRowView(r, surface);
      const where = `${label(r)} on ${surface}`;
      if (surface === "onboarding") assert.ok(!view.actions.some((a) => a.kind === "request"), where);
      const wantsSub = surface === "onboarding" && r.state === "member";
      assert.equal(view.sub, wantsSub ? "Members follow automatically" : null, where);
    }
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

test("request club: follow first, then each surface's next step", () => {
  const notFollowing = rel({ state: "can_request", joinPolicy: "request", reason: "policy" });
  for (const surface of SURFACES) {
    assert.deepEqual(labels(orgRowView(notFollowing, surface).actions), ["follow:Follow:filled"]);
  }
  const following = { ...notFollowing, following: true };
  const phone = orgRowView(following, "phone_row");
  assert.deepEqual(labels(phone.actions), ["request:Request:filled"]);
  assert.equal(phone.chip, "Following");
  assert.equal(phone.disclosure, null);
  const card = orgRowView(following, "card");
  assert.deepEqual(labels(card.actions), [
    "unfollow:Following ✓:quiet",
    "request:Request to join:outline",
  ]);
  assert.equal(card.chip, null);
  assert.equal(card.disclosure, FOLLOW_DISCLOSURE);
  assert.deepEqual(labels(orgRowView(following, "onboarding").actions), [
    "unfollow:Following ✓:quiet",
  ]);
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
    const expected =
      r.joinPolicy !== "open" &&
      view.follow !== null &&
      isFollowKind(view.follow) &&
      r.state !== "member" &&
      r.state !== "hidden" &&
      r.state !== "signed_out";
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
  assert.equal(policy.membership[0]!.sub, "Officers approve requests");
  const visiting = orgHeaderView(rel({ state: "can_request", reason: "visiting" }));
  assert.equal(visiting.membership[0]!.sub, "You're visiting, so officers approve requests");
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
  assert.equal(MOD_READONLY, "Only owners and admins can change this.");
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
  assert.deepEqual(changeAfter(rel({ state: "can_request", following: true }), "request"), {
    state: "requested",
    following: true,
    role: null,
  });
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
