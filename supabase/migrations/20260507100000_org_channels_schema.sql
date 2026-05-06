-- P1-023 Org/club Discord-style channels — schema additions
--
-- Foundation tables (orgs, org_members, channels.org_id, channels.type with
-- 'org_channel'/'org_subchannel') already exist from the Phase 1 initial schema.
-- This migration extends them with the fields needed for owner/admin
-- controls, public/private orgs + channels, the request-to-join flow, and
-- per-org gradient backdrops chosen in /campus settings.

-- ─── orgs: owner + backdrop preset ──────────────────────────────────────────
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS backdrop_preset text NOT NULL DEFAULT 'sand-purple',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backdrop presets must match the keys in src/app/campus/campus-home.tsx
-- BACKDROP_PRESETS. Update here AND there if you add a new preset.
ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_backdrop_preset_check;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_backdrop_preset_check
  CHECK (backdrop_preset IN ('sand-purple','ember','deep-violet','forest','midnight'));

CREATE INDEX IF NOT EXISTS orgs_owner_id_idx ON public.orgs (owner_id);

-- ─── org_members: role expansion (officer/member/pledge → owner/admin/mod/member) ─
-- Migrate any existing rows: officer → admin, pledge → member.
UPDATE public.org_members SET role = 'admin' WHERE role = 'officer';
UPDATE public.org_members SET role = 'member' WHERE role = 'pledge';

-- Drop the existing CHECK regardless of its auto-generated name, then recreate.
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint
  WHERE conrelid = 'public.org_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.org_members DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE public.org_members ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('owner','admin','mod','member'));

CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON public.org_members (user_id);

-- ─── channels: per-channel privacy, ordering, and topic ─────────────────────
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topic text;

CREATE INDEX IF NOT EXISTS channels_org_id_idx ON public.channels (org_id);

-- ─── org_join_requests: pending requests for private orgs ──────────────────
CREATE TABLE IF NOT EXISTS public.org_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied')),
  message text,
  requested_at timestamptz NOT NULL DEFAULT now (),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

-- Only one pending request per (org, user). Approved/denied rows can stack
-- (audit trail), so partial unique on status='pending'.
CREATE UNIQUE INDEX IF NOT EXISTS org_join_requests_unique_pending
  ON public.org_join_requests (org_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS org_join_requests_org_id_idx
  ON public.org_join_requests (org_id, status);
CREATE INDEX IF NOT EXISTS org_join_requests_user_id_idx
  ON public.org_join_requests (user_id);
