/**
 * The Privacy Policy describes what the first email confirmation does to an
 * account (the pre-registration fix: supabase/migrations/
 * 20261022100000_password_needed_column.sql and
 * 20261022110000_first_confirm_drops_password.sql). At the first confirmation
 * the database removes a password, the starter name and the Terms tick chosen
 * before the inbox was proven, notes the time in users.password_needed_at,
 * and the tick is recorded again with the source 'confirm'. The policy lives
 * twice, as the text file and as the page's TSX, and the two must say the
 * same thing: the change ships with its policy lines the same day (any
 * change to what Vibe collects or shows changes the policy the same day).
 * Section 4's list of emails (Supabase's Reset password and Magic link
 * notices) is pinned in src/lib/auth/notice-templates.test.ts instead: those
 * lines go with the dashboard templates, not with the database change.
 *
 * Run with:
 *   node --test src/lib/legal/first-confirm-policy.test.ts
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
const MIGRATION_A = "supabase/migrations/20261022100000_password_needed_column.sql";
const MIGRATION_B = "supabase/migrations/20261022110000_first_confirm_drops_password.sql";
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

// Apostrophe-free on purpose: the TSX writes ' as &apos; and the text file
// writes it plainly, so a phrase with one could never match both. No phrase
// crosses a link either (the TSX wraps "section N" in <Sec> and "Terms" in
// <PageLink>).
// Each path, as built: the sign-up page and the Log in code box set the
// password typed there again right after the code (and the sign-up page
// records its own tick); every other confirmation meets the "Choose your
// password" screen or /auth/terms, which ask for the tick again.
const SECTION_2 = [
  "Typing it confirms your account and verifies your school email in one step.",
  "The password that works is the one chosen by the person who types the code, so confirming removes any password set for your address before then.",
  "If you type the code on the page where you just typed your password (the sign-up page or Log in), Vibe sets that password again at once.",
  "If you confirm anywhere else, Vibe asks you to choose a password.",
  "Unless you confirm on the sign-up page, Vibe also asks you to check the box again.",
  "You then set up a profile.",
] as const;
// password_needed_at is cleared only by accept-terms once a password exists.
const SECTION_3A = [
  "When confirming your email removes a password, we note the time until you have chosen one and accepted the Terms.",
] as const;
// terms_acceptances.source: signup, confirm, interstitial (in that order here).
const SECTION_13 = [
  "and we record it again once you confirm your email, because only then do we know the box was checked by the person who reads that inbox",
  "and whether you accepted at sign-up, after confirming your email or on a later screen.",
] as const;
// The words these lines replaced.
const OLD = [
  "in one step, and you then set up a profile",
  "a password set for your address before you confirmed it stops working",
  "If your account is confirmed before it has a password",
  "and which screen you accepted on",
] as const;

/** The text between two markers, folded onto one line. */
function between(text: string, start: string, end: string, where: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${where}: cannot find "${start}" then "${end}"`);
  return oneLine(text.slice(from, to));
}

const COPIES: ReadonlyArray<readonly [string, () => string]> = [
  [TEXT_FILE, () => readRoot(TEXT_FILE)],
  [`${PAGE_DIR}*.tsx`, pageCopy],
];

for (const [name, read] of COPIES) {
  test(`${name} carries every first-confirmation line`, () => {
    const text = oneLine(read());
    for (const phrase of [...SECTION_2, ...SECTION_3A, ...SECTION_13]) {
      assert.ok(text.includes(phrase), `${name} is missing "${phrase}"`);
    }
  });

  test(`${name}: the old sign-up wording is gone`, () => {
    const text = oneLine(read());
    for (const old of OLD) assert.ok(!text.includes(old), `${name} still says "${old}"`);
  });
}

test("the text file puts each line in its own section", () => {
  const md = readRoot(TEXT_FILE);
  const s2 = between(md, "\n## 2. ", "\n## 3. ", TEXT_FILE);
  const s3a = between(md, "\n### 3a. ", "\n### 3b. ", TEXT_FILE);
  const s13 = between(md, "\n## 13. ", "\n## 14. ", TEXT_FILE);
  for (const p of SECTION_2) assert.ok(s2.includes(p), `section 2 is missing "${p}"`);
  for (const p of SECTION_3A) assert.ok(s3a.includes(p), `section 3a is missing "${p}"`);
  for (const p of SECTION_13) assert.ok(s13.includes(p), `section 13 is missing "${p}"`);
  // The 3a line belongs to the Password bullet, not another one.
  const bullet = /^- \*\*Password\.\*\*.*$/m.exec(md)?.[0] ?? "";
  assert.ok(bullet.includes(SECTION_3A[0]), "the Password bullet does not carry the 3a line");
});

test("the page puts each line in its own section", () => {
  const s1to3 = readRoot(`${PAGE_DIR}sections-1-3.tsx`);
  const s11to15 = readRoot(`${PAGE_DIR}sections-11-15.tsx`);
  const s2 = between(s1to3, "<SectionH2 n={2} />", "<SectionH2 n={3} />", "sections-1-3.tsx");
  const s3a = between(s1to3, '<SubH3 n="3a" />', '<SubH3 n="3b" />', "sections-1-3.tsx");
  const s13 = between(s11to15, "<SectionH2 n={13} />", "<SectionH2 n={14} />", "sections-11-15.tsx");
  for (const p of SECTION_2) assert.ok(s2.includes(p), `section 2 is missing "${p}"`);
  for (const p of SECTION_3A) assert.ok(s3a.includes(p), `section 3a is missing "${p}"`);
  for (const p of SECTION_13) assert.ok(s13.includes(p), `section 13 is missing "${p}"`);
  const bullet = /<strong>Password\.<\/strong>[^<]*<\/li>/.exec(s3a)?.[0] ?? "";
  assert.ok(bullet.includes(SECTION_3A[0]), "the Password bullet does not carry the 3a line");
});

test("the lines match what the two migrations store", () => {
  // 3a's "we note the time": the one new column, a time and nothing else.
  const a = oneLine(readRoot(MIGRATION_A));
  assert.match(a, /alter table public\.users add column password_needed_at timestamptz;/);
  // 13's "we record it again ... after confirming your email": the new source.
  assert.match(a, /check \(source in \('signup', 'interstitial', 'confirm'\)\)/);
  // The starter name goes back to the policy's own default ("Member", 3a).
  const b = oneLine(readRoot(MIGRATION_B));
  assert.match(b, /set password_needed_at = now\(\), name = 'Member',/);
  assert.ok(oneLine(readRoot(TEXT_FILE)).includes("starts with the name \"Member\""));
});

test("the page and the text file carry the same effective date", () => {
  // Until the production database change ships both read <SHIP DAY>; on that
  // day (the day Migration B goes live) the real date goes in both places.
  const page = /const EFFECTIVE_DATE = "([^"]+)";/.exec(readRoot(`${PAGE_DIR}page.tsx`))?.[1];
  const text = /^Effective (.+)$/m.exec(readRoot(TEXT_FILE))?.[1]?.trim();
  assert.ok(page, "page.tsx has no EFFECTIVE_DATE");
  assert.equal(text, page);
  assert.ok(page === "<SHIP DAY>" || REAL_DAY.test(page), `EFFECTIVE_DATE "${page}" is not a date`);
});
