-- Fix infinite recursion in org RLS introduced by 20260507110000_org_channels_helpers_rls.sql.
--
-- Root cause: the new `org_members_select` policy had an OR-EXISTS clause
-- that queried `orgs`. The Phase 1 `orgs_select_visible` policy still queries
-- `org_members` directly via its own EXISTS clause. Together they form a
-- mutual-recursion loop:
--
--   orgs SELECT → orgs_select_visible.EXISTS → org_members SELECT
--     → org_members_select.EXISTS → orgs SELECT → ...
--
-- Even though `is_org_member()` is SECURITY DEFINER and breaks recursion when
-- it's the ONLY membership check, the OR-EXISTS branch sits outside that
-- function and re-enters RLS evaluation. Postgres aborts with code 42P17.
--
-- Fix: drop the OR-EXISTS clause from `org_members_select`. The "non-members
-- can see roster of public orgs" feature it was supporting was never actually
-- needed — discover-card member counts are read via the service role in
-- /api/orgs/[slug] (bypasses RLS), and member rosters are only surfaced from
-- the org settings modal which already requires membership.

DROP POLICY IF EXISTS org_members_select ON public.org_members;

CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (public.is_org_member (org_id, auth.uid ()));
