/**
 * Tests for `member-rules.ts` (Club tools, the club's view wave 2): the
 * buttons match the members route's rules, so a tap the route would refuse
 * is never offered.
 *
 * Run with:
 *   node --test src/components/orgs/tools/member-rules.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./member-rules.ts";
const rules = (await import(specifier)) as typeof import("./member-rules");

const OWNER = { role: "owner" as const, selfId: "u-owner" };
const OFFICER = { role: "admin" as const, selfId: "u-officer" };

const ownerRow = { user_id: "u-owner", role: "owner" };
const officerSelf = { user_id: "u-officer", role: "admin" };
const otherOfficer = { user_id: "u-officer-2", role: "admin" };
const member = { user_id: "u-member", role: "member" };

test("the owner titles anyone, themselves included", () => {
  for (const m of [ownerRow, officerSelf, otherOfficer, member]) assert.equal(rules.mayTitle(OWNER, m), true);
});

test("an officer titles members and themselves, never the owner or another officer", () => {
  assert.equal(rules.mayTitle(OFFICER, member), true);
  assert.equal(rules.mayTitle(OFFICER, officerSelf), true);
  assert.equal(rules.mayTitle(OFFICER, otherOfficer), false);
  assert.equal(rules.mayTitle(OFFICER, ownerRow), false);
});

test("an unknown role gets nothing (the route refuses it)", () => {
  const odd = { user_id: "u-odd", role: "mod" };
  assert.deepEqual(rules.memberActions(OWNER, odd), []);
});

test("only the owner changes roles, never on the owner's row", () => {
  assert.equal(rules.mayChangeRole(OWNER, member), true);
  assert.equal(rules.mayChangeRole(OWNER, otherOfficer), true);
  assert.equal(rules.mayChangeRole(OWNER, ownerRow), false);
  assert.equal(rules.mayChangeRole(OFFICER, member), false);
});

test("remove: owner removes officers and members; an officer members only; nobody the owner or themselves", () => {
  assert.equal(rules.mayRemove(OWNER, member), true);
  assert.equal(rules.mayRemove(OWNER, otherOfficer), true);
  assert.equal(rules.mayRemove(OWNER, ownerRow), false);
  assert.equal(rules.mayRemove(OFFICER, member), true);
  assert.equal(rules.mayRemove(OFFICER, otherOfficer), false);
  assert.equal(rules.mayRemove(OFFICER, officerSelf), false);
  assert.equal(rules.mayRemove(OFFICER, ownerRow), false);
});

test("the sheet's rows, in order", () => {
  assert.deepEqual(rules.memberActions(OWNER, member), ["title", "make_officer", "remove"]);
  assert.deepEqual(rules.memberActions(OWNER, otherOfficer), ["title", "make_member", "remove"]);
  assert.deepEqual(rules.memberActions(OWNER, ownerRow), ["title"]);
  assert.deepEqual(rules.memberActions(OFFICER, member), ["title", "remove"]);
  assert.deepEqual(rules.memberActions(OFFICER, officerSelf), ["title"]);
  assert.deepEqual(rules.memberActions(OFFICER, otherOfficer), []);
});

test("role words: the stored admin is an Officer", () => {
  assert.equal(rules.roleWord("owner"), "Owner");
  assert.equal(rules.roleWord("admin"), "Officer");
  assert.equal(rules.roleWord("member"), "Member");
});

test("sortMembers keeps the route's order: owner, officers, members, then joined", () => {
  const rows = [
    { user_id: "c", role: "member", joined_at: "2026-10-02" },
    { user_id: "b", role: "admin", joined_at: "2026-10-03" },
    { user_id: "a", role: "owner", joined_at: "2026-10-04" },
    { user_id: "d", role: "member", joined_at: "2026-10-01" },
  ];
  assert.deepEqual(rules.sortMembers(rows).map((r) => r.user_id), ["a", "b", "d", "c"]);
});

test("filterMembers matches name, handle or title; ignores a leading @ and case", () => {
  const rows = [
    { name: "Maya Lin", handle: "maya", title: "President" },
    { name: "Sam Ortiz", handle: "sammy", title: null },
    { name: null, handle: "quiet", title: null },
  ];
  assert.equal(rules.filterMembers(rows, "").length, 3);
  assert.deepEqual(rules.filterMembers(rows, "@SAM").map((r) => r.handle), ["sammy"]);
  assert.deepEqual(rules.filterMembers(rows, "pres").map((r) => r.handle), ["maya"]);
  assert.deepEqual(rules.filterMembers(rows, "nobody"), []);
});

test("withMember changes one row and re-sorts", () => {
  const rows = [
    { user_id: "o", role: "owner", joined_at: "1", title: null, name: null, handle: null, avatar_url: null, school_verified: true },
    { user_id: "m", role: "member", joined_at: "2", title: null, name: null, handle: null, avatar_url: null, school_verified: true },
    { user_id: "n", role: "member", joined_at: "3", title: null, name: null, handle: null, avatar_url: null, school_verified: true },
  ];
  const next = rules.withMember(rows, "n", { role: "admin" });
  assert.deepEqual(next.map((r) => r.user_id), ["o", "n", "m"]);
  assert.equal(rows[2].role, "member", "the old list is untouched");
});

test("memberRefusal: gone drops, a moved role reloads, a budget keeps", () => {
  assert.equal(rules.memberRefusal(404, "x").then, "drop");
  assert.equal(rules.memberRefusal(409, "x").then, "reload");
  assert.equal(rules.memberRefusal(429, "x").then, "keep");
  assert.deepEqual(rules.memberRefusal(500, "Couldn't remove them. Try again."), {
    line: "Couldn't remove them. Try again.",
    then: "keep",
  });
});

test("requestRefusal maps the route's codes to plain lines", () => {
  assert.equal(rules.requestRefusal(404, "request_not_found", "x").then, "drop");
  assert.equal(rules.requestRefusal(409, "request_not_pending", "x").then, "drop");
  assert.equal(rules.requestRefusal(409, "approve_unavailable", "x").line, "You can't approve this request right now.");
  assert.equal(rules.requestRefusal(409, "audience_mismatch", "SAE is open to IU students only.").line, "SAE is open to IU students only.");
  assert.equal(rules.requestRefusal(409, "audience_mismatch", "x").then, "reload");
  assert.equal(rules.requestRefusal(429, null, "x").line, "Too many tries. Try again in a minute.");
  assert.equal(rules.requestRefusal(500, "update_failed", "Couldn't deny this request. Try again.").then, "keep");
});

test("ineligibleLine says why, in the desktop's words", () => {
  assert.equal(rules.ineligibleLine("audience_iu"), "Not eligible (Purdue student)");
  assert.equal(rules.ineligibleLine("audience_purdue"), "Not eligible (IU student)");
  assert.equal(rules.ineligibleLine(null), "Not eligible (no verified school email)");
});
