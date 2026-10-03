-- The typed access code is never stored in plain text (Oct 3, 2026; after the
-- waitlist reviews). Needs 20261003120000_waitlist_hardening.sql.
--
-- WHY. The sign-up page sends the code as options.data.access_code. GoTrue
-- writes options.data into auth.users.raw_user_meta_data AND
-- auth.identities.identity_data (seen locally: both kept 'VIBE-....' as
-- typed), so the plain code sat in the account for good, in every refreshed
-- JWT's user_metadata and in any user export: against "only its hash is
-- stored". The gate reads the code from the hook's event, before any row
-- exists, so it never needs the stored copy.
--
-- WHAT IT DOES. BEFORE INSERT OR UPDATE triggers on auth.users and
-- auth.identities, only for a row whose metadata has an access_code key:
-- the key is replaced by access_code_hash (public.waitlist_code_hash, the
-- same SHA-256 the waitlist stores; dropped when the code isn't valid).
-- UPDATE too, because GoTrue writes its in-memory metadata back later in the
-- same sign-up (the email_verified flag), and a user can call updateUser.
-- handle_new_user (AFTER INSERT) then redeems by access_code_hash
-- (20261003120000). A failure inside only drops the key: it never blocks an
-- account. What stays plain: the first session's JWT right after signUp
-- (built from GoTrue's memory and handed to the person who typed the code);
-- every refreshed token is read from the row.
--
-- IN ITS OWN FILE because it adds triggers on Supabase Auth's tables. If the
-- hosted project refuses that, 20261003120000 still stands on its own and
-- this file can wait (its absence only means the plain code is kept).
--
-- HOW TO APPLY BY HAND: as file 1, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003130000', 'waitlist_code_scrub') on conflict do nothing;
-- ROLLBACK:
--   drop trigger waitlist_scrub_access_code on auth.users;
--   drop trigger waitlist_scrub_access_code on auth.identities;
--   drop function auth_hooks.scrub_access_code_users(), auth_hooks.scrub_access_code_identities(),
--     auth_hooks.scrub_access_code(jsonb);
--   delete from supabase_migrations.schema_migrations where version = '20261003130000';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regnamespace('auth_hooks') is null or to_regprocedure('auth_hooks.hook_waitlist_gate(jsonb)') is null then
    raise exception 'waitlist-code-scrub: apply 20261003120000_waitlist_hardening.sql first';
  end if;
  if to_regprocedure('auth_hooks.scrub_access_code(jsonb)') is not null then
    raise exception 'waitlist-code-scrub: already applied';
  end if;
end $$;

-- The metadata with access_code swapped for access_code_hash. Never raises.
create function auth_hooks.scrub_access_code(meta jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if meta is null or jsonb_typeof(meta) <> 'object' or not (meta ? 'access_code') then
    return meta;
  end if;
  begin
    v_hash := case when jsonb_typeof(meta -> 'access_code') = 'string'
                   then public.waitlist_code_hash(meta ->> 'access_code') end;
  exception when others then
    v_hash := null;
  end;
  return (meta - 'access_code' - 'access_code_hash')
    || case when v_hash is null then '{}'::jsonb else jsonb_build_object('access_code_hash', v_hash) end;
end;
$$;

create function auth_hooks.scrub_access_code_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_user_meta_data := auth_hooks.scrub_access_code(new.raw_user_meta_data);
  return new;
end;
$$;

create function auth_hooks.scrub_access_code_identities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.identity_data := auth_hooks.scrub_access_code(new.identity_data);
  return new;
end;
$$;

revoke all on function auth_hooks.scrub_access_code(jsonb) from public;
revoke all on function auth_hooks.scrub_access_code_users() from public;
revoke all on function auth_hooks.scrub_access_code_identities() from public;
grant execute on function auth_hooks.scrub_access_code_users() to supabase_auth_admin;
grant execute on function auth_hooks.scrub_access_code_identities() to supabase_auth_admin;

create trigger waitlist_scrub_access_code
  before insert or update of raw_user_meta_data on auth.users
  for each row when (new.raw_user_meta_data ? 'access_code')
  execute function auth_hooks.scrub_access_code_users();

create trigger waitlist_scrub_access_code
  before insert or update of identity_data on auth.identities
  for each row when (new.identity_data ? 'access_code')
  execute function auth_hooks.scrub_access_code_identities();

-- POST-CHECK -------------------------------------------------------------------
do $$
declare
  bad text := '';
  got jsonb := auth_hooks.scrub_access_code('{"access_code":"vibe 7kq2 m9xd","access_code_hash":"x","terms_version":"t"}');
begin
  if got is distinct from
     '{"terms_version":"t","access_code_hash":"28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165"}'::jsonb then
    bad := bad || format(' scrub of a valid code gave %s;', got);
  end if;
  if auth_hooks.scrub_access_code('{"access_code":"nope","a":1}') is distinct from '{"a":1}'::jsonb then
    bad := bad || ' scrub of an invalid code kept something;';
  end if;
  if (select count(*) from pg_trigger t
       where t.tgname = 'waitlist_scrub_access_code' and t.tgenabled <> 'D'
         and t.tgrelid in ('auth.users'::regclass, 'auth.identities'::regclass)) <> 2 then
    bad := bad || ' the two triggers are not both on;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-code-scrub post-check failed:%', bad;
  end if;
end $$;

commit;
