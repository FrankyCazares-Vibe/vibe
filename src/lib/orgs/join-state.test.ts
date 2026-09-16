/**
 * Tests for `join-state.ts` — the one org join decision (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.2 order, §3.3 matrix,
 * §4.1 test list, plus critic A7, A9, A11 and C2). Batch B22.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/join-state.test.ts
 *
 * The module under test has NO imports, so it loads through a dynamic import
 * of its ".ts" path — same pattern as `src/lib/db/missing-column.test.ts`.
 * Node's type stripping adds no extensions, and tsc (without
 * `allowImportingTsExtensions`) refuses a literal ".ts" specifier, so the
 * specifier goes through a variable and the types come from the
 * `typeof import` below.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./join-state.ts";
const {
  DECLINE_COOLDOWN_DAYS,
  INVITE_LINKS_ENABLED,
  INVITE_ONLY_ORGS_IN_DISCOVERY,
  INVITE_ROLES,
  INVITE_TTL_DAYS,
  OFFICER_ROLES,
  SETTINGS_ROLES,
  SIGNED_OUT,
  audienceAllows,
  canInvite,
  checkConstraintName,
  firstNameOf,
  inviteIsLive,
  isJoinPolicy,
  isOfficer,
  isOrgAudience,
  isOrgRole,
  isSettingsOfficer,
  isUniqueViolation,
  isVisitingOrg,
  orgJoinState,
  visibleInviterFirstName,
} = (await import(specifier)) as typeof import("./join-state");

type Input = Parameters<typeof orgJoinState>[0];

const NOW = new Date("2026-09-16T12:00:00.000Z");
const LIVE_INVITE = { id: "inv-1", expires_at: "2026-10-10T12:00:00.000Z" };
const EXPIRED_INVITE = { id: "inv-old", expires_at: "2026-09-01T12:00:00.000Z" };

/** A verified IU student at Indianapolis, not a member, nothing pending. */
function decide(over: {
  org?: Partial<Input["org"]>;
  viewer?: Partial<Input["viewer"]>;
  role?: Input["role"];
  pendingInvite?: Input["pendingInvite"];
  pendingRequest?: Input["pendingRequest"];
  now?: Date;
}) {
  return orgJoinState({
    org: {
      join_policy: "open",
      audience: "both",
      hidden_at: null,
      campus_id: "indianapolis",
      ...over.org,
    },
    viewer: {
      school_system: "iu",
      campus_id: "indianapolis",
      is_platform_admin: false,
      ...over.viewer,
    },
    role: over.role ?? null,
    pendingInvite: over.pendingInvite ?? null,
    pendingRequest: over.pendingRequest ?? null,
    now: over.now ?? NOW,
  });
}

// ── §3.2, row by row ────────────────────────────────────────────────────────

test("row 1: a member is a member, whatever the policy says", () => {
  assert.equal(decide({ role: "member", org: { join_policy: "invite" } }).state, "member");
  assert.equal(decide({ role: "owner", org: { join_policy: "request" } }).state, "member");
});

test("row 1 beats row 2: a member of a hidden org still sees it", () => {
  assert.equal(
    decide({ role: "member", org: { hidden_at: "2026-09-16T00:00:00.000Z" } }).state,
    "member",
  );
});

test("row 1 beats rows 3 and 4: an existing member is never re-checked", () => {
  // Critic A9 / spec §3.5 step 8: current members stay when the audience changes.
  assert.equal(
    decide({
      role: "member",
      org: { audience: "purdue" },
      viewer: { school_system: "iu" },
    }).state,
    "member",
  );
  assert.equal(decide({ role: "member", viewer: { school_system: null } }).state, "member");
});

test("row 2: a hidden org is not found for a non-member", () => {
  assert.equal(decide({ org: { hidden_at: "2026-09-16T00:00:00.000Z" } }).state, "not_found");
});

test("row 2: a platform admin sees a hidden org as hidden, not missing", () => {
  assert.equal(
    decide({
      org: { hidden_at: "2026-09-16T00:00:00.000Z" },
      viewer: { is_platform_admin: true },
    }).state,
    "hidden",
  );
});

test("row 2 beats everything below it: hidden hides an invite too", () => {
  assert.equal(
    decide({
      org: { hidden_at: "2026-09-16T00:00:00.000Z", join_policy: "invite" },
      pendingInvite: LIVE_INVITE,
    }).state,
    "not_found",
  );
});

test("row 3: an unverified student is asked to verify, in every policy", () => {
  for (const join_policy of ["open", "request", "invite"] as const) {
    assert.equal(
      decide({ org: { join_policy }, viewer: { school_system: null } }).state,
      "unverified",
      join_policy,
    );
  }
});

test("row 3 beats row 4: verify comes before 'IU students only'", () => {
  assert.equal(
    decide({ org: { audience: "purdue" }, viewer: { school_system: null } }).state,
    "unverified",
  );
});

test("row 3 beats row 5: an invite to an unverified student still says verify", () => {
  assert.equal(
    decide({ viewer: { school_system: null }, pendingInvite: LIVE_INVITE }).state,
    "unverified",
  );
});

test("row 4: the audience blocks the other university, and names itself", () => {
  const iuOnly = decide({ org: { audience: "iu" }, viewer: { school_system: "purdue" } });
  assert.equal(iuOnly.state, "audience_blocked");
  assert.equal(iuOnly.audience, "iu");

  const purdueOnly = decide({ org: { audience: "purdue" }, viewer: { school_system: "iu" } });
  assert.equal(purdueOnly.state, "audience_blocked");
  assert.equal(purdueOnly.audience, "purdue");
});

test("row 4 beats row 5: an invite does not survive an audience change (spec §4.1)", () => {
  const out = decide({
    org: { join_policy: "invite", audience: "iu" },
    viewer: { school_system: "purdue" },
    pendingInvite: LIVE_INVITE,
  });
  assert.equal(out.state, "audience_blocked");
  assert.equal(out.audience, "iu");
});

test("row 5: a live invite outranks invite-only, request and visiting", () => {
  assert.equal(
    decide({ org: { join_policy: "invite" }, pendingInvite: LIVE_INVITE }).state,
    "invited",
  );
  assert.equal(
    decide({ org: { join_policy: "request" }, pendingInvite: LIVE_INVITE }).state,
    "invited",
  );
  // The visiting rule never applies to an invite: the officer chose them.
  assert.equal(
    decide({
      org: { join_policy: "open", campus_id: "fort-wayne" },
      pendingInvite: LIVE_INVITE,
    }).state,
    "invited",
  );
});

test("row 6: open and at home is one tap", () => {
  assert.equal(decide({}).state, "can_join");
});

test("row 6 beats row 7: switching request → open does not strand a request", () => {
  // Spec §4.1: "open + pending request → can_join".
  assert.equal(decide({ pendingRequest: { id: "req-1" } }).state, "can_join");
});

test("row 7: a pending request reads as requested", () => {
  assert.equal(
    decide({ org: { join_policy: "request" }, pendingRequest: { id: "req-1" } }).state,
    "requested",
  );
});

test("row 7 beats row 8 (critic A11): invite-only + pending request is 'requested'", () => {
  // The officer's sheet must offer "Approve request", not an invite that
  // would admit somebody who never answered.
  assert.equal(
    decide({ org: { join_policy: "invite" }, pendingRequest: { id: "req-1" } }).state,
    "requested",
  );
});

test("row 8: invite-only with no invite offers nothing, and files nothing", () => {
  const out = decide({ org: { join_policy: "invite" } });
  assert.equal(out.state, "invite_only");
  assert.equal(out.reason, undefined);
});

test("row 9: request policy asks, with reason 'policy'", () => {
  const out = decide({ org: { join_policy: "request" } });
  assert.equal(out.state, "can_request");
  assert.equal(out.reason, "policy");
});

test("row 9: open while visiting asks, with reason 'visiting' (spec §4.1)", () => {
  const out = decide({
    org: { join_policy: "open", campus_id: "fort-wayne" },
    viewer: { campus_id: "indianapolis" },
  });
  assert.equal(out.state, "can_request");
  assert.equal(out.reason, "visiting");
});

test("row 9: a request org names the policy even when the viewer is visiting", () => {
  const out = decide({
    org: { join_policy: "request", campus_id: "fort-wayne" },
    viewer: { campus_id: "indianapolis" },
  });
  assert.equal(out.state, "can_request");
  assert.equal(out.reason, "policy");
});

// ── Expiry (lazy in the DB, re-checked by every reader) ─────────────────────

test("an expired invite is ignored, and the policy answers instead", () => {
  assert.equal(
    decide({ org: { join_policy: "invite" }, pendingInvite: EXPIRED_INVITE }).state,
    "invite_only",
  );
  assert.equal(
    decide({ org: { join_policy: "request" }, pendingInvite: EXPIRED_INVITE }).state,
    "can_request",
  );
  assert.equal(decide({ pendingInvite: EXPIRED_INVITE }).state, "can_join");
});

test("an invite expiring exactly now is expired", () => {
  assert.equal(
    decide({
      org: { join_policy: "invite" },
      pendingInvite: { id: "inv-edge", expires_at: NOW.toISOString() },
    }).state,
    "invite_only",
  );
});

test("an unparseable expires_at counts as expired, never as a live invite", () => {
  assert.equal(inviteIsLive({ expires_at: "not a date" }, NOW), false);
  assert.equal(inviteIsLive(null, NOW), false);
  assert.equal(inviteIsLive(LIVE_INVITE, NOW), true);
});

test("without `now`, the clock is read once from the real date", () => {
  const far = { id: "inv-far", expires_at: "2099-01-01T00:00:00.000Z" };
  assert.equal(
    orgJoinState({
      org: { join_policy: "invite", audience: "both", hidden_at: null, campus_id: null },
      viewer: { school_system: "iu", campus_id: null, is_platform_admin: false },
      role: null,
      pendingInvite: far,
      pendingRequest: null,
    }).state,
    "invited",
  );
});

// ── §3.3 matrix, non-member, visible org ────────────────────────────────────

test("§3.3 matrix: every cell", () => {
  const rows = [
    { join_policy: "open", invite: null, label: "open, no invite" },
    { join_policy: "request", invite: null, label: "request, no invite" },
    { join_policy: "invite", invite: null, label: "invite, no invite" },
    { join_policy: "invite", invite: LIVE_INVITE, label: "invite, pending invite" },
  ] as const;
  const expected: Record<string, [string, string, string]> = {
    // [system matches audience, system does not match, unverified]
    "open, no invite": ["can_join", "audience_blocked", "unverified"],
    "request, no invite": ["can_request", "audience_blocked", "unverified"],
    "invite, no invite": ["invite_only", "audience_blocked", "unverified"],
    "invite, pending invite": ["invited", "audience_blocked", "unverified"],
  };

  for (const row of rows) {
    const matching = decide({
      org: { join_policy: row.join_policy, audience: "iu" },
      viewer: { school_system: "iu" },
      pendingInvite: row.invite,
    });
    const mismatched = decide({
      org: { join_policy: row.join_policy, audience: "iu" },
      viewer: { school_system: "purdue" },
      pendingInvite: row.invite,
    });
    const unverified = decide({
      org: { join_policy: row.join_policy, audience: "iu" },
      viewer: { school_system: null },
      pendingInvite: row.invite,
    });
    assert.deepEqual(
      [matching.state, mismatched.state, unverified.state],
      expected[row.label],
      row.label,
    );
  }
});

// ── audienceAllows ──────────────────────────────────────────────────────────

test("audienceAllows: 'both' admits either verified university, never nobody", () => {
  assert.equal(audienceAllows("both", "iu"), true);
  assert.equal(audienceAllows("both", "purdue"), true);
  assert.equal(audienceAllows("both", null), false);
});

test("audienceAllows: a named university admits only itself", () => {
  assert.equal(audienceAllows("iu", "iu"), true);
  assert.equal(audienceAllows("iu", "purdue"), false);
  assert.equal(audienceAllows("iu", null), false);
  assert.equal(audienceAllows("purdue", "purdue"), true);
  assert.equal(audienceAllows("purdue", "iu"), false);
  assert.equal(audienceAllows("purdue", null), false);
});

// ── isVisitingOrg ───────────────────────────────────────────────────────────

test("isVisitingOrg: only two known, different campuses count as visiting", () => {
  assert.equal(isVisitingOrg("indianapolis", "fort-wayne"), true);
  assert.equal(isVisitingOrg("indianapolis", "indianapolis"), false);
  assert.equal(isVisitingOrg(null, "indianapolis"), false);
  assert.equal(isVisitingOrg("indianapolis", null), false);
  assert.equal(isVisitingOrg(null, null), false);
});

test("a campus-less org is never 'visiting', so open still means join", () => {
  assert.equal(
    decide({ org: { campus_id: null }, viewer: { campus_id: "indianapolis" } }).state,
    "can_join",
  );
  assert.equal(
    decide({ org: { campus_id: "indianapolis" }, viewer: { campus_id: null } }).state,
    "can_join",
  );
});

// ── Guards ──────────────────────────────────────────────────────────────────

test("isJoinPolicy accepts the three policies and nothing else", () => {
  assert.equal(isJoinPolicy("open"), true);
  assert.equal(isJoinPolicy("request"), true);
  assert.equal(isJoinPolicy("invite"), true);
  for (const bad of ["Open", "public", "", null, undefined, 1, {}, ["open"]]) {
    assert.equal(isJoinPolicy(bad), false, String(bad));
  }
});

test("isOrgAudience accepts the three audiences and nothing else", () => {
  assert.equal(isOrgAudience("both"), true);
  assert.equal(isOrgAudience("iu"), true);
  assert.equal(isOrgAudience("purdue"), true);
  for (const bad of ["IU", "indianapolis", "", null, undefined, 0, {}]) {
    assert.equal(isOrgAudience(bad), false, String(bad));
  }
});

test("isOrgRole accepts the four roles and nothing else", () => {
  for (const good of ["owner", "admin", "mod", "member"]) {
    assert.equal(isOrgRole(good), true, good);
  }
  for (const bad of ["Owner", "staff", "", null, undefined]) {
    assert.equal(isOrgRole(bad), false, String(bad));
  }
});

// ── Role gates (critic C2: invites are owner/admin in v1) ───────────────────

test("OFFICER_ROLES approves requests and includes mods", () => {
  assert.deepEqual([...OFFICER_ROLES], ["owner", "admin", "mod"]);
  assert.equal(isOfficer("mod"), true);
  assert.equal(isOfficer("member"), false);
  assert.equal(isOfficer(null), false);
});

test("INVITE_ROLES is owner/admin only — a mod cannot invite (critic C2)", () => {
  assert.deepEqual([...INVITE_ROLES], ["owner", "admin"]);
  assert.equal(canInvite("owner"), true);
  assert.equal(canInvite("admin"), true);
  assert.equal(canInvite("mod"), false);
  assert.equal(canInvite("member"), false);
  assert.equal(canInvite(null), false);
});

test("the two gates are separate arrays, so changing one cannot move the other", () => {
  assert.notEqual(OFFICER_ROLES, INVITE_ROLES);
  assert.notEqual(SETTINGS_ROLES, INVITE_ROLES);
  assert.equal(isSettingsOfficer("admin"), true);
  assert.equal(isSettingsOfficer("mod"), false);
});

test("the role arrays are frozen, so a route cannot push a role at runtime", () => {
  assert.equal(Object.isFrozen(OFFICER_ROLES), true);
  assert.equal(Object.isFrozen(INVITE_ROLES), true);
  assert.equal(Object.isFrozen(SETTINGS_ROLES), true);
});

// ── Pending defaults ────────────────────────────────────────────────────────

test("pending defaults: invite-only orgs are listed, invite links are off", () => {
  // Spec Q1 (recommended yes) and Q3 (recommended person-by-person first).
  // Each is one exported constant; these two lines are the whole decision.
  assert.equal(INVITE_ONLY_ORGS_IN_DISCOVERY, true);
  assert.equal(INVITE_LINKS_ENABLED, false);
});

test("invite TTL is 30 days and the decline cooldown is 14", () => {
  assert.equal(INVITE_TTL_DAYS, 30);
  assert.equal(DECLINE_COOLDOWN_DAYS, 14);
});

// ── visibleInviterFirstName (critic A7) ─────────────────────────────────────

test("an inviter shows as their first name", () => {
  assert.equal(visibleInviterFirstName({ id: "u1", name: "Franky Cazares" }), "Franky");
  assert.equal(visibleInviterFirstName({ id: "u1", name: "  Rylan  " }), "Rylan");
});

test("a blocked or muted inviter is anonymised (critic A7)", () => {
  assert.equal(
    visibleInviterFirstName({ id: "u1", name: "Franky Cazares" }, ["u1", "u2"]),
    null,
  );
  assert.equal(
    visibleInviterFirstName({ id: "u1", name: "Franky Cazares" }, new Set(["u1"])),
    null,
  );
  assert.equal(
    visibleInviterFirstName({ id: "u3", name: "Franky Cazares" }, ["u1", "u2"]),
    "Franky",
  );
});

test("a deleted inviter or a blank name is anonymised too", () => {
  assert.equal(visibleInviterFirstName(null), null);
  assert.equal(visibleInviterFirstName(undefined, ["u1"]), null);
  assert.equal(visibleInviterFirstName({ id: "u1", name: null }), null);
  assert.equal(visibleInviterFirstName({ id: "u1", name: "   " }), null);
  assert.equal(firstNameOf(""), null);
  assert.equal(firstNameOf(undefined), null);
});

test("a Set of hidden ids is read directly, so a list does not re-copy it per row", () => {
  // `loadHiddenUsers(...).hidden.ids` is already a Set; rendering a Discover
  // page must stay O(rows), not O(rows x hidden users).
  const hidden = new Set(["u1"]);
  assert.equal(visibleInviterFirstName({ id: "u2", name: "Rylan C" }, hidden), "Rylan");
  hidden.add("u2");
  assert.equal(visibleInviterFirstName({ id: "u2", name: "Rylan C" }, hidden), null);
  assert.equal(visibleInviterFirstName({ id: "u2", name: "Rylan C" }, null), "Rylan");
  assert.equal(visibleInviterFirstName({ id: "u2", name: "Rylan C" }, new Set()), "Rylan");
});

// ── Signed out is not a decision this module can make ───────────────────────

test("SIGNED_OUT is a separate value, never something orgJoinState returns", () => {
  // /orgs/[handle] renders for anonymous visitors (page.tsx:213 passes
  // signedIn). Feeding a synthetic null viewer would answer "unverified"
  // ("Verify your school email to join") where §5.1 wants "Sign in to join",
  // so copy layers branch on signedIn BEFORE calling the decision.
  assert.equal(SIGNED_OUT, "signed_out");
  const anonymousShaped = decide({
    viewer: { school_system: null, campus_id: null, is_platform_admin: false },
  });
  assert.equal(anonymousShaped.state, "unverified");
  assert.notEqual(anonymousShaped.state, SIGNED_OUT);
});

// ── Postgres error shapes (critic B2) ───────────────────────────────────────

test("a 23505 is a race, not a 500", () => {
  assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key value" }), true);
  assert.equal(isUniqueViolation({ code: "23503", message: "foreign key" }), false);
  assert.equal(isUniqueViolation({ code: 23505 }), false); // codes are strings
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
  assert.equal(isUniqueViolation("boom"), false);
});

test("checkConstraintName names the CHECK that B23 turns into a status code", () => {
  assert.equal(
    checkConstraintName({
      code: "23514",
      message:
        'new row for relation "org_invites" violates check constraint "org_invites_not_self_check"',
    }),
    "org_invites_not_self_check",
  );
  assert.equal(
    checkConstraintName({
      code: "23514",
      message:
        'new row for relation "org_invites" violates check constraint "org_invites_resolved_at_check"',
    }),
    "org_invites_resolved_at_check",
  );
  assert.equal(
    checkConstraintName({
      code: "23514",
      message:
        'new row for relation "notifications" violates check constraint "notifications_type_check"',
    }),
    "notifications_type_check",
  );
});

test("checkConstraintName returns null for anything that is not a CHECK violation", () => {
  // A deleted org raises a foreign-key violation whose message also contains
  // "constraint" and "org_id". It must not read as a CHECK the caller can explain.
  assert.equal(
    checkConstraintName({
      code: "23503",
      message:
        'insert or update on table "notifications" violates foreign key constraint "notifications_org_id_fkey"',
    }),
    null,
  );
  assert.equal(checkConstraintName({ code: "23514" }), null);
  assert.equal(checkConstraintName({ code: "23514", message: "" }), null);
  assert.equal(checkConstraintName({ code: "23514", message: null }), null);
  assert.equal(checkConstraintName(null), null);
  assert.equal(checkConstraintName(undefined), null);
});
