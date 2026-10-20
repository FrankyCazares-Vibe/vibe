-- ---------------------------------------------------------------------------
-- 20261021100000_club_officers.sql
--
-- PLAIN ENGLISH
-- Clubs have an Owner and Officers, nothing in between (the club's view,
-- wave 1; handoffs/2026-10-20-club-view/DECISIONS.md, Round 1 call 1). The
-- stored role `admin` is already shown as "Officer". This file turns today's
-- mods into officers and makes `mod` impossible from now on. Officers keep
-- everything admins had. Only the owner makes or unmakes officers: that rule
-- lives in the members route (service role), and this file states it in the
-- org_members update policy too, as a second lock.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the role check and the update policy are the ones
--      20260507100000 and 20260928100000 wrote (their text below).
--   2. Every `mod` row becomes `admin`. The trigger chat_org_members_rooms
--      runs for each (after update of role): a new officer joins the
--      Officers room and the club's open event rooms, as any promotion does.
--   3. org_members_role_check: owner, admin, member.
--   4. org_members_update (browser writes; signed-in users hold no UPDATE
--      grant on the table since 20260928100000, so this is the second lock):
--      only the owner, only on non-owner rows, only to member or admin.
--   5. POST-CHECK: no mod rows, the check refuses mod.
--
-- DOES NOT CHANGE (dead after this file, kept to keep the change small):
-- functions and policies that still list 'mod' next to owner and admin
-- (can_view_org_channel's block check, org_join_requests_select,
-- org_channel_members_select, admin_usage_summary). No row can be a mod, so
-- they mean exactly owner-or-admin now. chat_removals.removed_role keeps
-- 'mod' so the removals mods made before today stay valid.
--
-- LIVE STATE (local stack, 2026-10-21): 1 mod row. Production: read the
-- count first (a count, allowed): select count(*) from org_members where role = 'mod';
--
-- DEPLOY ORDER: this file first, then the code. Old code keeps working (admin
-- is valid); only an old screen that still offers "Mod" would get an error
-- for that one choice until the new code is live.
--
-- ROLLBACK (the mods are not restored: nothing records who they were):
--   alter table public.org_members drop constraint org_members_role_check;
--   alter table public.org_members add constraint org_members_role_check
--     check (role in ('owner','admin','mod','member'));
--   and re-run the org_members_update policy of 20260928100000 (lines 261-271);
--   delete from supabase_migrations.schema_migrations where version = '20261021100000';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  v_check text;
  v_using text;
  v_with  text;
begin
  select pg_get_constraintdef(c.oid) into v_check
    from pg_constraint c
   where c.conrelid = 'public.org_members'::regclass and c.conname = 'org_members_role_check';
  if v_check is distinct from
     'CHECK ((role = ANY (ARRAY[''owner''::text, ''admin''::text, ''mod''::text, ''member''::text])))' then
    raise exception 'club-officers: org_members_role_check drifted: %', coalesce(v_check, '(missing)');
  end if;
  select pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid) into v_using, v_with
    from pg_policy p
   where p.polrelid = 'public.org_members'::regclass and p.polname = 'org_members_update';
  if v_with is distinct from
     '((role = ANY (ARRAY[''member''::text, ''mod''::text, ''admin''::text])) AND ((role <> ''admin''::text) OR (org_member_role(org_id, auth.uid()) = ''owner''::text)))' then
    raise exception 'club-officers: org_members_update drifted: %', coalesce(v_with, '(missing)');
  end if;
end $$;

-- 2. MODS BECOME OFFICERS --------------------------------------------------------
update public.org_members set role = 'admin' where role = 'mod';

-- 3. NO MORE MODS ------------------------------------------------------------------
alter table public.org_members drop constraint org_members_role_check;
alter table public.org_members add constraint org_members_role_check
  check (role in ('owner', 'admin', 'member'));

-- 4. ONLY THE OWNER MAKES OR UNMAKES OFFICERS ---------------------------------------
alter policy org_members_update on public.org_members
  using (
    (public.org_member_role(org_id, auth.uid()) = 'owner'::text)
    and (role <> 'owner'::text)
    and (not public.is_restricted_now())
  )
  with check (
    (role = any (array['member'::text, 'admin'::text]))
    and (public.org_member_role(org_id, auth.uid()) = 'owner'::text)
  );

-- 5. POST-CHECK ---------------------------------------------------------------------
do $$
declare
  bad text := '';
begin
  if exists (select 1 from public.org_members where role = 'mod') then
    bad := bad || ' a mod row is left;';
  end if;
  begin
    -- A savepoint: the probe never reaches a real row (no such org).
    insert into public.org_members (org_id, user_id, role)
    values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'mod');
    bad := bad || ' the check let a mod in;';
  exception
    when check_violation then null;
    when foreign_key_violation then bad := bad || ' the check did not refuse mod before the keys;';
  end;
  if bad <> '' then
    raise exception 'club-officers post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
