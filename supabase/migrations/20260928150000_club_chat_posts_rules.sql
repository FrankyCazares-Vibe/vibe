-- S67 security wave 2, batch A5b (club chat + club posts): the club-chat roster
-- follows club membership, a club post's edit follows the author's CURRENT
-- club role, and club profile text and new channels are written only through
-- the checked routes.
-- Report: handoffs/2026-09-27-security-lenses-authz-dataexp.md #13, #14 and
-- the Low "officers can rewrite the club name/description/tags/links directly".
--
-- WHY THIS EXISTS
--   #14 Leaving or being removed from a club deletes only the org_members row.
--       The club-chat subscription (channel_members) stays, and the roster rule
--       channel_members_select_member is `is_channel_member(channel_id)`: "you
--       have a row here". So an ex-member keeps reading, over the data API, who
--       is in the club chat, who joins later, and everyone's last-read and
--       typing stamps, including for invite-only and hidden clubs. Message text
--       was already safe (messages_select_org_member asks can_view_org_channel).
--       A5a's trigger (20260928100000) stops NEW stale rows; this file makes a
--       stale row useless even if one survives.
--   #13 posts_update_own is author-only. A club post is stored with user_id =
--       the officer who wrote it, and authenticated holds UPDATE on posts
--       content/status/tags, so a removed or demoted officer can rewrite the
--       club's post straight through PostgREST, past the word filter. The
--       PATCH route (src/app/api/posts/[id]/route.ts:545-572) already refuses;
--       the database now gives the same answer.
--   Low: authenticated holds column UPDATE on orgs name, description, links,
--       tags, philanthropy, logo_url, banner_url, backdrop_preset, updated_at,
--       and orgs_update lets owners/admins write them directly: no word filter,
--       no length cap, no link check, no Terms/restriction gate. Every real
--       write goes through PATCH /api/orgs/[slug] with the service role, which
--       runs all of those, so the grants only serve the bypass.
--   Ruling 17 (waveA-build, integration pass): authenticated holds INSERT on
--       channels under channels_insert_authenticated, so an owner/admin could
--       create a club channel (name, topic) straight through PostgREST, past
--       the word filter and the name rules, and anyone could create an empty
--       group/DM channel row. Every app insert is service-role (grep
--       2026-09-28: api/orgs POST default channels, orgs/[slug]/channels POST,
--       me/threads POST group + DM; no public function inserts into channels;
--       public/html and mobile never call PostgREST).
--
-- WHAT THIS FILE DOES
--   1. public.can_read_channel_roster(cid): true when the channel exists AND
--      (it is a DM/group, org_id null, OR public.can_view_org_channel(cid,
--      caller)). can_view_org_channel is what the org-channel message, reaction
--      and channel rules already ask: club member, plus owner/admin or the
--      per-channel allow list for a private channel. SECURITY DEFINER, stable,
--      search_path '', every name schema-qualified; false for anon.
--   2. channel_members_select_member: `is_channel_member(channel_id)` restated
--      word for word, AND public.can_read_channel_roster(channel_id).
--   3. posts_update_own: both expressions restated word for word, each gaining
--      `AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY
--      (ARRAY['owner'::text, 'admin'::text])))`. The same owner/admin rule as
--      the route's EDIT_AS_ORG_ROLES and the club-post create route. org_id is
--      not updatable by authenticated (PRE-FLIGHT asserts it), so USING and
--      WITH CHECK see the same club.
--   4. REVOKE UPDATE (the nine columns) ON public.orgs FROM authenticated.
--      orgs_update stays (harmless without a grant; the service role ignores
--      it). Any future cookie-client orgs write now gets 42501: use the route.
--   5. REVOKE INSERT ON public.channels FROM authenticated (ruling 17). The
--      policy channels_insert_authenticated STAYS, dormant, on purpose: with
--      no grant PostgreSQL refuses (42501) before RLS is asked, so it can't
--      let anything in; it is the same call as orgs_update in item 4; the
--      ROLLBACK is one GRANT; and if a later blanket grant ever hands INSERT
--      back, the old owner/admin + consent + can_publish_now() rule still
--      stands instead of a table with no insert rule at all. anon holds no
--      INSERT on channels (unchanged).
--   6. notify pgrst, 'reload schema'.
--
-- WHY THESE SHAPES
--   * The org test is a SECURITY DEFINER helper, not a subquery on channels in
--     the policy: channels_select_member runs EXISTS on channel_members, so a
--     subquery loops (infinite recursion), and channels RLS hides an org
--     channel from an ex-member, so `NOT EXISTS (org channel)` would come out
--     TRUE and let them straight back in (critique-A5 #3, approach-cross P5).
--   * can_view_org_channel, not org_content_visible: org_content_visible is
--     TRUE for anyone when the club isn't hidden, so it would not close #14.
--   * DMs and groups (org_id null) are untouched: the helper answers true and
--     is_channel_member decides, exactly as today.
--
-- DOES NOT
--   * Delete any channel_members row (A5a: trigger 20260928100000 + cleanup
--     20260928100500). Hide the per-member chat settings columns from other
--     members (moved out of wave A: needs me/threads, me/otto, push badge).
--   * Add an officer DELETE policy on posts or touch posts_delete_own (B2 does
--     the officer delete route and the rule together).
--   * Touch any row, or any other grant (authenticated keeps SELECT, DELETE
--     etc. on channels: there is no DELETE policy, so RLS answers 0 rows).
--     Nothing is REVOKEd from a function (standing rule: on this image
--     calling a function without EXECUTE crashes the backend).
--
-- LIVE STATE (read-only MCP, 2026-09-27, production at 24dac9f; last applied
-- migration 20260927142000). channel_members: RLS on; policies
-- channel_members_select_member (SELECT, USING is_channel_member(channel_id),
-- the only SELECT policy), channel_members_update_own, channel_members_delete_
-- own_pending; no triggers. posts: posts_update_own is the only UPDATE policy,
-- USING (auth.uid() = user_id), WITH CHECK ((auth.uid() = user_id) AND
-- has_recorded_consent() AND can_publish_now()); authenticated column UPDATE on
-- content, status, tags only. orgs: authenticated has no table UPDATE, column
-- UPDATE on exactly backdrop_preset, banner_url, description, links, logo_url,
-- name, philanthropy, tags, updated_at; anon none. can_read_channel_roster does
-- not exist. can_view_org_channel(uuid, uuid) is SECURITY DEFINER. COUNTS:
-- club posts 0 (0 by an author who isn't a current owner/admin, so no one
-- loses an edit today); org-channel channel_members rows 2, of which 0 belong
-- to a non-member and 0 sit on a private channel the member can't view (so no
-- current roster read changes); DM/group channel_members rows 23; orgs 5.
-- channels (re-read 2026-09-28, integration pass): RLS on (not forced); table
-- ACL {postgres=arwdDxtm, authenticated=ardDxtm, service_role=arwdDxtm}, no
-- anon entry, no column ACLs; INSERT policy channels_insert_authenticated TO
-- authenticated WITH CHECK (((org_id IS NULL) OR (org_member_role(org_id,
-- auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))) AND
-- has_recorded_consent() AND can_publish_now()); rows: group 3, dm 7,
-- org_channel 12.
-- The local database matched on every item above.
--
-- APPLY ORDER vs THE DEPLOY: AFTER the code deploy (waveA-build.md). Every
-- change is tolerated by the code live today: the posts PATCH route already
-- refuses what the new clause refuses, every orgs write and every channels
-- insert is service-role (checked in the committed code too, 24dac9f), and
-- the roster rule only narrows rows ex-members could read. The new code
-- (ensureMember 403 on an unreadable channel, upload-URL and search through
-- ensureMember, route gates) does not depend on this file either, so either
-- side is safe. Apply via the management API, then insert the
-- schema_migrations row (version 20260928150000).
--
-- ROLLBACK (one transaction; code first is not needed, nothing reads new
-- objects):
--   BEGIN;
--   ALTER POLICY channel_members_select_member ON public.channel_members
--     USING (is_channel_member(channel_id));
--   ALTER POLICY posts_update_own ON public.posts
--     USING (auth.uid() = user_id)
--     WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now());
--   GRANT UPDATE (backdrop_preset, banner_url, description, links, logo_url,
--     name, philanthropy, tags, updated_at) ON public.orgs TO authenticated;
--   GRANT INSERT ON public.channels TO authenticated;
--   DROP FUNCTION IF EXISTS public.can_read_channel_roster(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928150000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY holds an ACCESS EXCLUSIVE lock on the table until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. Each object must read as LIVE STATE says; any drift aborts
--    the whole file. Catalog reads only (never schema_migrations: the local
--    database has the 20260927 objects without their rows).
do $$
declare
  q text;
  c text;
  bad text;
  cols text;
begin
  -- channel_members: the roster rule, and nothing else permissive to OR around it.
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and policyname = 'channel_members_select_member';
  if q is distinct from 'is_channel_member(channel_id)' then
    raise exception 'club-chat-posts: channel_members_select_member is not the one this file was written against: %', coalesce(q, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'channel_members_select_member';
  if bad is not null then
    raise exception 'club-chat-posts: another permissive SELECT policy on channel_members would OR around the roster rule: %', bad;
  end if;

  -- posts: the edit rule, the only permissive UPDATE policy.
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own';
  if q is distinct from '(auth.uid() = user_id)'
     or c is distinct from '((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now())' then
    raise exception 'club-chat-posts: posts_update_own is not the one this file was written against: % | %',
      coalesce(q, '(missing)'), coalesce(c, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'posts'
     and cmd in ('UPDATE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'posts_update_own';
  if bad is not null then
    raise exception 'club-chat-posts: another permissive UPDATE policy on posts would OR around posts_update_own: %', bad;
  end if;
  -- The new clause reads org_id in USING and WITH CHECK alike; that is only
  -- one question if a client can't move a post between clubs.
  if has_column_privilege('authenticated', 'public.posts', 'org_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts', 'user_id', 'UPDATE') then
    raise exception 'club-chat-posts: authenticated can UPDATE posts.org_id or posts.user_id; re-read before tightening posts_update_own';
  end if;

  -- orgs: exactly the nine column grants, no table-level UPDATE, nothing for anon.
  if has_table_privilege('authenticated', 'public.orgs', 'UPDATE')
     or has_table_privilege('anon', 'public.orgs', 'UPDATE') then
    raise exception 'club-chat-posts: anon or authenticated holds TABLE-level UPDATE on orgs; a column revoke would not close it';
  end if;
  select string_agg(a.attname, ',' order by a.attname) into cols
    from pg_attribute a
   where a.attrelid = 'public.orgs'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.orgs', a.attname, 'UPDATE');
  if cols is distinct from 'backdrop_preset,banner_url,description,links,logo_url,name,philanthropy,tags,updated_at' then
    raise exception 'club-chat-posts: authenticated orgs UPDATE columns drifted: %', coalesce(cols, '(none)');
  end if;

  -- channels INSERT (ruling 17): authenticated holds it at table level only,
  -- anon not at all, under exactly the one INSERT policy read in LIVE STATE.
  if not has_table_privilege('authenticated', 'public.channels', 'INSERT') then
    raise exception 'club-chat-posts: authenticated no longer holds INSERT on channels; re-read before revoking';
  end if;
  if has_any_column_privilege('anon', 'public.channels', 'INSERT') then
    raise exception 'club-chat-posts: anon holds INSERT on channels; re-read';
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.channels'::regclass and a.attnum > 0
                and not a.attisdropped and a.attacl is not null) then
    raise exception 'club-chat-posts: channels has column-level grants; re-read before revoking';
  end if;
  select with_check into c from pg_policies
   where schemaname = 'public' and tablename = 'channels'
     and policyname = 'channels_insert_authenticated' and cmd = 'INSERT';
  if c is distinct from '(((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text]))) AND has_recorded_consent() AND can_publish_now())' then
    raise exception 'club-chat-posts: channels_insert_authenticated is not the one this file was written against: %', coalesce(c, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'channels'
     and cmd in ('INSERT', 'ALL') and policyname <> 'channels_insert_authenticated';
  if bad is not null then
    raise exception 'club-chat-posts: another INSERT policy on channels: %', bad;
  end if;

  -- RLS on, the helper name free, the helper it calls present and definer.
  if exists (select 1 from pg_class
              where oid in ('public.channel_members'::regclass, 'public.posts'::regclass,
                            'public.orgs'::regclass, 'public.channels'::regclass)
                and not relrowsecurity) then
    raise exception 'club-chat-posts: row level security is off on channel_members, posts, orgs or channels';
  end if;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname = 'can_read_channel_roster') then
    raise exception 'club-chat-posts: public.can_read_channel_roster already exists; stop and re-read it';
  end if;
  if not coalesce((select p.prosecdef from pg_proc p
                    where p.oid = 'public.can_view_org_channel(uuid,uuid)'::regprocedure), false) then
    raise exception 'club-chat-posts: public.can_view_org_channel(uuid, uuid) is missing or not SECURITY DEFINER';
  end if;
end $$;

-- 1. The roster helper --------------------------------------------------------

-- May the caller read this channel's member list? DMs and groups: yes (the
-- policy's is_channel_member still decides). Club channels: only when
-- can_view_org_channel says the caller may read the channel itself. No such
-- channel, or anon: false.
create function public.can_read_channel_roster(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon'
     and coalesce((
           select c.org_id is null
               or public.can_view_org_channel(c.id, (select auth.uid()))
             from public.channels c
            where c.id = cid),
         false);
$$;

comment on function public.can_read_channel_roster(uuid) is
  'S67 sec wave 2 (A5b) policy helper for channel_members_select_member: true for a DM/group channel, and for a club channel only when public.can_view_org_channel(cid, auth.uid()) (club member; private channels need owner/admin or org_channel_members). False for anon and for a missing channel. SECURITY DEFINER so the channels read is not filtered by channels RLS (which would hide the club channel and recurse through channel_members).';

-- Standing rule: every role that could reach it may call it; it refuses inside.
grant execute on function public.can_read_channel_roster(uuid) to anon, authenticated, service_role;

-- 2. The roster rule ------------------------------------------------------------
-- The old condition word for word, plus the club check.

alter policy channel_members_select_member on public.channel_members
  using (
    is_channel_member(channel_id)
    and public.can_read_channel_roster(channel_id)
  );

-- 3. The club-post edit rule ------------------------------------------------------
-- Both old expressions word for word, plus: a club post only while the caller
-- is an owner or admin of that club. org_member_role answers only about the
-- caller (auth.uid()), which is exactly the question.

alter policy posts_update_own on public.posts
  using (
    (auth.uid() = user_id)
    and ((org_id is null)
         or (org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
  )
  with check (
    (auth.uid() = user_id)
    and has_recorded_consent()
    and can_publish_now()
    and ((org_id is null)
         or (org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
  );

-- 4. Club profile text only through the route -------------------------------------

revoke update (backdrop_preset, banner_url, description, links, logo_url, name,
               philanthropy, tags, updated_at)
  on public.orgs from authenticated;

-- 4b. New channels only through the routes (ruling 17) ----------------------------
-- channels_insert_authenticated stays, dormant (header item 5).

revoke insert on table public.channels from authenticated;

-- 5. POST-CHECK, part 1: the catalog reads as sections 1-4b say.
do $$
declare
  f record;
  q text;
  c text;
  cols text;
  want_org text := '\(org_id IS NULL\) OR \(org_member_role\(org_id, auth\.uid\(\)\) = ANY \(ARRAY\[''owner''::text, ''admin''::text\]\)\)';
begin
  select p.provolatile, p.prosecdef, p.proconfig into f
    from pg_proc p where p.oid = 'public.can_read_channel_roster(uuid)'::regprocedure;
  if f.provolatile <> 's' or not f.prosecdef
     or f.proconfig is distinct from array['search_path=""'] then
    raise exception 'club-chat-posts: can_read_channel_roster is not STABLE SECURITY DEFINER with an empty search_path';
  end if;
  if not (has_function_privilege('anon', 'public.can_read_channel_roster(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.can_read_channel_roster(uuid)', 'execute')
          and has_function_privilege('service_role', 'public.can_read_channel_roster(uuid)', 'execute')) then
    raise exception 'club-chat-posts: can_read_channel_roster must be executable by anon, authenticated and service_role';
  end if;

  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and policyname = 'channel_members_select_member';
  if q is null or q !~ '^\(is_channel_member\(channel_id\) AND (public\.)?can_read_channel_roster\(channel_id\)\)$' then
    raise exception 'club-chat-posts: channel_members_select_member does not read as written: %', coalesce(q, '(missing)');
  end if;

  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own';
  if q is null or q !~ '^\(\(auth\.uid\(\) = user_id\) AND ' or q !~ want_org then
    raise exception 'club-chat-posts: posts_update_own USING does not read as written: %', coalesce(q, '(missing)');
  end if;
  if c is null or c !~ '^\(\(auth\.uid\(\) = user_id\) AND has_recorded_consent\(\) AND can_publish_now\(\) AND '
     or c !~ want_org then
    raise exception 'club-chat-posts: posts_update_own WITH CHECK does not read as written: %', coalesce(c, '(missing)');
  end if;

  select string_agg(a.attname, ',' order by a.attname) into cols
    from pg_attribute a
   where a.attrelid = 'public.orgs'::regclass and a.attnum > 0 and not a.attisdropped
     and (has_column_privilege('authenticated', 'public.orgs', a.attname, 'UPDATE')
          or has_column_privilege('anon', 'public.orgs', a.attname, 'UPDATE'));
  if cols is not null then
    raise exception 'club-chat-posts: anon or authenticated can still UPDATE orgs columns: %', cols;
  end if;
  if not has_table_privilege('service_role', 'public.orgs', 'UPDATE') then
    raise exception 'club-chat-posts: service_role lost UPDATE on orgs; PATCH /api/orgs/[slug] would 500';
  end if;

  -- channels: nobody but the service role inserts; reads are untouched.
  if has_any_column_privilege('authenticated', 'public.channels', 'INSERT')
     or has_any_column_privilege('anon', 'public.channels', 'INSERT') then
    raise exception 'club-chat-posts: anon or authenticated can still INSERT into channels';
  end if;
  if not has_table_privilege('service_role', 'public.channels', 'INSERT') then
    raise exception 'club-chat-posts: service_role lost INSERT on channels; chat and club creation would 500';
  end if;
  if not has_table_privilege('authenticated', 'public.channels', 'SELECT') then
    raise exception 'club-chat-posts: authenticated lost SELECT on channels (chat reads would break)';
  end if;
end $$;

-- 6. POST-CHECK, part 2: behaviour, as the real role. Each probe runs in its
--    own block that ends by raising a sentinel, so the probe rows, the role
--    switch and the JWT claims all roll back before the next statement; only
--    the plpgsql variables survive. Nothing a probe writes can commit.
do $$
declare
  done constant text := 'club-chat-posts-probe-done';
  refused boolean := false;
  r_org boolean;
  r_missing boolean;
  v_org uuid;
  v_ch uuid;
  v_user uuid;
  v_dm uuid;
  v_dm_user uuid;
  v_dm_total int;
  seen int;
  seen_dm int;
  touched int;
begin
  -- a. The orgs text columns are closed to a signed-in client.
  begin
    perform set_config('role', 'authenticated', true);
    update public.orgs set name = name where false;
    raise exception '%', done;
  exception
    when insufficient_privilege then refused := true;
    when others then if sqlerrm <> done then raise; end if;
  end;
  if not refused then
    raise exception 'club-chat-posts: authenticated could still UPDATE orgs.name';
  end if;

  -- a2. And channels are closed to a direct insert (ruling 17).
  refused := false;
  begin
    perform set_config('role', 'authenticated', true);
    insert into public.channels (type, name) select 'group', 'probe' where false;
    raise exception '%', done;
  exception
    when insufficient_privilege then refused := true;
    when others then if sqlerrm <> done then raise; end if;
  end;
  if not refused then
    raise exception 'club-chat-posts: authenticated could still INSERT into channels';
  end if;

  -- A public club channel and a signed-in student who is not in that club.
  select c.id, c.org_id into v_ch, v_org
    from public.channels c
   where c.org_id is not null and c.is_private = false
   order by c.created_at limit 1;
  if v_ch is not null then
    select u.id into v_user from public.users u
     where not exists (select 1 from public.org_members m
                        where m.org_id = v_org and m.user_id = u.id)
     order by u.created_at limit 1;
  end if;

  -- b. The helper refuses a stranger and a missing channel.
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    if v_ch is not null then r_org := public.can_read_channel_roster(v_ch); end if;
    r_missing := public.can_read_channel_roster(gen_random_uuid());
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if r_org is distinct from false and v_ch is not null then
    raise exception 'club-chat-posts: can_read_channel_roster let a non-member read a club roster';
  end if;
  if r_missing is distinct from false then
    raise exception 'club-chat-posts: can_read_channel_roster answered true for a missing channel';
  end if;

  if v_user is null then
    raise notice 'club-chat-posts: no club channel + non-member pair to probe #13/#14 rows with; catalog checks stand';
  else
    -- c. A leftover club-chat row is invisible to the ex-member who holds it,
    --    and an ex-officer's club post no longer takes their edit.
    begin
      insert into public.channel_members (channel_id, user_id, role, accepted_at)
      values (v_ch, v_user, 'member', now())
      on conflict (channel_id, user_id) do nothing;
      insert into public.posts (user_id, org_id, type, content, status)
      values (v_user, v_org, 'post', 'club-chat-posts probe', 'published');
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
      select count(*) into seen from public.channel_members where channel_id = v_ch;
      update public.posts set content = content
       where user_id = v_user and org_id = v_org and content = 'club-chat-posts probe';
      get diagnostics touched = row_count;
      raise exception '%', done;
    exception when others then if sqlerrm <> done then raise; end if;
    end;
    if seen <> 0 then
      raise exception 'club-chat-posts: an ex-member still reads % club-chat roster row(s)', seen;
    end if;
    if touched <> 0 then
      raise exception 'club-chat-posts: a non-officer author could still edit a club post';
    end if;
  end if;

  -- d. DMs and groups are unchanged: a member still sees the whole roster.
  select cm.channel_id, cm.user_id into v_dm, v_dm_user
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is null
   order by cm.created_at limit 1;
  if v_dm is not null then
    select count(*) into v_dm_total from public.channel_members where channel_id = v_dm;
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_dm_user, 'role', 'authenticated')::text, true);
      select count(*) into seen_dm from public.channel_members where channel_id = v_dm;
      raise exception '%', done;
    exception when others then if sqlerrm <> done then raise; end if;
    end;
    if seen_dm <> v_dm_total then
      raise exception 'club-chat-posts: a DM/group member now sees % of % roster rows', seen_dm, v_dm_total;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
