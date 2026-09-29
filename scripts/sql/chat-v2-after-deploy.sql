-- chat-v2-after-deploy.sql: is every club's chat whole? (S69, batch B1a;
-- contract handoffs/chat-redesign/wave-1-contracts.md section 3.10.)
--
-- READ-ONLY. One SELECT, no writes. It prints club handles, room names and
-- ids only: never a name, an email or a message.
--
-- WHEN. Right after migration A (20261001100000_chat_v2_rooms.sql) is applied
-- and the branch is deployed. Between the apply and the deploy old code runs
-- on the new database: a club created in that window gets its Lounge and
-- Board from the BEFORE INSERT trigger but no Officers room, the old desktop
-- modal can still delete or rename a core room, and the old inbox can still
-- delete a member's row. The four AFTER triggers also swallow their own
-- errors (contract 12.16), so run this again whenever the database log shows
-- "chat-rooms: ... failed".
-- Also run it weekly while clubs are onboarding: two writes at the same
-- moment (a join and a new room, a join and an RSVP) can each miss the
-- other's row without any warning in the log.
--
-- Run locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -f - < scripts/sql/chat-v2-after-deploy.sql
-- Production: the orchestrator pastes it into the read-only Supabase MCP
-- (execute_sql). Never run it with .env.local credentials.
-- On a database without migration A it fails with 42703 (column
-- channels.kind does not exist): that is the answer "not applied".
-- Time zone: the 7 days of an event chat are counted in UTC here, as in the
-- three functions of the migration (they pin TimeZone to UTC), so the answer
-- is the same in any session. The MCP and psql run in UTC anyway.
--
-- WHAT IT LISTS, one row per finding:
--   core_room         a club without exactly one board, one lounge or one
--                     officers room (found = how many it has)
--   event_room        an event inside its window (not past ends_at + 7 days)
--                     without a room
--   public_room_row   a (member, public room) pair with no row
--   event_room_row    an owner/admin, or a member holding a going/maybe
--                     RSVP, with no row on an open event room
--   extra_row         a row that should NOT exist: on any room of a club,
--                     held by someone who is not a member of that club; on
--                     an event room (open or closed), held by someone who is
--                     neither an owner/admin nor the holder of a going/maybe
--                     RSVP for that event. What a failed DELETE leaves
--                     behind (an RSVP changed to no, an officer demoted).
--   pending_row       a club-room row whose accepted_at is null (a member
--                     can still set it; the old inbox then hides the room)
--   core_room_name    a Board, Lounge or Officers room whose name is not its
--                     kind (renamed by old code inside the apply window)
--   event_room_name   an event room whose name is not the first 80
--                     characters of its event's title (renamed by old code,
--                     or the rename of chat_events_room failed)
--   summary           always the last row: how many findings, 0 = whole
--
-- THE FIX is the last column of each row. Every fix is a write: on
-- production it needs Franky's yes and the Management API recipe, not this
-- script. Then run this again.
--   * For the first six lists, with the service role:
--       select public.chat_repair_club('<club_id>');
--     It creates what is missing, removes the extra_row rows and sets
--     accepted_at on the pending_row rows. It can be run any number of times.
--   * For the two name lists the repair does nothing (it never renames):
--       update public.channels set name = kind where id = '<room_id>';
--       update public.channels c set name = left(e.title, 80)
--         from public.events e where e.id = c.event_id and c.id = '<room_id>';
-- A club with TWO rooms of one core kind cannot exist (unique index
-- channels_one_core_room), so "found" is 0 or 1.
--
-- WHAT IT DOES NOT LIST: the rows left on an extra room that was turned
-- private while the delete of chat_channels_subscribe failed. They open
-- nothing (a private room is opened by the role or the allow-list, never by
-- a row) and the repair leaves them alone.

with core as (
  select 'core_room'::text as finding,
         o.id as club_id,
         o.handle as club,
         k.kind as room,
         null::uuid as room_id,
         null::uuid as event_id,
         null::uuid as user_id,
         'found ' || (select count(*) from public.channels c
                       where c.org_id = o.id and c.kind = k.kind) as detail
    from public.orgs o
   cross join (values ('board'), ('lounge'), ('officers')) as k (kind)
   where (select count(*) from public.channels c
           where c.org_id = o.id and c.kind = k.kind) <> 1
),
event_room as (
  select 'event_room'::text, o.id, o.handle, left(e.title, 80),
         null::uuid, e.id, null::uuid,
         'ends ' || to_char(e.ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
    from public.events e
    join public.orgs o on o.id = e.org_id
   where (e.ends_at at time zone 'UTC' + interval '7 days') at time zone 'UTC' > now()
     and not exists (select 1 from public.channels c where c.event_id = e.id)
),
public_room_row as (
  select 'public_room_row'::text, o.id, o.handle, c.name,
         c.id, null::uuid, m.user_id,
         'role ' || m.role
    from public.org_members m
    join public.orgs o on o.id = m.org_id
    join public.channels c
      on c.org_id = m.org_id
     and c.type = 'org_channel'
     and c.kind in ('board', 'lounge', 'room')
     and c.is_private = false
   where not exists (select 1 from public.channel_members cm
                      where cm.channel_id = c.id and cm.user_id = m.user_id)
),
event_room_row as (
  select 'event_room_row'::text, o.id, o.handle, c.name,
         c.id, e.id, m.user_id,
         case when m.role in ('owner', 'admin') then 'role ' || m.role
              else 'rsvp going/maybe' end
    from public.channels c
    join public.events e on e.id = c.event_id
    join public.orgs o on o.id = c.org_id
    join public.org_members m on m.org_id = c.org_id
   where c.kind = 'event'
     and (e.ends_at at time zone 'UTC' + interval '7 days') at time zone 'UTC' > now()
     and (m.role in ('owner', 'admin')
          or exists (select 1 from public.rsvps r
                      where r.event_id = e.id and r.user_id = m.user_id
                        and r.status in ('going', 'maybe')))
     and not exists (select 1 from public.channel_members cm
                      where cm.channel_id = c.id and cm.user_id = m.user_id)
),
extra_row as (
  select 'extra_row'::text, o.id, o.handle, c.name,
         c.id, c.event_id, cm.user_id,
         case when m.user_id is null then 'holder is not a member of the club'
              else 'role ' || m.role || ', no going/maybe RSVP' end
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
    join public.orgs o on o.id = c.org_id
    left join public.org_members m
      on m.org_id = c.org_id and m.user_id = cm.user_id
   where c.type = 'org_channel'
     and (m.user_id is null
          or (c.kind = 'event'
              and m.role not in ('owner', 'admin')
              and not exists (select 1 from public.rsvps r
                               where r.event_id = c.event_id
                                 and r.user_id = cm.user_id
                                 and r.status in ('going', 'maybe'))))
),
pending_row as (
  select 'pending_row'::text, o.id, o.handle, c.name,
         c.id, c.event_id, cm.user_id,
         'accepted_at is null'
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
    join public.orgs o on o.id = c.org_id
   where c.type = 'org_channel'
     and cm.accepted_at is null
),
core_room_name as (
  select 'core_room_name'::text, o.id, o.handle, c.name,
         c.id, null::uuid, null::uuid,
         'kind ' || c.kind
    from public.channels c
    join public.orgs o on o.id = c.org_id
   where c.kind in ('board', 'lounge', 'officers')
     and c.name is distinct from c.kind
),
event_room_name as (
  select 'event_room_name'::text, o.id, o.handle, c.name,
         c.id, e.id, null::uuid,
         'title is ' || left(e.title, 80)
    from public.channels c
    join public.events e on e.id = c.event_id
    join public.orgs o on o.id = c.org_id
   where c.kind = 'event'
     and c.name is distinct from left(e.title, 80)
),
findings as (
  select * from core
  union all select * from event_room
  union all select * from public_room_row
  union all select * from event_room_row
  union all select * from extra_row
  union all select * from pending_row
  union all select * from core_room_name
  union all select * from event_room_name
)
select f.finding, f.club, f.room, f.detail, f.club_id, f.room_id, f.event_id, f.user_id,
       case f.finding
         when 'core_room_name' then
           'by hand: update public.channels set name = kind where id = '''
             || f.room_id || ''';'
         when 'event_room_name' then
           'by hand: update public.channels c set name = left(e.title, 80) from public.events e'
             || ' where e.id = c.event_id and c.id = ''' || f.room_id || ''';'
         else 'select public.chat_repair_club(''' || f.club_id || ''');'
       end as fix
  from findings f
union all
select 'summary', null, null,
       (select count(*) from findings) || ' findings in '
         || (select count(distinct club_id) from findings) || ' clubs; '
         || (select count(*) from public.orgs) || ' clubs, '
         || (select count(*) from public.channels where org_id is not null) || ' club rooms checked',
       null, null, null, null, null
 order by 1, 2, 3, 4;
