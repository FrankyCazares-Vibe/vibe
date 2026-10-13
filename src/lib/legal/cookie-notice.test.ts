/**
 * Tests for the cookie notice's rules (`cookie-notice.ts`) and the promises
 * around it: where it is mounted, that closing it sends nothing, and that the
 * Privacy Policy (page and text file) describes it.
 *
 * Run with:
 *   node --test src/lib/legal/cookie-notice.test.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const specifier = "./cookie-notice.ts";
const {
  boxesTouch,
  COOKIE_NOTICE_COPY,
  COOKIE_NOTICE_KEEP_CLEAR,
  COOKIE_NOTICE_STORAGE_KEY,
  cookieNoticeAllowedHere,
  cookieNoticeClosed,
  rememberCookieNoticeClosed,
} = (await import(specifier)) as typeof import("./cookie-notice");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const oneLine = (s: string) => s.replace(/\s+/g, " ");

function fakeStorage(broken = false) {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem(key: string) {
      if (broken) throw new Error("storage is off");
      return kept.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (broken) throw new Error("storage is off");
      kept.set(key, value);
    },
  };
}

test("closing writes one note under one key, and a later visit reads it", () => {
  assert.equal(COOKIE_NOTICE_STORAGE_KEY, "vibe_cookie_notice_closed");
  const storage = fakeStorage();
  assert.equal(cookieNoticeClosed(storage), false);
  assert.equal(rememberCookieNoticeClosed(storage), true);
  assert.deepEqual([...storage.kept.keys()], [COOKIE_NOTICE_STORAGE_KEY]);
  assert.equal(cookieNoticeClosed(storage), true);
});

test("a browser that refuses storage never throws: the notice just isn't remembered", () => {
  const storage = fakeStorage(true);
  assert.equal(cookieNoticeClosed(storage), false);
  assert.equal(rememberCookieNoticeClosed(storage), false);
  assert.equal(cookieNoticeClosed(null), false);
  assert.equal(rememberCookieNoticeClosed(undefined), false);
});

test("never inside a frame, never on a mini address", () => {
  assert.equal(cookieNoticeAllowedHere(false, ""), true);
  assert.equal(cookieNoticeAllowedHere(false, "?next=%2Ffeed&src=flyer"), true);
  assert.equal(cookieNoticeAllowedHere(true, ""), false);
  assert.equal(cookieNoticeAllowedHere(false, "?mini=1"), false);
  assert.equal(cookieNoticeAllowedHere(false, "?a=b&mini=1&c=d"), false);
  assert.equal(cookieNoticeAllowedHere(false, "?mini=10"), true);
});

test("boxes touch only within the gap, and an empty box touches nothing", () => {
  const notice = { left: 12, top: 700, right: 363, bottom: 800 };
  assert.equal(boxesTouch(notice, { left: 20, top: 650, right: 200, bottom: 698 }, 8), true);
  assert.equal(boxesTouch(notice, { left: 20, top: 600, right: 200, bottom: 690 }, 8), false);
  assert.equal(boxesTouch(notice, { left: 20, top: 705, right: 200, bottom: 750 }), true);
  assert.equal(boxesTouch(notice, { left: 0, top: 0, right: 0, bottom: 0 }, 8), false);
});

test("the words are a notice: no accept, no decline", () => {
  assert.equal(COOKIE_NOTICE_COPY.text, "Vibe only uses the cookies that keep you signed in. No ads, no trackers.");
  assert.equal(COOKIE_NOTICE_COPY.linkHref, "/legal/privacy");
  assert.equal(COOKIE_NOTICE_COPY.button, "Got it");
  const component = readRoot("src/components/legal/CookieNotice.tsx");
  assert.doesNotMatch(Object.values(COOKIE_NOTICE_COPY).join(" "), /\b(accept|decline|reject|consent|agree)\b/i);
  // No button or label of that kind in the markup either (comments say "accept" in lower case).
  assert.doesNotMatch(component, /\b(Accept|Decline|Reject)\b/);
});

test("closing sends nothing and sets no cookie; nothing is drawn before the browser is asked", () => {
  const component = readRoot("src/components/legal/CookieNotice.tsx");
  assert.doesNotMatch(component, /fetch\(|sendBeacon|XMLHttpRequest|document\.cookie|vibeRequest/);
  assert.match(component, /useSyncExternalStore\(subscribe, shouldShow, neverOnServer\)/);
  assert.match(component, /const neverOnServer = \(\) => false;/);
  assert.match(component, /role="region"/);
  assert.match(component, /<button type="button"/);
  // The human-check box is one of the things it keeps clear of.
  assert.match(COOKIE_NOTICE_KEEP_CLEAR, /\[data-keep-clear\]/);
  assert.match(readRoot("src/components/auth/TurnstileBox.tsx"), /<div data-keep-clear /);
});

test("mounted on the five signed-out places and nowhere else", () => {
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "src"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.tsx$/.test(f) && f !== "src/components/legal/CookieNotice.tsx");
  const mounted = files.filter((f) => /<CookieNotice\b/.test(readRoot(f))).sort();
  assert.deepEqual(mounted, [
    "src/app/auth/forgot-password/layout.tsx",
    "src/app/auth/login/layout.tsx",
    "src/app/auth/signup/page.tsx",
    "src/app/page.tsx",
    "src/app/waitlist/layout.tsx",
  ]);
});

test("the Privacy Policy describes the notice, on the page and in the text file", () => {
  const sentence =
    "There are no advertising or tracking cookies. A short notice on the signed-out pages of the website says so. " +
    "When you close it, your browser remembers that, so it is not shown again. Nothing about that is sent to us.";
  const kept = "the note that you closed the cookie notice";
  for (const file of ["src/app/legal/privacy/sections-6-8.tsx", "handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md"]) {
    const text = oneLine(readRoot(file));
    assert.ok(text.includes(sentence), `${file} is missing the notice sentences`);
    assert.ok(text.includes(kept), `${file} does not list the closed-notice note`);
    assert.doesNotMatch(text, /no cookie banner/);
  }
});
