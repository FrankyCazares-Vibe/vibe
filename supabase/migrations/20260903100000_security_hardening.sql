-- ---------------------------------------------------------------------------
-- Security hardening (Session 51 audit, 2026-09-03)
-- ---------------------------------------------------------------------------
--
-- Background: the anon key ships to every browser, so any signed-in user can
-- talk to PostgREST directly and bypass the allowlists in our route handlers.
-- Everything below closes a hole that was reachable that way.
--
--   1. users      — column-level privileges. Self-update could flip
--                   is_platform_admin / school_verified; self-select exposed
--                   every user's email / school_email / otto_answers.
--   2. orgs       — stale Phase-1 policies (insert-anything, officer role)
--                   OR'd with the governance policies. Anyone could insert a
--                   `verified` org or reassign owner_id.
--   3. org_members — same: join a public org as 'owner', promote self,
--                   read private rosters.
--   4. channels / channel_members / messages — Phase-1 member-based
--                   policies applied to org channels too, so a stale
--                   channel_members row (or a self-insert into an empty
--                   channel) granted read/write on private org channels.
--   5. functions  — SECURITY DEFINER helpers were executable by anon.
--   6. rate_limits — fixed-window counter used by src/lib/rate-limit.ts.
--
-- App code was updated first (Session 51) so every read of a now-private
-- users column goes through the service-role client filtered to the
-- caller's own id.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. public.users
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE INSERT ON TABLE public.users FROM authenticated;
REVOKE SELECT ON TABLE public.users FROM authenticated;
REVOKE UPDATE ON TABLE public.users FROM authenticated;

-- Readable by any signed-in user (public profile surface). Excludes:
-- email, school_email, otto_answers, otto_settings, voice_samples.
GRANT SELECT (
  id, school, school_verified, name, handle, year, major, department, bio,
  avatar_url, banner_url, resume_url, interests, skills, looking_for,
  created_at, last_active_at, tagline, website, headline, location_text,
  work_experience, recruiter_snapshot, banner_gradient, handle_changed_at,
  pinned_post_id, is_platform_admin, profile_view_count, current_on,
  resume_redactions, work_order_manual, resume_docs
) ON public.users TO authenticated;

-- Self-editable columns. Excludes: id, email, school_email, school_verified,
-- handle, handle_changed_at, created_at, is_platform_admin,
-- profile_view_count (all written only via service role / triggers).
GRANT UPDATE (
  school, name, year, major, department, bio, avatar_url, banner_url,
  resume_url, interests, skills, looking_for, otto_answers, voice_samples,
  last_active_at, tagline, website, headline, location_text, work_experience,
  recruiter_snapshot, banner_gradient, pinned_post_id, otto_settings,
  current_on, resume_redactions, work_order_manual, resume_docs
) ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. public.orgs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orgs_insert_authenticated ON public.orgs;
DROP POLICY IF EXISTS orgs_update_officer ON public.orgs;
DROP POLICY IF EXISTS orgs_select_visible ON public.orgs;  -- duplicate of orgs_select

REVOKE ALL ON TABLE public.orgs FROM anon;
REVOKE INSERT ON TABLE public.orgs FROM authenticated;   -- creation is service-role only
REVOKE UPDATE ON TABLE public.orgs FROM authenticated;
GRANT UPDATE (
  name, description, logo_url, banner_url, tags, is_public, backdrop_preset,
  updated_at, links, philanthropy, school
) ON public.orgs TO authenticated;                        -- never verified / owner_id / handle

DROP POLICY IF EXISTS orgs_update ON public.orgs;
CREATE POLICY orgs_update ON public.orgs
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.org_member_role(id, auth.uid()) IN ('owner', 'admin')
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.org_member_role(id, auth.uid()) IN ('owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3. public.org_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_members_select_authenticated ON public.org_members;
DROP POLICY IF EXISTS org_members_insert_officer ON public.org_members;
DROP POLICY IF EXISTS org_members_delete_self_or_officer ON public.org_members;

REVOKE ALL ON TABLE public.org_members FROM anon;
REVOKE UPDATE ON TABLE public.org_members FROM authenticated;
GRANT UPDATE (role) ON public.org_members TO authenticated;   -- org_id / user_id pinned

DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.orgs o
      WHERE o.id = org_members.org_id AND o.is_public = true
    )
  );

DROP POLICY IF EXISTS org_members_insert ON public.org_members;
CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
    AND EXISTS (
      SELECT 1 FROM public.orgs o
      WHERE o.id = org_members.org_id AND o.is_public = true
    )
  );

DROP POLICY IF EXISTS org_members_update ON public.org_members;
CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE TO authenticated
  USING (
    public.org_member_role(org_id, auth.uid()) IN ('owner', 'admin')
    AND role <> 'owner'
  )
  WITH CHECK (
    role IN ('member', 'mod', 'admin')
    AND (role <> 'admin' OR public.org_member_role(org_id, auth.uid()) = 'owner')
  );

DROP POLICY IF EXISTS org_members_delete ON public.org_members;
CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE TO authenticated
  USING (
    role <> 'owner'
    AND (
      user_id = auth.uid()
      OR public.org_member_role(org_id, auth.uid()) IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. channels / channel_members / messages / message_reactions
--    Phase-1 "member" policies now apply to DM + group channels only
--    (org_id IS NULL). Org channels are governed exclusively by
--    can_view_org_channel().
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.channels FROM anon;
REVOKE ALL ON TABLE public.channel_members FROM anon;
REVOKE ALL ON TABLE public.messages FROM anon;

DROP POLICY IF EXISTS channels_insert_authenticated ON public.channels;
CREATE POLICY channels_insert_authenticated ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NULL
    OR public.org_member_role(org_id, auth.uid()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS channels_select_member ON public.channels;
CREATE POLICY channels_select_member ON public.channels
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = channels.id AND cm.user_id = auth.uid()
    )
  );

-- All channel_members inserts happen through the service role
-- (threads POST, members POST, org join, subscribe-public). The Phase-1
-- bootstrap policy let anyone self-insert into any empty channel or any
-- group by id.
DROP POLICY IF EXISTS channel_members_insert_bootstrap_or_admin ON public.channel_members;
REVOKE INSERT ON TABLE public.channel_members FROM authenticated;

DROP POLICY IF EXISTS messages_select_member ON public.messages;
CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.channel_members cm
      JOIN public.channels c ON c.id = cm.channel_id
      WHERE cm.channel_id = messages.channel_id
        AND cm.user_id = auth.uid()
        AND c.org_id IS NULL
    )
  );

DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.channel_members cm
      JOIN public.channels c ON c.id = cm.channel_id
      WHERE cm.channel_id = messages.channel_id
        AND cm.user_id = auth.uid()
        AND c.org_id IS NULL
    )
  );

DROP POLICY IF EXISTS message_reactions_select_member ON public.message_reactions;
CREATE POLICY message_reactions_select_member ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.channels c ON c.id = m.channel_id
      WHERE m.id = message_reactions.message_id
        AND (
          (c.org_id IS NULL AND public.is_channel_member(m.channel_id))
          OR (c.org_id IS NOT NULL AND public.can_view_org_channel(m.channel_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS message_reactions_insert_member ON public.message_reactions;
CREATE POLICY message_reactions_insert_member ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.channels c ON c.id = m.channel_id
      WHERE m.id = message_reactions.message_id
        AND (
          (c.org_id IS NULL AND public.is_channel_member(m.channel_id))
          OR (c.org_id IS NOT NULL AND public.can_view_org_channel(m.channel_id, auth.uid()))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions — not callable by anon / PUBLIC.
--    `authenticated` keeps EXECUTE on the helpers because RLS policies run
--    as the invoking role. Trigger functions error if called directly.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.bump_org_activity() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_org_activity_from_post() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.is_blocked_either_way(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_channel_member(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_muting_now(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_dormant(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_connection_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_like_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.org_member_role(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_post_view(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_profile_view(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, PUBLIC, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rate limiting (fixed window). Called only from the service role via
--    src/lib/rate-limit.ts. Keys look like "pw-reset-ip:1.2.3.4".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count  integer;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN true;
  END IF;
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Opportunistic cleanup so the table never grows unbounded.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

COMMIT;
