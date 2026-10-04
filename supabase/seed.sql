-- Local seed, run by `supabase db reset` / a first `supabase start` after the
-- migrations (config.toml [db.seed]). LOCAL ONLY: production never runs it.
--
-- Local sign-up stays OPEN. 20261003100000_waitlist.sql seeds the launch
-- switch closed (production starts closed), and config.toml turns the
-- before-user-created gate on, so without this line a reset local stack would
-- refuse every sign-up without an access code. Other sessions, the demo seed
-- and the browser passes expect sign-up to work. To see the closed state
-- locally use /auth/signup?signup=closed (dev only), or the vibe_gate_probe
-- metadata flag the tests use; don't flip this row for everyone.
--
-- GUARDED: only a database with no accounts at all is opened. A fresh local
-- reset has none when this runs; production (and any copy of it) always has
-- some. The CLI is linked to the production project, so a mistaken
-- `supabase db push --include-seed` must leave the launch switch alone. Never
-- run --include-seed against production anyway.
update public.app_settings
   set value = 'true'::jsonb, updated_at = now()
 where key = 'signup_open'
   and not exists (select 1 from auth.users);
