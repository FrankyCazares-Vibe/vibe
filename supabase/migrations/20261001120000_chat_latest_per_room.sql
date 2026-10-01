-- S71 club chat, wave 2, amendment 2 (handoffs/chat-redesign/wave-2-build/
-- S71-amendment-2.md, section 2): migration C. ONE new function,
-- chat_latest_per_channel: the newest k messages PER ROOM, read as the caller.
--
-- WHY THIS EXISTS. GET /api/me/inbox (readPreviews, readEventActivity) and the
-- thread list GET /api/me/threads (readLastMessages; on main = production
-- today) read the newest messages of many rooms in ONE query:
-- .in("channel_id", ids).order("created_at", desc).limit(ids.length * k).
-- That is one window SHARED by all the rooms, not k rows per room. One busy
-- room pushes every other room's newest message out of it: blank previews,
-- wrong unread dots, a wrong last_activity_at and club order, and in the
-- thread list a stranger's dm request vanishing from Requests while the
-- recipient's other dms are busy (reproduced twice in the S71 HTTP pass).
-- PostgREST cannot say "k rows per group"; a function can: unnest the ids
-- and, for each one, a LATERAL read of that room's newest k rows down the
-- (channel_id, created_at) index.
--
-- WHAT IT CHANGES FOR EVERYONE: nothing but one new function. No table,
-- column, constraint, index, policy, trigger, table grant or row changes.
-- Nothing calls the function until the new route code does, and that code
-- falls back to today's query on PGRST202 / 42883 (isMissingChatSchema), so
-- the code and this file may land in either order. SECURITY INVOKER: the
-- function runs with the CALLER's rights, so the SELECT policies of messages
-- apply inside it exactly as on a direct read. A caller never gets a row from
-- it they could not read with from("messages"); the ids of rooms they cannot
-- read simply return nothing.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet; messages has
--      channel_id (uuid), created_at (timestamptz), thread_root_id (uuid) and
--      removed_at (timestamptz); RLS is on for messages; a valid, non-partial
--      btree index whose two leading columns are (channel_id, created_at)
--      exists (its name is read from the catalog and printed, not assumed).
--   1. chat_latest_per_channel(p_channels uuid[], p_per integer,
--      p_top_level_only boolean default true, p_live_only boolean default
--      false) returns setof public.messages. For each of the FIRST 500 ids:
--      that room's newest p_per rows (clamped to 1..20; null counts as 1),
--      only top-level rows when p_top_level_only (thread_root_id is null),
--      only live rows when p_live_only (removed_at is null). The whole result
--      is newest first. An id given twice is read twice (the callers pass
--      distinct ids); a null id or a null array reads nothing. language sql,
--      stable, security invoker, search_path ''.
--   2. revoke all from PUBLIC; grant execute to anon, authenticated and
--      service_role (THE STANDING RULE below: never refuse a function to
--      those roles); a comment.
--   3. POST-CHECK by catalog: the function exists with that signature, is
--      SECURITY INVOKER, STABLE, returns setof messages, has search_path ""
--      in its config; PUBLIC cannot execute it; anon, authenticated and
--      service_role can.
--   4. POST-CHECK BY BEHAVIOUR, in a nested block that raises P0C39 (this
--      file's own code) so it rolls itself back: two throwaway dm rooms with
--      no members, a busy one (8 rows, a thread reply and a removed row among
--      them) and a quiet one (1 older row); k rows per room come back, the
--      quiet room's row among them, under each filter and the k clamp; and
--      today's shared window over the same rooms misses the quiet row (the
--      bug, pinned). SKIPPED with a NOTICE when the database has no users
--      row to author them.
--   5. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch messages' policies (the RLS rules are the caller's, read
-- in place), add an index (the phase-1 index idx_messages_channel_created
-- (channel_id, created_at desc), 20260430190000, serves it), or depend on
-- migration B (20261001110000): it reads only messages columns, and
-- thread_root_id comes from migration A (20261001100000, live since Sept 30).
--
-- LIVE STATE (read on the LOCAL stack, PostgreSQL 17.6, image
-- supabase/postgres 17.6.1.111, 2026-10-01, with migrations A and B applied;
-- the linked project's supabase/.temp/postgres-version says the same
-- 17.6.1.111):
--   * public.messages: RLS on (not forced), owner postgres. SELECT policies
--     messages_select_member (dms and groups: a channel_members row) and
--     messages_select_org_member (club rooms: can_view_org_channel); both
--     let an author see their own removed row.
--   * Index idx_messages_channel_created btree (channel_id, created_at DESC).
--   * pg_default_acl: functions created by postgres in public get EXECUTE
--     for anon, authenticated and service_role EXPLICITLY; this file keeps
--     all three (the standing rule below).
--   * anon holds no privilege on public.messages (authenticated: select,
--     insert, delete; service_role: all).
--
-- THE STANDING RULE (S63, migration 20260922090000_guard_function_privileges;
-- met again in S71b, handoffs/chat-redesign/wave-2-build/S71b-sql-notes.md):
-- on this image (supabase/postgres 17.6.1.111, local and production)
-- supautils adds a HINT to permission errors for anon, authenticated and
-- service_role, and for "permission denied for FUNCTION" that code SEGFAULTS
-- the backend (the postmaster restarts every connection). So a public
-- function is NEVER refused to those roles by a REVOKE: it is granted, and
-- the refusal happens somewhere that does not crash. Here that place is the
-- table: anon holds no privilege on public.messages, so an anonymous call
-- stops at "permission denied for table messages" (42501; a TABLE error does
-- not crash; proven in a throwaway container with this function and these
-- grants). The first draft of this file revoked anon and crashed the local
-- server once in testing (about a second of crash recovery, nothing lost);
-- the orchestrator corrected the grants before any review or apply.
--
-- PRE-CHECK (read-only, on production, before applying). Expected answers
-- in brackets.
--   1. Not applied yet [null]:
--     select to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)');
--   2. The index [idx_messages_channel_created | (channel_id, created_at DESC)]:
--     select indexrelid::regclass, pg_get_indexdef(indexrelid) from pg_index
--      where indrelid = 'public.messages'::regclass and indpred is null
--        and indkey[0] = (select attnum from pg_attribute where attrelid = 'public.messages'::regclass and attname = 'channel_id')
--        and indkey[1] = (select attnum from pg_attribute where attrelid = 'public.messages'::regclass and attname = 'created_at');
--
-- APPLY ORDER: after B (independent of B in fact; it needs only A). Code
-- first or this file first are both safe (see WHAT IT CHANGES). No quiet
-- hour needed: no lock but a brief ROW EXCLUSIVE on messages and channels
-- for the probe's rolled-back rows; lock_timeout is 5 seconds.
-- Apply with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql (the file's text from
-- `git show <branch>:<this file>`, never the working tree), then record it in
-- a SEPARATE request:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261001120000', 'chat_latest_per_room');
-- Locally, one psql run through the unix socket:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261001120000_chat_latest_per_room.sql
-- The Management API answers an empty result on success and the error text
-- on a failure: everything that must stop the apply is a RAISE EXCEPTION
-- (the whole file rolls back). A second run stops at once: "already applied".
--
-- CHECK AFTER APPLYING (read-only):
--   1. [f | s | {"search_path=\"\""} | t | t | t]
--     select p.prosecdef, p.provolatile, p.proconfig,
--            has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
--            has_function_privilege('service_role', p.oid, 'EXECUTE') as service
--       from pg_proc p
--      where p.oid = to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)');
--   2. Behaviour, LOCAL only: scripts/sql/chat-latest-check.sql ends
--      "chat-latest-check: all 42 cases passed".
--
-- ROLLBACK (one transaction; first restore code that does not call the
-- function, or leave the code: it falls back to today's shared window on
-- 42883 / PGRST202 by itself):
--   BEGIN;
--   drop function public.chat_latest_per_channel(uuid[], integer, boolean, boolean);
--   delete from supabase_migrations.schema_migrations where version = '20261001120000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- The behaviour probe (step 4) takes ROW EXCLUSIVE on messages and channels
-- for rows it rolls back: give up rather than queue.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  missing text;
  idx     text;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'chat_latest_per_channel') then
    raise exception 'chat-latest: public.chat_latest_per_channel already exists (already applied?)';
  end if;
  select string_agg(w.col || ' ' || w.typ, ', ') into missing
    from (values ('channel_id', 'uuid'), ('created_at', 'timestamp with time zone'),
                 ('thread_root_id', 'uuid'), ('removed_at', 'timestamp with time zone')) w(col, typ)
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = 'public.messages'::regclass and a.attname = w.col
                        and not a.attisdropped and format_type(a.atttypid, a.atttypmod) = w.typ);
  if missing is not null then
    raise exception 'chat-latest: public.messages lacks %. Apply 20261001100000_chat_v2_rooms.sql (migration A) first', missing;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.messages'::regclass) then
    raise exception 'chat-latest: RLS is off on public.messages; a security invoker read would hand every row to every caller';
  end if;
  select string_agg(i.indexrelid::regclass::text, ', ' order by i.indexrelid::regclass::text) into idx
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam
   where i.indrelid = 'public.messages'::regclass
     and i.indisvalid and i.indisready and i.indpred is null
     and am.amname = 'btree' and i.indnkeyatts >= 2
     and i.indkey[0] = (select a.attnum from pg_attribute a
                         where a.attrelid = 'public.messages'::regclass and a.attname = 'channel_id')
     and i.indkey[1] = (select a.attnum from pg_attribute a
                         where a.attrelid = 'public.messages'::regclass and a.attname = 'created_at');
  if idx is null then
    raise exception 'chat-latest: no valid btree index on public.messages leads with (channel_id, created_at); every room would be read in full';
  end if;
  raise notice 'chat-latest: pre-flight ok; the per-room index: %', idx;
end $$;

-- 1. The function ----------------------------------------------------------------
-- WITH ORDINALITY + `c.n <= 500`: a caller can never make one call read more
-- than 500 rooms, whatever the array's shape (a slice `[1:500]` bounds only
-- the first dimension: a 2-D array sent through PostgREST's JSON body slipped
-- past it; found by the S71b SQL review). The LIMIT is clamped to 1..20 the same way. Inside the LATERAL the
-- SELECT policies of messages filter the rows BEFORE the limit: a room keeps
-- its k newest rows the caller may read, and a room they may not read gives
-- none. Not inlinable (it has a SET clause): planned on its own, one index
-- read per room.
create function public.chat_latest_per_channel(
  p_channels       uuid[],
  p_per            integer,
  p_top_level_only boolean default true,
  p_live_only      boolean default false
) returns setof public.messages
language sql
stable
security invoker          -- RLS of the CALLER applies inside: a caller can never read a row they could not read directly
set search_path = ''
as $$
  select m.*
    from unnest(p_channels) with ordinality as c(id, n)
    cross join lateral (
      select x.*
        from public.messages x
       where x.channel_id = c.id
         and (not p_top_level_only or x.thread_root_id is null)
         and (not p_live_only or x.removed_at is null)
       order by x.created_at desc
       limit least(greatest(coalesce(p_per, 1), 1), 20)
    ) m
   where c.n <= 500
   order by m.created_at desc
$$;

-- 2. Grants and the comment ------------------------------------------------------
-- PUBLIC loses it; anon, authenticated and service_role keep it (the standing
-- rule in the header: a function refused to those roles crashes this image).
-- An anonymous call is refused at the messages table instead.
revoke all on function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) from public;
grant execute on function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) to anon, authenticated, service_role;
comment on function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) is
  'The newest p_per (1..20, null = 1) messages PER ROOM of the first 500 ids of p_channels, newest first overall. p_top_level_only: thread_root_id is null; p_live_only: removed_at is null. SECURITY INVOKER: the caller''s RLS applies inside, so rooms they cannot read return nothing. Read with the cookie client by GET /api/me/inbox (previews, event-room activity) and GET /api/me/threads (last messages). Migration C, S71 amendment 2.';

-- 3. POST-CHECK by catalog (same transaction) ------------------------------------
do $$
declare
  f   oid := to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)');
  p   record;
  bad text := '';
begin
  if f is null then
    raise exception 'chat-latest: post-check: public.chat_latest_per_channel(uuid[],integer,boolean,boolean) is missing';
  end if;
  select pr.prosecdef, pr.provolatile, pr.proretset, pr.prorettype, pr.pronargdefaults,
         pr.proconfig, pr.proacl, l.lanname
    into p
    from pg_proc pr join pg_language l on l.oid = pr.prolang
   where pr.oid = f;
  if p.prosecdef then bad := bad || ' it is SECURITY DEFINER;'; end if;
  if p.provolatile <> 's' then bad := bad || ' it is not STABLE;'; end if;
  if p.lanname <> 'sql' then bad := bad || ' it is not language sql;'; end if;
  if not p.proretset or p.prorettype <> 'public.messages'::regtype then
    bad := bad || ' it does not return setof public.messages;';
  end if;
  if p.pronargdefaults <> 2 then bad := bad || ' it lacks the two defaults;'; end if;
  if p.proconfig is distinct from array['search_path=""'] then
    bad := bad || format(' its config is %s, not {search_path=""};', coalesce(p.proconfig::text, 'null'));
  end if;
  if exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    bad := bad || ' PUBLIC can execute it;';
  end if;
  if not has_function_privilege('anon', f, 'EXECUTE') then bad := bad || ' anon cannot execute it (a refused function call crashes this image: the standing rule);'; end if;
  if has_table_privilege('anon', 'public.messages', 'SELECT') then bad := bad || ' anon can select public.messages (the table refusal this function relies on is gone);'; end if;
  if not has_function_privilege('authenticated', f, 'EXECUTE') then bad := bad || ' authenticated cannot execute it;'; end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then bad := bad || ' service_role cannot execute it;'; end if;
  if bad <> '' then
    raise exception 'chat-latest: post-check failed:%', bad;
  end if;
  raise notice 'chat-latest: post-check ok: invoker, stable, sql, setof messages, search_path "", execute for anon, authenticated and service_role, not PUBLIC; anon has no SELECT on messages';
end $$;

-- 4. POST-CHECK BY BEHAVIOUR (rolls itself back) -----------------------------------
-- As the file's role (postgres: it bypasses RLS, so this proves the per-room
-- windows, not the policies; scripts/sql/chat-latest-check.sql proves those
-- as a signed-in caller). Two throwaway dm rooms with no members:
--   busy  b1 (newest) .. b8, one minute apart: b1 is a thread reply under
--         b3, b2 is removed, the rest are live top-level rows;
--   quiet q1, one hour older than every busy row.
-- Every outcome goes into one string beside the expected one; raising P0C39
-- (this file's own code, used nowhere else) at the end of the inner block
-- rolls the rows back. The last line is TODAY's shared window over the same
-- two rooms (limit 2 x 3, top-level): it must MISS q1, which is the bug.
do $$
declare
  me      text := current_user;
  v_who   uuid;
  v_busy  uuid := gen_random_uuid();
  v_quiet uuid := gen_random_uuid();
  v_root  uuid := gen_random_uuid();
  t0      timestamptz := now();
  got     text;
  res     text := '';
  want    text := '';
  state   text;
begin
  select u.id into v_who from public.users u order by u.created_at, u.id limit 1;
  if v_who is null then
    raise notice 'chat-latest: behaviour check SKIPPED: no users row to author the probe rows';
    return;
  end if;
  begin
    insert into public.channels (id, type, name) values (v_busy, 'dm', ''), (v_quiet, 'dm', '');
    insert into public.messages (channel_id, user_id, content, created_at)
    values (v_quiet, v_who, 'chat-latest probe: q1', t0 - interval '1 hour');
    insert into public.messages (id, channel_id, user_id, content, created_at)
    select case when i = 3 then v_root else gen_random_uuid() end,
           v_busy, v_who, 'chat-latest probe: b' || i, t0 - make_interval(mins => i)
      from generate_series(3, 8) i;
    insert into public.messages (channel_id, user_id, content, created_at,
                                 removed_at, removed_by, removed_reason)
    values (v_busy, v_who, 'chat-latest probe: b2', t0 - interval '2 minutes',
            t0, v_who, 'chat-latest probe');
    insert into public.messages (channel_id, user_id, content, created_at, thread_root_id)
    values (v_busy, v_who, 'chat-latest probe: b1', t0 - interval '1 minute', v_root);

    -- k = 3, the defaults (top-level only, removed rows too)
    select string_agg(replace(m.content, 'chat-latest probe: ', ''), ',' order by m.created_at desc)
      into got from public.chat_latest_per_channel(array[v_busy, v_quiet], 3) m;
    res := res || 'top3=' || coalesce(got, 'none') || ';';  want := want || 'top3=b2,b3,b4,q1;';
    -- k = 3, top-level and live only (the inbox's previews)
    select string_agg(replace(m.content, 'chat-latest probe: ', ''), ',' order by m.created_at desc)
      into got from public.chat_latest_per_channel(array[v_busy, v_quiet], 3, true, true) m;
    res := res || 'live3=' || coalesce(got, 'none') || ';';  want := want || 'live3=b3,b4,b5,q1;';
    -- k = 3, every row (the thread list's wide read)
    select string_agg(replace(m.content, 'chat-latest probe: ', ''), ',' order by m.created_at desc)
      into got from public.chat_latest_per_channel(array[v_busy, v_quiet], 3, false, false) m;
    res := res || 'all3=' || coalesce(got, 'none') || ';';  want := want || 'all3=b1,b2,b3,q1;';
    -- k clamped: 0 reads 1 per room, 50 reads at most 20 (here: all 9)
    select string_agg(replace(m.content, 'chat-latest probe: ', ''), ',' order by m.created_at desc)
      into got from public.chat_latest_per_channel(array[v_busy, v_quiet], 0) m;
    res := res || 'k0=' || coalesce(got, 'none') || ';';  want := want || 'k0=b2,q1;';
    select count(*)::text into got
      from public.chat_latest_per_channel(array[v_busy, v_quiet], 50, false, false) m;
    res := res || 'k50=' || got || ';';  want := want || 'k50=9;';
    -- today's shared window over the same two rooms: q1 falls out
    select string_agg(replace(x.content, 'chat-latest probe: ', ''), ',' order by x.created_at desc)
      into got
      from (select m.content, m.created_at from public.messages m
             where m.channel_id = any (array[v_busy, v_quiet]) and m.thread_root_id is null
             order by m.created_at desc limit 2 * 3) x;
    res := res || 'shared6=' || coalesce(got, 'none') || ';';  want := want || 'shared6=b2,b3,b4,b5,b6,b7;';

    raise exception using errcode = 'P0C39', message = res;
  exception when sqlstate 'P0C39' then
    state := sqlerrm;
  end;

  if state is distinct from want then
    raise exception 'chat-latest: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'chat-latest: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.messages where content like 'chat-latest probe:%')
     or exists (select 1 from public.channels where id in (v_busy, v_quiet)) then
    raise exception 'chat-latest: a probe row survived the post-check';
  end if;
  raise notice 'chat-latest: behaviour check passed: %', state;
end $$;

-- 5. tell PostgREST about the new function (delivered at commit) ----------------
notify pgrst, 'reload schema';

commit;
