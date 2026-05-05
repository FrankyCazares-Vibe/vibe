-- channel_members had INSERT + SELECT policies but no UPDATE policy, so
-- every server-side update we do (mark-read, pin, accept, hide, typing
-- heartbeat, last_read_at on send) was being silently denied by RLS.
-- The UI looked correct because we updated client state optimistically,
-- but the DB never reflected those changes. Result: unread dot returns
-- after a poll cycle, pins don't persist, etc.
--
-- This policy lets a member update only their own row.

DROP POLICY IF EXISTS "channel_members_update_own" ON public.channel_members;
CREATE POLICY "channel_members_update_own"
  ON public.channel_members FOR UPDATE TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);
