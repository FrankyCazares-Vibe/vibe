/**
 * Supabase's own "Reset password" and "Magic link" emails are notices with
 * nothing to tap and nothing to type (pre-registration fix, October 2026).
 * The app never asks Supabase to send either: Forgot password is admin
 * generateLink + Resend (src/app/api/auth/password-reset/route.ts), and
 * sign-in is email and password. But anyone can ask Supabase's public
 * /recover or /otp for any address, and a reset code or link CONFIRMS an
 * unconfirmed account (GoTrue recoverVerify). So a link or a code in these
 * two emails would let a stranger, or a mail scanner opening the link, confirm
 * an account someone else made, or hand out a signed-in session.
 *
 * Production's copies are pasted into the dashboard from these files, so the
 * files are what gets read back. This also pins the confirmation email to a
 * code and nothing to tap (school email first, Oct 8 2026), the Log in page's
 * "Forgot?" link the notices point to, and the Privacy Policy's section 4,
 * which lists the two notices among the emails Vibe sends.
 *
 * Run with:
 *   node --test src/lib/auth/notice-templates.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const oneLine = (s: string) => s.replace(/\s+/g, " ");

const CONFIG = "supabase/config.toml";
const NOTICES = [
  {
    key: "recovery",
    file: "supabase/templates/recovery.html",
    subject: "Vibe password reset request",
    body: [
      "Someone asked to reset the Vibe password for {{ .Email }}.",
      "Vibe does not do that from this email.",
      // The Log in page labels its link "Forgot?", next to Password (src/app/auth/login/page.tsx).
      'To reset yours, open Vibe, tap Log in, then tap "Forgot?" next to Password.',
      "Did not ask? Ignore this email. Nothing changes.",
    ],
  },
  {
    key: "magic_link",
    file: "supabase/templates/magic_link.html",
    subject: "Vibe sign-in request",
    body: [
      "Someone asked for a sign-in link for {{ .Email }}.",
      "Vibe does not sign in that way.",
      'Open Vibe, tap Log in and use your password. If you do not remember it, tap "Forgot?" next to Password.',
      "Did not ask? Ignore this email. Nothing changes.",
    ],
  },
] as const;

// Anything that would put a link, a code or a fetch in the email. Checked over
// the whole file, comments included, so a commented-out link cannot come back
// by deleting two characters.
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["ConfirmationURL", /ConfirmationURL/],
  ["Token (and TokenHash)", /Token/],
  ["SiteURL", /SiteURL/],
  ["RedirectTo", /RedirectTo/],
  ["Data (caller-supplied metadata)", /\.Data\b/],
  ["href", /href/i],
  ["<img", /<img/i],
  ["a web address", /https?:|www\.|connectvibe\.app/i],
  ["a stylesheet, script or remote file", /<link|<script|<iframe|url\(|src=/i],
];
// The visible text is pinned word for word below, so no path or address can
// creep into what the reader sees either.

/** The body of the email, with the HTML comment and tags taken out. */
function visibleText(html: string): string {
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/^[\s\S]*<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  return oneLine(body.replace(/<[^>]+>/g, " ")).trim();
}

/** One [auth.email.template.<key>] table's lines, up to the next table. */
function configTable(toml: string, key: string): string {
  const head = `[auth.email.template.${key}]`;
  const from = toml.indexOf(`\n${head}\n`);
  assert.ok(from >= 0, `${CONFIG} has no ${head}`);
  const rest = toml.slice(from + head.length + 2);
  const next = rest.search(/^\s*(#\s*)?\[/m);
  return next < 0 ? rest : rest.slice(0, next);
}

for (const notice of NOTICES) {
  test(`${notice.file} has no link, no code and nothing fetched`, () => {
    const html = readRoot(notice.file);
    for (const [what, re] of FORBIDDEN) {
      assert.doesNotMatch(html, re, `${notice.file} carries ${what}`);
    }
  });

  test(`${notice.file} uses only {{ .Email }}`, () => {
    const vars = readRoot(notice.file).match(/\{\{[^}]*\}\}/g) ?? [];
    assert.ok(vars.length > 0, `${notice.file} never names the address`);
    for (const v of vars) assert.equal(v, "{{ .Email }}", `${notice.file} uses ${v}`);
  });

  test(`${notice.file} says what to do instead, and nothing else`, () => {
    const text = visibleText(readRoot(notice.file));
    assert.equal(text, notice.body.join(" "));
  });

  test(`${CONFIG} sends ${notice.key} from ${notice.file}`, () => {
    const table = configTable(readRoot(CONFIG), notice.key);
    assert.match(table, new RegExp(`^subject = "${notice.subject}"$`, "m"));
    assert.match(table, new RegExp(`^content_path = "\\./${notice.file.replace(/\./g, "\\.")}"$`, "m"));
  });
}

test("the confirmation email is a code with nothing to tap", () => {
  const html = readRoot("supabase/templates/confirmation.html");
  assert.match(html, /\{\{ \.Token \}\}/);
  for (const re of [/ConfirmationURL/, /TokenHash/, /SiteURL/, /RedirectTo/, /href/i, /<img/i, /https?:/i]) {
    assert.doesNotMatch(html, re, `confirmation.html carries ${re}`);
  }
  const table = configTable(readRoot(CONFIG), "confirmation");
  assert.match(table, /^content_path = "\.\/supabase\/templates\/confirmation\.html"$/m);
});

test('the Log in page still has the "Forgot?" link the notices point to', () => {
  // Both notices say: tap Log in, then "Forgot?" next to Password. If that
  // link is renamed or moved, change the two notices (and the dashboard copies)
  // the same day.
  const login = oneLine(readRoot("src/app/auth/login/page.tsx"));
  assert.match(
    login,
    /<span className="vibe-auth-label">Password<\/span> <Link href="\/auth\/forgot-password"[^>]*> Forgot\? <\/Link>/,
    'the Log in page no longer shows "Forgot?" next to Password',
  );
});

// The Privacy Policy's list of automatic emails (section 4) names these two.
// Written to be true before and after the dashboard copies are pasted, so the
// policy's date never waits on the paste. Apostrophe-free, like the other
// policy pins (the page's TSX writes ' as &apos;).
const POLICY_TEXT = "handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md";
const POLICY_PAGE = "src/app/legal/privacy/sections-4-5.tsx";
const SECTION_4 = [
  "The automatic emails Vibe sends you are these ten:",
  "send your access code, and two that tell you someone asked Supabase, the company that runs our sign-in, to reset your password or to send you a sign-in link.",
  "The last two are sent when someone asks Supabase directly, not through Vibe. Vibe itself never asks for either: the second email above is how Vibe resets a password.",
  "Vibe sends no bulk marketing email, and no other email about activity on your account.",
] as const;
const SECTION_4_OLD = ["these eight", "no bulk marketing email and no email about activity"] as const;

test("the Privacy Policy lists both notices in section 4, text and page alike", () => {
  const md = readRoot(POLICY_TEXT);
  const page = readRoot(POLICY_PAGE);
  const sections: ReadonlyArray<readonly [string, string, string, string]> = [
    [POLICY_TEXT, md, "\n## 4. ", "\n## 5. "],
    [POLICY_PAGE, page, "<SectionH2 n={4} />", "<SectionH2 n={5} />"],
  ];
  for (const [name, text, start, end] of sections) {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `${name}: cannot find section 4`);
    const s4 = oneLine(text.slice(from, to));
    for (const p of SECTION_4) assert.ok(s4.includes(p), `${name} section 4 is missing "${p}"`);
    for (const old of SECTION_4_OLD) assert.ok(!s4.includes(old), `${name} section 4 still says "${old}"`);
  }
});

test("config.toml no longer describes the Sept 15 link email as the live one", () => {
  const toml = oneLine(readRoot(CONFIG));
  assert.ok(!toml.includes("Links to the tap-to-confirm"), "the stale confirmation comment is back");
  assert.ok(!toml.includes("# [auth.email.template.recovery]"), "the recovery notice is commented out");
  assert.ok(!toml.includes("# [auth.email.template.magic_link]"), "the magic link notice is commented out");
});
