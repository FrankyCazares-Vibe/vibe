-- The rows verify-chat.mjs leaves (LOCAL ONLY): its "S80 fix:" messages, six of them notes by the end.
-- Look first; other sessions share the local database. Replace the window with the run's own minute.
select channel_id, created_at, deleted_at is not null as note, left(content, 40)
from public.messages where created_at > now() - interval '1 hour' and (deleted_at is not null or content like 'S80 fix:%');
-- delete from public.messages
-- where created_at between '<run start>' and '<run end>'
--   and channel_id in ('c1fd3fec-a59c-402f-8a90-5d9c36137bba','98fb9cd2-8630-4c3d-88f2-c3e91182e32f','d3c31eb8-01af-4654-9b47-034ddaea8b3f')
--   and (deleted_at is not null or content like 'S80 fix:%');
-- verify-like.mjs writes nothing that stays: its refused unlike never reaches the server, and its real like is unliked again.
