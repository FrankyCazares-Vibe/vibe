# Review P1: club posts window, pending invites, invite-sheet approve (2026-09-28)

VERDICT: ship

MUST-FIX: none.

## What I checked (read-only)
- `npx tsc --noEmit -p .`: exit 0.
- `node --test src/lib/club-routes/*.test.ts src/lib/orgs/*.test.ts`: 175/175 pass.
- eslint on club-posts-read.ts, invite-candidates, invites, OrgInviteSheet, club page, profile route: exit 0.
- Local DB (read-only): `posts.user_id` is NOT NULL uuid, so `not.in` can't drop author-less rows; `org_removals` has `org_id` and `user_id` (NOT NULL).

## Item 1: club posts, blocked authors excluded before the limit. CLOSED
- `readClubPostRows(service, orgId, select, excludeAuthors?)`: the 4th parameter is optional. The ids are passed through `isUuid`, lower-cased, de-duplicated and sorted, then `.notIn("user_id", …)` runs before `.order().limit(24)`. The `removed_at`-missing fallback `run(false)` keeps the exclusion.
- postgrest-js 2.105.1 `notIn` quotes reserved characters, and `isUuid` already strips anything odd.
- `readClubPostsForViewer` reads blocks first. If that read fails, it returns `{data:null, error:null}` and `blocked.ok=false`. Both callers use `blocked.ok` to show no posts: the page shows the failure line and the profile route returns `posts: []`. So an unknown block fails closed.
- Callers: the page's `Promise.all` entry and the profile route are the only importers. Both destructure `{posts, blocked}`. Both still pass `blockedAuthors.ids` to `visibleClubPosts` as a second check. The page uses `supabase` from `createSupabaseServerClient` (the viewer's cookie client), as `loadHiddenUsers` requires. A signed-out viewer has no blocks.
- The restricted-author filter is still applied after the read, as the task allowed.

## Item 2: invites GET leaves out invitees in hidden.blocked. CLOSED (by I2; no P1 edit)
- The GET handler applies `.notIn("invitee_id", blocked.filter(isUuid))` before `.limit(LIST_LIMIT)`. A failed blocks read returns 500 (fail closed). This matches the requests list, which also hides block-pair requesters either way.

## Item 3: invite-candidates plus OrgInviteSheet. CLOSED
- Requested rows now carry `removed_before` and `can_approve`.
- `can_approve = canApproveRequest(role, removedBefore) && !st.blocked.has(id)`. `st.blocked` comes from `inviteRefusedIds` (lower case): the requester blocked this officer, or anyone on the org side blocked the requester. That matches the approve route: a pair block with the approver gives 404, and `blockedByOfficer` gives 409 `approve_unavailable`. If the requester blocked a different officer, the row is not refused, which follows call 9.
- Id casing is consistent: `removedIdSet` and `inviteRefusedIds` both return lower case, and the route compares with `c.id.toLowerCase()`.
- `role` is `gate.role` from `requireInviteOfficer` and is passed through both modes.
- `loadRemovedUserIds` sends no query when the page has no pending requesters. A missing table counts as nobody removed. Any other error returns 500, like the requests list.
- The sheet's only consumer of this route is OrgInviteSheet.
  - It parses `can_approve` as a boolean, and anything else as null. Null means an older server, and Approve still shows.
  - When `can_approve === false`, the row shows a disabled status button, "Requested", with the sub-line "You can't approve this request right now." The line never names a block.
  - The status button has no click path, because the onClick only handles invite and approve.
  - If approve is refused with `removed_needs_admin` or `approve_unavailable`, the sheet shows the server's toast and sets `can_approve:false` on the row. A later page read overrides that because of the seq rule.
- Light/Night at 375px, checked by reading the code:
  - The tag gets all its colours from C0 tokens: a `--tag-bg` tint over `--paper`, `--tag-ink` text and a `--hairline` border. Ink and paper flip together, so the chip reads on the cream sheet in Night (dark chip, coral ink) and on the dark inline glass in Light (white chip, rust ink).
  - The row's text column has `flex:1; minWidth:0`. At 375 it is about 125px wide next to "Approve request", and the chip is about 100px, so it fits.
  - The builder's Playwright check at 375 in both themes and presentations agrees.

## Notes (not blocking)
1. `can_approve:false` doesn't show up in practice today:
   - Only owners and admins get past `requireInviteOfficer`, so `canApproveRequest` is true for them.
   - Block-refused requesters are dropped from both lists before `candidateView` runs.
   - So the false branch only appears after an approve refusal, or if mods are later added to INVITE_ROLES. That is fine as a second check.
2. There are no unit tests for the new logic:
   - `authorExclusionList` is private in a server-only module.
   - The `can_approve` fold is inside the route.
   - The builder's local probe (14/14) covered both. A pure helper plus a test would guard against regressions if either one grows.
3. `not.in` puts one uuid per blocked user into the URL. A viewer with a very large block list (hundreds) could exceed gateway URL limits. That would fail closed and show the failure line. `/api/feed` and the invites GET use the same pattern, so this is parity, not a new risk.
4. The chip is `white-space: nowrap`. Below about 330px wide it could overhang the text column. At 375 it is fine.
5. After a `removed_needs_admin` refusal, the row's sub-line is the generic "can't approve right now" and the toast carries the specific sentence. Keeping the sub-line generic is right: choosing the line by `removed_before` could mislabel an admin's block-refused row.
6. Leftovers the builder already flagged elsewhere:
   - The sheet has no Deny button, which was already true before this change.
   - The requests list's `can_approve` doesn't fold in officer blocks. That is owned by the requests route.
   - A removals read failure makes the whole picker return 500 instead of degrading. That matches the requests list.
