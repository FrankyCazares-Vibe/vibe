-- Drafts: lets users save clips (or any post) without publishing.
--
-- Default 'published' keeps every existing row visible exactly the way
-- it was before this migration. Only drafts are scoped to their owner
-- via the rewritten SELECT policy.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

-- Constraint is added separately so the ALTER above is idempotent on
-- partially-applied environments.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_status_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END$$;

-- Drafts must be invisible to everyone but the author. Replace the
-- existing wide-open SELECT policy with one that filters them.
DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;
CREATE POLICY "posts_select_authenticated"
  ON public.posts FOR SELECT TO authenticated
  USING (status = 'published' OR user_id = auth.uid ());

-- Indexed lookup of "my drafts, newest first" — small partial index
-- keeps it cheap; only draft rows ever land in it.
CREATE INDEX IF NOT EXISTS posts_drafts_by_user_idx
  ON public.posts (user_id, created_at DESC)
  WHERE status = 'draft';
