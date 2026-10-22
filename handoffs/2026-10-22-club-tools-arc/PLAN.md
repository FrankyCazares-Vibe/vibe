# Club tools Arc + joining made clear (Oct 22, 2026)

Franky, Oct 21-22: likes the **Arc** mockup best (canvas https://claude.ai/artifact/Aoee3QoLVqJ92Gts9Vuf6f,
board `FloatArc.dc.html`, source in the session scratchpad `tools-board/project/FloatArc.dc.html`): the little
planet on the right edge, the tools floating out of it in an arc, names on hover, a card per tool. He doesn't
want people to confuse following with asking to join. "Fix everything else while you're at it": the gaps found
in the join map (below). And: "why is the banner small".

Branch `claude/club-page-in-shell-0b76e3`, after `dfadf94` (the slide-out panel, which this replaces).

## Decisions (mine, Franky to see in the handoff)
1. **Arc replaces the slide-out panel** on a computer in the app frame, officers only. Handle = the little planet
   (half tucked into the right edge, coral count), shown from 1024px; the cover's Club tools button opens the
   launcher from 900px; under 900px and on phones nothing changes.
2. **Following and joining are two separate things on the club page.** The button row keeps Follow (Following ✓)
   and Share. Joining moves into its own small "Membership" box under the row, for anyone who isn't a member:
   one plain line for the state, one action. Members and officers see no box.
3. **A declined request waits 14 days** before the student can ask again (same as a declined invite). The box
   says so honestly: "Not this time. You can ask again on <date>."
4. **A student can cancel a pending request.** Cancelling also drops a follow that the request made (source
   `request`), never one they made themselves.
5. **Officers get a notification when someone asks to join** (new type `org_join_request`). The type needs a
   database change: the migration file is written and committed but NOT applied (Franky's yes first); until then
   the insert fails its check and the code logs and carries on.
6. **Followers can be invited from the Followers card and the phone's Followers screen** (the invite system
   exists: `POST /api/orgs/[slug]/invites`, `GET invite-candidates?source=followers`).
7. **The cover is wider on a computer**: in the frame, from 900px, it spans the middle column up to 1100px; the
   text column stays 760.
8. **Events visibility (fraternities)**: not built. Recommendation for Franky: two choices per event, Everyone
   (default) or Members only; chats stay members-only; the Board keeps its followers switch; no "followers only"
   tier (anyone can follow, so it would be public in all but name). Needs a database column: his call.

## Batches (file ownership is strict: never edit a file another batch owns; nobody but the lead edits
`src/app/orgs/[handle]/page.tsx`)

### B1 · Arc launcher (computer)
Owns: `src/app/orgs/[handle]/club-page/ClubToolsDrawer.tsx`, `ClubToolsPanel.tsx`, `GalaxyBackdrop.tsx`,
`club-tools-drawer.ts` (replace or delete), new `src/app/orgs/[handle]/club-page/ClubToolsLauncher*.tsx` /
`club-tools-*.ts` files, `src/app/orgs/[handle]/club-page/OfficerActions.tsx` (only the cover button's open
hook), and in `src/app/globals.css` ONLY the block that starts `/* Club tools on a computer (ClubToolsDrawer.tsx`
through the end of the `prefers-reduced-motion` block after it.
Build `ClubToolsLauncher` (client) with props
`{ handle: string; orgId: string; orgName: string; verified: boolean; hidden: boolean;
joinPolicy: JoinPolicy; audience: OrgAudience; counts: { requests: number | null; members: number | null;
followers: number | null } }`. Seven bubbles in the Arc's order and geometry (Invite and share, Members,
Followers, Join requests (bigger, coral, in the middle), Officers and titles, Past events, Club settings). Names
appear on hover and on keyboard focus. A click opens that tool's card beside the arc; another bubble swaps it;
the planet, ×, Escape, a click outside, a route change or a window under 900px close it. Cards use REAL data
and actions from existing routes, each with a link to the full tools page:
- Join requests: `GET /api/orgs/[slug]/requests` → rows with Approve / Decline (`POST .../requests/[id]`),
  honouring `eligible`, `can_approve`, the "Removed before" tag; empty state "No one is waiting".
- Members: `GET /api/orgs/[slug]/members` (first 5, role/title chips) + "See all members".
- Followers: `GET /api/orgs/[slug]/invite-candidates?source=followers` (first 6) with "Invite to join" per
  person (`POST /api/orgs/[slug]/invites` `{user_id}`; states invited / requested / declined_recently /
  cap reached / ineligible shown as the sheet shows them; unverified or hidden club: no Invite, one line why)
  + "See all followers".
- Officers and titles: owner/admins and titled members from the members read + "Change roles and titles".
- Past events: a short line and "Open past events and who came" (`/orgs/<h>?tab=events`).
- Club settings: who can join and who it's open to (from props, the copy in join-copy.ts) + "Open Club settings".
- Invite and share: Share the club page (`shareClubPage`), Invite members (opens `OrgInviteSheet`), Members' link
  (`/orgs/<h>/setup#members-link`, verified clubs only).
Motion: Motion (`motion/react`) springs from `src/lib/motion/springs.ts` only, transform and opacity only, no blur;
bubbles spring out of the planet with a stagger, idle bob ±3px (CSS loop behind prefers-reduced-motion), card
springs in from the arc; reduced motion = fades (MotionRoot). Modal: `role="dialog"`, `aria-modal`, the
`data-hides-otto` attribute until it has gone, focus in on open and back on close, Tab kept inside, clicks ignored
until the entrance settles (the double-click lesson), reopening while closing refocuses. Keep the
`openClubToolsDrawer`-style hook for the cover button (rename if you like; update OfficerActions).

### B2 · Joining made clear (all widths)
Owns: `src/lib/orgs/join-state.ts` (+ its test), `src/lib/orgs/join-copy.ts` (+ its test),
`src/lib/orgs/membership.ts`, `src/components/orgs/OrgJoinControl.tsx`, `src/app/orgs/[handle]/join-button.tsx`,
new `src/app/orgs/[handle]/club-page/MembershipBox.tsx`, `src/app/api/orgs/[slug]/join/route.ts`,
`src/app/api/orgs/[slug]/requests/[id]/route.ts` (only the stale comment at lines ~61-66),
`src/lib/limits/budgets.ts` (only a new budget if cancel needs one), and every other caller of `orgJoinState`
/ `orgHeaderView` that must handle a new state (Discover and Orgs-tab cards) — list them in your summary.
- New state `declined` (a denied request resolved in the last 14 days): `loadViewerOrgContext` reads the latest
  denied request (`org_join_requests.resolved_at`); `orgJoinState` returns it before `can_request`; the join
  route refuses a request in that window (409 `recently_declined` with the date). Invites still work.
- Cancel: `DELETE /api/orgs/[slug]/join` deletes the viewer's pending request and a follow whose `source` is
  `request`; rate limited; returns the new state.
- Officer notification: after a request is filed, insert `notifications` rows `type: 'org_join_request'`,
  `user_id` = each owner/admin (not the requester, not anyone in a block pair with the requester),
  `actor_id` = requester, `org_id`. A check-constraint failure (23514, the migration not yet applied) is logged
  once and ignored; the request still succeeds. Push goes the way `org_invite` goes (B3 renders it).
- The club page split: `join-button.tsx` keeps only Follow / Following ✓ (members: one "Member ✓" control that
  keeps today's member actions, e.g. leaving) in the button row; `MembershipBox` (props: the page's
  `relation` + invite info) shows, for non-members: can_join "Anyone at <audience> can join." [Join];
  can_request (policy or removed) "Officers approve new members. Asking also follows the club." [Request to
  join]; visiting "You're visiting from another campus, so officers approve." [Request to join]; requested
  "Request sent. An officer will look at it." [Cancel request]; declined "Not this time. You can ask again on
  <Mon D>."; invite_only "Invite only. Officers invite members."; invited "<Inviter> invited you to join."
  [Accept] [Decline] (fold the invite banner in, or keep it, your call, but no duplicate buttons);
  audience_blocked "Only <IU|Purdue> students can join."; unverified "Verify your school email to join."
  [Verify]; signed out "Sign in to follow or join." [Sign in]. Theme tokens (the page is a night island).
  Copy lives in join-copy.ts with tests. Export both pieces; the lead wires them into page.tsx.

### B3 · Followers invites + the new notification
Owns: `src/components/orgs/tools/FollowersScreen.tsx`, `src/app/api/orgs/[slug]/followers/route.ts` (only if
you add invite state to its rows), `src/components/network/OttoSidePanel.tsx` and
`src/components/otto/OttoActivity.tsx` (only the rows for the new type), `src/lib/push/payload.ts`,
`src/lib/push/dispatch.ts`, `src/lib/orgs/notification-orgs.ts`, `src/app/api/me/otto/route.ts`,
`src/components/settings/notifications-card-view.ts`, their tests, and a NEW migration
`supabase/migrations/20261024100000_org_join_request_notification.sql` (adds `'org_join_request'` to
`notifications_type_check`, keeping every existing value; body between begin/commit; NOT applied anywhere).
- Followers screen: "Invite" on each non-member row with the same states as the sheet, and a header "Invite
  followers" that opens `OrgInviteSheet`.
- `org_join_request` renders as "<name> asked to join <club>" linking to `/orgs/<h>/tools/requests`, in Otto
  and the activity list; push text the same; it follows the same push preference as `org_invite` unless a
  better existing kind fits (say which).

## Lead (after the batches)
page.tsx wiring (launcher instead of the drawer; the Membership box under the button row), the wider cover,
whole-diff review, the walk, tsc / tests / eslint, the handoff, commit, push. The migration and the events
visibility call go to Franky.
