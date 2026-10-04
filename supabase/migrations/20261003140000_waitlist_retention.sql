-- Waitlist retention: every entry is deleted 40 days after it joined the
-- list, and an account keeps only a non-personal cohort tag (Oct 3, 2026;
-- the founder's rule). Needs 20261003100000 to 20261003120000;
-- 20261003130000 is independent of it.
--
-- THE RULE (Franky, Oct 3): keep waitlist data 40 days at most. Every row of
-- public.waitlist (address, name, year, major, clubs, the free-text line,
-- code hashes and claims, every personal field) goes 40 days after
-- created_at, whatever its state: unconfirmed, waiting, invited, expired or
-- joined. The stricter rule the build already had stays: an unconfirmed form
-- row with no code goes 30 days after its last confirm email. A person who
-- made an account keeps the account. What outlives the row is
-- public.user_cohorts: per account, the batch, how they came in (form or
-- founder) and two dates, so later product-fit numbers can compare waves.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the earlier waitlist files are in; this one is not.
--   2. public.user_cohorts (user_id, batch, origin, invited_on, joined_on).
--      No name, no address, no answers. RLS on, no policies, nothing for anon
--      or authenticated. It goes with the account (on delete cascade).
--   3. Trigger waitlist_tag_cohort on public.waitlist: when a code is
--      redeemed (handle_new_user sets redeemed_user_id), the new account gets
--      its tag. The first tag wins. A failure is a WARNING: it never undoes
--      the redemption or blocks an account. Rows redeemed before this file
--      are tagged here too.
--   4. public.waitlist_purge_expired(p_limit) deletes what the two rules say,
--      oldest first, at most p_limit rows per call (default 1000, at most
--      5000), and returns the deleted addresses so the server can forget
--      their send-log rows (keyed by a secret the database doesn't hold;
--      src/lib/waitlist/store.ts). It also forgets the address hash of every
--      waitlist send-log row older than 40 days (each went to an entry that
--      is past 40 days by then), so a crash between the two steps can't keep
--      a hash longer. Three callers share it: the form's background step and
--      the admin Waitlist tab (each at most once an hour per server), and the
--      daily Vercel Cron (GET /api/cron/waitlist-purge, vercel.json).
--      SECURITY DEFINER, in the standing rule's shape: anon, authenticated
--      and service_role hold EXECUTE, and anon and authenticated are refused
--      inside (42501), so only the service role (and the owner) can run it.
--   5. POST-CHECK, then notify pgrst.
--
-- KNOWN, ACCEPTED: a code dies with its entry. A code sent on day 30 of an
-- entry works until day 40, not for its 14 days; the admin tab says so.
--
-- HOW TO APPLY BY HAND: as 20261003100000, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003140000', 'waitlist_retention') on conflict do nothing;
-- ROLLBACK (after reverting the code that calls the purge):
--   begin;
--   drop trigger waitlist_tag_cohort on public.waitlist;
--   drop function public.waitlist_tag_cohort();
--   drop function public.waitlist_purge_expired(integer);
--   drop table public.user_cohorts;
--   delete from supabase_migrations.schema_migrations where version = '20261003140000';
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
begin
  if to_regclass('public.waitlist') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'waitlist'
                       and column_name = 'invite_token_hash') then
    raise exception 'waitlist-retention: apply 20261003100000 to 20261003120000 first';
  end if;
  if to_regclass('public.user_cohorts') is not null
     or to_regprocedure('public.waitlist_purge_expired(integer)') is not null then
    raise exception 'waitlist-retention: already applied (user_cohorts or waitlist_purge_expired exists)';
  end if;
end $$;

-- 2. THE COHORT TAG -------------------------------------------------------------
create table public.user_cohorts (
  user_id    uuid primary key references public.users (id) on delete cascade,
  -- The founders' batch name when the code was sent (waitlist.batch's rule); null when none was given.
  batch      text check (batch ~ '^[a-z0-9-]{1,40}$'),
  -- 'form' = joined the list at /waitlist; 'founder' = added by hand (officers who wrote in).
  origin     text not null check (origin in ('form', 'founder')),
  -- The day (UTC) the code was sent: the day they were let in.
  invited_on date not null,
  -- The day (UTC) the code made the account.
  joined_on  date not null
);
alter table public.user_cohorts enable row level security;
revoke all on table public.user_cohorts from anon, authenticated;
comment on table public.user_cohorts is
  'Which wave an account came in with (batch, form or founder, the day let in, the day joined), to compare waves. '
  'No personal field: it outlives the waitlist row (deleted after 40 days) and goes with the account. Service role only.';

-- 3. TAGGING AT REDEMPTION ------------------------------------------------------
create function public.waitlist_tag_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.user_cohorts (user_id, batch, origin, invited_on, joined_on)
    values (new.redeemed_user_id, new.batch, new.origin,
            (coalesce(new.code_issued_at, now()) at time zone 'utc')::date,
            (coalesce(new.redeemed_at, now()) at time zone 'utc')::date)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'waitlist_tag_cohort: skipped (%: %)', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.waitlist_tag_cohort() from anon, public, authenticated;

create trigger waitlist_tag_cohort
  after update of redeemed_user_id on public.waitlist
  for each row
  when (new.redeemed_user_id is not null and new.redeemed_user_id is distinct from old.redeemed_user_id)
  execute function public.waitlist_tag_cohort();

-- Codes redeemed before this file.
insert into public.user_cohorts (user_id, batch, origin, invited_on, joined_on)
select w.redeemed_user_id, w.batch, w.origin,
       (coalesce(w.code_issued_at, w.redeemed_at, w.created_at) at time zone 'utc')::date,
       (coalesce(w.redeemed_at, w.created_at) at time zone 'utc')::date
  from public.waitlist w
 where w.redeemed_user_id is not null
on conflict (user_id) do nothing;

-- 4. THE PURGE --------------------------------------------------------------------
-- Deletes, oldest first and at most p_limit rows: every row older than 40
-- days, and every unconfirmed form row with no code whose last confirm email
-- (if any) is older than 30 days. Returns the deleted addresses (the caller
-- forgets their send-log rows, then calls again while a full page came back).
create function public.waitlist_purge_expired(p_limit integer default 1000)
returns table (email text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Waitlist emails sent over 40 days ago went to entries past 40 days:
  -- their send-log rows keep the row, not the address hash.
  update public.email_sends s
     set recipient_hash = null
   where s.kind in ('waitlist_confirm', 'waitlist_invite')
     and s.recipient_hash is not null
     and s.created_at < now() - interval '40 days';

  return query
  with doomed as (
    select w.id
      from public.waitlist w
     where w.created_at < now() - interval '40 days'
        or (w.origin = 'form'
            and w.confirmed_at is null
            and w.code_hash is null
            and w.created_at < now() - interval '30 days'
            and (w.confirm_sent_at is null or w.confirm_sent_at < now() - interval '30 days'))
     order by w.created_at
     limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
     for update skip locked
  )
  delete from public.waitlist w
   using doomed d
   where w.id = d.id
  returning w.email;
end;
$$;

-- The standing rule (20260922090000): never PUBLIC; the API roles hold
-- EXECUTE and anon / authenticated are refused inside (42501).
revoke all on function public.waitlist_purge_expired(integer) from public;
grant execute on function public.waitlist_purge_expired(integer) to anon, authenticated, service_role;
comment on function public.waitlist_purge_expired(integer) is
  'Waitlist retention: deletes every entry 40 days after it joined (unconfirmed form entries 30 days after their last '
  'confirm email) and returns the deleted addresses. Service role only (42501 for anon and authenticated).';

-- 5. POST-CHECK --------------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure := 'public.waitlist_purge_expired(integer)'::regprocedure;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.user_cohorts'::regclass)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.user_cohorts'::regclass) then
    bad := bad || ' user_cohorts has RLS off or a policy;';
  end if;
  if has_table_privilege('anon', 'public.user_cohorts', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.user_cohorts', 'select,insert,update,delete') then
    bad := bad || ' anon or authenticated holds a privilege on user_cohorts;';
  end if;
  if not has_table_privilege('service_role', 'public.user_cohorts', 'select') then
    bad := bad || ' service_role cannot read user_cohorts;';
  end if;
  if not (has_function_privilege('anon', f, 'execute')
          and has_function_privilege('authenticated', f, 'execute')
          and has_function_privilege('service_role', f, 'execute')) then
    bad := bad || ' the purge is refused to an API role (the standing rule);';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the purge;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' the purge is not SECURITY DEFINER;';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.waitlist'::regclass and t.tgname = 'waitlist_tag_cohort'
                    and t.tgenabled <> 'D') then
    bad := bad || ' waitlist_tag_cohort is not on public.waitlist;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-retention post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
