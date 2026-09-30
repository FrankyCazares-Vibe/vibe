# Security wave, batch d — notes

Findings: #4 (intimate image takedown: report path + published process), #27 (24-hour promise), #38 (admin accounts listable).

## Plan
1. reports.ts: add `intimate_image` reason ("An intimate image shared without consent") + a queue-priority helper; node:test file.
2. Migration 2026092714xxxx: widen reports_reason_code_check with intimate_image (PRE-FLIGHT reads current constraint).
3. Admin reports queue: sort intimate_image first.
4. /legal/community + /support: publish the takedown process; LegalLayout footer link.
5. 24-hour promise -> "We aim to review reports within 24 hours; reports of child exploitation or imminent harm go first."
6. Migration: REVOKE SELECT (is_platform_admin) ON public.users FROM authenticated, after grep of every read.

## Progress log
- LIVE STATE (read-only MCP, 2026-09-27): reports_reason_code_check = spam|harassment|sexual|hate|self_harm|other; 0 report rows in prod (10 local). users relacl {postgres=arwdDxtm, authenticated=dDxtm, service_role=arwdDxtm}; is_platform_admin col ACL {authenticated=r}; anon none. 3 admins. Last recorded migration 20260927100000. Local DB matches (last recorded 20260926100000).
- is_platform_admin readers (grep src + public + mobile/src): all service-role EXCEPT src/app/api/me/profile-bootstrap/route.ts (~L124, user client, own row) -> switch to the service client already in that route. DB side: no RLS policy or view names the column; only public.org_content_visible, which is SECURITY DEFINER (runs as owner, unaffected).
- Picker twins NOT owned by me and still missing intimate_image: public/html/_safetyActions.js REPORT_REASONS (DM + legacy desktop reports) and src/components/mobile/ProfileMobile.tsx REPORT_REASONS (phone profile report). ReportSheet.tsx reads reportReasonOptions() so it picks the new reason up automatically.
- Admin queue: keyset paging over created_at; the client (reports-client.tsx L104-111) already collapses a repeated target key. Plan: on the first page, a second capped read of intimate_image reports; their targets go to the top, via a pure helper in reports.ts.
- DONE reports.ts: intimate_image reason (after sexual), REPORT_PRIORITY_REASON_CODES, isPriorityReportReason, reportTargetKey, orderReportTargetKeys. reports.test.ts (12 tests, pass).
- DONE admin queue (src/app/api/admin/reports/route.ts): open tab first page reads open intimate_image reports separately (cap 25) and puts their targets on top; every page sorts priority targets first. Keyset paging unchanged.
- DONE migration 20260927140000_reports_intimate_image_reason.sql — applied LOCALLY (not recorded in local schema_migrations). Proved: intimate_image insert passes, 'nope' refused by the CHECK (rolled back).
- DONE profile-bootstrap: own is_platform_admin read now via the service client (was cookie client).
- DONE migration 20260927141000_users_platform_admin_flag_server_only.sql — applied LOCALLY. Proved as `authenticated`: handle reads fine, posts select fine, org_content_visible (definer) fine for an admin, is_platform_admin -> permission denied. DEPLOY ORDER: code first (profile-bootstrap), then this migration.
- DONE /legal/community: rule bullet, reason list, 24h line, #intimate-images section (two ways, four things, 48h), lawyer note in header, date -> Sept 27.
- DONE /support: 24h line, intimate-image section (short copy + link to #intimate-images), lawyer note, date -> Sept 27.
- DONE child-safety 24h sentence; LegalLayout footer link 'Intimate image removal' -> /legal/community#intimate-images.
- VERIFIED: npx tsc --noEmit clean; node --test src/lib/moderation/*.test.ts 46/46; eslint clean on every touched file. Terms §5 already says "no guarantee about response time", so it already matches the new 24h wording (not my file, no change needed).

## Deploy order
1. 20260927140000_reports_intimate_image_reason.sql BEFORE the code (old code never sends the new code; new code sending it first is refused by the CHECK).
2. Deploy the code (profile-bootstrap now reads the admin flag with the service role).
3. 20260927141000_users_platform_admin_flag_server_only.sql AFTER the deploy (applied first, founders lose the Admin link in the left nav until the deploy lands; admin gates unaffected).
Both are applied to the LOCAL DB only; neither is recorded in local schema_migrations; nothing touched production.

## Open questions / follow-ups (not my files)
- public/html/_safetyActions.js REPORT_REASONS (desktop report sheet for DMs, profiles, posts) and src/components/mobile/ProfileMobile.tsx REPORT_REASONS (phone profile report) still lack intimate_image. Add `{ code: "intimate_image", label: "An intimate image shared without consent" }` right after "sexual" in both. The published copy has a fallback ("If you don't see that choice, pick Sexual content and say so") so it stays true meanwhile.
- The 48-hour promise is only fully true once a moderator removal takes the FILE down (report #4 step 3 / #16: profiles bucket is public). If that fix hasn't landed, a removed image still loads from its saved URL.
- The copy says "reports of child exploitation or imminent harm go first", but the queue only lifts intimate_image. There's no child-exploitation reason code, and self_harm isn't lifted. Recommend adding self_harm to REPORT_PRIORITY_REASON_CODES (one line) and deciding on a child_safety reason.
- Email requests from people without an account land in help@ only; nothing puts them in the admin queue. Someone has to watch help@ against the 48-hour clock.
- reports-client.tsx could badge priority groups ("48-hour clock"); ordering only was in scope.
- Lawyer: confirm the /legal/community + /support wording (TAKE IT DOWN Act), whether an in-app report counts as a valid request, and which records to keep.

## Repair round 1 (2026-09-27)
Items from review-sec.md:
- BLOCKER media-quarantine.ts:40 (quarantine bypass: post media_url may be ANY path on our host, e.g. the author's own banner-*.jpg, so a removal moves nothing and answers 200). Root is the publish rule, not the quarantine rule: post_media_ref_ok (batch b's 120000) + isOwnedMediaRef (publish-post, batch b's route). Mine: src/lib/moderation/ + migrations 2026092714*. Plan: a FOLLOW-UP migration in my range (1420xx) that narrows post_media_ref_ok's https arm to profiles/<user_id>/(posts|posters)/<file>; a pure helper + test for the same rule in src/lib/moderation/media-quarantine.ts; route change (isOwnedMediaRef) written as an open question for batch b (not my file).
- SHOULD reports.ts:143: lift self_harm + a new child_safety reason (CHECK widened in my own 140000, which is local-only: rollback locally first, then re-apply). Decide on 'sexual' as the fallback.
- PROD re-read (read-only MCP): last migration still 20260927100000; posts 23; https media 3 / thumbs 5; 0 https post media outside profiles/<author>/(posts|posters)/<file>; 0 club posts with media; reports CHECK unchanged, 0 rows; post_media_ref_ok not in prod yet (120000 unapplied).
- Composers checked: campus-home.tsx + PostComposerMobile.tsx + profile.html upload kind=post / kind=poster only; club composer (orgs/[handle]/admin-actions.tsx) sends an orgs/ R2 key; the only posts inserts are publish-post and orgs/[slug]/posts (grep). So narrowing breaks no legitimate flow.
- DONE SHOULD: reports.ts child_safety reason ("Child sexual abuse or exploitation", after intimate_image); REPORT_PRIORITY_REASON_CODES = child_safety, self_harm, intimate_image, sexual (sexual = stand-in for the two pickers that lack the new choices; drop it once they have them). reports.test.ts 16/16.
- DONE admin queue: priority read is one query per reason in rank order (parallel), joined and cut at the cap, so sexual-content volume can't push a child-safety report out.
- DONE 140000 now also adds child_safety. Local: old ROLLBACK applied, new version re-applied; child_safety + intimate_image accepted, 'nope' refused (rolled back).
- DONE copy: /legal/community (reason list + "child exploitation or self-harm go first"), /support (same line), /legal/child-safety (same line; in-app step now picks "Child sexual abuse or exploitation", falling back to "Sexual content"; date -> Sept 27). "imminent harm" dropped: threats against others arrive as harassment/other and are NOT lifted, so the copy now names only what the queue lifts.
- DONE BLOCKER (DB layer): NEW 20260927142000_post_media_url_author_folders.sql. CREATE OR REPLACE post_media_ref_ok (same signature, grants carry over): the https arm is now only https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/<user_id>/(posts|posters)/<file>, file [A-Za-z0-9_-][A-Za-z0-9._-]*, no '..', <= 2048. clips/ and orgs/ arms unchanged. PRE-FLIGHT pins the exact 120000 body (whitespace-normalised), the helpers, the trigger, and aborts on any existing post photo on our host outside its author's folders (prod 0). POST-CHECK probes 5 legit + 18 refusals.
  Local proof as authenticated ef638534 (rolled back): own photo post, own video post (clips + posters), text post STORED; own banner URL, another student's post photo, another student's avatar -> 23514. Rollback applied locally and the file re-applied (pre-flight passes again = rollback restores the exact 120000 body; grants unchanged). A second run aborts in pre-flight.
- DONE BLOCKER (TS rule): media-quarantine.ts isAuthorPostPhotoUrl(ref, supabaseUrl, authorId) = the DB photo arm in TypeScript, and a strict subset of authorPostMediaPath (tested). 5 new tests; moderation tests 55/55. Parity check vs the local DB function on 15 samples: identical verdicts.
- NOT MINE (route layer of the BLOCKER): src/app/api/me/publish-post/route.ts isOwnedMediaRef still takes any own-host path. Until it changes, a crafted banner/foreign URL gets a 500 from the DB instead of a 400 (never stored). One-line fix for batch b / lead:
    import { isAuthorPostPhotoUrl } from "@/lib/moderation/media-quarantine";
    return isAuthorPostPhotoUrl(value, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", userId);   // replaces the https arm
  The club route (orgs/[slug]/posts, isAllowedMediaUrl) has the same wide https arm; its composer only sends orgs/ keys, so a crafted https value there is a 500 too.
- media-quarantine.ts:40 itself needed no rule change: the quarantine set was right, the storing rule was too wide. The remove route (batch c's file) still answers 200 when plan.left.foreign > 0; after 142000 that can only happen for rows written before it (prod: 0).
- VERIFIED (repair round 1): npx tsc --noEmit clean; node --test src/lib/moderation/*.test.ts 55/55; eslint clean on every touched file.

### Deploy order (updated)
1. 20260927140000 (now intimate_image + child_safety) BEFORE the code.
2. 20260927120000 (batch b) then 20260927142000 (this round). 142000 aborts without 120000's exact body.
3. Code deploy. 4. 20260927141000 after the deploy (unchanged).
All applied to the LOCAL DB only; nothing recorded in local schema_migrations; nothing touched production.

### Open questions added this round
- publish-post isOwnedMediaRef (batch b's route) should call isAuthorPostPhotoUrl (snippet above) so a crafted URL is a 400, not a 500.
- Pickers not mine still lack BOTH new reasons: public/html/_safetyActions.js REPORT_REASONS and src/components/mobile/ProfileMobile.tsx (~5799). Add `{ code: "intimate_image", label: "An intimate image shared without consent" }, { code: "child_safety", label: "Child sexual abuse or exploitation" }` after "sexual"; then drop "sexual" from REPORT_PRIORITY_REASON_CODES.
- Lawyer: child_safety reports may trigger an NCMEC CyberTipline duty (18 U.S.C. 2258A) and evidence preservation; nothing automates either.
- Local dev: the DB pins the production host, so a photo post against the local stack (http://127.0.0.1:54321 URLs) is refused by the 120000 trigger already; unchanged here.
