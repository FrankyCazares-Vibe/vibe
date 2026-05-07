-- Stage 7 — Personal calendar events.
--
-- These are not the same as `public.events` (which are verified-org-only
-- gatherings on the Events tab). `personal_events` are private reminders
-- the user creates from the LeftNav calendar widget — only they see them,
-- they merge into the Otto "Heads up" panel and the LeftNav month grid
-- alongside their RSVP'd public events.
--
-- Time stored as `starts_at` (point-in-time). `ends_at` optional for
-- duration; null means "single moment". `color` is a free-text hex like
-- '#FF5C35' so the day-grid pill can color-code per event.

CREATE TABLE IF NOT EXISTS public.personal_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz,
  location   text NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '#FF5C35',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_personal_events_user_starts
  ON public.personal_events (user_id, starts_at);

ALTER TABLE public.personal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_events_select_own" ON public.personal_events;
CREATE POLICY "personal_events_select_own"
  ON public.personal_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_events_insert_own" ON public.personal_events;
CREATE POLICY "personal_events_insert_own"
  ON public.personal_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_events_update_own" ON public.personal_events;
CREATE POLICY "personal_events_update_own"
  ON public.personal_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "personal_events_delete_own" ON public.personal_events;
CREATE POLICY "personal_events_delete_own"
  ON public.personal_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
