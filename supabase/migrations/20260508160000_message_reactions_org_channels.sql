-- Fix: extend message_reactions RLS to cover org channels.
--
-- The original policies (20260508150000) only checked `is_channel_member`,
-- which only returns true for DM/group channels (rows in channel_members).
-- Org channels use `can_view_org_channel(cid, uid)` instead, so reactions
-- on org-channel messages were being silently rejected by RLS — the
-- optimistic UI would flip the chip on, then the next poll showed an
-- empty reactions array and the chip vanished.
--
-- Drop + recreate the policies with an OR for the org-channel path, so
-- both surfaces work uniformly.

DROP POLICY IF EXISTS "message_reactions_select_member" ON public.message_reactions;
CREATE POLICY "message_reactions_select_member"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.channels c ON c.id = m.channel_id
      WHERE m.id = message_reactions.message_id
        AND (
          public.is_channel_member(m.channel_id)
          OR (
            c.org_id IS NOT NULL
            AND public.can_view_org_channel(m.channel_id, auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "message_reactions_insert_member" ON public.message_reactions;
CREATE POLICY "message_reactions_insert_member"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.channels c ON c.id = m.channel_id
      WHERE m.id = message_reactions.message_id
        AND (
          public.is_channel_member(m.channel_id)
          OR (
            c.org_id IS NOT NULL
            AND public.can_view_org_channel(m.channel_id, auth.uid())
          )
        )
    )
  );

-- DELETE policy stays simple — owner-only (auth.uid() = user_id) is
-- already correct since you can only delete your own reaction.
