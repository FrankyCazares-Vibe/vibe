-- In-app notifications surfaced through Otto's corner ring.
--
-- Three event sources (for v1):
--   - someone followed you   → post_likes is the wrong source; connections.insert
--   - someone liked your post → post_likes.insert
--   - someone commented      → post_comments.insert
--
-- Triggers fire SECURITY DEFINER so they bypass RLS — users can't INSERT
-- their own notifications, only Postgres can. Read/update gated by RLS
-- so users can mark their own notifications as read.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('follow','like','comment')),
  post_id    uuid REFERENCES public.posts (id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.post_comments (id) ON DELETE CASCADE,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot-path index for the dot count: WHERE user_id = $me AND read_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy — only triggers (SECURITY DEFINER) can write.

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── Triggers ─────────────────────────────────────────────────────────

-- New connection (follow) → notify the followed user
CREATE OR REPLACE FUNCTION public.notify_on_connection_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Defensive: schema CHECK already prevents follower=following, but
  -- guard anyway so an upstream change can't accidentally self-notify.
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_connection ON public.connections;
CREATE TRIGGER trg_notify_on_connection
  AFTER INSERT ON public.connections
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_on_connection_insert ();

-- New post like → notify the post owner (skip self-likes)
CREATE OR REPLACE FUNCTION public.notify_on_like_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, actor_id, type, post_id)
  VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_like ON public.post_likes;
CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_on_like_insert ();

-- New comment → notify the post owner (skip self-comments)
CREATE OR REPLACE FUNCTION public.notify_on_comment_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
  VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.post_comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_on_comment_insert ();
