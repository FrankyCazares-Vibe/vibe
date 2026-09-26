-- Profile layout (S67 wave 2; plan handoffs/wave-plan-s67/plan.md §A,
-- contracts C3): one jsonb document per student saying which of the six
-- profile widgets (bio, experience, skills, working_on, resume, posts) show,
-- in what order, and whether the bio is docked to the side column on the
-- desktop page. One column, one default, no grant.
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only MCP, 2026-09-26, at 621b8b1):
--   * public.users has 43 columns; no profile_layout. The jsonb precedents
--     this follows: otto_settings (20260512000000), current_on
--     (20260514000000), resume_redactions (20260514100000), resume_docs.
--   * relacl {postgres=arwdDxtm, authenticated=dDxtm, service_role=arwdDxtm}.
--     No anon entry. `authenticated` holds NO table-wide SELECT (r) or UPDATE
--     (w): every column it can read or write is a column-level grant. So a
--     column added by ALTER TABLE starts with no authenticated SELECT and no
--     authenticated UPDATE, and the service role (table-wide) reads and
--     writes it. That is the 20260922130000 model ("server-only detail
--     columns"), reached here with no GRANT or REVOKE at all.
--   * authenticated can still UPDATE: current_on, department, last_active_at,
--     otto_settings, resume_docs, resume_redactions, resume_url,
--     voice_samples, website, work_order_manual, year. Unchanged by this file.
--   * 20 users. Latest RECORDED schema_migrations version: 20260923090000
--     (the repo also holds 20260924120000_push_notifications.sql; whoever
--     applies this file should check that one's row first — not this file's
--     concern, but `db push` orders by version).
--
-- WHAT IT DOES
--   1. Adds users.profile_layout jsonb NOT NULL DEFAULT '{}', with a COMMENT.
--      The empty object IS the default layout: src/lib/profile/profile-layout.ts
--      `sanitizeProfileLayout({})` fills every missing part (order = today's
--      markup order, nothing hidden, bio in the main column). No backfill, no
--      per-row write; the 20 rows take the default.
--   2. A post-check inside the transaction: the column exists, `authenticated`
--      can neither SELECT nor UPDATE it, the service role can do both. Any
--      miss aborts the file.
--   3. notify pgrst, 'reload schema', so PostgREST sees the column without
--      waiting for its periodic reload.
--
-- WHO READS AND WRITES IT (all with the service role)
--   * GET /api/me/profile-bootstrap and GET /api/users/[handle]/bootstrap
--     select it in their FIRST-tier select, next to school_system, campus_id
--     (and campus_set_at for the owner), and fall back to their BASE_* select
--     on a 42703 that names it (src/lib/db/missing-column.ts, extended list).
--     Both return it as `vibeUser.profileLayout`, sanitized.
--   * POST /api/me/profile-sync (desktop) and PATCH /api/me/profile (phone)
--     accept `profile_layout`, sanitize it, and write the WHOLE document
--     through the closed list in src/lib/profile/self-write-columns.ts.
--   * The order and the hidden set are public by nature (they ARE the
--     visited page), so the public bootstrap carries the column too. It holds
--     nothing but widget ids and one boolean.
--   * No GRANT to authenticated on purpose: no client reads users through
--     PostgREST for this, and a direct PATCH /rest/v1/users must not be able
--     to land an unsanitized document.
--
-- DEPLOY ORDER. Apply BEFORE the wave 2 push, with Franky's yes. Wave 2 code
-- names the column in three first-tier selects; pushed first, every profile
-- read would take the fallback path (the guard keeps the page up; the layout
-- silently reads as default). The wave 1 code on main (621b8b1) never names
-- the column, so applying first is safe.
--
-- PRE-CHECK (read-only):
--   1. The column doesn't exist yet and the ACL is still today's:
--        SELECT count(*) FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='users' AND column_name='profile_layout';  -- 0
--        SELECT relacl FROM pg_class WHERE oid='public.users'::regclass;
--        -- {postgres=arwdDxtm/postgres,authenticated=dDxtm/postgres,service_role=arwdDxtm/postgres}
--      Don't run POST-CHECK b before applying: has_column_privilege RAISES on
--      a column that doesn't exist.
--   2. Wave 2 is NOT the production deploy yet:
--        gh api repos/{owner}/{repo}/deployments --jq '.[0] | {sha, environment, created_at}'
--      The sha must be a wave 1 commit (621b8b1 or a wave 1 repair).
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260926100000_users_profile_layout.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync. A SEPARATE request, sent the same
--      way: save to a scratch .sql file and point --rawfile at it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260926100000', 'users_profile_layout');
--
-- POST-CHECK (read-only):
--   a. The column exists, not null, default '{}', and nobody has a layout yet:
--        SELECT data_type, is_nullable, column_default FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='users' AND column_name='profile_layout';
--        -- jsonb | NO | '{}'::jsonb
--        SELECT count(*) FROM public.users WHERE profile_layout <> '{}'::jsonb;  -- 0
--   b. Service role only (the wave 2 walk's last line):
--        SELECT has_column_privilege('authenticated','public.users','profile_layout','UPDATE') AS auth_upd,  -- f
--               has_column_privilege('authenticated','public.users','profile_layout','SELECT') AS auth_sel,  -- f
--               has_column_privilege('service_role','public.users','profile_layout','UPDATE') AS svc_upd,    -- t
--               has_column_privilege('service_role','public.users','profile_layout','SELECT') AS svc_sel;    -- t
--   c. Recorded:
--        SELECT max(version) FROM supabase_migrations.schema_migrations;  -- 20260926100000
--   d. After the wave 2 deploy, as blake: GET /api/me/profile-bootstrap
--      returns `vibeUser.profileLayout` with `v: 1` and six ids in `order`.
--
-- ROLLBACK. Additive with a default: the column can stay in place under any
-- code (wave 1 never names it; wave 2's guard falls back without it). To
-- remove it anyway, ONLY after the wave 2 routes are reverted:
--     BEGIN;
--     ALTER TABLE public.users DROP COLUMN IF EXISTS profile_layout;
--     DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926100000';
--     NOTIFY pgrst, 'reload schema';
--     COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Fail fast instead of queueing every users read and write behind the
-- ACCESS EXCLUSIVE lock ADD COLUMN takes (20 rows; held for milliseconds).
set local lock_timeout = '5s';

-- 1. the column ---------------------------------------------------------------
-- '{}' IS the default layout: the sanitizer fills every missing part, so no
-- row needs a backfill, and a future change to the default order is a code
-- change, not a data change. NOT NULL so no reader ever weighs null against {}.
alter table public.users
  add column if not exists profile_layout jsonb not null default '{}'::jsonb;

comment on column public.users.profile_layout is
  'Profile widget layout {v:1, order:[bio|experience|skills|working_on|resume|posts], hidden:[...], bioSide:bool}. ''{}'' = the default. Sanitized on every read and write by src/lib/profile/profile-layout.ts; written only by the profile routes with the service role (no authenticated grant, on purpose). S67 wave 2.';

-- 2. post-check inside the transaction: any miss aborts the whole file --------
-- `authenticated` has no table-wide SELECT or UPDATE on users (relacl dDxtm),
-- so the new column gets neither unless someone grants it. Pin that here, the
-- way 20260922130000 pins its revokes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'profile_layout'
  ) then
    raise exception 'profile_layout: column missing after add';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'profile_layout', 'SELECT')
     or has_column_privilege('authenticated', 'public.users', 'profile_layout', 'UPDATE') then
    raise exception 'profile_layout: authenticated must not read or write it (service role only)';
  end if;
  if not has_column_privilege('service_role', 'public.users', 'profile_layout', 'SELECT')
     or not has_column_privilege('service_role', 'public.users', 'profile_layout', 'UPDATE') then
    raise exception 'profile_layout: service_role lost access to users';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) -------------------------------------
notify pgrst, 'reload schema';

commit;
