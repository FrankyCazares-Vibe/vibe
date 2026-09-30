# W2-S2 review — lens: security

Reviewed at head `e8435f9` (the S2 commits `3bf4695` … `94bcb1d`, diffed as
`git diff a9355d1 -- <S2 files>`), against the contract
(`wave-2-contracts.md` 1.2, 1.3, 2.3, 8.1, 8.3, 9.3, 10.2.5, 11.0, 11.3–11.6,
11.9.3, 13.2, 13.3), the notes (`S2-notes.md`), the gate (`S2-gate.md`) and the
code the screens call (`message-read.ts`, `messages/route.ts`,
`messages/[messageId]/route.ts` DELETE, `read/route.ts`, `orgs/[slug]/space/route.ts`,
`events/[id]/rsvp/route.ts`, `request.ts`, `send-failure.ts`, `LoadFailed.tsx`).
Read-only on the tree; this file is the only write.

Gates re-run here: `npm run typecheck` exit 0; `npm test` 1637/1637 (the
builder recorded 1614 at its time — S3 added tests since); `npx eslint` on
every S2 file + the two moved files exit 0, 0 problems; `git diff a9355d1` on
`MessageBubble.tsx` / `ReactionPicker.tsx` is the `onRemove` pass-through and
the `Remove` row only (10.2.5). `npm run build` was NOT re-run (it writes
`.next`; the builder's record says exit 0 on attempt 2 after a sibling's
collision).

## Verdict

PASS WITH FINDINGS. The lens's core rules hold (the "holds" list below). One
HIGH: on the Board the viewer's own removed post (and a removed reply in a
fold) still renders as a live post with its text, its replies toggle and the
reply field, instead of `RemovedContentCard` alone. Three MEDIUM around what
happens after access is lost (a hook that keeps polling a 403, a space that
stays rendered after its own "Members only." close, a Board fold timer that
keeps reading under the event layer). The rest is LOW.

## Findings

### S2-SECURITY-1 — HIGH — a removed Board post / reply is rendered in full
- where: `src/components/mobile/messages/club/BoardView.tsx:377-419`
  (`posts` filters `hidden` only; `BoardPost` gets a row with
  `removed !== null`); `src/components/mobile/messages/club/BoardPost.tsx:168,
  226-235` (`visibleReplies` filters `hidden` only and prints `m.content`).
- what: the thread GET keeps `content` on the viewer's OWN removed row
  (`message-read.ts:594, 671`: `removedInfo` is set, the text is not
  blanked; `types.ts:263-271`). `RoomThread.tsx:302-309` handles it
  (`RemovedContentCard by=…`, no long-press), the Board does not: the author
  of a post an officer removed still sees the post's byline, text, `N replies`
  toggle and the `Reply quietly` field; a reply under it answers 409
  `board_post_missing` (`rootState` checks `removed_at`,
  `message-read.ts:794`) → the toast and `onMissing` drops the post — the
  removal surfaces only through a failed reply. A removed own reply inside a
  fold prints `<b>Name</b> <text>` as if live. The lens rule "a removed row
  shows only `RemovedContentCard`" (1.2 "Removed message (own)", 11.5) is
  broken on the Board; the contract's 11.4 is silent on `removed`, 1.2 is
  not.
- fix: in `BoardView.tsx` inside `posts.map`, before `<BoardPost>`:
  `if (post.removed !== null) return <div key={post.id} style={{ maxWidth: "min(300px, 86%)", alignSelf: "flex-end" }}><RemovedContentCard kind="message" compact by={post.removed.by} removedAt={post.removed.at} removedReason={post.removed.reason} /></div>;`
  (no toggle, no field, no picker). In `BoardPost.tsx:168`:
  `const visibleReplies = (replies.rows ?? []).filter((m) => !m.hidden && m.removed === null);`
  (or render the compact card in the row's place); the "all stubs" fold rule
  (PRIVACY-L5) is unchanged by it.

### S2-SECURITY-2 — MEDIUM — the hook keeps polling a room it has lost
- where: `src/lib/chat/use-room-poll.ts:246-249, 216, 295-300`.
- what: once a tick answers 403/404 the hook sets `lostAccess: true` and
  keeps the 4-s interval running: every tick sends another `?after=` GET to
  a route that will refuse it again and `commit`s a fresh state object (a
  re-render every 4 s). `EventChat` closes on `lostAccess`, so there it is
  bounded; `ClubSpace` never reads `lostAccess` (it waits for its own 20-s
  space read, finding 3), so the Lounge under a space the viewer just lost
  polls a 403 five times before the space closes — and indefinitely when the
  space read answers a later 404 (finding 3). "A tick that fails is silent"
  (11.5) is about the screen, not a licence to keep asking a room that is
  gone.
- fix: in the interval callback (`:295`), before `run(...)`:
  `const cur = stateRef.current; if (cur.roomId === id && cur.lostAccess) { stop(); return; }`
  and in `readAfter` / `readFull` only commit `lostAccess: true` when
  `!stateRef.current.lostAccess` (no new object per tick). `reload()` (Retry)
  clears it as today through `readFull`'s success.

### S2-SECURITY-3 — MEDIUM — after the later 403 the space stays rendered; a later 404 is ignored
- where: `src/components/mobile/messages/club/ClubSpace.tsx:160-180` (the
  space read), `:222-226` (`closeEvent`), `:335-348` (the layer).
- what: (a) on a later 403 the effect toasts `Members only.` and calls
  `onClose()`, but leaves `space.data` in place: the rooms, the Board strip,
  the thread and the composer of a club the viewer is no longer in stay on
  screen until the parent unmounts the view. `MessagesMobile.closeLayer`
  (`:208-213`) is ONE `history.back()`: with the event chat layer open (a
  depth-2 entry) that pop lands on depth 1, `MessagesMobile`'s `popstate`
  ignores it (R1) and only the layer closes — the stale space stays mounted,
  the toast said "Members only.", and every send / vote from it is a
  request the server refuses (each toasted, none silent, but the screen is
  wrong). (b) `read()` sends the request before it checks `closedRef`, so the
  20-s timer keeps hitting `/space` for a 403 while the stale view lasts.
  (c) a later 404 (`not_found`: the club hidden or gone, the flag turned
  off) is not handled at all: no toast, no close, the stale space and the
  room's 4-s polling (finding 2) go on. 11.3 names only the 403 for the
  later read; a 404 after data is the same situation for the viewer.
- fix: in the read's failure branch, when `hadDataRef.current` and
  `!r.ok && (r.status === 403 || r.status === 404)`: set
  `setSpace({ data: null, failure: asLoadFailure(r, SPACE_LINE) })` (the
  `LoadFailed` is `retryable: false` for both, Back still works), set
  `setEventRoomId(null)` so the depth-2 entry is not what `history.back()`
  pops, THEN `toastSendFailure(r)` and `onCloseRef.current()`; and guard the
  request: `if (closedRef.current) return;` as the first line of `read()`.
  If the integration review wants the 404 silent, keep (a) and (b) alone.

### S2-SECURITY-4 — MEDIUM — the Board's fold timer reads under the event chat layer
- where: `src/components/mobile/messages/club/BoardView.tsx:338-344`;
  `src/components/mobile/messages/club/BoardPost.tsx:118-138`.
- what: the space pauses the room hook while the layer is open
  (`ClubSpace.tsx:150`, `enabled: eventRoomId === null`), but `BoardView`'s
  own 20-s `refreshToken` interval keeps ticking (it checks only
  `visibilityState`), so every open fold under the layer sends
  `?root=<id>&limit=200` every 20 s for a view nobody sees, on top of the
  layer's own polling. 11.4: "re-read on every 5th tick while open" — the
  tick the layer paused.
- fix: give `BoardView` an `enabled: boolean` prop (the space passes
  `eventRoomId === null`) and return early from the interval callback when
  it is false — or drop the timer and bump `refreshToken` from the hook's
  full reads (a counter on `RoomPoll`), so the folds follow the schedule
  that already pauses.

### S2-SECURITY-5 — LOW — a text Board post has no picker: no Remove, no Report
- where: `src/components/mobile/messages/club/BoardPost.tsx:192-198`
  (`onRemove` / `onReport` reach `CardBubble` only; a `kind === "text"` post
  is a plain `<p>`); `BoardView.tsx:409-414` builds both handlers for every
  post.
- what: an officer or a mod cannot remove a text Board post from the phone
  and a member cannot report one (the safety path 11.5 gives every text row
  in a thread). Not a leak — the server's gates are untouched — and 11.4
  lists the post's parts without a picker, so the contract is silent; noted
  for the integration review, which decides whether a Board post gets the
  500 ms press `CardBubble` has (11.8) or stays as drawn.
- fix (if wanted): a long-press on the `<article>` opening `ReactionPicker`
  with `onReport` / `onRemove` only (no emoji row: the Board has no
  reactions in the mockup), reusing `RemoveConfirm` as `BoardView` does for
  cards.

### S2-SECURITY-6 — LOW — an officer's event chip for a room they hold no row on is a dead end
- where: `src/components/mobile/messages/club/RoomChips.tsx:232-243`;
  `src/components/mobile/messages/club/ClubSpace.tsx:227-231`.
- what: the space route lists, for an officer, event rooms they hold no
  `channel_members` row on (`space/route.ts:147-148`, the RLS comment) with
  `event.room_id === null` (`event-refs.ts:223`, "when the viewer holds a
  row"). The chip opens the layer, whose first read answers 403 "Not a
  member" → `LoadFailed` (non-retryable, the mapped line), no composer.
  Nothing leaks and no request the server would accept is made from there;
  the tap is a dead end with a wrong line for an officer. `UpNext` already
  gates its taps on `room_id !== null` (`UpNext.tsx:102`).
- fix: in `RoomChips`, for `room.kind === "event"` with
  `room.event && room.event.room_id === null`, render the chip
  `aria-disabled` and make `onPick` a no-op (or leave the chip out); the
  integration review reads 7.2 for what the server means to list.

### S2-SECURITY-7 — LOW — `onOpenBoard` from the layer skips the room's `replaceState`
- where: `src/components/mobile/messages/club/ClubSpace.tsx:342-345`.
- what: the Board strip inside the event chat layer sets the Board as the
  picked room and pops the layer, but never `replaceRoomHistory(board.id)`:
  the depth-1 entry keeps the Lounge's id, so a reload of the URL reopens
  the Lounge and 2.3's "switching room chips is a `replaceState`" is missed
  for this one path. No security effect (an id the viewer may read either
  way); a state / URL mismatch.
- fix: in the `popstate` handler (`:208-216`), after `setEventRoomId(null)`
  on `depth < 2`, if `pickedRoomId !== null && s?.vibeChat !== pickedRoomId`
  call `replaceRoomHistory(pickedRoomId)` (a ref holds the picked id); the
  replace must follow the pop, not precede it, or it rewrites the depth-2
  entry.

### S2-SECURITY-8 — LOW — the two label clocks tick while hidden
- where: `src/components/mobile/messages/club/ClubSpace.tsx:197-200`;
  `src/components/mobile/messages/club/EventChat.tsx:86-89`.
- what: the 60-s `setNow` intervals do not check `visibilityState`; a state
  write per minute in the background (no request). Every interval that
  makes a request does pause (holds below); this is the one exception, and
  it is cleared on unmount.
- fix: `if (document.visibilityState === "visible") setNow(new Date())`, or
  refresh `now` on `visibilitychange` → visible only.

## Holds (refuted nothing)

- **A member never reaches a composer or a "+" the server would refuse**:
  `RoomComposer.tsx:155-163` renders nothing while `viewer` is null and the
  quiet tile on `viewer.can_post === false`; the "+" and `CardTray` /
  `ComposeSheets` mount only past that gate (`:237-247, 320-338`); `viewer`
  comes from the open room's own thread GET (`use-room-poll.ts:421-427`
  returns null for any other room, so no stale viewer crosses rooms); a
  refused `board_officers_only` / `room_closed` send is remembered against
  the `viewer` object (`:156, 209`) until the next full read; Up next taps
  only on `room_id !== null`; the Board's reply field only on
  `viewer.can_reply` (`BoardPost.tsx:144`). A demotion mid-session lands on
  the toast (never silent) and then the tile.
- **Remove row only when `viewer.can_moderate && !isMine`**:
  `RoomThread.tsx:291` (also `!temp && m.user_id !== ""`), `BoardView.tsx:393`;
  `MessageBubble.tsx` adds the `temp_` guard; the DELETE (`:232-243`,
  `:355-366`) toasts every refusal through `toastSendFailure`
  (`not_allowed`, `report_open`, `not_found` from `REFUSAL_SENTENCES`, a 429
  or 5xx through `vibeRequest`'s mapped line) and drops the row on 200 only;
  the confirm (`RemoveConfirm`) carries 1.2's exact sentence and buttons.
- **A stub never renders**: `RoomThread.tsx:254` (`shown`), `BoardView.tsx:377`,
  `BoardPost.tsx:168` filter `hidden`; `separatorIds` skips stubs and does
  not count one as the previous row (`helpers.ts:197-206`); `isEmptyRoom`
  (`:291-293`) reads a room of stubs as empty (`Say hi …` /
  `Nothing on the Board yet.`); no long-press, no reaction row, no name for
  a stub anywhere; the fold of only stubs shows the reply field alone
  (`BoardPost.tsx:226-237`). `Earlier messages` uses `hasEarlier`, not the
  visible count.
- **A removed row in a thread**: `RoomThread.tsx:302-309` — `RemovedContentCard
  kind="message" compact by={removed.by}` only, right-aligned (the row is
  always the viewer's own, `types.ts:263`), no picker. (The Board: finding 1.)
- **`thread_root_id` only on the Board**: `BoardPost.tsx:151-155` is the one
  sender of it; `RoomComposer.tsx:199-203` sends `{ content, parent_message_id? }`
  only; the Board's `?after=` page stays top-level (`message-read.ts:855`).
- **No payload rendered as HTML**: no `dangerouslySetInnerHTML` / `innerHTML`
  under `messages/` (grep); every `content`, name, title, location and
  label is a text child. Avatar / logo URLs go into inline `url(...)`
  backgrounds exactly as the moved code and S1 do
  (`MessageBubble.tsx:485, 650`, `ClubRow.tsx:69`); same-origin proxy or
  storage URLs from the app's own rows, the repo's pattern, not new here.
- **Handles / ids encoded**: `/orgs/${encodeURIComponent(orgHandle)}`
  (`ClubSpace.tsx:409`, `ClubEmpty.tsx:257`), `/messages?channel=` through
  `encodeURIComponent` (`ClubSpace.tsx:88-90`), every API path through
  `encodeURIComponent` (`use-room-poll.ts:137-140, 198`, `RoomThread.tsx:218,
  233`, `BoardPost.tsx:123, 151`, `BoardView.tsx:356`, `RsvpSheet.tsx:234`,
  `ClubSpace.tsx:161`); `/profile/<handle>` is `MessageBubble`'s, unchanged.
- **The RSVP sheet**: `RsvpSheet.tsx:234-238` calls only
  `PUT /api/events/<id>/rsvp` with `{ status: "going" | "maybe" }` and
  `DELETE` with no body (`rsvp/route.ts:160-162` accepts exactly those); the
  refusal toast is `vibeRequest`'s (not quiet, as 11.6 says); 200 →
  `reload()` → a member's `Not going` lands on 403 → `lostAccess` → the
  layer closes with `You left the event chat.` (14.25).
- **No chat state in browser storage**: no `localStorage` / `sessionStorage`
  in any S2 file (grep); drafts live in component state and die with the
  room column (`key={activeRoom.id}`).
- **Intervals**: every request-making interval is cleared on unmount and
  paused while hidden — the room poll (`use-room-poll.ts:288-318`: `stop()`
  in the cleanup, `isVisible()` per tick, `visibilitychange` stop/start,
  the generation bump drops late answers), the space read
  (`ClubSpace.tsx:182-193`), the fold timer (`BoardView.tsx:338-344`; but
  finding 4). The label clocks: finding 8.
- **Mark-read only for the open room**: `use-room-poll.ts:286, 233` — on the
  effect's start (the hook keyed by the open room, disabled under the
  layer) and after a full read that brought rows; the layer's own hook
  marks the event room. No mark-read for a room that is not on screen.
- **The 403 → close path cannot loop**: `ClubSpace.tsx:166-175` runs once
  (`closedRef`, `live`) and never re-arms on `onClose` identity (the ref of
  `b7b8779`); `EventChat.tsx:92-97` fires on the `lost` edge with a stable
  `closeEvent`; `closeEvent` (`:222-226`) does one `history.back()` only on
  a depth-2 entry, else a direct close; `pushLayerHistory` skips an entry
  already at `{ depth: 2, vibeChat: id }` (a deep link, R2). See finding 3
  for what stays on screen after the close.
- **No logging of message content**: no `console.*` in any S2 file.
- **The Officers chip carries no dot**: `RoomChips.tsx:236`
  (`room.kind === "board" && room.unread`); its label is 1.2's.
- **10.2.5**: the diff on the two moved files is the `onRemove` prop, its
  pass-through (with the `temp_` guard) and the `Remove` row under Report in
  `pickerRowStyle(darkMode, true)`; nothing else.
- **9.3 / 11.5 in the hook**: `?after=` is the newest server `created_at`
  (a `temp_` row's clock never feeds it), `limit=200`; the 5th tick and the
  return to visible read `?limit=50` and `mergeFullPage` (tests green);
  `?before=` never with `after` or `root`; `room` / `viewer` from full
  reads only; a first-read failure → `failure`, a later one silent.

## STOPPED / SIBLING, judged

- STOPPED 1 (`line?` option), 2 (`hasEarlier`), 3 (`replace` / `remove`),
  7 (`lostAccess`): right. Each is additive to a pinned shape that cannot
  express the flow 11.4 / 11.5 / 11.6 describe (two failure lines through
  one hook, "the last earlier page was full", the optimistic swap, a later
  403 on the event room); nothing named in the contract was changed. The
  integration review keeps them.
- STOPPED 4, 5: readings, correct (`gte` on `after`; the split-check's
  CHANGED list at integration).
- STOPPED 6 (no `initialPage` prop): right not to improvise on the pinned
  11.3 props; the cost is one duplicate thread GET per deep link (the
  resolving read of `MessagesMobile` and the hook's first read). S1 asks
  for the same prop (R4); the integration review should add
  `initialPage?: ThreadMessagesResponse` to `ClubSpaceProps` and pass it to
  the hook — the hook already takes it (`use-room-poll.ts:57, 174-176`).
- STOPPED 8 (16px input): right, 11.0 wins over MK:0.2.
- STOPPED 9 (`CardBubble` gets `onRemove` / `onReport` only): right, S3's
  file; and the reason finding 5 exists for text posts.
- REQUESTS R1–R3: honoured by S1 (`MessagesMobile.tsx:217, 293-297`).
- No SIBLING entries were written; none was needed (typecheck 0 repo-wide
  at review time).
