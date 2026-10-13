/**
 * Tests for `signin-hint.ts`: the note Forgot password sends to a proven
 * second address ("your account signs in with g•••@gmail.com"), and the shape
 * of the route that sends it (src/app/api/auth/password-reset/route.ts).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/auth/signin-hint.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the pattern of `password-reset-limits.test.ts`.
 *
 * WHY THE RESOLVE HOOK (last section only): one test runs the real route.
 * The route imports "next/server", the service client, the limiter, the two
 * senders and the restriction read; each resolves to a small data: module,
 * and the rest is the real code (the pattern of
 * src/lib/chat/otto-unread-route.test.ts).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

const specifier = "./signin-hint.ts";
const {
  SIGNIN_HINT_SUBJECT,
  hintCandidate,
  hintLookupKey,
  isMaskedSignInEmail,
  maskSignInEmail,
  signinHintDecision,
  signinHintEmail,
} = (await import(specifier)) as typeof import("./signin-hint");

type HintLookup = import("./signin-hint").HintLookup;

const TYPED = "student@iu.edu";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const NOBODY: HintLookup = { signIn: [], school: [], personal: [] };
const lookup = (over: Partial<HintLookup>): HintLookup => ({ ...NOBODY, ...over });
const VERIFIED_SCHOOL = lookup({ school: [{ id: A, school_verified: true }] });

// ---------------------------------------------------------------------------
// The mask
// ---------------------------------------------------------------------------

test("the mask: first character, three dots, the whole part after the @", () => {
  assert.equal(maskSignInEmail("gina@gmail.com"), "g•••@gmail.com");
  assert.equal(maskSignInEmail("fgcazares04@gmail.com"), "f•••@gmail.com");
  assert.equal(maskSignInEmail("someone@mail.iu.edu"), "s•••@mail.iu.edu");
  assert.equal(maskSignInEmail("me@lastname.dev"), "m•••@lastname.dev");
  assert.equal(maskSignInEmail("7up@icloud.com"), "7•••@icloud.com");
});

test("the mask: a one-letter name looks like any other, so the length is never told", () => {
  assert.equal(maskSignInEmail("g@gmail.com"), "g•••@gmail.com");
  assert.equal(maskSignInEmail("gg@gmail.com"), maskSignInEmail(`g${"x".repeat(60)}@gmail.com`));
});

test("the mask: plus-addressing, dots and capitals stay hidden or are lowered", () => {
  assert.equal(maskSignInEmail("gina.lee+vibe@gmail.com"), "g•••@gmail.com");
  assert.equal(maskSignInEmail("g+secret@gmail.com"), "g•••@gmail.com");
  assert.equal(maskSignInEmail("  Gina.Lee@Gmail.COM  "), "g•••@gmail.com");
  assert.equal(maskSignInEmail("gina@gmail.com."), "g•••@gmail.com");
  // Other alphabets: still one letter, by code point.
  assert.equal(maskSignInEmail("élise@gmail.com"), "é•••@gmail.com");
  assert.equal(maskSignInEmail("𝒈ina@gmail.com"), "𝒈•••@gmail.com");
});

test("the mask: odd input is never masked, so no note is sent", () => {
  const odd: unknown[] = [
    null, undefined, 42, {}, [], "", "   ", "nope", "@gmail.com", "gina@", "gina@gmail",
    "a@b@gmail.com", "gi na@gmail.com", "gina@gm ail.com", "gina@gmail.com\nBcc: x@y.com",
    "gina\u0000@gmail.com", "<b>@gmail.com", '"gina"@gmail.com', "&amp;@gmail.com",
    "_gina@gmail.com", "+gina@gmail.com", ".gina@gmail.com", "😀gina@gmail.com",
    "gina@-gmail.com", "gina@gmail..com", "gina@gmail.com/reset", "gina@gmail.com?x=1",
    "gina@<script>.com", "gina@gmäil.com", `${"g".repeat(250)}@gmail.com`,
  ];
  for (const value of odd) assert.equal(maskSignInEmail(value), null, JSON.stringify(value));
});

test("the mask never gives back more than the first character of the name", () => {
  for (const name of ["gina", "g", "gina.lee+vibe", "g1234567890", "élise", "名前", "a_b-c"]) {
    const masked = maskSignInEmail(`${name}@gmail.com`);
    assert.ok(masked, name);
    const shown = masked.slice(0, masked.indexOf("@"));
    assert.deepEqual(Array.from(shown), [Array.from(name)[0], "•", "•", "•"], name);
    assert.ok(isMaskedSignInEmail(masked), name);
  }
});

test("isMaskedSignInEmail: only what the mask makes, never a whole address", () => {
  assert.equal(isMaskedSignInEmail("g•••@gmail.com"), true);
  for (const bad of ["gina@gmail.com", "gi•••@gmail.com", "•••@gmail.com", "g•••@", "g•••@gmail",
    "g•••@gmail.com ", "g•••@gmail.com<a>", "<•••@gmail.com", "g••@gmail.com", "", null, 7]) {
    assert.equal(isMaskedSignInEmail(bad), false, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------
// Who gets a note
// ---------------------------------------------------------------------------

const decide = (over: Partial<Parameters<typeof signinHintDecision>[0]> = {}) =>
  signinHintDecision({ typed: TYPED, lookup: VERIFIED_SCHOOL, restricted: false, signInEmail: "gina@gmail.com", ...over });

test("the lookup key: a column is searched only when the typed address is its stored form", () => {
  assert.equal(hintLookupKey(TYPED, TYPED), TYPED);
  // A dot on the end is stored without it, and shares the plain address's
  // once-a-day count: do not look, so nothing is counted or sent.
  assert.equal(hintLookupKey("student@iu.edu.", TYPED), null);
  assert.equal(hintLookupKey("student@iu.edu..", TYPED), null);
  // The address cannot be in that column at all.
  assert.equal(hintLookupKey(TYPED, null), null);
  const never: Array<[unknown, unknown]> = [
    ["Student@iu.edu", TYPED], [" student@iu.edu", TYPED], ["student@mail.iu.edu", TYPED],
    ["", ""], [null, TYPED], [TYPED, undefined], [7, 7], [null, null],
  ];
  for (const [typed, stored] of never) {
    assert.equal(hintLookupKey(typed, stored), null, JSON.stringify([typed, stored]));
  }
});

test("a verified school email of one account: the note goes, with the masked sign-in address", () => {
  assert.deepEqual(hintCandidate(VERIFIED_SCHOOL), { ok: true, userId: A });
  assert.deepEqual(decide(), { action: "send", userId: A, masked: "g•••@gmail.com" });
});

test("a proven personal email of one account: the same note", () => {
  const personal = lookup({ personal: [{ id: A, personal_email_verified_at: "2026-10-09T12:00:00Z" }] });
  assert.deepEqual(
    decide({ typed: "gina@gmail.com", lookup: personal, signInEmail: "glee@iu.edu" }),
    { action: "send", userId: A, masked: "g•••@iu.edu" },
  );
});

test("a sign-in address never gets a note: the reset email is the answer", () => {
  const signIn = lookup({ signIn: [{ id: A }] });
  assert.deepEqual(hintCandidate(signIn), { ok: false, reason: "sign_in_address" });
  assert.deepEqual(decide({ lookup: signIn }), { action: "none", reason: "sign_in_address" });
  // Even when another account holds it as a proven second address.
  const both = lookup({ signIn: [{ id: A }], school: [{ id: B, school_verified: true }] });
  assert.deepEqual(decide({ lookup: both }), { action: "none", reason: "sign_in_address" });
  // An account that signs in with its own school email (school email first):
  // the sign-in system says it is the same address, so no note.
  const own = lookup({ signIn: [{ id: A }], school: [{ id: A, school_verified: true }] });
  assert.deepEqual(decide({ lookup: own, signInEmail: TYPED }), { action: "none", reason: "same_address" });
  assert.deepEqual(decide({ lookup: own, signInEmail: null }), { action: "none", reason: "no_sign_in_address" });
});

test("an out-of-date copy of the sign-in email does not silence the note: the sign-in system decides", () => {
  // users.email still holds the school address, but the account's sign-in
  // email was changed by hand to a personal one.
  const stale = lookup({ signIn: [{ id: A }], school: [{ id: A, school_verified: true }] });
  assert.deepEqual(hintCandidate(stale), { ok: true, userId: A });
  assert.deepEqual(decide({ lookup: stale, signInEmail: "gina@gmail.com" }), { action: "send", userId: A, masked: "g•••@gmail.com" });
  // Unproven is still unproven.
  const unproven = lookup({ signIn: [{ id: A }], school: [{ id: A, school_verified: false }] });
  assert.deepEqual(decide({ lookup: unproven }), { action: "none", reason: "unverified" });
});

test("an address no account holds: nothing", () => {
  assert.deepEqual(hintCandidate(NOBODY), { ok: false, reason: "unknown" });
  assert.deepEqual(decide({ lookup: NOBODY }), { action: "none", reason: "unknown" });
});

test("an address that was never proven: nothing", () => {
  for (const flag of [false, null, undefined]) {
    const unverified = lookup({ school: [{ id: A, school_verified: flag }] });
    assert.deepEqual(decide({ lookup: unverified }), { action: "none", reason: "unverified" });
  }
  for (const at of [null, undefined, ""]) {
    const unproven = lookup({ personal: [{ id: A, personal_email_verified_at: at }] });
    assert.deepEqual(decide({ lookup: unproven }), { action: "none", reason: "unverified" });
  }
});

test("more than one account holding it: nothing, proven or not", () => {
  const two = lookup({ school: [{ id: A, school_verified: true }], personal: [{ id: B, personal_email_verified_at: "2026-10-09T12:00:00Z" }] });
  assert.deepEqual(decide({ lookup: two }), { action: "none", reason: "ambiguous" });
  const oneProven = lookup({ school: [{ id: A, school_verified: true }, { id: B, school_verified: false }] });
  assert.deepEqual(decide({ lookup: oneProven }), { action: "none", reason: "ambiguous" });
  // The same account found twice is still one account.
  const same = lookup({ school: [{ id: A, school_verified: true }], personal: [{ id: A, personal_email_verified_at: "2026-10-09T12:00:00Z" }] });
  assert.equal(decide({ lookup: same }).action, "send");
});

test("a suspended or banned account gets no note, and neither does one we could not check", () => {
  assert.deepEqual(decide({ restricted: true }), { action: "none", reason: "restricted" });
  assert.deepEqual(decide({ restricted: null }), { action: "none", reason: "restriction_unknown" });
});

test("no sign-in address, the same address, or one that cannot be masked: nothing", () => {
  assert.deepEqual(decide({ signInEmail: null }), { action: "none", reason: "no_sign_in_address" });
  assert.deepEqual(decide({ signInEmail: "  " }), { action: "none", reason: "no_sign_in_address" });
  assert.deepEqual(decide({ signInEmail: " Student@IU.edu " }), { action: "none", reason: "same_address" });
  assert.deepEqual(decide({ signInEmail: "_odd@gmail.com" }), { action: "none", reason: "unmaskable" });
  assert.deepEqual(decide({ signInEmail: "not an address" }), { action: "none", reason: "unmaskable" });
});

test("whatever the decision, the whole sign-in address is never in it", () => {
  const out = JSON.stringify(decide({ signInEmail: "gina.lee+vibe@gmail.com" }));
  assert.ok(out.includes("g•••@gmail.com"));
  assert.ok(!out.includes("gina"));
  assert.ok(!out.includes("vibe"));
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const MASKED = "g•••@gmail.com";
const count = (text: string, piece: string) => text.split(piece).length - 1;

test("the email: plain words, the masked address once, the subject fixed", () => {
  const email = signinHintEmail(MASKED);
  assert.equal(email.subject, "Your Vibe sign-in email");
  assert.equal(email.subject, SIGNIN_HINT_SUBJECT);
  assert.equal(email.text, [
    "Someone asked Vibe for help signing in with this email address.",
    "",
    "Your Vibe account signs in with a different email: g•••@gmail.com",
    "",
    'Use that email on the sign-in page. If you tapped "Forgot?", type that email there in full.',
    "",
    "If this wasn't you, ignore this email. Nothing has changed.",
  ].join("\n"));
  // Never the word "password": beside a partly hidden address it reads like
  // phishing, and Outlook junked the first wording in a school inbox (Oct 13).
  for (const part of [email.subject, email.text, email.html]) {
    assert.ok(!/password/i.test(part), part.slice(0, 60));
  }
  assert.equal(count(email.text, MASKED), 1);
  assert.equal(count(email.html, MASKED), 1);
});

test("the email has no link, no http, and no @ but the masked address's own", () => {
  const email = signinHintEmail(MASKED);
  for (const part of [email.subject, email.text, email.html]) {
    const lower = part.toLowerCase();
    for (const banned of ["http", "www.", "://", "href", "<a ", "<a>", "<img", "<link", "<script", "<button", "src=", "url(", "@import", "@font-face", "mailto", "connectvibe"]) {
      assert.ok(!lower.includes(banned), `${banned} in: ${part.slice(0, 60)}`);
    }
    // No em dash, written out or as an entity.
    assert.ok(!part.includes("—") && !lower.includes("&mdash;"));
  }
  assert.equal(count(email.subject, "@"), 0);
  assert.equal(count(email.text, "@"), 1);
  assert.equal(count(email.html, "@"), 1);
});

test("the email refuses anything that is not a masked address", () => {
  for (const bad of ["gina@gmail.com", "", "g•••@gmail.com<a href=x>", "<b>•••@gmail.com"]) {
    assert.throws(() => signinHintEmail(bad), /masked address/, bad);
  }
});

// ---------------------------------------------------------------------------
// The route's shape (read as text: it imports Next and the service client)
// ---------------------------------------------------------------------------

const route = readFileSync(new URL("../../app/api/auth/password-reset/route.ts", import.meta.url), "utf8");
/** The code only: a comment may name a thing the code must not do. */
const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("route: the answer is built before any lookup, and all of the note's work is after it", () => {
  assert.equal(count(code, "after(async"), 1);
  const afterAt = code.indexOf("after(async");
  const handler = code.slice(code.indexOf("export async function POST"));
  const beforeAfter = handler.slice(0, handler.indexOf("after(async"));
  for (const late of ["sendSigninNote", "generateLink", "sendPasswordResetEmail"]) {
    assert.ok(code.indexOf(late, afterAt) > afterAt, late);
    assert.ok(!beforeAfter.includes(late), `${late} before the answer`);
  }
  // One answer for every address, sent whatever happens after it.
  assert.ok(handler.trimEnd().endsWith("return NextResponse.json(generic);\n}"));
});

test("route: the two private columns are read by exact match, never a pattern", () => {
  assert.ok(code.includes('.eq("school_email", schoolKey)'));
  assert.ok(code.includes('.eq("personal_email", personalKey)'));
  assert.ok(code.includes('.eq("email", email)'));
  for (const loose of [".ilike(", ".like(", ".or(", ".in(", ".textSearch(", ".filter(", ".match("]) {
    assert.ok(!code.includes(loose), loose);
  }
});

test("route: a private column is searched only for a key hintLookupKey let through", () => {
  assert.ok(code.includes("const schoolKey = hintLookupKey(email, normalizeSchoolEmail(email));"));
  assert.ok(code.includes("const personalKey = hintLookupKey(email, normalizePersonalEmail(email));"));
  // The stored forms are made there and nowhere else, so none reaches a
  // read, the daily count or the send without being the typed address.
  assert.equal(count(code, "normalizeSchoolEmail("), 1);
  assert.equal(count(code, "normalizePersonalEmail("), 1);
  assert.equal(count(code, "schoolKey"), 3);
  assert.equal(count(code, "personalKey"), 3);
});

test("route: the note goes to the typed address only, behind its own limit and the reset budget", () => {
  assert.ok(code.includes("sendSigninHintEmail(email, decision.masked, decision.userId)"));
  assert.equal(count(code, "sendSigninHintEmail("), 1);
  // Every ask of the limiter counts. So: the decision first, then once a day
  // for the address, then the budget, then the send. A repeat stops at the
  // second step and the budget only counts a note that is about to go.
  const note = code.slice(code.indexOf("async function sendSigninNote"), code.indexOf("export async function POST"));
  const order = [
    "signinHintDecision(",
    "firstRefusal([resetHintLimit(emailKey)], hit)",
    "firstRefusal(resetSendLimits(), hit)",
    "sendSigninHintEmail(",
  ].map((piece) => note.indexOf(piece));
  assert.ok(order.every((at) => at >= 0), JSON.stringify(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // The limits before the answer are the ones every address gets.
  const handler = code.slice(code.indexOf("export async function POST"));
  assert.ok(!handler.includes("resetHintLimit"));
});

test("route: nothing it logs for the note can hold an address", () => {
  const note = code.slice(code.indexOf("async function sendSigninNote"), code.indexOf("export async function POST"));
  const logged = [...note.matchAll(/console\.(?:error|warn|info|log)\(([\s\S]*?)\);/g)].map((m) => m[1]);
  assert.equal(logged.length, 3);
  for (const args of logged) {
    assert.ok(!/\bemail\b|schoolKey|personalKey|decision|\.message\b/.test(args.replace("redactAddresses(message)", "")), args);
  }
});

// ---------------------------------------------------------------------------
// The route, run for real against stand-ins (the dot on the end)
// ---------------------------------------------------------------------------

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("signin-hint.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (js: string) => `data:text/javascript,${encodeURIComponent(js)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const after = (fn) => { globalThis.__vibeResetNote.afters.push(fn); };\n" +
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/service": dataModule(
    "export const createSupabaseServiceClient = () => globalThis.__vibeResetNote.admin;\nexport const isSupabaseServiceConfigured = () => true;",
  ),
  "@/lib/rate-limit": dataModule(
    "export const clientNetworkKey = () => 'net';\n" +
      "export async function rateLimit(key, opts) { return globalThis.__vibeResetNote.limit(key, opts); }\n" +
      "export const tooManyRequests = () => ({ status: 429, body: null });",
  ),
  "@/lib/email/resend-transactional": dataModule(
    "export async function sendPasswordResetEmail(to) { globalThis.__vibeResetNote.sent.push(['reset', to]); }\n" +
      "export async function sendSigninHintEmail(to, masked) { globalThis.__vibeResetNote.sent.push(['note', to, masked]); }",
  ),
  "@/lib/moderation/access": dataModule("export async function getActiveRestriction() { return { ok: true, restriction: null }; }"),
  "@/lib/auth/site-url": dataModule("export const getSiteUrl = () => 'http://localhost:3000';"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

/** One `users` row; `email` is also what the account signs in with. */
type Account = { id: string; email: string; school_email: string | null; school_verified: boolean; personal_email: string | null; personal_email_verified_at: string | null };
const GINA: Account = { id: A, email: "gina@gmail.com", school_email: "gina@iu.edu", school_verified: true, personal_email: null, personal_email_verified_at: null };

/** The stand-ins for one test: the users table, the sign-in system, the limiter, the two senders. */
function install(accounts: Account[]) {
  const counts = new Map<string, number>();
  const state = {
    afters: [] as Array<() => Promise<void>>,
    sent: [] as string[][],
    /** Each limit asked, by its name without the hash. */
    asked: [] as string[],
    /** Each read of `users`: the column and the value it was searched for. */
    reads: [] as Array<[string, string]>,
    limit(key: string, opts: { limit: number; windowSec: number }) {
      state.asked.push(key.split(":")[0]);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { allowed: n <= opts.limit, retryAfterSec: opts.windowSec };
    },
    admin: {
      from: () => ({
        select: (columns: string) => ({
          eq: (column: keyof Account, value: string) => ({
            limit: async (n: number) => {
              state.reads.push([column, value]);
              const names = columns.split(",").map((c) => c.trim()) as Array<keyof Account>;
              const rows = accounts.filter((a) => a[column] === value).slice(0, n);
              return { data: rows.map((a) => Object.fromEntries(names.map((c) => [c, a[c]]))), error: null };
            },
          }),
        }),
      }),
      auth: {
        admin: {
          async generateLink({ email }: { email: string }) {
            const found = accounts.find((a) => a.email === email);
            if (!found) return { data: { properties: null, user: null }, error: { message: "User with this email not found" } };
            return { data: { properties: { hashed_token: "tok" }, user: { id: found.id } }, error: null };
          },
          async getUserById(id: string) {
            const found = accounts.find((a) => a.id === id);
            return found ? { data: { user: { id, email: found.email } }, error: null } : { data: { user: null }, error: { message: "not found" } };
          },
        },
      },
    },
  };
  (globalThis as unknown as { __vibeResetNote: typeof state }).__vibeResetNote = state;
  return state;
}

const routeSpecifier = "../../app/api/auth/password-reset/route.ts";
install([]);
const { POST } = (await import(routeSpecifier)) as { POST: (req: Request) => Promise<{ status: number; body: unknown }> };

/** One Forgot password request, then everything Next would run after the answer. */
async function forgot(state: ReturnType<typeof install>, typed: string) {
  const answer = await POST(new Request("http://localhost/api/auth/password-reset", { method: "POST", body: JSON.stringify({ email: typed }) }));
  for (const fn of state.afters.splice(0)) await fn();
  return answer;
}

test("route, run for real: a dot on the end finds nobody and counts nothing, and the plain address still gets its note", async (t) => {
  t.mock.method(console, "error", () => {});
  const state = install([GINA]);

  const dotted = await forgot(state, "  Gina@IU.edu. ");
  assert.deepEqual(state.sent, []);
  // The school column is never searched for the stored form of another
  // spelling, and what is searched is what was typed.
  assert.deepEqual(state.reads.map(([column]) => column).sort(), ["email", "personal_email"]);
  assert.ok(state.reads.every(([, value]) => value === "gina@iu.edu."));
  // Only the limits every address gets: the day's one note and the reset
  // emails are not touched.
  assert.deepEqual(state.asked, ["pw-reset-net", "pw-reset-email", "pw-reset-email-day"]);

  // The student types it right, the same day: the note is still theirs, and
  // it goes to the address they typed.
  const plain = await forgot(state, " Gina@IU.edu ");
  assert.deepEqual(state.sent, [["note", "gina@iu.edu", "g•••@gmail.com"]]);
  assert.deepEqual(state.asked.slice(3), ["pw-reset-net", "pw-reset-email", "pw-reset-email-day", "pw-reset-hint-day", "pw-reset-global-hour", "pw-reset-global-day"]);
  // One answer for both.
  assert.deepEqual(plain, dotted);
  assert.equal(plain.status, 200);

  // A third time that day: once is enough.
  await forgot(state, "gina@iu.edu");
  assert.equal(state.sent.length, 1);
});
