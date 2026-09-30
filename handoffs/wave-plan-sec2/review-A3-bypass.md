# Review A3 (Vibe+ and counts) — lens: does it actually close the findings? (bypass hunt)

Reviewer started 2026-09-27. Read-only: no repo edits, local DB probes only inside ROLLBACK transactions.

## Progress log
- read plan.md, waveA-build.md, approach-A3.md, notes-A3.md
- read diffs: post-audience.ts, savers/viewers routes, profile-viewers.ts, me/profile-views, me/profile-viewers, audience-split.ts, migration 20260928140000
- DB catalog (local): profile_views relacl {postgres,service_role} only, 0 policies, no column ACLs; only definer fns naming ledgers: record_profile_view, record_post_view (boolean); no publications; no pg_graphql locally; entitlements no client grants; hidden set includes REVERSE blocks (people who blocked the caller)
- LOCAL probes (rolled back) as blake/authenticated after the migration: direct SELECT, count, correlated subquery via users, EXISTS oracle in WHERE, INSERT forged view, UPDATE, DELETE, TRUNCATE -> all 42501. anon SELECT -> 42501. record_profile_view blake->casey t, again f. entitlements self-INSERT -> 42501. #17 closed at the DB for PostgREST.
- block/mute routes have no side effects on bookmarks/views; no triggers on blocks/mutes/bookmarks/ledgers (so block-and-recount is not an oracle either).
- PROD (read-only MCP): profile_views relacl still arwdDxtm for anon/authenticated, one policy verbatim, no column ACLs, no pg_graphql, no publication, only record_profile_view names it, latest migration 20260927142000 -> the file's PRE-FLIGHT matches prod.
- Caller sweep (src, public/html, mobile, scripts, supabase/): only me/profile-views route + lib/metrics/profile-viewers.ts read profile_views; both now service role scoped to getUser() id; both behind hasPlus/requirePlus for names. No other RPC/view/policy/edge fn reads it.
- #18: savers route no longer reads hidden set; countPostSavers has no hiddenIds param; free viewers passes []; Vibe+ total unfiltered, paging from list. counts.saves (posts/[id]) and creator-stats saves/views also unfiltered. Other loadHiddenUsers callers filter counts next to NAMED lists (followers, notifications, otto) -> no oracle.
- Gates re-run: node --test audience-split 9/9; npx tsc --noEmit clean.

## Findings
### mustFix: none. #17 and #18 are closed for every path I could find.

### shouldFix
1. People who BLOCKED the caller are now in `total` but out of the Vibe+ list (loadHiddenUsers merges both block directions). A Vibe+ owner who clears their own mutes/blocks reads total - list = how many blockers looked; with one blocker that answers "did X look". Not a mute-and-recount oracle (the caller can't toggle someone else's block) and the profile half already leaked through the unfiltered "today" tile, and blocks_select_either already shows who blocked you. Fix (Franky's call, follow-up): take blocked_id = caller rows out of BOTH total and list on both tiers (not caller-controllable, so no oracle), via an additive direction-aware export next to loadHiddenUsers; or make record_profile_view / record_post_view skip recording across a block.
2. PostAudienceList.tsx ~333: with every visible viewer muted, the Vibe+ sheet says "1 person viewed" then "We can't show them right now", which reads as a failure. Copy should say muted/blocked people aren't listed. A3 owns only the comment line there.
3. Migration header ROLLBACK: say that a Vercel rollback to a pre-wave build after this file is applied makes every Otto metrics open 500, so a code rollback must be paired with the SQL ROLLBACK.
4. Pre-existing: record_profile_view is SECURITY DEFINER with search_path=public (house rule is ''), now the only writer. Not reachable through PostgREST (no CREATE on public, no raw SQL); pin it in a follow-up.
5. Pre-existing: GET /api/me/profile-views has no rate limit, and it now runs service-role reads (Vibe+ scans up to the cap). Low.

Review done 2026-09-27.

## Re-check after the repair round (2026-09-28)
- Resumed after the usage-limit reset. notes-A3.md now has a "Repair round" (paintAudience in _postViewer.js). Re-verifying: repaired lines, migration unchanged, local DB state, other wave-A migrations touching the same tables, gates.
- Repaired paintAudience (_postViewer.js ~1888-1898): only static copy keyed on aud.total / aud.hasMore, which the Vibe+ response already carries. No new field, no user text interpolated, no block named. Only the Vibe+ viewers path reaches it (free goes to the lock, savers to the count), so it adds no oracle. Comment edits in _postViewer.js ~1912 and PostAudienceList.tsx ~36 now describe the unfiltered total correctly.
- Server files and the migration are unchanged since the first pass (mtimes 23:24-23:29, before it).
- Other wave-A migrations: only A2's 20260928120000 names these tables, and it just pins the bookmarks_all_own hash (unchanged; SELECT stays own-only). No batch touches profile_views, post_views, record_profile_view or record_post_view.
- LOCAL re-probe (rolled back): as blake (authenticated) profile_views SELECT and INSERT -> 42501; post_views rows visible 0; other people's bookmarks 0; record_profile_view blake->casey t. anon SELECT -> 42501. Local relacl {postgres, service_role}, 0 policies, no column ACLs, no views/triggers/publications on these tables. Only mute-reading DB function: is_muting_now (not a count). post_engagement_counts returns likes/reposts only.
- PROD (read-only MCP) unchanged: relacl still arwdDxtm for anon/authenticated, the one policy verbatim, post_views 0 policies, latest migration 20260927142000. The PRE-FLIGHT still matches.
- Gates: node --check _postViewer.js OK; node --test audience-split 9/9; npx tsc --noEmit -p . clean (exit 0).
- Verdict unchanged: ship. mustFix none. The shouldFix list above still stands (item 2 is now partly covered by the repaired desktop copy; the React and desktop sheets say the same thing).

Re-check done 2026-09-28.
