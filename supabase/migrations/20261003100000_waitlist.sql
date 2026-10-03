-- The waitlist, the launch switch and the access codes (Oct 3, 2026; the
-- waitlist build, BUILD.md section 3a and 3b; batch A, file 1 of 2).
--
-- WHY THIS EXISTS. Vibe opens in waves. Students join a waitlist with their
-- school email; the founders pick batches from /admin and each picked person
-- is emailed a single-use ACCESS CODE (VIBE-XXXX-XXXX). The code is what
-- lets a new account through the before-user-created hook that file 2
-- (20261003110000_waitlist_gate.sql) adds. One switch opens sign-up for
-- everyone at launch.
--
-- LAUNCH = one statement, no deploy:
--   update public.app_settings set value = 'true'::jsonb, updated_at = now()
--    where key = 'signup_open';
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: not applied yet (no app_settings / signup_allowlist /
--      waitlist), and the three CHECKs it widens read exactly as today's
--      (md5 of pg_get_constraintdef, below). Anything else aborts the file,
--      so a newer production rule is never silently narrowed.
--   2. public.app_settings (key/value; seeded signup_open = false and
--      waitlist_email_viewers = []), public.signup_allowlist (addresses the
--      gate always lets through: the App Review pair, founders) and
--      public.waitlist (one row per person; codes and tokens only as SHA-256).
--      RLS on, no policies, nothing for anon or authenticated: the service
--      role (server routes) is the only reader and writer.
--   3. Widens three CHECKs: email_sends_kind_check + waitlist_confirm,
--      waitlist_invite; moderation_actions_action_check + waitlist_invite,
--      waitlist_add, waitlist_remove, waitlist_reveal;
--      moderation_actions_target_type_check + waitlist. Same values, same
--      order, new ones at the end.
--   4. Functions (all search_path ''): signup_is_open() for anyone (public
--      information); waitlist_normalize_code / waitlist_code_hash (pure, the
--      same rules as src/lib/waitlist/access-code.ts); waitlist_issue_code /
--      waitlist_revoke_code (service role; refused inside for anon and
--      authenticated).
--   5. POST-CHECK, then notify pgrst, 'reload schema'.
--
-- THE STANDING RULE (20260922090000_guard_function_privileges): on this
-- image a "permission denied for FUNCTION" for anon, authenticated or
-- service_role SEGFAULTS the backend. So no function here is refused to them
-- by a REVOKE: all three hold EXECUTE, and the two writers refuse anon and
-- authenticated from inside (42501, which does not crash). BUILD.md's
-- "service_role only" grants are met that way, not with a revoke.
--
-- LIVE STATE (local stack, 2026-10-03; production not read from here):
--   * email_sends_kind_check = 1ff55ca8584f10a7f97dc6b643680272
--     (school_verification, password_reset, moderation_alert).
--   * moderation_actions_action_check = e30d12ff2a5602dbddd78d9634efd09a
--     (the 15 of 20260923090000 + image_remove, image_restore).
--   * moderation_actions_target_type_check = dbb1ba407960c58e045f56391b5262fa
--     (post, comment, message, user, org, event, channel, report; the same
--     md5 20260929100000 read from production).
--
-- DEPLOY ORDER (production; main session only): this file and file 2 BEFORE
-- the deploy. signup_open starts false, but nothing reads it until the hook
-- is switched on in the dashboard, which comes AFTER the deploy. The old
-- code never writes the new kinds, so the wider CHECKs are harmless to it.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql (production), or locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < this file
-- then record it:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003100000', 'waitlist') on conflict do nothing;
--
-- ROLLBACK (only after file 2's rollback, and after reverting the code that
-- writes the new kinds; moderation rows can never be deleted, so the narrow
-- CHECKs come back NOT VALID):
--   begin;
--   drop function public.waitlist_revoke_code(uuid, text);
--   drop function public.waitlist_issue_code(uuid, text, uuid, text, boolean);
--   drop function public.waitlist_code_hash(text);
--   drop function public.waitlist_normalize_code(text);
--   drop function public.signup_is_open();
--   drop table public.waitlist, public.signup_allowlist, public.app_settings;
--   delete from public.email_sends where kind in ('waitlist_confirm', 'waitlist_invite');
--   alter table public.email_sends drop constraint email_sends_kind_check;
--   alter table public.email_sends add constraint email_sends_kind_check
--     check (kind = any (array['school_verification', 'password_reset', 'moderation_alert']));
--   alter table public.moderation_actions drop constraint moderation_actions_action_check;
--   alter table public.moderation_actions add constraint moderation_actions_action_check
--     check (action = any (array['report_dismiss', 'report_action', 'post_remove', 'post_restore',
--       'comment_remove', 'comment_restore', 'message_remove', 'message_restore', 'org_hide',
--       'org_unhide', 'org_verify', 'org_unverify', 'user_suspend', 'user_ban', 'user_lift',
--       'image_remove', 'image_restore'])) not valid;
--   alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
--   alter table public.moderation_actions add constraint moderation_actions_target_type_check
--     check (target_type = any (array['post', 'comment', 'message', 'user', 'org', 'event',
--       'channel', 'report'])) not valid;
--   delete from supabase_migrations.schema_migrations where version = '20261003100000';
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------------

begin;

-- The CHECK swaps take ACCESS EXCLUSIVE on email_sends and moderation_actions
-- until COMMIT and re-check every row (a handful). Fail fast.
set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  fp text;
  want record;
begin
  if to_regclass('public.app_settings') is not null
     or to_regclass('public.signup_allowlist') is not null
     or to_regclass('public.waitlist') is not null then
    raise exception 'waitlist: already applied (app_settings, signup_allowlist or waitlist exists)';
  end if;

  for want in
    select * from (values
      ('public.email_sends', 'email_sends_kind_check', '1ff55ca8584f10a7f97dc6b643680272'),
      ('public.moderation_actions', 'moderation_actions_action_check', 'e30d12ff2a5602dbddd78d9634efd09a'),
      ('public.moderation_actions', 'moderation_actions_target_type_check', 'dbb1ba407960c58e045f56391b5262fa')
    ) as t(rel, con, md5)
  loop
    -- A rolled-back file leaves a narrow CHECK NOT VALID; strip that first.
    select md5(regexp_replace(pg_get_constraintdef(c.oid), ' NOT VALID$', '')) into fp
      from pg_constraint c
     where c.conrelid = want.rel::regclass and c.conname = want.con;
    if fp is distinct from want.md5 then
      raise exception 'waitlist: % drifted (md5 %, expected %); re-read it before widening it',
        want.con, coalesce(fp, '(missing)'), want.md5;
    end if;
  end loop;
end $$;

-- 2. TABLES --------------------------------------------------------------------

-- The launch switch and other small settings. Read by the gate (file 2), by
-- public.signup_is_open() and by the server (src/lib/waitlist/signup-open.ts).
create table public.app_settings (
  key        text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- A string "true" would read as closed; refuse the typo instead.
  constraint app_settings_signup_open_bool
    check (key <> 'signup_open' or jsonb_typeof(value) = 'boolean'),
  -- A jsonb array of user id strings: who may see full waitlist addresses.
  constraint app_settings_email_viewers_array
    check (key <> 'waitlist_email_viewers' or jsonb_typeof(value) = 'array')
);
insert into public.app_settings (key, value) values
  ('signup_open', 'false'::jsonb),
  ('waitlist_email_viewers', '[]'::jsonb);

-- Addresses the gate always lets through, code or not: the App Review pair
-- (scripts/seed-review-accounts.mjs), founders, a manual exception.
create table public.signup_allowlist (
  email      text primary key
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254
           and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  reason     text not null check (reason in ('review', 'founder', 'manual')),
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- One row per person. No plaintext token or code: only their SHA-256.
create table public.waitlist (
  id                 uuid primary key default gen_random_uuid(),
  -- The address mail goes to (normalizeSchoolEmail form for school addresses).
  email              text not null
    check (email = lower(email) and char_length(email) between 3 and 254
           and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  -- canonicalSchoolIdentity(email) (+tags and subdomains folded), or the
  -- lowercased address for a non-school address a founder added. One person, one row.
  email_key          text not null unique
    check (email_key = lower(email_key) and char_length(email_key) between 3 and 254
           and email_key ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  school_system      text check (school_system in ('iu', 'purdue')),
  origin             text not null default 'form' check (origin in ('form', 'founder')),
  name               text not null check (char_length(name) between 1 and 80),
  -- The onboarding scale: 1..4 = 1st..4th year, 5 = 5th+ / grad; null = prefer not to say.
  class_year         smallint check (class_year between 1 and 5),
  major              text check (char_length(major) <= 80),
  clubs              text check (char_length(clubs) <= 200),
  is_officer         boolean not null default false,
  officer_club       text check (char_length(officer_club) <= 80),
  wish               text check (char_length(wish) <= 280),
  source             text check (source ~ '^[a-z0-9_-]{1,40}$'),
  age_attested_at    timestamptz,
  consent_invite_at  timestamptz,
  consent_news_at    timestamptz,
  notice_version     text check (char_length(notice_version) <= 40),
  -- SHA-256 hex of the ?token= value; every email to this row rotates it.
  manage_token_hash  text unique check (manage_token_hash ~ '^[0-9a-f]{64}$'),
  confirm_sent_at    timestamptz,
  confirmed_at       timestamptz,
  -- SHA-256 hex of the 8 normalised code characters (waitlist_code_hash).
  code_hash          text unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_issued_at     timestamptz,
  code_expires_at    timestamptz,
  -- Written by the gate when a sign-up uses the code (file 2).
  code_claimed_at    timestamptz,
  code_claimed_email text check (char_length(code_claimed_email) <= 254),
  invited_by         uuid references public.users (id) on delete set null,
  added_by           uuid references public.users (id) on delete set null,
  batch              text check (batch ~ '^[a-z0-9-]{1,40}$'),
  invite_count       integer not null default 0 check (invite_count >= 0),
  redeemed_at        timestamptz,
  redeemed_user_id   uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- People who used the form agreed to both; a founder's hand-added row may not have.
  constraint waitlist_consent_check
    check (origin = 'founder' or (age_attested_at is not null and consent_invite_at is not null)),
  -- A code is all three columns or none of them.
  constraint waitlist_code_fields_check
    check ((code_hash is null) = (code_issued_at is null)
           and (code_hash is null) = (code_expires_at is null))
);
create index waitlist_created_at_idx on public.waitlist (created_at desc);
-- Deleting an account sets redeemed_user_id null; keep that from scanning.
create index waitlist_redeemed_user_id_idx on public.waitlist (redeemed_user_id)
  where redeemed_user_id is not null;

alter table public.app_settings enable row level security;
alter table public.signup_allowlist enable row level security;
alter table public.waitlist enable row level security;
revoke all on table public.app_settings, public.signup_allowlist, public.waitlist
  from anon, authenticated;

comment on table public.app_settings is
  'Small settings. signup_open (jsonb boolean) is the launch switch: '
  'update public.app_settings set value = ''true''::jsonb, updated_at = now() where key = ''signup_open'';';
comment on table public.signup_allowlist is
  'Addresses the before-user-created gate always lets through (App Review pair, founders).';
comment on table public.waitlist is
  'The waitlist. Service role only. Codes and tokens are stored only as SHA-256 hex.';

-- 3. THE WIDER CHECKS ----------------------------------------------------------
alter table public.email_sends drop constraint email_sends_kind_check;
alter table public.email_sends add constraint email_sends_kind_check
  check (kind = any (array['school_verification', 'password_reset', 'moderation_alert',
    'waitlist_confirm', 'waitlist_invite']));

alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action = any (array['report_dismiss', 'report_action', 'post_remove', 'post_restore',
    'comment_remove', 'comment_restore', 'message_remove', 'message_restore', 'org_hide',
    'org_unhide', 'org_verify', 'org_unverify', 'user_suspend', 'user_ban', 'user_lift',
    'image_remove', 'image_restore',
    'waitlist_invite', 'waitlist_add', 'waitlist_remove', 'waitlist_reveal']));

alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
  check (target_type = any (array['post', 'comment', 'message', 'user', 'org', 'event',
    'channel', 'report', 'waitlist']));

-- 4. FUNCTIONS -----------------------------------------------------------------

-- Is sign-up open for everyone? Public information: anyone may ask.
create function public.signup_is_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value = 'true'::jsonb from public.app_settings s where s.key = 'signup_open'),
    false);
$$;

-- The 8 characters a typed code stands for, or null. Rule for rule the same
-- as normalizeAccessCode in src/lib/waitlist/access-code.ts:
--   1. drop every character that is not an ASCII letter or digit (before
--      uppercasing, so no non-ASCII letter can uppercase into an ASCII one);
--   2. uppercase; 3. a 12-character value starting VIBE loses those 4;
--   4. O -> 0, I and L -> 1; 5. exactly 8 Crockford base32 characters.
-- Never raises.
create function public.waitlist_normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_code is null then
    return null;
  end if;
  v := upper(regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g'));
  if char_length(v) = 12 and left(v, 4) = 'VIBE' then
    v := substr(v, 5);
  end if;
  v := translate(v, 'OIL', '011');
  if v ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$' then
    return v;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- SHA-256 hex of the normalised code (what waitlist.code_hash holds), or null
-- when the code is not a valid one. 'VIBE-7KQ2-M9XD' ->
-- 28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165.
create function public.waitlist_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when n.v is null then null
              else encode(sha256(convert_to(n.v, 'UTF8')), 'hex') end
    from (select public.waitlist_normalize_code(p_code) as v) n;
$$;

-- Give one row a fresh code (the caller made it; only its hash is stored).
--   p_single = false (a batch): the row must be confirmed and have no code yet.
--   p_single = true (a founder's "Send code" / "Send a new code" on one
--   person): any row; the old code, its claim and any redemption are replaced.
-- Valid 14 days. Returns {"ok":true,"email","name","expires_at"} or
-- {"ok":false,"reason": not_found | not_confirmed | already_invited |
-- bad_code | code_taken}. code_taken = the hash clashed with another row's
-- code: make a new code and call again. A batch name that breaks
-- waitlist.batch's rule raises 23514; the routes check it first.
-- Service role only: anon and authenticated are refused inside (42501).
create function public.waitlist_issue_code(
  p_id uuid, p_code text, p_actor uuid, p_batch text, p_single boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  r public.waitlist%rowtype;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_hash := public.waitlist_code_hash(p_code);
  if v_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
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
  end if;

  begin
    update public.waitlist w
       set code_hash          = v_hash,
           code_issued_at     = now(),
           code_expires_at    = now() + interval '14 days',
           code_claimed_at    = null,
           code_claimed_email = null,
           redeemed_at        = null,
           redeemed_user_id   = null,
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

-- Undo for a send that failed: clears the code only if it is still this
-- code and unused. True when a row changed. Service role only (42501 inside).
create function public.waitlist_revoke_code(p_id uuid, p_code text)
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
     set code_hash          = null,
         code_issued_at     = null,
         code_expires_at    = null,
         code_claimed_at    = null,
         code_claimed_email = null,
         invite_count       = greatest(w.invite_count - 1, 0),
         updated_at         = now()
   where w.id = p_id
     and w.code_hash = v_hash
     and w.redeemed_at is null;
  return found;
end;
$$;

-- 5. GRANTS: the standing rule (see the header). Never PUBLIC; anon,
-- authenticated and service_role all hold EXECUTE; the two writers refuse
-- anon and authenticated from inside.
revoke all on function public.signup_is_open() from public;
revoke all on function public.waitlist_normalize_code(text) from public;
revoke all on function public.waitlist_code_hash(text) from public;
revoke all on function public.waitlist_issue_code(uuid, text, uuid, text, boolean) from public;
revoke all on function public.waitlist_revoke_code(uuid, text) from public;
grant execute on function public.signup_is_open() to anon, authenticated, service_role;
grant execute on function public.waitlist_normalize_code(text) to anon, authenticated, service_role;
grant execute on function public.waitlist_code_hash(text) to anon, authenticated, service_role;
grant execute on function public.waitlist_issue_code(uuid, text, uuid, text, boolean)
  to anon, authenticated, service_role;
grant execute on function public.waitlist_revoke_code(uuid, text) to anon, authenticated, service_role;

-- 6. POST-CHECK ----------------------------------------------------------------
do $$
declare
  bad text := '';
  t text;
  f regprocedure;
begin
  foreach t in array array['public.app_settings', 'public.signup_allowlist', 'public.waitlist'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      bad := bad || format(' %s has RLS off;', t);
    end if;
    if exists (select 1 from pg_policy p where p.polrelid = t::regclass) then
      bad := bad || format(' %s has a policy;', t);
    end if;
    if has_table_privilege('anon', t, 'select,insert,update,delete')
       or has_table_privilege('authenticated', t, 'select,insert,update,delete') then
      bad := bad || format(' anon or authenticated holds a privilege on %s;', t);
    end if;
  end loop;

  foreach f in array array[
    'public.signup_is_open()'::regprocedure,
    'public.waitlist_normalize_code(text)'::regprocedure,
    'public.waitlist_code_hash(text)'::regprocedure,
    'public.waitlist_issue_code(uuid,text,uuid,text,boolean)'::regprocedure,
    'public.waitlist_revoke_code(uuid,text)'::regprocedure]
  loop
    if not (has_function_privilege('anon', f, 'execute')
            and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
  end loop;

  if public.waitlist_code_hash('vibe 7kq2 m9xd')
     is distinct from '28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165' then
    bad := bad || ' the code hash vector is wrong;';
  end if;
  if public.signup_is_open() then
    bad := bad || ' signup_is_open() is true right after the seed;';
  end if;
  if (select string_agg(key, ',' order by key) from public.app_settings)
     is distinct from 'signup_open,waitlist_email_viewers' then
    bad := bad || ' app_settings seed rows are wrong;';
  end if;

  if bad <> '' then
    raise exception 'waitlist post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
