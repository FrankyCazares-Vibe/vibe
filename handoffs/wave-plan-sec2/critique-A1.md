# Critique — A1 profile privacy (read-only review, 2026-09-27)

Reviewer notes, appended in chunks as I go.

## Scope read
- plan.md (all batches), findings #2b, #3, #5, #6, #7.

## Owned files read (first pass)
- bootstrap/route.ts: service-role read of BASE cols incl. bio/skills/work_experience/current_on/resume_*; restriction 404 + block branch already there; strips resume for anon only, redaction geometry + looking_for for non-owners. profile_layout is in the OPTIONAL tier (fallback select drops it -> default layout -> nothing hidden: fail-OPEN on that retry path; builder must treat "layout unreadable" as... fine only because the column exists live; note it).
- build-vibe-user-v1.ts: **tagline falls back to taglineFromBio(bio)** (line 64) — blanking bio alone still leaks bio's first line as tagline when tagline is empty. Blank must happen BEFORE build (on the ProfileView), and tagline fallback must not use a hidden bio. Also always emits profileLayout.hidden (line 172-177).
- profile/[handle]/page.tsx: OG description = tagline || bio.slice(0,160) — **hidden bio leaks via link preview too** (not in the plan's #2b line; A1 owns the file, add it).

## Callers of bio/skills/work_experience/current_on (src)
- me/profile, me/profile-sync, me/profile-bootstrap: all read users via createSupabaseServiceClient -> unaffected by a revoke.
- users/[handle]/bootstrap, profile/[handle]/page.tsx: service role -> unaffected.
- **src/app/api/me/reports/route.ts:119** reads `users` with the COOKIE client, columns `id,handle,name,bio,tagline` (readTarget -> `one()`); a revoke of SELECT(bio) makes PostgREST answer 42501 -> `one` returns "error" -> **POST /api/me/reports (type=user) answers 500**. Reporting a user breaks. Not owned by any batch.
- **src/app/api/me/threads/route.ts:462-466** (GET inbox) embeds `users!channel_members_user_id_fkey(id,handle,name,avatar_url,school,bio)` with the COOKIE client; a revoke of SELECT(bio) makes the embed fail -> **the whole DM inbox 500s** ("[threads.GET others]"). public/html/messages.html:2014 shows `peer.school || peer.bio` as the peer subtitle. Not owned by any batch (A2 owns threads/[id]/**, not threads/route.ts).
- Other cookie-client users reads (settings, terms, admin, ProfileHandleSwitch, suspended, the-map, users/search, search) never name the four columns. public/html/** makes no direct PostgREST calls (grep for .from( / rest/v1 empty).

## Live DB (read-only MCP, 2026-09-27)
- users grants are COLUMN-level (table SELECT for authenticated = false; attacl bio/skills/work_experience = `{authenticated=r/postgres}`, current_on = `{authenticated=rw/postgres}`) -> a per-column REVOKE SELECT works, no table re-grant needed. anon: no SELECT on users at all.
- resume_url/resume_docs/resume_redactions/profile_layout: NOT selectable by authenticated (UPDATE is still granted on resume_url/resume_docs/resume_redactions/current_on/work_order_manual — out of A1 scope, note only).
- No public function or view references bio/skills/work_experience/current_on (pg_proc/pg_views scan = none).
- users_select_authenticated: `((id = ( SELECT auth.uid() AS uid)) OR user_visible(id))`.
- posts_select_authenticated: `(((status = 'published'::text) AND (removed_at IS NULL) AND user_visible(user_id) AND ((org_id IS NULL) OR org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid() AS uid)))`.
- org_content_visible() returns FALSE for role anon for ANY org (first clause `current_setting('role') is distinct from 'anon'`) -> the DB's own rule is "signed-out sees no club content".
- Counts: 20 users; 1 has any hidden widget (hides experience, skills, resume; holds a résumé doc); 0 hide bio / working_on; 4 hold a résumé; 6 unverified, 0 unverified WITH a résumé; 0 active restrictions; 0 removed posts; 0 club posts; 21 published posts; 5 orgs, 4 hidden.

## /posts/[id] body check — do NOT add removed_at there
- GET /api/posts/[id] (route.ts:123-127) deliberately serves a removed post to its AUTHOR so they open the removal notice at /posts/<id>. If page.tsx's existence check filters removed_at, the author's own link 404s before the viewer mounts. Keep the body's filter as-is; only generateMetadata changes. Optional: move the auth redirect ABOVE the existence check so signed-out visitors always get 307 (kills the 404-vs-307 existence oracle) while signed-in keeps the clean 404.

## Bootstrap blanking — how, exactly
- Both surfaces already SKIP an empty widget for visitors: profile.html:677 `body.viewer-mode [data-widget].widget-empty {display:none}` (+ _refreshWidgetEmptyFlags :7804), ProfileMobile.tsx:372 "Empty widgets are skipped for visitors on both surfaces". So: blank the hidden widgets' fields AND send `hidden: []` to non-owners -> a hidden widget looks exactly like one never filled in. No client change needed.
- Blank on the ProfileView BEFORE buildVibeUserV1FromProfile (bootstrap after normalizeProfileView, same spot as the looking_for strip), not on vibeUser after: build-vibe-user-v1.ts:64 derives tagline from bio when tagline is empty, so a post-build blank still leaks bio's first line as the header tagline.
- Map: bio -> bio=""; experience -> work_experience=[] (+work_order_manual=false); skills -> skills=[] (phone header tag row reads skills too, ProfileMobile:1444); working_on -> current_on=[]; resume -> resume_url=null, resume_docs=[], resume_redactions=[]. Keep `order` and `bioSide` (all six ids always present; leaks nothing). Owner (viewer.id === target) keeps everything incl. hidden list.
- hidden-fields.ts must have ZERO value imports (only `import type`): npm test is `node --test` on .ts files; a value import of "./profile-layout" without a .ts extension will not resolve (see self-write-columns.test.ts dynamic-import pattern).
- Fallback select (bootstrap:108-114) drops profile_layout -> default layout -> nothing hidden = fail-OPEN. Column is live in prod so the path is dead today; either accept (note in header) or, on that path, blank all hideable fields for non-owners. Recommend: on the fallback path, for non-owners, null the résumé keys (cheap, fail-closed for the one that matters).

## Résumé proxy — who the new checks apply to
- Apply verified-viewer, owner-restriction and layout-hidden checks to `!isOwner` ONLY, not to `asViewer`. ResumeViewerMobile.tsx:126-132/180: the owner's own phone "Open" button goes to `?view=public`; a layout check on asViewer would 404 the owner's own résumé the moment they hide it.
- Viewer verified: one service read `users.school_verified` by user.id (the helper readAccess in moderation/access.ts is not exported). Owner restriction: getActiveRestriction(ownerId); a failed read = 500 (fail closed, same as bootstrap). Add `profile_layout` to the owner-row select (service role; column not granted to authenticated). All three failures answer the route's existing uniform 404.
- Bootstrap side of #5: only read the viewer's school_verified when the target row actually carries a résumé (resume_url or resume_docs non-empty) — the bootstrap is the hottest read; 4 of 20 rows have a résumé.
- Cookie-client writes to users: only me/heartbeat (last_active_at). No write path is affected by a SELECT revoke.

## Decision: revoke (not copy change)
- skills / work_experience / current_on: ZERO cookie-client readers in src, zero in public/html -> revoke is free.
- bio: two cookie-client readers (threads inbox embed, reports snapshot). The threads one ALSO leaks a hidden bio to DM peers through a route (messages.html:2014 subtitle `peer.school || peer.bio`), so it must change even under the copy-change option. Once it changes, the revoke costs one more small edit (reports). -> Revoke all four; A1 takes threads/route.ts (drop `bio` from the embed + ThreadPeer type; messages.html needs no edit, falls back to '') and reports/route.ts (user spec columns `id,handle,name,tagline` on the cookie client for the visibility check, then bio via the service role into the snapshot so moderators keep it).
- With the revoke landed, "hidden · only you see it" becomes true -> NO copy edit in ProfileMobile.tsx / profile.html (drop them from A1's ownership unless the revoke is abandoned).

## Migration 20260928100000 (grants only)
- `revoke select (bio, skills, work_experience, current_on) on public.users from authenticated;` (anon/public hold nothing today; revoking from them too is harmless). No policy change -> nothing to restate.
- PRE-FLIGHT: has_column_privilege('authenticated','public.users',c,'SELECT') is TRUE for the four; FALSE for profile_layout/resume_url/resume_docs/resume_redactions; no pg_proc/pg_views body names the four.
- POST-CHECK: FALSE for the four; still TRUE for id,name,handle,avatar_url,school,major,year,tagline,campus_id,school_system (every users embed in src uses only these); behaviour: `set local role authenticated` + `select bio from public.users limit 1` raises 42501 (catch insufficient_privilege), `select id,handle,name,avatar_url,school from public.users limit 1` succeeds.
- ROLLBACK: `grant select (bio, skills, work_experience, current_on) on public.users to authenticated;`
- ORDER: **AFTER the deploy.** Applied first, GET /api/me/threads (every inbox load) and POST /api/me/reports (type=user) answer 500 until the new code is live. The code is safe under both grant states.
- Leave UPDATE on current_on alone here (no cookie writer exists; direct UPDATE on current_on/resume_docs/resume_url/resume_redactions/work_order_manual still bypasses the profile word filter — follow-up, not A1).

## Metadata pages
- /posts/[id] generateMetadata: add `user_id,org_id,removed_at` + `org:orgs!posts_org_id_fkey(hidden_at)` to the select, `.is("removed_at", null)`; then getActiveRestriction(user_id): `!ok` or restriction -> generic `{title:"Post · Vibe"}` with NO description and NO og:image; hidden_at set -> same generic. Fail closed on every error (the existing catch already returns generic).
- /profile/[handle]: add `profile_layout` to loadPublicProfile's select; restricted -> return exactly the unknown-handle metadata (`{ title: "@<handle> · Vibe" }`) so a preview can't tell "restricted" from "no such user"; layout hides bio -> description skips bio (tagline, else "<name>'s profile on Vibe"). Wrap the restriction read in react `cache` so the page and metadata share it. Do NOT notFound() the body for a restricted target unless you also let a platform admin through (bootstrap comment: moderation screens link straight to /profile/<handle>); simplest = metadata only.

## Signed-out posts grid (#6)
- Signed-out branch: getActiveRestriction(target.id) -> 404 "User not found" (same text as unknown handle; read error -> 500, as bootstrap). Clients only fetch the grid after the bootstrap succeeded, so the 404 is never seen on an honest client.
- Hidden clubs: use `.is("org_id", null)` on the signed-out branch — it IS the database's rule (org_content_visible is false for anon for every club), cheaper than an orgs join, and needs no org_id in the response. "Stop using the service role" is impossible: anon holds no SELECT on users or posts.
- Signed-in block read (route.ts:66-75) ignores the error (fail-open). Swap for loadPairBlock (fail closed, plan rule "reuse the helpers").

## Cross-batch
- A2 may add a block clause to users/posts SELECT: the grid's signed-in handle lookup then returns null for a blocked pair -> 404 instead of `{posts:[],blocked:true}`. Harmless (bootstrap answers the blocked branch first with the service role) but A2's reviewer should know.
- No file overlap: A2 owns threads/[id]/** not threads/route.ts; nobody owns me/reports; B3 (profile.html composer) is wave B and A1 no longer edits profile.html.

## Verdict: go-with-changes
Add threads/route.ts + reports/route.ts to A1; drop the copy edits; migration after deploy; blank before build; résumé checks on !isOwner; no removed_at in the /posts/[id] body check.
