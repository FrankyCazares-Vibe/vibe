-- Broaden the `blocks` SELECT policy: either party to a block can read
-- the row. Previously only the blocker could SELECT — which meant the
-- blocked user's queries (e.g. "does A block me?" on their visit to
-- A's profile, or the search route's "filter blocked-either-way" pass
-- when the viewer is the BLOCKED side) silently returned zero rows
-- because RLS hid the row from them.
--
-- INSERT and DELETE policies stay locked to the blocker — only the
-- blocking party can create or remove their own blocks. Reading the
-- existence of a block is the only thing that opens up to both sides.
--
-- The `blocks_select_own` policy is replaced (not augmented) so the
-- old "blocker-only" rule doesn't linger.

DROP POLICY IF EXISTS "blocks_select_own" ON public.blocks;
DROP POLICY IF EXISTS "blocks_select_either" ON public.blocks;

CREATE POLICY "blocks_select_either"
  ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid () = blocker_id OR auth.uid () = blocked_id);
