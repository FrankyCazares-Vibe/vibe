-- ---------------------------------------------------------------------------
-- 20261008130000_users_personal_email.sql
--
-- PLAIN ENGLISH
-- School email first (S75): a person signs up with their school email, and a
-- school closes that inbox after graduation. So an account can hold a second,
-- personal address, added after sign-up and proven with a code, "so you keep
-- your account after you graduate". This file adds the two fields.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the columns do not exist; authenticated holds no
--      table-level SELECT on users (column grants are the boundary), so a new
--      column is private from the moment it exists.
--   2. users.personal_email (lowercased, 3..254, one "@") and
--      users.personal_email_verified_at. Only a PROVEN address is ever
--      stored: the confirm route writes both at once.
--   3. A unique index on personal_email: one account per personal address.
--   3b. The email log learns one more kind, 'personal_email_code' (the code
--      sent to that address), so that email is logged like every other.
--   4. POST-CHECK: neither column is readable or writable by authenticated or
--      anon. The owner reads and writes theirs through /api/me/personal-email
--      (service role, scoped to the session's user).
--
-- DOES NOT: change sign-in. The account still signs in with its sign-in
-- email. Deleting the account deletes the row and these with it.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT has_table_privilege('authenticated','public.users','SELECT') AS table_select,
--          (SELECT count(*) FROM information_schema.columns
--            WHERE table_schema='public' AND table_name='users'
--              AND column_name IN ('personal_email','personal_email_verified_at')) AS columns_present;
--   -- expect f, 0.
--
-- DEPLOY ORDER. Either order is safe: the routes answer "not available yet"
-- while the columns are missing, and nothing else reads them.
--
-- THE SAME DAY as the code that offers the step goes live: the Privacy
-- Policy names the personal email (what it is for, who can see it: only you).
--
-- HOW TO APPLY: the Supabase connector's apply_migration with the body below
-- minus begin/commit, then rename its schema_migrations row to this version
-- (as 20261008100000..120000 were).
--
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE public.email_sends DROP CONSTRAINT email_sends_kind_check;
--   ALTER TABLE public.email_sends ADD CONSTRAINT email_sends_kind_check
--     CHECK (kind IN ('school_verification', 'password_reset', 'moderation_alert',
--                     'waitlist_confirm', 'waitlist_invite'));   -- after deleting any 'personal_email_code' rows
--   DROP INDEX IF EXISTS public.users_personal_email_key;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS personal_email_verified_at,
--                            DROP COLUMN IF EXISTS personal_email;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008130000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'users'
                and column_name in ('personal_email', 'personal_email_verified_at')) then
    raise exception 'personal-email: the columns already exist (applied already?)';
  end if;
  if has_table_privilege('authenticated', 'public.users', 'SELECT')
     or has_table_privilege('anon', 'public.users', 'SELECT') then
    raise exception 'personal-email: a client role holds table-level SELECT on users; a new column would be readable';
  end if;
end $$;

-- 1. the two fields ----------------------------------------------------------
alter table public.users
  add column personal_email text
    check (personal_email is null
           or (personal_email = lower(btrim(personal_email))
               and char_length(personal_email) between 3 and 254
               and personal_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  add column personal_email_verified_at timestamptz,
  add constraint users_personal_email_proven
    check ((personal_email is null) = (personal_email_verified_at is null));

comment on column public.users.personal_email is
  'A second, personal address the person proved with a code, so the account outlives a closed school inbox. Private: no client role may read or write it (20261008130000).';

-- 2. one account per personal address ----------------------------------------
create unique index users_personal_email_key
  on public.users (personal_email)
  where personal_email is not null;

-- 2b. the email log's kinds ---------------------------------------------------
-- Same order as EMAIL_SEND_KINDS in src/lib/email/send-log-core.ts.
do $$
declare
  got text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  if got is distinct from
     'CHECK ((kind = ANY (ARRAY[''school_verification''::text, ''password_reset''::text, ''moderation_alert''::text, ''waitlist_confirm''::text, ''waitlist_invite''::text])))'
  then
    raise exception 'personal-email: email_sends_kind_check is not the one this file widens: %', coalesce(got, '(missing)');
  end if;
end $$;
alter table public.email_sends drop constraint email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check
  check (kind in ('school_verification', 'password_reset', 'moderation_alert',
                  'waitlist_confirm', 'waitlist_invite', 'personal_email_code'));

-- 3. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  col text;
  role_name text;
begin
  foreach col in array array['personal_email', 'personal_email_verified_at'] loop
    foreach role_name in array array['authenticated', 'anon'] loop
      if has_column_privilege(role_name, 'public.users', col, 'SELECT')
         or has_column_privilege(role_name, 'public.users', col, 'UPDATE')
         or has_column_privilege(role_name, 'public.users', col, 'INSERT') then
        raise exception 'personal-email: % can read or write users.%', role_name, col;
      end if;
    end loop;
  end loop;
end $$;

-- 4. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
