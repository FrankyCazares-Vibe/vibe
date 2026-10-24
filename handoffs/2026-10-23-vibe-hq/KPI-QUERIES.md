# Vibe KPIs: launch (Oct 31) to the 30-day check

Rules for every number: counts only. Founders and store-review accounts are left out as the Usage tab does it (`supabase/migrations/20261014120000_admin_usage_summary.sql:204-209`, "the summary" below). Test clubs are left out by `orgs.hidden_at is null` (summary `:416`, `:427`, `:514-515`). Anything from 1 to 4 is written down as "<5": the tab floors on the server (`src/lib/usage/view.ts:394-395`), but hand-run SQL does not, so floor it yourself. The "Vibe Test Club" counts until it is hidden, and so does any non-founder test account.

## 1. North Star: weekly students who did a club action

**One number:** how many students did at least one club action in a Monday week (UTC, the same weeks the tab uses).

**A club action** is any of these, in a visible club:
- RSVP'd Going or Maybe (`rsvps.status`, `20260430190000_phase1_initial_schema.sql:134-141`)
- checked in at an event that started that week
- followed or joined a club for the first time (`org_follow_firsts`, `20260916120000_org_followers.sql:641-646`), or joined one (`org_members.joined_at`, `20260430190000_phase1_initial_schema.sql:84-91`)
- sent a message in any of the club's rooms, Board included (`messages` joined to `channels.org_id`)
- published a post for the club (`posts.org_id`)

**Why this number:** Parker says belonging is the problem and that events and club updates beat the feed. Each action is a student connecting with a club. Likes, people-follows and scrolling don't move it, on purpose.

Check-ins have no timestamp, by design (`20261019120000_event_checkins.sql:190-201`). A check-in is dated by its event's start. That is safe because check-in only works from 1 hour before the start to 1 hour after the end (`:302`), or 24 hours after for "Mark as here" (`:453`).

## 2. KPI table

"SQL" names a column of Query A (weekly), B (30-day cohort) or C (clubs live), below. Targets are suggestions for Franky to set. "Nov 30" is a normal November week (read the week of Nov 16; Thanksgiving week, Thu Nov 26, will dip), or the running total where it says "total".

| KPI | Why it matters | Exact definition | Source (file:line) | On Usage? | SQL | Launch week (Oct 26) | Nov 30 |
|---|---|---|---|---|---|---|---|
| **North Star** | Parker: belonging | Distinct students with ≥1 club action in the week (section 1) | tables above | no | A `north_star` | 90 | 175 (≥70% of weekly active) |
| Sign-ups started | Eli: switching cost starts at the door | Accounts made in the week, confirmed or not (`signUp` makes the account before the code, `src/app/auth/signup/signup-form.tsx:338`) | `public.users.created_at` (`phase1:31`) | partly: an all-time total only (`src/app/admin/usage-client.tsx:373`) | A `started` | 150 | 400 total |
| Confirmed | Code reached the inbox | Email confirmed in the week (`auth.users.email_confirmed_at`) | summary `:226-228` | yes: total plus per day (`usage-client.tsx:374`, `:379`) | A `confirmed` | ≥85% of started | ≥85% |
| Onboarding finished | First minutes must pay off (Eli) | Of the week's confirmed, `otto_answers` is not empty (the app's rule, summary `:217`) | `phase1:29` | partly: all-time total (`usage-client.tsx:376`) | A `onboarded` | ≥85% of confirmed | ≥85% |
| Activation | One persona path: you came for a club (Parker) | Of the week's confirmed, followed or joined ≥1 visible club within 24 h of confirming | `org_follow_firsts.first_followed_at` | no | A `activated` | ≥70% | ≥60% |
| Came in through a club's link | Clubs before students | Of the week's confirmed, those let in by a members' link | `club_link_uses`, `club_links` (`20261021110000_club_links.sql:89-123`, `:137-152`) | no | A `via_club_link` | ≥60% | ≥40% |
| Clubs live | Parker: 20 clubs first | Visible club, setup list complete, ≥1 event, ≥10 members who are not founders | setup rule `src/lib/club-links/setup-steps.ts:57-68`, `src/lib/club-links/setup.ts:28-31` | no (the tab has visible clubs, officer activity, events this month and per-club members: `usage-client.tsx:856-859`) | C `clubs_live` | 3 (setup done: 5) | 10 (setup done: 20) |
| Events per week | Events are the core (Parker) | Events in visible clubs, made by non-founders, starting that week | `events.starts_at` (`phase1:126`) | partly: events made per day (summary `:425-428`) | A `events` | 8 | 20 |
| RSVPs | Intent to show up | Going or Maybe answers on that week's events | `rsvps` | partly: any answer, including "No", by the day it was given (summary `:429-433`, `usage-client.tsx:761`) | A `rsvps` | 80 | 200 |
| Check-ins | Real attendance | Check-ins at that week's events | `event_checkins` | no | A `checkins` | 40 | 100 |
| RSVP to check-in | Do RSVPs mean anything | `rsvp_and_checkin` ÷ `rsvps` | as above | no | A | ≥40% | ≥50% |
| Board posts | Club updates beat the feed (Parker) | Top-level messages in a visible club's Board (`channels.kind='board'`, `thread_root_id is null`) | `20261001100000_chat_v2_rooms.sql:709-714`, `:826-828` | no (lumped into "Club chat", summary `:451-455`) | A `board_posts` | 10 | 25 (≥2 per live club) |
| Join requests waiting | Being ignored is the opposite of belonging | Pending requests in visible clubs older than 48 h, as of now | `org_join_requests` (`20260507100000_org_channels_schema.sql:55-65`) | no | A `requests_waiting_48h` | 0 | 0 |
| Weekly active | The base the North Star sits in | People who had Vibe open that week, scrolling included | `usage_day_tally` active_week (`20261014150000_usage_day_tally.sql:320-332`) | yes ("Counted from launch on", `usage-client.tsx:578-592`) | A `weekly_active` | 120 | 250 |
| 30-day retention | Eli: the first real KPI | Cohort: confirmed Thu Oct 29 to Wed Nov 4 (Indianapolis time). Retained: active on days 28 to 35 after their own confirmation | B; tally sign-up weeks w0 to w4 (`20261016120000_views_as_service.sql:563-570`) | partly: the tab shows sign-up weeks w0 to w4 (`usage-client.tsx:697-720`) | B | cohort ≥30 (Eli) | ≥30% (first look Nov 30, full read Dec 10) |
| Messages sent | Clubs are talking | Messages in visible clubs' rooms plus DMs and group chats | summary `:451-460` | yes (`usage-client.tsx:765-767`) | A `messages` | 300 | 800 |
| Interviews (Mom Test) | Parker 10+; Eli: ask what they last did | Interviews done, with how many were non-involved students | kept by hand | no | none | 10 | 25 total, ≥10 non-involved |
| Clubs in pipeline | 20 clubs first | Count per stage: contacted, met, setup link sent, setup done, live | the planned pipeline tracker (S80 handoff `:94-95`) | no | none | 20 / 8 / 5 / 5 / 3 | 40 / 20 / 20 / 20 / 10 |
| User tests | Parker: 2 club owners + 2 students | 30-minute sessions where they tried their goal without help | kept by hand | no | none | 4 | 8 total |

### The queries

These are read-only. Each returns one row of numbers. Run them as `postgres` (the Supabase connector's `execute_sql`), because they read `auth.users` the way the summary does. The `out_ids` part is the same in all three queries.

```sql
-- A. Weekly snapshot. wk = the Monday (UTC) of the week just ended.
with p as (select date '2026-10-26' as wk),
r as (select wk::timestamp at time zone 'utc' as t0, (wk + 7)::timestamp at time zone 'utc' as t1 from p),
out_ids as (select u.id from public.users u left join auth.users au on au.id = u.id
             where u.is_platform_admin
                or coalesce(au.raw_app_meta_data @> '{"vibe_review_account": true}'::jsonb, false)),
vis as (select id from public.orgs where hidden_at is null),
ev as (select e.id from public.events e, r
        where e.org_id in (select id from vis) and e.creator_id not in (select id from out_ids)
          and e.starts_at >= r.t0 and e.starts_at < r.t1),
ppl as (select u.id, u.created_at, au.email_confirmed_at as conf,
               (jsonb_typeof(u.otto_answers) = 'object' and u.otto_answers <> '{}'::jsonb) as onboarded
          from public.users u left join auth.users au on au.id = u.id
         where u.id not in (select id from out_ids)),
club_acts as (
  select x.user_id as uid from public.rsvps x join public.events e on e.id = x.event_id, r
   where e.org_id in (select id from vis) and x.status in ('going','maybe') and x.created_at >= r.t0 and x.created_at < r.t1
  union all select c.user_id from public.event_checkins c join ev on ev.id = c.event_id
  union all select f.user_id from public.org_follow_firsts f, r
   where f.org_id in (select id from vis) and f.first_followed_at >= r.t0 and f.first_followed_at < r.t1
  union all select m.user_id from public.org_members m, r
   where m.org_id in (select id from vis) and m.joined_at >= r.t0 and m.joined_at < r.t1
  union all select m.user_id from public.messages m join public.channels ch on ch.id = m.channel_id, r
   where ch.org_id in (select id from vis) and m.created_at >= r.t0 and m.created_at < r.t1
  union all select po.user_id from public.posts po, r
   where po.org_id in (select id from vis) and po.status = 'published' and po.created_at >= r.t0 and po.created_at < r.t1)
select
  (select count(distinct uid) from club_acts where uid not in (select id from out_ids)) as north_star,
  (select count(*) from ppl, r where created_at >= t0 and created_at < t1)               as started,
  (select count(*) from ppl, r where conf >= t0 and conf < t1)                           as confirmed,
  (select count(*) from ppl, r where conf >= t0 and conf < t1 and onboarded)             as onboarded,
  (select count(*) from ppl, r where conf >= t0 and conf < t1 and exists (
     select 1 from public.org_follow_firsts f where f.user_id = ppl.id and f.org_id in (select id from vis)
        and f.first_followed_at < ppl.conf + interval '24 hours'))                       as activated,
  (select count(*) from ppl, r where conf >= t0 and conf < t1 and exists (
     select 1 from public.club_link_uses cu join public.club_links l on l.id = cu.link_id
      where cu.user_id = ppl.id and l.kind = 'members'))                                 as via_club_link,
  (select count(*) from ev)                                                              as events,
  (select count(*) from public.rsvps x join ev on ev.id = x.event_id
    where x.status in ('going','maybe') and x.user_id not in (select id from out_ids))  as rsvps,
  (select count(*) from public.event_checkins c join ev on ev.id = c.event_id
    where c.user_id not in (select id from out_ids))                                     as checkins,
  (select count(*) from public.event_checkins c join ev on ev.id = c.event_id
     join public.rsvps x on x.event_id = c.event_id and x.user_id = c.user_id and x.status in ('going','maybe')
    where c.user_id not in (select id from out_ids))                                     as rsvp_and_checkin,
  (select count(*) from public.messages m join public.channels ch on ch.id = m.channel_id, r
    where ch.kind = 'board' and m.thread_root_id is null and ch.org_id in (select id from vis)
      and m.user_id not in (select id from out_ids) and m.created_at >= t0 and m.created_at < t1) as board_posts,
  (select count(*) from public.messages m join public.channels ch on ch.id = m.channel_id, r
    where (ch.org_id in (select id from vis) or ch.type in ('dm','group'))
      and m.user_id not in (select id from out_ids) and m.created_at >= t0 and m.created_at < t1) as messages,
  (select count(*) from public.org_join_requests j where j.status = 'pending'
      and j.org_id in (select id from vis) and j.requested_at < now() - interval '48 hours') as requests_waiting_48h,
  (select t.count from public.usage_day_tally t, p
    where t.day = p.wk and t.metric = 'active_week' and t.key = 'all')                   as weekly_active;

-- B. The Eli check. Run Thu Dec 10 (the day after the last member's day 35).
with out_ids as (/* same as A */ select u.id from public.users u left join auth.users au on au.id = u.id
             where u.is_platform_admin or coalesce(au.raw_app_meta_data @> '{"vibe_review_account": true}'::jsonb, false)),
cohort as (select u.id, au.email_confirmed_at as conf, u.last_active_at
             from public.users u join auth.users au on au.id = u.id
            where u.id not in (select id from out_ids)
              and au.email_confirmed_at >= timestamptz '2026-10-29 00:00 America/Indiana/Indianapolis'
              and au.email_confirmed_at <  timestamptz '2026-11-05 00:00 America/Indiana/Indianapolis'),
acts (uid, at) as (  -- trimmed from the tab's list, summary :296-328
  select user_id, created_at from public.messages
  union all select user_id, created_at from public.rsvps
  union all select user_id, created_at from public.posts
  union all select user_id, created_at from public.post_comments
  union all select user_id, created_at from public.post_likes
  union all select user_id, first_followed_at from public.org_follow_firsts
  union all select user_id, joined_at from public.org_members
  union all select user_id, read_at from public.notifications where read_at is not null
  union all select user_id, viewed_on::timestamp at time zone 'utc' from public.post_views
  union all select viewer_user_id, viewed_on::timestamp at time zone 'utc' from public.profile_views)
select count(*) as cohort_size,
       count(*) filter (where exists (select 1 from acts a where a.uid = c.id
           and a.at >= c.conf + interval '28 days' and a.at < c.conf + interval '36 days')) as retained_low,
       count(*) filter (where c.last_active_at >= c.conf + interval '28 days')              as retained_high
  from cohort c;

-- C. Clubs live, as of now.
with out_ids as (/* same as A */ select u.id from public.users u left join auth.users au on au.id = u.id
             where u.is_platform_admin or coalesce(au.raw_app_meta_data @> '{"vibe_review_account": true}'::jsonb, false)),
c as (select o.id,
        (select count(*) from public.org_members m where m.org_id = o.id and m.user_id not in (select id from out_ids)) as members,
        (select count(*) from public.events e where e.org_id = o.id) as events,
        o.logo_url is not null and o.banner_url is not null and btrim(o.description) <> ''
        and exists (select 1 from public.club_links k where k.org_id = o.id and k.kind = 'members')
        and exists (select 1 from public.club_links s where s.org_id = o.id and s.kind = 'setup'
                      and s.setup_marks ? 'who_can_join'
                      and (s.setup_marks ? 'officers_skipped'
                           or exists (select 1 from public.org_members a where a.org_id = o.id and a.role = 'admin'))) as setup_ok
      from public.orgs o where o.hidden_at is null)
select count(*) filter (where setup_ok and events > 0)                    as setup_done,
       count(*) filter (where setup_ok and events > 0 and members >= 10) as clubs_live
  from c;
```

Three caveats on these queries:
- **Retention comes as a low and a high number.** `retained_low` misses students who only scroll. `retained_high` also counts someone who came back on day 40. The real number sits between them. The tab's w4 column, which counts scrollers, is a third check: for the Oct 26 sign-up week it is the week of Nov 23, readable Nov 30. Thanksgiving pulls all three down.
- **An RSVP is dated by its first answer.** The route keeps that date when the answer changes (`src/app/api/events/[id]/rsvp/route.ts:195-197`).
- **Only setup-link clubs can be "live".** A club that set itself up has no setup list until week 3 (`setup-steps.ts:8-10`), so count those by hand.

## 3. What Admin > Usage already shows

**Already shown** (`src/app/admin/usage-client.tsx`):
- **Door:** all-time accounts, confirmed, school email and finished sign-up; confirmed sign-ups and codes per day (`:373-379`).
- **Coming back:** active now, in 1, 7 and 30 days (`:461-464`); people who did something per day and week; next-week return per sign-up week (summary `:368-386`).
- **Counted from launch on:** people with Vibe open per day and week, and sign-up weeks w0 to w4 (`:578-592`, `:697-720`).
- **What gets used:** posts, events made, RSVPs (any answer), club follows and joins, club chat, private messages (`:754-782`).
- **Clubs:** visible clubs, officer active in 7 days, event this month, per-club members (`:856-859`).

**Not shown:** the North Star, started per week, onboarding and activation per cohort, club-link sign-ups, clubs live, events by start week, Going/Maybe RSVPs, check-ins, RSVP to check-in, Board posts, waiting requests, days 28 to 35 retention. All of these can be read today with the SQL above, with no schema change. Adding them to the tab needs a new counts-only function, which is a migration. That means Franky's yes and a Privacy Policy line the same deploy, so it is week-1 work.

## 4. What can't be measured today without a database change

Each of these needs Franky's yes for the migration and a Privacy Policy update the same day. None goes in before the Oct 28 freeze.

1. **Exact days 28 to 35 retention, scrollers included.** Today there are only Query B's bounds. The fix is a new tally metric in `usage_touch` (`20261016120000_views_as_service.sql:431-592`), keyed by confirmation week, that adds 1 on a person's first check-in in days 28 to 35. That moment can be spotted because `last_active_at` only moves forward, so nothing new is stored about anyone. It also widens the table's CHECK (`20261014150000_usage_day_tally.sql:327-332`). **It must be live before Nov 26**, when the first cohort member reaches day 28, so build it in week 1.
2. **Opens of members' links and `/c/welcome`.** Only the front, waitlist and sign-up pages are tallied (`20261012180000_page_open_tally.sql:114`, `src/lib/tally/open.ts:14`). Adding a `club` page shows how many people opened a link but didn't sign up.
3. **When onboarding finished.** `otto_answers` has no date (`phase1:29`), so "finished on day one" can't be read, only "finished by now". The fix is an `onboarded_day` tally count.
4. **Who reads the Board.** Nothing records a follower reading it. The fix is a per-day read tally, if Franky wants Board reach.

Check-in times stay unrecorded on purpose; the event's start is close enough.

## 5. Monday snapshot routine

Every Monday morning from Nov 2, log one row in the planned pipeline tracker (S80 handoff `:94-95`).

1. Run Query A with `wk` set to last Monday: Oct 26 on Nov 2, then Nov 2, 9, 16 and 23. Write down all 14 numbers. Floor 1 to 4 to "<5".
2. Run Query C: setup done, clubs live.
3. From Admin > Usage, copy: weekly active (tally), and each sign-up week's w1 to w4 row next to its sign-up count.
4. Add the by-hand numbers: interviews this week (and how many were non-involved students), clubs per pipeline stage, and user tests.
5. Write one line on what moved and why.

Special dates:
- **Nov 30:** the first retention look, from the tally's w4 for the Oct 26 sign-up week. Note that it falls in Thanksgiving week.
- **Thu Dec 10:** Query B, the full Eli read: cohort size, retained low and high, and the tally w4 for the Nov 2 week.
