# W2-B3 review — lens: security

Reviewer of the six B3 commits (afa2646, 50f0074, 79e8e55, 305ae09, fc65be0, 98a61e5) on
`claude/relaxed-davinci-9d11h3`, read against `wave-2-contracts.md` 1.3, 6.1-6.3, 8.3, 12.1,
12.4, 13.2, 13.3, the RLS in `20260923090000_moderation_foundation.sql` (messages_select_*,
`removed_at is null or user_id = auth.uid()`), `messages_delete_own` (20260509100000),
`can_view_org_channel` as restated by migration A (`20261001100000:1319-1345`) and its two
check constraints `channels_open_rooms_public` / `channels_closed_rooms_private` (`:836-838`),
`ensureMember` (`channel-access.ts:52-150`), `clubRole` / `loadRoom` (`rooms.ts`), `roomOf`
(`message-read.ts:755-762`), `asStub` (`stub.ts:57-80`), `loadHiddenUsers` (`hidden-users.ts`).
Method: refute every claim of the lens against the code, then re-run the cloud gates.

## Verdict

**PASS with three LOW notes.** No wrong answer, no leak, no gate red, no contract name, code,
sentence or column changed. Nobody removes what they cannot read: a non-member never reaches the
service role (step 3 stops them on the cookie client's own RLS), a plain member stops at step 6
before any service read, the service-role read and update are both scoped to `[id]`, the rank
rule is `outranks` with equal rank allowed, the open-report read precedes the update, the only
hard delete is the sender's own on the cookie client (RLS `messages_delete_own`), the two gates
are present with the contract's key and window, 404/403 answers leak nothing (the answer for a
room the caller cannot see is the same 403 "Not a member" as for a room that does not exist),
the by-name guard cannot be undone or bypassed through the DELETE (it only ever deletes
`org_channel_members`, which no Board, Lounge or event room reads), every old renderer drops
stubs before grouping while a stub carries no content in the first place, and the old inbox
never previews a blocked author in a club room. The three notes are documentation: one wrong
sentence in the gate record, one contract-inherited fail-open on a transient read that the
batch may not change, and one unreachable branch the notes should name so the Mac does not
look for it.

## Findings

### B3-SECURITY-1 — LOW — `handoffs/chat-redesign/wave-2-build/B3-gate.md:29` / `src/app/api/me/threads/route.ts:664-667`
**What.** The gate record describes the club-room read as "5 rows per channel". It is not:
`readLastMessages` runs ONE query over all club rooms (`.in("channel_id", ids)`), newest first,
`.limit(ids.length * 5)`. The window is shared, so a busy room (blocked authors or not) can
consume it and a quiet room's preview reads null — exactly as before B3, and the contract's own
words ("its 5-row window") describe the same read, so the code is right and only the record is
wrong. Security-wise the skip is still correct: a blocked author's row can never be chosen,
whatever the window holds. **Fix.** Reword the gate line to "one read over every club room,
newest first, limited to 5 × the number of club rooms; the first row kept per room whose author
is not in `hidden.blocked`". No code change.

### B3-SECURITY-2 — LOW — `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:154-155` (with `src/lib/chat/rooms.ts:339-348`)
**What.** `clubRole` answers `null` both for "no `org_members` row" (the author left) and for a
failed or thrown service read (`logFailureOnce`, then `null`). At step 8 a null author role is
rank 0, so a transient failure of the AUTHOR's read lets a mod pass `outranks` against an
owner's message (fail-open on rank); the CALLER's read at step 6 fails closed (null → 403). Not
exploitable from the outside (the two reads hit the same table with the same client a few
milliseconds apart, and the caller's read comes first), and the contract names `clubRole` for
both reads and pins "null when they left", so the batch may not change it. **Fix.** One line in
`B3-notes.md` under "Implementation notes" for the integration review and the after-launch list:
"`clubRole` reads a failed author-role read as rank 0; a `{ role, failed }` answer would close
it" — no code change in wave 2.

### B3-SECURITY-3 — LOW — `handoffs/chat-redesign/wave-2-build/B3-notes.md` (Implementation notes) / route `:131-149`
**What.** The branch "a live row the caller cannot read → 404" (`:149`) is unreachable in a
steady state: `ensureMember` reads `channels` on the cookie client, whose policy
`channels_select_org_member` is the same `can_view_org_channel(id, auth.uid())` predicate as
`messages_select_org_member`, so every caller the contract's parenthetical names ("a private
room they are not in; a mod and the Officers room") is answered at step 3 with 403 "Not a
member" and never reaches step 7. The branch is right to exist (defence in depth for a
membership that changes between the two reads, and it fails closed), the contract's rule is
implementable as written, and the builder was right not to STOP; but the Mac's HTTP rows
(13.3 step 2, "the remove route (... dm → not_allowed)") would look for a 404 that never comes
for "mod + Officers room". **Fix.** Add to `B3-notes.md`: "mod on the Officers room, or any
room the caller cannot view: 403 `Not a member` from `ensureMember` (same as a channel that does
not exist); the step-7 404 is reached only when the channel is readable and the live row is not
(a race)". No code change.

## Holds (each claim of the lens, refuted against the code; route lines are `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`)

**The remove route — who can remove what they cannot read**
- A NON-MEMBER (not in the club, or a private `room` / the Officers room / an event room they
  hold no row on): the cookie read `:72-84` is scoped to `[id]` and RLS (`messages_select_org_member`
  → `can_view_org_channel`) answers 0 rows; `ensureMember` `:102-105` reads `channels` on the same
  client under the same predicate → `!channel` → 403 "Not a member" (`channel-access.ts:99`) or
  `canView !== true` → 403 (`:110`). The service client is not even constructed before step 6
  (`:125-129`). Holds.
- A MEMBER (role `member`): passes step 3, pays the rate limit and the restriction gate, `roomOf`,
  then `clubRole` → not in `ROOM_MODERATOR_ROLES` → 403 `not_allowed` at `:123`, before
  `createSupabaseServiceClient` (`:129`). Test "6: a member, or someone who left" asserts exactly
  one query (the cookie read). Holds.
- A MOD and the Officers room: `channels_closed_rooms_private` forces `is_private = true`;
  `can_view_org_channel` for a mod then needs an `org_channel_members` row; without one step 3
  answers 403 "Not a member" (see B3-SECURITY-3); with one the mod can read the room and may
  remove there subject to the rank rule (never an owner's or admin's message). Holds.
- The cookie lookup comes first (`:72-84`, scoped to `[id]` by `.eq("channel_id", channelId)`);
  the service-role fallback (`:135-150`) runs only after `ensureMember` (`:102`), the two gates
  (`:110-113`), `roomOf` (`:117-119`) and the role check (`:123`); it selects only
  `id, user_id, removed_at` and is scoped to `[id]` too, so a message id from another room
  answers 404 (`:147`) and reveals nothing. Holds.
- Non-uuid ids: `[messageId]` → 404 `not_found` after auth and before any read (`:65`; test
  "1b"); `[id]` → the cookie read is skipped (`:72`) and `ensureMember` answers 403 for a
  non-uuid (`channel-access.ts:59`) — the contract's stated outcome, one failing 22P02 query
  fewer (the builder's note is right: PostgREST answers 22P02, not 0 rows, for a non-uuid in an
  `eq` on a uuid column). Fail-closed either way. Holds.

**Rank rule.** `outranks(callerRole, authorRole)` at `:154-155`: `rank(caller) >= 1` and
`rank(caller) >= rank(author)` (`room-rules.ts:52-71`); owner 3, admin 2, mod 1, member / gone
/ unknown 0; equal rank allowed. The role check (`:123`) runs before the rank (14.10). The author
role is read for the channel's own club (`member.orgId`, `:154`), never a role from another club.
Test "8" walks the nine pairs. Holds (B3-SECURITY-2 is the transient-read note).

**`report_open` before the update.** `:159-171` runs before `:175-186`; the read is the
`openReportCount` shape (`reports/route.ts:443-450`: `target_type = 'message'`, `target_id`,
`status = 'open'`), `.limit(1)`, service role; a missing `status` column (`42703` naming
`status`, `isMissingColumnError`) re-reads without it and treats every row as open; any other
error → 503 with no update (fails closed: never removes over a report it could not read, never
says `report_open` for a read that failed). Tests "9" ×3 assert the shape, the retry and "no
update". Holds.

**Never a hard delete by a non-sender.** The only `.delete()` in the file is `:89-93`, inside
`if (msg && msg.user_id === user.id)` (`:88`), on the cookie client, `.eq("user_id", user.id)`,
under RLS `messages_delete_own` (`auth.uid() = user_id`). Every other path ends in `update`
(`:175-181`) with `.is("removed_at", null)`, `removed_by = user.id`, `removed_reason =
OFFICER_REMOVED_REASON`; 0 rows → `already`. No `moderation_actions` write, no report touched.
Test "10" asserts "never a hard delete" (0 delete queries on the officer path). Holds.

**The sender path keeps today's delete.** `:88-99` is the old route's `:50-59` verbatim (lookup
`id, user_id, channel_id` scoped to `[id]`; delete by `id` + `user_id`; `{ ok: true }`; 500
"Request failed" on error), reached before the rate limit and the restriction gate as 6.1 step 4
says on purpose; a sender in a dm, a group, a club room, of a card, or of an already-removed
row (RLS shows the sender their own removed row) takes it unchanged. Holds.

**Rate limit and restriction gates.** `rateLimit("message-remove:<uid>", { limit: 30,
windowSec: 600 })` → `tooManyRequests(rl)` (`:110-111`), then `requireNotRestricted(user.id)`
(`:112-113`); both after `ensureMember` and the dm/group refusal, before `roomOf`. Test "4" ×2
asserts the key, the options and the order. `failClosed` is not set, as in every chat route
(only the school-email code route sets it). Holds.

**404 vs 403 — no information leak.** A private room the caller is not in, a public room of a
club they are not a member of, a hidden club's room, a channel that does not exist and a
non-uuid `[id]` all answer the same 403 `{ ok: false, error: "Not a member" }` from
`ensureMember` (the wave-1 answer of every thread route); a dm or a group the caller is in,
with or without a row, answers 403 `not_allowed`; a member of a club room answers 403
`not_allowed` for any id; only a mod or an officer of THAT room ever learns "no such message"
(404) or "removed already" (200 `already`), and only for the room they can read. The two 404s
of step 5 (no chat schema) and step 7 share the code `not_found`. Nothing distinguishes
"exists but hidden" from "does not exist" for anyone below mod of the room. Holds.

**Schema-missing / failure answers.** No chat schema: `ensureMember` falls back to the bare
read (`kind: null`), `roomOf` answers `{ room: null, failed: false }` → 404 `not_found` (`:119`),
before any service read. `roomOf` failed → 503 `try_again`; service not configured → 503
(`:125-128`); a failed service read / update → 503 (`:142-145`, `:182-185`); every failure
fails closed (nothing is removed, nothing is affirmed). Holds.

**The by-name guard (6.3) and its DELETE.** POST `members/route.ts:122-125`: right after
`requireChannelStaff` (restriction gate + `loadClubOfficer` with `channelId`, owner/admin of
THIS club, 404 for a stranger to a hidden club), `kind` in (board, lounge, event) → 409
`refusalBody("room_locked")`; `officers`, `room`, null as before. Bypass through the DELETE
(`members/[userId]/route.ts:33-37`): it deletes from `org_channel_members` only. A Board or a
Lounge is public by constraint (`channels_open_rooms_public`), and `can_view_org_channel`
answers `true` at `c.is_private = false` before it ever looks at `org_channel_members`; an
event room's arm reads `channel_members` (the RSVP roster), never `org_channel_members`. So a
row there is dead data on all three kinds: adding one grants nothing (the guard refuses it
anyway), deleting one revokes nothing. "Harmless" is verified. The channel PATCH refuses a new
`is_private` on a core room (`channels/[channelId]/route.ts:102`), so a Board cannot be turned
private to make the rows meaningful. Holds.

**The stub filters never render hidden content.** Server side, a stub is `asStub(row)`
(`stub.ts:57-80`): `content: ""`, `user_id: ""`, `users: null`, `card: null`, `reactions: []`,
`parent_preview: null` — there is no content in the row to leak, whatever a renderer does. On
top of that each of the four old renderers drops the row before grouping:
`ConversationView.tsx:548` (`const shown = (messages ?? []).filter((m) => !m.hidden)`) with
`shown.map` / `shown[i - 1]` at `:809-811`; `campus-home.tsx:16391-16392`
(`messages.filter(... !m.hidden).map((m, idx, shown)`, `prev` from `shown`);
`messages.html:2474` carries `hidden: m.hidden === true` onto the built object and `:1430`
`if (m.hidden) return;` first in `msgs.forEach`; `_miniMessenger.js:665` carries it and `:763`
skips it. The residual reads of the arrays (`ConversationView` "Say hi" emptiness `:794`, the
auto-scroll newest id `:212`; `ChannelChat` `messages.length === 0`; the mini messenger's
`state.msgs.find` for a reaction or a reply `:966`, `:1009`; `messages.html` reaction /
delete paths `:1859`, `:1877`, `:3304` re-render through `renderMsgs`, which skips) touch
`id`, `length` and `reactions` only, and a stub is never painted, so it has no button to start
them from. `MessageBubble.tsx` has no commit since the base (`git log 75500e3..HEAD` on it is
empty); its `RemovedContentCard` call (`:606`) passes no `by`, as 6.2 says. The other fetchers
of the thread GET (`ConversationActionSheet.tsx:188`, `GroupSettingsView.tsx:179`) read
`viewer_id` only; `SharePostSheet.tsx:188` and `profile.html:11063` POST. `CampusMobile.tsx`
mounts `ConversationView` (`:1043`) — no fifth renderer. Holds.

**`RemovedContentCard` (6.2).** `by?: "officer" | "moderator"` default `"moderator"`
(`ReportSheet.tsx:663`); officer: `Removed by a club officer.` / `Only you can see this
message.`, no reason line (`:698`), no email, no `/legal/community` link (`:708-711`); the
moderator branch is the old text byte for byte (`:713-718`); the six callers in the tree
(`PostViewerMobile.tsx:860,1298`, `MessageBubble.tsx:606`, `CampusMobile.tsx:1578`,
`campus-home.tsx:7704,9130`) pass no `by`. Holds.

**The old inbox preview (12.4).** `threads/route.ts:702-707` (`loadHiddenUsers`, failing closed
with 500 as before) now precedes the fill `:715-728`; `hidden.blocked` is a block in EITHER
direction (`hidden-users.ts:40-43`), not `ids` (blocked ∪ muted), as 8.3's last-but-two row
says; the skip `:718` is guarded by `clubRoomIds.has(cid)` so dms and groups are untouched and
the 1:1 block filter `:737-745` still runs on the chosen row; `unread`, the phantom-request
guard and the soft-hide reactivation follow the chosen row. A club room whose window is all
blocked → `last_message: null`. No Board exception (this list reads no roles). Holds
(B3-SECURITY-1 is the wording of the window).

**Ownership (13.2).** The six commits touch only the files 13.2 gives W2-B3 (`git show --stat`
each): the route, `remove-route.test.ts`, `RemovedContentCard` in `ReportSheet.tsx`, the
members POST, `ConversationView.tsx` (one hunk), `types.ts` (`hidden?`), the two static files
(two lines each), `campus-home.tsx` (the ChannelChat hunk), `threads/route.ts` (the 12.4 hunk),
and the B3 notes / gate. Nothing else. Holds.

## STOPPED / SIBLING — was the builder right?

- **STOPPED: "Nothing."** Right. The two mechanics it wrote under "Implementation notes"
  instead are not contradictions the contract's outcomes cannot survive: (a) the non-uuid `[id]`
  — the contract's "the cookie read answers 0 rows" is wrong about PostgREST (22P02, a 500 in
  today's code), but the outcome it pins (403 "Not a member" from `ensureMember`) is reached
  by skipping the read, with no name, code, sentence or order changed and fail-closed either
  way; (b) a failed `reports` read has no row in the contract and 503 `try_again` (the wave-1
  convention, never removing over an unread report) is the only safe answer. Neither needed a
  STOP; both are documented where a reviewer finds them. The one thing missing from the notes
  is B3-SECURITY-3 (the unreachable step-7 example), which is a documentation gap, not a
  contract contradiction.
- **SIBLING: "Nothing standing."** Right. The transient typecheck error and test failure it
  names came from W2-B4's half-written `reads.ts` / `reads.test.ts`; both are committed now
  (35554ab, 208effe) and the gates below are green on the tree as it stands.

## Gates re-run by this review (cloud, read-only)

| gate | command | result |
|---|---|---|
| stub harness | `node --test src/lib/chat/remove-route.test.ts` | 27 pass, 0 fail |
| eslint | `npx eslint` over the route, the test, the members POST, `ReportSheet.tsx`, `ConversationView.tsx`, `types.ts`, `threads/route.ts` | exit 0 |
| typecheck | `npm run typecheck` (repo-wide, with B1 / B2 / B4 committed) | exit 0 |
| build | not re-run (one build at a time; the builder's exit 0 at 98a61e5 stands) | — |

## Contract observations (not findings against B3; for the integration review)

1. 6.1 step 7's parenthetical ("a private room they are not in; a mod and the Officers room")
   describes callers step 3 already refuses with 403 "Not a member"; the rule of step 7 is
   still right as a race guard. The Mac's HTTP row for "mod + Officers room" should expect 403.
2. 12.4 / 8.3 call the club-room read "its 5-row window"; the read is one query over every
   club room limited to 5 × their count (today's code). The skip is correct under either
   reading; the wording matters only for the "none in the window → null" row on the Mac.
3. `clubRole` folds a failed read into "left" (B3-SECURITY-2); a post-launch `{ role, failed }`
   shape would let step 8 fail closed like step 6.
