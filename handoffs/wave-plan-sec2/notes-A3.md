# Notes: A3 Vibe+ and counts (builder)

Started 2026-09-27. Migration: `supabase/migrations/20260928140000_profile_views_server_only.sql` (waveA-build.md fixes the version; approach-A3 said 120000, overridden). Apply AFTER deploy.

## Progress log
- read plan.md, waveA-build.md, approach-A3.md, critique-A3.md
- read findings #17/#18 + cross/product lines. Owned (waveA-build): profile-viewers route, post-audience.ts, savers route, post viewers route, lib/metrics/profile-viewers.ts, me/profile-views route, new audience-split.ts + test, comment-only lines in _postViewer.js ~1905 + PostAudienceList.tsx ~36.

## LIVE STATE (read-only MCP, 2026-09-27)
- profile_views: RLS on, not forced; owner postgres; relacl anon/authenticated/service_role = arwdDxtm (table-wide). No column ACLs.
- ONE policy: profile_views_owner_select, SELECT, {authenticated}, PERMISSIVE, qual `(auth.uid() = profile_user_id)`.
- post_views policies: 0. 43 rows / 14 owners; entitlements 1; mutes 0; blocks 0; bookmarks 2. Latest migration 20260927142000.
- Only DB object naming profile_views: public.record_profile_view(uuid,text) SECURITY DEFINER, owner postgres, search_path=public, EXECUTE to anon/authenticated/service_role. No views, matviews, rewrite rules, triggers, incoming FKs, publications, or policies name it.
- LOCAL: identical policy/relacl/owner/rpv; 1 row / 1 owner; PG 17.6; local schema_migrations tops at 20260926100000; entitlements 0.

## Callers (grep 2026-09-27)
- cookie reads of profile_views: me/profile-views route (locked_count + today/7d/30d), lib/metrics/profile-viewers.ts scanLedger. POST /api/profile-views uses the RPC only (unaffected). No public/html or mobile direct reads.
- filtered counts (#18): savers route total; post viewers route free total; post-audience loadPostSavers/loadPostViewers.

## Code (done so far)
- NEW src/lib/metrics/audience-split.ts (+ .test.ts, 9 tests pass): splitAudience(entries, hiddenIds, idOf?) -> {total (unfiltered), listed}; pageAudience(listed, offset, limit) -> {page, has_more, next_offset} from the LIST. No imports (node --test loads it).
- post-audience.ts: AudienceResult now carries `total` (unfiltered distinct, author out); loadPostViewers uses splitAudience; loadPostSavers REPLACED by countPostSavers({postId, authorId}) -> {ok,total} with no hiddenIds param. loadPostSaveRows signature unchanged (creator-stats). PostSaverEntry type removed (no importers, grep).
- savers route: no loadHiddenUsers; total = countPostSavers total (== counts.saves).
- post viewers route: hasPlus first; free branch passes hiddenIds [] and returns audience.total (no block/mute read); Vibe+ branch filters list, total unfiltered, has_more/next_offset via pageAudience on the filtered list.
- profile-viewers.ts: `import "server-only"` (ProfileViewersList.tsx uses import type only: safe); scanLedger(userId, since) now uses the service client, returns null when the key is missing; total = every distinct viewer in the 90d window (unfiltered); list/paging via splitAudience + pageAudience. loadProfileViewers signature unchanged.
- me/profile-views route: service client created once (500 if not configured); today/7d/30d head counts + free locked_count on the service client, all `.eq("profile_user_id", user.id)` from getUser(); users.profile_view_count stays on the cookie client. loadViewerSlice gained a `service` param (file-local fn).
- me/profile-viewers route: comment only (requirePlus is the paywall now).
- comment-only: _postViewer.js (~1905), PostAudienceList.tsx (~36): counts include muted/blocked.
- `npx tsc --noEmit -p .` clean (whole project, at this point).

## Migration written
- supabase/migrations/20260928140000_profile_views_server_only.sql: PRE-FLIGHT (RLS on, not forced, owner postgres; exactly the one policy word for word; anon+authenticated SELECT true; no column ACLs; record_profile_view definer/postgres; service_role BYPASSRLS + SELECT; no invoker fn/view/matview/policy naming the table; post_views 0 policies) -> DROP POLICY + REVOKE ALL from anon, authenticated -> POST-CHECK (0 policies, RLS on, no r/a/w/d/D/x/t/m for anon/authenticated, no column SELECT, service_role SELECT, EXECUTE on rpv kept) -> notify pgrst -> commit.
- Decision: REVOKE ALL (not just SIUD): TRUNCATE ignores RLS and no client needs any privilege; ROLLBACK `grant all` restores arwdDxtm exactly (PG 17.6 both sides; ALL includes MAINTAIN).
- Extra prod reads: PG 17.6; service_role + postgres BYPASSRLS true; authenticated false. Default ACL on public gives anon/authenticated arwdDxtm to new tables (why they hold it).
- Order: AFTER deploy (version 140000 kept as assigned).

## Local DB probes (all inside rolled-back transactions unless noted)
- BEFORE migration, as blake (authenticated, free: 0 local entitlements) with 2 seeded rows: `select ... from profile_views` -> 2 rows WITH viewer ids (the #17 bug, reproduced). As casey -> 0.
- Applied locally (committed; left applied): BEGIN/SET/DO/DROP POLICY/REVOKE/DO/NOTIFY/COMMIT, clean.
- Re-run of the file -> PRE-FLIGHT aborts "expected exactly 1 policy ... found 0" (drift guard works).
- Header ROLLBACK run locally -> relacl back to arwdDxtm for anon+authenticated, policy back verbatim; re-apply -> clean. Final relacl {postgres=arwdDxtm, service_role=arwdDxtm}, 0 policies.
- AFTER, as blake: SELECT -> 42501 permission denied; SELECT own viewer ids -> 42501; INSERT -> 42501; DELETE -> 42501.
- AFTER, as anon: SELECT -> 42501; rpc record_profile_view -> false (no uid), as before.
- AFTER, rpc record_profile_view as blake viewing casey -> true; same day again -> false (dedupe); blake viewing himself -> false; row landed (postgres sees it) and casey.profile_view_count bumped to 1.
- AFTER, as service_role: full read 2 rows; scoped read `profile_user_id = casey` 1 row (the routes' path).
- #18 oracle probe (service_role, the routes' role; blake's post 01622a64 saved by casey+drew+blake, viewed by casey, drew x2 days, blake; blake's profile viewed by casey today, drew -3d and -20d). Then blake mutes casey through his own authenticated client.
  - old math (filtered by blake's mutes): savers 2 -> 1, free viewers 2 -> 1  (oracle: the drop names casey)
  - new math (A3 code): savers 2 -> 2, free viewers 2 -> 2 (unchanged; savers == counts.saves, which is also author-excluded + unfiltered)
  - profile tiles (service role, scoped to blake): today 1, 7d 2, 30d 3, locked_count 2 -- identical before/after mute, and identical to what the old cookie read returned (old policy qual auth.uid() = profile_user_id + .eq(profile_user_id, me) == new .eq(profile_user_id, me)).
- Caller sweep repeated after the change: only me/profile-views route + lib/metrics/profile-viewers.ts name `profile_views` in code (both now service role). mobile/ has no reads of profile_views/post_views. No public/html direct PostgREST read.
- Dev server (not started by me): signed-out GET on /api/me/profile-views, /api/me/profile-viewers, /api/me/posts/<id>/viewers, /savers -> 401 each (routes compile). .env.local has SUPABASE_SERVICE_ROLE_KEY set (value not printed), so the service paths work locally. Signed-in route calls NOT done here (no session minted); the wave browser walk should open Otto metrics as blake (tiles non-zero after a visit) and a post's views/saves sheets.

## Gates
- `npx tsc --noEmit -p .` clean (whole project).
- `node --test src/lib/metrics/audience-split.test.ts` 9/9 pass.
- `npm test`: 1080 tests, 1079 pass, 1 fail = known pre-existing src/lib/otto/parse-reminder.test.ts.
- eslint on all touched files: clean.

## Deviations from approach/critique (with reasons)
- Version 20260928140000 (waveA-build), not 120000 (approach). Still AFTER the deploy.
- REVOKE ALL instead of SELECT/INSERT/UPDATE/DELETE only: TRUNCATE bypasses RLS; nothing client-side needs any privilege; rollback `grant all` restores arwdDxtm exactly (verified locally).
- PRE-FLIGHT adds: no column ACLs (a column grant survives a table revoke), relforcerowsecurity false (the definer writer relies on owner-skips-RLS), service_role BYPASSRLS.
- Added pageAudience() to the pure module so has_more/next_offset-from-the-list is tested, not just the count.

## Done. Left for others
- Orchestrator: apply 20260928140000 only after Vercel READY + served-build check.
- Browser walk: Otto metrics as blake (free) shows tiles/locked line; a post's Views sheet heading = people incl. muted; Saves sheet = counts.saves.

## Repair round (2026-09-27, after review-A3-*)
- Must-fix accepted: legacy desktop Views sheet (public/html/_postViewer.js paintAudience, ~1888) painted "1 person" over "No one yet." when every listed viewer is muted/blocked (A3 made `total` unfiltered, list still filtered). Reviewer correct; orchestrator handed A3 these lines.
- Fix: empty-rows branch now reads `aud.total > 0` -> "We can't show them / any of them right now." (or, when has_more, "No one on this page has a profile we can show.", same as PostAudienceList.tsx:333-338); total 0 or null keeps "No one yet."; failed read keeps "". Copy names no block. Only the Vibe+ viewers path reaches paintAudience (savers + free go to paintAudienceCount / paintAudienceLock), so free lock -> paid now reads "1 person / We can't show them right now." instead of "No one yet.".
- Probe (scratchpad paint-probe.mjs, extracts paintAudience + audPeopleLine from the file, stub DOM): total1/rows[] -> "1 person" + "We can't show them right now."; total2 -> "any of them"; total5+hasMore -> "No one on this page..." + Show more; total0 -> "0 people" + "No one yet."; total null -> "" + "No one yet."; failed -> "" + ""; normal row renders.
- Gates: node --check _postViewer.js OK; node --test audience-split 9/9; npx tsc --noEmit -p . clean (exit 0); eslint on all A3 files: 0 errors (2 pre-existing `_` warnings at 383/762, in HEAD). Migration untouched; local still applied (relacl postgres+service_role only, 0 policies).
- Noted, not mine: OttoMetrics.tsx "Who viewed you / No one yet." when every profile viewer is muted while the free lock counted them - pre-existing (locked_count was already unfiltered before A3), no people-count headline sits over that list, so no new contradiction.
