-- Chat-level mute + @mention notifications.
--
-- channel_members.muted_until — viewer-side silence on a channel
-- (DM or group). NULL = not muted; non-null timestamp = muted until
-- that point; the API can also set NULL-meaning-forever via a
-- separate "forever" flag if we ever need that, but for v1 we let
-- "forever" map to a far-future timestamp set by the API. NULL here
-- always means "not muted".
--
-- notifications: add 'mention' to the type CHECK and a message_id FK
-- so a mention in a chat message can reference the source bubble
-- (post mentions reuse the existing post_id column).

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_channel_members_muted
  ON public.channel_members (user_id)
  WHERE muted_until IS NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_message
  ON public.notifications (message_id)
  WHERE message_id IS NOT NULL;

-- Drop and recreate the type CHECK so it accepts 'mention'. IF EXISTS
-- on the drop is safer across reruns.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('follow', 'like', 'comment', 'connection', 'mention'));
