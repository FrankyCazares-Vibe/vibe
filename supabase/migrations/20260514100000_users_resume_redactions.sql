-- `resume_redactions` — blackout bars drawn over the user's uploaded
-- resume / portfolio. Each bar is an object:
--   { docIndex, pageNumber, x, y, w, h }
-- where x / y / w / h are percentages (0–100) of the doc page wrap
-- they're anchored to. Currently only resumePortfolio[0] persists to
-- Supabase (users.resume_url is a single string), so bars on docIndex
-- > 0 effectively live until the next reload — that's fine for v1.
--
-- The mobile resume viewer reads this column to render overlays
-- without giving phone users the ability to edit (write path is desk-
-- top only for now). Stored as jsonb instead of a child table for the
-- same reasons as current_on: short, atomic, last-writer-wins is OK.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS resume_redactions jsonb NOT NULL DEFAULT '[]'::jsonb;
