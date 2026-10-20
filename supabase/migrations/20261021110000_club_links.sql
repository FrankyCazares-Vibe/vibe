-- ---------------------------------------------------------------------------
-- 20261021110000_club_links.sql
--
-- PLAIN ENGLISH
-- Club links (the club's view, wave 1; handoffs/2026-10-20-club-view/
-- DECISIONS.md and WAVE1-DESIGN.md). One mechanism, two kinds of link:
--   * a SETUP link: a founder makes it in Admin > Clubs for one club. It works
--     once, for 7 days. The president opens it, signs up with their school
--     email even while sign-up is closed, and becomes the owner of the club,
--     which is made already checked (verified) when the founder said so.
--   * a MEMBERS' link: one per checked club. It lets people with a school
--     email past the closed waitlist and asks them to join the club. It ends
--     3 weeks after it was made and lets at most 150 people sign up through
--     it. Officers can turn it off and on, and see only how many joined.
-- This file adds the two tables and the database functions. The sign-up gate
-- learns about the links in the next file (20261021120000_club_links_gate).
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: auth_hooks and the waitlist gate exist; nothing of this
--      file does yet; chat_repair_club exists (a setup link makes the rooms).
--   2. public.club_links: one row per link. A setup link stores only the
--      SHA-256 of its code; a members' link also keeps its code, so officers
--      can show the same link again (the table is service-role only).
--   3. public.club_link_uses: one row per person a link let in, or brought
--      into its club. While a sign-up is under way it holds the address the
--      gate let in (claimed_email); once the account is found it holds the
--      account (user_id) and the address is dropped. joined_at: they joined
--      the club through the link. Nothing here ever stores an IP address.
--   4. Code functions, pure: club_link_normalize_code / club_link_hash, the
--      same rules as src/lib/club-links/code.ts (change one, change both and
--      the shared vectors in code.test.ts and the POST-CHECK below).
--   5. auth_hooks.club_link_claim(code, email): the gate's question "may this
--      address sign up through this link?", answered 'ok' or a reason, under
--      a row lock on the link so two sign-ups can't both take the last place.
--   6. public.club_link_redeem_setup: makes the club (club row, owner row,
--      its rooms) and marks the setup link used, in one transaction.
--   7. public.club_link_pending: ties the places an account's address
--      claimed to the account and says which link is waiting for it.
--   8. The typed code never stays in auth.users or auth.identities: like the
--      access code (20261003130000), club_code becomes club_code_hash.
--   9. Deleting an account drops the places its address still holds.
--  10. Grants, POST-CHECK, notify pgrst.
--
-- THE STANDING RULE (20260922090000): no function reachable over REST is
-- refused to anon, authenticated or service_role with a REVOKE (that crashes
-- this image). The public functions here grant EXECUTE to all three; the two
-- writers refuse anon and authenticated from inside (42501). The auth_hooks
-- functions are out of the API's reach (no USAGE on the schema), as the
-- gate's own are.
--
-- HOW TO APPLY (production, with Franky's yes): the Supabase connector's
-- apply_migration with this body minus begin/commit, then rename its
-- auto-timestamp row in supabase_migrations.schema_migrations to
-- '20261021110000' / 'club_links'. Then 20261021120000.
--
-- ROLLBACK (after rolling back 20261021120000 first):
--   drop trigger club_link_scrub_code on auth.users;
--   drop trigger club_link_scrub_code on auth.identities;
--   drop trigger club_link_forget_user on public.users;
--   drop function auth_hooks.club_link_scrub_users(), auth_hooks.club_link_scrub_identities(),
--     auth_hooks.club_link_scrub(jsonb), auth_hooks.club_link_claim(text, text),
--     public.club_link_forget_user(), public.club_link_pending(uuid),
--     public.club_link_redeem_setup(uuid, uuid, text, text),
--     public.club_link_hash(text), public.club_link_normalize_code(text);
--   drop table public.club_link_uses, public.club_links;
--   delete from supabase_migrations.schema_migrations where version = '20261021110000';
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
begin
  if to_regprocedure('auth_hooks.hook_waitlist_gate(jsonb)') is null then
    raise exception 'club-links: the waitlist gate (20261003120000) is missing';
  end if;
  if to_regprocedure('public.chat_repair_club(uuid)') is null then
    raise exception 'club-links: chat_repair_club (20261001100000) is missing';
  end if;
  if to_regclass('public.club_links') is not null or to_regclass('public.club_link_uses') is not null then
    raise exception 'club-links: already applied (club_links exists)';
  end if;
end $$;

-- 2. THE LINKS ------------------------------------------------------------------
create table public.club_links (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('setup', 'members')),
  -- SHA-256 hex of the normalised code (club_link_hash).
  code_hash    text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  -- Members' links only: the normalised code, to show the link again.
  code         text check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$'),
  -- Members': the club. Setup: null until used, then the club it made.
  org_id       uuid references public.orgs (id) on delete cascade,
  -- Setup only: the club the founder named, and its handle (permanent).
  club_name    text check (char_length(club_name) between 2 and 50 and club_name = btrim(club_name)),
  club_handle  text check (club_handle ~ '^[a-z0-9][a-z0-9_-]{2,30}$'),
  -- Setup only: "We met in person: the club is checked" (orgs.verified).
  checked      boolean not null default false,
  -- How many people may sign up through it: 1 (setup), 150 (members).
  max_signups  integer not null check (max_signups between 1 and 500),
  expires_at   timestamptz not null,
  -- Turned off: by an officer (members), or cancelled by a founder (setup).
  off_at       timestamptz,
  -- Setup only: when it made its club, and for whom.
  used_at      timestamptz,
  used_by      uuid references public.users (id) on delete set null,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint club_links_shape check (
    (kind = 'setup' and code is null and club_name is not null and club_handle is not null
       and max_signups = 1 and (used_at is null or org_id is not null))
    or (kind = 'members' and code is not null and org_id is not null
       and club_name is null and club_handle is null and used_at is null and used_by is null)
  )
);

comment on table public.club_links is
  'Club links (wave 1, Oct 21 2026): setup links (one use, makes a club and its owner) and members'' links '
  '(one per checked club, 150 sign-ups, 3 weeks). Service role only.';

-- One members' link per club.
create unique index club_links_one_members_link on public.club_links (org_id) where kind = 'members';
-- A setup link's handle is held while it is live (POST /api/orgs checks it too).
create index club_links_live_setup_handle on public.club_links (club_handle)
  where kind = 'setup' and used_at is null and off_at is null;

-- 3. WHO A LINK LET IN ------------------------------------------------------------
create table public.club_link_uses (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid not null references public.club_links (id) on delete cascade,
  -- The address the gate let in, only until the account is found.
  claimed_email text check (char_length(claimed_email) <= 254 and claimed_email = lower(claimed_email)),
  -- When the gate let a sign-up in through this link (counts toward the cap).
  claimed_at    timestamptz,
  user_id       uuid references public.users (id) on delete cascade,
  -- Joined the club through the link (members), or made it (setup).
  joined_at     timestamptz,
  -- "Not now" on the members' link's join question.
  dismissed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint club_link_uses_who check (claimed_email is not null or user_id is not null),
  constraint club_link_uses_claim check (claimed_email is null or claimed_at is not null)
);

comment on table public.club_link_uses is
  'Which club link let someone in (Privacy Policy, Oct 21 2026). The address is kept only until the account '
  'is found; never an IP address. Service role only.';

create unique index club_link_uses_one_claim on public.club_link_uses (link_id, claimed_email)
  where claimed_email is not null;
create unique index club_link_uses_one_user on public.club_link_uses (link_id, user_id)
  where user_id is not null;
create index club_link_uses_unbound on public.club_link_uses (claimed_email)
  where claimed_email is not null and user_id is null;
create index club_link_uses_user on public.club_link_uses (user_id) where user_id is not null;

-- Service role only: RLS on, no policies, and no table grants for the API roles.
alter table public.club_links enable row level security;
alter table public.club_link_uses enable row level security;
revoke all on table public.club_links from anon, authenticated;
revoke all on table public.club_link_uses from anon, authenticated;
grant all on table public.club_links to service_role;
grant all on table public.club_link_uses to service_role;

-- 4. CODES, PURE ---------------------------------------------------------------------
-- A link's code is 16 Crockford base32 characters (80 random bits), opened as
-- /c/<code> or scanned, never typed. Read forgivingly all the same, as
-- normalizeClubLinkCode in src/lib/club-links/code.ts:
--   1. drop every character that is not an ASCII letter or digit (before
--      uppercasing, so no non-ASCII letter can uppercase into an ASCII one);
--   2. uppercase; 3. O -> 0, I and L -> 1;
--   4. exactly 16 Crockford base32 characters.
-- Never raises.
create function public.club_link_normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_code is null or char_length(p_code) > 64 then
    return null;
  end if;
  v := translate(upper(regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  if v ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$' then
    return v;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- SHA-256 hex of 'club:' and the normalised code (what club_links.code_hash
-- holds), or null when it is not a code. The prefix keeps the two kinds of
-- code (waitlist, club) from ever sharing a hash.
create function public.club_link_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when n.v is null then null
              else encode(sha256(convert_to('club:' || n.v, 'UTF8')), 'hex') end
    from (select public.club_link_normalize_code(p_code) as v) n;
$$;

-- 5. THE GATE'S QUESTION ----------------------------------------------------------------
-- May p_email sign up through the link whose code is p_code? 'ok' (and the
-- address now holds a place on the link), or the reason it may not:
--   invalid       not a code, or no such link;
--   off           turned off or cancelled, or (members) its club is gone,
--                 hidden or no longer checked;
--   used          a setup link that made its club, or whose place is held by
--                 an address that has an account;
--   expired       past its end;
--   school_email  not a school address (iu.edu, purdue.edu or a subdomain;
--                 the retired IU domains are neither);
--   in_use        a setup link another address's sign-up is using right now;
--   full          a members' link with max_signups sign-ups.
-- The row lock on the link makes two sign-ups at once wait for each other,
-- so the last place goes once. GoTrue runs the gate outside the transaction
-- that makes the user (20261003110000's header), so a place is taken here,
-- before the account exists; one whose address never got an account within
-- 15 minutes is given back, and so is one never tied to an account within
-- 30 days.
create function auth_hooks.club_link_claim(p_code text, p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash  text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_host  text;
  l       public.club_links%rowtype;
  n       integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated', 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_hash := public.club_link_hash(p_code);
  if v_hash is null then
    return 'invalid';
  end if;
  select * into l from public.club_links k where k.code_hash = v_hash for update;
  if not found then
    return 'invalid';
  end if;
  if l.off_at is not null then
    return 'off';
  end if;
  if l.kind = 'setup' and l.used_at is not null then
    return 'used';
  end if;
  if l.expires_at <= now() then
    return 'expired';
  end if;
  if l.kind = 'members' and not exists (
       select 1 from public.orgs o
        where o.id = l.org_id and o.verified and o.hidden_at is null) then
    return 'off';
  end if;

  v_host := split_part(v_email, '@', 2);
  if v_email !~ '^[^@[:space:]]+@[a-z0-9.-]+$'
     or not (v_host in ('iu.edu', 'purdue.edu')
             or v_host like '%.iu.edu' or v_host like '%.purdue.edu') then
    return 'school_email';
  end if;

  -- The same address again (a retry, or the email cap failed the first try).
  update public.club_link_uses u
     set claimed_at = now()
   where u.link_id = l.id and u.claimed_email = v_email;
  if found then
    return 'ok';
  end if;

  -- Places given back.
  delete from public.club_link_uses u
   where u.link_id = l.id
     and u.user_id is null
     and u.claimed_email is not null
     and ((u.claimed_at < now() - interval '15 minutes'
           and not exists (select 1 from auth.users au where lower(au.email) = u.claimed_email))
          or u.claimed_at < now() - interval '30 days');

  select count(*) into n
    from public.club_link_uses u
   where u.link_id = l.id and u.claimed_at is not null;
  if n >= l.max_signups then
    if l.kind = 'members' then
      return 'full';
    end if;
    -- A setup link: held by another address. Used, if that address has an
    -- account (or the place is already tied to one); in use, if not yet.
    if exists (select 1 from public.club_link_uses u
                where u.link_id = l.id
                  and (u.user_id is not null
                       or exists (select 1 from auth.users au where lower(au.email) = u.claimed_email))) then
      return 'used';
    end if;
    return 'in_use';
  end if;

  insert into public.club_link_uses (link_id, claimed_email, claimed_at)
  values (l.id, v_email, now());
  return 'ok';
end;
$$;

revoke all on function auth_hooks.club_link_claim(text, text) from public;
comment on function auth_hooks.club_link_claim(text, text) is
  'The sign-up gate''s club-link step: ''ok'' (a place is taken for the address) or the reason not. '
  'Only the gate calls it (auth_hooks is out of the API''s reach).';

-- 6. A SETUP LINK MAKES ITS CLUB ------------------------------------------------------------
-- For p_user, who opened the link signed in or whose sign-up it let in. The
-- route (POST /api/club-links/redeem) has already checked the account: school
-- address verified, home campus set (p_campus, p_school: the same values
-- POST /api/orgs would use), not restricted. Here, in one transaction: the
-- club (named and handled as the founder made the link, checked if they said
-- so), its owner row, its rooms (chat_repair_club, as club creation does),
-- and the link marked used. Returns {"ok":true,"handle","org_id"[,"already"]}
-- or {"ok":false,"reason": invalid | used | off | expired | in_use |
-- handle_taken}. Service role only: anon and authenticated are refused inside.
create function public.club_link_redeem_setup(
  p_link uuid, p_user uuid, p_campus text, p_school text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l        public.club_links%rowtype;
  v_email  text;
  v_handle text;
  v_org    uuid;
  i        integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into l from public.club_links k where k.id = p_link and k.kind = 'setup' for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if l.used_at is not null then
    if l.used_by = p_user and l.org_id is not null then
      return jsonb_build_object('ok', true, 'already', true, 'org_id', l.org_id,
        'handle', (select o.handle from public.orgs o where o.id = l.org_id));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if l.off_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if not found or not exists (select 1 from public.users pu where pu.id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Another address's sign-up holds the link: live (under 15 minutes), or
  -- that address has an account, or the place is tied to another account.
  if exists (
       select 1 from public.club_link_uses x
        where x.link_id = l.id
          and x.user_id is distinct from p_user
          and x.claimed_email is distinct from v_email
          and (x.user_id is not null
               or x.claimed_at > now() - interval '15 minutes'
               or exists (select 1 from auth.users au where lower(au.email) = x.claimed_email))) then
    return jsonb_build_object('ok', false, 'reason', 'in_use');
  end if;

  -- Past its end: only a sign-up the link let in before then may finish.
  if l.expires_at <= now() and not exists (
       select 1 from public.club_link_uses x
        where x.link_id = l.id and (x.user_id = p_user or x.claimed_email = v_email)) then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- The handle the founder chose, or the first free one with a number on it.
  v_handle := l.club_handle;
  i := 1;
  while exists (select 1 from public.orgs o where o.handle = v_handle) loop
    i := i + 1;
    if i > 20 then
      return jsonb_build_object('ok', false, 'reason', 'handle_taken');
    end if;
    v_handle := left(l.club_handle, 31 - char_length(i::text)) || i::text;
  end loop;

  insert into public.orgs (handle, name, owner_id, school, campus_id, verified)
  values (v_handle, l.club_name, p_user, coalesce(p_school, ''), p_campus, l.checked)
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, p_user, 'owner');
  perform public.chat_repair_club(v_org);

  update public.club_links k
     set used_at = now(), used_by = p_user, org_id = v_org, updated_at = now()
   where k.id = l.id;

  -- This person's place: tied to the account, the address dropped.
  update public.club_link_uses x
     set user_id = p_user, claimed_email = null, joined_at = now()
   where x.link_id = l.id and (x.claimed_email = v_email or x.user_id = p_user);
  if not found then
    insert into public.club_link_uses (link_id, user_id, joined_at) values (l.id, p_user, now());
  end if;

  return jsonb_build_object('ok', true, 'handle', v_handle, 'org_id', v_org);
end;
$$;

comment on function public.club_link_redeem_setup(uuid, uuid, text, text) is
  'A setup link makes its club with p_user as owner (club row, owner row, rooms, link used). Service role only.';

-- 7. WHAT IS WAITING FOR AN ACCOUNT -----------------------------------------------------------
-- Ties the places p_user's sign-in address claimed (the gate wrote them before
-- the account existed) to the account, dropping the address, and returns the
-- one link still waiting for it, newest first:
--   {"kind":"setup","link_id"}            a setup link not used yet;
--   {"kind":"members","link_id","org_id"} a members' link whose club the
--                                        person hasn't joined or waved off;
-- or null. Service role only.
create function public.club_link_pending(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
  r       record;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if v_email is not null and v_email <> '' then
    update public.club_link_uses x
       set user_id = p_user, claimed_email = null
     where x.claimed_email = v_email
       and x.user_id is null
       and not exists (select 1 from public.club_link_uses y
                        where y.link_id = x.link_id and y.user_id = p_user);
  end if;

  select k.id, k.kind, k.org_id into r
    from public.club_link_uses x
    join public.club_links k on k.id = x.link_id
   where x.user_id = p_user
     and x.claimed_at is not null
     and x.claimed_at > now() - interval '30 days'
     and x.joined_at is null
     and x.dismissed_at is null
     and k.off_at is null
     and ((k.kind = 'setup' and k.used_at is null)
          or (k.kind = 'members'
              and k.expires_at > now()
              and not exists (select 1 from public.org_members m
                               where m.org_id = k.org_id and m.user_id = p_user)))
   order by x.claimed_at desc
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object('kind', r.kind, 'link_id', r.id, 'org_id', r.org_id);
end;
$$;

comment on function public.club_link_pending(uuid) is
  'Ties the club-link places an account''s address claimed to the account; returns the link waiting for it. Service role only.';

-- 8. THE TYPED CODE NEVER STAYS IN AUTH ------------------------------------------------------
-- The sign-up page sends the link's code in user_metadata.club_code for the
-- gate. Before the row is written, club_code becomes club_code_hash (or goes,
-- if it is not a code), on auth.users and on auth.identities, as the access
-- code's scrub does (20261003130000). Nothing reads club_code_hash back: the
-- app finds the link from the place the gate took, never from metadata a
-- person can rewrite with updateUser.
create function auth_hooks.club_link_scrub(meta jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if meta is null or jsonb_typeof(meta) <> 'object' or not (meta ? 'club_code') then
    return meta;
  end if;
  begin
    v_hash := case when jsonb_typeof(meta -> 'club_code') = 'string'
                   then public.club_link_hash(meta ->> 'club_code') end;
  exception when others then
    v_hash := null;
  end;
  return (meta - 'club_code' - 'club_code_hash')
    || case when v_hash is null then '{}'::jsonb else jsonb_build_object('club_code_hash', v_hash) end;
end;
$$;

create function auth_hooks.club_link_scrub_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_user_meta_data := auth_hooks.club_link_scrub(new.raw_user_meta_data);
  return new;
end;
$$;

create function auth_hooks.club_link_scrub_identities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.identity_data := auth_hooks.club_link_scrub(new.identity_data);
  return new;
end;
$$;

revoke all on function auth_hooks.club_link_scrub(jsonb) from public;
revoke all on function auth_hooks.club_link_scrub_users() from public;
revoke all on function auth_hooks.club_link_scrub_identities() from public;
grant execute on function auth_hooks.club_link_scrub_users() to supabase_auth_admin;
grant execute on function auth_hooks.club_link_scrub_identities() to supabase_auth_admin;

create trigger club_link_scrub_code
  before insert or update of raw_user_meta_data on auth.users
  for each row when (new.raw_user_meta_data ? 'club_code')
  execute function auth_hooks.club_link_scrub_users();

create trigger club_link_scrub_code
  before insert or update of identity_data on auth.identities
  for each row when (new.identity_data ? 'club_code')
  execute function auth_hooks.club_link_scrub_identities();

-- 9. AN ACCOUNT'S DELETION REACHES ITS PLACES ------------------------------------------------------
-- Rows tied to the account go with it (user_id cascades). This drops the
-- places its sign-in address claimed and never tied. Never blocks a deletion.
create function public.club_link_forget_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if coalesce(old.email, '') <> '' then
      delete from public.club_link_uses x
       where x.claimed_email = lower(old.email) and x.user_id is null;
    end if;
  exception when others then
    raise warning 'club_link_forget_user: skipped (%: %)', sqlstate, sqlerrm;
  end;
  return old;
end;
$$;

revoke execute on function public.club_link_forget_user() from anon, public, authenticated;

create trigger club_link_forget_user
  before delete on public.users
  for each row execute function public.club_link_forget_user();

-- 10. GRANTS (the standing rule's shape), POST-CHECK ------------------------------------------------
revoke all on function public.club_link_normalize_code(text) from public;
revoke all on function public.club_link_hash(text) from public;
revoke all on function public.club_link_redeem_setup(uuid, uuid, text, text) from public;
revoke all on function public.club_link_pending(uuid) from public;
grant execute on function public.club_link_normalize_code(text) to anon, authenticated, service_role;
grant execute on function public.club_link_hash(text) to anon, authenticated, service_role;
grant execute on function public.club_link_redeem_setup(uuid, uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.club_link_pending(uuid) to anon, authenticated, service_role;

do $$
declare
  bad text := '';
  r text;
begin
  -- The shared vectors (src/lib/club-links/code.test.ts).
  if public.club_link_normalize_code('k7q2-m9xd-ab3c-dE4f') is distinct from 'K7Q2M9XDAB3CDE4F' then
    bad := bad || ' normalise: hyphens and case;';
  end if;
  if public.club_link_normalize_code('OIL0 1234 5678 9ABC') is distinct from '0110123456789ABC' then
    bad := bad || ' normalise: O, I and L;';
  end if;
  if public.club_link_normalize_code('K7Q2M9XDAB3CDE4') is not null
     or public.club_link_normalize_code('K7Q2M9XDAB3CDE4FU') is not null
     or public.club_link_normalize_code('K7Q2M9XDAB3CDE4U') is not null then
    bad := bad || ' normalise: wrong length or a U read as a code;';
  end if;
  if public.club_link_hash('K7Q2M9XDAB3CDE4F')
     is distinct from encode(sha256(convert_to('club:K7Q2M9XDAB3CDE4F', 'UTF8')), 'hex') then
    bad := bad || ' hash;';
  end if;
  if auth_hooks.club_link_scrub('{"club_code":"k7q2-m9xd-ab3c-de4f","club_code_hash":"x","t":1}')
     is distinct from jsonb_build_object('t', 1, 'club_code_hash', public.club_link_hash('K7Q2M9XDAB3CDE4F')) then
    bad := bad || ' scrub of a valid code;';
  end if;
  if auth_hooks.club_link_scrub('{"club_code":"nope","a":1}') is distinct from '{"a":1}'::jsonb then
    bad := bad || ' scrub of an invalid code kept something;';
  end if;
  if (select count(*) from pg_trigger t
       where t.tgname = 'club_link_scrub_code' and t.tgenabled <> 'D'
         and t.tgrelid in ('auth.users'::regclass, 'auth.identities'::regclass)) <> 2 then
    bad := bad || ' the two scrub triggers are not both on;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.club_links', 'select')
       or has_table_privilege(r, 'public.club_link_uses', 'select')
       or has_table_privilege(r, 'public.club_link_uses', 'insert') then
      bad := bad || format(' %s can reach a club-link table;', r);
    end if;
  end loop;
  if has_schema_privilege('anon', 'auth_hooks', 'usage')
     or has_schema_privilege('authenticated', 'auth_hooks', 'usage')
     or has_schema_privilege('service_role', 'auth_hooks', 'usage') then
    bad := bad || ' an API role has USAGE on auth_hooks;';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.club_links'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.club_link_uses'::regclass) then
    bad := bad || ' RLS is off on a club-link table;';
  end if;
  if bad <> '' then
    raise exception 'club-links post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
