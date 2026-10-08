-- ---------------------------------------------------------------------------
-- 20261008110000_starter_name_not_from_email.sql
--
-- PLAIN ENGLISH
-- A new account that gives no name was named after the front of its sign-in
-- email ("jordan.lee" for jordan.lee@gmail.com), and a name is public. The
-- access-code email tells people to sign up with a personal address, so the
-- starter name showed part of it to everyone. From this file on, such an
-- account starts as "Member" until the person picks a name in onboarding
-- (page-and-code-changes.md row 24; Privacy Policy 3a, 5 and 10 "starter
-- name").
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: public.handle_new_user() must be the body
--      20261003120000_waitlist_hardening.sql wrote (fingerprint below).
--   2. Replaces it with the SAME body minus one line: the
--      `split_part(base_email, '@', 1)` arm of the name's COALESCE.
--   3. POST-CHECK: the new body no longer mentions split_part; its grants
--      are as before (supabase_auth_admin only).
--
-- DOES NOT: change any existing account. An account whose name is still the
-- front of its email keeps it until the person changes it; the count is in
-- "BEFORE THE POLICY CHANGES" below.
--
-- APPLIED ON PRODUCTION 2026-10-08 (Franky's yes), through the Supabase
-- connector's apply_migration with the body below minus begin/commit; the
-- pre-flight read matched; recorded under this file's version. 7 accounts still carried an email-based name that day, so the policy keeps the exception for accounts made before October 8.
--
-- LIVE STATE (as written before applying): not read for this file. Before applying, read on production
-- (a fingerprint, allowed by the counts-only rule):
--   SELECT md5(pg_get_functiondef('public.handle_new_user()'::regprocedure));
-- It must be 2841f3c5e2acba5f20c4009fa8204674 (the local database,
-- 2026-10-08). Anything else: something changed the function; re-read it.
--
-- DEPLOY ORDER. Either order is safe. The app already treats a starter name
-- as "no name yet" in onboarding (isTriggerDefaultName); the code that also
-- treats "Member" that way is on main.
--
-- BEFORE THE POLICY CHANGES. The three "starter name" exceptions leave the
-- Privacy Policy only when no account still carries one. Count them (a
-- count, allowed):
--   SELECT count(*) FROM public.users
--    WHERE name = split_part(email, '@', 1) AND email <> '';
-- 0 -> cut the exceptions the same day. Otherwise the policy says "accounts
-- made before <date>", or those people are asked to pick a name.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261008110000', 'starter_name_not_from_email');
--
-- ROLLBACK: re-run section 4 of 20261003120000_waitlist_hardening.sql (the
-- CREATE OR REPLACE and its REVOKE / GRANT), then
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008110000';
-- ---------------------------------------------------------------------------

begin;

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  fp text;
begin
  if to_regprocedure('public.handle_new_user()') is null then
    raise exception 'starter-name: public.handle_new_user() is missing';
  end if;
  select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) into fp;
  if fp is distinct from '2841f3c5e2acba5f20c4009fa8204674' then
    raise exception 'starter-name: handle_new_user drifted (md5 %); re-read it before replacing it', fp;
  end if;
end $$;

-- 1. handle_new_user(): 20261003120000's body verbatim, minus the email arm
--    of the name. ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  base_email text;
  derived_handle text;
  meta_terms_version text;
  meta_age_attested text;
  consent_ok boolean;
  meta_code_hash text;
BEGIN
  base_email := COALESCE(NEW.email, '');
  derived_handle := 'u' || REPLACE(NEW.id::text, '-', '');
  meta_terms_version := NULLIF(
    BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'terms_version', '')),
    ''
  );
  meta_age_attested := NEW.raw_user_meta_data ->> 'age_attested';
  consent_ok := COALESCE(meta_terms_version ~ '^\d{4}-\d{2}-\d{2}$'
    , false) AND meta_age_attested = 'true';

  INSERT INTO public.users (
    id,
    email,
    handle,
    name,
    terms_version,
    terms_accepted_at,
    age_attested_at
  )
  VALUES (
    NEW.id,
    base_email,
    derived_handle,
    -- 20261008110000: never the front of the sign-in email. A name is
    -- public, the address is not.
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      'Member'
    ),
    CASE WHEN consent_ok THEN meta_terms_version ELSE NULL END,
    CASE WHEN consent_ok THEN now() ELSE NULL END,
    CASE WHEN consent_ok THEN now() ELSE NULL END
  );

  -- F2: append-only history row for the signup acceptance. Inserted after
  -- the users row so the FK is satisfied.
  IF consent_ok THEN
    INSERT INTO public.terms_acceptances (
      user_id,
      terms_version,
      accepted_at,
      age_attested,
      source
    )
    VALUES (
      NEW.id,
      meta_terms_version,
      now(),
      true,
      'signup'
    );
  END IF;

  -- Waitlist (20261003120000): a sign-up that carried an access code marks
  -- that row redeemed by this account, but only when the gate claimed the
  -- code for this address, or nobody claimed it because sign-up is open.
  -- access_code_hash is what 20261003130000's trigger leaves in place of the
  -- typed code; access_code is read when that trigger is absent. Never
  -- blocks the account: any failure here is only a WARNING.
  BEGIN
    meta_code_hash := CASE
      WHEN (NEW.raw_user_meta_data ->> 'access_code_hash') ~ '^[0-9a-f]{64}$'
        THEN NEW.raw_user_meta_data ->> 'access_code_hash'
      WHEN jsonb_typeof(NEW.raw_user_meta_data -> 'access_code') = 'string'
        THEN public.waitlist_code_hash(NEW.raw_user_meta_data ->> 'access_code')
    END;
    IF meta_code_hash IS NOT NULL THEN
      UPDATE public.waitlist w
         SET redeemed_at = now(),
             redeemed_user_id = NEW.id,
             updated_at = now()
       WHERE w.code_hash = meta_code_hash
         AND w.redeemed_at IS NULL
         AND (w.code_claimed_email = lower(NEW.email)
              OR (w.code_claimed_email IS NULL AND public.signup_is_open()));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: waitlist redeem skipped (%: %)', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- 2. POST-CHECK inside the transaction ---------------------------------------
do $$
begin
  if position('split_part' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0 then
    raise exception 'starter-name: the new handle_new_user still reads the email for a name';
  end if;
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or not has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE') then
    raise exception 'starter-name: handle_new_user grants are not as 20261003120000 left them';
  end if;
end $$;

commit;
