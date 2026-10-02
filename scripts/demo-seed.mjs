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
// KEEPING THE TEST ROWS OFF CAMERA. The feed, the events list and the club
// directory are all scoped to the viewer's HOME CAMPUS (posts.campus_id,
// the club's campus_id), and every test row sits on `indianapolis`. So the
// cast lives on CAMPUS below, a campus no test row is on: Maya's feed,
// events and directory then hold the cast and nothing else, and no test row
// is touched. The price: the app names that campus wherever it names the
// home campus. Set CAMPUS back to "indianapolis" and run again to move the
// people and the clubs (posts keep the campus they were posted to: the
// posts_stamp_campus trigger never moves one). The summary ends with a list
// of every off-cast row that would still reach Maya's screens.
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
import { readFileSync } from "node:fs";
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
// The cast's home campus (see KEEPING THE TEST ROWS OFF CAMERA). It has to be
// a campus BOTH universities share, because the cast mixes IU and Purdue
// students: `fort-wayne` or `indianapolis` (campuses.systems = {iu,purdue}).
const CAMPUS = "fort-wayne";
const CAMPUS_NAME = { "fort-wayne": "Fort Wayne", indianapolis: "Indianapolis" };
const SYSTEM_LABEL = { iu: "IU", purdue: "Purdue" };
const ZONE = "America/Indiana/Indianapolis"; // CAMPUS_TIME_ZONE, src/lib/push/event-notice.ts

if (!CAMPUS_NAME[CAMPUS]) {
  console.error(`Refusing to seed: CAMPUS is "${CAMPUS}". Use a campus both universities share.`);
  process.exit(1);
}

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
  return system ? `${SYSTEM_LABEL[system]} ${CAMPUS_NAME[CAMPUS]}` : "";
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
// The three founders appear as themselves; their year and major are left
// empty rather than guessed.
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
    system: "purdue", year: 3, major: "Mechanical Engineering",
    bio: "Mechanical engineering. Finance Club officer." },
  { key: "amara", email: "amara@example.test", handle: "amaradiallo", name: "Amara Diallo",
    system: "iu", year: 3, major: "Nursing",
    bio: "Nursing junior. RA on Tower Floor 3, my door is open." },
  { key: "lucas", email: "lucas@example.test", handle: "lucasferreira", name: "Lucas Ferreira",
    system: "iu", year: 2, major: "Music Technology",
    bio: "Music technology. Usually in a practice room in North Hall." },
  { key: "hana", email: "hana@example.test", handle: "hanasato", name: "Hana Sato",
    system: "purdue", year: 4, major: "Computer Graphics",
    bio: "Computer graphics senior. Always has a camera." },
  { key: "devon", email: "devon@example.test", handle: "devonbrooks", name: "Devon Brooks",
    system: "iu", year: 3, major: "Sports Management",
    bio: "Sports management. Intramurals most nights." },
  { key: "noor", email: "noor@example.test", handle: "noorhaddad", name: "Noor Haddad",
    system: "iu", year: 2, major: "Biology",
    bio: "Biology sophomore. Learning chess the hard way." },
  { key: "eli", email: "eli@example.test", handle: "elicarter", name: "Eli Carter",
    system: "purdue", year: 1, major: "Computer Science",
    bio: "CS freshman. Tower Floor 3." },
  // The founders, as themselves.
  { key: "franky", email: "franky@example.test", handle: "franky", name: "Franky Cazares",
    system: "iu", year: null, major: "", bio: "Vibe team." },
  { key: "james", email: "james@example.test", handle: "jamesandres", name: "James Andres",
    system: "iu", year: null, major: "", bio: "Vibe team." },
  { key: "rylan", email: "rylan@example.test", handle: "rylanconaway", name: "Rylan Conaway",
    system: "iu", year: null, major: "", bio: "Vibe team." },
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
        "terms_version, terms_accepted_at, age_attested_at, campus_set_at, handle_changed_at, otto_answers",
      )
      .eq("id", id)
      .single(),
    `read users row ${spec.email}`,
  );

  const now = new Date().toISOString();
  const patch = {
    handle: spec.handle,
    name: spec.name,
    major: spec.major,
    year: spec.year,
    bio: spec.bio,
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
// Maya follows all five, so her feed carries every club in the cast.
const ORG_FOLLOWS = [
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
// `image` is the slot for the photo (demo-cast.md, "Photos"): null for now,
// so every post is a text post. When photos are chosen, put a path here and
// teach ensurePost to upload it and set media_url (the posts_check_media_refs
// trigger only accepts a key in the author's own folder).
// ---------------------------------------------------------------------------
const POSTS = [
  { author: "priya", club: "chess_club", hoursAgo: 2, tags: [], image: null,
    content: "Blitz Night is tonight at 7 in the Campus Center. Five minute games, every level welcome. We have extra boards, so just show up." },
  { author: "theo", hoursAgo: 4, tags: [], image: null,
    content: "Does anyone know where the good study spots are? Asking as a freshman who has sat in the same chair for three days." },
  { author: "amara", club: "tower_floor_3", hoursAgo: 7, tags: [], image: null,
    content: "Floor 3, movie night is coming up. Put your picks in the chat and I will bring the popcorn." },
  { author: "hana", hoursAgo: 13, tags: [], image: null,
    content: "Took my camera out at sunset with no plan. Best hour of my week." },
  { author: "maya", hoursAgo: 19, tags: [], image: null,
    content: "First week here and I already know which stairwell is the fast one. Small wins." },
  { author: "jonah", club: "finance_club", hoursAgo: 25, tags: [], image: null,
    content: "Resume Review Night is this week. Bring a draft, even a rough one. Rough is what we are there for." },
  { author: "lucas", club: "north_hall", hoursAgo: 29, tags: [], image: null,
    content: "The first floor lounge has new whiteboards. Midterm Study Jam is this week if you want company while you study." },
  { author: "devon", hoursAgo: 33, tags: [], image: null,
    content: "Intramural sign ups close Friday. We need two more for flag football, no experience needed." },
  { author: "franky", club: "sae", hoursAgo: 38, tags: [], image: null,
    content: "Cookout on the Lawn is this week. Burgers, veggie burgers and yard games. Everyone is welcome, bring a friend." },
  { author: "noor", hoursAgo: 44, tags: [], image: null,
    content: "Lost three games in a row at Chess Club and still had a great night. See you at the next one." },
  { author: "eli", hoursAgo: 50, tags: [], image: null,
    content: "Floor dinner was a good idea. Whoever suggested it, thank you." },
  { author: "james", hoursAgo: 56, tags: [], image: null,
    content: "Good chapter meeting tonight. Proud of this group." },
  { author: "rylan", hoursAgo: 62, tags: [], image: null,
    content: "Tabling outside the Campus Center this afternoon. Come say hi." },
];

async function ensurePost(spec, users, clubs) {
  const userId = users[spec.author];
  const orgId = spec.club ? clubs[spec.club] : null;
  let q = admin.from("posts").select("id").eq("user_id", userId).eq("content", spec.content);
  q = orgId ? q.eq("org_id", orgId) : q.is("org_id", null);
  const found = must(await q.limit(1), `look up post by ${spec.author}`);
  if (found.length > 0) return found[0].id;
  const row = must(
    await admin
      .from("posts")
      .insert({
        user_id: userId, org_id: orgId, type: "post", content: spec.content, tags: spec.tags,
        status: "published", created_at: hoursAgo(spec.hoursAgo),
      })
      .select("id")
      .single(),
    `insert post by ${spec.author}`,
  );
  return row.id;
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

// Maya is going to Blitz Night (the one she sends Theo). Theo has NOT
// answered it: that is why she asks him. Rylan holds no SAE RSVP.
const RSVPS = [
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
// People follows (public.connections: follower -> following). Maya follows
// most of the cast and several follow her back, so her feed is full and her
// profile shows followers. Theo and Maya follow each other: a DM between two
// people who do is a chat, not a message request.
// ---------------------------------------------------------------------------
const PERSON_FOLLOWS = [
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
//   The DM: Theo wrote to Maya after orientation; three friendly messages
//   from yesterday. The video sends the next one live ("hey are you going to
//   this event tonight?"), so that message is NOT seeded.
//   AN EVENT CANNOT BE SHARED INTO A DM. Event cards are club rooms only
//   (POST /api/me/threads/[id]/cards answers 400 `cards_club_rooms_only` for
//   a dm or a group); what a DM can carry is a POST ("Send to chats" on a
//   feed card: attachment_kind 'post'). Priya's Chess Club post about Blitz
//   Night is in POSTS for exactly that. Nothing of the kind is seeded here.
//
//   Club chat: a few lines in Chess Club's Lounge, written by its members.
//
// A DM is made the way POST /api/me/threads makes one: a `dm` channel with
// no name and two channel_members rows (the one who started it is `admin`),
// both accepted. A message is keyed on (room, author, content); `hoursAgo`
// is used once, when it is first written.
// ---------------------------------------------------------------------------
const DMS = [
  { key: "maya_theo", from: "theo", to: "maya" },
];

const DM_MESSAGES = [
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
    const loungeId = await findLounge(clubs[m.club], m.club);
    await ensureMessage(loungeId, users[m.author], m.content, hoursAgo(m.hoursAgo));
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
// What is NOT the cast but would still reach Maya's screens. Read-only: it
// lists, it never hides or deletes. The same rules the routes apply:
//   feed      (GET /api/feed)   posts stamped with her home campus, plus
//                               campus-less posts (her university's, or no
//                               university's). Posts by people and clubs she
//                               follows are all cast.
//   events    (GET /api/events) not-ended events of verified, visible clubs
//                               on her home campus.
//   directory (GET /api/orgs?filter=discover) visible clubs on her campus.
//   people    (suggestions, the campus map) accounts on her campus.
// Not covered: search by name, "Look around" on another campus, and the
// tail of the People suggestions (same university, another campus), which
// reach every account in the database by design.
// ---------------------------------------------------------------------------
async function offCastCheck(users, clubs) {
  const castIds = new Set(Object.values(users));
  const clubIds = new Set(Object.values(clubs));

  const posts = must(
    await admin.from("posts").select("id, user_id, campus_id, school_system, content")
      .eq("type", "post").eq("status", "published").is("removed_at", null)
      .or(`campus_id.eq.${CAMPUS},and(campus_id.is.null,school_system.eq.iu),and(campus_id.is.null,school_system.is.null)`),
    "off-cast check: posts",
  ).filter((p) => !castIds.has(p.user_id));

  const orgs = must(
    await admin.from("orgs").select("id, handle, verified").eq("campus_id", CAMPUS).is("hidden_at", null),
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
    await admin.from("users").select("id, handle").eq("campus_id", CAMPUS),
    "off-cast check: people",
  ).filter((u) => !castIds.has(u.id));

  // SAE's roster and posts, on the one profile the video opens.
  const saePeople = must(
    await admin.from("org_members").select("role, users:user_id(handle)").eq("org_id", clubs.sae),
    "off-cast check: sae roster",
  ).filter((m) => !ACCOUNTS.some((a) => a.handle === m.users?.handle));

  const list = (rows, label) => (rows.length === 0 ? "none" : rows.map(label).join(", "));
  console.log(`\nOff-cast rows that would reach Maya's screens (home campus: ${CAMPUS})`);
  console.table({
    "feed: posts": list(posts, (p) => `"${p.content.slice(0, 30)}"`),
    "events list": list([...otherEvents, ...strayEvents], (e) => e.title),
    "club directory": list(orgs, (o) => o.handle),
    "people on her campus": list(people, (u) => u.handle),
    "SAE roster (members see it)": list(saePeople, (m) => `${m.users?.handle} (${m.role})`),
  });
}

// ---------------------------------------------------------------------------
// Sign-in check: log in as Maya with the ANON key (a real browser session)
// and read what Maya can see through RLS and the column grants.
// ---------------------------------------------------------------------------
async function signInCheck(users, clubs, dms) {
  const anon = createClient(API_URL, ANON_KEY, CLIENT_OPTS);
  const session = must(
    await anon.auth.signInWithPassword({ email: "maya@example.test", password: PASSWORD }),
    "sign in as maya@example.test",
  );
  const uid = session.user.id;

  const own = must(
    await anon.from("users").select("handle, school_verified, school, school_system, campus_id").eq("id", uid).single(),
    "maya reads own users row",
  );
  // The DB-level Terms gate every content-write policy ANDs in.
  const consent = must(await anon.rpc("has_recorded_consent"), "maya calls has_recorded_consent()");
  const castPosts = must(
    await anon.from("posts").select("id").in("user_id", Object.values(users)),
    "maya reads the cast's posts",
  );
  const myRsvps = must(
    await anon.from("rsvps").select("status, events:event_id(title)").eq("user_id", uid),
    "maya reads her rsvps",
  );
  const dmMessages = must(
    await anon.from("messages").select("content").eq("channel_id", dms.maya_theo).order("created_at"),
    "maya reads her dm with theo",
  );
  const myClubFollows = must(
    await anon.from("org_followers").select("org_id").eq("user_id", uid).in("org_id", Object.values(clubs)),
    "maya reads her club follows",
  );

  console.log("\nSigned in as maya@example.test with the anon key");
  console.log("  own users row       :", JSON.stringify(own));
  console.log("  has_recorded_consent:", consent);
  console.log("  cast posts she reads:", castPosts.length);
  console.log("  her rsvps           :", myRsvps.map((r) => `${r.events?.title} (${r.status})`).join(", "));
  console.log("  clubs she follows   :", myClubFollows.length);
  console.log("  dm with theo        :", dmMessages.length, "messages, last:", JSON.stringify(dmMessages.at(-1)?.content));
  await anon.auth.signOut();
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding the demo cast into the LOCAL stack at ${API_URL} (campus ${CAMPUS}, Terms version ${TERMS_VERSION})`);

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

  for (const spec of POSTS) await ensurePost(spec, users, clubs);

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
  await offCastCheck(users, clubs);
  await signInCheck(users, clubs, dms);
  console.log("\nDone.");
}

await main();
