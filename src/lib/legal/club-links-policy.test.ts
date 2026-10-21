/**
 * The Privacy Policy describes club links and a club's Owner and Officers
 * (the club's view, wave 1: handoffs/2026-10-20-club-view/WAVE1-DESIGN.md,
 * supabase/migrations/20261021100000_club_officers.sql and
 * 20261021110000_club_links.sql). The policy lives twice, as the text file
 * and as the page's TSX, and the two must say the same thing: a feature that
 * ships without its policy lines breaks a promise the policy makes (any
 * change to what Vibe collects or shows changes the policy the same day).
 *
 * Run with:
 *   node --test src/lib/legal/club-links-policy.test.ts
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
// writes it plainly, so a phrase with one could never match both. No phrase
// crosses a "section N" link either (the TSX wraps those in <Sec>).
const PHRASES = [
  // Section 2 and 3a: a club link is a way in, and the account keeps a record.
  "Signing up through a club link needs no access code",
  "if you joined with an access code or a club link, a record of",
  // Section 3d: Sentry's reports lose the code (src/lib/sentry-config.ts).
  "access codes, club link codes and profile handles from web addresses",
  // Section 11: what a club link is.
  "When you sign up through a club link.",
  "lets someone with a school email sign up, even while sign-up is closed",
  "A club setup link",
  "hands it, in person, to the person who will run a new club",
  "It works once, for up to 7 days",
  "to become the owner of the new club",
  "frees the link for someone else; a link freed twice is turned off",
  "A club that Vibe has checked can have one",
  "It stops working 3 weeks after it was made, once 150 people have signed up through it, or when they turn it off",
  "It asks the person who opens it to join the club",
  // Section 11: what is stored, and for how long.
  "we store the email address you typed and the time, with the link",
  "That keeps one link from being used by two people at once, and counts the 150",
  "Once your account is set up, we drop the address",
  "Your account then keeps a record of which link let you in and when",
  "whether you joined or made the club through it and when",
  "If you already have an account and join a club or make one through a club link",
  "only a scrambled form of it",
  "The record is deleted with your account",
  // A place is given back, then deleted when the link is next used
  // (club_link_claim), and the daily cron deletes any never tied to an
  // account 30 days on (purgeUnboundClubLinkPlaces, cron/waitlist-purge).
  "its place on the link is let go after 15 minutes",
  "A place never tied to an account is let go after 30 days",
  "is deleted, with its address, the next time someone signs up through that link",
  "a daily clean-up deletes any place never tied to an account 30 days after it was taken",
  "Deleting an account also deletes any place its address still holds",
  "For each link we keep who made it, a cofounder or an officer, and when",
  "so its owner and officers can show the link again",
  "They see how many people joined the club through it, never who",
  "Our database stores no IP address for any of this",
  "visit logs record its web address, including the code inside it",
  // Section 11's table.
  "Works for 3 weeks and up to 150 sign-ups, while the club leaves it on",
  // Section 5f: Owner and Officers, and the one number officers see.
  "A club is run by its owner and its officers",
  "Only the owner makes a member an officer, or takes that back",
  "see how many people joined the club through its members",
  // Section 9: the record goes with the account.
  "your waitlist entry and the record of which club link let you in",
  // The short version and 5e say officers too.
  "read the posts its owner and officers put on its Board",
  "or its owner or an officer blocked them",
];

for (const [name, read] of COPIES) {
  test(`${name} carries every club link and officer line`, () => {
    const text = oneLine(read());
    for (const phrase of PHRASES) {
      assert.ok(text.includes(phrase), `${name} is missing "${phrase}"`);
    }
  });

  test(`${name}: no club mods, and no club admins`, () => {
    const text = oneLine(read());
    // Clubs have an Owner and Officers since 20261021100000; "mod" is gone.
    const mods = text.match(/.{0,60}\bmods?\b.{0,40}/gi) ?? [];
    assert.deepEqual(mods, [], `${name} still names a club mod`);
    // "admin" is left only in "the admin tools" (Vibe's own, section 1). A
    // club's officers are officers everywhere, as the app calls them.
    const admins = text.match(/.{0,60}\badmins?\b(?! tools).{0,40}/gi) ?? [];
    assert.deepEqual(admins, [], `${name} still calls a club's officers admins`);
    // Vibe's own moderators stay ("All three moderate Vibe", the moderation
    // log); no sentence about a moderator is about a club.
    for (const s of text.split(". ").filter((x) => /\bmoderators?\b/i.test(x))) {
      assert.doesNotMatch(s, /\bclubs?\b/i, `${name}: "${s.slice(0, 120)}"`);
    }
  });

  test(`${name}: the old club wording is gone`, () => {
    const text = oneLine(read());
    for (const old of ["moderators the club picks", "Mods can also read", "not its mods", "owner, admins and mods"]) {
      assert.ok(!text.includes(old), `${name} still says "${old}"`);
    }
  });
}

test("the delete-account page says the club link record goes with the account, and officers", () => {
  const text = oneLine(readRoot(DELETE_PAGE));
  assert.ok(text.includes("the record of which club link let you in, if one did"));
  assert.ok(text.includes("owner or officer stay, with your name taken off"));
  assert.deepEqual(text.match(/.{0,60}\bmods?\b.{0,40}/gi) ?? [], [], "the delete-account page still names a club mod");
  // auth.admin.deleteUser (a code comment) is the API, not a club's officer.
  assert.deepEqual(
    text.match(/.{0,60}(?<!auth\.)\badmins?\b.{0,40}/gi) ?? [],
    [],
    "the delete-account page still calls a club's officers admins",
  );
});

test("the page and the text file carry the same effective date", () => {
  // Until the production database change ships both read <SHIP DAY>; on that
  // day the real date goes in both places, and this keeps one from being
  // forgotten. page.tsx's production guard refuses to build the placeholder.
  const page = /const EFFECTIVE_DATE = "([^"]+)";/.exec(readRoot(`${PAGE_DIR}page.tsx`))?.[1];
  const text = /^Effective (.+)$/m.exec(readRoot(TEXT_FILE))?.[1]?.trim();
  assert.ok(page, "page.tsx has no EFFECTIVE_DATE");
  assert.equal(text, page);
  assert.ok(page === "<SHIP DAY>" || REAL_DAY.test(page), `EFFECTIVE_DATE "${page}" is not a date`);
});
