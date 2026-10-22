/**
 * Tests for `follower-invite.ts`: the invite button on each row of Club tools
 * > Followers (Oct 22, 2026; handoffs/2026-10-22-club-tools-arc/PLAN.md B3).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/follower-invite.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports "./join-state" with no extension,
 * which tsc and Next resolve and Node's type stripping doesn't. The hook
 * retries a failed relative specifier with ".ts" (the payload.test.ts
 * pattern), and the module loads through a dynamic import so the hook is
 * registered first.
 *
 * THE SHEET'S DECISION, KEPT IN STEP. The last test reads
 * invite-candidates/route.ts as text and checks its `candidateView` still
 * asks the same questions in the same order, so a change there that isn't
 * made here fails a test instead of drifting quietly.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("follower-invite.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const specifier = "./follower-invite.ts";
const { followerInvite } = (await import(specifier)) as typeof import("./follower-invite");
type Facts = import("./follower-invite").FollowerFacts;
type Ctx = import("./follower-invite").FollowerInviteContext;

const DAY = 86_400_000;
const NOW = new Date("2026-10-22T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
// The invites route's numbers today (PAIR_INVITE_MAX, PAIR_INVITE_WINDOW_MS).
const CTX: Ctx = { audience: "both", role: "admin", now: NOW, pairMax: 3, pairWindowMs: 90 * DAY };
const IU: Facts = {
  verified: true,
  system: "iu",
  finished: true,
  refused: false,
  invites: [],
  requestId: null,
  removedBefore: false,
};
const REQ = "66666666-6666-4666-8666-666666666666";

test("a finished IU student the club may take, with no history: Invite", () => {
  assert.deepEqual(followerInvite(IU, CTX), {
    state: "none",
    eligible: true,
    reason: null,
    available_at: null,
    request_id: null,
    removed_before: false,
    can_approve: null,
  });
});

test("a live invite reads Invited; an expired one doesn't", () => {
  const live = { status: "pending", created_at: ago(2), expires_at: ahead(12), resolved_at: null };
  assert.equal(followerInvite({ ...IU, invites: [live] }, CTX).state, "invited");
  const stale = { ...live, expires_at: ago(1) };
  assert.equal(followerInvite({ ...IU, invites: [stale] }, CTX).state, "none");
});

test("a pending request reads Approve, with removed-before and who may approve", () => {
  const r = followerInvite({ ...IU, requestId: REQ }, CTX);
  assert.deepEqual([r.state, r.request_id, r.removed_before, r.can_approve], ["requested", REQ, false, true]);
  // Letting back a removed person takes an owner or officer (canApproveRequest).
  const removed = followerInvite({ ...IU, requestId: REQ, removedBefore: true }, CTX);
  assert.deepEqual([removed.removed_before, removed.can_approve], [true, true]);
  // A block the approve route refuses: no Approve, and nothing says why.
  const refused = followerInvite({ ...IU, requestId: REQ, refused: true }, CTX);
  assert.deepEqual([refused.state, refused.can_approve, refused.reason], ["requested", false, null]);
  // A live invite outranks the request, as in the sheet.
  const both = { status: "pending", created_at: ago(1), expires_at: ahead(13), resolved_at: null };
  assert.equal(followerInvite({ ...IU, requestId: REQ, invites: [both] }, CTX).state, "invited");
});

test("a decline waits the cooldown, and the date it ends goes out", () => {
  const declined = { status: "declined", created_at: ago(5), expires_at: ahead(9), resolved_at: ago(3) };
  const r = followerInvite({ ...IU, invites: [declined] }, CTX);
  assert.equal(r.state, "declined_recently");
  assert.equal(r.available_at, ahead(11), "14 days after it was declined");
  const old = { ...declined, resolved_at: ago(15) };
  assert.equal(followerInvite({ ...IU, invites: [old] }, CTX).state, "none");
});

test("three invites in the window read Invited enough until the oldest leaves it", () => {
  const row = (days: number) => ({ status: "revoked", created_at: ago(days), expires_at: ago(days - 14), resolved_at: ago(days) });
  const r = followerInvite({ ...IU, invites: [row(20), row(60), row(40)] }, CTX);
  assert.equal(r.state, "invite_cap_reached");
  assert.equal(r.available_at, ahead(30), "90 days after the oldest");
  assert.equal(followerInvite({ ...IU, invites: [row(20), row(40)] }, CTX).state, "none");
});

test("not eligible: the audience names the school, unverified says so", () => {
  const purdue = followerInvite({ ...IU, system: "purdue" }, { ...CTX, audience: "iu" });
  assert.deepEqual([purdue.eligible, purdue.reason], [false, "audience_iu"]);
  const iu = followerInvite(IU, { ...CTX, audience: "purdue" });
  assert.deepEqual([iu.eligible, iu.reason], [false, "audience_purdue"]);
  const unverified = followerInvite({ ...IU, verified: false, finished: false }, CTX);
  assert.deepEqual([unverified.eligible, unverified.reason], [false, "unverified"]);
  const noSystem = followerInvite({ ...IU, system: null }, CTX);
  assert.deepEqual([noSystem.eligible, noSystem.reason], [false, "unverified"]);
});

test("an unfinished account and a refusing block look the same: Not eligible, no reason", () => {
  const unfinished = followerInvite({ ...IU, finished: false }, CTX);
  const refused = followerInvite({ ...IU, refused: true }, CTX);
  assert.deepEqual(unfinished, refused, "the screen can't tell an officer about a block");
  assert.deepEqual([refused.state, refused.eligible, refused.reason], ["none", false, null]);
});

test("invite-candidates' candidateView still asks the same questions in the same order", () => {
  const src = readFileSync(new URL("../../app/api/orgs/[slug]/invite-candidates/route.ts", import.meta.url), "utf8");
  const start = src.indexOf("function candidateView(");
  assert.ok(start > 0, "candidateView is where it was");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  const order = [
    "st.roleByUser.has(c.id)",
    'f.status === "pending" && inviteIsLive(f, now)',
    "st.requestByUser.has(c.id)",
    "canApproveRequest(role, removedBefore) && !st.blocked.has(id)",
    'f.status === "declined" && f.resolved_at',
    "declinedAt + DECLINE_COOLDOWN_MS",
    "facts.length >= PAIR_INVITE_MAX",
    "oldest + PAIR_INVITE_WINDOW_MS",
  ];
  let at = 0;
  for (const needle of order) {
    const i = body.indexOf(needle, at);
    assert.ok(i >= 0, `candidateView changed near: ${needle} (move follower-invite.ts with it)`);
    at = i;
  }
});
