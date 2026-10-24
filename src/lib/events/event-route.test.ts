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
  // Event covers (Oct 23, 2026): storage on unless a test turns it off; a
  // cover delete is logged, and throws when a test says storage is down.
  "@/lib/r2": stub(
    "export function isR2Configured() { return globalThis.__ev.r2 !== false; }\n" +
      "export async function deleteEventCoverKey(key) { globalThis.__ev.log.push('cover:delete'); globalThis.__ev.coverDeletes.push(key); if (globalThis.__ev.coverDeleteFails) throw new Error('storage down'); }",
  ),
  "@/lib/events/notify-cancel": stub(
    "export async function collectCancelRecipients(service, eventId, actorId, opts) { globalThis.__ev.log.push('notices:collect'); globalThis.__ev.collectOpts.push(opts); return globalThis.__ev.collect; }\n" +
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
  role?: "owner" | "admin" | "member" | null;
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
  /** "Members only" flips (Oct 22, 2026): who RSVP'd, who of them is a member, a failing delete. */
  rsvpUserIds?: string[];
  memberIds?: string[];
  rsvpDeleteError?: Err;
  /** Event covers (Oct 23, 2026): what the cleanup and the takedown check read. */
  openReport?: boolean;
  reportsError?: Err;
  /** Keys an image_remove row of the club names. */
  removedCovers?: string[];
  moderationError?: Err;
  otherEventWithCover?: boolean;
  postWithCover?: boolean;
  /** The club's banner is this key (Oct 23, 2026 review: a crafted club PATCH can set one). */
  clubBanner?: string;
  r2?: boolean;
  coverDeleteFails?: boolean;
};

type Call = [string, ...unknown[]];
type Write = { content: string; ids: string[]; kind: unknown };

function setup(w: World) {
  const log: string[] = [];
  const writes: Write[] = [];
  const updates: Record<string, unknown>[] = [];
  const dropped: string[][] = [];
  const collectOpts: unknown[] = [];
  const coverDeletes: string[] = [];
  const answerService = (table: string, calls: Call[]): { data: unknown; error: unknown } => {
    const first = calls[0]?.[0];
    const eq = (column: string) => calls.find((c) => c[0] === "eq" && c[1] === column)?.[2];
    if (table === "events" && first === "select" && eq("cover_key") !== undefined) {
      log.push("cover:other-events");
      return { data: w.otherEventWithCover ? [{ id: mid(90) }] : [], error: null };
    }
    if (table === "reports") {
      log.push("cover:reports");
      assert.deepEqual([eq("target_type"), eq("target_id"), eq("status")], ["event", EVENT, "open"]);
      return { data: w.openReport ? [{ id: mid(80) }] : [], error: w.reportsError ?? null };
    }
    if (table === "moderation_actions") {
      // checkRemovedPicture reads the club's own rows, then its events' rows
      // (a cover's takedown is logged on the event, meta.org_id the club).
      const onEvents = eq("target_type") === "event";
      log.push(onEvents ? "cover:moderation:events" : "cover:moderation:club");
      if (onEvents) {
        assert.deepEqual(calls.find((c) => c[0] === "contains")?.slice(1), ["meta", { org_id: ORG }]);
      } else {
        assert.equal(eq("target_id"), ORG);
      }
      const rows = onEvents
        ? (w.removedCovers ?? []).map((k, i) => ({
            id: mid(70 + i),
            action: "image_remove",
            meta: { org_id: ORG, slots: ["cover"], previous: { cover: k } },
          }))
        : [];
      return { data: w.moderationError ? null : rows, error: w.moderationError ?? null };
    }
    if (table === "posts") {
      log.push("cover:posts");
      assert.equal(eq("org_id"), ORG);
      return { data: w.postWithCover && eq("media_url") !== undefined ? [{ id: mid(60) }] : [], error: null };
    }
    if (table === "events" && first === "select") return { data: w.event, error: null };
    if (table === "events" && first === "update") {
      log.push("event:update");
      updates.push(calls[0][1] as Record<string, unknown>);
      return { data: w.updatedEvent === undefined ? null : w.updatedEvent, error: w.updateError ?? null };
    }
    if (table === "rsvps" && first === "select") {
      log.push("rsvps:read");
      assert.equal(calls.find((c) => c[0] === "eq" && c[1] === "event_id")?.[2], EVENT);
      return { data: (w.rsvpUserIds ?? []).map((user_id) => ({ user_id })), error: null };
    }
    if (table === "org_members") {
      log.push("members:read");
      assert.equal(calls.find((c) => c[0] === "eq" && c[1] === "org_id")?.[2], ORG);
      const asked = (calls.find((c) => c[0] === "in" && c[1] === "user_id")?.[2] as string[]) ?? [];
      return { data: asked.filter((id) => (w.memberIds ?? []).includes(id)).map((user_id) => ({ user_id })), error: null };
    }
    if (table === "rsvps" && first === "delete") {
      log.push("rsvps:delete");
      assert.equal(calls.find((c) => c[0] === "eq" && c[1] === "event_id")?.[2], EVENT);
      const ids = (calls.find((c) => c[0] === "in" && c[1] === "user_id")?.[2] as string[]) ?? [];
      dropped.push(ids);
      return { data: w.rsvpDeleteError ? null : ids.map((user_id) => ({ user_id })), error: w.rsvpDeleteError ?? null };
    }
    if (table === "orgs") return { data: { ...ORG_ROW, banner_url: w.clubBanner ?? null }, error: null };
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
    for (const m of ["select", "eq", "in", "is", "order", "limit", "range", "update", "delete", "gt", "contains"]) {
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
    collectOpts,
    r2: w.r2,
    coverDeleteFails: w.coverDeleteFails,
    coverDeletes,
  };
  return { log, writes, updates, dropped, collectOpts, coverDeletes };
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

test("DELETE: the refusals are untouched (a member is not an officer: 403, nothing read)", async (t) => {
  quiet(t);
  const { log } = setup({ event: UPCOMING, cardIds: CARDS, notes: NOTES, role: "member" });
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
  const member = setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES, role: "member" });
  assert.equal((await patch({ title: "Fall Formal 2" })).status, 403);
  assert.deepEqual(member.log, []);
  const times = setup({ event: UPCOMING, updatedEvent: EDITED_TITLE, cardIds: CARDS, notes: NOTES });
  assert.equal((await patch({ starts_at: "2026-10-12T00:00:00Z" })).status, 400);
  assert.deepEqual(times.log, []);
});

// ── PATCH: the event check-in fields (Oct 19 2026, contract 3.6) ─────────────

type PatchAnswer = { ok: boolean; event: Record<string, unknown> | null };

test("PATCH: the answer's event carries the check-in state, the three keys, then visibility, icon and cover_url, last", async (t) => {
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
  assert.deepEqual(Object.keys(event).slice(-7), ["org", "checkin_open", "checked_in_count", "viewer_checked_in", "visibility", "icon", "cover_url"]);
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

// ── "Members only" events (Oct 22, 2026; PLAN-2.md E1) ──────────────────────

const MEMBERS_ONLY = { ...UPCOMING, visibility: "members" };
const EVERYONE = { ...UPCOMING, visibility: "everyone" };
const MEMBER_A = mid(11);
const MEMBER_B = mid(12);
const STRANGER = mid(13);
const LEFT_CLUB = mid(14);

test("PATCH to Members only: saved, then the non-members' RSVPs come off (service role), before the answer", async (t) => {
  quiet(t);
  const { log, updates, dropped } = setup({
    event: EVERYONE,
    updatedEvent: MEMBERS_ONLY,
    rsvpUserIds: [MEMBER_A, STRANGER, MEMBER_B, LEFT_CLUB],
    memberIds: [MEMBER_A, MEMBER_B],
  });
  const res = await patch({ visibility: "members" });
  assert.equal(res.status, 200);
  const { event } = (await res.json()) as PatchAnswer;
  assert.equal(event?.visibility, "members");
  assert.equal(updates[0].visibility, "members", "the column is written");
  assert.deepEqual(log, ["event:update", "rsvps:read", "members:read", "rsvps:delete"], "after the save; no card touched");
  assert.deepEqual(dropped, [[STRANGER, LEFT_CLUB]], "members keep theirs");
});

test("PATCH that keeps Members only, or stays Everyone, or goes back to Everyone: no RSVP is touched", async (t) => {
  quiet(t);
  for (const [stored, body, saved] of [
    [MEMBERS_ONLY, { location: "Room 2" }, { ...MEMBERS_ONLY, location: "Room 2" }],
    [EVERYONE, { location: "Room 2" }, { ...EVERYONE, location: "Room 2" }],
    [MEMBERS_ONLY, { visibility: "everyone" }, EVERYONE],
    [UPCOMING, { description: "x" }, { ...UPCOMING, description: "x" }],
  ] as const) {
    const { log, updates } = setup({ event: stored, updatedEvent: saved, rsvpUserIds: [STRANGER] });
    assert.equal((await patch(body)).status, 200, JSON.stringify(body));
    assert.deepEqual(log, ["event:update"], JSON.stringify(body));
    assert.equal(updates[0].visibility, (saved as { visibility?: string }).visibility ?? "everyone", "a field left out keeps its stored value");
  }
});

test("PATCH with a visibility that isn't one of the two: 400 invalid_visibility, nothing written", async (t) => {
  quiet(t);
  const { log } = setup({ event: EVERYONE, updatedEvent: MEMBERS_ONLY });
  const res = await patch({ visibility: "secret" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "invalid_visibility");
  assert.deepEqual(log, []);
});

test("PATCH to Members only whose RSVP delete fails: still saved and answered (200), logged without names", async (t) => {
  quiet(t);
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => errors.push(args));
  setup({
    event: EVERYONE,
    updatedEvent: MEMBERS_ONLY,
    rsvpUserIds: [STRANGER],
    memberIds: [],
    rsvpDeleteError: { code: "57014", message: "canceling statement" },
  });
  assert.equal((await patch({ visibility: "members" })).status, 200);
  assert.ok(errors.some((args) => String(args[0]).includes("members-only")), "said in the log");
  assert.equal(JSON.stringify(errors).includes(STRANGER), false, "never a person's id");
});

test("DELETE of a members-only event: the notices go to the club's current members only; an Everyone event asks nothing more", async (t) => {
  quiet(t);
  const members = setup({ event: MEMBERS_ONLY });
  assert.equal((await del()).status, 200);
  assert.deepEqual(members.collectOpts, [{ membersOf: ORG }]);
  const everyone = setup({ event: EVERYONE });
  assert.equal((await del()).status, 200);
  assert.deepEqual(everyone.collectOpts, [{ membersOf: null }]);
  const legacy = setup({ event: UPCOMING });
  assert.equal((await del()).status, 200);
  assert.deepEqual(legacy.collectOpts, [{ membersOf: null }], "a row read without the column is Everyone");
});

// ── Event icons (Oct 23, 2026; club view wave 3, batch B4) ──────────────────

test("PATCH with an icon: written and answered; null takes it off; left out keeps the stored one", async (t) => {
  quiet(t);
  const withFood = { ...UPCOMING, icon: "food" };
  for (const [stored, body, written, saved] of [
    [UPCOMING, { icon: "food" }, "food", withFood],
    [withFood, { icon: "party" }, "party", { ...UPCOMING, icon: "party" }],
    [withFood, { icon: null }, null, { ...UPCOMING, icon: null }],
    [withFood, { location: "Room 2" }, "food", { ...withFood, location: "Room 2" }],
    [UPCOMING, { description: "x" }, null, { ...UPCOMING, description: "x" }],
  ] as const) {
    const { log, updates } = setup({ event: stored, updatedEvent: saved });
    const res = await patch(body);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.deepEqual(log, ["event:update"], JSON.stringify(body));
    assert.equal(updates[0].icon, written, JSON.stringify(body));
    const { event } = (await res.json()) as PatchAnswer;
    assert.equal(event?.icon, (saved as { icon?: string | null }).icon ?? null);
  }
});

test("PATCH with an icon that isn't one of the twelve: 400 invalid_icon, nothing written", async (t) => {
  quiet(t);
  for (const icon of ["Food", "calendar", "", 5]) {
    const { log } = setup({ event: UPCOMING, updatedEvent: UPCOMING });
    const res = await patch({ icon });
    assert.equal(res.status, 400, JSON.stringify(icon));
    assert.equal(((await res.json()) as { code: string }).code, "invalid_icon");
    assert.deepEqual(log, []);
  }
});

// ── Cover photos (Oct 23, 2026; COVERS-PLAN.md, batch B1) ──────────────────

const coverKey = (n: number, ext = "jpg") => `orgs/${ORG}/events/${mid(n).replace(/^aaaaaaaa/, "3f0e7c1a")}.${ext}`;
const OLD_COVER = coverKey(1);
const NEW_COVER = coverKey(2, "webp");
const WITH_COVER = { ...UPCOMING, cover_key: OLD_COVER };
/** The cleanup's reads, in any order (they run side by side). */
const CLEANUP_READS = [
  "cover:moderation:club",
  "cover:moderation:events",
  "cover:other-events",
  "cover:posts",
  "cover:posts",
  "cover:reports",
];
/** The takedown check before a new cover is saved: the club's rows, then its events'. */
const TAKEDOWN_READS = ["cover:moderation:club", "cover:moderation:events"];
const coverReads = (log: string[]) => log.filter((l) => l.startsWith("cover:") && l !== "cover:delete").sort();

test("PATCH adding a cover: the takedown log is read, the key written, the answer carries its address only", async (t) => {
  quiet(t);
  const { log, updates, coverDeletes } = setup({ event: UPCOMING, updatedEvent: { ...UPCOMING, cover_key: NEW_COVER } });
  const res = await patch({ cover_key: NEW_COVER });
  assert.equal(res.status, 200);
  assert.deepEqual(log, [...TAKEDOWN_READS, "event:update"], "nothing to clean up: there was no cover");
  assert.equal(updates[0].cover_key, NEW_COVER);
  const text = await res.text();
  assert.equal(text.includes(NEW_COVER), false, "the key never leaves the server");
  const { event } = JSON.parse(text) as PatchAnswer;
  assert.equal(event?.cover_url, `/api/events/${EVENT}/cover?v=${NEW_COVER.split("/").pop()}`);
  assert.deepEqual(coverDeletes, []);
});

test("PATCH replacing or removing a cover: saved first, then the old file goes when nothing needs it", async (t) => {
  quiet(t);
  for (const [body, saved] of [
    [{ cover_key: NEW_COVER }, NEW_COVER],
    [{ cover_key: null }, null],
  ] as const) {
    const { log, updates, coverDeletes } = setup({ event: WITH_COVER, updatedEvent: { ...UPCOMING, cover_key: saved } });
    assert.equal((await patch(body)).status, 200, JSON.stringify(body));
    assert.equal(updates[0].cover_key, saved);
    assert.ok(log.indexOf("event:update") < log.indexOf("cover:delete"), "deleted only after the save");
    assert.deepEqual(coverReads(log.slice(log.indexOf("event:update"))), CLEANUP_READS);
    assert.deepEqual(coverDeletes, [OLD_COVER], JSON.stringify(body));
  }
});

test("PATCH keeping the cover (left out, or sent back as stored): no takedown read, no delete", async (t) => {
  quiet(t);
  for (const body of [{ location: "Room 2" }, { location: "Room 2", cover_key: OLD_COVER }]) {
    const { log, updates, coverDeletes } = setup({ event: WITH_COVER, updatedEvent: { ...WITH_COVER, location: "Room 2" } });
    assert.equal((await patch(body)).status, 200, JSON.stringify(body));
    assert.deepEqual(log, ["event:update"], JSON.stringify(body));
    // Not written back (Oct 23, 2026 review): a takedown in between would be undone.
    assert.equal("cover_key" in updates[0], false, JSON.stringify(body));
    assert.deepEqual(coverDeletes, []);
  }
});

test("PATCH racing a moderator's takedown: the cover isn't written back, and the removed file stays", async (t) => {
  quiet(t);
  // Read with the cover; the takedown cleared it before the save landed.
  const { updates, coverDeletes } = setup({
    event: WITH_COVER,
    updatedEvent: { ...UPCOMING, location: "Room 2", cover_key: null },
    removedCovers: [OLD_COVER],
  });
  assert.equal((await patch({ location: "Room 2" })).status, 200);
  assert.equal("cover_key" in updates[0], false, "the edit doesn't put the picture back");
  assert.deepEqual(coverDeletes, [], "the takedown keeps the file as the record");
});

test("PATCH removing a cover something still needs (or that can't be checked): saved, and the old file stays", async (t) => {
  quiet(t);
  // Removing, not replacing: a replacement's own takedown check would
  // answer the failing log read first (500, tested below).
  for (const keepIt of [
    { openReport: true },
    { removedCovers: [OLD_COVER] },
    { otherEventWithCover: true },
    { postWithCover: true },
    { clubBanner: OLD_COVER },
    { reportsError: { code: "XX000", message: "boom" } },
    { moderationError: { code: "XX000", message: "boom" } },
    { r2: false },
  ] as Partial<World>[]) {
    const { updates, coverDeletes } = setup({ event: WITH_COVER, updatedEvent: { ...UPCOMING, cover_key: null }, ...keepIt });
    const res = await patch({ cover_key: null });
    assert.equal(res.status, 200, JSON.stringify(keepIt));
    assert.equal(updates[0].cover_key, null, JSON.stringify(keepIt));
    assert.deepEqual(coverDeletes, [], JSON.stringify(keepIt));
  }
  // A replacement whose old file an open report names keeps it too.
  const { coverDeletes } = setup({ event: WITH_COVER, updatedEvent: { ...UPCOMING, cover_key: NEW_COVER }, openReport: true });
  assert.equal((await patch({ cover_key: NEW_COVER })).status, 200);
  assert.deepEqual(coverDeletes, []);
});

test("PATCH whose old-file delete fails still answers the same 200", async (t) => {
  quiet(t);
  setup({ event: WITH_COVER, updatedEvent: { ...UPCOMING, cover_key: NEW_COVER } });
  const expected = await answer(await patch({ cover_key: NEW_COVER }));
  const { coverDeletes } = setup({ event: WITH_COVER, updatedEvent: { ...UPCOMING, cover_key: NEW_COVER }, coverDeleteFails: true });
  assert.deepEqual(await answer(await patch({ cover_key: NEW_COVER })), expected);
  assert.deepEqual(coverDeletes, [OLD_COVER], "it was tried");
});

test("PATCH with a cover moderators took down: 422 picture_removed; a failed log read: 500; nothing written", async (t) => {
  quiet(t);
  const removed = setup({ event: WITH_COVER, updatedEvent: WITH_COVER, removedCovers: [NEW_COVER] });
  const res = await patch({ cover_key: NEW_COVER });
  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { code: string }).code, "picture_removed");
  assert.deepEqual([[...removed.log].sort(), removed.updates, removed.coverDeletes], [TAKEDOWN_READS, [], []]);
  const failed = setup({ event: WITH_COVER, updatedEvent: WITH_COVER, moderationError: { code: "XX000", message: "boom" } });
  assert.equal((await patch({ cover_key: NEW_COVER })).status, 500);
  // Only the takedown log was read (the club's rows, and its events' rows
  // when checkRemovedPicture asks both side by side); nothing is written.
  assert.ok(failed.log.includes("cover:moderation:club"), JSON.stringify(failed.log));
  assert.ok(failed.log.every((l) => TAKEDOWN_READS.includes(l)), JSON.stringify(failed.log));
  assert.deepEqual(failed.updates, []);
});

test("PATCH with a key that isn't this club's cover: 400 invalid_cover before anything is read or written", async (t) => {
  quiet(t);
  for (const key of [
    `orgs/bbbbbbbb-0000-4000-8000-000000000009/events/3f0e7c1a-0000-4000-8000-000000000002.jpg`,
    `orgs/${ORG}/banner/3f0e7c1a-0000-4000-8000-000000000002.jpg`,
    "",
    7,
  ]) {
    const { log, updates } = setup({ event: WITH_COVER, updatedEvent: WITH_COVER });
    const res = await patch({ cover_key: key });
    assert.equal(res.status, 400, JSON.stringify(key));
    assert.equal(((await res.json()) as { code: string }).code, "invalid_cover");
    assert.deepEqual([log, updates], [[], []]);
  }
});

test("DELETE of an event with a cover: after the delete, the file goes; an open report keeps it", async (t) => {
  quiet(t);
  const gone = setup({ event: { ...WITH_COVER }, collect: { ok: true, ids: [] } });
  assert.equal((await del()).status, 200);
  assert.ok(gone.log.indexOf("event:delete") < gone.log.indexOf("cover:delete"));
  assert.deepEqual(coverReads(gone.log), CLEANUP_READS);
  assert.deepEqual(gone.coverDeletes, [OLD_COVER]);
  const reported = setup({ event: { ...WITH_COVER }, openReport: true });
  assert.deepEqual(await answer(await del()), { status: 200, text: JSON.stringify({ ok: true, notified: 2 }) });
  assert.deepEqual(reported.coverDeletes, []);
  const ended = setup({ event: { ...ENDED, cover_key: OLD_COVER } });
  assert.equal((await del()).status, 200);
  assert.deepEqual(ended.coverDeletes, [OLD_COVER], "an ended event's cover goes too");
  const refused = setup({ event: { ...WITH_COVER }, deleteRows: [] });
  assert.equal((await del()).status, 404);
  assert.deepEqual(refused.coverDeletes, [], "nothing deleted, nothing cleaned");
});
