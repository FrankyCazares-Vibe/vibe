-- Per-user suggestion dismissals.
--
-- When a user hits × on a Discover suggestion, the target shouldn't
-- resurface in their /api/me/suggested-connections payload. Survives
-- across sessions; per-device dismissals via localStorage would
-- silently re-suggest the same people on the next browser. Composite
-- PK (user_id, target_id) prevents duplicate rows.

CREATE TABLE IF NOT EXISTS public.suggestion_dismissals (
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);

ALTER TABLE public.suggestion_dismissals ENABLE ROW LEVEL SECURITY;

-- Author-only: you can only see / write / clear your own dismissals.
CREATE POLICY "suggestion_dismissals_select_own"
  ON public.suggestion_dismissals FOR SELECT TO authenticated
  USING (auth.uid () = user_id);

CREATE POLICY "suggestion_dismissals_insert_own"
  ON public.suggestion_dismissals FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "suggestion_dismissals_delete_own"
  ON public.suggestion_dismissals FOR DELETE TO authenticated
  USING (auth.uid () = user_id);

-- "All dismissals for this user" — the lookup the suggestions endpoint
-- runs every time it builds the candidate list.
CREATE INDEX IF NOT EXISTS suggestion_dismissals_user_idx
  ON public.suggestion_dismissals (user_id);
