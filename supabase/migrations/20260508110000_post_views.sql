-- Stage 7 — Per-post view counter (per-user-per-day dedupe).
--
-- Two surfaces:
--   1. `posts.view_count` — denormalized counter rendered in the engagement
--      bar. Cheap to read; updated atomically by the RPC below.
--   2. `post_views` — dedupe ledger keyed by (post_id, user_id, viewed_on).
--      The unique key means refreshing the same post on the same day is a
--      no-op, but viewing it the next day does count again. We don't expose
--      this table to clients — it's purely an idempotency record.
--
-- Anonymous viewers (signed-out) are NOT counted in v1. If we want public
-- views later, we'd add a hashed-IP fallback path; for now the engagement
-- bar is only shown to authenticated users anyway.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_views (
  post_id   uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  viewed_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  PRIMARY KEY (post_id, user_id, viewed_on)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post
  ON public.post_views (post_id, viewed_on DESC);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

-- No client SELECT policy — we never expose individual view rows. Counts
-- come from `posts.view_count`. The RPC below runs as SECURITY DEFINER so
-- it bypasses RLS for the dedupe insert.

-- Idempotent view recorder. Returns true when this is a new (user, day)
-- view (and the counter was bumped), false when it's a duplicate.
CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.post_views (post_id, user_id)
  VALUES (p_post_id, v_user_id)
  ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.posts
       SET view_count = view_count + 1
     WHERE id = p_post_id;
  END IF;

  RETURN COALESCE(v_inserted, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_post_view(uuid) TO authenticated;

-- Backfill: existing posts start at 0 (column DEFAULT handles new rows).
-- We don't backfill from any historical data because there isn't any.
