-- ---------------------------------------------------------------------------
-- 20261029100000_signup_master_code.sql
--
-- PLAIN ENGLISH
-- A shared access code (Franky, Oct 25: "build a master code, it took a very
-- long time to send"). One code a founder hands out in person or by text, so a
-- friend can sign up without waiting for an invite email. It works for school
-- addresses only, up to a set number of sign-ups, until a set end (at most 30
-- days after it was made). The code's row keeps a count, never who used it;
-- like any access code, the account keeps the code's hash (20261003130000's
-- scrub, "a record of the access code you used" in the policy). Everything
-- the gate did before stays exactly as it was: club links, sign-up open, the
-- allowlist, the waitlist's own codes.
--
-- WHAT IT CHANGES
--   1. PRE-FLIGHT: auth_hooks.hook_waitlist_gate is exactly the body
--      20261021120000_club_links_gate.sql wrote (fingerprint below), and
--      public.waitlist_code_hash exists.
--   2. public.signup_master_codes: one row per shared code. Only the code's
--      SHA-256 is stored (public.waitlist_code_hash, the same as the
--      waitlist's codes), with a label, a cap, an end and a tally of the
--      gate's yeses. created_at is set by a trigger (the time of the insert,
--      never changed), so the 30-day limit can't be moved. RLS on and no
--      grants to any API role: only the gate (security definer) and a founder
--      at the SQL editor touch it.
--   3. auth_hooks.hook_waitlist_gate: the same body with one new step 4b.
--      When the typed code is no waitlist code, it is looked up here:
--        turned off or past its end -> [vibe:access_code_invalid];
--        not a school address       -> [vibe:access_code_school_email];
--        a place left               -> let in (approvals + 1);
--        no place left              -> [vibe:access_code_full].
--      PLACES ARE ACCOUNTS, not yeses (review, Oct 25): a place is taken by an
--      account whose metadata holds this code's hash (20261003130000's scrub
--      puts it there) that is confirmed, or unconfirmed and under a day old.
--      So a sign-up GoTrue fails after the gate said yes (the email cap, a
--      send error) takes no place, nor do its retries, and a mistyped or
--      made-up address gives its place back after a day. The code's row is
--      locked while the gate counts; sign-ups landing in the same instant can
--      still go a place or two over the cap. Someone with a confirmed account
--      could free their place by editing their own metadata; the cap is a
--      damage limit for a few days before launch, not a hard wall.
--      Steps 0 to 4 and 5 are untouched (the diff is only 4b and three
--      declarations).
--   4. POST-CHECK by behaviour, inside this transaction (nothing it makes is
--      kept): a shared code lets school addresses in and counts the yeses,
--      refuses a personal address, refuses once turned off; created_at can't
--      be set by hand; an unknown code and a probe with no code are refused as
--      before; grants unchanged; no API role can read or write the new table.
--      "Full" needs real accounts, so it is checked on the local stack through
--      Supabase Auth (a code with 2 places: 2 accounts, the third refused).
--
-- LIVE STATE: before, md5(pg_get_functiondef('auth_hooks.hook_waitlist_gate(
-- jsonb)')) = 0e5211f051c1add744b9f70e06851e2e on the local stack and on
-- production (read Oct 25; allowed by the counts-only rule). Anything else:
-- something changed the gate. After, the post-check's NOTICE prints the new
-- md5; read it on production too and it must equal the local stack's (the
-- connector once dropped comments inside function bodies, Oct 21).
--
-- MAKING A CODE, in this order: (1) this migration, (2) the app deploy with
-- the two new refusals (src/lib/waitlist/types.ts, view.ts) live on
-- production, (3) the code row. Before (2), a refusal of a shared code shows
-- "Something went wrong". Never put a code in this file or anywhere in git
-- (40 random bits behind a plain SHA-256 can be searched). Make one locally
-- with generateAccessCode() (src/lib/waitlist/access-code.ts), then insert
-- only its hash:
--   insert into public.signup_master_codes (code_hash, label, max_uses, expires_at)
--   values ('<64 hex>', 'friends before launch', 25, '2026-11-01 04:00+00');
-- Places taken (counts only):
--   select m.label, m.max_uses, m.approvals, m.expires_at, m.off_at,
--          (select count(*) from auth.users u
--            where u.raw_user_meta_data ->> 'access_code_hash' = m.code_hash
--              and (u.email_confirmed_at is not null
--                   or u.created_at > now() - interval '1 day')) as places_taken
--     from public.signup_master_codes m;
-- Turn one off:  update public.signup_master_codes set off_at = now() where label = '...';
--
-- TURNING IT ON: nothing to switch. The hook already points at this function
-- (Authentication > Hooks, before-user-created); CREATE OR REPLACE keeps its
-- grants and the hook's configuration. No code row, no change in behaviour.
--
-- ROLLBACK: re-run section 2 of 20261021120000_club_links_gate.sql (the
-- create or replace, with its comment), then
--   drop table public.signup_master_codes;
--   drop function public.signup_master_codes_pin_created();
--   delete from supabase_migrations.schema_migrations where version = '20261029100000';
-- Shared codes then stop working; nothing else changes.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  fp text;
begin
  if to_regprocedure('public.waitlist_code_hash(text)') is null then
    raise exception 'signup-master-code: public.waitlist_code_hash is missing';
  end if;
  select md5(pg_get_functiondef('auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure)) into fp;
  if fp is distinct from '0e5211f051c1add744b9f70e06851e2e' then
    raise exception 'signup-master-code: hook_waitlist_gate drifted (md5 %); re-read it before replacing it',
      coalesce(fp, '(missing)');
  end if;
end $$;

-- 2. THE TABLE -------------------------------------------------------------------
create table public.signup_master_codes (
  id         uuid primary key default gen_random_uuid(),
  code_hash  text not null unique
    constraint signup_master_codes_hash_check check (code_hash ~ '^[0-9a-f]{64}$'),
  label      text not null
    constraint signup_master_codes_label_check
      check (char_length(label) between 1 and 60 and strpos(label, '@') = 0),
  max_uses   integer not null
    constraint signup_master_codes_max_check check (max_uses between 1 and 500),
  approvals  integer not null default 0
    constraint signup_master_codes_approvals_check check (approvals >= 0),
  expires_at timestamptz not null,
  off_at     timestamptz,
  created_at timestamptz not null default now(),
  constraint signup_master_codes_life_check
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

-- created_at is the time of the insert and never moves, so the 30-day limit
-- holds whatever a hand-written insert or update says (review, Oct 25).
create function public.signup_master_codes_pin_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.signup_master_codes_pin_created() from public, anon, authenticated, service_role;

create trigger signup_master_codes_pin_created
  before insert or update on public.signup_master_codes
  for each row execute function public.signup_master_codes_pin_created();

alter table public.signup_master_codes enable row level security;
revoke all on table public.signup_master_codes from public, anon, authenticated, service_role;

comment on table public.signup_master_codes is
  'Shared access codes (20261029100000): SHA-256 only, school addresses only; places are accounts holding the hash; approvals is a tally, never who.';

-- 3. THE GATE, WITH THE SHARED CODE'S STEP -----------------------------------------
-- 20261021120000's body; new: mc, v_host, v_taken and step 4b.
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
  v_host     text;
  v_taken    bigint;
  r          record;
  mc         record;
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

  -- 4b. A shared code (20261029100000): one code a founder hands out, good
  -- for school addresses until its cap or its end. A place is an account
  -- holding the code's hash, confirmed or under a day old; the row keeps
  -- only a tally of yeses. The school rule is the club links' (iu.edu,
  -- purdue.edu or a subdomain).
  select m.id, m.max_uses, m.expires_at, m.off_at into mc
    from public.signup_master_codes m where m.code_hash = v_hash
     for update;
  if found then
    if mc.off_at is not null or mc.expires_at <= now() then
      return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
        '[vibe:access_code_invalid] That access code is not one we know.'::text));
    end if;
    v_host := split_part(v_email, '@', 2);
    if v_email !~ '^[^@[:space:]]+@[a-z0-9.-]+$'
       or not (v_host in ('iu.edu', 'purdue.edu')
               or v_host like '%.iu.edu' or v_host like '%.purdue.edu') then
      return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
        '[vibe:access_code_school_email] That access code needs a school email.'::text));
    end if;
    select count(*) into v_taken
      from auth.users u
     where u.raw_user_meta_data ->> 'access_code_hash' = v_hash
       and (u.email_confirmed_at is not null
            or u.created_at > now() - interval '1 day');
    if v_taken >= mc.max_uses then
      return jsonb_set(refuse::jsonb, '{error,message}', to_jsonb(
        '[vibe:access_code_full] That access code has been used as many times as it can be.'::text));
    end if;
    update public.signup_master_codes m
       set approvals = m.approvals + 1
     where m.id = mc.id;
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
  'Supabase Auth before-user-created hook: sign-up needs a club link, signup_open, the allowlist, a valid access code, or a shared code.';

-- 4. POST-CHECK (by behaviour; everything it makes is deleted again) ------------------
do $$
declare
  bad  text := '';
  f    regprocedure := 'auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure;
  t    regclass := 'public.signup_master_codes'::regclass;
  code constant text := 'VIBE-TEST-MAST';
  row_id uuid;
  got  jsonb;
  role_name text;
  priv text;
begin
  -- Grants as before: Auth reaches the hook, PUBLIC doesn't, no API role can name the schema.
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
    foreach priv in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege(role_name, t, priv) then
        bad := bad || format(' %s can %s signup_master_codes;', role_name, priv);
      end if;
    end loop;
  end loop;
  if not (select c.relrowsecurity from pg_class c where c.oid = t) then
    bad := bad || ' RLS is off on signup_master_codes;';
  end if;

  -- No code, probe on: refused as before.
  got := auth_hooks.hook_waitlist_gate(
    '{"user":{"email":"probe@example.test","user_metadata":{"vibe_gate_probe":true}}}');
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:access_code_required]%' then
    bad := bad || format(' a probe without a code gave %s;', got);
  end if;

  -- A shared code with two places. created_at is pinned to the insert,
  -- whatever the insert says.
  insert into public.signup_master_codes (code_hash, label, max_uses, expires_at, created_at)
  values (public.waitlist_code_hash(code), 'post-check', 2, now() + interval '1 hour', '2030-01-01')
  returning id into row_id;
  if (select m.created_at from public.signup_master_codes m where m.id = row_id) <> now() then
    bad := bad || ' created_at was not pinned to the insert;';
  end if;
  begin
    update public.signup_master_codes
       set created_at = now() + interval '200 days', expires_at = now() + interval '220 days'
     where id = row_id;
    bad := bad || ' moving created_at let the end go past 30 days;';
  exception when check_violation then
    null;
  end;

  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'first.person@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', lower(code)))));
  if got is distinct from '{}'::jsonb then
    bad := bad || format(' the shared code did not let a school address in (%s);', got);
  end if;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'someone@gmail.com',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', code))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:access_code_school_email]%' then
    bad := bad || format(' a personal address gave %s;', got);
  end if;
  -- Yeses with no account behind them take no place: a third school
  -- address still gets in on a two-place code (no account holds its hash).
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'second.person@pnw.purdue.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', 'testmast'))));
  if got is distinct from '{}'::jsonb then
    bad := bad || format(' the shared code did not let a second school address in (%s);', got);
  end if;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'third.person@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', code))));
  if got is distinct from '{}'::jsonb then
    bad := bad || format(' yeses with no account took a place (%s);', got);
  end if;
  if (select m.approvals from public.signup_master_codes m where m.id = row_id) <> 3 then
    bad := bad || ' the shared code did not tally exactly three yeses;';
  end if;

  -- Turned off: unknown, whatever the count.
  update public.signup_master_codes set max_uses = 10, off_at = now() where id = row_id;
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'fourth.person@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', code))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:access_code_invalid]%' then
    bad := bad || format(' a turned-off shared code gave %s;', got);
  end if;

  delete from public.signup_master_codes where id = row_id;

  -- A code that is nobody's: unknown, as before.
  got := auth_hooks.hook_waitlist_gate(jsonb_build_object('user', jsonb_build_object(
    'email', 'fifth.person@iu.edu',
    'user_metadata', jsonb_build_object('vibe_gate_probe', true, 'access_code', code))));
  if (got #>> '{error,message}') is null or (got #>> '{error,message}') not like '[vibe:access_code_invalid]%' then
    bad := bad || format(' an unknown code gave %s;', got);
  end if;

  if bad <> '' then
    raise exception 'signup-master-code post-check failed:%', bad;
  end if;
  raise notice 'signup-master-code: hook_waitlist_gate md5 is now %', md5(pg_get_functiondef(f));
end $$;

notify pgrst, 'reload schema';

commit;
