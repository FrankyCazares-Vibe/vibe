#!/usr/bin/env node
// The pre-registration fix, end to end through the real LOCAL Supabase Auth
// (GoTrue) and the three migrations (supabase/migrations/
// 20261022100000_password_needed_column.sql,
// 20261022110000_first_confirm_drops_password.sql and
// 20261022120000_no_self_service_email_change.sql; prereg-design.md section
// 12, "E2E TIER A" and "E2E TIER B"). Modelled on scripts/club-links-e2e.mjs.
//
//   node scripts/prereg-e2e.mjs                                    Tier A, the shared stack
//   node scripts/prereg-e2e.mjs --rehearsal <proxy> [--app <url>]  Tier B, confirmations ON
//                               [--with-rollback]                  ... plus B12 and B0 (see below)
//
// TIER A needs no config change. The shared stack auto-confirms public
// sign-ups (nothing is mailed, so nothing is removed: that is the point of
// the trigger's *_sent_at rule), so every account that should lose its
// password is MAILED first through the admin API: admin.generateLink sets
// confirmation_sent_at (or recovery_sent_at) and hands back the code, without
// sending any email and without changing the stored password. The code is
// then typed through the public API (verifyOtp), which runs GoTrue's own
// Confirm, as a student typing it would.
//
// Cases: A1 a pre-registration (admin createUser, not confirmed, the planted
// password PW_A, the Terms tick, the name 'Planted'; nothing mailed yet,
// backdated two days); A2 generateLink signup on it -> an 8-digit code, the
// same account, confirmation_sent_at set, PW_A still the live password
// ('Email not confirmed'); A3 the code typed -> a session, and the row: no
// password, the flag, no Terms tick or 18+, the name 'Member'; A4 PW_A ->
// invalid_credentials; A5 the code's session sets PW_S with no current
// password, account_password_missing says false, PW_S signs in; A6 control:
// an account made confirmed keeps its password, no flag; A7 a fresh account
// (not backdated), mailed and confirmed at once -> also emptied (no time
// rule: the client must always set the password after the code); A8 never
// mailed a sign-up code, but a recovery code (recovery_sent_at) -> emptied,
// flagged, confirmed; A9 mailed, then updateUserById({password, email_confirm})
// -> the new password works, the Terms tick is cleared, the flag set; A10
// mailed, then updateUserById({email_confirm}) alone -> no password works,
// flagged; A11 never mailed, then updateUserById({email_confirm}) ->
// untouched; A12 on A10's row, a hash written with *_sent_at unchanged ->
// refused (P0001), with them cleared (UpdatePassword's shape) -> allowed, and
// that password signs in; A13 the ROLLBACK in 20261022110000's header, then
// the file applied again, while A7's and A8's emptied accounts still have no
// password (prereg-design.md section 10's "drop the trigger, re-read the
// source, re-apply"): it applies, and with one of them unflagged it stops.
// A13 is ONE transaction that ends in ROLLBACK: the live trigger never goes
// away, other sessions only wait a moment on auth.users.
// The email-change side door (20261022120000): A14 a confirmed account with a
// password and a live session (an attacker's own) asks PUT /user to move onto
// a school address that has not joined -> a 500, and GoTrue's own log
// (docker logs supabase_auth_<project>) shows its email_change write refused
// by the trigger (P0001),
// the account's email unchanged, email_change, its token and sent time empty;
// GoTrue mailed that address BEFORE it wrote (read from the local Mailpit),
// and whatever the mail carries is dead (its /verify link opened the way a
// scanner does, its code typed; with the Change-email notice template it
// carries neither): still the same email, nothing pending; A15 that session
// changes its password -> the new one signs in, the old one does not; A16 the
// admin API's email change (how the team changes one by hand) -> done at
// once, nothing pending, and it signs in at the new address.
//
// TIER B (--rehearsal <proxy>): the second GoTrue with confirmations ON
// (prereg-testing.md section 2: vibe_auth_prereg on 127.0.0.1:54399 behind
// the proxy on 127.0.0.1:54331), the real public sign-up, resend and
// /recover, and the real 8-digit code read from Mailpit. Refused unless the
// proxy's /auth/v1/settings says mailer_autoconfirm false. Local sign-up is
// closed (app_settings.signup_open), so each address is put on
// signup_allowlist first; the gate is not what is under test. Cases: B1 the
// attacker's signUp(PW_A); B2 PW_A -> email_not_confirmed; B3 the student's
// own sign-up on that address (GoTrue keeps PW_A and only mails a new code),
// the code from Mailpit -> emptied, then the sign-up page's step (PW_S, then
// accept-terms) -> PW_S works, PW_A is dead, one 'confirm' row, no flag; B4
// the student types the ATTACKER's original code -> Terms sends them to the
// choose screen, accept-terms answers 409 until PW_S is set, then 'confirm';
// B5 an Oct-8-shape pending account through Log in (email_not_confirmed, a
// resend, the code, PW_S put back) -> Terms shows its form once, 'confirm';
// B6 a scanner fetching an attacker's /recover link (no redirects, no JS) ->
// confirmed, emptied, PW_A dead; the student's sign-up then answers "already
// registered" (422 here, or no identities, by project settings; the page shows
// the "may already have an account" banner for both), and the app's own reset
// (generateLink + verifyOtp + updateUser) gives PW_S; B7 the sign-up page's
// save failed -> the choose screen's "again" copy; B9 that screen reloaded
// shows the form again; B10 signing out there -> the choose screen sends a
// signed-out visitor to Log in, and Forgot password still finishes it.
// --with-rollback (needs --app; it changes the SHARED local database for a
// few seconds, so run it alone): B12 the ROLLBACK in the header for real, and
// an emptied account still reaches the choose screen through Terms; B0, in
// that same window (the deploy window: the code live, the trigger not yet):
// an honest sign-up's password put back answers same_password, and a
// pre-registered one is fixed by the sign-up page alone; then the file is
// applied again as written, its row recorded, and the function's md5 must
// match. If that fails, `finally` tries once more and prints the commands.
// Not here (the browser walk, prereg-design.md section 12): B8 two tabs, B11
// "Secure password change" (a GoTrue setting), and everything a screen shows.
// The app steps (--app <url>: the Next server to ask, any local one, since
// the database and the signing key are shared; its NEXT_PUBLIC_SUPABASE_URL
// must be on the same host name as <proxy>, so the session cookie is
// sb-127-auth-token) are printed as "skip" without --app, and counted.
// The rehearsal image is v2.189.0; production runs v2.197.0 (section 2). Its
// mail today is GoTrue's own default (a link and the code; the copied Vibe
// subject and template do not take), so the code is read from either shape.
//
// Tier A: about 16 sign-ins and 5 code checks; Tier B: about 15 sign-ins, 12
// sign-ups or sends and 10 code checks. GoTrue allows 30 of each per 5
// minutes per IP ([auth.rate_limit]; the rehearsal GoTrue counts its own), so
// wait 5 minutes between runs (or after scripts/club-links-e2e.mjs /
// waitlist-gate-e2e.mjs) if one comes back 429.
//
// SAFETY: the URL and keys come ONLY from `supabase status -o env` (the local
// CLI stack), never a .env file, and anything that isn't 127.0.0.1 /
// localhost is refused, as in scripts/club-links-e2e.mjs. Direct SQL goes
// through `docker exec` into the local stack's own database container, and
// A14 reads only the last seconds of the local GoTrue container's own log.
// --rehearsal, --app and Mailpit (Tier B, and A14 in Tier A) must be
// 127.0.0.1 / localhost too. Every
// account it makes (prereg-<run>-*@iu.edu; mail goes only to the local
// Mailpit, never out) is deleted in `finally` with its allowlist rows, its
// accept-terms limiter rows and exactly the Mailpit messages sent to it (by
// ID: Mailpit's delete with no IDs empties the shared box), and the run fails
// unless a count of what is left reads zero.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE =
  "Usage: node scripts/prereg-e2e.mjs [--rehearsal <http://127.0.0.1:54331> [--app <http://127.0.0.1:3100>] [--with-rollback]]";
const isLocalHost = (h) => h === "127.0.0.1" || h === "localhost";

// Tier B's flags (prereg-design.md section 12): the rehearsal proxy, the
// Next server for the app steps, and the opt-in rollback window.
const args = process.argv.slice(2);
let rehearsal = null;
let appUrl = null;
let withRollback = false;
function localUrl(flag, raw) {
  let u = null;
  try {
    u = new URL(raw ?? "");
  } catch {
    u = null;
  }
  if (!u || u.protocol !== "http:" || !isLocalHost(u.hostname)) {
    console.error(`Refusing: ${flag} must be an http://127.0.0.1 / localhost URL.`);
    process.exit(1);
  }
  return u;
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--rehearsal" && !rehearsal) rehearsal = localUrl("--rehearsal", args[++i]);
  else if (args[i] === "--app" && !appUrl) appUrl = localUrl("--app", args[++i]);
  else if (args[i] === "--with-rollback") withRollback = true;
  else {
    console.error(USAGE);
    process.exit(1);
  }
}
if ((appUrl || withRollback) && !rehearsal) {
  console.error(`--app and --with-rollback belong to Tier B (--rehearsal).\n${USAGE}`);
  process.exit(1);
}
if (withRollback && !appUrl) {
  console.error("--with-rollback needs --app: B12 is the app's answer while the trigger is gone.");
  process.exit(1);
}

function readLocalStatus() {
  const res = spawnSync("supabase", ["status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (res.error || res.status !== 0) {
    console.error("Refusing: `supabase status -o env` failed. Start the local stack with `supabase start`.");
    process.exit(1);
  }
  const env = {};
  for (const line of res.stdout.split("\n")) {
    const m = line.trim().match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const STATUS = readLocalStatus();
const API_URL = STATUS.API_URL ?? "";
let apiHost = "";
try {
  apiHost = new URL(API_URL).hostname;
} catch {
  // refused just below
}
if (!isLocalHost(apiHost)) {
  console.error("Refusing: `supabase status` reports a stack that isn't on 127.0.0.1 / localhost.");
  process.exit(1);
}
if (!STATUS.SERVICE_ROLE_KEY || !STATUS.ANON_KEY) {
  console.error("Refusing: SERVICE_ROLE_KEY or ANON_KEY missing from `supabase status -o env`.");
  process.exit(1);
}

// The local stack's database container is supabase_db_<project_id>.
const PROJECT_ID = readFileSync(join(REPO_ROOT, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!PROJECT_ID || !/^[a-z0-9_-]+$/i.test(PROJECT_ID)) {
  console.error("Refusing: no project_id in supabase/config.toml.");
  process.exit(1);
}
const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;

/** Runs SQL as postgres inside the local database container; returns the unaligned output. */
function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`psql: ${(r.stderr || r.error?.message || "").trim()}`);
  return r.stdout.trim();
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// The three migrations must be in, or the cases below would fail for the wrong reason.
if (psql(`select (to_regprocedure('public.account_password_missing(uuid)') is not null
    and exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
                 and tgname = 'first_confirm_drops_password' and tgenabled = 'O')
    and exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
                 and tgname = 'no_self_service_email_change' and tgenabled = 'O'))::text;`) !== "true") {
  console.error("Refusing: apply 20261022100000, 20261022110000 and 20261022120000 to the local stack first.");
  process.exit(1);
}

// Tier B's own gate: confirmations really ON behind the proxy, the local
// Mailpit, and the allowlist table that lets a test address past the closed gate.
const MAILPIT = STATUS.MAILPIT_URL ?? STATUS.INBUCKET_URL ?? "";
let rehearsalVersion = "";
if (rehearsal) {
  const getJson = (path) =>
    fetch(new URL(path, rehearsal), { headers: { apikey: STATUS.ANON_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  const settings = await getJson("/auth/v1/settings");
  if (settings?.mailer_autoconfirm !== false) {
    console.error("Refusing: the --rehearsal proxy's /auth/v1/settings does not say mailer_autoconfirm false (is it the rehearsal GoTrue?).");
    process.exit(1);
  }
  rehearsalVersion = String((await getJson("/auth/v1/health"))?.version ?? "?");
  let mailHost = "";
  try {
    mailHost = new URL(MAILPIT).hostname;
  } catch {
    // refused just below
  }
  const box = isLocalHost(mailHost) ? await fetch(`${MAILPIT}/api/v1/search?query=prereg-e2e-probe&limit=1`).catch(() => null) : null;
  if (!box?.ok) {
    console.error("Refusing: no local Mailpit (MAILPIT_URL from `supabase status`) answers on 127.0.0.1 / localhost.");
    process.exit(1);
  }
  if (psql("select (to_regclass('public.signup_allowlist') is not null)::text;") !== "true") {
    console.error("Refusing: public.signup_allowlist is missing (the waitlist migrations).");
    process.exit(1);
  }
}

// Loaded only after the gate has passed (Node strips their types).
const { createClient } = await import("@supabase/supabase-js");
const { TERMS_VERSION, TERMS_METADATA_KEYS } = await import(pathToFileURL(join(REPO_ROOT, "src/lib/legal/terms.ts")).href);

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(API_URL, STATUS.SERVICE_ROLE_KEY, CLIENT_OPTS);
// A fresh browser-like client each time; it keeps its own session in memory.
const publicClient = () => createClient(API_URL, STATUS.ANON_KEY, CLIENT_OPTS);

const RUN = randomBytes(5).toString("hex");
const TAG = `prereg-${RUN}`;
const pw = (who) => `${who}-${randomBytes(12).toString("base64url")}aA1`;
const PW_A = pw("planted");   // the first signer's (the attacker's) password
const PW_S = pw("student");   // the inbox holder's
const school = (label) => `${TAG}-${label}@iu.edu`;
// What a sign-up leaves in the metadata: the Terms tick and 18+, and a name
// a direct API caller chose.
const PLANTED_META = { [TERMS_METADATA_KEYS.version]: TERMS_VERSION, [TERMS_METADATA_KEYS.age]: true, full_name: "Planted" };

const made = [];   // every account id this run made, for the clean-up count
let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
  }
}
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const describe = (r) => (r.error ? `${r.error.status} ${r.error.code ?? ""} ${r.error.message}` : "no error");

/** A pending account made through the admin API: never mailed, so both *_sent_at are NULL. */
async function pending(label) {
  const r = await admin.auth.admin.createUser({ email: school(label), password: PW_A, email_confirm: false, user_metadata: PLANTED_META });
  const id = must(r, `create ${label}`).user.id;
  made.push(id);
  return id;
}

/** "Mails" it a sign-up code the admin way (sets confirmation_sent_at; no email is sent, the
 *  stored password is left alone). Returns generateLink's data: properties.email_otp is the code. */
async function mailSignupCode(label) {
  const r = await admin.auth.admin.generateLink({ type: "signup", email: school(label), password: pw("ignored") });
  return must(r, `generateLink signup ${label}`);
}

/** The code typed through the public API, on a fresh client; returns { client, result }. */
async function typeCode(label, code) {
  const client = publicClient();
  const result = await client.auth.verifyOtp({ email: school(label), token: code, type: "email" });
  return { client, result };
}

/** A password sign-in: "session", or the error code ("invalid_credentials", "email_not_confirmed", ...). */
async function signIn(label, password) {
  const r = await publicClient().auth.signInWithPassword({ email: school(label), password });
  if (!r.error && r.data?.session?.access_token) return "session";
  return r.error?.code ?? `${r.error?.status ?? "?"} ${r.error?.message ?? "no session"}`;
}

/** The row as the trigger leaves it (local test rows only). */
function row(id) {
  return JSON.parse(psql(`select json_build_object(
      'pw', coalesce(a.encrypted_password, '') <> '', 'pw_null', a.encrypted_password is null,
      'confirmed', a.email_confirmed_at is not null,
      'csent', a.confirmation_sent_at is not null, 'rsent', a.recovery_sent_at is not null,
      'flag', u.password_needed_at is not null,
      'terms', (u.terms_version is not null or u.terms_accepted_at is not null or u.age_attested_at is not null),
      'name', u.name)
    from auth.users a left join public.users u on u.id = a.id where a.id = ${lit(id)};`));
}
const show = (r) => JSON.stringify(r);
/** "emptied": the planted password, Terms tick and name are gone and the flag is up. */
const emptied = (r) => r.confirmed && r.pw_null && r.flag && !r.terms && r.name === "Member";
const untouched = (r) => r.pw && !r.flag && r.terms && r.name === "Planted";

async function missing(id) {
  const r = await admin.rpc("account_password_missing", { p_user: id });
  return r.error ? `error ${r.error.code}` : r.data;
}

async function cases() {
  // A1: the pre-registration, made two days ago.
  const id1 = await pending("a1");
  psql(`update auth.users set created_at = now() - interval '2 days' where id = ${lit(id1)};`);
  const r1 = row(id1);
  check("A1 a pending account with the planted password, Terms tick and name 'Planted'; nothing mailed yet",
    untouched(r1) && !r1.confirmed && !r1.csent && !r1.rsent, show(r1));

  // A2: a sign-up code for it (what a student's own sign-up or a resend does).
  const link2 = await mailSignupCode("a1");
  const code = link2.properties?.email_otp ?? "";
  check("A2 generateLink signup -> an 8-digit code for the same account", /^\d{8}$/.test(code) && link2.user?.id === id1,
    `${code.length} digits, user ${link2.user?.id}`);
  const r2 = row(id1);
  check("A2 ... confirmation_sent_at is now set, nothing else changed", r2.csent && untouched(r2) && !r2.confirmed, show(r2));
  const oracle = await signIn("a1", PW_A);
  check("A2 ... PW_A is still the stored password ('Email not confirmed', the oracle that exists before the code)",
    oracle === "email_not_confirmed", oracle);

  // A3: the inbox holder types the code.
  const { client: student, result: v3 } = await typeCode("a1", code);
  check("A3 the code typed (verifyOtp, type email) -> a session", !v3.error && Boolean(v3.data?.session?.access_token), describe(v3));
  const r3 = row(id1);
  check("A3 ... the row: confirmed, password NULL, the flag, no Terms tick or 18+, the name 'Member'", emptied(r3), show(r3));
  check("A3 ... account_password_missing -> true", (await missing(id1)) === true, String(await missing(id1)));

  // A4: the planted password is dead.
  const a4 = await signIn("a1", PW_A);
  check("A4 PW_A -> invalid_credentials", a4 === "invalid_credentials", a4);

  // A5: the code's own session chooses the password (no current password asked).
  const up5 = await student.auth.updateUser({ password: PW_S });
  check("A5 the code's session sets PW_S with no current password", !up5.error, describe(up5));
  check("A5 ... account_password_missing -> false", (await missing(id1)) === false, String(await missing(id1)));
  const a5 = await signIn("a1", PW_S);
  check("A5 ... PW_S signs in", a5 === "session", a5);
  const r5 = row(id1);
  check("A5 ... the flag stays up until accept-terms clears it", r5.pw && r5.flag && r5.confirmed, show(r5));

  // A6: control. Made confirmed (the seeds' and review accounts' shape).
  const c6 = await admin.auth.admin.createUser({ email: school("a6"), password: PW_A, email_confirm: true, user_metadata: PLANTED_META });
  const id6 = must(c6, "create a6").user.id;
  made.push(id6);
  const r6 = row(id6);
  check("A6 control: createUser(email_confirm: true) keeps its password, Terms tick and name; no flag",
    untouched(r6) && r6.confirmed, show(r6));
  const a6 = await signIn("a6", PW_A);
  check("A6 ... and it signs in", a6 === "session", a6);

  // A7: fresh, mailed and confirmed at once. No time rule: also emptied.
  const id7 = await pending("a7");
  const link7 = await mailSignupCode("a7");
  const { result: v7 } = await typeCode("a7", link7.properties?.email_otp ?? "");
  const r7 = row(id7);
  check("A7 a fresh account (seconds old), mailed and confirmed -> also emptied (the client must always set the password)",
    !v7.error && emptied(r7), `${describe(v7)} ${show(r7)}`);
  const a7 = await signIn("a7", PW_A);
  check("A7 ... its password -> invalid_credentials", a7 === "invalid_credentials", a7);

  await laterCases();
}

async function laterCases() {
  // A8: never sent a sign-up code, but a recovery code (GoTrue's /recover, or
  // the app's own reset): recovery_sent_at alone is enough.
  const id8 = await pending("a8");
  const link8 = must(await admin.auth.admin.generateLink({ type: "recovery", email: school("a8") }), "generateLink recovery a8");
  const r8a = row(id8);
  check("A8 (a recovery code is out: recovery_sent_at set, confirmation_sent_at not)", r8a.rsent && !r8a.csent && untouched(r8a), show(r8a));
  const v8 = await publicClient().auth.verifyOtp({ token_hash: link8.properties?.hashed_token ?? "", type: "recovery" });
  const r8 = row(id8);
  check("A8 verifyOtp(token_hash, recovery) -> a session, and the account confirmed, emptied and flagged",
    !v8.error && Boolean(v8.data?.session) && emptied(r8), `${describe(v8)} ${show(r8)}`);
  const a8 = await signIn("a8", PW_A);
  check("A8 ... its password -> invalid_credentials", a8 === "invalid_credentials", a8);

  // A9: mailed, then an admin confirm WITH a password (local-seed's shape):
  // Confirm empties it, then UpdatePassword writes the new one.
  const id9 = await pending("a9");
  await mailSignupCode("a9");
  const NEW9 = pw("admin");
  must(await admin.auth.admin.updateUserById(id9, { password: NEW9, email_confirm: true }), "update a9");
  const r9 = row(id9);
  check("A9 mailed + updateUserById({password, email_confirm}) -> confirmed, the Terms tick cleared, the flag up",
    r9.confirmed && r9.pw && r9.flag && !r9.terms && r9.name === "Member" && !r9.csent, show(r9));
  const [a9new, a9old] = [await signIn("a9", NEW9), await signIn("a9", PW_A)];
  check("A9 ... the new password signs in, PW_A does not", a9new === "session" && a9old === "invalid_credentials", `${a9new} / ${a9old}`);
  check("A9 ... account_password_missing -> false", (await missing(id9)) === false, String(await missing(id9)));

  // A10: mailed, then an admin confirm alone (a founder's "Confirm user").
  const id10 = await pending("a10");
  await mailSignupCode("a10");
  must(await admin.auth.admin.updateUserById(id10, { email_confirm: true }), "update a10");
  const r10 = row(id10);
  check("A10 mailed + updateUserById({email_confirm}) -> emptied and flagged (confirmation_sent_at still set)",
    emptied(r10) && r10.csent, show(r10));
  const a10 = await signIn("a10", PW_A);
  check("A10 ... no password works (PW_A -> invalid_credentials)", a10 === "invalid_credentials", a10);
  check("A10 ... account_password_missing -> true", (await missing(id10)) === true, String(await missing(id10)));

  // A11: never mailed, then an admin confirm: nothing to remove.
  const id11 = await pending("a11");
  must(await admin.auth.admin.updateUserById(id11, { email_confirm: true }), "update a11");
  const r11 = row(id11);
  check("A11 never mailed + updateUserById({email_confirm}) -> untouched", r11.confirmed && untouched(r11), show(r11));
  const a11 = await signIn("a11", PW_A);
  check("A11 ... its password signs in", a11 === "session", a11);

  // A12: arm 2 on A10's row, from another request (this psql session).
  const PW_R = pw("restored");
  const tryWrite = (extra) => psql(`
    create function pg_temp.try(p_sql text) returns text language plpgsql as $f$
    begin execute p_sql; return 'ok'; exception when others then return 'E' || sqlstate; end $f$;
    select pg_temp.try(format('update auth.users set encrypted_password = extensions.crypt(%L, extensions.gen_salt(''bf'', 10)),
      updated_at = now()${extra} where id = %L', ${lit(PW_R)}, ${lit(id10)}));`);
  const w12a = tryWrite("");
  check("A12 a hash written onto A10's row with *_sent_at unchanged (the re-encrypt shape) -> refused P0001", w12a === "EP0001", w12a);
  const r12a = row(id10);
  check("A12 ... the row still has no password", r12a.pw_null && r12a.flag, show(r12a));
  // Inside format()'s quoted text, so each empty SQL string is written as four quotes.
  const w12b = tryWrite(", confirmation_token = '''', confirmation_sent_at = null, recovery_token = '''', recovery_sent_at = null");
  check("A12 the same hash in UpdatePassword's shape (*_sent_at cleared) -> allowed", w12b === "ok", w12b);
  const a12 = await signIn("a10", PW_R);
  check("A12 ... and that password signs in", a12 === "session", a12);

  await emailChangeCases();
  await rollbackRehearsal();
}

/** The sign-in email and the email-change columns, as GoTrue left them (local test rows only). */
const emailRow = (id) => JSON.parse(psql(`select json_build_object('email', email,
    'pending', coalesce(email_change, ''), 'token', coalesce(email_change_token_new, ''), 'sent', email_change_sent_at is not null)
  from auth.users where id = ${lit(id)};`));
const nothingPending = (r) => r.pending === "" && r.token === "" && !r.sent;

/** A14 to A16: the email-change side door (20261022120000), on the shared stack. */
async function emailChangeCases() {
  let mailHost = "";
  try {
    mailHost = new URL(MAILPIT).hostname;
  } catch {
    // refused just below
  }
  if (!isLocalHost(mailHost)) throw new Error("A14 reads the local Mailpit, and MAILPIT_URL is not on 127.0.0.1 / localhost");
  // An attacker's own account: confirmed, a known password, a live session.
  const id14 = must(await admin.auth.admin.createUser({ email: school("a14"), password: PW_A, email_confirm: true }), "create a14").user.id;
  made.push(id14);
  const s14 = publicClient();
  const in14 = await s14.auth.signInWithPassword({ email: school("a14"), password: PW_A });
  check("A14 (a confirmed account with a password and a live session)", !in14.error && Boolean(in14.data?.session), describe(in14));
  const target = school("a14-target");   // a student's school address that has not joined
  const before = await mailIds(target);
  mailAddrs.add(school("a14"));   // Secure email change mails the current address too: clean-up deletes it
  const since = new Date(Date.now() - 2000).toISOString();
  const e14 = await s14.auth.updateUser({ email: target });
  // supabase-js gets GoTrue's "Error sending email change email"; GoTrue's own log names the refusal.
  const log = spawnSync("docker", ["logs", "--since", since, `supabase_auth_${PROJECT_ID}`], { encoding: "utf8" });
  const refusal = `${log.stdout ?? ""}\n${log.stderr ?? ""}`.split("\n")
    .find((l) => l.includes("Database error updating user for email change") && l.includes("no_self_service_email_change")) ?? "";
  check("A14 PUT /user {email: a school address not yet joined} -> 500, and GoTrue's log: its email_change write refused by the trigger (P0001)",
    e14.error?.status === 500 && refusal.includes("SQLSTATE P0001"),
    `${describe(e14)}; log: ${refusal.slice(0, 160) || (log.error?.message ?? "no such line")}`);
  const r14 = emailRow(id14);
  check("A14 ... the account's email unchanged; email_change, its token and its sent time empty",
    r14.email === school("a14") && nothingPending(r14), show(r14));
  // GoTrue sends before it writes (mail.go:549 vs :565): the mail goes out, the write is refused.
  const mail = await nextMail(target, before, async (m) => m);
  check("A14 ... GoTrue still mailed that address (it sends before it writes)", Boolean(mail), "no new message in Mailpit");
  if (mail) {
    const body = await mailBody(mail);
    const link = /(https?:\/\/[^"'\s<>]+\/verify\?[^"'\s<>]+)/.exec(body)?.[1] ?? null;
    const code = /enter the code:\s*(\d{6,10})\b/i.exec(body)?.[1] ?? null;
    const tried = [];
    let dead = true;
    if (link) {
      let host = "";
      try {
        host = new URL(link).hostname;
      } catch {
        // not a link: counted as not dead below
      }
      const g = isLocalHost(host) ? await fetch(link, { redirect: "manual" }) : null;
      const to = g?.headers.get("location") ?? "";
      dead &&= Boolean(g) && g.status >= 300 && g.status < 400 && /error/.test(to);
      tried.push(`link ${g?.status ?? "not local"} ${to.slice(0, 80)}`);
    }
    if (code) {
      const v = await publicClient().auth.verifyOtp({ email: target, token: code, type: "email_change" });
      dead &&= Boolean(v.error);
      tried.push(`code: ${describe(v)}`);
    }
    const r = emailRow(id14);
    check("A14 ... and whatever it carries is dead (a scanner's GET of its link, its code typed, or a notice with neither)",
      dead && r.email === school("a14") && nothingPending(r), `${tried.join("; ") || "a notice: no link, no code"} ${show(r)}`);
  }

  // A15: the same session changes its password (the trigger reads only email_change).
  const PW_N = pw("changed");
  const p15 = await s14.auth.updateUser({ password: PW_N });
  check("A15 that session changes its password -> ok", !p15.error, describe(p15));
  const [a15n, a15o] = [await signIn("a14", PW_N), await signIn("a14", PW_A)];
  check("A15 ... the new password signs in, the old one does not", a15n === "session" && a15o === "invalid_credentials", `${a15n} / ${a15o}`);

  // A16: the admin API's email change (SetEmail writes `email` only): how the team changes one by hand.
  const moved = school("a14-moved");
  const u16 = await admin.auth.admin.updateUserById(id14, { email: moved });
  const r16 = emailRow(id14);
  check("A16 the admin API's email change -> done at once, nothing pending", !u16.error && r16.email === moved && nothingPending(r16),
    `${describe(u16)} ${show(r16)}`);
  const a16 = await signIn("a14-moved", PW_N);
  check("A16 ... and it signs in at the new address", a16 === "session", a16);
}

const B_FILE = join(REPO_ROOT, "supabase/migrations/20261022110000_first_confirm_drops_password.sql");

/** 20261022110000 as written: its header's three ROLLBACK lines, the file itself, and the file with
 *  its BEGIN dropped and its COMMIT made a ROLLBACK (so a run inside another transaction is undone). */
function bFile() {
  const raw = readFileSync(B_FILE, "utf8");
  const rollback = [...raw.matchAll(/^-- {3}((?:drop trigger|drop function|delete from supabase_migrations)[^\n]*;)$/gm)].map((m) => m[1]);
  if (rollback.length !== 3 || (raw.match(/^begin;$/gm) ?? []).length !== 1 || !/\ncommit;\s*$/.test(raw)) {
    throw new Error("20261022110000 changed shape (its ROLLBACK lines, BEGIN or COMMIT): re-read A13 and B12");
  }
  const undone = raw.replace(/^begin;$/m, "").replace(/\ncommit;\s*$/, "\nrollback;\n");
  return { raw, rollback, undone };
}

/** psql keeping stderr (the NOTICEs and the error): { ok, err }. */
function psqlRun(sql) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  return { ok: !r.error && r.status === 0, err: (r.stderr || r.error?.message || "").trim() };
}
const notices = (err) => err.split("\n").filter((l) => /NOTICE|ERROR/.test(l)).join(" | ");
const liveB = () => psql(`select concat_ws(' ',
    (select string_agg(tgenabled::text, '') from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'first_confirm_drops_password'),
    (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid = to_regprocedure('auth_hooks.first_confirm_drops_password()')),
    (select count(*) from supabase_migrations.schema_migrations where version = '20261022110000'));`);

/** A13: section 10's recovery plan (drop the trigger, re-read the source, re-apply) while accounts it
 *  emptied are still waiting. ONE transaction that ends in ROLLBACK, so the live trigger never goes. */
async function rollbackRehearsal() {
  const ids = `${lit(`{${made.join(",")}}`)}::uuid[]`;
  const waiting = psql(`select coalesce(string_agg(a.id::text, ' '), '') from auth.users a join public.users u on u.id = a.id
     where a.id = any(${ids}) and a.email_confirmed_at is not null and coalesce(a.encrypted_password, '') = ''
       and u.password_needed_at is not null;`).split(" ").filter(Boolean);
  check("A13 (this run's emptied accounts still without a password: A7 and A8)", waiting.length >= 2, String(waiting.length));
  const before = liveB();
  const { rollback, undone } = bFile();
  const head = "begin;\nset local lock_timeout = '5s';\n";
  const r1 = psqlRun(`${head}${rollback.join("\n")}\n${undone}`);
  const counted = Number(/(\d+) emptied account\(s\) still choosing a password/.exec(r1.err)?.[1] ?? -1);
  const md5 = /md5 is ([0-9a-f]{32})/.exec(r1.err)?.[1] ?? "";
  check("A13 the header's ROLLBACK, then the file again with them present -> it applies, counts them, same md5 (rolled back)",
    r1.ok && counted >= waiting.length && before.split(" ")[1] === md5, `${counted} counted; ${notices(r1.err)}`);
  const unflag = `update public.users set password_needed_at = null where id = ${lit(waiting[0] ?? "")};\n`;
  const r2 = psqlRun(`${head}${unflag}${rollback.join("\n")}\n${undone}`);
  check("A13 ... with one of them unflagged, the pre-flight stops the file",
    !r2.ok && r2.err.includes("a confirmed account already has no password and no password_needed_at"), notices(r2.err));
  const after = liveB();
  check("A13 ... both runs left nothing behind: the live trigger, its md5 and its row as before, the flag still up",
    after === before && before.startsWith("O ") && row(waiting[0] ?? made[0]).flag, `${before} -> ${after}`);
}

// ---------------------------------------------------------------------------
// TIER B: the rehearsal GoTrue (confirmations ON), Mailpit, and the app.

/** A browser-like client on the rehearsal GoTrue (the proxy). */
const rclient = () => createClient(rehearsal.origin, STATUS.ANON_KEY, CLIENT_OPTS);
// The student's sign-up page sends the Terms tick and 18+, no name.
const STUDENT_META = { [TERMS_METADATA_KEYS.version]: TERMS_VERSION, [TERMS_METADATA_KEYS.age]: true };
const allowlisted = [];
const mailAddrs = new Set();
const mailSeen = new Set();
let skipped = 0;
let bDropped = false;   // B12 has the trigger off: `finally` must put it back
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Past the closed local gate: this address on signup_allowlist (deleted in clean-up). */
async function allow(label) {
  const r = await admin.from("signup_allowlist").insert({ email: school(label), reason: "manual", note: "prereg-e2e" });
  if (r.error) throw new Error(`allowlist ${label}: ${r.error.message}`);
  allowlisted.push(school(label));
}

/** A public sign-up through the rehearsal GoTrue; a new account's id joins `made`. */
async function rSignUp(label, password, data) {
  const r = await rclient().auth.signUp({ email: school(label), password, options: { data } });
  const id = r.data?.user?.id;
  if (id && (r.data.user.identities?.length ?? 0) > 0 && !made.includes(id)) made.push(id);
  return r;
}

/** A password sign-in on the rehearsal GoTrue: "session" or the error code. */
async function rSignIn(label, password) {
  const r = await rclient().auth.signInWithPassword({ email: school(label), password });
  if (!r.error && r.data?.session?.access_token) return "session";
  return r.error?.code ?? `${r.error?.status ?? "?"} ${r.error?.message ?? "no session"}`;
}

/** Mailpit's messages to this address (newest first). */
async function mailTo(addr) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${addr}"`)}&limit=50`);
  return res.ok ? ((await res.json()).messages ?? []) : [];
}
const mailIds = async (addr) => new Set((await mailTo(addr)).map((m) => m.ID));

/** The first message to `addr` that is not in `before` and that `pick` reads a value from (~15 s). */
async function nextMail(addr, before, pick) {
  mailAddrs.add(addr);
  for (let i = 0; i < 30; i++) {
    for (const m of await mailTo(addr)) {
      if (before.has(m.ID)) continue;
      mailSeen.add(m.ID);
      const got = await pick(m);
      if (got) return got;
    }
    await sleep(500);
  }
  return null;
}
const mailBody = async (m) => {
  const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
  return `${full.HTML ?? ""}\n${full.Text ?? ""}`.replace(/&amp;/g, "&");
};
/** The sign-up code: in Vibe's subject ("NNNNNNNN is your Vibe code", config.toml), or, as the rehearsal
 *  GoTrue sends today, in GoTrue's own "Confirm Your Email" body ("enter the code: NNNNNNNN"). */
async function codeIn(m) {
  const subject = /^(\d{8}) is your Vibe code$/.exec(m.Subject ?? "")?.[1];
  if (subject) return subject;
  if (!/confirm your email/i.test(m.Subject ?? "")) return null;
  return /enter the code:\s*(\d{8})\b/i.exec(await mailBody(m))?.[1] ?? null;
}
/** A /verify link in the body (GoTrue's own recovery template on the rehearsal). */
async function linkIn(m) {
  if (/confirm your email|is your Vibe code/i.test(m.Subject ?? "")) return null;
  return /(https?:\/\/[^"'\s<>]+\/verify\?[^"'\s<>]+)/.exec(await mailBody(m))?.[1] ?? null;
}

/** "Signed up long ago": created and mailed two hours back (also past GoTrue's 60 s per-address wait). */
const backdate = (id) =>
  psql(`update auth.users set created_at = now() - interval '2 hours', confirmation_sent_at = now() - interval '2 hours' where id = ${lit(id)};`);
/** Its Terms history, oldest first: "signup,confirm" and so on. */
const sources = (id) =>
  psql(`select coalesce(string_agg(source, ',' order by accepted_at, source), '') from public.terms_acceptances where user_id = ${lit(id)};`);

// The app: @supabase/ssr's cookie for a session (cookie.mjs's encoding, 3180-character chunks).
const COOKIE = `sb-${rehearsal?.hostname.split(".")[0] ?? "127"}-auth-token`;
function cookieFor(session) {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  if (value.length <= 3180) return `${COOKIE}=${value}`;
  const parts = [];
  for (let i = 0, n = 0; i < value.length; i += 3180, n++) parts.push(`${COOKIE}.${n}=${value.slice(i, i + 3180)}`);
  return parts.join("; ");
}
/** One request to the Next server, redirects not followed: { status, to (path + query), text }. */
async function app(path, session, init = {}) {
  const headers = { ...(init.headers ?? {}), ...(session ? { cookie: cookieFor(session) } : {}) };
  const res = await fetch(new URL(path, appUrl), { ...init, headers, redirect: "manual" });
  const loc = res.headers.get("location");
  const to = loc ? `${new URL(loc, appUrl).pathname}${new URL(loc, appUrl).search}` : "";
  return { status: res.status, to, text: await res.text() };
}
const acceptTerms = (session) => app("/api/me/accept-terms", session, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ terms_version: TERMS_VERSION }),
});
/** A check that needs the app: printed "skip" and counted without --app. `run` returns [ok, detail]. */
async function appCheck(label, run) {
  if (!appUrl) {
    skipped += 1;
    console.log(`skip ${label} (needs --app)`);
    return;
  }
  const [ok, detail] = await run();
  check(label, ok, detail);
}

/** The code mailed to `label` after `before`, typed on a fresh rehearsal client: { client, v, session }. */
async function typeMailedCode(label, before) {
  const code = await nextMail(school(label), before, codeIn);
  const client = rclient();
  const v = await client.auth.verifyOtp({ email: school(label), token: code ?? "", type: "email" });
  return { client, v, session: v.data?.session ?? null, code };
}

async function rehearsalCases() {
  // B1, B2: the attacker gets to a student's address first, through the public API.
  await allow("b1");
  const a1 = await rSignUp("b1", PW_A, PLANTED_META);
  const idB = a1.data?.user?.id ?? "";
  check("B1 the attacker's public signUp(PW_A) -> an account and no session (confirmations ON)",
    !a1.error && Boolean(idB) && !a1.data?.session, describe(a1));
  const code1 = await nextMail(school("b1"), new Set(), codeIn);
  check("B1 ... and Mailpit holds its 8-digit code", /^\d{8}$/.test(code1 ?? ""), String(code1));
  const b2 = await rSignIn("b1", PW_A);
  check("B2 PW_A -> email_not_confirmed (set and correct, not usable yet)", b2 === "email_not_confirmed", b2);
  backdate(idB);

  // B3: the student's own sign-up on the sign-up page, on that same address.
  const before3 = await mailIds(school("b1"));
  const s3 = await rSignUp("b1", PW_S, STUDENT_META);
  check("B3 the student's signUp(PW_S) -> the same account, no session", !s3.error && s3.data?.user?.id === idB && !s3.data?.session, describe(s3));
  const r3a = row(idB);
  check("B3 ... GoTrue kept PW_A, the tick and the name of the first signer (the gap the trigger closes)", untouched(r3a) && !r3a.confirmed, show(r3a));
  const t3 = await typeMailedCode("b1", before3);
  const r3 = row(idB);
  check("B3 the new code from Mailpit -> a session, and the row emptied (no password, flag, no tick, 'Member')",
    !t3.v.error && Boolean(t3.session) && emptied(r3), `${describe(t3.v)} ${show(r3)}`);
  const up3 = await t3.client.auth.updateUser({ password: PW_S });
  check("B3 the sign-up page puts PW_S back right after the code", !up3.error, describe(up3));
  await appCheck("B3 ... then posts accept-terms -> 200, a 'confirm' row, the tick back, the flag cleared", async () => {
    const t = await acceptTerms(t3.session);
    const r = row(idB);
    return [t.status === 200 && sources(idB) === "signup,confirm" && r.terms && !r.flag, `${t.status} ${sources(idB)} ${show(r)}`];
  });
  const [b3s, b3a] = [await rSignIn("b1", PW_S), await rSignIn("b1", PW_A)];
  check("B3 ... PW_S signs in, PW_A -> invalid_credentials", b3s === "session" && b3a === "invalid_credentials", `${b3s} / ${b3a}`);

  // B4: the student types the ATTACKER's original code (/auth/confirm, EmailLinkProblem).
  await allow("b4");
  const a4 = await rSignUp("b4", PW_A, PLANTED_META);
  const id4 = a4.data?.user?.id ?? "";
  const t4 = await typeMailedCode("b4", new Set());
  const r4 = row(id4);
  check("B4 the attacker's own code, typed by the student -> a session, the row emptied",
    !a4.error && !t4.v.error && Boolean(t4.session) && emptied(r4), `${describe(a4)} ${describe(t4.v)} ${show(r4)}`);
  const b4a = await rSignIn("b4", PW_A);
  check("B4 ... PW_A -> invalid_credentials", b4a === "invalid_credentials", b4a);
  await appCheck("B4 /auth/terms sends the emptied account to the choose screen", async () => {
    const t = await app("/auth/terms?next=%2Fonboarding", t4.session);
    return [t.status === 307 && t.to === "/auth/choose-password?next=%2Fonboarding", `${t.status} ${t.to}`];
  });
  await appCheck("B4 accept-terms before a password -> 409 password_needed, nothing written", async () => {
    const t = await acceptTerms(t4.session);
    const r = row(id4);
    return [t.status === 409 && t.text.includes("password_needed") && sources(id4) === "signup" && r.flag && !r.terms,
      `${t.status} ${sources(id4)} ${show(r)}`];
  });
  await appCheck("B4 the choose screen shows its form, and again on a reload (B9)", async () => {
    const [x, y] = [await app("/auth/choose-password?next=%2Fonboarding", t4.session), await app("/auth/choose-password?next=%2Fonboarding", t4.session)];
    return [x.status === 200 && y.status === 200 && /autocomplete="new-password"/i.test(x.text) && /autocomplete="new-password"/i.test(y.text),
      `${x.status} ${y.status}`];
  });
  const up4 = await t4.client.auth.updateUser({ password: PW_S });
  check("B4 the choose screen's Save sets PW_S from the code's session (no current password asked)", !up4.error, describe(up4));
  await appCheck("B4 ... then accept-terms -> 'confirm', the flag cleared, and /auth/terms lets them on", async () => {
    const t = await acceptTerms(t4.session);
    const g = await app("/auth/terms?next=%2Fonboarding", t4.session);
    const r = row(id4);
    return [t.status === 200 && sources(id4) === "signup,confirm" && !r.flag && g.status === 307 && g.to === "/onboarding",
      `${t.status} ${sources(id4)} ${show(r)} ${g.status} ${g.to}`];
  });
  const b4s = await rSignIn("b4", PW_S);
  check("B4 ... PW_S signs in", b4s === "session", b4s);

  await rehearsalLater();
}

/** The app's own reset (forgot-password -> /api/auth/password-reset -> Resend -> /auth/update-password):
 *  generateLink recovery (no mail), then the page's verifyOtp(token_hash) and updateUser on submit. */
async function forgotPassword(label, password) {
  const link = must(await admin.auth.admin.generateLink({ type: "recovery", email: school(label) }), `generateLink recovery ${label}`);
  const client = rclient();
  const v = await client.auth.verifyOtp({ token_hash: link.properties?.hashed_token ?? "", type: "recovery" });
  const up = v.error ? v : await client.auth.updateUser({ password });
  return { ok: !v.error && !up.error, detail: `${describe(v)} / ${describe(up)}`, session: v.data?.session ?? null };
}

/** /auth/terms shows its form (a password exists), then accept-terms records 'confirm' and clears the flag. */
const termsOnce = (label, id, session) =>
  appCheck(`${label} /auth/terms shows its form once, then accept-terms -> 'confirm', the flag cleared`, async () => {
    const g = await app("/auth/terms?next=%2Fonboarding", session);
    const t = await acceptTerms(session);
    const r = row(id);
    return [g.status === 200 && t.status === 200 && sources(id) === "signup,confirm" && !r.flag && r.terms,
      `${g.status} ${t.status} ${sources(id)} ${show(r)}`];
  });

async function rehearsalLater() {
  // B5: the Oct 8 shape. The student signed up (PW_S), closed the tab, and comes back through Log in.
  await allow("b5");
  const s5 = await rSignUp("b5", PW_S, STUDENT_META);
  const id5 = s5.data?.user?.id ?? "";
  backdate(id5);
  const l5 = await rSignIn("b5", PW_S);
  check("B5 Log in with PW_S on the pending account -> email_not_confirmed (the code box; the page keeps PW_S)",
    !s5.error && l5 === "email_not_confirmed", `${describe(s5)} ${l5}`);
  const before5 = await mailIds(school("b5"));
  const re5 = await rclient().auth.resend({ type: "signup", email: school("b5") });
  check("B5 ... the resend under the box", !re5.error, describe(re5));
  const t5 = await typeMailedCode("b5", before5);
  const r5 = row(id5);
  check("B5 the code -> a session, and the row emptied", !t5.v.error && Boolean(t5.session) && emptied(r5), `${describe(t5.v)} ${show(r5)}`);
  const up5 = await t5.client.auth.updateUser({ password: PW_S });
  check("B5 ... the login page puts back the password it was given", !up5.error, describe(up5));
  await termsOnce("B5", id5, t5.session);
  await t5.client.auth.signOut();
  const b5 = await rSignIn("b5", PW_S);
  check("B5 ... signed out, PW_S signs in", b5 === "session", b5);

  // B6: a scanner opens the /recover link an attacker asked for (only until dashboard step 2).
  await allow("b6");
  const a6 = await rSignUp("b6", PW_A, PLANTED_META);
  const id6 = a6.data?.user?.id ?? "";
  const before6 = await mailIds(school("b6"));
  const rec6 = await rclient().auth.resetPasswordForEmail(school("b6"));
  check("B6 the attacker's public /recover on the pending address -> accepted (no captcha here)", !a6.error && !rec6.error, `${describe(a6)} ${describe(rec6)}`);
  const link6 = await nextMail(school("b6"), before6, linkIn);
  let linkHost = "";
  try {
    linkHost = new URL(link6 ?? "").hostname;
  } catch {
    // not a link: the check below fails
  }
  check("B6 ... the mail carries a /verify link on the rehearsal host", isLocalHost(linkHost), String(link6));
  if (isLocalHost(linkHost)) {
    const g6 = await fetch(link6, { redirect: "manual" });
    check("B6 a scanner GETs it (no redirects followed, no JS) -> GoTrue redirects", g6.status >= 300 && g6.status < 400, String(g6.status));
  }
  const r6 = row(id6);
  check("B6 ... the account is confirmed and emptied", emptied(r6), show(r6));
  const b6a = await rSignIn("b6", PW_A);
  check("B6 ... PW_A -> invalid_credentials", b6a === "invalid_credentials", b6a);
  // GoTrue answers a confirmed address either way, by project settings (signup.go:293-300 in v2.189:
  // 422 when any autoconfirm is on, as SMS is here; else a user with no identities). The sign-up page
  // shows the "may already have an account" banner for both (signup-form.tsx).
  const s6 = await rSignUp("b6", PW_S, STUDENT_META);
  check("B6 the student's sign-up then answers 'already registered' (the 'may already have an account' banner)",
    ["user_already_exists", "email_exists"].includes(s6.error?.code ?? "") || (!s6.error && s6.data?.user?.identities?.length === 0),
    describe(s6));
  const f6 = await forgotPassword("b6", PW_S);
  check("B6 Forgot password from that inbox -> PW_S set", f6.ok, f6.detail);
  const b6s = await rSignIn("b6", PW_S);
  check("B6 ... PW_S signs in", b6s === "session", b6s);
  await termsOnce("B6", id6, f6.session);

  // B7, B9, B10: the sign-up page's save failed right after the code.
  await allow("b7");
  const s7 = await rSignUp("b7", PW_S, STUDENT_META);
  const id7 = s7.data?.user?.id ?? "";
  const t7 = await typeMailedCode("b7", new Set());
  const r7 = row(id7);
  check("B7 an honest sign-up's code -> emptied (the save that should follow is the step that fails here)",
    !s7.error && !t7.v.error && emptied(r7), `${describe(t7.v)} ${show(r7)}`);
  await appCheck("B7 the 'did not save' choose screen (again=1) says so and shows its form; B9 a reload shows it again", async () => {
    const path = "/auth/choose-password?next=%2Fonboarding&again=1";
    const [x, y] = [await app(path, t7.session), await app(path, t7.session)];
    return [x.status === 200 && y.status === 200 && /did not save/i.test(x.text) && /autocomplete="new-password"/i.test(y.text),
      `${x.status} ${y.status}`];
  });
  await appCheck("B10 'Not you? Sign out' there -> signed out, and the screen sends a signed-out visitor to Log in", async () => {
    const out = await app("/api/auth/logout", t7.session, { method: "POST" });
    const g = await app("/auth/choose-password?next=%2Fonboarding");
    const gone = (await t7.client.auth.getUser(t7.session?.access_token)).error;
    return [out.status < 400 && Boolean(gone) && g.status === 307 && g.to.startsWith("/auth/login?next="), `${out.status} ${g.status} ${g.to}`];
  });
  const f7 = await forgotPassword("b7", PW_S);
  check("B10 ... with no password yet, Forgot password still finishes it", f7.ok && (await rSignIn("b7", PW_S)) === "session", f7.detail);
  await termsOnce("B7", id7, f7.session);

  if (withRollback) await rollbackWindow();
}

/** The file applied as written and its row recorded (the house local recipe): { ok, err }. */
function applyB() {
  const r = psqlRun(bFile().raw);
  if (!r.ok) return r;
  psql("insert into supabase_migrations.schema_migrations (version, name) values ('20261022110000', 'first_confirm_drops_password') on conflict do nothing;");
  return r;
}

/** B12 and B0. The SHARED local database runs without the trigger for these few seconds. */
async function rollbackWindow() {
  // An account emptied while the trigger is on, left on the choose screen.
  await allow("b12");
  const s12 = await rSignUp("b12", PW_S, STUDENT_META);
  const id12 = s12.data?.user?.id ?? "";
  const t12 = await typeMailedCode("b12", new Set());
  check("B12 (an account emptied before the rollback, no password chosen yet)", !t12.v.error && emptied(row(id12)), show(row(id12)));
  const before = liveB();
  const { rollback } = bFile();
  bDropped = true;
  const d = psqlRun(rollback.join("\n"));
  check("B12 the header's ROLLBACK, for real -> no trigger, no function, no row", d.ok && liveB() === "0", `${notices(d.err)} ${liveB()}`);
  await appCheck("B12 ... the emptied account still reaches the choose screen through Terms, and it shows its form", async () => {
    const t = await app("/auth/terms?next=%2Fonboarding", t12.session);
    const c = await app("/auth/choose-password?next=%2Fonboarding", t12.session);
    return [t.status === 307 && t.to === "/auth/choose-password?next=%2Fonboarding" && c.status === 200, `${t.status} ${t.to} ${c.status}`];
  });

  // B0: the deploy window (the code live, the trigger not yet). An honest sign-up first.
  await allow("b0h");
  const h = await rSignUp("b0h", PW_S, STUDENT_META);
  const idH = h.data?.user?.id ?? "";
  const tH = await typeMailedCode("b0h", new Set());
  const upH = await tH.client.auth.updateUser({ password: PW_S });
  const rH = row(idH);
  check("B0 an honest sign-up before the trigger: putting PW_S back answers same_password (ignored); the tick stands, no flag",
    !tH.v.error && upH.error?.code === "same_password" && rH.pw && rH.confirmed && rH.terms && !rH.flag, `${describe(upH)} ${show(rH)}`);
  // Then a pre-registered address: the sign-up page alone replaces PW_A.
  await allow("b0p");
  const p = await rSignUp("b0p", PW_A, PLANTED_META);
  const idP = p.data?.user?.id ?? "";
  backdate(idP);
  const beforeP = await mailIds(school("b0p"));
  await rSignUp("b0p", PW_S, STUDENT_META);
  const tP = await typeMailedCode("b0p", beforeP);
  const keptA = row(idP).pw;
  const upP = await tP.client.auth.updateUser({ password: PW_S });
  const tp = await acceptTerms(tP.session);
  const [pS, pA] = [await rSignIn("b0p", PW_S), await rSignIn("b0p", PW_A)];
  check("B0 a pre-registered address before the trigger: the code keeps PW_A, the sign-up page replaces it; consent 'interstitial' (no flag)",
    !tP.v.error && keptA && !upP.error && pS === "session" && pA === "invalid_credentials" && tp.status === 200 && sources(idP) === "signup,interstitial",
    `${describe(upP)} ${pS} / ${pA} ${tp.status} ${sources(idP)}`);

  // Back as it was: the file as written (its pre-flight counts B12's waiting account), its row, the same md5.
  const re = applyB();
  const counted = Number(/(\d+) emptied account\(s\) still choosing a password/.exec(re.err)?.[1] ?? -1);
  const after = liveB();
  if (re.ok && after === before) bDropped = false;
  check("B12 the file applied again as written -> it counts the waiting account, the same md5, its row back",
    re.ok && counted >= 1 && after === before, `${counted} counted; ${notices(re.err)}; ${before} -> ${after}`);
  const up12 = await t12.client.auth.updateUser({ password: PW_S });
  check("B12 ... and that account finishes on the choose screen as before", !up12.error && (await rSignIn("b12", PW_S)) === "session", describe(up12));
}

async function runUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list users: ${error.message}`);
    out.push(...data.users.filter((u) => u.email?.startsWith(`${TAG}-`)));
    if (data.users.length < 200) return out;
  }
}

async function cleanUp() {
  const problems = [];
  let users = [];
  try {
    users = await runUsers();
  } catch (err) {
    problems.push(err.message);
  }
  for (const u of users) {
    const r = await admin.auth.admin.deleteUser(u.id);
    if (r.error) problems.push(`user ${u.email}: ${r.error.message}`);
  }
  if (allowlisted.length > 0) {
    const r = await admin.from("signup_allowlist").delete().in("email", allowlisted);
    if (r.error) problems.push(`allowlist rows: ${r.error.message}`);
  }
  // Exactly this run's messages, by ID (an empty list would empty the shared box).
  let mailLeft = 0;
  try {
    const ids = new Set(mailSeen);
    for (const addr of mailAddrs) for (const id of await mailIds(addr)) ids.add(id);
    if (ids.size > 0) {
      const r = await fetch(`${MAILPIT}/api/v1/messages`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [...ids] }),
      });
      if (!r.ok) problems.push(`Mailpit delete: ${r.status}`);
    }
    for (const addr of mailAddrs) mailLeft += (await mailIds(addr)).size;
  } catch (err) {
    problems.push(`Mailpit: ${err.message}`);
  }
  const ids = `${lit(`{${made.join(",")}}`)}::uuid[]`;
  let left = "";
  try {
    // accept-terms' limiter rows (accept-terms:<id>) hold the deleted accounts' ids.
    psql(`delete from public.rate_limits r using unnest(${ids}) as m(id) where position(m.id::text in r.key) > 0;`);
    left = psql(`select concat_ws(' ',
        (select count(*) from auth.users where email like ${lit(`${TAG}-%`)}),
        (select count(*) from public.users where email like ${lit(`${TAG}-%`)} or id = any(${ids})),
        (select count(*) from public.terms_acceptances where user_id = any(${ids})),
        (select count(*) from public.signup_allowlist where email like ${lit(`${TAG}-%`)}),
        (select count(*) from public.rate_limits r, unnest(${ids}) as m(id) where position(m.id::text in r.key) > 0),
        ${mailLeft});`);
  } catch (err) {
    problems.push(err.message);
  }
  if (problems.length > 0 || left !== "0 0 0 0 0 0") {
    failures += 1;
    console.log(`FAIL clean-up: ${problems.join("; ") || `left (auth users, users, Terms rows, allowlist, limiter rows, mail): ${left}`} (run tag ${TAG})`);
  } else {
    console.log(`ok   clean-up: ${users.length} users deleted (their users rows and Terms records with them), `
      + `${allowlisted.length} allowlist rows, their limiter rows and ${mailSeen.size} messages`);
  }
}

/** B12 stopped half-way: put the trigger back before anything else, or say exactly how. */
function putBBack() {
  if (liveB().startsWith("O ")) return;
  const re = applyB();
  if (re.ok && liveB().startsWith("O ")) {
    console.log("ok   the trigger is back on the local database (finally)");
    return;
  }
  failures += 1;
  console.log(`FAIL the trigger is NOT back on the local database (${notices(re.err)}). Put it back now:
  docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261022110000_first_confirm_drops_password.sql
  docker exec ${DB_CONTAINER} psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261022110000', 'first_confirm_drops_password') on conflict do nothing"`);
}

const tier = rehearsal
  ? `Tier B: rehearsal GoTrue ${rehearsalVersion} at ${rehearsal.host}, ${appUrl ? `app ${appUrl.host}` : "no --app"}${withRollback ? ", with the rollback window" : ""}`
  : "Tier A";
console.log(`prereg-e2e (${tier}) against the LOCAL stack (${apiHost}), run ${TAG}`);
try {
  await (rehearsal ? rehearsalCases() : cases());
} catch (err) {
  failures += 1;
  console.log(`FAIL stopped: ${err.message}`);
} finally {
  if (bDropped) putBBack();
  await cleanUp();
}
const skippedNote = skipped > 0 ? ` (${skipped} app checks skipped: pass --app to run them)` : "";
console.log(failures === 0 ? `prereg-e2e: all cases passed${skippedNote}` : `prereg-e2e: ${failures} failed${skippedNote}`);
process.exit(failures === 0 ? 0 : 1);
