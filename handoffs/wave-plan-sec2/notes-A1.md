# notes-A1 (profile privacy) — builder log

Started 2026-09-27. Migration: 20260928160000_users_profile_widgets_server_only.sql (apply AFTER deploy; A2 threads+reports first).
Owns: bootstrap route, build-vibe-user-v1.ts (+test), profile-layout.ts (+test), new hidden-fields.ts (+test),
resume route, users/[handle]/posts route, posts/[id]/page.tsx, profile/[handle]/page.tsx. NO ProfileMobile/profile.html copy edits.

## Log
- Read plan.md, waveA-build.md, approach-A1, critique-A1, findings #2b/#3/#5/#6/#7.
- waveA-build overrides approach-A1 on ownership: threads/route.ts + reports/route.ts belong to A2 (A2 drops bio from
  threads embed + reads report bio with service role). A1 does NOT touch them; migration applies AFTER A2's code deploys.
- Product call #1: revoke SELECT(bio,skills,work_experience,current_on) from authenticated/anon. No copy edits.
- Product call #3: restricted /profile/<h> preview = unknown-handle preview; hidden bio left out of og:description.
- Product call #4: résumés only to school-verified viewers, owner not restricted, layout not hiding résumé; owner always.
- LIVE STATE (read-only MCP, 2026-09-27): users relacl {postgres=arwdDxtm, authenticated=dDxtm, service_role=arwdDxtm}
  (no table SELECT for authenticated/anon). attacl bio/skills/work_experience = authenticated=r; current_on = authenticated=rw.
  profile_layout: no acl. resume_url/docs/redactions: authenticated=w only. anon: no SELECT on any users column.
  No function / view / policy names bio|skills|work_experience|current_on (word-boundary regex). Latest prod migration 20260927142000.
  Counts: 20 users; 1 any hidden (resume+skills+experience); 0 hide bio/working_on; 4 with résumé; 6 unverified;
  0 active restrictions; 0 removed posts; 0 club posts; 4 hidden orgs.
- Wrote src/lib/profile/hidden-fields.ts (pure, import type only): blankHiddenWidgets, stripResumeKeys, hasResume,
  resumeVisibleToViewer (one rule for bootstrap + proxy), profilePreviewDescription, postPreviewIsPublic.
- bootstrap: isOwner const; targetRestricted flag (admin path); layoutRead flag (fallback select => résumé withheld);
  blankHiddenWidgets(normalizeProfileView(...)) BEFORE build (tagline-from-bio leak); résumé keys stripped for non-owner
  unless resumeVisibleToViewer (viewer school_verified read via service only when a résumé remains; read error => strip).
- resume proxy: nonOwnerResumeGate (layout hides résumé -> 404; restriction read fail -> 500; restricted -> 404;
  viewer unverified -> 404; viewer read error -> 500). Inside `if (!isOwner)`, so owner's ?view=public unaffected.
- posts grid: signed-out -> getActiveRestriction (fail 500, restricted 404 "User not found") + `.is("org_id", null)`;
  signed-in block read -> loadPairBlock (fail closed 500).
- /posts/[id] generateMetadata: select user_id,org_id,removed_at + org:orgs!posts_org_id_fkey(hidden_at), .is(removed_at,null),
  postPreviewIsPublic gate -> generic {title:"Post · Vibe"}. Body: auth redirect moved ABOVE existence check (kills
  404-vs-307 id oracle); existence check keeps NO removed_at filter (author's removal notice) — deviates from finding #7's
  "same filters on body" on the critique's evidence (GET /api/posts/[id] serves removed post to its author).
- /profile/[handle]: restricted/unknown-restriction -> unknown-handle metadata; hidden bio out of og:description.
  Went one step past "metadata only": body notFound() for a restricted target UNLESS self or platform admin (the
  critique allowed this with the admin exception); restriction read failure keeps the page mounted.
- tsc --noEmit -p . clean (whole repo, exit 0) after route edits; hidden-fields (13) + build-vibe-user-v1 (8) + profile-layout tests pass.
- Cookie-client readers of the four (grep 2026-09-27): only me/threads/route.ts:465 (embed bio) and
  me/reports/route.ts:119 (spec bio) — both A2's files per waveA-build. me/profile, profile-sync, profile-bootstrap,
  users/[handle]/bootstrap, profile/[handle]/page use the service role. public/html: no PostgREST calls (.from( hits are Array.from).
- Wrote supabase/migrations/20260928160000_users_profile_widgets_server_only.sql (grants only; PRE-FLIGHT, revoke from
  authenticated/anon/public, POST-CHECK catalog + behaviour as `set local role authenticated`). Order: AFTER deploy, after A2.
- Applied locally: BEGIN/SET/DO/REVOKE/DO/NOTIFY/COMMIT — pre-flight and post-check passed on local.
- Local role probes (rolled back): as authenticated (blake claims): select bio (other's), skills, work_experience,
  current_on (own), bio (own), old threads embed with u.bio -> all 42501 "permission denied for table users";
  embed without bio -> ok (2 rows); reports spec id,handle,name,tagline -> ok; UPDATE own current_on -> UPDATE 1 (ok).
  anon select bio -> 42501. service_role reads the four + profile_layout -> 7 rows.
- ROLLBACK grant then re-apply: ok (four back to t, then f; current_on keeps authenticated=w). Second apply aborts in PRE-FLIGHT as designed.
- HTTP (dev server localhost:3000 -> local Supabase via .env.development.local), signed out, blake's layout set then
  restored (trap): hidden bio+skills+experience -> bootstrap bio "", tagline "" (no bio-derived tagline), skills [],
  hidden []; /profile/blake_iu description "Blake Student's profile on Vibe". Only experience hidden -> bio/tagline/skills
  ship, hidden []; description = bio. Row restored byte-for-byte (checked).
- HTTP signed out: avery grid omits the club post; removed post preview -> "Post · Vibe" (307); public club post keeps
  preview (product call 3); unknown id -> generic; with a temporary ban on vibe_review_pal (inserted, then deleted; count 0):
  post preview generic, grid 404 "User not found", bootstrap 404, /profile page 404 identical to unknown handle;
  after lift the page is 200 with the full preview.
- HTTP signed in (seed sessions via local GoTrue, password from scripts/local-seed.mjs; cookies in scratchpad only).
  NOTE blake has a seeded block on casey, so avery (verified; is a platform admin) was the verified viewer.
  casey given a temp résumé key (object absent, so a served request ends in 500 at signing), restored to null after:
  R1 avery bootstrap lists it, hidden []; R2 drew (unverified) bootstrap: no résumé; R3 avery proxy 500 (gate passed);
  R4 drew proxy 404. Hide résumé: avery bootstrap none, proxy 404; casey (owner) bootstrap keeps it + hidden ["resume"];
  owner proxy plain and ?view=public -> 500 (gate NOT applied to owner; 500 = missing object).
  pal temp résumé: avery proxy 500; ban pal -> avery(admin) proxy 404, admin bootstrap shows profile WITHOUT résumé,
  drew bootstrap 404. Cleaned (restriction count 0, resume_url null).
  Grid: blake->casey {posts:[],blocked:true} via loadPairBlock; drew->avery signed in 2 posts (RLS path unchanged);
  blake own grid keeps his removed post; blake /posts/<own removed> page 200 (author's removal notice path intact).
- Restricted pal /profile page: admin avery 200, non-admin drew 404. Restriction row removed (count 0).
- Inbox GET /api/me/threads as blake under the revoke: 200 (A2's bio drop is in the tree).
- Gates: npm test 1119 tests, 1118 pass, 1 fail = known parse-reminder.test.ts. tsc: 1 error, in A2's
  me/threads/route.ts (mid-edit, not mine); zero in A1 files. eslint on A1 files: clean.
- Session cookies used for probes deleted from scratchpad.

## Requests / left for others
- A2: src/app/api/me/reports/route.ts:119 still names `bio` on the cookie client (user spec). Must switch to
  id,handle,name,tagline + service-role bio BEFORE 20260928160000 applies. With the revoke applied locally,
  POST /api/me/reports type=user 500s locally until A2 lands it. (threads/route.ts already done by A2.)
- Orchestrator: apply 20260928160000 AFTER the deploy, after A2's threads+reports code is the served build.
- Follow-up (not A1): column UPDATE grants for authenticated on current_on, resume_url/docs/redactions, work_order_manual.
- Deviation noted: /posts/[id] body existence check keeps removed posts (critique evidence), finding #7 said filter it.
