# Wave A cross-batch check (2026-09-28)

Progress notes, appended as I go.

- Started. 8 wave-A migration files found (100000, 100500, 110000, 120000, 130000, 140000, 150000, 160000).
- Rolled back all 7 (160000..100000) in reverse order locally: every ROLLBACK block ran clean (exit 0).
- Applied forward in VERSION order (100000, 100500, 110000, 120000, 130000, 140000, 150000, 160000) with ON_ERROR_STOP=1: all 8 exit 0, every PRE-FLIGHT and POST-CHECK passed. Only output of note: `NOTICE: club-chat-cleanup: 0 stale channel_members, 0 stale org_channel_members`.
- Catalog snapshot (public policies md5 qual/with_check, functions md5/secdef/config/acl, table + column ACLs, constraints, triggers) BEFORE the rollback == AFTER the version-order re-apply, byte for byte. So the random local order and prod's version order land on the same schema. All 8 left applied.
- DB interplay probes (each BEGIN ... ROLLBACK, nothing kept):
  - Club delete as service_role with a recorded removal: events cascade (A4 FK) and org_members cascade fires A5a's trigger cleanly; 0 events/members/removals left. OK.
  - emery self-leaves with the cookie client (authenticated): her club channel_members rows drop to 0 (A5a SECDEF trigger vs A5b's channel_members policy). OK.
  - Service-role removal (org_removals row, then delete): her RSVP to the club's upcoming event is deleted (A5a trigger vs A4 rsvps rules). OK. A4's "trigger must be SECURITY DEFINER" ask: satisfied.
  - Pre-existing, not wave A: posts_org_id_fkey is ON DELETE SET NULL, so a deleted club's posts become the officer's personal posts (check the orgs DELETE route).
- GATE: `npx tsc --noEmit -p .` exit 0, no errors. `npm test`: 1130 tests, 1129 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (the known pre-existing one). No other failures.
- A1 revoke vs cookie reads: public/html and mobile/www never call Supabase directly (no `.from(` / rest/v1). Every src read of bio/skills/work_experience/current_on is the service role: profile/[handle]/page.tsx, me/profile, me/profile-sync, me/profile-bootstrap, users/[handle]/bootstrap, onboarding page + classic route + onboarding-step (ONBOARDING_PREFILL_COLUMNS), me/reports. Browser-client users reads select only `handle`. No `users(*)` / `select("*")` on users. CLEAN.
- A3 revoke vs cookie reads: every profile_views read (me/profile-views x4, lib/metrics/profile-viewers.ts) is the service role. CLEAN.
- Writes vs new grants: events has one writer (service insert); orgs PATCH, org_members role update, org_join_requests updates all service role; posts PATCH is the cookie client and its EDIT_AS_ORG_ROLES (owner, admin) matches A5b's posts_update_own. channel_members own-row UPDATEs in me/threads/* now also need can_read_channel_roster (only SELECT policy) -> 0 rows for an unreadable club channel, which is the intent; ensureMember 403s first.
- No SECURITY INVOKER function and no view in public references users (so A1's revoke can't break an RPC).
- Prod vs local pre-wave: read-only MCP snapshot of every touched object on PROD (policies on 13 tables, 15 helper functions, table + column ACLs, events/org_removals constraints, org_members/events/rsvps/channel_members triggers) == the local ROLLED-BACK snapshot, except the ACL entry ORDER on profile_views (same grants; 140000 checks with has_table_privilege, so order doesn't matter). So prod will see exactly what the local version-order apply saw.

## Interplay issues (none block the migrations; file + fix)
1. src/app/api/orgs/[slug]/profile/route.ts:161-168: service-role club-post read filtered only by org_id (no type/status/removed_at/author-restriction/block filter), answers anon (local GET 200). The one path left that skips A2's posts rules and moderation removal. No in-app caller found. Fix: copy readOrgPosts from src/app/orgs/[handle]/page.tsx:254-265 (type post, status published, removed_at null, then drop restricted authors), or delete the route. Same file line 107: pass `removed`.
2. orgJoinState without `removed` (A5a ask): src/app/api/orgs/[slug]/route.ts:294, src/app/api/orgs/route.ts:506, orgs/[slug]/profile/route.ts:107. Fix: read org_removals (service role) for (org, viewer), pass `removed`. Today: a removed member of an open club sees Join; tapping it files a pending request (no 500).
3. src/app/campus/campus-home.tsx RequestRow (~2756) + act(): no removed_before tag, Approve not hidden on can_approve=false. Refusals do show the server message (r.error). Fix: render ORG_COPY.meta.removedBefore; hide or disable Approve when can_approve === false.
4. Blocks vs club posts: A2's posts SELECT hides a club post from anyone in a block pair with the OFFICER who wrote it on cookie surfaces (feed, posts/[id], hashtags, reposts, shared posts in DMs), while the service-role club grid (orgs/[handle]/page.tsx) and #1 still show it. Needs a product call against call 9. Fix either way: block-filter the grid (loadHiddenUsers), or exempt org_id-not-null posts from the block clause.
5. src/app/api/posts/[id]/media/route.ts: service role, no block check. Moot while signed-out media is allowed by design. Residual only.
6. src/app/api/orgs/[slug]/route.ts:692 DELETE docblock (A4 ask): add "events (and their RSVPs)". Pre-existing: posts_org_id_fkey is ON DELETE SET NULL, so a deleted club's posts become the officers' personal posts. Decide in B2 or a follow-up.
7. Version clash (A5b note): plan.md gives B2 20260928150000, which A5b already uses. B2 needs a new number (e.g. 20260928170000) and must restate posts_update_own with A5b's org clause. Post-wave fingerprints md5(qual|with_check): posts_update_own bb242564edecd0feeb551439d4ece148, posts_select_authenticated 19ad59364b9b85d3773638e72ad7d89a, post_comments_select_authenticated 24311c968863e5f07045e5ee095fdbcd, post_comments_insert_own 2c7653204c6c1131a0c77752d5b98393, channel_members_select_member 1532e43e3921cdf6e7eadb94f26a7ad1.

## leftForOthers, done or not
A5a
- campus-home requests panel (removed_before, can_approve): NOT DONE (#3 above).
- `removed` into orgJoinState in orgs/[slug]/profile, orgs/[slug]/route.ts, orgs/route.ts: NOT DONE (#2).
- A4 review of the RSVP delete in the trigger + club-deletion probe after 110000: DONE here (probes pass; trigger is SECURITY DEFINER; club delete cascades cleanly).
- Follow-ups: demotion doesn't drop private officer channels (open); org_channel_members anon/authenticated arwdDxtm grants (open, same on prod); a pending invite from a club whose officer blocked the student stays in /api/me/org-invites (open).
A4
- orgs DELETE docblock gets events: NOT DONE (#6, doc only).
- A5a trigger must be SECURITY DEFINER: DONE.
- users SELECT must stay unchanged: HELD (users policies identical before/after; only the 4 column ACLs changed).
- Officer "Delete event" UI: NOT DONE (planned follow-up batch).
A2
- New post_comments_insert_own fingerprint; nothing later pins the old one: CONFIRMED (version-order apply passes).
- orgs/[slug]/profile service-role posts read: NOT DONE (#1).
- Club grid shows a blocked officer's club post: NOT DONE (#4).
- users row across a block readable, last_active_at revoke: by design / follow-up.
- record_post_view count across a block, /api/search blocks fail-open: open (optional).
- me/threads/[id]/members POST rateLimit: NOT DONE (no rateLimit in that file).
A1
- me/reports reads bio with the service role before 160000: DONE by A2 (userBioAsService; user spec columns are id,handle,name,tagline).
- Apply 160000 after the deploy with A2's threads + reports live: orchestration, still to do.
- users column UPDATE grants (current_on, resume_url/docs/redactions, work_order_manual): open follow-up.
A3
- Apply 140000 only after Vercel READY + served-build check: orchestration, still to do.
- Browser walk (Otto metrics as blake; Views/Saves sheets): NOT DONE by this check.
A5b
- B2 version clash: OPEN (#7).
- A2 review of ensureMember's new 403/500: DONE (review-A5b-breakage.md, all 4 callers map it).
- Revoke INSERT on channels from authenticated: open (prod still authenticated=ard... + channels_insert_authenticated).
- Fold src/lib/club-routes/gate.ts into src/lib/orgs/hidden-gate.ts: open (same rule in two copies; club-routes adds ownerById + read-error handling).
- subscribe-public ignores read errors; word filter on club link URLs: open, low.
