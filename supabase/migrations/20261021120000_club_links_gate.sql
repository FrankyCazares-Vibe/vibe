-- ---------------------------------------------------------------------------
-- 20261021120000_club_links_gate.sql
--
-- PLAIN ENGLISH
-- The sign-up gate learns about club links (the club's view, wave 1). A
-- sign-up that came through a setup link or a members' link gets in while
-- sign-up is closed, when the link still works and the address is a school
-- one. Everything the gate did before stays exactly as it was: sign-up open,
-- the allowlist, the waitlist's access codes. Needs 20261021110000.
--
-- WHAT IT CHANGES
--   1. PRE-FLIGHT: 20261021110000 is in, and auth_hooks.hook_waitlist_gate is
--      exactly the body 20261003120000_waitlist_hardening.sql wrote
--      (fingerprint below).
--   2. auth_hooks.hook_waitlist_gate: the same body with one new step 0 and
--      one new refusal:
--        0. user_metadata.club_code is a string: ask
--           auth_hooks.club_link_claim(code, email). 'ok' -> let in (a place
--           on the link is now held for this address). Anything else -> go on
--           exactly as before. This runs even when sign-up is open, so the
--           app learns, after onboarding, which club the person came for. A
--           failure inside the claim is a WARNING and counts as "no", so a
--           bug there can never block a sign-up the other steps allow.
--        3. (no access code) with a club code that was refused: say why in
--           the link's own words, [vibe:club_link_<reason>], instead of
--           [vibe:access_code_required].
--      Steps 1, 2, 4 and 5 are untouched (the diff below is only those two).
--   3. POST-CHECK by behaviour, inside this transaction (nothing it makes is
--      kept): a setup link lets one school address in, refuses a second one
--      (in_use) and a personal address (school_email); a probe with no code
--      is still refused access_code_required; grants unchanged.
--
-- LIVE STATE (local stack, 2026-10-21): md5(pg_get_functiondef(
-- 'auth_hooks.hook_waitlist_gate(jsonb)')) = 2b258dbf74c4cdbbb81772da4df3e6d4.
-- Before applying on production, read the same fingerprint there (allowed by
-- the counts-only rule). Anything else: something changed the gate; re-read it.
--
-- TURNING IT ON: nothing to switch. The hook already points at this function
-- (Authentication > Hooks, before-user-created); CREATE OR REPLACE keeps its
-- grants and the hook's configuration.
--
-- ROLLBACK: re-run section 3 of 20261003120000_waitlist_hardening.sql (the
-- create function, as CREATE OR REPLACE, with its grants), then
--   delete from supabase_migrations.schema_migrations where version = '20261021120000';
-- The links then stop letting anyone in; nothing else changes.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  fp text;
begin
  if to_regprocedure('auth_hooks.club_link_claim(text,text)') is null then
    raise exception 'club-links-gate: apply 20261021110000_club_links.sql first';
  end if;
  select md5(pg_get_functiondef('auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure)) into fp;
  if fp is distinct from '2b258dbf74c4cdbbb81772da4df3e6d4' then
    raise exception 'club-links-gate: hook_waitlist_gate drifted (md5 %); re-read it before replacing it',
      coalesce(fp, '(missing)');
  end if;
end $$;

-- 2. THE GATE, WITH THE CLUB LINK'S STEP ---------------------------------------------
-- event = {"metadata":{...},"user":{"email":..., "user_metadata":{...}, ...}}.
-- user_metadata is signUp's options.data, verbatim; the email is lowercased.
-- 20261003120000's body; new: v_club, v_club_why, step 0 and the club
-- refusal in step 3.
create or replace function auth_hooks.hook_waitlist_gate(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_meta     jsonb;
  v_email    text;
  v_code     text;
  v_hash     text;
  v_club     text;
  v_club_why text;
  r          record;
  refuse     constant text := '{"error":{"http_code":403,"message":""}}';
begin
  -- Only Supabase Auth runs the gate. Unreachable over REST anyway (the
  -- schema); this is the second lock.
  if current_setting('role', true) in ('anon', 'authenticated', 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_meta := case when jsonb_typeof(v_user -> 'user_metadata') = 'object'
                 then v_user -> 'user_metadata' else '{}'::jsonb end;
  v_email := lower(btrim(coalesce(v_user ->> 'email', '')));

  -- 0. A club link (20261021120000): a setup link or a members' link lets a
  -- school address in on its own terms, open or closed. Asked even when
  -- sign-up is open, so the place it takes tells the app, after onboarding,
  -- which club the person came for. Anything but 'ok' goes on as before; a
  -- failure inside the claim is only a WARNING and counts as no.
  v_club := case when jsonb_typeof(v_meta -> 'club_code') = 'string'
                 then btrim(v_meta ->> 'club_code') end;
  if v_club is not null and v_club <> '' and v_email <> '' then
    begin
      v_club_why := auth_hooks.club_link_claim(v_club, v_email);
    exception when others then
      raise warning 'hook_waitlist_gate: club link step skipped (%: %)', sqlstate, sqlerrm;
      v_club_why := 'invalid';
    end;
    if v_club_why = 'ok' then
      return '{}'::jsonb;
    end if;
  end if;

  -- 1. Open for everyone (the probe can only make it stricter).
  if coalesce(v_meta ->> 'vibe_gate_probe', '') <> 'true' and public.signup_is_open() then
    return '{}'::jsonb;
  end if;

  -- 2. Always-allowed addresses.
  if v_email <> '' and exists (select 1 from public.signup_allowlist a where a.email = v_email) then
    return '{}'::jsonb;
  end if;

  -- 3. A code is needed (and an address to claim it for). A sign-up that
  -- came through a club link that said no hears why in the link's words.
  v_code := case when jsonb_typeof(v_meta -> 'access_code') = 'string'
                 then btrim(v_meta ->> 'access_code') end;
  if v_code is null or v_code = '' or v_email = '' then
    if v_club_why is not null then
      return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
        case v_club_why
          when 'used' then '[vibe:club_link_used] That setup link has already been used.'
          when 'expired' then '[vibe:club_link_expired] That club link has ended.'
          when 'off' then '[vibe:club_link_off] That club link is turned off.'
          when 'full' then '[vibe:club_link_full] That club link is full.'
          when 'in_use' then '[vibe:club_link_in_use] That setup link is being used with a different email right now.'
          when 'school_email' then '[vibe:club_link_school_email] Club links need a school email.'
          else '[vibe:club_link_invalid] That club link is not one we know.'
        end));
    end if;
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

comment on function auth_hooks.hook_waitlist_gate(jsonb) is
  'Supabase Auth before-user-created hook: sign-up needs a club link, signup_open, the allowlist, or a valid access code.';

-- 3. POST-CHECK (by behaviour; everything it makes is deleted again) ------------------
do $$
declare
  bad  text := '';
  f    regprocedure := 'auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure;
  code constant text := 'TESTCL0BL1NK0000';
  link uuid;
  got  jsonb;
  role_name text;
begin
  -- Grants as before: Auth reaches it, PUBLIC doesn't, no API role can name the schema.
  if not has_function_privilege('supabase_auth_admin', f, 'execute') then
    bad := bad || ' supabase_auth_admin cannot execute the hook;';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the hook;';
  end if;
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(role_name, 'auth_hooks', 'usage') then
      bad := bad || format(' %s has USAGE on auth_hooks;', role_name);
    end if;
  end loop;

  -- No code, probe on: refused as before.
  got := auth_hooks.hook_waitlist_gate(
    '{"user":{"email":"probe@example.test","user_metadata":{"vibe_gate_probe":true}}}');
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:access_code_required]%' then
    bad := bad || format(' a probe without a code gave %s;', got);
  end if;

  -- A setup link, probe on (as if closed).
  insert into public.club_links (kind, code_hash, club_name, club_handle, checked, max_signups, expires_at)
  values ('setup', public.club_link_hash(code), 'Post-check Club', 'postcheck-club-x', true, 1, now() + interval '1 hour')
  returning id into link;

  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'first.person@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'club_code', lower(code)))));
  if got is distinct from '{}'::jsonb then
    bad := bad || format(' the setup link did not let a school address in (%s);', got);
  end if;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'second.person@purdue.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'club_code', code))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:club_link_in_use]%' then
    bad := bad || format(' a second address on a one-use link gave %s;', got);
  end if;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'someone@gmail.com',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'club_code', code))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:club_link_school_email]%' then
    bad := bad || format(' a personal address gave %s;', got);
  end if;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'third@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'club_code', 'not a code'))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:club_link_invalid]%' then
    bad := bad || format(' a bad club code gave %s;', got);
  end if;
  if (select count(*) from public.club_link_uses u where u.link_id = link) <> 1 then
    bad := bad || ' the setup link does not hold exactly one place;';
  end if;

  delete from public.club_links where id = link;

  if bad <> '' then
    raise exception 'club-links-gate post-check failed:%', bad;
  end if;
  raise notice 'club-links-gate: hook_waitlist_gate md5 is now %', md5(pg_get_functiondef(f));
end $$;

notify pgrst, 'reload schema';

commit;
