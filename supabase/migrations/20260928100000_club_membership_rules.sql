-- S67 security wave 2, batch A5a (club membership): removals are recorded,
-- only the owner can demote an admin, the data API deletes only your own
-- membership (leaving; every removal goes through the recording route), and
-- leaving or being removed cuts off the club's chat (security report
-- 2026-09-27 #14, #15, #16; waveA-build ruling 15).
--
-- WHY THIS EXISTS
--   #16  org_members_update / org_members_delete let ANY owner/admin change or
--        delete any non-owner row, so one admin could strip the other admins
--        straight through the data API (the route refuses; the database did
--        not). Latent: 0 admins live.
--   #15  Nothing recorded a removal, so a removed member of an open club came
--        back with one tap (and got the chat and posting rights back). And an
--        owner/admin could still delete someone else's membership straight
--        through the data API, skipping the record (waveA-build ruling 15):
--        the database officer branch was only a way to remove someone with no
--        record. Every real removal goes through the service-role route.
--   #14  Leaving or removal deleted only the org_members row. The club-chat
--        rows (channel_members, org_channel_members) stayed, so an ex-member
--        kept reading the chat roster and minting upload URLs.
--   Product call 9: a student who blocked an officer (or was blocked by one)
--        must not show up in that officer's join requests. The list route
--        filters, but org_join_requests_select let any owner/admin/mod read
--        every request of the club with their own JWT (requester id + free-text
--        message), block or not. Reproduced locally (notes-A5a.md, B1/B2).
--
-- WHAT THIS FILE DOES
--   1. public.org_removals (org_id, user_id, removed_by, removed_at; PK
--      (org_id, user_id)). RLS on, NO policies, and every privilege revoked
--      from anon and authenticated (the public default ACL grants them ALL on
--      new tables). Only the service role reads or writes it: the members
--      DELETE route records a removal BEFORE deleting the membership; the
--      join route and the requests list read it.
--   2. org_members_update: USING gains "the row is not an admin, or the caller
--      is the owner"; WITH CHECK restated unchanged. And UPDATE (role) — the
--      only UPDATE authenticated held on org_members — is revoked: the one
--      writer is the service-role members route. A future cookie-client role
--      write gets 42501, not a silent 0 rows.
--   3. org_members_delete narrows to SELF-LEAVE ONLY (ruling 15): the officer
--      branch is dropped; the owner guard and the self branch are restated
--      word for word: (role <> 'owner') AND (user_id = auth.uid()). Anyone,
--      admins included, can still leave (critique-cross W8); the owner still
--      can't. Removing someone else is only DELETE /api/orgs/[slug]/members/
--      [userId] (service role), which records the removal first. Grep
--      2026-09-28: the only cookie-client org_members delete is the leave in
--      DELETE /api/orgs/[slug]/join (.eq user_id = me); no public
--      function deletes org_members; public/html and mobile never touch it.
--      Deleting a club still cascades (FK actions don't consult RLS).
--   4. AFTER DELETE trigger org_members_drop_club_access (SECURITY DEFINER:
--      the leave route deletes with the COOKIE client, and authenticated may
--      only delete its own PENDING channel_members rows, so an invoker
--      function would silently delete nothing). For the (club, user) pair it
--      deletes channel_members and org_channel_members rows on the club's
--      channels. When an org_removals row exists (a removal, not a leave), it
--      also deletes the user's RSVPs to the club's events that haven't ended
--      (waveA-build product call 10; a voluntary leave keeps RSVPs).
--   5. AFTER INSERT trigger org_members_clear_removal_on_join: being let back
--      in (approved request, accepted invite) spends the removal, in the same
--      transaction as the insert, so no route can forget it.
--   6. org_join_requests_select: the officer branch gains "and not
--      is_blocked_either_way(me, requester)". The requester's own branch is
--      unchanged. Every officer read in the app uses the service role (the
--      requests routes, invite-candidates, membership.ts); the one cookie-client
--      read (api/orgs/route.ts, "my pending requests") is the self branch.
--   7. notify pgrst, 'reload schema'.
--
-- DOES NOT
--   * touch channel_members_select_member, posts_update_own or the orgs column
--     grants (A5b, 20260928150000), or any row (stale chat rows: the separate
--     20260928100500_club_channel_members_cleanup.sql, COUNT 0 today).
--   * change who may UPDATE: the owner-only-admin clause stays on
--     org_members_update (and UPDATE (role) is revoked, item 2).
--   * drop private officer channels on DEMOTION (an UPDATE): follow-up.
--   * grant or revoke EXECUTE on the two trigger functions (they can only run
--     as triggers; the default ACL's EXECUTE is harmless, and the standing
--     rule forbids REVOKE EXECUTE). Precedent: org_members_unfollow_on_leave.
--
-- LIVE STATE (read-only MCP, 2026-09-27, prod at 24dac9f; local identical):
--   org_members_update USING ((org_member_role(org_id, auth.uid()) = ANY
--     (ARRAY['owner'::text, 'admin'::text])) AND (role <> 'owner'::text) AND
--     (NOT is_restricted_now())) WITH CHECK ((role = ANY (ARRAY['member'::text,
--     'mod'::text, 'admin'::text])) AND ((role <> 'admin'::text) OR
--     (org_member_role(org_id, auth.uid()) = 'owner'::text)))
--   org_members_delete USING ((role <> 'owner'::text) AND ((user_id =
--     auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY
--     (ARRAY['owner'::text, 'admin'::text])) AND (NOT is_restricted_now()))))
--     (re-read 2026-09-28, integration pass: unchanged; the only DELETE
--     policy; authenticated=rdDxtm on the table)
--   org_members acl: authenticated=rdDxtm (no table UPDATE), column
--     role={authenticated=w}; triggers org_members_imply_follow (AI) and
--     org_members_unfollow_on_leave (AD) only. org_removals: absent.
--   org_join_requests_select (the only policy on the table; RLS on; SELECT
--     only for authenticated, no anon grant) USING ((user_id = auth.uid()) OR
--     (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--     'admin'::text, 'mod'::text]))). is_blocked_either_way(uuid, uuid):
--     SECURITY DEFINER, STABLE, md5(prosrc) 11a5c6dc6e744b30bf18ecc5c515716e
--     (live == local, re-read 2026-09-28; A2's 20260928120000 pins the same).
--   No triggers on channel_members, org_channel_members or rsvps.
--   rsvps(event_id, user_id, ...) FK events ON DELETE CASCADE; events.ends_at
--     NOT NULL; events_org_id_fkey ON DELETE SET NULL (A4 changes it later).
--   Counts: org_members 7 (0 admins, 0 mods); org-chat channel_members 2,
--     stale 0; org_channel_members 0; org_join_requests 0; blocks 0.
--
-- APPLY ORDER: BEFORE the deploy (the new code reads and writes org_removals;
-- it also tolerates the table being absent, so a misordered apply degrades to
-- today's behaviour instead of 500s). Every tightening here is tolerated by
-- today's code: officer role/remove writes already use the service role
-- (PATCH/DELETE /api/orgs/[slug]/members/[userId]), and self-leave keeps its
-- branch. Then 20260928100500 (cleanup) right after, so
-- the trigger is already stopping new stale rows when the sweep runs. Apply
-- via the management API, then insert the schema_migrations row (version
-- 20260928100000).
--
-- ROLLBACK (one transaction; code first, then this. Loses the recorded
-- removals, which only exist since this file):
--   BEGIN;
--   DROP TRIGGER IF EXISTS org_members_drop_club_access ON public.org_members;
--   DROP TRIGGER IF EXISTS org_members_clear_removal_on_join ON public.org_members;
--   DROP FUNCTION IF EXISTS public.org_members_drop_club_access();
--   DROP FUNCTION IF EXISTS public.org_members_clear_removal_on_join();
--   ALTER POLICY org_members_update ON public.org_members
--     USING ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (role <> 'owner'::text) AND (NOT is_restricted_now()))
--     WITH CHECK ((role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text])) AND ((role <> 'admin'::text) OR (org_member_role(org_id, auth.uid()) = 'owner'::text)));
--   ALTER POLICY org_members_delete ON public.org_members
--     USING ((role <> 'owner'::text) AND ((user_id = auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (NOT is_restricted_now()))));
--   GRANT UPDATE (role) ON public.org_members TO authenticated;
--   ALTER POLICY org_join_requests_select ON public.org_join_requests
--     USING ((user_id = auth.uid()) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text, 'mod'::text])));
--   DROP TABLE IF EXISTS public.org_removals;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY and CREATE TRIGGER take strong locks on org_members (and ALTER
-- POLICY on org_join_requests) until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. Catalog reads only (local schema_migrations lags the objects,
--    so it is never consulted). Any drift from LIVE STATE aborts the file.
do $$
declare
  upd_q text;
  upd_c text;
  del_q text;
  bad text;
  jr_q text;
  fn_md5 text;
  fn_def boolean;
begin
  select qual, with_check into upd_q, upd_c from pg_policies
   where schemaname = 'public' and tablename = 'org_members' and policyname = 'org_members_update';
  select qual into del_q from pg_policies
   where schemaname = 'public' and tablename = 'org_members' and policyname = 'org_members_delete';

  if upd_q is distinct from '((org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text])) AND (role <> ''owner''::text) AND (NOT is_restricted_now()))' then
    raise exception 'club-membership: org_members_update USING drifted: %', coalesce(upd_q, '(missing)');
  end if;
  if upd_c is distinct from '((role = ANY (ARRAY[''member''::text, ''mod''::text, ''admin''::text])) AND ((role <> ''admin''::text) OR (org_member_role(org_id, auth.uid()) = ''owner''::text)))' then
    raise exception 'club-membership: org_members_update WITH CHECK drifted: %', coalesce(upd_c, '(missing)');
  end if;
  if del_q is distinct from '((role <> ''owner''::text) AND ((user_id = auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text])) AND (NOT is_restricted_now()))))' then
    raise exception 'club-membership: org_members_delete USING drifted: %', coalesce(del_q, '(missing)');
  end if;

  -- No other permissive write policy may OR around the two being tightened.
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'org_members'
     and cmd in ('UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname not in ('org_members_update', 'org_members_delete');
  if bad is not null then
    raise exception 'club-membership: another permissive write policy on org_members: %', bad;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.org_members'::regclass) then
    raise exception 'club-membership: row level security is off on org_members';
  end if;

  -- org_join_requests_select, and the block helper it will call.
  select qual into jr_q from pg_policies
   where schemaname = 'public' and tablename = 'org_join_requests' and policyname = 'org_join_requests_select';
  if jr_q is distinct from '((user_id = auth.uid()) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text, ''mod''::text])))' then
    raise exception 'club-membership: org_join_requests_select USING drifted: %', coalesce(jr_q, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'org_join_requests'
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'org_join_requests_select';
  if bad is not null then
    raise exception 'club-membership: another permissive read policy on org_join_requests: %', bad;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.org_join_requests'::regclass) then
    raise exception 'club-membership: row level security is off on org_join_requests';
  end if;
  select md5(p.prosrc), p.prosecdef into fn_md5, fn_def from pg_proc p
   where p.oid = to_regprocedure('public.is_blocked_either_way(uuid, uuid)');
  if fn_md5 is distinct from '11a5c6dc6e744b30bf18ecc5c515716e' or fn_def is distinct from true then
    raise exception 'club-membership: public.is_blocked_either_way(uuid, uuid) is missing or not the one read (md5 %, definer %)',
      coalesce(fn_md5, '(missing)'), fn_def;
  end if;

  -- Grants as read today: UPDATE only on the role column, never table-wide.
  if has_table_privilege('authenticated', 'public.org_members', 'UPDATE') then
    raise exception 'club-membership: authenticated holds table-level UPDATE on org_members; re-read before revoking';
  end if;
  if not has_column_privilege('authenticated', 'public.org_members', 'role', 'UPDATE') then
    raise exception 'club-membership: authenticated no longer holds UPDATE (role) on org_members; re-read';
  end if;

  -- The names this file creates must be free.
  if to_regclass('public.org_removals') is not null then
    raise exception 'club-membership: public.org_removals already exists; stop and re-read it';
  end if;
  if exists (select 1 from pg_proc
              where pronamespace = 'public'::regnamespace
                and proname in ('org_members_drop_club_access', 'org_members_clear_removal_on_join')) then
    raise exception 'club-membership: a trigger function name is taken';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.org_members'::regclass and not tgisinternal
                and tgname not in ('org_members_imply_follow', 'org_members_unfollow_on_leave')) then
    raise exception 'club-membership: org_members has a trigger this file does not know about';
  end if;

  -- The columns the trigger deletes by.
  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'channel_members' and column_name in ('channel_id', 'user_id'))
           or (table_name = 'org_channel_members' and column_name in ('channel_id', 'user_id'))
           or (table_name = 'channels' and column_name in ('id', 'org_id'))
           or (table_name = 'rsvps' and column_name in ('event_id', 'user_id'))
           or (table_name = 'events' and column_name in ('id', 'org_id', 'ends_at')))) <> 11 then
    raise exception 'club-membership: a column the trigger relies on is missing';
  end if;
end $$;

-- 1. Removal records ---------------------------------------------------------

create table public.org_removals (
  org_id     uuid not null references public.orgs(id)  on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  removed_by uuid          references public.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- The users cascade and "was I removed anywhere" reads go by user_id.
create index org_removals_user_id_idx on public.org_removals (user_id);

comment on table public.org_removals is
  'S67 sec wave 2 #15: an officer removed user_id from org_id and nobody has let them back yet. Service role only (RLS on, no policies, no anon/authenticated grants). Written by the members/[userId] DELETE route before it deletes the membership; cleared by the org_members_clear_removal_on_join trigger.';

alter table public.org_removals enable row level security;
revoke all on table public.org_removals from anon, authenticated;
grant select, insert, update, delete on table public.org_removals to service_role;

-- 2 + 3. Only the owner can demote an admin; only you can delete your row ----
-- UPDATE: the old expressions word for word, plus the admin clause.

alter policy org_members_update on public.org_members
  using (
    (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))
    and (role <> 'owner'::text)
    and (not is_restricted_now())
    and ((role <> 'admin'::text) or (public.org_member_role(org_id, auth.uid()) = 'owner'::text))
  )
  with check (
    (role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text]))
    and ((role <> 'admin'::text) or (org_member_role(org_id, auth.uid()) = 'owner'::text))
  );

-- Belt and braces: nobody changes a role over the data API at all. The only
-- writer is PATCH /api/orgs/[slug]/members/[userId], with the service role.
revoke update (role) on public.org_members from authenticated;

-- DELETE is self-leave only (ruling 15). The owner guard and the self
-- branch word for word; the officer branch is gone. No NOT is_restricted_now()
-- here, as before: a suspended student can still leave a club.
alter policy org_members_delete on public.org_members
  using (
    (role <> 'owner'::text)
    and (user_id = auth.uid())
  );

-- 4. Leaving or removal cuts off the club's chat (and, on removal, RSVPs) ----

create function public.org_members_drop_club_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.channel_members cm
   using public.channels c
   where c.id = cm.channel_id
     and c.org_id = old.org_id
     and cm.user_id = old.user_id;

  delete from public.org_channel_members ocm
   using public.channels c
   where c.id = ocm.channel_id
     and c.org_id = old.org_id
     and ocm.user_id = old.user_id;

  -- A removal (recorded before the delete) also drops RSVPs to the club's
  -- events that haven't ended. A voluntary leave keeps them.
  if exists (select 1 from public.org_removals r
              where r.org_id = old.org_id and r.user_id = old.user_id) then
    delete from public.rsvps rv
     using public.events e
     where e.id = rv.event_id
       and e.org_id = old.org_id
       and e.ends_at > now()
       and rv.user_id = old.user_id;
  end if;

  return old;                                  -- ignored: AFTER ROW trigger
end $$;

comment on function public.org_members_drop_club_access() is
  'S67 sec wave 2 #14/#15: AFTER DELETE on org_members. Drops the ex-member''s channel_members and org_channel_members rows on the club''s channels; when an org_removals row exists (a removal, not a leave) also their RSVPs to the club''s events that haven''t ended. SECURITY DEFINER because self-leave deletes with the cookie client.';

create trigger org_members_drop_club_access
  after delete on public.org_members
  for each row execute function public.org_members_drop_club_access();

-- 5. Being let back in spends the removal ------------------------------------

create function public.org_members_clear_removal_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.org_removals
   where org_id = new.org_id and user_id = new.user_id;
  return new;                                  -- ignored: AFTER ROW trigger
end $$;

comment on function public.org_members_clear_removal_on_join() is
  'S67 sec wave 2 #15: AFTER INSERT on org_members. A member is not "removed": re-admission (approved request, accepted invite) deletes the org_removals row in the same transaction.';

create trigger org_members_clear_removal_on_join
  after insert on public.org_members
  for each row execute function public.org_members_clear_removal_on_join();

-- 6. Officers don't read requests across a block -----------------------------
-- An officer doesn't read a request from someone in a block pair with them
-- (product call 9). The requester's own branch is unchanged.
-- is_blocked_either_way answers only when the caller is one of the two ids,
-- which the first argument guarantees.
alter policy org_join_requests_select on public.org_join_requests
  using (
    (user_id = auth.uid())
    or (
      (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text, 'mod'::text]))
      and (not public.is_blocked_either_way((select auth.uid()), user_id))
    )
  );

-- 7. POST-CHECK. Catalog reads; the behaviour probes (admin vs admin, leave,
--    removal, re-join, account and club deletion, join requests across a
--    block) ran as real roles on the local database inside rolled-back
--    transactions (notes-A5a.md).
do $$
declare
  upd_q text;
  upd_c text;
  del_q text;
  jr_q text;
  admin_clause text := '((role <> ''admin''::text) OR (org_member_role(org_id, auth.uid()) = ''owner''::text))';
  r text;
  t record;
begin
  -- org_removals: service role only.
  if not (select relrowsecurity from pg_class where oid = 'public.org_removals'::regclass) then
    raise exception 'club-membership: RLS is off on org_removals';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_removals') then
    raise exception 'club-membership: org_removals must have no policies';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.org_removals', 'SELECT')
       or has_table_privilege(r, 'public.org_removals', 'INSERT')
       or has_table_privilege(r, 'public.org_removals', 'UPDATE')
       or has_table_privilege(r, 'public.org_removals', 'DELETE') then
      raise exception 'club-membership: % can still touch org_removals', r;
    end if;
  end loop;
  if not (has_table_privilege('service_role', 'public.org_removals', 'SELECT')
          and has_table_privilege('service_role', 'public.org_removals', 'INSERT')
          and has_table_privilege('service_role', 'public.org_removals', 'UPDATE')
          and has_table_privilege('service_role', 'public.org_removals', 'DELETE')) then
    raise exception 'club-membership: service_role must read and write org_removals';
  end if;

  -- org_members grants: no UPDATE at all; SELECT and DELETE (self-leave) kept.
  if has_column_privilege('authenticated', 'public.org_members', 'role', 'UPDATE')
     or has_table_privilege('authenticated', 'public.org_members', 'UPDATE') then
    raise exception 'club-membership: authenticated can still UPDATE org_members';
  end if;
  if not (has_table_privilege('authenticated', 'public.org_members', 'SELECT')
          and has_table_privilege('authenticated', 'public.org_members', 'DELETE')) then
    raise exception 'club-membership: authenticated lost SELECT or DELETE on org_members (leave would break)';
  end if;

  -- The two policies read as written.
  select qual, with_check into upd_q, upd_c from pg_policies
   where schemaname = 'public' and tablename = 'org_members' and policyname = 'org_members_update';
  select qual into del_q from pg_policies
   where schemaname = 'public' and tablename = 'org_members' and policyname = 'org_members_delete';
  if upd_q is null or position(admin_clause in upd_q) = 0
     or position('(role <> ''owner''::text)' in upd_q) = 0
     or position('(NOT is_restricted_now())' in upd_q) = 0 then
    raise exception 'club-membership: org_members_update USING does not read as written: %', upd_q;
  end if;
  if upd_c is distinct from '((role = ANY (ARRAY[''member''::text, ''mod''::text, ''admin''::text])) AND ((role <> ''admin''::text) OR (org_member_role(org_id, auth.uid()) = ''owner''::text)))' then
    raise exception 'club-membership: org_members_update WITH CHECK changed: %', upd_c;
  end if;
  -- Self-leave only: exactly the owner guard and the self branch, nothing
  -- that lets an officer delete another member's row.
  if del_q is distinct from '((role <> ''owner''::text) AND (user_id = auth.uid()))' then
    raise exception 'club-membership: org_members_delete is not self-leave only: %', coalesce(del_q, '(missing)');
  end if;
  select qual into jr_q from pg_policies
   where schemaname = 'public' and tablename = 'org_join_requests' and policyname = 'org_join_requests_select';
  if jr_q is null or position('is_blocked_either_way' in jr_q) = 0
     or position('(user_id = auth.uid())' in jr_q) = 0
     or position('''mod''::text' in jr_q) = 0 then
    raise exception 'club-membership: org_join_requests_select does not read as written: %', jr_q;
  end if;

  -- The two triggers: AFTER, FOR EACH ROW, enabled, on the right event, and
  -- their functions SECURITY DEFINER with an empty search_path.
  for t in
    select tg.tgname, tg.tgtype, tg.tgenabled, p.prosecdef, p.proconfig
      from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
     where tg.tgrelid = 'public.org_members'::regclass
       and tg.tgname in ('org_members_drop_club_access', 'org_members_clear_removal_on_join')
  loop
    -- tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT, 8 = DELETE.
    if t.tgenabled <> 'O' or (t.tgtype & 1) = 0 or (t.tgtype & 2) <> 0
       or not t.prosecdef or t.proconfig is distinct from array['search_path=""'] then
      raise exception 'club-membership: trigger % is not an enabled AFTER ROW SECURITY DEFINER trigger', t.tgname;
    end if;
    if (t.tgname = 'org_members_drop_club_access' and t.tgtype & 8 = 0)
       or (t.tgname = 'org_members_clear_removal_on_join' and t.tgtype & 4 = 0) then
      raise exception 'club-membership: trigger % fires on the wrong event', t.tgname;
    end if;
  end loop;
  if (select count(*) from pg_trigger
       where tgrelid = 'public.org_members'::regclass
         and tgname in ('org_members_drop_club_access', 'org_members_clear_removal_on_join')) <> 2 then
    raise exception 'club-membership: expected both new triggers on org_members';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
