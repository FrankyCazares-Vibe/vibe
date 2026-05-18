-- ---------------------------------------------------------------------------
-- users.work_order_manual
-- ---------------------------------------------------------------------------
--
-- Until now, the profile UI sorted work experience by parsed end-date on
-- every render (most-recent-first), which meant a user-initiated drag
-- reorder on desktop only persisted to localStorage on that one device. On
-- mobile / a new browser / a fresh session, the manual order was lost.
--
-- This column lets the user pin an explicit order. When TRUE the API +
-- both viewports trust the array order stored in `users.work_experience`
-- and skip the auto-sort. Set automatically by the drag/up-down editors;
-- never directly user-facing.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS work_order_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.work_order_manual IS
  'When true, profile.html and mobile profile preserve the order of work_experience as stored. When false (default), the UI auto-sorts by parsed end date. Flipped to true by the drag/up-down reorder editor.';
