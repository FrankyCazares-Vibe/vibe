/**
 * Tests for `look-section.ts` (Edit page's Look section and Name field;
 * Oct 22, 2026): which swatch is on when the page opens, the names, the
 * arrow keys, the footer's line, and what Save sends. Read against the one
 * list of backgrounds (src/lib/orgs/backdrops.ts).
 *
 * Run with:
 *   node --test "src/app/orgs/[handle]/club-page/look-section.test.ts"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./look-section.ts";
const look = (await import(specifier)) as typeof import("./look-section");
const listSpecifier = "../../../../lib/orgs/backdrops.ts";
const list = (await import(listSpecifier)) as typeof import("../../../../lib/orgs/backdrops");

const { backdropName, editPageBody, lookStatus, nameProblem, openingBackdrop, radioStep } = look;
const { DEFAULT_BACKDROP, backdropFor, pickerBackdrops, storableBackdropKeys } = list;

const opening = (stored: string, live = false) =>
  openingBackdrop(stored, pickerBackdrops(live), backdropFor(stored).key);

test("the stored background is on when it is offered", () => {
  assert.equal(opening("ember"), "ember");
  assert.equal(opening("midnight"), "midnight");
  assert.equal(opening("sand-purple"), "sand-purple");
});

test("cream and unknown keys open on the default, the one the page paints", () => {
  assert.equal(opening("cream"), DEFAULT_BACKDROP);
  assert.equal(opening("plaid"), DEFAULT_BACKDROP);
  assert.equal(opening(""), DEFAULT_BACKDROP);
});

test("a new key the picker doesn't offer yet opens on itself, with no swatch on", () => {
  assert.equal(opening("rose", false), "rose");
  assert.ok(!pickerBackdrops(false).some((b) => b.key === "rose"));
  assert.equal(opening("rose", true), "rose");
});

test("names: Dusk is the default, said out loud with it; the rest are their label", () => {
  assert.deepEqual(backdropName(backdropFor("sand-purple"), DEFAULT_BACKDROP), {
    name: "Dusk",
    tag: "the default",
    spoken: "Dusk, the default",
  });
  assert.deepEqual(backdropName(backdropFor("deep-violet"), DEFAULT_BACKDROP), {
    name: "Violet",
    tag: null,
    spoken: "Violet",
  });
  // Every offered swatch has a name of its own (never colour alone).
  for (const b of pickerBackdrops(true)) assert.ok(backdropName(b, DEFAULT_BACKDROP).spoken.length > 2);
});

test("arrow keys wrap both ways; Home and End jump; other keys pass through", () => {
  assert.equal(radioStep("ArrowRight", 0, 5), 1);
  assert.equal(radioStep("ArrowDown", 4, 5), 0);
  assert.equal(radioStep("ArrowLeft", 0, 5), 4);
  assert.equal(radioStep("ArrowUp", 3, 5), 2);
  assert.equal(radioStep("Home", 3, 10), 0);
  assert.equal(radioStep("End", 3, 10), 9);
  assert.equal(radioStep("Tab", 3, 10), null);
  assert.equal(radioStep("a", 3, 10), null);
  assert.equal(radioStep("ArrowRight", 0, 0), null);
});

test("with none on, Right starts at the first and Left at the last", () => {
  assert.equal(radioStep("ArrowRight", -1, 5), 0);
  assert.equal(radioStep("ArrowLeft", -1, 5), 4);
});

test("the name: 2 to 50 characters once trimmed, as the route counts", () => {
  assert.equal(nameProblem("Sixty-Four Chess"), null);
  assert.equal(nameProblem("  AB  "), null);
  assert.match(nameProblem(" A ") ?? "", /2 characters/);
  assert.match(nameProblem("") ?? "", /2 characters/);
  assert.equal(nameProblem("x".repeat(50)), null);
  assert.match(nameProblem("x".repeat(51)) ?? "", /50 characters/);
});

test("the footer's line follows the board's words", () => {
  assert.equal(lookStatus({ from: null, to: null, otherChanges: false }), "No changes yet");
  assert.equal(
    lookStatus({ from: "Dusk", to: "Onyx", otherChanges: false }),
    "Background: Dusk to Onyx. Not saved yet.",
  );
  assert.equal(
    lookStatus({ from: "Dusk", to: "Onyx", otherChanges: true }),
    "Background: Dusk to Onyx, and more. Not saved yet.",
  );
  assert.equal(lookStatus({ from: null, to: null, otherChanges: true }), "Changes not saved yet.");
  assert.equal(lookStatus({ from: "Dusk", to: "Dusk", otherChanges: false }), "No changes yet");
});

const base = {
  hidden: false,
  name: "Sixty-Four Chess",
  initialName: "Sixty-Four Chess",
  backdrop: "ember",
  openingBackdrop: "ember",
  description: " Casual and rated chess. ",
  philanthropy: "",
  links: [
    { label: " Instagram ", url: " https://instagram.com/x " },
    { label: "", url: "https://half.example" },
  ],
  joinPolicy: "request" as const,
  initialJoinPolicy: "request" as const,
  audience: "both" as const,
  initialAudience: "both" as const,
  meetingTime: { value: "Thursdays · 7 PM", initial: "Thursdays · 7 PM" },
};

test("an untouched Save sends exactly what it always did: description, philanthropy, links", () => {
  assert.deepEqual(editPageBody(base), {
    description: "Casual and rated chess.",
    philanthropy: "",
    links: [{ label: "Instagram", url: "https://instagram.com/x" }],
  });
});

test("the name goes only when it changed, trimmed; spaces alone are no change", () => {
  assert.equal(editPageBody({ ...base, name: " Sixty-Four Chess  " }).name, undefined);
  assert.equal(editPageBody({ ...base, name: "  64 Chess " }).name, "64 Chess");
});

test("the background goes only when another swatch was picked", () => {
  assert.equal(editPageBody(base).backdrop_preset, undefined);
  assert.equal(editPageBody({ ...base, backdrop: "forest" }).backdrop_preset, "forest");
  // A club on cream opens on Dusk; leaving Dusk on keeps cream stored.
  assert.equal(editPageBody({ ...base, backdrop: "sand-purple", openingBackdrop: "sand-purple" }).backdrop_preset, undefined);
});

test("join fields go only when changed, and never on a hidden club", () => {
  const changed = { ...base, joinPolicy: "open" as const, audience: "iu" as const };
  assert.equal(editPageBody(changed).join_policy, "open");
  assert.equal(editPageBody(changed).audience, "iu");
  const hidden = editPageBody({ ...changed, hidden: true, name: "New name", backdrop: "midnight" });
  assert.equal(hidden.join_policy, undefined);
  assert.equal(hidden.audience, undefined);
  // A hidden club still renames and repaints its own page.
  assert.equal(hidden.name, "New name");
  assert.equal(hidden.backdrop_preset, "midnight");
});

test("when you meet goes only when changed, and never without the column", () => {
  assert.equal(editPageBody(base).meeting_time, undefined);
  assert.equal(
    editPageBody({ ...base, meetingTime: { value: "Fridays", initial: "Thursdays · 7 PM" } }).meeting_time,
    "Fridays",
  );
  assert.ok(!("meeting_time" in editPageBody({ ...base, meetingTime: null })));
});

test("Save can only send a background the database holds today (Oct 22, 2026, review)", () => {
  // Every swatch the picker offers in this build, picked and saved, is a key
  // the CHECK accepts now: the five new ones wait for migration 20261026100000.
  const storable = new Set(storableBackdropKeys());
  for (const b of pickerBackdrops()) {
    const sent = editPageBody({ ...base, backdrop: b.key, openingBackdrop: "ember" }).backdrop_preset;
    if (b.key === "ember") assert.equal(sent, undefined);
    else assert.ok(storable.has(sent as never), `${String(sent)} would be refused before the migration`);
  }
  // And with the picker as it stands (the flag off), none of the five is offered.
  for (const key of ["rose", "cardinal", "lantern", "canal", "onyx"]) {
    assert.ok(!pickerBackdrops(false).some((b) => b.key === key), key);
  }
});
