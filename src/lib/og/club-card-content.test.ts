/**
 * Tests for `club-card-content.ts` (the club's link picture, Oct 23, 2026):
 * a hidden or missing club never gets its own picture or its name, a
 * visible club's page names no picture so the segment's own files are used,
 * and what the club card says.
 *
 * Run with:
 *   node --test src/lib/og/club-card-content.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./club-card-content.ts";
const mod = (await import(specifier)) as typeof import("./club-card-content");
const { BIO_MAX, SITE_PICTURE, bioFirstLine, clubCardContent, clubInitials, clubPageMetadata, nameSizeFor, withStop } =
  mod;

const visibleRow = {
  handle: "sixtyfour",
  name: "Sixty-Four Chess",
  description: "Weekly games in the Lantern Room. Beginners welcome.\nSecond line, never shown.",
  logo_url: null,
  backdrop_preset: "canal",
  hidden_at: null,
  campus_id: "indianapolis",
};

const metaRow = (over: Partial<{ name: string; description: string | null; is_public: boolean | null; hidden_at: string | null }> = {}) => ({
  name: "Secret Society",
  description: "We meet where nobody looks.",
  is_public: true,
  hidden_at: null,
  ...over,
});

test("a hidden club's metadata names the site picture on both cards and never the club", () => {
  const meta = clubPageMetadata(metaRow({ hidden_at: "2026-10-01T00:00:00Z" }));
  assert.equal(meta.title, "Vibe");
  assert.ok(meta.openGraph && "images" in meta.openGraph, "Open Graph must carry its own images key");
  assert.ok(meta.twitter && "images" in meta.twitter, "X must carry its own images key");
  const og = meta.openGraph as { images: { url: string }[] };
  const tw = meta.twitter as { images: { url: string }[] };
  assert.equal(og.images[0].url, SITE_PICTURE.url);
  assert.equal(tw.images[0].url, SITE_PICTURE.url);
  const text = JSON.stringify(meta);
  assert.ok(!text.includes("Secret Society"), "the name leaked");
  assert.ok(!text.includes("nobody looks"), "the bio leaked");
  assert.ok(!text.includes("/orgs/"), "a club picture address leaked");
});

test("a missing club gets the same plain preview, titled Not found", () => {
  const meta = clubPageMetadata(null);
  assert.equal(meta.title, "Not found · Vibe");
  const hidden = clubPageMetadata(metaRow({ hidden_at: "2026-10-01T00:00:00Z" }));
  assert.deepEqual(meta.openGraph, hidden.openGraph);
  assert.deepEqual(meta.twitter, hidden.twitter);
});

test("a visible club names no picture, so the segment's own files fill both cards", () => {
  const meta = clubPageMetadata(metaRow());
  assert.equal(meta.title, "Secret Society · Vibe");
  assert.equal(meta.openGraph.title, "Secret Society");
  assert.equal(Object.prototype.hasOwnProperty.call(meta.openGraph, "images"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(meta.twitter, "images"), false);
  assert.equal(meta.twitter.card, "summary_large_image");
});

test("a visible club's description: its bio, else the old fallbacks", () => {
  // Only the visible club's answer has a top-level description.
  const desc = (over: Parameters<typeof metaRow>[0] = {}) =>
    (clubPageMetadata(metaRow(over)) as { description?: string }).description;
  assert.equal(desc(), "We meet where nobody looks.");
  assert.equal(desc({ description: null }), "An org on Vibe.");
  assert.equal(desc({ description: "", is_public: false }), "A private org on Vibe.");
  assert.equal(desc({ description: "x".repeat(300) })?.length, 200);
});

test("the card: nothing for a hidden or missing club", () => {
  assert.equal(clubCardContent(null, "Indianapolis"), null);
  assert.equal(clubCardContent({ ...visibleRow, hidden_at: "2026-10-01T00:00:00Z" }, "Indianapolis"), null);
  assert.equal(clubCardContent({ ...visibleRow, name: "   " }, "Indianapolis"), null);
});

test("the card: a visible club's words", () => {
  const card = clubCardContent(visibleRow, "Indianapolis");
  assert.ok(card);
  assert.equal(card.name, "Sixty-Four Chess.");
  assert.equal(card.handle, "sixtyfour");
  assert.equal(card.eyebrow, "INDIANAPOLIS · CLUB");
  assert.equal(card.bio, "Weekly games in the Lantern Room. Beginners welcome.");
  assert.equal(card.initials, "SC");
  assert.equal(card.backdropKey, "canal");
  assert.equal(card.logo, null);
  assert.equal(clubCardContent(visibleRow, null)?.eyebrow, "CLUB");
});

test("the card carries no counts and no people", () => {
  const card = clubCardContent(visibleRow, "Indianapolis");
  assert.deepEqual(Object.keys(card ?? {}).sort(), [
    "backdropKey",
    "bio",
    "eyebrow",
    "handle",
    "initials",
    "logo",
    "name",
    "nameSize",
  ]);
});

test("the full stop: added once, never doubled", () => {
  assert.equal(withStop("Sixty-Four Chess"), "Sixty-Four Chess.");
  assert.equal(withStop("Vibe Inc."), "Vibe Inc.");
  assert.equal(withStop("Go Team!"), "Go Team!");
  assert.equal(withStop("  Padded  "), "Padded.");
});

test("initials: the first letters of the first two words", () => {
  assert.equal(clubInitials("Sixty-Four Chess"), "SC");
  assert.equal(clubInitials("sae"), "S");
  assert.equal(clubInitials("Alpha Beta Gamma"), "AB");
});

test("the bio's first line: the first with text, folded, cut at a word", () => {
  assert.equal(bioFirstLine(null), null);
  assert.equal(bioFirstLine("   \n\n  "), null);
  assert.equal(bioFirstLine("\n  Hello   there \nmore"), "Hello there");
  const long = "word ".repeat(60).trim();
  const cut = bioFirstLine(long);
  assert.ok(cut && cut.endsWith("…"));
  assert.ok(cut && Array.from(cut).length <= BIO_MAX + 1);
  assert.ok(cut && !cut.includes(" …"), "no space before the ellipsis");
});

test("the name's size steps down as it grows", () => {
  assert.equal(nameSizeFor("SAE."), 96);
  assert.ok(nameSizeFor("Sixty-Four Chess Society.") < 96);
  assert.ok(nameSizeFor("x".repeat(51)) <= nameSizeFor("x".repeat(30)));
  assert.equal(nameSizeFor("x".repeat(51)), 58);
});
