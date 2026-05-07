-- Stage 7 — Comment engagement (hearts + flat replies).
--
-- Two changes shipped together because they share the same UI surface:
--   1. `comment_likes` table — one heart per (comment, user) pair.
--   2. `post_comments.parent_comment_id` — flat one-level threading. A
--      reply points at its parent comment; replies of replies are NOT
--      supported. Matches Instagram/Twitter conventions.
--
-- We allow `parent_comment_id` to reference a comment whose own
-- `parent_comment_id` is NULL only at the application layer (no DB-level
-- check) — a CHECK constraint would require a recursive lookup. The
-- application enforces the rule by always passing a top-level id when
-- the user clicks "Reply".

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.post_comments (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_user
  ON public.comment_likes (user_id, created_at DESC);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select_authenticated" ON public.comment_likes;
CREATE POLICY "comment_likes_select_authenticated"
  ON public.comment_likes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_own" ON public.comment_likes;
CREATE POLICY "comment_likes_insert_own"
  ON public.comment_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_likes_delete_own" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own"
  ON public.comment_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
    REFERENCES public.post_comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent
  ON public.post_comments (parent_comment_id, created_at ASC)
  WHERE parent_comment_id IS NOT NULL;
