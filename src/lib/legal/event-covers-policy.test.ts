/**
 * Since Oct 23, 2026 a club's owner or an officer can give an event a cover
 * photo (handoffs/2026-10-23-club-view-wave-3/COVERS-PLAN.md; supabase/
 * migrations/20261028100000_event_covers.sql). The policy names it in both
 * copies, the text file and the page, the same day it ships: what Vibe
 * stores (3c), that its hidden photo details are not stripped (3c), who sees
 * it (5b), when its file is deleted (section 8, "Deleting one thing") and
 * when it is not yet (section 8, "What Vibe does not delete yet"). The
 * delete-account page says the covers of your events stay with the club.
 *
 * Run with:
 *   node --test src/lib/legal/event-covers-policy.test.ts
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
// the quotes as &ldquo; / &rdquo;, so a phrase with either matches one copy.
// The 3c line keeps the phrase event-icons-policy.test.ts pins, whole.
const STORED = "the cover photo and the icon its club picked for it, your RSVPs (Going or Interested)";
const NOT_STRIPPED = "club logos and banners, event cover photos, photos and videos sent in chats";
const WHO_SEES = "cover photo is shown to whoever can see the event";
// Section 8's cover bullet, checked inside the bullet itself: the one-hour
// sentence is the chat file bullet's too. The UI's "Cancel event" (upcoming)
// and "Delete event" (ended) are the same DELETE, and both drop the cover.
// The club's deletion keeps a takedown and the cover an open report's copy
// holds (clubKeysToKeep, src/lib/posts/delete-media-store.ts), not every
// file once kept as evidence.
const DELETED = [
  "or cancels or deletes the event, we try to delete that photo",
  "If a report about the event is open, the file is kept as evidence",
  "If a delete fails, the file stays until the club is deleted",
  "While the file is still stored, a link to it opened before the delete can work for up to an hour",
  "Deleting the club also deletes its events",
  "It keeps any the Vibe team removed, and the cover an event had when it was reported, if that report is still open",
];
const NOT_DELETED_YET =
  "The cover photo of an event that was deleted with the account that made it, and a cover photo uploaded for an event but never saved with it. They stay until the club is deleted.";

for (const [name, read, [from, to]] of COPIES) {
  test(`${name} carries every cover photo line`, () => {
    const text = oneLine(read());
    for (const phrase of [STORED, NOT_STRIPPED, WHO_SEES, ...DELETED, NOT_DELETED_YET]) {
      assert.ok(text.includes(phrase), `${name} is missing "${phrase}"`);
    }
    // The old 3c line, with the icon and no cover, is gone.
    assert.doesNotMatch(text, /Members only\W+the icon its club/, `${name} still has the 3c line without the cover`);
  });

  test(`${name}: 5b says who sees a cover, in 5b itself`, () => {
    const all = read();
    const start = all.indexOf(from);
    const end = all.indexOf(to, start);
    assert.ok(start >= 0 && end > start, `${name}: could not find section 5b`);
    assert.ok(oneLine(all.slice(start, end)).includes(WHO_SEES), `${name}: 5b does not say who sees a cover`);
  });

  test(`${name}: section 8 puts each cover line in its own list`, () => {
    // "Deleting one thing" ends where "What Vibe does not delete yet" starts.
    // With their full stops, so the TSX file's doc comment naming both lists
    // is not taken for them.
    const text = oneLine(read());
    const notYet = text.indexOf("What Vibe does not delete yet.");
    const oneThing = text.indexOf("Deleting one thing.");
    assert.ok(oneThing >= 0 && notYet > oneThing, `${name}: cannot find the two delete lists`);
    // The cover bullet starts at its bold title ("An event's cover photo."; 5b's
    // "cover photo is shown" has no full stop) and is the list's last item.
    const bullet = text.indexOf("s cover photo.", oneThing);
    assert.ok(bullet > oneThing && bullet < notYet, `${name}: cannot find the cover bullet`);
    for (const phrase of DELETED) {
      const at = text.indexOf(phrase, bullet);
      assert.ok(at > bullet && at < notYet, `${name}: "${phrase}" is not in the cover bullet`);
    }
    assert.doesNotMatch(text, /or cancels the event, we try/, `${name}: the bullet leaves out "Delete event"`);
    assert.doesNotMatch(text, /except one kept as evidence/, `${name}: the old club-deletion line is back`);
    assert.ok(text.indexOf(NOT_DELETED_YET, notYet) > notYet, `${name}: the leftover covers are not under "not delete yet"`);
  });
}

test("the delete-account page says the covers of your events stay with the club", () => {
  const text = oneLine(readRoot(DELETE_PAGE));
  assert.ok(text.includes("and the cover photos of its events you made, stay until the club is deleted"));
});
