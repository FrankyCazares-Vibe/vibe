-- Profile views — who looked at your profile, when.
--
-- Mirrors the `post_views` pattern exactly:
--   1. `users.profile_view_count` — denormalized counter on the profile
--      owner's row. Cheap to read; bumped atomically by the RPC.
--   2. `profile_views` — dedupe ledger keyed by (profile_user_id, viewer_user_id,
--      viewed_on). Refreshing the same profile in the same day is a no-op,
--      but the next day counts again. Schema also includes a nullable
--      `referrer` text for future analytics (Otto link vs feed vs search).
--
-- Why a ledger (not just a counter): "see who viewed your profile" is the
-- canonical premium hook on social platforms. We capture viewer identity
-- now so we don't have to retro-build the data once we ship the paywall.
-- The viewer-list endpoint will be gated separately; the counter is free.
--
-- Anonymous viewers (signed-out) are NOT counted. We also explicitly skip
-- the case where the viewer is the profile owner (looking at your own page
-- doesn't count).
--
-- RLS:
--   - profile_views select policy lets the *profile owner* read their own
--     incoming views (for the "who viewed me" list). Viewers cannot read
--     each other's views.
--   - The RPC is SECURITY DEFINER so it can write past the per-user write
--     policy without exposing direct INSERT to the client.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_view_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.profile_views (
  profile_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  viewer_user_id  uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  viewed_on       date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  referrer        text,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_user_id, viewer_user_id, viewed_on)
);

CREATE INDEX IF NOT EXISTS idx_profile_views_owner_recent
  ON public.profile_views (profile_user_id, viewed_on DESC, first_viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Owner can read their own incoming view rows. No other policies — viewers
-- never see each other's rows, and the RPC handles the insert path.
DROP POLICY IF EXISTS "profile_views_owner_select" ON public.profile_views;
CREATE POLICY "profile_views_owner_select"
  ON public.profile_views FOR SELECT TO authenticated
  USING (auth.uid() = profile_user_id);

CREATE OR REPLACE FUNCTION public.record_profile_view(
  p_profile_user_id uuid,
  p_referrer text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN false;
  END IF;
  IF v_viewer = p_profile_user_id THEN
    -- Looking at your own profile doesn't count.
    RETURN false;
  END IF;

  INSERT INTO public.profile_views (profile_user_id, viewer_user_id, referrer)
  VALUES (p_profile_user_id, v_viewer, NULLIF(p_referrer, ''))
  ON CONFLICT (profile_user_id, viewer_user_id, viewed_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.users
       SET profile_view_count = profile_view_count + 1
     WHERE id = p_profile_user_id;
  END IF;

  RETURN COALESCE(v_inserted, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_profile_view(uuid, text) TO authenticated;
