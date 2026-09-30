# Critique: A3 Vibe+ and counts (findings #17, #18)

Reviewer: senior-engineer pre-build pass, 2026-09-27. READ-ONLY.

## Progress log
- read plan.md + findings #17/#18
- read owned files: profile-viewers route, post-audience.ts, savers route; also profile-viewers.ts lib, viewers route, /api/me/profile-views route (NOT owned by name, but they carry the bug)

## Live facts (read-only MCP, 2026-09-27)
- `profile_views` RLS on, not forced. ONE policy: `profile_views_owner_select` SELECT to {authenticated} USING `(auth.uid() = profile_user_id)`. No INSERT/UPDATE/DELETE policy (writes only via SECURITY DEFINER `record_profile_view`).
- Table grants: anon + authenticated have SELECT/INSERT/UPDATE/DELETE on profile_views, post_views, bookmarks (Supabase defaults; RLS is the boundary). No column-level revokes: every profile_views column (profile_user_id, viewer_user_id, viewed_on, referrer, first_viewed_at) is SELECTable by authenticated AND anon.
- `post_views`: RLS on, zero policies (sound). `bookmarks`: `bookmarks_all_own` ALL USING auth.uid()=user_id.
- Counts: profile_views 43 rows / 14 owners; post_views 155; bookmarks 2; mutes 0; blocks 0. Entitlement table is `public.entitlements` (not user_entitlements).
- `record_profile_view(uuid,text)` is SECURITY DEFINER, owner postgres, search_path=public; it is the ONLY db function or view that references profile_views (pg_depend + prosrc scan). No triggers on profile_views/post_views/bookmarks/blocks/mutes. So dropping the policy and revoking client grants cannot break view recording.
- Live notifications types: follow 36, like 8, comment 8, mention 7 (no save/view notifications, so no second channel naming savers/viewers).
- Local DB: same single policy, 1 profile_views row, owner postgres; local schema_migrations tops out at 20260926100000 (the 20260927* files are not registered locally; none touch profile_views, so A3's pre-flight still matches local).

## Callers (grep of src/** and public/html/**)
Cookie-client reads of `profile_views` (ALL break silently to zero rows when the policy goes; 42501 -> 500 if SELECT is also revoked):
1. `src/app/api/me/profile-views/route.ts:115-120` free `locked_count` (select viewer_user_id) — NOT OWNED BY A3 BY NAME.
2. `src/app/api/me/profile-views/route.ts:172-186` today / 7d / 30d head counts — same file.
3. `src/lib/metrics/profile-viewers.ts:236-244` `scanLedger` (Vibe+ list, used by BOTH /api/me/profile-views `recent` and /api/me/profile-viewers) — NOT OWNED BY A3 BY NAME. Its docblock (lines 17-22, 134-136) says RLS is the backstop and "no service role appears in this file"; that becomes false and must be rewritten.
- No direct PostgREST reads of profile_views/post_views/bookmarks in public/html (only `_otto.js` -> /api/me/profile-views, `profile.html:11468` -> POST /api/profile-views, `_postViewer.js` -> /api/me/posts/:id/{viewers,savers}).
- POST /api/profile-views uses the RPC only: unaffected.

Filtered count-only totals (#18 oracle):
4. `src/app/api/me/posts/[id]/savers/route.ts:70-90` — total after loadHiddenUsers (owned).
5. `src/lib/metrics/post-audience.ts:330-334` loadPostSavers skips hidden (owned); :224-228 loadPostViewers skips hidden (owned).
6. `src/app/api/me/posts/[id]/viewers/route.ts:103-131` — FREE branch returns `total = audience.entries.length` AFTER the hidden filter. This is the "free viewers" half of #18 and it reads post_views with the SERVICE role, so the plan's catch-all ("routes that read identities with the cookie client") does NOT pick it up. Must be owned by A3 explicitly.
- Checked and clean: creator-stats (loadPostSaveRows/loadHonestViewRows, no hidden filter); /api/me/profile-views `locked_count` and tiles (no hidden filter); notifications/otto counts (filtered, but they sit next to named rows, so no oracle).
- Clients page on `has_more`/`next_offset`, never on `total` (PostAudienceList.tsx:186-191, _postViewer.js:2011-2019, ProfileViewersList). `recent_total` is read by no client. So an unfiltered `total` next to a filtered list is safe IF the server computes has_more/next_offset from the filtered list.
- Stale comments only (no behaviour): `_postViewer.js:1905-1906`, `PostAudienceList.tsx:36`, `/api/me/posts/[id]/viewers/route.ts:40-49`, savers route :32-37 all say total excludes blocked/muted.

## Verdict: go-with-changes
Plan direction is right (drop the owner-read, read the ledger server-side after the entitlement check, never filter a count). Four corrections:
1. OWNERSHIP: add `src/app/api/me/profile-views/route.ts`, `src/lib/metrics/profile-viewers.ts`, `src/app/api/me/posts/[id]/viewers/route.ts`, new pure `src/lib/metrics/audience-split.ts` + `.test.ts`. No other batch owns any of them (checked A1, A2, A4, A5, B1-B4 lists).
2. CHOICE: DROP the policy AND `revoke select, insert, update, delete on public.profile_views from anon, authenticated`. NOT the column revoke the report suggests: authenticated holds table-wide SELECT, so `revoke select (viewer_user_id, referrer)` is a no-op (same trap documented in 20260927141000_users_platform_admin_flag_server_only.sql:15-16,87-88). Why revoke on top of the drop: with RLS-only, any future cookie-client read returns [] and paints "nobody looked"; with the grant gone it errors (42501) and the route's existing error path 500s, which is the house rule. Safe: only reader in the DB is record_profile_view (definer, owner postgres).
3. NO RPC. Serve counts with the service role inside /api/me/profile-views, keyed on the getUser() id. The only consumer is our own route; an RPC would force migration-BEFORE-deploy, and the old code would then paint zeros in the gap.
4. ORDER: code deploy FIRST, migration AFTER (new code is correct with or without the policy; old code against the new DB paints zeros or 500s). This contradicts the wave footer's "apply in order -> push"; A3 must be applied after the Vercel deploy is Ready.

## Migration 20260928120000_profile_views_server_only.sql (sketch)
- PRE-FLIGHT: relrowsecurity true on public.profile_views; exactly 1 policy, named profile_views_owner_select, cmd SELECT, roles {authenticated}, qual `(auth.uid() = profile_user_id)`; has_table_privilege(authenticated|anon, SELECT) true (state we are changing); record_profile_view prosecdef true and owner postgres; post_views has 0 policies; no view depends on profile_views.
- CHANGE: `drop policy profile_views_owner_select on public.profile_views;` then `revoke select, insert, update, delete on public.profile_views from anon, authenticated;` (leave TRUNCATE/REFERENCES/TRIGGER alone or revoke all; say which). Keep RLS enabled.
- POST-CHECK: 0 policies; has_table_privilege(authenticated|anon, 'SELECT') false; service_role SELECT true; behaviour: as authenticated with a sub that owns rows, `select count(*) from public.profile_views` raises 42501 (catch insufficient_privilege, fail the file if it does NOT raise); `select public.record_profile_view(...)` still returns true for a fresh pair (local only, inside the rolled-back probe, not in the prod file).
- ROLLBACK: recreate the policy verbatim + `grant select, insert, update, delete on public.profile_views to anon, authenticated;`.
- Header counts: 43 rows / 14 owners, 1 entitlements row, billing off.
- No `_cleanup.sql`: no data changes.
  (Behaviour probes as `authenticated` belong in the LOCAL test run; the prod file can prove it by catalog alone. None of the 20260927* files switch roles inside a migration, so don't invent that pattern for prod.)

## Other notes
- `src/components/otto/ProfileViewersList.tsx:9` does `import type` from profile-viewers.ts; adding `import "server-only"` there is safe (type-only import is erased). creator-stats imports `loadPostSaveRows`: keep its signature unchanged.
- post-audience.ts already has `import "server-only"`, so node --test cannot import it: the pure count/list split must live in a new file with relative imports only (tests load `./x.ts` via dynamic import, see engagement-counts.test.ts:18-20).
- Viewers route: resolve `hasPlus` first and skip `loadHiddenUsers` on the free branch (a number needs no hidden set; removes a 500 path). Savers route: drop `loadHiddenUsers` entirely.
- Questions for Franky: (1) Vibe+ heading counts people you muted/blocked while the list hides them? Recommend yes. (2) Tell viewers their profile visits are named to Vibe+ owners (privacy line) before billing turns on? Recommend yes, but outside this wave.
