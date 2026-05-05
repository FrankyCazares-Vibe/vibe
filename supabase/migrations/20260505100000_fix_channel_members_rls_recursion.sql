-- channel_members RLS had a self-referential SELECT policy that Postgres
-- treats as infinite recursion: the policy queries channel_members → the
-- inner query re-triggers the same SELECT policy → loops. Latent until
-- P1-022 (DMs) became the first reader of this table.
--
-- Fix: a SECURITY DEFINER helper bypasses RLS on the inner membership
-- check. Other policies (channels, messages, channel_members INSERT) that
-- query channel_members still go through this SELECT policy, but with the
-- helper they no longer recurse.

CREATE OR REPLACE FUNCTION public.is_channel_member (cid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_members
    WHERE channel_id = cid
      AND user_id = auth.uid ()
  );
$$;

DROP POLICY IF EXISTS "channel_members_select_member" ON public.channel_members;
CREATE POLICY "channel_members_select_member"
  ON public.channel_members FOR SELECT TO authenticated
  USING (public.is_channel_member (channel_id));
