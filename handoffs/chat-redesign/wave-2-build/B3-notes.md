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

- 6.1 step 9: a failed `reports` read (not the missing-column case) is not in the contract; the route fails closed with 503 `try_again` (it never removes over an unread report; it never says `report_open` for a read that failed).
- 6.1 step 7 / 10: a service read or update that fails answers 503 `try_again`; `isMissingChatSchema` there cannot happen after step 5 (a room was found), so it is folded into the same 503.
- 6.1 step 8 (B3-SECURITY-2 / B3-CONTRACT-3, contract-inherited): `clubRole` reads a failed author-role read as rank 0 (it answers null both for "left" and for a failed `org_members` read, `rooms.ts:339-348`), so on a transient failure of the AUTHOR's read `outranks` is fail-open on rank (the CALLER's read at step 6 fails closed: null → 403). Not exploitable from outside; the contract pins `clubRole` for both reads and "null when they left", and `rooms.ts` is not this batch's. A `{ role, failed }` answer would close it — see REQUESTS.
- 6.1 step 7 (B3-SECURITY-3): mod on the Officers room, or any room the caller cannot view: 403 `Not a member` from `ensureMember` (same as a channel that does not exist), because `channels_select_org_member` is the same `can_view_org_channel` predicate as `messages_select_org_member`; the step-7 404 ("a live row the caller cannot read") is reached only when the channel is readable and the live row is not (a race between the two reads). The Mac's HTTP row for "mod + Officers room" expects 403, not 404.
- 12.1 `campus-home.tsx`: the local `ChatMessage` type has no `hidden`; the filter widens the element type inline (`(m: ChatMessage & { hidden?: boolean })`) so the file gets exactly the one hunk the contract names.
- 12.4: no helper is exported from `threads/route.ts` (a non-handler export from a route file is a build error in Next 16), so the selection rule is documented as manual cases in `B3-gate.md`.

## Log
- Step 1 done: the remove route rewritten to 6.1's ten steps (187 lines); `src/lib/chat/remove-route.test.ts` (27 cases, the decision table against fakes; it lives under `src/lib/chat` because `node --test` reads a `[id]` path as a glob and never finds a test placed next to the route). typecheck 0 errors, eslint 0 on both, 27/27.
- Step 2 done: `RemovedContentCard.by` (default "moderator"); officer copy `Removed by a club officer.` / `Only you can see this message.`, no reason line, no email, no link; moderator branch byte-identical; the four callers untouched. eslint 0, typecheck 0.
- Step 3 done: the by-name guard in `members/route.ts` POST right after `requireChannelStaff` (`board` / `lounge` / `event` → 409 `refusalBody("room_locked")`; `officers`, `room`, null as today; the DELETE untouched). eslint 0, typecheck 0.
- Step 4 done: the 12.1 filters — `ConversationView.tsx` (`const shown = (messages ?? []).filter((m) => !m.hidden)` + `shown.map` + `shown[i - 1]`), `messages/types.ts` (`hidden?: boolean`), `messages.html` (`hidden: m.hidden === true` on the built object, `if (m.hidden) return;` first in `msgs.forEach`), `_miniMessenger.js` (the same two lines), `campus-home.tsx` (`messages.filter(...).map((m, idx, shown)` with `prev` from `shown`). No skip in `MessageBubble`. typecheck 0; eslint exit 0; campus-home.tsx warnings 6 = base 6 (4 no-location-assign-relative-destination, 2 no-unused-vars), errors 0 = 0; `_miniMessenger.js` warnings 4 = base 4.
- Step 5 done: 12.4 in `threads/route.ts` — `loadHiddenUsers` moved above the `lastByChannel` fill; a club room's row whose `user_id` is in `hiddenRes.hidden.blocked` is skipped (`continue`) so the newest visible row of the window wins, none → `last_message: null`; dms and groups untouched (the skip is guarded by `clubRoomIds.has(cid)`); `unread` follows the chosen row as today. typecheck 0, eslint 0.
- Gates run (13.3): typecheck 0; `npm test` 1511/1511; build exit 0 (first attempt); eslint exit 0 on the owned files with rule-by-rule parity for `campus-home.tsx` and `_miniMessenger.js`; `B3-gate.md` written.

## STOPPED

No name, code, sentence, status or column of the contract was changed. The four entries below are contract-level: two places where the contract's mechanism contradicts the code (built to the contract's stated outcome; for the integration review to ratify — moved here from "Implementation notes" after B3-CONTRACT-1), one wording gap and one amendment request.

1. Contract mechanism contradicts the code; built to the contract's stated outcome; for the integration review to ratify (6.1 step 1b/2):
   - 6.1 step 1b/2: a non-uuid `[id]` — the contract says the cookie read answers 0 rows; PostgREST answers `22P02` for a non-uuid in an `eq` on a uuid column, which today's code turns into a 500. To land on the contract's outcome (`ensureMember` → 403 "Not a member") the cookie read is skipped when `[id]` is not a uuid (`msg = null`), the same 0-row result with one fewer failing query. No name, code or sentence changed.
2. Contract mechanism contradicts the code; built to the contract's stated outcome; for the integration review to ratify (12.1, the pinned literal `const shown = messages.filter((m) => !m.hidden);` does not typecheck):
   - 12.1 `ConversationView`: `messages` is `MessageRow[] | null` state, so the const reads `(messages ?? []).filter((m) => !m.hidden)`; the JSX branch that maps is only reached with a non-null, non-empty array, so `shown` is exactly the filtered array there. The "Say hi" emptiness still reads `messages` (the old screens: "nothing else").
3. B3-CONTRACT-4 (wording gap, section 0 row 4 vs 6.1 step 3): with the flag off a caller who is NOT a member of a dm / group (RLS hides the row; today 404 "Message not found") now reads 403 "Not a member" from `ensureMember`, and so does a caller whose `[id]` cannot be read at all. Row 4 names only "a dm/group non-sender reads 403 `not_allowed`". The code is what 6.1 says; DEFERRED to the integration review: row 4 should gain "; a caller who is not a member of the dm / group reads 403 \"Not a member\" (was 404)". No code change.
4. B3-BEHAVIOUR-1 (cosmetic, needs 12.1 amended): in `messages.html:1440` (`const gc=gb&&i>0?' gt':'';`) and `_miniMessenger.js:771` (`const gc = gb && i > 0 ? " gt" : "";`) `i` indexes the UNFILTERED array, so when the page's oldest row is a stub the first visible bubble carries the `gt` group-top margin (24 px / 14 px) it never carries otherwise. Verified real. The fix is a third changed line in each file (`gb&&lastSenderId!==null` / `gb && lastSender !== null`), which 12.1 forbids ("two lines"; "No other change to those files"). DEFERRED: the integration review amends 12.1 to three lines for these two files or accepts the margin. `ChannelChat` and `ConversationView` index the filtered array and are right.

## SIBLING

Nothing standing. One transient typecheck error and one transient test failure came from a sibling's half-written `src/lib/chat/reads.ts` / `reads.test.ts` (W2-B4) and cleared on the re-run within a minute.

## REQUESTS

- To the integration review / the after-launch list (B3-CONTRACT-3 / B3-SECURITY-2; `src/lib/chat/rooms.ts`, not this batch's): give `clubRole` a `{ role, failed }` answer (or a sibling `clubRoleOrFailed`) so 6.1 step 8 can answer 503 `try_again` on a failed author-role read, the way step 5 does for `roomOf`. Until then a failed `org_members` read is logged once (`logFailureOnce`) and ranks the author 0 — accepted for v1 by both reviewers.

## Repair after review (one pass; the three reviews `B3-review-{contract,security,behaviour}.md`)

Plan: (1) verify each of the eight findings against the tree and the contract; (2) FIX B3-CONTRACT-2 (MEDIUM) with `src/lib/chat/members-guard.test.ts`, the 6.3 harness on the remove-route resolve-hook pattern; (3) FIX the documentation findings (B3-CONTRACT-1 placement, B3-SECURITY-1 gate wording, B3-SECURITY-2 / -3 notes lines); (4) DEFER B3-CONTRACT-3 / -4 and B3-BEHAVIOUR-1 (each needs `rooms.ts` or a contract amendment); (5) gates; (6) commit `fix(chat): W2-B3 repair after review`; (7) `B3-repair.md`.
- Repair step 1 done: the eight findings verified (all real as described; none rejected). B3-BEHAVIOUR-1 confirmed by reading `messages.html:1440` / `_miniMessenger.js:771` (`i` is the unfiltered index); B3-CONTRACT-2 confirmed (`grep -rn room_locked src --include=*.test.ts` names only `room-rules.test.ts`).
- Repair step 2 done: `src/lib/chat/members-guard.test.ts` (16 cases, the 6.3 decision table against a faked `loadClubOfficer` / `requireNotRestricted` / cookie client; `node --test` 16/16).
- Repair step 3 done: the two contradiction paragraphs moved under STOPPED (B3-CONTRACT-1), the SECURITY-2 and SECURITY-3 lines under Implementation notes, the CONTRACT-3 request under REQUESTS, the CONTRACT-4 and BEHAVIOUR-1 deferrals under STOPPED; `B3-gate.md` 12.4 window sentence reworded (B3-SECURITY-1) and the 6.3 harness row added.
- Repair gates: typecheck 0; `npm test` 1575/1575; build exit 0 (first attempt); eslint exit 0 on the owned files + the new test, parity held for `campus-home.tsx` (0 E / 6 W) and `_miniMessenger.js` (0 E / 4 W). `B3-repair.md` written. Committing `fix(chat): W2-B3 repair after review`.
