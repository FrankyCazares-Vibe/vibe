-- Followup to 20260507150000_org_governance.sql.
--
-- The original migration added `last_activity_at timestamptz` with no
-- DEFAULT, intending the trigger on `messages` insert to populate it. But
-- new orgs are created before any message lands, so they sat at NULL — and
-- the dormancy filter previously treated NULL as "dormant", which made
-- brand-new community orgs invisible in Discover the moment they were born.
--
-- Two fixes:
--   1. Application code now treats NULL as "fresh" (not dormant) so the bug
--      is patched even on rows that never get a timestamp.
--   2. This migration sets a DEFAULT and backfills existing NULL rows to
--      `created_at` so the column is always populated going forward.

ALTER TABLE public.orgs
  ALTER COLUMN last_activity_at SET DEFAULT now();

UPDATE public.orgs
   SET last_activity_at = created_at
 WHERE last_activity_at IS NULL;
