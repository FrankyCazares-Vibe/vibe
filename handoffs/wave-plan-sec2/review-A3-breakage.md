# Review A3 (Vibe+ and counts): does anything break?

Reviewer lens: breakage. READ-ONLY on repo files; local-DB probes only inside ROLLBACK.
Started 2026-09-27.

## Progress log
- read plan.md, waveA-build.md, approach-A3.md, notes-A3.md, critique-A3.md
- post-audience.ts diff read: loadPostSavers -> countPostSavers, PostSaverEntry removed. grep: only savers route used loadPostSavers; creator-stats imports loadPostSaveRows (unchanged). AudienceResult gained `total` (additive). OK.
- savers route: loadHiddenUsers gone, total = rows.length (author excluded). OK.
- viewers route: free branch hiddenIds [] -> total unfiltered; Vibe+ pages via pageAudience on the filtered list. Old offset/limit parsing unchanged; pageAudience floors (slice floored anyway). OK.
- CLIENT: PostAudienceList.tsx handles total>0 & rows 0 ("We can't show them right now."). _postViewer.js paintAudience shows sub "1 person" + rows "No one yet." when the Vibe+ list is empty but total>0 -> contradictory copy, now reachable by a mute (was only reachable by hydration drop). shouldFix (file is comment-only for A3).
- profile-viewers.ts + profile-views route read: all profile_views reads on service role scoped to getUser id; users.profile_view_count on cookie client (A1's column revoke does not touch it). recent_total/total not rendered by any client (grep). server-only import safe (ProfileViewersList uses import type; no test imports the loaders).
- repo-wide grep profile_views (excl node_modules/.next/handoffs): only the 2 code readers + comments. No other wave-A migration names profile_views/post_views, so PRE-FLIGHT won't trip on another batch.
- Original policy text (20260513000000:47-49) matches the ROLLBACK word for word.
- LOCAL (applied state): relacl {postgres, service_role} only, 0 policies, RLS on/not forced, no triggers/publications/incoming FKs; outgoing FKs to users ON DELETE CASCADE (RI runs as table owner postgres, so account deletion still cascades; same shape as post_views today).
- PROBE (rolled back): header ROLLBACK then file body -> PRE-FLIGHT passes, POST-CHECK passes, relacl back to {postgres, service_role}. 
- PROBE (rolled back): as drew (authenticated) SELECT -> 42501; head-count shape -> 42501; anon SELECT -> 42501; record_profile_view drew->casey -> t; service_role scoped read -> 1 row. (supabase_auth_admin cascade probe not possible locally: no role switch; reasoning above.)
- PROD (read-only MCP, catalog only): relacl anon/auth/service arwdDxtm, RLS t/f, one policy verbatim, no col ACLs, only fn naming profile_views = record_profile_view (definer), no views/matviews/other policies/pubs/triggers, post_views 0 policies, service_role BYPASSRLS, latest mig 20260927142000 -> PRE-FLIGHT passes on prod as of today.
- PostgREST (local, no writes): service key head count 200 Content-Range 0-0/1; anon key -> 42501; minted authenticated JWT for drew (owns the row) -> 42501 on profile_views while users read works. #17 closed; old cookie code would 500 (correct "after deploy").
- Gates: node --test audience-split 9/9; tsc: 7 errors, all in A2 files (me/reports, me/threads) mid-edit, 0 in A3 files; eslint clean on A3 files. Signed-out GET on the 4 routes -> 401 (compile).

## Verdict: fix-first (one small UI regression; everything else holds)

### mustFix
1. `public/html/_postViewer.js:1888-1891` (paintAudience). A3 made the Vibe+ `total` count muted/blocked
   viewers while the list leaves them out. When EVERY listed viewer is hidden (e.g. the owner muted the one
   person who looked), the desktop sheet now paints sub-line "1 person" above "No one yet." Before A3 the
   total was filtered too, so it read "0 people / No one yet." (consistent). Worse on upgrade: the free lock
   says "1 person saw this. Vibe+ shows you who.", then Vibe+ says "No one yet.". PostAudienceList.tsx:333-338
   already handles this shape ("We can't show them right now."). Fix (orchestrator must widen A3's
   comment-only ownership of this file to these lines):
   `rowsEl.innerHTML = aud.failed ? "" : (aud.total > 0 ? `<div class="vpv-aud-empty">We can't show ${aud.total === 1 ? "them" : "any of them"} right now.</div>` : `<div class="vpv-aud-empty">No one yet.</div>`);`
   (No block named; same copy as the React sheet.)

### shouldFix
- Migration PRE-FLIGHT pins `post_views` having 0 policies (lines 197-201). The file does not depend on it;
  an unrelated post_views policy would abort this apply. Drop it or make it a NOTICE.
- Migration header: add to DEPLOY ORDER/ROLLBACK that a Vercel rollback to pre-wave code after this file is
  applied needs the SQL ROLLBACK first (old code reads with the cookie client: Otto metrics 500s).
- Viewers route Vibe+ branch: `hasPlus` then `loadHiddenUsers` then `loadPostViewers` are now sequential (old
  code ran the first two in parallel). Run `loadHiddenUsers` alongside `loadPostViewers` to save a round trip.
- PostAudienceList.tsx:329-332 comment says a number-with-no-rows comes only from hydration drops; it now also
  comes from muted/blocked viewers. Comment only.
- Builder made no signed-in route calls. The wave browser walk must open Otto metrics as free blake (tiles +
  locked line) and as a Vibe+ account (recent list, Show more), and a post's Views and Saves sheets.

### Checked and fine
- Callers: loadPostSavers had one importer (savers route); PostSaverEntry none; creator-stats keeps
  loadPostSaveRows (unchanged). AudienceResult gained `total` (additive). ProfileViewersPage shape unchanged.
  profile-viewers.ts `server-only` safe (only `import type` from ProfileViewersList.tsx; no test imports it).
- No client renders recent_total or /profile-viewers total; all page on has_more/next_offset.
- profile_views readers: only me/profile-views route + lib/metrics/profile-viewers.ts (both service role,
  scoped to getUser id; profile-viewers gated by requirePlus, recent by hasPlus). Writer is the definer RPC.
  No public/html, mobile, scripts, edge-function, view, policy, trigger or publication reader.
- Account deletion cascade (users -> profile_views ON DELETE CASCADE) runs as the table owner, unaffected.
- Migration: PRE-FLIGHT passes on prod (MCP catalog read) and on local after the header ROLLBACK; POST-CHECK
  passes; ROLLBACK restores relacl arwdDxtm + the policy word for word; "after deploy" claim is right.
- No other wave-A migration names profile_views/post_views; no user-facing copy changed; no block named.

## Re-review after repair round (2026-09-28 01:52)
- Resumed after usage-limit reset. notes-A3.md now has a "Repair round" section; _postViewer.js mtime 23:40 (after the review above). Re-checking the repaired paintAudience and re-running gates.
- Repaired paintAudience (_postViewer.js:1888-1898) read: empty rows + total>0 -> "We can't show them / any of them right now." (hasMore -> "No one on this page has a profile we can show."), total 0 -> "No one yet.", failed -> "". Copy word for word the same as PostAudienceList.tsx:335-337; names no block.
- Stub-DOM probe (my scratchpad paint-probe-rev.mjs, extracts audPeopleLine + paintAudience from the file): total1 -> "1 person" / "We can't show them right now."; total2 -> "any of them"; total5+hasMore -> "No one on this page..." + Show more; total0 -> "0 people" / "No one yet."; failed -> blank sub + blank rows. The earlier mustFix is fixed.
- Only Vibe+ viewers reach paintAudience (savers/private -> paintAudienceCount, free -> paintAudienceLock), so the free-lock-to-paid path now reads "1 person / We can't show them right now.".
- Gates re-run 01:55: node --check _postViewer.js OK; node --test audience-split 9/9; npx tsc --noEmit -p . exit 0 with 0 lines (the A2 errors seen earlier are gone); eslint on all 10 A3 files 0 errors (2 pre-existing `_` warnings at 383/762).
- A3 source files unchanged since the first review except _postViewer.js (mtimes 23:23-23:29). New wave-A migrations re-grepped: only 20260928140000 names profile_views/post_views; 20260928120000_blocks_in_rls revokes nothing, so loadHiddenUsers (Vibe+ list filter) is unaffected.
- Local DB still applied state: relacl {postgres, service_role}, 0 policies (read only).

## Final verdict (re-review): ship
- mustFix: none left. The shouldFix items above still stand (post_views pin in PRE-FLIGHT, Vercel-rollback note in the header, parallel loadHiddenUsers, stale PostAudienceList comment at 329-332, signed-in browser walk).
