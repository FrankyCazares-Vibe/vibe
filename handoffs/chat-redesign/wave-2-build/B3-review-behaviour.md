# W2-B3 review — lens "behaviour"

Reviewer of commits afa2646, 50f0074, 79e8e55, 305ae09, fc65be0, 98a61e5 (W2-B3) against
`wave-2-contracts.md` 6.1, 6.2, 6.3, 8.3, 12.1, 12.4, and the code of the four old renderers,
the old inbox read and the remove route. Method: refute the batch; re-run the gates.
Findings are appended below as they are confirmed; a "holds" list closes the file.

## Gates re-run by the reviewer (HEAD 28c9b4b: B3's six commits with B4's on top)

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output |
| tests | `npm test` | 1523 tests, 1523 pass, 0 fail (`src/lib/chat/remove-route.test.ts` 27/27 inside) |
| build | `npm run build` | exit 0, first attempt; `/api/me/threads/[id]/messages/[messageId]` in the route manifest |
| eslint | `npx eslint` over the 7 lintable B3 files other than `campus-home.tsx` | exit 0, no output |
| eslint parity | `git show 75500e3:src/app/campus/campus-home.tsx \| npx eslint --stdin --stdin-filename … -f json` vs the tree, tallied rule by rule | base `no-location-assign-relative-destination` 4 W, `no-unused-vars` 2 W, 0 E; now identical — PARITY OK |
| split-check | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | 51/51 declarations; missing 0 · changed 2 · added 0 · duplicate 0; CHANGED = `MessageRow` (the `hidden?` field) and `ConversationView` (the `shown` const) — exactly 12.1's two hunks; exits 1 by design when anything is CHANGED (reported, not gated) |

## Findings

### B3-BEHAVIOUR-1 — LOW — a stub first in the loaded page gives the first visible bubble a group-top margin in the two static renderers (index `i` is not renumbered by the early `return`)
- where: `public/html/messages.html:1440` (`const showAv=!mine&&(gb||i===0);const gc=gb&&i>0?' gt':'';`, inside `msgs.forEach((m,i)=>{ if (m.hidden) return; …`) and `public/html/_miniMessenger.js:771` (`const gc = gb && i > 0 ? " gt" : "";`, inside `state.msgs.forEach((m, i) => { if (m.hidden) return; …`)
- what: the 12.1 skip is the first statement of each `forEach`, so the date separator (`lastIsoForSep` only advances on visible rows), the sender run (`lastSenderId` / `lastSender` only advance on visible rows) and `last` are all right with the filtered sequence. But `i` is the index in the UNFILTERED array. `gc` adds `gt` (`.msg-row.gt{margin-top:24px}`, `messages.html:279`; `.vmm-msg.gt{margin-top:14px}`, `_miniMessenger.js:183`) on a sender break that is "not the first row", and it tests that with `i > 0`. When the oldest row of the page is a stub (or several are), the first visible row has `i >= 1`, `gb` is true (`lastSenderId` / `lastSender` start null and a real row's key is never null), so it gets the `gt` margin the un-stubbed first row never carries: one extra 24 px / 14 px above the first bubble of the page, under its date separator. `showAv` is not affected (`gb` is already true there). `campus-home.tsx` (`idx` and `shown` are the filtered array's, `:16391-16392`) and `ConversationView.tsx` (`i` indexes `shown`, `:809-811`) are right. Cosmetic, only when the page's oldest row is a stub, only in the desktop `messages.html` thread and the mini messenger; no wrong grouping, no wrong separator, nothing leaks.
- fix: replace the index test with "a visible row came before": `messages.html:1440` → `const showAv=!mine&&(gb||lastSenderId===null);const gc=gb&&lastSenderId!==null?' gt':'';` and `_miniMessenger.js:771` → `const gc = gb && lastSender !== null ? " gt" : "";`. This is a third changed line in each file, so it needs the integration review to amend 12.1's "two lines" for these two files (or to accept the margin); the builder was right not to add it on its own.

## Holds (each read against the contract and traced through the code)

**The remove route, 6.1 (`[messageId]/route.ts:49-187`)**
- The sender's own delete of a card: the cookie read (`:72-84`) finds their row, the hard delete runs as before (`:88-99`), `{ ok: true }`; no rate limit, no restriction gate, no role read (harness case "2: the sender's own row"). The cascade is the database's (6.1 step 2); nothing here changed for the sender.
- The "already" answers: a row the cookie client cannot see (the policy restated at `20260923090000_moderation_foundation.sql:2246`, `removed_at is null or user_id = auth.uid()`, hides another's removed row) reaches step 7's service read; `removed_at` set → `200 { ok: true, removed: true, already: true }` (`:148`); the race — a row live at step 2 and removed before step 10 — is the update's `.is("removed_at", null)` answering 0 rows → the same `already` (`:186`). Never a second mark, never a delete.
- A mod removing an owner's message: `outranks("mod", "owner")` is `1 >= 3` = false (`room-rules.ts:67-71`) → 403 `not_allowed` "You can't remove this message." (`:155`; harness pair `["mod","owner",403]`, `remove-route.test.ts:352`). Admin → owner 403, mod → admin 403, equal ranks and a departed author (null → 0) allowed; a member caller stops at step 6 before any service read.
- A dm or a group: `ensureMember` says `isOrgChannel: false` → 403 `not_allowed` before the rate limit (`:106`); a non-member of the dm → `ensureMember`'s 403 "Not a member"; the sender in a dm still hard-deletes their own row.
- Order: 1 auth · 1b non-uuid `[messageId]` 404 · 2 cookie read / own delete · 3 `ensureMember`, dm/group · 4 `rateLimit("message-remove:<uid>", 30/600)`, `requireNotRestricted` · 5 `roomOf` (503 / 404) · 6 `clubRole` in `ROOM_MODERATOR_ROLES` · 7 the service read for a hidden row · 8 `outranks` · 9 open `reports` (`.limit(1)`, missing `status` → retried without it) · 10 the marked update selecting `id`. The harness's "order of the gates" case pins it.
- The non-uuid `[id]`: the cookie read is skipped (`:72`), `ensureMember` answers 403 for a non-uuid channel (`channel-access.ts:59`) — the contract's stated outcome by a different mechanism (its "0 rows" would have been a 22P02 → 500 in the unchanged `lookupErr` branch). Right to build; see the judgement below.
- Every sentence goes through `refusalBody` (`types.ts:159`) from B2's rows (`:131-135`); the marker is `OFFICER_REMOVED_REASON` (`room-rules.ts:31`), so `removedInfo` reads `by: "officer"`.

**`RemovedContentCard`, 6.2 (`ReportSheet.tsx:663-720`)**: `by` defaults to `"moderator"`; the six callers (`PostViewerMobile.tsx:860, :1298`, `messages/MessageBubble.tsx:606`, `CampusMobile.tsx:1578`, `campus-home.tsx:7704, :9130`) pass no `by`, so every old surface keeps its exact copy; the officer branch shows `Removed by a club officer.` / `Only you can see this message.`, no reason (even when one is passed), no email, no link.

**The by-name guard, 6.3 (`members/route.ts:114-125`)**: after `requireChannelStaff`, before the body parse; `board` / `lounge` / `event` → 409 `room_locked`; `officers`, `room`, null → today's path; the DELETE untouched.

**The four old renderers, 12.1 — the filtered array, row by row**
- `ConversationView.tsx:548, :809-811`: no date separators here; `showGap = !prev || prev.user_id !== m.user_id` and `showSender` read `prev = shown[i - 1]`, so a stub between two rows by one person no longer splits their run, and the first visible row gets `topGap` 8 as the first row always did. The `messages === null` / `messages.length === 0` branches still read `messages` (a room of stubs renders an empty list, not "Say hi": 8.3 gives the "Say hi" rule to the NEW screens only; the old screens are "nothing else"). The scroll effect (`:211-219`) keys on `messages[messages.length - 1].id`, so a stub as the newest row changes the key, but it only sets `scrollTop = scrollHeight` when the reader is already at the bottom: no visible effect. `MessageBubble` reads no `hidden`; its hooks order is untouched.
- `campus-home.tsx:16391-16392` (`ChannelChat`): `.filter(...).map((m, idx, shown)` — `idx` and `shown` are the filtered array's, so `prev`, `sameAuthor`, `showDateSep = shouldShowChatSep(prev?.created_at, m.created_at)` and the paddingTop all read visible neighbours; a stub first on a day carries no separator (the first visible row of that day does, as before). No other index use in the map (`:16440-16560` reads none).
- `messages.html:1430` (`if (m.hidden) return;` first in `msgs.forEach`) and `:2474` (`hidden: m.hidden === true` on the built object; the field survives the map): the day separator (`lastIsoForSep`, `:1433-1436`), the sender run (`lastSenderId`, `last`, `:1526-1527`) and the removed notice only advance on visible rows; `lastSentIdx` walks `m.m === 1` rows (the viewer's own, never a stub); `sig` (`:1299-1304`) carries stub ids, so a new stub re-paints the bubbles once like any new row. Only `gc` is off (B3-BEHAVIOUR-1).
- `_miniMessenger.js:665, :763`: the same; `state.msgs.length === 0` "Say hi" still reads the unfiltered array (the same accepted rule); only `gc` is off (B3-BEHAVIOUR-1).

**The old inbox, 12.4 (`threads/route.ts:702-727`)**
- `loadHiddenUsers` (`hidden-users.ts:26-57`, `blocked` = either direction) now runs before the fill; a failed read still answers 500 (`:703-706`).
- The skip is `clubRoomIds.has(cid) && blockedPeerIds.has(m.user_id)` before the first-row-wins `set`, so a club room's `last_message` is the newest visible row of its own newest-first window (`readLastMessages`, `limit(ids.length * 5)`, `:646-687`); none → `null` → "No messages yet". No Board exception (no role read here).
- Dms and groups: the guard is `clubRoomIds.has`, so every row of theirs is kept, the 1:1 skip for a blocked peer (`:738-744`) and the group's "stay visible" rule are as before; the phantom-request guard (`:757-760`, never a club room) and the `hidden_at` reactivation (`:765-768`) read the chosen row for every kind.
- `unread` (`:771-774`) follows the chosen row: for a club room it is true when the newest VISIBLE row is by someone else and newer than `last_read_at`, never because of a stubbed row. `org`, `room_kind`, `can_post` and the event-room exclusion are untouched.

**Section 0 with the flag off**: rows 1, 4 and 5 are what B3 changed and nothing else on that surface: no copy, no other route answer, no screen.

## STOPPED / SIBLING judged

- "STOPPED: Nothing" — wrong in placement only, and the same call the contract lens made (B3-CONTRACT-1): the non-uuid `[id]` mechanism and the `messages ?? []` const are the two spots where the contract's wording contradicts the code; the builder resolved both to the contract's stated outcome (403 "Not a member"; the same filtered array) and wrote them under "Implementation notes". Building them was right; they should sit under "STOPPED" so the integration review ratifies them. No separate finding here (it would duplicate B3-CONTRACT-1).
- "SIBLING: nothing standing" — right: the transient `reads.ts` / `reads.test.ts` errors were B4's half-written files; at HEAD 28c9b4b typecheck is 0 and the tests are 1523/1523.

**Verdict: PASS with one LOW (B3-BEHAVIOUR-1: the `gt` margin off by one in the two static renderers when the page's oldest row is a stub; a one-token fix in each, which needs 12.1's "two lines" amended). Nothing off by one in `ChannelChat` or `ConversationView`; a stub first on a day carries no separator in any of the four; the old inbox's dms and groups and its `unread` are untouched; the sender's delete, the `already` answers and the mod-on-owner 403 all hold; every gate green.**
