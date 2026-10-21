/**
 * Tests for `meeting-time.ts` (the club's view, wave 2, C8): the one line a
 * club writes about when it meets, and the rule both the Edit page and
 * PATCH /api/orgs/[slug] apply before `orgs_meeting_time_len` (60) sees it;
 * then the route itself, against a fake service client: it saves the line,
 * refuses bad or blocked text, and works on a database without the column.
 *
 * Run with:
 *   node --test src/lib/orgs/meeting-time.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

const specifier = "./meeting-time.ts";
const { MEETING_TIME_MAX, normalizeMeetingTime, storedMeetingTime } = (await import(
  specifier
)) as typeof import("./meeting-time");

const ok = (raw: unknown) => {
  const r = normalizeMeetingTime(raw);
  assert.ok(r.ok, `refused ${JSON.stringify(raw)}`);
  return r.value;
};
const refused = (raw: unknown) => {
  const r = normalizeMeetingTime(raw);
  assert.ok(!r.ok, `let ${JSON.stringify(raw)} through`);
  assert.equal(r.code, "meeting_time_invalid");
  return r.message;
};

test("a plain line is kept as written", () => {
  assert.equal(ok("Thursdays · 7 PM, the Lantern Room"), "Thursdays · 7 PM, the Lantern Room");
});

test("only a string: anything else is refused", () => {
  for (const raw of [null, undefined, 7, true, {}, ["Thursdays"]]) {
    assert.equal(refused(raw), "When you meet is one line of text.");
  }
});

test("the ends are trimmed, and empty or blank clears it", () => {
  assert.equal(ok("  Mondays at 6  "), "Mondays at 6");
  assert.equal(ok(""), "");
  assert.equal(ok("   \n\t "), "");
});

test("line breaks, tabs and runs of spaces become one space", () => {
  assert.equal(ok("Thursdays\n7 PM"), "Thursdays 7 PM");
  assert.equal(ok("Thursdays\r\n\r\n7 PM"), "Thursdays 7 PM");
  assert.equal(ok("Thursdays\t\t7 PM"), "Thursdays 7 PM");
  assert.equal(ok("Thursdays     7 PM"), "Thursdays 7 PM");
});

test("control characters go, and leave no double space behind", () => {
  assert.equal(ok("Thurs\u0000days"), "Thursdays");
  assert.equal(ok("Thursdays \u0007 7 PM\u007f"), "Thursdays 7 PM");
  assert.equal(ok("\u001bThursdays"), "Thursdays");
});

test("hidden and direction-flipping characters go; an emoji's joiner stays", () => {
  assert.equal(ok("Thurs​days‮"), "Thursdays");
  assert.equal(ok("⁦Room 1⁩­"), "Room 1");
  assert.equal(ok("Pride night 🏳️‍🌈"), "Pride night 🏳️‍🌈");
});

test("at most 60 characters, counted as Postgres counts them (code points)", () => {
  assert.equal(MEETING_TIME_MAX, 60);
  assert.equal(ok("a".repeat(60)).length, 60);
  assert.equal(refused("a".repeat(61)), "Keep it to 60 characters.");
  // An emoji is one code point (two UTF-16 units): 60 pass, 61 do not.
  assert.equal(Array.from(ok("😀".repeat(60))).length, 60);
  assert.equal(refused("😀".repeat(61)), "Keep it to 60 characters.");
  // The count is taken after trimming and collapsing.
  assert.equal(ok(`  ${"a".repeat(30)}     ${"b".repeat(29)}  `).length, 60);
  assert.equal(ok(`${"a".repeat(60)}​​`).length, 60);
});

test("a stored value shows only when it says something", () => {
  assert.equal(storedMeetingTime("Fridays"), "Fridays");
  for (const raw of ["", "  ", null, undefined, 3]) assert.equal(storedMeetingTime(raw), null);
});

test("the cap is the migration's CHECK", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20261023100000_club_meeting_time.sql", import.meta.url),
    "utf8",
  );
  assert.ok(sql.includes(`check (char_length(meeting_time) <= ${MEETING_TIME_MAX})`));
});

// ── PATCH /api/orgs/[slug] takes `meeting_time` ─────────────────────────────
// The route against a recording fake of the service client (the
// `follower-board-routes.test.ts` harness, cut down): the server modules are
// stubbed, "@/x" resolves to "src/x.ts", and the route loads after the hook.

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (s: string, c: unknown, next: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("meeting-time.test.ts needs Node >= 22.15");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__mt";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.client; }`),
  "@/lib/supabase/service": stub(`export function createSupabaseServiceClient() { return ${W}.client; }`),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireCanPublish() { return null; }\nexport async function requireNotRestricted() { return null; }\n" +
      "export function contentBlockedResponse(field) { return Response.json({ ok: false, code: 'content_blocked', field }, { status: 422 }); }",
  ),
  "@/lib/orgs/membership": stub("export async function loadViewerOrgContext() { return null; }"),
  "@/lib/posts/delete-media-store": stub("export async function purgeDeletedClubMedia() {}"),
  "@/lib/safety/hidden-users": stub("export async function loadHiddenUsers() { return { ok: true, hidden: { ids: [] } }; }"),
  "@/app/api/admin/images/_lib/removed-picture-store": stub("export async function checkRemovedPicture() { return 'ok'; }"),
  "@/lib/iu/community-scope": stub("export function campusScopeError() { return { status: 403, body: { ok: false } }; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
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

type Call = [string, ...unknown[]];
type Query = { table: string; calls: Call[] };
const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const STORED = {
  id: ORG, handle: "sae", owner_id: OWNER, name: "SAE", description: "", philanthropy: "", links: [],
  join_policy: "invite", audience: "both", hidden_at: null, campus_id: null,
};

/** One world per test: `column` false is a database without meeting_time. */
function world(opts: { column?: boolean; stored?: string; hidden?: boolean } = {}) {
  const column = opts.column ?? true;
  const queries: Query[] = [];
  const missing = { code: "42703", message: "column orgs.meeting_time does not exist" };
  const answer = (q: Query) => {
    const select = String(q.calls.find((c) => c[0] === "select")?.[1] ?? "");
    if (!column && select.includes("meeting_time")) return { error: missing };
    const update = q.calls.find((c) => c[0] === "update")?.[1] as Record<string, unknown> | undefined;
    if (update) return { data: { id: ORG, handle: "sae", logo_url: null, banner_url: null, ...(column ? { meeting_time: opts.stored ?? "" } : {}), ...update } };
    const row = { ...STORED, hidden_at: opts.hidden ? "2026-10-10T00:00:00Z" : null };
    return { data: column ? { ...row, meeting_time: opts.stored ?? "" } : row };
  };
  const chain = (q: Query) => {
    const settle = () => Promise.resolve().then(() => ({ error: null, ...answer(q) }));
    const b: Record<string, unknown> = { maybeSingle: settle, single: settle };
    for (const m of ["select", "eq", "update"]) b[m] = (...args: unknown[]) => (q.calls.push([m, ...args]), b);
    return b;
  };
  (globalThis as unknown as { __mt: unknown }).__mt = {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: OWNER } }, error: null }) },
      from: (table: string) => {
        const q = { table, calls: [] as Call[] };
        queries.push(q);
        return chain(q);
      },
    },
  };
  const update = () => queries.find((q) => q.calls.some((c) => c[0] === "update"));
  return { queries, update, sent: () => update()?.calls.find((c) => c[0] === "update")?.[1] as Record<string, unknown> | undefined };
}

const ROUTE = "../../app/api/orgs/[slug]/route.ts";
const route = (await import(ROUTE)) as typeof import("../../app/api/orgs/[slug]/route");
const { filterTerms } = (await import("@/lib/moderation/text-filter-list")) as typeof import("../moderation/text-filter-list");
const patch = async (body: unknown) => {
  const res = await route.PATCH(
    new Request("https://vibe.test/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ slug: "sae" }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

test("PATCH: an officer saves when the club meets, cleaned, and the save reads it back", async () => {
  const w = world();
  const res = await patch({ meeting_time: "  Thursdays\n7 PM,   the Lantern Room " });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(w.sent()!).sort(), ["meeting_time", "updated_at"]);
  assert.equal(w.sent()!.meeting_time, "Thursdays 7 PM, the Lantern Room");
  assert.equal((res.body.org as Record<string, unknown>).meeting_time, "Thursdays 7 PM, the Lantern Room");
  assert.ok(String(w.queries[0].calls.find((c) => c[0] === "select")![1]).includes("meeting_time"), "the org read asks for it");
  assert.ok(String(w.update()!.calls.find((c) => c[0] === "select")![1]).endsWith(", meeting_time"));
  // "" clears it; a hidden club stores it too (page text, like the description).
  assert.equal((await patch({ meeting_time: "" })).status, 200);
  const hidden = world({ hidden: true });
  assert.equal((await patch({ meeting_time: "Fridays" })).status, 200);
  assert.equal(hidden.sent()!.meeting_time, "Fridays");
});

test("PATCH: not a string or over 60 is 400; a blocked word is 422 on new text only; nothing is written", async () => {
  for (const [value, message] of [
    [null, "When you meet is one line of text."],
    [7, "When you meet is one line of text."],
    ["a".repeat(61), "Keep it to 60 characters."],
  ] as const) {
    const w = world();
    const res = await patch({ meeting_time: value });
    assert.deepEqual([res.status, res.body.code, res.body.error], [400, "meeting_time_invalid", message]);
    assert.equal(w.update(), undefined);
  }
  const blocked = `${filterTerms()[0].term} night`;
  const w = world();
  const res = await patch({ meeting_time: blocked });
  assert.deepEqual([res.status, res.body.code, res.body.field], [422, "content_blocked", "meeting_time"]);
  assert.equal(w.update(), undefined);
  // The same text already stored is not judged again (checkChangedText).
  world({ stored: blocked });
  assert.equal((await patch({ meeting_time: blocked, backdrop_preset: "forest" })).status, 200);
});

test("PATCH: a database without the column: meeting_time is 503, every other save works as before", async () => {
  const w = world({ column: false });
  const res = await patch({ meeting_time: "Thursdays" });
  assert.deepEqual([res.status, res.body.code, res.body.error], [503, "meeting_time_unavailable", "This isn't ready yet. Try again later."]);
  assert.equal(w.update(), undefined);
  const other = world({ column: false });
  const saved = await patch({ backdrop_preset: "forest" });
  assert.equal(saved.status, 200);
  assert.equal("meeting_time" in (saved.body.org as Record<string, unknown>), false);
  assert.ok(!String(other.update()!.calls.find((c) => c[0] === "select")![1]).includes("meeting_time"));
});
