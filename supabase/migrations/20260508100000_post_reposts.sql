-- Stage 7 — Reposts (Twitter-style quote repost).
--
-- One row per (post_id, user_id) pair: a user can repost a given post at most
-- once. The optional `comment` column makes this a quote repost when set —
-- the original post is embedded and the resharer's commentary renders above.
-- A null comment means a plain boost.
--
-- The repost surfaces in the campus feed as its own row with a "🔁 @handle
-- reposted" banner, and the original post still gets its own row. We let the
-- feed query UNION them in via the same ordering key (created_at) so the
-- feed remains a single chronological list rather than two separate streams.

CREATE TABLE IF NOT EXISTS public.post_reposts (
  post_id    uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  comment    text CHECK (comment IS NULL OR length(comment) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reposts_user_created
  ON public.post_reposts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_reposts_post_created
  ON public.post_reposts (post_id, created_at DESC);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reposts (they show in feeds + profile tabs).
DROP POLICY IF EXISTS "post_reposts_select_authenticated" ON public.post_reposts;
CREATE POLICY "post_reposts_select_authenticated"
  ON public.post_reposts FOR SELECT TO authenticated
  USING (true);

-- Insert / update / delete only your own row.
DROP POLICY IF EXISTS "post_reposts_insert_own" ON public.post_reposts;
CREATE POLICY "post_reposts_insert_own"
  ON public.post_reposts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update is allowed so users can edit their quote text without re-creating
-- the row (which would lose the original timestamp).
DROP POLICY IF EXISTS "post_reposts_update_own" ON public.post_reposts;
CREATE POLICY "post_reposts_update_own"
  ON public.post_reposts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_reposts_delete_own" ON public.post_reposts;
CREATE POLICY "post_reposts_delete_own"
  ON public.post_reposts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
