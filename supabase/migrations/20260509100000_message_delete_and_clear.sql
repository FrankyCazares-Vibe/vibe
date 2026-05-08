-- Per-message delete + per-viewer "clear history" support.
--
-- Two independent additions:
--   1. messages_delete_own RLS policy — sender can hard-delete their own
--      message. Recipients can't delete what they didn't send (asymmetric
--      by design; that's the same behaviour as iMessage / Discord).
--   2. channel_members.cleared_at — a per-viewer timestamp. Messages
--      whose created_at <= cleared_at are filtered out of the viewer's
--      messages GET response, so "clear history" is a viewer-side
--      concept that doesn't affect the peer's copy of the chat.
--
-- Both are independent so a half-applied migration still leaves the chat
-- working — the API tolerates either column / policy missing.

-- 1. Sender-only delete policy.
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own"
  ON public.messages FOR DELETE TO authenticated
  USING (auth.uid () = user_id);

-- 2. Per-viewer cleared_at.
ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;
