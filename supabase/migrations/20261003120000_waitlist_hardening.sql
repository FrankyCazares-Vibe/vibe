-- Waitlist hardening (Oct 3, 2026; after the three reviews of the waitlist
-- build). Needs 20261003100000_waitlist.sql and 20261003110000_waitlist_gate.sql.
--
-- WHAT IT CHANGES, AND WHY
--   1. The gate moves to auth_hooks.hook_waitlist_gate, in a schema the REST
--      API does not expose and the API roles have no USAGE on. Turning a hook
--      on in the dashboard (Authentication > Hooks) runs SQL that REVOKEs
--      EXECUTE from anon and authenticated; on this image a refused EXECUTE
--      on a REST-reachable function segfaults the database
--      (20260922090000_guard_function_privileges). Here nothing can reach the
--      function over REST, so that revoke is harmless, and the dashboard is
--      safe to use. public.hook_waitlist_gate is dropped.
--   2. The gate's 15-minute takeover of a stale claim now also needs "no
--      account exists for the claimed address": if handle_new_user's redeem
--      ever failed (it only WARNs), the code can't make a second account.
--   3. handle_new_user redeems a code only when the gate claimed it for this
--      address, or nobody claimed it because sign-up is open. An allowlisted
--      sign-up carrying someone else's code no longer marks their row joined.
--      It reads access_code_hash (20261003130000 replaces the typed code with
--      its hash before the row is written) or, failing that, access_code.
--   4. waitlist.invite_token_hash: the invite email's own "take me off the
--      list" token. An invite no longer replaces manage_token_hash, so the
--      first email's confirm link keeps showing the person's state.
--   5. waitlist_issue_code gains p_invite_token_hash and, in single mode,
--      refuses a row whose code already made a CONFIRMED account (reason
--      "joined"); an unconfirmed one (a mistyped address) can be re-issued.
--      Every issue keeps the row's previous code state in waitlist.code_prev,
--      and waitlist_revoke_code (the undo after a failed send) puts it back:
--      the old code, its claim, its redemption and the old invite token.
--   6. Deleting an account deletes the waitlist row its code redeemed (name,
--      school address, answers) and clears any claim by its sign-in address
--      (trigger on public.users), as /legal/delete-account promises.
--
-- KNOWN, ACCEPTED (documented for the founders' runbook)
--   * Which admin paths run the gate: auth.admin.createUser does NOT (the seed
--     scripts rely on it); auth.admin.generateLink type signup / invite /
--     magiclink for a NEW address, inviteUserByEmail and the dashboard's
--     "Invite user" DO, and are refused while sign-up is closed unless the
--     address is on public.signup_allowlist. Make hand-made accounts with
--     createUser, or allowlist the address first. generateLink('recovery')
--     (the app's password reset) never creates a user.
--   * While sign-up is closed, POST /auth/v1/signup answers a new address 403
--     [vibe:access_code_required] and an existing one as GoTrue always has, so
--     it tells whether an address has an account without emailing anyone.
--     Production relies on the hosted sign-up rate limit (check it in the
--     dashboard before turning the hook on); GoTrue's CAPTCHA is the next step
--     if that is not enough.
--
-- TURNING THE HOOK ON (production, main session only, after this file, with
-- signup_open still false, after the deploy). Either is safe now:
--   * Management API (runs no SQL): PATCH /v1/projects/{ref}/config/auth with
--     {"hook_before_user_created_enabled": true,
--      "hook_before_user_created_uri": "pg-functions://postgres/auth_hooks/hook_waitlist_gate"}
--   * Dashboard > Authentication > Hooks > Before user created > Postgres >
--     schema auth_hooks > hook_waitlist_gate. Its revoke only touches a
--     function nothing outside Auth can reach. Re-run the POST-CHECK's schema
--     query afterwards (anon/authenticated/service_role: no USAGE).
-- Local: supabase/config.toml uri = "pg-functions://postgres/auth_hooks/hook_waitlist_gate".
--
-- LIVE STATE (local stack, 2026-10-03): md5(pg_get_functiondef) of
-- handle_new_user = f5a91430e6471b007a4c16ae4c3c5b22 (file 2's body),
-- public.hook_waitlist_gate = c36c14116bc4d256b74a8027aae89326,
-- waitlist_issue_code = 647aeca7ec9d81f5106b81feca241e3d,
-- waitlist_revoke_code = a34eaf52ff5ff3580671fbeb6d748094.
--
-- HOW TO APPLY BY HAND: as file 1, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003120000', 'waitlist_hardening') on conflict do nothing;
--
-- ROLLBACK: turn the hook off first (dashboard / config.toml + restart), then
-- re-run file 2's hook and handle_new_user sections and file 1's two code
-- functions, drop auth_hooks (cascade), the trigger waitlist_forget_user, the
-- function public.waitlist_forget_user(), the 6-argument waitlist_issue_code
-- and the two columns, and delete this row from schema_migrations.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  want record;
  fp text;
begin
  if to_regnamespace('auth_hooks') is not null then
    raise exception 'waitlist-hardening: schema auth_hooks already exists (applied already?)';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'waitlist'
                and column_name in ('invite_token_hash', 'code_prev')) then
    raise exception 'waitlist-hardening: already applied (waitlist.invite_token_hash / code_prev exist)';
  end if;
  for want in
    select * from (values
      ('public.handle_new_user()', 'f5a91430e6471b007a4c16ae4c3c5b22'),
      ('public.hook_waitlist_gate(jsonb)', 'c36c14116bc4d256b74a8027aae89326'),
      ('public.waitlist_issue_code(uuid,text,uuid,text,boolean)', '647aeca7ec9d81f5106b81feca241e3d'),
      ('public.waitlist_revoke_code(uuid,text)', 'a34eaf52ff5ff3580671fbeb6d748094')
    ) as t(fn, md5)
  loop
    if to_regprocedure(want.fn) is null then
      raise exception 'waitlist-hardening: % is missing; apply 20261003100000 and 20261003110000 first', want.fn;
    end if;
    select md5(pg_get_functiondef(want.fn::regprocedure)) into fp;
    if fp is distinct from want.md5 then
      raise exception 'waitlist-hardening: % drifted (md5 %); re-read it before replacing it', want.fn, fp;
    end if;
  end loop;
end $$;

-- 2. COLUMNS -------------------------------------------------------------------
alter table public.waitlist
  -- SHA-256 hex of the invite email's ?token= (its "take me off the list"
  -- link). Separate from manage_token_hash so an invite never kills the
  -- confirm email's link.
  add column invite_token_hash text unique check (invite_token_hash ~ '^[0-9a-f]{64}$'),
  -- The code state an issue replaced, for waitlist_revoke_code's undo.
  add column code_prev jsonb check (code_prev is null or jsonb_typeof(code_prev) = 'object');

-- 3. THE GATE, IN A SCHEMA THE REST API CAN'T REACH ---------------------------
-- Not in config.toml [api] schemas (production: Settings > API > Exposed
-- schemas must never list it), and no USAGE for anon, authenticated or
-- service_role. Only Supabase Auth's role may look inside.
create schema auth_hooks;
comment on schema auth_hooks is
  'Functions Supabase Auth calls (hooks, auth.users triggers). Never expose it to the REST API; '
  'only supabase_auth_admin holds USAGE.';
revoke all on schema auth_hooks from public;
grant usage on schema auth_hooks to supabase_auth_admin;

-- event = {"metadata":{...},"user":{"email":..., "user_metadata":{...}, ...}}.
-- user_metadata is signUp's options.data, verbatim; the email is lowercased.
-- The same branches as file 2; only step 4's takeover clause is new.
create function auth_hooks.hook_waitlist_gate(event jsonb)
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
  -- Only Supabase Auth runs the gate. Unreachable over REST anyway (the
  -- schema); this is the second lock.
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

  -- 4. Claim it for this address, in one statement. A claim older than 15
  -- minutes passes to another address only when the first address never got
  -- an account (creating it failed after this hook said yes).
  update public.waitlist w
     set code_claimed_email = v_email,
         code_claimed_at    = now(),
         updated_at         = now()
   where w.code_hash = v_hash
     and w.redeemed_at is null
     and w.code_expires_at > now()
     and (w.code_claimed_email is null
          or w.code_claimed_email = v_email
          or (w.code_claimed_at < now() - interval '15 minutes'
              and not exists (select 1 from auth.users u
                               where lower(u.email) = w.code_claimed_email)));
  if found then
    return '{}'::jsonb;
  end if;

  -- 5. Why not.
  select w.redeemed_at, w.code_expires_at, w.code_claimed_email into r
    from public.waitlist w where w.code_hash = v_hash;
  if not found then
    return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
      '[vibe:access_code_invalid] That access code is not one we know.'::text));
  end if;
  -- An account already exists for the address that claimed it: as good as used.
  if r.redeemed_at is not null
     or exists (select 1 from auth.users u where lower(u.email) = r.code_claimed_email) then
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

-- The standing rule's shape as a second lock: never PUBLIC; the API roles
-- hold EXECUTE and are refused inside (42501), so even if the schema were
-- ever exposed a call could not crash the database. The schema is the lock
-- that matters: without USAGE they can't name the function at all.
revoke all on function auth_hooks.hook_waitlist_gate(jsonb) from public;
grant execute on function auth_hooks.hook_waitlist_gate(jsonb)
  to supabase_auth_admin, anon, authenticated, service_role;
comment on function auth_hooks.hook_waitlist_gate(jsonb) is
  'Supabase Auth before-user-created hook: sign-up needs signup_open, the allowlist, or a valid access code.';

drop function public.hook_waitlist_gate(jsonb);

-- 4. handle_new_user(): file 2's body verbatim, with a stricter redeem block.
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

-- 5. ISSUE AND REVOKE -----------------------------------------------------------
-- As file 1, plus: p_invite_token_hash (the invite email's own token, set in
-- the same statement as the code); single mode refuses a row whose code made
-- an account that is CONFIRMED ("joined": a new code would be a second
-- account), while an unconfirmed one (a mistyped address) may be re-issued;
-- and every issue keeps the replaced state in code_prev for the undo.
drop function public.waitlist_issue_code(uuid, text, uuid, text, boolean);
create function public.waitlist_issue_code(
  p_id uuid, p_code text, p_actor uuid, p_batch text, p_single boolean,
  p_invite_token_hash text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_prev jsonb;
  r public.waitlist%rowtype;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_hash := public.waitlist_code_hash(p_code);
  if v_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;
  if p_invite_token_hash is not null and p_invite_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;

  select * into r from public.waitlist w where w.id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not coalesce(p_single, false) then
    if r.confirmed_at is null then
      return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
    end if;
    if r.code_hash is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_invited');
    end if;
  elsif r.redeemed_at is not null
        and exists (select 1 from auth.users u
                     where u.id = r.redeemed_user_id and u.email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'reason', 'joined');
  end if;

  v_prev := jsonb_build_object(
    'code_hash', r.code_hash, 'code_issued_at', r.code_issued_at, 'code_expires_at', r.code_expires_at,
    'code_claimed_at', r.code_claimed_at, 'code_claimed_email', r.code_claimed_email,
    'redeemed_at', r.redeemed_at, 'redeemed_user_id', r.redeemed_user_id,
    'invite_token_hash', r.invite_token_hash, 'invited_by', r.invited_by, 'batch', r.batch);

  begin
    update public.waitlist w
       set code_hash          = v_hash,
           code_issued_at     = now(),
           code_expires_at    = now() + interval '14 days',
           code_claimed_at    = null,
           code_claimed_email = null,
           redeemed_at        = null,
           redeemed_user_id   = null,
           invite_token_hash  = p_invite_token_hash,
           code_prev          = v_prev,
           invited_by         = p_actor,
           batch              = coalesce(nullif(btrim(p_batch), ''), w.batch),
           invite_count       = w.invite_count + 1,
           updated_at         = now()
     where w.id = p_id
    returning * into r;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'code_taken');
  end;

  return jsonb_build_object(
    'ok', true, 'email', r.email, 'name', r.name, 'expires_at', r.code_expires_at);
end;
$$;

-- Undo for a send that failed: only while the row still holds this code,
-- unused. Puts back what the issue replaced (code_prev): the old code with
-- its claim and redemption, the old invite token, actor and batch. With no
-- code_prev (issued before this file) it clears the code, as before.
create or replace function public.waitlist_revoke_code(p_id uuid, p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_hash := public.waitlist_code_hash(p_code);
  if v_hash is null then
    return false;
  end if;
  update public.waitlist w
     set code_hash          = p.v ->> 'code_hash',
         code_issued_at     = (p.v ->> 'code_issued_at')::timestamptz,
         code_expires_at    = (p.v ->> 'code_expires_at')::timestamptz,
         code_claimed_at    = (p.v ->> 'code_claimed_at')::timestamptz,
         code_claimed_email = p.v ->> 'code_claimed_email',
         redeemed_at        = (p.v ->> 'redeemed_at')::timestamptz,
         redeemed_user_id   = (p.v ->> 'redeemed_user_id')::uuid,
         invite_token_hash  = p.v ->> 'invite_token_hash',
         invited_by         = case when w.code_prev is null then w.invited_by else (p.v ->> 'invited_by')::uuid end,
         batch              = case when w.code_prev is null then w.batch else p.v ->> 'batch' end,
         code_prev          = null,
         invite_count       = greatest(w.invite_count - 1, 0),
         updated_at         = now()
    from (select coalesce(x.code_prev, '{}'::jsonb) as v from public.waitlist x where x.id = p_id) p
   where w.id = p_id
     and w.code_hash = v_hash
     and w.redeemed_at is null;
  return found;
end;
$$;

revoke all on function public.waitlist_issue_code(uuid, text, uuid, text, boolean, text) from public;
revoke all on function public.waitlist_revoke_code(uuid, text) from public;
grant execute on function public.waitlist_issue_code(uuid, text, uuid, text, boolean, text)
  to anon, authenticated, service_role;
grant execute on function public.waitlist_revoke_code(uuid, text) to anon, authenticated, service_role;

-- 6. AN ACCOUNT'S DELETION REACHES ITS WAITLIST ROW -------------------------------
-- BEFORE DELETE on public.users (auth.admin.deleteUser cascades here, and so
-- does a dashboard delete): the row its code redeemed goes, with the name,
-- school address and answers, and any claim by its sign-in address is
-- cleared. Never blocks a deletion (a failure is a WARNING). The waitlist
-- send-log rows are keyed by a server secret the database doesn't hold;
-- DELETE /api/me forgets those first (forgetWaitlistForUser).
create function public.waitlist_forget_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from public.waitlist w where w.redeemed_user_id = old.id;
    if coalesce(old.email, '') <> '' then
      update public.waitlist w
         set code_claimed_email = null, code_claimed_at = null, updated_at = now()
       where w.code_claimed_email = lower(old.email);
    end if;
  exception when others then
    raise warning 'waitlist_forget_user: skipped (%: %)', sqlstate, sqlerrm;
  end;
  return old;
end;
$$;

revoke execute on function public.waitlist_forget_user() from anon, public, authenticated;

create trigger waitlist_forget_user
  before delete on public.users
  for each row execute function public.waitlist_forget_user();

-- 7. POST-CHECK ------------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure := 'auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure;
  probe jsonb := '{"user":{"email":"probe@example.test","user_metadata":{"vibe_gate_probe":true}}}';
  r text;
begin
  if to_regprocedure('public.hook_waitlist_gate(jsonb)') is not null then
    bad := bad || ' public.hook_waitlist_gate still exists;';
  end if;
  if not has_schema_privilege('supabase_auth_admin', 'auth_hooks', 'usage')
     or not has_function_privilege('supabase_auth_admin', f, 'execute') then
    bad := bad || ' supabase_auth_admin cannot reach the hook;';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    if has_schema_privilege(r, 'auth_hooks', 'usage') or has_schema_privilege(r, 'auth_hooks', 'create') then
      bad := bad || format(' %s holds a privilege on schema auth_hooks;', r);
    end if;
  end loop;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the hook;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' the hook is not SECURITY DEFINER;';
  end if;
  if (auth_hooks.hook_waitlist_gate(probe) #>> '{error,message}') not like '[vibe:access_code_required]%' then
    bad := bad || ' the probe without a code was not refused;';
  end if;
  -- The standing rule for public: every non-trigger function callable by the API roles.
  if exists (select 1 from pg_proc p
              where p.oid in ('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure,
                              'public.waitlist_revoke_code(uuid,text)'::regprocedure)
                and not (has_function_privilege('anon', p.oid, 'execute')
                         and has_function_privilege('authenticated', p.oid, 'execute')
                         and has_function_privilege('service_role', p.oid, 'execute'))) then
    bad := bad || ' issue or revoke is refused to an API role (the standing rule);';
  end if;
  if to_regprocedure('public.waitlist_issue_code(uuid,text,uuid,text,boolean)') is not null then
    bad := bad || ' the 5-argument waitlist_issue_code still exists;';
  end if;
  if (select pg_get_functiondef('public.handle_new_user()'::regprocedure))
       not like '%code_claimed_email IS NULL AND public.signup_is_open()%' then
    bad := bad || ' handle_new_user has no stricter redeem block;';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.users'::regclass and t.tgname = 'waitlist_forget_user'
                    and t.tgenabled <> 'D') then
    bad := bad || ' waitlist_forget_user is not on public.users;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-hardening post-check failed:%', bad;
  end if;
  raise notice 'waitlist-hardening: handle_new_user md5 is now %',
    md5(pg_get_functiondef('public.handle_new_user()'::regprocedure));
end $$;

notify pgrst, 'reload schema';

commit;
