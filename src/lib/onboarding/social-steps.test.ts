/**
 * Tests for onboarding's social-step rules (`social-steps.ts`) and the copy
 * table they pair with (`onb-copy.ts`). Wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S
 * acceptance (a)–(i), plus critic `critic-W3.md` M7 (i2) and L2.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/onboarding/social-steps.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `finish.test.ts` — Node's type stripping
 * doesn't resolve the "@/…" alias or add file extensions, so an in-thread
 * resolve hook is registered before the modules load through `import()`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

import type { ClubRowInput, SuggestionInput } from "./social-steps";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("social-steps.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const {
  anyClubFollowed,
  clubBand,
  groupPeople,
  isFollowingOrg,
  listState,
  orderClubRows,
  parseClubRows,
  parseSuggestions,
  relationFor,
} = await import("./social-steps");
const { ONB_COPY, fillCampus } = await import("@/components/mobile/onboarding/onb-copy");
const { FOLLOW_DISCLOSURE, ORG_COPY, orgRowView } = await import("@/lib/orgs/join-copy");

// ── fixtures ─────────────────────────────────────────────────────────────

function club(overrides: Partial<ClubRowInput> & { id: string }): ClubRowInput {
  return {
    handle: overrides.id,
    name: `Club ${overrides.id}`,
    logo_url: null,
    verified: false,
    join_policy: "open",
    audience: "both",
    join_state: "can_join",
    join_reason: null,
    role: null,
    pending_invite: null,
    ...overrides,
  };
}

/** SAE as it is live: invite-only, verified, and this viewer isn't in it. */
const SAE = club({
  id: "sae",
  name: "Sigma Alpha Epsilon",
  verified: true,
  join_policy: "invite",
  join_state: "invite_only",
});

const INVITED = club({
  id: "invited",
  join_policy: "invite",
  join_state: "invited",
  pending_invite: {
    id: "11111111-1111-4111-8111-111111111111",
    expires_at: "2026-10-16T12:00:00.000Z",
    invited_by_name: "Franky",
  },
});

function person(id: string, reason_v2: string, extra: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    id,
    name: `Person ${id}`,
    handle: id,
    avatar_url: null,
    major: null,
    campus_id: null,
    school_system: null,
    reason_v2,
    ...extra,
  };
}

// ── (a)–(d) relation and band ────────────────────────────────────────────

test("(a) an SAE-shaped invite-only row: not following, band 3, Follow with the disclosure", () => {
  const rel = relationFor(SAE, undefined);
  assert.equal(rel.following, false);
  assert.equal(rel.state, "invite_only");
  assert.equal(rel.joinPolicy, "invite");
  assert.equal(rel.orgName, "Sigma Alpha Epsilon");
  assert.equal(isFollowingOrg(SAE), false);
  assert.equal(clubBand(SAE), 3);

  const view = orgRowView(rel, "onboarding");
  assert.deepEqual(
    view.actions.map((a) => a.label),
    [ORG_COPY.buttons.follow],
  );
  assert.equal(view.disclosure, FOLLOW_DISCLOSURE);
});

test("(b) the same row with org_follow_state following: following, band 4", () => {
  const row = { ...SAE, org_follow_state: "following" as const };
  assert.equal(isFollowingOrg(row), true);
  assert.equal(relationFor(row, undefined).following, true);
  assert.equal(clubBand(row), 4);
  // `not_following` is not following.
  assert.equal(isFollowingOrg({ ...SAE, org_follow_state: "not_following" }), false);
});

test("(c) a member: band 4, and following is forced true", () => {
  const member = club({ id: "m", join_state: "member", role: "owner", join_policy: "invite" });
  assert.equal(clubBand(member), 4);
  assert.equal(relationFor(member, undefined).following, true);
  assert.equal(relationFor(member, { following: false }).following, true);
  // A role alone counts as following.
  assert.equal(isFollowingOrg(club({ id: "r", role: "member" })), true);

  // A local Join answer makes any row a member that follows.
  const joined = relationFor(club({ id: "o" }), { state: "member", following: false, role: "member" });
  assert.equal(joined.state, "member");
  assert.equal(joined.following, true);
  assert.equal(joined.role, "member");
});

test("(d) an invited row: band 0, even when already following", () => {
  assert.equal(clubBand(INVITED), 0);
  assert.equal(clubBand({ ...INVITED, org_follow_state: "following" }), 0);
});

test("relationFor: local answers override the row; missing ones fall back", () => {
  const open = club({ id: "open" });
  assert.deepEqual(relationFor(open, undefined), {
    handle: "open",
    orgName: "Club open",
    state: "can_join",
    following: false,
    role: null,
    reason: null,
    audience: "both",
    joinPolicy: "open",
  });
  const followed = relationFor(open, { state: "can_join", following: true, role: null });
  assert.equal(followed.following, true);
  const visiting = relationFor(
    club({ id: "v", join_policy: "request", join_state: "can_request", join_reason: "visiting", audience: "purdue" }),
    { state: "requested" },
  );
  assert.equal(visiting.state, "requested");
  assert.equal(visiting.reason, "visiting");
  assert.equal(visiting.audience, "purdue");
});

// ── (e) ordering ─────────────────────────────────────────────────────────

test("(e) orderClubRows is stable: invited < open < request < invite < following", () => {
  const input = [
    club({ id: "following", join_policy: "open", org_follow_state: "following" }),
    club({ id: "inviteA", join_policy: "invite", join_state: "invite_only" }),
    club({ id: "requestA", join_policy: "request", join_state: "can_request" }),
    club({ id: "openA" }),
    { ...INVITED, id: "invited" },
    club({ id: "inviteB", join_policy: "invite", join_state: "invite_only" }),
    club({ id: "member", join_state: "member", role: "member" }),
    club({ id: "openB", audience: "iu", join_state: "audience_blocked" }),
    club({ id: "requestB", join_policy: "request", join_state: "requested" }),
  ];
  const before = input.map((r) => r.id);
  const ordered = orderClubRows(input);
  assert.deepEqual(
    ordered.map((r) => r.id),
    ["invited", "openA", "openB", "requestA", "requestB", "inviteA", "inviteB", "following", "member"],
  );
  // The input array isn't reordered in place.
  assert.deepEqual(
    input.map((r) => r.id),
    before,
  );
  assert.deepEqual(orderClubRows([]), []);
});

// ── (f) any club followed ────────────────────────────────────────────────

test("(f) anyClubFollowed counts local.following and members", () => {
  const open = club({ id: "open" });
  assert.equal(anyClubFollowed([open, SAE], {}), false);
  assert.equal(anyClubFollowed([], {}), false);
  assert.equal(anyClubFollowed([open, SAE], { open: { following: true } }), true);
  assert.equal(anyClubFollowed([open, SAE], { sae: { state: "member" } }), true);
  // An unfollow tap takes a followed row back out.
  const followed = { ...open, org_follow_state: "following" as const };
  assert.equal(anyClubFollowed([followed], {}), true);
  assert.equal(anyClubFollowed([followed], { open: { following: false } }), false);
  // A member row counts whatever local.following says.
  const member = club({ id: "m", join_state: "member", role: "owner" });
  assert.equal(anyClubFollowed([open, member], { m: { following: false } }), true);
});

// ── (g) people groups ────────────────────────────────────────────────────

const SIX = [
  person("clubs", "from_your_clubs"),
  person("campus", "same_campus", { campus_id: "indianapolis", school_system: "purdue" }),
  person("major", "same_major"),
  person("system", "same_system", { campus_id: "purdue-west-lafayette", school_system: "purdue" }),
  person("mutuals", "mutuals"),
  person("new", "new_on_vibe"),
];

test("(g) groupPeople maps all six reason_v2 values, in group order", () => {
  const groups = groupPeople(SIX, { system: null, campusShortName: null });
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.people.map((p) => p.id)]),
    [
      ["clubs", "From your clubs", ["clubs"]],
      ["campus", "At Indianapolis", ["campus"]],
      ["major", "Same major", ["major"]],
      ["system", "Elsewhere at Purdue", ["system"]],
      ["more", "More people on Vibe", ["mutuals", "new"]],
    ],
  );

  // The viewer's own campus and system win over the rows'.
  const mine = groupPeople(SIX, { system: "iu", campusShortName: "Bloomington" });
  assert.equal(mine.find((g) => g.key === "campus")?.label, "At Bloomington");
  assert.equal(mine.find((g) => g.key === "system")?.label, "Elsewhere at IU");
});

test("(g) server order is kept inside a group, and empty groups are dropped", () => {
  const list = [
    person("n1", "new_on_vibe"),
    person("m1", "same_major"),
    person("x", "something_new"),
    person("m2", "same_major"),
    person("none", undefined as unknown as string),
  ];
  delete list[4].reason_v2;
  const groups = groupPeople(list, { system: "purdue", campusShortName: "Indianapolis" });
  assert.deepEqual(
    groups.map((g) => [g.key, g.people.map((p) => p.id)]),
    [
      ["major", ["m1", "m2"]],
      ["more", ["n1", "x", "none"]],
    ],
  );
  assert.deepEqual(groupPeople([], { system: "iu", campusShortName: null }), []);
});

test("(g) the fallbacks: no campus anywhere, and a same_system row with no system", () => {
  const groups = groupPeople(
    [person("c", "same_campus"), person("s", "same_system"), person("m", "mutuals")],
    { system: null, campusShortName: null },
  );
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.people.map((p) => p.id)]),
    [
      ["campus", "On your campus", ["c"]],
      ["more", "More people on Vibe", ["s", "m"]],
    ],
  );
  // An unknown campus id is no campus.
  assert.equal(
    groupPeople([person("c", "same_campus", { campus_id: "nowhere" })], { system: "iu", campusShortName: "  " })[0]
      .label,
    "On your campus",
  );
});

test("(g) group labels are ONB_COPY.people's strings", () => {
  const p = ONB_COPY.people;
  const labels = new Set(
    [
      ...groupPeople(SIX, { system: null, campusShortName: null }),
      ...groupPeople([person("c", "same_campus")], { system: null, campusShortName: null }),
    ].map((g) => g.label),
  );
  assert.deepEqual(labels, new Set([
    p.groupClubs,
    fillCampus(p.groupCampus, "Indianapolis", p.groupCampusFallback),
    p.groupCampusFallback,
    p.groupMajor,
    p.groupSystem.replace("{system}", "Purdue"),
    p.groupMore,
  ]));
});

// ── (h) list states ──────────────────────────────────────────────────────

test("(h) listState: 0 empty, 1–2 sparse, 3+ full", () => {
  assert.equal(listState(0), "empty");
  assert.equal(listState(1), "sparse");
  assert.equal(listState(2), "sparse");
  assert.equal(listState(3), "full");
  assert.equal(listState(60), "full");
  assert.equal(listState(-1), "empty");
  assert.equal(listState(Number.NaN), "empty");
});

// ── (i) copy ─────────────────────────────────────────────────────────────

test("(i) fillCampus fills every {campus} and falls back on null or blank", () => {
  assert.equal(fillCampus("at {campus} and {campus}", "Indianapolis", "fb"), "at Indianapolis and Indianapolis");
  assert.equal(fillCampus("at {campus}", null, "fb"), "fb");
  assert.equal(fillCampus("at {campus}", "   ", "fb"), "fb");
  // A `$` pattern in a name is literal, not a replacement token.
  assert.equal(fillCampus("at {campus}", "$&", "fb"), "at $&");
  assert.equal(
    fillCampus(ONB_COPY.people.ottoSingle, null, ONB_COPY.people.ottoNoCampus),
    ONB_COPY.people.ottoNoCampus,
  );
});

test("(i2) the clubs empty state has a no-campus body (critic M7)", () => {
  const c = ONB_COPY.clubs;
  assert.equal(
    c.emptyBodyNoCampus,
    "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone here.”",
  );
  assert.equal(fillCampus(c.emptyBody, null, c.emptyBodyNoCampus), c.emptyBodyNoCampus);
  assert.equal(
    fillCampus(c.emptyBody, "Indianapolis", c.emptyBodyNoCampus),
    "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone at Indianapolis.”",
  );
  assert.equal(fillCampus(c.sparse, null, c.sparseNoCampus), c.sparseNoCampus);
});

test("ONB_COPY is frozen all the way down, with no placeholder left unmatched", () => {
  assert.equal(Object.isFrozen(ONB_COPY), true);
  assert.equal(Object.isFrozen(ONB_COPY.profile.labels), true);
  const placeholders = new Set<string>();
  const walk = (o: object) => {
    for (const v of Object.values(o)) {
      if (typeof v === "string") for (const m of v.matchAll(/\{(\w+)\}/g)) placeholders.add(m[1]);
      else walk(v as object);
    }
  };
  walk(ONB_COPY);
  assert.deepEqual([...placeholders].sort(), ["campus", "label", "n", "reason", "system"]);
});

// ── parsing (critic L2) ──────────────────────────────────────────────────

test("parseClubRows: types rows, drops unusable ones, defaults bad fields", () => {
  assert.deepEqual(parseClubRows(null), []);
  assert.deepEqual(parseClubRows({ orgs: [] }), []);
  const rows = parseClubRows([
    { ...SAE, member_count: 40, follower_count: null, org_follow_state: "following" },
    { ...SAE, name: "duplicate id" },
    { id: "no-name", handle: "x", name: "  ", join_state: "can_join" },
    { id: "no-handle", name: "X", join_state: "can_join" },
    { id: "bad-state", handle: "b", name: "B", join_state: "joined" },
    "not a row",
    null,
    {
      id: "odd",
      handle: "odd",
      name: "Odd",
      logo_url: "",
      verified: "yes",
      join_policy: "whatever",
      audience: 3,
      join_state: "invited",
      join_reason: "because",
      role: "president",
      pending_invite: { id: "i1" },
      org_follow_state: "maybe",
    },
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["sae", "odd"],
  );
  assert.deepEqual(rows[0], { ...SAE, verified: true, org_follow_state: "following" });
  assert.deepEqual(rows[1], {
    id: "odd",
    handle: "odd",
    name: "Odd",
    logo_url: null,
    verified: false,
    join_policy: "request",
    audience: "both",
    join_state: "invited",
    join_reason: null,
    role: null,
    pending_invite: null,
  });
  assert.equal("org_follow_state" in rows[1], false);
  // A well-formed invite survives, with a null inviter name kept null.
  const [inv] = parseClubRows([{ ...INVITED, pending_invite: { ...INVITED.pending_invite, invited_by_name: null } }]);
  assert.deepEqual(inv.pending_invite, {
    id: "11111111-1111-4111-8111-111111111111",
    expires_at: "2026-10-16T12:00:00.000Z",
    invited_by_name: null,
  });
});

test("parseSuggestions: reads the array only, drops unusable rows", () => {
  assert.deepEqual(parseSuggestions(undefined), []);
  // The route's whole body is not the list: the step passes `.suggestions`.
  assert.deepEqual(parseSuggestions({ ok: true, suggestions: [person("a", "same_major")] }), []);
  const people = parseSuggestions([
    { ...person("a", "same_major"), banner_url: "x", mutual_count: 2, school_system: "purdue" },
    { ...person("a", "mutuals"), name: "dup" },
    { id: "", name: "No id" },
    { id: "b", name: null, handle: " " },
    { id: "c", name: null, handle: "cee", school_system: "harvard", reason_v2: "" },
    42,
  ]);
  assert.deepEqual(people, [
    { ...person("a", "same_major"), school_system: "purdue" },
    { id: "c", name: null, handle: "cee", avatar_url: null, major: null, campus_id: null, school_system: null },
  ]);
});

test("social-steps.ts imports only @/lib/iu/campuses at runtime", () => {
  const src = readFileSync(new URL("./social-steps.ts", import.meta.url), "utf8");
  const runtime = [...src.matchAll(/^import (?!type )[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(runtime, ["@/lib/iu/campuses"]);
  assert.doesNotMatch(src, /\bfetch\(|from "react"/);
});
