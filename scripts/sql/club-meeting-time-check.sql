-- club-meeting-time-check.sql: the read-only PRE-FLIGHT and POST-CHECK of
--   supabase/migrations/20261023100000_club_meeting_time.sql
-- (when a club meets; the club's view, wave 2, WAVE2-DESIGN.md C8).
--
-- READ-ONLY: catalog reads and counts, never a club's row, never a write, so
-- it may run on production (counts only, the Privacy Policy's promise) as
-- well as locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/club-meeting-time-check.sql
-- Through the connector's execute_sql, run the statements one by one.
-- Expected answers in brackets: BEFORE = before the file is applied, AFTER =
-- right after. BEFORE, run queries 1 to 3 only: 6 and 7 name the column and
-- stop psql without it.

-- 1. Is the column there? [BEFORE f | AFTER t]
select exists (
  select 1 from pg_attribute
   where attrelid = 'public.orgs'::regclass and attname = 'meeting_time' and not attisdropped
) as meeting_time_present;

-- 2. How many clubs (query 7 counts them again after) [n; 17 on the local stack]
select count(*) as clubs from public.orgs;

-- 3. Who may read and write orgs [anon ?|f, authenticated t|f, service_role t|t]
-- The UPDATE column must read f for anon and authenticated: the route
-- (service role) is the only writer. A t there: do NOT apply.
select r as role,
       has_table_privilege(r, 'public.orgs', 'select') as table_select,
       has_any_column_privilege(r, 'public.orgs', 'update') as any_update
  from (values ('anon'), ('authenticated'), ('service_role')) as v (r);

-- AFTER ONLY ---------------------------------------------------------------------
-- 4. The column [meeting_time | text | t | ''::text]
select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) as default_value
  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attrelid = 'public.orgs'::regclass and a.attname = 'meeting_time' and not a.attisdropped;

-- 5. The CHECK [orgs_meeting_time_len | CHECK ((char_length(meeting_time) <= 60)) | t]
select conname, pg_get_constraintdef(oid) as definition, convalidated
  from pg_constraint
 where conrelid = 'public.orgs'::regclass and conname = 'orgs_meeting_time_len';

-- 6. The browser roles still can't write it, and read it [anon f|?, authenticated f|t]
select r as role,
       has_any_column_privilege(r, 'public.orgs', 'update') as any_update,
       has_column_privilege(r, 'public.orgs', 'meeting_time', 'select') as reads_meeting_time
  from (values ('anon'), ('authenticated')) as v (r);

-- 7. Every club reads '' right after applying [clubs = query 2 | 0]
select count(*) as clubs, count(*) filter (where meeting_time <> '') as with_meeting_time
  from public.orgs;
