-- S68 officer tools, batch B1 (contract C1, handoffs/wave-plan-s68/officer-tools.md):
-- a notification that says "{club} cancelled {event}".
--
-- WHY THIS EXISTS. Franky's calls (Sept 28): cancelling or deleting a club
-- event that hasn't ended removes it for everyone AND tells everyone who
-- RSVP'd (going or maybe), from the club, never naming the officer. The row
-- has to outlive the event (rsvps and the event are gone the moment the
-- DELETE commits), so it carries its own copy of the title and start time
-- instead of an event_id.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: notifications_type_check reads exactly as LIVE STATE says
--      (by fingerprint), the new column and constraint names are free, and no
--      row holds a type outside the new list.
--   2. notifications.event_title text (NULL, or 1..120 characters, the same
--      cap as events.title) and notifications.event_starts_at timestamptz.
--      Both nullable: every existing type leaves them NULL.
--   3. notifications_type_check: the 7 types of
--      20260916103000_org_join_policy_invites.sql (the latest definition, line
--      870; nothing after it redefines it), same order, + 'event_cancelled'.
--   4. notifications_event_cancelled_shape: an event_cancelled row names its
--      club, the event's title and its start. Row shape (DELETE
--      /api/events/[id], src/lib/events/notify-cancel.ts): user_id = the
--      student who RSVP'd, actor_id = the officer (NOT NULL; never displayed),
--      org_id = the club, event_title, event_starts_at; post_id, comment_id,
--      message_id NULL.
--   5. POST-CHECK: every definition reads as written, the grants are still
--      as T2 left them, and BY BEHAVIOUR in a subtransaction that rolls
--      itself back: a well-formed event_cancelled row inserts, one without
--      event_title is refused, a 'follow' row still inserts.
--   6. notify pgrst, 'reload schema' (the new columns are written over REST).
--
-- DOES NOT: touch grants or policies. Inserts stay service-role only: T2
-- (20260922120000) revoked INSERT/UPDATE from authenticated and gave back
-- UPDATE (read_at) only, so the new columns are readable by the recipient
-- (table SELECT + notifications_select_own) and writable by nobody but the
-- service role. No index (rows are read by user_id, as today). The push
-- trigger (trg_push_on_notification) already queues every type except
-- 'connection', so a cancel notice reaches the push outbox with no change
-- here; what the push SAYS is src/lib/push (batch B2).
-- A club delete cascades these rows away (notifications_org_id_fkey ON DELETE
-- CASCADE), and so does the officer's account delete (actor_id CASCADE).
--
-- LIVE STATE (local stack, 2026-09-28; production was not read by this batch:
-- the orchestrator re-reads it before applying, and the PRE-FLIGHT refuses a
-- drifted definition anyway):
--   * md5(pg_get_constraintdef) of notifications_type_check =
--     145524a898154df5dff9316e1373ad70, i.e. CHECK ((type = ANY (ARRAY[
--     'follow', 'connection', 'like', 'comment', 'mention', 'org_invite',
--     'org_request_approved'])))
--   * notifications columns: id, user_id, actor_id, type, post_id,
--     comment_id, read_at, created_at, message_id, org_id.
--   * authenticated: SELECT, DELETE, UPDATE (read_at). anon: nothing.
--   * One trigger: trg_push_on_notification (AFTER INSERT).
--
-- APPLY ORDER vs THE DEPLOY: BEFORE the deploy. Old code never writes or
-- reads the new type or columns. New code before this file: the event is
-- still deleted, the notice insert is refused (23514 / missing column), the
-- route logs it and answers { ok: true, notified: 0, notify_failed: true }.
-- Apply with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260930100000', 'event_cancel_notices');
--
-- CHECK AFTER APPLYING (read-only):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';
--
-- ROLLBACK (after reverting the code that writes event_cancelled; the
-- notices themselves go, since the narrow CHECK refuses them):
--   BEGIN;
--   DELETE FROM public.notifications WHERE type = 'event_cancelled';
--   ALTER TABLE public.notifications DROP CONSTRAINT notifications_event_cancelled_shape;
--   ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
--   ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--     CHECK (type IN ('follow','connection','like','comment','mention',
--                     'org_invite','org_request_approved'));
--   ALTER TABLE public.notifications DROP COLUMN event_title;      -- drops its CHECK
--   ALTER TABLE public.notifications DROP COLUMN event_starts_at;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260930100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ADD COLUMN (no default) is a catalog change, but DROP/ADD CONSTRAINT holds
-- ACCESS EXCLUSIVE on notifications until COMMIT and re-checks every row.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  fp  text;
  bad text;
begin
  select md5(pg_get_constraintdef(oid)) into fp
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check';
  if fp is distinct from '145524a898154df5dff9316e1373ad70' then
    raise exception 'event-cancel: notifications_type_check drifted (md5 %): %; re-read it first',
      coalesce(fp, '(missing)'),
      coalesce((select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid = 'public.notifications'::regclass
                   and conname = 'notifications_type_check'), '(missing)');
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notifications'
                and column_name in ('event_title', 'event_starts_at')) then
    raise exception 'event-cancel: notifications already has event_title or event_starts_at';
  end if;

  if exists (select 1 from pg_constraint
              where conrelid = 'public.notifications'::regclass
                and conname in ('notifications_event_title_length',
                                'notifications_event_cancelled_shape')) then
    raise exception 'event-cancel: a constraint name this file adds is taken';
  end if;

  select string_agg(distinct type, ', ') into bad
    from public.notifications
   where type not in ('follow', 'connection', 'like', 'comment', 'mention',
                      'org_invite', 'org_request_approved', 'event_cancelled');
  if bad is not null then
    raise exception 'event-cancel: rows hold types outside the new list: %', bad;
  end if;
end $$;

-- 1. the two columns ----------------------------------------------------------
alter table public.notifications
  add column event_title text,
  add column event_starts_at timestamptz;

-- Same cap as events_title_length (20260928110000). The route copies the
-- event's own title, which already passed that CHECK, so this never refuses
-- a real notice; it stops anything else from parking a novel here.
alter table public.notifications
  add constraint notifications_event_title_length
  check (event_title is null
         or (char_length(event_title) >= 1 and char_length(event_title) <= 120));

comment on column public.notifications.event_title is
  'event_cancelled only: the cancelled event''s title, copied at cancel time (the event row is gone by then). 1..120 characters, like events.title. NULL for every other type. Written by the service role only (DELETE /api/events/[id]).';
comment on column public.notifications.event_starts_at is
  'event_cancelled only: when the cancelled event was due to start, copied at cancel time. NULL for every other type. Written by the service role only (DELETE /api/events/[id]).';

-- 2. the wider type CHECK: 20260916103000's 7 values, same order, + one -------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow', 'connection', 'like', 'comment', 'mention',
                  'org_invite', 'org_request_approved', 'event_cancelled'));

-- 3. what a cancel notice must carry (contract C1, word for word) -------------
alter table public.notifications
  add constraint notifications_event_cancelled_shape
  check (type <> 'event_cancelled'
         or (org_id is not null and event_title is not null and event_starts_at is not null));

comment on constraint notifications_event_cancelled_shape on public.notifications is
  'An event_cancelled notice names its club (org_id), the event title and its start. actor_id is the officer who cancelled; it is never displayed (the notice is from the club).';

-- 4. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got   text;
  uid   uuid;
  oid_  uuid;
  state text;
begin
  select pg_get_constraintdef(oid) into got from pg_constraint
   where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
  if got is distinct from
     'CHECK ((type = ANY (ARRAY[''follow''::text, ''connection''::text, ''like''::text, ''comment''::text, ''mention''::text, ''org_invite''::text, ''org_request_approved''::text, ''event_cancelled''::text])))'
  then
    raise exception 'event-cancel: the type CHECK does not read as written: %', coalesce(got, '(missing)');
  end if;

  select pg_get_constraintdef(oid) into got from pg_constraint
   where conrelid = 'public.notifications'::regclass and conname = 'notifications_event_cancelled_shape';
  if got is distinct from
     'CHECK (((type <> ''event_cancelled''::text) OR ((org_id IS NOT NULL) AND (event_title IS NOT NULL) AND (event_starts_at IS NOT NULL))))'
  then
    raise exception 'event-cancel: the shape CHECK does not read as written: %', coalesce(got, '(missing)');
  end if;

  select pg_get_constraintdef(oid) into got from pg_constraint
   where conrelid = 'public.notifications'::regclass and conname = 'notifications_event_title_length';
  if got is distinct from
     'CHECK (((event_title IS NULL) OR ((char_length(event_title) >= 1) AND (char_length(event_title) <= 120))))'
  then
    raise exception 'event-cancel: the title CHECK does not read as written: %', coalesce(got, '(missing)');
  end if;

  -- Grants exactly as T2 left them: students read and delete their own rows
  -- and mark them read. Nobody but the service role writes a notice.
  if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notifications', 'event_title', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notifications', 'event_starts_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notifications', 'event_title', 'INSERT')
     or has_table_privilege('anon', 'public.notifications', 'SELECT')
     or not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') then
    raise exception 'event-cancel: notifications grants are not as T2 left them';
  end if;

  -- BY BEHAVIOUR, against any real student and club (the foreign keys need
  -- real ids). The probes are undone by raising a private SQLSTATE at the end
  -- of the inner block, which rolls the subtransaction back: the rows and any
  -- push_outbox row the trigger queued for them. An empty database (a fresh
  -- local stack) has nothing to point at, so the probe is skipped there.
  select id into uid from public.users order by created_at limit 1;
  select id into oid_ from public.orgs order by created_at limit 1;
  if uid is null or oid_ is null then
    raise notice 'event-cancel: no user or org to probe with; behaviour check skipped';
  else
    begin
      insert into public.notifications (user_id, actor_id, type, org_id, event_title, event_starts_at)
      values (uid, uid, 'event_cancelled', oid_, 'Probe event', now() + interval '1 day');
      insert into public.notifications (user_id, actor_id, type) values (uid, uid, 'follow');
      begin
        insert into public.notifications (user_id, actor_id, type, org_id, event_starts_at)
        values (uid, uid, 'event_cancelled', oid_, now() + interval '1 day');
        state := 'accepted';
      exception when check_violation then
        state := 'refused';
      end;
      raise exception using errcode = 'P0C11', message = coalesce(state, 'none');
    exception when sqlstate 'P0C11' then
      state := sqlerrm;
    end;
    if state is distinct from 'refused' then
      raise exception 'event-cancel: a cancel notice without a title was % by the shape CHECK', state;
    end if;
    if exists (select 1 from public.notifications where event_title = 'Probe event') then
      raise exception 'event-cancel: a probe row survived the post-check';
    end if;
  end if;
end $$;

-- 5. tell PostgREST about the new columns (delivered at commit) ---------------
notify pgrst, 'reload schema';

commit;
