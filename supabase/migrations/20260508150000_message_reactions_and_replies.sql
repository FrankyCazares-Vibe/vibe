-- Stage 7 — Chat reactions + inline replies.
--
-- Two things shipped together because they share the same UI surface
-- (the chat composer / message row hover state):
--
--   1. `message_reactions` — per-(message, user, emoji) row. Multiple
--      emojis per user per message are allowed (one user can heart AND
--      laugh at the same message), but no duplicate (user, emoji) pair
--      on the same message.
--   2. `messages.parent_message_id` — twitter-style inline quote-reply.
--      A reply points at its parent. We don't enforce one-level depth
--      at the DB layer (replies of replies are technically possible);
--      the API resolves long chains to the top-level ancestor when
--      building the visual quote stub, mirroring how comment replies
--      are flattened to a single nesting level.

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions (message_id, created_at ASC);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- A user can only see / mutate reactions on messages they can see. We
-- piggyback on the existing `is_channel_member` SECURITY DEFINER helper
-- (lives in 20260505100000) — same gate as message reads.
DROP POLICY IF EXISTS "message_reactions_select_member" ON public.message_reactions;
CREATE POLICY "message_reactions_select_member"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.is_channel_member(m.channel_id)
    )
  );

DROP POLICY IF EXISTS "message_reactions_insert_member" ON public.message_reactions;
CREATE POLICY "message_reactions_insert_member"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.is_channel_member(m.channel_id)
    )
  );

DROP POLICY IF EXISTS "message_reactions_delete_own" ON public.message_reactions;
CREATE POLICY "message_reactions_delete_own"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid
    REFERENCES public.messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_parent
  ON public.messages (parent_message_id, created_at ASC)
  WHERE parent_message_id IS NOT NULL;
