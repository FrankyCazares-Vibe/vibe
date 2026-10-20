#!/usr/bin/env node
// Seed the LOCAL Supabase stack with test accounts, clubs, posts and events.
//
//   node scripts/local-seed.mjs
//
// Re-runnable: every row is looked up first (by email, handle, or a stable
// natural key) and updated in place, so a second run changes nothing but
// resets the seeded fields back to their seeded values.
//
// CLUB CHAT (S69, migration 20261001100000_chat_v2_rooms): the script detects
// channels.kind. Column absent = the database before the migration: rooms are
// looked up by name and two extra clubs are seeded in the shape production
// has today (`sae` and `chat_seed_club`), so the migration's backfill has
// something real to work on. Column present = "already migrated": rooms are
// looked up by kind, inserts send kind, and the pre-migration shape is
// skipped (the private `general`, the member-written Board message); every
// seeded club is then passed to chat_repair_club, which changes nothing when
// nothing is missing.
// Before the migration the three members of chat_seed_club hold NO room rows:
// that is what every production club but SAE looks like, so the backfill has
// members without rows to work on. (Rows an earlier version of this seed
// wrote for them are removed by the run that finds them.)
// After a ROLLBACK of the migration (kind is gone, the names board / lounge /
// officers stay) the script refuses to run: restore the local backup first.
//
// THE CLOCK. Event dates are computed from today on every run, in whole UTC
// days: two runs on the same UTC day write the same dates, a run on a later
// day moves every seeded event forward. Against the 7 days an event chat
// stays open: `Chat Seed Cookout` ended 3 to 4 days ago and `Invite Club
// Welcome Mixer` 4 to 5 days ago (inside), `Chat Seed Callout` 10 to 11 days
// ago (outside). They stay on that side of the line only as long as the seed
// is run again: run it on the same UTC day as the rehearsal and as the apply
// of the migration, or the rooms the migration creates will not be the rooms
// its header counts.
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
// Has migration A (20261001100000_chat_v2_rooms) been applied here? It adds
// channels.kind. 42703 = Postgres "column does not exist"; PGRST204 = the
// same answer from PostgREST's schema cache. Anything else stops the run.
// ---------------------------------------------------------------------------
async function detectRoomKinds() {
  const { error } = await admin.from("channels").select("kind").limit(1);
  if (!error) return true;
  if (error.code === "42703" || error.code === "PGRST204") return false;
  console.error("\nFailed: detect channels.kind\n", error);
  process.exit(1);
}
const HAS_KIND = await detectRoomKinds();

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

// Before migration A a club starts with two rooms found by NAME. After it,
// rooms are found by KIND, carry their kind's name, and every club also has
// its Officers room (what chat_repair_club gives a new club).
const DEFAULT_CHANNELS = [
  { name: "general", kind: "lounge", position: 0, is_private: false },
  { name: "announcements", kind: "board", position: 1, is_private: false },
];
const OFFICERS_ROOM = { name: "officers", kind: "officers", position: 2, is_private: true };
const CORE_KINDS = ["board", "lounge", "officers"];

/** The rooms a club spec asks for, in the shape of THIS database. */
function roomsFor(spec) {
  const listed = spec.channels ?? DEFAULT_CHANNELS;
  if (!HAS_KIND) return listed;
  const rooms = listed.map((ch) =>
    CORE_KINDS.includes(ch.kind)
      ? { ...ch, name: ch.kind, is_private: ch.kind === "officers" }
      : ch,
  );
  if (!rooms.some((r) => r.kind === "officers")) rooms.push(OFFICERS_ROOM);
  return rooms;
}

/** One room of a club: by kind after migration A, by name before it. */
async function findRoom(orgId, room) {
  let q = admin.from("channels").select("id").eq("org_id", orgId).eq("type", "org_channel");
  if (HAS_KIND) {
    q = q.eq("kind", room.kind);
    if (!CORE_KINDS.includes(room.kind)) q = q.eq("name", room.name);
  } else {
    q = q.eq("name", room.name);
  }
  const found = must(await q.order("created_at").limit(1), `look up room ${room.name}`);
  return found[0]?.id ?? null;
}

async function ensureRoom(orgId, room, handle) {
  const existing = await findRoom(orgId, room);
  if (existing) return existing;
  const row = {
    org_id: orgId, type: "org_channel",
    name: room.name, position: room.position, is_private: room.is_private,
  };
  if (HAS_KIND) row.kind = room.kind;
  const made = must(
    await admin.from("channels").insert(row).select("id").single(),
    `create room ${room.name} in ${handle}`,
  );
  return made.id;
}

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

  for (const room of roomsFor(spec)) await ensureRoom(orgId, room, spec.handle);
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

/**
 * A member of chat_seed_club BEFORE migration A: the membership row and no
 * room rows, the way every production club but SAE looks today (asis 11.5:
 * their members hold 0 subscription rows). The migration's backfill is what
 * gives these people their rows. Room rows an earlier version of this seed
 * wrote for them are removed; on a second run there is nothing to remove.
 */
async function ensureBareMember(orgId, userId, role) {
  must(
    await admin
      .from("org_members")
      .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" }),
    `membership ${role}`,
  );
  const rooms = must(await admin.from("channels").select("id").eq("org_id", orgId), "rooms of the club");
  if (rooms.length === 0) return;
  const gone = must(
    await admin
      .from("channel_members")
      .delete()
      .in("channel_id", rooms.map((r) => r.id))
      .eq("user_id", userId)
      .select("id"),
    "room rows of a member without rows",
  );
  if (gone.length > 0) console.log(`  removed ${gone.length} room rows an earlier seed wrote (${role})`);
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
// Club chat (contract handoffs/chat-redesign/wave-1-contracts.md, section 8).
// Two clubs in the shapes production has today, so migration A's backfill
// runs locally against what it will meet there:
//   sae            = production's SAE: ONE member (its owner), a PRIVATE
//                    `general` holding 3 messages by the owner, public
//                    `announcements` and `events`, private `exec`. The owner
//                    holds a row on the two public rooms only.
//   chat_seed_club = every other club: public `general` (3 messages and 1
//                    reply) and `announcements` (one message written by a
//                    plain member), the owner + two officers (admin; no mods
//                    since 20261021100000) and a member
//                    (none of them holds a room row before the migration),
//                    a `going` and a `maybe` RSVP to an upcoming event, one
//                    event that ended 3 days ago and one that ended 10.
// On a migrated database the same rows are found by room kind and the
// pre-migration shape (room names, the private `general`) is skipped.
// A local club named `sae` is safe: no code names that handle.
// ---------------------------------------------------------------------------
const CHAT_CLUBS = [
  { handle: "sae", name: "SAE (local copy)", owner: "A", join_policy: "invite",
    verified: true, hidden: false, description: "Production's SAE, copied in shape only.",
    channels: [
      { name: "general", kind: "lounge", position: 0, is_private: true },
      { name: "announcements", kind: "board", position: 1, is_private: false },
      { name: "events", kind: "room", position: 2, is_private: false },
      { name: "exec", kind: "officers", position: 3, is_private: true },
    ] },
  { handle: "chat_seed_club", name: "Chat Seed Club", owner: "A", join_policy: "open",
    verified: true, hidden: false, description: "A club with members, RSVPs and chat history." },
];

const CHAT_MEMBERS = [
  { club: "chat_seed_club", user: "E", role: "admin" },
  { club: "chat_seed_club", user: "C", role: "admin" },
  { club: "chat_seed_club", user: "B", role: "member" },
];

// The owner's two rows production's SAE has (asis 11.5).
const CHAT_OWNER_ROWS = [
  { club: "sae", user: "A", room: { name: "announcements", kind: "board" } },
  { club: "sae", user: "A", room: { name: "events", kind: "room" } },
];

const LOUNGE = { name: "general", kind: "lounge" };
const BOARD = { name: "announcements", kind: "board" };

// `key` names a message so a reply can point at it (parent_message_id).
const CHAT_MESSAGES = [
  { club: "sae", room: LOUNGE, author: "A", content: "Welcome to the chapter chat." },
  { club: "sae", room: LOUNGE, author: "A", content: "Chapter meeting is Sunday at 7." },
  { club: "sae", room: LOUNGE, author: "A", content: "Dues are due by the end of the month." },
  { club: "chat_seed_club", room: LOUNGE, author: "A", content: "Welcome to Chat Seed Club!" },
  { club: "chat_seed_club", room: LOUNGE, author: "B", key: "ride",
    content: "Is anyone driving to game night?" },
  { club: "chat_seed_club", room: LOUNGE, author: "E", content: "Sign-in sheet is at the door." },
  { club: "chat_seed_club", room: LOUNGE, author: "C", replyTo: "ride",
    content: "I can take three people." },
  // Written by a plain member: after the backfill it is a member's top-level
  // Board post, the case the contract leaves in place (section 12, point 12).
  // `before`: part of the pre-migration shape. On a migrated database it is
  // the one thing the Board rule forbids, so it is never written there.
  { club: "chat_seed_club", room: BOARD, author: "B", before: true,
    content: "Which room is the first meeting in?" },
];

const CHAT_EVENTS = [
  { club: "chat_seed_club", creator: "A", title: "Chat Seed Game Night", inDays: 5,
    location: "Campus Center 148", description: "Upcoming, with a going and a maybe RSVP." },
  { club: "chat_seed_club", creator: "E", title: "Chat Seed Cookout", endedDaysAgo: 3,
    location: "Campus Center lawn", description: "Ended 3 days ago: its chat is still open." },
  { club: "chat_seed_club", creator: "A", title: "Chat Seed Callout", endedDaysAgo: 10,
    location: "Campus Center 305", description: "Ended 10 days ago: past the 7 days." },
];

const CHAT_RSVPS = [
  { club: "chat_seed_club", title: "Chat Seed Game Night", user: "B", status: "going" },
  { club: "chat_seed_club", title: "Chat Seed Game Night", user: "C", status: "maybe" },
];

/** One subscription row, the shape admitMember() writes. Never overwrites. */
async function ensureRoomRow(channelId, userId) {
  must(
    await admin.from("channel_members").upsert(
      { channel_id: channelId, user_id: userId, role: "member", accepted_at: new Date().toISOString() },
      { onConflict: "channel_id,user_id", ignoreDuplicates: true },
    ),
    "room row",
  );
}

/** Keyed on (room, author, content): an existing message is left untouched. */
async function ensureMessage(channelId, userId, content, parentId) {
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
  const row = { channel_id: channelId, user_id: userId, content };
  if (parentId) row.parent_message_id = parentId;
  if (HAS_KIND) row.kind = "text";
  const made = must(
    await admin.from("messages").insert(row).select("id").single(),
    `insert message "${content}"`,
  );
  return made.id;
}

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

async function seedClubChat(users, systems, clubs) {
  console.log(
    HAS_KIND
      ? "Club chat: already migrated (channels.kind is there). Rooms are looked up by kind; the pre-migration shape is skipped."
      : "Club chat: channels.kind is absent. Seeding sae and chat_seed_club in the pre-migration shape.",
  );
  for (const spec of CHAT_CLUBS) clubs[spec.handle] = await ensureClub(spec, users, systems);
  for (const m of CHAT_MEMBERS) {
    if (HAS_KIND) await ensureMember(clubs[m.club], users[m.user], m.role);
    else await ensureBareMember(clubs[m.club], users[m.user], m.role);
  }

  for (const r of CHAT_OWNER_ROWS) {
    const roomId = await findRoom(clubs[r.club], r.room);
    if (roomId) await ensureRoomRow(roomId, users[r.user]);
  }

  const byKey = {};
  for (const msg of CHAT_MESSAGES) {
    if (HAS_KIND && msg.before) continue;
    const roomId = await findRoom(clubs[msg.club], msg.room);
    if (!roomId) {
      console.error(`\nFailed: ${msg.club} has no ${msg.room.kind} room to put a message in`);
      process.exit(1);
    }
    const id = await ensureMessage(roomId, users[msg.author], msg.content, msg.replyTo ? byKey[msg.replyTo] : null);
    if (msg.key) byKey[msg.key] = id;
  }

  const events = {};
  for (const spec of CHAT_EVENTS) events[`${spec.club}/${spec.title}`] = await ensureEvent(spec, users, clubs);
  for (const r of CHAT_RSVPS) await ensureRsvp(events[`${r.club}/${r.title}`], users[r.user], r.status);

  // Migrated database: make every seeded club whole. The seed re-dates its
  // events on every run with an UPDATE that names no title, so
  // chat_events_room does not fire: an ended event can move back inside its 7
  // days without a room. chat_repair_club creates that room and its rows, and
  // changes nothing when nothing is missing.
  if (HAS_KIND) {
    for (const [handle, id] of Object.entries(clubs)) {
      must(await admin.rpc("chat_repair_club", { p_org: id }), `chat_repair_club for ${handle}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Club chat cards (wave 2, migration 20261001110000_chat_v2_cards; contract
// handoffs/chat-redesign/wave-2-contracts.md 13.2, DATABASE-L9): one poll,
// one sign-up and one Event card in chat_seed_club's Lounge, written through
// the migration's functions the way the card route does (the service role,
// after the route's gates: the seed's accounts pass can_publish_now() and
// has_recorded_consent(), which the functions do not check, contract 3.3.1).
// Migration B is detected by reading chat_polls: 42P01 (no such table) or
// PGRST205 (PostgREST does not know it) = not applied, skip. Each card is
// looked up by messages.kind + content in the Lounge before its call and
// never re-created, so a re-run changes nothing (same UTC day: the Event
// card's content carries the event's date, and the seed re-dates its
// events daily).
// ---------------------------------------------------------------------------
const CARD_ZONE = "America/Indiana/Indianapolis"; // CAMPUS_TIME_ZONE, src/lib/push/event-notice.ts

/** `Thu Oct 8, 7:30 PM` in the campus zone: eventWhen of src/lib/chat/when.ts, as cardFallbackContent stores it. */
function eventWhenLabel(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CARD_ZONE, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const h12 = hour % 12 || 12;
  const period = hour < 12 ? "AM" : "PM";
  const clock = minute === 0 ? `${h12} ${period}` : `${h12}:${String(minute).padStart(2, "0")} ${period}`;
  return `${get("weekday")} ${get("month")} ${get("day")}, ${clock}`;
}

/** The stored fallback text (src/lib/chat/cards/fallback.ts): whitespace collapsed, at most 300 characters. */
function cardContent(text) {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= 300 ? chars.join("") : `${chars.slice(0, 299).join("")}…`;
}

const SEED_CARDS = [
  { type: "poll", author: "B", question: "Pizza or tacos for the cookout?",
    options: [{ label: "Pizza" }, { label: "Tacos" }], anonymous: false, multi: false },
  { type: "signup", author: "E", question: "Bring something to Game Night",
    options: [{ label: "Snacks", capacity: 3 }, { label: "Drinks", capacity: 2 }, { label: "Board games", capacity: 4 }] },
  { type: "event", author: "A", title: "Chat Seed Game Night", note: "Rides leave from the union at 6:30." },
];

/** Has migration B (20261001110000_chat_v2_cards) been applied here? */
async function detectCards() {
  const { error } = await admin.from("chat_polls").select("message_id").limit(1);
  if (!error) return true;
  if (error.code === "42P01" || error.code === "PGRST205") return false;
  console.error("\nFailed: detect chat_polls\n", error);
  process.exit(1);
}

/** A card of the Lounge by kind + content: an existing one is left untouched. */
async function findCard(channelId, kind, content) {
  const found = must(
    await admin.from("messages").select("id").eq("channel_id", channelId).eq("kind", kind).eq("content", content)
      .order("created_at").limit(1),
    `look up card "${content}"`,
  );
  return found.length > 0 ? found[0].id : null;
}

async function seedClubCards(users, clubs) {
  if (!HAS_KIND) return; // migration B needs A
  if (!(await detectCards())) {
    console.log("Club chat cards: migration B is not applied (chat_polls is missing). Skipped.");
    return;
  }
  const loungeId = await findRoom(clubs.chat_seed_club, LOUNGE);
  if (!loungeId) {
    console.error("\nFailed: chat_seed_club has no lounge room to put the cards in");
    process.exit(1);
  }
  const made = {};
  for (const card of SEED_CARDS) {
    if (card.type === "event") {
      const found = must(
        await admin.from("events").select("id, title, starts_at").eq("org_id", clubs.chat_seed_club).eq("title", card.title).limit(1),
        `look up event ${card.title}`,
      );
      if (found.length === 0) {
        console.error(`\nFailed: chat_seed_club has no event titled "${card.title}" for the Event card`);
        process.exit(1);
      }
      const content = cardContent(`Event: ${found[0].title} · ${eventWhenLabel(found[0].starts_at)} — ${card.note}`);
      made["event card"] =
        (await findCard(loungeId, "event_card", content)) ??
        must(
          await admin.rpc("chat_create_event_card", {
            p_channel: loungeId, p_user: users[card.author], p_event: found[0].id, p_note: card.note, p_content: content,
          }),
          `chat_create_event_card "${card.title}"`,
        );
      continue;
    }
    const content = cardContent(`${card.type === "poll" ? "Poll" : "Sign-up"}: ${card.question}`);
    made[card.type === "poll" ? "poll" : "sign-up"] =
      (await findCard(loungeId, "poll", content)) ??
      must(
        await admin.rpc("chat_create_poll", {
          p_channel: loungeId, p_user: users[card.author], p_mode: card.type, p_question: card.question,
          p_options: card.options, p_anonymous: card.anonymous ?? false, p_multi: card.multi ?? card.type === "signup",
          p_closes_at: null, p_content: content,
        }),
        `chat_create_poll "${card.question}"`,
      );
  }
  console.log("Club chat cards in chat_seed_club's Lounge:", JSON.stringify(made));
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
  // 5 days back, not 7: it ended 4 to 5 days ago on every run, so it never
  // sits an hour from the end of the 7 days an event chat stays open.
  { club: "test_invite_club", creator: "E", title: "Invite Club Welcome Mixer", inDays: -5,
    location: "Campus Center Atrium", description: "A past event, for history views." },
];

/** 7pm Indianapolis (23:00 UTC, EDT) `days` from today, two hours long. */
function eventWindow(days) {
  const start = daysFromNow(days);
  start.setUTCHours(23, 0, 0, 0);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString() };
}

/** Two hours that ended at 00:00 UTC `days` days ago (so between `days` and `days` + 1 days ago). */
function endedWindow(days) {
  const end = daysFromNow(-days);
  end.setUTCHours(0, 0, 0, 0);
  return { starts_at: new Date(end.getTime() - 2 * 3_600_000).toISOString(), ends_at: end.toISOString() };
}

async function ensureEvent(spec, users, clubs) {
  const orgId = clubs[spec.club];
  const fields = {
    creator_id: users[spec.creator],
    description: spec.description,
    location: spec.location,
    ...(spec.endedDaysAgo != null ? endedWindow(spec.endedDaysAgo) : eventWindow(spec.inDays)),
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
  for (const spec of [...CLUBS, ...CHAT_CLUBS]) {
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

  // The rooms of the two chat clubs, as this database holds them.
  const roomTable = [];
  for (const spec of CHAT_CLUBS) {
    const rooms = must(
      await admin
        .from("channels")
        .select(HAS_KIND ? "id, name, is_private, position, kind" : "id, name, is_private, position")
        .eq("org_id", clubs[spec.handle])
        .order("position"),
      `summary: rooms of ${spec.handle}`,
    );
    for (const r of rooms) {
      roomTable.push({
        club: spec.handle,
        room: r.name,
        kind: HAS_KIND ? r.kind : "(no column)",
        private: r.is_private,
        messages: await count("messages", (q) => q.eq("channel_id", r.id)),
        replies: await count("messages", (q) => q.eq("channel_id", r.id).not("parent_message_id", "is", null)),
        rows: await count("channel_members", (q) => q.eq("channel_id", r.id)),
      });
    }
  }
  console.log(`\nClub chat rooms (${HAS_KIND ? "already migrated" : "before migration A"})`);
  console.table(roomTable);

  // Whole-database totals: identical across runs when the seed is idempotent.
  console.log("\nTable totals (whole local database)");
  const totals = {};
  for (const t of [
    "users", "terms_acceptances", "orgs", "org_members", "org_followers", "channels",
    "channel_members", "messages", "posts", "events", "rsvps", "connections", "notifications",
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

  // After a ROLLBACK of migration A the column is gone but its renames stay.
  // Seeding then would look for `general` / `announcements` / `exec`, find
  // none, and give every club a second set of rooms and messages.
  if (!HAS_KIND) {
    const renamed = await count("channels", (q) =>
      q.eq("type", "org_channel").in("name", ["board", "lounge", "officers"]),
    );
    if (renamed > 0) {
      console.error(
        "Refusing to seed: channels.kind is absent but club rooms are already named board, lounge or officers " +
          "(migration A was rolled back and its renames stay). Restore the local backup first.",
      );
      process.exit(1);
    }
  }

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
  await seedClubChat(users, systems, clubs);
  await seedClubCards(users, clubs);
  for (const [from, to] of PERSON_FOLLOWS) await ensurePersonFollow(users[from], users[to]);

  await printSummary(users, clubs);
  await signInCheck();
  console.log("\nDone.");
}

await main();
