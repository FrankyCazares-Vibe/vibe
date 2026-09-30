# W2-B3 repair after review (one pass)

Reviews read: `B3-review-contract.md` (4 findings), `B3-review-security.md` (3), `B3-review-behaviour.md` (1). Every finding was verified against the tree and `wave-2-contracts.md` before a verdict; none was rejected (each reviewer's reading of the code was right). One code change: a new test file. No route, component or static file changed.

| finding | severity | verdict | one line |
|---|---|---|---|
| B3-CONTRACT-1 | LOW | FIXED (docs) | the two contract-vs-code mechanics (the skipped cookie read for a non-uuid `[id]`; `(messages ?? [])` in `ConversationView`) moved from "Implementation notes" to "STOPPED" in `B3-notes.md`, worded "contract mechanism contradicts the code; built to the contract's stated outcome; for the integration review to ratify" |
| B3-CONTRACT-2 | MEDIUM | FIXED | `src/lib/chat/members-guard.test.ts` (16 cases): `board` / `lounge` / `event` → 409 with the exact `room_locked` body and no service read; the guard before the body parse; `officers` / `room` / null → today's path (the grant's three queries and the exact insert, the empty-body 400, the non-member 400); 401 and the restriction gate before the guard; `loadClubOfficer` !ok → its status; no channel → 404; the GET untouched |
| B3-CONTRACT-3 | LOW | DEFERRED | `clubRole` folds a failed author-role read into "left" (rank 0); `rooms.ts` is W2-B2 / wave 1's and the contract pins `clubRole` for step 8 — the request for a `{ role, failed }` answer is under REQUESTS in `B3-notes.md`; the same note as B3-SECURITY-2 |
| B3-CONTRACT-4 | LOW | DEFERRED | a contract wording gap (section 0 row 4 does not name the 403 "Not a member" a dm/group non-member now reads); recorded under STOPPED in `B3-notes.md` for the integration review; no code change |
| B3-SECURITY-1 | LOW | FIXED (docs) | `B3-gate.md`'s 12.4 sentence reworded: one read over every club room, newest first, `limit(ids.length * 5)`, a shared window; the first row kept per room whose author is not in `hidden.blocked` |
| B3-SECURITY-2 | LOW | FIXED (docs) / code DEFERRED | the line under "Implementation notes" in `B3-notes.md` (a failed author-role read ranks 0; a `{ role, failed }` answer would close it); the code change is B3-CONTRACT-3's deferral |
| B3-SECURITY-3 | LOW | FIXED (docs) | the line under "Implementation notes": mod + Officers room, or any room the caller cannot view → 403 `Not a member` from `ensureMember`; the step-7 404 is a race guard only; the Mac's HTTP row expects 403 |
| B3-BEHAVIOUR-1 | LOW | DEFERRED | verified real: `gc` tests `i > 0` on the unfiltered index in `messages.html:1440` / `_miniMessenger.js:771`, so a stub first in the page gives the first visible bubble the `gt` margin; the fix is a third changed line in each file, which 12.1 forbids ("two lines", "No other change to those files") — recorded under STOPPED for the integration review to amend 12.1 or accept the margin |

## Gates re-run after the repair (cloud, 13.3)

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output (repo-wide; B1's repair and B2's uncommitted working-tree edits present) |
| tests | `npm test` | 1575 tests, 1575 pass, 0 fail (`members-guard.test.ts` 16/16 and `remove-route.test.ts` 27/27 inside) |
| 6.3 harness | `node --test src/lib/chat/members-guard.test.ts` | 16 pass, 0 fail |
| build | `npm run build` | exit 0, first attempt; `/api/me/threads/[id]/messages/[messageId]` and `/api/orgs/[slug]/channels/[channelId]/members` in the manifest |
| eslint | `npx eslint <the 9 lintable B3 files + members-guard.test.ts>` | exit 0; 0 errors, 10 warnings, all pre-existing |
| eslint parity, `campus-home.tsx` | `git show 75500e3:… \| npx eslint --stdin --stdin-filename … -f json` vs the tree | base `no-location-assign-relative-destination` 4 W, `no-unused-vars` 2 W, 0 E = now |
| eslint parity, `_miniMessenger.js` | the same | base `no-unused-vars` 4 W, 0 E = now |

Files touched by the repair: `src/lib/chat/members-guard.test.ts` (new), `handoffs/chat-redesign/wave-2-build/B3-notes.md`, `B3-gate.md`, this file.
