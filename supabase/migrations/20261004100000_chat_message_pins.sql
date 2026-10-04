-- Messages on desktop, wave 3 (handoffs/chat-redesign/wave-3-desktop/
-- contract.md, sections 4b and 4b.1; the rules are 4d): pinned MESSAGES.
-- ONE new table, chat_message_pins, and ONE trigger on messages.
--
-- WHY THIS EXISTS. In a direct message or a group chat anyone in the chat can
-- pin a message for everyone in it; "Pinned and Shared" (desktop) and "Pinned
-- messages" (phone) list the pins. Nothing in the database holds that today.
-- Three other things are already called "pin" and none of them is this:
-- channel_members.pinned_at (MY pinned chats, "Pin to top", 20260505140000),
-- the route /api/me/threads/[id]/pin that writes it, and channels.pinned (a
-- club room pinned in the old Campus rail, 20260507130000). A pin here is a
-- row of chat_message_pins.
--
-- WHAT IT CHANGES FOR EVERYONE: nothing until the new routes run. No existing
-- table, column, constraint, index, policy, function or row changes. messages
-- gains one AFTER UPDATE OF removed_at trigger, which fires only when a
-- message is soft-removed (a moderator, or a club officer in a club room) and
-- does one delete by primary key. The app runs WITHOUT this file: the three
-- pin routes answer 404 not_found while the table is missing
-- (isMissingChatSchema) and every pin control stays hidden, so the code and
-- this file may land in either order.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet ("already applied"
--      when the table, both indexes, the function and the trigger all exist;
--      "a name is taken" when only some do); messages, channels and users
--      exist; messages.removed_at is a timestamptz; the non-internal triggers
--      on messages are exactly bump_org_activity_on_message and
--      messages_check_media_ref.
--   1. Table chat_message_pins (message_id primary key -> messages, cascade;
--      channel_id not null -> channels, cascade; pinned_by -> users, set null;
--      pinned_at default now()); two indexes, (channel_id, pinned_at desc)
--      for the list and the cap count, (pinned_by) for the set-null; RLS on
--      with NO policy; revoke all from anon, authenticated and service_role;
--      service_role gets select, insert, update, delete; a comment.
--   2. Function chat_pins_drop_removed() (plpgsql, SECURITY DEFINER,
--      search_path '', swallows its own error) and the trigger of the same
--      name: AFTER UPDATE OF removed_at ON messages FOR EACH ROW WHEN
--      (new.removed_at is not null and old.removed_at is null). No grant
--      statement for the function; a comment.
--   3. POST-CHECK by catalog: the four columns; the key and the three foreign
--      keys with delete rules c, c, n; the three indexes; RLS on and zero
--      policies; no privilege for anon or authenticated, service_role alone
--      with the four; the function; the trigger (AFTER UPDATE, row level, of
--      removed_at, with the WHEN clause); the triggers on messages are now
--      the two of the pre-flight and this one.
--   4. POST-CHECK BY BEHAVIOUR, in a nested block that raises P0C49 (this
--      file's own code) so it rolls itself back, on rows it builds itself (a
--      throwaway dm room with no members and one message in it, written by
--      the oldest users row; no real message is touched): the message is
--      pinned; a second insert of it raises 23505; an update that leaves
--      removed_at null keeps the pin; removed_at = now() drops it; clearing
--      removed_at does not bring it back; pinned again, deleting the message
--      drops it. After the block no pin row, no throwaway room and no probe
--      message is left (checked). SKIPPED with a NOTICE when the database has
--      no users row.
--   5. notify pgrst, 'reload schema'.
--
-- WHAT EACH RULE GIVES. The sender's own delete is a HARD delete
-- (messages_delete_own, 20260509100000): the cascade drops the pin. Deleting
-- the chat, or the account of the message's author, drops it the same way.
-- A moderator's removal is SOFT (src/lib/moderation/actions.ts: the row stays
-- with removed_at set): the trigger drops the pin, and a later restore does
-- not bring it back. pinned_by set null: the pin outlives the person who
-- pinned it. "Clear chat history" is per person and is the routes' job
-- (channel_members.cleared_at), not this table's.
--
-- DOES NOT: touch a policy, a grant or a function of messages, channels or
-- users; add a column anywhere; check that channel_id is the message's own
-- room or that the room is a dm or group (the routes read the message in its
-- chat first and refuse club rooms with pins_chats_only; the table allows any
-- room, so pins in club rooms later need no migration); hold the cap of 20
-- (a count in the PUT route; two racing pins may leave 21: accepted); give
-- anon or authenticated any way in (no policy, no grant, no function).
--
-- LIVE STATE (read on the LOCAL stack, PostgreSQL 17.6, 2026-10-03, newest
-- schema_migrations row 20261003170000 waitlist_margin):
--   * public.messages: 16 columns, removed_at timestamptz among them;
--     non-internal triggers bump_org_activity_on_message (AFTER INSERT) and
--     messages_check_media_ref (BEFORE INSERT OR UPDATE OF media_url,
--     channel_id). Neither fires on an update of removed_at or on a DELETE.
--     Both fire on the behaviour check's one INSERT and do nothing there:
--     the probe room has no club (bump_org_activity updates orgs only when
--     the room has an org_id) and the probe message has no media_url.
--   * public.channels: non-internal triggers chat_channels_fill_kind (BEFORE
--     INSERT) and chat_channels_subscribe (AFTER INSERT OR UPDATE OF
--     is_private), both of 20261001100000. On the probe room's insert (type
--     dm) the first leaves kind null and the second returns at once: no
--     channel_members row is written.
--   * Grants on messages: authenticated select, insert, delete (no update:
--     only the service role can set removed_at); service_role all.
--   * pg_default_acl: a table created by postgres in public gets ALL for
--     anon, authenticated and service_role, hence the revoke in step 1; a
--     function gets EXECUTE for the three, left alone here (THE STANDING RULE).
--   * Nothing named chat_message_pins or chat_pins_drop_removed exists.
--   * 20 users rows (the seed's), so the behaviour check has an author for
--     its probe message locally; it reads that one id and writes nothing to
--     any row that was there before.
--
-- THE STANDING RULE (20260922090000_guard_function_privileges; restated in
-- 20261001120000): on this image a public function is NEVER refused to anon,
-- authenticated or service_role by a REVOKE ("permission denied for function"
-- crashes the backend). This file revokes on a TABLE only, which is safe
-- ("permission denied for table" is an ordinary 42501), and writes no grant
-- or revoke for its trigger function: Postgres itself refuses a direct call
-- of a trigger function ("trigger functions can only be called as triggers").
--
-- LOCK. The three foreign keys take SHARE ROW EXCLUSIVE on messages, channels
-- AND users, and CREATE TRIGGER takes the same on messages; all of it is held
-- until COMMIT, which includes the behaviour check. That lock blocks writes,
-- not reads: every message send, every new chat and every profile save waits
-- for those milliseconds. Nothing is rewritten and the new table is empty,
-- so "any time of day" still holds. Measured on the local stack on Oct 3
-- (pg_locks just before the commit): ShareRowExclusiveLock on users, channels
-- and messages, and nothing stronger on any existing table. The behaviour
-- check writes only rows of its own; of the rows that were there before it
-- holds one shared key lock, on the users row it names as the author (that
-- blocks a delete of that account, not a profile save), released when its
-- block rolls back. lock_timeout 5s
-- makes the file fail whole instead of queueing behind a long transaction
-- with every send behind it; then simply run it again.
--
-- PRE-CHECK (read-only, on production, before applying). Expected answers in
-- brackets.
--   1. Not applied yet, every name free [five nulls / empty]:
--     select to_regclass('public.chat_message_pins'),
--            to_regclass('public.idx_chat_message_pins_channel'),
--            to_regclass('public.idx_chat_message_pins_pinned_by'),
--            to_regprocedure('public.chat_pins_drop_removed()'),
--            (select string_agg(tgname, ', ') from pg_trigger
--              where tgrelid = 'public.messages'::regclass and tgname = 'chat_pins_drop_removed');
--   2. The triggers on messages [bump_org_activity_on_message,
--      messages_check_media_ref]. Anything else: read that trigger, then
--      update the list in PRE-FLIGHT c and in POST-CHECK h before applying.
--     select string_agg(tgname, ', ' order by tgname collate "C") from pg_trigger
--      where tgrelid = 'public.messages'::regclass and not tgisinternal;
--   3. The column the trigger watches [timestamp with time zone]:
--     select format_type(atttypid, atttypmod) from pg_attribute
--      where attrelid = 'public.messages'::regclass and attname = 'removed_at' and not attisdropped;
--   4. The behaviour check builds its own room and message; it needs one
--      users row as the author [t; f = the check is skipped with a NOTICE and
--      the file still applies], and its room insert fires the triggers on
--      channels [chat_channels_fill_kind, chat_channels_subscribe; anything
--      else: read that trigger for what it does on a dm room with no members
--      before applying]:
--     select exists (select 1 from public.users);
--     select string_agg(tgname, ', ' order by tgname collate "C") from pg_trigger
--      where tgrelid = 'public.channels'::regclass and not tgisinternal;
--   5. This file sorts after the newest applied row [a version below
--      20261004100000]:
--     select max(version) from supabase_migrations.schema_migrations;
--
-- APPLY ORDER: on its own; it needs nothing of this wave, and
-- 20261004110000_chat_room_post_policy.sql does not need it. Code first or
-- this file first are both safe (see WHAT IT CHANGES). Any time of day (see
-- LOCK). On production only the orchestrator applies it, after Franky says
-- yes (contract 4b.3 step 3), with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql (the file's text from
-- `git show <branch>:<this file>`, never the working tree), then records it
-- in a SEPARATE request:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261004100000', 'chat_message_pins');
-- Locally, one psql run through the unix socket, then the same INSERT through
-- the same docker exec:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261004100000_chat_message_pins.sql
-- Never `supabase db push`. The Management API answers an empty result on
-- success and the error text on a failure: everything that must stop the
-- apply is a RAISE EXCEPTION (the whole file rolls back). A second run stops
-- at once: "chat-pins: already applied".
--
-- CHECK AFTER APPLYING (read-only):
--   1. [t | 0 | {postgres=arwdDxtm/postgres,service_role=arwd/postgres}]
--     select c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid), c.relacl
--       from pg_class c where c.oid = 'public.chat_message_pins'::regclass;
--   2. [CREATE TRIGGER chat_pins_drop_removed AFTER UPDATE OF removed_at ON
--      public.messages FOR EACH ROW WHEN (((new.removed_at IS NOT NULL) AND
--      (old.removed_at IS NULL))) EXECUTE FUNCTION chat_pins_drop_removed()]
--     select pg_get_triggerdef(oid) from pg_trigger
--      where tgrelid = 'public.messages'::regclass and tgname = 'chat_pins_drop_removed';
--   3. [f f f f | f f f f]
--     select has_table_privilege('anon', 'public.chat_message_pins', 'select'),
--            has_table_privilege('anon', 'public.chat_message_pins', 'insert'),
--            has_table_privilege('anon', 'public.chat_message_pins', 'update'),
--            has_table_privilege('anon', 'public.chat_message_pins', 'delete'),
--            has_table_privilege('authenticated', 'public.chat_message_pins', 'select'),
--            has_table_privilege('authenticated', 'public.chat_message_pins', 'insert'),
--            has_table_privilege('authenticated', 'public.chat_message_pins', 'update'),
--            has_table_privilege('authenticated', 'public.chat_message_pins', 'delete');
--   4. Behaviour, LOCAL only: scripts/sql/chat-message-pins-check.sql ends
--      "chat-message-pins-check: all 43 cases passed".
--
-- ROLLBACK (one transaction; the code needs no change: every pin route falls
-- back to 404 not_found on the missing table and the screens hide Pin). It
-- deletes every pin anyone has made: there is no other copy.
-- UNLIKE THE APPLY, THE ROLLBACK BLOCKS READS: run it at a quiet hour.
-- Measured on the local stack on Oct 3 (pg_locks just before its COMMIT):
-- DROP TRIGGER takes ACCESS EXCLUSIVE on messages, and on Supabase it also
-- makes supautils (supautils.drop_trigger_grants) take ACCESS EXCLUSIVE on
-- 23 auth / storage / realtime tables (auth.users, auth.sessions,
-- auth.refresh_tokens, auth.identities, storage.objects, storage.buckets,
-- realtime.messages, ...); DROP TABLE takes ACCESS EXCLUSIVE on channels and
-- users as well (the foreign keys' other ends). All held until COMMIT: every
-- chat read, sign-in, token refresh and upload waits those milliseconds. The
-- 5 s lock_timeout makes it fail instead of queueing; then run it again.
-- Read `show supautils.drop_trigger_grants` on production before relying on
-- it (the same warning as 20261001110000's rollback).
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   drop trigger chat_pins_drop_removed on public.messages;
--   drop function public.chat_pins_drop_removed();
--   drop table public.chat_message_pins;
--   delete from supabase_migrations.schema_migrations where version = '20261004100000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED on the local stack on Oct 3, 2026: applied, recorded, the check
-- script passed; then the ROLLBACK above, as written (after it: no table, no
-- function, the triggers on messages back to the two of the pre-flight, the
-- schema_migrations row gone); then this file applied again and recorded, the
-- check script passed again, and one more run stopped at "already applied".
-- REHEARSED AGAIN the same day after the behaviour check was changed to build
-- its own room and message (it used to borrow the oldest dm message): the
-- ROLLBACK above as written, this text applied and recorded, the check script
-- passed, one more run stopped at "already applied"; channels, messages and
-- channel_members counted the same before and after (82, 229, 138).
-- ---------------------------------------------------------------------------

begin;

-- The three foreign keys and CREATE TRIGGER take SHARE ROW EXCLUSIVE on
-- messages, channels and users until COMMIT (the header's LOCK note): give up
-- rather than queue behind a long transaction with every send waiting behind
-- this file. A failure here is not a defect in the file: run it again.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  taken text[];
  trg   text;
begin
  -- a. Not applied yet, and every name free. All five there = already applied;
  --    some of them = half there, or something else owns a name: stop and look.
  select array_agg(x.what order by x.o) into taken
    from (
      select 1 as o, 'the relation public.chat_message_pins' as what
       where to_regclass('public.chat_message_pins') is not null
      union all
      select 2, 'the relation public.idx_chat_message_pins_channel'
       where to_regclass('public.idx_chat_message_pins_channel') is not null
      union all
      select 3, 'the relation public.idx_chat_message_pins_pinned_by'
       where to_regclass('public.idx_chat_message_pins_pinned_by') is not null
      union all
      select 4, 'a function public.chat_pins_drop_removed'
       where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'chat_pins_drop_removed')
      union all
      select 5, 'the trigger chat_pins_drop_removed on public.messages'
       where exists (select 1 from pg_trigger t
                      where t.tgrelid = 'public.messages'::regclass and not t.tgisinternal
                        and t.tgname = 'chat_pins_drop_removed')
    ) x;
  if cardinality(taken) = 5 then
    raise exception 'chat-pins: already applied: public.chat_message_pins, its two indexes, the function and the trigger chat_pins_drop_removed all exist';
  elsif taken is not null then
    raise exception 'chat-pins: a name this file creates is taken (half applied, or something else owns it): %', array_to_string(taken, '; ');
  end if;

  -- b. The three tables the foreign keys point at, and the column the trigger
  --    watches (20260923090000; the soft removal a moderator writes).
  if to_regclass('public.messages') is null or to_regclass('public.channels') is null
     or to_regclass('public.users') is null then
    raise exception 'chat-pins: public.messages, public.channels or public.users is missing';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.messages'::regclass and a.attname = 'removed_at'
                    and not a.attisdropped
                    and format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone') then
    raise exception 'chat-pins: public.messages.removed_at (timestamptz) is missing; the trigger has nothing to watch';
  end if;

  -- c. The triggers on messages are the two read on the local stack on Oct 3.
  --    The behaviour check below inserts, soft-removes and deletes ONE message
  --    of its own (in a throwaway room of its own) inside a block it rolls
  --    back: a trigger this file has not read could do something there nobody
  --    looked at. If production differs, read the new trigger first, then
  --    update this list (contract 4b.1). The room's insert fires the triggers
  --    on channels; those are read by hand (the header's PRE-CHECK 4), as
  --    20261001120000 leaves them, not refused here.
  select coalesce(string_agg(t.tgname, ', ' order by t.tgname collate "C"), '(none)') into trg
    from pg_trigger t
   where t.tgrelid = 'public.messages'::regclass and not t.tgisinternal;
  if trg is distinct from 'bump_org_activity_on_message, messages_check_media_ref' then
    raise exception 'chat-pins: the triggers on public.messages are "%", expected "bump_org_activity_on_message, messages_check_media_ref"', trg;
  end if;
  raise notice 'chat-pins: pre-flight ok: every name free, messages.removed_at there, the triggers on messages: %', trg;
end $$;

-- 1. The table -------------------------------------------------------------------
-- One row per message (the primary key): a message is pinned or not, for
-- everyone in the chat. The message's key cascades (the sender's own delete is
-- a hard delete, and deleting the author's account deletes their messages);
-- the chat's key cascades; the pinner's key sets null (the pin outlives the
-- person who pinned it: the panel shows the message's author, not the pinner).
-- channel_id repeats messages.channel_id so the list and the cap count read
-- one index and never join; the routes write it from the message they read.
create table public.chat_message_pins (
  message_id uuid constraint chat_message_pins_pkey primary key
             constraint chat_message_pins_message_id_fkey references public.messages(id) on delete cascade,
  channel_id uuid not null
             constraint chat_message_pins_channel_id_fkey references public.channels(id) on delete cascade,
  pinned_by  uuid constraint chat_message_pins_pinned_by_fkey references public.users(id) on delete set null,
  pinned_at  timestamptz not null default now()
);
create index idx_chat_message_pins_channel   on public.chat_message_pins (channel_id, pinned_at desc);
create index idx_chat_message_pins_pinned_by on public.chat_message_pins (pinned_by);

-- RLS on with NO policy, and no grant for the client roles: the default ACL
-- would hand anon and authenticated the table (the chat_removals pattern,
-- 20261001110000:662-680). Only the service role touches these rows, from the
-- three pin routes, after the route has proved the caller is in the chat.
alter table public.chat_message_pins enable row level security;            -- and NO policy
revoke all on table public.chat_message_pins from anon, authenticated, service_role;
grant select, insert, update, delete on table public.chat_message_pins to service_role;
comment on table public.chat_message_pins is
  'A message pinned for everyone in a dm or group chat. One row per message. Service role only: the three pin routes are the only readers and writers. NOT channel_members.pinned_at (my pinned chats) and NOT channels.pinned (a room pinned in the old rail).';

-- 2. A removed message drops its pin -----------------------------------------------
-- A moderator's removal is a SOFT one (messages.removed_at; the row stays, so
-- no cascade fires). AFTER UPDATE OF removed_at, only when it goes from null
-- to set: a later restore does not bring the pin back. plpgsql, SECURITY
-- DEFINER, search_path '' (A's trigger rule, 20261001100000:851-860), and it
-- swallows its own error: a pins bug never blocks a removal; the warning is
-- in the database log and the list route filters removed_at anyway. No grant
-- statement: a trigger function is not reachable over REST, and the standing
-- rule (20260922090000) forbids revoking EXECUTE from anon, authenticated or
-- service_role on this image, so its default grants are left as they are.
create function public.chat_pins_drop_removed() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  begin
    delete from public.chat_message_pins p where p.message_id = new.id;
  exception when others then
    raise warning 'chat-pins: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;
create trigger chat_pins_drop_removed
  after update of removed_at on public.messages
  for each row when (new.removed_at is not null and old.removed_at is null)
  execute function public.chat_pins_drop_removed();

comment on function public.chat_pins_drop_removed() is
  'AFTER UPDATE OF removed_at on messages, when it goes from null to set (a soft removal): the message''s row in chat_message_pins goes. A restore does not bring it back. Swallows its own errors (a pins bug never blocks a removal). No grant statement: a trigger function is not reachable over REST.';

-- 3. POST-CHECK by catalog (same transaction): any miss aborts the whole file ----
do $$
declare
  t   constant regclass := 'public.chat_message_pins'::regclass;
  f   constant oid := to_regprocedure('public.chat_pins_drop_removed()');
  got text;
  bad text := '';
begin
  -- a. Four columns, their types, null rules and the one default.
  select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                    ', ' order by a.attnum)
    into got
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = t and a.attnum > 0 and not a.attisdropped;
  if got is distinct from 'message_id uuid not null, channel_id uuid not null, pinned_by uuid, pinned_at timestamp with time zone not null default now()' then
    bad := bad || format(' the columns are "%s";', got);
  end if;

  -- b. The primary key and the three foreign keys: name, type, key column,
  --    the table it points at, the delete rule (c cascade, c cascade, n set null).
  select string_agg(format('%s %s (%s) %s %s', c.conname, c.contype,
                           (select string_agg(a.attname, ',' order by k.o)
                              from unnest(c.conkey) with ordinality k(n, o)
                              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n),
                           coalesce(rn.nspname || '.' || r.relname, '-'),
                           case when c.contype = 'f' then c.confdeltype::text else '-' end),
                    ', ' order by c.conname collate "C")
    into got
    from pg_constraint c
    left join pg_class r on r.oid = c.confrelid
    left join pg_namespace rn on rn.oid = r.relnamespace
   where c.conrelid = t and c.contype in ('p', 'f', 'u', 'c', 'x') and c.convalidated;
  if got is distinct from 'chat_message_pins_channel_id_fkey f (channel_id) public.channels c, '
                       || 'chat_message_pins_message_id_fkey f (message_id) public.messages c, '
                       || 'chat_message_pins_pinned_by_fkey f (pinned_by) public.users n, '
                       || 'chat_message_pins_pkey p (message_id) - -' then
    bad := bad || format(' the constraints are "%s";', got);
  end if;

  -- c. The two indexes beside the key's: valid btrees on those columns, the
  --    list's one with pinned_at DESC (indoption bit 1).
  select string_agg(format('%s (%s)%s', ic.relname,
                           (select string_agg(a.attname || case when (i.indoption[k.o - 1] & 1) = 1 then ' desc' else '' end,
                                              ',' order by k.o)
                              from unnest(i.indkey::int2[]) with ordinality k(n, o)
                              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n),
                           case when i.indisunique then ' unique' else '' end),
                    ', ' order by ic.relname collate "C")
    into got
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam
   where i.indrelid = t and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree';
  if got is distinct from 'chat_message_pins_pkey (message_id) unique, '
                       || 'idx_chat_message_pins_channel (channel_id,pinned_at desc), '
                       || 'idx_chat_message_pins_pinned_by (pinned_by)' then
    bad := bad || format(' the indexes are "%s";', got);
  end if;

  -- d. RLS on, and not one policy.
  if not (select c.relrowsecurity from pg_class c where c.oid = t) then
    bad := bad || ' RLS is off;';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid = t) then
    bad := bad || ' the table has a policy;';
  end if;

  -- e. Privileges: nothing for anon or authenticated (asked the way a request
  --    is checked, through every role they belong to), and beside the owner
  --    the ACL names service_role alone with exactly the four.
  select string_agg(rl.r || ' ' || pv.p, ', ' order by rl.r, pv.p) into got
    from (values ('anon'), ('authenticated')) as rl (r)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as pv (p)
   where has_table_privilege(rl.r, t, pv.p);
  if got is not null then
    bad := bad || format(' a client role holds a privilege: %s;', got);
  end if;
  select coalesce(string_agg(x.who || '=' || x.privs, ' ' order by x.who), '(none)') into got
    from (select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as who,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
            from pg_class c
            cross join lateral aclexplode(c.relacl) a
           where c.oid = t and a.grantee <> c.relowner
           group by a.grantee) x;
  if got is distinct from 'service_role=DELETE,INSERT,SELECT,UPDATE' then
    bad := bad || format(' the grants beside the owner''s are "%s";', got);
  end if;

  -- f. The function: a plpgsql trigger function, SECURITY DEFINER, search_path "".
  if f is null then
    bad := bad || ' public.chat_pins_drop_removed() is missing;';
  elsif not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                     where p.oid = f and p.prosecdef and l.lanname = 'plpgsql'
                       and p.prorettype = 'trigger'::regtype
                       and p.proconfig = array['search_path=""']) then
    bad := bad || ' chat_pins_drop_removed is not a plpgsql SECURITY DEFINER trigger function with search_path "";';
  end if;

  -- g. The trigger: on messages, enabled, AFTER UPDATE FOR EACH ROW (tgtype 17
  --    = row 1 + update 16; no BEFORE bit), of removed_at alone, with the WHEN
  --    clause (read back from its definition, brackets and spaces dropped).
  if not exists (select 1 from pg_trigger g
                  where not g.tgisinternal
                    and g.tgrelid = 'public.messages'::regclass
                    and g.tgname = 'chat_pins_drop_removed'
                    and g.tgenabled = 'O'
                    and g.tgtype = 17
                    and cardinality(g.tgattr::int2[]) = 1
                    and g.tgattr[0] = (select a.attnum from pg_attribute a
                                        where a.attrelid = 'public.messages'::regclass
                                          and a.attname = 'removed_at')
                    and g.tgqual is not null
                    and g.tgfoid = f
                    and regexp_replace(lower(pg_get_triggerdef(g.oid)), '[()\s]', '', 'g')
                        like '%whennew.removed_atisnotnullandold.removed_atisnull%') then
    bad := bad || ' chat_pins_drop_removed is not the enabled AFTER UPDATE OF removed_at row trigger on messages with its WHEN clause;';
  end if;

  -- h. The triggers on messages: the two of the pre-flight and this one.
  select coalesce(string_agg(g.tgname, ', ' order by g.tgname collate "C"), '(none)') into got
    from pg_trigger g
   where g.tgrelid = 'public.messages'::regclass and not g.tgisinternal;
  if got is distinct from 'bump_org_activity_on_message, chat_pins_drop_removed, messages_check_media_ref' then
    bad := bad || format(' the triggers on messages are "%s";', got);
  end if;

  if bad <> '' then
    raise exception 'chat-pins: post-check failed:%', bad;
  end if;
  raise notice 'chat-pins: post-check ok: four columns, the key and three foreign keys (cascade, cascade, set null), two indexes, RLS on with no policy, service_role alone holds select, insert, update, delete, the trigger is AFTER UPDATE OF removed_at FOR EACH ROW with its WHEN clause';
end $$;

-- 4. POST-CHECK BY BEHAVIOUR (rolls itself back) -----------------------------------
-- As the file's role (postgres). The fixture is this block's OWN (contract
-- 4b's shared rule, the way 20261001120000:270-292 builds its rooms): a
-- throwaway dm room with no members and ONE message in it, written by the
-- oldest users row. Nobody's real message is read, updated or deleted. That
-- message is pinned, soft-removed, restored, pinned again and hard-deleted,
-- all inside the inner block. Every outcome goes into one string beside the
-- expected one; raising P0C49 (this file's own code, used nowhere else) at
-- the end of the inner block rolls every write back: after it there is no
-- pin row, no throwaway room and no probe message. Any OTHER error leaves
-- this block and aborts the whole file. SKIPPED with a NOTICE when the
-- database has no users row to write the probe message.
do $$
declare
  me     text := current_user;
  v_msg  constant uuid := gen_random_uuid();
  v_chan constant uuid := gen_random_uuid();
  v_who  uuid;
  n      integer;
  res    text := '';
  want   constant text := 'pinned=1;again=23505;kept=1;removed=0;restored=0;repinned=1;deleted=0;';
  state  text;
begin
  select u.id into v_who from public.users u order by u.created_at, u.id limit 1;
  if v_who is null then
    raise notice 'chat-pins: behaviour check SKIPPED: no users row to author the probe message';
    return;
  end if;
  begin
    -- the throwaway room and its one message (a dm: chat_channels_fill_kind
    -- leaves kind null and chat_channels_subscribe adds nobody; no club, so
    -- bump_org_activity_on_message updates nothing; no media to check)
    insert into public.channels (id, type, name) values (v_chan, 'dm', '');
    insert into public.messages (id, channel_id, user_id, content)
    values (v_msg, v_chan, v_who, 'chat-pins probe');
    -- pin it
    insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (v_msg, v_chan, v_who);
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'pinned=' || n || ';';
    -- a second pin of the same message: the primary key says no
    begin
      insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (v_msg, v_chan, v_who);
      res := res || 'again=inserted;';
    exception when unique_violation then
      res := res || 'again=' || sqlstate || ';';
    end;
    -- an update that leaves removed_at null fires nothing (the WHEN clause)
    update public.messages set removed_at = null where id = v_msg;
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'kept=' || n || ';';
    -- a soft removal drops the pin (the trigger)
    update public.messages set removed_at = now() where id = v_msg;
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'removed=' || n || ';';
    -- a restore does not bring it back
    update public.messages set removed_at = null where id = v_msg;
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'restored=' || n || ';';
    -- pinned again, then the sender's kind of delete (a hard one): the cascade
    insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (v_msg, v_chan, v_who);
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'repinned=' || n || ';';
    delete from public.messages where id = v_msg;
    select count(*) into n from public.chat_message_pins p where p.message_id = v_msg;
    res := res || 'deleted=' || n || ';';

    raise exception using errcode = 'P0C49', message = res;
  exception when sqlstate 'P0C49' then
    state := sqlerrm;
  end;

  if state is distinct from want then
    raise exception 'chat-pins: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'chat-pins: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.chat_message_pins) then
    raise exception 'chat-pins: a probe pin survived the post-check';
  end if;
  if exists (select 1 from public.channels c where c.id = v_chan)
     or exists (select 1 from public.messages m where m.id = v_msg or m.channel_id = v_chan) then
    raise exception 'chat-pins: the throwaway room % or its probe message survived the post-check', v_chan;
  end if;
  raise notice 'chat-pins: behaviour check passed: %', state;
end $$;

-- 5. tell PostgREST about the new table (delivered at commit) -------------------
notify pgrst, 'reload schema';

commit;
