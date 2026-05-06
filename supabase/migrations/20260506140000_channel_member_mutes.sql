-- Per-channel-member mute: scope a mute to a single channel.
--
-- Distinct from public.mutes (global, applies everywhere — feed, posts,
-- 1:1 dms, every group). Use this when the muter wants to silence a
-- specific person ONLY within a specific group.
--
-- Behavior (v1): record-only. Notification suppression for chat events
-- isn't wired yet — when it lands, the consumer joins this table to
-- decide whether to notify.

CREATE TABLE IF NOT EXISTS public.channel_member_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  channel_id uuid NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  muter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (channel_id, muter_id, muted_user_id),
  CHECK (muter_id <> muted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_member_mutes_muter
  ON public.channel_member_mutes (muter_id, channel_id);

ALTER TABLE public.channel_member_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_member_mutes_select_own" ON public.channel_member_mutes;
CREATE POLICY "channel_member_mutes_select_own"
  ON public.channel_member_mutes FOR SELECT TO authenticated
  USING (auth.uid () = muter_id);

DROP POLICY IF EXISTS "channel_member_mutes_insert_own" ON public.channel_member_mutes;
CREATE POLICY "channel_member_mutes_insert_own"
  ON public.channel_member_mutes FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = muter_id);

DROP POLICY IF EXISTS "channel_member_mutes_update_own" ON public.channel_member_mutes;
CREATE POLICY "channel_member_mutes_update_own"
  ON public.channel_member_mutes FOR UPDATE TO authenticated
  USING (auth.uid () = muter_id)
  WITH CHECK (auth.uid () = muter_id);

DROP POLICY IF EXISTS "channel_member_mutes_delete_own" ON public.channel_member_mutes;
CREATE POLICY "channel_member_mutes_delete_own"
  ON public.channel_member_mutes FOR DELETE TO authenticated
  USING (auth.uid () = muter_id);
