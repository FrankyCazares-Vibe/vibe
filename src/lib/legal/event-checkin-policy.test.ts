/**
 * The Privacy Policy describes event check-in (contract:
 * handoffs/2026-10-19-checkin-build/CONTRACT.md, section 5). The policy lives
 * twice, as the text file and as the page's TSX, and the two must say the
 * same thing: a check-in feature that ships without its policy lines breaks a
 * promise the policy makes (any change to what Vibe collects or shows changes
 * the policy the same day).
 *
 * Run with:
 *   node --test src/lib/legal/event-checkin-policy.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
// Line breaks in the TSX and the text file fall mid-sentence; fold them away.
const oneLine = (s: string) => s.replace(/\s+/g, " ");

const TEXT_FILE = "handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md";
const PAGE_DIR = "src/app/legal/privacy/";
const DELETE_PAGE = "src/app/legal/delete-account/page.tsx";
// A real effective date, with the month names check/checks.mjs and page.tsx's
// production guard use.
const REAL_DAY =
  /^(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/;

/** The page's copy: every TSX file the privacy page is built from. */
function pageCopy(): string {
  return readdirSync(new URL(PAGE_DIR, root))
    .filter((f) => f.endsWith(".tsx"))
    .sort()
    .map((f) => readRoot(PAGE_DIR + f))
    .join("\n");
}

const COPIES: ReadonlyArray<readonly [string, () => string]> = [
  [TEXT_FILE, () => readRoot(TEXT_FILE)],
  [`${PAGE_DIR}*.tsx`, pageCopy],
];

// Apostrophe-free on purpose: the TSX writes ' as &apos; and the text file
// writes it plainly, so a phrase with one could never match both.
const PHRASES = [
  // The contract's list (section 5).
  "Event check-ins: the club events you checked in at",
  "Four things come close",
  "who checked in at them",
  "once at least 5 have checked in",
  "event check-in lists",
  "see five more lists",
  "including people who are not members or did not RSVP",
  // The contract said "Leaving the club does not remove them"; being taken
  // out does not remove them either (only upcoming RSVPs go), so it says both.
  "Leaving the club, or being taken out of it, does not remove them",
  "RSVPs, event check-ins, blocks and mutes",
  "you can remove any of your check-ins there",
  // The rest of the changes, so none of them can go missing from one copy.
  // "Our database", not "we": Vercel's visit logs do hold the time (section 6).
  "Our database does not store the time you checked in or which way you did it",
  "visit logs can show both",
  "Vibe does not ask your device where it is to check you in",
  "How many people checked in at an event",
  "once at least 5 people have checked in at one, how many did",
  "and who marked Going but did not check in",
  "clear all of an event",
  "Checking in at an event, with the link or the code, puts that event in the log, with the time and your IP address",
  "the log holds that event and your account ID",
  // The door screen shows the exact count to whoever stands in front of it.
  "So does anyone who can see the check-in screen at the door",
  "RSVPs, check-ins and its whole chat with it",
];

for (const [name, read] of COPIES) {
  test(`${name} carries every event check-in line`, () => {
    const text = oneLine(read());
    for (const phrase of PHRASES) {
      assert.ok(text.includes(phrase), `${name} is missing "${phrase}"`);
    }
  });

  test(`${name}: no check-in sentence mentions safety`, () => {
    // The policy says "safety" elsewhere on purpose (child safety, the help
    // inbox). Check-in is never sold as a safety feature.
    // "check in" and "check you in" too, not only "check-in" and "checked
    // in": the sentence most likely to be reworded that way is 3e's "Vibe
    // does not ask your device where it is to check you in." ("checks in",
    // the usage heartbeat, stays out; it is another thing.)
    const sentences = oneLine(read()).split(". ");
    const checkin = sentences.filter((s) => /check(?:-ins?|ed in| in| you in)\b/i.test(s));
    assert.ok(checkin.length >= 10, `${name}: expected the check-in sentences, found ${checkin.length}`);
    for (const s of checkin) {
      assert.doesNotMatch(s, /safety/i, `${name}: "${s.slice(0, 120)}"`);
    }
    // And every sentence that carries one of the lines above is in that set,
    // so the floor of 10 can't be met by other check-ins (the yearly school
    // check-in) while an event check-in line slips past.
    for (const phrase of PHRASES) {
      const holders = sentences.filter((s) => s.includes(phrase));
      assert.ok(holders.length > 0, `${name}: no sentence holds "${phrase}"`);
      for (const s of holders) {
        assert.doesNotMatch(s, /safety/i, `${name}: "${s.slice(0, 120)}"`);
      }
    }
    assert.ok(
      checkin.some((s) => s.includes("Vibe does not ask your device where it is to check you in")),
      `${name}: the 3e sentence is not caught by the check-in filter`,
    );
  });
}

test("the old wording is gone from both copies", () => {
  for (const [name, read] of COPIES) {
    const text = oneLine(read());
    assert.ok(!text.includes("Three things come close"), `${name} still says "Three things come close"`);
    assert.ok(!text.includes("see four more lists"), `${name} still says "see four more lists"`);
  }
});

test("the delete-account page says check-ins go with the account and the event", () => {
  const text = oneLine(readRoot(DELETE_PAGE));
  assert.ok(text.includes("RSVPs, check-ins and its whole chat with it"));
  assert.ok(text.includes("RSVPs, event check-ins and personal calendar entries"));
});

test("the page and the text file carry the same effective date", () => {
  // Until the ship push both read <SHIP DAY>; the push sets the real day in
  // both places (contract D15), and this keeps one from being forgotten.
  const page = /const EFFECTIVE_DATE = "([^"]+)";/.exec(readRoot(`${PAGE_DIR}page.tsx`))?.[1];
  const text = /^Effective (.+)$/m.exec(readRoot(TEXT_FILE))?.[1]?.trim();
  assert.ok(page, "page.tsx has no EFFECTIVE_DATE");
  assert.equal(text, page);
  // Either the draft's placeholder or a real day: a typo such as "Oct 20"
  // would pass the checker (it compares the page with this same line).
  assert.ok(page === "<SHIP DAY>" || REAL_DAY.test(page), `EFFECTIVE_DATE "${page}" is not a date`);
});

test("a production build refuses the placeholder date", () => {
  // Nothing else catches a forgotten <SHIP DAY>: the checker and the test
  // above both compare the page with itself. page.tsx throws on Vercel's
  // production build unless the date is a real day; keep that guard.
  const src = oneLine(readRoot(`${PAGE_DIR}page.tsx`));
  // Spaces and the trailing comma are optional, so a reformat doesn't trip it.
  const guard =
    /if ?\( ?process\.env\.VERCEL_ENV === "production" && !\/(.+?)\/\.test\( ?EFFECTIVE_DATE,? ?\) ?\) ?\{ ?throw new Error\(/.exec(src);
  assert.ok(guard, "page.tsx lost its production guard on EFFECTIVE_DATE");
  assert.equal(guard[1], REAL_DAY.source, "page.tsx's guard and this test spell a date differently");
  // The guard's pattern turns the placeholder away and lets a real day in.
  assert.equal(REAL_DAY.test("<SHIP DAY>"), false);
  assert.equal(REAL_DAY.test("October 20, 2026"), true);
});
