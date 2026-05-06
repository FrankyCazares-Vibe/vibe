-- P1-023 follow-on: per-channel pinning + per-channel access list.
--
-- WHY: An org admin (e.g. fraternity owner) may want a private channel that
-- a few specific regular members can see — for example an #exec channel that
-- includes the chair (a member, not an admin). The original v1 RLS modeled
-- "private channel" as "owner/admin/mod only", which can't express that.
--
-- Two additions:
--   1. `channels.pinned` — boolean. The rail orders pinned-first, position
--      next. Cheap and obvious; avoids overloading `position` (e.g. negative
--      numbers for pinned) which would complicate reorder logic.
--   2. `org_channel_members` — explicit allow list for private channels.
--      Owner/admin/mod always pass `can_view_org_channel`; other org members
--      pass only if they have a row here.

-- ─── Pinning ────────────────────────────────────────────────────────────────
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS channels_org_pinned_position_idx
  ON public.channels (org_id, pinned DESC, position ASC, created_at ASC);

-- ─── Per-channel allow list ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_channel_members (
  channel_id uuid NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_channel_members_user_idx
  ON public.org_channel_members (user_id);

ALTER TABLE public.org_channel_members ENABLE ROW LEVEL SECURITY;

-- SELECT: the user themselves can see their own grant; staff can see the full
-- allow list for the channel they manage.
DROP POLICY IF EXISTS org_channel_members_select ON public.org_channel_members;
CREATE POLICY org_channel_members_select ON public.org_channel_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid ()
    OR EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id
        AND c.org_id IS NOT NULL
        AND public.org_member_role (c.org_id, auth.uid ()) IN ('owner','admin','mod')
    )
  );

-- INSERT: owner/admin only. Mods explicitly excluded from granting access
-- because per-channel access is sensitive (e.g. exec planning).
DROP POLICY IF EXISTS org_channel_members_insert ON public.org_channel_members;
CREATE POLICY org_channel_members_insert ON public.org_channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id
        AND c.org_id IS NOT NULL
        AND public.org_member_role (c.org_id, auth.uid ()) IN ('owner','admin')
    )
  );

-- DELETE: owner/admin OR the user removing themselves.
DROP POLICY IF EXISTS org_channel_members_delete ON public.org_channel_members;
CREATE POLICY org_channel_members_delete ON public.org_channel_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid ()
    OR EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id
        AND c.org_id IS NOT NULL
        AND public.org_member_role (c.org_id, auth.uid ()) IN ('owner','admin')
    )
  );

-- ─── Updated can_view_org_channel ──────────────────────────────────────────
-- Now: org member AND (channel public OR staff OR explicitly granted).
CREATE OR REPLACE FUNCTION public.can_view_org_channel (cid uuid, uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT CASE
    WHEN c.org_id IS NULL THEN false
    WHEN NOT public.is_org_member (c.org_id, uid) THEN false
    WHEN c.is_private = false THEN true
    WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin','mod') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.org_channel_members ocm
      WHERE ocm.channel_id = cid AND ocm.user_id = uid
    )
  END
  FROM public.channels c
  WHERE c.id = cid;
$$;
