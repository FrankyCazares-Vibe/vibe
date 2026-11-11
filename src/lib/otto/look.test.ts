/**
 * Otto's look (look.ts, Nov 10, 2026): the ten colourways stay in step with
 * the ten club backdrops, the default is Ember and Living, and anything the
 * device or the account hands back is read safely.
 *
 * Run with:
 *   node --test src/lib/otto/look.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// URL imports, so node loads the .ts files without a resolve hook.
const L = (await import(new URL("./look.ts", import.meta.url).href)) as typeof import("./look");
const { BACKDROPS } = (await import(new URL("../orgs/backdrops.ts", import.meta.url).href)) as typeof import(
  "../orgs/backdrops"
);

test("the ten colourways are the ten club backdrops, in picker order", () => {
  // "sand-purple" shows as Dusk and "deep-violet" as Violet: the labels are the names.
  assert.deepEqual(
    [...L.OTTO_COLOURS],
    BACKDROPS.map((b) => b.label.toLowerCase()),
  );
  assert.equal(L.OTTO_COLOURS.length, 10);
});

test("every colourway has a skin in the kit CSS", () => {
  const css = readFileSync(new URL("../../components/otto/kit/planet.css", import.meta.url), "utf8");
  for (const c of L.OTTO_COLOURS) {
    assert.match(css, new RegExp(`\\.sk-${c}\\{--m-a:#[0-9A-F]{6};`), `sk-${c}`);
  }
});

test("the default is Ember and Living, and it can't be changed by a caller", () => {
  assert.deepEqual({ ...L.DEFAULT_LOOK }, { colour: "ember", motion: "living" });
  assert.ok(Object.isFrozen(L.DEFAULT_LOOK));
  assert.equal(L.LOOK_STORAGE_KEY, "vibe_otto_look");
  assert.equal(L.LOOK_EVENT, "vibe:otto-look");
});

test("parseLook keeps a good look and reads anything else as the default, field by field", () => {
  assert.deepEqual(L.parseLook({ colour: "canal", motion: "still" }), { colour: "canal", motion: "still" });
  assert.deepEqual(L.parseLook('{"colour":"onyx","motion":"living"}'), { colour: "onyx", motion: "living" });
  assert.deepEqual(L.parseLook({ colour: "canal" }), { colour: "canal", motion: "living" });
  assert.deepEqual(L.parseLook({ colour: "pink", motion: "still" }), { colour: "ember", motion: "still" });
  assert.deepEqual(L.parseLook({ colour: "Canal", motion: "STILL" }), { colour: "ember", motion: "living" });
  for (const junk of [undefined, null, 7, "", "not json", "[]", [], true, { colour: 3 }]) {
    assert.deepEqual(L.parseLook(junk), { colour: "ember", motion: "living" }, String(junk));
  }
  // Extra keys never ride along.
  assert.deepEqual(Object.keys(L.parseLook({ colour: "rose", motion: "still", x: 1 })).sort(), ["colour", "motion"]);
  // A fresh object every time, never the frozen default.
  assert.notEqual(L.parseLook(null), L.DEFAULT_LOOK);
});

test("lookClasses names the colourway's skin, and an unknown colour falls back to Ember", () => {
  assert.deepEqual(L.lookClasses({ colour: "forest", motion: "still" }), { planet: "sk-forest" });
  assert.deepEqual(L.lookClasses(L.DEFAULT_LOOK), { planet: "sk-ember" });
  assert.deepEqual(L.lookClasses({ colour: "pink" as never, motion: "living" }), { planet: "sk-ember" });
});

test("look.ts stays pure: no React, Next or alias imports", () => {
  const src = readFileSync(new URL("./look.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import\s/m);
  assert.doesNotMatch(src, /from\s+["'](react|next|@\/)/);
});
