-- Security wave 2, batch A4 (file 2 of 2): only the server creates events.
--
-- WHY THIS EXISTS (#11, handoffs/2026-09-27-security-lenses-authz-dataexp.md):
--   the browser holds the anon key, so any officer could skip POST
--   /api/events and INSERT straight over PostgREST. File 1 (20260928110000)
--   already makes that INSERT ask for a verified, non-hidden club and no past
--   start, and adds length and 14-day CHECKs that bind every writer. What no
--   database rule can do is run the word filter (checkText is TypeScript
--   only), and the direct INSERT also lets a client choose `id` and
--   `created_at`. POST /api/events is the only place in src/ or public/html
--   that creates events (grep 2026-09-27), and since this wave it inserts with
--   the service role after its checks: requireCanPublish (Terms, school
--   email, no restriction; the same as has_recorded_consent() AND
--   can_publish_now()), the 10-per-hour rate limit, lengths, the word filter,
--   start/end/14 days, a verified, non-hidden club, owner/admin role; and
--   creator_id is the signed-in user, set on the server.
--
-- WHAT THIS FILE DOES
--   1. REVOKE INSERT ON public.events FROM authenticated (table level; there
--      are no column-level INSERT grants).
--   2. DROP POLICY events_insert_authenticated. With no INSERT policy a later
--      re-grant fails closed (RLS is on) instead of silently reopening it.
--
-- DOES NOT: touch SELECT (events_select_visible) or DELETE
--   (events_delete_manager, current officers; its grant stays), rsvps, the
--   service role, any row, or any function.
--
-- LIVE STATE (read-only MCP, 2026-09-27, production at 24dac9f): events
--   relacl authenticated=ard (INSERT at table level), anon nothing; attacl
--   has no INSERT grants. events_insert_authenticated is the only INSERT
--   policy. After file 1 that policy reads: the old clauses word for word
--   plus (org_id IS NOT NULL), the club verified and not hidden, and
--   starts_at >= now() - 10 minutes. PRE-FLIGHT checks file 1 is applied.
--
-- APPLY ORDER vs THE DEPLOY: AFTER the deploy is live and the served build is
--   verified. The OLD route inserts with the caller's cookie client: once
--   this is applied it gets 42501 and Create event answers 500 until the new
--   code (service-role insert) is serving. The new code works against the
--   database both before and after this file, so code first is always safe.
--   Apply via the management API, then the schema_migrations row
--   (20260928130000).
--
-- ROLLBACK (one transaction; do this before rolling back file 1):
--   BEGIN;
--   GRANT INSERT ON public.events TO authenticated;
--   CREATE POLICY events_insert_authenticated ON public.events FOR INSERT
--     TO authenticated WITH CHECK (
--       (auth.uid() = creator_id)
--       and public.has_recorded_consent()
--       and public.can_publish_now()
--       and ((org_id is null) or (public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
--       and (org_id is not null)
--       and exists (select 1 from public.orgs o
--                    where o.id = events.org_id and o.verified and o.hidden_at is null)
--       and (starts_at >= (now() - interval '10 minutes')));
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928130000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- REVOKE and DROP POLICY hold an ACCESS EXCLUSIVE lock on events until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. File 1 is applied, INSERT is exactly the table-level grant
--    this file revokes, and the one INSERT policy is file 1's.
do $$
declare
  pol text;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and policyname = 'events_delete_manager')
     or to_regprocedure('public.event_org_visible(uuid)') is null then
    raise exception 'a4-insert: 20260928110000_club_events_rules.sql is not applied; apply it first';
  end if;
  select string_agg(policyname, ',') into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and cmd in ('INSERT', 'ALL');
  if pol is distinct from 'events_insert_authenticated' then
    raise exception 'a4-insert: expected exactly one INSERT policy on events, found: %', coalesce(pol, '(none)');
  end if;
  select with_check into pol from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname = 'events_insert_authenticated';
  if pol !~ 'o\.verified' or pol !~ 'now\(\) - ''00:10:00''::interval' then
    raise exception 'a4-insert: events_insert_authenticated is not file 1''s version: %', pol;
  end if;
  if not exists (select 1 from pg_class c, aclexplode(c.relacl) a
                  where c.oid = 'public.events'::regclass and a.privilege_type = 'INSERT'
                    and a.grantee = 'authenticated'::regrole) then
    raise exception 'a4-insert: authenticated has no table-level INSERT on events; nothing to revoke';
  end if;
  if exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
              where t.attrelid = 'public.events'::regclass and a.privilege_type = 'INSERT') then
    raise exception 'a4-insert: a column-level INSERT grant on events exists; a table revoke would not close it';
  end if;
  if has_table_privilege('anon', 'public.events', 'INSERT') then
    raise exception 'a4-insert: anon can INSERT into events';
  end if;
end $$;

-- 1. and 2. ------------------------------------------------------------------
revoke insert on public.events from authenticated;
drop policy events_insert_authenticated on public.events;

-- 3. POST-CHECK: by catalog, then by behaviour --------------------------------
do $$
declare
  msg text;
  me text := current_user;
begin
  if has_any_column_privilege('authenticated', 'public.events', 'INSERT')
     or has_any_column_privilege('anon', 'public.events', 'INSERT') then
    raise exception 'a4-insert: a client role can still INSERT into events';
  end if;
  if not has_table_privilege('service_role', 'public.events', 'INSERT') then
    raise exception 'a4-insert: service_role lost INSERT on events (the route needs it)';
  end if;
  if not (has_table_privilege('authenticated', 'public.events', 'SELECT')
          and has_table_privilege('authenticated', 'public.events', 'DELETE')) then
    raise exception 'a4-insert: authenticated lost SELECT or DELETE on events';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
              and cmd in ('INSERT', 'ALL', 'UPDATE')) then
    raise exception 'a4-insert: an INSERT/UPDATE policy is left on events';
  end if;

  -- Behaviour: a signed-in client role is refused (42501), whatever it sends.
  if pg_has_role('authenticated', 'member') then
    begin
      set local role authenticated;
      insert into public.events (creator_id, title, starts_at, ends_at)
      values (gen_random_uuid(), 'probe', now() + interval '1 day', now() + interval '1 day 2 hours');
      raise exception 'a4-insert: authenticated could still insert an event';
    exception when insufficient_privilege then
      get stacked diagnostics msg = message_text;
      if msg !~ 'permission denied for table events' then
        raise exception 'a4-insert: unexpected refusal: %', msg;
      end if;
    end;
    if current_user <> me then
      raise exception 'a4-insert: role did not reset after the probe';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
