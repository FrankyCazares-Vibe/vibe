/**
 * The daily pass of the yearly school check-in
 * (src/lib/auth/school-checkin-job.ts), against an in-memory `users` table.
 * The email sender, the file purge, the billing lookup and the waitlist
 * clean-up are stand-ins that record what they were asked.
 *
 * What it pins down: nothing is deleted with the switch off; a personal
 * email added before the delete wins; a paying account is never deleted
 * here; a failed purge keeps the account; a check-in whose email failed is
 * closed again; the caps hold.
 *
 * Run with:
 *   node --test src/lib/auth/school-checkin-job.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("school-checkin-job.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "@/lib/email/resend-transactional": dataModule(
    "export async function sendSchoolCheckinEmail(to, code, moment) { const t = globalThis.__checkinTest; t.emails.push([to, moment]); if (t.failEmail) throw new Error('send failed'); }",
  ),
  "@/lib/profile/storage-purge": dataModule(
    "export async function purgeUserUploads(id) { const t = globalThis.__checkinTest; t.purged.push(id); if (t.failPurge) throw new Error('purge failed'); return {}; }",
  ),
  "@/lib/billing/customers": dataModule(
    "export async function billingCustomerForUser(id) { return globalThis.__checkinTest.paying.includes(id) ? { customerId: 'cus_x', livemode: false } : null; }",
  ),
  "@/lib/waitlist/store": dataModule("export async function forgetWaitlistForUser() {}\nexport async function forgetAllowlistAddress() {}"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

process.env.SCHOOL_EMAIL_VERIFY_SECRET = "test-secret-of-enough-length";
const path = "./school-checkin-job.ts";
const { runSchoolCheckin } = (await import(path)) as typeof import("./school-checkin-job");

type Row = Record<string, unknown> & { id: string };
type Harness = { emails: [string, string][]; purged: string[]; paying: string[]; failEmail: boolean; failPurge: boolean };
const g = globalThis as unknown as { __checkinTest: Harness };

const NOW = new Date("2028-01-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const account = (id: string, over: Record<string, unknown> = {}): Row => ({
  id,
  email: `${id}@iu.edu`,
  school_verified: true,
  personal_email: null,
  created_at: daysAgo(30),
  school_confirmed_at: null,
  school_checkin_sent_at: null,
  school_grace_ends_at: null,
  ...over,
});

/** An in-memory `users` table that honours eq / is null / not is null; `.or` and `.limit` pass everything through (the rule filters again). */
function fakeService(rows: Row[], hooks: { beforeRecheck?: (table: Row[]) => void } = {}) {
  const deletedUsers: string[] = [];
  const from = () => {
    let op: "select" | "update" = "select";
    let patch: Record<string, unknown> = {};
    const tests: ((r: Row) => boolean)[] = [];
    let byId = false;
    const run = () => {
      if (op === "select" && byId) hooks.beforeRecheck?.(rows);
      const hit = rows.filter((r) => tests.every((t) => t(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const chain = {
      select: () => chain,
      update: (p: Record<string, unknown>) => ((op = "update"), (patch = p), chain),
      eq: (col: string, value: unknown) => ((byId = byId || col === "id"), tests.push((r) => r[col] === value), chain),
      is: (col: string, value: unknown) => (tests.push((r) => (value === null ? r[col] === null : r[col] === value)), chain),
      not: (col: string, _op: string, value: unknown) => (tests.push((r) => (value === null ? r[col] !== null : r[col] !== value)), chain),
      or: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(run()).then((r) => ({ data: r.data[0] ?? null, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return chain;
  };
  const auth = {
    admin: {
      deleteUser: async (id: string) => {
        deletedUsers.push(id);
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
        return { error: null };
      },
    },
  };
  return { service: { from, auth } as never, deletedUsers };
}

function reset(over: Partial<Harness> = {}) {
  g.__checkinTest = { emails: [], purged: [], paying: [], failEmail: false, failPurge: false, ...over };
}

test("due: a check-in is opened and its code emailed; exempt and fresh accounts are left alone", async () => {
  reset();
  const rows = [
    account("due", { created_at: daysAgo(400) }),
    account("fresh"),
    account("personal-sign-in", { email: "me@gmail.com", created_at: daysAgo(900) }),
    account("has-personal", { personal_email: "me@gmail.com", created_at: daysAgo(900) }),
  ];
  const { service, deletedUsers } = fakeService(rows);
  const out = await runSchoolCheckin(service, NOW, { deleteEnabled: true });
  assert.equal(out.checkins_sent, 1);
  assert.deepEqual(g.__checkinTest.emails, [["due@iu.edu", "checkin"]]);
  assert.equal(rows[0].school_checkin_sent_at, NOW.toISOString());
  assert.equal(rows[1].school_checkin_sent_at, null);
  assert.deepEqual(deletedUsers, []);
});

test("due, but the email fails: the check-in is closed again, so the 14 days never run on nothing", async () => {
  reset({ failEmail: true });
  const rows = [account("due", { created_at: daysAgo(400) })];
  const out = await runSchoolCheckin(fakeService(rows).service, NOW, { deleteEnabled: true });
  assert.equal(out.checkins_sent, 0);
  assert.equal(out.failed, 1);
  assert.equal(rows[0].school_checkin_sent_at, null);
});

test("overdue: the 90-day countdown starts and the notice goes out", async () => {
  reset();
  const rows = [account("late", { school_checkin_sent_at: daysAgo(15) })];
  const out = await runSchoolCheckin(fakeService(rows).service, NOW, { deleteEnabled: true });
  assert.equal(out.countdowns_started, 1);
  assert.equal(rows[0].school_grace_ends_at, daysAhead(90));
  assert.deepEqual(g.__checkinTest.emails, [["late@iu.edu", "countdown"]]);
});

test("expired with the switch OFF: counted, never deleted, nothing purged", async () => {
  reset();
  const rows = [account("gone", { school_checkin_sent_at: daysAgo(110), school_grace_ends_at: daysAgo(1) })];
  const { service, deletedUsers } = fakeService(rows);
  const out = await runSchoolCheckin(service, NOW, { deleteEnabled: false });
  assert.equal(out.would_delete, 1);
  assert.equal(out.deleted, 0);
  assert.deepEqual(deletedUsers, []);
  assert.deepEqual(g.__checkinTest.purged, []);
  assert.equal(rows.length, 1);
});

test("expired with the switch ON: files first, then the account", async () => {
  reset();
  const rows = [account("gone", { school_checkin_sent_at: daysAgo(110), school_grace_ends_at: daysAgo(1) })];
  const { service, deletedUsers } = fakeService(rows);
  const out = await runSchoolCheckin(service, NOW, { deleteEnabled: true });
  assert.equal(out.deleted, 1);
  assert.deepEqual(g.__checkinTest.purged, ["gone"]);
  assert.deepEqual(deletedUsers, ["gone"]);
});

test("a personal email added just before the delete wins", async () => {
  reset();
  const rows = [account("saved", { school_checkin_sent_at: daysAgo(110), school_grace_ends_at: daysAgo(1) })];
  const { service, deletedUsers } = fakeService(rows, {
    beforeRecheck: (table) => {
      table[0].personal_email = "me@gmail.com";
    },
  });
  const out = await runSchoolCheckin(service, NOW, { deleteEnabled: true });
  assert.equal(out.deleted, 0);
  assert.deepEqual(deletedUsers, []);
  assert.deepEqual(g.__checkinTest.purged, []);
});

test("a paying account is never deleted here; a failed purge keeps the account", async () => {
  reset({ paying: ["pays"] });
  const expired = { school_checkin_sent_at: daysAgo(110), school_grace_ends_at: daysAgo(1) };
  const paying = fakeService([account("pays", expired)]);
  const a = await runSchoolCheckin(paying.service, NOW, { deleteEnabled: true });
  assert.equal(a.skipped_billing, 1);
  assert.deepEqual(paying.deletedUsers, []);

  reset({ failPurge: true });
  const broken = fakeService([account("files", expired)]);
  const b = await runSchoolCheckin(broken.service, NOW, { deleteEnabled: true });
  assert.equal(b.deleted, 0);
  assert.equal(b.failed, 1);
  assert.deepEqual(broken.deletedUsers, []);
});

test("the caps: at most 5 deletions and 25 check-in emails a run", async () => {
  reset();
  const expired = { school_checkin_sent_at: daysAgo(110), school_grace_ends_at: daysAgo(1) };
  const many = fakeService(Array.from({ length: 9 }, (_, i) => account(`x${i}`, expired)));
  const a = await runSchoolCheckin(many.service, NOW, { deleteEnabled: true });
  assert.equal(a.deleted, 5);
  assert.equal(many.deletedUsers.length, 5);

  reset();
  const due = fakeService(Array.from({ length: 30 }, (_, i) => account(`d${i}`, { created_at: daysAgo(400) })));
  const b = await runSchoolCheckin(due.service, NOW, { deleteEnabled: true });
  assert.equal(b.checkins_sent, 25);
  assert.equal(g.__checkinTest.emails.length, 25);
});
