/**
 * Tests for the waitlist emails' content (`email-content.ts`): subjects,
 * links built from the site URL, the code only in the invite, plain-text
 * parts without markup, escaping, the delivery mode and the dev-log line.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/email-content.test.ts
 *
 * The resolve hook retries an extensionless relative import with ".ts", as
 * in form.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("email-content.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const c = await import("./email-content");
const { CONFIRM_WINDOW_DAYS } = await import("./tokens");

const SITE = "https://www.connectvibe.app/";
// 2:14 PM in Indiana (EDT) on Saturday, October 17, 2026.
const ENDS = "2026-10-17T18:14:59.900Z";
const TOKEN = "AbC_-123".padEnd(43, "x");
const CODE = "VIBE-7KQ2-M9XD";

function noMarkup(text: string) {
  assert.ok(!/[<>]/.test(text), "no tags");
  assert.ok(!/&[a-z]+;|&#\d+;/i.test(text), "no entities");
}

function sayNothingForbidden(all: string) {
  assert.ok(!/instagram/i.test(all));
  assert.ok(!/\bbeta\b/i.test(all));
  assert.ok(!/in line|ahead of you|position/i.test(all));
}

test("links are built from the site URL, with the right parameter names", () => {
  assert.equal(c.waitlistConfirmUrl(SITE, TOKEN), `https://www.connectvibe.app/waitlist/confirm?token=${TOKEN}`);
  assert.equal(c.waitlistLeaveUrl("http://localhost:3102", TOKEN), `http://localhost:3102/waitlist/confirm?token=${TOKEN}&leave=1`);
  assert.equal(c.waitlistSignupUrl(SITE, "vibe 7kq2 m9xd"), "https://www.connectvibe.app/auth/signup?access_code=VIBE-7KQ2-M9XD");
  assert.ok(!c.waitlistSignupUrl(SITE, CODE).includes("?code="));
  assert.throws(() => c.waitlistSignupUrl(SITE, "VIBE-7KQ2-M9X"), /not an access code/);
  // Odd characters in a token are encoded, never trusted.
  assert.equal(c.waitlistConfirmUrl(SITE, "a&b"), "https://www.connectvibe.app/waitlist/confirm?token=a%26b");
});

test("the confirm email: subject, button, 7 days, a leave link, no typed text", () => {
  assert.equal(c.CONFIRM_DAYS_IN_COPY, CONFIRM_WINDOW_DAYS);
  const confirmUrl = c.waitlistConfirmUrl(SITE, TOKEN);
  const leaveUrl = c.waitlistLeaveUrl(SITE, TOKEN);
  const m = c.waitlistConfirmContent({ confirmUrl, leaveUrl, site: SITE });
  assert.equal(m.subject, "Confirm your spot on the Vibe waitlist");
  assert.equal(m.button.label, "Confirm my spot");
  assert.equal(m.button.href, confirmUrl);
  assert.equal(m.code, undefined);
  assert.ok(m.notes.some((n) => n.includes("Take me off the list") && n.includes(`href="${leaveUrl.replace(/&/g, "&amp;")}"`)));
  assert.ok(m.text.includes(`Confirm my spot: ${confirmUrl}`));
  assert.ok(m.text.includes(`Take me off the list: ${leaveUrl}`));
  assert.ok(m.text.includes("7 days"));
  // A spot's own limit, and what to do after it.
  assert.ok(m.notes.some((n) => /up to 40 days/.test(n) && /join again/.test(n)));
  assert.ok(m.text.includes("A spot lasts up to 40 days. If we haven't sent your code by then, you can join again."));
  assert.ok(m.text.endsWith("https://www.connectvibe.app"));
  noMarkup(m.text);
  sayNothingForbidden(JSON.stringify(m));
  assert.ok(!/VIBE-/.test(JSON.stringify(m)), "no access code in the confirm email");
});

test("the invite email: the code box, the sign-up button, notes, a leave link", () => {
  const signupUrl = c.waitlistSignupUrl(SITE, CODE);
  const leaveUrl = c.waitlistLeaveUrl(SITE, TOKEN);
  const m = c.waitlistInviteContent({ name: "Sam", code: "vibe-7kq2-m9xd", expiresAt: ENDS, signupUrl, leaveUrl, site: SITE });
  assert.equal(m.subject, "Your Vibe access code");
  assert.deepEqual(m.code?.value, CODE);
  // The real last moment, in Indiana time, minutes cut (never later than the truth).
  assert.equal(m.code?.note, "Your code works once, until Saturday, October 17 at 2:14 PM EDT.");
  assert.ok(m.text.includes("Your code works once, until Saturday, October 17 at 2:14 PM EDT."));
  assert.ok(!/14 days/.test(JSON.stringify(m)), "no fixed 14 days when the end is known");
  assert.equal(m.button.label, "Create your account");
  assert.equal(m.button.href, signupUrl);
  assert.ok(m.intro.startsWith("Hi Sam, your spot"));
  // School email first (S75): sign up with the school address; a personal one is added later.
  assert.ok(m.notes.some((n) => /Sign up with your school email/.test(n) && /add a personal email once you're in/.test(n)));
  assert.ok(m.notes.some((n) => /just opens the page/.test(n)));
  assert.ok(!m.preheader.includes(CODE) && !/VIBE-/.test(m.preheader), "no code in the lock-screen preview");
  assert.ok(m.notes.some((n) => n.includes("Take me off the list")));
  assert.ok(m.text.includes(`Your access code: ${CODE}`));
  assert.ok(m.text.includes(`Create your account: ${signupUrl}`));
  assert.ok(m.text.includes(`Take me off the list: ${leaveUrl}`));
  noMarkup(m.text);
  sayNothingForbidden(JSON.stringify(m));
  assert.throws(
    () => c.waitlistInviteContent({ name: "Sam", code: "nope", expiresAt: ENDS, signupUrl, leaveUrl, site: SITE }),
    /not an access code/,
  );
  const anon = c.waitlistInviteContent({ name: "  ", code: CODE, expiresAt: ENDS, signupUrl, leaveUrl, site: SITE });
  assert.ok(anon.intro.startsWith("Your spot on Vibe"));
  // An unreadable end never claims more than the 14 days.
  const vague = c.waitlistInviteContent({ name: "Sam", code: CODE, expiresAt: "nope", signupUrl, leaveUrl, site: SITE });
  assert.equal(vague.code?.note, "Your code works once, for up to 14 days.");
  assert.equal(c.codeEndsText("2026-12-01T05:00:00Z"), "Tuesday, December 1 at 12:00 AM EST");
  assert.equal(c.codeEndsText(null), null);
});

test("a typed name is escaped in the HTML and plain in the text", () => {
  const m = c.waitlistInviteContent({
    name: `Sam <b>"x"</b> & 'y'`,
    code: CODE,
    expiresAt: ENDS,
    signupUrl: c.waitlistSignupUrl(SITE, CODE),
    leaveUrl: c.waitlistLeaveUrl(SITE, TOKEN),
    site: SITE,
  });
  assert.ok(m.intro.includes("Sam &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;"));
  assert.ok(!m.intro.includes("<b>"));
  assert.ok(m.text.startsWith(`Hi Sam <b>"x"</b> & 'y', your spot`));
  assert.equal(c.escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("delivery mode for every environment", () => {
  const mode = (nodeEnv: string | undefined, resendKey: string | undefined, resendFrom: string | undefined) =>
    c.waitlistDeliveryMode({ nodeEnv, resendKey, resendFrom });
  assert.equal(mode("production", "re_x", "Vibe <a@b.c>"), "send");
  assert.equal(mode("development", "re_x", "Vibe <a@b.c>"), "send");
  assert.equal(mode("development", "", "Vibe <a@b.c>"), "dev-log");
  assert.equal(mode("development", "re_x", undefined), "dev-log");
  assert.equal(mode("test", undefined, undefined), "dev-log");
  assert.equal(mode(undefined, " ", " "), "dev-log");
  assert.equal(mode("production", "", "Vibe <a@b.c>"), "unconfigured");
  assert.equal(mode("production", "re_x", "  "), "unconfigured");
  assert.equal(mode("production", undefined, undefined), "unconfigured");
});

test("the dev-log line carries the kind, a masked address, the link and the code", () => {
  assert.equal(c.WAITLIST_REPLY_TO, "hello@connectvibe.app");
  assert.equal(
    c.waitlistDevLogLine({ kind: "waitlist_confirm", maskedTo: "s*****@iu.edu", url: "http://localhost:3102/waitlist/confirm?token=t" }),
    "[waitlist-email:dev] waitlist_confirm s*****@iu.edu http://localhost:3102/waitlist/confirm?token=t",
  );
  assert.equal(
    c.waitlistDevLogLine({ kind: "waitlist_invite", maskedTo: "s*****@iu.edu", url: "u", code: CODE, leaveUrl: "l" }),
    `[waitlist-email:dev] waitlist_invite s*****@iu.edu u ${CODE} leave=l`,
  );
});
