/**
 * Every call to a sign-in service route that checks for a person carries the
 * "are you a person" token (pre-registration fix, Oct 2026: a gap its test
 * survey found).
 *
 * Since Oct 12, 2026 Supabase refuses sign-up, password sign-in, code and
 * link sign-in, resend, reset, anonymous and SSO sign-in without a Turnstile
 * token (GoTrue's `verifyCaptcha` on /signup, /token's password grant, /otp,
 * /magiclink, /resend, /recover and /sso). `captcha.test.ts` covers the
 * helpers; nothing caught a NEW call that forgot to use them, which
 * production would refuse while local (no captcha) works fine. So: every
 * such call in `src/` puts `captchaOptions(…)` where auth-js reads the token,
 * `options.captchaToken` (GoTrueClient.js): as the call's `options` value, or
 * spread at the top level of it. `resetPasswordForEmail(email, options)` reads
 * it from its second argument instead. Anywhere else (spread next to `email`,
 * or one level too deep) the request goes out with no token at all.
 *
 * Calls that need no token are left alone: `verifyOtp` (the code box),
 * `updateUser` (PUT /user), `refreshSession`, `exchangeCodeForSession` and the
 * `auth.admin.*` calls on the server.
 *
 * Run with:
 *   node --test src/lib/auth/captcha-calls.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url));
const CHECKED = ["signUp", "signInWithPassword", "signInWithOtp", "resend", "resetPasswordForEmail", "signInAnonymously", "signInWithSSO"];
const CALL = new RegExp(String.raw`\bauth\s*\.\s*(${CHECKED.join("|")})\s*\(`, "g");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** A match on a line that is a comment (`//`, `/*`, or a JSDoc ` * `) is prose, not a call. */
function inComment(src: string, index: number): boolean {
  const line = src.slice(src.lastIndexOf("\n", index) + 1, index).trimStart();
  return line.startsWith("//") || line.startsWith("/*") || line.startsWith("*");
}

/** The text between a call's own parentheses, balanced, from the "(" at `open`. */
function callArguments(src: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < src.length && i < open + 6000; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

/**
 * `text` with its comments and the insides of its strings turned to spaces,
 * so only code counts brackets and commas (a comment like "{ captchaToken }
 * when ready, else nothing" would otherwise split the object it sits in).
 */
function codeOnly(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop - 1;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      out += c + text.slice(i + 1, j).replace(/[^\n]/g, " ") + (j < text.length ? c : "");
      i = j;
    } else {
      out += c;
    }
  }
  return out;
}

/** `text` cut at the commas outside any bracket, trimmed, empty pieces (a trailing comma) dropped. */
function topLevelParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/** The inside of an object literal, or null when `value` is not one. */
function objectBody(value: string): string | null {
  const v = value.trim();
  return v.startsWith("{") && v.endsWith("}") ? v.slice(1, -1) : null;
}

/** `captchaOptions(…)` itself, or an object literal that spreads it at its own top level. */
function givesToken(value: string): boolean {
  if (/^captchaOptions\s*\(/.test(value.trim())) return true;
  const body = objectBody(value);
  return body !== null && topLevelParts(body).some((p) => /^\.\.\.\s*captchaOptions\s*\(/.test(p));
}

/** True when the call's arguments put the token where auth-js reads it. */
function tokenWhereAuthReadsIt(method: string, args: string): boolean {
  const parts = topLevelParts(codeOnly(args));
  // resetPasswordForEmail(email, options): the options are the second argument.
  if (method === "resetPasswordForEmail") return parts[1] !== undefined && givesToken(parts[1]);
  // Every other one: ({ …, options: { …, captchaToken } }).
  const body = parts[0] === undefined ? null : objectBody(parts[0]);
  if (body === null) return false;
  const options = topLevelParts(body).find((p) => /^options\s*:/.test(p));
  return options !== undefined && givesToken(options.replace(/^options\s*:/, ""));
}

type Call = { line: number; method: string; ok: boolean };

/** Every checked call in one file's text, and whether its token sits where auth-js reads it. */
function callsIn(src: string): Call[] {
  const calls: Call[] = [];
  for (const m of src.matchAll(CALL)) {
    const index = m.index ?? 0;
    if (inComment(src, index)) continue;
    const method = m[1] ?? "";
    const args = callArguments(src, index + m[0].length - 1);
    calls.push({
      line: src.slice(0, index).split("\n").length,
      method,
      ok: args !== null && tokenWhereAuthReadsIt(method, args),
    });
  }
  return calls;
}

function findCalls(): (Call & { file: string })[] {
  return sourceFiles(SRC_DIR).flatMap((path) =>
    callsIn(readFileSync(path, "utf8")).map((c) => ({ ...c, file: relative(SRC_DIR, path) })),
  );
}

test("every sign-up, sign-in, resend and reset call passes captchaOptions(...) as its options", () => {
  const missing = findCalls()
    .filter((c) => !c.ok)
    .map((c) => `${c.file}:${c.line} auth.${c.method}(…) has no captchaOptions(…) where auth-js reads the token`);
  assert.deepEqual(missing, []);
});

test("the scan finds today's three calls (so it is not passing on nothing)", () => {
  const found = new Set(findCalls().map((c) => `${c.file.split("\\").join("/")}#${c.method}`));
  for (const known of [
    "app/auth/signup/signup-form.tsx#signUp",
    "app/auth/login/page.tsx#signInWithPassword",
    "components/auth/ResendConfirmation.tsx#resend",
  ]) {
    assert.ok(found.has(known), known);
  }
});

test("the scan itself: a call without the token is caught, prose and admin calls are not", () => {
  const sample = [
    "// supabase.auth.signUp({ email }) in a comment",
    "await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });",
    "await supabase.auth\n  .resend({ type: 'signup', email, options: { ...captchaOptions(human) } });",
    "await service.auth.admin.generateLink({ type: 'recovery', email });",
  ].join("\n");
  assert.deepEqual(callsIn(sample).map(({ method, ok }) => ({ method, ok })), [
    { method: "signInWithOtp", ok: false },
    { method: "resend", ok: true },
  ]);
});

test("the scan itself: the token counts only where auth-js reads it", () => {
  const cases: [string, boolean][] = [
    // Next to `email`, not under options: the request goes out with no token.
    ["await supabase.auth.signInWithOtp({ email, ...captchaOptions(human) });", false],
    ["await supabase.auth.signUp({ email, password, captchaToken: captchaOptions(human) });", false],
    // One level too deep, or only on some paths.
    ["await supabase.auth.signUp({ email, password, options: { data: { ...captchaOptions(human) } } });", false],
    ["await supabase.auth.signInWithPassword({ email, password, options: ok ? captchaOptions(human) : {} });", false],
    ["await supabase.auth.signInAnonymously();", false],
    // The options value itself, or spread at its top level (a comment with braces and commas in it is fine).
    ["await supabase.auth.signInWithPassword({ email, password, options: captchaOptions(human) });", true],
    [
      "await supabase.auth.signUp({\n  email,\n  options: {\n    // { captchaToken } when ready, else nothing, so: no token\n    emailRedirectTo: url(\"a,b\"),\n    ...captchaOptions(human),\n  },\n});",
      true,
    ],
    // resetPasswordForEmail(email, options) reads the second argument itself.
    ["await supabase.auth.resetPasswordForEmail(email, { redirectTo, ...captchaOptions(human) });", true],
    ["await supabase.auth.resetPasswordForEmail(email, captchaOptions(human));", true],
    ["await supabase.auth.resetPasswordForEmail(email, { redirectTo, options: captchaOptions(human) });", false],
    ["await supabase.auth.resetPasswordForEmail(email);", false],
  ];
  for (const [sample, ok] of cases) {
    assert.deepEqual(callsIn(sample).map((c) => c.ok), [ok], sample);
  }
});
