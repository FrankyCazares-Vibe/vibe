#!/usr/bin/env node
// Seed the LOCAL Supabase stack with the invented cast used for landing-page
// screenshots and the demo video (handoffs/s72-prep/demo-cast.md).
//
//   node scripts/demo-seed.mjs
//
// Sits NEXT TO scripts/local-seed.mjs and never replaces it: that file seeds
// the test accounts (Avery Owner, the test clubs), this one seeds the people
// and clubs that go on camera. The helpers are copied from it, not imported
// (it runs its main() on import).
//
// Re-runnable: every row is looked up first (by email, handle, or a stable
// natural key) and updated in place, so a second run changes nothing but
// resets the seeded fields back to their seeded values. It deletes nothing,
// ever, and writes no row it did not create, with ONE exception: the club
// `sae` (see SAE below).
//
// THE LEAD is Franky Cazares (LEAD below): the video is filmed from his own
// account, franky@example.test. His feed, events, inbox and RSVP are what the
// seed fills first; Maya Okafor stays in the cast as an ordinary student.
//
// KEEPING THE TEST ROWS OFF CAMERA. The feed, the events list and the club
// directory are all scoped to the viewer's HOME CAMPUS (posts.campus_id,
// the club's campus_id), and nearly every test row sits on `indianapolis`.
// So the cast lives on CAMPUS below, a campus no test row is on: the lead's
// feed, events and directory then hold the cast and nothing else, and no
// test row is touched. The price: the app names that campus wherever it
// names the home campus. Change CAMPUS (see CAMPUSES) and run again to move
// the people and the clubs; the cast's own posts are then written again on
// the new campus (ensurePost), because the posts_stamp_campus trigger never
// moves a post. The summary ends with a list of every off-cast row that
// would reach the lead's screens, on CAMPUS and on the other candidates.
//
// PHOTOS. Five posts carry one of Franky's own pictures. The files are read
// at run time from PHOTOS_DIR (~/vibe-demo-photos/web, or the DEMO_PHOTOS_DIR
// env var) and are NEVER copied into this repository, which is public. With
// the folder or a file missing the post stays a text post and the run says
// so. How a picture is stored on the local stack is at POST PHOTOS below.
//
// SAE. local-seed.mjs owns a club with the handle `sae` ("SAE (local copy)",
// owned by Avery Owner, on indianapolis). Handles are unique, so the demo
// reuses that row instead of making a second SAE: it sets the name, the
// description and the campus, and leaves the owner, the join policy, the
// rooms and Avery's messages alone. The founders join as an officer and two
// members. Running local-seed.mjs again puts the name and the campus back
// (and this script must then be run again before filming).
//
// THE CLOCK. Event dates are computed from today on every run, in whole
// CAMPUS days (America/Indiana/Indianapolis), not UTC days as local-seed
// does: "Blitz Night" has to be TODAY at 7 pm on the wall clock of whoever
// is filming, also after 8 pm, when the UTC date is already tomorrow. Two
// runs on the same campus day write the same dates. Posts and messages get
// their time ("3 hours ago") once, when they are first written: run the
// seed on the day of the shoot so the feed reads as this week.
//
// SAFETY: the URL and keys come ONLY from `supabase status -o env` (the local
// CLI stack). No .env file is read. The script refuses to run unless the API
// host is 127.0.0.1 or localhost, so it can never write to production.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Safety gate: local stack only. Word for word the gate of local-seed.mjs.
// ---------------------------------------------------------------------------
function readLocalStatus() {
  const res = spawnSync("supabase", ["status", "-o", "env"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    console.error(
      "Refusing to seed: `supabase status -o env` failed. Start the local stack with `supabase start`.",
    );
    if (res.stderr) console.error(res.stderr.trim());
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
const SERVICE_KEY = STATUS.SERVICE_ROLE_KEY ?? "";
const ANON_KEY = STATUS.ANON_KEY ?? "";

let apiHost = "";
try {
  apiHost = new URL(API_URL).hostname;
} catch {
  // falls through to the refusal below
}
if (apiHost !== "127.0.0.1" && apiHost !== "localhost") {
  console.error(
    `Refusing to seed: API_URL is "${API_URL}". This script only writes to a local stack (127.0.0.1 / localhost).`,
  );
  process.exit(1);
}
if (!SERVICE_KEY || !ANON_KEY) {
  console.error("Refusing to seed: SERVICE_ROLE_KEY or ANON_KEY missing from `supabase status -o env`.");
  process.exit(1);
}

// Loaded only after the gate has passed.
const { createClient } = await import("@supabase/supabase-js");

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_KEY, CLIENT_OPTS);

// ---------------------------------------------------------------------------
// Shared constants and helpers.
// ---------------------------------------------------------------------------
const PASSWORD = "vibe-local-1234"; // the same local password as local-seed.mjs
const LEAD = "franky"; // whose phone the video is filmed from (ACCOUNTS key)
// The cast's home campus (see KEEPING THE TEST ROWS OFF CAMERA), one of the
// three below. `systems` is campuses.systems: a student's campus has to be
// in their university (trigger users_campus_in_system), and main() refuses a
// campus some account's `system` is not in. `label` is the legacy `school`
// text for an IU student there, which is also what the profile badge says
// (legacyLabel, src/lib/iu/campuses.ts); `name` is what a header calls it.
//   Oct 2 leak check: fort-wayne is clean. iu-bloomington carries ONE test
//   row, the club `test_bloomington_cycling` (verified, visible), which
//   shows in the club directory there. indianapolis carries all the rest.
const CAMPUSES = {
  "fort-wayne": { name: "Fort Wayne", systems: ["iu", "purdue"], label: { iu: "IU Fort Wayne", purdue: "Purdue Fort Wayne" } },
  indianapolis: { name: "Indianapolis", systems: ["iu", "purdue"], label: { iu: "IU Indianapolis", purdue: "Purdue Indianapolis" } },
  "iu-bloomington": { name: "IU Bloomington", systems: ["iu"], label: { iu: "IU Bloomington" } },
};
const CAMPUS = "iu-bloomington";
const ZONE = "America/Indiana/Indianapolis"; // CAMPUS_TIME_ZONE, src/lib/push/event-notice.ts

if (!CAMPUSES[CAMPUS]) {
  console.error(`Refusing to seed: CAMPUS is "${CAMPUS}". Use one of: ${Object.keys(CAMPUSES).join(", ")}.`);
  process.exit(1);
}

// Where Franky's pictures are read from. Outside the repository on purpose.
const PHOTOS_DIR = process.env.DEMO_PHOTOS_DIR || join(homedir(), "vibe-demo-photos", "web");

// TERMS_VERSION lives in TypeScript; read it from the source so a Terms bump
// never leaves the seed stamping a stale version (which hasRecordedConsent
// would treat as "no consent").
const TERMS_VERSION = (() => {
  const src = readFileSync(join(REPO_ROOT, "src/lib/legal/terms.ts"), "utf8");
  const m = src.match(/export const TERMS_VERSION = "([^"]+)"/);
  if (!m) {
    console.error("Could not read TERMS_VERSION from src/lib/legal/terms.ts");
    process.exit(1);
  }
  return m[1];
})();

/** Same rule as src/lib/legal/terms.ts hasRecordedConsent. */
function hasRecordedConsent(row) {
  return Boolean(
    row?.terms_accepted_at && row?.age_attested_at && row?.terms_version === TERMS_VERSION,
  );
}

/** Unwrap a supabase-js result, or stop the run with a readable error. */
function must({ data, error }, what) {
  if (error) {
    console.error(`\nFailed: ${what}\n`, error);
    process.exit(1);
  }
  return data;
}

/** Legacy `school` label the create routes still dual-write ("IU Fort Wayne"). */
function schoolLabel(system) {
  return CAMPUSES[CAMPUS].label[system] ?? "";
}

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

/** The calendar date and wall clock of an instant, read in the campus zone. */
function zoneParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/**
 * The instant the campus wall clock reads `hour`:00, `days` campus days from
 * today (0 = today). The zone's offset is found by asking what the clock
 * reads at a guess and correcting by the difference, twice, so it holds
 * across the November and March clock changes.
 */
function campusTime(days, hour) {
  const today = zoneParts(new Date());
  const wall = Date.UTC(today.year, today.month - 1, today.day + days, hour);
  let t = wall;
  for (let pass = 0; pass < 2; pass++) {
    const p = zoneParts(new Date(t));
    t += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(t);
}

// ---------------------------------------------------------------------------
// Club rooms need migration A (20261001100000_chat_v2_rooms): the clubs get
// their rooms from chat_repair_club and rooms are looked up by channels.kind.
// local-seed.mjs also seeds the shape before that migration; the demo does
// not, there is nothing to film there. 42703 = Postgres "column does not
// exist"; PGRST204 = the same answer from PostgREST's schema cache.
// ---------------------------------------------------------------------------
{
  const { error } = await admin.from("channels").select("kind").limit(1);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    console.error("Refusing to seed: channels.kind is absent. Apply the migrations to the local stack first.");
    process.exit(1);
  }
  if (error) {
    console.error("\nFailed: detect channels.kind\n", error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Accounts (demo-cast.md, "Students"). Same four facts as local-seed.mjs:
//   school-verified = school_verified + school_email + school_system
//                     (what src/lib/auth/school-email-apply.ts writes)
//   has a campus    = campus_id in the user's system (trigger
//                     users_campus_in_system) + campus_set_at (= "confirmed")
//   onboarded       = otto_answers is a non-empty object
//                     (src/lib/auth/post-login.ts isOttoOnboardingComplete)
//   Terms accepted  = terms_version = TERMS_VERSION + terms_accepted_at +
//                     age_attested_at, plus a terms_acceptances ledger row
// So signing in lands in the app, not in onboarding or the Terms gate.
//
// `year` is the number the app shows as "Year N": 1 freshman, 2 sophomore,
// 3 junior, 4 senior. The school emails are invented (`<name>.demo@`) and
// nothing is ever sent to them: the seed writes the verified state directly.
// The whole cast is IU, so it can live on an IU-only campus too.
// The three founders appear as themselves: nothing about them is invented.
// Franky's year, major and bio are his own words (Oct 2). James and Rylan
// are `real: true`: their year and major are never written, and a bio
// already on the row (typed in the app) is kept.
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  { key: "maya", email: "maya@example.test", handle: "mayaokafor", name: "Maya Okafor",
    system: "iu", year: 2, major: "Media Arts",
    bio: "Media arts. New here this semester, still finding the good coffee." },
  { key: "theo", email: "theo@example.test", handle: "theolindqvist", name: "Theo Lindqvist",
    system: "iu", year: 1, major: "Exploratory",
    bio: "Freshman. Undecided and fine with it." },
  { key: "priya", email: "priya@example.test", handle: "priyaraman", name: "Priya Raman",
    system: "iu", year: 4, major: "Informatics",
    bio: "Informatics senior. I run Chess Club and I will teach you an opening." },
  { key: "jonah", email: "jonah@example.test", handle: "jonahreyes", name: "Jonah Reyes",
    system: "iu", year: 3, major: "Mechanical Engineering",
    bio: "Mechanical engineering. Finance Club officer." },
  { key: "amara", email: "amara@example.test", handle: "amaradiallo", name: "Amara Diallo",
    system: "iu", year: 3, major: "Nursing",
    bio: "Nursing junior. RA on Tower Floor 3, my door is open." },
  { key: "lucas", email: "lucas@example.test", handle: "lucasferreira", name: "Lucas Ferreira",
    system: "iu", year: 2, major: "Music Technology",
    bio: "Music technology. Usually in a practice room in North Hall." },
  { key: "hana", email: "hana@example.test", handle: "hanasato", name: "Hana Sato",
    system: "iu", year: 4, major: "Computer Graphics",
    bio: "Computer graphics senior. Always has a camera." },
  { key: "devon", email: "devon@example.test", handle: "devonbrooks", name: "Devon Brooks",
    system: "iu", year: 3, major: "Sports Management",
    bio: "Sports management. Intramurals most nights." },
  { key: "noor", email: "noor@example.test", handle: "noorhaddad", name: "Noor Haddad",
    system: "iu", year: 2, major: "Biology",
    bio: "Biology sophomore. Learning chess the hard way." },
  { key: "eli", email: "eli@example.test", handle: "elicarter", name: "Eli Carter",
    system: "iu", year: 1, major: "Computer Science",
    bio: "CS freshman. Tower Floor 3." },
  // The founders, as themselves.
  { key: "franky", email: "franky@example.test", handle: "franky", name: "Franky Cazares",
    system: "iu", year: 3, major: "Marketing", bio: "vibin" },
  { key: "james", email: "james@example.test", handle: "jamesandres", name: "James Andres",
    system: "iu", real: true, bio: "Vibe team." },
  { key: "rylan", email: "rylan@example.test", handle: "rylanconaway", name: "Rylan Conaway",
    system: "iu", real: true, bio: "Vibe team." },
];

/** `maya@example.test` + iu -> `maya.demo@iu.edu`: unique, and plainly not a real address. */
function schoolEmail(spec) {
  return `${spec.email.split("@")[0]}.demo@${spec.system === "purdue" ? "purdue.edu" : "iu.edu"}`;
}

/** Same shape the onboarding flow saves (OnboardingMobile buildOttoConfig). */
const OTTO_ANSWERS = { name: "otto", platforms: [], voiceSamples: [], leash: "ask" };

async function findAuthUserByEmail(email) {
  for (let page = 1; ; page++) {
    const data = must(
      await admin.auth.admin.listUsers({ page, perPage: 200 }),
      "list auth users",
    );
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

async function ensureAccount(spec) {
  // Signup metadata, exactly what /auth/signup sends: handle_new_user() turns
  // it into the consent columns and a 'signup' terms_acceptances row.
  const meta = { full_name: spec.name, terms_version: TERMS_VERSION, age_attested: true };

  let authUser = await findAuthUserByEmail(spec.email);
  if (authUser) {
    must(
      await admin.auth.admin.updateUserById(authUser.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: meta,
      }),
      `update auth user ${spec.email}`,
    );
  } else {
    const data = must(
      await admin.auth.admin.createUser({
        email: spec.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: meta,
      }),
      `create auth user ${spec.email}`,
    );
    authUser = data.user;
  }
  const id = authUser.id;

  const current = must(
    await admin
      .from("users")
      .select(
        "terms_version, terms_accepted_at, age_attested_at, campus_set_at, handle_changed_at, otto_answers, bio",
      )
      .eq("id", id)
      .single(),
    `read users row ${spec.email}`,
  );

  const now = new Date().toISOString();
  const patch = {
    handle: spec.handle,
    name: spec.name,
    // A founder's year and major are theirs to fill in; their bio is
    // written only while the row has none.
    ...(spec.real ? {} : { major: spec.major, year: spec.year }),
    bio: spec.real && current.bio ? current.bio : spec.bio,
    school_email: schoolEmail(spec),
    school_verified: true,
    school_system: spec.system,
    campus_id: CAMPUS,
    school: schoolLabel(spec.system),
    // Keep an existing clock so a re-run does not restart the 30-day campus rule.
    campus_set_at: current.campus_set_at ?? now,
    // Keep saved answers on a re-run; a fresh account gets the onboarding shape.
    otto_answers:
      Object.keys(current.otto_answers ?? {}).length > 0
        ? current.otto_answers
        : { ...OTTO_ANSWERS, setupAt: now },
    // Onboarding Finish starts the 14-day handle cooldown.
    handle_changed_at: current.handle_changed_at ?? now,
  };

  // Consent: only (re)stamp when the record is missing or stale, the way
  // POST /api/me/accept-terms does it (ledger row first, then the columns).
  if (!hasRecordedConsent(current)) {
    must(
      await admin.from("terms_acceptances").insert({
        user_id: id, terms_version: TERMS_VERSION, age_attested: true, source: "interstitial",
      }),
      `insert terms_acceptances ${spec.email}`,
    );
    Object.assign(patch, { terms_version: TERMS_VERSION, terms_accepted_at: now, age_attested_at: now });
  }

  must(await admin.from("users").update(patch).eq("id", id), `update users row ${spec.email}`);
  return id;
}

// ---------------------------------------------------------------------------
// Clubs (demo-cast.md, "Orgs"). Mirrors POST /api/orgs: the org row
// (is_public is NOT sent: the orgs_sync_join_policy trigger derives it from
// join_policy), the owner's org_members row, then chat_repair_club, which
// makes the Lounge, the Board and the Officers room and gives the members
// their rows. The org_members_imply_follow trigger adds each member's 'join'
// follow.
//
// All five are VERIFIED and not hidden: only a verified, visible club's
// events are listed campus-wide (GET /api/events), and a club's campus is
// what puts it in the directory (GET /api/orgs?filter=discover).
//
// `shared: true` marks the one club this script did not create (see SAE in
// the header). When the row exists only its name, description and campus are
// written, and what they were is printed. When it does not exist (a local
// stack that never ran local-seed.mjs) it is created like the others.
// ---------------------------------------------------------------------------
const CLUBS = [
  { handle: "sae", name: "SAE", owner: "franky", join_policy: "invite", shared: true,
    backdrop: "midnight",
    description: "Sigma Alpha Epsilon. Brotherhood, service and a good cookout." },
  { handle: "chess_club", name: "Chess Club", owner: "priya", join_policy: "open",
    backdrop: "forest",
    description: "Weekly games in the Campus Center. Beginners welcome, we will teach you." },
  { handle: "finance_club", name: "Finance Club", owner: "jonah", join_policy: "open",
    backdrop: "deep-violet",
    description: "Markets, careers and resume nights. Every major is welcome." },
  { handle: "tower_floor_3", name: "Tower Floor 3", owner: "amara", join_policy: "request",
    backdrop: "ember",
    description: "Everyone who lives on the third floor of the Tower. Ask your RA to let you in." },
  { handle: "north_hall", name: "North Hall", owner: "lucas", join_policy: "open",
    backdrop: "sand-purple",
    description: "News, study nights and events for the people who live in North Hall." },
];

/** Returns the club's id. `owners[handle]` is filled with who owns the row. */
async function ensureClub(spec, users, systems, owners) {
  const ownerId = users[spec.owner];
  const existing = must(
    await admin.from("orgs").select("id, name, description, campus_id, owner_id, verified").eq("handle", spec.handle).maybeSingle(),
    `look up org ${spec.handle}`,
  );

  // The club local-seed.mjs owns: three fields and the verified flag (it is
  // already true there; an unverified club's events are not listed).
  if (existing && spec.shared) {
    const fields = { name: spec.name, description: spec.description, campus_id: CAMPUS, verified: true };
    const changed = Object.keys(fields).filter((k) => existing[k] !== fields[k]);
    if (changed.length > 0) {
      must(await admin.from("orgs").update(fields).eq("id", existing.id), `update shared org ${spec.handle}`);
      console.log(
        `  ${spec.handle} is local-seed's row. Changed: ` +
          changed.map((k) => `${k} ${JSON.stringify(existing[k])} -> ${JSON.stringify(fields[k])}`).join("; ") +
          ". Run scripts/local-seed.mjs to put it back.",
      );
    }
    owners[spec.handle] = existing.owner_id;
    return existing.id;
  }

  const fields = {
    name: spec.name,
    description: spec.description,
    join_policy: spec.join_policy,
    audience: "both",
    campus_id: CAMPUS,
    school: schoolLabel(systems[spec.owner]),
    owner_id: ownerId,
    verified: true,
    backdrop_preset: spec.backdrop,
    hidden_at: null,
  };

  let orgId;
  if (existing) {
    must(await admin.from("orgs").update(fields).eq("id", existing.id), `update org ${spec.handle}`);
    orgId = existing.id;
  } else {
    const row = must(
      await admin.from("orgs").insert({ handle: spec.handle, ...fields }).select("id").single(),
      `insert org ${spec.handle}`,
    );
    orgId = row.id;
  }

  must(
    await admin
      .from("org_members")
      .upsert({ org_id: orgId, user_id: ownerId, role: "owner" }, { onConflict: "org_id,user_id" }),
    `owner membership ${spec.handle}`,
  );
  owners[spec.handle] = ownerId;
  return orgId;
}

// Who is in which club, besides its owner. Posting AS a club and creating
// its events take an owner or an admin (/api/orgs/[slug]/posts, POST
// /api/events), so the person who posts for a club is one of those.
//   SAE: Franky and James ONLY. Rylan Conaway is not in SAE (Franky, Oct 2):
//   he is in the cast as himself, with no SAE membership, post or event.
//   Maya is in no club: she is new, she FOLLOWS all five (ORG_FOLLOWS).
//   Franky is in SAE only; he follows the other four.
const MEMBERS = [
  { club: "sae", user: "franky", role: "admin" },
  { club: "sae", user: "james", role: "member" },
  { club: "chess_club", user: "noor", role: "member" },
  { club: "chess_club", user: "eli", role: "member" },
  { club: "chess_club", user: "lucas", role: "member" },
  { club: "finance_club", user: "devon", role: "member" },
  { club: "finance_club", user: "noor", role: "member" },
  { club: "tower_floor_3", user: "eli", role: "member" },
  { club: "tower_floor_3", user: "theo", role: "member" },
  { club: "north_hall", user: "hana", role: "member" },
  { club: "north_hall", user: "noor", role: "member" },
];

/**
 * Add a non-owner member with a role, the way admitMember() does it
 * (src/lib/orgs/membership.ts): the org_members row, then a channel_members
 * row for every public channel. The follow comes from the trigger. The
 * club's owner is skipped: their row is the owner row and stays one.
 */
async function ensureMember(orgId, userId, role, ownerId) {
  if (userId === ownerId) return;
  must(
    await admin
      .from("org_members")
      .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" }),
    `membership ${role}`,
  );
  const channels = must(
    await admin.from("channels").select("id").eq("org_id", orgId).eq("is_private", false),
    "public channels",
  );
  if (channels.length === 0) return;
  must(
    await admin.from("channel_members").upsert(
      channels.map((c) => ({
        channel_id: c.id, user_id: userId, role: "member", accepted_at: new Date().toISOString(),
      })),
      { onConflict: "channel_id,user_id", ignoreDuplicates: true },
    ),
    "subscribe public channels",
  );
}

// Deliberate follows (not membership): anyone can follow a visible club, and
// a followed club's posts ride into the follower's feed from any campus.
// Franky (the lead) follows all five: SAE through his membership, the other
// four here. Maya follows all five too. So both feeds carry every club.
const ORG_FOLLOWS = [
  { club: "chess_club", user: "franky", source: "discover" },
  { club: "finance_club", user: "franky", source: "discover" },
  { club: "tower_floor_3", user: "franky", source: "discover" },
  { club: "north_hall", user: "franky", source: "discover" },
  { club: "sae", user: "maya", source: "profile" },
  { club: "chess_club", user: "maya", source: "discover" },
  { club: "finance_club", user: "maya", source: "discover" },
  { club: "tower_floor_3", user: "maya", source: "discover" },
  { club: "north_hall", user: "maya", source: "discover" },
  { club: "sae", user: "theo", source: "discover" },
  { club: "sae", user: "hana", source: "discover" },
  { club: "chess_club", user: "theo", source: "discover" },
  { club: "chess_club", user: "hana", source: "discover" },
  { club: "chess_club", user: "amara", source: "discover" },
  { club: "finance_club", user: "priya", source: "discover" },
  { club: "finance_club", user: "james", source: "discover" },
  { club: "finance_club", user: "hana", source: "discover" },
  { club: "tower_floor_3", user: "noor", source: "discover" },
  { club: "north_hall", user: "theo", source: "discover" },
  { club: "north_hall", user: "amara", source: "discover" },
  { club: "north_hall", user: "devon", source: "discover" },
];

/** A deliberate follow (not membership). first_followed_at is left to the trigger. */
async function ensureOrgFollow(orgId, userId, source) {
  must(
    await admin
      .from("org_followers")
      .upsert({ org_id: orgId, user_id: userId, source }, { onConflict: "org_id,user_id", ignoreDuplicates: true }),
    `org follow (${source})`,
  );
}

// ---------------------------------------------------------------------------
// Posts. Keyed on (author, club, content): an existing post is left untouched
// so the posts_stamp_edited trigger never marks it edited. The campus and
// school_system columns are stamped by the posts_stamp_campus trigger: a
// club post gets the CLUB's campus when its author is the club's owner or
// admin, a personal post the author's.
//
// `club` = posted as that club (the author must be its owner or admin).
// `hoursAgo` is used once, when the post is first written.
// `image` is the photo's file name in PHOTOS_DIR, or null for a text post
// (see POST PHOTOS below).
// `was` lists earlier wordings of the same post. A post is keyed on its
// text, so a reworded one would otherwise stay next to the new one: the
// rows this script wrote under the old wording are deleted first. (Deleting
// and writing again, not an UPDATE, so the post never reads "Edited".)
// `wasBy` lists cast members this same post was first seeded under: their
// personal post with this text is deleted, so a post moved to another author
// does not stay behind on the first one's profile.
// ---------------------------------------------------------------------------
const POSTS = [
  { author: "priya", club: "chess_club", hoursAgo: 2, tags: [], image: null,
    content: "Blitz Night is tonight at 7 in the Campus Center. Five minute games, every level welcome. We have extra boards, so just show up." },
  { author: "theo", hoursAgo: 4, tags: [], image: null,
    content: "Does anyone know where the good study spots are? Asking as a freshman who has sat in the same chair for three days." },
  { author: "amara", club: "tower_floor_3", hoursAgo: 7, tags: [], image: null,
    content: "Floor 3, movie night is coming up. Put your picks in the chat and I will bring the popcorn." },
  { author: "hana", hoursAgo: 13, tags: [], image: "campus-night.jpg",
    was: ["Took my camera out at sunset with no plan. Best hour of my week."],
    content: "Took my camera out after dark with no plan. Best hour of my week." },
  { author: "maya", hoursAgo: 19, tags: [], image: "campus-fog.jpg",
    content: "First week here and I already know which stairwell is the fast one. Small wins." },
  { author: "jonah", club: "finance_club", hoursAgo: 25, tags: [], image: null,
    content: "Resume Review Night is this week. Bring a draft, even a rough one. Rough is what we are there for." },
  { author: "lucas", club: "north_hall", hoursAgo: 29, tags: [], image: null,
    content: "The first floor lounge has new whiteboards. Midterm Study Jam is this week if you want company while you study." },
  { author: "devon", hoursAgo: 33, tags: [], image: null,
    content: "Intramural sign ups close Friday. We need two more for flag football, no experience needed." },
  { author: "franky", club: "sae", hoursAgo: 38, tags: [], image: "sae-letters.jpg",
    was: ["Cookout on the Lawn is this week. Burgers, veggie burgers and yard games. Everyone is welcome, bring a friend."],
    content: "Letters are up on the lawn. Cookout is this week: burgers, veggie burgers and yard games. Everyone is welcome, bring a friend." },
  { author: "noor", hoursAgo: 44, tags: [], image: null,
    content: "Lost three games in a row at Chess Club and still had a great night. See you at the next one." },
  { author: "eli", hoursAgo: 50, tags: [], image: null,
    content: "Floor dinner was a good idea. Whoever suggested it, thank you." },
  { author: "james", hoursAgo: 56, tags: [], image: null,
    content: "Good chapter meeting tonight. Proud of this group." },
  { author: "rylan", hoursAgo: 62, tags: [], image: "lawn-event.jpg",
    content: "Tabling outside the Campus Center this afternoon. Come say hi." },
  // Franky's pictures of real people go on the post of the founder who is
  // in them (Franky, Oct 2: the kitchen and the gorilla statue are Rylan,
  // the kitten is James, the sand dunes are Franky), never on an invented
  // student's. All older than the top of the feed, which still opens on
  // Priya's Blitz Night post.
  { author: "rylan", hoursAgo: 48, tags: [], image: "kitchen.jpg", wasBy: ["franky"],
    content: "Family dinner at the house." },
  { author: "franky", hoursAgo: 72, tags: [], image: "turtle.jpg",
    content: "Already missing summer." },
  { author: "rylan", hoursAgo: 96, tags: [], image: "gorilla.jpg", wasBy: ["franky"],
    content: "Found a quiet spot to think." },
  { author: "franky", hoursAgo: 144, tags: [], image: "field-night.jpg",
    content: "Friday night lights." },
  { author: "james", hoursAgo: 192, tags: [], image: "kitten.jpg", wasBy: ["franky"],
    content: "New roommate." },
  { author: "franky", hoursAgo: 264, tags: [], image: "dunes.jpg",
    content: "Sand in everything. Worth it." },
];

// ---------------------------------------------------------------------------
// POST PHOTOS: how a picture is stored, and what the local stack needs.
//   In the app a photo post is a file in the PUBLIC Supabase bucket
//   `profiles`, at <author id>/posts/<file> (POST /api/me/profile-upload),
//   and posts.media_url holds its full public URL. The feed hands an http(s)
//   media_url to a plain <img> as it is (src/lib/post-media-url.ts); there
//   is no image host allowlist to pass. Club posts made in the app use R2
//   keys instead; the local R2 keys are blank, so the club post here uses
//   the author's `profiles` folder like a personal post.
//   So the seed uploads the file to the LOCAL `profiles` bucket, same path,
//   and points media_url at the local public URL (API_URL/storage/v1/...).
//   ONE THING STANDS IN THE WAY: the posts_check_media_refs trigger only
//   accepts https://<the production project host>/..., written into the
//   function (the database cannot read env), so on a local stack it refuses
//   the local URL from every writer, the service role included. The
//   media_url is therefore written by setLocalMediaUrl: one UPDATE of that
//   one column, on a post this script made, in a psql session inside the
//   local database container with `session_replication_role = replica`,
//   which skips triggers for that one transaction. No function, trigger or
//   policy is changed. Without docker the post stays a text post.
//   The URL names API_URL's host (127.0.0.1), so the pictures load in a
//   browser on this Mac, not on a phone pointed at it over the network.
// ---------------------------------------------------------------------------
const photoNotes = [];

/** The local database container: supabase_db_<project_id of supabase/config.toml>. */
const DB_CONTAINER = (() => {
  const m = readFileSync(join(REPO_ROOT, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  return m ? `supabase_db_${m[1]}` : null;
})();

/** Write a local URL into posts.media_url past the host-pinning trigger. False when it could not. */
function setLocalMediaUrl(postId, userId, url) {
  let dbHost = "";
  try {
    dbHost = new URL(STATUS.DB_URL ?? "").hostname;
  } catch {
    // falls through to the refusal below
  }
  if (!DB_CONTAINER || (dbHost !== "127.0.0.1" && dbHost !== "localhost")) return false;
  const res = spawnSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1",
      "-v", `id=${postId}`, "-v", `uid=${userId}`, "-v", `url=${url}`],
    {
      encoding: "utf8",
      input:
        "begin;\nset local session_replication_role = replica;\n" +
        "update public.posts set media_url = :'url' where id = :'id'::uuid and user_id = :'uid'::uuid;\ncommit;\n",
    },
  );
  if (res.error || res.status !== 0) {
    if (res.stderr) console.error(res.stderr.trim());
    return false;
  }
  return true;
}

/** Upload one picture to the author's post folder and point the post at it. */
async function ensurePostPhoto(postId, userId, file, currentUrl) {
  const src = join(PHOTOS_DIR, file);
  if (!existsSync(src)) {
    photoNotes.push(`${file}: not in ${PHOTOS_DIR}; its post is text only`);
    return;
  }
  const bytes = readFileSync(src);
  const name = `demo-${file}`;
  const folder = `${userId}/posts`;
  const listed = must(await admin.storage.from("profiles").list(folder, { search: name }), `list ${name}`);
  const there = listed.find((o) => o.name === name);
  // Uploaded only when missing or when the file changed size: a re-run with
  // the same picture writes nothing.
  if (!there || there.metadata?.size !== bytes.length) {
    must(
      await admin.storage.from("profiles").upload(`${folder}/${name}`, bytes, { contentType: "image/jpeg", upsert: true }),
      `upload ${name}`,
    );
  }
  const url = `${API_URL}/storage/v1/object/public/profiles/${folder}/${name}`;
  if (currentUrl === url) return;
  const ok = setLocalMediaUrl(postId, userId, url);
  const now = ok
    ? must(await admin.from("posts").select("media_url").eq("id", postId).single(), `read back ${name}`).media_url
    : null;
  if (now !== url) photoNotes.push(`${file}: uploaded, but media_url could not be written (docker exec ${DB_CONTAINER}); its post is text only`);
}

async function ensurePost(spec, users, clubs) {
  const userId = users[spec.author];
  const orgId = spec.club ? clubs[spec.club] : null;
  const mine = (columns) => {
    const q = admin.from("posts").select(columns).eq("user_id", userId);
    return orgId ? q.eq("org_id", orgId) : q.is("org_id", null);
  };

  // An earlier wording of this post, written by this script: gone.
  for (const old of spec.was ?? []) {
    const stale = must(await mine("id").eq("content", old), `look up an earlier wording by ${spec.author}`);
    if (stale.length === 0) continue;
    must(await admin.from("posts").delete().in("id", stale.map((p) => p.id)), `delete an earlier wording by ${spec.author}`);
    console.log(`  reworded: ${spec.author}'s "${old.slice(0, 40)}..." is replaced`);
  }

  // The same post, first seeded under another cast member: gone.
  for (const who of spec.wasBy ?? []) {
    const stale = must(
      await admin.from("posts").select("id").eq("user_id", users[who]).is("org_id", null).eq("content", spec.content),
      `look up ${who}'s copy of a post now by ${spec.author}`,
    );
    if (stale.length === 0) continue;
    must(await admin.from("posts").delete().in("id", stale.map((p) => p.id)), `delete ${who}'s copy of a post now by ${spec.author}`);
    console.log(`  moved author: "${spec.content.slice(0, 40)}" is now ${spec.author}'s, not ${who}'s`);
  }

  let found = must(
    await mine("id, campus_id, created_at, media_url").eq("content", spec.content).order("created_at").limit(1),
    `look up post by ${spec.author}`,
  );
  // The cast moved campus since this post was written. The trigger pins a
  // post's campus for good, so the post is written again (same time, same
  // text) and lands on the new one. Likes and comments on it do not survive.
  let at = hoursAgo(spec.hoursAgo);
  if (found.length > 0 && found[0].campus_id !== CAMPUS) {
    at = found[0].created_at;
    must(await admin.from("posts").delete().eq("id", found[0].id), `delete post by ${spec.author} for the campus move`);
    console.log(`  moved to ${CAMPUS}: ${spec.author}'s "${spec.content.slice(0, 40)}..."`);
    found = [];
  }

  const post = found[0] ?? must(
    await admin
      .from("posts")
      .insert({
        user_id: userId, org_id: orgId, type: "post", content: spec.content, tags: spec.tags,
        status: "published", created_at: at,
      })
      .select("id, media_url")
      .single(),
    `insert post by ${spec.author}`,
  );
  if (spec.image) await ensurePostPhoto(post.id, userId, spec.image, post.media_url);
  return post.id;
}

// ---------------------------------------------------------------------------
// Events (demo-cast.md, "Events this week"). Keyed on (club, title). Dates
// are re-computed on every run (see THE CLOCK), so "Blitz Night" is today
// whenever the seed was last run today. `inDays` and `hour` are campus days
// and the campus wall clock; `hours` is how long it runs.
//
// The events list hides an event once it has ended (GET /api/events filters
// ends_at >= now), so Blitz Night runs 7 to 10 pm: film before 10. A run
// after that says so at the end.
// ---------------------------------------------------------------------------
const EVENTS = [
  { club: "chess_club", creator: "priya", title: "Blitz Night", inDays: 0, hour: 19, hours: 3,
    location: "Campus Center, Room 148",
    description: "Five minute games, every level welcome. Boards and clocks are provided, just bring yourself." },
  { club: "finance_club", creator: "jonah", title: "Resume Review Night", inDays: 2, hour: 18, hours: 2,
    location: "Campus Center, Room 305",
    description: "Bring a printed resume or a laptop. Juniors and seniors will read it with you and mark it up." },
  { club: "tower_floor_3", creator: "amara", title: "Floor Movie Night", inDays: 3, hour: 20, hours: 2,
    location: "Tower, third floor lounge",
    description: "We vote on the movie in the floor chat. Popcorn is covered." },
  { club: "sae", creator: "franky", title: "Cookout on the Lawn", inDays: 4, hour: 17, hours: 2,
    location: "The lawn behind the Campus Center",
    description: "Burgers, veggie burgers and yard games. Open to everyone, bring a friend." },
  { club: "north_hall", creator: "lucas", title: "Midterm Study Jam", inDays: 5, hour: 14, hours: 3,
    location: "North Hall, first floor lounge",
    description: "Quiet tables, whiteboards and coffee. Come for an hour or stay all afternoon." },
];

async function ensureEvent(spec, users, clubs) {
  const orgId = clubs[spec.club];
  const start = campusTime(spec.inDays, spec.hour);
  const fields = {
    creator_id: users[spec.creator],
    description: spec.description,
    location: spec.location,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + spec.hours * 3_600_000).toISOString(),
  };
  const found = must(
    await admin.from("events").select("id").eq("org_id", orgId).eq("title", spec.title).limit(1),
    `look up event ${spec.title}`,
  );
  if (found.length > 0) {
    must(await admin.from("events").update(fields).eq("id", found[0].id), `update event ${spec.title}`);
    return found[0].id;
  }
  const row = must(
    await admin.from("events").insert({ org_id: orgId, title: spec.title, ...fields }).select("id").single(),
    `insert event ${spec.title}`,
  );
  return row.id;
}

// Franky is going to Blitz Night (the one he sends James on camera), and so
// is Maya. James has NOT answered it: that is why Franky asks him. Rylan
// holds no SAE RSVP.
const RSVPS = [
  { title: "Blitz Night", user: "franky", status: "going" },
  { title: "Cookout on the Lawn", user: "franky", status: "going" },
  { title: "Blitz Night", user: "maya", status: "going" },
  { title: "Blitz Night", user: "noor", status: "going" },
  { title: "Blitz Night", user: "eli", status: "going" },
  { title: "Blitz Night", user: "hana", status: "maybe" },
  { title: "Resume Review Night", user: "devon", status: "going" },
  { title: "Resume Review Night", user: "noor", status: "maybe" },
  { title: "Floor Movie Night", user: "theo", status: "going" },
  { title: "Floor Movie Night", user: "eli", status: "going" },
  { title: "Cookout on the Lawn", user: "james", status: "going" },
  { title: "Cookout on the Lawn", user: "devon", status: "going" },
  { title: "Midterm Study Jam", user: "hana", status: "going" },
  { title: "Midterm Study Jam", user: "noor", status: "going" },
];

/** Keyed on (event, user): written only when missing or when the status differs. */
async function ensureRsvp(eventId, userId, status) {
  const found = must(
    await admin.from("rsvps").select("id, status").eq("event_id", eventId).eq("user_id", userId).limit(1),
    "look up rsvp",
  );
  if (found.length === 0) {
    must(
      await admin.from("rsvps").insert({ event_id: eventId, user_id: userId, status }),
      `insert rsvp (${status})`,
    );
  } else if (found[0].status !== status) {
    must(await admin.from("rsvps").update({ status }).eq("id", found[0].id), `update rsvp (${status})`);
  }
}

// ---------------------------------------------------------------------------
// People follows (public.connections: follower -> following). Franky (the
// lead) follows the whole cast and most follow him back, so his feed is full
// and his profile shows followers; Maya keeps hers. Everyone Franky has a DM
// with follows him and is followed by him: a DM between two people who
// follow each other is a chat, not a message request.
// ---------------------------------------------------------------------------
const PERSON_FOLLOWS = [
  ["franky", "maya"], ["franky", "theo"], ["franky", "priya"], ["franky", "hana"], ["franky", "amara"],
  ["franky", "lucas"], ["franky", "devon"], ["franky", "noor"], ["franky", "jonah"], ["franky", "eli"],
  ["theo", "franky"], ["priya", "franky"], ["hana", "franky"], ["amara", "franky"], ["devon", "franky"],
  ["noor", "franky"], ["lucas", "franky"],
  ["maya", "theo"], ["maya", "priya"], ["maya", "hana"], ["maya", "amara"], ["maya", "lucas"],
  ["maya", "devon"], ["maya", "noor"], ["maya", "jonah"], ["maya", "eli"], ["maya", "franky"],
  ["theo", "maya"], ["hana", "maya"], ["priya", "maya"], ["amara", "maya"], ["noor", "maya"],
  ["eli", "maya"], ["lucas", "maya"],
  ["theo", "eli"], ["eli", "theo"], ["priya", "noor"], ["noor", "priya"], ["hana", "lucas"],
  ["devon", "jonah"], ["jonah", "devon"], ["amara", "eli"], ["amara", "theo"],
  ["franky", "james"], ["james", "franky"], ["franky", "rylan"], ["rylan", "franky"],
  ["james", "rylan"], ["rylan", "james"],
];

async function ensurePersonFollow(followerId, followingId) {
  must(
    await admin
      .from("connections")
      .upsert(
        { follower_id: followerId, following_id: followingId },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      ),
    "person follow",
  );
}

// ---------------------------------------------------------------------------
// Messages.
//   The lead's inbox: four DMs, each a few friendly lines, all read.
//     Franky <-> James is the one the video uses. On camera Franky opens
//     Priya's "Blitz Night is tonight" post, "Send to chats", James, then
//     types "hey are you going to this event tonight?". NEITHER the shared
//     post NOR that line is seeded: the thread ends on James's last line.
//     Franky <-> Rylan, Franky <-> Maya and Franky <-> Theo fill the list.
//   Maya <-> Theo stays from the first version (Maya's own inbox).
//   AN EVENT CANNOT BE SHARED INTO A DM. Event cards are club rooms only
//   (POST /api/me/threads/[id]/cards answers 400 `cards_club_rooms_only` for
//   a dm or a group); what a DM can carry is a POST ("Send to chats" on a
//   feed card: attachment_kind 'post'). Priya's Chess Club post about Blitz
//   Night is in POSTS for exactly that.
//
//   Club chat: a few lines in Chess Club's Lounge, and a few in SAE's. SAE
//   is local-seed's club and its rooms open with Avery Owner's test lines;
//   Franky is an SAE officer, so those rooms are in HIS inbox. The cast's
//   lines are newer, so the inbox previews show the cast. Opening SAE's
//   Lounge still shows Avery's three lines above them: do not film it.
//   `room` names a room by kind and name (default: the Lounge); a room the
//   club does not have is skipped (SAE's `events` room exists only on
//   local-seed's copy).
//
// A DM is made the way POST /api/me/threads makes one: a `dm` channel with
// no name and two channel_members rows (the one who started it is `admin`),
// both accepted, both read. A message is keyed on (room, author, content);
// `hoursAgo` is used once, when it is first written.
// ---------------------------------------------------------------------------
const DMS = [
  { key: "franky_james", from: "james", to: "franky" },
  { key: "franky_rylan", from: "rylan", to: "franky" },
  { key: "franky_maya", from: "maya", to: "franky" },
  { key: "franky_theo", from: "theo", to: "franky" },
  { key: "maya_theo", from: "theo", to: "maya" },
];

const DM_MESSAGES = [
  { dm: "franky_james", author: "james", hoursAgo: 20,
    content: "you around this week?" },
  { dm: "franky_james", author: "franky", hoursAgo: 19.8,
    content: "yeah, on campus most days" },
  { dm: "franky_james", author: "james", hoursAgo: 19.7,
    content: "nice, let's get food after the meeting" },
  { dm: "franky_rylan", author: "rylan", hoursAgo: 28,
    content: "tabling went well today" },
  { dm: "franky_rylan", author: "franky", hoursAgo: 27.5,
    content: "good to hear. thanks for setting up" },
  { dm: "franky_maya", author: "maya", hoursAgo: 41,
    content: "hi! thanks for the follow. I'm new here this semester" },
  { dm: "franky_maya", author: "franky", hoursAgo: 40.5,
    content: "welcome! the cookout on the lawn is open to everyone if you want to meet people" },
  { dm: "franky_maya", author: "maya", hoursAgo: 40.3,
    content: "I'll come by, thank you" },
  { dm: "franky_theo", author: "theo", hoursAgo: 47,
    content: "is the cookout only for SAE?" },
  { dm: "franky_theo", author: "franky", hoursAgo: 46.5,
    content: "open to everyone, bring a friend" },
  { dm: "maya_theo", author: "theo", hoursAgo: 22,
    content: "hey it's Theo from orientation. did you find your class ok?" },
  { dm: "maya_theo", author: "maya", hoursAgo: 21.8,
    content: "barely lol. the room numbers make no sense" },
  { dm: "maya_theo", author: "theo", hoursAgo: 21.6,
    content: "right?? ok see you around" },
];

const CLUB_MESSAGES = [
  { club: "chess_club", author: "priya", hoursAgo: 6,
    content: "Boards are booked for tonight. Doors open at 6:45." },
  { club: "chess_club", author: "noor", hoursAgo: 5.5,
    content: "I'll be there. Is it ok if I bring a friend who has never played?" },
  { club: "chess_club", author: "priya", hoursAgo: 5.4,
    content: "Always. Beginners get the comfy table." },
  { club: "chess_club", author: "eli", hoursAgo: 3,
    content: "Can someone teach me what a fork is before I embarrass myself" },
  { club: "sae", author: "james", hoursAgo: 9,
    content: "Who has the grill for the cookout?" },
  { club: "sae", author: "franky", hoursAgo: 8.8,
    content: "I've got it. Need two people to help set up at 4." },
  { club: "sae", author: "james", hoursAgo: 8.6,
    content: "I'm in." },
  { club: "sae", author: "franky", hoursAgo: 30, room: { kind: "room", name: "events" },
    content: "Cookout on the Lawn is on the calendar. RSVP so we know how much food to get." },
];

/** The dm between two people, or a new one. `fromId` is who started it. */
async function ensureDm(fromId, toId) {
  const mine = must(
    await admin.from("channel_members").select("channel_id, channels!inner(type)").eq("user_id", fromId).eq("channels.type", "dm"),
    "look up dms",
  );
  if (mine.length > 0) {
    const both = must(
      await admin
        .from("channel_members")
        .select("channel_id, created_at")
        .eq("user_id", toId)
        .in("channel_id", mine.map((r) => r.channel_id))
        .order("created_at")
        .limit(1),
      "look up the dm of two people",
    );
    if (both.length > 0) return both[0].channel_id;
  }
  const chan = must(
    await admin.from("channels").insert({ type: "dm", name: "" }).select("id").single(),
    "create dm",
  );
  const now = new Date().toISOString();
  must(
    await admin.from("channel_members").insert([
      { channel_id: chan.id, user_id: fromId, role: "admin", accepted_at: now, last_read_at: now },
      { channel_id: chan.id, user_id: toId, role: "member", accepted_at: now, last_read_at: now },
    ]),
    "dm members",
  );
  return chan.id;
}

/** A club's Lounge (one per club: the channels_one_core_room index). */
async function findLounge(orgId, handle) {
  const found = must(
    await admin.from("channels").select("id").eq("org_id", orgId).eq("type", "org_channel").eq("kind", "lounge").limit(1),
    `look up the lounge of ${handle}`,
  );
  if (found.length === 0) {
    console.error(`\nFailed: ${handle} has no lounge room to put a message in`);
    process.exit(1);
  }
  return found[0].id;
}

/** A club's room by kind and name, or null when the club has none. */
async function findNamedRoom(orgId, room) {
  const found = must(
    await admin.from("channels").select("id").eq("org_id", orgId).eq("type", "org_channel")
      .eq("kind", room.kind).eq("name", room.name).order("created_at").limit(1),
    `look up room ${room.name}`,
  );
  return found[0]?.id ?? null;
}

/** Keyed on (room, author, content): an existing message is left untouched. */
async function ensureMessage(channelId, userId, content, at) {
  const found = must(
    await admin
      .from("messages")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .eq("content", content)
      .order("created_at")
      .limit(1),
    `look up message "${content}"`,
  );
  if (found.length > 0) return found[0].id;
  const made = must(
    await admin
      .from("messages")
      .insert({ channel_id: channelId, user_id: userId, content, kind: "text", created_at: at })
      .select("id")
      .single(),
    `insert message "${content}"`,
  );
  return made.id;
}

async function seedMessages(users, clubs) {
  const dms = {};
  for (const spec of DMS) dms[spec.key] = await ensureDm(users[spec.from], users[spec.to]);
  for (const m of DM_MESSAGES) await ensureMessage(dms[m.dm], users[m.author], m.content, hoursAgo(m.hoursAgo));
  for (const m of CLUB_MESSAGES) {
    const roomId = m.room ? await findNamedRoom(clubs[m.club], m.room) : await findLounge(clubs[m.club], m.club);
    if (roomId) await ensureMessage(roomId, users[m.author], m.content, hoursAgo(m.hoursAgo));
  }
  return dms;
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
async function count(table, narrow = (q) => q) {
  const { count: n, error } = await narrow(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) {
    console.error(`count ${table}`, error);
    process.exit(1);
  }
  return n;
}

/** `Fri Oct 2, 7 PM` on the campus wall clock. */
function campusWhen(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

async function printSummary(users, clubs, dms) {
  const ids = Object.values(users);
  const rows = must(
    await admin
      .from("users")
      .select(
        "id, email, handle, school_verified, school_system, campus_id, campus_set_at, otto_answers, terms_version, terms_accepted_at, age_attested_at",
      )
      .in("id", ids),
    "summary: users",
  );
  const accounts = [];
  for (const spec of ACCOUNTS) {
    const r = rows.find((x) => x.id === users[spec.key]);
    const ledger = await count("terms_acceptances", (q) => q.eq("user_id", r.id).eq("terms_version", TERMS_VERSION));
    accounts.push({
      email: r.email,
      handle: r.handle,
      verified: r.school_verified ? `yes (${r.school_system})` : "no",
      campus: r.campus_id ? `${r.campus_id}${r.campus_set_at ? "" : " (unconfirmed)"}` : "-",
      onboarded: Object.keys(r.otto_answers ?? {}).length > 0 ? "yes" : "no",
      "terms ok": hasRecordedConsent(r) && ledger > 0 ? "yes" : "NO",
    });
  }
  console.log("\nAccounts (one password for all: PASSWORD at the top of this file)");
  console.table(accounts);

  const orgRows = must(
    await admin.from("orgs").select("id, handle, name, campus_id, join_policy, hidden_at, verified").in("id", Object.values(clubs)),
    "summary: orgs",
  );
  const clubTable = [];
  for (const spec of CLUBS) {
    const o = orgRows.find((x) => x.handle === spec.handle);
    clubTable.push({
      handle: o.handle,
      name: o.name,
      campus: o.campus_id,
      policy: o.join_policy,
      verified: o.verified,
      hidden: o.hidden_at ? "yes" : "no",
      members: await count("org_members", (q) => q.eq("org_id", o.id)),
      followers: await count("org_followers", (q) => q.eq("org_id", o.id)),
      rooms: await count("channels", (q) => q.eq("org_id", o.id)),
    });
  }
  console.log("\nClubs");
  console.table(clubTable);

  const orgIds = Object.values(clubs);
  const events = must(
    await admin.from("events").select("id, title, starts_at, ends_at, location, org_id").in("org_id", orgIds)
      .in("title", EVENTS.map((e) => e.title)).order("starts_at"),
    "summary: events",
  );
  const eventTable = [];
  for (const e of events) {
    eventTable.push({
      title: e.title,
      club: orgRows.find((o) => o.id === e.org_id)?.handle,
      starts: campusWhen(e.starts_at),
      ends: campusWhen(e.ends_at),
      going: await count("rsvps", (q) => q.eq("event_id", e.id).eq("status", "going")),
      maybe: await count("rsvps", (q) => q.eq("event_id", e.id).eq("status", "maybe")),
    });
  }
  console.log(`\nEvents (campus wall clock, ${ZONE})`);
  console.table(eventTable);

  // Everything below counts the CAST's rows only: another session may be
  // writing test rows to this database while the seed runs.
  const dmIds = Object.values(dms);
  const lounge = await findLounge(clubs.chess_club, "chess_club");
  console.log("\nCast content");
  console.table({
    accounts: ids.length,
    clubs: orgIds.length,
    "personal posts": await count("posts", (q) => q.in("user_id", ids).is("org_id", null)),
    "club posts": await count("posts", (q) => q.in("user_id", ids).in("org_id", orgIds)),
    events: events.length,
    rsvps: await count("rsvps", (q) => q.in("user_id", ids).in("event_id", events.map((e) => e.id))),
    "people follows": await count("connections", (q) => q.in("follower_id", ids).in("following_id", ids)),
    "club follows": await count("org_followers", (q) => q.in("user_id", ids).in("org_id", orgIds)),
    "club memberships": await count("org_members", (q) => q.in("user_id", ids).in("org_id", orgIds)),
    "dm threads": dmIds.length,
    "dm messages": await count("messages", (q) => q.in("channel_id", dmIds)),
    "posts with a picture": await count("posts", (q) => q.in("user_id", ids).not("media_url", "is", null)),
    "chess club lounge messages": await count("messages", (q) => q.eq("channel_id", lounge).in("user_id", ids)),
  });

  const blitz = events.find((e) => e.title === "Blitz Night");
  if (blitz && new Date(blitz.ends_at).getTime() <= Date.now()) {
    console.log(
      "\nNOTE: Blitz Night has already ended today, so the events list no longer shows it. " +
        "Run the seed again after midnight (campus time) and film before 10 pm.",
    );
  }
}

// ---------------------------------------------------------------------------
// What is NOT the cast but would reach the lead's screens if the cast lived
// on `campus`. Read-only: it lists, it never hides or deletes. Run for
// CAMPUS and for the other candidates, so a move can be judged before it is
// made. The same rules the routes apply:
//   feed      (GET /api/feed)   posts stamped with the home campus, plus
//                               campus-less posts (the lead's university's,
//                               or no university's). Posts by people and
//                               clubs the lead follows are all cast.
//   events    (GET /api/events) not-ended events of verified, visible clubs
//                               on the home campus.
//   directory (GET /api/orgs?filter=discover) visible clubs on that campus.
//   people    (suggestions, the campus map) accounts on that campus.
//   inbox     lines by anyone off the cast in a room the lead holds a row on
//             (SAE's rooms: see Messages). The same on every campus.
// Not covered: search by name, "Look around" on another campus, and the
// tail of the People suggestions (same university, another campus), which
// reach every account in the database by design.
// ---------------------------------------------------------------------------
async function offCastCheck(users, clubs, campus) {
  const castIds = new Set(Object.values(users));
  const clubIds = new Set(Object.values(clubs));
  const leadSystem = ACCOUNTS.find((a) => a.key === LEAD).system;

  const posts = must(
    await admin.from("posts").select("id, user_id, campus_id, school_system, content")
      .eq("type", "post").eq("status", "published").is("removed_at", null)
      .or(`campus_id.eq.${campus},and(campus_id.is.null,school_system.eq.${leadSystem}),and(campus_id.is.null,school_system.is.null)`),
    "off-cast check: posts",
  ).filter((p) => !castIds.has(p.user_id));

  const orgs = must(
    await admin.from("orgs").select("id, handle, verified").eq("campus_id", campus).is("hidden_at", null),
    "off-cast check: orgs",
  ).filter((o) => !clubIds.has(o.id));

  const listed = orgs.filter((o) => o.verified).map((o) => o.id);
  const otherEvents = listed.length === 0 ? [] : must(
    await admin.from("events").select("title").in("org_id", listed).gte("ends_at", new Date().toISOString()),
    "off-cast check: events",
  );
  // The cast's own clubs can hold events this script did not write (SAE is
  // local-seed's row and may carry its test events).
  const strayEvents = must(
    await admin.from("events").select("title").in("org_id", [...clubIds]).gte("ends_at", new Date().toISOString()),
    "off-cast check: events of the cast's clubs",
  ).filter((e) => !EVENTS.some((spec) => spec.title === e.title));

  const people = must(
    await admin.from("users").select("id, handle").eq("campus_id", campus),
    "off-cast check: people",
  ).filter((u) => !castIds.has(u.id));

  const leadRooms = must(
    await admin.from("channel_members").select("channel_id").eq("user_id", users[LEAD]),
    "off-cast check: the lead's rooms",
  ).map((r) => r.channel_id);
  const inbox = leadRooms.length === 0 ? [] : must(
    await admin.from("messages").select("user_id, content, channels:channel_id(name), users:user_id(handle)").in("channel_id", leadRooms),
    "off-cast check: the lead's inbox",
  ).filter((m) => !castIds.has(m.user_id));

  const list = (rows, label) => (rows.length === 0 ? "none" : rows.map(label).join(", "));
  console.log(`\nOff-cast rows that would reach ${LEAD}'s screens with the cast on ${campus}${campus === CAMPUS ? " (where it is)" : ""}`);
  console.table({
    "feed: posts": list(posts, (p) => `"${p.content.slice(0, 30)}"`),
    "events list": list([...otherEvents, ...strayEvents], (e) => e.title),
    "club directory": list(orgs, (o) => o.handle),
    "people on the campus": list(people, (u) => u.handle),
    "inbox: lines in the lead's rooms": list(inbox, (m) => `${m.users?.handle} in ${m.channels?.name}`),
  });
}

// ---------------------------------------------------------------------------
// Sign-in check: log in as the lead with the ANON key (a real browser
// session) and read what he can see through RLS and the column grants. The
// pictures are fetched the way a browser would fetch them.
// ---------------------------------------------------------------------------
async function signInCheck(users, clubs, dms) {
  const email = ACCOUNTS.find((a) => a.key === LEAD).email;
  const anon = createClient(API_URL, ANON_KEY, CLIENT_OPTS);
  const session = must(await anon.auth.signInWithPassword({ email, password: PASSWORD }), `sign in as ${email}`);
  const uid = session.user.id;

  const own = must(
    await anon.from("users").select("handle, school_verified, school, school_system, campus_id").eq("id", uid).single(),
    "the lead reads his own users row",
  );
  // The DB-level Terms gate every content-write policy ANDs in.
  const consent = must(await anon.rpc("has_recorded_consent"), "the lead calls has_recorded_consent()");
  const castPosts = must(
    await anon.from("posts").select("id, media_url").in("user_id", Object.values(users)),
    "the lead reads the cast's posts",
  );
  const myRsvps = must(
    await anon.from("rsvps").select("status, events:event_id(title)").eq("user_id", uid),
    "the lead reads his rsvps",
  );
  const myDms = must(
    await anon.from("channel_members").select("accepted_at, channels!inner(type)").eq("user_id", uid).eq("channels.type", "dm"),
    "the lead reads his dm threads",
  );
  const dmMessages = must(
    await anon.from("messages").select("content").eq("channel_id", dms.franky_james).order("created_at"),
    "the lead reads his dm with james",
  );
  const myClubFollows = must(
    await anon.from("org_followers").select("org_id").eq("user_id", uid).in("org_id", Object.values(clubs)),
    "the lead reads his club follows",
  );
  const photos = castPosts.filter((p) => p.media_url);
  const answers = [];
  for (const p of photos) {
    const res = await fetch(p.media_url).catch(() => null);
    answers.push(res ? res.status : "no answer");
  }

  console.log(`\nSigned in as ${email} with the anon key`);
  console.log("  own users row       :", JSON.stringify(own));
  console.log("  has_recorded_consent:", consent);
  console.log("  cast posts he reads :", castPosts.length, `(${photos.length} with a picture; HTTP ${answers.join(", ") || "-"})`);
  console.log("  his rsvps           :", myRsvps.map((r) => `${r.events?.title} (${r.status})`).join(", "));
  console.log("  clubs he follows    :", myClubFollows.length);
  console.log("  dm threads          :", myDms.length, `(${myDms.filter((d) => d.accepted_at).length} accepted)`);
  console.log("  dm with james       :", dmMessages.length, "messages, last:", JSON.stringify(dmMessages.at(-1)?.content));
  await anon.auth.signOut();
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding the demo cast into the LOCAL stack at ${API_URL} (campus ${CAMPUS}, Terms version ${TERMS_VERSION})`);

  const outside = ACCOUNTS.filter((a) => !CAMPUSES[CAMPUS].systems.includes(a.system));
  if (outside.length > 0) {
    console.error(`Refusing to seed: ${CAMPUS} is not a campus of ${outside.map((a) => `${a.key} (${a.system})`).join(", ")}.`);
    process.exit(1);
  }
  if (!existsSync(PHOTOS_DIR)) {
    photoNotes.push(`${PHOTOS_DIR} is missing: every post is text only (set DEMO_PHOTOS_DIR to point somewhere else)`);
  }

  const users = {};
  const systems = {};
  for (const spec of ACCOUNTS) {
    users[spec.key] = await ensureAccount(spec);
    systems[spec.key] = spec.system;
  }

  const clubs = {};
  const owners = {};
  for (const spec of CLUBS) clubs[spec.handle] = await ensureClub(spec, users, systems, owners);
  // The rooms first (a new club has none until chat_repair_club runs), so a
  // member added next gets their room rows.
  for (const [handle, id] of Object.entries(clubs)) {
    must(await admin.rpc("chat_repair_club", { p_org: id }), `chat_repair_club for ${handle}`);
  }
  for (const m of MEMBERS) await ensureMember(clubs[m.club], users[m.user], m.role, owners[m.club]);
  for (const f of ORG_FOLLOWS) await ensureOrgFollow(clubs[f.club], users[f.user], f.source);

  const haveFolder = existsSync(PHOTOS_DIR);
  for (const spec of POSTS) await ensurePost(haveFolder ? spec : { ...spec, image: null }, users, clubs);

  const events = {};
  for (const spec of EVENTS) events[spec.title] = await ensureEvent(spec, users, clubs);
  for (const r of RSVPS) await ensureRsvp(events[r.title], users[r.user], r.status);

  for (const [from, to] of PERSON_FOLLOWS) await ensurePersonFollow(users[from], users[to]);
  const dms = await seedMessages(users, clubs);

  // Make every club whole again: each event got its event room from the
  // chat_events_room trigger, and chat_repair_club gives the officers and
  // the members who RSVP'd their rows. It changes nothing when nothing is
  // missing.
  for (const [handle, id] of Object.entries(clubs)) {
    must(await admin.rpc("chat_repair_club", { p_org: id }), `chat_repair_club for ${handle}`);
  }

  await printSummary(users, clubs, dms);
  if (photoNotes.length > 0) console.log("\nPhotos\n  " + photoNotes.join("\n  "));
  for (const campus of [CAMPUS, ...Object.keys(CAMPUSES).filter((c) => c !== CAMPUS)]) {
    await offCastCheck(users, clubs, campus);
  }
  await signInCheck(users, clubs, dms);
  console.log("\nDone.");
}

await main();
