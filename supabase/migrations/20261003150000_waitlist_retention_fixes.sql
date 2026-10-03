-- Waitlist retention fixes (Oct 3, 2026; after the review of
-- 20261003140000_waitlist_retention.sql). Needs 20261003100000 to 20261003140000.
--
-- WHAT IT CHANGES, AND WHY
--   1. The purge deletes a day early: 39 days after an entry joined (29 days
--      after an unconfirmed entry's last confirm email), and it forgets the
--      address hash of waitlist send-log rows at 39 days. The daily Vercel
--      Cron can run up to a day after an entry crosses its line, so deleting
--      at 39 keeps every entry within the promised "up to 40 days" (and 30).
--      The pages keep saying 40 and 30 (src/lib/waitlist/types.ts;
--      retention.test.ts ties the copy, this file and vercel.json together).
--   2. A code never outlives its entry. waitlist_issue_code sets
--      code_expires_at to the sooner of 14 days and the entry's deletion
--      moment (created_at + 39 days), and refuses an entry already past that
--      moment (reason "entry_expired"). The invite email names the real last
--      day from expires_at. This replaces 20261003140000's "KNOWN, ACCEPTED"
--      note (a code sent late used to end early without saying so).
--   3. Batch names are a fixed word and a number, never free text, because
--      the batch outlives the entry in user_cohorts:
--      ^(wave|officers|clubs|friends|test)-[0-9]{1,3}$ on waitlist.batch and
--      user_cohorts.batch (the admin page and routes use the same rule,
--      WAITLIST_BATCH_RE in types.ts). A batch that breaks the new rule (test
--      data: production has no rows when this runs) is cleared to null first,
--      with a NOTICE, including the one an undo would restore (code_prev).
--
-- LIVE STATE (local stack, 2026-10-03): md5(pg_get_functiondef) of
-- waitlist_purge_expired(integer) = 0a40219320a9d1dda2521968c03d6565 (file
-- 20261003140000), waitlist_issue_code(uuid,text,uuid,text,boolean,text) =
-- e0096a27614ba14c4c60f6d6a58d2c5c (file 20261003120000). Run twice, the
-- PRE-FLIGHT refuses (the md5s no longer match).
--
-- HOW TO APPLY BY HAND: as 20261003100000, then
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261003150000', 'waitlist_retention_fixes') on conflict do nothing;
-- ROLLBACK: re-run 20261003140000's section 4 and 20261003120000's
-- waitlist_issue_code as create or replace, put both batch CHECKs back as
-- '^[a-z0-9-]{1,40}$', and delete this row from schema_migrations.
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
      ('public.waitlist_purge_expired(integer)', '0a40219320a9d1dda2521968c03d6565'),
      ('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)', 'e0096a27614ba14c4c60f6d6a58d2c5c')
    ) as t(fn, md5)
  loop
    if to_regprocedure(want.fn) is null then
      raise exception 'waitlist-retention-fixes: % is missing; apply 20261003100000 to 20261003140000 first', want.fn;
    end if;
    select md5(pg_get_functiondef(want.fn::regprocedure)) into fp;
    if fp is distinct from want.md5 then
      raise exception 'waitlist-retention-fixes: % drifted or is already replaced (md5 %); re-read it first', want.fn, fp;
    end if;
  end loop;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.waitlist'::regclass and c.conname = 'waitlist_batch_check')
       is distinct from 'CHECK ((batch ~ ''^[a-z0-9-]{1,40}$''::text))'
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
          where c.conrelid = 'public.user_cohorts'::regclass and c.conname = 'user_cohorts_batch_check')
       is distinct from 'CHECK ((batch ~ ''^[a-z0-9-]{1,40}$''::text))' then
    raise exception 'waitlist-retention-fixes: the batch CHECKs are not the ones 20261003100000 / 20261003140000 made';
  end if;
end $$;

-- 2. BATCH NAMES -----------------------------------------------------------------
do $$
declare
  rule constant text := '^(wave|officers|clubs|friends|test)-[0-9]{1,3}$';
  n1 int;
  n2 int;
  n3 int;
begin
  update public.waitlist set batch = null where batch is not null and batch !~ rule;
  get diagnostics n1 = row_count;
  update public.waitlist set code_prev = jsonb_set(code_prev, '{batch}', 'null'::jsonb)
   where code_prev ->> 'batch' !~ rule;
  get diagnostics n2 = row_count;
  update public.user_cohorts set batch = null where batch is not null and batch !~ rule;
  get diagnostics n3 = row_count;
  if n1 + n2 + n3 > 0 then
    raise notice 'waitlist-retention-fixes: cleared batch names that break the new rule (waitlist %, code_prev %, user_cohorts %)',
      n1, n2, n3;
  end if;
end $$;

alter table public.waitlist drop constraint waitlist_batch_check,
  add constraint waitlist_batch_check check (batch ~ '^(wave|officers|clubs|friends|test)-[0-9]{1,3}$');
alter table public.user_cohorts drop constraint user_cohorts_batch_check,
  add constraint user_cohorts_batch_check check (batch ~ '^(wave|officers|clubs|friends|test)-[0-9]{1,3}$');

-- 3. THE PURGE, A DAY EARLY ---------------------------------------------------------
-- As 20261003140000, with 39 and 29 in place of 40 and 30.
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
     where w.created_at < now() - interval '39 days'
        or (w.origin = 'form'
            and w.confirmed_at is null
            and w.code_hash is null
            and w.created_at < now() - interval '29 days'
            and (w.confirm_sent_at is null or w.confirm_sent_at < now() - interval '29 days'))
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
  'Waitlist retention: deletes every entry 39 days after it joined (unconfirmed form entries 29 days after their last '
  'confirm email), so none outlives the promised 40 (30) with a daily cron; returns the deleted addresses. '
  'Service role only (42501 for anon and authenticated).';

-- 4. A CODE ENDS WITH ITS ENTRY -----------------------------------------------------
-- As 20261003120000, plus: the entry's deletion moment (created_at + 39 days,
-- the purge's line) caps code_expires_at, and an entry already past it gets
-- no code ("entry_expired"). expires_at in the answer is the real end, for
-- the invite email.
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
  v_ends := r.created_at + interval '39 days';
  if v_ends <= now() then
    return jsonb_build_object('ok', false, 'reason', 'entry_expired');
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

-- 5. POST-CHECK --------------------------------------------------------------------
do $$
declare
  bad text := '';
  f regprocedure;
  rule constant text := 'CHECK ((batch ~ ''^(wave|officers|clubs|friends|test)-[0-9]{1,3}$''::text))';
begin
  foreach f in array array['public.waitlist_purge_expired(integer)'::regprocedure,
                           'public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure] loop
    if not (has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')
            and has_function_privilege('service_role', f, 'execute')) then
      bad := bad || format(' %s is refused to an API role (the standing rule);', f);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
      bad := bad || format(' PUBLIC holds EXECUTE on %s;', f);
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f) then
      bad := bad || format(' %s is not SECURITY DEFINER;', f);
    end if;
  end loop;
  if pg_get_functiondef('public.waitlist_purge_expired(integer)'::regprocedure) ~ '(40|30) days' then
    bad := bad || ' the purge still deletes at 40 / 30 days;';
  end if;
  if pg_get_functiondef('public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure)
       not like '%least(now() + interval ''14 days'', v_ends)%' then
    bad := bad || ' waitlist_issue_code does not cap a code at its entry''s deletion;';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.waitlist'::regclass and c.conname = 'waitlist_batch_check') is distinct from rule
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
          where c.conrelid = 'public.user_cohorts'::regclass and c.conname = 'user_cohorts_batch_check') is distinct from rule then
    bad := bad || ' a batch CHECK is not the wave rule;';
  end if;
  if bad <> '' then
    raise exception 'waitlist-retention-fixes post-check failed:%', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
