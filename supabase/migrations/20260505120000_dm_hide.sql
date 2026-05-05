-- Soft-hide a DM on your own side without affecting the peer.
-- A row with hidden_at NOT NULL is filtered from the viewer's thread list,
-- but if a new message arrives after hidden_at the API un-hides it (matches
-- Instagram-style "delete chat" behavior).

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- Cheap "is anything hidden right now?" lookup.
CREATE INDEX IF NOT EXISTS idx_channel_members_hidden
  ON public.channel_members (user_id)
  WHERE hidden_at IS NOT NULL;
