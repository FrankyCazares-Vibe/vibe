-- Security wave 2, batch B4: what a post tag is, in the database too.
--
-- WHY THIS EXISTS (#10, handoffs/2026-09-27-security-lenses-authz-dataexp.md):
--   `authenticated` holds INSERT and UPDATE on posts.tags, and the browser
--   holds the anon key, so a student can skip /api/me/publish-post and write
--   tags straight over PostgREST: a thousand tags, a 5,000-character tag,
--   the same tag 50 times, markup, upper case. Nothing in the database
--   checked them, and Trending counted every array element, so one direct
--   write could put any string at the top of a whole campus's strip. A
--   tags-only direct UPDATE also left no "Edited" mark (posts_stamp_edited
--   only looked at content).
--
-- WHAT THIS FILE DOES
--   1. public.post_tags_ok(text[]) -> boolean. IMMUTABLE, SECURITY INVOKER,
--      empty search_path, reads no table. True when the array is not NULL,
--      one-dimensional (or empty), at most 10 elements, no NULL element,
--      every element matches '^[a-z0-9_]{1,32}$', and no duplicates. The
--      same rule as src/lib/posts/tags.ts (POST_TAG_RE, POST_TAG_MAX,
--      normalizePostTags); change both together. EXECUTE granted to anon,
--      authenticated and service_role (the trigger calls it as the writer).
--   2. public.posts_check_tags() + trigger posts_check_tags, BEFORE INSERT OR
--      UPDATE OF tags ON public.posts. On INSERT, and on UPDATE only when the
--      tags actually change, a failing array raises SQLSTATE 23514 with hint
--      'tags_invalid' (PostgREST answers 400). Same shape as
--      posts_check_media_refs (20260927120000). Every writer is covered:
--      PostgREST, the routes' cookie client and the service role.
--   3. public.posts_stamp_edited() restated word for word, changing only
--      `new.content is distinct from old.content` to
--      `(new.content is distinct from old.content or new.tags is distinct
--      from old.tags)`: a tags-only edit of a published post now shows
--      "Edited". CREATE OR REPLACE keeps its owner and ACL (postgres +
--      service_role).
--
-- DOES NOT: revoke the tags INSERT/UPDATE grants (PATCH /api/posts/[id]
--   writes tags with the cookie client; the routes derive valid tags, so the
--   trigger never refuses them); run the word list (TypeScript only:
--   publish-post and PATCH refuse a listed tag, and Trending drops one at
--   count time, src/lib/trending/count-tags.ts); touch any posts policy
--   (B2's 20260929110000 owns posts_update_own and the delete policies; this
--   file pins none of them); change or rewrite any row; REVOKE EXECUTE on any
--   function (standing rule; the trigger function keeps the schema's default
--   grants, which are harmless: a trigger function can't be called directly).
--
-- LIVE STATE (read-only MCP, 2026-09-28, schema_migrations max 20260928160000):
--   * posts.tags text[] NOT NULL DEFAULT '{}'. has_column_privilege
--     authenticated INSERT(tags) true, UPDATE(tags) true.
--   * posts: 23 rows, 4 with tags. Rows failing post_tags_ok's rule (NULL,
--     multi-dimensional, > 10, NULL element, not ^[a-z0-9_]{1,32}$, or a
--     duplicate): 0. So no existing row is refused or rewritten.
--   * Triggers on posts: bump_org_activity_on_post (AFTER INSERT),
--     posts_check_media_refs (BEFORE INSERT OR UPDATE OF media_url,
--     media_thumbnail_url), posts_stamp_campus (BEFORE INSERT OR UPDATE),
--     posts_stamp_edited (BEFORE UPDATE). None reads tags.
--   * md5(pg_get_functiondef('public.posts_stamp_edited'::regproc)) =
--     f3a2e0e0e4e2dac652529abcecc8eb7c; proacl
--     {postgres=X/postgres,service_role=X/postgres}. Local matches.
--   * No function public.post_tags_ok / public.posts_check_tags, no trigger
--     posts_check_tags. PostgreSQL 17.6, ICU default collation (the pattern
--     uses explicit ASCII ranges, so it doesn't depend on the locale; B0
--     checked 22 odd samples locally: identical to the JS POST_TAG_RE).
--   PRE-FLIGHT pins only what this file depends on: the tags column, the
--   free names, the posts_stamp_edited text, and 0 violating rows.
--
-- APPLY ORDER vs THE DEPLOY: AFTER the deploy is live and the served build is
--   verified. The OLD publish-post keeps Unicode tags (the desktop composer
--   sends "café"; a direct caller can send "½"), which this trigger refuses,
--   so with the old code serving that publish would answer a bare 500. The
--   new code (normalizePostTags: a-z 0-9 _ only, at most 10, no duplicates)
--   works against the database before and after this file, so code first is
--   always safe. Apply via the management API (MCP is read-only), then the
--   schema_migrations row (20260929120000, 'post_tags_rules').
--
-- TESTED on the local database (supabase_db_vibe): see
--   handoffs/wave-plan-sec2/notes-B4.md (direct INSERT/UPDATE as a signed-in
--   student refused for 11 tags, upper case, "#a", a duplicate, "café";
--   ordinary tags pass; a tags-only edit stamps edited_at; a moderator's
--   removed_at update on the same row is untouched).
--
-- ROLLBACK (one transaction):
--   BEGIN;
--   DROP TRIGGER IF EXISTS posts_check_tags ON public.posts;
--   DROP FUNCTION IF EXISTS public.posts_check_tags();
--   DROP FUNCTION IF EXISTS public.post_tags_ok(text[]);
--   CREATE OR REPLACE FUNCTION public.posts_stamp_edited()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SET search_path TO 'public'
--   AS $function$
--   begin
--     if old.status = 'published' and new.status is distinct from old.status then
--       raise exception 'published posts cannot return to draft' using errcode = '42501';
--     end if;
--     if old.status = 'published' and new.content is distinct from old.content then new.edited_at := now();
--     else new.edited_at := old.edited_at; end if;
--     return new;
--   end $function$;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   (After it, md5(pg_get_functiondef('public.posts_stamp_edited'::regproc))
--   is f3a2e0e0e4e2dac652529abcecc8eb7c again.)
-- ---------------------------------------------------------------------------

begin;

-- CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on posts until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog) ------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.posts'::regclass and a.attname = 'tags'
                    and not a.attisdropped and a.attnotnull
                    and a.atttypid = 'text[]'::regtype) then
    raise exception 'post-tags: posts.tags is not a NOT NULL text[] any more; stop and re-read it';
  end if;
  if to_regprocedure('public.post_tags_ok(text[])') is not null
     or exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace
                   and p.proname in ('post_tags_ok', 'posts_check_tags')) then
    raise exception 'post-tags: post_tags_ok / posts_check_tags already exist; stop and re-read them';
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgname = 'posts_check_tags' and not t.tgisinternal) then
    raise exception 'post-tags: a trigger named posts_check_tags already exists';
  end if;
  if md5(pg_get_functiondef('public.posts_stamp_edited'::regproc))
       <> 'f3a2e0e0e4e2dac652529abcecc8eb7c' then
    raise exception 'post-tags: posts_stamp_edited drifted from the text this file restates; re-read it';
  end if;
end $$;

-- 1. The rule ------------------------------------------------------------------
-- CASE, not AND: SQL does not promise the order an AND is evaluated in, and
-- unnest/count on a multi-dimensional array would read it flat. The guards run
-- first, in order.
create function public.post_tags_ok(p_tags text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_tags is null then false
    when coalesce(array_ndims(p_tags), 1) <> 1 then false
    when cardinality(p_tags) > 10 then false
    else not exists (select 1 from unnest(p_tags) as t(tag)
                      where t.tag is null or t.tag !~ '^[a-z0-9_]{1,32}$')
         and (select count(distinct t.tag) from unnest(p_tags) as t(tag)) = cardinality(p_tags)
  end
$$;

comment on function public.post_tags_ok(text[]) is
  'S67 security wave B (B4): a post''s tags are at most 10 different tags of 1-32 characters from a-z, 0-9 and _. Twin of src/lib/posts/tags.ts; change both together.';

-- Standing rule: every role that could write a post may call it. Pure; reads no table.
grant execute on function public.post_tags_ok(text[]) to anon, authenticated, service_role;

-- 0b. PRE-FLIGHT (rows), with the rule itself: no existing row may fail it.
do $$
declare
  n_bad bigint;
begin
  select count(*) into n_bad from public.posts p where not public.post_tags_ok(p.tags);
  if n_bad > 0 then
    raise exception 'post-tags: % existing post(s) fail the tag rule; look at them before applying', n_bad;
  end if;
end $$;

-- 2. The trigger ---------------------------------------------------------------
-- New writes only: an INSERT, or an UPDATE that changes the tags. A moderator
-- setting removed_at, a caption-only edit or the org FK's SET NULL never
-- re-checks tags (and 0 rows would fail today anyway).
create function public.posts_check_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.tags is distinct from old.tags)
     and not public.post_tags_ok(new.tags) then
    raise exception using
      errcode = '23514',
      message = 'posts.tags must be at most 10 different tags of 1-32 lowercase letters, digits or _',
      hint = 'tags_invalid';
  end if;
  return new;
end;
$$;

comment on function public.posts_check_tags() is
  'S67 security wave B (B4): BEFORE INSERT OR UPDATE OF tags on posts; refuses (23514, hint tags_invalid) tags that fail public.post_tags_ok.';

create trigger posts_check_tags
  before insert or update of tags on public.posts
  for each row execute function public.posts_check_tags();

-- 3. "Edited" covers tags too: the live text word for word, plus the tags clause.
CREATE OR REPLACE FUNCTION public.posts_stamp_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'published' and new.status is distinct from old.status then
    raise exception 'published posts cannot return to draft' using errcode = '42501';
  end if;
  if old.status = 'published' and (new.content is distinct from old.content or new.tags is distinct from old.tags) then new.edited_at := now();
  else new.edited_at := old.edited_at; end if;
  return new;
end $function$;

-- 4. POST-CHECK, part 1: the catalog reads as sections 1-3 say, and the rule
--    answers like src/lib/posts/tags.ts.
do $$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgname = 'posts_check_tags' and t.tgrelid = 'public.posts'::regclass
                    and t.tgenabled = 'O' and not t.tgisinternal
                    and pg_get_triggerdef(t.oid) like
                      'CREATE TRIGGER posts_check_tags BEFORE INSERT OR UPDATE OF tags ON public.posts FOR EACH ROW %') then
    raise exception 'post-tags: trigger posts_check_tags missing, disabled or not BEFORE INSERT OR UPDATE OF tags';
  end if;
  if exists (select 1 from pg_proc p
              where p.oid = 'public.post_tags_ok(text[])'::regprocedure
                and (p.provolatile <> 'i' or p.prosecdef
                     or p.proconfig is distinct from array['search_path=""']
                     or not has_function_privilege('anon', p.oid, 'execute')
                     or not has_function_privilege('authenticated', p.oid, 'execute')
                     or not has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'post-tags: post_tags_ok is not IMMUTABLE INVOKER with an empty search_path, or not executable';
  end if;
  if position('new.tags is distinct from old.tags'
              in pg_get_functiondef('public.posts_stamp_edited'::regproc)) = 0
     or (select p.proacl::text from pg_proc p where p.oid = 'public.posts_stamp_edited'::regproc)
          <> '{postgres=X/postgres,service_role=X/postgres}' then
    raise exception 'post-tags: posts_stamp_edited lacks the tags clause or its ACL changed';
  end if;

  -- What the app writes passes.
  if not (public.post_tags_ok('{}')
          and public.post_tags_ok('{a}')
          and public.post_tags_ok('{_}')
          and public.post_tags_ok('{campus_life,iu_2026,class_of_2027}')
          and public.post_tags_ok(array[repeat('z', 32)])
          and public.post_tags_ok('{t0,t1,t2,t3,t4,t5,t6,t7,t8,t9}')) then
    raise exception 'post-tags: post_tags_ok refused tags the app stores';
  end if;
  -- What the app never writes is refused.
  if coalesce(public.post_tags_ok(null), true)
     or coalesce(public.post_tags_ok('{t0,t1,t2,t3,t4,t5,t6,t7,t8,t9,t10}'), true)
     or coalesce(public.post_tags_ok('{a,a}'), true)
     or coalesce(public.post_tags_ok('{A}'), true)
     or coalesce(public.post_tags_ok('{"a b"}'), true)
     or coalesce(public.post_tags_ok('{"#a"}'), true)
     or coalesce(public.post_tags_ok('{a-b}'), true)
     or coalesce(public.post_tags_ok('{"<b>"}'), true)
     or coalesce(public.post_tags_ok(array[null]::text[]), true)
     or coalesce(public.post_tags_ok('{a,NULL}'), true)
     or coalesce(public.post_tags_ok('{""}'), true)
     or coalesce(public.post_tags_ok(array[E'a\n']), true)
     or coalesce(public.post_tags_ok('{café}'), true)
     or coalesce(public.post_tags_ok('{½}'), true)
     or coalesce(public.post_tags_ok('{²}'), true)
     or coalesce(public.post_tags_ok(array[repeat('z', 33)]), true)
     or coalesce(public.post_tags_ok('{{a},{b}}'), true) then
    raise exception 'post-tags: post_tags_ok accepted tags it must refuse';
  end if;

  if exists (select 1 from public.posts p where not public.post_tags_ok(p.tags)) then
    raise exception 'post-tags: an existing post fails the rule after the change';
  end if;
end $$;

-- 5. POST-CHECK, part 2: behaviour. Each probe runs in its own block that ends
--    by raising a sentinel, so the probe rows, the role switch and the JWT
--    claims all roll back before the next statement; only the plpgsql
--    variables survive. Nothing a probe writes can commit.
do $$
declare
  done constant text := 'post-tags-probe-done';
  v_user uuid;
  v_id uuid;
  v_lit text;
  v_stamp timestamptz;
  v_removed_ok boolean := false;
  n_bad int := 0;
  n_refused int := 0;
  v_direct_refused boolean := false;
  v_direct_ok int := 0;
begin
  select u.id into v_user from public.users u order by u.created_at limit 1;
  if v_user is null then
    raise notice 'post-tags: no users row to probe with; catalog checks stand';
    return;
  end if;

  -- a. A good insert works; a tags-only edit of a published post stamps
  --    "Edited"; a moderator's removed_at update on it is untouched.
  begin
    insert into public.posts (user_id, type, content, tags, status)
    values (v_user, 'post', 'post-tags probe', '{campus_life,iu_2026}', 'published')
    returning id into v_id;
    update public.posts set tags = '{campus_life}' where id = v_id returning edited_at into v_stamp;
    update public.posts set removed_at = now(), removed_by = v_user where id = v_id;
    v_removed_ok := true;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if v_stamp is null then
    raise exception 'post-tags: a tags-only edit of a published post left no edited_at';
  end if;
  if not v_removed_ok then
    raise exception 'post-tags: a removed_at update on a tagged post failed';
  end if;

  -- b. Every shape the app never writes is refused on INSERT, as 23514.
  for v_lit in
    select unnest(array['{t0,t1,t2,t3,t4,t5,t6,t7,t8,t9,t10}', '{a,a}', '{A}', '{"#a"}',
                        '{"a b"}', '{café}', '{½}', '{""}', '{a,NULL}', '{{a},{b}}'])
  loop
    n_bad := n_bad + 1;
    begin
      insert into public.posts (user_id, type, content, tags, status)
      values (v_user, 'post', 'post-tags probe', v_lit::text[], 'draft');
      raise exception '%', done;
    exception
      when check_violation then n_refused := n_refused + 1;
      when others then if sqlerrm <> done then raise; end if;
    end;
  end loop;
  if n_refused <> n_bad then
    raise exception 'post-tags: only % of % bad tag arrays were refused on insert', n_refused, n_bad;
  end if;

  -- c. The direct data-API path, as the signed-in author: a bad tags UPDATE
  --    is refused; a good one (what PATCH /api/posts/[id] sends) still works.
  begin
    insert into public.posts (user_id, type, content, tags, status)
    values (v_user, 'post', 'post-tags probe', '{}', 'published')
    returning id into v_id;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    begin
      update public.posts set tags = '{UPPER,UPPER}' where id = v_id;
    exception when check_violation then v_direct_refused := true;
    end;
    update public.posts set content = 'post-tags probe #ok', tags = '{ok}' where id = v_id;
    get diagnostics v_direct_ok = row_count;
    raise exception '%', done;
  exception when others then if sqlerrm <> done then raise; end if;
  end;
  if not v_direct_refused then
    raise exception 'post-tags: a signed-in author could still write bad tags directly';
  end if;
  if v_direct_ok <> 1 then
    raise exception 'post-tags: the author''s own valid tags edit (the PATCH path) no longer works';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
