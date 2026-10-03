/**
 * Tests for `demo-media.ts`: where the landing's demo film is read from.
 *
 * Run with:
 *   node --test src/lib/landing/demo-media.test.ts
 *
 * Node's type stripping needs the ".ts" on disk and tsc refuses a literal
 * ".ts" import (TS5097), hence the variable specifier.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./demo-media.ts";
const { demoMediaBase, DEMO_FILM_FILES } = (await import(specifier)) as typeof import("./demo-media");

test("unset: the local copy under next dev, no film in a production build", () => {
  assert.equal(demoMediaBase(undefined, "development"), "/landing-media/");
  assert.equal(demoMediaBase("   ", "test"), "/landing-media/");
  assert.equal(demoMediaBase(undefined, "production"), null);
  assert.equal(demoMediaBase("", "production"), null);
});

test("an https folder is used, with exactly one trailing slash", () => {
  const blob = "https://abc123.public.blob.vercel-storage.com/landing";
  assert.equal(demoMediaBase(blob, "production"), `${blob}/`);
  assert.equal(demoMediaBase(`  ${blob}/  `, "production"), `${blob}/`);
});

test("a path on this site is used as is", () => {
  assert.equal(demoMediaBase("/landing-media", "production"), "/landing-media/");
  assert.equal(demoMediaBase("/media/film/", "development"), "/media/film/");
});

test("anything else means no film, never a guess", () => {
  assert.equal(demoMediaBase("http://example.com/landing/", "production"), null);
  assert.equal(demoMediaBase("//example.com/landing/", "production"), null);
  // A browser reads "/\" as "//": another host.
  assert.equal(demoMediaBase("/\\example.com/landing/", "production"), null);
  assert.equal(demoMediaBase("/landing\\media/", "development"), null);
  assert.equal(demoMediaBase("https://example.com\\@evil.com/", "production"), null);
  assert.equal(demoMediaBase("landing-media", "production"), null);
  assert.equal(demoMediaBase("javascript:alert(1)", "production"), null);
  assert.equal(demoMediaBase("https://example.com/landing/?token=1", "production"), null);
  assert.equal(demoMediaBase("NEXT_PUBLIC_DEMO_MEDIA_BASE", "development"), null);
});

test("the two encodes keep the names the hosting step uploads", () => {
  assert.deepEqual(DEMO_FILM_FILES, { large: "vibe-demo-780.mp4", small: "vibe-demo-390.mp4" });
});
