-- User-chosen handles + 14-day edit cooldown.
--
-- Existing rows have ugly auto-generated handles like 'u<uuid>'. We mark
-- them as eligible for a free claim by leaving handle_changed_at NULL.
-- The first PATCH /api/me/handle call sets handle_changed_at to now();
-- subsequent changes are gated on (now() - handle_changed_at) >= 14 days.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS handle_changed_at timestamptz;

-- Format: 3–20 chars, lowercase letters / digits / underscore only.
-- The trigger-generated 'u<uuid>' values violate this CHECK so we must
-- keep them grandfathered: only NEW or UPDATED rows with a non-trigger
-- handle hit the constraint. We accept that as the explicit signal that
-- existing users have to claim a real handle (the UI prompts them).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_handle_format_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_handle_format_check
      CHECK (handle ~ '^[a-z0-9_]{3,20}$' OR handle ~ '^u[a-f0-9]{32}$');
  END IF;
END $$;
