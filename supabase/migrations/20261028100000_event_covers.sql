-- ---------------------------------------------------------------------------
-- 20261028100000_event_covers.sql
--
-- PLAIN ENGLISH
-- A cover photo on a club event (Oct 23, 2026; club view wave 3, event
-- covers, batch B1: handoffs/2026-10-23-club-view-wave-3/COVERS-PLAN.md).
-- Franky: "make it to where you can upload photos for the event". An officer
-- adds, changes or removes a cover when making or editing an event; the
-- event card shows it across the top, and the icon (20261027100000) stays
-- the fallback when there is none. Covers follow the club banner's path:
-- the picture goes straight to storage on a signed link (upload-url, kind
-- "event-cover"), and the database keeps only the storage KEY,
-- `orgs/<org_id>/events/<uuid>.<ext>`, never a URL. This file adds the
-- column that holds it, events.cover_key (text, null = none), and the
-- rule that a key must be one of THAT event's club's covers
-- (events_check_cover_key), so no writer can point an event at another
-- club's file, a banner, a post's media or a hidden club's folder. The
-- picture route (GET /api/events/[id]/cover) reads the event with the
-- viewer's own client, so event_visible decides who sees a cover exactly as
-- it decides who sees the event. The Privacy Policy names the cover the day
-- this ships.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, catalog reads only: events exists, row level security
--      on; events.org_id is a uuid; the browser roles can't INSERT or
--      UPDATE events (POST and PATCH /api/events, with the service role,
--      stay the only writers of the new column); authenticated holds a
--      table-wide SELECT (GET's read on the viewer's client reads the new
--      column like every other); an existing `cover_key` column is exactly
--      this file's (text, nullable, no default) and no CHECK names it; the
--      two function names and the trigger name this file makes are free,
--      or (a second run) the trigger is exactly this file's.
--   2. events.cover_key text, nullable, no default: a catalog change only,
--      no table rewrite; every event reads null (no cover).
--   3. public.event_cover_key_ok(key, org_id): IMMUTABLE, empty search_path,
--      reads no table. True for null, or for a key that is
--      orgs/<org_id>/events/<one file>: letters, digits, `.`, `_`, `-`, not
--      starting with a dot, no `..`, ending .jpg, .png or .webp, at most
--      1024 characters. A null club has no folder, so only null passes. The
--      code's own check (isEventCoverKey, src/lib/events/event-cover-url.ts)
--      is stricter (the file is exactly <uuid>.<ext>): a key the routes take
--      always passes here.
--   4. public.events_check_cover_key(): a BEFORE INSERT OR UPDATE OF
--      cover_key trigger (SECURITY INVOKER; it reads only NEW and OLD, so
--      every writer is covered, the service role included). A key is checked
--      on INSERT, and on UPDATE only when it changes; a refusal is SQLSTATE
--      23514 (check_violation), hint cover_not_owned. Not re-checked when
--      only org_id changes (PATCH refuses that, and a club's deletion takes
--      its events with it: events_org_id_fkey ON DELETE CASCADE).
--   5. Comments on the column and both functions.
--   6. POST-CHECK: the column, the trigger (enabled, the only one of its
--      name, this definition), the helpers (IMMUTABLE INVOKER, empty
--      search_path), the helper's answers to the attack and to the app's own
--      keys, the grants as before; then notify pgrst.
--
-- THE EXTENSIONS must equal EVENT_COVER_EXTENSIONS in
-- src/lib/events/event-cover-url.ts (jpg, png, webp, the types upload-url
-- signs for a cover). src/lib/events/event-cover-url.test.ts reads this file
-- and fails when the two drift.
--
-- NO DATA CHANGE, NO GRANT OR REVOKE ON A TABLE, NO POLICY. No row is
-- written. event_visible (events_select_visible) already decides who reads
-- an event's row; the cover key is one more column of it. EXECUTE on the
-- pure helper goes to anon, authenticated and service_role (20260927120000's
-- standing rule for pure helpers); the trigger function's EXECUTE is revoked
-- from public, anon and authenticated (it is never called directly).
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): add
-- column if not exists, create or replace for the two functions (the same
-- bodies), the trigger only when absent, and a pre-flight that accepts this
-- file's own column and trigger. LOCK: ACCESS EXCLUSIVE on events for
-- milliseconds (the column), then SHARE ROW EXCLUSIVE (the trigger), until
-- commit; lock_timeout 5s makes the file fail whole instead of queueing
-- behind a long read; run it again.
--
-- PRE-FLIGHT on PRODUCTION (read-only; catalog and counts only, never an
-- event's row). Expected answers in brackets; any other answer: STOP, ask.
--   1. Not applied yet [f | 0 | 0]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.events'::regclass
--                     and attname = 'cover_key' and not attisdropped),
--            (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--              and proname in ('event_cover_key_ok', 'events_check_cover_key')),
--            (select count(*) from pg_trigger where tgname = 'events_check_cover_key');
--   2. Who may write events [anon f|f, authenticated f|f]:
--     select r, has_table_privilege(r, 'public.events', 'insert'),
--            has_any_column_privilege(r, 'public.events', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--      (A t there: do NOT apply, ask why first.)
--   3. Who reads events [authenticated t, row level security t]:
--     select has_table_privilege('authenticated', 'public.events', 'select'),
--            relrowsecurity from pg_class where oid = 'public.events'::regclass;
--   4. The club column and the triggers there today [uuid | chat_events_room]:
--     select format_type(atttypid, atttypmod) from pg_attribute
--      where attrelid = 'public.events'::regclass and attname = 'org_id' and not attisdropped;
--     select string_agg(tgname, ', ' order by tgname) from pg_trigger
--      where tgrelid = 'public.events'::regclass and not tgisinternal;
--   5. How many events (every one reads null after) [a count]:
--     select count(*) from public.events;
--
-- HOW TO APPLY. Locally, through the unix socket (one builder at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261028100000_event_covers.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261028100000', 'event_covers') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the connector's apply_migration (the body between
-- begin and commit), then renames the connector's auto-timestamp row in
-- supabase_migrations.schema_migrations to '20261028100000' /
-- 'event_covers'.
--
-- DEPLOY ORDER: THIS FILE FIRST, then the code. The new code selects
-- `cover_key` (EVENT_ROW_COLUMNS in src/lib/events/event-item.ts); on a
-- database without it every events list, create, edit and cancel answers
-- 500 (GET and POST /api/events; PATCH and DELETE /api/events/[id], whose
-- officer read selects the same columns), and the cover route answers 500.
-- The old code on the new database is fine: it never writes the column
-- (every event it makes has none) and reads nothing it can't see.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The column [cover_key | text | f | null]:
--     select a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.events'::regclass and a.attname = 'cover_key' and not a.attisdropped;
--   2. The trigger [ONE row: CREATE TRIGGER events_check_cover_key BEFORE
--      INSERT OR UPDATE OF cover_key ON public.events FOR EACH ROW EXECUTE
--      FUNCTION events_check_cover_key() | O]:
--     select pg_get_triggerdef(oid), tgenabled from pg_trigger where tgname = 'events_check_cover_key';
--   3. The rule's answers [t | f | f | f]:
--     select public.event_cover_key_ok(null, null),
--            public.event_cover_key_ok('orgs/' || gen_random_uuid() || '/events/a.jpg', gen_random_uuid()),
--            public.event_cover_key_ok('orgs/x/banner/a.jpg', null),
--            public.event_cover_key_ok('https://example.com/a.jpg', gen_random_uuid());
--   4. Every event still without one [PRE-FLIGHT 5's count | 0]:
--     select count(*), count(*) filter (where cover_key is not null) from public.events;
--   5. The grants as before [PRE-FLIGHT 2 and 3's answers].
--
-- ROLLBACK (one transaction; run it only after the code that reads and
-- writes `cover_key` is rolled back, or every events read answers 500).
-- Every event's cover is lost from the app (the files stay in storage until
-- their club is deleted); count them first [a count]:
--   select count(*) from public.events where cover_key is not null;
-- then run:
--   begin;
--   set local lock_timeout = '5s';
--   drop trigger if exists events_check_cover_key on public.events;
--   drop function if exists public.events_check_cover_key();
--   drop function if exists public.event_cover_key_ok(text, uuid);
--   alter table public.events drop column if exists cover_key;
--   delete from supabase_migrations.schema_migrations where version = '20261028100000';
--   notify pgrst, 'reload schema';
--   commit;
--   (Dropping the column drops its comment with it. PRE-FLIGHT 1 then reads
--   f | 0 | 0 again.)
--
-- REHEARSED on the local stack on Oct 23, 2026 (batch B1): PRE-FLIGHT 1-5
-- [f | 0 | 0; anon f|f, authenticated f|f; t | t; uuid | chat_events_room;
-- 19]. Applied: pre-flight ok (not applied yet), post-check ok; applied
-- again: pre-flight ok (applied before), the column skipped, post-check ok;
-- the schema_migrations row. POST-CHECK 1-5 [cover_key | text | f | null;
-- the trigger, O; t | f | f | f; 19 | 0; the grants as before], the trigger
-- function's EXECUTE gone from anon and authenticated (service_role keeps
-- it). Probes inside BEGIN ... ROLLBACK: the club's own .jpg saved, a title
-- edit re-sending the same key passed, null cleared it, a .png on a new
-- event saved; another club's folder, the club's banner folder, an .mp4 and
-- a key on an event with no club refused (23514, cover_not_owned);
-- authenticated (a member of the event's club) reads cover_key and its
-- UPDATE is refused (permission denied), anon reads nothing. The pre-flight
-- stopped the file, changing nothing, on a CHECK naming the column, a
-- same-named function before the column existed, an UPDATE granted to
-- authenticated and a trigger of the same name that wasn't this file's
-- (each set up inside a transaction that rolled back). The ROLLBACK above,
-- with one event's cover set first [count 1]: column, functions, trigger
-- and row gone, PRE-FLIGHT 1 f | 0 | 0. Then the body as ONE query string
-- without begin/commit, the connector's shape (an implicit transaction:
-- lock_timeout took, no warning), the row, and the whole file once more:
-- left alone. The local stack keeps it applied, with its row.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT (catalog reads only) ------------------------------------------------
do $$
declare
  trig_def constant text :=
    'CREATE TRIGGER events_check_cover_key BEFORE INSERT OR UPDATE OF cover_key ON public.events '
    'FOR EACH ROW EXECUTE FUNCTION %events_check_cover_key()';
  applied boolean;
  got text;
begin
  if to_regclass('public.events') is null then
    raise exception 'event-covers: public.events is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.events'::regclass) then
    raise exception 'event-covers: row level security is off on events';
  end if;
  select format_type(atttypid, atttypmod) into got from pg_attribute
   where attrelid = 'public.events'::regclass and attname = 'org_id' and not attisdropped;
  if got is distinct from 'uuid' then
    raise exception 'event-covers: events.org_id reads "%", not uuid', coalesce(got, '(missing)');
  end if;
  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    raise exception 'event-covers: a browser role can write events; the routes must stay the only writers';
  end if;
  -- Table-wide, not per column: a per-column grant would leave the new
  -- column unreadable to GET /api/events's viewer-client read (a 500).
  if not has_table_privilege('authenticated', 'public.events', 'SELECT') then
    raise exception 'event-covers: authenticated holds no table-wide SELECT on events';
  end if;

  -- A second run: the column must be the one this file makes.
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.events'::regclass and a.attname = 'cover_key' and not a.attisdropped;
  if got is not null and got <> 'text' then
    raise exception 'event-covers: events.cover_key already exists as "%"', got;
  end if;
  applied := got is not null;

  -- The trigger is the column's one rule: a CHECK naming it would refuse
  -- keys the code offers, and the post-check alone wouldn't see why.
  select string_agg(c.conname, ', ' order by c.conname) into got
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.events'::regclass and c.contype = 'c' and a.attname = 'cover_key';
  if got is not null then
    raise exception 'event-covers: a CHECK names events.cover_key: %', got;
  end if;

  -- The names this file makes: free on a first run (anything there is
  -- someone else's and would be replaced); on a second, the trigger must
  -- be this file's (the functions are replaced with the same bodies).
  select string_agg(p.proname, ', ' order by p.proname) into got from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('event_cover_key_ok', 'events_check_cover_key');
  if got is not null and not applied then
    raise exception 'event-covers: function name(s) already taken: %; stop and re-read them', got;
  end if;
  select string_agg(format('%s on %s', t.tgname, t.tgrelid::regclass), ', ') into got
    from pg_trigger t
   where t.tgname = 'events_check_cover_key'
     and not (applied and t.tgrelid = 'public.events'::regclass
              and t.tgfoid = to_regprocedure('public.events_check_cover_key()')
              and pg_get_triggerdef(t.oid) like trig_def);
  if got is not null then
    raise exception 'event-covers: a trigger named events_check_cover_key is not this file''s: %', got;
  end if;

  raise notice 'event-covers: pre-flight ok (%)',
    case when applied then 'applied before; running again' else 'not applied yet' end;
end $$;

-- 2. THE COLUMN ---------------------------------------------------------------------
alter table public.events
  add column if not exists cover_key text;

-- 3. THE RULE: is this key one of this club's event covers? -------------------------
-- Pure: reads no table. The same folder rule as isEventCoverKey in
-- src/lib/events/event-cover-url.ts, a little looser about the file name.
create or replace function public.event_cover_key_ok(p_key text, p_org_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_key is null
      or coalesce(
           p_org_id is not null
       and length(p_key) <= 1024
       and strpos(p_key, '..') = 0
       and starts_with(p_key, 'orgs/' || p_org_id::text || '/events/')
       and substr(p_key, length('orgs/' || p_org_id::text || '/events/') + 1)
           ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(jpg|png|webp)$',
         false);
$$;

-- 20260927120000's standing rule: every role that could reach a pure helper
-- may call it.
grant execute on function public.event_cover_key_ok(text, uuid)
  to anon, authenticated, service_role;

-- 4. THE TRIGGER ----------------------------------------------------------------------
-- The key is checked on INSERT, and on UPDATE only when it changes.
create or replace function public.events_check_cover_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.cover_key is distinct from old.cover_key)
     and not public.event_cover_key_ok(new.cover_key, new.org_id) then
    raise exception using
      errcode = '23514',
      message = 'events.cover_key must be empty or a cover uploaded for this event''s club',
      hint = 'cover_not_owned';
  end if;
  return new;
end;
$$;

-- Trigger functions are never called directly (20260916130000's pattern).
revoke all on function public.events_check_cover_key() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.events'::regclass and tgname = 'events_check_cover_key') then
    create trigger events_check_cover_key
      before insert or update of cover_key on public.events
      for each row execute function public.events_check_cover_key();
  end if;
end $$;

-- 5. THE COMMENTS ---------------------------------------------------------------------
comment on column public.events.cover_key is
  'The storage key of an event''s cover photo (Oct 23, 2026; 20261028100000): orgs/<org_id>/events/<uuid>.<jpg|png|webp>, written by POST/PATCH /api/events (service role) from an upload-url "event-cover" link, or null for none. Never a URL: GET /api/events/<id>/cover signs a short-lived link after event_visible. events_check_cover_key holds the folder rule.';
comment on function public.event_cover_key_ok(text, uuid) is
  'Event covers (20261028100000): true for null, or for orgs/<p_org_id>/events/<one safe file>.<jpg|png|webp> (no "..", <= 1024 chars). Pure. The code''s isEventCoverKey (src/lib/events/event-cover-url.ts) is the same rule, stricter about the file name.';
comment on function public.events_check_cover_key() is
  'Event covers (20261028100000): BEFORE INSERT OR UPDATE OF cover_key on events; refuses (23514, hint cover_not_owned) a new or changed key event_cover_key_ok refuses.';

-- 6. POST-CHECK -----------------------------------------------------------------------
do $$
declare
  trig_def constant text :=
    'CREATE TRIGGER events_check_cover_key BEFORE INSERT OR UPDATE OF cover_key ON public.events '
    'FOR EACH ROW EXECUTE FUNCTION %events_check_cover_key()';
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  file constant text := '3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6';
  got text;
  bad text := '';
begin
  select format('%s%s%s', format_type(at.atttypid, at.atttypmod),
                case when at.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute at left join pg_attrdef d on d.adrelid = at.attrelid and d.adnum = at.attnum
   where at.attrelid = 'public.events'::regclass and at.attname = 'cover_key' and not at.attisdropped;
  if got is distinct from 'text' then
    bad := bad || format(' events.cover_key reads "%s";', coalesce(got, '(missing)'));
  end if;

  if (select count(*) from pg_trigger t
       where t.tgrelid = 'public.events'::regclass and t.tgname = 'events_check_cover_key'
         and t.tgenabled = 'O' and not t.tgisinternal
         and t.tgfoid = to_regprocedure('public.events_check_cover_key()')
         and pg_get_triggerdef(t.oid) like trig_def) <> 1 then
    bad := bad || ' events_check_cover_key is missing, disabled or not this file''s;';
  end if;

  select string_agg(p.proname, ', ') into got from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('event_cover_key_ok', 'events_check_cover_key')
     and (p.prosecdef or p.proconfig is distinct from array['search_path=""']
          or (p.proname = 'event_cover_key_ok'
              and (p.provolatile <> 'i'
                   or not has_function_privilege('authenticated', p.oid, 'execute')
                   or not has_function_privilege('service_role', p.oid, 'execute')))
          or (p.proname = 'events_check_cover_key'
              and has_function_privilege('authenticated', p.oid, 'execute')));
  if got is not null then
    bad := bad || format(' helper(s) not as this file writes them: %s;', got);
  end if;

  -- The attack: another club's cover, a banner, a post's media, a URL, a
  -- nested path, traversal, another type, no club; and the app's own keys.
  if public.event_cover_key_ok('orgs/' || b || '/events/' || file || '.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/banner/' || file || '.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/posts/' || file || '.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/sub/' || file || '.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/../' || b || '/events/x.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.mp4', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.gif', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/.jpg', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.JPG', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.jpg', null)
     or public.event_cover_key_ok('https://rqopjkimxbjkwdkpkbfq.supabase.co/' || file || '.jpg', a)
     or public.event_cover_key_ok('clips/' || a || '/' || file || '.jpg', a)
     or public.event_cover_key_ok('', a)
     or public.event_cover_key_ok('orgs/' || a || '/events/' || repeat('x', 1024) || '.jpg', a) then
    bad := bad || ' event_cover_key_ok accepted a key it must refuse;';
  end if;
  if not (public.event_cover_key_ok(null, a)
          and public.event_cover_key_ok(null, null)
          and public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.jpg', a)
          and public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.png', a)
          and public.event_cover_key_ok('orgs/' || a || '/events/' || file || '.webp', a)) then
    bad := bad || ' event_cover_key_ok refused a key the app writes;';
  end if;

  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    bad := bad || ' a browser role can write events;';
  end if;
  if not has_column_privilege('authenticated', 'public.events', 'cover_key', 'SELECT') then
    bad := bad || ' authenticated cannot read events.cover_key;';
  end if;

  if bad <> '' then
    raise exception 'event-covers post-check failed:%', bad;
  end if;
  raise notice 'event-covers: post-check ok';
end $$;

-- 7. ---------------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
