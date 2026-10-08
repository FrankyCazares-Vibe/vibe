/**
 * Account deletion's two waitlist clean-ups (Privacy Policy sections 9 and
 * 11): `forgetWaitlistForUser` takes the entry the access code redeemed AND
 * any entry under the account's own addresses; `forgetAllowlistAddress`
 * takes the sign-in address off the no-code list. Against a fake of the
 * service client: no database here.
 *
 * Run with:
 *   node --test src/lib/waitlist/store-forget.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("store-forget.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "@/lib/email/resend-transactional": dataModule("export async function sendWaitlistInviteEmail() { throw new Error('unused'); }"),
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

const storePath = "./store.ts";
const { forgetAllowlistAddress, forgetWaitlistForUser } = (await import(storePath)) as typeof import("./store");

type Row = { id: string; email: string; email_key: string; redeemed_user_id: string | null };
type Call = { table: string; op: string; filters: [string, string, unknown][] };

/** A service client that answers `waitlist` selects from `rows` and records every call. */
function fakeService(rows: Row[]) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "", filters: [] };
    calls.push(call);
    const answer = () => {
      if (table === "waitlist" && call.op === "select") {
        const data = rows.filter((row) => call.filters.every(([kind, col, value]) => kind !== "eq" || (row as Record<string, unknown>)[col] === value));
        return { data: data.map(({ id, email }) => ({ id, email })), error: null };
      }
      return { data: null, error: null };
    };
    const chain = {
      select: () => ((call.op = "select"), chain),
      delete: () => ((call.op = "delete"), chain),
      update: () => ((call.op = "update"), chain),
      eq: (col: string, value: unknown) => (call.filters.push(["eq", col, value]), chain),
      in: (col: string, value: unknown) => (call.filters.push(["in", col, value]), chain),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
    };
    return chain;
  };
  return { service: { from } as never, calls };
}

const deletedIds = (calls: Call[]) =>
  calls.filter((c) => c.table === "waitlist" && c.op === "delete").map((c) => c.filters.find(([, col]) => col === "id")?.[2]);

test("forgetWaitlistForUser: the redeemed entry and every entry under the account's addresses, each once", async () => {
  const rows: Row[] = [
    { id: "redeemed", email: "a@iu.edu", email_key: "a@iu.edu", redeemed_user_id: "u1" },
    { id: "by-sign-in", email: "me@gmail.com", email_key: "me@gmail.com", redeemed_user_id: null },
    { id: "someone-else", email: "b@iu.edu", email_key: "b@iu.edu", redeemed_user_id: "u2" },
  ];
  const { service, calls } = fakeService(rows);
  // The school address is the redeemed row's too: it is deleted once.
  await forgetWaitlistForUser(service, "u1", ["Me@Gmail.com", "a@iu.edu", null, undefined]);
  assert.deepEqual(deletedIds(calls).sort(), ["by-sign-in", "redeemed"]);
  // Addresses are matched with `.eq`, never inside an `in.(…)` list.
  const byKey = calls.filter((c) => c.table === "waitlist" && c.op === "select" && c.filters.some(([, col]) => col === "email_key"));
  assert.ok(byKey.length >= 2);
  assert.ok(byKey.every((c) => c.filters.every(([kind]) => kind === "eq")));
});

test("forgetWaitlistForUser: no addresses is the old behaviour (the redeemed entry only)", async () => {
  const { service, calls } = fakeService([{ id: "redeemed", email: "a@iu.edu", email_key: "a@iu.edu", redeemed_user_id: "u1" }]);
  await forgetWaitlistForUser(service, "u1");
  assert.deepEqual(deletedIds(calls), ["redeemed"]);
});

test("forgetAllowlistAddress: deletes the lowercased sign-in address; nothing for no address", async () => {
  const { service, calls } = fakeService([]);
  await forgetAllowlistAddress(service, " Me@Gmail.com ");
  assert.deepEqual(calls, [{ table: "signup_allowlist", op: "delete", filters: [["eq", "email", "me@gmail.com"]] }]);
  const none = fakeService([]);
  await forgetAllowlistAddress(none.service, null);
  assert.equal(none.calls.length, 0);
});
