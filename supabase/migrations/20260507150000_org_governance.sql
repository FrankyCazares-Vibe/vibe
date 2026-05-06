-- P1-023 follow-on: org governance — verified flag, dormancy tracking,
-- profile fields (links + philanthropy), platform-admin role.
--
-- WHY: An open creation model floods Discover with abandoned student-created
-- orgs after a semester or two. We adopt a tiered model:
--   1. Verified orgs (flag set by platform admins) — top of Discover, never
--      dormant. Survive summer / winter breaks and other quiet periods.
--   2. Community orgs (default, student-created) — sort below verified,
--      ranked by recent activity.
--   3. Dormant orgs — community orgs with no message activity in 60 days.
--      Hidden from Discover unless the viewer toggles "Show dormant".
--
-- A single platform-admin role gates org-verification (and any future
-- platform-level moderation). We bootstrap by setting it manually on the
-- founder's row in the SQL editor.

-- ─── orgs governance fields ────────────────────────────────────────────────
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS philanthropy text NOT NULL DEFAULT '';

-- Backfill: brand-new orgs treat creation as the first activity tick so they
-- aren't pre-condemned to dormancy.
UPDATE public.orgs
   SET last_activity_at = COALESCE(last_activity_at, created_at)
 WHERE last_activity_at IS NULL;

-- Discover ranking index — verified first, then activity desc.
CREATE INDEX IF NOT EXISTS orgs_discover_idx
  ON public.orgs (verified DESC, last_activity_at DESC NULLS LAST);

-- ─── platform admin flag ───────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- ─── activity bump trigger ────────────────────────────────────────────────
-- When a message lands in any channel that belongs to an org, push the
-- org's last_activity_at forward. SECURITY DEFINER so the trigger can
-- update orgs even when the message-poster is a regular member who has no
-- direct UPDATE permission on orgs.
CREATE OR REPLACE FUNCTION public.bump_org_activity ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.channels WHERE id = NEW.channel_id;
  IF v_org_id IS NOT NULL THEN
    UPDATE public.orgs
       SET last_activity_at = NEW.created_at
     WHERE id = v_org_id
       AND (last_activity_at IS NULL OR last_activity_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_org_activity_on_message ON public.messages;
CREATE TRIGGER bump_org_activity_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_org_activity ();

-- Posts tagged to an org (org-authored post or org-tagged clip) also count.
CREATE OR REPLACE FUNCTION public.bump_org_activity_from_post ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    UPDATE public.orgs
       SET last_activity_at = NEW.created_at
     WHERE id = NEW.org_id
       AND (last_activity_at IS NULL OR last_activity_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_org_activity_on_post ON public.posts;
CREATE TRIGGER bump_org_activity_on_post
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.bump_org_activity_from_post ();

-- ─── Helper: is the org dormant? ─────────────────────────────────────────
-- Verified orgs are NEVER dormant (handles summer / winter / mid-semester
-- quiet periods for legit chapters). Community orgs are dormant after 60
-- days of no message + no post activity.
CREATE OR REPLACE FUNCTION public.is_org_dormant (oid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT verified = false
     AND (last_activity_at IS NULL OR last_activity_at < now() - interval '60 days')
    FROM public.orgs WHERE id = oid;
$$;
