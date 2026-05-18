-- ---------------------------------------------------------------------------
-- users.resume_docs
-- ---------------------------------------------------------------------------
--
-- Until now the schema only stored one resume URL per user (`resume_url`).
-- Desktop's editor allowed two docs but only persisted the first to the
-- server; the second was localStorage-only and invisible to mobile.
--
-- This column adds a real JSONB array so users can keep both a resume PDF
-- and a portfolio image (and up to 3 docs total — capped in the sanitizer,
-- not the DB, so we can tune later without a migration).
--
-- Each element is shaped:
--   { "name": "Resume",        // short label
--     "type": "pdf" | "image", // viewer mode
--     "url":  "https://…"     // persistent URL from Supabase Storage
--   }
--
-- `resume_url` stays around as the canonical "primary doc" pointer for
-- legacy clients that read just one URL. build-vibe-user-v1 prefers
-- `resume_docs` when populated and falls back to `resume_url` otherwise,
-- so existing rows continue to render with no migration of their data.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS resume_docs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.users.resume_docs IS
  'Ordered list of resume/portfolio documents. Each item: {name, type, url}. Caps + validation enforced in lib/profile/resume-docs.ts. The legacy resume_url column remains the single-URL pointer for clients that haven''t adopted the array.';
