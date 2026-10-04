/**
 * Tests for the waitlist's admin helpers (`admin-view.ts`): masking, the
 * one-person key, the list row, the email budget and the admin routes'
 * input checks.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/admin-view.test.ts
 *
 * WHY THE RESOLVE HOOK: admin-view.ts imports its neighbours extensionless,
 * as Next and tsc expect. Node's type stripping adds no extensions, so an
 * in-thread resolve hook retries a failed relative specifier with ".ts" (the
 * pattern of form.test.ts).
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("admin-view.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const v = await import("./admin-view");
type DbRow = import("./admin-view").WaitlistAdminDbRow;

const NOW = new Date("2026-10-03T12:00:00Z");
const ID = "5c1e0f2a-0000-4000-8000-000000000009";
const ID2 = "5c1e0f2a-0000-4000-8000-00000000000a";

test("maskEmail: first character, five stars, a domain that names nobody", () => {
  assert.equal(v.maskEmail("franky@iu.edu"), "f*****@iu.edu");
  assert.equal(v.maskEmail("a@iu.edu"), "a*****@iu.edu");
  assert.equal(v.maskEmail(" Sam@Purdue.EDU "), "s*****@purdue.edu");
  assert.equal(v.maskEmail("x@mail.iu.edu"), "x*****@mail.iu.edu");
  assert.equal(v.maskEmail("officer@gmail.com"), "o*****@gmail.com");
  // A personal domain is as good as the address.
  assert.equal(v.maskEmail("me@franky.dev"), "m*****@f*****.dev");
  assert.equal(v.maskEmail("me@localhost"), "m*****@l*****");
  assert.equal(v.maskEmail("élise@iu.edu"), "é*****@iu.edu");
  for (const bad of ["", "noat", "@iu.edu", "x@", null as unknown as string]) {
    assert.equal(v.maskEmail(bad), "*****");
  }
});

test("waitlistEmailKey folds school +tags and subdomains, nothing else", () => {
  assert.equal(v.waitlistEmailKey("Fra.Cazar+2@MAIL.IU.EDU"), "fra.cazar@iu.edu");
  assert.equal(v.waitlistEmailKey("sam@purdue.edu"), "sam@purdue.edu");
  assert.equal(v.waitlistEmailKey(" Officer+club@Gmail.com "), "officer+club@gmail.com");
  assert.equal(v.waitlistEmailKey("+x@iu.edu"), null);
  assert.equal(v.waitlistEmailKey("nope"), null);
  assert.equal(v.waitlistEmailKey("a@b@iu.edu"), null);
});

const BASE: DbRow = {
  id: ID,
  email: "franky@iu.edu",
  name: "Franky",
  school_system: "iu",
  class_year: 3,
  major: "Informatics",
  clubs: "SAE",
  is_officer: true,
  officer_club: "SAE",
  wish: "events",
  source: "landing",
  origin: "form",
  consent_news_at: null,
  created_at: "2026-10-01T00:00:00Z",
  confirm_sent_at: "2026-10-01T00:00:05Z",
  confirmed_at: "2026-10-01T01:00:00Z",
  code_hash: null,
  code_issued_at: null,
  code_expires_at: null,
  batch: null,
  invite_count: 0,
  redeemed_at: null,
  redeemed_user_id: null,
};

test("toAdminWaitlistRow masks the address and never carries a hash", () => {
  const row = v.toAdminWaitlistRow(BASE, "ignored", NOW);
  assert.equal(row.maskedEmail, "f*****@iu.edu");
  assert.equal(row.status, "waiting");
  assert.equal(row.joinedHandle, null);
  assert.equal(row.newsOptIn, false);
  assert.equal(row.origin, "form");
  const text = JSON.stringify(row);
  assert.ok(!text.includes("franky@"));
  assert.ok(!("code_hash" in row) && !("email" in row));

  const joined = v.toAdminWaitlistRow(
    { ...BASE, code_hash: "a".repeat(64), code_issued_at: "2026-10-02T00:00:00Z",
      code_expires_at: "2026-10-16T00:00:00Z", redeemed_at: "2026-10-02T02:00:00Z",
      consent_news_at: "2026-10-01T00:00:00Z", batch: "officers-1", invite_count: 1, origin: "founder" },
    "franky",
    NOW,
  );
  assert.equal(joined.status, "joined");
  assert.equal(joined.joinedHandle, "franky");
  assert.equal(joined.newsOptIn, true);
  assert.equal(joined.batch, "officers-1");
  assert.equal(joined.origin, "founder");
  assert.equal(v.toAdminWaitlistRow({ ...BASE, school_system: "x", class_year: null }, null, NOW).schoolSystem, null);
});

test("toAdminWaitlistRow carries the deletion date: 38 days, or 28 after the last confirm email", () => {
  // Confirmed: 38 days after joining, whatever happens next.
  assert.equal(v.toAdminWaitlistRow(BASE, null, NOW).deletesAt, "2026-11-08T00:00:00.000Z");
  // Unconfirmed form row, no code: 28 days after its last confirm email.
  const unconfirmed = { ...BASE, confirmed_at: null, confirm_sent_at: "2026-10-05T00:00:00Z" };
  assert.equal(v.toAdminWaitlistRow(unconfirmed, null, NOW).deletesAt, "2026-11-02T00:00:00.000Z");
  // ... or 28 after joining when no email went.
  assert.equal(v.toAdminWaitlistRow({ ...unconfirmed, confirm_sent_at: null }, null, NOW).deletesAt, "2026-10-29T00:00:00.000Z");
  // ... but never past the 38 days.
  assert.equal(
    v.toAdminWaitlistRow({ ...unconfirmed, confirm_sent_at: "2026-10-25T00:00:00Z" }, null, NOW).deletesAt,
    "2026-11-08T00:00:00.000Z",
  );
  // A code, or a founder's row, keeps it to the 38 days.
  assert.equal(v.toAdminWaitlistRow({ ...unconfirmed, code_hash: "a".repeat(64) }, null, NOW).deletesAt, "2026-11-08T00:00:00.000Z");
  assert.equal(v.toAdminWaitlistRow({ ...unconfirmed, origin: "founder" }, null, NOW).deletesAt, "2026-11-08T00:00:00.000Z");
  assert.equal(v.toAdminWaitlistRow({ ...BASE, created_at: "nope" }, null, NOW).deletesAt, null);
});

test("the budget: cap parsing and what is left", () => {
  assert.equal(v.DEFAULT_WAITLIST_DAILY_CAP, 40);
  assert.equal(v.parseDailyCap(undefined), 40);
  assert.equal(v.parseDailyCap(""), 40);
  assert.equal(v.parseDailyCap("abc"), 40);
  assert.equal(v.parseDailyCap("-5"), 40);
  assert.equal(v.parseDailyCap("2.5"), 40);
  assert.equal(v.parseDailyCap(" 90 "), 90);
  assert.equal(v.parseDailyCap("0"), 0);
  assert.equal(v.parseDailyCap("999999"), 10000);
  // The confirm emails have their own cap and fallback.
  assert.equal(v.DEFAULT_WAITLIST_CONFIRM_DAILY_CAP, 30);
  assert.equal(v.parseDailyCap(undefined, v.DEFAULT_WAITLIST_CONFIRM_DAILY_CAP), 30);
  assert.equal(v.parseDailyCap("12", v.DEFAULT_WAITLIST_CONFIRM_DAILY_CAP), 12);
  assert.equal(v.remainingBudget(0, 40), 40);
  assert.equal(v.remainingBudget(39, 40), 1);
  assert.equal(v.remainingBudget(45, 40), 0);
  assert.equal(v.remainingBudget(-3, 40), 40);
  assert.equal(v.remainingBudget(Number.NaN, 40), 0);
});

test("parseBatch tidies names and enforces the wave rule (a word and a number, never free text)", () => {
  assert.deepEqual(v.parseBatch(" Officers 1 ", true), { ok: true, batch: "officers-1" });
  assert.deepEqual(v.parseBatch("wave_12", true), { ok: true, batch: "wave-12" });
  assert.deepEqual(v.parseBatch("test-999", true), { ok: true, batch: "test-999" });
  for (const bad of ["sae_wave__2", "sam-smith", "wave", "wave-1000", "officers-1-sam", "friends 1 2"]) {
    const r = v.parseBatch(bad, true);
    assert.equal(r.ok, false, bad);
    assert.equal((r as { code: string }).code, "invalid_batch");
  }
  assert.deepEqual(v.parseBatch("", false), { ok: true, batch: null });
  assert.deepEqual(v.parseBatch(undefined, false), { ok: true, batch: null });
  assert.equal(v.parseBatch("", true).ok, false);
  assert.equal(v.parseBatch("a".repeat(41), true).ok, false);
  assert.equal(v.parseBatch("café", true).ok, false);
  assert.equal(v.parseBatch(7, false).ok, false);
});

test("parseInviteRequest: 1-25 ids, uuids only, repeats once, a batch", () => {
  const ok = v.parseInviteRequest({ ids: [ID, ID.toUpperCase(), ID2], batch: "Wave 1" });
  assert.deepEqual(ok, { ok: true, ids: [ID, ID2], batch: "wave-1" });
  const ids25 = Array.from({ length: 25 }, (_, i) => `5c1e0f2a-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(v.parseInviteRequest({ ids: ids25, batch: "wave-2" }).ok, true);
  const tooMany = v.parseInviteRequest({ ids: [...ids25, ID], batch: "wave-2" });
  assert.equal(tooMany.ok, false);
  assert.equal((tooMany as { code: string }).code, "too_many");
  for (const bad of [null, [], "x", { batch: "wave-1" }, { ids: [], batch: "wave-1" }, { ids: ["nope"], batch: "wave-1" }, { ids: [ID] }, { ids: [ID], batch: "Bad!" }, { ids: [ID], batch: "b" }]) {
    assert.equal(v.parseInviteRequest(bad).ok, false, JSON.stringify(bad));
  }
});

test("parseSendCodeRequest: no body, an empty body, a batch", () => {
  assert.deepEqual(v.parseSendCodeRequest(undefined), { ok: true, batch: null });
  assert.deepEqual(v.parseSendCodeRequest({}), { ok: true, batch: null });
  assert.deepEqual(v.parseSendCodeRequest({ batch: "Officers 3" }), { ok: true, batch: "officers-3" });
  assert.equal(v.parseSendCodeRequest({ batch: "Officers" }).ok, false);
  assert.equal(v.parseSendCodeRequest({ batch: "no way!" }).ok, false);
  assert.equal(v.parseSendCodeRequest([]).ok, false);
});

test("parseAddRequest: any real address, limits, officer club only for officers", () => {
  const ok = v.parseAddRequest({
    email: " Officer@Gmail.com ", name: " Sam ", isOfficer: true, officerClub: "Chess", clubs: "Chess, Film",
    issueCode: true, batch: "officers 1",
  });
  assert.deepEqual(ok, {
    ok: true,
    value: {
      email: "officer@gmail.com", emailKey: "officer@gmail.com", schoolSystem: null, name: "Sam",
      isOfficer: true, officerClub: "Chess", clubs: "Chess, Film", issueCode: true, batch: "officers-1",
    },
  });
  const school = v.parseAddRequest({ email: "Sam+x@mail.purdue.edu", name: "Sam", isOfficer: false, officerClub: "Chess" });
  assert.equal(school.ok, true);
  if (school.ok) {
    assert.equal(school.value.email, "sam+x@mail.purdue.edu");
    assert.equal(school.value.emailKey, "sam@purdue.edu");
    assert.equal(school.value.schoolSystem, "purdue");
    assert.equal(school.value.officerClub, null);
    assert.equal(school.value.issueCode, false);
    assert.equal(school.value.batch, null);
  }
  const fail = (raw: unknown) => {
    const r = v.parseAddRequest(raw);
    assert.equal(r.ok, false, JSON.stringify(raw));
    return (r as { code: string }).code;
  };
  assert.equal(fail({ email: "nope", name: "Sam" }), "invalid_email");
  assert.equal(fail({ email: "a b@gmail.com", name: "Sam" }), "invalid_email");
  assert.equal(fail({ email: "sam@localhost", name: "Sam" }), "invalid_email");
  assert.equal(fail({ email: `${"a".repeat(250)}@x.com`, name: "Sam" }), "invalid_email");
  assert.equal(fail({ email: "+x@iu.edu", name: "Sam" }), "invalid_email");
  const retired = v.parseAddRequest({ email: "sam@iupui.edu", name: "Sam" });
  assert.equal(retired.ok, false);
  assert.match((retired as { error: string }).error, /iupui\.edu/);
  assert.equal(fail({ email: "sam@iu.edu", name: "  " }), "invalid_name");
  assert.equal(fail({ email: "sam@iu.edu", name: "n".repeat(81) }), "invalid_name");
  assert.equal(fail({ email: "sam@iu.edu", name: "Sam", isOfficer: true, officerClub: "c".repeat(81) }), "invalid_officer_club");
  assert.equal(fail({ email: "sam@iu.edu", name: "Sam", clubs: "c".repeat(201) }), "invalid_clubs");
  assert.equal(fail({ email: "sam@iu.edu", name: "Sam", batch: "Bad!" }), "invalid_batch");
  assert.equal(fail(null), "invalid_body");
  // Control characters become spaces, so a name can't hide a line break.
  const tidy = v.parseAddRequest({ email: "sam@iu.edu", name: "Sam\u0000‮X" });
  assert.equal(tidy.ok && tidy.value.name, "Sam  X");
});
