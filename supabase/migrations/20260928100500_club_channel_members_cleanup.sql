-- S67 security wave 2, batch A5a: CLEANUP for #14 (ex-members keep the club
-- chat roster). DATA CHANGE, approved separately from 20260928100000.
--
-- COUNT (read-only MCP, prod, 2026-09-27): 0 stale channel_members rows (of 2
-- club-chat rows) and 0 stale org_channel_members rows (of 0). Today this file
-- deletes NOTHING; it exists so any row that goes stale between the audit and
-- the main file's apply is swept, and so the sweep is on record.
--
-- WHAT "STALE" MEANS: a channel_members or org_channel_members row on a CLUB
-- channel (channels.org_id is not null) whose user has no org_members row for
-- that club. DMs and group chats (org_id null) are never touched.
--
-- APPLY ORDER: right AFTER 20260928100000 (its AFTER DELETE trigger stops new
-- stale rows, so nothing can go stale after this sweep). The PRE-FLIGHT
-- refuses to run without that trigger, and aborts if the count has grown past
-- 25 (re-read before deleting a surprise). Either side of the deploy is fine.
-- Apply via the management API, then insert the schema_migrations row
-- (version 20260928100500).
--
-- ROLLBACK: none possible for deleted rows (they granted access the person no
-- longer has; re-joining the club re-subscribes them to its public chats).
-- To forget the file: DELETE FROM supabase_migrations.schema_migrations
-- WHERE version = '20260928100500';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT
do $$
declare
  stale_cm int;
  stale_ocm int;
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.org_members'::regclass
                    and tgname = 'org_members_drop_club_access' and tgenabled = 'O') then
    raise exception 'club-chat-cleanup: apply 20260928100000 first (its trigger is missing)';
  end if;

  select count(*) into stale_cm
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null
     and not exists (select 1 from public.org_members m
                      where m.org_id = c.org_id and m.user_id = cm.user_id);
  select count(*) into stale_ocm
    from public.org_channel_members ocm
    join public.channels c on c.id = ocm.channel_id
   where c.org_id is not null
     and not exists (select 1 from public.org_members m
                      where m.org_id = c.org_id and m.user_id = ocm.user_id);
  raise notice 'club-chat-cleanup: % stale channel_members, % stale org_channel_members', stale_cm, stale_ocm;
  if stale_cm > 25 or stale_ocm > 25 then
    raise exception 'club-chat-cleanup: far more stale rows than the audit counted (0/0); re-read before deleting';
  end if;
end $$;

-- 1. The sweep
delete from public.channel_members cm
 using public.channels c
 where c.id = cm.channel_id
   and c.org_id is not null
   and not exists (select 1 from public.org_members m
                    where m.org_id = c.org_id and m.user_id = cm.user_id);

delete from public.org_channel_members ocm
 using public.channels c
 where c.id = ocm.channel_id
   and c.org_id is not null
   and not exists (select 1 from public.org_members m
                    where m.org_id = c.org_id and m.user_id = ocm.user_id);

-- 2. POST-CHECK: nothing stale is left.
do $$
begin
  if exists (select 1 from public.channel_members cm
               join public.channels c on c.id = cm.channel_id
              where c.org_id is not null
                and not exists (select 1 from public.org_members m
                                 where m.org_id = c.org_id and m.user_id = cm.user_id))
     or exists (select 1 from public.org_channel_members ocm
                  join public.channels c on c.id = ocm.channel_id
                 where c.org_id is not null
                   and not exists (select 1 from public.org_members m
                                    where m.org_id = c.org_id and m.user_id = ocm.user_id)) then
    raise exception 'club-chat-cleanup: stale club-chat rows remain';
  end if;
end $$;

commit;
