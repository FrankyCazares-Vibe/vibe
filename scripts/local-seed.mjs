#!/usr/bin/env node
// Seed the LOCAL Supabase stack with test accounts, clubs, posts and events.
//
//   node scripts/local-seed.mjs
//
// Re-runnable: every row is looked up first (by email, handle, or a stable
// natural key) and updated in place, so a second run changes nothing but
// resets the seeded fields back to their seeded values.
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
// Safety gate: local stack only.
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
const PASSWORD = "vibe-local-1234";
const CAMPUS = "indianapolis"; // the shared IU + Purdue campus (campuses.systems = {iu,purdue})
const SYSTEM_LABEL = { iu: "IU", purdue: "Purdue" };

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

/** Legacy `school` label the create routes still dual-write ("IU Indianapolis"). */
function schoolLabel(system) {
  return system ? `${SYSTEM_LABEL[system]} Indianapolis` : "";
}

const daysFromNow = (d) => new Date(Date.now() + d * 86_400_000);

// ---------------------------------------------------------------------------
// Accounts.
//   school-verified = school_verified + school_email + school_system
//                     (what src/lib/auth/school-email-apply.ts writes)
//   has a campus    = campus_id in the user's system (trigger
//                     users_campus_in_system) + campus_set_at (= "confirmed")
//   onboarded       = otto_answers is a non-empty object
//                     (src/lib/auth/post-login.ts isOttoOnboardingComplete)
//   Terms accepted  = terms_version = TERMS_VERSION + terms_accepted_at +
//                     age_attested_at, plus a terms_acceptances ledger row
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  { key: "A", email: "avery@example.test", handle: "avery_owner", name: "Avery Owner",
    system: "iu", schoolEmail: "avery@iu.edu", onboarded: true,
    major: "Informatics", year: 3, bio: "Runs the test clubs." },
  { key: "B", email: "blake@example.test", handle: "blake_iu", name: "Blake Student",
    system: "iu", schoolEmail: "blake@iu.edu", onboarded: true,
    major: "Biology", year: 2, bio: "Here for the study groups." },
  { key: "C", email: "casey@example.test", handle: "casey_purdue", name: "Casey Purdue",
    system: "purdue", schoolEmail: "casey@purdue.edu", onboarded: true,
    major: "Mechanical Engineering", year: 4, bio: "Purdue Indy." },
  // The brand-new student: signed up (so consent was captured at signup),
  // but no verified school email, no campus and no onboarding yet.
  { key: "D", email: "drew@example.test", handle: "drew_new", name: "Drew New",
    system: null, schoolEmail: null, onboarded: false, major: "", year: null, bio: "" },
  { key: "E", email: "emery@example.test", handle: "emery_admin", name: "Emery Admin",
    system: "iu", schoolEmail: "emery@iu.edu", onboarded: true,
    major: "Business", year: 3, bio: "Admin of the invite club." },
];

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
  const verified = spec.system !== null;
  const patch = {
    handle: spec.handle,
    name: spec.name,
    major: spec.major,
    year: spec.year,
    bio: spec.bio,
    school_email: spec.schoolEmail,
    school_verified: verified,
    school_system: spec.system,
    campus_id: verified ? CAMPUS : null,
    school: schoolLabel(spec.system),
    // Keep an existing clock so a re-run does not restart the 30-day campus rule.
    campus_set_at: verified ? (current.campus_set_at ?? now) : null,
    // Keep saved answers on a re-run; a fresh account gets the onboarding shape.
    otto_answers: spec.onboarded
      ? (Object.keys(current.otto_answers ?? {}).length > 0
          ? current.otto_answers
          : { ...OTTO_ANSWERS, setupAt: now })
      : {},
    // Onboarding Finish starts the 14-day handle cooldown; a not-onboarded
    // account keeps its free first claim.
    handle_changed_at: spec.onboarded ? (current.handle_changed_at ?? now) : null,
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
// Clubs. Mirrors POST /api/orgs: the org row (is_public is NOT sent — the
// orgs_sync_join_policy trigger derives it from join_policy), the owner's
// org_members row, and the default #general / #announcements channels.
// The org_members_imply_follow trigger adds each member's 'join' follow.
// ---------------------------------------------------------------------------
const CLUBS = [
  { handle: "test_invite_club", name: "Test Invite Club", owner: "A", join_policy: "invite",
    verified: true, hidden: false, description: "Invite-only club for testing invites." },
  { handle: "test_open_club", name: "Test Open Club", owner: "A", join_policy: "open",
    verified: false, hidden: false, description: "Anyone can join instantly." },
  { handle: "test_request_club", name: "Test Request Club", owner: "B", join_policy: "request",
    verified: false, hidden: false, description: "Officers approve join requests." },
  { handle: "test_hidden_club", name: "Test Hidden Club", owner: "A", join_policy: "open",
    verified: false, hidden: true, description: "Hidden by a platform admin; members only." },
];

const DEFAULT_CHANNELS = [
  { name: "general", position: 0, is_private: false },
  { name: "announcements", position: 1, is_private: false },
];

async function ensureClub(spec, users, systems) {
  const ownerId = users[spec.owner];
  const existing = must(
    await admin.from("orgs").select("id, hidden_at").eq("handle", spec.handle).maybeSingle(),
    `look up org ${spec.handle}`,
  );
  const fields = {
    name: spec.name,
    description: spec.description,
    join_policy: spec.join_policy,
    audience: "both",
    campus_id: CAMPUS,
    school: schoolLabel(systems[spec.owner]),
    owner_id: ownerId,
    verified: spec.verified,
    backdrop_preset: "sand-purple",
    hidden_at: spec.hidden ? (existing?.hidden_at ?? new Date().toISOString()) : null,
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

  for (const ch of DEFAULT_CHANNELS) {
    const found = must(
      await admin
        .from("channels")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", "org_channel")
        .eq("name", ch.name)
        .limit(1),
      `look up #${ch.name} in ${spec.handle}`,
    );
    if (found.length === 0) {
      must(
        await admin.from("channels").insert({ org_id: orgId, type: "org_channel", ...ch }),
        `create #${ch.name} in ${spec.handle}`,
      );
    }
  }
  return orgId;
}

/**
 * Add a non-owner member with a role, the way admitMember() does it
 * (src/lib/orgs/membership.ts): the org_members row, then a channel_members
 * row for every public channel. The follow comes from the trigger.
 */
async function ensureMember(orgId, userId, role) {
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
// Posts. Keyed on (author, content): an existing post is left untouched so
// the posts_stamp_edited trigger never marks it edited. The campus and
// school_system columns are stamped by the posts_stamp_campus trigger.
// ---------------------------------------------------------------------------
const POSTS = [
  { author: "A", content: "Kicking off the semester on the Indianapolis campus! #welcomeweek", tags: ["welcomeweek"] },
  { author: "B", content: "Anyone want to start a study group before midterms? #studygroup", tags: ["studygroup"] },
  { author: "C", content: "Purdue Indy checking in. Who is going to the career fair? #careerfair", tags: ["careerfair"] },
  { author: "A", club: "test_invite_club", content: "Test Invite Club: first meeting is this week. Watch for your invite.", tags: [] },
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
      .insert({ user_id: userId, org_id: orgId, type: "post", content: spec.content, tags: spec.tags, status: "published" })
      .select("id")
      .single(),
    `insert post by ${spec.author}`,
  );
  return row.id;
}

// ---------------------------------------------------------------------------
// Events. Keyed on (club, title). Dates are re-computed on every run so the
// "upcoming" ones stay upcoming however long ago the stack was seeded.
// ---------------------------------------------------------------------------
const EVENTS = [
  { club: "test_invite_club", creator: "A", title: "Invite Club Kickoff", inDays: 3,
    location: "Campus Center 305", description: "First meeting of the semester." },
  { club: "test_open_club", creator: "A", title: "Open Club Study Night", inDays: 10,
    location: "University Library, 2nd floor", description: "Bring your problem sets." },
  { club: "test_invite_club", creator: "E", title: "Invite Club Welcome Mixer", inDays: -7,
    location: "Campus Center Atrium", description: "A past event, for history views." },
];

/** 7pm Indianapolis (23:00 UTC, EDT) `days` from today, two hours long. */
function eventWindow(days) {
  const start = daysFromNow(days);
  start.setUTCHours(23, 0, 0, 0);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString() };
}

async function ensureEvent(spec, users, clubs) {
  const orgId = clubs[spec.club];
  const fields = {
    creator_id: users[spec.creator],
    description: spec.description,
    location: spec.location,
    ...eventWindow(spec.inDays),
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

// ---------------------------------------------------------------------------
// People follows (public.connections: follower -> following).
// ---------------------------------------------------------------------------
const PERSON_FOLLOWS = [
  ["B", "A"],
  ["C", "A"],
  ["A", "B"],
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

async function printSummary(users, clubs) {
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
      who: spec.key,
      email: r.email,
      handle: r.handle,
      verified: r.school_verified ? `yes (${r.school_system})` : "no",
      campus: r.campus_id ? `${r.campus_id}${r.campus_set_at ? "" : " (unconfirmed)"}` : "-",
      onboarded: Object.keys(r.otto_answers ?? {}).length > 0 ? "yes" : "no",
      "terms ok": hasRecordedConsent(r) && ledger > 0 ? `yes (${ledger} ledger)` : "NO",
    });
  }
  console.log("\nAccounts (password for all: " + PASSWORD + ")");
  console.table(accounts);

  const orgRows = must(
    await admin.from("orgs").select("id, handle, join_policy, is_public, hidden_at, verified").in("id", Object.values(clubs)),
    "summary: orgs",
  );
  const clubTable = [];
  for (const spec of CLUBS) {
    const o = orgRows.find((x) => x.handle === spec.handle);
    clubTable.push({
      handle: o.handle,
      policy: o.join_policy,
      is_public: o.is_public,
      verified: o.verified,
      hidden: o.hidden_at ? "yes" : "no",
      members: await count("org_members", (q) => q.eq("org_id", o.id)),
      followers: await count("org_followers", (q) => q.eq("org_id", o.id)),
      channels: await count("channels", (q) => q.eq("org_id", o.id)),
    });
  }
  console.log("\nClubs");
  console.table(clubTable);

  const orgIds = Object.values(clubs);
  const nowIso = new Date().toISOString();
  console.log("\nContent");
  console.table({
    "personal posts": await count("posts", (q) => q.in("user_id", ids).is("org_id", null)),
    "club posts": await count("posts", (q) => q.in("user_id", ids).in("org_id", orgIds)),
    "upcoming events": await count("events", (q) => q.in("org_id", orgIds).gte("ends_at", nowIso)),
    "past events": await count("events", (q) => q.in("org_id", orgIds).lt("ends_at", nowIso)),
    "people follows": await count("connections", (q) => q.in("follower_id", ids).in("following_id", ids)),
  });

  // Whole-database totals: identical across runs when the seed is idempotent.
  console.log("\nTable totals (whole local database)");
  const totals = {};
  for (const t of [
    "users", "terms_acceptances", "orgs", "org_members", "org_followers", "channels",
    "channel_members", "posts", "events", "connections", "notifications",
  ]) {
    totals[t] = await count(t);
  }
  console.table(totals);
}

// ---------------------------------------------------------------------------
// Sign-in check: log in as Blake with the ANON key (a real browser session)
// and read what Blake can see through RLS and the column grants.
// ---------------------------------------------------------------------------
async function signInCheck() {
  const anon = createClient(API_URL, ANON_KEY, CLIENT_OPTS);
  const session = must(
    await anon.auth.signInWithPassword({ email: "blake@example.test", password: PASSWORD }),
    "sign in as blake@example.test",
  );
  const uid = session.user.id;

  const own = must(
    await anon.from("users").select("handle, school_verified, school, school_system, campus_id").eq("id", uid).single(),
    "blake reads own users row",
  );
  // The DB-level Terms gate every content-write policy ANDs in.
  const consent = must(await anon.rpc("has_recorded_consent"), "blake calls has_recorded_consent()");
  // The consent columns are service-role only: this read must be refused.
  const priv = await anon.from("users").select("terms_version").eq("id", uid).single();
  const visibleClubs = must(
    await anon.from("orgs").select("handle").like("handle", "test\\_%").order("handle"),
    "blake lists test clubs",
  );

  console.log("\nSigned in as blake@example.test with the anon key");
  console.log("  own users row      :", JSON.stringify(own));
  console.log("  has_recorded_consent:", consent);
  console.log(
    "  read terms_version :",
    priv.error ? `refused (${priv.error.code}: ${priv.error.message})` : `ALLOWED (${JSON.stringify(priv.data)}) - unexpected`,
  );
  console.log("  clubs visible (RLS):", visibleClubs.map((o) => o.handle).join(", "));
  await anon.auth.signOut();
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding the LOCAL stack at ${API_URL} (Terms version ${TERMS_VERSION})`);

  const users = {};
  const systems = {};
  for (const spec of ACCOUNTS) {
    users[spec.key] = await ensureAccount(spec);
    systems[spec.key] = spec.system;
  }

  const clubs = {};
  for (const spec of CLUBS) clubs[spec.handle] = await ensureClub(spec, users, systems);

  // Emery is an admin (not the owner) of the invite club.
  await ensureMember(clubs.test_invite_club, users.E, "admin");
  // Blake follows the open club without joining it.
  await ensureOrgFollow(clubs.test_open_club, users.B, "profile");

  for (const spec of POSTS) await ensurePost(spec, users, clubs);
  for (const spec of EVENTS) await ensureEvent(spec, users, clubs);
  for (const [from, to] of PERSON_FOLLOWS) await ensurePersonFollow(users[from], users[to]);

  await printSummary(users, clubs);
  await signInCheck();
  console.log("\nDone.");
}

await main();
