-- ---------------------------------------------------------------------------
-- 20261023100000_club_meeting_time.sql
--
-- PLAIN ENGLISH
-- When a club meets (the club's view, wave 2; handoffs/2026-10-20-club-view/
-- WAVE2-DESIGN.md C8). A club writes one short line itself, such as
-- "Thursdays · 7 PM, the Lantern Room", up to 60 characters, and its page
-- shows it to everyone. This file adds the column that holds it: empty for
-- every club until its officers write something. The Privacy Policy's "Club
-- pages" line (section 5a) says "when it meets" from the day this ships.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, catalog reads only: orgs exists; anon and authenticated
--      hold no UPDATE on any column of orgs (PATCH /api/orgs/[slug], with the
--      service role, stays the only writer, so the word filter and the
--      officer check can't be skipped); a meeting_time already there (a
--      second run) is exactly what this file makes.
--   2. public.orgs.meeting_time text not null default ''. A constant
--      default: no table rewrite, every club reads '' at once.
--   3. CHECK orgs_meeting_time_len: char_length(meeting_time) <= 60 (code
--      points, as src/lib/orgs/meeting-time.ts counts them). Added only when
--      absent, in a DO block, so a second run changes nothing. The route
--      trims, folds whitespace and drops control characters first.
--   4. POST-CHECK: the column, its default and NOT NULL, the CHECK validated
--      and reading as written, still no UPDATE for anon or authenticated.
--   5. notify pgrst.
--
-- NO GRANT, NO REVOKE. authenticated already holds table SELECT on orgs, so
-- it reads the new column like every other (it is page text, public); it
-- holds no UPDATE, so it can't write it. Nothing here touches a function.
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): add column
-- if not exists, the CHECK only when absent, a pre-flight that accepts this
-- file's own column. LOCK: ACCESS EXCLUSIVE on orgs for milliseconds (the
-- CHECK is validated by one scan of a small table); lock_timeout 5s makes the
-- file fail whole instead of queueing behind a long read; run it again.
--
-- PRE-FLIGHT (read-only, on production, before applying; catalog and counts
-- only, never a club's row). Also in scripts/sql/club-meeting-time-check.sql.
-- Expected answers in brackets.
--   1. Not applied yet [f]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.orgs'::regclass
--                     and attname = 'meeting_time' and not attisdropped);
--   2. How many clubs (every one reads '' after) [a count; 17 on the local stack]:
--     select count(*) from public.orgs;
--   3. Who may read and write orgs [anon f|f, authenticated t|f, service_role t|t]:
--     select r, has_table_privilege(r, 'public.orgs', 'select'),
--            has_any_column_privilege(r, 'public.orgs', 'update')
--       from (values ('anon'), ('authenticated'), ('service_role')) as v (r);
--      (anon's SELECT may read t on production; what matters is UPDATE f for
--      anon and authenticated. A t there: do NOT apply, ask why first.)
--
-- HOW TO APPLY. Locally, through the unix socket:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261023100000_club_meeting_time.sql
-- On production only the main session applies it, after Franky says yes,
-- with the connector's apply_migration (the body between begin and commit),
-- then renames the connector's auto-timestamp row in
-- supabase_migrations.schema_migrations to '20261023100000' /
-- 'club_meeting_time'. Never `supabase db push`.
--
-- DEPLOY ORDER: either way round. The route and the page ask for the column
-- and, on a database without it, read again without it: the page shows no
-- meeting line and a save that carries meeting_time answers 503
-- meeting_time_unavailable ("This isn't ready yet. Try again later."), while
-- every other save works. Apply first, so the field works the moment the
-- build serves.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The column [meeting_time | text | t | ''::text]:
--     select a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
--            pg_get_expr(d.adbin, d.adrelid)
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.orgs'::regclass and a.attname = 'meeting_time' and not a.attisdropped;
--   2. The CHECK [orgs_meeting_time_len | CHECK ((char_length(meeting_time) <= 60)) | t]:
--     select conname, pg_get_constraintdef(oid), convalidated from pg_constraint
--      where conrelid = 'public.orgs'::regclass and conname = 'orgs_meeting_time_len';
--   3. Still no UPDATE for the browser roles [anon f|f, authenticated f|t]
--      (UPDATE on any orgs column; SELECT on the new column):
--     select r, has_any_column_privilege(r, 'public.orgs', 'update'),
--            has_column_privilege(r, 'public.orgs', 'meeting_time', 'select')
--       from (values ('anon'), ('authenticated')) as v (r);
--   4. Every club reads '' [PRE-FLIGHT 2's count | 0]:
--     select count(*), count(*) filter (where meeting_time <> '') from public.orgs;
--
-- ROLLBACK (it deletes every club's meeting line: read POST-CHECK 4 first):
--   alter table public.orgs drop column if exists meeting_time;
--   delete from supabase_migrations.schema_migrations where version = '20261023100000';
--   notify pgrst, 'reload schema';
--   (Dropping the column drops its CHECK with it.) With the code that writes
--   it live, nothing else breaks: the page stops showing the line, and an
--   officer's save that carries meeting_time gets 503 meeting_time_unavailable
--   until the file is applied again; saves without it work as before.
--
-- REHEARSED on the local stack on Oct 21, 2026: PRE-FLIGHT [f | 17 |
-- anon f|f, authenticated t|f, service_role t|t]; applied (pre-flight ok,
-- column absent; post-check ok); POST-CHECK [meeting_time text t ''::text |
-- the CHECK, validated | anon f|f, authenticated f|t | 17, 0]; applied again
-- (pre-flight ok, column already there; nothing changed); 60 emoji saved and
-- 61 refused by orgs_meeting_time_len, authenticated's UPDATE refused
-- (permission denied), both rolled back; the ROLLBACK above [column f,
-- CHECK 0]; then the body without begin/commit as plain statements (one
-- WARNING: SET LOCAL outside a transaction, harmless) and POST-CHECK as
-- before. The local stack keeps the column.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  got text;
begin
  if to_regclass('public.orgs') is null then
    raise exception 'club-meeting-time: public.orgs is missing';
  end if;
  if has_any_column_privilege('anon', 'public.orgs', 'update')
     or has_any_column_privilege('authenticated', 'public.orgs', 'update') then
    raise exception 'club-meeting-time: a browser role can UPDATE orgs; the route must stay the only writer';
  end if;
  -- A second run: the column must be the one this file makes.
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.orgs'::regclass and a.attname = 'meeting_time' and not a.attisdropped;
  if got is not null and got <> 'text not null default ''''::text' then
    raise exception 'club-meeting-time: orgs.meeting_time already exists as "%"', got;
  end if;
  raise notice 'club-meeting-time: pre-flight ok (%)',
    case when got is null then 'column absent' else 'column already there' end;
end $$;

-- 2. THE COLUMN ------------------------------------------------------------------
alter table public.orgs
  add column if not exists meeting_time text not null default '';
comment on column public.orgs.meeting_time is
  'When the club says it meets, in its own words ("Thursdays · 7 PM, the Lantern Room"), shown on the club page to everyone. '''' when it says nothing. Up to 60 characters (orgs_meeting_time_len). Written only by PATCH /api/orgs/[slug] (service role: trimmed, one line, word filter); the club''s view, wave 2 (20261023100000).';

-- 3. THE LENGTH CHECK -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.orgs'::regclass and conname = 'orgs_meeting_time_len') then
    alter table public.orgs
      add constraint orgs_meeting_time_len check (char_length(meeting_time) <= 60);
  end if;
end $$;

-- 4. POST-CHECK ---------------------------------------------------------------------
do $$
declare
  got text;
  bad text := '';
begin
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.orgs'::regclass and a.attname = 'meeting_time' and not a.attisdropped;
  if got is distinct from 'text not null default ''''::text' then
    bad := bad || format(' the column reads "%s";', coalesce(got, '(missing)'));
  end if;

  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.orgs'::regclass and c.conname = 'orgs_meeting_time_len';
  if got is distinct from 'CHECK ((char_length(meeting_time) <= 60))' then
    bad := bad || format(' orgs_meeting_time_len reads "%s";', coalesce(got, '(missing)'));
  end if;

  if has_any_column_privilege('anon', 'public.orgs', 'update')
     or has_any_column_privilege('authenticated', 'public.orgs', 'update') then
    bad := bad || ' a browser role can UPDATE orgs;';
  end if;

  if bad <> '' then
    raise exception 'club-meeting-time post-check failed:%', bad;
  end if;
  raise notice 'club-meeting-time: post-check ok';
end $$;

-- 5. -------------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
