-- The sign-up gate: an access code or an open switch (Oct 3, 2026; the
-- waitlist build, BUILD.md sections 2 and 3b; batch A, file 2 of 2). Needs
-- 20261003100000_waitlist.sql.
--
-- WHY IN THE DATABASE. The sign-up page calls supabase.auth.signUp from the
-- browser with the public key, so no Next route or proxy can stop a sign-up.
-- Supabase Auth's before-user-created hook can: Auth runs this function
-- before it creates ANY user and refuses the sign-up when it answers with an
-- error. It never runs at sign-in, and never for an address that already has
-- an account (GoTrue v2.189.0 signup.go: only when the user is nil), so
-- existing accounts, half-finished sign-ups and the App Review pair are
-- untouched. admin.createUser does not call it either (admin.go), so the seed
-- scripts keep working with sign-up closed.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: file 1 is in, the hook is not, and handle_new_user() is
--      exactly today's (md5 of pg_get_functiondef, below).
--   2. public.hook_waitlist_gate(event jsonb), in this order:
--        sign-up open (app_settings.signup_open) -> allow;
--        the address is on signup_allowlist -> allow;
--        no code (user_metadata.access_code) -> refuse access_code_required;
--        not a valid code, or unknown -> refuse access_code_invalid;
--        else ONE update claims the code for this address (allowed when
--        unclaimed, claimed by the same address, or claimed more than 15
--        minutes ago) -> allow;
--        else refuse access_code_used / access_code_expired / access_code_in_use.
--      Refusals: {"error":{"http_code":403,"message":"[vibe:<reason>] ..."}}.
--      supabase-js then sees error.status 403 and that message; the page
--      shows its own words for the reason (parseGateRefusal, types.ts).
--      user_metadata.vibe_gate_probe = true makes it treat the switch as
--      closed: stricter only, never opens anything (tests, ?signup=closed).
--   3. handle_new_user(): the same body plus one block after the Terms row:
--      a sign-up that carried an access_code marks that waitlist row
--      redeemed with the new user's id, inside BEGIN ... EXCEPTION, so a
--      failure there is a WARNING and never blocks an account.
--   4. Grants, POST-CHECK, notify pgrst.
--
-- WHY THE HOOK CLAIMS INSTEAD OF ONLY CHECKING. GoTrue runs the hook OUTSIDE
-- the transaction that creates the user (checkTX refuses to run it inside
-- one; internal/api/hooks.go). Check-only would let two sign-ups race one
-- code into two accounts. The claim is one UPDATE, so the second one waits
-- for the row and then finds it claimed by another address. If creating the
-- user then fails (the Auth email cap, a send error), the claim stays: the
-- same address can retry at once, another address after 15 minutes.
--
-- WHO MAY RUN THE HOOK. Supabase Auth (supabase_auth_admin, no SET ROLE).
-- The standing rule (20260922090000) forbids refusing a public function to
-- anon, authenticated or service_role with a REVOKE (that SEGFAULTS this
-- image), so all three hold EXECUTE and the hook refuses them from inside
-- (42501). Without that, anyone with the public key could call
-- /rest/v1/rpc/hook_waitlist_gate to test codes or claim them for others.
--
-- TURNING IT ON: NOT THIS FUNCTION. 20261003120000_waitlist_hardening.sql
-- moves the gate to auth_hooks.hook_waitlist_gate and drops this one (the
-- dashboard's hook form REVOKEs EXECUTE from anon, which on this image makes
-- a public function a crash button). Point the hook at
-- pg-functions://postgres/auth_hooks/hook_waitlist_gate; that file's header
-- has the production steps.
--
-- LIVE STATE (local stack, 2026-10-03): md5(pg_get_functiondef(
-- 'public.handle_new_user()')) = cb3e3ae40a7d2fcc7897d31fa9f8be66, the body of
-- 20260906120000_terms_acceptances.sql; owner postgres; SECURITY DEFINER;
-- search_path public; EXECUTE postgres, service_role, supabase_auth_admin.
-- The only trigger on auth.users is on_auth_user_created (AFTER INSERT).
--
-- HOW TO APPLY BY HAND: as file 1, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003110000', 'waitlist_gate') on conflict do nothing;
--
-- ROLLBACK: FIRST turn the hook off (dashboard, or config.toml + restart
-- locally): Auth refuses every sign-up while the hook is on and missing.
-- Then re-run the CREATE OR REPLACE of handle_new_user from
-- 20260906120000_terms_acceptances.sql (its md5 is the one above), and
--   drop function public.hook_waitlist_gate(jsonb);
--   delete from supabase_migrations.schema_migrations where version = '20261003110000';
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  fp text;
begin
  if to_regclass('public.waitlist') is null
     or to_regprocedure('public.waitlist_code_hash(text)') is null
     or to_regprocedure('public.signup_is_open()') is null then
    raise exception 'waitlist-gate: apply 20261003100000_waitlist.sql first';
  end if;
  if to_regprocedure('public.hook_waitlist_gate(jsonb)') is not null then
    raise exception 'waitlist-gate: already applied (hook_waitlist_gate exists)';
  end if;
  select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) into fp;
  if fp is distinct from 'cb3e3ae40a7d2fcc7897d31fa9f8be66' then
    raise exception 'waitlist-gate: handle_new_user() drifted (md5 %); re-read it and rebase this file on it',
      coalesce(fp, '(missing)');
  end if;
end $$;

-- 2. THE HOOK -------------------------------------------------------------------
-- event = {"metadata":{...},"user":{"email":..., "user_metadata":{...}, ...}}.
-- user_metadata is signUp's options.data, verbatim; the email is lowercased.
create function public.hook_waitlist_gate(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_meta  jsonb;
  v_email text;
  v_code  text;
  v_hash  text;
  r       record;
  refuse  constant text := '{"error":{"http_code":403,"message":""}}';
begin
  -- Only Supabase Auth runs the gate; a REST caller is refused (see header).
  if current_setting('role', true) in ('anon', 'authenticated', 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_meta := case when jsonb_typeof(v_user -> 'user_metadata') = 'object'
                 then v_user -> 'user_metadata' else '{}'::jsonb end;
  v_email := lower(btrim(coalesce(v_user ->> 'email', '')));

  -- 1. Open for everyone (the probe can only make it stricter).
  if coalesce(v_meta ->> 'vibe_gate_probe', '') <> 'true' and public.signup_is_open() then
    return '{}'::jsonb;
  end if;

  -- 2. Always-allowed addresses.
  if v_email <> '' and exists (select 1 from public.signup_allowlist a where a.email = v_email) then
    return '{}'::jsonb;
  end if;

  -- 3. A code is needed (and an address to claim it for).
  v_code := case when jsonb_typeof(v_meta -> 'access_code') = 'string'
                 then btrim(v_meta ->> 'access_code') end;
  if v_code is null or v_code = '' or v_email = '' then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_required] Vibe is opening in waves. Enter the access code from your invite email.'::text));
  end if;
  v_hash := public.waitlist_code_hash(v_code);
  if v_hash is null then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_invalid] That access code is not one we know.'::text));
  end if;

  -- 4. Claim it for this address, in one statement.
  update public.waitlist w
     set code_claimed_email = v_email,
         code_claimed_at    = now(),
         updated_at         = now()
   where w.code_hash = v_hash
     and w.redeemed_at is null
     and w.code_expires_at > now()
     and (w.code_claimed_email is null
          or w.code_claimed_email = v_email
          or w.code_claimed_at < now() - interval '15 minutes');
  if found then
    return '{}'::jsonb;
  end if;

  -- 5. Why not.
  select w.redeemed_at, w.code_expires_at into r
    from public.waitlist w where w.code_hash = v_hash;
  if not found then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_invalid] That access code is not one we know.'::text));
  end if;
  if r.redeemed_at is not null then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_used] That access code has already been used to make an account.'::text));
  end if;
  if r.code_expires_at <= now() then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_expired] That access code has expired.'::text));
  end if;
  return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
    '[vibe:access_code_in_use] That access code is being used with a different email right now.'::text));
end;
$$;

revoke all on function public.hook_waitlist_gate(jsonb) from public;
grant execute on function public.hook_waitlist_gate(jsonb)
  to supabase_auth_admin, anon, authenticated, service_role;

comment on function public.hook_waitlist_gate(jsonb) is
  'Supabase Auth before-user-created hook: sign-up needs signup_open, the allowlist, or a valid access code. '
  'Refuses REST callers from inside (the standing rule forbids a revoke).';

-- 3. handle_new_user(): 20260906120000's body verbatim, plus the waitlist
-- block after the Terms row. Same SECURITY DEFINER and search_path public.
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
  meta_access_code text;
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
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(base_email, '@', 1),
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

  -- Waitlist (20261003110000): a sign-up that carried an access code marks
  -- that row redeemed by this account (the gate claimed it for this address,
  -- or nobody did because sign-up was open). Never blocks the account: any
  -- failure here is only a WARNING.
  meta_access_code := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'access_code', '')), '');
  IF meta_access_code IS NOT NULL THEN
    BEGIN
      UPDATE public.waitlist w
         SET redeemed_at = now(),
             redeemed_user_id = NEW.id,
             updated_at = now()
       WHERE w.code_hash = public.waitlist_code_hash(meta_access_code)
         AND w.redeemed_at IS NULL
         AND (w.code_claimed_email IS NULL OR w.code_claimed_email = lower(NEW.email));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: waitlist redeem skipped (%: %)', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- 4. POST-CHECK ----------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure := 'public.hook_waitlist_gate(jsonb)'::regprocedure;
  probe jsonb := '{"user":{"email":"probe@example.test","user_metadata":{"vibe_gate_probe":true}}}';
begin
  if not has_function_privilege('supabase_auth_admin', f, 'execute') then
    bad := bad || ' supabase_auth_admin cannot execute the hook;';
  end if;
  if not (has_function_privilege('anon', f, 'execute')
          and has_function_privilege('authenticated', f, 'execute')
          and has_function_privilege('service_role', f, 'execute')) then
    bad := bad || ' the hook is refused to an API role (the standing rule);';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the hook;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' the hook is not SECURITY DEFINER;';
  end if;
  -- By behaviour (as the owner, which is how Auth's role reaches it): the
  -- probe with no code is refused, whatever the switch says.
  if (public.hook_waitlist_gate(probe) #>> '{error,message}') not like '[vibe:access_code_required]%' then
    bad := bad || ' the probe without a code was not refused;';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'
                    and t.tgfoid = 'public.handle_new_user()'::regprocedure and t.tgenabled <> 'D') then
    bad := bad || ' on_auth_user_created no longer runs handle_new_user;';
  end if;
  if (select pg_get_functiondef('public.handle_new_user()'::regprocedure)) not like '%waitlist_code_hash(meta_access_code)%' then
    bad := bad || ' handle_new_user has no waitlist block;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-gate post-check failed:%', bad;
  end if;
  raise notice 'waitlist-gate: handle_new_user md5 is now %',
    md5(pg_get_functiondef('public.handle_new_user()'::regprocedure));
end $$;

notify pgrst, 'reload schema';

commit;
