-- P1-017 Composer: tags on posts/clips.
-- Adds the tags column referenced by the composer chip input and the
-- (future) feed search. Default empty array so existing rows stay valid.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_posts_tags_gin
  ON public.posts USING GIN (tags);
