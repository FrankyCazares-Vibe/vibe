/**
 * Tests for `club-switch.ts` (wave 2, WAVE2-DESIGN.md C1 and C2): the shape
 * checks, lower-cased handles, the remembered club in a fake localStorage
 * (junk and blocked storage read as "not switched"), and the two-minute
 * clubs-you-run cache in a fake sessionStorage. The hooks need React to
 * render and are left to the browser pass.
 *
 * Run with:
 *   node --test src/lib/orgs/club-switch.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't resolve the "@/…"
 * alias. The request wrapper is stubbed (it pulls in the native bridge);
 * nothing here makes a request.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("club-switch.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/feedback/request": stub("export async function vibeRequest() { throw new Error('not in this test'); }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

/** A Storage that keeps strings, or throws on every call when `blocked`. */
function fakeStorage() {
  const map = new Map<string, string>();
  const s = {
    blocked: false,
    map,
    getItem(k: string) {
      if (s.blocked) throw new Error("blocked");
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      if (s.blocked) throw new Error("blocked");
      map.set(k, String(v));
    },
    removeItem(k: string) {
      if (s.blocked) throw new Error("blocked");
      map.delete(k);
    },
  };
  return s;
}

const local = fakeStorage();
const session = fakeStorage();
const events: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: local,
  sessionStorage: session,
  dispatchEvent: (e: Event) => {
    events.push(e.type);
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

const specifier = "./club-switch.ts";
const m = (await import(specifier)) as typeof import("./club-switch");

test("a handle is lower-cased and trimmed; junk is no handle", () => {
  assert.equal(m.clubHandle(" SAE "), "sae");
  assert.equal(m.clubHandle("sixty-four_chess"), "sixty-four_chess");
  for (const junk of ["", "  ", "../admin", "a/b", "-x", "a b", 5, null, undefined, {}, "x".repeat(65)]) {
    assert.equal(m.clubHandle(junk), null, String(junk));
  }
  assert.equal(m.sameHandle("SAE", "sae"), true);
  assert.equal(m.sameHandle("sae", "chess"), false);
  assert.equal(m.sameHandle(null, null), false, "two missing handles are not the same club");
});

test("a switched club: the shape is checked, the logo kept only when safe", () => {
  assert.deepEqual(m.parseSwitchedClub({ handle: "SAE", name: " Sigma ", logo_url: "/api/orgs/sae/asset/logo?v=a" }), {
    handle: "sae",
    name: "Sigma",
    logo_url: "/api/orgs/sae/asset/logo?v=a",
  });
  assert.equal(m.parseSwitchedClub({ handle: "sae", name: "S", logo_url: "https://cdn.x/l.png" })?.logo_url, "https://cdn.x/l.png");
  for (const bad of ["//evil.example/x.png", "javascript:alert(1)", "http://x/l.png", 7]) {
    assert.equal(m.parseSwitchedClub({ handle: "sae", name: "S", logo_url: bad })?.logo_url, null, String(bad));
  }
  for (const junk of [null, "sae", [], { handle: "sae" }, { name: "S" }, { handle: "../x", name: "S" }, { handle: "sae", name: "  " }]) {
    assert.equal(m.parseSwitchedClub(junk), null, JSON.stringify(junk));
  }
});

test("the clubs I run: owner/admin only, counts kept only when whole, one row per club", () => {
  const body = {
    ok: true,
    clubs: [
      { org_id: "a", handle: "SAE", name: "SAE", logo_url: null, role: "owner", title: " President ", requests: 2 },
      { org_id: "b", handle: "chess", name: "Chess", logo_url: null, role: "admin", title: "", requests: null },
      { org_id: "c", handle: "film", name: "Film", role: "member", requests: 1 },
      { org_id: "d", handle: "sae", name: "SAE twice", role: "admin" },
      { org_id: "", handle: "run", name: "Run", role: "admin" },
      { org_id: "e", handle: "art", name: "Art", role: "admin", requests: -1 },
      { org_id: "f", handle: "go", name: "Go", role: "admin", requests: 1.5 },
      "junk",
    ],
  };
  const clubs = m.readClubsYouRun(body);
  assert.ok(clubs);
  assert.deepEqual(
    clubs.map((c) => [c.org_id, c.handle, c.role, c.title, c.requests]),
    [
      ["a", "sae", "owner", "President", 2],
      ["b", "chess", "admin", null, null],
      ["e", "art", "admin", null, null],
      ["f", "go", "admin", null, null],
    ],
  );
  assert.equal(m.readClubsYouRun({ ok: true }), null);
  assert.equal(m.readClubsYouRun(null), null);
  assert.deepEqual(m.readClubsYouRun({ clubs: [] }), []);
});

test("set and read the remembered club: lower-cased, null removes it, each change announced", () => {
  events.length = 0;
  m.setSwitchedClub({ handle: "SAE", name: "SAE", logo_url: null });
  assert.equal(local.map.get(m.PROFILE_AS_CLUB_KEY), JSON.stringify({ handle: "sae", name: "SAE", logo_url: null }));
  assert.deepEqual(m.readSwitchedClub(), { handle: "sae", name: "SAE", logo_url: null });
  m.setSwitchedClub(null);
  assert.equal(local.map.has(m.PROFILE_AS_CLUB_KEY), false);
  assert.equal(m.readSwitchedClub(), null);
  assert.deepEqual(events, [m.PROFILE_AS_CLUB_EVENT, m.PROFILE_AS_CLUB_EVENT]);
  // Junk is never written: a bad club switches back to me.
  m.setSwitchedClub({ handle: "a/b", name: "X", logo_url: null });
  assert.equal(local.map.has(m.PROFILE_AS_CLUB_KEY), false);
});

test("junk or blocked storage reads as not switched, never throws", () => {
  for (const raw of ["{", "null", "[]", '"sae"', JSON.stringify({ handle: "../x", name: "X" })]) {
    local.map.set(m.PROFILE_AS_CLUB_KEY, raw);
    assert.equal(m.readSwitchedClub(), null, raw);
  }
  local.map.set(m.PROFILE_AS_CLUB_KEY, JSON.stringify({ handle: "sae", name: "SAE" }));
  local.blocked = true;
  try {
    assert.equal(m.readSwitchedClub(), null);
    assert.doesNotThrow(() => m.setSwitchedClub({ handle: "sae", name: "SAE", logo_url: null }));
  } finally {
    local.blocked = false;
    local.map.clear();
  }
});

test("the clubs cache: fresh for two minutes, gone with its session copy, cleared by a switch", () => {
  const club = { org_id: "a", handle: "sae", name: "SAE", logo_url: null, role: "owner", title: null, requests: 1 };
  const at = 1_000_000;
  session.map.set(m.CLUBS_YOU_RUN_CACHE_KEY, JSON.stringify({ at, clubs: [club] }));
  assert.deepEqual(m.readClubsYouRunCache(at + 1000)?.map((c) => c.handle), ["sae"]);
  assert.equal(m.readClubsYouRunCache(at + m.CLUBS_YOU_RUN_CACHE_MS), null, "two minutes on, it asks again");
  assert.equal(m.readClubsYouRunCache(at - 1), null, "a clock that went back is not fresh");
  // Signing out removes the session copy; the page's memory copy goes too.
  session.map.delete(m.CLUBS_YOU_RUN_CACHE_KEY);
  assert.equal(m.readClubsYouRunCache(at + 1000), null);
  session.map.set(m.CLUBS_YOU_RUN_CACHE_KEY, "{junk");
  assert.equal(m.readClubsYouRunCache(at + 1000), null);
  session.map.set(m.CLUBS_YOU_RUN_CACHE_KEY, JSON.stringify({ at: Date.now(), clubs: [club] }));
  assert.ok(m.readClubsYouRunCache());
  m.setSwitchedClub({ handle: "sae", name: "SAE", logo_url: null });
  assert.equal(session.map.has(m.CLUBS_YOU_RUN_CACHE_KEY), false, "a switch asks again");
  assert.equal(m.readClubsYouRunCache(), null);
  m.setSwitchedClub(null);
});
