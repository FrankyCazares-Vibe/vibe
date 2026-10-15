-- ---------------------------------------------------------------------------
-- 20261014150000_usage_day_tally.sql
--
-- PLAIN ENGLISH
-- The Usage tab (20261014120000) rebuilds "who came back" from things people
-- did that carry a date, so someone who only scrolls on a phone never shows
-- up. From this file on, Vibe keeps day totals instead: how many people had
-- it open each UTC day and each Monday week (in all and per school system),
-- on which kind of device, how many of each sign-up week came back in the
-- four weeks after, and how many times Otto and the campus map were opened.
-- A number per row and nothing about a person: no account, no IP address,
-- no browser name, no time of day. Step 2 of the usage stats, Franky's yes
-- on Oct 14.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT: no other function under the three names below, and
--      users_active_count(text[]) is there (20261008120000); the table is
--      absent or has exactly its four columns (a re-run, or a rollback that
--      kept the counted days); authenticated holds no table-level UPDATE on
--      users (else the column revoke in 4 would do nothing); the role
--      running this file can read auth.users, and passes RLS on users
--      (the check-in writes users as its owner, and users_update_self tests
--      auth.uid(), which is null there); account_restrictions exists.
--   1. public.usage_day_tally (day, metric, key, count). RLS on, NO policy,
--      nothing granted to anon, authenticated or the service role: only the
--      two functions below (they run as the owner) read or write it. The
--      CHECKs are the row ceiling: there is no free-text key.
--        active_day  all / iu / purdue / unknown   people seen that UTC day
--        device_day  phone / desktop / installed / unknown
--                                    the device kind of each person's first
--                                    check-in that day; adds up to active_day all
--        active_week all, day = the Monday     people seen that Monday week
--        cohort      w0..w4, day = the Monday  people seen that week who
--                                    signed up K weeks before it (w0 = their
--                                    sign-up week). Next-week return for
--                                    sign-up week S = (S+7, w1) / (S, w0).
--        otto_open, map_open  all              opens, capped (below)
--                             capped           1 when the cap turned an open
--                                    away that day, else no row
--      At most 12 rows a day, 18 on a Monday, about 4,700 a year. Nothing is
--      ever deleted, and deleting an account takes nothing out: no row
--      holds one.
--   2. public.usage_touch(p_user, p_device, p_open): the check-in. Called
--      only by POST /api/me/heartbeat, with the id the sign-in server
--      verified (supabase.auth.getUser()), through the service role.
--      SECURITY DEFINER, search_path ''. anon and authenticated are refused
--      INSIDE (42501): taking the id from a signed-in caller would let
--      anyone stamp anyone, and auth.uid() is null under the service role.
--   3. public.admin_usage_tally(p_days): the read for the Usage tab's
--      "Counted from launch on" section, totals only, one jsonb answer. The
--      shape is TallyRaw in src/lib/usage/view.ts. Same refusal.
--   4. revoke update (last_active_at) on public.users from authenticated:
--      from now on only the check-in writes the last-active time.
--   5. public.users_active_count(p_campus_ids): "active now" from 5 up
--      (Franky, Oct 14). Every page checks in from this file on, so the
--      exact count would show whether one person on a small campus has Vibe
--      open. The same people as 20261008120000, counted campus by campus,
--      and a campus adds nothing until 5 people other than the caller are
--      active there AND 5 other than the caller are not (the second floor,
--      Franky, Oct 14: else a campus of 6 showing 5 says who is away). The
--      answer is 0 or 5 and up, a campus under 10 people never shows, no
--      list of campuses uncovers a small one (5 at one campus and 1 at
--      another answers 5, not 6), and the caller checking in or not decides
--      neither floor ("exactly 4 others" on, or not on); their own campus
--      answers 6 and up, or 0. The same signature, language, volatility,
--      SECURITY DEFINER and search_path; create or replace keeps the grants,
--      and the post-check shows they did not move. The route floors at 5
--      too, and the campus header leaves "active now" out under 5
--      (src/lib/usage/active-now.ts).
--   6. POST-CHECK (privileges, rows the table must refuse, both floors).
--   7. notify pgrst.
--
-- HOW A PERSON IS COUNTED ONCE, with nothing new kept about them
--   The check-in compares the person's last-active time (users.
--   last_active_at, which "active now" already used) with now. The first
--   check-in of a UTC day adds one to the day's rows; the first of a Monday
--   week adds one to the week and to the sign-up week. The person's row is
--   locked first, so a second tab waits and then reads THIS check-in's time:
--   a day or a week is counted once. The stamp only moves forward. It is
--   skipped when the last one is under a minute old and nothing is counted,
--   so a caller in a loop costs reads only. p_user is never written into
--   the tally.
--
-- OPENS. A day's Otto opens (or map opens) stop at 10 times that day's
--   active people (10 at least). No per-person mark ("this account opened
--   Otto today") is kept: that is the record this table exists not to keep.
--   The browser also counts an open at most once per tab every 10 minutes
--   (src/lib/usage/touch.ts). The cap reads without a lock, so two calls
--   racing can land one or two over: a ceiling, not a promise. An open the
--   cap turns away leaves a mark on the day (key 'capped', count 1, written
--   once), so the Usage tab can say the opens hit the cap even when more
--   people became active later and the final count sits under it. One
--   account can still fill a day's opens up to the cap; the mark says when
--   it was reached, and nothing says by whom.
--
-- WHO IS LEFT OUT
--   - The founders (users.is_platform_admin) and the store-review accounts
--     (vibe_review_account in the sign-in app metadata): stamped, so "active
--     now" works for them as before, never counted. The same test as
--     20261014120000.
--   - Accounts suspended or banned right now: neither stamped nor counted
--     (users_update_self refused their stamp before; the proxy already
--     refuses their POSTs, src/proxy.ts).
--
-- DOES NOT: hold an account id, an IP address, a user agent, a browser name,
-- a referrer or a time of day; read the store apps' tag (an app counts as a
-- phone, Privacy Policy 3h); change step 1's function; change who may call
-- users_active_count; delete anything.
--
-- PARTIAL FIRST DAY AND WEEK. Anyone stamped earlier on the apply day (the
-- old Campus heartbeat, or the route's fallback before this file) counts
-- from the next day, and is missing from the week the apply day falls in.
-- The read says so: `started` is the first counted day, `first_week` the
-- first Monday after it; weeks before it are flagged partial, and a cohort
-- week before it reads null.
--
-- SAFE TO RUN AGAIN: create if not exists / create or replace, the same
-- grants and the same revoke (users_active_count keeps the grants it has).
-- A table kept by a rollback is taken as is
-- once its four columns match; the post-check then tries rows it must
-- refuse and one of each row the check-in writes, so a kept table with an
-- older CHECK stops the file instead of the check-ins.
--
-- APPLIED on the local database on 2026-10-14, twice in a row, and checked
-- there; again twice with section 5 ("active now" from 5 up), twice more
-- after the review made the 5 the people other than the caller, and twice
-- more with the second floor (5 others NOT on). Its grants were the same
-- before and after every time (anon, authenticated, service_role, no
-- PUBLIC). Before the second floor, in rolled-back runs, 1 to 4 people
-- active at one campus answered 0, 5 and 6 the count, 5 at one campus plus
-- 1 at another answered 5 for the two together, and a signed-in caller at a
-- campus with 4 others active answered 0 with their own check-in off and on
-- (it answered 5 before the review). With it, in rolled-back runs with test
-- accounts on empty campuses, as postgres and as a signed-in caller from
-- another campus: 6 people with 5 on answered 0 (the single floor answered
-- 5), 9 with 5 on 0, 14 with 4 on 0, 10 with 5 on 5 and 11 with 6 on 6; any
-- list (and null) answered only the campuses that pass, so the 6 never
-- showed by subtraction; anon answered 0. A signed-in caller in the 6
-- answered 0 with their own check-in off and on; in the 11, one who is on
-- answered 6, and one who is not (6 others on, 4 not) 0 off and 0 on (the
-- reviewer's draft, which counted the caller among those not on, answered 6
-- then 0: "exactly 4 others are not on"); one on in the 10 answered 0
-- (their own campus needs 11). The post-check stopped the file with either
-- floor taken out, and with the reviewer's draft.
-- src/lib/usage/tally-migration.test.ts keeps the refusal, the grants, the
-- column revoke, both floors and the counts-only rules from drifting.
-- Production: the main session.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT to_regclass('public.usage_day_tally') IS NULL                            AS table_absent,
--          to_regprocedure('public.usage_touch(uuid,text,text)') IS NULL            AS touch_absent,
--          to_regprocedure('public.admin_usage_tally(integer)') IS NULL             AS read_absent,
--          has_column_privilege('authenticated','public.users','last_active_at','UPDATE') AS col_update,
--          has_table_privilege('authenticated','public.users','UPDATE')             AS table_update,
--          has_function_privilege('anon','public.users_active_count(text[])','EXECUTE') AS active_anon,
--          has_function_privilege('authenticated','public.users_active_count(text[])','EXECUTE') AS active_auth;
--   -- expect t, t, t, t, f, t, t the first time (the local database, 2026-10-14;
--   -- production's anon grant is the one Franky ran by hand on Oct 12).
--
-- DEPLOY ORDER. CODE AND PRIVACY POLICY FIRST, in one deploy. While the
-- check-in is missing (PGRST202 / 42883) the route stamps the old way, with
-- the person's own client, and the Usage tab says the day totals are not
-- switched on. Between this file's commit and PostgREST's schema reload the
-- route can still see PGRST202, and its old write is then refused by the
-- column revoke: nothing is stamped for that one call, and the next check-in
-- counts as usual.
--
-- THE SAME DEPLOY: Privacy Policy 3d ("Last active" reworded, with how the
-- "active now" number is counted; a new "Use totals" bullet) and section 8
-- (the totals outlive a deleted account). The route's own floor ships in it
-- too, but it covers only what the header prints. Until this file is
-- applied, users_active_count is still 20261008120000's exact count: a
-- direct call answers a small number, and the route's two numbers can be
-- subtracted (everyone minus one campus). So apply this file straight after
-- the deploy. To close even that gap, run section 5 alone (its create or
-- replace and its comment, in one transaction) BEFORE the deploy: it needs
-- nothing else here, keeps the grants, and the old header then prints "0
-- active now" under 5 until open tabs reload, which looks odd and shows
-- nothing. The whole file afterwards replaces it with the same body.
--
-- HOW TO APPLY BY HAND: the Supabase connector's apply_migration with the
-- body below minus begin/commit (then rename its auto-timestamp row in
-- schema_migrations to this file's version), or the Management API curl
-- recipe in 20260926100000_users_profile_layout.sql. It must run as
-- postgres (the pre-flight refuses a role that cannot read auth.users or
-- would be held back by RLS on users). Then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261014150000', 'usage_day_tally') ON CONFLICT (version) DO NOTHING;
-- Checks by hand afterwards (as postgres, in the SQL editor):
--   BEGIN; SET LOCAL ROLE anon; SELECT public.usage_touch(gen_random_uuid(), 'phone', null); ROLLBACK;
--   BEGIN; SET LOCAL ROLE authenticated; SELECT public.admin_usage_tally(30); ROLLBACK;
--   -- expect ERROR 42501 "not allowed" both times, and the connection stays up.
--   SELECT metric, key, count FROM public.usage_day_tally
--    WHERE day = (now() at time zone 'utc')::date;           -- counts only
--   SELECT public.users_active_count(null);                  -- 0, or 5 and up
--   -- and 0 for any one campus under 10 people (the post-check asks both).
--
-- ROLLBACK. The database first. Never put the old code back while the
-- column revoke stands: the old route writes as authenticated and would
-- fail.
--   BEGIN;
--   GRANT UPDATE (last_active_at) ON public.users TO authenticated;
--   DROP FUNCTION public.usage_touch(uuid, text, text);
--   DROP FUNCTION public.admin_usage_tally(integer);
--   DROP TABLE public.usage_day_tally;  -- optional: totals only. Keep it to
--                                       -- save the counted days; a re-apply
--                                       -- of this file takes it as is.
--   -- Optional: "active now" back to the exact count, 20261008120000's body
--   -- and comment: both floors go (5 others on, 5 others not on), so a small
--   -- campus shows again. create or replace keeps the grants (never revoke
--   -- them). The route keeps flooring at 5 (src/lib/usage/active-now.ts)
--   -- until its code goes back too, and Privacy Policy 3d's "active now"
--   -- sentences go with it, the same day.
--   CREATE OR REPLACE FUNCTION public.users_active_count(p_campus_ids text[] DEFAULT NULL)
--     RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     select count(*)
--       from public.users u
--      where u.last_active_at >= now() - interval '5 minutes'
--        and (p_campus_ids is null or u.campus_id = any (p_campus_ids))
--        and (u.id = (select auth.uid()) or public.user_visible(u.id));
--   $$;
--   COMMENT ON FUNCTION public.users_active_count(text[]) IS
--     'How many accounts the caller may see were active in the last 5 minutes, everywhere (null) or in the listed campuses. The window is fixed here on purpose. For GET /api/stats/campus (20261008120000).';
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261014150000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  -- The two this file makes may already be there (a re-run); any other
  -- argument list under the same names would make the calls ambiguous.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and ((p.proname = 'usage_touch'
                      and p.oid is distinct from to_regprocedure('public.usage_touch(uuid,text,text)')::oid)
                  or (p.proname = 'admin_usage_tally'
                      and p.oid is distinct from to_regprocedure('public.admin_usage_tally(integer)')::oid))) then
    raise exception 'usage-tally: another public.usage_touch or admin_usage_tally sits beside the ones this file makes; drop it first';
  end if;
  -- Absent, or kept with exactly its four columns.
  if to_regclass('public.usage_day_tally') is not null then
    select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
      into v_cols
      from pg_attribute a
     where a.attrelid = to_regclass('public.usage_day_tally')
       and a.attnum > 0
       and not a.attisdropped;
    if v_cols is distinct from 'day date, metric text, key text, count integer' then
      raise exception 'usage-tally: public.usage_day_tally exists with other columns (%)', v_cols;
    end if;
  end if;
  if has_table_privilege('authenticated', 'public.users', 'UPDATE') then
    raise exception 'usage-tally: authenticated holds table-level UPDATE on users; the column revoke would do nothing';
  end if;
  if not has_table_privilege(current_user, 'auth.users', 'SELECT') then
    raise exception 'usage-tally: % cannot read auth.users; the check-in would fail every call (42501). Apply as postgres.', current_user;
  end if;
  -- The check-in stamps users as its owner. users_update_self tests
  -- auth.uid(), null there, so RLS would quietly filter the write unless the
  -- owner passes it: bypassrls, or owning users without FORCE RLS.
  if not coalesce((select r.rolbypassrls from pg_roles r where r.rolname = current_user), false)
     and not exists (select 1
                       from pg_class c
                      where c.oid = 'public.users'::regclass
                        and c.relowner = (select r.oid from pg_roles r where r.rolname = current_user)
                        and not c.relforcerowsecurity) then
    raise exception 'usage-tally: % would be held back by RLS on users; the stamp would write nothing. Apply as postgres.', current_user;
  end if;
  if to_regclass('public.account_restrictions') is null then
    raise exception 'usage-tally: public.account_restrictions is missing (moderation, 20260923090000)';
  end if;
  -- "Active now" (section 5) replaces 20261008120000's function in place. It
  -- must be there and alone under its name: create or replace then keeps its
  -- grants, where a new function would get the default ones.
  if to_regprocedure('public.users_active_count(text[])') is null then
    raise exception 'usage-tally: public.users_active_count(text[]) is missing; apply 20261008120000 first';
  end if;
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname = 'users_active_count'
                and p.oid <> to_regprocedure('public.users_active_count(text[])')::oid) then
    raise exception 'usage-tally: another public.users_active_count sits beside users_active_count(text[]); drop it first';
  end if;
  -- Remembered for the post-check: who may call it, exactly, before.
  perform set_config('vibe.usage_tally_active_acl',
                     coalesce((select p.proacl::text
                                 from pg_proc p
                                where p.oid = to_regprocedure('public.users_active_count(text[])')::oid), 'default'),
                     true);
  -- Remembered for the post-check: how many OTHER users columns
  -- authenticated may update, so the revoke below is shown to take one.
  perform set_config('vibe.usage_tally_other_update_cols',
                     (select count(*)
                        from pg_attribute a
                       where a.attrelid = 'public.users'::regclass
                         and a.attnum > 0
                         and not a.attisdropped
                         and a.attname <> 'last_active_at'
                         and has_column_privilege('authenticated', 'public.users', a.attname, 'UPDATE'))::text,
                     true);
end $$;

-- 1. THE TABLE ---------------------------------------------------------------
-- The key lists are src/lib/usage/touch.ts's (USAGE_DEVICES, USAGE_OPENS)
-- and view.ts's (TALLY_COHORT_WEEKS); tally-migration.test.ts compares.
create table if not exists public.usage_day_tally (
  -- A UTC date; for active_week and cohort, the Monday of that week.
  day    date    not null,
  metric text    not null check (metric in ('active_day', 'active_week', 'cohort', 'device_day', 'otto_open', 'map_open')),
  key    text    not null,
  count  integer not null default 0 check (count >= 0),
  primary key (day, metric, key),
  check (
       (metric = 'active_day' and key in ('all', 'iu', 'purdue', 'unknown'))
    or (metric = 'device_day' and key in ('phone', 'desktop', 'installed', 'unknown'))
    or (metric in ('otto_open', 'map_open') and key in ('all', 'capped'))
    or (metric = 'active_week' and key = 'all' and extract(isodow from day) = 1)
    or (metric = 'cohort' and key in ('w0', 'w1', 'w2', 'w3', 'w4') and extract(isodow from day) = 1)
  )
);

alter table public.usage_day_tally enable row level security;
revoke all on table public.usage_day_tally from anon, authenticated, service_role;
-- NO grant and NO policy: only usage_touch writes it and admin_usage_tally
-- reads it, both as the owner.

comment on table public.usage_day_tally is
  'Day and week totals of use: people active per UTC day (in all and per school system) and per Monday week, '
  'people from each sign-up week seen in that week and the four after it, the device kind of each person''s first '
  'check-in of the day, and Otto and map opens (and a mark when their cap turned one away). A number per row and nothing about a person: no account, IP address, '
  'user agent or time of day. Written only by usage_touch, read only by admin_usage_tally (20261014150000).';

-- 2. THE CHECK-IN ------------------------------------------------------------
create or replace function public.usage_touch(p_user uuid, p_device text default 'unknown', p_open text default null)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $touch$
declare
  v_now        timestamptz;
  v_today      date;
  v_week       date;
  -- The device kind as the browser worked it out (touch.ts, USAGE_DEVICES).
  -- Anything else, or none (an open tab from before), counts as 'unknown'.
  v_device     text := case when p_device in ('phone', 'desktop', 'installed') then p_device else 'unknown' end;
  v_old        timestamptz;
  v_old_day    date;
  v_school     text;
  v_created    timestamptz;
  v_out        boolean;
  v_first_day  boolean;
  v_first_week boolean;
  v_signup     date;
  v_metric     text;
  v_active     bigint;
  v_opens      bigint;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_user is null then
    raise exception 'usage: no account' using errcode = '22023';
  end if;
  if p_open is not null and p_open not in ('otto', 'map') then
    raise exception 'usage: unknown open' using errcode = '22023';
  end if;

  -- Stamped here, never passed in: a caller cannot count into another day.
  v_now   := now();
  v_today := (v_now at time zone 'utc')::date;
  -- This week's Monday, in date arithmetic only (no session time zone).
  v_week  := v_today - (extract(isodow from v_today)::int - 1);

  -- Suspended or banned right now: neither stamped nor counted. The same
  -- test as public.is_restricted_now(), for this account.
  if exists (select 1
               from public.account_restrictions r
              where r.user_id = p_user
                and r.lifted_at is null
                and r.starts_at <= v_now
                and (r.ends_at is null or r.ends_at > v_now)) then
    return;
  end if;

  -- Lock the row FIRST: a second tab's check-in waits here, then reads THIS
  -- check-in's time (READ COMMITTED reads the updated row again), so a day
  -- or a week is counted once.
  select u.last_active_at,
         u.school_system,
         u.created_at,
         u.is_platform_admin
           or coalesce(au.raw_app_meta_data @> '{"vibe_review_account": true}'::jsonb, false)
    into v_old, v_school, v_created, v_out
    from public.users u
    left join auth.users au on au.id = u.id
   where u.id = p_user
     for update of u;
  if not found then
    return;
  end if;

  -- First check-in of this UTC day, and of this Monday week. Null = never
  -- seen before. A last-active time ahead of now counts as neither.
  v_old_day    := (v_old at time zone 'utc')::date;
  v_first_day  := v_old_day is null or v_old_day < v_today;
  v_first_week := v_old_day is null
                  or v_old_day - (extract(isodow from v_old_day)::int - 1) < v_week;

  -- The stamp ("active now", a 5-minute window). Always when something is
  -- counted below, so nothing is counted twice; otherwise skipped while the
  -- last one is under a minute old. It only moves forward.
  if v_first_day or v_first_week or v_old <= v_now - interval '60 seconds' then
    update public.users
       set last_active_at = greatest(v_now, coalesce(v_old, v_now))
     where id = p_user;
    if not found then
      raise exception 'usage: stamp did not land' using errcode = '55000';
    end if;
  end if;

  -- The founders and the store-review accounts: stamped, never counted.
  if v_out then
    return;
  end if;

  -- Every count below takes the tally rows in the same order (day, school,
  -- device, week, cohort, open), so two people's check-ins cannot deadlock.
  if v_first_day then
    insert into public.usage_day_tally as t (day, metric, key, count)
    values (v_today, 'active_day', 'all', 1),
           (v_today, 'active_day', case when v_school in ('iu', 'purdue') then v_school else 'unknown' end, 1),
           (v_today, 'device_day', v_device, 1)
    on conflict (day, metric, key) do update set count = t.count + 1;
  end if;

  if v_first_week then
    insert into public.usage_day_tally as t (day, metric, key, count)
    values (v_week, 'active_week', 'all', 1)
    on conflict (day, metric, key) do update set count = t.count + 1;

    -- The sign-up week's Monday; seen in it (w0) and the four after (w1-w4).
    v_signup := (v_created at time zone 'utc')::date;
    v_signup := v_signup - (extract(isodow from v_signup)::int - 1);
    if v_week - v_signup between 0 and 28 then
      insert into public.usage_day_tally as t (day, metric, key, count)
      values (v_week, 'cohort', 'w' || ((v_week - v_signup) / 7)::text, 1)
      on conflict (day, metric, key) do update set count = t.count + 1;
    end if;
  end if;

  -- An open of Otto or the map. 10 = OPEN_CAP_PER_ACTIVE in touch.ts.
  if p_open is not null then
    v_metric := p_open || '_open';
    select coalesce(sum(t.count) filter (where t.metric = 'active_day' and t.key = 'all'), 0),
           coalesce(sum(t.count) filter (where t.metric = v_metric and t.key = 'all'), 0)
      into v_active, v_opens
      from public.usage_day_tally t
     where t.day = v_today
       and t.metric in ('active_day', v_metric);
    if v_opens < 10 * greatest(v_active, 1) then
      insert into public.usage_day_tally as t (day, metric, key, count)
      values (v_today, v_metric, 'all', 1)
      on conflict (day, metric, key) do update set count = t.count + 1;
    else
      -- Turned away: mark the day once (count stays 1), so a looping caller
      -- past the cap costs a read and no write.
      insert into public.usage_day_tally as t (day, metric, key, count)
      values (v_today, v_metric, 'capped', 1)
      on conflict (day, metric, key) do nothing;
    end if;
  end if;
end;
$touch$;

comment on function public.usage_touch(uuid, text, text) is
  'The check-in: moves the account''s last-active time forward, and on its first check-in of a UTC day or Monday week '
  'adds one to that day''s or week''s totals in usage_day_tally (and to an Otto or map open, stopping at 10 times the day''s '
  'active people, with a mark on the day when that stop turns one away). '
  'Founders and store-review accounts are stamped, never counted. Service role only: anon and authenticated are refused '
  'inside (42501). For POST /api/me/heartbeat (20261014150000).';

-- 3. THE READ ----------------------------------------------------------------
create or replace function public.admin_usage_tally(p_days integer default 30)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $tally$
declare
  v_days       integer;
  v_today      date;
  v_since      date;
  v_week       date;
  v_started    date;
  v_first_week date;
  v_by_day     jsonb;
  v_by_week    jsonb;
  v_cohorts    jsonb;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_days  := least(greatest(coalesce(p_days, 30), 7), 90);
  v_today := (now() at time zone 'utc')::date;
  v_since := v_today - (v_days - 1);
  v_week  := v_today - (extract(isodow from v_today)::int - 1);

  -- The first day anything was counted, from the rows dated by the day
  -- itself: a week's rows sit on its Monday, which can come before it.
  select min(t.day)
    into v_started
    from public.usage_day_tally t
   where t.metric in ('active_day', 'device_day', 'otto_open', 'map_open');
  -- The first Monday after that day. The week the first day falls in is
  -- partial (people stamped earlier that week, before this file, are
  -- missing from it), even when that day is itself a Monday.
  v_first_week := v_started - (extract(isodow from v_started)::int - 1) + 7;

  -- Every day of the window, zero-filled, oldest first.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day',            to_char(d.day::timestamp, 'YYYY-MM-DD'),
           'active',         d.active,
           'iu',             d.iu,
           'purdue',         d.purdue,
           'unknown_school', d.unknown_school,
           'phone',          d.phone,
           'desktop',        d.desktop,
           'installed',      d.installed,
           'unknown_device', d.unknown_device,
           'otto_open',      d.otto_open,
           'map_open',       d.map_open,
           'otto_capped',    d.otto_capped,
           'map_capped',     d.map_capped) order by d.day), '[]'::jsonb)
    into v_by_day
    from (select g.day,
                 coalesce(sum(t.count) filter (where t.metric = 'active_day' and t.key = 'all'), 0)       as active,
                 coalesce(sum(t.count) filter (where t.metric = 'active_day' and t.key = 'iu'), 0)        as iu,
                 coalesce(sum(t.count) filter (where t.metric = 'active_day' and t.key = 'purdue'), 0)    as purdue,
                 coalesce(sum(t.count) filter (where t.metric = 'active_day' and t.key = 'unknown'), 0)   as unknown_school,
                 coalesce(sum(t.count) filter (where t.metric = 'device_day' and t.key = 'phone'), 0)     as phone,
                 coalesce(sum(t.count) filter (where t.metric = 'device_day' and t.key = 'desktop'), 0)   as desktop,
                 coalesce(sum(t.count) filter (where t.metric = 'device_day' and t.key = 'installed'), 0) as installed,
                 coalesce(sum(t.count) filter (where t.metric = 'device_day' and t.key = 'unknown'), 0)   as unknown_device,
                 coalesce(sum(t.count) filter (where t.metric = 'otto_open' and t.key = 'all'), 0)        as otto_open,
                 coalesce(sum(t.count) filter (where t.metric = 'map_open' and t.key = 'all'), 0)         as map_open,
                 coalesce(bool_or(t.metric = 'otto_open' and t.key = 'capped'), false)                    as otto_capped,
                 coalesce(bool_or(t.metric = 'map_open' and t.key = 'capped'), false)                     as map_capped
            from (select v_since + n as day from generate_series(0, v_days - 1) n) g
            left join public.usage_day_tally t
              on t.day = g.day
             and t.metric in ('active_day', 'device_day', 'otto_open', 'map_open')
           group by g.day) d;

  -- Twelve Monday weeks ending with this one, oldest first. partial: the
  -- week began before first_week (or nothing is counted yet).
  select coalesce(jsonb_agg(jsonb_build_object(
           'week',    to_char(w.week::timestamp, 'YYYY-MM-DD'),
           'active',  w.active,
           'partial', v_first_week is null or w.week < v_first_week) order by w.week), '[]'::jsonb)
    into v_by_week
    from (select g.week,
                 coalesce((select t.count
                             from public.usage_day_tally t
                            where t.day = g.week and t.metric = 'active_week' and t.key = 'all'), 0) as active
            from (select v_week - 7 * n as week from generate_series(0, 11) n) g) w;

  -- Thirteen sign-up weeks ending with this one, oldest first. seen[k] =
  -- people from that sign-up week seen k weeks later (k = 0..4); null when
  -- that week has not come yet, or began before first_week.
  select coalesce(jsonb_agg(jsonb_build_object(
           'week', to_char(s.week::timestamp, 'YYYY-MM-DD'),
           'seen', s.seen) order by s.week), '[]'::jsonb)
    into v_cohorts
    from (select g.week,
                 (select jsonb_agg(case
                                     when g.week + 7 * k > v_week then null
                                     when v_first_week is null or g.week + 7 * k < v_first_week then null
                                     else coalesce((select t.count
                                                      from public.usage_day_tally t
                                                     where t.day = g.week + 7 * k
                                                       and t.metric = 'cohort'
                                                       and t.key = 'w' || k::text), 0)
                                   end order by k)
                    from generate_series(0, 4) k) as seen
            from (select v_week - 7 * n as week from generate_series(0, 12) n) g) s;

  return jsonb_build_object(
    'today',      to_char(v_today::timestamp, 'YYYY-MM-DD'),
    'since',      to_char(v_since::timestamp, 'YYYY-MM-DD'),
    'days',       v_days,
    'started',    to_char(v_started::timestamp, 'YYYY-MM-DD'),
    'first_week', to_char(v_first_week::timestamp, 'YYYY-MM-DD'),
    'by_day',     v_by_day,
    'by_week',    v_by_week,
    'cohorts',    v_cohorts);
end;
$tally$;

comment on function public.admin_usage_tally(integer) is
  'The day totals of use (usage_day_tally) for the Usage tab: people per UTC day by school and device, Otto and map opens '
  '(and whether their cap turned one away), '
  'people per Monday week, and how many of each sign-up week were seen in the four weeks after. Counts only. p_days held '
  'to 7..90. Service role only: anon and authenticated are refused inside (42501). For GET /api/admin/usage (20261014150000).';

-- EXECUTE for every API role, on purpose (standing rule since 2026-09-22,
-- 20260922090000_guard_function_privileges.sql): on Supabase's Postgres image
-- a role calling a public function it can't EXECUTE crashes the backend and
-- drops every connection, so the refusal lives INSIDE each function. Never
-- take EXECUTE away from anon or authenticated here.
revoke all on function public.usage_touch(uuid, text, text) from public;
grant execute on function public.usage_touch(uuid, text, text) to anon, authenticated, service_role;
revoke all on function public.admin_usage_tally(integer) from public;
grant execute on function public.admin_usage_tally(integer) to anon, authenticated, service_role;

-- 4. THE LAST-ACTIVE TIME: written by the check-in only ----------------------
-- A column grant, not a function, so the standing rule does not apply: a
-- refused column UPDATE gets the supautils hint and the connection stays up
-- (checked locally). SELECT went in 20261008120000.
revoke update (last_active_at) on public.users from authenticated;

-- 5. "ACTIVE NOW" FROM 5 UP, AND NEVER ON A CAMPUS UNDER 10 ------------------
-- Franky, Oct 14: from this file on every page checks in, so the exact count
-- would show whether one person on a small campus has Vibe open. The people
-- are 20261008120000's (users_select_authenticated: the caller, or an
-- account user_visible lets anyone see), counted campus by campus, and a
-- campus adds nothing until 5 people OTHER than the caller are active there.
-- A floor on the total alone would not hold: the caller picks p_campus_ids,
-- so a big campus asked alone and then with a small one would answer the
-- small one's count. Floored per campus, any list answers 0 or 5 and up, and
-- two lists differ only by campuses that pass. Not counting the caller
-- toward the 5: the caller can switch their own check-in on and off, and a
-- floor that counted them would answer 0, then 5, which says "exactly 4
-- others" (the review, Oct 14). The caller still counts in a number that is
-- shown, so their own campus answers 6 and up, or 0.
-- WHO IS NOT ON (Franky, Oct 14, the second floor): a campus also adds
-- nothing until 5 people other than the caller are NOT active there. Else a
-- campus of 6 with 5 shown would say the one left over is away (the header
-- prints the campus's head count beside "active now"). So a campus under 10
-- people never shows. The caller is left out of this 5 too, for the same
-- reason: with them in it, switching their own check-in off and on would
-- answer 5, then 0, which says "exactly 4 others are not on" (the
-- reviewer's draft counted them; this body does not). For that the rows are
-- now everyone the caller may see on the listed campuses, and 20261008120000's
-- 5-minute window moved from the where into the counts: n is everyone
-- active, others the active ones but the caller, m everyone but the caller,
-- and m - others who is not on. An account never stamped (no last-active
-- time) is not on. Accounts with no campus count as one more campus.
-- auth.uid() is null for postgres and the service role, so there every row
-- is an "other".
-- Both 5s = ACTIVE_NOW_MIN in src/lib/usage/active-now.ts
-- (tally-migration.test.ts compares). No grant and no revoke here: create
-- or replace keeps the owner and the grants (anon, authenticated,
-- service_role; PUBLIC none), and the post-check compares them with the
-- pre-flight's.
create or replace function public.users_active_count(p_campus_ids text[] default null)
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $active$
  select coalesce(sum(c.n) filter (where c.others >= 5 and c.m - c.others >= 5), 0)::bigint
    from (select count(*) filter (where u.last_active_at >= now() - interval '5 minutes') as n,
                 count(*) filter (where u.last_active_at >= now() - interval '5 minutes'
                                    and u.id is distinct from (select auth.uid())) as others,
                 count(*) filter (where u.id is distinct from (select auth.uid())) as m
            from public.users u
           where (p_campus_ids is null or u.campus_id = any (p_campus_ids))
             and (u.id = (select auth.uid()) or public.user_visible(u.id))
           group by u.campus_id) c;
$active$;

comment on function public.users_active_count(text[]) is
  'How many accounts the caller may see were active in the last 5 minutes, everywhere (null) or in the listed campuses, '
  'counted campus by campus: a campus adds nothing unless at least 5 people other than the caller are active there AND '
  'at least 5 other than the caller are not, so the answer is 0 or 5 and up ("active now" is shown only from 5 up), a '
  'campus under 10 people never shows, and the caller''s own check-in never decides it. '
  'The window and both 5s are fixed here on purpose. For GET /api/stats/campus (20261008120000, the floors 20261014150000).';

-- 6. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad   text := '';
  w     regprocedure := to_regprocedure('public.usage_touch(uuid,text,text)');
  r     regprocedure := to_regprocedure('public.admin_usage_tally(integer)');
  ac    regprocedure := to_regprocedure('public.users_active_count(text[])');
  f     regprocedure;
  api   text;
  probe text;
  other bigint;
  shown bigint;
  camp  text;
  src   text;
begin
  if w is null or r is null then
    raise exception 'usage-tally post-check failed: a function is missing';
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.usage_day_tally'::regclass)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.usage_day_tally'::regclass) then
    bad := bad || ' usage_day_tally has RLS off or a policy;';
  end if;
  foreach api in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(api, 'public.usage_day_tally', 'select,insert,update,delete,truncate,references,trigger') then
      bad := bad || format(' %s holds a privilege on usage_day_tally;', api);
    end if;
  end loop;

  foreach f in array array[w, r] loop
    if not (has_function_privilege('anon', f, 'execute')
            and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f) then
      bad := bad || format(' %s is not SECURITY DEFINER;', f);
    end if;
    if (select p.proconfig from pg_proc p where p.oid = f) is distinct from array['search_path=""'] then
      bad := bad || format(' %s does not pin search_path to empty;', f);
    end if;
  end loop;
  if (select p.provolatile from pg_proc p where p.oid = w) <> 'v' then
    bad := bad || ' the check-in is not VOLATILE;';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = r) <> 's' then
    bad := bad || ' the read is not STABLE;';
  end if;

  foreach api in array array['anon', 'authenticated'] loop
    if has_column_privilege(api, 'public.users', 'last_active_at', 'UPDATE')
       or has_column_privilege(api, 'public.users', 'last_active_at', 'SELECT') then
      bad := bad || format(' %s can still write or read users.last_active_at;', api);
    end if;
  end loop;
  select count(*) into other
    from pg_attribute a
   where a.attrelid = 'public.users'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname <> 'last_active_at'
     and has_column_privilege('authenticated', 'public.users', a.attname, 'UPDATE');
  if other::text is distinct from current_setting('vibe.usage_tally_other_update_cols', true) then
    bad := bad || ' the column revoke changed another users column;';
  end if;

  -- The ceiling: rows the table must refuse (a 2000 date, never a real one).
  foreach probe in array array[
    $p$(date '2000-01-04', 'active_day', 'someone', 1)$p$,
    $p$(date '2000-01-04', 'device_day', 'tablet', 1)$p$,
    $p$(date '2000-01-04', 'otto_open', 'iu', 1)$p$,
    $p$(date '2000-01-04', 'active_week', 'all', 1)$p$,
    $p$(date '2000-01-03', 'cohort', 'w5', 1)$p$,
    $p$(date '2000-01-03', 'cohort', '2000-01-03', 1)$p$,
    $p$(date '2000-01-04', 'signed_up', 'all', 1)$p$,
    $p$(date '2000-01-04', 'map_open', 'all', -1)$p$]
  loop
    begin
      execute 'insert into public.usage_day_tally (day, metric, key, count) values ' || probe;
      bad := bad || format(' usage_day_tally took %s;', probe);
    exception when check_violation then
      null;
    end;
  end loop;
  -- ...and rows it must take, one of each kind the check-in writes. A table
  -- kept from an earlier version of this file with an older CHECK would
  -- refuse one at its first use (a 500 on every check-in that day); stop
  -- here instead. Undone at once by the raise.
  begin
    insert into public.usage_day_tally (day, metric, key, count)
    values (date '2000-01-04', 'active_day', 'all', 1),
           (date '2000-01-04', 'active_day', 'unknown', 1),
           (date '2000-01-04', 'device_day', 'unknown', 1),
           (date '2000-01-04', 'otto_open', 'all', 1),
           (date '2000-01-04', 'map_open', 'capped', 1),
           (date '2000-01-03', 'active_week', 'all', 1),
           (date '2000-01-03', 'cohort', 'w4', 1);
    raise exception 'usage-tally: probe rows undone';
  exception
    when check_violation then
      bad := bad || ' usage_day_tally refuses a row the check-in writes (a kept table with an older CHECK?);';
    when raise_exception then
      null;
  end;

  -- Both bodies once each (PL/pgSQL plans a statement the first time it
  -- runs): an account that does not exist returns before writing, and the
  -- read works on whatever the table holds.
  perform public.usage_touch('00000000-0000-0000-0000-000000000000'::uuid, 'phone', 'otto');
  perform public.admin_usage_tally(30);

  -- "Active now" from 5 up: both floors are in the body (5 others on, 5
  -- others not on, per campus), the function is otherwise what
  -- 20261008120000 made it, and who may call it did not move. The body is
  -- read with every run of spaces as one.
  if ac is null then
    raise exception 'usage-tally post-check failed: users_active_count(text[]) is missing';
  end if;
  select regexp_replace(p.prosrc, '\s+', ' ', 'g') into src from pg_proc p where p.oid = ac;
  if src not like '%count(*) filter (where u.last_active_at >= now() - interval ''5 minutes'' and u.id is distinct from (select auth.uid())) as others,%'
     or src not like '%sum(c.n) filter (where c.others >= 5%'
     or src not like '%group by u.campus_id) c;%' then
    bad := bad || ' users_active_count has no floor of 5 others active per campus;';
  end if;
  if src not like '%count(*) filter (where u.id is distinct from (select auth.uid())) as m from public.users u where %'
     or src not like '%c.m - c.others >= 5), 0)::bigint%' then
    bad := bad || ' users_active_count has no floor of 5 others not active per campus;';
  end if;
  if not exists (select 1
                   from pg_proc p
                   join pg_language l on l.oid = p.prolang
                  where p.oid = ac
                    and l.lanname = 'sql'
                    and p.provolatile = 's'
                    and p.prosecdef
                    and p.proconfig = array['search_path=public']
                    and p.prorettype = 'bigint'::regtype) then
    bad := bad || ' users_active_count is no longer sql, stable, security definer, search_path public, bigint;';
  end if;
  if coalesce((select p.proacl::text from pg_proc p where p.oid = ac), 'default')
     is distinct from current_setting('vibe.usage_tally_active_acl', true) then
    bad := bad || ' who may call users_active_count changed;';
  end if;
  foreach api in array array['anon', 'authenticated', 'service_role'] loop
    if not has_function_privilege(api, ac, 'execute') then
      bad := bad || format(' users_active_count is refused to %s (the standing rule);', api);
    end if;
  end loop;
  -- ...and it answers 0 or 5 and up, here and now: everywhere, per campus
  -- (and 0 for a campus under 10 people), and for an empty list. Counts
  -- only, never a person.
  shown := public.users_active_count(null);
  if shown between 1 and 4 then
    bad := bad || format(' users_active_count(null) answered %s;', shown);
  end if;
  for camp in select distinct u.campus_id from public.users u where u.campus_id is not null loop
    shown := public.users_active_count(array[camp]);
    if shown between 1 and 4
       or (shown > 0 and (select count(*) from public.users u
                           where u.campus_id = camp and public.user_visible(u.id)) < 10) then
      bad := bad || format(' users_active_count answered %s for a campus (under 5, or under 10 people there);', shown);
    end if;
  end loop;
  if public.users_active_count(array[]::text[]) <> 0 then
    bad := bad || ' users_active_count of no campus is not 0;';
  end if;

  if bad <> '' then
    raise exception 'usage-tally post-check failed:%', bad;
  end if;
end $$;

-- 7. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
