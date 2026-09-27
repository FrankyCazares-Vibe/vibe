-- S67 wave 4, repair round 1 (review-w4 #7): RSVP works on your home campus,
-- in the database too, not only in the route.
--
-- WHY THIS EXISTS. Since S67 a verified student may LOOK AROUND any campus,
-- but acting there is refused: PUT /api/events/[id]/rsvp answers 403
-- `campus_visiting` when the event's campus is known and isn't the caller's
-- home (src/lib/iu/campus-request.ts, rsvpCampusDecision). The browser holds
-- the anon key, so a signed-in student can skip the route and upsert their own
-- row straight over PostgREST: rsvps_insert_own / rsvps_update_own check only
-- `auth.uid() = user_id AND NOT is_restricted_now()`. Same shape as the
-- documented hidden-club gap (20260922100000, KNOWN GAP), which stays open
-- here: see FOLLOW-UP.
--
-- WHAT THIS FILE DOES
--   1. public.rsvp_on_home_campus(p_event_id): true unless BOTH the event's
--      campus and the caller's home campus are known and differ. The event's
--      campus is its club's `campus_id`, else (an org-less event, or a club
--      with no campus yet) its creator's `users.campus_id`. The same rule as
--      rsvpCampusDecision + eventCampusIdFor, so the route and the database
--      give one answer. Shared Indianapolis is one row, so IU and Purdue Indy
--      students both pass there. A member of the event's club always passes.
--      A missing event or a caller with no users row answers true (the FK and
--      the user_id check refuse those on their own).
--   2. rsvps_insert_own and rsvps_update_own gain `AND
--      public.rsvp_on_home_campus(event_id)` in their WITH CHECK; the old
--      conditions are restated word for word (ALTER POLICY replaces the whole
--      expression). The UPDATE USING clause is untouched.
--   3. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch rsvps_delete_own (taking your name off a list is never
-- gated; the route's DELETE isn't either), rsvps_select_own_or_manager, any
-- row, or any grant beyond the helper's EXECUTE. Nothing is revoked (standing
-- rule, rulings.md: on this Postgres image calling a function without EXECUTE
-- crashes the backend, so the helper is granted and refuses inside).
--
-- WHY THESE SHAPES
--   * SECURITY DEFINER because orgs_select hides a private or hidden club from
--     non-members; under the caller's RLS the club's campus would read as
--     "no club" and fall through to the creator's campus. `set search_path =
--     ''`, so every name is schema-qualified (20260922140000's pattern).
--   * users.campus_id and orgs.campus_id carry the campuses FK, so the ids are
--     canonical; the route's trim/case-fold in TypeScript has nothing to do.
--   * Cost: one events primary-key probe, then at most one orgs and two users
--     primary-key probes per written row. Only the RSVP route writes rsvps
--     (grep of src/, 2026-09-27: every other `from("rsvps")` is a read).
--
-- CLUB MEMBERS (settled 2026-09-27, plan §E "members keep their clubs"): a
-- member of the event's club may RSVP from any home campus (a visitor whose
-- Request to join was approved, or a member who moved home after 45 days).
-- The helper's member arm mirrors rsvpCampusDecision's viewerIsClubMember and
-- the route's org_members read (commit ef18f50). The route must never allow
-- what this policy refuses, or the member gets a 500 instead of an RSVP.
--
-- FOLLOW-UP (unchanged, 20260922100000 KNOWN GAP): the hidden-club check on
-- rsvps_insert_own. It belongs next to this one, through
-- public.org_content_visible(org_id) (20260922140000), in its own file.
--
-- LIVE STATE (read-only MCP, 2026-09-27, at ef18f50): rsvps has exactly four
-- policies: rsvps_delete_own (DELETE, auth.uid() = user_id),
-- rsvps_insert_own (INSERT, WITH CHECK (auth.uid() = user_id) AND (NOT
-- is_restricted_now())), rsvps_select_own_or_manager (SELECT), and
-- rsvps_update_own (UPDATE, USING auth.uid() = user_id, the same WITH CHECK).
-- All permissive; no other write policy. PRE-FLIGHT below still aborts on any
-- difference. Tested on the local database: a non-member's direct insert on
-- another campus's event 403s, a member's 201s, a home upsert 200s. Apply via
-- the management API, then insert the schema_migrations row (version
-- 20260927100000). Order against the deploy doesn't matter: the route already
-- refuses the same writes.
--
-- ROLLBACK (one transaction):
--   BEGIN;
--   ALTER POLICY rsvps_insert_own ON public.rsvps
--     WITH CHECK ((auth.uid() = user_id) AND NOT public.is_restricted_now());
--   ALTER POLICY rsvps_update_own ON public.rsvps
--     USING (auth.uid() = user_id)
--     WITH CHECK ((auth.uid() = user_id) AND NOT public.is_restricted_now());
--   DROP FUNCTION IF EXISTS public.rsvp_on_home_campus(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY holds an ACCESS EXCLUSIVE lock on rsvps until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. The two write policies must read as 20260923090000 left them,
--    no other permissive write policy may OR around them, RLS must be on, and
--    the helper's name must be free. Any miss aborts the whole file.
do $$
declare
  ins text;
  upd_q text;
  upd_c text;
  bad text;
  want_check text := '^\(\(auth\.uid\(\) = user_id\) AND \(NOT (public\.)?is_restricted_now\(\)\)\)$';
begin
  select with_check into ins from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_insert_own';
  select qual, with_check into upd_q, upd_c from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own';
  if ins is null or ins !~ want_check then
    raise exception 'rsvp-home: rsvps_insert_own is not the one this file was written against: %', coalesce(ins, '(missing)');
  end if;
  if upd_q is distinct from '(auth.uid() = user_id)' or upd_c is null or upd_c !~ want_check then
    raise exception 'rsvp-home: rsvps_update_own is not the one this file was written against: % | %',
      coalesce(upd_q, '(missing)'), coalesce(upd_c, '(missing)');
  end if;

  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps'
     and cmd in ('INSERT', 'UPDATE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname not in ('rsvps_insert_own', 'rsvps_update_own');
  if bad is not null then
    raise exception 'rsvp-home: another permissive write policy on rsvps would OR around this one: %', bad;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass) then
    raise exception 'rsvp-home: row level security is off on rsvps';
  end if;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname = 'rsvp_on_home_campus') then
    raise exception 'rsvp-home: public.rsvp_on_home_campus already exists; stop and re-read it';
  end if;
end $$;

-- 1. The helper -------------------------------------------------------------

-- May the caller RSVP to this event from their home campus? Refused only when
-- both campuses are known and differ; anon is refused outright (every policy
-- that calls this is TO authenticated anyway). No users row for the caller or
-- no such event: no row comes back, and coalesce answers true.
create function public.rsvp_on_home_campus(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon'
     and coalesce((
           select ev.campus_id is null
               or h.campus_id is null
               or ev.campus_id = h.campus_id
               -- Members keep their clubs wherever home is.
               or (ev.org_id is not null and exists (
                     select 1 from public.org_members m
                      where m.org_id = ev.org_id and m.user_id = h.id))
             from public.users h
            cross join lateral (
                  select e.org_id, coalesce(o.campus_id, c.campus_id) as campus_id
                    from public.events e
                    left join public.orgs o on o.id = e.org_id
                    left join public.users c on c.id = e.creator_id
                   where e.id = p_event_id) ev
            where h.id = (select auth.uid())),
         true);
$$;

comment on function public.rsvp_on_home_campus(uuid) is
  'S67 policy helper for rsvps_insert_own / rsvps_update_own: false only when the event''s campus (its club''s, else its creator''s) and the caller''s home campus (auth.uid()) are both known and differ and the caller is not a member of the event''s club; false for anon. The same rule as rsvpCampusDecision (with viewerIsClubMember) in src/lib/iu/campus-request.ts.';

-- Standing rule: every role that could reach it may call it; it refuses inside.
grant execute on function public.rsvp_on_home_campus(uuid) to anon, authenticated, service_role;

-- 2. The two write policies --------------------------------------------------
-- The old conditions word for word, plus the campus check on the NEW row.

alter policy rsvps_insert_own on public.rsvps
  with check (
    (auth.uid() = user_id)
    and not public.is_restricted_now()
    and public.rsvp_on_home_campus(event_id)
  );

alter policy rsvps_update_own on public.rsvps
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and not public.is_restricted_now()
    and public.rsvp_on_home_campus(event_id)
  );

-- 3. POST-CHECK. The helper is what section 1 says, and both policies ask it.
do $$
declare
  f record;
  bad text;
begin
  select p.provolatile, p.prosecdef, p.proconfig into f
    from pg_proc p
   where p.oid = 'public.rsvp_on_home_campus(uuid)'::regprocedure;
  if f.provolatile <> 's' or not f.prosecdef
     or f.proconfig is distinct from array['search_path=""'] then
    raise exception 'rsvp-home: rsvp_on_home_campus is not STABLE SECURITY DEFINER with an empty search_path';
  end if;
  if not (has_function_privilege('anon', 'public.rsvp_on_home_campus(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.rsvp_on_home_campus(uuid)', 'execute')
          and has_function_privilege('service_role', 'public.rsvp_on_home_campus(uuid)', 'execute')) then
    raise exception 'rsvp-home: rsvp_on_home_campus must be executable by anon, authenticated and service_role';
  end if;

  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps'
     and policyname in ('rsvps_insert_own', 'rsvps_update_own')
     and (with_check !~ '(public\.)?rsvp_on_home_campus\(event_id\)'
          or with_check !~ 'NOT (public\.)?is_restricted_now\(\)'
          or with_check !~ '\(auth\.uid\(\) = user_id\)');
  if bad is not null then
    raise exception 'rsvp-home: a policy does not read as written: %', bad;
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'rsvps'
         and policyname in ('rsvps_insert_own', 'rsvps_update_own')) <> 2 then
    raise exception 'rsvp-home: expected both rsvps write policies';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
