# Notes P1 — club posts window, pending invites, invite-sheet approve (2026-09-28)

Owns: src/lib/club-routes/club-posts-read.ts, src/app/api/orgs/[slug]/invites/route.ts (GET only),
src/app/api/orgs/[slug]/invite-candidates/route.ts, src/components/orgs/OrgInviteSheet.tsx.

## Progress
- Started. Read crosscheck-waveA-2, waveA-build (calls 9-10, rulings 13-16), notes-I1, notes-I2, notes-A5a.
- Findings before edits:
  - invites GET: I2 already excludes hiddenRes.hidden.blocked (.notIn invitee_id, isUuid, before the limit; fails closed 500).
    Task 2 is already in place; verify only (and probe).
  - invite-candidates: officer-blocked / pair-blocked candidates are already DROPPED (standings.blocked = inviteRefusedIds, same
    set approve refuses: pair with approver 404 + any officer 409). Sheet viewer is always owner/admin (requireInviteOfficer =
    INVITE_ROLES) so canApproveRequest is true today; can_approve false only bites if INVITE_ROLES ever gains mod. Sending both
    anyway (belt and braces + "Removed before" is useful info).
  - OrgInviteSheet has NO Deny button (only Approve on requested rows). "keep Deny" = nothing to keep; when can_approve === false
    the row shows a disabled "Requested" status + generic "You can't approve this request right now." (ORG_COPY, never names a block).
  - posts.user_id NOT NULL (ON DELETE CASCADE) locally => `not.in` can't drop author-less rows.
  - Sheet surfaces are hard-coded (cream sheet/modal, dark glass inline), NOT Night-themed. Tag uses paper+tag-bg bg with tag-ink:
    ink and surface flip together, so it reads on any surface in Light and Night.
- DONE (1) club-posts-read.ts: readClubPostRows gains OPTIONAL 4th param excludeAuthors (.notIn user_id, isUuid-filtered, lower,
  sorted; signature compatible). New export readClubPostsForViewer(service, supabase, viewerId, orgId, select) -> {posts, blocked}:
  blocks first, then posts with exclusion; blocks fail -> no posts query. + type BlockedAuthorsResult. Restricted filter kept
  post-read (needs the rows' authors; not cheap to move in). Callers (page.tsx Promise.all entry, profile route) switched to it:
  same destructured names, rest untouched. visibleClubPosts still filters hiddenAuthors after (belt and braces). tsc exit 0.
- DONE (3a) invite-candidates: Standings.removedIds (loadRemovedUserIds over pending requesters only, after the Promise.all; skipped
  when none; error -> null -> 500 like the requests list). candidateView(+role): requested rows add removed_before +
  can_approve = canApproveRequest(role, removed) && !st.blocked.has(id). followersResponse gets role. GET docblock lists fields.
- DONE (3b) OrgInviteSheet: Candidate.removed_before/can_approve (null = older server -> Approve shows), RowPatch.can_approve,
  parse, rowOf merge; can_approve === false -> status "Requested" (ORG_COPY.buttons.requested) + sub
  ORG_COPY.errors.approveUnavailable; "Removed before" tag (ORG_COPY.meta.removedBefore) under the meta lines; approve() on
  removed_needs_admin / approve_unavailable toasts + patches can_approve false.
- tsc exit 0; eslint on the 5 touched files exit 0; node --test club-routes + orgs 175/175.
- Next: local probes (PostgREST chains) + 375px render check.
- PROBES (local; scratchpad p1/seed.sql, probe.mts, cleanup.sql): seeded 30 newer emery + 2 older avery club posts on
  test_invite_club, drew pending request + org_removals row. OLD chain: 24-row window all emery -> 0 visible for a viewer who
  blocked emery (the bug). NEW chain (.notIn user_id): emery gone in SQL, avery's 3 posts shown. Upper-case id excluded too.
  Picker removal chain: drew removed_before true; canApproveRequest owner/admin true, mod false. 14/14 PASS.
  Anon E2E on the dev server (localhost:3000 = local stack): profile route 200 with 12 posts, club page 200 (12 probe posts
  in HTML), invite-candidates + invites anon 401. Probe rows cleaned (0 left), org last_activity_at restored.
  No signed-in HTTP walk (would need a password sign-in; left for the orchestrator's browser walk).
- Next: 375px render check of the sheet via a bun-built harness with mocked fetch (no auth).
- 375px RENDER (scratchpad p1/entry.tsx + harness.html + shoot.mjs: bun-built real OrgInviteSheet, mocked fetch, globals.css C0
  token blocks; Playwright 375x812): sheet + inline, Light + Night. No horizontal overflow, no page errors. Removed-before tag
  fits under the meta lines beside "Approve request"; can_approve false rows show "Requested" + wrapped generic line; Approve on
  a removed_needs_admin refusal flips the row to "Requested". Night on the cream sheet: tag is a dark chip (legible; the sheet
  itself is not Night-themed, pre-existing).
- FINAL: tsc exit 0; node --test club-routes + orgs 175/175; npm test 1149, 1148 pass, only the known parse-reminder failure.
  Nothing committed/pushed; no prod access; local probe rows removed.

## Left for others
- invites GET (task 2) was already done by I2 (.notIn invitee_id over hidden.blocked, fails closed); no edit.
- OrgInviteSheet has no Deny; on the phone an officer still can't deny a request anywhere (pre-existing). Needs copy + a small
  button if wanted.
- requests/route.ts (campus-home panel): can_approve doesn't fold in "an officer blocked the requester" (approve then 409s
  approve_unavailable with a readable toast). One-line parity fix with loadOrgBlocks / a batch read, owner: requests route.
- Restricted club-post authors are still filtered after the read (can take window slots); moving it in needs a join or an
  RPC, not cheap.
- OrgInviteSheet surfaces (cream sheet/modal) are hard-coded, not Night-themed; the new tag is token-driven either way.
- Signed-in walk of the club page + sheet as owner/admin (needs a session) is the orchestrator's.
