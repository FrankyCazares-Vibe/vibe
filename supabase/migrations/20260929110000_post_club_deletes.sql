-- S67 security wave 2, batch B2 (post + club deletes): a post a moderator
-- removed stays put, current club owners/admins can delete the club's posts,
-- and deleting a club deletes its posts.
-- Report: handoffs/2026-09-27-security-lenses-authz-dataexp.md #9, the Low
-- "an author can hard-delete a post a moderator removed", the Info "restore
-- guard defeated by deleting the other removed post"; waveA-build.md ruling 18;
-- waveB-build.md product calls 1-3.
--
-- WHY THIS EXISTS
--   * posts_delete_own is `auth.uid() = user_id`: an author can hard-delete a
--     post a moderator removed, straight through PostgREST, and with it the
--     record of what was removed (and the other half of a shared-photo restore
--     guard). posts_update_own has no removed_at test either, so the author can
--     also REWRITE the removed post's text, which is what a restore republishes.
--   * Nobody but the author can delete a club post. A current owner/admin can't
--     take down a post an ex-officer wrote as the club (waveB-build call 2).
--   * posts_org_id_fkey is ON DELETE SET NULL. Deleting a club turns its posts
--     into its officers' personal posts, and posts_select_authenticated only
--     asks org_content_visible when org_id is set, so a HIDDEN club's posts
--     become readable by the whole campus the moment its owner deletes it.
--   * orgs_delete (`(auth.uid() = owner_id) AND (NOT is_restricted_now())`)
--     plus authenticated's table DELETE grant let an owner delete the club
--     straight through PostgREST (`DELETE /rest/v1/orgs?id=eq.<id>`),
--     skipping DELETE /api/orgs/[slug]: no "You can't delete this club right
--     now." for a club moderators have hidden. With item 4's CASCADE that one
--     call would also erase the club's moderator-removed posts (review-B2
--     bypass F1 / breakage F1, proved locally as blake and avery, rolled back).
--
-- WHAT THIS FILE DOES
--   1. posts_update_own USING gains `(removed_at IS NULL)`; the A5b text
--      (20260928150000) is restated word for word around it. WITH CHECK is
--      restated unchanged. (Fingerprint moves off bb242564...; see POST-CHECK.)
--   2. posts_delete_own USING becomes `(auth.uid() = user_id) AND (removed_at
--      IS NULL)`. The author only, ex-officers included (they may delete a club
--      post they wrote, never edit it: posts_update_own still asks for a
--      CURRENT owner/admin). No restriction test: a suspended student may
--      still delete their own content (moderation model).
--   3. NEW posts_delete_club_officer (PERMISSIVE, DELETE, authenticated):
--      removed_at IS NULL, org_id IS NOT NULL, the caller is a CURRENT owner or
--      admin of that club (org_member_role, the same rule as edit and publish),
--      and the caller is not restricted. Mods can't (waveA call 8: mods
--      moderate chat, not content).
--   4. posts_org_id_fkey -> ON DELETE CASCADE (waveB-build call 1). The route
--      (DELETE /api/orgs/[slug]) refuses to delete a club moderators have
--      hidden; item 6 keeps the moderator-removed posts out of the cascade.
--   5. REVOKE DELETE ON public.orgs FROM authenticated. A club is deleted only
--      by DELETE /api/orgs/[slug], which deletes with the service role after
--      its owner, restriction and hidden-club checks (the only orgs delete in
--      src/ and public/; no database function deletes orgs). orgs_delete
--      STAYS, dormant, as A5b left orgs_update and channels_insert_
--      authenticated (20260928150000 item 5): with no grant PostgreSQL answers
--      42501 before RLS is asked; the ROLLBACK is one GRANT. anon holds no
--      DELETE on orgs (unchanged; PRE-FLIGHT pins it).
--   6. NEW BEFORE DELETE trigger orgs_keep_removed_posts on orgs (SECURITY
--      DEFINER, empty search_path): inside the club's delete, before the
--      cascade runs, it sets org_id = null on the club's posts a moderator
--      removed. The record survives, stays removed (author and admins only)
--      and keeps its campus (posts_stamp_campus never moves it on UPDATE).
--      It sits in the same statement as the delete, so a removal that lands
--      after the route read the club's posts is kept too, and so is every
--      removed post on any delete path, present or future.
--   7. notify pgrst, 'reload schema'.
--
-- WHY THESE SHAPES
--   * A removed row is invisible to the delete/update policies, not refused by
--     a trigger: PostgREST answers 0 rows, and the route checks removed_at
--     first and answers 409 before any file is touched (a silent 0-row delete
--     never purges: the route deletes with `.select("id")`).
--   * authenticated holds no UPDATE on posts.removed_at, org_id or user_id
--     (PRE-FLIGHT asserts it), so the author can't flip the columns these
--     rules read.
--   * DELETE under RLS also applies the SELECT policy: an officer can delete
--     another person's club post only when they can see it (published, author
--     not restricted, no block pair). A suspended author's club posts are
--     hidden from everyone anyway; the route answers 404 for those.
--   * The detach is a trigger, not a route step: a route can only read, then
--     detach, then delete, and a moderator removal landing in between went
--     down with the cascade (review-B2 bypass F3 / breakage S2). The trigger
--     function is SECURITY DEFINER because it must write posts.org_id, which
--     no API role may UPDATE; it only ever touches the rows of the club being
--     deleted. It can only run as a trigger, so its default EXECUTE ACL is
--     harmless (not revoked: standing rule; precedent org_members_drop_club_
--     access, 20260928100000).
--   * Revoking the grant, not narrowing orgs_delete: every club delete needs
--     the route's checks and file cleanup, and the route runs on the service
--     role, so no API role needs DELETE on orgs at all.
--
-- DOES NOT
--   * Touch any row. Touch posts_select_authenticated or posts_insert_
--     authenticated (not pinned either: ruling 18). Touch posts.tags or
--     posts_stamp_edited (B4, 20260929120000). Change any grant but orgs
--     DELETE for authenticated (item 5): anon keeps a table DELETE grant on
--     posts (every posts policy is TO authenticated, so it is inert, as
--     today); authenticated keeps orgs TRUNCATE (Supabase's default; no API
--     verb reaches it, and a TRUNCATE of orgs fails on its referencing
--     tables anyway). Drop orgs_delete. REVOKE EXECUTE on anything.
--   * Delete storage. The routes do that (src/lib/posts/delete-media-store.ts);
--     a moderator-removed post's files are never deleted.
--
-- LIVE STATE (read-only MCP, 2026-09-28, production at c0b0533):
--   posts policies (md5(qual|with_check)): posts_delete_own DELETE
--   f655cc3d2e5837c2fa67b191581fa78c = `(auth.uid() = user_id)`;
--   posts_insert_authenticated c46ef08b5a34198c05b09a9bb279e2b5;
--   posts_select_authenticated 19ad59364b9b85d3773638e72ad7d89a;
--   posts_update_own bb242564edecd0feeb551439d4ece148; all PERMISSIVE TO
--   authenticated; no posts_delete_club_officer. posts_org_id_fkey
--   `FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE SET NULL`.
--   authenticated UPDATE on posts.removed_at/org_id/user_id: none.
--   org_member_role(uuid,uuid) and is_restricted_now() exist.
--   orgs: orgs_delete DELETE TO authenticated USING `((auth.uid() = owner_id)
--   AND (NOT is_restricted_now()))`; has_table_privilege DELETE on orgs:
--   authenticated true, anon false, service_role true (service_role
--   bypassrls). orgs triggers: orgs_check_asset_refs, orgs_sync_join_policy
--   only; no function named orgs_keep_removed_posts. posts and orgs owned by
--   postgres, no FORCE ROW LEVEL SECURITY. posts triggers:
--   bump_org_activity_on_post, posts_check_media_refs, posts_stamp_campus,
--   posts_stamp_edited (none fires on an org_id-only UPDATE except
--   posts_stamp_campus, which keeps the campus).
--   COUNTS: posts 23, removed 0, club posts 0, removed club posts 0; orgs 5
--   (4 hidden); open reports 0. So nothing live changes hands today.
--   The local database matched on every policy text, grant and the FK.
--
-- APPLY ORDER vs THE DEPLOY: AFTER the code deploy.
--   New code on the OLD database is safe: DELETE /api/posts/[id] refuses a
--   removed post (409) before any delete or purge; an officer's delete of
--   someone else's club post hits the old author-only policy, gets 0 rows,
--   answers 404 and purges nothing; DELETE /api/orgs/[slug] deletes with the
--   service role (the old grant doesn't matter to it) and afterwards purges
--   only the posts that really went: under the old SET NULL they all survive,
--   so it purges no media.
--   Old code on the NEW database is the unsafe side: the old post DELETE
--   route ignores the row count, so an author deleting a removed post would
--   get a silent 0-row delete and the old route would still erase its R2
--   video; the old club DELETE route has no hidden-club refusal, so with the
--   CASCADE a hidden club's posts would go with it.
--   Live has 0 removed posts and 0 club posts, so both windows are empty
--   today; apply right after the deploy goes green. Apply via the management
--   API, then insert the schema_migrations row (version 20260929110000).
--
-- ROLLBACK (one transaction; code first is not needed: the new routes run on
-- the old rules, see APPLY ORDER):
--   BEGIN;
--   ALTER POLICY posts_update_own ON public.posts
--     USING ((auth.uid() = user_id) AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))))
--     WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))));
--   ALTER POLICY posts_delete_own ON public.posts USING (auth.uid() = user_id);
--   DROP POLICY IF EXISTS posts_delete_club_officer ON public.posts;
--   ALTER TABLE public.posts DROP CONSTRAINT posts_org_id_fkey,
--     ADD CONSTRAINT posts_org_id_fkey FOREIGN KEY (org_id)
--     REFERENCES public.orgs(id) ON DELETE SET NULL;
--   DROP TRIGGER IF EXISTS orgs_keep_removed_posts ON public.orgs;
--   DROP FUNCTION IF EXISTS public.orgs_keep_removed_posts();
--   GRANT DELETE ON public.orgs TO authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929110000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY / ALTER TABLE hold an ACCESS EXCLUSIVE lock on posts until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. Only the objects this file changes or leans on; any drift
--    aborts the whole file. Catalog reads only (never schema_migrations).
do $$
declare
  q text;
  c text;
  bad text;
  fk text;
  n_removed int;
  n_club int;
  n_removed_club int;
begin
  -- posts_update_own: A5b's text (20260928150000), fingerprint bb242564...
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own';
  if q is distinct from '((auth.uid() = user_id) AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text]))))'
     or c is distinct from '((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text]))))' then
    raise exception 'post-club-deletes: posts_update_own is not the one this file was written against: % | %',
      coalesce(q, '(missing)'), coalesce(c, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'posts'
     and cmd in ('UPDATE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'posts_update_own';
  if bad is not null then
    raise exception 'post-club-deletes: another permissive UPDATE policy on posts would OR around posts_update_own: %', bad;
  end if;

  -- posts_delete_own: author only, and the only permissive DELETE rule.
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_delete_own';
  if q is distinct from '(auth.uid() = user_id)' then
    raise exception 'post-club-deletes: posts_delete_own is not the one this file was written against: %', coalesce(q, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'posts'
     and cmd in ('DELETE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'posts_delete_own';
  if bad is not null then
    raise exception 'post-club-deletes: another permissive DELETE policy on posts already exists: %', bad;
  end if;

  -- The new clauses read removed_at, org_id and user_id: the author must not
  -- be able to write any of them.
  if has_column_privilege('authenticated', 'public.posts', 'removed_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts', 'org_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts', 'user_id', 'UPDATE') then
    raise exception 'post-club-deletes: authenticated can UPDATE posts.removed_at, org_id or user_id; re-read before relying on them';
  end if;

  select pg_get_constraintdef(oid) into fk from pg_constraint
   where conrelid = 'public.posts'::regclass and conname = 'posts_org_id_fkey';
  if fk is distinct from 'FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE SET NULL' then
    raise exception 'post-club-deletes: posts_org_id_fkey is not the one this file was written against: %', coalesce(fk, '(missing)');
  end if;

  if to_regprocedure('public.org_member_role(uuid,uuid)') is null
     or to_regprocedure('public.is_restricted_now()') is null then
    raise exception 'post-club-deletes: org_member_role(uuid,uuid) or is_restricted_now() is missing';
  end if;

  -- orgs: the direct delete this file closes (item 5). The ROLLBACK's single
  -- GRANT restores exactly this: authenticated yes, anon no.
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'orgs' and policyname = 'orgs_delete' and cmd = 'DELETE';
  if q is distinct from '((auth.uid() = owner_id) AND (NOT is_restricted_now()))' then
    raise exception 'post-club-deletes: orgs_delete is not the one this file was written against: %', coalesce(q, '(missing)');
  end if;
  if not has_table_privilege('authenticated', 'public.orgs', 'DELETE')
     or has_table_privilege('anon', 'public.orgs', 'DELETE')
     or not has_table_privilege('service_role', 'public.orgs', 'DELETE') then
    raise exception 'post-club-deletes: DELETE on orgs is not authenticated yes / anon no / service_role yes; re-read the grants';
  end if;

  -- orgs triggers (item 6): the name is free and nothing else fires on a
  -- club's delete that this file doesn't know about.
  if to_regprocedure('public.orgs_keep_removed_posts()') is not null then
    raise exception 'post-club-deletes: public.orgs_keep_removed_posts() already exists';
  end if;
  select string_agg(tgname, ', ') into bad from pg_trigger
   where tgrelid = 'public.orgs'::regclass and not tgisinternal
     and tgname not in ('orgs_check_asset_refs', 'orgs_sync_join_policy');
  if bad is not null then
    raise exception 'post-club-deletes: orgs has a trigger this file does not know about: %', bad;
  end if;

  select count(*) filter (where removed_at is not null),
         count(*) filter (where org_id is not null),
         count(*) filter (where org_id is not null and removed_at is not null)
    into n_removed, n_club, n_removed_club
    from public.posts;
  raise notice 'post-club-deletes: removed posts %, club posts %, removed club posts % (live 2026-09-28: 0 / 0 / 0)',
    n_removed, n_club, n_removed_club;
end $$;

-- 1. A moderator-removed post can't be edited by its author ----------------------
alter policy posts_update_own on public.posts
  using (
    (auth.uid() = user_id)
    and (removed_at is null)
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

-- 2. ... or deleted by its author ------------------------------------------------
alter policy posts_delete_own on public.posts
  using ((auth.uid() = user_id) and (removed_at is null));

-- 3. Current club owners/admins can delete the club's posts -----------------------
create policy posts_delete_club_officer on public.posts
  as permissive for delete to authenticated
  using (
    (removed_at is null)
    and (org_id is not null)
    and (org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
    and (not is_restricted_now())
  );

-- 4. Deleting a club deletes its posts --------------------------------------------
alter table public.posts
  drop constraint posts_org_id_fkey,
  add constraint posts_org_id_fkey foreign key (org_id)
    references public.orgs(id) on delete cascade;

-- 5. A club is deleted only through the route -------------------------------------
-- orgs_delete stays, dormant (header item 5).
revoke delete on table public.orgs from authenticated;

-- 6. A moderator-removed club post outlives the club -------------------------------
create function public.orgs_keep_removed_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Runs before the row goes, so before the cascade: detached, these posts
  -- no longer point at the club and the cascade can't reach them.
  update public.posts p
     set org_id = null
   where p.org_id = old.id
     and p.removed_at is not null;
  return old;                                  -- BEFORE ROW: let the delete go on
end $$;

comment on function public.orgs_keep_removed_posts() is
  'S67 sec wave 2 B2: BEFORE DELETE on orgs. Detaches (org_id -> null) the club''s posts a moderator removed, so the posts_org_id_fkey CASCADE keeps them as the record. SECURITY DEFINER because no API role may UPDATE posts.org_id.';

create trigger orgs_keep_removed_posts
  before delete on public.orgs
  for each row execute function public.orgs_keep_removed_posts();

-- 7. POST-CHECK, part 1: the catalog reads as sections 1-6 say.
do $$
declare
  q text;
  c text;
  r text[];
  p text;
  fk text;
  want_org text := '\(org_id IS NULL\) OR \(org_member_role\(org_id, auth\.uid\(\)\) = ANY \(ARRAY\[''owner''::text, ''admin''::text\]\)\)';
begin
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own';
  if q is null or q !~ '^\(\(auth\.uid\(\) = user_id\) AND \(removed_at IS NULL\) AND ' or q !~ want_org then
    raise exception 'post-club-deletes: posts_update_own USING does not read as written: %', coalesce(q, '(missing)');
  end if;
  -- WITH CHECK is A5b's text, unchanged.
  if c is distinct from '((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY[''owner''::text, ''admin''::text]))))' then
    raise exception 'post-club-deletes: posts_update_own WITH CHECK moved: %', coalesce(c, '(missing)');
  end if;

  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_delete_own';
  if q is distinct from '((auth.uid() = user_id) AND (removed_at IS NULL))' then
    raise exception 'post-club-deletes: posts_delete_own does not read as written: %', coalesce(q, '(missing)');
  end if;

  select qual, roles::text[], permissive into q, r, p from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_delete_club_officer'
     and cmd = 'DELETE';
  if q is null or p <> 'PERMISSIVE' or r is distinct from array['authenticated']
     or q !~ '^\(\(removed_at IS NULL\) AND \(org_id IS NOT NULL\) AND \(org_member_role\(org_id, auth\.uid\(\)\) = ANY \(ARRAY\[''owner''::text, ''admin''::text\]\)\) AND \(NOT is_restricted_now\(\)\)\)$' then
    raise exception 'post-club-deletes: posts_delete_club_officer does not read as written: % %', coalesce(q, '(missing)'), r;
  end if;

  select pg_get_constraintdef(oid) into fk from pg_constraint
   where conrelid = 'public.posts'::regclass and conname = 'posts_org_id_fkey';
  if fk is distinct from 'FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE' then
    raise exception 'post-club-deletes: posts_org_id_fkey does not read as written: %', coalesce(fk, '(missing)');
  end if;

  -- Item 5: no API role deletes a club directly; the route's service role still can.
  if has_table_privilege('authenticated', 'public.orgs', 'DELETE')
     or has_table_privilege('anon', 'public.orgs', 'DELETE') then
    raise exception 'post-club-deletes: an API role still holds DELETE on orgs';
  end if;
  if not has_table_privilege('service_role', 'public.orgs', 'DELETE')
     or not has_table_privilege('authenticated', 'public.orgs', 'SELECT') then
    raise exception 'post-club-deletes: the revoke took more than DELETE from authenticated on orgs';
  end if;
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'orgs' and policyname = 'orgs_delete' and cmd = 'DELETE';
  if q is distinct from '((auth.uid() = owner_id) AND (NOT is_restricted_now()))' then
    raise exception 'post-club-deletes: orgs_delete was meant to stay, dormant and unchanged: %', coalesce(q, '(missing)');
  end if;

  -- Item 6: an enabled BEFORE ROW DELETE trigger, SECURITY DEFINER, empty search_path.
  select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
         || '|' || tg.tgenabled::text || '|' || tg.tgtype::text
    into q
    from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
   where tg.tgrelid = 'public.orgs'::regclass and tg.tgname = 'orgs_keep_removed_posts'
     and p.oid = 'public.orgs_keep_removed_posts()'::regprocedure;
  -- tgtype 11 = ROW (1) + BEFORE (2) + DELETE (8).
  if q is distinct from 'true|search_path=""|O|11' then
    raise exception 'post-club-deletes: orgs_keep_removed_posts is not an enabled BEFORE ROW DELETE SECURITY DEFINER trigger: %', coalesce(q, '(missing)');
  end if;
end $$;

-- 8. POST-CHECK, part 2: behaviour, as the real role. Each probe runs in its
--    own block that ends by raising a sentinel, so the probe rows, the role
--    switch and the JWT claims all roll back; only plpgsql variables survive.
do $$
declare
  done constant text := 'post-club-deletes-probe-done';
  v_org uuid;
  v_owner uuid;
  v_other uuid;
  v_campus text;
  pid uuid;
  pid2 uuid;
  del_n int;
  upd_n int;
  left_n int;
  kept_n int;
  denied boolean;
begin
  -- A visible club with an unrestricted owner, and a student outside it who
  -- has no block with that owner, no restriction, and may publish (terms,
  -- age and school verified: has_recorded_consent() + can_publish_now(), or
  -- probe b's control edit would fail posts_update_own's WITH CHECK).
  select m.org_id, m.user_id into v_org, v_owner
    from public.org_members m join public.orgs o on o.id = m.org_id
   where m.role = 'owner' and o.hidden_at is null and public.user_visible(m.user_id)
   order by o.created_at, m.user_id limit 1;
  if v_org is not null then
    select u.id into v_other from public.users u
     where u.id <> v_owner and public.user_visible(u.id)
       and u.terms_accepted_at is not null and u.age_attested_at is not null
       and u.school_verified
       and not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u.id)
       and not public.is_blocked_either_way(v_owner, u.id)
     order by u.created_at limit 1;
  end if;
  if v_other is null then
    raise notice 'post-club-deletes: no club owner + outsider pair to probe with; catalog checks stand';
    return;
  end if;

  -- a. The author can neither delete nor edit their post a moderator removed.
  begin
    insert into public.posts (user_id, type, content, status, removed_at)
    values (v_other, 'post', 'post-club-deletes probe a', 'published', now()) returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    update public.posts set content = 'rewritten' where id = pid;
    get diagnostics upd_n = row_count;
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if upd_n <> 0 or del_n <> 0 then
    raise exception 'post-club-deletes: an author could still edit (%) or delete (%) a removed post', upd_n, del_n;
  end if;

  -- b. Control: the same author still edits and deletes a live post of their own.
  begin
    insert into public.posts (user_id, type, content, status)
    values (v_other, 'post', 'post-club-deletes probe b', 'published') returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    update public.posts set content = 'edited' where id = pid;
    get diagnostics upd_n = row_count;
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if upd_n <> 1 or del_n <> 1 then
    raise exception 'post-club-deletes: an author lost edit (%) or delete (%) on their own live post', upd_n, del_n;
  end if;

  -- c. The club's owner deletes a club post someone else (an ex-officer) wrote.
  begin
    insert into public.posts (user_id, org_id, type, content, status)
    values (v_other, v_org, 'post', 'post-club-deletes probe c', 'published') returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if del_n <> 1 then
    raise exception 'post-club-deletes: a club owner could not delete a club post (% rows)', del_n;
  end if;

  -- d. A student outside the club can't delete the owner's club post.
  begin
    insert into public.posts (user_id, org_id, type, content, status)
    values (v_owner, v_org, 'post', 'post-club-deletes probe d', 'published') returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if del_n <> 0 then
    raise exception 'post-club-deletes: a non-officer deleted someone else''s club post';
  end if;

  -- e. An ex-officer (no org_members row) deletes a club post they wrote, but
  --    can't edit it.
  begin
    insert into public.posts (user_id, org_id, type, content, status)
    values (v_other, v_org, 'post', 'post-club-deletes probe e', 'published') returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    update public.posts set content = 'reworded' where id = pid;
    get diagnostics upd_n = row_count;
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if upd_n <> 0 or del_n <> 1 then
    raise exception 'post-club-deletes: ex-officer edit % (want 0) / delete % (want 1)', upd_n, del_n;
  end if;

  -- f. Nobody, the club's owner included, deletes a removed club post.
  begin
    insert into public.posts (user_id, org_id, type, content, status, removed_at)
    values (v_other, v_org, 'post', 'post-club-deletes probe f', 'published', now()) returning id into pid;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if del_n <> 0 then
    raise exception 'post-club-deletes: a club owner deleted a moderator-removed club post';
  end if;

  -- g. A suspended/banned owner can't delete other people's club posts.
  begin
    insert into public.posts (user_id, org_id, type, content, status)
    values (v_other, v_org, 'post', 'post-club-deletes probe g', 'published') returning id into pid;
    insert into public.account_restrictions (identity_key, key_kind, user_id, kind, reason_code)
    values ('post-club-deletes-probe', 'personal', v_owner, 'ban', 'other');
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    delete from public.posts where id = pid;
    get diagnostics del_n = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if del_n <> 0 then
    raise exception 'post-club-deletes: a restricted officer deleted someone else''s club post';
  end if;

  -- h. Deleting the club the way the route does (service role) takes its live
  --    posts with it (CASCADE) and keeps a moderator-removed one, detached,
  --    still removed, on the campus it was posted to.
  begin
    insert into public.posts (user_id, org_id, type, content, status)
    values (v_other, v_org, 'post', 'post-club-deletes probe h live', 'published') returning id into pid;
    insert into public.posts (user_id, org_id, type, content, status, removed_at)
    values (v_other, v_org, 'post', 'post-club-deletes probe h removed', 'published', now())
    returning id, campus_id into pid2, v_campus;
    perform set_config('role', 'service_role', true);
    delete from public.orgs where id = v_org;
    select count(*) into left_n from public.posts where id = pid;
    select count(*) into kept_n from public.posts
     where id = pid2 and org_id is null and removed_at is not null
       and campus_id is not distinct from v_campus;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if left_n <> 0 then
    raise exception 'post-club-deletes: a deleted club''s post survived';
  end if;
  if kept_n <> 1 then
    raise exception 'post-club-deletes: a moderator-removed club post did not survive its club''s delete, detached';
  end if;

  -- i. The club's owner can't delete the club straight through the data API
  --    (no DELETE grant: 42501), so the route's hidden-club refusal holds.
  del_n := null;
  denied := false;
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    begin
      delete from public.orgs where id = v_org;
      get diagnostics del_n = row_count;
    exception when insufficient_privilege then
      denied := true;
    end;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if not denied then
    raise exception 'post-club-deletes: a club owner deleted the club directly (% rows)', del_n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
