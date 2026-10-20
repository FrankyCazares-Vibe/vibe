#!/usr/bin/env node
// Club links, end to end through the real LOCAL Supabase Auth (GoTrue) and
// its before-user-created hook (the club's view, wave 1:
// supabase/migrations/20261021110000_club_links.sql and
// 20261021120000_club_links_gate.sql). Modelled on scripts/waitlist-gate-e2e.mjs.
//
//   node scripts/club-links-e2e.mjs
//
// HOW IT CLOSES THE GATE WITHOUT CLOSING IT FOR EVERYONE. Every sign-up here
// sends user_metadata.vibe_gate_probe = true, which makes
// auth_hooks.hook_waitlist_gate act as if sign-up were closed, for that
// request only. The shared switch (app_settings.signup_open) is never touched.
//
// Cases: C0 the script's hash matches public.club_link_hash; C1 a setup link
// (typed loosely) lets a school address in and holds one place for it; C2 a
// second address on that link -> used (its place is held by an address that
// now has an account), and on a link whose place is held right now by an
// address with no account yet -> in_use; C3 a personal address ->
// school_email; C4 not a code / an unknown code -> invalid; C5 auth.users and
// auth.identities keep only the code's hash; C6 club_link_pending ties the
// place to the account; C7 club_link_redeem_setup makes the club (owner row,
// rooms, link used), twice -> already; C8 a used link -> used; C9 a members'
// link with 2 places -> two in, the third full, the first again is Auth's
// own answer; C10 off / expired / club hidden -> off, expired, off, and back
// on it lets people in; C11 two parallel sign-ups on one setup link -> one
// account; C12 the REST API (anon and a signed-in user) can't read the
// tables, run the two writers, or reach auth_hooks; C13 a stale place (20
// minutes, no account) is given back; C14 deleting an account drops the
// places its address still holds; C15 probe, no club code, no access code ->
// access_code_required, as before.
//
// About 20 sign-up / sign-in requests: GoTrue allows 30 per 5 minutes per IP
// locally ([auth.rate_limit] sign_in_sign_ups), so wait 5 minutes between runs
// (or after scripts/waitlist-gate-e2e.mjs) if one comes back 429.
//
// SAFETY: the URL and keys come ONLY from `supabase status -o env` (the local
// CLI stack), never a .env file, and anything that isn't 127.0.0.1 /
// localhost is refused, as in scripts/waitlist-gate-e2e.mjs. Direct SQL goes
// through `docker exec` into the local stack's own database container. Every
// user (clubtest-<run>-*@iu.edu / @purdue.edu / @example.test; local mail
// only), club, link and place it makes is deleted in `finally`.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length > 2) {
  console.error("Usage: node scripts/club-links-e2e.mjs");
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
if (apiHost !== "127.0.0.1" && apiHost !== "localhost") {
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

// Loaded only after the gate has passed (Node strips their types).
const { createClient } = await import("@supabase/supabase-js");
const srcModule = (path) => pathToFileURL(join(REPO_ROOT, "src/lib", path)).href;
const { parseGateRefusal } = await import(srcModule("waitlist/types.ts"));
const { generateClubLinkCode, normalizeClubLinkCode } = await import(srcModule("club-links/code.ts"));
const { TERMS_VERSION, TERMS_METADATA_KEYS } = await import(srcModule("legal/terms.ts"));

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(API_URL, STATUS.SERVICE_ROLE_KEY, CLIENT_OPTS);
const publicClient = () => createClient(API_URL, STATUS.ANON_KEY, CLIENT_OPTS);
const userClient = (token) =>
  createClient(API_URL, STATUS.ANON_KEY, { ...CLIENT_OPTS, global: { headers: { Authorization: `Bearer ${token}` } } });

const RUN = randomBytes(5).toString("hex");
const TAG = `clubtest-${RUN}`;
const PASSWORD = `${randomBytes(12).toString("base64url")}aA1`;
const school = (label, domain = "iu.edu") => `${TAG}-${label}@${domain}`;
const personal = (label) => `${TAG}-${label}@example.test`;
// What the sign-up page sends: the probe, the Terms consent, the link's code.
const SIGNUP_META = { vibe_gate_probe: true, [TERMS_METADATA_KEYS.version]: TERMS_VERSION, [TERMS_METADATA_KEYS.age]: true };

const made = { links: [], orgs: [] };
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
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** sha256 hex of 'club:' + the normalised code, as public.club_link_hash. */
function clubHash(code) {
  const n = normalizeClubLinkCode(code);
  if (!n) throw new Error(`not a club code: ${code}`);
  return createHash("sha256").update(`club:${n}`, "utf8").digest("hex");
}
/** The code as a person might paste it: lowercase, in fours, with hyphens. */
const loose = (code) => code.toLowerCase().match(/.{4}/g).join("-");
const fromNow = (ms) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000;

function signUp(addr, extra = {}) {
  return publicClient().auth.signUp({ email: addr, password: PASSWORD, options: { data: { ...SIGNUP_META, ...extra } } });
}
const refusal = (r) => parseGateRefusal(r.error);

/** A fresh setup link, made the way Admin > Clubs makes one (only the hash is kept). */
async function setupLink(label, { checked = true } = {}) {
  const code = generateClubLinkCode();
  const row = must(await admin.from("club_links").insert({
    kind: "setup", code_hash: clubHash(code), club_name: `Club Test ${RUN} ${label}`, club_handle: `${TAG}-${label}`,
    checked, max_signups: 1, expires_at: fromNow(7 * DAY),
  }).select("id").single(), `insert setup link ${label}`);
  made.links.push(row.id);
  return { id: row.id, code, checked };
}

/** A members' link on a club (it keeps its code, to show the link again). */
async function membersLink(orgId, maxSignups) {
  const code = generateClubLinkCode();
  const row = must(await admin.from("club_links").insert({
    kind: "members", code, code_hash: clubHash(code), org_id: orgId, max_signups: maxSignups, expires_at: fromNow(21 * DAY),
  }).select("id").single(), "insert members' link");
  made.links.push(row.id);
  return { id: row.id, code };
}

async function setLink(id, fields) {
  must(await admin.from("club_links").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id), "update link");
}

/** A place on a link, written by hand (as the gate would have written it). */
async function holdPlace(linkId, addr, claimedAt) {
  must(await admin.from("club_link_uses").insert({ link_id: linkId, claimed_email: addr, claimed_at: claimedAt }), "insert place");
}

async function uses(linkId) {
  return must(await admin.from("club_link_uses")
    .select("id, claimed_email, claimed_at, user_id, joined_at").eq("link_id", linkId), "read places");
}

/** An account made through the admin API (that path never calls the hook). */
async function adminUser(addr) {
  const r = await admin.auth.admin.createUser({ email: addr, password: PASSWORD, email_confirm: true, user_metadata: SIGNUP_META });
  return must(r, `create user ${addr}`).user.id;
}

/** A throwaway checked club with its owner row, for the members' link. */
async function throwawayClub(ownerId) {
  const org = must(await admin.from("orgs").insert({
    handle: `${TAG}-m`, name: `Club Test ${RUN} members`, owner_id: ownerId, verified: true, campus_id: "indianapolis",
  }).select("id").single(), "insert club");
  made.orgs.push(org.id);
  must(await admin.from("org_members").insert({ org_id: org.id, user_id: ownerId, role: "owner" }), "insert owner row");
  return org.id;
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
const accountFor = async (addr) => (await runUsers()).find((u) => u.email === addr) ?? null;

async function cases() {
  // C0: the script's hash is the database's.
  const code0 = generateClubLinkCode();
  const db0 = psql(`select public.club_link_hash(${lit(loose(code0))});`);
  check("C0 sha256('club:'+code) here = public.club_link_hash of the loose form", db0 === clubHash(code0), `${db0} vs ${clubHash(code0)}`);

  // C1: a setup link lets one school address in, typed loosely.
  const link1 = await setupLink("s1", { checked: true });
  const addr1 = school("c1");
  const c1 = await signUp(addr1, { club_code: loose(link1.code) });
  const id1 = c1.data?.user?.id;
  check("C1 a setup link (lowercase, hyphens), probe on, a new @iu.edu address -> account made", !c1.error && Boolean(id1), describe(c1));
  const uses1 = await uses(link1.id);
  check("C1 ... the link holds exactly one place, claimed for that address",
    uses1.length === 1 && uses1[0].claimed_email === addr1 && uses1[0].user_id === null, JSON.stringify(uses1));

  // C2: a second address. C1's address has an account now, so the link is as
  // good as used (the claim's rule); a place held right now by an address
  // with no account yet is "in use".
  const c2 = await signUp(school("c2", "purdue.edu"), { club_code: link1.code });
  check("C2 the same setup link, a second school address (C1's now has an account) -> 403 club_link_used",
    refusal(c2) === "club_link_used", describe(c2));
  const link2 = await setupLink("s2");
  await holdPlace(link2.id, school("c2ghost"), new Date().toISOString());
  const c2b = await signUp(school("c2b", "purdue.edu"), { club_code: link2.code });
  check("C2 a setup link whose place another address holds right now (no account yet) -> 403 club_link_in_use",
    refusal(c2b) === "club_link_in_use" && c2b.error.message.startsWith("[vibe:club_link_in_use]"), describe(c2b));

  // C3, C4: refused before anything is written.
  const link3 = await setupLink("s3");
  const c3 = await signUp(personal("c3"), { club_code: link3.code });
  check("C3 a personal address on a live setup link -> 403 club_link_school_email", refusal(c3) === "club_link_school_email", describe(c3));
  const c4a = await signUp(school("c4a"), { club_code: "VIBE-NOT-A-CODE" });
  check("C4 a code that isn't a code -> 403 club_link_invalid", refusal(c4a) === "club_link_invalid", describe(c4a));
  const c4b = await signUp(school("c4b"), { club_code: generateClubLinkCode() });
  check("C4 an unknown well-formed code -> 403 club_link_invalid", refusal(c4b) === "club_link_invalid", describe(c4b));
  check("C3/C4 ... and wrote no place", (await uses(link3.id)).length === 0);

  if (!id1) throw new Error("C1 made no account; C5-C8 need it");

  // C5: the typed code is kept only as its hash.
  const row5 = JSON.parse(psql(`select json_build_object('meta', u.raw_user_meta_data,
      'idents', coalesce((select json_agg(i.identity_data) from auth.identities i where i.user_id = u.id), '[]'::json))
    from auth.users u where u.id = ${lit(id1)};`));
  check("C5 auth.users.raw_user_meta_data has club_code_hash (= the hash) and no club_code",
    row5.meta.club_code_hash === clubHash(link1.code) && !("club_code" in row5.meta), JSON.stringify(row5.meta));
  check("C5 auth.identities.identity_data has no club_code",
    row5.idents.length > 0 && row5.idents.every((d) => !("club_code" in (d ?? {}))), JSON.stringify(row5.idents));

  // C6: the place is tied to the account, and the link is waiting for it.
  const p6 = await admin.rpc("club_link_pending", { p_user: id1 });
  check("C6 club_link_pending(C1) -> {kind: setup, link_id: the link}",
    !p6.error && p6.data?.kind === "setup" && p6.data?.link_id === link1.id, JSON.stringify(p6.error ?? p6.data));
  const uses6 = await uses(link1.id);
  check("C6 ... the place now holds the account, not the address",
    uses6.length === 1 && uses6[0].user_id === id1 && uses6[0].claimed_email === null, JSON.stringify(uses6));

  // C7: the setup link makes its club.
  const redeem = () => admin.rpc("club_link_redeem_setup", { p_link: link1.id, p_user: id1, p_campus: "indianapolis", p_school: "" });
  const r7 = await redeem();
  const org7 = r7.data?.org_id;
  if (org7) made.orgs.push(org7);
  check("C7 club_link_redeem_setup -> ok with a handle", !r7.error && r7.data?.ok === true && typeof r7.data?.handle === "string",
    JSON.stringify(r7.error ?? r7.data));
  if (org7) {
    const o = must(await admin.from("orgs").select("handle, owner_id, verified, campus_id").eq("id", org7).single(), "read club");
    check("C7 ... the club: owner = C1, verified = the link's checked, the handle the link named",
      o.owner_id === id1 && o.verified === link1.checked && o.handle === `${TAG}-s1` && o.handle === r7.data.handle
        && o.campus_id === "indianapolis", JSON.stringify(o));
    const m = must(await admin.from("org_members").select("user_id, role").eq("org_id", org7), "read members");
    check("C7 ... its one member row: C1 as owner", m.length === 1 && m[0].user_id === id1 && m[0].role === "owner", JSON.stringify(m));
    const rooms = must(await admin.from("channels").select("kind").eq("org_id", org7), "read rooms").map((c) => c.kind).sort();
    check("C7 ... its three core rooms (board, lounge, officers)", rooms.join() === "board,lounge,officers", rooms.join());
    const l = must(await admin.from("club_links").select("used_at, used_by, org_id").eq("id", link1.id).single(), "read link");
    check("C7 ... the link: used_at, used_by = C1, org_id = the club", Boolean(l.used_at) && l.used_by === id1 && l.org_id === org7,
      JSON.stringify(l));
    const u7 = await uses(link1.id);
    check("C7 ... the place: C1, joined", u7.length === 1 && u7[0].user_id === id1 && Boolean(u7[0].joined_at), JSON.stringify(u7));
    const again = await redeem();
    check("C7 calling it again -> ok, already, the same club",
      again.data?.ok === true && again.data?.already === true && again.data?.org_id === org7, JSON.stringify(again.error ?? again.data));
    const p7 = await admin.rpc("club_link_pending", { p_user: id1 });
    check("C7 ... and nothing is pending for C1 any more", !p7.error && p7.data === null, JSON.stringify(p7.error ?? p7.data));
  }

  // C8: a used setup link.
  const c8 = await signUp(school("c8"), { club_code: link1.code });
  check("C8 after C7, a new school address with the same code -> 403 club_link_used", refusal(c8) === "club_link_used", describe(c8));

  const member = await membersCases();
  await laterCases(link1, id1, member);
}

async function membersCases() {
  // C9: a members' link on a checked club, two places.
  const ownerId = await adminUser(personal("owner"));
  const orgId = await throwawayClub(ownerId);
  const link9 = await membersLink(orgId, 2);
  const [a9, b9, c9] = [school("c9a"), school("c9b", "purdue.edu"), school("c9c")];
  const s9a = await signUp(a9, { club_code: loose(link9.code) });
  const s9b = await signUp(b9, { club_code: link9.code });
  check("C9 a members' link with 2 places: two new school addresses -> both made",
    !s9a.error && !s9b.error && Boolean(s9a.data?.user?.id) && Boolean(s9b.data?.user?.id), `${describe(s9a)} | ${describe(s9b)}`);
  const s9c = await signUp(c9, { club_code: link9.code });
  check("C9 ... a third -> 403 club_link_full", refusal(s9c) === "club_link_full", describe(s9c));
  const s9again = await signUp(a9, { club_code: link9.code });
  check("C9 ... the first address again -> Auth's own answer for an existing address, not a club-link refusal",
    Boolean(s9again.error) && refusal(s9again) === null, describe(s9again));
  const uses9 = await uses(link9.id);
  check("C9 ... the link holds exactly the two places", uses9.length === 2
    && uses9.map((u) => u.claimed_email).sort().join() === [a9, b9].sort().join(), JSON.stringify(uses9));
  const memberId = s9a.data?.user?.id;
  if (memberId) {
    const p9 = await admin.rpc("club_link_pending", { p_user: memberId });
    check("C9 ... club_link_pending(the first) -> {kind: members, the link, the club}",
      p9.data?.kind === "members" && p9.data?.link_id === link9.id && p9.data?.org_id === orgId, JSON.stringify(p9.error ?? p9.data));
  }

  // C10: off, expired, the club hidden; then back on. Room for more first,
  // so only the switch being tested can say no.
  await setLink(link9.id, { max_signups: 150 });
  await setLink(link9.id, { off_at: new Date().toISOString() });
  const s10a = await signUp(school("c10a"), { club_code: link9.code });
  check("C10 the members' link turned off -> 403 club_link_off", refusal(s10a) === "club_link_off", describe(s10a));
  await setLink(link9.id, { off_at: null, expires_at: fromNow(-3_600_000) });
  const s10b = await signUp(school("c10b"), { club_code: link9.code });
  check("C10 back on, past its end -> 403 club_link_expired", refusal(s10b) === "club_link_expired", describe(s10b));
  await setLink(link9.id, { expires_at: fromNow(21 * DAY) });
  must(await admin.from("orgs").update({ hidden_at: new Date().toISOString() }).eq("id", orgId), "hide club");
  const s10c = await signUp(school("c10c"), { club_code: link9.code });
  check("C10 its club hidden -> 403 club_link_off", refusal(s10c) === "club_link_off", describe(s10c));
  must(await admin.from("orgs").update({ hidden_at: null }).eq("id", orgId), "unhide club");
  const s10d = await signUp(school("c10d"), { club_code: link9.code });
  check("C10 all restored -> a new school address is let in again", !s10d.error && Boolean(s10d.data?.user?.id), describe(s10d));

  return { id: memberId, email: a9, link: link9 };
}

async function laterCases(link1, id1, member) {
  // C11: one fresh setup link, two people at once.
  const link11 = await setupLink("s11");
  const [a11, b11] = [school("c11a"), school("c11b", "purdue.edu")];
  const [r11a, r11b] = await Promise.all([signUp(a11, { club_code: link11.code }), signUp(b11, { club_code: link11.code })]);
  const winners = [r11a, r11b].filter((r) => !r.error && r.data?.user?.id);
  const loser = [r11a, r11b].find((r) => r.error);
  check("C11 two parallel sign-ups on one setup link -> exactly one account", winners.length === 1, `${describe(r11a)} | ${describe(r11b)}`);
  check("C11 ... the other refused as in use or used",
    ["club_link_in_use", "club_link_used"].includes(refusal(loser ?? {}) ?? ""), loser ? describe(loser) : "none");
  const accounts11 = (await runUsers()).filter((u) => u.email === a11 || u.email === b11);
  const uses11 = await uses(link11.id);
  check("C11 ... Auth holds one of the two addresses, and the link one place, for it",
    accounts11.length === 1 && uses11.length === 1 && uses11[0].claimed_email === accounts11[0].email,
    `${accounts11.length} accounts, places ${JSON.stringify(uses11)}`);

  // C12: the REST API, signed out and signed in.
  const signIn = await publicClient().auth.signInWithPassword({ email: member.email, password: PASSWORD });
  const token = signIn.data?.session?.access_token ?? "";
  check("C12 (a member account signs in, for a signed-in token)", Boolean(token), signIn.error ? describe(signIn) : "");
  const clients = [["anon", publicClient()]];
  if (token) clients.push(["a signed-in user", userClient(token)]);
  for (const [who, cl] of clients) {
    for (const table of ["club_links", "club_link_uses"]) {
      const t = await cl.from(table).select("id").limit(5);
      // No table grants for anon or authenticated: refused outright, not just empty.
      check(`C12 ${who} reading public.${table} -> refused (42501)`, t.error?.code === "42501", JSON.stringify(t.error ?? t.data));
    }
    const rd = await cl.rpc("club_link_redeem_setup", { p_link: link1.id, p_user: id1, p_campus: "indianapolis", p_school: "" });
    check(`C12 ${who} calling club_link_redeem_setup -> 42501 not allowed`,
      rd.error?.code === "42501" && rd.error?.message === "not allowed", JSON.stringify(rd.error ?? rd.data));
    const pd = await cl.rpc("club_link_pending", { p_user: member.id ?? id1 });
    check(`C12 ${who} calling club_link_pending -> 42501 not allowed`,
      pd.error?.code === "42501" && pd.error?.message === "not allowed", JSON.stringify(pd.error ?? pd.data));
    const hk = await cl.schema("auth_hooks").rpc("club_link_claim", { p_code: link11.code, p_email: school("c12") });
    check(`C12 ${who} asking for the auth_hooks schema (club_link_claim) -> refused (PGRST106)`,
      hk.error?.code === "PGRST106", JSON.stringify(hk.error ?? hk.data));
  }
  check("C12 ... and nothing was claimed for the address it named", (await uses(link11.id)).every((u) => u.claimed_email !== school("c12")));

  // C13: a place held 20 minutes by an address that never got an account is given back.
  const link13 = await setupLink("s13");
  await holdPlace(link13.id, school("c13ghost"), fromNow(-20 * 60_000));
  const addr13 = school("c13");
  const r13 = await signUp(addr13, { club_code: link13.code });
  check("C13 a stale place (20 min, no account) -> a different new address signs up", !r13.error && Boolean(r13.data?.user?.id), describe(r13));
  const uses13 = await uses(link13.id);
  check("C13 ... the stale place is gone, the link's one place is the new address",
    uses13.length === 1 && uses13[0].claimed_email === addr13, JSON.stringify(uses13));

  // C14: deleting an account drops the places its address still holds.
  const link14 = await setupLink("s14");
  const addr14 = school("c14");
  const id14 = await adminUser(addr14);
  await holdPlace(link14.id, addr14, new Date().toISOString());
  await holdPlace(link14.id, school("c14ghost"), new Date().toISOString());
  must(await admin.auth.admin.deleteUser(id14), "delete the C14 user");
  const uses14 = await uses(link14.id);
  check("C14 deleting a user drops its address's unbound place (and only that one)",
    uses14.length === 1 && uses14[0].claimed_email === school("c14ghost"), JSON.stringify(uses14));

  // C15: the gate's old behaviour is intact.
  const r15 = await signUp(school("c15"));
  check("C15 probe on, no club code, no access code -> 403 access_code_required", refusal(r15) === "access_code_required", describe(r15));
}

async function cleanUp() {
  const problems = [];
  const note = (r, what) => r.error && problems.push(`${what}: ${r.error.message}`);
  if (made.orgs.length > 0) note(await admin.from("orgs").delete().in("id", made.orgs), "clubs");
  note(await admin.from("orgs").delete().like("handle", `${TAG}%`), "clubs by handle");
  if (made.links.length > 0) note(await admin.from("club_links").delete().in("id", made.links), "links");
  note(await admin.from("club_links").delete().like("club_handle", `${TAG}%`), "links by handle");
  note(await admin.from("club_link_uses").delete().like("claimed_email", `${TAG}-%`), "places");
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
  let left = "";
  try {
    left = psql(`select concat_ws(' ',
        (select count(*) from auth.users where email like ${lit(`${TAG}-%`)}),
        (select count(*) from public.orgs where handle like ${lit(`${TAG}%`)}),
        (select count(*) from public.club_links where id = any(${lit(`{${made.links.join(",")}}`)}::uuid[]) or club_handle like ${lit(`${TAG}%`)}),
        (select count(*) from public.club_link_uses where claimed_email like ${lit(`${TAG}-%`)}));`);
  } catch (err) {
    problems.push(err.message);
  }
  if (problems.length > 0 || left !== "0 0 0 0") {
    failures += 1;
    console.log(`FAIL clean-up: ${problems.join("; ") || `left (users clubs links places): ${left}`} (run tag ${TAG})`);
  } else {
    console.log(`ok   clean-up: ${users.length} users, ${made.orgs.length} clubs, ${made.links.length} links (and their places) deleted`);
  }
}

console.log(`club-links-e2e against the LOCAL stack (${apiHost}), run ${TAG}`);
try {
  await cases();
} catch (err) {
  failures += 1;
  console.log(`FAIL stopped: ${err.message}`);
} finally {
  await cleanUp();
}
console.log(failures === 0 ? "club-links-e2e: all cases passed" : `club-links-e2e: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
