# W2-B3 gates

Files: `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`,
`src/lib/chat/remove-route.test.ts`, `src/components/safety/ReportSheet.tsx`
(`RemovedContentCard` only), `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts`
(6.3), `src/components/mobile/messages/ConversationView.tsx` (the filter hunk),
`src/components/mobile/messages/types.ts` (`hidden?`), `public/html/messages.html`
(two lines), `public/html/_miniMessenger.js` (two lines), `src/app/campus/campus-home.tsx`
(the ChannelChat filter), `src/app/api/me/threads/route.ts` (the 12.4 hunk).
Commits afa2646, 50f0074, 79e8e55, 305ae09, fc65be0 (+ this file's).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output (repo-wide, with B1 / B2 / B4's files in the tree; one transient error from a sibling's half-written file cleared on the re-run) |
| tests | `npm test` | 1511 tests, 1511 pass, 0 fail (1,475 after B2 + 27 of `remove-route.test.ts` + the siblings' new ones; one transient failure from a sibling's in-progress test file cleared on the re-run) |
| stub harness (13.3) | inside `npm test`: `src/lib/chat/remove-route.test.ts` (`node --test src/lib/chat/remove-route.test.ts`) | 27/27: the decision table of 6.1 against fake cookie / service clients and faked `ensureMember`, `roomOf`, `clubRole`, `rateLimit`, `requireNotRestricted` — 401; non-uuid `[messageId]` 404 `not_found` with no read; non-uuid `[id]` → `ensureMember` 403; the sender's hard delete `{ ok: true }` with no other gate; cookie read / delete failures 500; not a member; dm/group 403 `not_allowed` before the rate limit; `message-remove:<uid>` 30/600 → 429 after `ensureMember`; the restriction gate after it; `roomOf` failed 503 / null 404; member or gone 403 `not_allowed` before any service read; service not configured 503; the hidden-row read (none 404, removed `already`, live-but-unreadable 404, failed 503); the nine rank pairs; the open report 409 with the exact `openReportCount` shape and `limit 1`, the missing-`status` retry, a failed read 503 with no update; the update payload (`removed_by`, `removed_reason = OFFICER_REMOVED_REASON`, `removed_at` ISO, `.is("removed_at", null)`, `.select("id")`), 0 rows `already`, failure 503, never a delete; the gate order |
| build | `npm run build` | exit 0, first attempt (`/api/me/threads/[id]/messages/[messageId]` and `/api/orgs/[slug]/channels/[channelId]/members` in the manifest; no `server-only` reached a client file) |
| eslint | `npx eslint <the 9 lintable files above>` | exit 0; 0 errors, 10 warnings, all pre-existing (see the parity rows) |
| eslint parity, `campus-home.tsx` | `git show 75500e3:src/app/campus/campus-home.tsx \| npx eslint --stdin --stdin-filename src/app/campus/campus-home.tsx -f json` vs `npx eslint src/app/campus/campus-home.tsx -f json` | base: 0 errors, 6 warnings (`@next/next/no-location-assign-relative-destination` 4, `@typescript-eslint/no-unused-vars` 2); now: identical rule by rule |
| eslint parity, `_miniMessenger.js` | the same over `public/html/_miniMessenger.js` | base 0 errors / 4 warnings (`no-unused-vars`); now 0 / 4, the same four lines |
| `messages.html` | not lintable (inline script in HTML); the two lines read by eye: `hidden: m.hidden === true,` on the built object (`:2474`), `if (m.hidden) return;` first in `msgs.forEach` (`:1430`) | — |

Not run here (no database, 13.3): the route against Postgres (the Mac's step 2
rows: sender, mod, admin, owner, rank, open report, `already`, dm → `not_allowed`);
the flag-off browser walk of 13.3 step 4 for the four old renderers.

## 12.4 — the selection rule, manual cases (no helper: a non-handler export from a route file is a build error)

The fill walks `lastMsgs` (each read newest first, 5 rows per channel) and keeps the first row per channel; a club-room row whose author is in `hiddenRes.hidden.blocked` is skipped before that.

| window (newest first) for a club room | blocked | `last_message` |
|---|---|---|
| A, B, C | {} | A (as today) |
| A(blocked), B, C | {A's author} | B |
| A(blocked), B(blocked), C | {both} | C |
| A(blocked) … E(blocked), all five | {them} | null → the row reads "No messages yet" (accepted) |
| A by an officer on the Board, blocked | {the officer} | B (no Board exception in the old list) |
| A(blocked) in a dm or a group | {A's author} | A (untouched: the skip is guarded by `clubRoomIds.has(cid)`; a blocked dm peer still hides the whole 1:1 as before) |
| `unread` | — | follows the chosen row, as today (`last.user_id !== user.id` and newer than `last_read_at`) |
