/**
 * `PATCH` and `DELETE /api/events/[id]` and the Event cards' stored text (S71
 * amendment F03, B3 / B4): an edit of the title or the start rewrites the
 * text of the event's chat cards; a cancel (only when notices go out, only
 * after the confirmed delete) rewrites it to "Event cancelled: <title>"; and a
 * failed card read or write changes neither the answer nor the notices.
 *
 * The route is driven end to end against fakes: the cookie and service
 * clients (one shared log tells the ORDER of the reads, the delete, the card
 * rewrite and the notices), the gates, the officer role and the two notice
 * helpers. `cards/refresh-event-cards.ts` and the validation are the real
 * files. Run with:
 *   node --test src/lib/events/event-route.test.ts
 *
 * It lives here, not next to the route: `node --test` reads its arguments as
 * globs, so a path with `[id]` in it never matches (remove-route.test.ts does
 * the same). Time is mocked (`mock.timers`, Date only), so "has it ended?" and
 * the edit's time rules do not depend on the day the tests run.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("event-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__ev.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__ev.service; }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireNotRestricted() { return null; }\n" +
      "export async function requireCanPublish() { return null; }\n" +
      "export function contentBlockedResponse(field) { return new Response(JSON.stringify({ field }), { status: 422 }); }",
  ),
  "@/lib/orgs/following": stub(
    "export async function loadOrgRole() { return { ok: true, role: globalThis.__ev.role }; }",
  ),
  "@/lib/events/notify-cancel": stub(
    "export async function collectCancelRecipients(service, eventId, actorId) { globalThis.__ev.log.push('notices:collect'); return globalThis.__ev.collect; }\n" +
      "export async function sendCancelNotices(service, args) { globalThis.__ev.log.push('notices:send'); return globalThis.__ev.send; }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "../../app/api/events/[id]/route.ts";
const { DELETE, PATCH } = (await import(specifier)) as typeof import("../../app/api/events/[id]/route");

// ── The world: one event, its club, its cards ────────────────────────────────

const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const mid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-10-01T12:00:00.000Z");

const UPCOMING = {
  id: EVENT,
  org_id: ORG,
  creator_id: ME,
  title: "Fall Formal",
  description: "Dress up",
  starts_at: "2026-10-08T23:30:00+00:00",
  ends_at: "2026-10-09T02:00:00+00:00",
  location: "The Union",
  created_at: "2026-09-20T00:00:00+00:00",
};
const ENDED = { ...UPCOMING, starts_at: "2026-09-29T23:30:00+00:00", ends_at: "2026-09-30T02:00:00+00:00" };
const ORG_ROW = { id: ORG, handle: "sae", name: "SAE", logo_url: null, verified: true, hidden_at: null };

type Err = { code?: string; message: string };
type World = {
  event: Record<string, unknown>;
  /** The row the service role's UPDATE of the event answers with (null: the write found no row). */
  updatedEvent?: Record<string, unknown> | null;
  updateError?: Err;
  deleteRows?: { id: string }[];
  deleteError?: Err;
  role?: "owner" | "admin" | "mod" | "member" | null;
  /** Live Event cards of the event, as the messages read answers them. */
  cardIds?: string[];
  notes?: Record<string, string | null>;
  cardsReadError?: Err;
  notesReadError?: Err;
  cardsWriteError?: Err;
  collect?: { ok: true; ids: string[] } | { ok: false };
  send?: { notified: number; failed: boolean };
  /** What `event_checkin_state` answers (event check-in, Oct 19 2026). Unset: the RSVP rows, as before. */
  checkinState?: unknown[];
  checkinStateError?: Err;
};

type Call = [string, ...unknown[]];
type Write = { content: string; ids: string[]; kind: unknown };

function setup(w: World) {
  const log: string[] = [];
  const writes: Write[] = [];
  const answerService = (table: string, calls: Call[]): { data: unknown; error: unknown } => {
    const first = calls[0]?.[0];
    if (table === "events" && first === "select") return { data: w.event, error: null };
    if (table === "events" && first === "update") {
      log.push("event:update");
      return { data: w.updatedEvent === undefined ? null : w.updatedEvent, error: w.updateError ?? null };
    }
    if (table === "orgs") return { data: ORG_ROW, error: null };
    if (table === "messages" && first === "select") {
      log.push("cards:read");
      return { data: (w.cardIds ?? []).map((id) => ({ id })), error: w.cardsReadError ?? null };
    }
    if (table === "chat_event_cards") {
      log.push("cards:read-notes");
      const rows = Object.entries(w.notes ?? {}).map(([message_id, note]) => ({ message_id, note }));
      return { data: rows, error: w.notesReadError ?? null };
    }
    if (table === "messages" && first === "update") {
      log.push("cards:write");
      const patch = calls[0][1] as { content: string };
      const ids = (calls.find((c) => c[0] === "in")?.[2] as string[]) ?? [];
      const kind = calls.find((c) => c[0] === "eq" && c[1] === "kind")?.[2];
      writes.push({ content: patch.content, ids, kind });
      return { data: ids.map((id) => ({ id })), error: w.cardsWriteError ?? null };
    }
    throw new Error(`unexpected service ${first} on ${table}`);
  };
  const answerCookie = (table: string, calls: Call[]): { data: unknown; error: unknown } => {
    const first = calls[0]?.[0];
    if (table === "events" && first === "delete") {
      log.push("event:delete");
      return { data: w.deleteRows ?? [{ id: EVENT }], error: w.deleteError ?? null };
    }
    if (table === "rsvps") return { data: null, error: null };
    throw new Error(`unexpected cookie ${first} on ${table}`);
  };
  const chain = (table: string, answer: (t: string, c: Call[]) => { data: unknown; error: unknown }) => {
    const calls: Call[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "limit", "update", "delete", "gt"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () =>
      Promise.resolve().then(() => {
        const r = answer(table, calls);
        const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
        return { data: rows[0] ?? null, error: r.error };
      });
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => answer(table, calls))
        .then(resolve, reject);
    return builder;
  };
  const service = { from: (table: string) => chain(table, answerService) };
  const cookie = {
    auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) },
    from: (table: string) => chain(table, answerCookie),
    // Every RPC answers the RSVP count rows, unless a test sets the check-in
    // state (those rows read as "nothing known" to parseCheckinStateRows).
    rpc: async (name: string) =>
      name === "event_checkin_state" && (w.checkinState || w.checkinStateError)
        ? { data: w.checkinStateError ? null : w.checkinState, error: w.checkinStateError ?? null }
        : { data: [{ event_id: EVENT, going_count: 3, maybe_count: 1 }], error: null },
  };
  (globalThis as unknown as { __ev: unknown }).__ev = {
    cookie,
    service,
    log,
    role: w.role === undefined ? "admin" : w.role,
    collect: w.collect ?? { ok: true, ids: ["u1", "u2"] },
    send: w.send ?? { notified: 2, failed: false },
  };
  return { log, writes };
}

const CTX = { params: Promise.resolve({ id: EVENT }) };
const patch = async (body: unknown) =>
  PATCH(new Request("http://vibe.test/", { method: "PATCH", body: JSON.stringify(body) }), CTX);
const del = async () => DELETE(new Request("http://vibe.test/", { method: "DELETE" }), CTX);
const answer = async (res: Response) => ({ status: res.status, text: await res.text() });

/** Time is fixed; console noise from the failure cases is swallowed. */
function quiet(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
}

const CARDS = [mid(1), mid(2)];
const NOTES = { [mid(1)]: null, [mid(2)]: "Wear red" };
const EDITED_TITLE = { ...UPCOMING, title: "Fall Formal 2" };
const MOVED = { ...UPCOMING, starts_at: "2026-10-09T23:30:00+00:00", ends_at: "2026-10-10T02:00:00+00:00" };

// ── DELETE ───────────────────────────────────────────────────────────────────

test("DELETE (not ended): cards are read BEFORE the delete, rewritten AFTER it, then the notices go out", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES });
  const res = await answer(await del());
  assert.deepEqual(res, { status: 200, text: JSON.stringify({ ok: true, notified: 2 }) });
  assert.deepEqual(log, [
    "notices:collect",
    "cards:read",
    "cards:read-notes",
    "event:delete",
    "cards:write",
    "notices:send",
  ]);
  assert.deepEqual(writes, [{ content: "Event cancelled: Fall Formal", ids: CARDS, kind: "event_card" }]);
});

test("DELETE (not ended, nobody RSVP'd): the cards are still rewritten; the answer is { ok, notified: 0 }", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, collect: { ok: true, ids: [] } });
  assert.deepEqual(await answer(await del()), { status: 200, text: JSON.stringify({ ok: true, notified: 0 }) });
  assert.deepEqual(log, ["notices:collect", "cards:read", "cards:read-notes", "event:delete", "cards:write"]);
  assert.equal(writes.length, 1);
});

test("DELETE (not ended, no cards): no card write", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, cardIds: [] });
  assert.equal((await del()).status, 200);
  assert.deepEqual(log, ["notices:collect", "cards:read", "event:delete", "notices:send"]);
  assert.deepEqual(writes, []);
});

test("DELETE (ended): deletes quietly, never reads or rewrites a card (its card keeps its history text)", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: ENDED, cardIds: CARDS, notes: NOTES });
  assert.deepEqual(await answer(await del()), { status: 200, text: JSON.stringify({ ok: true, notified: 0 }) });
  assert.deepEqual(log, ["event:delete"]);
  assert.deepEqual(writes, []);
});

test("DELETE: a delete that removes no row (RLS) answers 404 and rewrites nothing", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, deleteRows: [] });
  const res = await del();
  assert.equal(res.status, 404);
  assert.deepEqual(writes, []);
  assert.ok(!log.includes("cards:write") && !log.includes("notices:send"));
});

test("DELETE: a delete that errors answers 500 and rewrites nothing", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, deleteError: { code: "XX000", message: "boom" } });
  assert.equal((await del()).status, 500);
  assert.deepEqual(writes, []);
  assert.ok(!log.includes("cards:write"));
});

test("DELETE: a failed recipients read stops before the cards are read or anything is deleted", async (t) => {
  quiet(t);
  const { log } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, collect: { ok: false } });
  assert.equal((await del()).status, 500);
  assert.deepEqual(log, ["notices:collect"]);
});

/** The answer of a DELETE with nothing wrong, to compare a failing run against. */
async function healthyDelete() {
  setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES });
  return answer(await del());
}

test("DELETE: a card read that fails changes nothing: same answer, same notices, nothing rewritten", async (t) => {
  quiet(t);
  const expected = await healthyDelete();
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, cardsReadError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await answer(await del()), expected);
  assert.deepEqual(log, ["notices:collect", "cards:read", "event:delete", "notices:send"]);
  assert.deepEqual(writes, []);
});

test("DELETE: a notes read that fails changes nothing either", async (t) => {
  quiet(t);
  const expected = await healthyDelete();
  const { log, writes } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, notesReadError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await answer(await del()), expected);
  assert.deepEqual(log, ["notices:collect", "cards:read", "cards:read-notes", "event:delete", "notices:send"]);
  assert.deepEqual(writes, []);
});

test("DELETE: a rewrite that fails changes nothing: same answer, the notices still go out after it", async (t) => {
  quiet(t);
  const expected = await healthyDelete();
  const { log } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, cardsWriteError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await answer(await del()), expected);
  assert.deepEqual(log, ["notices:collect", "cards:read", "cards:read-notes", "event:delete", "cards:write", "notices:send"]);
});

test("DELETE: a failed notice send is still { ok, notified, notify_failed }, whatever the cards did", async (t) => {
  quiet(t);
  setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, send: { notified: 0, failed: true } });
  assert.deepEqual(await answer(await del()), { status: 200, text: JSON.stringify({ ok: true, notified: 0, notify_failed: true }) });
});

test("DELETE: a database without the chat schema (no cards table) deletes as before", async (t) => {
  quiet(t);
  const missing = { code: "42703", message: "column messages.kind does not exist" };
  const { log, writes } = setup({ event: UPCOMING, cardsReadError: missing });
  assert.deepEqual(await answer(await del()), { status: 200, text: JSON.stringify({ ok: true, notified: 2 }) });
  assert.deepEqual(log, ["notices:collect", "cards:read", "event:delete", "notices:send"]);
  assert.deepEqual(writes, []);
});

test("DELETE: the refusals are untouched (a mod is not an officer: 403, nothing read)", async (t) => {
  quiet(t);
  const { log } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, role: "mod" });
  const res = await del();
  assert.equal(res.status, 403);
  assert.deepEqual(log, []);
});

// ── PATCH ────────────────────────────────────────────────────────────────────

test("PATCH: a new title rewrites every card's text, per note, after the update and before the answer", async (t) => {
  quiet(t);
  const { log, writes } = setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES });
  const res = await patch({ title: "Fall Formal 2" });
  assert.equal(res.status, 200);
  assert.deepEqual(log, ["event:update", "cards:read", "cards:read-notes", "cards:write", "cards:write"]);
  assert.deepEqual(
    writes.map((w) => [w.content, w.ids, w.kind]).sort(),
    [
      ["Event: Fall Formal 2 · Thu Oct 8, 7:30 PM — Wear red", [mid(2)], "event_card"],
      ["Event: Fall Formal 2 · Thu Oct 8, 7:30 PM", [mid(1)], "event_card"],
    ].sort(),
  );
});

test("PATCH: a moved start rewrites the day and time, the title kept", async (t) => {
  quiet(t);
  const { writes } = setup({ event: UPCOMING, updatedEvent: MOVED, cardIds: [mid(1)], notes: { [mid(1)]: null } });
  const res = await patch({ starts_at: "2026-10-09T23:30:00Z", ends_at: "2026-10-10T02:00:00Z" });
  assert.equal(res.status, 200);
  assert.deepEqual(writes, [{ content: "Event: Fall Formal · Fri Oct 9, 7:30 PM", ids: [mid(1)], kind: "event_card" }]);
});

test("PATCH: an edit of the description or the place only touches no card", async (t) => {
  quiet(t);
  const { log, writes } = setup({
    event: UPCOMING,
    updatedEvent: { ...UPCOMING, description: "New text", location: "Room 5" },
    cardIds: CARDS,
    notes: NOTES,
  });
  const res = await patch({ description: "New text", location: "Room 5" });
  assert.equal(res.status, 200);
  assert.deepEqual(log, ["event:update"]);
  assert.deepEqual(writes, []);
});

test("PATCH: the same start written another way (Z vs +00:00) is not a change", async (t) => {
  quiet(t);
  const { log } = setup({ event: UPCOMING, updatedEvent: { ...UPCOMING, starts_at: "2026-10-08T23:30:00Z" }, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ title: "Fall Formal" })).status, 200);
  assert.deepEqual(log, ["event:update"]);
});

test("PATCH: a card read or write that fails leaves the answer byte for byte the same", async (t) => {
  quiet(t);
  setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES });
  const expected = await answer(await patch({ title: "Fall Formal 2" }));
  assert.equal(expected.status, 200);
  for (const fault of [
    { cardsReadError: { code: "XX000", message: "boom" } },
    { notesReadError: { code: "XX000", message: "boom" } },
    { cardsWriteError: { code: "XX000", message: "boom" } },
    { cardsReadError: { code: "42703", message: "column messages.kind does not exist" } },
  ] as Partial<World>[]) {
    setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES, ...fault });
    assert.deepEqual(await answer(await patch({ title: "Fall Formal 2" })), expected, JSON.stringify(fault));
  }
});

test("PATCH: an update that finds no row (404) or errors (500) refreshes nothing", async (t) => {
  quiet(t);
  const gone = setup({ event: UPCOMING, updatedEvent: null, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ title: "Fall Formal 2" })).status, 404);
  assert.deepEqual(gone.log, ["event:update"]);
  const failed = setup({ event: UPCOMING, updateError: { code: "XX000", message: "boom" }, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ title: "Fall Formal 2" })).status, 500);
  assert.deepEqual(failed.log, ["event:update"]);
});

test("PATCH: the refusals touch no card (ended 409, not an officer 403, invalid times 400)", async (t) => {
  quiet(t);
  const ended = setup({ event: ENDED, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ title: "Fall Formal 2" })).status, 409);
  assert.deepEqual(ended.log, []);
  const mod = setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES, role: "mod" });
  assert.equal((await patch({ title: "Fall Formal 2" })).status, 403);
  assert.deepEqual(mod.log, []);
  const times = setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ starts_at: "2026-10-12T00:00:00Z" })).status, 400);
  assert.deepEqual(times.log, []);
});

// ── PATCH: the event check-in fields (Oct 19 2026, contract 3.6) ─────────────

type PatchAnswer = { ok: boolean; event: Record<string, unknown> | null };

test("PATCH: the answer's event carries the check-in state, the three keys last", async (t) => {
  quiet(t);
  setup({
    event: UPCOMING,
    updatedEvent: { ...UPCOMING, description: "New text" },
    checkinState: [{ event_id: EVENT, is_open: true, viewer_checked_in: true, checked_in_count: 7 }],
  });
  const res = await patch({ description: "New text" });
  assert.equal(res.status, 200);
  const { event } = (await res.json()) as PatchAnswer;
  assert.ok(event);
  assert.deepEqual(Object.keys(event).slice(-4), ["org", "checkin_open", "checked_in_count", "viewer_checked_in"]);
  assert.deepEqual([event.checkin_open, event.checked_in_count, event.viewer_checked_in], [true, 7, true]);
  assert.deepEqual([event.going_count, event.interested_count], [3, 1]);
});

test("PATCH: a failed check-in state read still saves and answers, the fields 'nothing known', the log code only", async (t) => {
  quiet(t);
  const seen: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    seen.push(args);
  });
  setup({
    event: UPCOMING,
    updatedEvent: { ...UPCOMING, description: "New text" },
    checkinStateError: { code: "PGRST202", message: `function event_checkin_state(${EVENT}) missing` },
  });
  const res = await patch({ description: "New text" });
  assert.equal(res.status, 200);
  const { ok, event } = (await res.json()) as PatchAnswer;
  assert.equal(ok, true);
  assert.ok(event);
  assert.deepEqual([event.checkin_open, event.checked_in_count, event.viewer_checked_in], [false, null, false]);
  assert.deepEqual([event.going_count, event.interested_count], [3, 1], "the RSVP counts are untouched");
  const lines = seen.filter((a) => String(a[0]).includes("checkin state"));
  assert.deepEqual(lines, [["[events/:id PATCH checkin state]", { code: "PGRST202" }]]);
});
