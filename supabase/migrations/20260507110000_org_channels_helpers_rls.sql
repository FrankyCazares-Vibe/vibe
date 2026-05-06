-- P1-023 Org/club Discord-style channels — helpers + RLS
--
-- Org channels (channels.org_id IS NOT NULL) inherit membership from
-- org_members rather than channel_members. To avoid recursive RLS evaluation
-- (which already burned us once — see 20260505100000_fix_channel_members_rls_recursion.sql),
-- all membership/role checks go through SECURITY DEFINER helpers.

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Is the user a member of this org? Any role.
CREATE OR REPLACE FUNCTION public.is_org_member (oid uuid, uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = oid AND user_id = uid
  );
$$;

-- The user's role in an org (null if not a member).
CREATE OR REPLACE FUNCTION public.org_member_role (oid uuid, uid uuid)
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT role FROM public.org_members
  WHERE org_id = oid AND user_id = uid;
$$;

-- Can this user view a specific org channel?
-- Public channels: any org member.
-- Private channels: owner/admin/mod only (per-channel role pinning is a future
-- enhancement; for v1 private = staff-only).
CREATE OR REPLACE FUNCTION public.can_view_org_channel (cid uuid, uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT CASE
    WHEN c.org_id IS NULL THEN false
    WHEN NOT public.is_org_member(c.org_id, uid) THEN false
    WHEN c.is_private = false THEN true
    ELSE public.org_member_role(c.org_id, uid) IN ('owner','admin','mod')
  END
  FROM public.channels c
  WHERE c.id = cid;
$$;

-- ─── orgs RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orgs_select ON public.orgs;
CREATE POLICY orgs_select ON public.orgs
  FOR SELECT TO authenticated
  USING (
    is_public = true
    OR public.is_org_member(id, auth.uid())
  );

DROP POLICY IF EXISTS orgs_insert ON public.orgs;
CREATE POLICY orgs_insert ON public.orgs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS orgs_update ON public.orgs;
CREATE POLICY orgs_update ON public.orgs
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.org_member_role(id, auth.uid()) IN ('owner','admin')
  );

DROP POLICY IF EXISTS orgs_delete ON public.orgs;
CREATE POLICY orgs_delete ON public.orgs
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- ─── org_members RLS ──────────────────────────────────────────────────────
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (
    -- Members see other members; non-members can see roster of public orgs
    public.is_org_member(org_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND is_public = true)
  );

-- Self-join only allowed on public orgs. Private-org membership is added via
-- API after a join request is approved (using service role, bypassing RLS).
DROP POLICY IF EXISTS org_members_insert ON public.org_members;
CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orgs
      WHERE id = org_id AND is_public = true
    )
  );

-- Self-leave OR admin/owner removes a member.
DROP POLICY IF EXISTS org_members_delete ON public.org_members;
CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.org_member_role(org_id, auth.uid()) IN ('owner','admin')
  );

-- Admin/owner can change roles (e.g. promote member to mod).
DROP POLICY IF EXISTS org_members_update ON public.org_members;
CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE TO authenticated
  USING (
    public.org_member_role(org_id, auth.uid()) IN ('owner','admin')
  );

-- ─── org_join_requests RLS ────────────────────────────────────────────────
ALTER TABLE public.org_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_join_requests_select ON public.org_join_requests;
CREATE POLICY org_join_requests_select ON public.org_join_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.org_member_role(org_id, auth.uid()) IN ('owner','admin','mod')
  );

DROP POLICY IF EXISTS org_join_requests_insert ON public.org_join_requests;
CREATE POLICY org_join_requests_insert ON public.org_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS org_join_requests_update ON public.org_join_requests;
CREATE POLICY org_join_requests_update ON public.org_join_requests
  FOR UPDATE TO authenticated
  USING (
    public.org_member_role(org_id, auth.uid()) IN ('owner','admin','mod')
  );

-- ─── channels RLS: extend SELECT to allow org channels ─────────────────────
-- Existing policy only allowed viewing channels where the viewer has a
-- channel_members row. Org channels don't use channel_members (they inherit
-- from org_members), so we need a second SELECT policy for them.
DROP POLICY IF EXISTS channels_select_org_member ON public.channels;
CREATE POLICY channels_select_org_member ON public.channels
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.can_view_org_channel(id, auth.uid())
  );

-- ─── messages RLS: extend SELECT + INSERT to allow org channels ────────────
DROP POLICY IF EXISTS messages_select_org_member ON public.messages;
CREATE POLICY messages_select_org_member ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = messages.channel_id
        AND c.org_id IS NOT NULL
        AND public.can_view_org_channel(c.id, auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_insert_org_member ON public.messages;
CREATE POLICY messages_insert_org_member ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = messages.channel_id
        AND c.org_id IS NOT NULL
        AND public.can_view_org_channel(c.id, auth.uid())
    )
  );
