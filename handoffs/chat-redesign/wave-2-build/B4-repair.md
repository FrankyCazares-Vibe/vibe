# W2-B4 repair record (one pass after the three reviews)

Repairer: Claude (cloud session, no database, no browser). Branch `claude/relaxed-davinci-9d11h3`, start HEAD
377ae3c; the code commit is 580fff3 (`fix(chat): W2-B4 repair after review`). Reviews read:
`B4-review-contract.md`, `B4-review-security.md`, `B4-review-behaviour.md`. Every finding was verified against the
tree and the contract before it was acted on.

Ownership note: the brief names the three route files; `src/lib/chat/reads.ts`, `reads.test.ts` and
`reads-routes.test.ts` are B4's own files (created by 35554ab / 208effe, no other author, `git log --all` on them;
13.3 gives every batch its `src/**/*.test.ts`), so the repair edits them too. No sibling file was touched.

## Findings

| finding | severity | outcome | one line |
|---|---|---|---|
| B4-BEHAVIOUR-1 | MEDIUM | **FIXED** | `space/route.ts:244-245,255`: an event room's `state` / `starts_at` come from its `EventRef`, else from the event row the route already read (`roomState(starts_at, ends_at, now)`, pure); `reads.ts:201,206`: `orderSpaceRooms` filters on `state === "closed"` and sorts by `starts_at` (null last). A room whose event row was not read either stays as built (kept, unknown state, after the dated ones). Tests: `reads-routes.test.ts:540-556` (no refs with far dates: the 2020 room out, the 2099 room kept without its ref; no refs AND no rows: both kept by name), `reads.test.ts:182-183` (two row-only event rooms in the pure order case). |
| B4-BEHAVIOUR-2 | LOW | **FIXED** | `reads-routes.test.ts:382-385`: the service `org_members` read failing alone (cookie reads fine) → 200 and `clubs[1].board.latest.id === "m-b1-old"` (the blocked admin's row stays hidden, the next row is the preview). The route already behaved so (`inbox/route.ts:182-192`); the case is now asserted. |
| B4-SECURITY-2 | LOW | **FIXED** | `calendar/route.ts:123-128`: `try { refs = await eventRefsFor(...) } catch (err) { refs = null; console.error(...) }`; the existing null log line kept. A throw now answers the three nulls and 200 (7.3: the calendar never answers 500 for them). |
| B4-CONTRACT-1 | LOW | **REJECTED** | Section 7's 500 rule is for "a failed cookie read that decides visibility"; the two preview windows decide a preview text, not whether a club or a row is shown (RLS and the block set do), and 7.1.4 itself names the pattern they copy, `me/threads/route.ts:682` ("Soft-fail: still render the list without previews"). A failed window shows less, never more. Steps 1-3 do 500. No change; recorded for the integration review as the reviewer asked. |
| B4-CONTRACT-2 | LOW | **REJECTED** | 7.2.3 says nothing of a failed my-rows read; it decides a dot (`unread`), not visibility, and the rule for "no row" is `unread: false`. A failure hides dots, never rooms or text. The reviewer's own fix line reads "none required". No change. |
| B4-CONTRACT-3 / B4-SECURITY-3 | LOW | **DEFERRED** | `reads.ts` + the two tests outside 13.2's W2-B4 row: the row is the contract's and the integration review's to amend (a contract change; under STOPPED in the notes). No code change; the files are B4's alone. |
| B4-SECURITY-1 / B4-BEHAVIOUR-3 | LOW | **DEFERRED** | The viewer's OWN removed row can be `board.latest` / `lounge.latest` / `board_latest` (RLS shows a member their own removed rows; 7.1.4 pins the window as `thread_root_id is null` only; 7.2.4 takes "the last message that is not `hidden`"). A batch may not add a filter to a pinned read. Nobody else's removed row can reach a preview. For the integration review (under STOPPED in the notes): `.is("removed_at", null)` on the two preview windows and the event-activity read, and `!hidden && removed === null` in `lastShown`, if wanted. |

## Gates (13.3), re-run after the code commit

| gate | command | result |
|---|---|---|
| typecheck (repo-wide) | `npm run typecheck` | exit 0 |
| tests (all) | `npm test` | 1575 tests, 1575 pass, 0 fail (`reads.test.ts` 9, `reads-routes.test.ts` 12 among them; the siblings' repair tests added since B4-gate.md) |
| build | `npm run build` | exit 0; `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar` in the manifest (ƒ Dynamic); one run, no collision |
| eslint (B4 files) | `npx eslint src/lib/chat/reads.ts src/lib/chat/reads.test.ts src/lib/chat/reads-routes.test.ts src/app/api/me/inbox/route.ts "src/app/api/orgs/[slug]/space/route.ts" src/app/api/me/calendar/route.ts` | exit 0, 0 problems |
| batch's own | `node --test src/lib/chat/reads.test.ts src/lib/chat/reads-routes.test.ts` | 21/21 |

SIBLING: none (every gate green with the siblings' files in the tree).
