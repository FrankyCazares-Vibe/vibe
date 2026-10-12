-- ---------------------------------------------------------------------------
-- 20261011100000_my_session_count.sql
--
-- PLAIN ENGLISH
-- Settings gets a "Where you're signed in" card: how many sign-ins this
-- account has open, and a button that ends every one except this one
-- (handoffs/2026-10-11-browser-rule-plan.md, "Where you're signed in").
-- Sign-ins live in auth.sessions, which no client can read. This file adds
-- one function that answers a single number about the caller's OWN rows.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the function does not exist yet, and the role running this
--      file can read auth.sessions (the function runs as its owner; see HOW
--      TO APPLY BY HAND).
--   2. public.my_session_count(): how many auth.sessions rows belong to the
--      caller (auth.uid()). SECURITY DEFINER, search_path '', returns one
--      integer. It takes no argument, so nobody can ask about anyone else.
--   3. EXECUTE for authenticated only (not anon, not PUBLIC).
--   4. POST-CHECK, then notify pgrst.
--
-- WHAT THE NUMBER MEANS. One row per sign-in, NOT per device: every magic
-- link or password sign-in adds one, and only a sign-out removes it. Without
-- Supabase Pro nothing ever expires a row (Franky, Oct 11: no Supabase Pro),
-- so a phone that signed in three times counts three. Production had 69 rows
-- for 18 accounts on 2026-10-11. The card therefore says "active sign-ins",
-- never "devices" (skeptic amendment 3 to the plan), and its "Sign out of
-- other devices" button also clears the stale rows.
--
-- DOES NOT: return any session's id, time, IP or user agent; filter on
-- not_after (only Pro's time-box sets it; null for every row here); touch
-- auth.sessions itself or any grant on it.
--
-- LIVE STATE (as written before applying): not read for this file. Before
-- applying, read on production (a setting, allowed by the counts-only rule):
--   SELECT to_regprocedure('public.my_session_count()') IS NULL AS fn_absent;
--   -- expect t.
--
-- DEPLOY ORDER. CODE FIRST. GET /api/me/sessions on main answers
-- `count: null` while the function is missing (PGRST202 / 42883) or not
-- callable (42501), and the card then says it couldn't count. Applying this
-- file first is harmless too: nothing calls the function until the route ships.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, or the Supabase connector's
-- apply_migration with the body below minus begin/commit (then rename its
-- auto-timestamp row in schema_migrations to this file's version). Either
-- way it must run as a role that can read auth.sessions: SECURITY DEFINER
-- runs as the function's OWNER, so a function created by a lesser role exists
-- but fails every call with 42501. The connector and the CLI both run as
-- postgres, which can; the pre-flight below refuses any role that can't.
-- Then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011100000', 'my_session_count');
--
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION public.my_session_count();
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261011100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.my_session_count()') is not null then
    raise exception 'session-count: public.my_session_count() already exists (applied already?)';
  end if;
  if not has_table_privilege(current_user, 'auth.sessions', 'SELECT') then
    raise exception 'session-count: % cannot read auth.sessions; the function would fail every call (42501). Apply as postgres.', current_user;
  end if;
end $$;

-- 1. the count ---------------------------------------------------------------
create function public.my_session_count()
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select count(*)::integer from auth.sessions where user_id = auth.uid();
$$;

comment on function public.my_session_count() is
  'How many sign-ins (auth.sessions rows) the caller has open. One row per sign-in, not per device. For GET /api/me/sessions (20261011100000).';

revoke all on function public.my_session_count() from public, anon;
grant execute on function public.my_session_count() to authenticated;

-- 2. POST-CHECK inside the transaction ---------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.my_session_count()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_session_count()', 'EXECUTE') then
    raise exception 'session-count: my_session_count grants are not as written';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
