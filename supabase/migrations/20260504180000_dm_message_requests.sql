-- DM message requests + unread tracking on channel_members.
--
-- accepted_at: set on the initiator when a 1:1 DM channel is created.
-- The recipient's row stays NULL until they explicitly accept (or implicitly
-- accept by replying). This keeps cold-outreach DMs in a "requests" tab
-- separate from the main thread list.
--
-- last_read_at: per-member read marker. A thread is unread when the channel's
-- latest message.created_at > member.last_read_at (or member.last_read_at IS NULL).
--
-- Backfill: any pre-existing rows are auto-accepted (no real DM data exists yet,
-- this is purely defensive).

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

UPDATE public.channel_members
  SET accepted_at = created_at
  WHERE accepted_at IS NULL;

-- Cheap "show me my pending DM requests" lookup.
CREATE INDEX IF NOT EXISTS idx_channel_members_pending
  ON public.channel_members (user_id)
  WHERE accepted_at IS NULL;
