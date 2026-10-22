/**
 * Tests for `members-only.ts` (Oct 22, 2026, PLAN-2.md batch E2): how a
 * payload's `visibility` is read (missing = everyone), the form's one line,
 * and the share sheet's Board rule. Plus a few checks on the surfaces'
 * source, so the chip, the form's choice and the body it sends can't
 * quietly drop out of one of them.
 *
 * Run with:
 *   node --test src/components/events/members-only.test.ts
 *
 * The module imports nothing, so no resolve hook is needed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// A variable specifier: TypeScript refuses a literal `.ts` import without
// `allowImportingTsExtensions`, while Node needs the extension to load it.
const specifier = "./members-only.ts";
const m = (await import(specifier)) as typeof import("./members-only");

const SRC = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, SRC), "utf8");

test("eventVisibility: only an exact \"members\" is members-only; anything else is everyone", () => {
  assert.equal(m.eventVisibility({ visibility: "members" }), "members");
  assert.equal(m.eventVisibility({ visibility: "everyone" }), "everyone");
  // A payload from before the field, a cached tab, a fixture.
  assert.equal(m.eventVisibility({}), "everyone");
  assert.equal(m.eventVisibility({ visibility: undefined }), "everyone");
  assert.equal(m.eventVisibility({ visibility: null }), "everyone");
  assert.equal(m.eventVisibility({ visibility: "Members" }), "everyone");
  assert.equal(m.eventVisibility({ visibility: true }), "everyone");
  assert.equal(m.eventVisibility(null), "everyone");
  assert.equal(m.eventVisibility(undefined), "everyone");
  assert.equal(m.isMembersOnly({ visibility: "members" }), true);
  assert.equal(m.isMembersOnly({ id: "e1" }), false);
});

test("the choices: Everyone first (the default), then Members only", () => {
  assert.deepEqual([...m.EVENT_VISIBILITIES], ["everyone", "members"]);
  assert.equal(m.MEMBERS_ONLY_COPY.question, "Who can see it");
  assert.equal(m.MEMBERS_ONLY_COPY.everyone, "Everyone");
  assert.equal(m.MEMBERS_ONLY_COPY.members, "Members only");
  assert.equal(m.MEMBERS_ONLY_COPY.chip, "Members only");
});

test("visibilityHint: names the club; says the RSVPs come off only on a flip", () => {
  assert.equal(m.visibilityHint("Sigma Alpha Epsilon", false), "Members only: only members of Sigma Alpha Epsilon see it.");
  assert.equal(m.visibilityHint("  Climbing Club ", false), "Members only: only members of Climbing Club see it.");
  assert.equal(m.visibilityHint(undefined, false), "Members only: only members of the club see it.");
  assert.equal(m.visibilityHint("", false), "Members only: only members of the club see it.");
  const flip = m.visibilityHint("Climbing Club", true);
  assert.ok(flip.startsWith("Members only: only members of Climbing Club see it. "));
  assert.match(flip, /RSVPs from people who aren't members come off\.$/);
});

test("shareRefused: only a members-only event, only on the Board", () => {
  assert.equal(m.shareRefused("board", { visibility: "members" }), true);
  assert.equal(m.shareRefused("board", { visibility: "everyone" }), false);
  assert.equal(m.shareRefused("board", {}), false);
  for (const kind of ["lounge", "officers", "event", "room"]) {
    assert.equal(m.shareRefused(kind, { visibility: "members" }), false, kind);
  }
});

test("the chip: quiet (never coral), words from the copy, a hidden lock", () => {
  // The code only: its header says "never coral" in words.
  const chip = read("components/events/MembersOnlyChip.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(chip, /coral|#FF5C35|255,\s*92,\s*53/i);
  assert.match(chip, /MEMBERS_ONLY_COPY\.chip/);
  assert.match(chip, /aria-hidden="true"/);
  // Words only: not a button, nothing to click.
  assert.doesNotMatch(chip, /<button|onClick/);
  // The pure rules stay pure so this test can load them.
  assert.doesNotMatch(read("components/events/members-only.ts"), /^import /m);
});

test("every surface E2 owns draws the chip for a members-only event", () => {
  const surfaces = [
    "app/campus/campus-home.tsx",
    "components/campus/tonight/TonightCard.tsx",
    "components/mobile/messages/club/EventAbout.tsx",
    "components/mobile/messages/cards/EventCardView.tsx",
    "components/mobile/messages/compose/ShareEventSheet.tsx",
  ];
  for (const path of surfaces) {
    const src = read(path);
    assert.match(src, /<MembersOnlyChip\b/, `${path} draws the chip`);
    assert.match(src, /isMembersOnly\(/, `${path} decides with isMembersOnly`);
  }
});

test("the create/edit form sends visibility: always on create, only when changed on an edit", () => {
  const src = read("app/campus/campus-home.tsx");
  const start = src.indexOf("export function CreateEventModal(");
  const end = src.indexOf("// Dark-glass surface that matches the Events scene");
  assert.ok(start > 0 && end > start, "CreateEventModal and the field after it are found");
  const modal = src.slice(start, end);
  assert.match(modal, /visibility: eventVisibility\(editing\)/, "an edit starts from the event's own value");
  assert.match(modal, /if \(visibility !== initial\.visibility\) changes\.visibility = visibility;/);
  assert.match(modal, /org_id: orgId,\s*visibility,/, "the POST body carries it");
  assert.match(modal, /<EventVisibilityField\b/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /minHeight: 44/, "44px targets");
});

test("the share sheet keeps a refused row from being picked or sent", () => {
  const src = read("components/mobile/messages/compose/ShareEventSheet.tsx");
  assert.match(src, /shareRefused\(roomKind, ev\)/);
  assert.match(src, /if \(off\) return;/);
  assert.match(src, /aria-disabled=\{off \|\| undefined\}/);
  assert.match(src, /&& !selectedRefused/);
  assert.match(src, /MEMBERS_ONLY_COPY\.boardOff\b/);
});

test("the event card's totals follow the saved event, so a flip's dropped RSVPs show", () => {
  // A flip to Members only takes non-members' RSVPs off (E1); the card held
  // its first counts in state, so "12 going" outlived the flip (review, Oct 22).
  const src = read("app/campus/campus-home.tsx");
  const start = src.indexOf("export function EventCard(");
  const end = src.indexOf("const setRsvp = async", start);
  assert.ok(start > 0 && end > start, "EventCard's state block is found");
  const card = src.slice(start, end);
  assert.match(card, /if \(served\.going !== ev\.going_count \|\| served\.interested !== ev\.interested_count\)/);
  assert.match(card, /setGoing\(ev\.going_count\);\s*setInterested\(ev\.interested_count\);/);
});
