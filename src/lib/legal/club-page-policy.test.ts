/**
 * The Privacy Policy lists what a club page shows, and since the club's
 * view, wave 2 (handoffs/2026-10-20-club-view/WAVE2-DESIGN.md C8,
 * supabase/migrations/20261023100000_club_meeting_time.sql) that includes
 * when the club says it meets. The policy lives twice, as the text file and
 * as the page's TSX, and the two must say the same thing: a feature that
 * ships without its policy line breaks a promise the policy makes (any
 * change to what Vibe shows changes the policy the same day).
 *
 * Run with:
 *   node --test src/lib/legal/club-page-policy.test.ts
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

const COPIES: ReadonlyArray<readonly [string, () => string]> = [
  [TEXT_FILE, () => readRoot(TEXT_FILE)],
  [`${PAGE_DIR}*.tsx`, pageCopy],
];

// Apostrophe-free on purpose: the TSX writes ' as &apos; and the text file
// writes it plainly, so a phrase with one could never match both.
const CLUB_PAGE_FIELDS = "name, description, links, philanthropy, logo, banner, who can join, when it meets, and the member and follower counts once each reaches 5";

for (const [name, read] of COPIES) {
  test(`${name}: section 7 says the browser keeps which club the Profile tab shows`, () => {
    // club-switch.ts PROFILE_AS_CLUB_KEY, cleared at sign-out (leave-device-clean.ts).
    const text = oneLine(read());
    assert.ok(
      text.includes("follow list, recent searches and which of the clubs you run your Profile tab shows. They are cleared when you sign out"),
      `${name} does not say the browser keeps which club the Profile tab shows`,
    );
  });

  test(`${name}: section 5a lists when a club meets among what its page shows`, () => {
    const text = oneLine(read());
    assert.ok(text.includes(CLUB_PAGE_FIELDS), `${name} is missing "${CLUB_PAGE_FIELDS}"`);
  });

  test(`${name}: the club page fields are listed once, in one place`, () => {
    // Every list of a club page's fields says the same thing: if a second
    // list appears, it must carry the new line too.
    const text = oneLine(read());
    const lists = text.match(/description, links, (?:philanthropy, )?logo, banner[^.]*/g) ?? [];
    assert.equal(lists.length, 1, `${name} lists a club page's fields ${lists.length} times`);
    assert.ok(lists[0].includes("when it meets"));
    assert.equal(text.split("who can join, and the member").length, 1, `${name} still has the old line`);
  });
}

test("the page and the text file carry the same effective date", () => {
  // Until the production database change ships both read <SHIP DAY>; on that
  // day the real date goes in both places. page.tsx's production guard
  // refuses to build the placeholder.
  const page = /const EFFECTIVE_DATE = "([^"]+)";/.exec(readRoot(`${PAGE_DIR}page.tsx`))?.[1];
  const text = /^Effective (.+)$/m.exec(readRoot(TEXT_FILE))?.[1]?.trim();
  assert.ok(page, "page.tsx has no EFFECTIVE_DATE");
  assert.equal(text, page);
  assert.ok(page === "<SHIP DAY>" || REAL_DAY.test(page), `EFFECTIVE_DATE "${page}" is not a date`);
});
