-- T1 FILE 1 OF 2 -- count and visibility functions (week-1 wave plan,
-- handoffs/wave-plan-week1/T1.md, as amended by handoffs/wave-plan-week1/
-- rulings.md M4, M10, H1, H2). ADDITIVE ONLY: no policy, no table grant and no
-- row changes here. File 2 (20260922110000_t1_close_world_readable_selects.sql)
-- is the one that narrows the six tables, and it ships after the T1 code.
--
-- WHY. Any signed-in student can today read every like, comment like, repost,
-- follow edge, event and RSVP straight from the REST endpoint, with who did it
-- and when. The screens only need counts and a few lists. This file adds the
-- functions that return those counts as numbers only, plus two helpers file 2's
-- policies call. Counts are public, identities are private.
--
-- WHAT IT DOES. Seven functions, each SECURITY DEFINER, STABLE,
-- SET search_path = public, EXECUTE to anon, authenticated and service_role
-- (PUBLIC revoked; anon granted on purpose because a revoke crashes the backend
-- on this image, see 20260922090000; every function is anon-safe):
--   event_visible(p_org_id, p_creator_id, p_event_id)  policy helper (file 2)
--   can_manage_event(p_event_id)                       policy helper (file 2)
--   post_engagement_counts(p_post_ids, p_since)        likes + reposts per post
--   comment_like_counts(p_comment_ids)                 likes per comment
--   event_rsvp_counts(p_event_ids)                     going + maybe per event
--   mutual_follow_counts(p_user_ids)                   "N you both follow"
--   second_degree_follows(p_among)                     friends of friends
--
-- RULES EVERY FUNCTION FOLLOWS
--   * The viewer is auth.uid(). No function takes a user-id argument, so none
--     can answer a question about someone else's view.
--   * Under the service role auth.uid() is NULL. The count RPCs then count
--     published posts / non-hidden clubs' events only (and a windowed
--     post_engagement_counts call returns NO ROWS), and
--     mutual_follow_counts / second_degree_follows return NO ROWS. So the
--     callers use the viewer's cookie client for these, never the service
--     client (rulings M3: hydrateUserCards must never be handed service).
--   * Numbers only. No count RPC returns who did anything.
--   * Each count RPC re-applies the visibility of what it counts: posts and
--     comments use posts_select_authenticated's rule (published, or your own);
--     events use event_visible. So an RPC answers only about things the caller
--     can already see.
--   * More than 1000 ids raises SQLSTATE 22023 'too many ids (max 1000)'.
--     Callers chunk at 1000 (src/lib/posts/engagement-counts.ts,
--     ENGAGEMENT_RPC_MAX_IDS). PostgREST's max_rows = 1000 would otherwise cut
--     a longer answer short without an error.
--   * p_since (post_engagement_counts) answers only for the caller's OWN
--     posts. Unlimited, anyone could shrink p_since call by call and pin down
--     when each like and repost on someone else's post happened. The only
--     windowed caller is creator-stats, which passes the caller's own posts.
--   * BLOCKS (rulings M4, critic M4). mutual_follow_counts and
--     second_degree_follows skip block pairs with the caller, in either
--     direction, on BOTH sides of the question:
--       - the candidate. Without it, a caller who follows only Y could call
--         rpc/mutual_follow_counts {"p_user_ids":[X]} and learn whether X
--         follows Y even after X blocked them (1 = yes).
--       - the person counted through (the caller's follow Y in
--         mutual_follow_counts, the caller's mutual in second_degree_follows).
--         Blocking through the route deletes the follow edges between the
--         pair (src/app/api/me/block/route.ts:163-199), but the caller can put
--         their own edge back straight over REST (connections_insert_follower
--         checks only auth.uid() = follower_id; the block check lives in
--         src/app/api/me/follow/route.ts), and blocks_insert_own lets a block
--         be written over REST with no teardown at all. Without this side, F
--         (blocked by A) re-follows A, calls mutual_follow_counts with every
--         user id, and reads back A's follower list: exactly what T1c empties
--         on the follower route for a blocked pair.
--
-- ACCEPTED LEAK (T1 Risk 3). event_visible takes arbitrary ids, so a signed-in
-- caller can ask it whether a given club uuid is hidden. Club uuids are not
-- guessable and /api/events?org_id= already answers the same question.
-- can_manage_event and every count RPC answer only about the caller or return
-- numbers.
-- KNOWN GAP, FOLLOW-UP NEEDED (reviewer finding, 2026-09-22). event_visible's
-- RSVP clause lets a signed-in student who holds a hidden club's event uuid
-- see that event (and its counts, through file 2's events_select_visible) by
-- writing their own RSVP row straight over REST: rsvps_insert_own checks only
-- auth.uid() = user_id, and the hidden-club refusal lives only in the route
-- (src/app/api/events/[id]/rsvp/route.ts, blockedByHiddenOrg). A status 'no'
-- row even stays out of the going/maybe counts. Not a regression (today every
-- event is readable), and T1 freezes the INSERT policies, so it is not fixed
-- here. Follow-up: give rsvps_insert_own a hidden-club check mirroring
-- blockedByHiddenOrg, through a DEFINER helper that is true when the event's
-- club is null, not hidden, or has the caller as a member. Don't gate on
-- rsvps.created_at <= orgs.hidden_at: the client sets created_at on insert.
--
-- LIVE STATE BEFORE THIS FILE (read-only MCP, production, 2026-09-21; T1.md's
-- table re-confirmed the same day)
--   * supabase_migrations.schema_migrations: 65 rows, latest 20260916130000.
--   * None of the seven function names exists in public (pg_proc, 0 rows).
--   * The six SELECT policies, all TO authenticated, PERMISSIVE, qual `true`:
--       post_likes_select_authenticated     comment_likes_select_authenticated
--       post_reposts_select_authenticated   connections_select_authenticated
--       events_select_authenticated         rsvps_select_authenticated
--   * relacl on all six tables: {postgres=arwdDxtm/postgres,
--     anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
--     service_role=arwdDxtm/postgres} (Postgres 17, hence the m = MAINTAIN).
--   * Row counts (drift on their own): post_likes 9, comment_likes 0,
--     post_reposts 5, connections 27, events 10 (all with org_id: 7 on the
--     private invite-only club, 3 on a hidden test club), rsvps 6, blocks 0.
--   * blocks_select_either = ((auth.uid() = blocker_id) OR
--     (auth.uid() = blocked_id)). The functions below read blocks as their
--     owner, so that policy does not limit them.
--   * No view and no function body reads the six tables. Only SECURITY
--     DEFINER triggers touch them (trg_notify_on_like, trg_notify_on_connection).
--   * orgs_select is ((is_public OR is_org_member(id, auth.uid())) AND
--     ((hidden_at IS NULL) OR is_org_member(id, auth.uid()))), and the only
--     real club is is_public = false. A policy that joined orgs under the
--     viewer's RLS would hide that club's rush events from every non-member,
--     which is why event_visible is a DEFINER helper and not a join.
--   * org_members.role is owner/admin/mod/member. "Manages" means owner or
--     admin, the same rule as src/app/api/events/[id]/attendees/route.ts:53-65.
--
-- RE-RUNNABLE. Every statement is CREATE OR REPLACE or a grant, so a second
-- run changes nothing. The whole file is one BEGIN/COMMIT (rulings M10: a bare
-- SET LOCAL outside a transaction block does nothing).
--
-- DEPLOY ORDER (T1.md Migration, rulings H2). Planned production order for the
-- week-1 migrations, each after its code deploy shows Ready on Vercel:
--   T1 file 1 (this, 20260922100000) -> E1 -> P1 -> T1 file 2 (20260922110000)
--   -> T2 (20260922120000, 20260922120500).
-- This file is safe with today's code (nothing calls these functions yet), so
-- it goes first. T1b-T1d call its RPCs and must not deploy before it is live.
-- If the real order differs, the orchestrator renumbers before applying so a
-- local `supabase db reset` replays the order production saw.
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only (MCP execute_sql). STOP on anything you can't
--      explain.
--      a. The version gate (rulings H2). Gate on "my predecessor is present and
--         my own version is absent", NEVER on max(version): E1, P1 and T2 may
--         legitimately be applied around this file.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260916130000', '20260922100000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260916130000.
--           -- Both rows: this file is already applied. STOP.
--           -- No rows: the predecessor is missing. STOP.
--      b. No name collision:
--           SELECT proname FROM pg_proc
--            WHERE pronamespace = 'public'::regnamespace
--              AND proname IN ('event_visible','can_manage_event',
--                  'post_engagement_counts','comment_like_counts',
--                  'event_rsvp_counts','mutual_follow_counts',
--                  'second_degree_follows');
--           -- expect 0 rows.
--      c. The two tables the functions read that T1.md's live-state table
--         does not list still exist:
--           SELECT to_regclass('public.blocks') IS NOT NULL,
--                  to_regclass('public.post_comments') IS NOT NULL;  -- t | t
--   1. Apply with the management-API curl recipe at
--      supabase/migrations/20260916120000_org_followers.sql:443-458, pointing
--      --rawfile at this file. `[]` means success. A JSON error means nothing
--      was applied (one transaction).
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922100000', 't1_count_and_visibility_fns');
--   3. POST-APPLY, read-only:
--        SELECT proname, prosecdef, provolatile, proconfig::text, proacl::text
--          FROM pg_proc
--         WHERE pronamespace = 'public'::regnamespace
--           AND proname IN ('event_visible','can_manage_event',
--               'post_engagement_counts','comment_like_counts',
--               'event_rsvp_counts','mutual_follow_counts',
--               'second_degree_follows')
--         ORDER BY 1;
--        -- expect 7 rows, each: t | s | {search_path=public} |
--        --   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--        -- anon is GRANTED on purpose (see 20260922090000: a revoke crashes the
--        -- backend on this image); each function is anon-safe by construction.
--        SELECT has_function_privilege('anon',
--                 'public.post_engagement_counts(uuid[],timestamptz)', 'EXECUTE'),
--               has_function_privilege('anon',
--                 'public.mutual_follow_counts(uuid[])', 'EXECUTE'),
--               has_function_privilege('authenticated',
--                 'public.second_degree_follows(uuid[])', 'EXECUTE');  -- t | t | t
--        -- and nothing else moved: the six SELECT policies still read `true`
--        SELECT count(*) FROM pg_policies
--         WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
--           AND tablename IN ('post_likes','comment_likes','post_reposts',
--               'connections','events','rsvps');  -- 6
--      Behavior probes (SEED-T1, T1.md Acceptance D) run on the LOCAL stack
--      only. No production smoke is needed for an additive file (rulings M8:
--      production checks are GET-only and run by the orchestrator).
--      The block clause (rulings M4) needs its own local probes, because in
--      SEED-T1 as written F follows nobody, so "no rows" would pass even
--      without the clause. Each runs in its own BEGIN ... ROLLBACK, the extra
--      row inserted as postgres before the SET LOCAL ROLE:
--        a. insert connections (F -> B). As F:
--           mutual_follow_counts(array[A]) -> no rows (A blocked F).
--           Control, as F: mutual_follow_counts(array[C]) -> no rows too
--           (C follows only A), and after also inserting (C -> B) -> (C, 1).
--        b. insert blocks (C blocked A). As A: second_degree_follows() -> no
--           rows (it is exactly (C, 1) without the block).
--        c. The person counted through (reviewer finding, 2026-09-22):
--           insert connections (F -> A), the edge F can write over REST after
--           A blocked F. As F: mutual_follow_counts(array[B, C]) -> no rows.
--           Without the through-person clause it returns (B, 1), (C, 1):
--           A's follower list, handed to someone A blocked.
--        d. The mutual counted through: insert blocks (B blocked A) with no
--           edge teardown (as a direct REST insert would leave it). As A:
--           second_degree_follows() -> no rows (B is A's only mutual; without
--           the clause it is (C, 1)).
--      p_since answers only for the caller's own posts, so T1.md Acceptance
--      D's probe "as E with p_since => now() + interval '1 day' -> P1 (0,0),
--      P3 (0,0)" now returns NO ROWS (neither post is E's; the TS caller
--      zero-fills, so every screen still reads 0). Probe it as:
--        e. As E: post_engagement_counts(array[P1, P3], now() + interval
--           '1 day') -> no rows; post_engagement_counts(array[P1, P3],
--           now() - interval '1 day') -> no rows too (not E's posts, however
--           wide the window). As A: post_engagement_counts(array[P1, P2, P3],
--           now() - interval '1 day') -> P1 (2, 2), P2 (1, 0), no P3 row.
--      Pre-checked 2026-09-22 WITHOUT applying this file: pg_temp copies of
--      the three changed bodies, run as postgres with request.jwt.claims set,
--      on the local seed users standing in for SEED-T1's roles, inside one
--      transaction that rolled back. a-e, and T1.md D's mutual_follow_counts,
--      second_degree_follows and post_engagement_counts rows, all gave the
--      answers above; the pre-fix mutual_follow_counts body gave (B, 1),
--      (C, 1) for c.
--
-- WARNING, FOUND WHILE TESTING THIS FILE (2026-09-21). On the local image
-- public.ecr.aws/supabase/postgres:17.6.1.111, calling ANY function the
-- current role lacks EXECUTE on segfaults the backend (signal 11) instead of
-- raising 42501, and Postgres then restarts every connection in the stack.
-- It reproduces with a two-line `language sql` function, through the
-- authenticator -> anon path PostgREST uses, and for authenticated too; it
-- goes away when the session starts without supautils
-- (session_preload_libraries). So the "as anon, post_engagement_counts('{}')
-- -> 42501" probe (T1.md Acceptance D) and any anon REST call to an rpc/
-- endpoint (Acceptance E) crash the shared local database. Check EXECUTE with
-- has_function_privilege(...) as in step 3 instead. Production also runs
-- PostgreSQL 17.6 with supautils preloaded; whether it has the same crash is
-- for the orchestrator to settle without probing production. (Reported by
-- the first T1a run. The second run did not re-test it on purpose: a repro
-- restarts every connection on the shared local stack. The image tag above
-- was re-checked read-only with `docker inspect` on 2026-09-22.)
--
-- ROLLBACK. Only after T1 file 2 is rolled back (its events and rsvps policies
-- call event_visible and can_manage_event, so DROP FUNCTION fails while they
-- exist, which is the safety catch) AND after the T1b-T1d code is reverted
-- (the routes call the count RPCs; without them likes, reposts, going counts
-- and "you both follow" fall back to zeros or 500s). Rulings H1: this restores
-- only this file's change. If T2 is applied, re-run T2's POST-CHECK afterwards
-- (its function allow-list names these seven, rulings H3).
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.second_degree_follows(uuid[]);
--   DROP FUNCTION IF EXISTS public.mutual_follow_counts(uuid[]);
--   DROP FUNCTION IF EXISTS public.event_rsvp_counts(uuid[]);
--   DROP FUNCTION IF EXISTS public.comment_like_counts(uuid[]);
--   DROP FUNCTION IF EXISTS public.post_engagement_counts(uuid[], timestamptz);
--   DROP FUNCTION IF EXISTS public.can_manage_event(uuid);
--   DROP FUNCTION IF EXISTS public.event_visible(uuid, uuid, uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Creating functions takes no table lock; this only bounds the wait on the
-- catalog if something unusual holds it.
set local lock_timeout = '5s';

-- 1. policy helpers (file 2) -------------------------------------------------

-- Can the caller see this event? Creator, OR its club is not hidden (private
-- clubs included: rush events are how invite-only clubs meet new students, per
-- src/app/api/events/route.ts:98-104), OR member of the hidden club, OR has an
-- RSVP on it (so an RSVP'd event survives the club being hidden, which the
-- rsvp route's DELETE docblock relies on). DEFINER so it reads orgs,
-- org_members and rsvps without the caller's RLS (see LIVE STATE, orgs_select).
create or replace function public.event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_setting('role', true) is distinct from 'anon' and (
         coalesce(p_creator_id = auth.uid(), false)
      or (p_org_id is not null and exists (
            select 1 from public.orgs o
             where o.id = p_org_id
               and (o.hidden_at is null
                    or exists (select 1 from public.org_members m
                                where m.org_id = o.id and m.user_id = auth.uid()))))
      or exists (select 1 from public.rsvps r
                  where r.event_id = p_event_id and r.user_id = auth.uid()));
$$;

comment on function public.event_visible(uuid, uuid, uuid) is
  'T1 policy helper for events_select_visible: true when the caller created the event, its club is not hidden, the caller is a member of the (hidden) club, or the caller has an RSVP on it. Viewer is auth.uid().';

-- Does the caller manage this event? Creator, or owner/admin of its club. The
-- same rule as src/app/api/events/[id]/attendees/route.ts:53-65.
create or replace function public.can_manage_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id
       and (e.creator_id = auth.uid()
            or (e.org_id is not null and exists (
                  select 1 from public.org_members m
                   where m.org_id = e.org_id and m.user_id = auth.uid()
                     and m.role in ('owner', 'admin')))));
$$;

comment on function public.can_manage_event(uuid) is
  'T1 policy helper for rsvps_select_own_or_manager: true when the caller created the event or is owner/admin of its club. Viewer is auth.uid().';

-- 2. count RPCs: numbers only, never identities --------------------------------

-- Likes and reposts per post. Only posts the caller can see: published, or the
-- caller's own (mirrors posts_select_authenticated). p_since limits both counts
-- to rows created at or after it (creator-stats' 7- and 30-day windows), and a
-- windowed call answers ONLY for the caller's own posts: without that, anyone
-- could shrink p_since call by call and pin down when each like or repost on
-- someone else's post happened. creator-stats passes only the caller's own
-- posts, and src/lib/posts/engagement-counts.ts zero-fills the rest.
create or replace function public.post_engagement_counts(p_post_ids uuid[], p_since timestamptz default null)
returns table (post_id uuid, like_count integer, repost_count integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_post_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select p.id,
           (select count(*)::int from public.post_likes l
             where l.post_id = p.id and (p_since is null or l.created_at >= p_since)),
           (select count(*)::int from public.post_reposts r
             where r.post_id = p.id and (p_since is null or r.created_at >= p_since))
      from public.posts p
     where p.id = any(p_post_ids)
       and (p.status = 'published' or p.user_id = auth.uid())
       and (p_since is null or p.user_id = auth.uid())
       -- a hidden club's post answers only for its author and the club's
       -- members: to everyone else the club does not exist.
       and (p.org_id is null or p.user_id = auth.uid() or exists (
             select 1 from public.orgs o
              where o.id = p.org_id
                and (o.hidden_at is null
                     or exists (select 1 from public.org_members m
                                 where m.org_id = o.id and m.user_id = auth.uid()))));
end $$;

comment on function public.post_engagement_counts(uuid[], timestamptz) is
  'T1: like and repost counts per post, for posts the caller can see (published or own; a hidden club''s post only for its author and members). With p_since, only the caller''s own posts. Numbers only. Max 1000 ids (22023). Called by src/lib/posts/engagement-counts.ts.';

-- Likes per comment, for comments on posts the caller can see.
create or replace function public.comment_like_counts(p_comment_ids uuid[])
returns table (comment_id uuid, like_count integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_comment_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select c.id, count(cl.user_id)::int
      from public.post_comments c
      join public.posts p on p.id = c.post_id
      left join public.comment_likes cl on cl.comment_id = c.id
     where c.id = any(p_comment_ids)
       and (p.status = 'published' or p.user_id = auth.uid())
       and (p.org_id is null or p.user_id = auth.uid() or exists (
             select 1 from public.orgs o
              where o.id = p.org_id
                and (o.hidden_at is null
                     or exists (select 1 from public.org_members m
                                 where m.org_id = o.id and m.user_id = auth.uid()))))
     group by c.id;
end $$;

comment on function public.comment_like_counts(uuid[]) is
  'T1: like count per comment, for comments on posts the caller can see. Numbers only. Max 1000 ids (22023).';

-- Going and maybe per event, for events the caller can see (event_visible).
create or replace function public.event_rsvp_counts(p_event_ids uuid[])
returns table (event_id uuid, going_count integer, maybe_count integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_event_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select e.id,
           (count(r.id) filter (where r.status = 'going'))::int,
           (count(r.id) filter (where r.status = 'maybe'))::int
      from public.events e
      left join public.rsvps r on r.event_id = e.id
     where e.id = any(p_event_ids)
       and public.event_visible(e.org_id, e.creator_id, e.id)
     group by e.id;
end $$;

comment on function public.event_rsvp_counts(uuid[]) is
  'T1: going and maybe counts per event, for events the caller can see (event_visible). Numbers only. Max 1000 ids (22023).';

-- 3. follow-graph RPCs ---------------------------------------------------------

-- "N you both follow" per candidate: how many of the candidate's followings the
-- CALLER also follows. Same math as hydrateUserCards in
-- src/lib/connections/queries.ts. Rows only where N > 0. Block pairs with the
-- caller are skipped on BOTH sides (rulings M4): a candidate in one gets no
-- row, and a person counted through (the Y in "X follows Y") who is in one
-- counts for nobody. So the RPC can't be used as a "does X follow Y" oracle
-- across a block, whichever side of the question the blocker is on.
create or replace function public.mutual_follow_counts(p_user_ids uuid[])
returns table (user_id uuid, mutual_count integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_user_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select c.follower_id, count(*)::int
      from public.connections c
     where c.follower_id = any(p_user_ids)
       and exists (select 1 from public.connections v
                    where v.follower_id = auth.uid() and v.following_id = c.following_id
                      and not exists (select 1 from public.blocks b2
                                       where (b2.blocker_id = auth.uid() and b2.blocked_id = c.following_id)
                                          or (b2.blocker_id = c.following_id and b2.blocked_id = auth.uid())))
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = auth.uid() and b.blocked_id = c.follower_id)
                           or (b.blocker_id = c.follower_id and b.blocked_id = auth.uid()))
     group by c.follower_id;
end $$;

comment on function public.mutual_follow_counts(uuid[]) is
  'T1: per candidate, how many of the candidate''s followings the caller also follows. Rows only where > 0; block pairs with the caller are skipped, both as candidates and as the people counted through. Viewer is auth.uid(): under the service role it returns nothing. Max 1000 ids (22023).';

-- Friends of friends: people followed by the caller's MUTUAL connections, with
-- how many of those mutuals follow each one. Excludes the caller and anyone in
-- a block pair with the caller (rulings M4), and a mutual in a block pair with
-- the caller counts for nobody (a block written straight over REST leaves the
-- follow edges in place). Optional p_among narrows the answer. Top 1000 by
-- via_count then user_id: a deliberate, ordered cap (PostgREST max_rows = 1000
-- would otherwise cut an unordered answer).
create or replace function public.second_degree_follows(p_among uuid[] default null)
returns table (user_id uuid, via_count integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_among is not null and cardinality(p_among) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    with mine as (
      select o.following_id as mid
        from public.connections o
       where o.follower_id = auth.uid()
         and exists (select 1 from public.connections i
                      where i.follower_id = o.following_id and i.following_id = auth.uid())
         and not exists (select 1 from public.blocks b2
                          where (b2.blocker_id = auth.uid() and b2.blocked_id = o.following_id)
                             or (b2.blocker_id = o.following_id and b2.blocked_id = auth.uid())))
    select c.following_id, count(*)::int
      from public.connections c
     where c.follower_id in (select mine.mid from mine)
       and c.following_id <> auth.uid()
       and (p_among is null or c.following_id = any(p_among))
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = auth.uid() and b.blocked_id = c.following_id)
                           or (b.blocker_id = c.following_id and b.blocked_id = auth.uid()))
     group by c.following_id
     order by count(*) desc, c.following_id
     limit 1000;
end $$;

comment on function public.second_degree_follows(uuid[]) is
  'T1: people followed by the caller''s mutual connections, with how many mutuals follow each. Excludes the caller and block pairs, and skips mutuals in a block pair with the caller. Top 1000 by via_count desc, user_id. Viewer is auth.uid(): under the service role it returns nothing. Max 1000 ids in p_among (22023).';

-- 4. grants ------------------------------------------------------------------
-- A new function starts with PUBLIC's built-in EXECUTE; take that back and
-- grant the three API roles explicitly. anon IS granted, on purpose: on this
-- Postgres image (17.6.1.111) calling a function you lack EXECUTE on crashes
-- the backend (see 20260922090000_guard_function_privileges.sql), so a revoke
-- is a crash button. Every function here is safe for anon by construction:
-- the follow-graph ones and can_manage_event key on auth.uid(), which is null
-- for anon; event_visible answers false for anon; the count RPCs return
-- numbers only, for published posts and visible events — counts are public.
revoke all on function public.event_visible(uuid, uuid, uuid)                 from public;
revoke all on function public.can_manage_event(uuid)                          from public;
revoke all on function public.post_engagement_counts(uuid[], timestamptz)     from public;
revoke all on function public.comment_like_counts(uuid[])                     from public;
revoke all on function public.event_rsvp_counts(uuid[])                       from public;
revoke all on function public.mutual_follow_counts(uuid[])                    from public;
revoke all on function public.second_degree_follows(uuid[])                   from public;
grant execute on function public.event_visible(uuid, uuid, uuid)              to anon, authenticated, service_role;
grant execute on function public.can_manage_event(uuid)                       to anon, authenticated, service_role;
grant execute on function public.post_engagement_counts(uuid[], timestamptz)  to anon, authenticated, service_role;
grant execute on function public.comment_like_counts(uuid[])                  to anon, authenticated, service_role;
grant execute on function public.event_rsvp_counts(uuid[])                    to anon, authenticated, service_role;
grant execute on function public.mutual_follow_counts(uuid[])                 to anon, authenticated, service_role;
grant execute on function public.second_degree_follows(uuid[])                to anon, authenticated, service_role;

-- 5. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
