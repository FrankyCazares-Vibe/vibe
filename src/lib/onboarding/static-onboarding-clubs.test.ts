/**
 * Keeps the desktop onboarding's club step (`public/html/onboarding.html`,
 * step 5) in step with the phone's (`StepClubs.tsx`, which renders from
 * `join-copy.ts` and `social-steps.ts`).
 *
 * The page has no build step, so it carries a hand copy of those rules
 * between the lines `ONB-PURE-MIRROR:START` and `ONB-PURE-MIRROR:END`:
 * constants and pure functions only. This file cuts that block out, runs it
 * in this realm (`new Function`, so `deepStrictEqual` compares plain objects)
 * and checks every club rule against the TS it copies:
 *   1. the block touches no page, storage or network;
 *   2. every club word in the page's ORG_COPY is the app's word; the sections
 *      the club step reads are whole copies; ONB_COPY.clubs is the same;
 *   3. `orgRowViewOnboarding` answers exactly what `orgRowView(rel,
 *      "onboarding")` answers, for every standing, policy, reason, audience
 *      and follow state; `changeAfter`, `orgErrorCopy`, `inviteSubText`,
 *      `joinPressFailure` and `joinOutcome` likewise;
 *   4. the social-steps half (parse, order, relation, "any followed") agrees
 *      on one fixture set;
 *   5. the page's own tap handler (`pressClub`, cut out of the page and run
 *      against stand-ins) asks to join a by-request club in ONE call, with no
 *      follow first, and the row then reads Following (club model, Franky,
 *      Oct 16: one request flow everywhere; asking follows the club).
 *
 * WHEN THIS FAILS after a change to join-copy.ts or social-steps.ts: make the
 * same change in the mirror block of public/html/onboarding.html (plain JS,
 * same names; `orgRowView(rel, "onboarding")` is `orgRowViewOnboarding(rel)`).
 *
 * Run with:
 *   node --test src/lib/onboarding/static-onboarding-clubs.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

import type { OrgRelation } from "@/lib/orgs/join-copy";

import type { ClubLocal, ClubRowInput } from "./social-steps";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("static-onboarding-clubs.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const ts = await import("@/lib/orgs/join-copy");
const steps = await import("./social-steps");
const { ONB_COPY } = await import("@/components/mobile/onboarding/onb-copy");

const PAGE = readFileSync(new URL("../public/html/onboarding.html", SRC_ROOT), "utf8");
const START = "/* ONB-PURE-MIRROR:START */";
const END = "/* ONB-PURE-MIRROR:END */";
const BLOCK = PAGE.slice(PAGE.indexOf(START) + START.length, PAGE.indexOf(END));

const MIRROR_NAMES = [
  "ORG_COPY",
  "ONB_COPY",
  "FOLLOW_DISCLOSURE",
  "REQUEST_DISCLOSURE",
  "orgRowViewOnboarding",
  "changeAfter",
  "orgErrorCopy",
  "inviteSubText",
  "joinPressFailure",
  "joinOutcome",
  "fillCopy",
  "parseClubRows",
  "isFollowingOrg",
  "clubBand",
  "orderClubRows",
  "relationFor",
  "anyClubFollowed",
] as const;
type Mirror = Record<(typeof MIRROR_NAMES)[number], unknown>;
// A name the block doesn't define throws a ReferenceError here, naming it.
const page = new Function(`${BLOCK}\nreturn { ${MIRROR_NAMES.join(", ")} };`)() as Mirror;
const call = (name: keyof Mirror, ...args: unknown[]) => (page[name] as (...a: unknown[]) => unknown)(...args);

test("the mirror block is in the page once, and touches no page, storage or network", () => {
  assert.equal(PAGE.split(START).length, 2, "one ONB-PURE-MIRROR:START line");
  assert.equal(PAGE.split(END).length, 2, "one ONB-PURE-MIRROR:END line");
  assert.ok(PAGE.indexOf(START) < PAGE.indexOf(END));
  assert.doesNotMatch(BLOCK, /\b(document|window|localStorage|sessionStorage|location|navigator)\b|fetch\(/);
});

// ── 2. The words ────────────────────────────────────────────────────────────

type Tree = { [key: string]: Tree | string };

/** Every string in the page's copy, by its path, is the app's string at that path. */
function assertSubset(pageTree: Tree, appTree: Tree, path: string): void {
  for (const [key, value] of Object.entries(pageTree)) {
    const at = `${path}.${key}`;
    const app = appTree[key];
    if (typeof value === "string") {
      assert.equal(value, app, `${at} differs from join-copy.ts`);
    } else {
      assert.ok(app && typeof app === "object", `${at} isn't in join-copy.ts`);
      assertSubset(value, app as Tree, at);
    }
  }
}

test("every club word in the page's ORG_COPY is the app's word", () => {
  assertSubset(page.ORG_COPY as Tree, ts.ORG_COPY as unknown as Tree, "ORG_COPY");
});

test("the sections the club step reads are whole copies of the app's", () => {
  const pageCopy = page.ORG_COPY as typeof ts.ORG_COPY;
  for (const key of ["buttons", "subs", "chips", "meta", "inviteSub", "errors", "control"] as const) {
    assert.deepEqual(pageCopy[key], ts.ORG_COPY[key], `ORG_COPY.${key}`);
  }
  assert.equal(page.FOLLOW_DISCLOSURE, ts.FOLLOW_DISCLOSURE);
  assert.equal(page.REQUEST_DISCLOSURE, ts.REQUEST_DISCLOSURE);
  assert.deepEqual((page.ONB_COPY as typeof ONB_COPY).clubs, ONB_COPY.clubs);
});

// First run, Oct 24 2026 (handoffs/2026-10-23-onboarding-review/PLAN.md): the
// words changed on both devices together, so the whole table is compared now,
// not only the club step's part of it.
test("the page's ONB_COPY is the phone's, every string", () => {
  assert.deepEqual(page.ONB_COPY, ONB_COPY);
});

test("onboarding talks about clubs, not the feed, and never 'who's around'", () => {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") strings.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(ONB_COPY);
  for (const s of strings) {
    assert.doesNotMatch(s, /your feed|posts land|who's around/i, s);
  }
  assert.match(ONB_COPY.hello.note, /your clubs and people/);
  assert.match(ONB_COPY.hello.intro, /clubs/);
  // Indianapolis is shared: its people line still says so.
  assert.match(ONB_COPY.people.ottoShared, /IU and Purdue both/);
});

// ── 3. The row view and the tap rules ───────────────────────────────────────

const STATES: OrgRelation["state"][] = [
  "member",
  "invited",
  "requested",
  "can_join",
  "can_request",
  "invite_only",
  "audience_blocked",
  "unverified",
  "hidden",
  // An officer said no in the last two weeks (Oct 22, 2026): the row keeps
  // the follow toggle and offers no Request, in the page as in the app.
  "declined",
  "signed_out",
];
const POLICIES: OrgRelation["joinPolicy"][] = ["open", "request", "invite", null];
const REASONS: OrgRelation["reason"][] = ["policy", "visiting", null];
const AUDIENCES: OrgRelation["audience"][] = ["both", "iu", "purdue"];

/** Every relation the grid walks: 11 standings × follow × policy × reason × audience. */
function* relations(): Generator<OrgRelation> {
  for (const state of STATES)
    for (const following of [false, true])
      for (const joinPolicy of POLICIES)
        for (const reason of REASONS)
          for (const audience of AUDIENCES)
            yield {
              handle: "sae",
              orgName: "Sigma Alpha Epsilon",
              state,
              following,
              role: state === "member" ? "member" : null,
              reason,
              audience,
              joinPolicy,
            };
}

test("orgRowViewOnboarding answers what orgRowView(rel, 'onboarding') answers, everywhere", () => {
  let n = 0;
  for (const rel of relations()) {
    assert.deepEqual(call("orgRowViewOnboarding", rel), ts.orgRowView(rel, "onboarding"), JSON.stringify(rel));
    n++;
  }
  assert.equal(n, 11 * 2 * 4 * 3 * 3);
});

test("a by-request club offers Follow and Request on one line, and asking follows", () => {
  const rel: OrgRelation = {
    handle: "chess",
    orgName: "Chess Club",
    state: "can_request",
    following: false,
    role: null,
    reason: "policy",
    audience: "both",
    joinPolicy: "request",
  };
  const view = call("orgRowViewOnboarding", rel) as ReturnType<typeof ts.orgRowView>;
  assert.equal(view.layout, "line");
  assert.deepEqual(
    view.actions.map((a) => [a.kind, a.label, a.tone]),
    [
      ["follow", "Follow", "filled"],
      ["request", "Request", "outline"],
    ],
  );
  assert.equal(view.disclosure, ts.REQUEST_DISCLOSURE);
  // Following already: Request is the one filled control.
  const following = call("orgRowViewOnboarding", { ...rel, following: true }) as typeof view;
  assert.deepEqual(
    following.actions.map((a) => [a.kind, a.tone]),
    [
      ["unfollow", "quiet"],
      ["request", "filled"],
    ],
  );
  // Asking (replay's unsent tap too) leaves the row Following, Requested.
  const next = call("changeAfter", rel, "request") as { state: string; following: boolean };
  assert.deepEqual(next, { state: "requested", following: true, role: null });
  const after = call("orgRowViewOnboarding", { ...rel, ...next }) as typeof view;
  assert.deepEqual(after.actions.map((a) => a.label), ["Following ✓"]);
  assert.ok(after.meta.includes("Requested"));
});

test("changeAfter matches for every tap on every standing", () => {
  const kinds = ["follow", "unfollow", "join", "request", "accept", "decline", "status", "sign_in"] as const;
  for (const rel of relations()) {
    if (rel.audience !== "both" || rel.reason !== null) continue;
    for (const kind of kinds) {
      assert.deepEqual(call("changeAfter", rel, kind), ts.changeAfter(rel, kind), `${kind} on ${JSON.stringify(rel)}`);
    }
  }
});

test("orgErrorCopy, inviteSubText and joinPressFailure match", () => {
  const codes = [
    429, "429", "not_found", "member_follows", "org_hidden", "invite_not_found", "invite_not_pending",
    "join_unavailable", "approve_unavailable", "removed_needs_admin", "owner_cannot_leave", "invite_only",
    "audience_mismatch", "school_unverified", "rate_limited", "terms_required", "nope", null, undefined,
  ];
  for (const code of codes) assert.equal(call("orgErrorCopy", code), ts.orgErrorCopy(code), String(code));
  for (const [name, iso] of [
    ["Sam", "2026-10-01T12:00:00Z"],
    [null, "2026-10-01T12:00:00Z"],
    ["  ", "2026-10-01T12:00:00Z"],
    ["Sam", "not a date"],
    [null, null],
  ] as const) {
    assert.equal(call("inviteSubText", name, iso, "UTC"), ts.inviteSubText(name, iso, "UTC"));
  }
  for (const kind of ["join", "request", "accept"] as const) {
    assert.equal(call("joinPressFailure", kind), ts.joinPressFailure(kind));
  }
});

test("joinOutcome reads every Join, Request and Accept answer the same way", () => {
  const answers: Parameters<typeof ts.joinOutcome>[2][] = [
    { ok: true, data: { joined: true, role: "member" } },
    { ok: true, data: { joined: true, role: "owner" } },
    { ok: true, data: { joined: true, role: "boss" } },
    { ok: true, data: { joined: true } },
    { ok: true, data: { pending: true, org_follow_state: "following" } },
    { ok: true, data: { pending: true, org_follow_state: "not_following" } },
    { ok: true, data: { pending: true } },
    { ok: true, data: {} },
    { ok: false, code: "invite_only" },
    { ok: false, code: "school_unverified" },
    { ok: false, code: "audience_mismatch", error: "Chess Club is open to Purdue students only." },
    { ok: false, code: "audience_mismatch", error: "Chess Club is open to IU students only" },
    { ok: false, code: "audience_mismatch", error: null },
    { ok: false, code: "join_unavailable", error: "You can't join this club right now." },
    { ok: false, code: "recently_declined", error: "Not this time. You can ask again on Nov 6." },
    { ok: false, code: "recently_declined", error: null },
    { ok: false, code: null },
  ];
  for (const following of [false, true]) {
    const rel = { state: "can_request" as const, following, role: null, audience: "both" as const };
    for (const kind of ["join", "request", "accept"] as const) {
      for (const r of answers) {
        assert.deepEqual(call("joinOutcome", rel, kind, r), ts.joinOutcome(rel, kind, r), `${kind} ${JSON.stringify(r)}`);
      }
    }
  }
});

// ── 4. The social-steps half ────────────────────────────────────────────────

const RAW_CLUBS: unknown = [
  { id: "o1", handle: "sae", name: "SAE", logo_url: null, verified: true, join_policy: "invite", audience: "both", join_state: "invite_only", join_reason: null, role: null, pending_invite: null, org_follow_state: "not_following" },
  { id: "o2", handle: "chess", name: "Chess Club", logo_url: "https://x.test/c.png", join_policy: "request", audience: "both", join_state: "can_request", join_reason: "policy", role: null, pending_invite: null },
  { id: "o3", handle: "run", name: "Run Club", logo_url: null, join_policy: "open", audience: "both", join_state: "can_join", join_reason: null, role: null, pending_invite: null },
  { id: "o4", handle: "film", name: "Film", logo_url: null, join_policy: "request", audience: "iu", join_state: "requested", join_reason: "policy", role: null, pending_invite: null, org_follow_state: "following" },
  { id: "o5", handle: "band", name: "Band", logo_url: null, join_policy: "invite", audience: "both", join_state: "invited", join_reason: null, role: null, pending_invite: { id: "i1", expires_at: "2026-10-20T00:00:00Z", invited_by_name: "Sam Lee" } },
  { id: "o6", handle: "crew", name: "Crew", logo_url: null, join_policy: "open", audience: "purdue", join_state: "member", join_reason: null, role: "admin", pending_invite: null },
  { id: "o7", handle: "visit", name: "Visit", logo_url: null, join_policy: "open", audience: "both", join_state: "can_request", join_reason: "visiting", role: null, pending_invite: null },
  // "mod" is no role since 20261021100000: both halves drop it.
  { id: "o8", handle: "odd", name: "Odd", join_policy: "weird", audience: "mars", join_state: "can_join", org_follow_state: "maybe", role: "mod" },
  { id: "o9", handle: "noname", join_state: "can_join" },
  { id: "o2", handle: "dupe", name: "Dupe", join_state: "can_join" },
  "not a row",
];

test("the social-steps half agrees on one fixture set", () => {
  assert.deepEqual(call("parseClubRows", "nope"), steps.parseClubRows("nope"));
  const rows = steps.parseClubRows(RAW_CLUBS);
  const pageRows = call("parseClubRows", RAW_CLUBS) as ClubRowInput[];
  assert.deepEqual(pageRows, rows);
  for (const row of rows) {
    assert.equal(call("isFollowingOrg", row), steps.isFollowingOrg(row), row.id);
    assert.equal(call("clubBand", row), steps.clubBand(row), row.id);
    for (const local of [undefined, {}, { state: "requested" as const, following: true }, { state: "member" as const, following: false }]) {
      assert.deepEqual(call("relationFor", row, local), steps.relationFor(row, local), `${row.id} ${JSON.stringify(local)}`);
    }
  }
  assert.deepEqual(
    (call("orderClubRows", rows) as ClubRowInput[]).map((r) => r.id),
    steps.orderClubRows(rows).map((r) => r.id),
  );
  const notYet = rows.filter((r) => !steps.isFollowingOrg(r));
  const locals: Record<string, ClubLocal>[] = [{}, { o2: { state: "requested", following: true } }, { o3: { following: false } }];
  for (const local of locals) {
    assert.equal(call("anyClubFollowed", notYet, local), steps.anyClubFollowed(notYet, local), JSON.stringify(local));
  }
  // A row that asked counts as followed: Continue, not "Skip for now".
  assert.equal(call("anyClubFollowed", notYet, { o2: { state: "requested", following: true } }), true);
});

// ── 5. The page's own tap handler ───────────────────────────────────────────

/** A top-level function of the page, as written (it ends at the first line that is just `}`). */
function cutFunction(name: string): string {
  const found = PAGE.match(new RegExp(`^(?:async )?function ${name}\\(.*?^\\}$`, "ms"));
  assert.ok(found, `onboarding.html has no top-level function ${name}`);
  return found[0];
}

type Answer = { ok: boolean; status?: number; code?: string | null; error?: string | null; message?: string; data?: object };
type Sent = { path: string; init: Record<string, unknown> };
type Local = Record<string, { state: string; following: boolean; role: string | null }>;

/**
 * The page's clubRelation, applyClub, setClubBusy, refuseClub and pressClub,
 * run against stand-ins: a step state, a vibeRequest that records what it is
 * sent, a toast recorder, and no-op painters. The rules are the mirror's.
 */
function clubStep(rows: ClubRowInput[], answer: Answer, replay = false) {
  const sent: Sent[] = [];
  const toasts: string[] = [];
  const clubs = { rows, local: {} as Local, audience: {} as Record<string, string>, busy: {}, disabled: {} };
  const window = {
    vibeRequest: async (path: string, init: Record<string, unknown>) => (sent.push({ path, init }), answer),
    vibeToast: (message: string) => void toasts.push(message),
  };
  const deps: Record<string, unknown> = {
    onb: { clubs },
    IS_REPLAY: replay,
    window,
    renderClubRow: () => {},
    renderClubsFooter: () => {},
  };
  for (const name of ["ORG_COPY", "relationFor", "changeAfter", "joinOutcome", "joinPressFailure", "fillCopy", "orgErrorCopy"] as const) {
    deps[name] = page[name];
  }
  const source = ["clubRelation", "applyClub", "setClubBusy", "refuseClub", "pressClub"].map(cutFunction).join("\n");
  const api = new Function(...Object.keys(deps), `${source}\nreturn { clubRelation, pressClub };`)(
    ...Object.values(deps),
  ) as { clubRelation: (row: ClubRowInput) => OrgRelation; pressClub: (row: ClubRowInput, a: unknown, i: number) => Promise<void> };
  /** Tap the row's control that does `kind`, as the page's click listener would. */
  const tap = async (row: ClubRowInput, kind: string) => {
    const view = call("orgRowViewOnboarding", api.clubRelation(row)) as ReturnType<typeof ts.orgRowView>;
    const i = view.actions.findIndex((a) => a.kind === kind);
    assert.ok(i >= 0, `${row.handle} offers no ${kind}: ${JSON.stringify(view.actions)}`);
    await api.pressClub(row, view.actions[i], i);
  };
  const viewOf = (row: ClubRowInput) => call("orgRowViewOnboarding", api.clubRelation(row)) as ReturnType<typeof ts.orgRowView>;
  return { sent, toasts, clubs, tap, viewOf };
}

const ROWS = steps.orderClubRows(steps.parseClubRows(RAW_CLUBS));
const row = (id: string) => ROWS.find((r) => r.id === id) as ClubRowInput;

test("Request on a by-request club: one join call, no follow first, then Following", async () => {
  const step = clubStep(ROWS, { ok: true, status: 200, data: { ok: true, pending: true, org_follow_state: "following" } });
  await step.tap(row("o2"), "request");
  assert.deepEqual(step.sent, [
    { path: "/api/orgs/chess/join", init: { method: "POST", json: {}, quiet: true, failure: "Couldn't send your join request." } },
  ]);
  assert.deepEqual(step.clubs.local.o2, { state: "requested", following: true, role: null });
  assert.deepEqual(step.viewOf(row("o2")).actions.map((a) => a.label), ["Following ✓"]);
  assert.equal(call("anyClubFollowed", ROWS, step.clubs.local), true);
  assert.deepEqual(step.toasts, []);
});

test("Request in replay sends nothing and still reads Following", async () => {
  const step = clubStep(ROWS, { ok: true, data: {} }, true);
  await step.tap(row("o2"), "request");
  assert.deepEqual(step.sent, []);
  assert.deepEqual(step.clubs.local.o2, { state: "requested", following: true, role: null });
});

test("a visiting student's Request, an open Join and the refusals land like the phone's", async () => {
  const join = clubStep(ROWS, { ok: true, data: { joined: true, role: "member" } });
  await join.tap(row("o3"), "join");
  assert.equal(join.sent[0]?.path, "/api/orgs/run/join");
  assert.deepEqual(join.clubs.local.o3, { state: "member", following: true, role: "member" });

  const visiting = clubStep(ROWS, { ok: true, data: { pending: true, org_follow_state: "following" } });
  assert.equal(visiting.viewOf(row("o7")).disclosure, ts.REQUEST_DISCLOSURE);
  await visiting.tap(row("o7"), "request");
  assert.deepEqual(visiting.sent.map((s) => s.path), ["/api/orgs/visit/join"]);

  const purdue = clubStep(ROWS, { ok: false, status: 403, code: "audience_mismatch", error: "Chess Club is open to Purdue students only." });
  await purdue.tap(row("o2"), "request");
  assert.deepEqual(purdue.clubs.local.o2, { state: "audience_blocked", following: false, role: null });
  assert.equal(purdue.clubs.audience.o2, "purdue");

  const slow = clubStep(ROWS, { ok: false, status: 429, code: null, message: "You're going a little fast. Try again in 8 minutes." });
  await slow.tap(row("o2"), "request");
  assert.deepEqual(slow.toasts, ["You're going a little fast. Try again in 8 minutes."]);
  assert.equal(slow.clubs.local.o2, undefined);
});
