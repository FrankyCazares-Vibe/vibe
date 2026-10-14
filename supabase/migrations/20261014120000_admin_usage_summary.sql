-- ---------------------------------------------------------------------------
-- 20261014120000_admin_usage_summary.sql
--
-- PLAIN ENGLISH
-- The founders can see how many accounts there are and how many times the
-- front pages were opened (the admin Numbers tab), but not how Vibe is used:
-- who comes back, what gets used, which clubs are alive (next up per Franky,
-- Oct 13: usage stats). This file adds one function that answers all of it
-- as totals, in one call, for the new admin Usage tab. Numbers only: no
-- account id, no name or handle of a person, no address, no message, post or
-- comment text, no Otto answer ever leaves it.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: no other admin_usage_summary sits beside this one (two
--      would make the call ambiguous), and the role running this file can
--      read auth.users (the function runs as its owner). Safe to run again:
--      a second run replaces the function in place and grants the same.
--   2. public.admin_usage_summary(p_days integer default 30) returns jsonb.
--      SECURITY DEFINER, search_path '', STABLE (it only reads). p_days is
--      held to 7..90. Days are UTC dates; weeks start on Monday (UTC). The
--      shape is the UsageRaw type in src/lib/usage/view.ts: today, since,
--      days, door, waves, back, used, clubs, where. Every by_day list has one
--      row per day of the window, zero-filled, oldest first; by_week and
--      cohorts have twelve Monday weeks, oldest first.
--   3. In the standing rule's shape (20260922090000): anon, authenticated and
--      service_role all hold EXECUTE, and anon and authenticated are refused
--      INSIDE (42501), so only the service role can ask (GET
--      /api/admin/usage, behind requirePlatformAdmin) and the owner, by hand.
--   4. POST-CHECK, then notify pgrst.
--
-- WHO IS LEFT OUT, everywhere
--   - The founders (users.is_platform_admin), as people and as the ones who
--     acted. Only the actor is tested: a student liking a founder's post
--     still counts. NOT on the waitlist log (moderation_actions): a founder
--     is always its actor, so that test would zero it.
--   - The store-review accounts (vibe_review_account in the sign-in app
--     metadata, scripts/seed-review-accounts.mjs). Not founders, and they
--     arrive with the store submission.
--   - Hidden test clubs (orgs.hidden_at set, as of now) from every club,
--     club-post, event, RSVP, club-chat, club-follow and club-member count.
--     The coming-back history needs no club test: only founders are members
--     of hidden clubs.
--   - Test waves: a waitlist batch named test-N, on codes sent, founder adds
--     and waves.
--
-- WHAT EACH NUMBER MEANS (the Usage tab explains the same words)
--   door. accounts = every account left after the exclusions, the population
--     the "where" lists add up to; accounts_confirmed = the sign-in address
--     was confirmed; school_verified; onboarded = Otto's answers were saved
--     (tested for emptiness only, never read). Per day: signups = confirmed
--     accounts by the day they were made; school_verified = the day the
--     school sign-in address was confirmed, for school-first accounts made
--     since Oct 8 2026 (0 before: the tab says "counted from Oct 8");
--     waitlist_form = waitlist confirm notes sent (the send log outlives the
--     38-day purge; a re-submit counts twice); waitlist_founder_add = "Add
--     someone"; codes_sent = codes and resends.
--   waves. Confirmed accounts per waitlist batch, by the day the wave first
--     joined; 'no batch' for codes sent without one.
--   back. active_now (5 minutes, as users_active_count) / 1 / 7 / 30 days =
--     the last time the person was seen: the Campus heartbeat, a chat read
--     (only one after they joined that chat: joining a club stamps a read),
--     Otto opened with unread items, or anything dated they did. by_day and
--     by_week = people who DID something dated that day or week: a post,
--     comment, like, repost, save, RSVP, reaction, poll vote, message,
--     follow, club follow or join, event, Otto opened, or a post or profile
--     they viewed that is not their own. The two overwritten times (the
--     heartbeat and the chat read) stay out of the history: they would make
--     the past look empty and today look busy. The phone feed records no
--     views, so the history undercounts people who only scroll on a phone.
--     cohorts = confirmed sign-ups per Monday week (the last twelve weeks
--     before this one) and how many did something dated the week after.
--   used. totals = all-time counts of the rows that still exist; by_day =
--     the same rows per day in the window. Removed content still counts: it
--     was sent. Deleted rows are gone: an unlike, a cancelled event and its
--     room, a deleted account. club_relationships = a first follow or join
--     (org_follow_firsts); club_follows = follows that are not a join;
--     direct_messages = DMs and group chats; group_messages = groups only.
--   clubs. visible clubs; of those, the ones where a current officer (owner,
--     admin or mod, not a founder) posted for the club, sent a message in its
--     chat or made an event in the last 7 days; with an event starting this
--     UTC month; with a message in the last 7 days. per_club = each visible
--     club's public name, members, messages in the last 7 and 30 days, and
--     events starting this month. A founder's own activity is left out, so a
--     club a founder helps run can read low.
--   where. Accounts by school system and by the campus picked.
--
-- DOES NOT: return an id, a person's name or handle, an address, any message,
-- post, comment or event text, the Otto answers, where a profile view came
-- from, or anything about a network. The route shows small cells as <5
-- (src/lib/usage/view.ts); that is how the tab reads, not what makes this
-- safe: exact totals sit next to them. The founders see totals by design
-- (Privacy Policy section 1, October 14, 2026).
--
-- APPLIED on the local database on 2026-10-14, twice in a row, and checked
-- there (the whole shape read cleanly by view.ts, zero-filled days, anon and
-- authenticated refused with 42501, p_days 1 read as 7 and 500 as 90, four
-- numbers matched by hand). src/lib/usage/migration.test.ts keeps the
-- refusal, the grants and the counts-only rules from drifting. Production:
-- the main session.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (a setting, allowed by the counts-only rule):
--   SELECT to_regprocedure('public.admin_usage_summary(integer)') IS NULL AS fn_absent;
--   -- expect t the first time; f means it ran before, and a re-run replaces it.
--
-- DEPLOY ORDER. CODE FIRST. GET /api/admin/usage answers ready:false while
-- the function is missing (PGRST202 / 42883), and the Usage tab says the
-- usage counter is not switched on yet. Applying this file first is harmless
-- too: nothing calls the function until the route ships.
--
-- THE SAME DAY THE CODE SHIPS: Privacy Policy section 1 gains a line (the
-- founders see totals of use; a quiet day's total can be one person's) and
-- the date at the top moves to October 14, 2026.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, or the Supabase connector's
-- apply_migration with the body below minus begin/commit (then rename its
-- auto-timestamp row in schema_migrations to this file's version). It must
-- run as a role that can read auth.users (postgres; the pre-flight refuses
-- any other). Then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261014120000', 'admin_usage_summary') ON CONFLICT (version) DO NOTHING;
-- A check by hand afterwards (as postgres, in the SQL editor):
--   SELECT jsonb_pretty(public.admin_usage_summary(30));   -- counts only
--   BEGIN; SET LOCAL ROLE authenticated; SELECT public.admin_usage_summary(30); ROLLBACK;
--   -- expect ERROR 42501 "not allowed", and the connection stays up.
--
-- ROLLBACK (the code keeps working: the tab goes back to "not switched on"):
--   BEGIN;
--   DROP FUNCTION public.admin_usage_summary(integer);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261014120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  -- This one already there is fine (create or replace below); any other
  -- argument list under the same name is not.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname = 'admin_usage_summary'
                and p.oid is distinct from to_regprocedure('public.admin_usage_summary(integer)')::oid) then
    raise exception 'usage-summary: another public.admin_usage_summary exists beside (integer); drop it first';
  end if;
  if not has_table_privilege(current_user, 'auth.users', 'SELECT') then
    raise exception 'usage-summary: % cannot read auth.users; the function would fail every call (42501). Apply as postgres.', current_user;
  end if;
end $$;

-- 1. THE FUNCTION ------------------------------------------------------------
create or replace function public.admin_usage_summary(p_days integer default 30)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $fn$
declare
  v_days       integer;
  v_now        timestamptz;
  v_today      date;
  v_since      date;
  -- This week's Monday, in date arithmetic only: date_trunc('week', ...)
  -- would go through the session's time zone.
  v_week       date;
  v_month      date;
  v_next_month date;
  -- The oldest moment any part reads back to: the window, or the first of
  -- the twelve weeks, whichever is older.
  v_from       timestamptz;
  -- The founders and the store-review accounts: left out as people and as
  -- the ones who acted.
  v_out        uuid[];
  v_door  jsonb;
  v_waves jsonb;
  v_back  jsonb;
  v_used  jsonb;
  v_clubs jsonb;
  v_where jsonb;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_days       := least(greatest(coalesce(p_days, 30), 7), 90);
  v_now        := now();
  v_today      := (v_now at time zone 'utc')::date;
  v_since      := v_today - (v_days - 1);
  v_week       := v_today - (extract(isodow from v_today)::int - 1);
  v_month      := v_today - (extract(day from v_today)::int - 1);
  v_next_month := (v_month + interval '1 month')::date;
  v_from       := least(v_since, v_week - 84)::timestamp at time zone 'utc';

  select coalesce(array_agg(u.id), '{}')
    into v_out
    from public.users u
    left join auth.users au on au.id = u.id
   where u.is_platform_admin
      or coalesce(au.raw_app_meta_data @> '{"vibe_review_account": true}'::jsonb, false);

  -- 1a. THE DOOR -------------------------------------------------------------
  with people as (
    select u.created_at,
           u.school_verified,
           -- The app's own rule (src/lib/auth/post-login.ts): a non-empty
           -- object. Tested for emptiness only; the answers are never read.
           (jsonb_typeof(u.otto_answers) = 'object' and u.otto_answers <> '{}'::jsonb) as onboarded,
           au.email_confirmed_at as confirmed_at,
           -- A school sign-in address. Tested here, never returned.
           coalesce(split_part(lower(au.email), '@', 2) ~ '(^|\.)(iu|purdue)\.edu$', false) as school_address
      from public.users u
      left join auth.users au on au.id = u.id
     where u.id <> all (v_out)
  ),
  door_rows (kind, day) as (
    select 'signups', (p.created_at at time zone 'utc')::date
      from people p
     where p.confirmed_at is not null
    union all
    -- School-first sign-up (since Oct 8 2026): confirming the school address
    -- is the school check. Older accounts verified another way: not dated.
    select 'school_verified', (p.confirmed_at at time zone 'utc')::date
      from people p
     where p.school_verified
       and p.school_address
       and p.confirmed_at is not null
       and p.created_at >= timestamptz '2026-10-08 00:00:00+00'
    union all
    select 'waitlist_form', (es.created_at at time zone 'utc')::date
      from public.email_sends es
     where es.kind = 'waitlist_confirm'
       and es.ok
    union all
    -- The waitlist log: a founder is always the actor here, so no actor test.
    -- A resend (meta.single) is a code sent too.
    select case ma.action when 'waitlist_add' then 'waitlist_founder_add' else 'codes_sent' end,
           (ma.created_at at time zone 'utc')::date
      from public.moderation_actions ma
     where ma.action in ('waitlist_add', 'waitlist_invite')
       and coalesce(ma.meta ->> 'batch', '') not like 'test-%'
  ),
  door_days as (
    select d.day,
           count(r.kind) filter (where r.kind = 'signups')              as signups,
           count(r.kind) filter (where r.kind = 'school_verified')      as school_verified,
           count(r.kind) filter (where r.kind = 'waitlist_form')        as waitlist_form,
           count(r.kind) filter (where r.kind = 'waitlist_founder_add') as waitlist_founder_add,
           count(r.kind) filter (where r.kind = 'codes_sent')           as codes_sent
      from (select v_since + g as day from generate_series(0, v_days - 1) g) d
      left join door_rows r on r.day = d.day
     group by d.day
  )
  select jsonb_build_object(
           'accounts',           (select count(*) from people),
           'accounts_confirmed', (select count(*) from people p where p.confirmed_at is not null),
           'school_verified',    (select count(*) from people p where p.school_verified),
           'onboarded',          (select count(*) from people p where p.onboarded),
           'by_day', (select jsonb_agg(jsonb_build_object(
                               'day',                  to_char(t.day::timestamp, 'YYYY-MM-DD'),
                               'signups',              t.signups,
                               'school_verified',      t.school_verified,
                               'waitlist_form',        t.waitlist_form,
                               'waitlist_founder_add', t.waitlist_founder_add,
                               'codes_sent',           t.codes_sent) order by t.day)
                        from door_days t))
    into v_door;

  -- 1b. WAVES ----------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('batch', t.batch, 'signups', t.signups)
                            order by t.first_day, t.batch), '[]'::jsonb)
    into v_waves
    from (select coalesce(c.batch, 'no batch') as batch,
                 count(*) filter (where au.email_confirmed_at is not null) as signups,
                 min(c.joined_on) as first_day
            from public.user_cohorts c
            join public.users u on u.id = c.user_id
            left join auth.users au on au.id = u.id
           where u.id <> all (v_out)
             and coalesce(c.batch, '') not like 'test-%'
           group by coalesce(c.batch, 'no batch')) t;

  -- 1c. COMING BACK ----------------------------------------------------------
  -- acts: (who, when, UTC day) for every dated thing a person did. The views
  -- carry a day and no time. One list, read by the snapshot, by_day, by_week
  -- and the cohorts, so they agree.
  with acts (uid, at, day) as (
    select x.uid, x.at, coalesce(x.day, (x.at at time zone 'utc')::date)
      from (
        select p.user_id as uid, p.created_at as at, null::date as day
          from public.posts p where p.status = 'published' and p.created_at >= v_from
        union all select c.user_id, c.created_at, null from public.post_comments c where c.created_at >= v_from
        union all select l.user_id, l.created_at, null from public.post_likes l where l.created_at >= v_from
        union all select l.user_id, l.created_at, null from public.comment_likes l where l.created_at >= v_from
        union all select r.user_id, r.created_at, null from public.post_reposts r where r.created_at >= v_from
        union all select b.user_id, b.created_at, null from public.bookmarks b where b.created_at >= v_from
        union all select r.user_id, r.created_at, null from public.rsvps r where r.created_at >= v_from
        union all select r.user_id, r.created_at, null from public.message_reactions r where r.created_at >= v_from
        union all select v.user_id, v.created_at, null from public.chat_poll_votes v where v.created_at >= v_from
        union all select m.user_id, m.created_at, null from public.messages m where m.created_at >= v_from
        union all select f.follower_id, f.created_at, null from public.connections f where f.created_at >= v_from
        union all select f.user_id, f.created_at, null from public.org_followers f where f.created_at >= v_from
        union all select m.user_id, m.joined_at, null from public.org_members m where m.joined_at >= v_from
        union all select e.creator_id, e.created_at, null from public.events e where e.created_at >= v_from
        -- Set once, when Otto is opened with unread items; never overwritten.
        union all select n.user_id, n.read_at, null from public.notifications n where n.read_at >= v_from
        -- Views of someone else's post or profile. A day, no time.
        union all
        select pv.user_id, null, pv.viewed_on
          from public.post_views pv
          join public.posts p on p.id = pv.post_id
         where p.user_id <> pv.user_id
           and pv.viewed_on >= (v_from at time zone 'utc')::date
        union all
        select prv.viewer_user_id, null, prv.viewed_on
          from public.profile_views prv
         where prv.viewer_user_id <> prv.profile_user_id
           and prv.viewed_on >= (v_from at time zone 'utc')::date
      ) x
     where x.uid <> all (v_out)
  ),
  -- The last time each person was seen: anything they did, the Campus
  -- heartbeat, or a chat read made after they joined that chat (joining a
  -- club or an event room stamps last_read_at = now(), 20261001100000).
  -- A view has a day and no time, so it counts from the start of its UTC
  -- day: never later than the view, so it never lands in a window it was not
  -- in, and whoever did something today or this week is in 1 day or 7 days.
  seen as (
    select s.uid, max(s.at) as last_at
      from (
        select a.uid, coalesce(a.at, a.day::timestamp at time zone 'utc') as at from acts a
        union all
        select u.id, u.last_active_at from public.users u where u.last_active_at is not null
        union all
        select cm.user_id, cm.last_read_at
          from public.channel_members cm
         where cm.last_read_at > cm.created_at
      ) s
     where s.uid <> all (v_out)
     group by s.uid
  ),
  act_weeks as (
    select distinct a.uid, a.day - (extract(isodow from a.day)::int - 1) as week
      from acts a
  ),
  back_days as (
    select d.day, count(distinct a.uid) as active
      from (select v_since + g as day from generate_series(0, v_days - 1) g) d
      left join acts a on a.day = d.day
     group by d.day
  ),
  back_weeks as (
    -- Twelve Monday weeks ending with this one (still going).
    select w.week, count(aw.uid) as active
      from (select v_week - 7 * g as week from generate_series(0, 11) g) w
      left join act_weeks aw on aw.week = w.week
     group by w.week
  ),
  cohort_people as (
    select u.id,
           (u.created_at at time zone 'utc')::date
             - (extract(isodow from (u.created_at at time zone 'utc')::date)::int - 1) as week
      from public.users u
      join auth.users au on au.id = u.id
     where u.id <> all (v_out)
       and au.email_confirmed_at is not null
  ),
  cohorts as (
    -- Twelve Monday weeks ending with last week, so every cohort's next week
    -- has at least begun (the newest one is "so far").
    select w.week,
           count(cp.id) as signups,
           count(aw.uid) as returned
      from (select v_week - 7 * g as week from generate_series(1, 12) g) w
      left join cohort_people cp on cp.week = w.week
      left join act_weeks aw on aw.uid = cp.id and aw.week = w.week + 7
     group by w.week
  )
  select jsonb_build_object(
           'active_now', (select count(*) from seen s where s.last_at >= v_now - interval '5 minutes'),
           'active_1d',  (select count(*) from seen s where s.last_at >= v_now - interval '1 day'),
           'active_7d',  (select count(*) from seen s where s.last_at >= v_now - interval '7 days'),
           'active_30d', (select count(*) from seen s where s.last_at >= v_now - interval '30 days'),
           'by_day', (select jsonb_agg(jsonb_build_object(
                               'day', to_char(t.day::timestamp, 'YYYY-MM-DD'),
                               'active', t.active) order by t.day)
                        from back_days t),
           'by_week', (select jsonb_agg(jsonb_build_object(
                                'week', to_char(t.week::timestamp, 'YYYY-MM-DD'),
                                'active', t.active) order by t.week)
                         from back_weeks t),
           'cohorts', (select jsonb_agg(jsonb_build_object(
                                'week', to_char(t.week::timestamp, 'YYYY-MM-DD'),
                                'signups', t.signups,
                                'returned', t.returned) order by t.week)
                         from cohorts t))
    into v_back;

  -- 1d. WHAT GETS USED -------------------------------------------------------
  -- One row per thing that still exists, with its UTC day. The totals and the
  -- days read the same rows, so they agree. Removed content still counts.
  with used_rows (metric, day) as (
    select 'posts', (p.created_at at time zone 'utc')::date
      from public.posts p
     where p.status = 'published'
       and p.user_id <> all (v_out)
       and not exists (select 1 from public.orgs o where o.id = p.org_id and o.hidden_at is not null)
    union all select 'comments', (c.created_at at time zone 'utc')::date
      from public.post_comments c where c.user_id <> all (v_out)
    union all select 'likes', (l.created_at at time zone 'utc')::date
      from public.post_likes l where l.user_id <> all (v_out)
    union all select 'reposts', (r.created_at at time zone 'utc')::date
      from public.post_reposts r where r.user_id <> all (v_out)
    union all select 'saves', (b.created_at at time zone 'utc')::date
      from public.bookmarks b where b.user_id <> all (v_out)
    union all select 'events', (e.created_at at time zone 'utc')::date
      from public.events e
      join public.orgs o on o.id = e.org_id and o.hidden_at is null
     where e.creator_id <> all (v_out)
    union all select 'rsvps', (r.created_at at time zone 'utc')::date
      from public.rsvps r
      join public.events e on e.id = r.event_id
      join public.orgs o on o.id = e.org_id and o.hidden_at is null
     where r.user_id <> all (v_out)
    union all select 'people_follows', (f.created_at at time zone 'utc')::date
      from public.connections f where f.follower_id <> all (v_out)
    -- A join also makes a follow (source 'join'): that one is a membership.
    union all select 'club_follows', (f.created_at at time zone 'utc')::date
      from public.org_followers f
      join public.orgs o on o.id = f.org_id and o.hidden_at is null
     where f.source <> 'join' and f.user_id <> all (v_out)
    union all select 'club_members', (m.joined_at at time zone 'utc')::date
      from public.org_members m
      join public.orgs o on o.id = m.org_id and o.hidden_at is null
     where m.user_id <> all (v_out)
    union all select 'club_relationships', (ff.first_followed_at at time zone 'utc')::date
      from public.org_follow_firsts ff
      join public.orgs o on o.id = ff.org_id and o.hidden_at is null
     where ff.user_id <> all (v_out)
    -- Club chat: every room of a visible club (lounge, board, officers,
    -- events, extra rooms). Private chat: a DM or a group, counted apart.
    union all select 'club_chat_messages', (m.created_at at time zone 'utc')::date
      from public.messages m
      join public.channels c on c.id = m.channel_id
      join public.orgs o on o.id = c.org_id and o.hidden_at is null
     where m.user_id <> all (v_out)
    union all select c.type, (m.created_at at time zone 'utc')::date
      from public.messages m
      join public.channels c on c.id = m.channel_id
     where c.type in ('dm', 'group')
       and m.user_id <> all (v_out)
  ),
  used_days as (
    select d.day,
           count(r.metric) filter (where r.metric = 'posts')              as posts,
           count(r.metric) filter (where r.metric = 'comments')           as comments,
           count(r.metric) filter (where r.metric = 'likes')              as likes,
           count(r.metric) filter (where r.metric = 'reposts')            as reposts,
           count(r.metric) filter (where r.metric = 'saves')              as saves,
           count(r.metric) filter (where r.metric = 'events')             as events,
           count(r.metric) filter (where r.metric = 'rsvps')              as rsvps,
           count(r.metric) filter (where r.metric = 'people_follows')     as people_follows,
           count(r.metric) filter (where r.metric = 'club_relationships') as club_relationships,
           count(r.metric) filter (where r.metric = 'club_chat_messages') as club_chat_messages,
           count(r.metric) filter (where r.metric in ('dm', 'group'))     as direct_messages
      from (select v_since + g as day from generate_series(0, v_days - 1) g) d
      left join used_rows r on r.day = d.day
     group by d.day
  )
  select jsonb_build_object(
           'totals', (select jsonb_build_object(
                               'posts',              count(*) filter (where r.metric = 'posts'),
                               'comments',           count(*) filter (where r.metric = 'comments'),
                               'likes',              count(*) filter (where r.metric = 'likes'),
                               'reposts',            count(*) filter (where r.metric = 'reposts'),
                               'saves',              count(*) filter (where r.metric = 'saves'),
                               'events',             count(*) filter (where r.metric = 'events'),
                               'rsvps',              count(*) filter (where r.metric = 'rsvps'),
                               'people_follows',     count(*) filter (where r.metric = 'people_follows'),
                               'club_follows',       count(*) filter (where r.metric = 'club_follows'),
                               'club_members',       count(*) filter (where r.metric = 'club_members'),
                               'club_chat_messages', count(*) filter (where r.metric = 'club_chat_messages'),
                               'direct_messages',    count(*) filter (where r.metric in ('dm', 'group')),
                               'group_messages',     count(*) filter (where r.metric = 'group'))
                        from used_rows r),
           'by_day', (select jsonb_agg(jsonb_build_object(
                               'day',                to_char(t.day::timestamp, 'YYYY-MM-DD'),
                               'posts',              t.posts,
                               'comments',           t.comments,
                               'likes',              t.likes,
                               'reposts',            t.reposts,
                               'saves',              t.saves,
                               'events',             t.events,
                               'rsvps',              t.rsvps,
                               'people_follows',     t.people_follows,
                               'club_relationships', t.club_relationships,
                               'club_chat_messages', t.club_chat_messages,
                               'direct_messages',    t.direct_messages) order by t.day)
                        from used_days t))
    into v_used;

  -- 1e. CLUBS ----------------------------------------------------------------
  -- Visible clubs only, as of now. The windows here are rolling and do not
  -- follow p_days. "This month" is the UTC month, by when the event starts.
  with visible as (
    select o.id, o.name from public.orgs o where o.hidden_at is null
  ),
  officers as (
    select m.org_id, m.user_id
      from public.org_members m
      join visible o on o.id = m.org_id
     where m.role in ('owner', 'admin', 'mod')
       and m.user_id <> all (v_out)
  ),
  club_messages as (
    select c.org_id, m.created_at
      from public.messages m
      join public.channels c on c.id = m.channel_id
      join visible o on o.id = c.org_id
     where m.user_id <> all (v_out)
       and m.created_at >= v_now - interval '30 days'
  ),
  month_events as (
    select e.org_id
      from public.events e
      join visible o on o.id = e.org_id
     where e.creator_id <> all (v_out)
       and (e.starts_at at time zone 'utc')::date >= v_month
       and (e.starts_at at time zone 'utc')::date <  v_next_month
  ),
  -- A current officer posted for the club, wrote in its chat, or made one
  -- of its events, in the last 7 days.
  officer_acts as (
    select p.org_id
      from public.posts p
      join officers f on f.org_id = p.org_id and f.user_id = p.user_id
     where p.status = 'published'
       and p.created_at >= v_now - interval '7 days'
    union all
    select c.org_id
      from public.messages m
      join public.channels c on c.id = m.channel_id
      join officers f on f.org_id = c.org_id and f.user_id = m.user_id
     where m.created_at >= v_now - interval '7 days'
    union all
    select e.org_id
      from public.events e
      join officers f on f.org_id = e.org_id and f.user_id = e.creator_id
     where e.created_at >= v_now - interval '7 days'
  ),
  per_club as (
    select o.name,
           (select count(*) from public.org_members m
             where m.org_id = o.id and m.user_id <> all (v_out))                as members,
           (select count(*) from club_messages x
             where x.org_id = o.id and x.created_at >= v_now - interval '7 days') as chat_7d,
           (select count(*) from club_messages x where x.org_id = o.id)          as chat_30d,
           (select count(*) from month_events x where x.org_id = o.id)           as events_this_month
      from visible o
  )
  select jsonb_build_object(
           'visible',                  (select count(*) from visible),
           'officer_did_something_7d', (select count(distinct x.org_id) from officer_acts x),
           'event_this_month',         (select count(distinct x.org_id) from month_events x),
           'chat_7d',                  (select count(*) from per_club t where t.chat_7d > 0),
           'per_club', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'name',              t.name,
                                 'members',           t.members,
                                 'chat_7d',           t.chat_7d,
                                 'chat_30d',          t.chat_30d,
                                 'events_this_month', t.events_this_month)
                                 order by t.members desc, t.name), '[]'::jsonb)
                          from per_club t))
    into v_clubs;

  -- 1f. WHERE ----------------------------------------------------------------
  -- The same accounts as door.accounts, so each list adds up to it. Only
  -- campuses that have accounts are listed.
  with people as (
    select u.school_system, u.campus_id from public.users u where u.id <> all (v_out)
  )
  select jsonb_build_object(
           'by_school', (select coalesce(jsonb_agg(jsonb_build_object('school', t.school, 'accounts', t.accounts)
                                         order by t.school = 'unknown', t.accounts desc, t.school), '[]'::jsonb)
                           from (select coalesce(p.school_system, 'unknown') as school, count(*) as accounts
                                   from people p group by 1) t),
           'by_campus', (select coalesce(jsonb_agg(jsonb_build_object('campus', t.campus, 'accounts', t.accounts)
                                         order by t.campus = 'not picked', t.accounts desc, t.campus), '[]'::jsonb)
                           from (select coalesce(ca.name, 'not picked') as campus, count(*) as accounts
                                   from people p
                                   left join public.campuses ca on ca.id = p.campus_id
                                  group by 1) t))
    into v_where;

  return jsonb_build_object(
    'today', to_char(v_today::timestamp, 'YYYY-MM-DD'),
    'since', to_char(v_since::timestamp, 'YYYY-MM-DD'),
    'days',  v_days,
    'door',  v_door,
    'waves', v_waves,
    'back',  v_back,
    'used',  v_used,
    'clubs', v_clubs,
    'where', v_where);
end;
$fn$;

comment on function public.admin_usage_summary(integer) is
  'How Vibe is used, as totals only (no ids, names of people, addresses or text): the door, waves, coming back, what gets used, clubs, where. '
  'Founders, store-review accounts, hidden test clubs and test waves left out. UTC days, Monday weeks, p_days held to 7..90. '
  'Service role only: anon and authenticated are refused inside (42501). For GET /api/admin/usage (20261014120000).';

-- EXECUTE for every API role, on purpose (standing rule since 2026-09-22,
-- 20260922090000_guard_function_privileges.sql): on Supabase's Postgres image
-- a role calling a public function it can't EXECUTE crashes the backend and
-- drops every connection, so the refusal lives INSIDE the function. Never
-- take EXECUTE away from anon or authenticated here.
revoke all on function public.admin_usage_summary(integer) from public;
grant execute on function public.admin_usage_summary(integer) to anon, authenticated, service_role;

-- 2. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad text := '';
  f regprocedure := to_regprocedure('public.admin_usage_summary(integer)');
begin
  if f is null then
    raise exception 'usage-summary post-check failed: the function is missing';
  end if;
  if not (has_function_privilege('anon', f, 'execute')
          and has_function_privilege('authenticated', f, 'execute')
          and has_function_privilege('service_role', f, 'execute')) then
    bad := bad || ' the summary is refused to an API role (the standing rule);';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the summary;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' the summary is not SECURITY DEFINER;';
  end if;
  if (select p.proconfig from pg_proc p where p.oid = f) is distinct from array['search_path=""'] then
    bad := bad || ' the summary does not pin search_path to empty;';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = f) <> 's' then
    bad := bad || ' the summary is not STABLE;';
  end if;
  if bad <> '' then
    raise exception 'usage-summary post-check failed:%', bad;
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
