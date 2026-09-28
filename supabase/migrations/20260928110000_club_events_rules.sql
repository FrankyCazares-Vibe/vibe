-- Security wave 2, batch A4 (file 1 of 2): club events follow the club's
-- CURRENT officers, and the club-event rules live in the database.
--
-- WHY THIS EXISTS (handoffs/2026-09-27-security-lenses-authz-dataexp.md)
--   #12 A demoted or removed officer keeps control of the events they made:
--       can_manage_event() and the events UPDATE/DELETE policies follow the
--       row's creator_id, so an ex-admin still reads the attendee list
--       (names, majors, years), can delete the club's event, or UPDATE it with
--       org_id = null (passes events_update_creator's WITH CHECK) and re-time
--       it. Current officers who didn't make an event can't delete it.
--   #11 The events INSERT policy never asks that the club is verified and not
--       hidden, never checks lengths, a start date or a length of time. An
--       event starting now and ending in 2099 sits at the top of the campus
--       Events tab forever (the list is `ends_at >= now()` by `starts_at`).
--       File 2 (20260928130000) closes INSERT for good; this file adds what
--       binds every writer, and tightens INSERT for the window before file 2.
--   Low: a non-member holding a hidden club's event id can RSVP straight over
--       PostgREST (rsvps_insert_own has no visibility check; FOLLOW-UP noted
--       in 20260927100000), and event_visible's RSVP arm then shows them the
--       event. event_visible also lets the creator see a hidden club's event
--       forever, after they leave.
--
-- WHAT THIS FILE DOES
--   1. can_manage_event(p_event_id): a CLUB event is managed only by the
--      club's current owner/admin; an org-less event by its creator. Same
--      signature and return type (grants and rsvps_select_own_or_manager
--      survive CREATE OR REPLACE); search_path '' now.
--   2. event_visible(p_org_id, p_creator_id, p_event_id): the "creator always
--      sees it" arm applies to org-less events only. Club arm (not hidden, or
--      member) and own-RSVP arm unchanged. search_path '' now.
--   3. New event_org_visible(p_event_id) = org_content_visible(the event's
--      org), read with SECURITY DEFINER; rsvps_insert_own AND rsvps_update_own
--      both gain `AND public.event_org_visible(event_id)` in their WITH CHECK
--      (old clauses word for word; the UPDATE USING is untouched). The RSVP
--      route's upsert is INSERT ... ON CONFLICT DO UPDATE: Postgres applies
--      the INSERT WITH CHECK to it, and the UPDATE WITH CHECK on a conflict,
--      so this covers the route's write too. The UPDATE half closes the pivot:
--      authenticated holds table-level UPDATE on rsvps (event_id included),
--      so without it a non-member could PATCH their RSVP to a visible event
--      over to a hidden club's event and then read it through event_visible's
--      RSVP arm (calendar, ICS, upcoming events, Otto "Heads up"). Not a
--      column revoke on rsvps.event_id: the route's merge-duplicates upsert
--      SETs event_id and user_id, and would 500.
--   4. events_delete_creator is rewritten and renamed events_delete_manager:
--      org-less -> creator; club -> a current owner/admin who is not
--      restricted. The DELETE grant stays (no app route deletes today).
--   5. REVOKE UPDATE (id, org_id, creator_id, starts_at, ends_at, created_at)
--      ON events FROM authenticated (the only UPDATE grants; title,
--      description and location lost theirs in 20260923090000 section 15),
--      and DROP POLICY events_update_creator. Nothing in src/ or public/html
--      updates events (grep 2026-09-27); a future officer edit route writes
--      with the service role after the word filter.
--   6. events_insert_authenticated: old clauses word for word, plus org_id is
--      not null, the club is verified and not hidden, and starts_at is no more
--      than 10 minutes in the past (the route allows 5; the extra 5 absorb
--      clock skew between the app and the database, so the route never 500s).
--      File 2 drops this policy with the INSERT grant.
--   7. CHECKs that bind every writer, the service role too: title 1..120
--      characters and not blank, description <= 2000, location <= 200,
--      ends_at - starts_at <= 14 days. The route's caps are the same numbers
--      (src/lib/events/manage.ts; manage.test.ts reads this file to prove it).
--      JS `.length` counts UTF-16 units >= char_length, so no route-accepted
--      value can trip a CHECK.
--   8. events_org_id_fkey ON DELETE SET NULL -> ON DELETE CASCADE: deleting a
--      club deletes its events (and, by rsvps_event_id_fkey, their RSVPs),
--      like its channels, members and invites. Before, the events turned into
--      personal events of their creators and an ex-officer creator got the
--      attendee list back through the org-less arm.
--
-- WHY THE PAST-START RULE IS NOT A CHECK: now() is not immutable, 12 of the
--   13 live events already started (a CHECK fails to add, or NOT VALID blocks
--   every later write to a started event), and scripts/local-seed.mjs inserts
--   a past event with the service role for history views (a trigger binding
--   every role would break the seed). So it rides on the INSERT policy until
--   file 2, and after file 2 the route (the only writer) enforces it.
--
-- DOES NOT: touch events SELECT (events_select_visible still calls
--   event_visible), rsvps_update_own's USING or rsvps_delete_own (people keep
--   their RSVPs, flip their status on events they may see, and can always
--   cancel), rsvps_select_own_or_manager's text (it follows
--   can_manage_event), any row, or any EXECUTE grant (never revoked: on this
--   image calling a function without EXECUTE crashes the backend). It does not
--   revoke INSERT (file 2, after the deploy). org_content_visible lets members
--   and platform admins of a hidden club through; the RSVP route refuses them
--   (404). The database is looser than the route there, so no 500.
--
-- LIVE STATE (read-only MCP, 2026-09-27, production at 24dac9f; last applied
--   migration 20260927142000). Local DB identical: md5 over the events+rsvps
--   policies 119cd85e0dfb492ebdfd81cfa9c42a18 on both.
--   events policies: events_delete_creator USING ((auth.uid() = creator_id)
--   AND ((org_id IS NULL) OR (NOT is_restricted_now()))); events_insert_
--   authenticated WITH CHECK ((auth.uid() = creator_id) AND
--   has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR
--   (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--   'admin'::text])))); events_select_visible USING event_visible(org_id,
--   creator_id, id); events_update_creator USING (auth.uid() = creator_id)
--   WITH CHECK ((auth.uid() = creator_id) AND can_publish_now() AND ((org_id
--   IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::
--   text, 'admin'::text])))). rsvps_insert_own WITH CHECK ((auth.uid() =
--   user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id)).
--   rsvps_update_own USING (auth.uid() = user_id) WITH CHECK the same three
--   clauses. rsvps relacl authenticated=arwd (table-level UPDATE).
--   Grants: events relacl authenticated=ard (no table-level UPDATE, no anon);
--   column UPDATE for authenticated on id, org_id, creator_id, starts_at,
--   ends_at, created_at. can_manage_event and event_visible: SECURITY
--   DEFINER, STABLE, search_path=public, EXECUTE anon/authenticated/
--   service_role; md5(prosrc) 610960856cc50cc97c8a51e6e09d3fe2 and
--   43f184a0e57cbb7ddd5eaf9833fa6e27. event_org_visible does not exist.
--   Callers: event_visible <- events_select_visible, event_rsvp_counts;
--   can_manage_event <- rsvps_select_own_or_manager only.
--   Constraints: events_check (ends_at >= starts_at), events_creator_id_fkey
--   ON DELETE CASCADE, events_org_id_fkey ON DELETE SET NULL. No triggers.
--   COUNTS: 13 events, 0 org-less, 0 on unverified clubs, 3 on hidden (test)
--   clubs, 12 already started, 0 over any new CHECK (max length 2h), 0 whose
--   creator is no longer an owner/admin; 7 rsvps, 0 by non-members on
--   hidden-club events. No _cleanup.sql needed.
--
-- APPLY ORDER vs THE DEPLOY: BEFORE the deploy (either order works). The old
--   route already refuses everything this file refuses except one thing: an
--   event longer than 14 days gets a 500 from the OLD route (a 400 from the
--   new one) until the deploy is live. 0 such events have ever been made.
--   Apply via the management API, then the schema_migrations row
--   (20260928110000). File 2 (20260928130000) goes AFTER the deploy.
--
-- ROLLBACK (one transaction; if file 2 is applied, roll IT back first):
--   BEGIN;
--   ALTER TABLE public.events DROP CONSTRAINT events_org_id_fkey,
--     ADD CONSTRAINT events_org_id_fkey FOREIGN KEY (org_id)
--     REFERENCES public.orgs(id) ON DELETE SET NULL;
--   ALTER TABLE public.events DROP CONSTRAINT events_title_length,
--     DROP CONSTRAINT events_description_length,
--     DROP CONSTRAINT events_location_length,
--     DROP CONSTRAINT events_max_duration;
--   ALTER POLICY events_insert_authenticated ON public.events WITH CHECK
--     ((auth.uid() = creator_id) AND has_recorded_consent() AND can_publish_now()
--      AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY
--      (ARRAY['owner'::text, 'admin'::text]))));
--   GRANT UPDATE (id, org_id, creator_id, starts_at, ends_at, created_at)
--     ON public.events TO authenticated;
--   CREATE POLICY events_update_creator ON public.events FOR UPDATE
--     TO authenticated USING (auth.uid() = creator_id)
--     WITH CHECK ((auth.uid() = creator_id) AND can_publish_now()
--      AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY
--      (ARRAY['owner'::text, 'admin'::text]))));
--   ALTER POLICY events_delete_manager ON public.events
--     RENAME TO events_delete_creator;
--   ALTER POLICY events_delete_creator ON public.events USING
--     ((auth.uid() = creator_id) AND ((org_id IS NULL) OR (NOT is_restricted_now())));
--   ALTER POLICY rsvps_insert_own ON public.rsvps WITH CHECK
--     ((auth.uid() = user_id) AND (NOT is_restricted_now())
--      AND rsvp_on_home_campus(event_id));
--   ALTER POLICY rsvps_update_own ON public.rsvps WITH CHECK
--     ((auth.uid() = user_id) AND (NOT is_restricted_now())
--      AND rsvp_on_home_campus(event_id));
--   DROP FUNCTION IF EXISTS public.event_org_visible(uuid);
--   -- then the two helpers exactly as they were:
--   CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     select exists (
--       select 1 from public.events e
--        where e.id = p_event_id
--          and (e.creator_id = auth.uid()
--               or (e.org_id is not null and exists (
--                     select 1 from public.org_members m
--                      where m.org_id = e.org_id and m.user_id = auth.uid()
--                        and m.role in ('owner', 'admin')))));
--   $function$;
--   CREATE OR REPLACE FUNCTION public.event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     select current_setting('role', true) is distinct from 'anon' and (
--            coalesce(p_creator_id = auth.uid(), false)
--         or (p_org_id is not null and exists (
--               select 1 from public.orgs o
--                where o.id = p_org_id
--                  and (o.hidden_at is null
--                       or exists (select 1 from public.org_members m
--                                   where m.org_id = o.id and m.user_id = auth.uid()))))
--         or exists (select 1 from public.rsvps r
--                     where r.event_id = p_event_id and r.user_id = auth.uid()));
--   $function$;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928110000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- LOCAL PROBES (2026-09-27, local DB, each inside BEGIN ... ROLLBACK as the
--   real role; full log in handoffs/wave-plan-sec2/notes-A4.md). Before this
--   file every one of these was open (same probes against the ROLLBACK state):
--   * emery_admin demoted to member: can_manage_event(her event) false, sees
--     0 rsvps on it, DELETE 0 rows, UPDATE org_id = null / starts_at 42501.
--   * avery (owner, not the creator): manages it, sees its rsvps, deletes it
--     (1 row, rsvps cascade); back-dating it 42501. A suspended owner: 0 rows.
--   * blake (non-member) on a hidden club's event: direct RSVP and the
--     route's upsert shape 42501; can't see it. The creator who isn't a
--     member can't see it either. avery (member) may RSVP (route 404s).
--   * (2026-09-28) blake PATCHes his RSVP to a visible event over to a hidden
--     club's event: before, UPDATE 1 and the event showed up; now 403 42501
--     and it stays unseen. His status PATCH (204), the route's upsert on a
--     visible event, and avery's upsert + status flip on the hidden event
--     still work. If a club is hidden after someone RSVP'd, they can no
--     longer edit that RSVP (the PUT route 404s first) but can delete it.
--   * file 1 only: blake's insert on his unverified club 42501; avery's
--     back-dated or org-less insert 42501; ending in 2099 23514; avery's
--     normal insert (the old route's) still works. Service role: 121-char
--     title 23514, 14 days + 1 s 23514, a past event (the seed's) allowed.
--   * deleting a club deletes its events and their RSVPs.
--   The ROLLBACK above restores the policies and helpers byte for byte
--   (same md5s as LIVE STATE) and this file re-applies over it.
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY / ALTER TABLE hold ACCESS EXCLUSIVE locks on events and rsvps
-- (and the FK swap a SHARE ROW EXCLUSIVE on orgs) until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. Everything this file rewrites must read as LIVE STATE says,
--    no other permissive policy may OR around it, and no existing row may
--    fail a new CHECK. Any miss aborts the whole file.
do $$
declare
  pol text;
  bad text;
  n bigint;
  expect_ins text := '((auth.uid() = creator_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text]))))';
begin
  -- The four events policies and rsvps_insert_own, text for text ("public."
  -- stripped, since the deparse depends on the reader's search_path).
  select replace(qual, 'public.', '') into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_delete_creator' and cmd = 'DELETE';
  if pol is distinct from '((auth.uid() = creator_id) AND ((org_id IS NULL) OR (NOT is_restricted_now())))' then
    raise exception 'a4-events: events_delete_creator drifted: %', coalesce(pol, '(missing)');
  end if;
  select replace(with_check, 'public.', '') into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_insert_authenticated' and cmd = 'INSERT';
  if pol is distinct from expect_ins then
    raise exception 'a4-events: events_insert_authenticated drifted: %', coalesce(pol, '(missing)');
  end if;
  select replace(qual, 'public.', '') into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_update_creator' and cmd = 'UPDATE';
  if pol is distinct from '(auth.uid() = creator_id)' then
    raise exception 'a4-events: events_update_creator drifted: %', coalesce(pol, '(missing)');
  end if;
  select replace(qual, 'public.', '') into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_select_visible' and cmd = 'SELECT';
  if pol is distinct from 'event_visible(org_id, creator_id, id)' then
    raise exception 'a4-events: events_select_visible drifted: %', coalesce(pol, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'events'
     and policyname not in ('events_delete_creator', 'events_insert_authenticated',
                            'events_update_creator', 'events_select_visible');
  if bad is not null then
    raise exception 'a4-events: unexpected policy on events: %', bad;
  end if;
  select replace(with_check, 'public.', '') into pol from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_insert_own' and cmd = 'INSERT';
  if pol is distinct from '((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id))' then
    raise exception 'a4-events: rsvps_insert_own drifted: %', coalesce(pol, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and permissive = 'PERMISSIVE'
     and cmd in ('INSERT', 'ALL') and policyname <> 'rsvps_insert_own';
  if bad is not null then
    raise exception 'a4-events: another permissive INSERT policy on rsvps would OR around this one: %', bad;
  end if;
  select replace(qual, 'public.', ''), replace(with_check, 'public.', '') into pol, bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own' and cmd = 'UPDATE';
  if pol is distinct from '(auth.uid() = user_id)' then
    raise exception 'a4-events: rsvps_update_own USING drifted: %', coalesce(pol, '(missing)');
  end if;
  if bad is distinct from '((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id))' then
    raise exception 'a4-events: rsvps_update_own WITH CHECK drifted: %', coalesce(bad, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'rsvps' and permissive = 'PERMISSIVE'
     and cmd in ('UPDATE', 'ALL') and policyname <> 'rsvps_update_own';
  if bad is not null then
    raise exception 'a4-events: another permissive UPDATE policy on rsvps would OR around this one: %', bad;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass) then
    raise exception 'a4-events: row level security is off on events or rsvps';
  end if;

  -- The two helpers are the ones this file was written against.
  if (select md5(prosrc) from pg_proc where oid = 'public.can_manage_event(uuid)'::regprocedure)
       is distinct from '610960856cc50cc97c8a51e6e09d3fe2' then
    raise exception 'a4-events: can_manage_event body drifted; re-read it';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.event_visible(uuid,uuid,uuid)'::regprocedure)
       is distinct from '43f184a0e57cbb7ddd5eaf9833fa6e27' then
    raise exception 'a4-events: event_visible body drifted; re-read it';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'event_org_visible') then
    raise exception 'a4-events: public.event_org_visible already exists; stop and re-read it';
  end if;

  -- Grants: UPDATE only at column level (so the column revoke is real), and
  -- exactly the six columns.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.events'::regclass and a.privilege_type = 'UPDATE'
                and a.grantee in (select oid from pg_roles where rolname in ('authenticated', 'anon'))) then
    raise exception 'a4-events: a table-level UPDATE grant on events exists; a column revoke would not close it';
  end if;
  select string_agg(attname, ',' order by attnum) into pol from pg_attribute
   where attrelid = 'public.events'::regclass and attnum > 0 and not attisdropped
     and has_column_privilege('authenticated', 'public.events', attname, 'UPDATE');
  if pol is distinct from 'id,org_id,creator_id,starts_at,ends_at,created_at' then
    raise exception 'a4-events: authenticated UPDATE columns on events drifted: %', coalesce(pol, '(none)');
  end if;

  -- Constraints: the FK is SET NULL today, and the new names are free.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.events'::regclass and conname = 'events_org_id_fkey'
                    and contype = 'f' and confrelid = 'public.orgs'::regclass and confdeltype = 'n') then
    raise exception 'a4-events: events_org_id_fkey is not the ON DELETE SET NULL key this file replaces';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
              and conname in ('events_title_length', 'events_description_length',
                              'events_location_length', 'events_max_duration')) then
    raise exception 'a4-events: a CHECK name this file adds is already taken';
  end if;

  -- COUNTS: rows that would fail a new CHECK (live: 0 of each).
  select count(*) into n from public.events
   where not (char_length(btrim(title)) >= 1 and char_length(title) <= 120)
      or char_length(description) > 2000 or char_length(location) > 200
      or (ends_at - starts_at) > interval '14 days';
  if n > 0 then
    raise exception 'a4-events: % existing event(s) would fail a new CHECK; clean them up first', n;
  end if;
end $$;

-- 1. can_manage_event: a club event follows its club's CURRENT officers ------
-- Same signature and return type, so rsvps_select_own_or_manager and the
-- EXECUTE grants carry over. The creator arm applies only to org-less events.
-- Owner and admin only: mods moderate chat, not content (product call 8).
create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and (select auth.uid()) is not null
       and case
             when e.org_id is null then e.creator_id = (select auth.uid())
             else exists (select 1
                            from public.org_members m
                           where m.org_id = e.org_id
                             and m.user_id = (select auth.uid())
                             and m.role in ('owner', 'admin'))
           end);
$$;

comment on function public.can_manage_event(uuid) is
  'S67 sec wave 2 (A4): may the caller manage this event (attendee list via rsvps_select_own_or_manager)? A club event: only a CURRENT owner/admin of its club, never the creator as such. An org-less event: its creator. Mirrors viewerCanManage in src/lib/events/manage.ts.';

grant execute on function public.can_manage_event(uuid) to anon, authenticated, service_role;

-- 2. event_visible: no creator bypass for club events -------------------------
-- Before: the creator always saw the event, so an officer who left a hidden
-- club kept reading its events. Now the creator arm covers org-less events
-- only; a club event is visible when the club isn't hidden or the caller is a
-- member (unchanged), or the caller holds an RSVP (unchanged).
create or replace function public.event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon' and (
         (p_org_id is null and coalesce(p_creator_id = auth.uid(), false))
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
  'events_select_visible + event_rsvp_counts: not anon, and (an org-less event''s creator, or the club is not hidden, or the caller is a member, or the caller RSVP''d). S67 sec wave 2 (A4) dropped the creator arm for club events.';

grant execute on function public.event_visible(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 3. RSVPs only to events whose club the caller may see ------------------------
-- SECURITY DEFINER on purpose: an inline `(select org_id from events ...)` in
-- the policy runs under the caller's RLS, comes back NULL for a hidden club's
-- event, and org_content_visible(NULL) is TRUE, so the gap would stay open.
-- No such event: org_content_visible(NULL) is true and the FK refuses the row.
create function public.event_org_visible(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_content_visible(
           (select e.org_id from public.events e where e.id = p_event_id));
$$;

comment on function public.event_org_visible(uuid) is
  'S67 sec wave 2 (A4) policy helper for rsvps_insert_own: org_content_visible() of the event''s club, read past the caller''s RLS. True for an org-less event; false for anon and for a non-member of a hidden club.';

grant execute on function public.event_org_visible(uuid) to anon, authenticated, service_role;

alter policy rsvps_insert_own on public.rsvps
  with check (
    (auth.uid() = user_id)
    and (not public.is_restricted_now())
    and public.rsvp_on_home_campus(event_id)
    and public.event_org_visible(event_id)
  );

-- The same clause on UPDATE, so an RSVP can't be moved onto a hidden club's
-- event (PATCH event_id). USING stays (auth.uid() = user_id): an RSVP whose
-- club was hidden later can still be deleted, just not re-pointed or edited.
alter policy rsvps_update_own on public.rsvps
  with check (
    (auth.uid() = user_id)
    and (not public.is_restricted_now())
    and public.rsvp_on_home_campus(event_id)
    and public.event_org_visible(event_id)
  );

-- 4. DELETE follows the current officers --------------------------------------
-- Rewritten, not ANDed onto: the old USING was creator-only. A restricted
-- officer can't delete a club's event; an org-less event's creator always can
-- (as before: people may always remove their own things).
alter policy events_delete_creator on public.events
  using (
    ((org_id is null) and (auth.uid() = creator_id))
    or ((org_id is not null)
        and (not public.is_restricted_now())
        and (public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
  );
alter policy events_delete_creator on public.events rename to events_delete_manager;

-- 5. No direct UPDATE of events at all ----------------------------------------
-- These six column grants were the only UPDATE path. org_id = null was the
-- "detach" escape (#12), starts_at/ends_at the re-time and back-date. The
-- policy goes too, so a later re-grant fails closed (RLS on, no policy).
revoke update (id, org_id, creator_id, starts_at, ends_at, created_at)
  on public.events from authenticated;
drop policy events_update_creator on public.events;

-- 6. INSERT: verified, non-hidden clubs only, and no past start ---------------
-- The old clauses word for word, then the new ones. The caller must be an
-- owner/admin (the old clause), so orgs_select shows them the club row; the
-- exists() below reads it under their own RLS. File 2 drops this policy.
alter policy events_insert_authenticated on public.events
  with check (
    (auth.uid() = creator_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
    and ((org_id is null) or (public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
    and (org_id is not null)
    and exists (select 1 from public.orgs o
                 where o.id = events.org_id and o.verified and o.hidden_at is null)
    and (starts_at >= (now() - interval '10 minutes'))
  );

-- 7. CHECKs every writer obeys (the service role too) -------------------------
-- Same numbers as src/lib/events/manage.ts (manage.test.ts reads this file).
alter table public.events
  add constraint events_title_length
    check (char_length(btrim(title)) >= 1 and char_length(title) <= 120),
  add constraint events_description_length
    check (char_length(description) <= 2000),
  add constraint events_location_length
    check (char_length(location) <= 200),
  add constraint events_max_duration
    check ((ends_at - starts_at) <= interval '14 days');

-- 8. Deleting a club deletes its events (and their RSVPs) ---------------------
alter table public.events
  drop constraint events_org_id_fkey,
  add constraint events_org_id_fkey
    foreign key (org_id) references public.orgs(id) on delete cascade;

-- 9. POST-CHECK: by catalog, then by behaviour --------------------------------
do $$
declare
  f text;
  pol text;
  bad text;
  ev record;
begin
  -- Helpers: STABLE SECURITY DEFINER, empty search_path, boolean, callable by
  -- all three roles (the standing rule: grant, and refuse inside).
  foreach f in array array['public.can_manage_event(uuid)', 'public.event_visible(uuid,uuid,uuid)',
                           'public.event_org_visible(uuid)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.provolatile = 's' and p.prosecdef
                      and p.proconfig = array['search_path=""'] and p.prorettype = 'boolean'::regtype) then
      raise exception 'a4-events: % is not STABLE SECURITY DEFINER boolean with an empty search_path', f;
    end if;
    if not (has_function_privilege('anon', f, 'execute')
            and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      raise exception 'a4-events: % must be executable by anon, authenticated and service_role', f;
    end if;
  end loop;

  -- Policies: exactly these three on events, each saying what it should.
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into pol from pg_policies
   where schemaname = 'public' and tablename = 'events';
  if pol is distinct from 'events_delete_manager:DELETE,events_insert_authenticated:INSERT,events_select_visible:SELECT' then
    raise exception 'a4-events: events policies are not the expected three: %', pol;
  end if;
  select qual into pol from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_delete_manager';
  if pol !~ 'org_member_role\(org_id, auth\.uid\(\)\)' or pol !~ 'is_restricted_now' or pol !~ '\(org_id IS NULL\) AND \(auth\.uid\(\) = creator_id\)' then
    raise exception 'a4-events: events_delete_manager does not read as written: %', pol;
  end if;
  select with_check into pol from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_insert_authenticated';
  if pol !~ 'o\.verified' or pol !~ 'hidden_at IS NULL' or pol !~ 'now\(\) - ''00:10:00''::interval'
     or pol !~ '\(org_id IS NOT NULL\)' or pol !~ 'can_publish_now\(\)' or pol !~ 'has_recorded_consent\(\)' then
    raise exception 'a4-events: events_insert_authenticated does not read as written: %', pol;
  end if;
  select with_check into pol from pg_policies where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_insert_own';
  if pol !~ 'event_org_visible\(event_id\)' or pol !~ 'rsvp_on_home_campus\(event_id\)'
     or pol !~ 'NOT (public\.)?is_restricted_now\(\)' or pol !~ '\(auth\.uid\(\) = user_id\)' then
    raise exception 'a4-events: rsvps_insert_own does not read as written: %', pol;
  end if;
  select with_check into pol from pg_policies where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own';
  if pol !~ 'event_org_visible\(event_id\)' or pol !~ 'rsvp_on_home_campus\(event_id\)'
     or pol !~ 'NOT (public\.)?is_restricted_now\(\)' or pol !~ '\(auth\.uid\(\) = user_id\)' then
    raise exception 'a4-events: rsvps_update_own does not read as written: %', pol;
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'rsvps' and policyname = 'rsvps_update_own')
       is distinct from '(auth.uid() = user_id)' then
    raise exception 'a4-events: rsvps_update_own USING changed; it should not have';
  end if;

  -- Grants: no UPDATE on any events column for authenticated or anon;
  -- SELECT, INSERT (until file 2) and DELETE unchanged.
  select string_agg(attname, ',') into bad from pg_attribute
   where attrelid = 'public.events'::regclass and attnum > 0 and not attisdropped
     and (has_column_privilege('authenticated', 'public.events', attname, 'UPDATE')
          or has_column_privilege('anon', 'public.events', attname, 'UPDATE'));
  if bad is not null then
    raise exception 'a4-events: events columns still UPDATE-able by a client role: %', bad;
  end if;
  if not (has_table_privilege('authenticated', 'public.events', 'SELECT')
          and has_table_privilege('authenticated', 'public.events', 'INSERT')
          and has_table_privilege('authenticated', 'public.events', 'DELETE')) then
    raise exception 'a4-events: authenticated lost SELECT, INSERT or DELETE on events';
  end if;

  -- Constraints.
  if (select count(*) from pg_constraint where conrelid = 'public.events'::regclass and contype = 'c' and convalidated
        and conname in ('events_title_length', 'events_description_length',
                        'events_location_length', 'events_max_duration')) <> 4 then
    raise exception 'a4-events: the four CHECKs are not all present and validated';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
                  and conname = 'events_org_id_fkey' and confdeltype = 'c' and convalidated) then
    raise exception 'a4-events: events_org_id_fkey is not ON DELETE CASCADE';
  end if;

  -- Behaviour 1: the CHECKs refuse, even here (this role bypasses RLS). The
  -- creator id is random: a row the CHECK let through would trip the FK
  -- instead (23503 fires after the row's CHECKs), which is caught as a miss.
  foreach f in array array['title121', 'blank', 'desc2001', 'loc201', 'days15'] loop
    begin
      insert into public.events (creator_id, title, description, location, starts_at, ends_at)
      values (gen_random_uuid(),
              case f when 'title121' then repeat('x', 121) when 'blank' then '   ' else 'probe' end,
              case f when 'desc2001' then repeat('x', 2001) else '' end,
              case f when 'loc201' then repeat('x', 201) else '' end,
              now() + interval '1 day',
              now() + interval '1 day' + case f when 'days15' then interval '15 days' else interval '2 hours' end);
      raise exception 'a4-events: CHECK probe % was accepted', f;
    exception
      when check_violation then null;
      when foreign_key_violation then
        raise exception 'a4-events: CHECK probe % passed the CHECKs', f;
    end;
  end loop;

  -- Behaviour 2: a signed-in stranger (random id) manages no event, may RSVP
  -- to every visible club's event and to no hidden club's event.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.events e where public.can_manage_event(e.id)) then
    raise exception 'a4-events: a stranger manages an event';
  end if;
  if exists (select 1 from public.events e join public.orgs o on o.id = e.org_id
              where (o.hidden_at is not null) = public.event_org_visible(e.id)) then
    raise exception 'a4-events: event_org_visible disagrees with orgs.hidden_at for a stranger';
  end if;
  if exists (select 1 from public.events e join public.orgs o on o.id = e.org_id
              where (o.hidden_at is null) <> public.event_visible(e.org_id, e.creator_id, e.id)) then
    raise exception 'a4-events: event_visible disagrees with orgs.hidden_at for a stranger';
  end if;

  -- Behaviour 3: every club event is managed by each of its club's current
  -- owners/admins, and by no one else in org_members.
  for ev in select e.id, e.org_id, m.user_id, m.role
              from public.events e join public.org_members m on m.org_id = e.org_id loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', ev.user_id::text, 'role', 'authenticated')::text, true);
    if public.can_manage_event(ev.id) is distinct from (ev.role in ('owner', 'admin')) then
      raise exception 'a4-events: can_manage_event(%) is wrong for a % of its club', ev.id, ev.role;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

notify pgrst, 'reload schema';

commit;
