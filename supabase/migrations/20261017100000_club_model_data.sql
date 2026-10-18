-- ---------------------------------------------------------------------------
-- 20261017100000_club_model_data.sql
--
-- APPLY BEFORE THE DEPLOY (M1 of the club model, batch 1A). It only ADDS: new
-- columns with defaults, two new tables, one new trigger, a fifth allowed
-- value, and one trigger function that now also drops a follow made by a
-- request. Today's code never names any of it, so the app runs the same with
-- or without this file. Then 20261017120000 (M3, member lists for members),
-- just before the push; 20261017110000 (M2, the Board for followers) needs
-- this file and goes in after the push, once the new build serves (the order
-- since the wave-3 review, findings 2 and 7).
--
-- PLAIN ENGLISH
-- Franky's calls of Oct 16 for clubs, the data half:
--   * A club can let its followers read its Announcement Board (M2 does the
--     reading). One switch on the club, on unless officers turn it off:
--     orgs.followers_read_board.
--   * Removing a follower bars them from reading the Board until they join:
--     public.org_board_bars, written by the server only, cleared by a trigger
--     the moment they become a member. They are not told.
--   * Your clubs show on your profile unless you hide one:
--     org_members.show_on_profile, default ON, one club at a time. Officers can
--     give a member a title ("President"), the member can hide it, and the
--     list can be put in an order. "Member since" is joined_at, which exists.
--   * Mute a club's posts and stay in its chats: public.org_post_mutes, your
--     own rows only, readable by you and nobody else (not by the club).
--   * Asking to join follows the club: org_followers.source gains 'request',
--     and leaving drops a 'request' follow the way it drops a 'join' one.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: the tables it leans on are there; the
--      leave trigger's function reads as 20260916120000 left it (or as this
--      file leaves it: a second run); org_followers_source_check allows the
--      four values or the five; no follow row holds a sixth; the browser's
--      roles cannot INSERT or UPDATE orgs or org_members, on the table or on
--      any column (so only the server can write the new columns); the two new
--      tables are absent or exactly as this file makes them; org_members has
--      the five known triggers (six on a second run).
--   1. orgs.followers_read_board boolean not null default true.
--   2. org_members: show_on_profile (not null, default true), show_title (not
--      null, default true), profile_rank (0 to 50, or null), title (1 to 32
--      characters, trimmed, no control characters, not one of the reserved
--      words), title_set_by (users, on delete set null), title_set_at; a CHECK
--      that a title always carries its stamp; an index for title_set_by.
--   3. public.org_post_mutes (user_id, org_id, created_at): RLS on, everything
--      revoked from anon and authenticated, then SELECT back to authenticated
--      under one policy, own rows only. The server writes it.
--   4. public.org_board_bars (org_id, user_id, barred_by, barred_at): RLS on,
--      no policy, nothing for anon or authenticated: the server only, like
--      org_removals (20260928100000:240-256). The trigger
--      org_members_clear_board_bar_on_join (AFTER INSERT on org_members)
--      deletes the bar when they join.
--   5. org_followers_source_check allows 'request'; the column comment says
--      what it is; org_members_unfollow_on_leave deletes source in ('join',
--      'request').
--   6. POST-CHECK by catalog: every column, constraint, grant, policy and
--      trigger as written; the restated function's md5 is the one pinned here.
--   7. POST-CHECK BY BEHAVIOUR in a block that raises P0C69 (this file's own
--      code) and so rolls itself back: in the oldest club that has an owner,
--      with a person who is in it in no way, a 'request' follow survives the
--      join and goes with the leave, a 'profile' follow stays, a bar goes on
--      joining, an unknown source and every bad title are refused (23514),
--      a mute is written and a second one is a duplicate (23505). SKIPPED,
--      and recorded, when there is no such club or person.
--   8. The APPLY RECORD in the comment of org_board_bars; notify pgrst.
--
-- DOES NOT: let anyone read the Board (M2); change who reads org_members (M3,
-- right after this file and before the push: until then the new columns are
-- readable wherever a membership row is, see PRE-CHECK 5; nothing writes them
-- before the push); write a follow, a bar or a mute (the
-- routes do, with the service role); grant anon anything; revoke EXECUTE on
-- any function (the standing rule, 20260922090000:47-50: on this image a
-- refused function call crashes the backend; a trigger function keeps its
-- default EXECUTE, which is harmless, as org_members_clear_removal_on_join
-- does); touch org_members_imply_follow (on conflict do nothing already
-- keeps a 'request' follow's source when the request is approved).
--
-- THE TITLE WORDS. Refused anywhere in a title, as whole words, any case:
-- vibe, admin, administrator, moderator, verified, official (review #32: a
-- title reads on the member's public profile and must not look like Vibe's
-- own badge). The route's check mirrors this list; this CHECK is the backstop.
--
-- LIVE STATE (read on the LOCAL stack, PostgreSQL 17.6, Oct 16, 2026; newest
-- recorded schema_migrations row 20261008140000, the files after it applied
-- by hand and not recorded). Production is read with PRE-CHECK below.
--   * org_members (id, org_id, user_id, role, joined_at); triggers
--     chat_org_members_rooms, org_members_clear_removal_on_join,
--     org_members_drop_club_access, org_members_imply_follow,
--     org_members_unfollow_on_leave; authenticated=rdDxtm, no column grants.
--   * orgs: authenticated=rDxtm, no column grants: no UPDATE for anyone but
--     the service role.
--   * org_followers_source_check CHECK ((source = ANY (ARRAY['join'::text,
--     'profile'::text, 'discover'::text, 'onboarding'::text]))).
--   * md5(pg_get_functiondef) of org_members_unfollow_on_leave():
--     02bd5adf5e312414a31d8afbafbe2b7a before this file; after it, see
--     want_leave in step 6 (the next file that restates it checks against it).
--   * New tables get arwdDxtm for anon and authenticated by default
--     (pg_default_acl): steps 3 and 4 take it back.
--
-- SAFE TO RUN AGAIN: add column if not exists, create table if not exists,
-- each CHECK dropped and added in one statement, create or replace for the
-- function and the trigger, drop policy if exists before create policy. A
-- second run leaves the database as the first did (rehearsed, see the end).
--
-- LOCK. ALTER TABLE takes ACCESS EXCLUSIVE on orgs, org_members and
-- org_followers until COMMIT (each CHECK is validated by one scan of a small
-- table); CREATE TRIGGER takes SHARE ROW EXCLUSIVE on org_members. Every
-- club page and chat read waits those milliseconds. A quiet hour;
-- lock_timeout 5s makes the file fail whole instead of queueing; run it again.
--
-- PRE-CHECK (read-only, on production, before applying; counts and catalog
-- only, never a person's row). Expected answers in brackets.
--   1. Not applied yet, or applied by this file [f | f | f | 0 or 1 | 0 or 1]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.orgs'::regclass
--                     and attname = 'followers_read_board' and not attisdropped),
--            to_regclass('public.org_post_mutes') is not null,
--            to_regclass('public.org_board_bars') is not null,
--            (select count(*) from pg_trigger where tgname = 'org_members_clear_board_bar_on_join'),
--            (select count(*) from pg_constraint where conname = 'org_members_title_check');
--   2. The leave trigger's fingerprint [02bd5adf5e312414a31d8afbafbe2b7a]:
--     select md5(pg_get_functiondef('public.org_members_unfollow_on_leave()'::regprocedure));
--      Another value: do NOT apply; read it, carry its change into step 5.
--   3. The source CHECK and the values in use [the four values | 0]:
--     select pg_get_constraintdef(oid) from pg_constraint where conname = 'org_followers_source_check';
--     select count(*) from public.org_followers
--      where source not in ('join', 'profile', 'discover', 'onboarding', 'request');
--   4. Only the server writes orgs and org_members [four rows of f]:
--     select r, has_any_column_privilege(r, 'public.orgs', 'update'),
--            has_any_column_privilege(r, 'public.org_members', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--   5. Review #14: until M3 (applied next, before the push), a signed-in
--      person reads the membership rows of a club that is public, open to
--      anyone and not hidden, new columns included. How many such clubs
--      [likely 0]:
--     select count(*) from public.orgs
--      where is_public and join_policy = 'open' and hidden_at is null;
--   6. org_members' triggers [the five names in LIVE STATE]:
--     select string_agg(tgname, ', ' order by tgname collate "C") from pg_trigger
--      where tgrelid = 'public.org_members'::regclass and not tgisinternal;
--
-- HOW TO APPLY. Locally, through the unix socket:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261017100000_club_model_data.sql
-- On production only the main session applies it, after Franky says yes,
-- with the connector's apply_migration (the body without begin/commit), then
-- renames the connector's row to this file's version, or by hand:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261017100000', 'club_model_data') ON CONFLICT (version) DO NOTHING;
-- Then 20261017120000 (M3), then the push; 20261017110000 (M2) once the new
-- build serves. Never `supabase db push`.
--
-- CHECK AFTER APPLYING (read-only):
--   1. The APPLY RECORD:
--     select obj_description('public.org_board_bars'::regclass, 'pg_class');
--   2. PRE-CHECK 1 reads [t | t | t | 1 | 1]; PRE-CHECK 2 reads want_leave.
--   3. src/lib/orgs/club-model-migration.test.ts passes (npm test).
--
-- ROLLBACK (one transaction; only with 20261017110000 rolled back first, its
-- can_view_org_channel names followers_read_board and org_board_bars, and
-- with no code live that writes the new columns or tables). It deletes every
-- mute, bar, title, rank and hidden-club choice: read the counts first.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- 20260916120000:826-834, character for character (md5 02bd5adf...):
--   create or replace function public.org_members_unfollow_on_leave() returns trigger
--   language plpgsql security definer set search_path = public as $fn$
--   begin
--     delete from public.org_followers
--      where org_id  = old.org_id
--        and user_id = old.user_id
--        and source  = 'join';
--     return old;                                  -- ignored: AFTER ROW trigger
--   end $fn$;
--   -- and the two comments as that file wrote them: 20260916120000:683-684
--   -- (org_followers.source) and :836-837 (the function), run as they are.
--   update public.org_followers set source = 'profile' where source = 'request';
--   alter table public.org_followers drop constraint org_followers_source_check,
--     add constraint org_followers_source_check
--     check (source in ('join','profile','discover','onboarding'));
--   drop trigger org_members_clear_board_bar_on_join on public.org_members;
--   drop function public.org_members_clear_board_bar_on_join();
--   drop table public.org_board_bars;
--   drop table public.org_post_mutes;
--   alter table public.org_members
--     drop column show_on_profile, drop column show_title, drop column profile_rank,
--     drop column title, drop column title_set_by, drop column title_set_at;
--   alter table public.orgs drop column followers_read_board;
--   delete from supabase_migrations.schema_migrations where version = '20261017100000';
--   notify pgrst, 'reload schema';
--   COMMIT;
--  ('request' follows become 'profile' follows: they survive a later leave,
--   which is what a deliberate follow does. Dropping the columns drops their
--   CHECKs and the index with them.)
-- REHEARSED on the local stack on Oct 16, 2026: applied three times in a row
-- (each run: pre-flight ok, post-check ok, behaviour check passed); then the
-- ROLLBACK above, taken out of this header with
--   sed -n '/^--   BEGIN;$/,/^--   COMMIT;$/p' <this file> | sed -E 's/^--( {3})?//'
-- after the rollbacks of 20261017120000 and 20261017110000: the leave
-- trigger's md5 read 02bd5adf... again, the CHECK the four values, no new
-- column, table, function or trigger left. Then applied again with the other
-- two, and the batch 1A negative-test script passed (66 cases), as did
-- chat-v2-rooms-check (200), chat-v2-cards-check (181) and
-- chat-message-pins-check (43). That script is in the repo since the wave-1
-- repair, as scripts/sql/club-model-check.sql (76 cases on Oct 18, with
-- 20261017110000 as repaired: a follower is let into the Board and reads no
-- row of it). Not recorded in schema_migrations locally
-- (the local table stops at 20261008140000; the files since were applied by
-- hand the same way).
-- ---------------------------------------------------------------------------

begin;

-- The header's LOCK note: give up rather than queue.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  -- md5(pg_get_functiondef) of the leave trigger's function as
  -- 20260916120000 left it (read Oct 16, 2026), and as this file leaves it
  -- (step 6's want_leave: a second run finds that one).
  old_leave constant text := '02bd5adf5e312414a31d8afbafbe2b7a';
  new_leave constant text := 'e49e995fde32077ce3f88c49185f0094';
  got   text;
  r     text;
  n     bigint;
begin
  -- a. What this file leans on.
  if to_regclass('public.orgs') is null or to_regclass('public.org_members') is null
     or to_regclass('public.org_followers') is null or to_regclass('public.users') is null
     or to_regclass('public.org_removals') is null then
    raise exception 'club-model-data: orgs, org_members, org_followers, users or org_removals is missing';
  end if;

  -- b. The leave trigger's function reads as its file left it, or as this
  --    file leaves it. Anything else: someone changed it; read it first.
  select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
   where p.oid = to_regprocedure('public.org_members_unfollow_on_leave()');
  if got is null then
    raise exception 'club-model-data: org_members_unfollow_on_leave() is missing';
  elsif got <> old_leave and got is distinct from nullif(new_leave, '') then
    raise exception 'club-model-data: org_members_unfollow_on_leave drifted (md5 %, expected %); re-read it first', got, old_leave;
  end if;

  -- c. The source CHECK allows the four values of 20260916120000 or the five
  --    of this file, and no follow row holds anything else.
  select pg_get_constraintdef(c.oid) into got from pg_constraint c
   where c.conrelid = 'public.org_followers'::regclass and c.conname = 'org_followers_source_check';
  if got is distinct from 'CHECK ((source = ANY (ARRAY[''join''::text, ''profile''::text, ''discover''::text, ''onboarding''::text])))'
     and got is distinct from 'CHECK ((source = ANY (ARRAY[''join''::text, ''profile''::text, ''discover''::text, ''onboarding''::text, ''request''::text])))' then
    raise exception 'club-model-data: org_followers_source_check reads "%"; re-read it first', coalesce(got, '(missing)');
  end if;
  select count(*) into n from public.org_followers f
   where f.source not in ('join', 'profile', 'discover', 'onboarding', 'request');
  if n <> 0 then
    raise exception 'club-model-data: % follow rows hold a source this file does not know', n;
  end if;

  -- d. Only the service role writes orgs and org_members: then nobody else
  --    can set a switch, a title or a rank. (A column grant does not show in
  --    relacl; has_any_column_privilege sees both.)
  foreach r in array array['anon', 'authenticated'] loop
    if has_any_column_privilege(r, 'public.orgs', 'insert')
       or has_any_column_privilege(r, 'public.orgs', 'update')
       or has_any_column_privilege(r, 'public.org_members', 'insert')
       or has_any_column_privilege(r, 'public.org_members', 'update') then
      raise exception 'club-model-data: % may insert or update orgs or org_members; the new columns would be theirs to set. Tell Franky first', r;
    end if;
  end loop;

  -- e. The two new tables: absent, or exactly this file's columns.
  select string_agg(a.attname, ',' order by a.attnum) into got from pg_attribute a
   where a.attrelid = to_regclass('public.org_post_mutes') and a.attnum > 0 and not a.attisdropped;
  if got is not null and got <> 'user_id,org_id,created_at' then
    raise exception 'club-model-data: public.org_post_mutes exists with other columns (%)', got;
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into got from pg_attribute a
   where a.attrelid = to_regclass('public.org_board_bars') and a.attnum > 0 and not a.attisdropped;
  if got is not null and got <> 'org_id,user_id,barred_by,barred_at' then
    raise exception 'club-model-data: public.org_board_bars exists with other columns (%)', got;
  end if;

  -- f. org_members' triggers: the five known ones, plus this file's on a
  --    second run. Another one: read what it does on an insert or a delete
  --    first (step 7 inserts and deletes a membership, rolled back).
  select string_agg(t.tgname, ', ' order by t.tgname collate "C") into got from pg_trigger t
   where t.tgrelid = 'public.org_members'::regclass and not t.tgisinternal
     and t.tgname <> 'org_members_clear_board_bar_on_join';
  if got is distinct from 'chat_org_members_rooms, org_members_clear_removal_on_join, org_members_drop_club_access, org_members_imply_follow, org_members_unfollow_on_leave' then
    raise exception 'club-model-data: org_members has other triggers than known (%); read them first', coalesce(got, '(none)');
  end if;
  raise notice 'club-model-data: pre-flight ok';
end $$;

-- 1. The club's switch ---------------------------------------------------------
-- Franky, Oct 16: followers (signed in, following the club) read its
-- Announcement Board unless officers turn it off. A constant default: no
-- rewrite, every club reads true at once. Hidden clubs never: M2 checks
-- hidden_at beside this column, so the switch needs no CHECK of its own.
alter table public.orgs
  add column if not exists followers_read_board boolean not null default true;
comment on column public.orgs.followers_read_board is
  'May the club''s followers read its Announcement Board (kind board)? Default true; officers turn it off through the club settings route (service role: nobody else may update orgs). A hidden club''s Board is never readable by followers whatever this says (can_view_org_channel, 20261017110000). Only the Board: never the Lounge, the Officers room, an extra room or an event chat.';

-- 2. Clubs on your profile, titles ----------------------------------------------
-- On the membership row, so leaving or being removed wipes them for free.
-- None of the membership triggers fire on these columns: chat_org_members_rooms
-- fires on INSERT or UPDATE OF role only, the others on INSERT or DELETE.
-- Each CHECK is dropped and added in the same statement (a second run), and
-- validated by one scan of org_members.
alter table public.org_members
  add column if not exists show_on_profile boolean not null default true,
  add column if not exists show_title      boolean not null default true,
  add column if not exists profile_rank    smallint,
  add column if not exists title           text,
  add column if not exists title_set_by    uuid references public.users(id) on delete set null,
  add column if not exists title_set_at    timestamptz;

alter table public.org_members
  drop constraint if exists org_members_profile_rank_check,
  add constraint org_members_profile_rank_check
    check (profile_rank between 0 and 50),
  drop constraint if exists org_members_title_check,
  add constraint org_members_title_check
    check (title is null or (
      char_length(title) between 1 and 32
      and title = btrim(title)
      and title !~ '[[:cntrl:]]'
      and title !~* '\m(vibe|admin|administrator|moderator|verified|official)\M'
    )),
  drop constraint if exists org_members_title_stamped,
  add constraint org_members_title_stamped
    check (title is null or title_set_at is not null);

-- Deleting an account sets title_set_by to null on the rows it titled: this
-- index keeps that from scanning org_members.
create index if not exists org_members_title_set_by_idx
  on public.org_members (title_set_by) where title_set_by is not null;

comment on column public.org_members.show_on_profile is
  'Does this club show on the member''s public profile (flair and the Clubs section)? Default true (Franky, Oct 16: clubs show by default, each member hides them one by one). The member changes it through PATCH /api/me/clubs/[orgId] (service role). A hidden club (orgs.hidden_at) never shows, whatever this says.';
comment on column public.org_members.show_title is
  'The member''s own switch for the title an officer gave them (review #32): false keeps title off their profile. The title stays in the club''s member list.';
comment on column public.org_members.profile_rank is
  'The member''s order for their shown clubs, 0 first; null sorts last, then joined_at.';
comment on column public.org_members.title is
  'A title an owner or admin gave this member ("President"), 1 to 32 characters, trimmed, no control characters, never the words vibe, admin, administrator, moderator, verified or official. Written by PATCH /api/orgs/[slug]/members/[userId] (service role) with title_set_by and title_set_at. Not a role: the role column still decides what the member may do.';
comment on column public.org_members.title_set_by is
  'Who set or last cleared the title (null once that account is deleted).';
comment on column public.org_members.title_set_at is
  'When the title was set or last cleared. A title always has one (org_members_title_stamped).';

-- 3. Mute a club's posts -------------------------------------------------------
-- Not a column on org_followers: a club's owner and admins read those rows
-- (20260916120000:726-731) and would see who muted them. Here only the
-- person reads their own rows; the club is never told. The feed is the only
-- reader (club posts send no notifications); chats do not change.
create table if not exists public.org_post_mutes (
  user_id    uuid not null references public.users(id) on delete cascade,
  org_id     uuid not null references public.orgs(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- The primary key serves "my mutes"; this one serves the cascade when a club
-- is deleted.
create index if not exists org_post_mutes_org_id_idx on public.org_post_mutes (org_id);

comment on table public.org_post_mutes is
  'A person muted a club''s posts: the feed leaves them out (and the club''s off-campus reach and boost). Members stay in every chat. Read: the person''s own rows only (policy org_post_mutes_select_own). Written by POST and DELETE /api/orgs/[slug]/mute with the service role; nobody else holds a write grant. Never shown to the club.';

alter table public.org_post_mutes enable row level security;
-- pg_default_acl gives every new table arwdDxtm to anon and authenticated:
-- take it all back, then give authenticated SELECT alone (review #21).
revoke all on table public.org_post_mutes from anon, authenticated;
grant select on table public.org_post_mutes to authenticated;
grant select, insert, update, delete on table public.org_post_mutes to service_role;

drop policy if exists org_post_mutes_select_own on public.org_post_mutes;
create policy org_post_mutes_select_own on public.org_post_mutes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4. A follower barred from the Board -------------------------------------------
-- Franky, Oct 16 (spec H2(a)): an officer removing a follower also bars them
-- from reading the Board until they join. Following itself is left alone
-- (they may follow again) and they are not told. Server only, like
-- org_removals: RLS on, no policy, no grant for anon or authenticated.
-- can_view_org_channel (20261017110000) reads it as its owner.
create table if not exists public.org_board_bars (
  org_id    uuid not null references public.orgs(id)  on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  barred_by uuid          references public.users(id) on delete set null,
  barred_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- The users cascade, and "where am I barred", go by user_id.
create index if not exists org_board_bars_user_id_idx on public.org_board_bars (user_id);

alter table public.org_board_bars enable row level security;
revoke all on table public.org_board_bars from anon, authenticated;
grant select, insert, update, delete on table public.org_board_bars to service_role;

-- Joining spends the bar, in the same transaction as the membership insert,
-- so no route can forget it (the pattern of org_members_clear_removal_on_join,
-- 20260928100000:326-345). No grant and no revoke: a trigger function cannot
-- be called over the API, and the standing rule forbids REVOKE EXECUTE.
create or replace function public.org_members_clear_board_bar_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.org_board_bars
   where org_id = new.org_id and user_id = new.user_id;
  return new;                                  -- ignored: AFTER ROW trigger
end $$;

comment on function public.org_members_clear_board_bar_on_join() is
  'AFTER INSERT on org_members (20261017100000): a member is not barred from the Board. Joining (an open club, an approved request, an accepted invite) deletes the org_board_bars row in the same transaction.';

create or replace trigger org_members_clear_board_bar_on_join
  after insert on public.org_members
  for each row execute function public.org_members_clear_board_bar_on_join();

-- 5. Asking to join follows the club -----------------------------------------------
-- Review #8: a follow made by a request is its own source, not 'join'. With
-- 'join' a turned-down requester would drop out of "Invite followers"
-- (invite-candidates drops 'join') and out of the usage count of follows
-- (admin_usage_summary counts source <> 'join'). The join route writes it
-- with the service role (insert, on conflict do nothing: a follow the
-- student tapped first keeps its source). Same constraint name, so a writer
-- bug still maps by name.
alter table public.org_followers
  drop constraint if exists org_followers_source_check,
  add constraint org_followers_source_check
    check (source in ('join', 'profile', 'discover', 'onboarding', 'request'));

comment on column public.org_followers.source is
  'Which surface the follow came from: profile = the club page, discover = the campus Orgs tab, onboarding = step 5, join = the membership trigger, request = asking to join (the join route, 20261017100000). join and request are follows the student did not tap Follow for: leaving the club (or being removed) deletes them (org_members_unfollow_on_leave); the others survive. A turned-down request keeps its follow. NAMED CHECK so a writer bug maps by constraint name; routes validate a client value in TypeScript and fall back to profile.';

-- 20260916120000:826-834 with ONE change: source = 'join' became
-- source in ('join', 'request'). Same language, SECURITY DEFINER and
-- search_path; create or replace keeps the owner, the ACL and the trigger.
create or replace function public.org_members_unfollow_on_leave() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.org_followers
   where org_id  = old.org_id
     and user_id = old.user_id
     and source  in ('join', 'request');
  return old;                                  -- ignored: AFTER ROW trigger
end $fn$;

comment on function public.org_members_unfollow_on_leave() is
  'AFTER DELETE on org_members: drops the follow row ONLY when the student never tapped Follow for it: source join (the membership trigger made it) or request (asking to join made it, 20261017100000). A follow the student tapped (profile, discover, onboarding) survives leaving. A DELETE trigger cannot tell leaving from being removed, so a removal drops the same follows. Cannot fail a leave: a DELETE matching no row is a no-op.';

-- 6. POST-CHECK by catalog (same transaction): any miss aborts the whole file ----
do $$
declare
  -- md5(pg_get_functiondef) of the leave trigger's function as this file
  -- leaves it, copied from the catalog after the first local apply (Oct 16,
  -- 2026), never typed by hand. Empty = print it and stop. The next file
  -- that restates the function writes its PRE-FLIGHT against this.
  want_leave constant text := 'e49e995fde32077ce3f88c49185f0094';
  old_leave  constant text := '02bd5adf5e312414a31d8afbafbe2b7a';
  got  text;
  r    text;
  p    text;
  bad  text := '';
begin
  -- a. The columns, as written.
  select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                    ' | ' order by (a.attrelid <> 'public.orgs'::regclass), a.attnum)
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where (a.attrelid = 'public.orgs'::regclass and a.attname = 'followers_read_board')
      or (a.attrelid = 'public.org_members'::regclass and a.attname in
          ('show_on_profile', 'show_title', 'profile_rank', 'title', 'title_set_by', 'title_set_at'));
  if got is distinct from 'followers_read_board boolean not null default true | show_on_profile boolean not null default true'
     || ' | show_title boolean not null default true | profile_rank smallint | title text | title_set_by uuid'
     || ' | title_set_at timestamp with time zone' then
    bad := bad || format(' the columns read "%s";', coalesce(got, '(missing)'));
  end if;

  -- b. The CHECKs, validated and reading as written.
  select string_agg(c.conname || ' ' || pg_get_constraintdef(c.oid), ' | ' order by c.conname collate "C")
    into got from pg_constraint c
   where c.contype = 'c' and c.convalidated
     and ((c.conrelid = 'public.org_members'::regclass
           and c.conname in ('org_members_profile_rank_check', 'org_members_title_check', 'org_members_title_stamped'))
       or (c.conrelid = 'public.org_followers'::regclass and c.conname = 'org_followers_source_check'));
  if got is distinct from
       'org_followers_source_check CHECK ((source = ANY (ARRAY[''join''::text, ''profile''::text, ''discover''::text, ''onboarding''::text, ''request''::text])))'
    || ' | org_members_profile_rank_check CHECK (((profile_rank >= 0) AND (profile_rank <= 50)))'
    || ' | org_members_title_check CHECK (((title IS NULL) OR (((char_length(title) >= 1) AND (char_length(title) <= 32)) AND (title = btrim(title)) AND (title !~ ''[[:cntrl:]]''::text) AND (title !~* ''\m(vibe|admin|administrator|moderator|verified|official)\M''::text))))'
    || ' | org_members_title_stamped CHECK (((title IS NULL) OR (title_set_at IS NOT NULL)))' then
    bad := bad || format(' the CHECKs read "%s";', coalesce(got, '(missing)'));
  end if;

  -- c. The foreign keys and what a delete does to them (c cascade, n set null).
  select string_agg(x.fk, ' ' order by x.fk collate "C") into got
    from (select format('%s.%s=%s', c.conrelid::regclass, a.attname, c.confdeltype) as fk
            from pg_constraint c
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           where c.contype = 'f'
             and (c.conrelid in ('public.org_post_mutes'::regclass, 'public.org_board_bars'::regclass)
                  or (c.conrelid = 'public.org_members'::regclass and a.attname = 'title_set_by'))) x;
  if got is distinct from 'org_board_bars.barred_by=n org_board_bars.org_id=c org_board_bars.user_id=c'
     || ' org_members.title_set_by=n org_post_mutes.org_id=c org_post_mutes.user_id=c' then
    bad := bad || format(' the foreign keys read "%s";', coalesce(got, '(missing)'));
  end if;

  -- d. Who may touch the two tables. org_post_mutes: authenticated reads
  --    (under the policy) and nothing else; org_board_bars: nobody but the
  --    service role. anon: nothing on either. The service role reads and
  --    writes both (it keeps the rest of the default grant, like org_removals).
  --    RLS on for both.
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege(r, 'public.org_post_mutes', p) is distinct from (r = 'authenticated' and p = 'select') then
        bad := bad || format(' %s %s on org_post_mutes is wrong;', r, p);
      end if;
      if has_table_privilege(r, 'public.org_board_bars', p) then
        bad := bad || format(' %s may %s on org_board_bars;', r, p);
      end if;
    end loop;
  end loop;
  foreach p in array array['select', 'insert', 'update', 'delete'] loop
    if not (has_table_privilege('service_role', 'public.org_post_mutes', p)
            and has_table_privilege('service_role', 'public.org_board_bars', p)) then
      bad := bad || format(' service_role may not %s a new table;', p);
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.org_post_mutes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.org_board_bars'::regclass) then
    bad := bad || ' RLS is off on a new table;';
  end if;

  -- e. The policies: one on org_post_mutes, own rows, SELECT, authenticated;
  --    none on org_board_bars.
  select string_agg(format('%s %s %s %s', pol.polname, pol.polcmd, pol.polroles::regrole[]::text,
                           pg_get_expr(pol.polqual, pol.polrelid)), ' | ')
    into got from pg_policy pol where pol.polrelid = 'public.org_post_mutes'::regclass;
  if got is distinct from 'org_post_mutes_select_own r {authenticated} (user_id = ( SELECT auth.uid() AS uid))' then
    bad := bad || format(' the policies on org_post_mutes read "%s";', coalesce(got, '(none)'));
  end if;
  if exists (select 1 from pg_policy pol where pol.polrelid = 'public.org_board_bars'::regclass) then
    bad := bad || ' org_board_bars has a policy;';
  end if;

  -- f. The trigger: AFTER INSERT, each row, on org_members, enabled; its
  --    function SECURITY DEFINER with an empty search_path.
  select pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text into got from pg_trigger t
   where t.tgrelid = 'public.org_members'::regclass and t.tgname = 'org_members_clear_board_bar_on_join';
  if got is distinct from 'CREATE TRIGGER org_members_clear_board_bar_on_join AFTER INSERT ON public.org_members FOR EACH ROW EXECUTE FUNCTION org_members_clear_board_bar_on_join() O' then
    bad := bad || format(' the trigger reads "%s";', coalesce(got, '(missing)'));
  end if;
  if not exists (select 1 from pg_proc f
                  where f.oid = to_regprocedure('public.org_members_clear_board_bar_on_join()')
                    and f.prosecdef and f.proconfig = array['search_path=""']) then
    bad := bad || ' org_members_clear_board_bar_on_join is not SECURITY DEFINER with an empty search_path;';
  end if;

  -- g. The leave trigger's function: as written, not as it was, its
  --    attributes and its trigger unchanged.
  select md5(pg_get_functiondef(f.oid)) into got from pg_proc f
   where f.oid = to_regprocedure('public.org_members_unfollow_on_leave()');
  if want_leave = '' then
    raise notice 'club-model-data: md5 org_members_unfollow_on_leave = %', got;
    raise exception 'club-model-data: function fingerprints are empty';
  end if;
  if got is distinct from want_leave or got = old_leave then
    bad := bad || format(' org_members_unfollow_on_leave does not read as written (md5 %s);', got);
  end if;
  if not exists (select 1 from pg_proc f
                  where f.oid = to_regprocedure('public.org_members_unfollow_on_leave()')
                    and f.prosecdef and f.proconfig = array['search_path=public']) then
    bad := bad || ' org_members_unfollow_on_leave lost SECURITY DEFINER or its search_path;';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.org_members'::regclass and t.tgname = 'org_members_unfollow_on_leave'
                    and t.tgenabled = 'O') then
    bad := bad || ' the trigger org_members_unfollow_on_leave is missing or disabled;';
  end if;

  if bad <> '' then
    raise exception 'club-model-data: post-check failed:%', bad;
  end if;
  raise notice 'club-model-data: post-check ok';
end $$;

-- 7. POST-CHECK BY BEHAVIOUR (rolls itself back) -----------------------------------
-- As the file's role (postgres), the way the routes write (service role: no
-- policy in the way). The CLUB is real: the oldest one that is not hidden
-- and has an owner. The PERSON is real: the oldest account that is in that
-- club in no way (no membership, follow, bar, removal or mute). The block
-- joins them, leaves, follows, is barred, gets titles and a mute; every row
-- it makes, and what the membership triggers do (chat rows, the join
-- follow), goes when the inner block raises P0C69 (this file's own code).
-- Nothing about the person leaves the block but pass or fail. Any OTHER
-- error leaves the block and aborts the whole file.
do $$
declare
  v_org   uuid;
  v_owner uuid;
  v_out   uuid;
  v_con   text;
  got     text;
  n       bigint;
  res     text := '';
  want    text;
  state   text;
  i       integer;
  bad_titles constant text[] := array[
    'spaces',   ' President',
    'long',     repeat('x', 33),
    'reserved', 'Club Admin',
    'control',  'Pres' || chr(10) || 'ident'];
begin
  select o.id into v_org from public.orgs o
   where o.hidden_at is null
     and exists (select 1 from public.org_members m where m.org_id = o.id and m.role = 'owner')
   order by o.created_at, o.id limit 1;
  select m.user_id into v_owner from public.org_members m
   where m.org_id = v_org and m.role = 'owner' order by m.joined_at, m.user_id limit 1;
  select u.id into v_out from public.users u
   where not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u.id)
     and not exists (select 1 from public.org_followers f where f.org_id = v_org and f.user_id = u.id)
     and not exists (select 1 from public.org_board_bars b where b.org_id = v_org and b.user_id = u.id)
     and not exists (select 1 from public.org_removals r where r.org_id = v_org and r.user_id = u.id)
     and not exists (select 1 from public.org_post_mutes x where x.org_id = v_org and x.user_id = u.id)
   order by u.created_at, u.id limit 1;
  if v_org is null or v_out is null then
    perform set_config('club_model_data.probe',
      'behaviour check SKIPPED: no club that is not hidden and has an owner, or nobody outside it', true);
    raise notice 'club-model-data: behaviour check SKIPPED';
    return;
  end if;

  want := 'request:joined=request,left=0;profile:left=profile;bar:joined=0;'
       || 'source=23514 org_followers_source_check;'
       || 'spaces=23514 org_members_title_check;long=23514 org_members_title_check;'
       || 'reserved=23514 org_members_title_check;control=23514 org_members_title_check;'
       || 'unstamped=23514 org_members_title_stamped;titled=1;rank=23514 org_members_profile_rank_check;'
       || 'shown=true,title_shown=true;mute=1;again=23505;';

  begin
    -- a. A follow made by asking to join: kept through the join (the join
    --    trigger's on conflict leaves its source), gone with the leave.
    insert into public.org_followers (org_id, user_id, source) values (v_org, v_out, 'request');
    insert into public.org_members (org_id, user_id, role) values (v_org, v_out, 'member');
    select f.source into got from public.org_followers f where f.org_id = v_org and f.user_id = v_out;
    delete from public.org_members m where m.org_id = v_org and m.user_id = v_out;
    select count(*) into n from public.org_followers f where f.org_id = v_org and f.user_id = v_out;
    res := res || format('request:joined=%s,left=%s;', coalesce(got, '(none)'), n);

    -- b. A follow the student tapped survives the leave.
    insert into public.org_followers (org_id, user_id, source) values (v_org, v_out, 'profile');
    insert into public.org_members (org_id, user_id, role) values (v_org, v_out, 'member');
    delete from public.org_members m where m.org_id = v_org and m.user_id = v_out;
    select f.source into got from public.org_followers f where f.org_id = v_org and f.user_id = v_out;
    res := res || format('profile:left=%s;', coalesce(got, '(none)'));
    delete from public.org_followers f where f.org_id = v_org and f.user_id = v_out;

    -- c. A bar goes when they join (and the membership stays for d to f).
    insert into public.org_board_bars (org_id, user_id, barred_by) values (v_org, v_out, v_owner);
    insert into public.org_members (org_id, user_id, role) values (v_org, v_out, 'member');
    select count(*) into n from public.org_board_bars b where b.org_id = v_org and b.user_id = v_out;
    res := res || format('bar:joined=%s;', n);

    -- d. A source nobody knows (a writer bug) is refused by name.
    begin
      update public.org_followers f set source = 'nonsense' where f.org_id = v_org and f.user_id = v_out;
      res := res || 'source=updated;';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || format('source=%s %s;', sqlstate, v_con);
    end;

    -- e. Titles: four bad ones (stamped, so only the title CHECK speaks), one
    --    without a stamp, one good one, a rank out of range.
    for i in 1 .. array_length(bad_titles, 1) by 2 loop
      begin
        update public.org_members m set title = bad_titles[i + 1], title_set_by = v_owner, title_set_at = now()
         where m.org_id = v_org and m.user_id = v_out;
        res := res || bad_titles[i] || '=updated;';
      exception when check_violation then
        get stacked diagnostics v_con = constraint_name;
        res := res || format('%s=%s %s;', bad_titles[i], sqlstate, v_con);
      end;
    end loop;
    begin
      update public.org_members m set title = 'President', title_set_at = null
       where m.org_id = v_org and m.user_id = v_out;
      res := res || 'unstamped=updated;';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || format('unstamped=%s %s;', sqlstate, v_con);
    end;
    update public.org_members m set title = 'President', title_set_by = v_owner, title_set_at = now()
     where m.org_id = v_org and m.user_id = v_out;
    get diagnostics n = row_count;
    res := res || format('titled=%s;', n);
    begin
      update public.org_members m set profile_rank = 51 where m.org_id = v_org and m.user_id = v_out;
      res := res || 'rank=updated;';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || format('rank=%s %s;', sqlstate, v_con);
    end;
    -- A new membership reads the defaults: shown, title shown.
    select format('shown=%s,title_shown=%s;', m.show_on_profile::text, m.show_title::text) into got
      from public.org_members m where m.org_id = v_org and m.user_id = v_out;
    res := res || coalesce(got, 'shown=(none);');

    -- f. A mute, then the same mute again.
    insert into public.org_post_mutes (user_id, org_id) values (v_out, v_org);
    get diagnostics n = row_count;
    res := res || format('mute=%s;', n);
    begin
      insert into public.org_post_mutes (user_id, org_id) values (v_out, v_org);
      res := res || 'again=inserted;';
    exception when unique_violation then
      res := res || format('again=%s;', sqlstate);
    end;

    raise exception using errcode = 'P0C69', message = res;
  exception when sqlstate 'P0C69' then
    state := sqlerrm;
  end;

  if state is distinct from want then
    raise exception 'club-model-data: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = v_out)
     or exists (select 1 from public.org_followers f where f.org_id = v_org and f.user_id = v_out)
     or exists (select 1 from public.org_board_bars b where b.org_id = v_org and b.user_id = v_out)
     or exists (select 1 from public.org_post_mutes x where x.org_id = v_org and x.user_id = v_out) then
    raise exception 'club-model-data: a probe row survived the behaviour check';
  end if;
  perform set_config('club_model_data.probe', 'behaviour check passed: ' || state, true);
  raise notice 'club-model-data: behaviour check passed: %', state;
end $$;

-- 8. The apply record, then PostgREST ------------------------------------------------
-- NOTICE lines do not come back through the Management API: what this run did
-- is written where a read-only query finds it (CHECK AFTER APPLYING, 1). The
-- comment is restated whole each run, so a second run does not pile up records.
do $$
begin
  execute format('comment on table public.org_board_bars is %L',
    'A follower an officer removed, barred from reading the club''s Board until they join (Franky, Oct 16; spec H2(a)). '
    || 'Following is left alone and they are not told. Service role only (RLS on, no policy, no grant for anon or '
    || 'authenticated): written by the officer''s remove-follower route, read by can_view_org_channel as its owner, '
    || 'cleared by the trigger org_members_clear_board_bar_on_join. '
    || 'APPLY RECORD ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: '
    || coalesce(nullif(current_setting('club_model_data.probe', true), ''), 'the behaviour check left no record') || '.');
end $$;

notify pgrst, 'reload schema';

commit;
