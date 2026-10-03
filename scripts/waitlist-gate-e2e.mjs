#!/usr/bin/env node
// The waitlist gate, end to end through the real LOCAL Supabase Auth
// (BUILD.md section 5, "A, through GoTrue"; the SQL-level cases are in
// scripts/sql/waitlist-gate-check.sql).
//
//   node scripts/waitlist-gate-e2e.mjs                 every case, the switch untouched
//   node scripts/waitlist-gate-e2e.mjs --real-switch   also flips the SHARED switch (see R1-R3)
//
// HOW IT CLOSES THE GATE WITHOUT CLOSING IT FOR EVERYONE. Local sign-up stays
// open (app_settings.signup_open = true). Each sign-up here sends
// user_metadata.vibe_gate_probe = true, which makes auth_hooks.hook_waitlist_gate
// act as if the switch were closed, for that request only. The probe can only
// make the gate stricter; it never opens anything.
// --real-switch (opt-in): sets the shared switch to false for about a second
// to prove the real path (a sign-up with no code is refused, sign-in still
// works), then puts back whatever was there, in `finally`. Any other
// session's sign-up in that second is refused too, so run it alone.
//
// Needs the eight waitlist migrations applied (20261003100000 to 20261003170000)
// and the hook on (supabase/config.toml [auth.hook.before_user_created]).
//
// Cases: E1 no code -> access_code_required; E2 a bad / unknown code ->
// access_code_invalid; E3 an issued code -> account made, the row claimed by
// and redeemed for that account (user_metadata reaches the hook); E4 the same
// code again -> access_code_used; E5 two parallel sign-ups on one fresh code
// -> exactly one account; E6 admin.createUser with no code -> made (the admin
// path skips the hook); E7 an existing address -> 422 user_already_exists, not
// the gate; E8 an allowlisted address -> made; E9 sign-in still works; E10
// with no probe the open switch lets anyone in; E11 the REST API can't reach
// the hook (it lives in auth_hooks, never exposed) or read the table; E12 the
// typed code is kept only as its hash (auth.users, auth.identities, and the
// token a sign-in issues); E13 retention (20261003140000, 20261003150000):
// the E3 account got its cohort tag at redemption, anon can't run the purge,
// and the service role's purge deletes E3's row once it is 39 days old while
// a 37-day row stays, the account and its tag outliving the row. That purge
// is the real one: it also deletes any other local entry past its 38 days
// (20261003170000). E14 (20261003150000, 20261003170000): a code issued on
// day 30 ends with its entry (day 38),
// and a free-text batch name is refused. E15 (20261003160000), through the
// REST API the server uses: anon can't run waitlist_drop_if_due; the service
// role's drop deletes an entry past its line (and names its address) but not
// one a day younger; an entry with 23 hours left gets no code (entry_expiring).
// E16 (20261003170000), through the same REST API: the form's renewal of an
// unconfirmed entry makes its join date now; a confirmed entry keeps its date.
//
// SAFETY: the URL and keys come ONLY from `supabase status -o env` (the local
// CLI stack), never a .env file, and anything that isn't 127.0.0.1 /
// localhost is refused, as in scripts/local-seed.mjs. Every user, waitlist row
// and allowlist row it makes is deleted in `finally` (all on @example.test).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_SWITCH = process.argv.includes("--real-switch");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--real-switch") {
    console.error("Usage: node scripts/waitlist-gate-e2e.mjs [--real-switch]");
    process.exit(1);
  }
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
if (apiHost !== "127.0.0.1" && apiHost !== "localhost") {
  console.error("Refusing: `supabase status` reports a stack that isn't on 127.0.0.1 / localhost.");
  process.exit(1);
}
if (!STATUS.SERVICE_ROLE_KEY || !STATUS.ANON_KEY) {
  console.error("Refusing: SERVICE_ROLE_KEY or ANON_KEY missing from `supabase status -o env`.");
  process.exit(1);
}

// Loaded only after the gate has passed. The two waitlist modules are the
// ones the app uses (Node strips their types).
const { createClient } = await import("@supabase/supabase-js");
const waitlistModule = (name) => pathToFileURL(join(REPO_ROOT, "src/lib/waitlist", name)).href;
const { parseGateRefusal } = await import(waitlistModule("types.ts"));
const { generateAccessCode } = await import(waitlistModule("access-code.ts"));

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(API_URL, STATUS.SERVICE_ROLE_KEY, CLIENT_OPTS);
const publicClient = () => createClient(API_URL, STATUS.ANON_KEY, CLIENT_OPTS);

const RUN = `wg${Date.now().toString(36)}`;
const PASSWORD = `${randomBytes(12).toString("base64url")}aA1`;
const email = (label) => `${RUN}-${label}@example.test`;
const PROBE = { vibe_gate_probe: true };

const made = { waitlistIds: [], allowlist: [] };
let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
  }
}
const describe = (r) =>
  r.error ? `${r.error.status} ${r.error.code ?? ""} ${r.error.message}` : `user ${r.data?.user?.id ?? "(none)"}`;

function signUp(addr, data) {
  return publicClient().auth.signUp({ email: addr, password: PASSWORD, options: { data } });
}

/** A confirmed waitlist row with a fresh code, issued the way the admin route does it. */
async function issuedRow(label) {
  const addr = `${RUN}-${label}@iu.edu`;
  const ins = await admin
    .from("waitlist")
    .insert({ email: addr, email_key: addr, school_system: "iu", name: `E2E ${label}`,
      age_attested_at: new Date().toISOString(), consent_invite_at: new Date().toISOString(),
      notice_version: "2026-10-03", confirmed_at: new Date().toISOString(), source: "e2e" })
    .select("id")
    .single();
  if (ins.error) throw new Error(`insert waitlist row ${label}: ${ins.error.message}`);
  made.waitlistIds.push(ins.data.id);
  const code = generateAccessCode();
  const res = await admin.rpc("waitlist_issue_code", {
    p_id: ins.data.id, p_code: code, p_actor: null, p_batch: "test-1", p_single: false,
  });
  if (res.error || res.data?.ok !== true) {
    throw new Error(`issue code ${label}: ${res.error?.message ?? JSON.stringify(res.data)}`);
  }
  return { id: ins.data.id, code };
}

async function readRow(id) {
  const r = await admin
    .from("waitlist")
    .select("code_claimed_email, redeemed_at, redeemed_user_id")
    .eq("id", id)
    .single();
  if (r.error) throw new Error(`read waitlist row: ${r.error.message}`);
  return r.data;
}

async function runUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list users: ${error.message}`);
    out.push(...data.users.filter((u) => u.email?.startsWith(`${RUN}-`)));
    if (data.users.length < 200) return out;
  }
}

async function cases() {
  // E1 / E2: refused before anything is written.
  const e1 = await signUp(email("e1"), PROBE);
  check("E1 no code -> 403 access_code_required", parseGateRefusal(e1.error) === "access_code_required", describe(e1));
  const e2a = await signUp(email("e2"), { ...PROBE, access_code: "VIBE-123" });
  check("E2 a malformed code -> access_code_invalid", parseGateRefusal(e2a.error) === "access_code_invalid", describe(e2a));
  const e2b = await signUp(email("e2"), { ...PROBE, access_code: generateAccessCode() });
  check("E2 an unknown code -> access_code_invalid", parseGateRefusal(e2b.error) === "access_code_invalid", describe(e2b));

  // E3: an issued code makes an account, once.
  const row3 = await issuedRow("e3");
  const e3 = await signUp(email("e3"), { ...PROBE, access_code: row3.code.toLowerCase().replace(/-/g, " ") });
  const id3 = e3.data?.user?.id;
  check("E3 an issued code (typed loosely) -> account made", !e3.error && Boolean(id3), describe(e3));
  check("E3 the code travelled in user_metadata", e3.data?.user?.user_metadata?.access_code !== undefined);
  const after3 = await readRow(row3.id);
  check("E3 the hook claimed it for that address", after3.code_claimed_email === email("e3"), JSON.stringify(after3));
  check("E3 handle_new_user redeemed it for the new account",
    after3.redeemed_user_id === id3 && Boolean(after3.redeemed_at), JSON.stringify(after3));

  // E4: spent.
  const e4 = await signUp(email("e4"), { ...PROBE, access_code: row3.code });
  check("E4 the same code, another address -> access_code_used", parseGateRefusal(e4.error) === "access_code_used", describe(e4));

  // E5: one fresh code, two people at once.
  const row5 = await issuedRow("e5");
  const [e5a, e5b] = await Promise.all([
    signUp(email("e5a"), { ...PROBE, access_code: row5.code }),
    signUp(email("e5b"), { ...PROBE, access_code: row5.code }),
  ]);
  const winners = [e5a, e5b].filter((r) => !r.error && r.data?.user?.id);
  const loser = [e5a, e5b].find((r) => r.error);
  check("E5 two parallel sign-ups on one code -> exactly one account", winners.length === 1,
    `${describe(e5a)} | ${describe(e5b)}`);
  check("E5 the other is refused as in use or used",
    ["access_code_in_use", "access_code_used"].includes(parseGateRefusal(loser?.error) ?? ""), loser ? describe(loser) : "none");
  const existing5 = (await runUsers()).filter((u) => u.email === email("e5a") || u.email === email("e5b"));
  check("E5 ... and Auth holds exactly one of the two addresses", existing5.length === 1, `${existing5.length}`);
  const after5 = await readRow(row5.id);
  check("E5 the row is redeemed by the winner", after5.redeemed_user_id === winners[0]?.data.user.id, JSON.stringify(after5));

  // E6: the admin path (the seed scripts) never calls the hook.
  const e6 = await admin.auth.admin.createUser({
    email: email("e6"), password: PASSWORD, email_confirm: true, user_metadata: PROBE,
  });
  check("E6 admin.createUser with the probe and no code -> made (the admin path skips the hook)",
    !e6.error && Boolean(e6.data?.user?.id), describe(e6));

  // E7: an existing address never reaches the hook.
  const e7 = await signUp(email("e3"), PROBE);
  check("E7 an existing address -> 422 user_already_exists, not the gate",
    e7.error?.status === 422 && e7.error?.code === "user_already_exists" && parseGateRefusal(e7.error) === null, describe(e7));

  // E8: the allowlist.
  const add8 = await admin.from("signup_allowlist").insert({ email: email("e8"), reason: "manual", note: "waitlist-gate-e2e" });
  if (add8.error) throw new Error(`allowlist insert: ${add8.error.message}`);
  made.allowlist.push(email("e8"));
  const e8 = await signUp(email("e8"), PROBE);
  check("E8 an allowlisted address with the probe and no code -> made", !e8.error && Boolean(e8.data?.user?.id), describe(e8));

  // E9: sign-in.
  for (const label of ["e3", "e6"]) {
    const s = await publicClient().auth.signInWithPassword({ email: email(label), password: PASSWORD });
    check(`E9 sign-in still works (${label === "e3" ? "an account made with a code" : "an admin-made account"})`,
      !s.error && Boolean(s.data?.session), s.error ? describe(s) : "");
  }

  // E10: without the probe, the open local switch lets anyone in.
  const open = await admin.rpc("signup_is_open");
  if (open.data === true) {
    const e10 = await signUp(email("e10"), {});
    check("E10 switch open: no code, no probe -> made", !e10.error && Boolean(e10.data?.user?.id), describe(e10));
  } else {
    check("E10 skipped: the local switch is not open (it should be; see supabase/seed.sql)", false, `${open.data}`);
  }

  // E11: the REST API can't use the hook as an oracle, or read the list.
  // The hook is in auth_hooks, which PostgREST doesn't serve: it answers from
  // its schema cache and never calls the function (no permission check, so
  // nothing for a dashboard REVOKE to turn into a crash).
  const anon = publicClient();
  const event = { event: { user: { email: email("e11"), user_metadata: { access_code: row5.code } } } };
  const r11 = await anon.rpc("hook_waitlist_gate", event);
  check("E11 anon calling hook_waitlist_gate in public -> not found (PGRST202)", r11.error?.code === "PGRST202",
    JSON.stringify(r11.error));
  const s11 = await anon.schema("auth_hooks").rpc("hook_waitlist_gate", event);
  check("E11 anon asking for the auth_hooks schema -> refused (PGRST106)", s11.error?.code === "PGRST106",
    JSON.stringify(s11.error));
  const t11 = await anon.from("waitlist").select("id").limit(1);
  check("E11 anon reading public.waitlist -> refused (42501)", t11.error?.code === "42501", JSON.stringify(t11.error));

  // E12: the code the E3 account typed is stored only as its hash.
  const u12 = await admin.auth.admin.getUserById(id3);
  const meta12 = u12.data?.user?.user_metadata ?? {};
  check("E12 auth.users keeps access_code_hash, not the code",
    !("access_code" in meta12) && /^[0-9a-f]{64}$/.test(meta12.access_code_hash ?? ""), JSON.stringify(meta12));
  const ident12 = u12.data?.user?.identities?.[0]?.identity_data ?? {};
  check("E12 auth.identities keeps no plain code", !("access_code" in ident12), JSON.stringify(ident12));
  const s12 = await publicClient().auth.signInWithPassword({ email: email("e3"), password: PASSWORD });
  const token12 = s12.data?.session?.access_token ?? "";
  const claims12 = token12 ? JSON.parse(Buffer.from(token12.split(".")[1], "base64url").toString()) : {};
  check("E12 a signed-in token's user_metadata has no plain code",
    Boolean(token12) && !("access_code" in (claims12.user_metadata ?? {})), JSON.stringify(claims12.user_metadata));

  // E13: retention. The tag is written when handle_new_user redeems the code.
  const today = new Date().toISOString().slice(0, 10);
  const tag13 = await admin.from("user_cohorts").select("batch, origin, invited_on, joined_on").eq("user_id", id3).maybeSingle();
  check("E13 the E3 account got its cohort tag (batch, origin, the day let in, the day joined)",
    tag13.data?.batch === "test-1" && tag13.data?.origin === "form" && tag13.data?.invited_on === today
      && tag13.data?.joined_on === today, JSON.stringify(tag13.error ?? tag13.data));
  const anon13 = await publicClient().rpc("waitlist_purge_expired");
  check("E13 anon running the purge -> refused (42501)", anon13.error?.code === "42501", JSON.stringify(anon13.error));
  const row13 = await issuedRow("e13");
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  for (const [id, days] of [[row3.id, 39], [row13.id, 37]]) {
    const r = await admin.from("waitlist").update({ created_at: daysAgo(days) }).eq("id", id);
    if (r.error) throw new Error(`backdate a waitlist row: ${r.error.message}`);
  }
  const purge13 = await admin.rpc("waitlist_purge_expired", { p_limit: 1000 });
  const gone13 = (purge13.data ?? []).map((r) => r.email);
  check("E13 the service role's purge deletes the 39-day row (and says which address went)",
    !purge13.error && gone13.includes(`${RUN}-e3@iu.edu`) && !gone13.includes(`${RUN}-e13@iu.edu`),
    JSON.stringify(purge13.error ?? gone13.filter((e) => e.startsWith(RUN))));
  const left13 = await admin.from("waitlist").select("id").in("id", [row3.id, row13.id]);
  check("E13 ... the 37-day row stays", (left13.data ?? []).map((r) => r.id).join() === row13.id,
    JSON.stringify(left13.error ?? left13.data));
  const kept13 = await admin.from("user_cohorts").select("batch").eq("user_id", id3).maybeSingle();
  const user13 = await admin.auth.admin.getUserById(id3);
  check("E13 ... and the E3 account and its tag outlive the row",
    kept13.data?.batch === "test-1" && user13.data?.user?.id === id3, JSON.stringify(kept13.error ?? kept13.data));

  // E14: a code sent late ends with its entry, and batch names are a word and a number.
  const addr14 = `${RUN}-e14@iu.edu`;
  const created14 = daysAgo(30);
  const ins14 = await admin
    .from("waitlist")
    .insert({ email: addr14, email_key: addr14, school_system: "iu", name: "E2E e14", created_at: created14,
      age_attested_at: created14, consent_invite_at: created14, notice_version: "2026-10-03", confirmed_at: created14 })
    .select("id")
    .single();
  if (ins14.error) throw new Error(`insert waitlist row e14: ${ins14.error.message}`);
  made.waitlistIds.push(ins14.data.id);
  const bad14 = await admin.rpc("waitlist_issue_code", {
    p_id: ins14.data.id, p_code: generateAccessCode(), p_actor: null, p_batch: "jamie-r", p_single: false,
  });
  check("E14 a free-text batch name is refused by the database (23514)", bad14.error?.code === "23514", JSON.stringify(bad14.error));
  const res14 = await admin.rpc("waitlist_issue_code", {
    p_id: ins14.data.id, p_code: generateAccessCode(), p_actor: null, p_batch: "wave-1", p_single: false,
  });
  const ends14 = Date.parse(res14.data?.expires_at ?? "");
  check("E14 a code issued on day 30 ends when the entry is deleted (day 38), not in 14 days",
    res14.data?.ok === true && Math.abs(ends14 - (Date.parse(created14) + 38 * 86_400_000)) < 2000,
    JSON.stringify(res14.error ?? res14.data));

  // E15: past its line, an entry counts as gone before the purge; no code in its last day.
  const anon15 = await publicClient().rpc("waitlist_drop_if_due", { p_email_key: `${RUN}-e15a@iu.edu` });
  check("E15 anon running waitlist_drop_if_due -> refused (42501)", anon15.error?.code === "42501", JSON.stringify(anon15.error));
  const rows15 = {};
  for (const [label, hoursOld] of [["e15a", 38 * 24 + 1], ["e15b", 37 * 24], ["e15c", 37 * 24 + 1]]) {
    const row = await issuedRow(label);
    const r = await admin.from("waitlist").update({ created_at: new Date(Date.now() - hoursOld * 3_600_000).toISOString() }).eq("id", row.id);
    if (r.error) throw new Error(`backdate a waitlist row: ${r.error.message}`);
    rows15[label] = row.id;
  }
  const dropA = await admin.rpc("waitlist_drop_if_due", { p_email_key: `${RUN}-e15a@iu.edu` });
  const dropB = await admin.rpc("waitlist_drop_if_due", { p_email_key: `${RUN}-e15b@iu.edu` });
  const left15 = await admin.from("waitlist").select("id").in("id", [rows15.e15a, rows15.e15b]);
  check("E15 the service role's drop deletes the entry past its line (and names it) and keeps the one a day younger",
    dropA.data === `${RUN}-e15a@iu.edu` && dropB.data === null && !dropB.error
      && (left15.data ?? []).map((r) => r.id).join() === rows15.e15b,
    JSON.stringify(dropA.error ?? dropA.data) + " " + JSON.stringify(dropB.error ?? dropB.data));
  const res15 = await admin.rpc("waitlist_issue_code", {
    p_id: rows15.e15c, p_code: generateAccessCode(), p_actor: null, p_batch: "wave-1", p_single: true,
  });
  check("E15 an entry with 23 hours left gets no new code (entry_expiring)", res15.data?.reason === "entry_expiring",
    JSON.stringify(res15.error ?? res15.data));

  // E16: signing up again while unconfirmed restarts the clock; a confirmed entry keeps its date.
  const created16 = daysAgo(20);
  const ids16 = {};
  for (const label of ["e16u", "e16c"]) {
    const addr = `${RUN}-${label}@iu.edu`;
    const ins = await admin
      .from("waitlist")
      .insert({ email: addr, email_key: addr, school_system: "iu", name: `E2E ${label}`, created_at: created16,
        confirm_sent_at: created16, age_attested_at: created16, consent_invite_at: created16, notice_version: "2026-10-03",
        confirmed_at: label === "e16c" ? created16 : null })
      .select("id")
      .single();
    if (ins.error) throw new Error(`insert waitlist row ${label}: ${ins.error.message}`);
    made.waitlistIds.push(ins.data.id);
    ids16[label] = ins.data.id;
  }
  // The renewal's shape (store.ts renewConfirmToken), minus the answers.
  const renew16 = (id) => admin.from("waitlist")
    .update({ manage_token_hash: randomBytes(32).toString("hex"), confirm_sent_at: new Date().toISOString() })
    .eq("id", id).is("confirmed_at", null).is("code_hash", null).select("created_at");
  const u16 = await renew16(ids16.e16u);
  const c16 = await renew16(ids16.e16c);
  const back16 = await admin.from("waitlist").select("created_at").eq("id", ids16.e16c).single();
  check("E16 a new confirm link makes an unconfirmed entry's join date now (20261003170000)",
    !u16.error && Math.abs(Date.parse(u16.data?.[0]?.created_at ?? "") - Date.now()) < 60_000, JSON.stringify(u16.error ?? u16.data));
  check("E16 ... the renewal skips a confirmed entry, which keeps its date",
    !c16.error && c16.data?.length === 0 && Date.parse(back16.data?.created_at ?? "") === Date.parse(created16),
    JSON.stringify(c16.error ?? back16.data));
}

// R1-R3 (--real-switch only): the shared switch, closed for about a second.
async function realSwitchCases() {
  const before = await admin.from("app_settings").select("value").eq("key", "signup_open").single();
  if (before.error) throw new Error(`read the switch: ${before.error.message}`);
  const setSwitch = async (value) => {
    const r = await admin.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "signup_open");
    if (r.error) throw new Error(`set the switch: ${r.error.message}`);
  };
  try {
    await setSwitch(false);
    const r1 = await signUp(email("r1"), {});
    check("R1 switch closed (shared): no code, no probe -> 403 access_code_required",
      parseGateRefusal(r1.error) === "access_code_required", describe(r1));
    const r2 = await publicClient().auth.signInWithPassword({ email: email("e3"), password: PASSWORD });
    check("R2 switch closed (shared): sign-in still works", !r2.error && Boolean(r2.data?.session), r2.error ? describe(r2) : "");
  } finally {
    await setSwitch(before.data.value);
  }
  const r3 = await signUp(email("r3"), {});
  check(`R3 switch put back (${JSON.stringify(before.data.value)}): no code, no probe`,
    before.data.value === true ? !r3.error : parseGateRefusal(r3.error) === "access_code_required", describe(r3));
}

async function cleanUp() {
  const problems = [];
  if (made.waitlistIds.length > 0) {
    const r = await admin.from("waitlist").delete().in("id", made.waitlistIds);
    if (r.error) problems.push(`waitlist rows: ${r.error.message}`);
  }
  if (made.allowlist.length > 0) {
    const r = await admin.from("signup_allowlist").delete().in("email", made.allowlist);
    if (r.error) problems.push(`allowlist rows: ${r.error.message}`);
  }
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
  const left = await runUsers().catch(() => ["?"]);
  if (problems.length > 0 || left.length > 0) {
    failures += 1;
    console.log(`FAIL clean-up: ${problems.join("; ") || `${left.length} users left`} (run tag ${RUN})`);
  } else {
    console.log(`ok   clean-up: ${users.length} users, ${made.waitlistIds.length} waitlist rows, ${made.allowlist.length} allowlist rows deleted`);
  }
}

console.log(`waitlist-gate-e2e against the LOCAL stack (${apiHost}), run ${RUN}${REAL_SWITCH ? ", with --real-switch" : ""}`);
try {
  await cases();
  if (REAL_SWITCH) await realSwitchCases();
} catch (err) {
  failures += 1;
  console.log(`FAIL stopped: ${err.message}`);
} finally {
  await cleanUp();
}
console.log(failures === 0 ? "waitlist-gate-e2e: all cases passed" : `waitlist-gate-e2e: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
