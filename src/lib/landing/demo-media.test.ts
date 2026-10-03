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
const { demoMediaBase, DEFAULT_DEMO_MEDIA_BASE, DEMO_FILM_FILES } = (await import(specifier)) as typeof import("./demo-media");

test("unset: the Vercel Blob store, in every environment", () => {
  assert.equal(DEFAULT_DEMO_MEDIA_BASE, "https://npzptkkzqxthhsnu.public.blob.vercel-storage.com/");
  assert.equal(demoMediaBase(undefined), DEFAULT_DEMO_MEDIA_BASE);
  assert.equal(demoMediaBase(""), DEFAULT_DEMO_MEDIA_BASE);
  assert.equal(demoMediaBase("   "), DEFAULT_DEMO_MEDIA_BASE);
});

test("the default passes the same checks as a value would", () => {
  assert.equal(demoMediaBase(DEFAULT_DEMO_MEDIA_BASE), DEFAULT_DEMO_MEDIA_BASE);
  assert.equal(new URL(DEMO_FILM_FILES.large, DEFAULT_DEMO_MEDIA_BASE).href, "https://npzptkkzqxthhsnu.public.blob.vercel-storage.com/vibe-demo-780.mp4");
});

test("the local copy: set it to /landing-media/", () => {
  assert.equal(demoMediaBase("/landing-media/"), "/landing-media/");
  assert.equal(demoMediaBase("/landing-media"), "/landing-media/");
});

test("an https folder is used, with exactly one trailing slash", () => {
  const blob = "https://abc123.public.blob.vercel-storage.com/landing";
  assert.equal(demoMediaBase(blob), `${blob}/`);
  assert.equal(demoMediaBase(`  ${blob}/  `), `${blob}/`);
});

test("a path on this site is used as is", () => {
  assert.equal(demoMediaBase("/media/film/"), "/media/film/");
});

test("anything else means no film, never a guess (\"off\" switches it off)", () => {
  assert.equal(demoMediaBase("off"), null);
  assert.equal(demoMediaBase("http://example.com/landing/"), null);
  assert.equal(demoMediaBase("//example.com/landing/"), null);
  // A browser reads "/\" as "//": another host.
  assert.equal(demoMediaBase("/\\example.com/landing/"), null);
  assert.equal(demoMediaBase("/landing\\media/"), null);
  assert.equal(demoMediaBase("https://example.com\\@evil.com/"), null);
  assert.equal(demoMediaBase("landing-media"), null);
  assert.equal(demoMediaBase("javascript:alert(1)"), null);
  assert.equal(demoMediaBase("https://example.com/landing/?token=1"), null);
  assert.equal(demoMediaBase("NEXT_PUBLIC_DEMO_MEDIA_BASE"), null);
});

test("the two encodes keep the names the hosting step uploads", () => {
  assert.deepEqual(DEMO_FILM_FILES, { large: "vibe-demo-780.mp4", small: "vibe-demo-390.mp4" });
});
