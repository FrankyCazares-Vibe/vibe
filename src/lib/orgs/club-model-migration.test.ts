/**
 * Drift tests for the club model's three migrations (batch 1A, Franky's
 * calls of Oct 16), read as text:
 *   20261017100000_club_model_data.sql         (first, before the push)
 *   20261017120000_member_lists_members_only.sql (second, just before the push)
 *   20261017110000_board_follower_read.sql      (last, once the new build serves)
 * (the order since the wave-3 review, findings 2 and 7).
 * Each file checks itself on the database when it is applied (a pre-flight,
 * a catalog post-check and a behaviour check that rolls itself back), and
 * the three were rehearsed on the local stack with a negative-test script.
 * These keep a later edit from quietly undoing what was checked: followers
 * read the Board and nothing else, only members type, react or vote, no
 * member names reach a non-member, and nothing revokes EXECUTE.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/club-model-migration.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

const FILES = {
  data: "supabase/migrations/20261017100000_club_model_data.sql",
  board: "supabase/migrations/20261017110000_board_follower_read.sql",
  lists: "supabase/migrations/20261017120000_member_lists_members_only.sql",
} as const;

/** What Postgres runs: the file without its `--` notes, on one line, spaces squeezed. */
function codeOf(file: string): string {
  return readRoot(file)
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const data = codeOf(FILES.data);
const board = codeOf(FILES.board);
const lists = codeOf(FILES.lists);
const dataLower = data.toLowerCase();
const boardLower = board.toLowerCase();

/** The text between two markers (the first `start`, then the first `end` after it). */
function between(text: string, start: string, end: string): string {
  const at = text.indexOf(start);
  assert.ok(at !== -1, `missing: ${start}`);
  const stop = text.indexOf(end, at + start.length);
  assert.ok(stop !== -1, `missing after ${start}: ${end}`);
  return text.slice(at, stop);
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

test("each file is one transaction that gives up rather than queueing", () => {
  for (const code of [data, board, lists]) {
    assert.ok(code.startsWith("begin; set local lock_timeout = '5s';"));
    assert.ok(code.endsWith("notify pgrst, 'reload schema'; commit;"));
  }
});

test("nothing revokes EXECUTE, nothing is dropped but a CHECK or a policy restated in place", () => {
  for (const code of [dataLower, boardLower, lists.toLowerCase()]) {
    assert.equal(/revoke\s+(execute|all)\s+on\s+function/.test(code), false);
    assert.equal(/revoke[^;]*from[^;]*\b(public|anon|authenticated|service_role)\b[^;]*;/.test(
      code
        .replace(/revoke all on table public\.org_(post_mutes|board_bars) from anon, authenticated;/g, "")
        // M3 1b: the table's SELECT, given back on five columns (pinned below).
        .replace("revoke select on public.org_members from authenticated;", ""),
    ), false);
    assert.equal(/\bdrop (table|function|trigger|column|index)\b/.test(code), false);
  }
  // The only drops: a CHECK re-added in the same statement, a policy re-made.
  assert.equal(count(dataLower, "drop constraint if exists"), 4);
  assert.equal(count(dataLower, "drop policy if exists"), 1);
});

test("each behaviour check raises its own code, used in no other file", () => {
  const own: Array<[string, string]> = [
    [data, "P0C69"],
    [board, "P0C79"],
    [lists, "P0C89"],
  ];
  for (const [code, sqlstate] of own) {
    assert.ok(code.includes(`raise exception using errcode = '${sqlstate}'`));
    assert.ok(code.includes(`exception when sqlstate '${sqlstate}' then`));
    for (const [other, otherState] of own) {
      if (otherState !== sqlstate) assert.equal(other.includes(sqlstate), false);
    }
  }
});

test("M1: the Board switch is on by default, and clubs show on profiles by default", () => {
  assert.ok(dataLower.includes("add column if not exists followers_read_board boolean not null default true"));
  assert.ok(dataLower.includes("add column if not exists show_on_profile boolean not null default true"));
  assert.ok(dataLower.includes("add column if not exists show_title boolean not null default true"));
  assert.ok(dataLower.includes("add column if not exists profile_rank smallint,"));
  assert.ok(dataLower.includes("check (profile_rank between 0 and 50)"));
  assert.ok(
    dataLower.includes(
      "add column if not exists title_set_by uuid references public.users(id) on delete set null",
    ),
  );
  assert.ok(dataLower.includes("check (title is null or title_set_at is not null)"));
});

test("M1: a title is one short line and never reads as Vibe speaking", () => {
  const check = between(data, "add constraint org_members_title_check", "drop constraint if exists org_members_title_stamped");
  assert.ok(check.includes("char_length(title) between 1 and 32"));
  assert.ok(check.includes("title = btrim(title)"));
  assert.ok(check.includes("title !~ '[[:cntrl:]]'"));
  // src/lib/profile/club-flair.ts RESERVED_TITLE_WORDS mirrors this list.
  assert.ok(check.includes("title !~* '\\m(vibe|admin|administrator|moderator|verified|official)\\M'"));
});

test("M1: your mutes are yours alone, and only the server reads or writes a bar", () => {
  assert.ok(dataLower.includes("revoke all on table public.org_post_mutes from anon, authenticated;"));
  assert.ok(dataLower.includes("grant select on table public.org_post_mutes to authenticated;"));
  assert.ok(
    dataLower.includes(
      "create policy org_post_mutes_select_own on public.org_post_mutes for select to authenticated using (user_id = (select auth.uid()));",
    ),
  );
  assert.equal(count(dataLower, "create policy"), 1);
  assert.ok(dataLower.includes("revoke all on table public.org_board_bars from anon, authenticated;"));
  assert.equal(/grant [^;]* on table public\.org_board_bars to [^;]*authenticated/.test(dataLower), false);
  assert.equal(/grant [^;]* on table public\.org_post_mutes to [^;]*anon/.test(dataLower), false);
  assert.ok(dataLower.includes("barred_by uuid references public.users(id) on delete set null"));
  assert.ok(dataLower.includes("alter table public.org_board_bars enable row level security;"));
  assert.ok(dataLower.includes("alter table public.org_post_mutes enable row level security;"));
});

test("M1: joining spends the bar, in the same transaction", () => {
  assert.ok(
    dataLower.includes(
      "create or replace trigger org_members_clear_board_bar_on_join after insert on public.org_members " +
        "for each row execute function public.org_members_clear_board_bar_on_join();",
    ),
  );
  const fn = between(dataLower, "create or replace function public.org_members_clear_board_bar_on_join()", "end $$;");
  assert.ok(fn.includes("security definer set search_path = ''"));
  assert.ok(fn.includes("delete from public.org_board_bars where org_id = new.org_id and user_id = new.user_id;"));
});

test("M1: asking to join follows the club, and leaving drops that follow like a join's", () => {
  assert.ok(
    dataLower.includes(
      "add constraint org_followers_source_check check (source in ('join', 'profile', 'discover', 'onboarding', 'request'));",
    ),
  );
  const fn = between(dataLower, "create or replace function public.org_members_unfollow_on_leave()", "end $fn$;");
  assert.ok(fn.includes("language plpgsql security definer set search_path = public"));
  assert.ok(fn.includes("and source in ('join', 'request');"));
  // The fingerprints: the old one (pre-flight, post-check) and this file's.
  assert.ok(count(data, "'02bd5adf5e312414a31d8afbafbe2b7a'") >= 2);
  assert.ok(count(data, "'e49e995fde32077ce3f88c49185f0094'") >= 2);
  assert.equal(data.includes("want_leave constant text := ''"), false);
});

/** can_view_org_channel's body as M2 writes it, and its follower arm. */
const view = between(board, "CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)", "$function$;");
const followerArm = between(view, "WHEN NOT public.is_org_member (c.org_id, uid) THEN", "WHEN c.kind = 'event' THEN");

test("M2: a follower reads the Board, and only while every condition holds", () => {
  assert.ok(view.includes("LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'"));
  // Both role guards first, as before.
  assert.ok(
    view.includes(
      "WHEN current_setting('role', true) = 'anon' THEN false WHEN current_setting('role', true) = 'authenticated' " +
        "AND uid IS DISTINCT FROM auth.uid() THEN false WHEN c.org_id IS NULL THEN false WHEN NOT public.is_org_member",
    ),
  );
  // The cheap refusals come first: no person, not a Board, a private room.
  assert.ok(
    followerArm.includes(
      "CASE WHEN uid IS NULL OR c.kind IS DISTINCT FROM 'board' OR c.is_private IS DISTINCT FROM false THEN false ELSE EXISTS",
    ),
  );
  for (const needle of [
    "FROM public.org_followers f JOIN public.orgs o ON o.id = f.org_id",
    "f.org_id = c.org_id AND f.user_id = uid",
    // A verified school email (the spec's access table; review finding 3).
    "JOIN public.users u ON u.id = f.user_id",
    "AND u.school_verified",
    "o.hidden_at IS NULL",
    "o.followers_read_board",
    "NOT EXISTS (SELECT 1 FROM public.org_board_bars bb WHERE bb.org_id = c.org_id AND bb.user_id = uid)",
    "NOT EXISTS (SELECT 1 FROM public.org_removals r WHERE r.org_id = c.org_id AND r.user_id = uid)",
    "NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocked_id = uid AND (b.blocker_id = o.owner_id",
    "m.role IN ('owner','admin','mod')",
  ]) {
    assert.ok(followerArm.includes(needle), needle);
  }
  // The arm names the Board and no other kind of room.
  for (const kind of ["'lounge'", "'officers'", "'room'", "'event'"]) {
    assert.equal(followerArm.includes(kind), false, kind);
  }
  assert.ok(boardLower.includes("grant execute on function public.can_view_org_channel(uuid, uuid) to anon, authenticated, service_role;"));
});

test("M2: only members post or reply, and the check sits before every Board arm", () => {
  const post = between(boardLower, "create or replace function public.can_post_org_channel(cid uuid, uid uuid, root uuid)", "$$;");
  const viewArm = post.indexOf("when not coalesce(public.can_view_org_channel(c.id, uid), false) then false");
  const memberArm = post.indexOf("when not coalesce(public.is_org_member(c.org_id, uid), false) then false");
  const firstBoard = post.indexOf("when c.kind = 'board'");
  assert.ok(viewArm !== -1 && memberArm !== -1 && firstBoard !== -1);
  assert.ok(viewArm < memberArm && memberArm < firstBoard);
  assert.ok(post.includes("set search_path to '' set timezone to 'utc'"));
  assert.ok(boardLower.includes("grant execute on function public.can_post_org_channel(uuid, uuid, uuid) to anon, authenticated, service_role;"));
});

test("M2: a follower's vote is refused before any option is locked", () => {
  const vote = between(boardLower, "create or replace function public.chat_cast_vote(", "end $$;");
  assert.ok(vote.includes("raise exception 'not allowed' using errcode = '42501'"));
  const noPoll = vote.indexOf("or not coalesce(public.can_view_org_channel(v_poll.channel_id, p_user), false)");
  const members = vote.indexOf("if not coalesce(public.is_org_member(v_org, p_user), false) then raise exception 'chat-cards: closed: members only' using errcode = 'p0c25';");
  const option = vote.indexOf("from public.chat_poll_options o");
  assert.ok(noPoll !== -1 && members !== -1 && option !== -1);
  assert.ok(noPoll < members && members < option);
  assert.ok(boardLower.includes("grant execute on function public.chat_cast_vote(uuid,uuid,uuid,boolean) to anon, authenticated, service_role;"));
});

test("M2: no member names to a follower: no replies, no one else's reactions, no roster", () => {
  // No message row at all for a non-member, top-level or not: every row
  // carries its author's id, and the Board's history holds members' posts
  // (review finding 1). The app serves a follower's Board with the service role.
  const messages = between(board, "alter policy messages_select_org_member on public.messages", ";");
  assert.ok(messages.includes("public.can_view_org_channel(c.id, auth.uid()) AND public.is_org_member(c.org_id, auth.uid()))"));
  assert.equal(messages.includes("thread_root_id"), false, "no follower arm on the messages policy");
  const reactRead = between(board, "alter policy message_reactions_select_member on public.message_reactions", ";");
  assert.ok(reactRead.includes("AND (public.is_org_member(c.org_id, auth.uid()) OR (message_reactions.user_id = auth.uid()))"));
  assert.ok(reactRead.includes("((c.org_id IS NULL) AND public.is_channel_member(m.channel_id))"));
  const reactAdd = between(board, "alter policy message_reactions_insert_member on public.message_reactions", "AND (NOT public.is_restricted_now()));");
  assert.ok(reactAdd.includes("public.can_view_org_channel(m.channel_id, auth.uid()) AND public.is_org_member(c.org_id, auth.uid())"));
  assert.ok(reactAdd.includes("(auth.uid() = user_id)"));
  const roster = between(boardLower, "create or replace function public.can_read_channel_roster(cid uuid)", "$$;");
  assert.ok(roster.includes("(public.can_view_org_channel(c.id, (select auth.uid())) and public.is_org_member(c.org_id, (select auth.uid())))"));
  assert.ok(boardLower.includes("grant execute on function public.can_read_channel_roster(uuid) to anon, authenticated, service_role;"));
  // Polls, votes and pins stay server-only: the pre-flight refuses otherwise.
  assert.ok(board.includes("has_table_privilege('authenticated', 'public.chat_poll_votes', 'select')"));
  // An officer never reads, through the database, the follow of someone in a
  // block pair with them (asking to join follows; review finding 2).
  const followers = between(board, "alter policy org_followers_select on public.org_followers", ";");
  assert.ok(followers.includes("(user_id = auth.uid()) OR ((public.org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (NOT public.is_blocked_either_way(auth.uid(), user_id)))"));
});

test("M2: every fingerprint is pinned, before and after", () => {
  const pairs: Array<[string, string]> = [
    ["747ee06d2e4c3e8a788129f7530ec0ae", "09cdfa379e3d374c9f0cd2924cf56357"], // can_view_org_channel
    ["ae485a1fb463cfd6f6ace3448d986fb9", "73fa24f050bb574b296b9f16e52e166c"], // can_post_org_channel
    ["0ba4681e8816cecaa5c066ee6b03bedd", "794460bb81986bd638e7c236afcdb66d"], // chat_cast_vote
    ["204c4e0128439646a760fc4dd18b99d5", "6b7a47df42508400b6ac777b71da1c3c"], // can_read_channel_roster
  ];
  for (const [before, after] of pairs) {
    // The pre-flight takes either; the post-check wants the new one and not the old.
    assert.equal(count(board, `'${before}', '${after}'`), 2, before);
  }
  for (const [before, after] of [
    ["76a5397b077c1c337d2c52febbc8f91d", "046a4e83025b53c75039933569f11b3c"], // messages_select_org_member
    ["8bb05336eab5e464b8bfd07d65a4b17f", "6fc0edb6fb1af666ade0cb8facd3be64"], // message_reactions_select_member
    ["aed6614c35b6b5c93628d894dd1c2232", "0b38d4e7775fba427d18fb7e90004f36"], // message_reactions_insert_member
    ["283d38b74e5ad6be5f58886af798f74b", "ab843a01700b34039388c85bbe582ab2"], // org_followers_select
  ]) {
    assert.ok(board.includes(`'${before}', '${after}'`), before);
    assert.ok(count(board, `'${after}'`) >= 2, after);
  }
  assert.equal(/want_md5 = '' then/.test(board) && /'(r|a)', '(q|c)', ''\)/.test(board), false);
});

test("M3: a club's member list is for its members", () => {
  assert.ok(lists.includes("alter policy org_members_select on public.org_members using (is_org_member(org_id, auth.uid()));"));
  const alter = between(lists, "alter policy org_members_select", ";");
  assert.equal(alter.includes("join_policy"), false);
  assert.equal(alter.includes("is_public"), false);
  assert.ok(count(lists, "'4870ecf3075671ac91408924be3aced1'") >= 2);
  assert.ok(count(lists, "'82dd252fe89c87c6baeb49d7b8a9429a'") >= 2);
});

test("M3 1b: members read five columns of org_members; profile choices and title stamps are the server's", () => {
  const revoke = "revoke select on public.org_members from authenticated;";
  const grant = "grant select (id, org_id, user_id, role, joined_at) on public.org_members to authenticated;";
  assert.equal(count(lists, revoke), 1);
  assert.equal(count(lists, grant), 1);
  assert.ok(lists.indexOf(revoke) < lists.indexOf(grant), "the revoke takes every column's grant with it, so it goes first");
  assert.ok(lists.indexOf(grant) < lists.indexOf("member-lists: post-check ok"), "the change is made before the post-checks");
  for (const column of ["show_on_profile", "show_title", "profile_rank", "title", "title_set_by", "title_set_at"]) {
    assert.equal(new RegExp(`grant select \\([^)]*\\b${column}\\b`).test(lists), false, `${column} is granted`);
  }
  assert.ok(lists.includes("'id,org_id,user_id,role,joined_at'"), "the post-check pins the five columns");
  assert.ok(lists.includes("want constant text := 'five=ok;show_on_profile=refused;title_set_by=refused;';"));
  // No other file grants a column of org_members back.
  for (const code of [data, board]) assert.equal(/grant select[^;]*on public\.org_members/.test(code.toLowerCase()), false);
});
