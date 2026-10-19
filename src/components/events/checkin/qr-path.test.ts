/**
 * Tests for `qr-path.ts`, the door screen's QR (contract §6, `qr-path.test.ts`):
 * a real door link encodes to a square matrix with its three finder corners
 * dark, and the path draws exactly one square per dark module, so what the
 * camera sees is exactly what `uqr` encoded.
 *
 * Run with:
 *   node --test src/components/events/checkin/qr-path.test.ts
 *
 * WHY THE RESOLVE HOOK: as in `tonight-view.test.ts`, Node's type stripping
 * doesn't resolve the "@/…" alias or add file extensions.
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
  throw new Error("qr-path.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
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

const { encode } = await import("uqr");
const { QR_OPTIONS, qrPathFromMatrix, qrSvgFor } = await import("./qr-path");
const { checkinLink, CHECKIN_TOKEN_LENGTH } = await import("@/lib/events/event-checkin");

const EVENT_ID = "3f1c2b9e-5a7d-4c1e-9b2a-1d2e3f4a5b6c";
const TOKEN = "UVxxReBJ3ewsgZRtrv3ISQ";
const LINK = checkinLink("https://www.connectvibe.app", EVENT_ID, TOKEN);

const darkCount = (data: boolean[][]) => data.reduce((n, row) => n + row.filter(Boolean).length, 0);
const moveCount = (path: string) => (path.match(/M/g) ?? []).length;

test("the sample token has the real token's length", () => {
  assert.equal(TOKEN.length, CHECKIN_TOKEN_LENGTH);
});

test("the door options are ECC M with a 4-module quiet zone", () => {
  assert.deepEqual({ ...QR_OPTIONS }, { ecc: "M", border: 4 });
});

test("a real door link encodes to a square matrix", () => {
  const qr = encode(LINK, { ecc: "M", border: 4 });
  const n = qr.size;
  assert.equal(qr.data.length, n);
  for (const row of qr.data) assert.equal(row.length, n);
  // A bigger version means smaller modules on the same tile: a longer link
  // would make the code harder to read across a room. Version 10 is 57 + 8.
  assert.ok(qr.version <= 10, `version ${qr.version}: the link got long`);
});

test("the finder corners are dark and the quiet zone is white", () => {
  const qr = encode(LINK, { ecc: "M", border: 4 });
  const n = qr.size;
  assert.equal(qr.data[4]?.[4], true, "top-left finder");
  assert.equal(qr.data[4]?.[n - 5], true, "top-right finder");
  assert.equal(qr.data[n - 5]?.[4], true, "bottom-left finder");
  for (let i = 0; i < n; i += 1) {
    for (const [y, x] of [[0, i], [3, i], [i, 0], [i, 3], [n - 1, i], [i, n - 1]] as const) {
      assert.equal(qr.data[y]?.[x], false, `quiet zone at [${y}][${x}]`);
    }
  }
});

test("the path has one square per dark module", () => {
  const qr = encode(LINK, { ecc: "M", border: 4 });
  const path = qrPathFromMatrix(qr);
  assert.ok(darkCount(qr.data) > 0);
  assert.equal(moveCount(path), darkCount(qr.data));
  assert.match(path, /^(M\d+ \d+h1v1h-1z)+$/);
});

test("each square sits on its own module", () => {
  const path = qrPathFromMatrix({ size: 2, data: [[true, false], [false, true]] });
  assert.equal(path, "M0 0h1v1h-1zM1 1h1v1h-1z");
  assert.equal(qrPathFromMatrix({ size: 1, data: [[false]] }), "");
});

test("qrSvgFor matches encode with the door's options", () => {
  const qr = encode(LINK, { ecc: "M", border: 4 });
  const svg = qrSvgFor(LINK);
  assert.equal(svg.size, qr.size);
  assert.equal(svg.path, qrPathFromMatrix(qr));
});
