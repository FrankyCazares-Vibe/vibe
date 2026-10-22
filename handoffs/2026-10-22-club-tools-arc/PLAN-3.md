# Part 3 (Oct 22, 2026): leaving a club takes you off its Members only events

Franky: "if it's a members only event and they leave, provide a popup warning about it being removed or
cancelled on your end. make club removals also remove rsvps."

## Facts (checked)
- Three leave UIs, all `DELETE /api/orgs/<handle>/join` (body `{keep_following}` or none; never
  `{cancel_request:true}`): (A) `src/components/orgs/OrgMenu.tsx` LeaveDialog (~219-303; club page ⋯ menu,
  phone and desktop; call ~137-156), (B) `src/components/orgs/tools/SettingsScreen.tsx` LeaveClub (~177-233;
  Club tools > Club settings, also in the computer's in-place panel), (C) `src/app/campus/campus-home.tsx`
  LeaveClubConfirm (~3623-3717; desktop org settings > Danger; it already fetches the club on mount ~3637).
- All leave copy is `ORG_COPY.menu` in `src/lib/orgs/join-copy.ts` (~336-363). join-copy.test.ts (~766-785)
  forbids leave literals in campus-home.tsx, so new copy lives in ORG_COPY.menu with tests.
- Removal (`src/app/api/orgs/[slug]/members/[userId]/route.ts` DELETE ~328-419) records `org_removals` BEFORE
  deleting (~376-393), so the DB trigger `org_members_drop_club_access`
  (`supabase/migrations/20260928100000_club_membership_rules.sql:288-327`) already drops the removed person's
  RSVPs to EVERY upcoming event of the club (any visibility). **Removals already remove RSVPs: nothing to build;
  add a test proving the record-first order if none exists, and correct the comment at
  members/[userId]/route.ts ~320 if it claims a voluntary leave drops RSVPs.**
- A voluntary leave keeps every RSVP today; members-only ones become invisible orphans.
- The leave route DELETE (`src/app/api/orgs/[slug]/join/route.ts` ~501-600): deletes the membership on the
  cookie client (~560-574); "The membership is gone" spot ~576; `service` client exists in the handler.

## Build (NO database change)
1. NEW `src/lib/orgs/leave-rsvps.ts` (server): `membersOnlyRsvpsOnLeave(client, orgId, userId)` → the user's RSVPs
   (status going/maybe) to the club's members-only events with `ends_at > now`, as
   `{ id, title, starts_at, viewer_status }[]` soonest first (embedded-filter read on rsvps with
   `event:events!inner(...)`, like /api/me/upcoming-events ~64-77); and `dropMembersOnlyRsvpsOnLeave(service,
   orgId, userId)` (two steps: the event ids, then delete the user's rsvps on them; returns the count;
   best-effort: logs, never throws). Unit tests with a fake client.
2. `GET /api/orgs/[slug]/join?leave_preview=1` in the same route file (it has no GET today): signed in (401
   otherwise); load the org on the service client; a hidden club is a 404 to a non-member (like DELETE); a
   non-member gets `{ ok: true, events: [] }`; a member gets `{ ok: true, events }` from the helper (service
   client, so the read can't be hidden by RLS). Rate-limit with the route's existing `org-join` budget or a
   cheap read budget from `src/lib/limits/budgets.ts` (say which).
3. DELETE (leave): after the membership delete has succeeded (count 1), call the drop helper on `service`; add
   `rsvps_dropped: number` to the success response. Never when the leave failed or for a non-member. Update the
   doc comments that say a leave keeps RSVPs (join/route.ts ~465-466; `src/lib/orgs/membership.ts` ~654). Leave
   the old migrations' headers alone (history).
4. The warning, in all three dialogs (A, B, C): on open, fetch the preview (quiet; a failure shows nothing extra;
   Leave stays usable while it loads). When it lists events, show a warning block above the buttons (theme
   tokens; the dialogs' danger tint): title `"You're going to {n} members-only {event|events}"`, body
   `"Leaving takes you off {it|them}: only members can go."`, and the list (title · short date in campus time, up
   to 3, then "and {n} more"). After a successful leave with `rsvps_dropped > 0`, the toast says
   `"You left {org}. You're off {n} members-only {event|events}."` (with the keep-following variant if that toast
   exists today). Copy in ORG_COPY.menu + a pure view helper (`leaveWarningView(events, timeZone)`) with tests.
   Keep OrgMenu's single `orgMenuItems({ signedIn: true, role: p.role, muted, readersOn })` call unchanged
   (follower-gates.test.ts reads it). OrgMenu is used on phones too: the block must fit 375px.
5. Tests: `src/lib/orgs/club-model-routes.test.ts` leave tests (~274-316): its fake's METHODS (~87) lacks
   `gt`/`gte`/`lte`, and `leaveWorld` throws on unexpected tables (~285): extend both; assert the RSVP delete runs
   on the service client AFTER `org_members:delete`, scoped to the user and the club's members-only upcoming
   events; not when the delete fails (~306-309) or for a non-member (~270). Add GET preview tests. join-copy tests
   for the new copy (and its existing guards: no "admin(s)", etc.). club-ladder.test.ts METHODS (~67) if needed.

Rules: theme tokens; no new motion beyond each dialog's own; tsc, `npm test` (all), eslint on touched files.
Never commit, stash or push; never touch any database (local or production); don't start a dev server.
