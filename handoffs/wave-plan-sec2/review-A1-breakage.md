# Review A1 (profile privacy) — lens: does anything break?

Reviewer started 2026-09-27. Read-only; local DB probes only inside ROLLBACK transactions.

## Log
- Read plan.md, waveA-build.md (A1 row, standing rulings, product calls), approach-A1.md, notes-A1.md.
- Read diffs: hidden-fields.ts, bootstrap, resume proxy, posts grid, /posts/[id] page, /profile/[handle] page, migration 20260928160000.
- Next: exhaustive grep for cookie-client readers of bio/skills/work_experience/current_on (src, public/html, mobile, supabase/functions).
- Cookie-client readers of the four: only me/threads (embed, bio now dropped by A2: line ~495 selects id,handle,name,avatar_url,school) and me/reports (A2: spec id,handle,name,tagline + service-role bio at ~242). Both landed in tree. onboarding prefill/me/profile/profile-sync/profile-bootstrap = service role. No public/html or mobile PostgREST, no edge functions, no realtime on users. RPCs called: none reference the four.
- Prod (read-only MCP) matches PRE-FLIGHT: no policy/view/proc names the four; col grants t for the four, f for layout/resume; anon none; latest 20260927142000. Local: applied (four f, current_on UPDATE kept).
- Local: re-ran the migration inside BEGIN..ROLLBACK after restoring the grant in-txn: GRANT/SET/DO/REVOKE/DO/NOTIFY all ok, four -> f; rolled back; local state unchanged (still applied).
- Client surfaces: profile.html viewer-mode hides .widget-empty (bio via empty .bio-text); ProfileMobile skips empty portfolio sections for visitors (`length > 0 || !isVisitor`). Blank+hidden:[] renders like never-filled. Pinned post not in signed-out grid -> _restorePinIfPossible no-ops (graceful).
- Unit tests: hidden-fields + build-vibe-user-v1 + profile-layout: 30/30 pass. tsc: clean.
- Prod: postgres is a member of authenticated, so the POST-CHECK's `set local role authenticated` works under the house apply recipe; columns orgs.hidden_at, posts.removed_at/org_id, users.profile_layout all live.
- Every `.from("users")` select with a variable column list resolved (TRAIT/CANDIDATE/TARGET/FINISH/CONSENT/...): none name the four. profile-filter STORED_COLUMNS read = service. No ilike filters on the four. Admin routes = service.
- Role probe (rolled back) as blake: pinned_post_id, grid target lookup, users embed without bio, reports spec id,handle,name,tagline, by-id columns all OK; bio -> 42501.
- Dev server (signed out, read-only GETs): blake bootstrap bio kept (not hidden), skills [] (hidden), hidden [], no workExperience; avery grid 1 post (club post left out).
- eslint on A1 files: clean.

## Verdict: SHIP (no must-fix from the breakage lens)

Nothing A1 changed makes a caller 500, silently empty, or lose a shown name. The revoke's only cookie-client readers (me/threads embed, me/reports user spec) are already switched by A2 in the tree; A1's own code reads the four with the service role, so it is safe under both grant states. Shared libs: comment-only changes (build-vibe-user-v1.ts, profile-layout.ts). No policy changed, so no route/policy mismatch.

## Should fix (none block the wave)
1. Version collision (orchestrator): plan.md's wave-B table still gives B4 `20260928160000` (A1 now holds it) and B2 `20260928150000` (A5b holds it). Renumber wave B before it is built, or the schema_migrations INSERT collides.
2. Bootstrap fallback select (no profile_layout, taken on any M1/layout missing-column error) blanks nothing: bio/skills/experience/working-on ship even when hidden; only the résumé fails closed. Dead in prod (both columns live). Cheap fix: when `!layoutRead && !isOwner`, blank all five hideable widgets (or retry with profile_layout alone).
3. Resume proxy owner-row select now needs profile_layout with no missing-column tolerance; a lagging column would 500 the owner's own résumé too. Dead in prod; note only.
4. PRE-FLIGHT pins two things the revoke does not depend on: "anon holds none of the four" (the revoke names anon anyway) and "résumé/layout columns not readable by authenticated". Harmless today (no wave-A file touches them), but an unrelated grant change would block this privacy fix. Could be RAISE NOTICE.
5. Product consequence worth one line to Franky: no admin exception on /api/resume means a moderator cannot open a suspended/banned student's résumé while reviewing a report about it (the bootstrap also withholds it from admins).
6. Visible asymmetry for the browser walk: the signed-out grid drops ALL club posts (public clubs too), while /posts/<id> previews keep public club posts (product call 3). Both intended; check it reads fine.
7. Local data: blake_iu's layout currently hides experience+skills; seeds set no layout. Confirm it is the pre-A1 state (builder says restored byte-for-byte).

## Re-check after resume (2026-09-28 01:54)
- No A1 file changed since the review (all mtimes 23:25–23:30 Sep 27). A2's threads/reports edits (23:36) still in the tree.
- The other wave-A migrations (100000, 100500, 110000, 120000, 130000, 140000, 150000) name none of bio/skills/work_experience/current_on/profile_layout/resume and add no users grants, policies or views, so none can trip A1's PRE-FLIGHT or be broken by its revoke.
- Local state: authenticated bio SELECT f, current_on UPDATE t, handle SELECT t. No local schema_migrations rows after 20260927 for any batch (consistent across wave A; the prod recipe in the header records it).
- Verdict unchanged: SHIP.
