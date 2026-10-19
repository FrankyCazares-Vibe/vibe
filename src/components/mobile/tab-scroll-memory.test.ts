/**
 * Tests for `tab-scroll-memory.ts`: what a phone page remembers about where
 * each of its tabs was read to (Oct 18, 2026).
 *
 * The resolve hook is the same as in `mobile-tab-active.test.ts`.
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/mobile/tab-scroll-memory.test.ts
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
  throw new Error("tab-scroll-memory.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { parseScrollMemory, scrollMemoryKey } = await import("./tab-scroll-memory");

test("a saved map comes back as it was, rounded", () => {
  assert.deepEqual(parseScrollMemory('{"feed":3012.6,"orgs":0}'), { feed: 3013, orgs: 0 });
});

test("nothing, junk, or a wrong shape is no memory", () => {
  for (const raw of [null, "", "not json", "[1,2]", "null", "7"]) {
    assert.deepEqual(parseScrollMemory(raw), {}, String(raw));
  }
});

test("bad numbers are dropped, good ones kept", () => {
  assert.deepEqual(
    parseScrollMemory('{"feed":-5,"events":"200","orgs":120,"map":null}'),
    { orgs: 120 },
  );
});

test("each page has its own key", () => {
  assert.notEqual(scrollMemoryKey("/campus"), scrollMemoryKey("/network"));
});
