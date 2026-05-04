-- P1-015 Post viewer modal: likes + flat comment threads on posts/clips.
-- Same tables serve both type='post' and type='clip' rows since the modal
-- is unified across surfaces (P1-016 will reuse for clips).

CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_user
  ON public.post_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_created
  ON public.post_comments (post_id, created_at DESC);

ALTER TABLE public.post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Likes: anyone authenticated can read; users only mutate their own rows.
DROP POLICY IF EXISTS "post_likes_select_authenticated" ON public.post_likes;
CREATE POLICY "post_likes_select_authenticated"
  ON public.post_likes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "post_likes_insert_own" ON public.post_likes;
CREATE POLICY "post_likes_insert_own"
  ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_likes_delete_own" ON public.post_likes;
CREATE POLICY "post_likes_delete_own"
  ON public.post_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Comments: anyone authenticated can read; users only insert/delete their own.
-- Update intentionally NOT permitted at DB level — edits are a future ticket
-- and we don't want a rogue client modifying history.
DROP POLICY IF EXISTS "post_comments_select_authenticated" ON public.post_comments;
CREATE POLICY "post_comments_select_authenticated"
  ON public.post_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "post_comments_insert_own" ON public.post_comments;
CREATE POLICY "post_comments_insert_own"
  ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_comments_delete_own" ON public.post_comments;
CREATE POLICY "post_comments_delete_own"
  ON public.post_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
