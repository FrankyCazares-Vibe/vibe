-- ---------------------------------------------------------------------------
-- 20261019120000_event_checkins.sql
--
-- LOCAL ONLY UNTIL FRANKY SAYS YES. During the build this file is applied to
-- the local stack only. Production waits for Franky's explicit OK; then the
-- main session applies it JUST BEFORE THE PUSH (the old build never names
-- these tables or functions, and the new build's events list treats a
-- missing check-in function as "no check-in", so either order is safe).
--
-- PLAIN ENGLISH
-- Event check-in (Franky, Oct 19 2026; handoffs/2026-10-19-checkin-build/
-- CONTRACT.md). A club officer taps "Start check-in": their screen shows a QR
-- code and a 4-digit code that change every 30 seconds. Anyone at the event
-- who may see it checks in by typing the code or opening the QR's link with
-- their phone's camera; officers can also tick "Mark as here" for people who
-- said Going or Interested. Officers see who checked in; everyone else sees
-- only how many, from 5 up. A check-in stays until the student removes it,
-- an officer takes it off or clears the event's check-ins, or the event, the
-- club or the account is deleted. Nothing about where a person is: no
-- location, no IP address, not even the time someone checked in.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet; the tables and
--      columns it reads are there; pgcrypto sits in schema `extensions`;
--      can_manage_event, event_visible, is_restricted_now and
--      has_recorded_consent read as on Oct 19 (md5 of prosrc), because
--      event_checkin_self_as copies the last three's rules for p_user.
--   1. public.event_checkins (event_id, user_id): the record. Both keys
--      cascade (event or club deleted, account deleted). RLS: you read your
--      own rows, the event's managers read all of them; you delete your own.
--      No insert or update grant: only the functions below write.
--   2. public.event_checkin_sessions (event_id, secret): one row while
--      check-in is open. 32 random bytes; nobody but the functions reads it
--      (RLS on, every grant revoked, no policy). Stop = delete the row, so
--      every code and link already shown dies with it.
--   3. Ten functions, SECURITY DEFINER, search_path '':
--        event_checkin_derive(secret, event, step) -> (code, token)
--        event_checkin_open / _close / _door        officers (auth.uid())
--        event_checkin_mark / _unmark / _clear     officers (auth.uid())
--        event_checkin_self_as(user, event, code, token)  SERVICE ROLE ONLY
--        event_checkin_state(event ids)            anyone signed in
--        event_checkin_mine()                      the caller's own list
--   4. Grants: revoke all from public, EXECUTE to anon, authenticated and
--      service_role (the standing rule, 20260922090000: never revoke EXECUTE;
--      refuse inside).
--   5. POST-CHECK by catalog, then by behaviour in a block that raises
--      P0C91 and so undoes itself (writes nothing: every probe is refused).
--
-- THE CODE. step = floor(unix seconds / 30). For a step, HMAC-SHA256 with the
-- session secret over '<event id>:<step>:code' gives the code (first 4 bytes
-- as an unsigned number, mod 10000, 4 digits with leading zeros), and over
-- '<event id>:<step>:link' the QR token (first 16 bytes, base64url, 22
-- characters). A typed code is accepted for its step and the one before (30
-- to 60 s); the QR token for its step and the three before (90 to 120 s:
-- camera, browser, a tap). At most 2 of the 10,000 codes work at any moment.
-- The guessing bound is the route's limiter (eventCheckin, 20 tries per
-- account per UTC day, fails closed): event_checkin_self_as refuses every
-- browser role, so the limiter can't be gone around over the REST API.
--
-- THE WINDOW. Check-in works from 1 hour before the start to 1 hour after the
-- end, and only while a session row exists. Officers may mark people from
-- 1 hour before the start to 24 hours after the end; taking a check-in off
-- and clearing are allowed at any time.
--
-- THE COUNT. event_checkin_state gives the event's managers the exact number
-- and everyone else the number only from 5 up (null below). The floor is
-- here, not in TypeScript, so the REST API can't read under it.
--
-- DOES NOT: store a time, a method, an officer's id, an IP address or a
-- location; count wrong tries in the database (the limiter does); touch
-- rsvps, events, orgs or any existing function; change /api/me's account
-- deletion (the cascades do it); delete anything on a schedule.
--
-- LIVE STATE (LOCAL stack, Oct 19 2026, read-only): no event_checkin* table;
-- pgcrypto 1.3 in schema extensions; md5(prosrc): can_manage_event
-- f09163bbf84c24ae3c17d7922ce9c2e7, event_visible
-- ca3d34f65cb01af1a826df053d97b384, is_restricted_now
-- b98aa3d1c7e1cbb55b8d4aa95e0def02, has_recorded_consent
-- 23121c3d37d2a99826699353fd13036d. Local schema_migrations stops at
-- 20261008140000 although later files' objects exist: check by catalog.
--
-- PRE-CHECK on PRODUCTION (read-only; counts, catalog and md5 only), after
-- Franky's yes:
--   select to_regclass('public.event_checkins'), to_regclass('public.event_checkin_sessions');   [null | null]
--   select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';               [extensions]
--   select p.proname, md5(p.prosrc) from pg_proc p
--    where p.oid in ('public.can_manage_event(uuid)'::regprocedure, 'public.event_visible(uuid,uuid,uuid)'::regprocedure,
--                    'public.is_restricted_now()'::regprocedure, 'public.has_recorded_consent()'::regprocedure);
--   [the four md5s above; any other answer: stop and read that body first]
--
-- LOCK. CREATE TABLE with a foreign key takes SHARE ROW EXCLUSIVE on events
-- and users for milliseconds. lock_timeout 5s makes the file fail whole
-- instead of queueing.
--
-- HOW TO APPLY. Locally (one builder on the local database at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261019120000_event_checkins.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261019120000', 'event_checkins') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the Supabase connector's apply_migration (the body
-- without begin; and commit;), then renames the row the connector records:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261019120000', 'event_checkins') ON CONFLICT (version) DO NOTHING;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (one transaction; deletes every check-in; run it only after the
-- build that calls these functions is rolled back, or its routes answer 500):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   drop function if exists public.event_checkin_mine();
--   drop function if exists public.event_checkin_state(uuid[]);
--   drop function if exists public.event_checkin_self_as(uuid, uuid, text, text);
--   drop function if exists public.event_checkin_clear(uuid);
--   drop function if exists public.event_checkin_unmark(uuid, uuid);
--   drop function if exists public.event_checkin_mark(uuid, uuid);
--   drop function if exists public.event_checkin_door(uuid);
--   drop function if exists public.event_checkin_close(uuid);
--   drop function if exists public.event_checkin_open(uuid);
--   drop function if exists public.event_checkin_derive(bytea, uuid, bigint);
--   drop table if exists public.event_checkin_sessions;
--   drop table if exists public.event_checkins;
--   delete from supabase_migrations.schema_migrations where version = '20261019120000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED: (the builder fills this in after the local apply, a second
-- apply refused by the pre-flight, the ROLLBACK, and a clean re-apply).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  got text;
begin
  if to_regclass('public.event_checkins') is not null
     or to_regclass('public.event_checkin_sessions') is not null then
    raise exception 'event-checkins: already applied (a table exists); read the catalog first';
  end if;
  if to_regclass('public.events') is null or to_regclass('public.rsvps') is null
     or to_regclass('public.orgs') is null or to_regclass('public.users') is null
     or to_regclass('public.account_restrictions') is null then
    raise exception 'event-checkins: events, rsvps, orgs, users or account_restrictions is missing';
  end if;
  if not exists (select 1 from pg_extension x
                  where x.extname = 'pgcrypto' and x.extnamespace = 'extensions'::regnamespace) then
    raise exception 'event-checkins: pgcrypto is not installed in schema extensions';
  end if;
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'event-checkins: extensions.hmac(bytea,bytea,text) or extensions.gen_random_bytes(integer) is missing';
  end if;
  -- The helpers this file calls (can_manage_event, event_visible,
  -- is_restricted_now) or copies for p_user (event_visible,
  -- is_restricted_now, has_recorded_consent) must read as on Oct 19.
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.can_manage_event(uuid)');
  if got is distinct from 'f09163bbf84c24ae3c17d7922ce9c2e7' then
    raise exception 'event-checkins: can_manage_event drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.event_visible(uuid,uuid,uuid)');
  if got is distinct from 'ca3d34f65cb01af1a826df053d97b384' then
    raise exception 'event-checkins: event_visible drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.is_restricted_now()');
  if got is distinct from 'b98aa3d1c7e1cbb55b8d4aa95e0def02' then
    raise exception 'event-checkins: is_restricted_now drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.has_recorded_consent()');
  if got is distinct from '23121c3d37d2a99826699353fd13036d' then
    raise exception 'event-checkins: has_recorded_consent drifted (md5 %); read it first', got;
  end if;
  if (select count(*) from pg_attribute a where a.attrelid = 'public.events'::regclass and not a.attisdropped
        and a.attname in ('id', 'org_id', 'creator_id', 'title', 'starts_at', 'ends_at')) <> 6
     or (select count(*) from pg_attribute a where a.attrelid = 'public.orgs'::regclass and not a.attisdropped
        and a.attname in ('id', 'name', 'handle', 'hidden_at')) <> 4
     or (select count(*) from pg_attribute a where a.attrelid = 'public.rsvps'::regclass and not a.attisdropped
        and a.attname in ('event_id', 'user_id', 'status')) <> 3
     or (select count(*) from pg_attribute a where a.attrelid = 'public.users'::regclass and not a.attisdropped
        and a.attname in ('id', 'terms_accepted_at', 'age_attested_at')) <> 3
     or (select count(*) from pg_attribute a where a.attrelid = 'public.account_restrictions'::regclass and not a.attisdropped
        and a.attname in ('user_id', 'lifted_at', 'starts_at', 'ends_at')) <> 4 then
    raise exception 'event-checkins: a column this file reads is missing (events, orgs, rsvps, users or account_restrictions)';
  end if;
  raise notice 'event-checkins: pre-flight ok';
end $$;

-- 1. The record: who checked in at which event. Nothing else. -------------------
create table public.event_checkins (
  event_id uuid not null,
  user_id  uuid not null,
  constraint event_checkins_pkey primary key (event_id, user_id),
  -- Event deleted (or its club, which deletes its events): gone.
  constraint event_checkins_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  -- Account deleted: gone. No trigger on this table, so the cascade can't
  -- be refused (the moderation_actions trap, 20260923090000:1875-1892).
  constraint event_checkins_user_id_fkey foreign key (user_id)
    references public.users (id) on delete cascade
);

-- The account-delete cascade and "my check-ins" read by user.
create index event_checkins_user_id_idx on public.event_checkins (user_id);

alter table public.event_checkins enable row level security;
revoke all on table public.event_checkins from anon, authenticated, service_role;
-- Read (own rows, or the event's managers') and delete (own rows) only.
-- Inserts come from event_checkin_self_as and event_checkin_mark; officer
-- removals from event_checkin_unmark and event_checkin_clear.
grant select, delete on table public.event_checkins to authenticated;

create policy event_checkins_select_own_or_manager on public.event_checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_event(event_id));

-- Removing your own check-in is never gated: not on Terms, a restriction,
-- the window or a hidden club (the RSVP DELETE rule, rsvp/route.ts:186-196).
create policy event_checkins_delete_own on public.event_checkins
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.event_checkins is
  'Event check-in (20261019120000): one row per person who checked in at an event, by the door code, the QR link or an officer''s Mark as here. No time, no method, no officer, no location. Kept until the person removes it, an officer takes it off or clears the event, or the event, the club or the account is deleted.';

-- 2. The open check-in's secret. Nobody but the functions reads it. --------------
create table public.event_checkin_sessions (
  event_id uuid not null,
  secret   bytea not null,
  constraint event_checkin_sessions_pkey primary key (event_id),
  constraint event_checkin_sessions_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_checkin_sessions_secret_len check (octet_length(secret) = 32)
);

alter table public.event_checkin_sessions enable row level security;
revoke all on table public.event_checkin_sessions from anon, authenticated, service_role;
-- NO grant and NO policy (the usage_day_tally pattern, 20261014150000:336-339).

comment on table public.event_checkin_sessions is
  'Event check-in (20261019120000): a row means an officer started check-in for the event. secret = 32 random bytes the codes and QR tokens are made from; read only by the event_checkin_* functions as their owner. Stop deletes the row, so every code already shown stops working. Holds nothing about a person.';

-- 3a. The code and the QR token for one 30-second step. --------------------------
-- Pure arithmetic on what it is given: without a session's secret it makes
-- nothing anyone can use, so every API role may call it. SECURITY DEFINER
-- so a browser role's call never depends on its own EXECUTE on pgcrypto.
create function public.event_checkin_derive(p_secret bytea, p_event_id uuid, p_step bigint)
returns table (code text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':code', 'UTF8'), p_secret, 'sha256') as hc,
           extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':link', 'UTF8'), p_secret, 'sha256') as hl
  )
  select lpad(((get_byte(h.hc, 0)::bigint * 16777216
               + get_byte(h.hc, 1)::bigint * 65536
               + get_byte(h.hc, 2)::bigint * 256
               + get_byte(h.hc, 3)::bigint) % 10000)::text, 4, '0'),
         translate(rtrim(encode(substring(h.hl from 1 for 16), 'base64'), '='), '+/', '-_')
    from h;
$$;

comment on function public.event_checkin_derive(bytea, uuid, bigint) is
  'Event check-in (20261019120000): the 4-digit code and the 22-character QR token for one 30-second step (step = floor(unix seconds / 30)), HMAC-SHA256 with the session secret. Harmless without a secret, which only the event_checkin_* functions read.';

-- 3b. Start check-in (an officer). ------------------------------------------------
create function public.event_checkin_open(p_event_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  if public.is_restricted_now() then
    return 'restricted';
  end if;
  if v_hidden is not null then
    return 'org_hidden';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '1 hour' then
    return 'outside_window';
  end if;
  -- Tidy: a session whose event's window has passed holds a dead secret.
  delete from public.event_checkin_sessions s
   using public.events e
   where e.id = s.event_id
     and e.ends_at < now() - interval '1 hour';
  -- Already open: keep the codes on screen (a second officer's device shows
  -- the same ones). Not open: a new secret, so no old photo of a code works.
  insert into public.event_checkin_sessions (event_id, secret)
  values (p_event_id, extensions.gen_random_bytes(32))
  on conflict (event_id) do nothing;
  if found then
    return 'open';
  end if;
  return 'already_open';
end
$fn$;

comment on function public.event_checkin_open(uuid) is
  'Event check-in (20261019120000): start check-in. Caller = auth.uid(); 42501 without one. Answers open | already_open | not_found | not_manager | restricted | org_hidden | outside_window (1 h before the start to 1 h after the end).';

-- 3c. Stop check-in (an officer). Taking away only: no restriction check. ---------
create function public.event_checkin_close(p_event_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  delete from public.event_checkin_sessions s where s.event_id = p_event_id;
  return 'closed';
end
$fn$;

comment on function public.event_checkin_close(uuid) is
  'Event check-in (20261019120000): stop check-in (deletes the session; check-ins stay). Caller = auth.uid(); 42501 without one. Answers closed | not_found | not_manager.';

-- 3d. The door screen's feed (an officer): this step's and the next step's ------
-- code and token, so one read every 10 s keeps the screen right.
create function public.event_checkin_door(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_now    timestamptz := now();
  v_step   bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
  v_secret bytea;
  v_open   boolean;
  v_count  integer;
  c1 text; t1 text; c2 text; t2 text;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_manage_event(p_event_id) then
    return jsonb_build_object('status', 'not_manager');
  end if;
  if public.is_restricted_now() then
    return jsonb_build_object('status', 'restricted');
  end if;
  if v_hidden is not null then
    return jsonb_build_object('status', 'org_hidden');
  end if;
  select s.secret into v_secret from public.event_checkin_sessions s where s.event_id = p_event_id;
  v_open := v_secret is not null
            and v_now >= v_starts - interval '1 hour'
            and v_now <= v_ends + interval '1 hour';
  if v_open then
    select d.code, d.token into c1, t1 from public.event_checkin_derive(v_secret, p_event_id, v_step) d;
    select d.code, d.token into c2, t2 from public.event_checkin_derive(v_secret, p_event_id, v_step + 1) d;
  end if;
  select count(*)::integer into v_count from public.event_checkins c where c.event_id = p_event_id;
  return jsonb_build_object(
    'status', 'ok',
    'is_open', v_open,
    'opens_at', v_starts - interval '1 hour',
    'closes_at', v_ends + interval '1 hour',
    'server_now', v_now,
    'step_starts_at', case when v_open then to_timestamp(v_step * 30) end,
    'step_ends_at', case when v_open then to_timestamp((v_step + 1) * 30) end,
    'next_ends_at', case when v_open then to_timestamp((v_step + 2) * 30) end,
    'code', c1,
    'token', t1,
    'next_code', c2,
    'next_token', t2,
    'here_count', v_count);
end
$fn$;

comment on function public.event_checkin_door(uuid) is
  'Event check-in (20261019120000): the officer screen''s feed as jsonb {status, is_open, opens_at, closes_at, server_now, step_starts_at, step_ends_at, next_ends_at, code, token, next_code, next_token, here_count}. Codes only while open and inside the window. status: ok | not_found | not_manager | restricted | org_hidden. Caller = auth.uid(); 42501 without one.';

-- 3e. "Mark as here" (an officer), for people who said Going or Interested. ------
create function public.event_checkin_mark(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  if public.is_restricted_now() then
    return 'restricted';
  end if;
  if v_hidden is not null then
    return 'org_hidden';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '24 hours' then
    return 'outside_window';
  end if;
  -- An officer can't put a stranger on the record: only someone who said
  -- Going or Interested. (Walk-ins check themselves in with the code.)
  if not exists (select 1 from public.rsvps r
                  where r.event_id = p_event_id and r.user_id = p_user_id
                    and r.status in ('going', 'maybe')) then
    return 'not_on_list';
  end if;
  insert into public.event_checkins (event_id, user_id)
  values (p_event_id, p_user_id)
  on conflict (event_id, user_id) do nothing;
  if found then
    return 'marked';
  end if;
  return 'already';
end
$fn$;

comment on function public.event_checkin_mark(uuid, uuid) is
  'Event check-in (20261019120000): an officer marks someone with a going/maybe RSVP as here, from 1 h before the start to 24 h after the end; works with check-in stopped. Answers marked | already | not_found | not_manager | restricted | org_hidden | outside_window | not_on_list. Caller = auth.uid(); 42501 without one.';

-- 3f. Take one person's check-in off (an officer). Any time. ---------------------
create function public.event_checkin_unmark(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  delete from public.event_checkins c
   where c.event_id = p_event_id and c.user_id = p_user_id;
  return 'removed';
end
$fn$;

comment on function public.event_checkin_unmark(uuid, uuid) is
  'Event check-in (20261019120000): an officer takes one check-in off (idempotent). Answers removed | not_found | not_manager. Caller = auth.uid(); 42501 without one.';

-- 3g. Clear every check-in of an event (an officer). Any time. -------------------
create function public.event_checkin_clear(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_manage_event(p_event_id) then
    return jsonb_build_object('status', 'not_manager');
  end if;
  delete from public.event_checkins c where c.event_id = p_event_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('status', 'cleared', 'cleared', v_n);
end
$fn$;

comment on function public.event_checkin_clear(uuid) is
  'Event check-in (20261019120000): an officer deletes all of an event''s check-ins. jsonb {status: cleared | not_found | not_manager, cleared}. Caller = auth.uid(); 42501 without one.';

-- 3h. A student checks in: SERVICE ROLE ONLY. ------------------------------------
-- The route calls it after its limiter (eventCheckin, fails closed), which is
-- the bound on guessing; a browser role is refused so the REST API can't go
-- around that limiter. Under the service role auth.uid() is null, so this
-- restates for p_user the rules of event_visible + event_org_visible,
-- is_restricted_now and has_recorded_consent (pinned by the pre-flight's md5s).
-- Every outcome is a word, never an error: nothing to tell a near miss from a
-- far one.
create function public.event_checkin_self_as(p_user uuid, p_event_id uuid, p_code text, p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_step    bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_org     uuid;
  v_creator uuid;
  v_starts  timestamptz;
  v_ends    timestamptz;
  v_hidden  timestamptz;
  v_secret  bytea;
  v_hit     boolean := false;
  i         integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (p_code is null) = (p_token is null) then
    raise exception 'exactly one of p_code and p_token' using errcode = '22023';
  end if;
  if p_user is null then
    return 'not_found';
  end if;
  select e.org_id, e.creator_id, e.starts_at, e.ends_at, o.hidden_at
    into v_org, v_creator, v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  -- Who may see it: a club event whose club isn't hidden (no check-in at a
  -- hidden club, for anyone: the RSVP route's 404); an org-less event, its
  -- creator or someone holding an RSVP (event_visible's other arms).
  -- No campus rule: being at the door is the point (Franky: "anyone at the
  -- event"); RSVP stays home-campus only. Don't add one.
  if v_org is not null and v_hidden is not null then
    return 'not_found';
  end if;
  if v_org is null and v_creator is distinct from p_user
     and not exists (select 1 from public.rsvps r where r.event_id = p_event_id and r.user_id = p_user) then
    return 'not_found';
  end if;
  -- is_restricted_now(), for p_user.
  if exists (select 1 from public.account_restrictions r
              where r.user_id = p_user
                and r.lifted_at is null
                and r.starts_at <= now()
                and (r.ends_at is null or r.ends_at > now())) then
    return 'restricted';
  end if;
  -- has_recorded_consent(), for p_user.
  if not exists (select 1 from public.users u
                  where u.id = p_user
                    and u.terms_accepted_at is not null
                    and u.age_attested_at is not null) then
    return 'terms_required';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '1 hour' then
    return 'outside_window';
  end if;
  select s.secret into v_secret from public.event_checkin_sessions s where s.event_id = p_event_id;
  if v_secret is null then
    return 'not_open';
  end if;
  if exists (select 1 from public.event_checkins c where c.event_id = p_event_id and c.user_id = p_user) then
    return 'already';
  end if;
  if p_code is not null then
    if p_code ~ '^[0-9]{4}$' then
      for i in 0..1 loop
        if exists (select 1 from public.event_checkin_derive(v_secret, p_event_id, v_step - i) d
                    where d.code = p_code) then
          v_hit := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_hit then
      return 'wrong_code';
    end if;
  else
    if p_token ~ '^[A-Za-z0-9_-]{22}$' then
      for i in 0..3 loop
        if exists (select 1 from public.event_checkin_derive(v_secret, p_event_id, v_step - i) d
                    where d.token = p_token) then
          v_hit := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_hit then
      return 'link_expired';
    end if;
  end if;
  insert into public.event_checkins (event_id, user_id)
  values (p_event_id, p_user)
  on conflict (event_id, user_id) do nothing;
  return 'checked_in';
end
$fn$;

comment on function public.event_checkin_self_as(uuid, uuid, text, text) is
  'Event check-in (20261019120000): SERVICE ROLE ONLY (anon and authenticated get 42501; the route''s eventCheckin limiter bounds guessing). Exactly one of p_code (4 digits, this step or the one before) or p_token (22 chars, this step or the three before), else 22023. Answers checked_in | already | wrong_code | link_expired | not_open | outside_window | not_found | restricted | terms_required.';

-- 3i. Per event: open?, am I in?, how many (exact for its managers, else from --
-- 5 up). For events the caller can see (event_visible), like event_rsvp_counts.
create function public.event_checkin_state(p_event_ids uuid[])
returns table (event_id uuid, is_open boolean, viewer_checked_in boolean, checked_in_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_event_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  -- Anon and the service role: nothing (event_rsvp_counts answers the same).
  if (select auth.uid()) is null then
    return;
  end if;
  return query
    select e.id,
           (s.event_id is not null
              and o.hidden_at is null
              and now() >= e.starts_at - interval '1 hour'
              and now() <= e.ends_at + interval '1 hour'),
           exists (select 1 from public.event_checkins mine
                    where mine.event_id = e.id and mine.user_id = (select auth.uid())),
           (select case when n.total >= 5 or public.can_manage_event(e.id) then n.total end
              from (select count(*)::integer as total
                      from public.event_checkins c
                     where c.event_id = e.id) n)
      from public.events e
      left join public.orgs o on o.id = e.org_id
      left join public.event_checkin_sessions s on s.event_id = e.id
     where e.id = any(p_event_ids)
       and public.event_visible(e.org_id, e.creator_id, e.id);
end
$fn$;

comment on function public.event_checkin_state(uuid[]) is
  'Event check-in (20261019120000): per visible event (event_visible), is_open (started and inside the window, club not hidden), viewer_checked_in, and checked_in_count: exact for the event''s managers (can_manage_event), else the number from 5 up and null below. Numbers only. Max 1000 ids (22023). Nothing for anon or the service role.';

-- 3j. My check-ins, for Settings: newest event first, at most 200. --------------
create function public.event_checkin_mine()
returns table (event_id uuid, title text, starts_at timestamptz, ends_at timestamptz, org_name text, org_handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, e.ends_at, o.name, o.handle
    from public.event_checkins c
    join public.events e on e.id = c.event_id
    left join public.orgs o on o.id = e.org_id
   where c.user_id = (select auth.uid())
   order by e.starts_at desc, e.id
   limit 200;
$$;

comment on function public.event_checkin_mine() is
  'Event check-in (20261019120000): the caller''s own check-ins (auth.uid()), newest event first, max 200, with the event''s title and times and its club''s name and handle. Read past RLS on purpose: a student can always see and remove their own, even at a club hidden since. Nothing for anon or the service role.';

-- 4. Grants (the standing rule: grant to every API role, refuse inside) ----------
revoke all on function public.event_checkin_derive(bytea, uuid, bigint)         from public;
revoke all on function public.event_checkin_open(uuid)                          from public;
revoke all on function public.event_checkin_close(uuid)                         from public;
revoke all on function public.event_checkin_door(uuid)                          from public;
revoke all on function public.event_checkin_mark(uuid, uuid)                    from public;
revoke all on function public.event_checkin_unmark(uuid, uuid)                  from public;
revoke all on function public.event_checkin_clear(uuid)                         from public;
revoke all on function public.event_checkin_self_as(uuid, uuid, text, text)     from public;
revoke all on function public.event_checkin_state(uuid[])                       from public;
revoke all on function public.event_checkin_mine()                              from public;
grant execute on function public.event_checkin_derive(bytea, uuid, bigint)      to anon, authenticated, service_role;
grant execute on function public.event_checkin_open(uuid)                       to anon, authenticated, service_role;
grant execute on function public.event_checkin_close(uuid)                      to anon, authenticated, service_role;
grant execute on function public.event_checkin_door(uuid)                       to anon, authenticated, service_role;
grant execute on function public.event_checkin_mark(uuid, uuid)                 to anon, authenticated, service_role;
grant execute on function public.event_checkin_unmark(uuid, uuid)               to anon, authenticated, service_role;
grant execute on function public.event_checkin_clear(uuid)                      to anon, authenticated, service_role;
grant execute on function public.event_checkin_self_as(uuid, uuid, text, text)  to anon, authenticated, service_role;
grant execute on function public.event_checkin_state(uuid[])                    to anon, authenticated, service_role;
grant execute on function public.event_checkin_mine()                           to anon, authenticated, service_role;

-- 5. POST-CHECK by catalog ---------------------------------------------------------
do $$
declare
  fns constant text[] := array[
    'public.event_checkin_derive(bytea,uuid,bigint)',
    'public.event_checkin_open(uuid)',
    'public.event_checkin_close(uuid)',
    'public.event_checkin_door(uuid)',
    'public.event_checkin_mark(uuid,uuid)',
    'public.event_checkin_unmark(uuid,uuid)',
    'public.event_checkin_clear(uuid)',
    'public.event_checkin_self_as(uuid,uuid,text,text)',
    'public.event_checkin_state(uuid[])',
    'public.event_checkin_mine()'];
  f text;
  r text;
  p record;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.event_checkins'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.event_checkin_sessions'::regclass) then
    raise exception 'event-checkins post-check: RLS is off on a new table';
  end if;
  -- event_checkins holds two columns and nothing else (no time, no method).
  if (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
       where a.attrelid = 'public.event_checkins'::regclass and a.attnum > 0 and not a.attisdropped)
     is distinct from array['event_id', 'user_id'] then
    raise exception 'event-checkins post-check: event_checkins must hold exactly event_id and user_id';
  end if;
  if (select count(*) from pg_constraint k
       where k.contype = 'f' and k.confdeltype = 'c'
         and k.conname in ('event_checkins_event_id_fkey', 'event_checkins_user_id_fkey', 'event_checkin_sessions_event_id_fkey')) <> 3 then
    raise exception 'event-checkins post-check: the three foreign keys must cascade on delete';
  end if;
  -- Table grants: authenticated reads and deletes event_checkins, nothing else.
  if not has_table_privilege('authenticated', 'public.event_checkins', 'select')
     or not has_table_privilege('authenticated', 'public.event_checkins', 'delete')
     or has_table_privilege('authenticated', 'public.event_checkins', 'insert')
     or has_table_privilege('authenticated', 'public.event_checkins', 'update') then
    raise exception 'event-checkins post-check: authenticated must hold exactly SELECT and DELETE on event_checkins';
  end if;
  foreach r in array array['anon', 'service_role'] loop
    if has_table_privilege(r, 'public.event_checkins', 'select, insert, update, delete') then
      raise exception 'event-checkins post-check: % holds a privilege on event_checkins', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'public.event_checkin_sessions', 'select, insert, update, delete') then
      raise exception 'event-checkins post-check: % holds a privilege on event_checkin_sessions', r;
    end if;
  end loop;
  if (select array_agg(pl.polname::text order by pl.polname) from pg_policy pl
       where pl.polrelid = 'public.event_checkins'::regclass)
     is distinct from array['event_checkins_delete_own', 'event_checkins_select_own_or_manager'] then
    raise exception 'event-checkins post-check: event_checkins must carry exactly its two policies';
  end if;
  if exists (select 1 from pg_policy pl where pl.polrelid = 'public.event_checkin_sessions'::regclass) then
    raise exception 'event-checkins post-check: event_checkin_sessions must carry no policy';
  end if;
  foreach f in array fns loop
    select pr.prosecdef, pr.proconfig into p from pg_proc pr where pr.oid = to_regprocedure(f);
    if not found then
      raise exception 'event-checkins post-check: % is missing', f;
    end if;
    if not p.prosecdef or p.proconfig is distinct from array['search_path=""'] then
      raise exception 'event-checkins post-check: % must be SECURITY DEFINER with search_path ''''', f;
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(r, f, 'execute') then
        raise exception 'event-checkins post-check: % lacks EXECUTE on % (a revoke is a crash button)', r, f;
      end if;
    end loop;
  end loop;
  raise notice 'event-checkins: catalog post-check ok';
end $$;

-- 5b. POST-CHECK BY BEHAVIOUR. Every probe is refused or reads nothing, and the
-- block ends by raising P0C91, which undoes its role switches.
do $$
declare
  stranger constant uuid := gen_random_uuid();
  nowhere  constant uuid := gen_random_uuid();
  got text;
  n integer;
begin
  begin
    -- The code math, on a fixed secret (computed on the local stack, Oct 19).
    select d.code || '/' || d.token into got
      from public.event_checkin_derive(decode(repeat('ab', 32), 'hex'), '00000000-0000-0000-0000-000000000001'::uuid, 0) d;
    if got is distinct from '7710/UVxxReBJ3ewsgZRtrv3ISQ' then
      raise exception 'event-checkins behaviour: derive step 0 gave %', got;
    end if;
    select d.code || '/' || d.token into got
      from public.event_checkin_derive(decode(repeat('ab', 32), 'hex'), '00000000-0000-0000-0000-000000000001'::uuid, 1) d;
    if got is distinct from '5852/qlMyCJLtE-U9y9KYwGZWXQ' then
      raise exception 'event-checkins behaviour: derive step 1 gave %', got;
    end if;

    -- A signed-in student, straight from the database's web interface.
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform 1 from public.event_checkin_sessions;
      raise exception 'event-checkins behaviour: authenticated read event_checkin_sessions';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.event_checkins (event_id, user_id) values (nowhere, stranger);
      raise exception 'event-checkins behaviour: authenticated inserted a check-in';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.event_checkins set user_id = stranger where event_id = nowhere;
      raise exception 'event-checkins behaviour: authenticated could update event_checkins';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.event_checkin_self_as(stranger, nowhere, '1234', null);
      raise exception 'event-checkins behaviour: authenticated called event_checkin_self_as';
    exception when insufficient_privilege then null;
    end;
    if public.event_checkin_open(nowhere) is distinct from 'not_found' then
      raise exception 'event-checkins behaviour: open on a missing event did not answer not_found';
    end if;
    select count(*) into n from public.event_checkin_state(array[nowhere]);
    if n <> 0 then
      raise exception 'event-checkins behaviour: state answered for a missing event';
    end if;
    select count(*) into n from public.event_checkin_mine();
    if n <> 0 then
      raise exception 'event-checkins behaviour: a new account has check-ins';
    end if;

    -- Signed out.
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin
      perform public.event_checkin_open(nowhere);
      raise exception 'event-checkins behaviour: anon called event_checkin_open';
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.event_checkins;
      raise exception 'event-checkins behaviour: anon read event_checkins';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from public.event_checkin_state(array[nowhere]);
    if n <> 0 then
      raise exception 'event-checkins behaviour: anon got check-in state';
    end if;

    -- The server.
    perform set_config('request.jwt.claims', '', true);
    set local role service_role;
    if public.event_checkin_self_as(stranger, nowhere, '1234', null) is distinct from 'not_found' then
      raise exception 'event-checkins behaviour: self_as on a missing event did not answer not_found';
    end if;
    begin
      perform public.event_checkin_self_as(stranger, nowhere, null, null);
      raise exception 'event-checkins behaviour: self_as took neither a code nor a token';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform 1 from public.event_checkin_sessions;
      raise exception 'event-checkins behaviour: service_role read event_checkin_sessions';
    exception when insufficient_privilege then null;
    end;

    raise exception 'event-checkins: behaviour post-check passed' using errcode = 'P0C91';
  exception when sqlstate 'P0C91' then
    raise notice 'event-checkins: behaviour post-check ok (undone)';
  end;
end $$;

notify pgrst, 'reload schema';

commit;
