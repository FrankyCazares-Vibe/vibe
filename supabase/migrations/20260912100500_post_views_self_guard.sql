-- Session 59: record_post_view stops counting the author's own views.
--
-- WHAT THIS CHANGES. `record_post_view` (20260508110000_post_views.sql) has
-- counted every signed-in viewer since it shipped, the post's own author
-- included. `record_profile_view` (20260513000000_profile_views_and_user_
-- view_count.sql) has always done the opposite — it returns false when the
-- viewer is the profile owner ("Looking at your own profile doesn't count").
-- This migration gives the post recorder the same early return. That is the
-- ONLY change: the dedupe key, the counter bump, the anonymous-viewer guard,
-- the return contract (true = a new row was written) and the GRANT are all
-- untouched.
--
-- The one structural difference from record_profile_view: that function is
-- handed the owner's id and compares it to auth.uid() directly. This one is
-- handed a post id, so it has to look the author up first
-- (`SELECT user_id FROM posts WHERE id = p_post_id`) before it can make the
-- same comparison. A missing post now returns false instead of attempting an
-- insert the foreign key would have rejected anyway.
--
-- Live state before this migration (read-only SQL, 2026-09-12):
--   * public.post_views holds 149 rows, of which 71 are an author viewing
--     their own post. Per author, honest / self: vibecqo 36/6, james 21/10,
--     frankycazares 20/54, henryodie 1/1. Only 3 distinct real viewers exist
--     for each of the top three accounts.
--   * sum(posts.view_count) = 149. The denormalized counter and the ledger
--     agree exactly — and both include all 71 self-views.
--   * pg_get_functiondef confirms the deployed body still matches
--     20260508110000_post_views.sql verbatim. There is no drift to reconcile,
--     so the rollback block at the bottom restores the real previous state.
--   * post_views has RLS enabled with ZERO policies (service role only).
--     That does not change here.
--
-- THIS FIXES THE WRITE, GOING FORWARD, AND NOTHING ELSE. The 71 existing
-- self-view rows stay, and posts.view_count keeps its inflated totals —
-- backfilling either one is a production write and a separate, deliberate
-- decision. The read paths were fixed in the same session and now count from
-- the ledger excluding the author (src/lib/posts/honest-views.ts), so the
-- screens are honest with or without this migration. What this stops is the
-- ledger itself collecting more junk.
--
-- DEPLOY ORDER: independent — apply before, during, or after the code deploy.
-- Nothing reads `counted` as a source of truth: /api/posts/[id]/view answers
-- {ok:true, counted:false} whether the false comes from the dedupe key or
-- from this new guard, and the campus post viewer only uses it to decide
-- whether to tick its local number (which is exactly the behaviour we want
-- once this lands).
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260912100500_post_views_self_guard.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync. Same transport; jq builds the
--      INSERT with this file as the single statement (the $m$ tags don't
--      collide with the $$ that delimits the function body):
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260912100500_post_views_self_guard.sql \
--            '{query: ("INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($$20260912100500$$, $$post_views_self_guard$$, ARRAY[$m$" + $q + "$m$]);")}')"
--
-- HOW TO VERIFY (all read-only; the MCP execute_sql is fine for 1-3):
--   1. The body carries the guard:
--        SELECT pg_get_functiondef(p.oid) FROM pg_proc p
--          JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public' AND p.proname = 'record_post_view';
--      Expect to see `IF v_author = v_user_id THEN RETURN false`.
--   2. The grant survived CREATE OR REPLACE:
--        SELECT has_function_privilege('authenticated',
--                 'public.record_post_view(uuid)', 'EXECUTE');
--      Expect true.
--   3. No NEW self-view rows dated after the day you applied it (the 71 old
--      ones stay — this is fix-forward, not a cleanup):
--        SELECT count(*) FROM public.post_views pv
--          JOIN public.posts p ON p.id = pv.post_id
--         WHERE pv.user_id = p.user_id AND pv.viewed_on > CURRENT_DATE;
--      Expect 0, and expect it to still be 0 tomorrow.
--   4. Live: open one of your own posts, hard-refresh, open it again. The eye
--      count must not move, and POST /api/posts/<id>/view must answer
--      {"ok":true,"counted":false}. Then have a second account open the same
--      post — that one must answer counted:true the first time that day.
--
-- ROLLBACK (restores the previous body verbatim; safe to run at any time,
-- the read paths do not depend on this guard):
--   CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
--   RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
--   AS $rb$
--   DECLARE
--     v_user_id uuid := auth.uid();
--     v_inserted boolean := false;
--   BEGIN
--     IF v_user_id IS NULL THEN
--       RETURN false;
--     END IF;
--     INSERT INTO public.post_views (post_id, user_id)
--     VALUES (p_post_id, v_user_id)
--     ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
--     RETURNING true INTO v_inserted;
--     IF v_inserted THEN
--       UPDATE public.posts SET view_count = view_count + 1 WHERE id = p_post_id;
--     END IF;
--     RETURN COALESCE(v_inserted, false);
--   END;
--   $rb$;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260912100500';

CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_author uuid;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT user_id INTO v_author
    FROM public.posts
   WHERE id = p_post_id;

  IF v_author IS NULL THEN
    -- Deleted or never-existed post. The FK would have rejected the insert.
    RETURN false;
  END IF;

  IF v_author = v_user_id THEN
    -- Looking at your own post doesn't count. Mirrors record_profile_view.
    RETURN false;
  END IF;

  INSERT INTO public.post_views (post_id, user_id)
  VALUES (p_post_id, v_user_id)
  ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.posts
       SET view_count = view_count + 1
     WHERE id = p_post_id;
  END IF;

  RETURN COALESCE(v_inserted, false);
END;
$$;

-- CREATE OR REPLACE preserves privileges; restated so the grant is visible
-- in the same file as the function, exactly as 20260508110000 did.
GRANT EXECUTE ON FUNCTION public.record_post_view(uuid) TO authenticated;
