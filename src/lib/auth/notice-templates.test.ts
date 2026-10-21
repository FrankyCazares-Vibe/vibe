/**
 * Supabase's own "Reset password", "Magic link" and "Change email address"
 * emails are notices with nothing to tap and nothing to type (pre-registration
 * fix, October 2026). The app never asks Supabase to send any of them: Forgot
 * password is admin generateLink + Resend (src/app/api/auth/password-reset/
 * route.ts), sign-in is email and password, and the team changes a sign-in
 * email by hand. But anyone can ask Supabase's public /recover or /otp for any
 * address, and a reset code or link CONFIRMS an unconfirmed account (GoTrue
 * recoverVerify). So a link or a code in those two emails would let a
 * stranger, or a mail scanner opening the link, confirm an account someone
 * else made, or hand out a signed-in session. And any signed-in account can
 * ask /user to move onto a student's school address: a link in the third,
 * opened by IU's mail scanner, would finish the move with the asker's password
 * and session intact (GoTrue emailChangeVerify).
 *
 * Production's copies are pasted into the dashboard from these files, so the
 * files are what gets read back. This also pins the confirmation email to a
 * code and nothing to tap (school email first, Oct 8 2026), the Log in page's
 * "Forgot?" link the notices point to, and the Privacy Policy's section 4,
 * which lists the three notices among the emails Vibe sends.
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
    variable: "{{ .Email }}",
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
    variable: "{{ .Email }}",
    body: [
      "Someone asked for a sign-in link for {{ .Email }}.",
      "Vibe does not sign in that way.",
      'Open Vibe, tap Log in and use your password. If you do not remember it, tap "Forgot?" next to Password.',
      "Did not ask? Ignore this email. Nothing changes.",
    ],
  },
  {
    // GoTrue sends this one file to BOTH addresses, the new one and (Secure
    // email change on) the current one, with the same data (v2.197
    // templatemailer EmailChangeMail). So it names the address asked for,
    // never "this address", and never {{ .Email }}: that is the asking
    // account's sign-in email, and it would reach whoever owns the typed one.
    key: "email_change",
    file: "supabase/templates/email_change.html",
    subject: "Vibe sign-in email change request",
    variable: "{{ .NewEmail }}",
    body: [
      "Someone asked to make {{ .NewEmail }} the sign-in email of a Vibe account.",
      "Vibe does not change sign-in emails that way.",
      // Privacy Policy section 9: write to help@ from the current sign-in email.
      "To change your own, write to the Vibe team from the email you sign in with now.",
      "The Vibe Privacy Policy gives the address.",
      // The current address only gets this after a request made with that
      // account's own session (PUT /user needs one; /resend needs a pending
      // change, which 20261022120000 never lets exist). For that reader "did
      // not ask" means someone else is signed in, so "ignore it" is for the
      // other reader only. The labels it names are pinned below.
      "Did not ask, and this came to the email you sign in with?",
      "Someone may be signed in as you.",
      'Open Vibe, go to Settings and tap "Sign out of other devices".',
      'Then tap Sign out, and on the Log in page tap "Forgot?" next to Password to choose a new password.',
      "Did not ask, and it came to any other email? Ignore it. Nothing changes.",
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

  test(`${notice.file} uses only ${notice.variable}`, () => {
    const vars = readRoot(notice.file).match(/\{\{[^}]*\}\}/g) ?? [];
    assert.ok(vars.length > 0, `${notice.file} never names the address`);
    for (const v of vars) assert.equal(v, notice.variable, `${notice.file} uses ${v}`);
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
  // All three notices send a reader to "Forgot?" next to Password on the Log
  // in page. If that link is renamed or moved, change the three notices (and
  // the dashboard copies) the same day.
  const login = oneLine(readRoot("src/app/auth/login/page.tsx"));
  assert.match(
    login,
    /<span className="vibe-auth-label">Password<\/span> <Link href="\/auth\/forgot-password"[^>]*> Forgot\? <\/Link>/,
    'the Log in page no longer shows "Forgot?" next to Password',
  );
});

test("Settings still has the two buttons the email change notice names", () => {
  // The change notice tells a current-inbox reader who did not ask to tap
  // "Sign out of other devices" in Settings, then Sign out. Rename either and
  // change email_change.html (and its dashboard copy) the same day.
  const sessions = oneLine(readRoot("src/components/settings/SessionsCard.tsx"));
  assert.ok(sessions.includes(': "Sign out of other devices"}'), 'Settings no longer shows "Sign out of other devices"');
  const settings = oneLine(readRoot("src/components/settings/SettingsClient.tsx"));
  assert.ok(settings.includes('{busy ? "Signing out…" : "Sign out"}'), 'Settings no longer shows "Sign out"');
});

test("Secure email change stays on locally, as section 4 says", () => {
  // With it off, the change notice reaches only the address asked for, and
  // section 4's "goes to both emails" would be false. This test cannot see
  // production's switch (Dashboard > Authentication > Secure email change):
  // that one has to be read back by hand.
  const toml = readRoot(CONFIG);
  const from = toml.indexOf("\n[auth.email]\n");
  assert.ok(from >= 0, `${CONFIG} has no [auth.email]`);
  const rest = toml.slice(from + "\n[auth.email]\n".length);
  const next = rest.search(/^\s*(#\s*)?\[/m);
  const table = next < 0 ? rest : rest.slice(0, next);
  assert.match(table, /^double_confirm_changes = true$/m, `${CONFIG} [auth.email] no longer has double_confirm_changes = true`);
});

// The Privacy Policy's list of automatic emails (section 4) names these three.
// Written to be true before and after the dashboard copies are pasted, so the
// policy's date never waits on the paste: production's Change email address
// template was never read back, and Supabase's default names the asking
// account's sign-in email too, so the policy says what the email names, never
// what it leaves out. Apostrophe-free, like the other policy pins (the page's
// TSX writes ' as &apos;).
const POLICY_TEXT = "handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md";
const POLICY_PAGE = "src/app/legal/privacy/sections-4-5.tsx";
const SECTION_4 = [
  "The automatic emails Vibe sends you are these eleven:",
  "send your access code, and three that tell you someone asked Supabase, the company that runs our sign-in, to reset your password, to send you a sign-in link, or to make your email the sign-in email of an account.",
  "The last three are sent when someone asks Supabase directly, not through Vibe. Vibe itself never asks for any of them: the second email above is how Vibe resets a password, and to change a sign-in email you write to us",
  // GoTrue mails the change notice to the new address and, with Secure email
  // change on (production since Oct 8; double_confirm_changes locally, pinned
  // above), to the current one too.
  "The one about changing a sign-in email goes to both emails, the one asked for and the sign-in email of the account that asked. It names the email asked for.",
  "Vibe sends no bulk marketing email, and no other email about activity on your account.",
] as const;
const SECTION_4_OLD = [
  "these eight",
  "these ten",
  "and two that tell you",
  "The last two are sent",
  "never asks for either",
  "no bulk marketing email and no email about activity",
  // True only once the dashboard holds email_change.html (see above).
  "It names only the one asked for",
] as const;

test("the Privacy Policy lists all three notices in section 4, text and page alike", () => {
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
  assert.ok(!toml.includes("# [auth.email.template.email_change]"), "the email change notice is commented out");
});

test("the email change notice fits both people it reaches", () => {
  // The same file goes to the address asked for and to the account's current
  // sign-in email, so "this address" would be false for one of them.
  const text = visibleText(readRoot("supabase/templates/email_change.html"));
  assert.doesNotMatch(text, /this (email )?address/i);
  // It sends a person who wants a new sign-in email to the Privacy Policy for
  // the address to write to. Section 9 must still say so, text and page alike.
  const how = "To change your sign-in email, write to";
  assert.ok(oneLine(readRoot(POLICY_TEXT)).includes(how), `${POLICY_TEXT} no longer says "${how}"`);
  const s9 = oneLine(readRoot("src/app/legal/privacy/sections-9-10.tsx"));
  assert.ok(s9.includes(`${how}{" "} <Mail box="help" /> from your current sign-in email.`), `the page no longer says "${how}"`);
});
