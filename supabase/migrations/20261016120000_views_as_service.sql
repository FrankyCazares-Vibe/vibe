-- ---------------------------------------------------------------------------
-- 20261016120000_views_as_service.sql
--
-- PLAIN ENGLISH
-- From this file on, a post view and a profile view are counted by the
-- server, with the account the sign-in server verified, the way the
-- check-in already is (20261014150000). Until now the browser's own sign-in
-- called record_post_view and record_profile_view, so anyone could call
-- them straight from the database's web interface, as often as they liked.
-- The new pair answers the same as the old one for the same person, refuses
-- a browser outright, and stops counting one person's views past a generous
-- day cap (5,000 posts and 1,000 profiles a UTC day), counted from the view
-- rows that already exist: nothing new is kept about anyone. Also: the
-- check-in leaves without locking the person's row when it has nothing to
-- do, and two tables nothing uses stop taking writes from a browser.
-- Rate limits wave 3, batch B3.4 (Oct 16).
--
-- WHAT IT DOES
--   0. PRE-FLIGHT: no other function under the two new names; usage_touch
--      and the old pair are there, each alone under its name; every column
--      the bodies read is there; the role running this file passes RLS on
--      the four tables the bodies write (they write as their owner).
--   1. Two indexes for the day caps: post_views (user_id, viewed_on) and
--      profile_views (viewer_user_id, viewed_on). The tables' keys start
--      with the post and the profile, so without these a cap would read
--      every view of the day.
--   2. public.record_post_view_as(p_user, p_post_id): record_post_view's
--      answers (20260923090000, section 12) for the person passed in. False
--      for a missing post, the person's own post, a post moderators removed
--      or whose author is restricted, and a hidden club's post the person
--      may not see; else one row per post, person and UTC day, and the
--      post's view_count goes up with it. The hidden-club test is
--      org_content_visible's (20260922140000) written against p_user: that
--      helper reads auth.uid(), which is null under the service role, so
--      calling it here would stop counting members' views of their own
--      hidden club's posts (the review, Oct 15, #2).
--   3. public.record_profile_view_as(p_viewer, p_profile_user_id):
--      record_profile_view's answers for the person passed in. False for
--      your own profile; else one row per profile, viewer and UTC day, and
--      the profile's view count goes up with it. There is no referrer at
--      all: it is not stored since Oct 7 (Privacy Policy 3d), and the route
--      already sent null.
--      THE DAY CAPS (2 and 3): past 5,000 post views or 1,000 profile views
--      for the person that UTC day, false and nothing written. Counted from
--      today's rows for that person, through a LIMIT, so a cap reads 5,000
--      index entries at most. Not a rate_limits key, on purpose (the
--      review, #3): a per-person key there would keep a day-by-day row of
--      when each person was viewing and cost one more call per view, the
--      reason the check-in has no limiter. The view rows already say how
--      many a person viewed today; the cap only counts them.
--      BOTH: SECURITY DEFINER, search_path ''. anon and authenticated are
--      refused INSIDE (42501): taking the id from a signed-in caller would
--      let anyone count views as anyone. Called only by POST
--      /api/posts/[id]/view and POST /api/profile-views, through the
--      service role, with the id from supabase.auth.getUser().
--   4. EXECUTE on both for every API role, PUBLIC none (the standing rule).
--   5. usage_touch: 20261014150000's body with one block added before the
--      restriction test. When nothing is opened, it reads the stamp WITHOUT
--      a lock and leaves when the stamp is under a minute old and from
--      today (UTC; the same day is the same Monday week). The locked path
--      would change nothing then. The stamp only moves forward, so a newer
--      one seen under the lock decides the same. A second tab, the layout
--      and the Campus header at once, or a caller in a loop now cost one
--      indexed read and no row lock. Counting is unchanged. create or
--      replace keeps the owner and the grants; the post-check compares.
--   6. revoke insert, update, delete on public.reminders and
--      public.bookmark_collections from anon, authenticated. Both come from
--      the first schema (20260430190000), both hold 0 rows locally, and
--      nothing writes them. A grep of src/, public/, mobile/ and scripts/
--      (node_modules left out) on Oct 16 finds no client, route or script
--      naming either table (Otto's reminders are otto_reminders); no
--      function body names either (prosrc scan), no trigger sits on
--      either, and the one foreign key into them, bookmarks.collection_id,
--      is always written null (posts/[id]/save/route.ts:105).
--      views-as-migration.test.ts repeats the grep on every run. SELECT
--      stays. Table grants, not functions: a refused write answers 42501
--      and the connection stays up.
--   7. POST-CHECK (privileges, bodies, indexes, refusals).
--   8. notify pgrst.
--
-- DOES NOT: change record_post_view or record_profile_view (20261016130000
-- does, after the deploy); revoke any EXECUTE; add a rate_limits key;
-- store a referrer; touch post_views' or profile_views' grants, RLS or
-- rows; delete anything.
--
-- SAFE TO RUN AGAIN: create index if not exists, create or replace, the
-- same grants, the same revokes. The post-check reads each index's columns,
-- so an older index under the same name stops the file.
--
-- APPLIED on the local database on 2026-10-16, twice in a row, and once
-- more after 20261016130000. Function and table grants compared before and
-- after: the only changes are the two new functions (anon, authenticated,
-- service_role; PUBLIC none) and the six table privileges in section 6.
-- In rolled-back runs, person by person, the new pair (as the service role)
-- answered what the old pair answered (as that person, signed in), with
-- the same rows and counters: a hidden club's member, counted; a
-- non-member, false; a founder, counted; a public post, counted; the
-- author, false; a removed post, false; a repeat the same day, false; a
-- missing post, false; someone else's profile, counted; your own, false.
-- The old pair under the service role answered false for the member too
-- (the review's #2). At 4,999 post views that day (6,000 the day before,
-- not counted) the next view counted, the one after answered false with no
-- row and no counter moved, and another person's view of that post still
-- counted; the same at 999 profile views. Both caps read their new index.
-- As anon and as authenticated both new functions answered 42501, and the
-- connection stayed up. The check-in: a fresh stamp with nothing opened
-- changed nothing, an Otto open counted, a 2-minute-old stamp moved, a
-- stamp from yesterday or none counted the day, one ahead of now changed
-- nothing, as before; with the person's row locked by another session, a
-- check-in with nothing opened returned in 2 ms and an Otto open waited for
-- the lock. The post-check stopped the file with the refusal taken out, an
-- auth.uid() put in, an index dropped, a write granted back and a grant
-- widened.
-- src/lib/views/views-as-migration.test.ts keeps it from drifting.
-- Production: the main session.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (counts and settings, allowed by the counts-only rule):
--   SELECT to_regprocedure('public.record_post_view_as(uuid,uuid)') IS NULL    AS post_as_absent,
--          to_regprocedure('public.record_profile_view_as(uuid,uuid)') IS NULL AS profile_as_absent,
--          to_regprocedure('public.usage_touch(uuid,text,text)') IS NOT NULL   AS touch_there,
--          (SELECT count(*) FROM public.reminders)                             AS reminders_rows,
--          (SELECT count(*) FROM public.bookmark_collections)                  AS collections_rows,
--          (SELECT count(*) FROM public.post_views)                            AS post_view_rows,
--          (SELECT count(*) FROM public.profile_views)                         AS profile_view_rows;
--   -- expect t, t, t, 0, 0, and two small counts: each index build holds
--   -- that table's view writes for as long as it takes (the 5 s
--   -- lock_timeout stops the file rather than queue behind a long wait).
--   -- Any reminders or collections rows: stop, and re-read section 6.
--
-- DEPLOY ORDER. THIS FILE BEFORE THE DEPLOY. The new route code calls the
-- two new functions through the service role; nothing calls them before
-- it, and the old code keeps calling the old pair, unchanged here. If the
-- code goes first, every view answers 500 (the browsers fire and forget)
-- and nothing is counted until this file is applied. After the deploy,
-- once the served build is the new one: 20261016130000.
--
-- HOW TO APPLY BY HAND: the Supabase connector's apply_migration with the
-- body below minus begin/commit (then rename its auto-timestamp row in
-- schema_migrations to this file's version), or the Management API curl
-- recipe in 20260926100000_users_profile_layout.sql. It must run as
-- postgres (the pre-flight refuses a role RLS would hold back). Then:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261016120000', 'views_as_service') ON CONFLICT (version) DO NOTHING;
-- Checks by hand afterwards (as postgres, in the SQL editor):
--   BEGIN; SET LOCAL ROLE authenticated; SELECT public.record_post_view_as(gen_random_uuid(), gen_random_uuid()); ROLLBACK;
--   BEGIN; SET LOCAL ROLE anon; SELECT public.record_profile_view_as(gen_random_uuid(), gen_random_uuid()); ROLLBACK;
--   -- expect ERROR 42501 "not allowed" both times, and the connection stays up.
--   Then, signed in: open someone's post and profile; their counts go up
--   by one, once a day, as before.
--
-- ROLLBACK. 20261016130000's rollback first if it was applied. Never drop
-- the new pair while the new route code is live: every view would 500.
--   BEGIN;
--   DROP FUNCTION public.record_post_view_as(uuid, uuid);
--   DROP FUNCTION public.record_profile_view_as(uuid, uuid);
--   DROP INDEX public.idx_post_views_user_day;
--   DROP INDEX public.idx_profile_views_viewer_day;
--   GRANT INSERT, UPDATE, DELETE ON public.reminders, public.bookmark_collections TO anon, authenticated;
--   -- usage_touch: optional (the block changes no count). To take it out,
--   -- run 20261014150000's section 2 (its create or replace and comment).
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261016120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- The index builds and the revokes wait on the tables they touch, and every
-- view and check-in waits behind them. Fail fast instead of queueing.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  v_missing text;
  t         regclass;
begin
  -- The two this file makes may already be there (a re-run); any other
  -- argument list under the same names would make the calls ambiguous.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and ((p.proname = 'record_post_view_as'
                      and p.oid is distinct from to_regprocedure('public.record_post_view_as(uuid,uuid)')::oid)
                  or (p.proname = 'record_profile_view_as'
                      and p.oid is distinct from to_regprocedure('public.record_profile_view_as(uuid,uuid)')::oid))) then
    raise exception 'views-as: another public.record_post_view_as or record_profile_view_as sits beside the ones this file makes; drop it first';
  end if;
  -- The check-in is replaced in place, and the old pair is only read here:
  -- each must be there and alone under its name, so create or replace keeps
  -- the check-in's grants and the post-check reads the right functions.
  if to_regprocedure('public.usage_touch(uuid,text,text)') is null then
    raise exception 'views-as: public.usage_touch(uuid,text,text) is missing; apply 20261014150000 first';
  end if;
  if to_regprocedure('public.record_post_view(uuid)') is null
     or to_regprocedure('public.record_profile_view(uuid,text)') is null then
    raise exception 'views-as: record_post_view(uuid) or record_profile_view(uuid,text) is missing';
  end if;
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('usage_touch', 'record_post_view', 'record_profile_view')
                and p.oid not in (to_regprocedure('public.usage_touch(uuid,text,text)')::oid,
                                  to_regprocedure('public.record_post_view(uuid)')::oid,
                                  to_regprocedure('public.record_profile_view(uuid,text)')::oid)) then
    raise exception 'views-as: another usage_touch, record_post_view or record_profile_view sits beside the known ones; drop it first';
  end if;
  -- Every column the two bodies read or write.
  select string_agg(format('%s.%s', c.tbl, c.col), ', ')
    into v_missing
    from (values ('posts', 'user_id'), ('posts', 'org_id'), ('posts', 'removed_at'), ('posts', 'view_count'),
                 ('orgs', 'hidden_at'), ('org_members', 'org_id'), ('org_members', 'user_id'),
                 ('users', 'is_platform_admin'), ('users', 'profile_view_count'),
                 ('post_views', 'post_id'), ('post_views', 'user_id'), ('post_views', 'viewed_on'),
                 ('profile_views', 'profile_user_id'), ('profile_views', 'viewer_user_id'),
                 ('profile_views', 'viewed_on')) c(tbl, col)
   where not exists (select 1
                       from pg_attribute a
                      where a.attrelid = to_regclass('public.' || c.tbl)
                        and a.attname = c.col
                        and a.attnum > 0
                        and not a.attisdropped);
  if v_missing is not null then
    raise exception 'views-as: missing column(s): %', v_missing;
  end if;
  -- The bodies write as their owner. post_views and profile_views have RLS
  -- on and no policy, so an owner held back by RLS would write nothing:
  -- bypassrls, or owning each table without FORCE RLS.
  foreach t in array array['public.post_views', 'public.profile_views', 'public.posts', 'public.users']::regclass[] loop
    if not coalesce((select r.rolbypassrls from pg_roles r where r.rolname = current_user), false)
       and not exists (select 1
                         from pg_class c
                        where c.oid = t
                          and c.relowner = (select r.oid from pg_roles r where r.rolname = current_user)
                          and not c.relforcerowsecurity) then
      raise exception 'views-as: % would be held back by RLS on %; the views would write nothing. Apply as postgres.', current_user, t;
    end if;
  end loop;
  -- Remembered for the post-check: who may call the three functions this
  -- file leaves in place or replaces in place, exactly, before.
  perform set_config('vibe.views_as_acl',
                     (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, 'default'), ' '
                                        order by p.oid::regprocedure::text)
                        from pg_proc p
                       where p.oid in (to_regprocedure('public.usage_touch(uuid,text,text)')::oid,
                                       to_regprocedure('public.record_post_view(uuid)')::oid,
                                       to_regprocedure('public.record_profile_view(uuid,text)')::oid)),
                     true);
end $$;

-- 1. THE INDEXES FOR THE DAY CAPS ---------------------------------------------
create index if not exists idx_post_views_user_day on public.post_views (user_id, viewed_on);
create index if not exists idx_profile_views_viewer_day on public.profile_views (viewer_user_id, viewed_on);

-- 2. A POST VIEW, COUNTED BY THE SERVER ---------------------------------------
-- 5000 = the day cap in the header (views-as-migration.test.ts compares).
create or replace function public.record_post_view_as(p_user uuid, p_post_id uuid)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $postview$
declare
  v_today      date := (now() at time zone 'utc')::date;
  v_author     uuid;
  v_org_id     uuid;
  v_removed_at timestamptz;
  v_inserted   boolean := false;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_user is null then
    return false;
  end if;

  select p.user_id, p.org_id, p.removed_at
    into v_author, v_org_id, v_removed_at
    from public.posts p
   where p.id = p_post_id;

  if v_author is null then
    -- Deleted or never-existed post. The FK would have rejected the insert.
    return false;
  end if;

  if v_author = p_user then
    -- Looking at your own post doesn't count. Mirrors the profile view.
    return false;
  end if;

  if v_removed_at is not null or not public.user_visible(v_author) then
    -- Removed by moderators, or its author is restricted: to everyone but the
    -- author the post is not there, so it answers like a missing one.
    return false;
  end if;

  -- A hidden club's post, and the club is hidden from this person: to them
  -- the post doesn't exist. org_content_visible's test, against p_user
  -- (that helper reads auth.uid(), null under the service role): the club
  -- is not hidden, or the person is a member, or a founder.
  if v_org_id is not null
     and not exists (select 1
                       from public.orgs o
                      where o.id = v_org_id
                        and (o.hidden_at is null
                             or exists (select 1
                                          from public.org_members m
                                         where m.org_id = v_org_id
                                           and m.user_id = p_user)
                             or exists (select 1
                                          from public.users u
                                         where u.id = p_user
                                           and u.is_platform_admin))) then
    return false;
  end if;

  -- The day cap: 5,000 posts a UTC day, counted from today's rows (at most
  -- 5,000 index entries read). Past it, nothing is written.
  if (select count(*)
        from (select 1
                from public.post_views v
               where v.user_id = p_user
                 and v.viewed_on = v_today
               limit 5000) s) >= 5000 then
    return false;
  end if;

  insert into public.post_views (post_id, user_id, viewed_on)
  values (p_post_id, p_user, v_today)
  on conflict (post_id, user_id, viewed_on) do nothing
  returning true into v_inserted;

  if v_inserted then
    update public.posts
       set view_count = view_count + 1
     where id = p_post_id;
  end if;

  return coalesce(v_inserted, false);
end;
$postview$;

comment on function public.record_post_view_as(uuid, uuid) is
  'Counts one view of a post by p_user, once per UTC day: record_post_view''s answers for that person (false for a missing, '
  'own, removed or restricted-author post, and for a hidden club''s post they may not see), and false past 5,000 posts '
  'that day. Service role only: anon and authenticated are refused inside (42501). For POST /api/posts/[id]/view (20261016120000).';

-- 3. A PROFILE VIEW, COUNTED BY THE SERVER ------------------------------------
-- 1000 = the day cap in the header (views-as-migration.test.ts compares).
create or replace function public.record_profile_view_as(p_viewer uuid, p_profile_user_id uuid)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $profileview$
declare
  v_today    date := (now() at time zone 'utc')::date;
  v_inserted boolean := false;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_viewer is null then
    return false;
  end if;
  if p_viewer = p_profile_user_id then
    -- Looking at your own profile doesn't count.
    return false;
  end if;

  -- The day cap: 1,000 profiles a UTC day, counted from today's rows (at
  -- most 1,000 index entries read). Past it, nothing is written.
  if (select count(*)
        from (select 1
                from public.profile_views v
               where v.viewer_user_id = p_viewer
                 and v.viewed_on = v_today
               limit 1000) s) >= 1000 then
    return false;
  end if;

  -- No referrer: not stored since Oct 7 (Privacy Policy 3d).
  insert into public.profile_views (profile_user_id, viewer_user_id, viewed_on)
  values (p_profile_user_id, p_viewer, v_today)
  on conflict (profile_user_id, viewer_user_id, viewed_on) do nothing
  returning true into v_inserted;

  if v_inserted then
    update public.users
       set profile_view_count = profile_view_count + 1
     where id = p_profile_user_id;
  end if;

  return coalesce(v_inserted, false);
end;
$profileview$;

comment on function public.record_profile_view_as(uuid, uuid) is
  'Counts one view of a profile by p_viewer, once per UTC day: record_profile_view''s answers for that person (false for '
  'their own profile), no referrer, and false past 1,000 profiles that day. Service role only: anon and authenticated are '
  'refused inside (42501). For POST /api/profile-views (20261016120000).';

-- 4. EXECUTE for every API role, on purpose (standing rule since 2026-09-22,
-- 20260922090000_guard_function_privileges.sql): on Supabase's Postgres image
-- a role calling a public function it can't EXECUTE crashes the backend and
-- drops every connection, so the refusal lives INSIDE each function. Never
-- take EXECUTE away from anon or authenticated here.
revoke all on function public.record_post_view_as(uuid, uuid) from public;
grant execute on function public.record_post_view_as(uuid, uuid) to anon, authenticated, service_role;
revoke all on function public.record_profile_view_as(uuid, uuid) from public;
grant execute on function public.record_profile_view_as(uuid, uuid) to anon, authenticated, service_role;

-- 5. THE CHECK-IN: NO ROW LOCK WHEN THERE IS NOTHING TO DO ---------------------
-- 20261014150000's body, word for word, with one block added after the dates
-- are worked out (views-as-migration.test.ts takes the block out and
-- compares the rest with that file). No grant and no revoke here: create or
-- replace keeps the owner and the grants (anon, authenticated, service_role;
-- PUBLIC none), and the post-check compares them with the pre-flight's.
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

  -- Nothing to do, found WITHOUT the row lock (20261016120000): nothing
  -- opened, and a stamp under a minute old from today (the same UTC day is
  -- the same Monday week). The locked path below would change nothing then.
  -- The stamp only moves forward, so a newer one seen under the lock would
  -- decide the same. A second tab or a caller in a loop never queues on the
  -- person's row.
  if p_open is null then
    select u.last_active_at
      into v_old
      from public.users u
     where u.id = p_user;
    if v_old > v_now - interval '60 seconds'
       and (v_old at time zone 'utc')::date >= v_today then
      return;
    end if;
  end if;

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
  'Founders and store-review accounts are stamped, never counted. With nothing to do it leaves without locking the row. '
  'Service role only: anon and authenticated are refused inside (42501). For POST /api/me/heartbeat (20261014150000, '
  'the no-lock path 20261016120000).';

-- 6. TWO TABLES NOTHING USES STOP TAKING WRITES FROM A BROWSER ---------------
-- Table grants, not functions, so the standing rule does not apply: a
-- refused write answers 42501 and the connection stays up. SELECT stays,
-- and the service role keeps everything.
revoke insert, update, delete on public.reminders from anon, authenticated;
revoke insert, update, delete on public.bookmark_collections from anon, authenticated;

-- 7. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad  text := '';
  pv   regprocedure := to_regprocedure('public.record_post_view_as(uuid,uuid)');
  pr   regprocedure := to_regprocedure('public.record_profile_view_as(uuid,uuid)');
  w    regprocedure := to_regprocedure('public.usage_touch(uuid,text,text)');
  f    regprocedure;
  api  text;
  tbl  text;
  src  text;
  zero uuid := '00000000-0000-0000-0000-000000000000';
begin
  if pv is null or pr is null or w is null then
    raise exception 'views-as post-check failed: a function is missing';
  end if;

  foreach f in array array[pv, pr, w] loop
    if not (has_function_privilege('anon', f, 'execute')
            and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
    if not exists (select 1
                     from pg_proc p
                    where p.oid = f
                      and p.prosecdef
                      and p.provolatile = 'v'
                      and p.proconfig = array['search_path=""']) then
      bad := bad || format(' %s is not security definer, volatile, search_path empty;', f);
    end if;
    -- The body without its notes, every run of spaces as one.
    select regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')
      into src from pg_proc p where p.oid = f;
    if position('if current_setting(''role'', true) in (''anon'', ''authenticated'') then raise exception ''not allowed'' using errcode = ''42501''; end if;' in src) = 0 then
      bad := bad || format(' %s does not refuse the browser''s two roles;', f);
    end if;
    if src ~ 'auth\.uid|org_content_visible' then
      bad := bad || format(' %s reads auth.uid() (null under the service role);', f);
    end if;
  end loop;

  -- The day caps, and no referrer.
  if (select p.prosrc from pg_proc p where p.oid = pv) !~ 'limit 5000\) s\) >= 5000 then'
     or (select p.prosrc from pg_proc p where p.oid = pr) !~ 'limit 1000\) s\) >= 1000 then' then
    bad := bad || ' a view day cap is missing;';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = pr) ~ 'referrer \(|, referrer' then
    bad := bad || ' record_profile_view_as writes a referrer;';
  end if;

  -- The check-in: the no-lock block is there, and comes before the lock.
  select regexp_replace(p.prosrc, '\s+', ' ', 'g') into src from pg_proc p where p.oid = w;
  if position('if p_open is null then select u.last_active_at into v_old from public.users u where u.id = p_user; '
              'if v_old > v_now - interval ''60 seconds'' and (v_old at time zone ''utc'')::date >= v_today then return; end if; end if;' in src) = 0
     or position('if p_open is null then select u.last_active_at' in src) > position('for update of u;' in src) then
    bad := bad || ' usage_touch has no no-lock path before the lock;';
  end if;

  -- Who may call the three left or replaced in place did not move.
  if (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, 'default'), ' '
                        order by p.oid::regprocedure::text)
        from pg_proc p
       where p.oid in (w::oid,
                       to_regprocedure('public.record_post_view(uuid)')::oid,
                       to_regprocedure('public.record_profile_view(uuid,text)')::oid))
     is distinct from current_setting('vibe.views_as_acl', true) then
    bad := bad || ' who may call usage_touch, record_post_view or record_profile_view changed;';
  end if;

  if coalesce(pg_get_indexdef(to_regclass('public.idx_post_views_user_day')), '')
       not like '% ON public.post_views USING btree (user_id, viewed_on)'
     or coalesce(pg_get_indexdef(to_regclass('public.idx_profile_views_viewer_day')), '')
       not like '% ON public.profile_views USING btree (viewer_user_id, viewed_on)' then
    bad := bad || ' a day-cap index is missing or on other columns;';
  end if;

  foreach tbl in array array['public.reminders', 'public.bookmark_collections'] loop
    foreach api in array array['anon', 'authenticated'] loop
      if has_table_privilege(api, tbl, 'insert,update,delete') then
        bad := bad || format(' %s can still write %s;', api, tbl);
      end if;
      if not has_table_privilege(api, tbl, 'select') then
        bad := bad || format(' %s lost SELECT on %s;', api, tbl);
      end if;
    end loop;
    if not (has_table_privilege('service_role', tbl, 'select') and has_table_privilege('service_role', tbl, 'insert')
            and has_table_privilege('service_role', tbl, 'update') and has_table_privilege('service_role', tbl, 'delete')) then
      bad := bad || format(' service_role lost a privilege on %s;', tbl);
    end if;
  end loop;

  -- The browser's two roles are refused (42501) and the connection stays
  -- up. Each probe's role change is undone with its block.
  foreach api in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', api);
      perform public.record_post_view_as(zero, zero);
      raise exception 'views-as: probe not refused';
    exception
      when insufficient_privilege then null;
      when raise_exception then bad := bad || format(' record_post_view_as was not refused to %s;', api);
    end;
    begin
      execute format('set local role %I', api);
      perform public.record_profile_view_as(zero, zero);
      raise exception 'views-as: probe not refused';
    exception
      when insufficient_privilege then null;
      when raise_exception then bad := bad || format(' record_profile_view_as was not refused to %s;', api);
    end;
  end loop;

  -- Each body once (PL/pgSQL plans a statement the first time it runs):
  -- a missing post, your own profile and an account that does not exist
  -- answer before writing anything.
  if public.record_post_view_as(zero, zero) or public.record_profile_view_as(zero, zero) then
    bad := bad || ' a view counted that cannot;';
  end if;
  perform public.usage_touch(zero, 'phone', null);

  if bad <> '' then
    raise exception 'views-as post-check failed:%', bad;
  end if;
end $$;

-- 8. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
