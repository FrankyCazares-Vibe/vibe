# Notes I1 — club surfaces (integration pass, 2026-09-28)

Owns: orgs/[slug]/profile/route.ts, orgs/[slug]/route.ts, orgs/route.ts, orgs/[handle]/page.tsx, campus-home.tsx (requests panel only),
src/lib/club-routes/**, club-routes/gate.ts import lines in orgs/[slug]/channels/** + posts/**.
Tasks: (1) profile route posts read filters + removed; (2) removed into orgJoinState in [slug]/route.ts + orgs/route.ts, DELETE docblock;
(3) readOrgPosts hides loadHiddenUsers authors; (4) requests panel removed_before tag / can_approve / refusal copy; (5) fold gate.ts into officerGate.

## Progress
- read waveA-build (rulings 13-18), crosscheck-waveA, notes-A5a/A5b/A2. Started.
- DECISION (ruling 13): club grid + profile route drop authors in loadHiddenUsers(...).hidden.BLOCKED only (not muted): ruling 13
  is about blocks and mirrors posts_select_authenticated's is_blocked_either_way clause; mutes stay a feed-level filter, and a
  club page is visited on purpose. Blocks read error -> fail closed (page: failure line; route: posts []). Open question in return.
- orgs/[slug]/profile route: no caller in src, public/html or mobile/www (grepped); fixing anyway.
- Plan: new pure src/lib/club-routes/club-posts.ts (+test): visibleClubPosts filter, isMissingRestrictionsStore; new server-only
  club-posts-read.ts: loadRestrictedAuthors (moved from the page) + readClubPostRows (removed_at fallback). Page + route share them.
- DONE club-posts.ts + test (7/7), club-posts-read.ts (readClubPostRows w/ removed_at fallback, loadRestrictedAuthors moved from
  the page, loadBlockedAuthors = loadHiddenUsers.blocked minus self).
- DONE page.tsx: readOrgPosts/local loadRestrictedAuthors/MODERATION_POST_COLUMNS/isMissingColumnError replaced by the shared
  helpers; blocks read in the same Promise.all; failure line when blocks read fails.
- DONE profile route: same filters (was org_id only), removed: ctx.removed; posts [] when an author read fails (rest answers).
- DONE [slug]/route.ts: removed: ctx.removed in GET; DELETE docblock lists every CASCADE (verified pg_constraint locally) incl.
  events (+RSVPs) and says posts are SET NULL (B2).
- DONE orgs/route.ts Discover/Following: one service read of the viewer's org_removals rows (all their rows, in the existing
  Promise.all, so no extra round trip; superset of "the listed orgs"); missing table = none; other error logged like its
  neighbours (open club shows Join, join route files a request). removed: removedOrgIds.has(o.id).
- FOLD (task 5): SAME RULE. clubRouteGate's core == officerGate (hidden+no role -> 404, role not allowed -> 403, else ok). Its
  extras were read plumbing: org read error 500 / no org 404 (now checked before the gate), ownerById (PATCH now skips the roster
  read for the owner by owner_id; DELETE already branched), roleReadFailed (role passed as null -> officerGate says not_found on
  hidden = 404; routes then check the read error -> 500 before "forbidden"). Same answers in every case.
  officer-guard.ts, posts/route.ts, [slug]/route.ts PATCH+DELETE now call officerGate. channels/** import officer-guard only
  (unchanged). hasBlockedNewLinkLabel moved to club-routes/link-labels.ts (+ its 2 tests to link-labels.test.ts).
  gate.ts + gate.test.ts were untracked; MOVED (not rm'd) to handoffs/wave-plan-sec2/archive-I1/*.txt. 4 cases added to
  hidden-gate.test.ts. 19/19 (hidden-gate + club-routes tests).
- DONE campus-home requests panel: RequestRow + removed_before/can_approve; "Removed before" pill (var(--tag-bg) + var(--coral):
  the settings modal is always dark and Light --tag-ink is ~3:1 on it); Approve hidden when can_approve === false (Deny kept;
  the ineligible label still shows first); refusals: orgErrorCopy(code) -> 404 uses vibeRequest's "That's no longer available."
  -> else server error string.
- PHONE: no separate requests panel on the phone (CampusMobile/components/mobile have none). The phone + org page reach requests
  through OrgInviteSheet (src/components/orgs/OrgInviteSheet.tsx, "requested" rows with Approve, NOT MINE): it has no
  removed_before/can_approve (invite-candidates doesn't send them), so a mod sees Approve on a removed person's request; the
  403 removed_needs_admin / 409 approve_unavailable toasts are human (describeFailure passes human 403/409 sentences; 404 ->
  "That's no longer available."). Follow-up for its owner: send removed_before/can_approve from invite-candidates + hide Approve.
- tsc --noEmit -p . exit 0 (whole tree). eslint on my files: 0 errors (campus-home: 6 pre-existing warnings elsewhere).
- LOCAL PROBES (dev server on localhost:3000 = local stack): anon GET /api/orgs/test_invite_club/profile with a seeded REMOVED
  and a seeded DRAFT club post: only the real post returned (old code returned every org_id row). Club page HTML same. Probe rows
  deleted, org last_activity_at restored. Hidden club / missing handle -> 404; open club 200. No signed-in walk (no session).
- FINAL: node --test src/lib/club-routes/*.test.ts src/lib/orgs/*.test.ts 171/171. npm test 1145, 1144 pass, only the known
  src/lib/otto/parse-reminder.test.ts fails. tsc exit 0. Nothing committed/pushed; no prod access. DONE (2026-09-28).
