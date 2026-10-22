/**
 * The Privacy Policy says who can see a club's events, and since Oct 22, 2026
 * a club can mark one "Members only" (handoffs/2026-10-22-club-tools-arc/
 * PLAN-2.md; supabase/migrations/20261025100000_event_visibility.sql). Such
 * an event is seen only by the club's members (and the Vibe team), only they
 * can RSVP or check themselves in, it can't go on the Board, and marking an
 * upcoming event that way drops the RSVPs of people who are not members.
 *
 * Before this, 5b told every signed-in account it sees every club event,
 * which became false the day the switch shipped. The policy lives twice, as
 * the text file and as the page's TSX, and the two must say the same thing:
 * a change to what Vibe shows changes the policy the same day.
 *
 * Run with:
 *   node --test src/lib/legal/event-visibility-policy.test.ts
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
// A real effective date, with the month names page.tsx's production guard uses.
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

// Each copy, with where its section 5b starts and ends: the text file's
// headings, and the page's SubH3 markers (sections-4-5-a.tsx).
const COPIES: ReadonlyArray<readonly [string, () => string, readonly [string, string]]> = [
  [TEXT_FILE, () => readRoot(TEXT_FILE), ["### 5b.", "### 5c."]],
  [`${PAGE_DIR}*.tsx`, pageCopy, ['<SubH3 n="5b" />', '<SubH3 n="5c" />']],
];

// Apostrophe-free and quote-free on purpose: the TSX writes ' as &apos; and
// the quotes round "Members only" as &ldquo; / “, while the text file
// writes both plainly, so a phrase with either could never match both copies.
const PHRASES = [
  // Section 1: the Vibe team sees these events in the app (event_visible's
  // platform-admin arm), so "only its members see" isn't the whole story.
  "In the app itself, they can also see the events a club marks",
  // 3c: what Vibe stores about an event now includes the switch.
  "Club events and whether each is marked",
  // Section 5's table.
  "Club events, with Going and Interested totals",
  "Any signed-in account, except an event its club marks",
  // 5b, the line that used to promise every event to every account.
  "how many did. One exception: an event its club marks",
  "which only its members see. Only they can RSVP to it or check themselves in",
  // 5e: no Members only card on the Board, and none shown to a follower.
  "cannot be shared on the Board, and a follower never sees one there",
  // 5f: the officers' check-in list, after the line event-checkin-policy pins.
  "and who marked Going but did not check in. At an event marked",
  "only members can check themselves in",
  // Section 8: marking an upcoming event Members only drops outsiders' RSVPs.
  "For an upcoming event, also when the club takes you out,",
  // Leaving takes you off a club's Members only events (Oct 22, 2026).
  "when you leave the club and the event is marked",
  "while you are not a member",
];

for (const [name, read, [from, to]] of COPIES) {
  test(`${name} carries every Members only line`, () => {
    const text = oneLine(read());
    for (const phrase of PHRASES) {
      assert.ok(text.includes(phrase), `${name} is missing "${phrase}"`);
    }
  });

  test(`${name}: 5b names the exception in 5b itself`, () => {
    // 5b is "every signed-in account": the exception must sit in it, not only
    // in the table or 5f, or 5b still says too much.
    const all = read();
    const start = all.indexOf(from);
    const end = all.indexOf(to, start);
    assert.ok(start >= 0 && end > start, `${name}: could not find section 5b`);
    const b = oneLine(all.slice(start, end));
    assert.ok(b.includes("Members only"), `${name}: 5b does not mention Members only`);
    assert.ok(b.includes("which only its members see"), `${name}: 5b does not say who sees it`);
  });

  test(`${name}: every place that says who sees club events names Members only`, () => {
    // "Going and Interested totals" is how the policy says "a club's events
    // are shown": each place it does must carry the exception close by.
    const text = oneLine(read());
    const at = [...text.matchAll(/Going and Interested totals/g)].map((m) => m.index ?? 0);
    assert.ok(at.length >= 2, `${name}: expected 5b and the table, found ${at.length}`);
    for (const i of at) {
      const near = text.slice(i, i + 260);
      assert.ok(near.includes("Members only"), `${name}: "${near.slice(0, 120)}" has no Members only`);
    }
  });
}

test("the old RSVP retention row is gone from both copies", () => {
  for (const [name, read] of COPIES) {
    const text = oneLine(read());
    assert.ok(
      !text.includes("the club takes you out (upcoming events only), or the event"),
      `${name} still has the RSVP row without Members only`,
    );
  }
});

test("the page and the text file carry the same effective date", () => {
  // The policy change goes live with the switch: the real day goes in both
  // places, and page.tsx's production guard refuses to build the placeholder.
  const page = /const EFFECTIVE_DATE = "([^"]+)";/.exec(readRoot(`${PAGE_DIR}page.tsx`))?.[1];
  const text = /^Effective (.+)$/m.exec(readRoot(TEXT_FILE))?.[1]?.trim();
  assert.ok(page, "page.tsx has no EFFECTIVE_DATE");
  assert.equal(text, page);
  assert.ok(page === "<SHIP DAY>" || REAL_DAY.test(page), `EFFECTIVE_DATE "${page}" is not a date`);
});
