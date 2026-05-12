-- `current_on` — the "Working on" section of a user's profile.
-- Array of { icon: string, text: string } objects (e.g. side projects,
-- learning goals, things they're currently building). The mobile
-- Portfolio tab renders this directly; profile.html on desktop already
-- collects it from the DOM into vibe_user_v1 but had no server home —
-- this migration is the persistence step so the data follows the user
-- across devices.
--
-- Stored as jsonb (not a child table) because:
--   • items are short, ordered, and edited atomically in the UI
--   • the list never grows past ~10 items per user
--   • cross-device merge isn't a thing — last writer wins is fine here
-- A length/shape check is enforced server-side in the profile-sync
-- handler so even a manual INSERT can't ship garbage past the API
-- layer; this column is intentionally permissive so we never need a
-- second migration if we add an `id` or `link` field per item.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_on jsonb NOT NULL DEFAULT '[]'::jsonb;
