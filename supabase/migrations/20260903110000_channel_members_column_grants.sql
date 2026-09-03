-- ---------------------------------------------------------------------------
-- channel_members: column-level UPDATE grants (Session 52 sentinel finding)
-- ---------------------------------------------------------------------------
-- `channel_members_update_own` (USING/WITH CHECK auth.uid() = user_id) was
-- meant for the per-viewer flags (read receipts, hide, pin, mute, typing).
-- With a table-level UPDATE grant the same policy also let a user change
-- `channel_id` on their own row — i.e. re-point their membership into any
-- other DM/group whose id they knew, then read + write there via the
-- member-based message policies. Pin the grant to the per-viewer columns.
--
-- messages / channels: no UPDATE policies exist, so the table-level grants
-- were inert; revoke them anyway so a future permissive policy cannot
-- silently widen access. All channel updates already go through the
-- service role.
-- ---------------------------------------------------------------------------
BEGIN;
REVOKE UPDATE ON TABLE public.channel_members FROM authenticated;
GRANT UPDATE (accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at)
  ON public.channel_members TO authenticated;
REVOKE UPDATE ON TABLE public.messages FROM authenticated;
REVOKE UPDATE ON TABLE public.channels FROM authenticated;
COMMIT;
