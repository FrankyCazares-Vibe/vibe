-- ---------------------------------------------------------------------------
-- 20261024100000_org_join_request_notification.sql
--
-- PLAIN ENGLISH
-- Officers hear when someone asks to join their club (Club tools Arc + joining
-- made clear, Oct 22, 2026; handoffs/2026-10-22-club-tools-arc/PLAN.md
-- decision 5). When a student taps "Request to join", POST
-- /api/orgs/[slug]/join files the request and then writes one notification
-- per owner and officer: "<name> asked to join <club>", which opens Club
-- tools > Join requests. The notifications table only takes the types its
-- CHECK lists, so this file adds one more word to that list. Nothing else
-- changes: no column, no grant, no policy, no function, no row.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, catalog reads only: notifications exists, its type CHECK
--      reads EXACTLY as 20260930100000 left it (the latest definition;
--      nothing after it redefines it) or already as this file makes it (a
--      second run), no row holds a type outside the new list, and the
--      browser roles still can't INSERT or UPDATE a notification (T2,
--      20260922120000), so nobody but the service role can write the new
--      type.
--   2. notifications_type_check: the 8 values of 20260930100000, same order
--      (follow, connection, like, comment, mention, org_invite,
--      org_request_approved, event_cancelled), + 'org_join_request'. Dropped
--      and added in one transaction, so there is no moment without a CHECK.
--   3. POST-CHECK: the CHECK reads as written, and the grants are still as
--      T2 left them.
--   4. notify pgrst (harmless: no column changed, but PostgREST caches the
--      table's constraints with it).
--
-- THE ROW (written by the join route with the service role, B2 of the same
-- plan): user_id = an owner or officer of the club (never the requester, never
-- anyone in a block pair with the requester), actor_id = the requester,
-- org_id = the club; post_id, comment_id, message_id, event_title and
-- event_starts_at NULL. No shape CHECK, like org_invite: the readers render a
-- row whose club can't be read as "your club", and src/lib/orgs/
-- notification-orgs.ts drops one whose club was hidden or deleted. A club
-- delete cascades the rows away (notifications_org_id_fkey ON DELETE CASCADE),
-- and so does the requester's account delete (actor_id CASCADE).
--
-- PUSH. trg_push_on_notification (20260924120000) queues every type except
-- 'connection', so where push is installed the new row reaches push_outbox
-- with no change here (production has no push_outbox yet; nothing here
-- touches it). What the push says, and the send-time checks (still an
-- officer, the request still pending), live in src/lib/push.
--
-- NO GRANT, NO REVOKE. authenticated reads its own rows (table SELECT +
-- notifications_select_own), deletes them and marks them read (UPDATE on
-- read_at only); it holds no INSERT, so a student can't fake a join request
-- into an officer's Otto. The PRE-FLIGHT refuses a database where that isn't so.
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): the
-- PRE-FLIGHT accepts this file's own CHECK, and the swap only runs when the
-- CHECK isn't already the new one. LOCK: ACCESS EXCLUSIVE on notifications
-- while the new CHECK scans every row (one pass, milliseconds at today's
-- size); lock_timeout 5s makes the file fail whole instead of queueing behind
-- a long read. Run it again.
--
-- LIVE STATE: NOT READ by this batch (no database was touched, local or
-- production). The old CHECK below is copied from 20260930100000's own
-- POST-CHECK; the PRE-FLIGHT refuses a database whose CHECK reads any other
-- way, so a drifted catalog stops the file before it changes anything.
--
-- PRE-FLIGHT (read-only, on production, before applying; catalog and counts
-- only, never a person's row). Expected answers in brackets.
--   1. The CHECK today [the 8-value list, ending 'event_cancelled'::text]:
--     select pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.notifications'::regclass
--        and conname = 'notifications_type_check';
--   2. Rows by type (a count per type, no row) [only the 8 known types]:
--     select type, count(*) from public.notifications group by type order by type;
--   3. Who may write notifications [anon f|f, authenticated f|f]:
--     select r, has_table_privilege(r, 'public.notifications', 'insert'),
--            has_table_privilege(r, 'public.notifications', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--      (authenticated keeps UPDATE on read_at only, a column grant, which
--      has_table_privilege reads as f. A t here: do NOT apply, ask why first.)
--
-- HOW TO APPLY. Locally, through the unix socket:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261024100000_org_join_request_notification.sql
-- On production only the main session applies it, after Franky says yes,
-- with the connector's apply_migration (the body between begin and commit),
-- then renames the connector's auto-timestamp row in
-- supabase_migrations.schema_migrations to '20261024100000' /
-- 'org_join_request_notification'. Never `supabase db push`.
--
-- DEPLOY ORDER: either way round. Before this file, the join route's insert
-- is refused with 23514 (check_violation); the route logs that once and the
-- request itself still succeeds, so officers simply aren't told yet (they
-- still see the request in Club tools). After it, the rows land and render.
-- Old code never writes the new type, and the readers ignore it until the
-- new build serves.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The CHECK [the 9-value list, ending 'org_join_request'::text]:
--     select pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.notifications'::regclass
--        and conname = 'notifications_type_check';
--   2. Still no INSERT or UPDATE for the browser roles [anon f|f, authenticated f|f]:
--     (PRE-FLIGHT 3 again)
--
-- ROLLBACK (it deletes every join-request notice: the narrow CHECK refuses
-- them; the requests themselves stay in org_join_requests):
--   begin;
--   delete from public.notifications where type = 'org_join_request';
--   alter table public.notifications drop constraint notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check
--     check (type in ('follow', 'connection', 'like', 'comment', 'mention',
--                     'org_invite', 'org_request_approved', 'event_cancelled'));
--   delete from supabase_migrations.schema_migrations where version = '20261024100000';
--   notify pgrst, 'reload schema';
--   commit;
--   With the code that writes the type live, nothing else breaks: the insert
--   is refused again and the join route logs it and carries on.
--
-- NOT REHEARSED: this batch was told to apply nothing anywhere. Rehearse on
-- the local stack first (apply, POST-CHECK, apply again, ROLLBACK, apply).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  got text;
  bad text;
begin
  if to_regclass('public.notifications') is null then
    raise exception 'org-join-request: public.notifications is missing';
  end if;

  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check';
  if got is distinct from
       'CHECK ((type = ANY (ARRAY[''follow''::text, ''connection''::text, ''like''::text, ''comment''::text, ''mention''::text, ''org_invite''::text, ''org_request_approved''::text, ''event_cancelled''::text])))'
     and got is distinct from
       'CHECK ((type = ANY (ARRAY[''follow''::text, ''connection''::text, ''like''::text, ''comment''::text, ''mention''::text, ''org_invite''::text, ''org_request_approved''::text, ''event_cancelled''::text, ''org_join_request''::text])))'
  then
    raise exception 'org-join-request: notifications_type_check drifted: %; re-read it first',
      coalesce(got, '(missing)');
  end if;

  select string_agg(distinct type, ', ') into bad
    from public.notifications
   where type not in ('follow', 'connection', 'like', 'comment', 'mention',
                      'org_invite', 'org_request_approved', 'event_cancelled',
                      'org_join_request');
  if bad is not null then
    raise exception 'org-join-request: rows hold types outside the new list: %', bad;
  end if;

  -- Grants exactly as T2 (20260922120000) left them: only the service role
  -- writes a notification, so only the join route can write this type.
  if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
     or has_table_privilege('anon', 'public.notifications', 'INSERT')
     or has_table_privilege('anon', 'public.notifications', 'UPDATE') then
    raise exception 'org-join-request: a browser role can write notifications; ask why before widening the type list';
  end if;

  raise notice 'org-join-request: pre-flight ok (%)',
    case when got like '%org_join_request%' then 'already applied' else 'CHECK as 20260930100000 left it' end;
end $$;

-- 2. THE WIDER TYPE CHECK: 20260930100000's 8 values, same order, + one ------
-- In a DO block so a second run (the CHECK already the new one) neither
-- drops nor re-scans anything.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notifications'::regclass
       and conname = 'notifications_type_check'
       and pg_get_constraintdef(oid) like '%''org_join_request''::text%'
  ) then
    alter table public.notifications drop constraint notifications_type_check;
    alter table public.notifications
      add constraint notifications_type_check
      check (type in ('follow', 'connection', 'like', 'comment', 'mention',
                      'org_invite', 'org_request_approved', 'event_cancelled',
                      'org_join_request'));
  end if;
end $$;

comment on constraint notifications_type_check on public.notifications is
  'The notification types. org_join_request (20261024100000): "<requester> asked to join <club>", one row per owner and officer, actor_id = the requester, org_id = the club; written by POST /api/orgs/[slug]/join (service role) only.';

-- 3. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got text;
  bad text := '';
begin
  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass
     and c.conname = 'notifications_type_check';
  if got is distinct from
     'CHECK ((type = ANY (ARRAY[''follow''::text, ''connection''::text, ''like''::text, ''comment''::text, ''mention''::text, ''org_invite''::text, ''org_request_approved''::text, ''event_cancelled''::text, ''org_join_request''::text])))'
  then
    bad := bad || format(' notifications_type_check reads "%s";', coalesce(got, '(missing)'));
  end if;

  if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
     or has_table_privilege('anon', 'public.notifications', 'INSERT')
     or has_table_privilege('anon', 'public.notifications', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') then
    bad := bad || ' notifications grants are not as T2 left them;';
  end if;

  if bad <> '' then
    raise exception 'org-join-request post-check failed:%', bad;
  end if;
  raise notice 'org-join-request: post-check ok';
end $$;

-- 4. -------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
