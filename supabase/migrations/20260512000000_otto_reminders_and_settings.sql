-- Otto's Room: reminders table + per-user settings blob.
--
-- The /otto page is a personal cockpit. Two persistence pieces:
--   1. public.otto_reminders — user-created "remind me to ___" rows plus
--      system-generated nudges (RSVP day-before, mentions, milestones,
--      unanswered DMs, connection requests). Every row is scoped to one
--      user; nothing in here is shared.
--   2. public.users.otto_settings — a small JSON bag holding chattiness
--      preset + per-channel toggles. JSON instead of separate columns so
--      we can add new toggles without a migration churn.
--
-- Schema is idempotent — the remote DB already has the table from an
-- ad-hoc apply earlier in the day, but RLS policies were never written.
-- This migration backfills the policies and is safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS otto_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.otto_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN
    ('manual','rsvp','mention','milestone','unanswered_dm','connection')),
  source_id uuid,
  source_kind text,
  title text NOT NULL,
  body text,
  remind_at timestamptz,
  surfaced_at timestamptz,
  dismissed_at timestamptz,
  acted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otto_reminders_user_remind_idx
  ON public.otto_reminders (user_id, remind_at NULLS LAST, created_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.otto_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "otto_reminders_select_own" ON public.otto_reminders;
CREATE POLICY "otto_reminders_select_own"
  ON public.otto_reminders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "otto_reminders_insert_own" ON public.otto_reminders;
CREATE POLICY "otto_reminders_insert_own"
  ON public.otto_reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "otto_reminders_update_own" ON public.otto_reminders;
CREATE POLICY "otto_reminders_update_own"
  ON public.otto_reminders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "otto_reminders_delete_own" ON public.otto_reminders;
CREATE POLICY "otto_reminders_delete_own"
  ON public.otto_reminders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
