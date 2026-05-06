-- Safety floor: blocks, mutes, reports.
--
-- Block (mutual hide) — neither party sees the other's content; messages
-- between them are rejected at the API layer. RLS only allows viewing
-- your own block rows.
--
-- Mute (one-sided hide) — the muter doesn't see the muted user's posts
-- in feed or get notifications from them; the muted user doesn't know.
-- Optional `until` timestamptz; NULL means forever.
--
-- Report — admin-only inbox. Any authenticated user can INSERT against
-- a target, but no SELECT policy means non-admins can't read. Admin
-- review queries via the service role bypass RLS.

CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  blocker_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON public.blocks;
CREATE POLICY "blocks_select_own"
  ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid () = blocker_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON public.blocks;
CREATE POLICY "blocks_insert_own"
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = blocker_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON public.blocks;
CREATE POLICY "blocks_delete_own"
  ON public.blocks FOR DELETE TO authenticated
  USING (auth.uid () = blocker_id);

CREATE TABLE IF NOT EXISTS public.mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  muter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

CREATE INDEX IF NOT EXISTS idx_mutes_muter ON public.mutes (muter_id);

ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mutes_select_own" ON public.mutes;
CREATE POLICY "mutes_select_own"
  ON public.mutes FOR SELECT TO authenticated
  USING (auth.uid () = muter_id);

DROP POLICY IF EXISTS "mutes_insert_own" ON public.mutes;
CREATE POLICY "mutes_insert_own"
  ON public.mutes FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = muter_id);

DROP POLICY IF EXISTS "mutes_update_own" ON public.mutes;
CREATE POLICY "mutes_update_own"
  ON public.mutes FOR UPDATE TO authenticated
  USING (auth.uid () = muter_id)
  WITH CHECK (auth.uid () = muter_id);

DROP POLICY IF EXISTS "mutes_delete_own" ON public.mutes;
CREATE POLICY "mutes_delete_own"
  ON public.mutes FOR DELETE TO authenticated
  USING (auth.uid () = muter_id);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  reporter_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('user', 'post', 'message', 'channel')),
  target_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (
    reason_code IN ('spam', 'harassment', 'sexual', 'hate', 'self_harm', 'other')
  ),
  reason text NOT NULL DEFAULT '' CHECK (length (reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON public.reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports (created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert reports (their own).
DROP POLICY IF EXISTS "reports_insert_authenticated" ON public.reports;
CREATE POLICY "reports_insert_authenticated"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = reporter_id);

-- No SELECT policy — admins read via the service role.

-- Helper: did either party block the other? Used by RLS-checking endpoints
-- and feed/search filters. SECURITY DEFINER bypasses the blocks RLS so
-- the function can see both directions.
CREATE OR REPLACE FUNCTION public.is_blocked_either_way (
  viewer_id uuid,
  other_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = viewer_id AND blocked_id = other_id)
       OR (blocker_id = other_id AND blocked_id = viewer_id)
  );
$$;

-- Active mute helper: viewer is currently muting other_id (until > now or NULL).
CREATE OR REPLACE FUNCTION public.is_muting_now (
  viewer_id uuid,
  other_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mutes
    WHERE muter_id = viewer_id
      AND muted_id = other_id
      AND (until IS NULL OR until > now ())
  );
$$;
