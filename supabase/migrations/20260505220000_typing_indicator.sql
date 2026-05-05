-- Typing indicator — heartbeat timestamp on each member's row.
-- The composer pings POST /api/me/threads/[id]/typing every ~3s while the
-- user is typing; that bumps typing_until = now() + 5s. Peers polling
-- the messages route see "typing" while now() < typing_until.
--
-- 5s heartbeat means the indicator naturally clears within 5s of the
-- last keystroke without needing an explicit "stopped" ping.

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS typing_until timestamptz;
