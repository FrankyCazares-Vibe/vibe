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
const demoMedia = (await import(specifier)) as typeof import("./demo-media");
const { demoMediaBase, DEMO_FILM_FILES } = demoMedia;

test("unset: no film, in every environment (since Nov 22, 2026)", () => {
  assert.equal(demoMediaBase(undefined), null);
  assert.equal(demoMediaBase(""), null);
  assert.equal(demoMediaBase("   "), null);
  // The old film's store is no longer named in the code at all.
  assert.equal("DEFAULT_DEMO_MEDIA_BASE" in demoMedia, false);
});

test("a film folder, if one is set, yields the files' full addresses", () => {
  const folder = demoMediaBase("https://abc123.public.blob.vercel-storage.com/landing");
  assert.equal(new URL(DEMO_FILM_FILES.large, folder ?? undefined).href, "https://abc123.public.blob.vercel-storage.com/landing/vibe-demo-780.mp4");
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
