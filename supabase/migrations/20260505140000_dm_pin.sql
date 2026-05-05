-- Per-member pin marker. Pinned threads sort to the top of the viewer's
-- thread list (within their hidden/accepted bucket). Toggling clears it.

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- Cheap "show me my pins" filter; partial index keeps the table compact.
CREATE INDEX IF NOT EXISTS idx_channel_members_pinned
  ON public.channel_members (user_id)
  WHERE pinned_at IS NOT NULL;
