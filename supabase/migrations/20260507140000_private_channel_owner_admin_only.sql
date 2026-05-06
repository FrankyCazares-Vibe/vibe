-- Tighten can_view_org_channel: only owner/admin auto-pass private channels.
-- Mods now need to be on the allow list explicitly, same as regular members.
--
-- WHY: A private channel is for a specific group (e.g. fraternity #exec).
-- Auto-granting it to every mod on the server defeats the purpose — mods may
-- be social chairs, pledge educators, etc., not part of the channel's
-- intended audience. If a mod needs to participate, an owner/admin invites
-- them like any other member.

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
    WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.org_channel_members ocm
      WHERE ocm.channel_id = cid AND ocm.user_id = uid
    )
  END
  FROM public.channels c
  WHERE c.id = cid;
$$;
