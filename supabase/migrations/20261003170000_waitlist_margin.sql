-- Waitlist: two days of margin for the daily purge, and a fresh start for an
-- unconfirmed entry that signs up again (Oct 3, 2026; after the review of
-- 20261003160000). Needs 20261003100000 to 20261003160000.
--
-- WHAT IT CHANGES, AND WHY
--   1. The purge lines move from 39 / 29 days to 38 / 28. The promise stays
--      "up to 40 days" (30 for an unconfirmed entry). Vercel's Hobby cron
--      runs once a day at any minute of its hour and is not retried, so two
--      runs can be about 25 hours apart, and an entry can wait that long
--      after its line. At 38 days it is gone by day 39 and an hour at worst,
--      inside 40 (and 30) even when a run is late. Three bodies change, and
--      only in their numbers: public.waitlist_deletes_at (the one deletion
--      moment), the purge's send-log backstop (38 days) and
--      waitlist_issue_code's cap (created_at + 38 days), so a code still
--      ends no later than its entry. A full 14-day code must go out by day
--      24 of an entry (the admin tab says so).
--   2. Signing up again restarts an unconfirmed entry's clock. The form's
--      renewal (store.ts renewConfirmToken: a new confirm link, this
--      submit's answers) writes a new manage_token_hash; the trigger
--      waitlist_restart_clock then sets created_at = now() when the entry is
--      still unconfirmed, has no code and was never redeemed. Someone who
--      confirms after a late second try gets the full time, not the few days
--      left from their first. A confirmed, invited or joined entry keeps its
--      date whatever updates it. Nothing else writes manage_token_hash on an
--      existing row.
--
-- LIVE STATE (local stack, 2026-10-03): md5(pg_get_functiondef) of
-- waitlist_deletes_at(waitlist) = d50be685d4f058c0e2e5373ecbdca26c,
-- waitlist_purge_expired(integer) = 55d4c5b8972d61d720b1a6a94394639f and
-- waitlist_issue_code(uuid,text,uuid,text,boolean,text) =
-- 6695e599d42ff7ffb23bbe9aee421637 (all three file 20261003160000). Run
-- twice, the PRE-FLIGHT refuses.
--
-- HOW TO APPLY BY HAND: as 20261003100000, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003170000', 'waitlist_margin') on conflict do nothing;
-- ROLLBACK: re-run 20261003160000's sections 2 (as create or replace), 4
-- and 5, then
--   drop trigger waitlist_restart_clock on public.waitlist;
--   drop function public.waitlist_restart_clock();
-- and delete this row from schema_migrations.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  want record;
  fp text;
begin
  for want in
    select * from (values
      ('public.waitlist_deletes_at(public.waitlist)', 'd50be685d4f058c0e2e5373ecbdca26c'),
      ('public.waitlist_purge_expired(integer)', '55d4c5b8972d61d720b1a6a94394639f'),
      ('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)', '6695e599d42ff7ffb23bbe9aee421637')
    ) as t(fn, md5)
  loop
    if to_regprocedure(want.fn) is null then
      raise exception 'waitlist-margin: % is missing; apply 20261003100000 to 20261003160000 first', want.fn;
    end if;
    select md5(pg_get_functiondef(want.fn::regprocedure)) into fp;
    if fp is distinct from want.md5 then
      raise exception 'waitlist-margin: % drifted or is already replaced (md5 %); re-read it first', want.fn, fp;
    end if;
  end loop;
  if to_regprocedure('public.waitlist_restart_clock()') is not null
     or exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.waitlist'::regclass and t.tgname = 'waitlist_restart_clock') then
    raise exception 'waitlist-margin: already applied (waitlist_restart_clock exists)';
  end if;
end $$;

-- 2. THE DELETION MOMENT: 38 DAYS, OR 28 UNCONFIRMED -------------------------------
-- As 20261003160000, with 38 and 28 in place of 39 and 29.
create or replace function public.waitlist_deletes_at(w public.waitlist)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when w.origin = 'form' and w.confirmed_at is null and w.code_hash is null
      then least(w.created_at + interval '38 days',
                 greatest(w.created_at, coalesce(w.confirm_sent_at, w.created_at)) + interval '28 days')
    else w.created_at + interval '38 days'
  end;
$$;

revoke all on function public.waitlist_deletes_at(public.waitlist) from public;
grant execute on function public.waitlist_deletes_at(public.waitlist) to anon, authenticated, service_role;
comment on function public.waitlist_deletes_at(public.waitlist) is
  'Waitlist retention: when the purge deletes this entry (38 days after joining; an unconfirmed form entry with no '
  'code 28 days after its last confirm email, if sooner). Two days inside the promised 40 (30), for a late daily '
  'cron. Reads only the row it is given.';

-- 3. THE PURGE: THE SEND-LOG BACKSTOP AT 38 DAYS -------------------------------------
-- As 20261003160000, with 38 in place of 39.
create or replace function public.waitlist_purge_expired(p_limit integer default 1000)
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

  -- Waitlist emails sent over 38 days ago went to entries due for deletion:
  -- their send-log rows keep the row, not the address hash.
  update public.email_sends s
     set recipient_hash = null
   where s.kind in ('waitlist_confirm', 'waitlist_invite')
     and s.recipient_hash is not null
     and s.created_at < now() - interval '38 days';

  return query
  with doomed as (
    select w.id
      from public.waitlist w
     where public.waitlist_deletes_at(w) < now()
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

revoke all on function public.waitlist_purge_expired(integer) from public;
grant execute on function public.waitlist_purge_expired(integer) to anon, authenticated, service_role;
comment on function public.waitlist_purge_expired(integer) is
  'Waitlist retention: deletes every entry past waitlist_deletes_at (38 days after it joined; unconfirmed form entries '
  '28 days after their last confirm email), so none outlives the promised 40 (30) even when the daily cron runs late; '
  'returns the deleted addresses. Service role only (42501 for anon and authenticated).';

-- 4. A CODE STILL ENDS WITH ITS ENTRY: THE CAP AT 38 DAYS ------------------------------
-- As 20261003160000, with 38 in place of 39 in v_ends. With a code, the
-- entry's deletion moment is created_at + 38 days.
create or replace function public.waitlist_issue_code(
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
  v_gone timestamptz;
  v_ends timestamptz;
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
  v_gone := public.waitlist_deletes_at(r);
  if v_gone <= now() then
    return jsonb_build_object('ok', false, 'reason', 'entry_expired');
  end if;
  if v_gone < now() + interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'entry_expiring');
  end if;
  v_ends := r.created_at + interval '38 days';
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
           code_expires_at    = least(now() + interval '14 days', v_ends),
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

revoke all on function public.waitlist_issue_code(uuid, text, uuid, text, boolean, text) from public;
grant execute on function public.waitlist_issue_code(uuid, text, uuid, text, boolean, text)
  to anon, authenticated, service_role;

-- 5. SIGNING UP AGAIN RESTARTS AN UNCONFIRMED ENTRY'S CLOCK -----------------------------
-- A trigger function: not reachable over REST, so outside the standing rule
-- (20260922090000 checks non-trigger functions only). It touches no table.
create function public.waitlist_restart_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.waitlist_restart_clock() from anon, public, authenticated;
comment on function public.waitlist_restart_clock() is
  'Waitlist retention: a new confirm link for an entry that is still unconfirmed (the form submitted again) makes '
  'its join date now, so its 38 (28) days start again. Trigger waitlist_restart_clock only.';

create trigger waitlist_restart_clock
  before update of manage_token_hash on public.waitlist
  for each row
  when (new.manage_token_hash is not null
        and new.manage_token_hash is distinct from old.manage_token_hash
        and old.confirmed_at is null and new.confirmed_at is null
        and old.code_hash is null and new.code_hash is null
        and old.redeemed_at is null and new.redeemed_at is null)
  execute function public.waitlist_restart_clock();

-- 6. POST-CHECK --------------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure;
begin
  foreach f in array array['public.waitlist_deletes_at(public.waitlist)'::regprocedure,
                           'public.waitlist_purge_expired(integer)'::regprocedure,
                           'public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure] loop
    if not (has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
    if pg_get_functiondef(f) like '%39 days%' or pg_get_functiondef(f) like '%29 days%' then
      bad := bad || format(' %s still has a 39- or 29-day line;', f);
    end if;
  end loop;
  if pg_get_functiondef('public.waitlist_deletes_at(public.waitlist)'::regprocedure) not like '%''28 days''%' then
    bad := bad || ' waitlist_deletes_at has no 28-day line;';
  end if;
  if pg_get_functiondef('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure)
       not like '%v_ends := r.created_at + interval ''38 days''%' then
    bad := bad || ' waitlist_issue_code does not cap a code at 38 days;';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = 'public.waitlist_restart_clock()'::regprocedure) then
    bad := bad || ' waitlist_restart_clock is SECURITY DEFINER (it needs no rights);';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.waitlist'::regclass and t.tgname = 'waitlist_restart_clock'
                    and t.tgenabled = 'O' and t.tgfoid = 'public.waitlist_restart_clock()'::regprocedure) then
    bad := bad || ' the trigger waitlist_restart_clock is missing or disabled;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-margin post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
