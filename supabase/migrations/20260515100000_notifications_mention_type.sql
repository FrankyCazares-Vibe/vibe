-- Mentions in posts (and later, DMs) need to land as `notifications`
-- rows. The publish-post / publish-clip routes already build the row
-- shape via lib/mentions.ts and gracefully no-op when the schema rejects
-- the insert — this migration lifts the lid so those calls actually
-- succeed.
--
-- Two changes:
--   1. Extend `notifications.type` CHECK to include 'mention'.
--   2. Add a nullable `message_id` column so chat-mentions can also
--      land here later. Foreign-keyed to messages with ON DELETE CASCADE
--      so deleting the source message cleans up its notifications.
--
-- The 'mention' rows are inserted by the API route under the caller's
-- RLS context (not via a trigger). The existing notifications SELECT /
-- UPDATE / DELETE policies already cover the row owner.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'connection', 'like', 'comment', 'mention'));

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message_id uuid
  REFERENCES public.messages (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_message_id
  ON public.notifications (message_id)
  WHERE message_id IS NOT NULL;

-- Authors triggering mention-notifications via the API route insert with
-- their auth.uid() as actor_id and the mentionee as user_id. The base
-- table's SELECT / UPDATE / DELETE policies already gate per user_id =
-- auth.uid(); we just need an INSERT policy that lets authenticated
-- users insert rows where they ARE the actor (so they can fan out
-- mentions without being the row owner).
DROP POLICY IF EXISTS "notifications_insert_as_actor" ON public.notifications;
CREATE POLICY "notifications_insert_as_actor"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid () = actor_id
    AND type = 'mention'
  );
