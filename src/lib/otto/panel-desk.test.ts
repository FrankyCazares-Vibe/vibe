/**
 * The side panel's mini desk (panel-desk.ts, Wave 2B): the top two Ready
 * items with one coral at most, a few "Otto saw" rows, the saved pick read
 * as `?club=`, the links that keep the club, and the panel's honesty.
 *
 * Run with:
 *   node --test src/lib/otto/panel-desk.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { DeskItem, DeskModel } from "./desk";

const P = (await import(new URL("./panel-desk.ts", import.meta.url).href)) as typeof import("./panel-desk");

const verb = { kind: "link" as const, label: "Open", href: "/x" };
const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, kind: "up_next", title: `Item ${id}`, ...extra });

function desk(ready: DeskItem[], saw: DeskItem[] = [], role: DeskModel["role"] = "officer") {
  return { role, ready, saw };
}

test("the top two Ready items; the first opens, the second folds", () => {
  const out = P.panelDesk(desk([item("a", { verb, primary: true }), item("b", { verb }), item("c"), item("d")]));
  assert.deepEqual(out.ready.map((r) => [r.item.id, r.open]), [["a", true], ["b", false]]);
  assert.equal(out.readyMore, 2);
  assert.equal(out.ready[0].item.primary, true, "the top item keeps the coral verb");
});

test("one coral at most: the second item never keeps primary, a verb-less top item never gets it", () => {
  const out = P.panelDesk(desk([item("a", { primary: true }), item("b", { verb, primary: true })]));
  assert.equal(out.ready[0].item.primary, undefined, "no verb, no coral");
  assert.equal(out.ready[1].item.primary, undefined);
  assert.equal(out.ready.filter((r) => r.item.primary).length, 0);
});

test("on /otto the page holds the coral: the panel's top item goes quiet", () => {
  const out = P.panelDesk(desk([item("a", { verb, primary: true })]), [], { coral: false });
  assert.equal(out.ready[0].item.primary, undefined);
  assert.equal(out.ready[0].open, true, "it still opens");
});

test("a reminder on top is a plain row, not an open card", () => {
  const out = P.panelDesk(desk([item("r", { kind: "reminder" }), item("b")]));
  assert.equal(out.ready[0].open, false);
  assert.equal(out.ready[1].open, false);
});

test("an empty desk shows nothing and counts nothing", () => {
  const out = P.panelDesk(desk([]));
  assert.deepEqual(out.ready, []);
  assert.equal(out.readyMore, 0);
  assert.deepEqual(out.saw, []);
  assert.equal(out.sawMore, 0);
});

test("a few Otto saw rows, with what's left counted", () => {
  const saw = ["1", "2", "3", "4", "5"].map((id) => item(id, { kind: "notification" }));
  const out = P.panelDesk(desk([], saw));
  assert.deepEqual(out.saw.map((s) => s.id), ["1", "2", "3"]);
  assert.equal(out.sawMore, 2);
});

test("failed reads: a student's Ready says part didn't load; Otto saw says it failed", () => {
  assert.equal(P.panelDesk(desk([], [], "student"), ["dms"]).readyPartial, true);
  assert.equal(P.panelDesk(desk([], [], "student"), ["asking"]).readyPartial, true);
  assert.equal(P.panelDesk(desk([], [], "officer"), ["dms"]).readyPartial, false, "a club desk doesn't hold DMs");
  assert.equal(P.panelDesk(desk([]), ["activity"]).sawFailed, true);
  assert.equal(P.panelDesk(desk([]), []).sawFailed, false);
});

test("the saved pick: the desk's own first, then the club switch, junk ignored", () => {
  assert.equal(P.panelClubParam("me", "chess"), "me");
  assert.equal(P.panelClubParam(" Canal.Run ", null), "canal.run");
  assert.equal(P.panelClubParam(null, "Chess"), "chess");
  assert.equal(P.panelClubParam("<script>", "chess"), "chess");
  assert.equal(P.panelClubParam("a/b", "x y"), null);
  assert.equal(P.panelClubParam(undefined, undefined), null);
  assert.equal(P.panelClubParam("x".repeat(65), null), null);
});

test("the links keep the club the panel shows", () => {
  const club = { orgId: "1", name: "Chess", handle: "chess", role: "owner" as const };
  assert.deepEqual(P.panelLinks({ actingAs: club, clubs: [club] }), { desk: "/otto?club=chess", stats: "/otto?tab=stats&club=chess" });
  assert.deepEqual(P.panelLinks({ actingAs: null, clubs: [club] }), { desk: "/otto?club=me", stats: "/otto?tab=stats&club=me" });
  assert.deepEqual(P.panelLinks({ actingAs: null, clubs: [] }), { desk: "/otto", stats: "/otto?tab=stats" });
  assert.deepEqual(P.panelLinks(null), { desk: "/otto", stats: "/otto?tab=stats" });
});

test("more line", () => {
  assert.equal(P.moreLine(1), "1 more on your desk");
  assert.equal(P.moreLine(1200), "1,200 more on your desk");
});

test("honesty: nothing the panel prints says Otto did, drafted or will send anything", () => {
  const files = [
    "./panel-desk.ts",
    "../../components/network/OttoSidePanel.tsx",
  ].map((f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""));
  for (const src of files) {
    const strings = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]);
    for (const s of strings) {
      assert.doesNotMatch(s, /\b(otto|i)\s+(did|sent|drafted|posted|will\s+(send|remind|post))\b/i, s);
      assert.doesNotMatch(s, /your agent|online|ask otto/i, s);
    }
  }
});

test("the panel never dims the page and never blurs behind its glass", () => {
  const tsx = readFileSync(new URL("../../components/network/OttoSidePanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../components/network/otto-panel.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(tsx, /backdropFilter|SynapseBackdrop|rgba\(20,20,22,0\.42\)/);
  assert.match(css, /\.otp-glass>\.tx-flute\{[^}]*backdrop-filter:none/);
  assert.doesNotMatch(css.replace(/backdrop-filter:none|-webkit-backdrop-filter:none/g, ""), /backdrop-filter/);
});
