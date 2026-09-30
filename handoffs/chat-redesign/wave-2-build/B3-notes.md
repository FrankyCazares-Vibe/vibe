# W2-B3 notes (the remove route, `RemovedContentCard.by`, the by-name guard, the 12.1 stub filters, the 12.4 preview hunk)

Branch `claude/relaxed-davinci-9d11h3`, started at HEAD 0a43db1 (B1 and B2's main commits on it; base of the wave is 75500e3).
Contract: `handoffs/chat-redesign/wave-2-contracts.md` 6.1, 6.2, 6.3, 8.3 (last three rows), 12.1, 12.4, 13.2, 13.3.

## Plan (before the first edit)

1. `src/app/api/me/threads/[id]/messages/[messageId]/route.ts` — 6.1's ten steps in order:
   auth 401 → non-uuid `[messageId]` 404 `not_found` → the cookie read scoped to `[id]` → the sender's own hard delete unchanged (`{ ok: true }`)
   → `ensureMember` (403/500 "Not a member") → dm/group 403 `not_allowed` → `rateLimit("message-remove:<uid>", 30/600)` → `requireNotRestricted`
   → `roomOf` (failed 503 `try_again`; null 404 `not_found`) → `clubRole` in `ROOM_MODERATOR_ROLES` else 403 `not_allowed`
   → no cookie row: service read `id, user_id, removed_at` → none 404 / `removed_at` set → `{ ok, removed, already }` / null 404
   → `outranks` else 403 `not_allowed` → open report (`reports` select id, `status = 'open'`, `.limit(1)`, missing `status` column → retry without it) → 409 `report_open`
   → service update `removed_at, removed_by, removed_reason = OFFICER_REMOVED_REASON` where `removed_at is null` selecting id → 0 rows `already` / else `{ ok: true, removed: true }`.
   Test: `route.test.ts` next to it — the decision table against fake cookie / service clients (the `message-read.test.ts` hook pattern; `next/server` → `next/server.js`, `@/lib/supabase/server`, `@/lib/rate-limit`, `@/lib/moderation/access`, `@/lib/messages/channel-access`, `@/lib/chat/message-read`, `@/lib/chat/rooms` faked through globals).
2. `RemovedContentCard` in `src/components/safety/ReportSheet.tsx`: `by?: "officer" | "moderator"` (default moderator); officer copy exact, no link, no email, no reason line.
3. `members/route.ts` POST: right after `requireChannelStaff`, `guard.channel.kind` in (board, lounge, event) → 409 `refusalBody("room_locked")`.
4. 12.1: `ConversationView.tsx` (`const shown = …filter(!m.hidden)`; map / `prev` read `shown`), `messages/types.ts` (`hidden?: boolean`), `messages.html` :2407 (`hidden: m.hidden === true` on the built object) and :1429 (`if (m.hidden) return;`), `_miniMessenger.js` :652 and :761 (same two lines), `campus-home.tsx` ChannelChat (the filter before `messages.map`, `prev` from the filtered array). Never a skip inside `MessageBubble`.
5. 12.4 in `threads/route.ts`: `loadHiddenUsers` moves above the `lastByChannel` fill; a club room's row whose `user_id` is in `hiddenRes.hidden.blocked` is skipped, so the newest visible row of the 5-row window wins; dms and groups untouched.
6. Gates: typecheck, `npm test`, build (once, when complete), eslint on the owned files (campus-home.tsx rule-by-rule against 75500e3), `B3-gate.md`.

Commit plan: (1) the remove route + test; (2) `RemovedContentCard.by`; (3) the by-name guard; (4) the 12.1 filters; (5) the 12.4 hunk; (6) notes + gate.

## Implementation notes (decisions a reviewer should see)

- 6.1 step 1b/2: a non-uuid `[id]` — the contract says the cookie read answers 0 rows; PostgREST answers `22P02` for a non-uuid in an `eq` on a uuid column, which today's code turns into a 500. To land on the contract's outcome (`ensureMember` → 403 "Not a member") the cookie read is skipped when `[id]` is not a uuid (`msg = null`), the same 0-row result with one fewer failing query. No name, code or sentence changed.
- 6.1 step 9: a failed `reports` read (not the missing-column case) is not in the contract; the route fails closed with 503 `try_again` (it never removes over an unread report; it never says `report_open` for a read that failed).
- 6.1 step 7 / 10: a service read or update that fails answers 503 `try_again`; `isMissingChatSchema` there cannot happen after step 5 (a room was found), so it is folded into the same 503.
- 12.1 `ConversationView`: `messages` is `MessageRow[] | null` state, so the const reads `(messages ?? []).filter((m) => !m.hidden)`; the JSX branch that maps is only reached with a non-null, non-empty array, so `shown` is exactly the filtered array there. The "Say hi" emptiness still reads `messages` (the old screens: "nothing else").
- 12.1 `campus-home.tsx`: the local `ChatMessage` type has no `hidden`; the filter widens the element type inline (`(m: ChatMessage & { hidden?: boolean })`) so the file gets exactly the one hunk the contract names.
- 12.4: no helper is exported from `threads/route.ts` (a non-handler export from a route file is a build error in Next 16), so the selection rule is documented as manual cases in `B3-gate.md`.

## Log
- Step 1 done: the remove route rewritten to 6.1's ten steps (187 lines); `src/lib/chat/remove-route.test.ts` (27 cases, the decision table against fakes; it lives under `src/lib/chat` because `node --test` reads a `[id]` path as a glob and never finds a test placed next to the route). typecheck 0 errors, eslint 0 on both, 27/27.
- Step 2 done: `RemovedContentCard.by` (default "moderator"); officer copy `Removed by a club officer.` / `Only you can see this message.`, no reason line, no email, no link; moderator branch byte-identical; the four callers untouched. eslint 0, typecheck 0.
