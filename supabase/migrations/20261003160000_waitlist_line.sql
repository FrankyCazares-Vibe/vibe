-- Waitlist: an entry past its line counts as gone, and no code in its last
-- day (Oct 3, 2026; after the review of 20261003150000). Needs
-- 20261003100000 to 20261003150000.
--
-- WHAT IT CHANGES, AND WHY
--   1. public.waitlist_deletes_at(w): the moment the purge deletes an entry,
--      written once: 39 days after it joined; an unconfirmed form entry with
--      no code 29 days after its last confirm email (or after joining, with
--      none), if that is sooner. The purge (3), the one-person drop (2) and
--      waitlist_issue_code (4) all read it; src/lib/waitlist/types.ts
--      waitlistDeletesAt is its copy for the pages (the check script runs the
--      same vectors as admin-view.test.ts). It reads only the row it is
--      given, so all three API roles may run it (the standing rule).
--   2. public.waitlist_drop_if_due(p_email_key): deletes that one person's
--      entry when it is past its line and returns its address (the server
--      then forgets its send-log rows), else null. The daily cron can reach
--      an entry up to a day after its line; in between, the entry counts as
--      gone: the form (/api/waitlist) and "Add someone" call this first, so
--      someone joining again gets a fresh entry, as every "you can join
--      again" line promises, instead of being matched to the dying one.
--      Service role only (42501 for anon and authenticated).
--   3. The purge reads (1): the same lines, the same send-log backstop.
--   4. waitlist_issue_code refuses an entry with less than 24 hours left
--      before its deletion (reason "entry_expiring"; the admin tab shows
--      "Leaves today" and no Send code button) and, as before, one already
--      past its line ("entry_expired"), now including an unconfirmed entry
--      past its 29-day line. A code still ends no later than created_at +
--      39 days.
--
-- LIVE STATE (local stack, 2026-10-03): md5(pg_get_functiondef) of
-- waitlist_purge_expired(integer) = 5a2b81d649770a1af424aec0fdc305ea and
-- waitlist_issue_code(uuid,text,uuid,text,boolean,text) =
-- 756f85ed66039e62bfec137c1f9b8b5b (both file 20261003150000). Run twice,
-- the PRE-FLIGHT refuses.
--
-- HOW TO APPLY BY HAND: as 20261003100000, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003160000', 'waitlist_line') on conflict do nothing;
-- ROLLBACK (after reverting the code that calls waitlist_drop_if_due): re-run
-- 20261003150000's sections 3 and 4 (create or replace), then
--   drop function public.waitlist_drop_if_due(text);
--   drop function public.waitlist_deletes_at(public.waitlist);
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
      ('public.waitlist_purge_expired(integer)', '5a2b81d649770a1af424aec0fdc305ea'),
      ('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)', '756f85ed66039e62bfec137c1f9b8b5b')
    ) as t(fn, md5)
  loop
    if to_regprocedure(want.fn) is null then
      raise exception 'waitlist-line: % is missing; apply 20261003100000 to 20261003150000 first', want.fn;
    end if;
    select md5(pg_get_functiondef(want.fn::regprocedure)) into fp;
    if fp is distinct from want.md5 then
      raise exception 'waitlist-line: % drifted or is already replaced (md5 %); re-read it first', want.fn, fp;
    end if;
  end loop;
  if to_regprocedure('public.waitlist_deletes_at(public.waitlist)') is not null
     or to_regprocedure('public.waitlist_drop_if_due(text)') is not null then
    raise exception 'waitlist-line: already applied (waitlist_deletes_at or waitlist_drop_if_due exists)';
  end if;
end $$;

-- 2. THE DELETION MOMENT, WRITTEN ONCE -------------------------------------------
-- An entry is past its line when this is before now(). Same lines as
-- 20261003150000's purge: created_at < now() - 39 days, or (unconfirmed form
-- row, no code) both created_at and confirm_sent_at before now() - 29 days.
create function public.waitlist_deletes_at(w public.waitlist)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when w.origin = 'form' and w.confirmed_at is null and w.code_hash is null
      then least(w.created_at + interval '39 days',
                 greatest(w.created_at, coalesce(w.confirm_sent_at, w.created_at)) + interval '29 days')
    else w.created_at + interval '39 days'
  end;
$$;

revoke all on function public.waitlist_deletes_at(public.waitlist) from public;
grant execute on function public.waitlist_deletes_at(public.waitlist) to anon, authenticated, service_role;
comment on function public.waitlist_deletes_at(public.waitlist) is
  'Waitlist retention: when the purge deletes this entry (39 days after joining; an unconfirmed form entry with no '
  'code 29 days after its last confirm email, if sooner). Reads only the row it is given.';

-- 3. ONE PERSON, PAST THE LINE: GONE NOW -------------------------------------------
create function public.waitlist_drop_if_due(p_email_key text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.waitlist w
   where w.email_key = p_email_key
     and public.waitlist_deletes_at(w) < now()
  returning w.email into v_email;
  return v_email;
end;
$$;

revoke all on function public.waitlist_drop_if_due(text) from public;
grant execute on function public.waitlist_drop_if_due(text) to anon, authenticated, service_role;
comment on function public.waitlist_drop_if_due(text) is
  'Waitlist retention: deletes this person''s entry if it is past its line (waitlist_deletes_at) and returns its '
  'address, else null; run before the form or a founder looks the person up. Service role only (42501).';

-- 4. THE PURGE READS THE SAME MOMENT ------------------------------------------------
-- As 20261003150000, with waitlist_deletes_at in place of the two lines.
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

  -- Waitlist emails sent over 39 days ago went to entries due for deletion:
  -- their send-log rows keep the row, not the address hash.
  update public.email_sends s
     set recipient_hash = null
   where s.kind in ('waitlist_confirm', 'waitlist_invite')
     and s.recipient_hash is not null
     and s.created_at < now() - interval '39 days';

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
  'Waitlist retention: deletes every entry past waitlist_deletes_at (39 days after it joined; unconfirmed form entries '
  '29 days after their last confirm email), so none outlives the promised 40 (30) with a daily cron; returns the '
  'deleted addresses. Service role only (42501 for anon and authenticated).';

-- 5. NO CODE IN AN ENTRY'S LAST DAY ---------------------------------------------------
-- As 20261003150000, plus: the deletion moment as things stand
-- (waitlist_deletes_at) refuses an entry past it ("entry_expired") or less
-- than 24 hours from it ("entry_expiring"). The cap stays created_at + 39
-- days: with a code, that is the entry's deletion moment.
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
  v_ends := r.created_at + interval '39 days';
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

-- 6. POST-CHECK --------------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure;
begin
  foreach f in array array['public.waitlist_deletes_at(public.waitlist)'::regprocedure,
                           'public.waitlist_drop_if_due(text)'::regprocedure,
                           'public.waitlist_purge_expired(integer)'::regprocedure,
                           'public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure] loop
    if not (has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
    if f <> 'public.waitlist_deletes_at(public.waitlist)'::regprocedure
       and not (select p.prosecdef from pg_proc p where p.oid = f) then
      bad := bad || format(' %s is not SECURITY DEFINER;', f);
    end if;
  end loop;
  if (select p.prosecdef from pg_proc p where p.oid = 'public.waitlist_deletes_at(public.waitlist)'::regprocedure) then
    bad := bad || ' waitlist_deletes_at is SECURITY DEFINER (it must not be);';
  end if;
  if pg_get_functiondef('public.waitlist_purge_expired(integer)'::regprocedure) not like '%public.waitlist_deletes_at(w) < now()%' then
    bad := bad || ' the purge does not read waitlist_deletes_at;';
  end if;
  if pg_get_functiondef('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure)
       not like '%''entry_expiring''%' then
    bad := bad || ' waitlist_issue_code does not refuse an entry in its last day;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-line post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
