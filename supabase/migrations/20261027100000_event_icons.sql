-- ---------------------------------------------------------------------------
-- 20261027100000_event_icons.sql
--
-- PLAIN ENGLISH
-- An icon on every club event (Oct 23, 2026; club view wave 3, Part 2,
-- batch B4: handoffs/2026-10-23-club-view-wave-3/PLAN.md). Franky's build
-- order asks for "a picture or a simple icon on every event", icons first.
-- An officer may pick one of twelve (Meeting, Social, Food, Music, Sports,
-- Games, Study, Talk, Service, Arts, Trip, Party) when making or editing an
-- event; the event card and the club's past events show it in a small
-- tile. No icon picked is the calendar, as every event looks today. This
-- file adds the column that holds the pick, events.icon (text, null =
-- none), and one rule naming the twelve keys (events_icon_check). The
-- shapes live in code (src/lib/events/event-icons.ts); the database holds
-- only the key, never an SVG, a URL or CSS (a string a page draws can
-- beacon a reader's address: 20260912100000's lesson). The Privacy Policy
-- names the icon among what a club's event shows, the day this ships.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, catalog reads only: events exists, row level security
--      on; the browser roles can't INSERT or UPDATE it (POST and PATCH
--      /api/events, with the service role, stay the only writers of the new
--      column); authenticated holds a table-wide SELECT (so GET's read on
--      the viewer's client reads the new column like every other); an
--      existing `icon` column is exactly this file's (text, nullable, no
--      default); an existing events_icon_check reads exactly as this file
--      writes it; no other CHECK names the column.
--   2. events.icon text, nullable, no default: a catalog change only, no
--      table rewrite; every event reads null (the calendar).
--   3. events_icon_check: icon in the twelve keys. A null passes a CHECK,
--      so "none" needs no arm of its own. Added only when absent; adding it
--      checks every row (one scan of a small table, all null).
--   4. A comment on the column and one on the rule, naming the code list.
--   5. POST-CHECK: the column, the rule (validated, the only CHECK on the
--      column), the grants as before; then notify pgrst.
--
-- THE LIST must equal EVENT_ICON_KEYS in src/lib/events/event-icons.ts, in
-- its order. src/lib/events/event-icons.test.ts reads this file and fails
-- when the two drift.
--
-- NO DATA CHANGE, NO GRANT, NO REVOKE, NO FUNCTION, NO POLICY. No row is
-- written. event_visible (events_select_visible) already decides who reads
-- an event's row; the icon is one more column of it.
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): add
-- column if not exists, the rule only when absent, and a pre-flight that
-- accepts this file's own column and rule. LOCK: ACCESS EXCLUSIVE on events
-- for milliseconds (the column, then the rule and its scan); lock_timeout
-- 5s makes the file fail whole instead of queueing behind a long read; run
-- it again.
--
-- PRE-FLIGHT on PRODUCTION (read-only; catalog and counts only, never an
-- event's row). Expected answers in brackets; any other answer: STOP, ask.
--   1. Not applied yet [f | 0]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.events'::regclass
--                     and attname = 'icon' and not attisdropped),
--            (select count(*) from pg_constraint where conrelid = 'public.events'::regclass
--              and conname = 'events_icon_check');
--   2. Who may write events [anon f|f, authenticated f|f]:
--     select r, has_table_privilege(r, 'public.events', 'insert'),
--            has_any_column_privilege(r, 'public.events', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--      (A t there: do NOT apply, ask why first.)
--   3. Who reads events [authenticated t, row level security t]:
--     select has_table_privilege('authenticated', 'public.events', 'select'),
--            relrowsecurity from pg_class where oid = 'public.events'::regclass;
--   4. How many events (every one reads null after) [a count]:
--     select count(*) from public.events;
--
-- HOW TO APPLY. Locally, through the unix socket (one builder at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261027100000_event_icons.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261027100000', 'event_icons') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the connector's apply_migration (the body between
-- begin and commit), then renames the connector's auto-timestamp row in
-- supabase_migrations.schema_migrations to '20261027100000' /
-- 'event_icons'.
--
-- DEPLOY ORDER: THIS FILE FIRST, then the code. The new code selects
-- `icon` (EVENT_ROW_COLUMNS in src/lib/events/event-item.ts); on a database
-- without it every events list, create, edit and cancel answers 500 (GET
-- and POST /api/events; PATCH and DELETE /api/events/[id], whose officer
-- read selects the same columns). The old code
-- on the new database is fine: it never writes the column (every event it
-- makes has none) and reads nothing it can't see.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The column [icon | text | f | null]:
--     select a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.events'::regclass and a.attname = 'icon' and not a.attisdropped;
--   2. Its rule, the only one [ONE row: events_icon_check |
--      CHECK ((icon = ANY (ARRAY['meeting'::text, 'social'::text,
--      'food'::text, 'music'::text, 'sports'::text, 'games'::text,
--      'study'::text, 'talk'::text, 'service'::text, 'arts'::text,
--      'trip'::text, 'party'::text]))) | t]:
--     select c.conname, pg_get_constraintdef(c.oid), c.convalidated
--       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
--      where c.conrelid = 'public.events'::regclass and c.contype = 'c' and a.attname = 'icon';
--   3. Every event still without one [PRE-FLIGHT 4's count | 0]:
--     select count(*), count(*) filter (where icon is not null) from public.events;
--   4. The grants as before [PRE-FLIGHT 2 and 3's answers].
--
-- ROLLBACK (one transaction; run it only after the code that reads and
-- writes `icon` is rolled back, or every events read answers 500). Every
-- officer's pick is lost; count them first [a count]:
--   select count(*) from public.events where icon is not null;
-- then run:
--   begin;
--   set local lock_timeout = '5s';
--   alter table public.events drop column if exists icon;
--   delete from supabase_migrations.schema_migrations where version = '20261027100000';
--   notify pgrst, 'reload schema';
--   commit;
--   (Dropping the column drops its rule and both comments with it. PRE-FLIGHT
--   1 then reads f | 0 again.)
--
-- REHEARSED on the local stack on Oct 23, 2026 (batch B4): PRE-FLIGHT 1-4
-- [f | 0; anon f|f, authenticated f|f; t | t; 19]. Applied: pre-flight ok
-- (not applied yet), post-check ok; the schema_migrations row; POST-CHECK
-- 1-4 [icon | text | f | null; the twelve-key rule, t, the only one; 19 |
-- 0; the grants as before], both comments there. Applied again: pre-flight
-- ok (applied before), the column skipped, post-check ok. Probes inside
-- BEGIN ... ROLLBACK: meeting, party, food and null saved; 'Food', '',
-- ' food', 'nonsense' and 'url(x)' refused (23514, events_icon_check);
-- authenticated (a member of the event's club) reads the icon and its
-- UPDATE is refused (permission denied), anon reads nothing; counts
-- unchanged after. The pre-flight stopped the file, changing nothing, on a
-- drifted rule (two keys), a second CHECK on the column, an UPDATE granted
-- to authenticated, a varchar(20) column, a per-column SELECT for
-- authenticated and row level security off (each set up inside a
-- transaction that rolled back); the post-check run alone failed on the
-- second CHECK and passed clean. The ROLLBACK above, with one event on
-- 'food' first [count 1]: the column, rule and row gone, PRE-FLIGHT 1
-- f | 0. Then the body as ONE query string without begin/commit, the
-- connector's shape (an implicit transaction: lock_timeout took, no
-- warning), the row, POST-CHECK as before; the whole file once more: left
-- alone. The local stack keeps it applied, with its row.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT (catalog reads only) ------------------------------------------------
do $$
declare
  new_def constant text :=
    'CHECK ((icon = ANY (ARRAY[''meeting''::text, ''social''::text, ''food''::text, ''music''::text, '
    '''sports''::text, ''games''::text, ''study''::text, ''talk''::text, ''service''::text, '
    '''arts''::text, ''trip''::text, ''party''::text])))';
  got text;
begin
  if to_regclass('public.events') is null then
    raise exception 'event-icons: public.events is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.events'::regclass) then
    raise exception 'event-icons: row level security is off on events';
  end if;
  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    raise exception 'event-icons: a browser role can write events; the routes must stay the only writers';
  end if;
  -- Table-wide, not per column: a per-column grant would leave the new
  -- column unreadable to GET /api/events's viewer-client read (a 500).
  if not has_table_privilege('authenticated', 'public.events', 'SELECT') then
    raise exception 'event-icons: authenticated holds no table-wide SELECT on events';
  end if;

  -- A second run: the column and the rule must be the ones this file makes.
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.events'::regclass and a.attname = 'icon' and not a.attisdropped;
  if got is not null and got <> 'text' then
    raise exception 'event-icons: events.icon already exists as "%"', got;
  end if;

  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.events'::regclass and c.conname = 'events_icon_check';
  if got is not null and got <> new_def then
    raise exception 'event-icons: events_icon_check already exists as "%"', got;
  end if;

  -- One rule speaks for the column: a second CHECK naming it would refuse
  -- keys the code offers, and the post-check alone wouldn't see why.
  select string_agg(c.conname, ', ' order by c.conname) into got
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.events'::regclass and c.contype = 'c' and a.attname = 'icon'
     and c.conname <> 'events_icon_check';
  if got is not null then
    raise exception 'event-icons: another CHECK names events.icon: %', got;
  end if;

  raise notice 'event-icons: pre-flight ok (%)',
    case when exists (select 1 from pg_attribute where attrelid = 'public.events'::regclass
                         and attname = 'icon' and not attisdropped)
         then 'applied before; running again' else 'not applied yet' end;
end $$;

-- 2. THE COLUMN ---------------------------------------------------------------------
alter table public.events
  add column if not exists icon text;

-- 3. THE RULE (in a DO block so a second run neither drops nor re-scans anything) ----
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.events'::regclass and conname = 'events_icon_check') then
    alter table public.events
      add constraint events_icon_check
      check (icon in ('meeting', 'social', 'food', 'music', 'sports', 'games',
                      'study', 'talk', 'service', 'arts', 'trip', 'party'));
  end if;
end $$;

-- 4. THE COMMENTS ---------------------------------------------------------------------
comment on column public.events.icon is
  'The icon an event shows (Oct 23, 2026; 20261027100000): one of the twelve keys of EVENT_ICON_KEYS in src/lib/events/event-icons.ts, which holds the shapes (the database never does), or null for none (the calendar). Set by its officers in POST/PATCH /api/events (service role); events_icon_check.';
comment on constraint events_icon_check on public.events is
  'The icon keys an event may hold: EVENT_ICON_KEYS in src/lib/events/event-icons.ts, same order (a null passes: no icon). Change this rule and that list together.';

-- 5. POST-CHECK -----------------------------------------------------------------------
do $$
declare
  new_def constant text :=
    'CHECK ((icon = ANY (ARRAY[''meeting''::text, ''social''::text, ''food''::text, ''music''::text, '
    '''sports''::text, ''games''::text, ''study''::text, ''talk''::text, ''service''::text, '
    '''arts''::text, ''trip''::text, ''party''::text])))';
  got text;
  bad text := '';
begin
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.events'::regclass and a.attname = 'icon' and not a.attisdropped;
  if got is distinct from 'text' then
    bad := bad || format(' events.icon reads "%s";', coalesce(got, '(missing)'));
  end if;

  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.events'::regclass and c.conname = 'events_icon_check';
  if got is distinct from new_def then
    bad := bad || format(' events_icon_check reads "%s";', coalesce(got, '(missing)'));
  end if;

  select string_agg(c.conname, ', ' order by c.conname) into got
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.events'::regclass and c.contype = 'c' and a.attname = 'icon'
     and c.conname <> 'events_icon_check';
  if got is not null then
    bad := bad || format(' another CHECK names events.icon: %s;', got);
  end if;

  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    bad := bad || ' a browser role can write events;';
  end if;
  if not has_column_privilege('authenticated', 'public.events', 'icon', 'SELECT') then
    bad := bad || ' authenticated cannot read events.icon;';
  end if;

  if bad <> '' then
    raise exception 'event-icons post-check failed:%', bad;
  end if;
  raise notice 'event-icons: post-check ok';
end $$;

-- 6. ---------------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
