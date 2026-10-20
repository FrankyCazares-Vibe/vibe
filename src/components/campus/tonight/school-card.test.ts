/**
 * The crash guard (Oct 19, 2026). Before it, a school calendar the page
 * didn't know (Bloomington's "iub-*" names, or any later one) made
 * SchoolEventCard's colour switch return nothing, and reading `.glow` off
 * that crashed the whole Events tab. Three locks:
 *   1. the card itself renders for a calendar name it has never heard of;
 *   2. the card sits inside its own QuietBoundary, so a card that does fail
 *      takes only itself down (React boundaries don't run in a server
 *      render, so the boundary is checked as a class and on the card's
 *      element tree: everything that reads the row is inside it);
 *   3. useSchoolEvents drops a row whose calendar isn't in the same answer.
 *
 * Run with:
 *   node --test src/components/campus/tonight/school-card.test.ts
 *
 * WHY THE LOAD HOOK: Node strips types from .ts files but can't read JSX, so
 * the .tsx files here go through TypeScript's own transpileModule (no type
 * check, just the JSX), CSS imports load as empty modules, and the request
 * helper (which pulls in the native bridge) is a stand-in.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

type NextResolve = (specifier: string, context?: unknown) => { url: string };
type NextLoad = (url: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
    load: (url: string, context: unknown, nextLoad: NextLoad) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("school-card.test.ts needs Node >= 22.15 (module.registerHooks)");

const SRC_ROOT = new URL("../../../", import.meta.url);
const EMPTY = "data:text/javascript,export%20default%20%7B%7D%3B";
const REQUEST_STAND_IN = `data:text/javascript,${encodeURIComponent("export async function vibeRequest() { return { ok: false }; }")}`;

/** "x" → the first of x.ts, x.tsx that exists (Next and tsc write imports without the extension). */
function withExtension(base: URL): string | null {
  for (const ext of [".ts", ".tsx"]) {
    const url = new URL(`${base.href}${ext}`);
    if (existsSync(fileURLToPath(url))) return url.href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css")) return { url: EMPTY, shortCircuit: true };
    if (specifier === "@/lib/feedback/request") return { url: REQUEST_STAND_IN, shortCircuit: true };
    const parent = (context as { parentURL?: string }).parentURL;
    if (specifier.startsWith("@/")) {
      const url = withExtension(new URL(specifier.slice(2), SRC_ROOT));
      if (url) return { url, shortCircuit: true };
    } else if (specifier.startsWith(".") && parent && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const url = withExtension(new URL(specifier, parent));
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.endsWith(".tsx")) return nextLoad(url, context);
    const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: outputText, shortCircuit: true };
  },
});

const { SchoolEventCard } = await import("./SchoolEventCard");
const { QuietBoundary } = await import("./QuietBoundary");
const { requestUrl, schoolStateFromAnswer } = await import("./use-school-events");

/** A row; `source` may be any string, since a newer server can send a name this page doesn't know. */
function ev(over: Omit<Partial<SchoolEvent>, "source"> & { source: string }): SchoolEvent {
  return {
    id: "iub-athletics:vcal_28657",
    kind: "game",
    title: "IU vs Purdue",
    matchup: { home: "IU", away: "Purdue" },
    sport: "Women's soccer",
    promo: null,
    starts_at: "2026-10-22T23:00:00.000Z",
    ends_at: "2026-10-23T01:00:00.000Z",
    location: "Jerry Yeagley Field at Bill Armstrong Stadium",
    host: "Athletics",
    url: "https://iuhoosiers.com/calendar.aspx?game_id=28657",
    tickets_url: null,
    watch_url: null,
    featured: false,
    ...over,
  } as SchoolEvent;
}

const IUB_ATHLETICS: SchoolSource = {
  key: "iub-athletics",
  host: "Athletics",
  credit: "From the IU Athletics calendar",
  calendar_url: "https://iuhoosiers.com/calendar.aspx",
  role: "athletics",
  label: "IU Athletics",
};

test("a card renders for Bloomington's calendars and for a name it has never heard of", () => {
  const known = renderToString(createElement(SchoolEventCard, { ev: ev({ source: "iub-athletics" }), source: IUB_ATHLETICS }));
  // The space after "vs" is a no-break one (TonightBits glues "vs" to the opponent).
  assert.match(known, /IU<!-- --> <span class="tonight-vs">vs<\/span>\u00a0<!-- -->Purdue/);
  assert.match(known, /From the IU Athletics calendar/);
  assert.match(known, /border-left:3px solid #990000/);
  // A calendar from a newer server than this page: IU crimson, never a crash.
  const unknown = renderToString(
    createElement(SchoolEventCard, { ev: ev({ source: "purdue-wl-athletics", title: "Purdue vs IU", matchup: null }), source: null }),
  );
  assert.match(unknown, /Purdue vs IU/);
  assert.match(unknown, /border-left:3px solid #990000/);
  // Indy's names still draw the same.
  assert.match(renderToString(createElement(SchoolEventCard, { ev: ev({ source: "iu-featured", kind: "event", matchup: null }), source: null })), /#990000/);
});

test("the card's boundary: once a child has thrown, it renders nothing", () => {
  assert.deepEqual(QuietBoundary.getDerivedStateFromError(), { failed: true });
  const boundary = new QuietBoundary({ name: "school-card", children: "card" });
  assert.equal(boundary.render(), "card");
  boundary.state = { failed: true };
  assert.equal(boundary.render(), null);
});

test("everything that reads the row sits inside the boundary (checked on the real element tree)", () => {
  // Why this shape (Oct 19, 2026): React boundaries don't run in a server
  // render and the repo has no DOM to render into, so the test pins WHERE
  // the boundary is. A row that throws on any read (a shape this page
  // doesn't know) must not throw in the exported card itself: only in its
  // child, which the boundary catches. Moving the boundary inside the body,
  // or swapping it for a fragment, fails here.
  const poisoned = new Proxy({} as SchoolEvent, {
    get() {
      throw new Error("a row this page can't read");
    },
  });
  const props = { ev: poisoned, source: null };
  const el = SchoolEventCard(props) as unknown as {
    type: unknown;
    props: { name: string; children: { type: unknown; props: unknown } };
  };
  assert.equal(el.type, QuietBoundary, "the card's outermost element is the boundary");
  assert.equal(el.props.name, "school-card");
  const body = el.props.children;
  assert.equal(typeof body.type, "function");
  assert.deepEqual(body.props, props, "the body gets the card's props as they are");
  // The body is where the row is read: alone, outside any boundary, it throws.
  assert.throws(() => renderToString(createElement(body.type as never, body.props as never)), /can't read/);
});

test("useSchoolEvents drops a row whose calendar isn't in the same answer", () => {
  const known = ev({ id: "iub-athletics:1", source: "iub-athletics" });
  const stray = ev({ id: "purdue:1", source: "purdue-wl-athletics" });
  const state = schoolStateFromAnswer({ ok: true, school_on: true, campus_id: "iu-bloomington", events: [known, stray], sources: [IUB_ATHLETICS] });
  assert.deepEqual(state?.events.map((e) => e.id), ["iub-athletics:1"]);
  assert.equal(state?.on, true);
  // Off, or no calendar listed: the school part is off.
  assert.equal(schoolStateFromAnswer({ ok: true, school_on: false, campus_id: "iu-kokomo", events: [], sources: [] })?.on, false);
  assert.equal(schoolStateFromAnswer({ ok: true, school_on: true, campus_id: "iu-bloomington", events: [known], sources: [] })?.on, false);
  // Not an answer at all.
  assert.equal(schoolStateFromAnswer(null), null);
  assert.equal(schoolStateFromAnswer({ ok: true } as never), null);
});

test("every read says `cards=any`, so the server may send calendars an older page couldn't draw", () => {
  // Oct 19, 2026: a tab from before the Bloomington deploy never sends it,
  // and route.ts then sends only Indy's three calendars (OLD_PAGE_KEYS).
  assert.equal(requestUrl("/api/school-events", null), "/api/school-events?cards=any");
  assert.equal(requestUrl("/api/school-events?campus=iu-bloomington", null), "/api/school-events?campus=iu-bloomington&cards=any");
  const fake = Date.parse("2026-10-23T17:00:00Z");
  assert.equal(
    requestUrl("/api/school-events?campus=iu-bloomington", fake),
    "/api/school-events?campus=iu-bloomington&cards=any&now=2026-10-23T17%3A00%3A00.000Z",
  );
});
