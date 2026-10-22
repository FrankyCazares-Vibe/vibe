/**
 * Drift tests for "Members only" events' database half
 * (`supabase/migrations/20261025100000_event_visibility.sql`, Oct 22, 2026;
 * handoffs/2026-10-22-club-tools-arc/PLAN-2.md, batch E1), read as text, the
 * checkin-migration.test.ts idiom. Its behaviour was rehearsed on the local
 * stack (the file's REHEARSED note); these keep a later edit from quietly
 * undoing it:
 *   - the column's two words are validate.ts's two words;
 *   - each restated function is its source migration's body with ONLY the
 *     planned lines added (event_checkin_self_as, chat_create_event_card) or
 *     its old body kept whole as the Everyone arm (event_visible);
 *   - the md5s the file guards with are the md5s of the bodies it holds,
 *     computed here the way Postgres does (md5 of prosrc, the text between
 *     the dollar quotes), and of the bodies it replaces;
 *   - the two rsvps policies keep their clauses and gain the helper.
 *
 * Run with:
 *   node --test src/lib/events/visibility-migration.test.ts
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

// validate.ts imports its neighbours extensionless (the validate.test.ts hook).
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("visibility-migration.test.ts needs Node >= 22.15 (module.registerHooks)");
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const spec = "./validate.ts";
const { EVENT_VISIBILITIES } = (await import(spec)) as typeof import("./validate");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const FILE = "supabase/migrations/20261025100000_event_visibility.sql";
const sql = readRoot(FILE);
/** What Postgres runs: the file without its `--` notes. */
const code = sql.replace(/--[^\n]*/g, "");
const flat = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

/** A function's prosrc as Postgres stores it: the text between `as $tag$` and the closing `$tag$`. */
function bodyOf(text: string, name: string, opener: RegExp): string {
  const start = text.search(opener);
  assert.ok(start >= 0, `${name} is defined`);
  const tag = /\bas (\$[a-z]*\$)/.exec(text.slice(start));
  assert.ok(tag, `the body of ${name}`);
  const from = start + tag.index + tag[0].length;
  const end = text.indexOf(tag[1], from);
  assert.ok(end > from, `the end of ${name}`);
  return text.slice(from, end);
}
const here = (name: string) => bodyOf(sql, name, new RegExp(`create or replace function public\\.${name}\\(`));

const OLD = {
  event_visible: bodyOf(readRoot("supabase/migrations/20260928110000_club_events_rules.sql"), "event_visible", /^create or replace function public\.event_visible\(/m),
  event_checkin_self_as: bodyOf(readRoot("supabase/migrations/20261019120000_event_checkins.sql"), "event_checkin_self_as", /^create function public\.event_checkin_self_as\(/m),
  chat_create_event_card: bodyOf(readRoot("supabase/migrations/20261001110000_chat_v2_cards.sql"), "chat_create_event_card", /^create function public\.chat_create_event_card\(/m),
};
const OLD_MD5 = {
  event_visible: "ca3d34f65cb01af1a826df053d97b384",
  event_checkin_self_as: "822bd44939016fe0d4502787c9947574",
  chat_create_event_card: "b9a5a880b4af8e951b938a2d1945e94e",
};

// Production's event_checkin_self_as (read Oct 22) is the same code as
// 20261019120000's with four comment lines gone: the pre-flight takes its md5
// as well, and only that one extra value.
test("the pre-flight also takes production's comment-stripped event_checkin_self_as, and nothing else extra", () => {
  assert.ok(sql.includes("'57c8df7d36e13ea5b9d3cbff0994f055'"));
  const stripped = OLD.event_checkin_self_as
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  assert.equal(md5(stripped), "57c8df7d36e13ea5b9d3cbff0994f055", "production's copy is the repo body less its comment lines");
});

test("the bodies it replaces are the ones its pre-flight names (md5 of prosrc, as on Oct 22)", () => {
  for (const [name, body] of Object.entries(OLD)) {
    const want = OLD_MD5[name as keyof typeof OLD_MD5];
    assert.equal(md5(body), want, name);
    assert.ok(sql.includes(`'${want}'`), `${name}'s old md5 is in the pre-flight`);
  }
});

test("every md5 it guards with is the md5 of the body it holds, in the pre-flight and the post-check alike", () => {
  const post = /\('public\.(\w+)\([^)]*\)',\s*'([0-9a-f]{32})',\s*'([sv])'\)/g;
  const listed = [...code.matchAll(post)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(listed.map((l) => l[0]).sort(), ["chat_create_event_card", "event_audience_ok", "event_checkin_self_as", "event_visible"]);
  for (const [name, want, volatility] of listed) {
    assert.equal(md5(here(name)), want, `${name}: edit the body and its md5 together`);
    assert.equal(code.split(`'${want}'`).length - 1, 2, `${name}'s md5 in the pre-flight (a second run) and the post-check`);
    assert.equal(volatility, name === "event_visible" || name === "event_audience_ok" ? "s" : "v", name);
  }
  assert.equal(/<NEW_|<REHEARSAL>/.test(sql), false, "no placeholder left");
});

test("the column holds validate.ts's two words, defaults to everyone, and its CHECK says the same", () => {
  assert.deepEqual([...EVENT_VISIBILITIES], ["everyone", "members"]);
  assert.ok(flat(code).includes("add column if not exists visibility text not null default 'everyone'"));
  assert.ok(flat(code).includes("add constraint events_visibility_check check (visibility in ('everyone', 'members'))"));
  assert.ok(code.includes("'CHECK ((visibility = ANY (ARRAY[''everyone''::text, ''members''::text])))'"), "the post-check reads it back");
});

test("event_visible: same signature; members-only = a member of its club or a platform admin, no RSVP arm; Everyone = the old body whole", () => {
  assert.ok(flat(code).includes("create or replace function public.event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid) returns boolean language sql stable security definer set search_path = ''"));
  const body = flat(here("event_visible"));
  const [members, everyone] = body.split(" else ");
  assert.ok(members.includes("v.visibility = 'members'"));
  assert.ok(members.includes("join public.org_members m on m.org_id = v.org_id"), "the club off the event row, never p_org_id");
  assert.ok(members.includes("u.is_platform_admin"));
  assert.equal(members.includes("rsvps"), false, "no RSVP arm for a members-only event");
  assert.equal(members.includes("p_creator_id"), false, "no creator arm either");
  // The old body's arms, word for word, are the Everyone branch.
  const oldArms = flat(OLD.event_visible).replace(/^select current_setting\('role', true\) is distinct from 'anon' and \(/, "").replace(/\);$/, "");
  assert.ok(everyone.replace(/\) end\);$/, "").replace(/^\(/, "").trim() === oldArms.trim(), "the Everyone arm is 20260928110000's body");
  assert.ok(body.startsWith("select current_setting('role', true) is distinct from 'anon' and ("), "still never anon");
});

test("event_audience_ok: anon false, a signed-in caller only about itself, members-only needs a member row", () => {
  const body = flat(here("event_audience_ok"));
  assert.ok(body.includes("when current_setting('role', true) = 'anon' then false"));
  assert.ok(body.includes("when current_setting('role', true) = 'authenticated' and p_user is distinct from (select auth.uid()) then false"));
  assert.ok(body.includes("e.visibility = 'members' and not exists (select 1 from public.org_members m where m.org_id = e.org_id and m.user_id = p_user)"));
  assert.equal(body.includes("is_platform_admin"), false, "admins see these events, they don't take part");
  assert.ok(flat(code).includes("revoke all on function public.event_audience_ok(uuid, uuid) from public"));
  assert.ok(flat(code).includes("grant execute on function public.event_audience_ok(uuid, uuid) to anon, authenticated, service_role"));
});

test("rsvps_insert_own and rsvps_update_own: their clauses kept, plus the helper; USING untouched", () => {
  const clause =
    "with check ( (auth.uid() = user_id) and (not public.is_restricted_now()) and public.rsvp_on_home_campus(event_id) " +
    "and public.event_org_visible(event_id) and public.event_audience_ok(event_id, auth.uid()) )";
  for (const policy of ["rsvps_insert_own", "rsvps_update_own"]) {
    assert.ok(flat(code).includes(`alter policy ${policy} on public.rsvps ${clause}`), policy);
  }
  assert.equal(/alter policy \w+ on public\.rsvps using/.test(flat(code)), false);
  assert.equal(/create policy|drop policy/.test(flat(code)), false, "no policy made or dropped");
});

test("event_checkin_self_as: 20261019120000's body with ONE check added (its comment amended, which runs nothing)", () => {
  const added = "if not public.event_audience_ok(p_event_id, p_user) then return 'not_found'; end if;";
  const now = flat(here("event_checkin_self_as"));
  assert.equal(now.split(added).length - 1, 1, "the check, once");
  // Take the check out again (`flat` drops the `--` notes) and the old body is back, word for word.
  assert.equal(now.replace(` ${added}`, ""), flat(OLD.event_checkin_self_as));
  // It sits after the hidden-club refusal and before anything is written.
  assert.ok(now.indexOf(added) > now.indexOf("if v_org is not null and v_hidden is not null then return 'not_found'; end if;"));
  assert.ok(now.indexOf(added) < now.indexOf("insert into public.event_checkins"));
  assert.ok(here("event_checkin_self_as").includes("A members-only\n  -- event (Oct 22, 2026) is the one exception"), "the comment says why");
});

test("chat_create_event_card: 20261001110000's body with ONE check added: a members-only event in a Board room is P0C27", () => {
  const added =
    "if exists (select 1 from public.channels c, public.events e where c.id = p_channel and c.kind = 'board' and e.id = p_event and e.visibility = 'members') " +
    "then raise exception 'chat-cards: a members-only event can''t go on the board' using errcode = 'p0c27'; end if;";
  const now = flat(here("chat_create_event_card"));
  assert.equal(now.split(added).length - 1, 1);
  assert.equal(now.replace(` ${added}`, ""), flat(OLD.chat_create_event_card));
  assert.ok(now.indexOf(added) < now.indexOf("insert into public.messages"), "before anything is written");
  // P0C27 is new: no other migration raises it.
  const others = ["20261001110000_chat_v2_cards.sql", "20261004110000_chat_room_post_policy.sql", "20261017110000_board_follower_read.sql"];
  for (const file of others) assert.equal(readRoot(`supabase/migrations/${file}`).includes("P0C27"), false, file);
});

test("the header says how to run it: pre-flight, apply, post-check, rollback, deploy order, rehearsed", () => {
  for (const part of ["PLAIN ENGLISH", "PRE-FLIGHT on PRODUCTION", "HOW TO APPLY", "DEPLOY ORDER: THIS FILE FIRST", "POST-CHECK", "ROLLBACK", "REHEARSED on the local stack"]) {
    assert.ok(sql.includes(part), part);
  }
  // The rollback warns before anyone drops the column.
  assert.ok(sql.includes("dropping the column makes every members-only event"));
  // One transaction, a lock bound, and PostgREST told.
  assert.ok(/^begin;$/m.test(sql) && /^commit;$/m.test(sql));
  assert.ok(code.includes("set local lock_timeout = '5s';"));
  assert.ok(code.includes("notify pgrst, 'reload schema';"));
});
