#!/usr/bin/env node
// Seed the two accounts App Review and Play review sign in with: a
// "reviewer" (account 1) and a "friend" (account 2). Both are
// school-verified, onboarded and Terms-accepted, each has one post, they
// follow each other, and the friend has commented on the reviewer's post, so
// Report and Block can be tried on real content by someone with no school
// email of their own.
//
//   node scripts/seed-review-accounts.mjs            dry run, local stack
//   node scripts/seed-review-accounts.mjs --apply    writes, local stack
//
// DRY RUN BY DEFAULT: it reads what is there and prints every write it would
// make, then stops. --apply makes them.
//
// Re-runnable: every row is looked up first (auth user by email, post by
// author + text, follow by pair, comment by post + author + text) and
// updated in place or left alone. Re-run it before every store submission,
// because a review uses the pair up, and the next run puts it back:
// - The reviewer may have deleted account 1 (Apple tests account deletion).
//   The next run simply creates it again.
// - A block or mute between the two is deleted, which is what Unblock and
//   Unmute do in the app, and then the follows go back in. A block deletes
//   both follows, and the feed hides blocked and muted people. Without this
//   the pair could follow each other while one blocks the other, which the
//   block route never allows.
// - The feed hides a post from the person who reported it, for good,
//   whatever the moderators decide. So a seeded post the other account
//   reported, or one a moderator removed, gets a fresh copy, and the
//   friend's comment goes on the fresh copy. The old one stays where it is,
//   because a report or a removal points at it (reports keep their own
//   snapshot, so nothing about them is changed). A removed comment gets a
//   fresh copy the same way.
//
// SAFETY (handoffs/wave-plan-pwa/critic-s1.md item 16):
// - Local mode takes the URL and key ONLY from `supabase status -o env`, the
//   way scripts/local-seed.mjs does, reads no .env file, and refuses any host
//   that isn't 127.0.0.1 / localhost.
// - Production needs --production AND --i-have-frankys-yes, a person at a
//   terminal (not a pipe, not an agent) and the project ref typed back. It
//   reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the shell
//   only. Even a dry run is a production read, so every refusal happens
//   before any network call.
// - Passwords come from the environment only, never argv (shell history and
//   `ps` show argv). No default, never printed, and a dry run doesn't need
//   them. Nothing prints a key, a password or the service URL.
// - Never sets is_platform_admin: a reviewer has to see Vibe as a student
//   does, and an existing admin account is refused.
//
// Environment (the repo is public: values live in your shell or password
// manager, never in a file here). Set the secret ones without echoing them,
// because `export NAME=value` typed at the prompt lands in plain text in
// ~/.zsh_history:
//   IFS= read -rs REVIEW_PASSWORD_1 && export REVIEW_PASSWORD_1
// then paste the value and press Return. The same goes for
// REVIEW_PASSWORD_2, SUPABASE_SERVICE_ROLE_KEY and RESTRICTION_PEPPER. Close
// the terminal (or `unset` them) when the run is done.
//   REVIEW_EMAIL_1 / _2         sign-in email. Local default review-N@example.test.
//   REVIEW_PASSWORD_1 / _2      sign-in password, 8–72 characters. --apply only.
//   REVIEW_SCHOOL_EMAIL_1 / _2  the @iu.edu / @purdue.edu address marked
//                               verified. It is claimed for good (one school
//                               address, one account), so use one no student
//                               can ever hold. Local default vibe.reviewN@iu.edu.
//   REVIEW_HANDLE_1 / _2        optional; default vibe_review / vibe_review_pal.
//   RESTRICTION_PEPPER          optional; the app's pepper (Vercel env). With
//                               it, a ban on a review school address is found
//                               by its identity key, as school-email
//                               verification finds it. Without it the run
//                               refuses while ANY school-identity suspension
//                               or ban is in force, the app's own rule.
//
// MODERATION: the schema has no "never restrict" flag (account_restrictions
// has no exemption, and is_platform_admin, the only thing admin actions skip,
// is exactly what a reviewer must not have). So the script refuses while
// either account has a suspension or ban in force (lift it in the admin desk,
// which keeps the audit trail). It also refuses while either school address's
// identity has one. That key outlives the account (a banned student can
// delete their account), and it is what stops "delete and sign up again", so
// a re-run must not hand a banned address to a fresh account. The script
// stamps app_metadata.vibe_review_account on the auth user so a later
// admin-desk guard can recognise the pair. The same stamp is what lets a
// re-run touch an existing account: an address that belongs to anyone else
// is refused, never taken over.

import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function refuse(message) {
  console.error(`Refusing: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Arguments. Anything unknown is refused without being echoed, in case it is
// a password someone typed where it doesn't belong.
// ---------------------------------------------------------------------------
const KNOWN_FLAGS = new Set(["--apply", "--production", "--i-have-frankys-yes", "--help"]);
const ARGS = process.argv.slice(2);
ARGS.forEach((arg, i) => {
  if (!KNOWN_FLAGS.has(arg)) {
    refuse(
      `argument ${i + 1} isn't one this script takes (not shown, in case it is a secret). ` +
        "It accepts --apply, --production and --i-have-frankys-yes; passwords go in REVIEW_PASSWORD_1 / _2.",
    );
  }
});
if (ARGS.includes("--help")) {
  console.log("Usage: node scripts/seed-review-accounts.mjs [--apply] [--production --i-have-frankys-yes]");
  console.log("Dry run by default. See the header of this file for the environment it reads.");
  process.exit(0);
}
const APPLY = ARGS.includes("--apply");
const PRODUCTION = ARGS.includes("--production");
if (ARGS.includes("--i-have-frankys-yes") && !PRODUCTION) {
  refuse("--i-have-frankys-yes only goes with --production.");
}
if (PRODUCTION && !ARGS.includes("--i-have-frankys-yes")) {
  refuse("--production also needs --i-have-frankys-yes. Only Franky runs this against production.");
}

// ---------------------------------------------------------------------------
// Where to connect. Both paths refuse before any network call.
// ---------------------------------------------------------------------------
function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

function readLocalStatus() {
  const res = spawnSync("supabase", ["status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (res.error || res.status !== 0) {
    refuse("`supabase status -o env` failed. Start the local stack with `supabase start`.");
  }
  const env = {};
  for (const line of res.stdout.split("\n")) {
    const m = line.trim().match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function resolveTarget() {
  if (!PRODUCTION) {
    const status = readLocalStatus();
    if (!isLocalUrl(status.API_URL ?? "")) {
      refuse("`supabase status` reports a stack that isn't on 127.0.0.1 / localhost. Local mode only touches a local stack.");
    }
    if (!status.SERVICE_ROLE_KEY) refuse("SERVICE_ROLE_KEY is missing from `supabase status -o env`.");
    return { url: status.API_URL, key: status.SERVICE_ROLE_KEY, label: "the LOCAL stack" };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    refuse("a production run has to be typed by a person at a terminal, not piped or scripted.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // refused just below
  }
  const ref = host.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  if (!ref) refuse("NEXT_PUBLIC_SUPABASE_URL in this shell isn't a <ref>.supabase.co address (not shown).");
  if (!key) refuse("SUPABASE_SERVICE_ROLE_KEY isn't set in this shell.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(
    `This is a PRODUCTION ${APPLY ? "WRITE" : "read (dry run)"}. Type the Supabase project ref to go on: `,
  );
  rl.close();
  if (typed.trim() !== ref) refuse("that isn't this project's ref. Nothing was read or written.");
  return { url, key, label: "PRODUCTION" };
}

// ---------------------------------------------------------------------------
// What the two accounts look like. The posts show on the real campus feed,
// so they say plainly what these accounts are.
// ---------------------------------------------------------------------------
const CAMPUS = "indianapolis"; // shared by IU Indy and Purdue Indy (campuses.systems = {iu,purdue})
const SYSTEM_LABEL = { iu: "IU", purdue: "Purdue" };
const SYSTEM_DOMAIN = { iu: "iu.edu", purdue: "purdue.edu" };
const REVIEW_MARKER = "vibe_review_account";

/** Same shape onboarding saves (OnboardingMobile buildOttoConfig), as local-seed.mjs writes it. */
const OTTO_ANSWERS = { name: "otto", platforms: [], voiceSamples: [], leash: "ask" };

const PROFILES = [
  {
    role: "reviewer", handle: "vibe_review", name: "Vibe Review", major: "Informatics", year: 3,
    bio: "A Vibe demo account, used for app store review.",
    post: "Hi from the Vibe team! This is a demo account we use for app store review.",
  },
  {
    role: "friend", handle: "vibe_review_pal", name: "Vibe Review Friend", major: "Biology", year: 2,
    bio: "The second Vibe demo account, used for app store review.",
    post: "Second demo account here. The Vibe team uses these two accounts to test posting, reporting and blocking.",
  },
];
const FRIEND_COMMENT = "Hello from the second demo account!";

/** Read a value out of a TypeScript source, so this file never drifts from it. */
function fromSource(path, re, what) {
  const m = readFileSync(join(REPO_ROOT, path), "utf8").match(re);
  if (!m) refuse(`could not read ${what} from ${path}.`);
  return m[1];
}

// A stale version would read as "no consent" (hasRecordedConsent), so it comes from terms.ts.
const TERMS_VERSION = fromSource(
  "src/lib/legal/terms.ts", /export const TERMS_VERSION = "([^"]+)"/, "TERMS_VERSION",
);
const HANDLE_FORMAT_RE = new RegExp(
  fromSource("src/lib/profile/handle.ts", /export const HANDLE_FORMAT_RE = \/(.+)\/;/, "HANDLE_FORMAT_RE"),
);
const RESERVED_HANDLES = new Set(
  [...fromSource("src/lib/profile/handle.ts", /const RESERVED = new Set\(\[([\s\S]*?)\]\)/, "RESERVED")
    .matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

// The school-identity ban key, as src/lib/moderation/identity.ts
// restrictionIdentityKeyWith makes it: HMAC-SHA256 over the label plus the
// canonical address, keyed with the trimmed pepper. A pepper shorter than the
// app's minimum counts as unset there (isUsablePepper), so it does here too.
const IDENTITY_KEY_LABEL = fromSource(
  "src/lib/moderation/identity.ts", /export const IDENTITY_KEY_LABEL = "([^"]+)"/, "IDENTITY_KEY_LABEL",
);
const MIN_PEPPER_LENGTH = Number(
  fromSource(
    "src/lib/moderation/identity.ts",
    /export const MIN_RESTRICTION_PEPPER_LENGTH = (\d+);/,
    "MIN_RESTRICTION_PEPPER_LENGTH",
  ),
);
const PEPPER = (process.env.RESTRICTION_PEPPER ?? "").trim();
const PEPPER_USABLE = PEPPER.length >= MIN_PEPPER_LENGTH;

function schoolIdentityKey(canonical) {
  return createHmac("sha256", PEPPER).update(`${IDENTITY_KEY_LABEL}${canonical}`).digest("hex");
}

/** Same rule as src/lib/legal/terms.ts hasRecordedConsent. */
function hasRecordedConsent(row) {
  return Boolean(row?.terms_accepted_at && row?.age_attested_at && row?.terms_version === TERMS_VERSION);
}

/**
 * The school identity behind an address, by the rule in
 * src/lib/moderation/identity.ts canonicalSchoolIdentity: lowercase, drop a
 * `+tag`, fold a subdomain into iu.edu / purdue.edu. `normalized` is what
 * users.school_email stores (normalizeSchoolEmail). Null for anything that
 * isn't an IU or Purdue address, so other schools' rows never match.
 */
function schoolIdentity(email) {
  const parts = String(email ?? "").trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0]) return null;
  const host = parts[1].replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((label) => label.startsWith("xn--"))) {
    return null;
  }
  for (const [system, domain] of Object.entries(SYSTEM_DOMAIN)) {
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    const local = parts[0].split("+")[0];
    if (!local) return null;
    return { system, canonical: `${local}@${domain}`, normalized: `${parts[0]}@${host}` };
  }
  return null;
}

/** Same limits as src/lib/auth/password-rules.ts: 8 code points to 72 bytes. */
function passwordProblem(password) {
  if ([...password].length < 8) return "is shorter than 8 characters";
  if (new TextEncoder().encode(password).length > 72) return "is longer than 72 bytes";
  return null;
}

/** The two accounts from the environment, checked before anything connects. */
function readSpecs() {
  const env = (name) => process.env[name]?.trim() ?? "";
  const problems = [];
  const specs = PROFILES.map((profile, i) => {
    const n = i + 1;
    const email = (env(`REVIEW_EMAIL_${n}`) || (PRODUCTION ? "" : `review-${n}@example.test`)).toLowerCase();
    const school = schoolIdentity(env(`REVIEW_SCHOOL_EMAIL_${n}`) || (PRODUCTION ? "" : `vibe.review${n}@iu.edu`));
    const handle = (env(`REVIEW_HANDLE_${n}`) || profile.handle).toLowerCase();
    // Never trimmed, the same as the signup form: a trimmed password isn't the one saved.
    const password = process.env[`REVIEW_PASSWORD_${n}`] ?? "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      problems.push(`REVIEW_EMAIL_${n} is missing or isn't an email address.`);
    }
    if (!school) problems.push(`REVIEW_SCHOOL_EMAIL_${n} is missing or isn't an @iu.edu / @purdue.edu address.`);
    if (!HANDLE_FORMAT_RE.test(handle) || RESERVED_HANDLES.has(handle)) {
      problems.push(`REVIEW_HANDLE_${n} must be 3–20 of a-z, 0-9 and _, and not a reserved word.`);
    }
    if (APPLY && !password) problems.push(`REVIEW_PASSWORD_${n} isn't set, and --apply needs it.`);
    if (APPLY && password && passwordProblem(password)) {
      problems.push(`REVIEW_PASSWORD_${n} ${passwordProblem(password)}.`);
    }
    return { n, ...profile, email, school, handle, password };
  });
  const [a, b] = specs;
  if (a.email && a.email === b.email) problems.push("REVIEW_EMAIL_1 and REVIEW_EMAIL_2 are the same address.");
  if (a.handle === b.handle) problems.push("the two accounts have the same handle.");
  if (a.school && b.school && a.school.canonical === b.school.canonical) {
    problems.push("the two school emails are one school identity (a +tag or subdomain of each other).");
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`Refusing: ${p}`);
    process.exit(1);
  }
  return specs;
}

const SPECS = readSpecs();
const TARGET = await resolveTarget();

// Loaded only after every gate has passed.
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(TARGET.url, TARGET.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Unwrap a supabase-js result, or stop. Only the message is printed, never the request. */
function must({ data, error }, what) {
  if (error) {
    console.error(`\nFailed: ${what}: ${error.message ?? "unknown error"}${error.code ? ` (${error.code})` : ""}`);
    process.exit(1);
  }
  return data;
}

async function findAuthUserByEmail(email) {
  for (let page = 1; ; page++) {
    const data = must(await admin.auth.admin.listUsers({ page, perPage: 200 }), "list auth users");
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

const USER_COLUMNS =
  "id, handle, school_email, school_verified, is_platform_admin, campus_id, terms_version, " +
  "terms_accepted_at, age_attested_at, campus_set_at, handle_changed_at, otto_answers";

/** Restrictions in force right now: not lifted, started, and not yet ended. */
function activeRestrictions(nowIso) {
  return admin
    .from("account_restrictions")
    .select("kind")
    .is("lifted_at", null)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
}

/**
 * The refusal for a suspension or ban on this school address's identity, or
 * null. Same rule as moderation/access.ts restrictionForSchoolIdentity, which
 * school-email verification runs: with a usable pepper, look up this
 * identity's key; without one, any school-keyed restriction in force means we
 * can't tell whose it is, so refuse (the app answers 503 there). Never "allow
 * because we couldn't check".
 */
async function schoolIdentityRefusal(spec) {
  let q = activeRestrictions(new Date().toISOString()).eq("key_kind", "school");
  if (PEPPER_USABLE) q = q.eq("identity_key", schoolIdentityKey(spec.school.canonical));
  const rows = must(await q.limit(1), `read school-identity restrictions ${spec.n}`);
  if (rows.length === 0) return null;
  if (PEPPER_USABLE) {
    return (
      `REVIEW_SCHOOL_EMAIL_${spec.n}'s school identity has a ${rows[0].kind} in force. A ban outlives the ` +
      "account it was placed on, so it can't go to a fresh one. Use another address, or lift it in the admin desk."
    );
  }
  return (
    "a school-identity suspension or ban is in force, and without RESTRICTION_PEPPER in this shell the script " +
    `can't tell whether it is REVIEW_SCHOOL_EMAIL_${spec.n}'s. Set it (the header says how) and run again.`
  );
}

/**
 * Everything already there for one account, and every reason not to touch
 * it. A service-role write skips every check school-email verification makes,
 * so these stand in for the ones that matter here: the plain unique index and
 * the canonical identity (schoolIdentityConflict), and a ban on that identity
 * (restrictionForSchoolIdentity, school-email-apply.ts). schoolIdentity above
 * keeps it to IU and Purdue addresses. What it doesn't copy is the emailed
 * link that proves someone reads the address: nobody reads a demo address,
 * which is why it must be one no student can ever hold. Without these checks
 * the script could put a second account on one student's school identity,
 * claim a real student's address for good, or hand a banned address to a
 * fresh account.
 */
async function readAccount(spec, verifiedRows) {
  const refusals = [];
  const authUser = await findAuthUserByEmail(spec.email);
  const selfId = authUser?.id ?? null;
  let row = null;
  let posts = [];
  if (authUser) {
    if (authUser.app_metadata?.[REVIEW_MARKER] !== true) {
      refusals.push(
        `REVIEW_EMAIL_${spec.n} already belongs to an account this script didn't make. Use an unused address; nothing is taken over.`,
      );
    }
    row = must(
      await admin.from("users").select(USER_COLUMNS).eq("id", selfId).maybeSingle(),
      `read users row ${spec.n}`,
    );
    if (row?.is_platform_admin) {
      refusals.push(`account ${spec.n} is a platform admin. Reviewers must be ordinary students.`);
    }
    const active = must(
      await activeRestrictions(new Date().toISOString()).eq("user_id", selfId).limit(1),
      `read restrictions ${spec.n}`,
    );
    if (active.length > 0) {
      refusals.push(
        `account ${spec.n} has a ${active[0].kind} in force. Lift it in the admin desk first, so the audit trail keeps it.`,
      );
    }
    // Every copy, newest first. After a review there may be one the other
    // account reported or a moderator removed, and a fresh one beside it;
    // main() picks the one the reviewer can still see.
    posts = must(
      await admin
        .from("posts")
        .select("id, status, removed_at")
        .eq("user_id", selfId)
        .is("org_id", null)
        .eq("content", spec.post)
        .order("created_at", { ascending: false })
        .limit(20),
      `read posts ${spec.n}`,
    );
  }

  // Checked with or without an account: a fresh account is exactly the
  // "delete and sign up again" a school-identity ban exists to stop.
  const banned = await schoolIdentityRefusal(spec);
  if (banned) refusals.push(banned);

  const handleOwner = must(
    await admin.from("users").select("id").eq("handle", spec.handle).limit(1),
    `read handle @${spec.handle}`,
  );
  if (handleOwner.length > 0 && handleOwner[0].id !== selfId) {
    refusals.push(`@${spec.handle} belongs to another account. Set REVIEW_HANDLE_${spec.n} to a free one.`);
  }

  // The plain unique index on school_email, then the canonical identity (a
  // +tag or subdomain of an address is the same student).
  const exactOwner = must(
    await admin.from("users").select("id").eq("school_email", spec.school.normalized).limit(1),
    `read school email ${spec.n}`,
  );
  const identityOwner = verifiedRows.find(
    (r) => r.id !== selfId && schoolIdentity(r.school_email)?.canonical === spec.school.canonical,
  );
  if ((exactOwner.length > 0 && exactOwner[0].id !== selfId) || identityOwner) {
    refusals.push(
      `REVIEW_SCHOOL_EMAIL_${spec.n} is already another account's school identity. Use an address no student holds.`,
    );
  }
  return { spec, authUser, row, posts, refusals };
}

/**
 * What a review may have left between the two accounts: blocks and mutes in
 * either direction, and the reports either one filed on the other's seeded
 * posts. Blocks and mutes forbid a row on oneself (CHECK blocker <> blocked,
 * muter <> muted), so the two `in`s match exactly this pair's rows, the same
 * read the block route uses for follows. Service role: `reports` grants
 * students nothing, and RLS would hide half of the rest.
 */
async function readPair(one, two) {
  const a = one.authUser?.id;
  const b = two.authUser?.id;
  if (!a || !b) return { blocks: [], mutes: [], reports: [] };
  const pair = [a, b];
  const blocks = must(
    await admin.from("blocks").select("id, blocker_id").in("blocker_id", pair).in("blocked_id", pair),
    "read blocks between the two accounts",
  );
  const mutes = must(
    await admin.from("mutes").select("id, muter_id, until").in("muter_id", pair).in("muted_id", pair),
    "read mutes between the two accounts",
  );
  const postIds = [...one.posts, ...two.posts].map((p) => p.id);
  const reports =
    postIds.length === 0
      ? []
      : must(
          await admin
            .from("reports")
            .select("reporter_id, target_id")
            .eq("target_type", "post")
            .in("reporter_id", pair)
            .in("target_id", postIds),
          "read the two accounts' reports on the seeded posts",
        );
  return { blocks, mutes, reports };
}

/**
 * Why the reviewer can no longer be shown this seeded post, or null when it is
 * fine. A report hides the post from its reporter whatever its status (the
 * feed reads them all), so an open, actioned or dismissed report all count.
 */
function spentReason(post, otherId, reports) {
  if (post.removed_at) return "a moderator removed it";
  if (post.status !== "published") return `its status is ${post.status}`;
  if (otherId && reports.some((r) => r.reporter_id === otherId && r.target_id === post.id)) {
    return "the other account reported it, so their feed hides it for good";
  }
  return null;
}

async function followExists(followerId, followingId) {
  if (!followerId || !followingId) return false;
  const rows = must(
    await admin
      .from("connections")
      .select("id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .limit(1),
    "read follow",
  );
  return rows.length > 0;
}

/**
 * The friend's comment on the post the reviewer will see: one no moderator
 * removed, and how many removed copies sit beside it. A report doesn't hide a
 * comment (the thread reads no reports), so only a removal uses one up.
 */
async function findComment(postId, userId) {
  if (!postId || !userId) return { comment: null, removed: 0 };
  const rows = must(
    await admin
      .from("post_comments")
      .select("id, removed_at")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("content", FRIEND_COMMENT)
      .is("parent_comment_id", null)
      .limit(20),
    "read comment",
  );
  return { comment: rows.find((r) => !r.removed_at) ?? null, removed: rows.filter((r) => r.removed_at).length };
}

// ---------------------------------------------------------------------------
// The writes. The dry run prints exactly these; --apply makes them.
//   school-verified = school_email + school_verified + school_system + campus
//                     (what src/lib/auth/school-email-apply.ts writes)
//   onboarded       = a non-empty otto_answers (post-login.ts isOttoOnboardingComplete)
//                     + handle_changed_at (Finish starts the handle cooldown)
//   Terms accepted  = signup metadata (the handle_new_user trigger writes the
//                     consent columns and a 'signup' ledger row), or, when that
//                     record is missing or stale, the interstitial's ledger row
//                     + columns, the way POST /api/me/accept-terms does it
// ---------------------------------------------------------------------------
function signupMeta(spec) {
  return { full_name: spec.name, terms_version: TERMS_VERSION, age_attested: true };
}

function usersPatch(spec, row, now) {
  return {
    handle: spec.handle,
    name: spec.name,
    major: spec.major,
    year: spec.year,
    bio: spec.bio,
    school_email: spec.school.normalized,
    school_verified: true,
    school_system: spec.school.system,
    campus_id: CAMPUS,
    school: `${SYSTEM_LABEL[spec.school.system]} Indianapolis`,
    // Kept on a re-run, so the 30-day campus rule and the handle cooldown don't restart.
    campus_set_at: row?.campus_set_at ?? now,
    otto_answers:
      Object.keys(row?.otto_answers ?? {}).length > 0 ? row.otto_answers : { ...OTTO_ANSWERS, setupAt: now },
    handle_changed_at: row?.handle_changed_at ?? now,
  };
}

/** The plan line for one account's post, saying why a fresh copy is needed. */
function postLine(s) {
  const n = s.spent.length;
  const kept = n === 1 ? "1 used-up copy stays where it is" : `${n} used-up copies stay where they are`;
  if (s.post) return `  post       exists; left alone${n > 0 ? ` (${kept})` : ""}`;
  const insert = `  post       INSERT posts {type:"post", status:"published", org_id:null} ${JSON.stringify(s.spec.post)}`;
  if (n === 0) return insert;
  return (
    `${insert}\n             a fresh copy. The newest one is used up: ${s.spent[0].spent}.` +
    `\n             Nothing is deleted: ${kept}, since a report or a removal may point at it.`
  );
}

function printPlan(states, pair, follows, commentState) {
  const now = new Date().toISOString();
  console.log(`${APPLY ? "APPLYING to" : "DRY RUN against"} ${TARGET.label}. Terms version ${TERMS_VERSION}.`);
  if (!APPLY) console.log("Nothing is written. Add --apply to write.");
  for (const s of states) {
    const { spec } = s;
    const meta = JSON.stringify(signupMeta(spec));
    console.log(`\nAccount ${spec.n} (${spec.role}): ${spec.email}`);
    if (s.authUser) {
      console.log(`  auth user  UPDATE password (REVIEW_PASSWORD_${spec.n}), email_confirm true, user_metadata ${meta}`);
    } else {
      console.log(`  auth user  CREATE password (REVIEW_PASSWORD_${spec.n}), email_confirm true, user_metadata ${meta},`);
      console.log(`             app_metadata {"${REVIEW_MARKER}":true}; the signup trigger makes the users row`);
      console.log("             and records Terms consent with a 'signup' terms_acceptances row");
    }
    console.log("  users row  UPDATE");
    for (const [key, value] of Object.entries(usersPatch(spec, s.row, now))) {
      console.log(`               ${key} = ${JSON.stringify(value)}`);
    }
    if (s.row && !hasRecordedConsent(s.row)) {
      console.log(`  terms      INSERT terms_acceptances {terms_version:"${TERMS_VERSION}", age_attested:true, source:"interstitial"}`);
      console.log("             + UPDATE users terms_version, terms_accepted_at, age_attested_at = now");
    } else if (s.row) {
      console.log("  terms      already accepted; left alone");
    }
    console.log(postLine(s));
  }
  // Rows only exist when both accounts do, so account 1's id tells the two apart.
  const n = (id) => (id === states[0].authUser?.id ? 1 : 2);
  console.log("\nBlocks and mutes between the two (deleted before the follows go back in)");
  if (pair.blocks.length + pair.mutes.length === 0) console.log("  none");
  for (const b of pair.blocks) {
    console.log(`  ${n(b.blocker_id)} blocked ${3 - n(b.blocker_id)}  DELETE (what Unblock does)`);
  }
  for (const m of pair.mutes) {
    const until = m.until ? `until ${m.until}` : "until unmuted";
    console.log(`  ${n(m.muter_id)} muted ${3 - n(m.muter_id)} ${until}  DELETE (what Unmute does)`);
  }
  console.log("\nFollows (connections)");
  for (const f of follows) {
    console.log(`  ${f.from} follows ${f.to}  ${f.exists ? "exists; left alone" : "INSERT"}`);
  }
  console.log("\nComment (post_comments)");
  const { comment, removed } = commentState;
  const removedNote = removed > 0 ? ` (a moderator removed ${removed} earlier cop${removed === 1 ? "y" : "ies"}; left in place)` : "";
  console.log(
    comment
      ? `  2 on 1's post  exists; left alone${removedNote}`
      : `  2 on 1's post  INSERT ${JSON.stringify(FRIEND_COMMENT)}` +
          (states[0].spent.length > 0 && !states[0].post ? " (on 1's fresh copy)" : removedNote),
  );
}

async function applyAccount(s) {
  const { spec } = s;
  let id = s.authUser?.id;
  if (id) {
    must(
      await admin.auth.admin.updateUserById(id, {
        password: spec.password,
        email_confirm: true,
        user_metadata: signupMeta(spec),
      }),
      `update auth user ${spec.n}`,
    );
  } else {
    const data = must(
      await admin.auth.admin.createUser({
        email: spec.email,
        password: spec.password,
        email_confirm: true,
        user_metadata: signupMeta(spec),
        app_metadata: { [REVIEW_MARKER]: true },
      }),
      `create auth user ${spec.n}`,
    );
    id = data.user.id;
  }

  const current = must(
    await admin.from("users").select(USER_COLUMNS).eq("id", id).single(),
    `read users row ${spec.n}`,
  );
  const now = new Date().toISOString();
  const patch = usersPatch(spec, current, now);
  // Ledger row first, then the columns, as POST /api/me/accept-terms does.
  if (!hasRecordedConsent(current)) {
    must(
      await admin.from("terms_acceptances").insert({
        user_id: id, terms_version: TERMS_VERSION, age_attested: true, source: "interstitial",
      }),
      `record Terms for account ${spec.n}`,
    );
    Object.assign(patch, { terms_version: TERMS_VERSION, terms_accepted_at: now, age_attested_at: now });
  }
  must(await admin.from("users").update(patch).eq("id", id), `update users row ${spec.n}`);
  return id;
}

/** Personal post; the posts_stamp_campus trigger stamps campus + system from the author's row. */
async function insertPost(userId, spec) {
  const row = must(
    await admin
      .from("posts")
      .insert({ user_id: userId, org_id: null, type: "post", content: spec.post, tags: [], status: "published" })
      .select("id")
      .single(),
    `insert post for account ${spec.n}`,
  );
  return row.id;
}

async function printReadBack(ids) {
  console.log("\nRead back");
  for (const [i, id] of ids.entries()) {
    const row = must(
      await admin.from("users").select(USER_COLUMNS).eq("id", id).single(),
      `read back account ${i + 1}`,
    );
    const onboarded = Object.keys(row.otto_answers ?? {}).length > 0;
    console.log(
      `  account ${i + 1}: @${row.handle}  school_verified=${row.school_verified}  campus=${row.campus_id}` +
        `  terms=${hasRecordedConsent(row)}  onboarded=${onboarded}  admin=${Boolean(row.is_platform_admin)}`,
    );
  }
}

async function main() {
  // One scan for both accounts, the same bounded read schoolIdentityConflict does.
  const verifiedRows = must(
    await admin
      .from("users")
      .select("id, school_email")
      .eq("school_verified", true)
      .not("school_email", "is", null)
      .limit(5000),
    "scan verified school emails",
  );
  const states = [];
  for (const spec of SPECS) states.push(await readAccount(spec, verifiedRows));
  const [one, two] = states;
  const pair = await readPair(one, two);
  // The newest copy of each post the reviewer can still see, or null for a
  // fresh one. The used-up copies are only reported.
  for (const [i, s] of states.entries()) {
    const otherId = states[1 - i].authUser?.id ?? null;
    const judged = s.posts.map((p) => ({ ...p, spent: spentReason(p, otherId, pair.reports) }));
    s.post = judged.find((p) => !p.spent) ?? null;
    s.spent = judged.filter((p) => p.spent);
  }
  const follows = [
    { from: 1, to: 2, exists: await followExists(one.authUser?.id, two.authUser?.id) },
    { from: 2, to: 1, exists: await followExists(two.authUser?.id, one.authUser?.id) },
  ];
  const commentState = await findComment(one.post?.id, two.authUser?.id);

  printPlan(states, pair, follows, commentState);

  const refusals = states.flatMap((s) => s.refusals);
  if (refusals.length > 0) {
    console.error("");
    for (const r of refusals) console.error(`Refusing: ${r}`);
    console.error("Nothing was written.");
    process.exit(1);
  }
  if (!APPLY) {
    console.log("\nDry run only: nothing was written.");
    return;
  }

  // Accounts first: a post takes its campus from its author's row.
  const ids = [];
  for (const s of states) ids.push(await applyAccount(s));
  const postIds = [];
  for (const [i, s] of states.entries()) postIds.push(s.post?.id ?? (await insertPost(ids[i], s.spec)));
  // Blocks and mutes go before the follows, as Unblock / Unmute would: a
  // follow next to a block is a state the block route never leaves behind.
  if (pair.blocks.length > 0) {
    must(
      await admin.from("blocks").delete().in("id", pair.blocks.map((b) => b.id)),
      "delete the blocks between the two accounts",
    );
  }
  if (pair.mutes.length > 0) {
    must(
      await admin.from("mutes").delete().in("id", pair.mutes.map((m) => m.id)),
      "delete the mutes between the two accounts",
    );
  }
  for (const f of follows) {
    if (f.exists) continue;
    must(
      await admin
        .from("connections")
        .upsert(
          { follower_id: ids[f.from - 1], following_id: ids[f.to - 1] },
          { onConflict: "follower_id,following_id", ignoreDuplicates: true },
        ),
      `account ${f.from} follows ${f.to}`,
    );
  }
  // postIds[0] is the fresh post when account 1's was used up, and findComment
  // found nothing on a post that didn't exist yet, so the comment follows it.
  if (!commentState.comment) {
    must(
      await admin.from("post_comments").insert({ post_id: postIds[0], user_id: ids[1], content: FRIEND_COMMENT }),
      "comment from account 2 on account 1's post",
    );
  }
  await printReadBack(ids);
  console.log(
    "\nDone. Sign in with each REVIEW_EMAIL and its REVIEW_PASSWORD, then follow handoffs/stores/review-notes.md.",
  );
}

await main();
