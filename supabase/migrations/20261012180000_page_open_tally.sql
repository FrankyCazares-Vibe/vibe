-- ---------------------------------------------------------------------------
-- 20261012180000_page_open_tally.sql
--
-- PLAIN ENGLISH
-- The founders can see who joined the waitlist, by link label, but not how
-- many people opened the pages in the first place, so they cannot tell what
-- share of visitors join (launch checklist item 19, "Analytics",
-- handoffs/2026-10-12-launch-checklist-audit.md). This file adds Vibe's own
-- counter: how many times the front page, the waitlist page and the sign-up
-- page were opened, per day and per link label. A number per day, and
-- nothing about the visitor. No outside tool.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: neither the table nor the function exists yet.
--   2. public.page_open_tally (day, page, label, opens). `day` is a UTC
--      date. `page` is one of three fixed names: home (/), waitlist
--      (/waitlist), signup (/auth/signup). `label` is the ?src= tag of the
--      link the visitor came in on (landing, ig-vibe), lowercase letters,
--      digits and dashes, 32 at most, or '' for none. One row per
--      (day, page, label), counted up. RLS on, NO policy, nothing for anon
--      or authenticated: a browser can neither read nor write it. The
--      service role may only SELECT (the admin Numbers tab); every write
--      goes through the function below.
--   3. public.tally_page_open(p_page, p_label): adds one to today's row.
--      SECURITY DEFINER, search_path ''. In the standing rule's shape
--      (20260922090000): anon, authenticated and service_role all hold
--      EXECUTE, and anon and authenticated are refused INSIDE (42501), so
--      only the service role can count (and the owner, by hand in the SQL
--      editor). The day is stamped here, never passed in, so a caller cannot
--      write into another day. An unknown page is an error (22023). A label
--      that isn't the plain shape counts under ''.
--      At most 25 rows a day per page: once a page has 25 today, a label not
--      seen yet today counts under ''. A flood of made-up labels therefore
--      cannot grow the table or bury the real ones.
--   4. POST-CHECK, then notify pgrst.
--
-- DOES NOT: hold an account id, an IP address, a user agent, a referrer, a
-- cookie or a time of day. It does not touch any other table, and nothing is
-- ever deleted from it: the rows are day totals, not anyone's data.
-- The route in front of it (POST /api/tally/open) skips requests that carry
-- a sign-in cookie, and requests from search engines and other tools that
-- name themselves (the name is read to decide and never stored). It sits
-- behind the limiter (public.rate_limits, a separate table the Privacy
-- Policy already describes): 300 opens an hour and 1,000 a day per network,
-- and 3,000 an hour for all networks together (src/lib/tally/limits.ts). The
-- two per-network counts do NOT hold the address either: they are keyed on a
-- scrambled code made from the network, the UTC day and a server secret
-- (src/lib/tally/network-code.ts), so opening the front page never puts a
-- visitor's IP address in the database.
--
-- APPLIED on the local database on 2026-10-12 and checked there (RLS on, no
-- policy, anon refused inside with 42501, counts add up). Production: see
-- the session 76 handoff.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT to_regclass('public.page_open_tally') IS NULL                AS table_absent,
--          to_regprocedure('public.tally_page_open(text,text)') IS NULL AS fn_absent;
--   -- expect t, t.
--
-- DEPLOY ORDER. CODE FIRST. POST /api/tally/open answers ok and counts
-- nothing while the function is missing (PGRST202 / 42883), and the admin
-- Numbers tab says the counter is not switched on while the table is missing
-- (42P01 / PGRST205). Applying this file first is harmless too: nothing
-- calls the function until the route ships.
--
-- THE SAME DAY THE CODE SHIPS: Privacy Policy 3d and 11 each gain a sentence
-- about this count, and the date at the top moves (the audit, item 19).
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, or the Supabase connector's
-- apply_migration with the body below minus begin/commit (then rename its
-- auto-timestamp row in schema_migrations to this file's version). Then
-- record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261012180000', 'page_open_tally');
-- A check by hand afterwards (as postgres, in the SQL editor):
--   SELECT public.tally_page_open('home', 'manual-check');
--   SELECT * FROM public.page_open_tally;            -- one row, opens = 1
--   DELETE FROM public.page_open_tally WHERE label = 'manual-check';
--   BEGIN; SET LOCAL ROLE anon; SELECT public.tally_page_open('home', ''); ROLLBACK;
--   -- expect ERROR 42501 "not allowed", and the connection stays up.
--
-- ROLLBACK (the code keeps working: it goes back to counting nothing):
--   BEGIN;
--   DROP FUNCTION public.tally_page_open(text, text);
--   DROP TABLE public.page_open_tally;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261012180000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if to_regclass('public.page_open_tally') is not null then
    raise exception 'page-open-tally: public.page_open_tally already exists (applied already?)';
  end if;
  if to_regprocedure('public.tally_page_open(text,text)') is not null then
    raise exception 'page-open-tally: public.tally_page_open(text, text) already exists';
  end if;
end $$;

-- 1. THE TABLE ---------------------------------------------------------------
-- The same shapes as src/lib/tally/open.ts (TALLY_PAGES, cleanTallyLabel);
-- open.test.ts reads this file and compares.
create table public.page_open_tally (
  -- The UTC date the page was opened on. No time of day.
  day   date   not null,
  page  text   not null check (page in ('home', 'waitlist', 'signup')),
  -- The ?src= tag of the link the visitor came in on; '' for none.
  label text   not null default '' check (label ~ '^[a-z0-9-]{0,32}$'),
  opens bigint not null default 0 check (opens >= 0),
  primary key (day, page, label)
);

alter table public.page_open_tally enable row level security;
revoke all on table public.page_open_tally from anon, authenticated, service_role;
-- The service role only READS it (the admin Numbers tab, GET
-- /api/admin/numbers). Every write goes through tally_page_open, which runs
-- as its owner, so the one rule for what a row may hold lives in one place.
grant select on table public.page_open_tally to service_role;

comment on table public.page_open_tally is
  'How many times the front page, the waitlist page and the sign-up page were opened, per UTC day and per ?src= link label. '
  'A number per day and nothing about the visitor: no account, IP address, user agent, referrer or cookie. '
  'Written only by tally_page_open; read only by the service role (20261012180000).';

-- 2. THE COUNT-UP ------------------------------------------------------------
create function public.tally_page_open(p_page text, p_label text default '')
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $fn$
declare
  -- Stamped here, never passed in: a caller cannot write into another day.
  v_day   date := (now() at time zone 'utc')::date;
  v_label text := coalesce(p_label, '');
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_page is null or p_page not in ('home', 'waitlist', 'signup') then
    raise exception 'tally: unknown page' using errcode = '22023';
  end if;

  -- Not the plain shape (an address, a sentence, too long): counted under no
  -- label, never stored. The route cleans it first; this is the boundary.
  if v_label !~ '^[a-z0-9-]{0,32}$' then
    v_label := '';
  end if;

  -- At most 25 rows a day per page. A label not seen yet today, on a page
  -- that already has 25 rows today, counts under no label. Two calls racing
  -- past this can leave a row or two over; it is a ceiling, not a promise.
  if v_label <> ''
     and not exists (select 1
                       from public.page_open_tally t
                      where t.day = v_day and t.page = p_page and t.label = v_label)
     and (select count(*)
            from public.page_open_tally t
           where t.day = v_day and t.page = p_page) >= 25 then
    v_label := '';
  end if;

  insert into public.page_open_tally as t (day, page, label, opens)
  values (v_day, p_page, v_label, 1)
  on conflict (day, page, label) do update set opens = t.opens + 1;
end;
$fn$;

comment on function public.tally_page_open(text, text) is
  'Adds one to today''s (UTC) page_open_tally row for a page (home, waitlist, signup) and a ?src= label. '
  'Service role only: anon and authenticated are refused inside (42501). For POST /api/tally/open (20261012180000).';

-- EXECUTE for every API role, on purpose (standing rule since 2026-09-22,
-- 20260922090000_guard_function_privileges.sql): on Supabase's Postgres image
-- a role calling a public function it can't EXECUTE crashes the backend and
-- drops every connection, so the refusal lives INSIDE the function. Never
-- revoke anon or authenticated here.
revoke all on function public.tally_page_open(text, text) from public;
grant execute on function public.tally_page_open(text, text) to anon, authenticated, service_role;

-- 3. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad text := '';
  f regprocedure := 'public.tally_page_open(text,text)'::regprocedure;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.page_open_tally'::regclass)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.page_open_tally'::regclass) then
    bad := bad || ' page_open_tally has RLS off or a policy;';
  end if;
  if has_table_privilege('anon', 'public.page_open_tally', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.page_open_tally', 'select,insert,update,delete') then
    bad := bad || ' anon or authenticated holds a privilege on page_open_tally;';
  end if;
  if not has_table_privilege('service_role', 'public.page_open_tally', 'select') then
    bad := bad || ' service_role cannot read page_open_tally;';
  end if;
  if has_table_privilege('service_role', 'public.page_open_tally', 'insert,update,delete') then
    bad := bad || ' service_role can write page_open_tally directly;';
  end if;
  if not (has_function_privilege('anon', f, 'execute')
          and has_function_privilege('authenticated', f, 'execute')
          and has_function_privilege('service_role', f, 'execute')) then
    bad := bad || ' the count-up is refused to an API role (the standing rule);';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the count-up;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' the count-up is not SECURITY DEFINER;';
  end if;
  if (select p.proconfig from pg_proc p where p.oid = f) is distinct from array['search_path=""'] then
    bad := bad || ' the count-up does not pin search_path to empty;';
  end if;
  if bad <> '' then
    raise exception 'page-open-tally post-check failed:%', bad;
  end if;
end $$;

-- 4. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
