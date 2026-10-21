-- ---------------------------------------------------------------------------
-- 20261022100000_password_needed_column.sql
--
-- PLAIN ENGLISH
-- The groundwork for closing the sign-up pre-registration gap (written Oct
-- 20, 2026; design: prereg-design.md section 3, Migration A). On its own it changes
-- nothing anyone sees: it adds an empty column, lets the Terms history say
-- "accepted again at confirmation", and adds one service-role question
-- ("does this account have a password right now?"). The fix itself is
-- 20261022110000_first_confirm_drops_password.sql, which needs this file.
-- Safe with today's main: no deployed code reads or writes any of it yet.
--
-- WHAT IT DOES
--   1. public.users.password_needed_at (timestamptz, NULL = nothing owed). Set
--      only by the 20261022110000 trigger when a first email confirmation
--      removed a password chosen before the inbox was proven; cleared by
--      POST /api/me/accept-terms once a password exists. No default, so the
--      ALTER is metadata only. No grant to any API role: service role only.
--   2. public.terms_acceptances: the source check (made inline in
--      20260906120000:50, so found here by its definition, exactly one) is
--      replaced by terms_acceptances_source_check allowing 'signup',
--      'interstitial' and the new 'confirm'. Existing rows are untouched.
--   3. public.account_password_missing(p_user uuid) -> boolean: true when the
--      account has no stored password, false when it has one, NULL when there
--      is no such account. Service role only: anon and authenticated are
--      refused inside (42501), never by a revoke (20260922090000: a revoke is
--      a crash button). It lives here, not in 20261022110000, so it outlasts a
--      rollback of the trigger.
--
-- PRE-FLIGHT (inside, section 1): not applied before, and public.users has no
-- table-level SELECT for anon or authenticated (column grants are the
-- boundary, 20260903100000:34-49; a table-level SELECT would expose the new
-- column). Section 3 also stops unless exactly one source check exists.
-- On production (read 2026-10-20, catalog and counts only): one check on
-- public.terms_acceptances, terms_acceptances_source_check =
-- CHECK ((source = ANY (ARRAY['signup'::text, 'interstitial'::text]))).
--
-- POST-CHECK (inside, section 5; catalog only, nothing written): the column
-- is there and NULL-able, no API role can read, insert or update it, the
-- check lists the three sources, the function is SECURITY DEFINER with an
-- empty search_path and every API role holds EXECUTE on it. Any miss rolls
-- the whole file back. The behaviour (the refusal for anon and
-- authenticated, the answers) is checked by scripts/sql/first-confirm-check.sql
-- (S0, S10, S11) on the local stack.
--
-- HOW TO APPLY: locally `docker exec -i supabase_db_vibe psql -U postgres -d
-- postgres -v ON_ERROR_STOP=1 -q < this file`, then record the row below. On
-- production with the connector's apply_migration (the body without begin /
-- commit), then rename the row the connector records to this version:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261022100000', 'password_needed_column') on conflict (version) do nothing;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (only after 20261022110000 is rolled back and no deployed code
-- reads the column):
--   drop function public.account_password_missing(uuid);
--   alter table public.users drop column password_needed_at;
--   delete from supabase_migrations.schema_migrations where version = '20261022100000';
-- Keep the three-value check whenever a 'confirm' row exists: the Terms
-- history is never deleted, and the old two-value check would refuse it.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'users' and column_name = 'password_needed_at') then
    raise exception 'password-needed: already applied';
  end if;
  -- Column grants are the boundary (20260903100000:34-49). A table-level
  -- SELECT would expose the new column to the API roles.
  if has_table_privilege('authenticated', 'public.users', 'SELECT')
     or has_table_privilege('anon', 'public.users', 'SELECT') then
    raise exception 'password-needed: table-level SELECT on public.users';
  end if;
end $$;

-- 2. THE COLUMN ------------------------------------------------------------------
-- NULL = nothing owed. No default, so this is a metadata-only change.
alter table public.users add column password_needed_at timestamptz;
comment on column public.users.password_needed_at is
  'Set by auth_hooks.first_confirm_drops_password when a first email confirmation removed a password chosen '
  'before the inbox was proven. Cleared by POST /api/me/accept-terms once a password exists. Service role only.';

-- 3. THE TERMS HISTORY'S SOURCES ---------------------------------------------------
-- The check was created inline (20260906120000:50), so it is found by its
-- definition, and exactly one must match.
do $$
declare
  c text;
  n integer;
begin
  select count(*), max(conname) into n, c from pg_constraint
   where conrelid = 'public.terms_acceptances'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%source%';
  if n <> 1 then
    raise exception 'password-needed: expected one source check, found %', n;
  end if;
  execute format('alter table public.terms_acceptances drop constraint %I', c);
end $$;
alter table public.terms_acceptances add constraint terms_acceptances_source_check
  check (source in ('signup', 'interstitial', 'confirm'));

-- 4. "DOES THIS ACCOUNT HAVE A PASSWORD RIGHT NOW?" ----------------------------------
-- Read by /auth/terms, the choose-password page and POST /api/me/accept-terms
-- (src/lib/auth/password-needed.ts, passwordMissing). GoTrue treats NULL and
-- '' alike as "no password" (models/user.go HasPassword), and so does this.
create function public.account_password_missing(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Service role only (the same refusal as club_link_redeem_setup).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select coalesce(u.encrypted_password, '') = '' from auth.users u where u.id = p_user);
end;
$$;

comment on function public.account_password_missing(uuid) is
  'True when the account has no stored password, false when it has one, NULL for no such account. Service role only (refused inside).';

-- Never REVOKE from the API roles (20260922090000: a revoke is a crash
-- button). Grant, and refuse inside.
revoke all on function public.account_password_missing(uuid) from public;
grant execute on function public.account_password_missing(uuid) to anon, authenticated, service_role;

-- 5. POST-CHECK (catalog only; nothing is written) ------------------------------------
do $$
declare
  bad  text := '';
  f    regprocedure := 'public.account_password_missing(uuid)'::regprocedure;
  r    text;
  priv text;
  def  text;
begin
  if (select is_nullable from information_schema.columns where table_schema = 'public'
        and table_name = 'users' and column_name = 'password_needed_at') is distinct from 'YES' then
    bad := bad || ' password_needed_at is missing or NOT NULL;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach priv in array array['SELECT', 'INSERT', 'UPDATE'] loop
      if has_column_privilege(r, 'public.users', 'password_needed_at', priv) then
        bad := bad || format(' %s holds %s on password_needed_at;', r, priv);
      end if;
    end loop;
  end loop;

  select string_agg(pg_get_constraintdef(oid), ' | ') into def from pg_constraint
   where conrelid = 'public.terms_acceptances'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%source%';
  if def is null or def not like '%''signup''%' or def not like '%''interstitial''%'
     or def not like '%''confirm''%' or def like '%|%' then
    bad := bad || format(' the source check reads %s;', coalesce(def, '(none)'));
  end if;

  if not (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = f) then
    bad := bad || ' account_password_missing is not SECURITY DEFINER with an empty search_path;';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not has_function_privilege(r, f, 'execute') then
      bad := bad || format(' %s cannot execute account_password_missing (a crash button);', r);
    end if;
  end loop;

  if bad <> '' then
    raise exception 'password-needed post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
