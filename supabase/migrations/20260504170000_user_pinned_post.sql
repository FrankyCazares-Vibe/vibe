-- Persist the pinned post/clip on each user so the pin survives logout
-- and is visible to visitors.
--
-- Owner-only writes are enforced in the API (you can only pin one of
-- your own posts), so we don't need a trigger here. ON DELETE SET NULL
-- means deleting the post automatically clears the pin.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pinned_post_id uuid
  REFERENCES public.posts (id) ON DELETE SET NULL;
