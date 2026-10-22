-- ---------------------------------------------------------------------------
-- 20261025100000_event_visibility.sql
--
-- PLAIN ENGLISH
-- "Members only" club events (Franky, Oct 22, 2026: "Yes, apply that switch:
-- Everyone or Members only"; handoffs/2026-10-22-club-tools-arc/PLAN-2.md,
-- batch E1). Fraternities keep their chats private and some events too. An
-- officer now picks who can see an event: Everyone (as every event is today)
-- or Members only. A members-only event is seen by the club's members (any
-- role) and by Vibe's platform admins, nobody else: not the club's followers,
-- not someone who left the club (even holding an old RSVP), not a signed-out
-- visitor. Only members can RSVP to it or check in at its door, and it can't
-- go on the club's Board as a card (followers read the Board). Every event
-- that exists today stays Everyone. The Privacy Policy says so from Oct 22.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: the tables and columns this file reads
--      are there; the four functions it restates read as on Oct 22 (md5 of
--      prosrc) or already as this file leaves them (a second run); the two
--      rsvps policies read as 20260928110000 left them (or as this file
--      does); no other permissive INSERT/UPDATE policy on rsvps ORs around
--      them; events_select_visible still calls event_visible; the browser
--      roles still can't INSERT or UPDATE events (the routes, with the
--      service role, stay the only writers of the new column); an existing
--      `visibility` column or `event_audience_ok` is exactly this file's.
--   1. public.events.visibility text not null default 'everyone', CHECK
--      events_visibility_check (visibility in ('everyone', 'members')). A
--      constant default: no table rewrite, every event reads 'everyone'.
--   2. event_visible(p_org_id, p_creator_id, p_event_id), restated whole,
--      same signature (events_select_visible, event_rsvp_counts and
--      event_checkin_state pick it up): it reads the event's visibility by
--      p_event_id. 'members': a row in org_members of the event's club for
--      the caller (any role), or users.is_platform_admin; no RSVP arm and no
--      creator arm. 'everyone' (or no such row): the Oct 22 body word for
--      word. Still not anon.
--   3. New event_audience_ok(p_event_id, p_user): may p_user take part in
--      this event (RSVP, self check-in)? True for an Everyone event (or no
--      such event: the foreign keys refuse that row anyway); for a
--      members-only one, only when p_user is a member of its club. Platform
--      admins see these events but don't take part. A browser role may ask
--      only about itself (anon: false), so it can't be used to learn who is
--      in a club; the service role may ask about anyone.
--   4. rsvps_insert_own and rsvps_update_own: their WITH CHECK word for word
--      plus `AND event_audience_ok(event_id, auth.uid())`. The RSVP route's
--      upsert meets both (20260928110000 section 3 explains why). USING
--      stays: anyone can still delete their own RSVP.
--   5. event_checkin_self_as, restated whole: ONE check added after the
--      hidden-club one: not event_audience_ok(event, p_user) -> 'not_found',
--      the answer for an event you can't see. This reverses "anyone at the
--      event" for members-only events only (Franky's call, Oct 22).
--   6. chat_create_event_card, restated whole: ONE check added after "event
--      not found": a members-only event in a Board room raises P0C27. Every
--      other club room is members-only already (can_view_org_channel).
--   7. POST-CHECK: the column, the CHECK, the four bodies' md5s and their
--      settings (SECURITY DEFINER, search_path '', volatility), the policies'
--      text, the grants; then notify pgrst.
--
-- WHAT THE APP DOES (same deploy, batch E1): POST/PATCH /api/events take
-- `visibility` ("everyone" | "members", an enum, never word-filtered); a
-- flip to members-only deletes the event's RSVPs by non-members (service
-- role); the RSVP route answers 404 to a non-member on a members-only event;
-- the follower reads that use the service role (the club space, the Board
-- page, the Board previews, the Event cards' events) leave members-only
-- events and their cards out; the cards route refuses one on the Board
-- (400 event_members_only); every event payload carries `visibility`.
--
-- DOES NOT: touch event_checkin_mine (your own check-in history stays
-- yours), event_checkin_mark (officers mark only people on the RSVP list),
-- org_members_drop_club_access (a removal still drops upcoming RSVPs; a
-- voluntary leave keeps them, and event_visible no longer shows a
-- members-only event through one), event_org_visible, rsvps_select_own_or_
-- manager, rsvps_delete_own, any grant, or any row. Event chats were
-- members-only already (can_view_org_channel's event arm).
--
-- NO GRANT, NO REVOKE on events. authenticated holds table SELECT, so it
-- reads the new column like every other (the chip needs it); it holds no
-- INSERT or UPDATE (20260928110000, 20260928130000), so only the routes
-- write it. EXECUTE on the new helper goes to anon, authenticated and
-- service_role (the standing rule, 20260922090000: never revoke EXECUTE,
-- refuse inside). CREATE OR REPLACE keeps the other three's grants.
--
-- LIVE STATE (LOCAL stack, Oct 22 2026, read-only; schema_migrations ends at
-- 20261024100000): no events.visibility, no event_audience_ok. md5(prosrc):
-- event_visible ca3d34f65cb01af1a826df053d97b384 (= 20260928110000's body),
-- event_checkin_self_as 822bd44939016fe0d4502787c9947574 (=
-- 20261019120000's), chat_create_event_card b9a5a880b4af8e951b938a2d1945e94e
-- (= 20261001110000's; nothing later redefines it), event_org_visible
-- 3e835aea7286e0048959ea491ac103d8. All four SECURITY DEFINER, owner
-- postgres, search_path ''. rsvps_insert_own WITH CHECK and rsvps_update_own
-- WITH CHECK ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND
-- rsvp_on_home_campus(event_id) AND event_org_visible(event_id)); its USING
-- (auth.uid() = user_id). events relacl authenticated=rd, no anon; RLS on,
-- not forced. 19 events, 0 org-less.
--
-- PRE-FLIGHT on PRODUCTION (read-only; catalog, md5 and counts only, never
-- an event's row). Expected answers in brackets; any other answer: STOP and
-- read that body first.
--   1. Not applied yet [f | null]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.events'::regclass
--                     and attname = 'visibility' and not attisdropped),
--            to_regprocedure('public.event_audience_ok(uuid,uuid)');
--   2. The four bodies [the four md5s of LIVE STATE, one per function]:
--     select p.oid::regprocedure, md5(p.prosrc) from pg_proc p
--      where p.oid in ('public.event_visible(uuid,uuid,uuid)'::regprocedure,
--                      'public.event_checkin_self_as(uuid,uuid,text,text)'::regprocedure,
--                      'public.chat_create_event_card(uuid,uuid,uuid,text,text)'::regprocedure,
--                      'public.event_org_visible(uuid)'::regprocedure);
--   3. The rsvps policies [the WITH CHECK of LIVE STATE, twice]:
--     select policyname, cmd, permissive, qual, with_check from pg_policies
--      where schemaname = 'public' and tablename = 'rsvps' order by policyname;
--   4. Who may write events [anon f|f, authenticated f|f]:
--     select r, has_table_privilege(r, 'public.events', 'insert'),
--            has_any_column_privilege(r, 'public.events', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--   5. How many events (every one reads 'everyone' after) [a count]:
--     select count(*), count(*) filter (where org_id is null) from public.events;
--
-- LOCK. ADD COLUMN with a constant default and the CHECK (one scan of a small
-- table) hold ACCESS EXCLUSIVE on events, ALTER POLICY on rsvps, for
-- milliseconds. lock_timeout 5s makes the file fail whole instead of
-- queueing behind a long read; run it again.
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): add column
-- if not exists, the CHECK only when absent, CREATE OR REPLACE, ALTER POLICY,
-- and a PRE-FLIGHT that accepts this file's own md5s and text.
--
-- HOW TO APPLY. Locally, through the unix socket (one builder at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261025100000_event_visibility.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261025100000', 'event_visibility') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes (given Oct 22 for this switch), with the connector's
-- apply_migration (the body between begin and commit), then renames the
-- connector's auto-timestamp row in supabase_migrations.schema_migrations to
-- '20261025100000' / 'event_visibility'.
--
-- DEPLOY ORDER: THIS FILE FIRST, then the code. The new code selects and
-- writes `visibility`; on a database without it every events read answers
-- 500. The old code on the new database is fine: it never writes the column
-- (every event it makes is 'everyone') and reads nothing it can't see.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The column and its CHECK [visibility | text | t | 'everyone'::text,
--      then events_visibility_check | CHECK ((visibility = ANY
--      (ARRAY['everyone'::text, 'members'::text]))) | t]:
--     select a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.events'::regclass and a.attname = 'visibility' and not a.attisdropped;
--     select conname, pg_get_constraintdef(oid), convalidated from pg_constraint
--      where conrelid = 'public.events'::regclass and conname = 'events_visibility_check';
--   2. The bodies [the NEW md5s below]: PRE-FLIGHT 2's query, plus
--      'public.event_audience_ok(uuid,uuid)'::regprocedure.
--   3. The rsvps policies [each WITH CHECK ends AND event_audience_ok(event_id, auth.uid())]:
--      PRE-FLIGHT 3's query.
--   4. Every event still Everyone [PRE-FLIGHT 5's count | 0]:
--     select count(*), count(*) filter (where visibility <> 'everyone') from public.events;
--   NEW md5(prosrc): event_visible 7ecd5f9632f1e95b6953dac3fc64bf95, event_audience_ok
--   37d0ac63e1beed28c0784bde93605e36, event_checkin_self_as 21fa5eb33ad3171298605625ddaf0aec,
--   chat_create_event_card 96b390e8d425d5c981aaa1067a52b506.
--
-- ROLLBACK (one transaction; run it only after the code that writes and
-- reads `visibility` is rolled back, or every events read answers 500).
-- READ THIS FIRST: dropping the column makes every members-only event
-- visible to everyone signed in, at once. Count them (POST-CHECK 4's second
-- number) and decide with Franky (tell the clubs, or have them cancel those
-- events) before running it.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   ALTER POLICY rsvps_insert_own ON public.rsvps WITH CHECK
--     ((auth.uid() = user_id) AND (NOT public.is_restricted_now())
--      AND public.rsvp_on_home_campus(event_id) AND public.event_org_visible(event_id));
--   ALTER POLICY rsvps_update_own ON public.rsvps WITH CHECK
--     ((auth.uid() = user_id) AND (NOT public.is_restricted_now())
--      AND public.rsvp_on_home_campus(event_id) AND public.event_org_visible(event_id));
--   -- then the three functions EXACTLY as 20260928110000 (event_visible,
--   -- section 2), 20261019120000 (event_checkin_self_as, section 3h) and
--   -- 20261001110000 (chat_create_event_card, section 4.1) define them, each
--   -- as CREATE OR REPLACE FUNCTION with that file's body and settings
--   -- (back to md5s ca3d34f6..., 822bd449..., b9a5a880...), then:
--   DROP FUNCTION IF EXISTS public.event_audience_ok(uuid, uuid);
--   ALTER TABLE public.events DROP COLUMN IF EXISTS visibility;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261025100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   (Dropping the column drops its CHECK. The functions' comments keep this
--   file's wording, which is harmless. The rehearsal ran exactly this, with
--   the three bodies copied from those files, and got the old md5s.)
--
-- REHEARSED on the local stack on Oct 22, 2026 (batch E1): PRE-FLIGHT 1-5
-- [f | null; the four LIVE STATE md5s; both WITH CHECKs as LIVE STATE;
-- anon f|f, authenticated f|f; 19 | 0]. Applied: the first try stopped at its
-- own POST-CHECK (a boolean format slip in the check, fixed) and changed
-- nothing; then pre-flight ok (not applied yet), post-check ok; the
-- schema_migrations row; POST-CHECK 1-4 [as written | the NEW md5s | both end
-- in event_audience_ok | 19, 0]. Applied again: pre-flight ok (applied
-- before), the column skipped, post-check ok. Probes as the real roles
-- inside BEGIN ... ROLLBACK, on a members-only and an Everyone event of a
-- verified club: a third value 23514; a non-member sees 0 of the
-- members-only event, 1 of the other, no rsvp-count or check-in-state row
-- for it, event_audience_ok about a member false, about itself false (true
-- for the Everyone event); its RSVP, the route's upsert shape and a PATCH
-- of an Everyone RSVP over to it all 42501, the Everyone RSVP fine; a
-- non-member holding an old RSVP sees 0 (no RSVP arm), still reads and
-- deletes their own row; a member sees it, gets its counts and RSVPs; a
-- platform admin who isn't a member sees it, event_audience_ok false; anon
-- false everywhere; service role: audience member t / stranger f, self
-- check-in stranger not_found, member not_open, stranger at the Everyone
-- event not_open; a members-only card on the Board P0C27, in the Lounge a
-- card, an Everyone card on the Board a card; nothing left behind. The
-- ROLLBACK above [the old md5s, policies and PRE-FLIGHT answers, row
-- gone]; then the body without begin/commit as plain statements (one
-- WARNING: SET LOCAL outside a transaction, harmless), POST-CHECK and the
-- probes as before. The local stack keeps it applied, with its row.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  got text;
  bad text;
  old_check constant text := '((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id) AND event_org_visible(event_id))';
  new_check constant text := '((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id) AND event_org_visible(event_id) AND event_audience_ok(event_id, auth.uid()))';
begin
  if to_regclass('public.events') is null or to_regclass('public.rsvps') is null
     or to_regclass('public.orgs') is null or to_regclass('public.users') is null
     or to_regclass('public.org_members') is null or to_regclass('public.channels') is null then
    raise exception 'event-visibility: events, rsvps, orgs, users, org_members or channels is missing';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid = 'public.events'::regclass and not a.attisdropped
        and a.attname in ('id', 'org_id', 'creator_id', 'ends_at')) <> 4
     or (select count(*) from pg_attribute a where a.attrelid = 'public.org_members'::regclass and not a.attisdropped
        and a.attname in ('org_id', 'user_id')) <> 2
     or (select count(*) from pg_attribute a where a.attrelid = 'public.users'::regclass and not a.attisdropped
        and a.attname in ('id', 'is_platform_admin')) <> 2
     or (select count(*) from pg_attribute a where a.attrelid = 'public.channels'::regclass and not a.attisdropped
        and a.attname in ('id', 'org_id', 'kind')) <> 3 then
    raise exception 'event-visibility: a column this file reads is missing (events, org_members, users or channels)';
  end if;

  -- A second run: the column must be the one this file makes.
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.events'::regclass and a.attname = 'visibility' and not a.attisdropped;
  if got is not null and got <> 'text not null default ''everyone''::text' then
    raise exception 'event-visibility: events.visibility already exists as "%"', got;
  end if;

  -- The four bodies this file restates or calls: as on Oct 22, or as this
  -- file leaves them.
  select md5(p.prosrc) into bad from pg_proc p where p.oid = to_regprocedure('public.event_visible(uuid,uuid,uuid)');
  if bad is distinct from 'ca3d34f65cb01af1a826df053d97b384' and bad is distinct from '7ecd5f9632f1e95b6953dac3fc64bf95' then
    raise exception 'event-visibility: event_visible drifted (md5 %); read it first', coalesce(bad, '(missing)');
  end if;
  -- Production's copy (57c8df7d…, read Oct 22) is 20261019120000's body
  -- with four comment lines dropped when it was applied; the code is the
  -- same, so it is accepted too. This file replaces it whole either way.
  select md5(p.prosrc) into bad from pg_proc p where p.oid = to_regprocedure('public.event_checkin_self_as(uuid,uuid,text,text)');
  if bad is distinct from '822bd44939016fe0d4502787c9947574' and bad is distinct from '57c8df7d36e13ea5b9d3cbff0994f055'
     and bad is distinct from '21fa5eb33ad3171298605625ddaf0aec' then
    raise exception 'event-visibility: event_checkin_self_as drifted (md5 %); read it first', coalesce(bad, '(missing)');
  end if;
  select md5(p.prosrc) into bad from pg_proc p where p.oid = to_regprocedure('public.chat_create_event_card(uuid,uuid,uuid,text,text)');
  if bad is distinct from 'b9a5a880b4af8e951b938a2d1945e94e' and bad is distinct from '96b390e8d425d5c981aaa1067a52b506' then
    raise exception 'event-visibility: chat_create_event_card drifted (md5 %); read it first', coalesce(bad, '(missing)');
  end if;
  select md5(p.prosrc) into bad from pg_proc p where p.oid = to_regprocedure('public.event_org_visible(uuid)');
  if bad is distinct from '3e835aea7286e0048959ea491ac103d8' then
    raise exception 'event-visibility: event_org_visible drifted (md5 %); read it first', coalesce(bad, '(missing)');
  end if;
  select md5(p.prosrc) into bad from pg_proc p where p.oid = to_regprocedure('public.event_audience_ok(uuid,uuid)');
  if bad is not null and bad <> '37d0ac63e1beed28c0784bde93605e36' then
    raise exception 'event-visibility: public.event_audience_ok already exists (md5 %); read it first', bad;
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'event_audience_ok'
                and p.oid <> coalesce(to_regprocedure('public.event_audience_ok(uuid,uuid)'), 0::oid)) then
    raise exception 'event-visibility: another public.event_audience_ok overload exists; read it first';
  end if;

  -- The rsvps write policies ("public." stripped: the deparse depends on the
  -- reader's search_path), and nothing permissive ORing around them.
  select replace(with_check, 'public.', '') into got from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_insert_own' and cmd = 'INSERT';
  if got is distinct from old_check and got is distinct from new_check then
    raise exception 'event-visibility: rsvps_insert_own drifted: %', coalesce(got, '(missing)');
  end if;
  select replace(qual, 'public.', ''), replace(with_check, 'public.', '') into bad, got from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own' and cmd = 'UPDATE';
  if bad is distinct from '(auth.uid() = user_id)' then
    raise exception 'event-visibility: rsvps_update_own USING drifted: %', coalesce(bad, '(missing)');
  end if;
  if got is distinct from old_check and got is distinct from new_check then
    raise exception 'event-visibility: rsvps_update_own WITH CHECK drifted: %', coalesce(got, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and permissive = 'PERMISSIVE'
     and ((cmd in ('INSERT', 'ALL') and policyname <> 'rsvps_insert_own')
          or (cmd in ('UPDATE', 'ALL') and policyname <> 'rsvps_update_own'));
  if bad is not null then
    raise exception 'event-visibility: another permissive write policy on rsvps would OR around this file: %', bad;
  end if;

  -- events: read only through event_visible, written only by the routes.
  select replace(qual, 'public.', '') into got from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_select_visible' and cmd = 'SELECT';
  if got is distinct from 'event_visible(org_id, creator_id, id)' then
    raise exception 'event-visibility: events_select_visible drifted: %', coalesce(got, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'events' and permissive = 'PERMISSIVE'
     and cmd in ('SELECT', 'ALL') and policyname <> 'events_select_visible';
  if bad is not null then
    raise exception 'event-visibility: another permissive SELECT policy on events would OR around event_visible: %', bad;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass) then
    raise exception 'event-visibility: row level security is off on events or rsvps';
  end if;
  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    raise exception 'event-visibility: a browser role can write events; the routes must stay the only writers';
  end if;

  raise notice 'event-visibility: pre-flight ok (%)',
    case when to_regprocedure('public.event_audience_ok(uuid,uuid)') is null then 'not applied yet' else 'applied before; running again' end;
end $$;

-- 1. THE COLUMN AND ITS CHECK ----------------------------------------------------
alter table public.events
  add column if not exists visibility text not null default 'everyone';
comment on column public.events.visibility is
  'Who can see the event (Oct 22, 2026; 20261025100000): ''everyone'' (every signed-in account that can see the club''s events) or ''members'' (the club''s members, any role, and platform admins; event_visible). Set by its officers in POST/PATCH /api/events (service role); events_visibility_check.';

-- In a DO block so a second run neither drops nor re-scans anything.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.events'::regclass and conname = 'events_visibility_check') then
    alter table public.events
      add constraint events_visibility_check check (visibility in ('everyone', 'members'));
  end if;
end $$;

-- 2. event_visible: members-only events are their club's members' ------------
-- Restated whole. The else branch is 20260928110000's body word for word.
-- The visibility is read here by id (one primary-key lookup), past RLS: this
-- is SECURITY DEFINER, owned by the table's owner, so the events policy that
-- calls it doesn't recurse. The members arm reads the club off the event row
-- too, never p_org_id, so a caller passing another club's id learns nothing.
create or replace function public.event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon' and (
    case
      when exists (select 1 from public.events v
                    where v.id = p_event_id and v.visibility = 'members') then (
           exists (select 1 from public.events v
                     join public.org_members m on m.org_id = v.org_id
                    where v.id = p_event_id and m.user_id = auth.uid())
        or exists (select 1 from public.users u
                    where u.id = auth.uid() and u.is_platform_admin))
      else (
         (p_org_id is null and coalesce(p_creator_id = auth.uid(), false))
      or (p_org_id is not null and exists (
            select 1 from public.orgs o
             where o.id = p_org_id
               and (o.hidden_at is null
                    or exists (select 1 from public.org_members m
                                where m.org_id = o.id and m.user_id = auth.uid()))))
      or exists (select 1 from public.rsvps r
                  where r.event_id = p_event_id and r.user_id = auth.uid()))
    end);
$$;

comment on function public.event_visible(uuid, uuid, uuid) is
  'events_select_visible, event_rsvp_counts, event_checkin_state: not anon, and for a members-only event (20261025100000) a member of its club or a platform admin, nothing else; for an Everyone event, an org-less event''s creator, or the club is not hidden, or the caller is a member, or the caller RSVP''d.';

grant execute on function public.event_visible(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 3. event_audience_ok: who takes part ---------------------------------------
create or replace function public.event_audience_ok(p_event_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when current_setting('role', true) = 'anon' then false
    -- A browser role asks only about itself: never "is this person in that club?".
    when current_setting('role', true) = 'authenticated'
         and p_user is distinct from (select auth.uid()) then false
    else not exists (
           select 1 from public.events e
            where e.id = p_event_id
              and e.visibility = 'members'
              and not exists (select 1 from public.org_members m
                               where m.org_id = e.org_id and m.user_id = p_user))
  end;
$$;

comment on function public.event_audience_ok(uuid, uuid) is
  'Members only events (20261025100000): may p_user RSVP or check in at this event? True for an Everyone event (or no such event); for a members-only one, only a member of its club (platform admins see it, they don''t take part). anon: false; authenticated: only about itself. Used by rsvps_insert_own, rsvps_update_own and event_checkin_self_as.';

revoke all on function public.event_audience_ok(uuid, uuid) from public;
grant execute on function public.event_audience_ok(uuid, uuid) to anon, authenticated, service_role;

-- 4. RSVPs only from the event's audience -----------------------------------
-- Both WITH CHECKs word for word (20260928110000 section 3), plus the
-- helper. USING stays: an RSVP can always be deleted by its owner.
alter policy rsvps_insert_own on public.rsvps
  with check (
    (auth.uid() = user_id)
    and (not public.is_restricted_now())
    and public.rsvp_on_home_campus(event_id)
    and public.event_org_visible(event_id)
    and public.event_audience_ok(event_id, auth.uid())
  );

alter policy rsvps_update_own on public.rsvps
  with check (
    (auth.uid() = user_id)
    and (not public.is_restricted_now())
    and public.rsvp_on_home_campus(event_id)
    and public.event_org_visible(event_id)
    and public.event_audience_ok(event_id, auth.uid())
  );

-- 5. event_checkin_self_as: members only at a members-only event's door ------
-- Restated whole: 20261019120000's body (section 3h) with ONE check added
-- right after the hidden-club one, and the comment above it amended. Same
-- signature, settings and grants (CREATE OR REPLACE keeps them). Under the
-- service role auth.uid() is null, so the helper is asked about p_user.
create or replace function public.event_checkin_self_as(p_user uuid, p_event_id uuid, p_code text, p_token text)
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
  -- event"); RSVP stays home-campus only. Don't add one. A members-only
  -- event (Oct 22, 2026) is the one exception: only its club's members.
  if v_org is not null and v_hidden is not null then
    return 'not_found';
  end if;
  if not public.event_audience_ok(p_event_id, p_user) then
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
  'Event check-in (20261019120000; members-only events 20261025100000): SERVICE ROLE ONLY (anon and authenticated get 42501; the route''s eventCheckin limiter bounds guessing). Exactly one of p_code (4 digits, this step or the one before) or p_token (22 chars, this step or the three before), else 22023. A members-only event answers not_found to anyone who is not a member of its club. Answers checked_in | already | wrong_code | link_expired | not_open | outside_window | not_found | restricted | terms_required.';

-- 6. chat_create_event_card: no members-only event on the Board ---------------
-- Restated whole: 20261001110000's body (section 4.1) with ONE check added
-- right after "event not found". Followers read the Board; every other club
-- room is members-only already, so a members-only event may go there.
create or replace function public.chat_create_event_card(
  p_channel uuid, p_user uuid, p_event uuid, p_note text, p_content text
) returns uuid
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_msg     uuid;
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_content text := btrim(coalesce(p_content, ''));
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_channel is null or p_user is null or p_event is null
     or (v_note is not null and char_length(v_note) > 200)
     or char_length(v_content) not between 1 and 300 then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  if not coalesce(public.can_post_org_channel(p_channel, p_user, null), false) then
    raise exception 'chat-cards: not allowed to post here' using errcode = 'P0C21';
  end if;
  select c.org_id into v_org from public.channels c where c.id = p_channel;
  if v_org is null or not exists (
       select 1 from public.events e
        where e.id = p_event and e.org_id = v_org and e.ends_at > now()) then
    raise exception 'chat-cards: event not found' using errcode = 'P0C23';
  end if;
  if exists (select 1 from public.channels c, public.events e
              where c.id = p_channel and c.kind = 'board'
                and e.id = p_event and e.visibility = 'members') then
    raise exception 'chat-cards: a members-only event can''t go on the Board' using errcode = 'P0C27';
  end if;
  insert into public.messages (channel_id, user_id, content, kind, card_event_id)
  values (p_channel, p_user, v_content, 'event_card', p_event) returning id into v_msg;
  insert into public.chat_event_cards (message_id, note) values (v_msg, v_note);
  return v_msg;
end $$;

comment on function public.chat_create_event_card(uuid,uuid,uuid,text,text) is
  'Writes an Event card (wave-2 contract 3.4): the messages row (kind event_card, card_event_id = the event, content = the fallback text) and its chat_event_cards row with the note, as the table owner. Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C21 (cannot post here), P0C23 (the event is missing, belongs to another club, has no club, or has ended), P0C27 (a members-only event in a Board room, 20261025100000). Does not check consent, publish or restriction: the route does.';

-- 7. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got text;
  bad text := '';
  r record;
  new_check constant text := '((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id) AND event_org_visible(event_id) AND event_audience_ok(event_id, auth.uid()))';
begin
  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.events'::regclass and a.attname = 'visibility' and not a.attisdropped;
  if got is distinct from 'text not null default ''everyone''::text' then
    bad := bad || format(' the column reads "%s";', coalesce(got, '(missing)'));
  end if;

  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.events'::regclass and c.conname = 'events_visibility_check';
  if got is distinct from 'CHECK ((visibility = ANY (ARRAY[''everyone''::text, ''members''::text])))' then
    bad := bad || format(' events_visibility_check reads "%s";', coalesce(got, '(missing)'));
  end if;

  -- The four bodies as this file leaves them, each SECURITY DEFINER with
  -- search_path '' and its volatility.
  for r in
    select * from (values
      ('public.event_visible(uuid,uuid,uuid)',                   '7ecd5f9632f1e95b6953dac3fc64bf95', 's'),
      ('public.event_audience_ok(uuid,uuid)',                    '37d0ac63e1beed28c0784bde93605e36',   's'),
      ('public.event_checkin_self_as(uuid,uuid,text,text)',      '21fa5eb33ad3171298605625ddaf0aec',       'v'),
      ('public.chat_create_event_card(uuid,uuid,uuid,text,text)', '96b390e8d425d5c981aaa1067a52b506',    'v')
    ) as t (sig, want_md5, want_vol)
  loop
    select format('%s|%s|%s|%s', md5(p.prosrc), p.prosecdef, p.provolatile,
                  'search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
      into got
      from pg_proc p where p.oid = to_regprocedure(r.sig);
    if got is distinct from format('%s|t|%s|t', r.want_md5, r.want_vol) then
      bad := bad || format(' %s reads "%s";', r.sig, coalesce(got, '(missing)'));
    end if;
  end loop;

  -- The new helper: no PUBLIC grant; EXECUTE for the three API roles.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.event_audience_ok(uuid,uuid)') and a.grantee = 0)
     or not has_function_privilege('anon', 'public.event_audience_ok(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.event_audience_ok(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.event_audience_ok(uuid,uuid)', 'EXECUTE') then
    bad := bad || ' event_audience_ok grants are not revoke-public + anon, authenticated, service_role;';
  end if;

  select replace(with_check, 'public.', '') into got from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_insert_own' and cmd = 'INSERT';
  if got is distinct from new_check then
    bad := bad || format(' rsvps_insert_own reads "%s";', coalesce(got, '(missing)'));
  end if;
  select replace(with_check, 'public.', '') into got from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own' and cmd = 'UPDATE'
     and replace(qual, 'public.', '') = '(auth.uid() = user_id)';
  if got is distinct from new_check then
    bad := bad || format(' rsvps_update_own reads "%s";', coalesce(got, '(missing, or its USING changed)'));
  end if;

  if has_table_privilege('anon', 'public.events', 'INSERT')
     or has_table_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.events', 'UPDATE') then
    bad := bad || ' a browser role can write events;';
  end if;

  if bad <> '' then
    raise exception 'event-visibility post-check failed:%', bad;
  end if;
  raise notice 'event-visibility: post-check ok';
end $$;

-- 8. -------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
