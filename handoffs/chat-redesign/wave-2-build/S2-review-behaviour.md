# W2-S2 review — lens "behaviour"

Reviewed at `e8435f9` (head; S2's commits 3bf4695 … 94bcb1d, diffed against
`a9355d1`). Files read in full: `use-room-poll.ts`, `page-merge.ts`,
`club/ClubSpace.tsx`, `RoomThread.tsx`, `RoomComposer.tsx`, `BoardView.tsx`,
`BoardPost.tsx`, `EventChat.tsx`, `EventAbout.tsx`, `RsvpSheet.tsx`,
`helpers.ts`; skimmed for the tap paths: `RoomChips.tsx`, `UpNext.tsx`,
`BoardStrip.tsx`, `ClubEmpty.tsx`; the `onRemove` diffs on `MessageBubble` /
`ReactionPicker`; the backend they call (`message-read.ts` paging, the send
route's codes, the remove route, the rsvp route, `send-failure.ts`,
`asLoadFailure`, `CardBubble`'s props, S1's `MessagesMobile` history writes).

## Gates, run by the reviewer

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1637 tests, 1637 pass, 0 fail |
| `npm run build` | attempt 1 exit 0 |
| `npx eslint src/components/mobile/messages/club/ src/lib/chat/use-room-poll.ts src/lib/chat/page-merge.ts src/lib/chat/page-merge.test.ts src/components/mobile/messages/ReactionPicker.tsx src/components/mobile/messages/MessageBubble.tsx` | exit 0, 0 problems |

## Verdict

**PASS with repairs** (two MEDIUM, six LOW; no HIGH). Every walked flow
holds against the contract; the two MEDIUMs are edge paths in the history /
close plumbing of `ClubSpace.tsx`, both fixable inside S2's own file.

## Findings

### S2-BEHAVIOUR-1 — MEDIUM — `club/ClubSpace.tsx:342-345`
**What.** The Board strip INSIDE the event chat layer switches the room
without the room's `replaceState`: `onOpenBoard` does `setPickedRoomId(board.id)`
then `closeEvent()` → `history.back()`, which lands on the depth-1 entry whose
`vibeChat` and URL are the room that was active before (the Lounge). The
space then shows the Board under `/messages?channel=<lounge>` with
`history.state.vibeChat === <lounge>`; a reload reopens the Lounge. 2.3: a
room switch inside a space is a `replaceState` with the room's id; 11.3: the
strip's tap is "the Board chip" (which `pickRoom` does write).
**Fix.** A `pendingRoomRef = useRef<string | null>(null)`; `onOpenBoard`
sets `pendingRoomRef.current = board.id` before `closeEvent()`; in `onPop`,
when `depth < 2` and the ref holds an id: `replaceRoomHistory(id)` and clear
it. (The direct-close branch of `closeEvent`, no depth-2 entry, calls
`replaceRoomHistory(board.id)` at once.)

### S2-BEHAVIOUR-2 — MEDIUM — `club/ClubSpace.tsx:170-175`
**What.** The later-403 close (`Members only.`) while the event chat layer is
open peels one layer only: `onCloseRef.current()` is S1's `closeLayer`, one
`history.back()` (depth 2 → 1); its `popstate` at depth 1 is ignored by
`MessagesMobile` (R1) and closes just the layer here. `closedRef` is already
true, so the space stops reading and stays on screen with stale rooms after
the toast said the viewer is out. The layer's own hook answers 403 within 4 s
and calls `closeEvent()` → a second `back()` only when it lands BEFORE the
first popstate settles; otherwise the layer is gone and nothing closes the
space. 11.3: "the next space read's 403 closes the view".
**Fix.** Hold `eventRoomId` in a ref; in the 403 branch, before
`onCloseRef.current()`: `if (eventRoomIdRef.current && historyState()?.depth === 2) window.history.back();`
— two queued traversals land at depth 0, whose popstate closes everything
(S1's handler closes on depth < 1). Alternatively `setEventRoomId(null)` first
and `window.history.go(-2)` in place of the parent's `back()`; either stays
in S2's file.

### S2-BEHAVIOUR-3 — LOW — `src/lib/chat/use-room-poll.ts:286` and `:233`
**What.** `POST …/read` goes out twice on every mount: the schedule effect's
`markRead(id)` and the first full read's `brought` (every row is "new" against
an empty `known` set). 11.5 asks for "on mount and after a full read that
brought new rows"; the first read is the mount's read, one call is the intent.
**Fix.** In `readFull`, `if (brought && prev.messages !== null) markRead(id);`.

### S2-BEHAVIOUR-4 — LOW — `club/BoardView.tsx:150`
**What.** `onReplied={() => poll.replace(post.id, { ...post, reply_count: (post.reply_count ?? 0) + 1 })}`
writes the render's copy of `post` back into the hook: a full read (a new
`reply_count`, reactions, a removal) or a vote's `replaceCard` that landed
during the reply's flight is overwritten by the stale row until the next full
read (≤ 20 s). `BoardPost` calls the `onReplied` prop captured at submit time.
**Fix.** Re-read the row instead: `onReplied={() => void poll.refreshOne(post.created_at)}`
(`?after=<created_at>&limit=1` returns that row with its server `reply_count`,
9.4) — one GET, always fresh, no hook change.

### S2-BEHAVIOUR-5 — LOW — `src/lib/chat/use-room-poll.ts:272-279`
**What.** `inFlightRef` has no age: a read whose fetch never settles (a
backgrounded tab whose request the OS dropped without a rejection) leaves
`inFlightRef.current === true`, so every later tick AND the visible-return
full read return at once — polling is dead until the room remounts.
**Fix.** Store `inFlightSinceRef = performance.now()`; treat an in-flight
older than `ROOM_POLL_MS * 4` as settled; or have `onVisibility` bump `gen`
and reset `inFlightRef` (the stale answer is dropped by generation anyway).

### S2-BEHAVIOUR-6 — LOW — `src/lib/chat/use-room-poll.ts:256`
**What.** `readAfter` appends `fresh` after the state's last row without a
sort; a row with an older `created_at` than a row `append`ed by the composer
(someone's message that landed between the cursor and my send) shows BELOW
mine until the next full read (`mergeFullPage` sorts). Cosmetic, ≤ 20 s.
**Fix.** Sort the merged array by `created_at` as `mergeFullPage` does (a
`temp_` row keeps its client clock, so it stays at the end).

### S2-BEHAVIOUR-7 — LOW — `club/BoardView.tsx:73-79`, `club/ClubSpace.tsx:182-184`, `club/BoardPost.tsx:118-138`
**What.** Under the event chat layer the room's hook is paused
(`enabled: eventRoomId === null`, the notes' decision) but three other timers
keep running for the room underneath: the space read every 20 s, the Board's
`refreshToken` every 20 s, and every open fold's `?root=` re-read on it. Not
pinned (9.3 polls "the open room"); cost only, and the space read is wanted
for the strip inside the layer.
**Fix.** Give `BoardView` a `paused` prop (`eventRoomId !== null`) and skip the
`refreshToken` bump while paused; the fold effect then reads only on open /
Retry until the layer closes.

### S2-BEHAVIOUR-8 — LOW — `club/RoomThread.tsx:272-280`
**What.** `Earlier messages` prepends up to 50 rows and nothing keeps the
scroll anchor: the browser keeps `scrollTop`, so the row the reader was on
jumps down by the height of the new rows (the reader is at the top, so
`pinnedRef` is false and the bottom-pin effect does not fire).
**Fix.** Before `loadEarlier()` record `el.scrollHeight` and `el.scrollTop`;
in a `useLayoutEffect` keyed on `messages[0]?.id`, when a record exists set
`el.scrollTop = recorded.scrollTop + (el.scrollHeight - recorded.scrollHeight)`
and clear it.

### S2-BEHAVIOUR-9 — LOW — `club/ClubSpace.tsx:335` with `club/EventChat.tsx:45,75`
**What.** A deep-linked event chat (`initialRoomKind === "event"`) mounts
`EventChat` only once the space read answered (`eventRoomId && org`), so the
viewer sees the space's header/chips skeleton for one space read (9–13
PostgREST calls, 9.3) before the event room's own read even starts. 11.3:
"A deep link with only a room id opens the room first … and the space read
follows". `EventChat` needs the club only for `Back to <club>`, the club line
and `clubGradient`, and its own thread read carries `room.org` (`OrgRef`:
`id`, `name`, `logo_url`).
**Fix.** Make `club` optional on `EventChatProps`, derive it from
`poll.room?.org` when absent, and mount `EventChat` on `eventRoomId` alone;
the Board strip inside the layer keeps waiting for `boardLatest`.

## Holds (walked and refuted nothing)

- **Open a club from a row (Lounge).** S1 mounts `ClubSpace` keyed on the
  room id with the lounge's id and kind; `hookRoomId` reads it before the
  space answers; `picked` resolves to the same id once `rooms` arrive, so the
  hook does not reset (`use-room-poll.ts:421`: the state is tagged by room,
  a new id reads as "nothing yet" without an effect).
- **The Board.** `messages.filter(!hidden).slice().reverse()` — newest first,
  `<article>`s; the fold: `?root=<id>&limit=200` on open, Retry and every
  `refreshToken` (20 s while visible), a refetch failure keeps the rows
  (`BoardPost.tsx:129`), the all-stubs fold shows the field only
  (`visibleReplies.length > 0` gate, then the field on `can_reply`); the
  reply POST carries `thread_root_id`; `board_post_missing` → toast +
  `onMissing` → `poll.remove(post.id)`; a new post (`append` at the end of
  oldest-first state) lands at the top with `reply_count: 0` → `Reply`;
  `Earlier messages` under the last post.
- **Send in the Lounge.** `temp_<ms>` row → `append` (bottom, `onSent` pins
  the scroll) → `POST { content, parent_message_id? }` → `replace(tempId,
  sent)`, which drops the temp row when a 4-s tick already brought `sent.id`
  (`use-room-poll.ts:382`); failure → `toastSendFailure(r)` + `remove(tempId)`
  + the draft restored; `board_officers_only` / `room_closed` → the quiet
  tile until the next full read hands a new `viewer` object (identity test,
  `RoomComposer.tsx:156`; the 4-s ticks keep the old reference).
- **A poll row.** `kind !== "text"` → `CardBubble` with `onCard={poll.replaceCard}`
  (`(id, card)`, the prop's exact signature, `CardBubble.tsx:44`) and
  `onRefresh → refreshOne(createdAt)` = `?after=<createdAt>&limit=1`, which
  the route answers ascending with `gte`, i.e. that very row
  (`message-read.ts:851-859`).
- **A removal by a mod.** `viewer.can_moderate && !isMine && !temp` →
  `onRemove` → the picker's `Remove` row → `RemoveConfirm` (the 1.2 sentence,
  `Remove` / `Cancel`, focus on Cancel, Escape) → `DELETE …/messages/<mid>`
  → 200 → `poll.remove`; `report_open` / `not_allowed` → `toastSendFailure`
  (`chatRefusalLine` on the code). The route marks, never hard-deletes, so
  the author's next full read brings `removed: { by }` → `RemovedContentCard`.
- **The event chat layer.** From a chip (`pickRoom` → `openEvent`), an Up
  next card (only when `room_id !== null`, else a plain `role="group"` tile),
  a deep link (`initialRoomKind === "event"` → the space on its Lounge,
  `eventRoomId` set; S1 writes `replaceState` 1 + `pushState` 2 BEFORE
  `setOpen`, so `pushLayerHistory`'s guard skips — no double entry). Its own
  hook (`enabled: true`, `Couldn't load this event chat.`); the room
  underneath is paused, state kept, shown at once on Back.
- **Going → Maybe → Not going.** `PUT { status }` / `DELETE` (not quiet:
  `vibeRequest`'s mapped toast on a refusal) → `onChanged` → `reload()` →
  a full read: `first` is false, a 403/404 → `lostAccess: true`
  (`use-room-poll.ts:216`) → the effect toasts `You left the event chat.`
  once (`lost` stays true, `onClose` is the stable `closeEvent`) → `back()`.
- **Back through the layers.** Layer Back / swipe → `closeEvent` →
  `history.back()` when the state is `{ depth: 2, vibeChat }` → `popstate`
  depth 1 → `setEventRoomId(null)` (ClubSpace) and ignored by S1 (R1); the
  space's Back → `onClose` → S1's `closeLayer` → `back()` → depth 0 → S1
  unmounts. Chip taps `replaceState` at the entry's depth.
- **The every-5th full read.** `tickRef % 5 === 0` → `readFull` →
  `mergeFullPage`: rows replaced by id (votes, RSVP, reactions, reply counts,
  stubs), a state row `>= page[0].created_at` not in the page dropped, a
  `temp_` row never, older rows kept, then sorted (tested, 10 tests).
  `room` / `viewer` / `viewerId` from full reads only (`readAfter` spreads
  `prev`).
- **Visibility.** Hidden → `stop()`; visible → `tickRef = 0`, a full read,
  `start()`; the space read and the Board's fold timer check
  `visibilityState` too.
- **Mark-read.** `POST …/read` quiet, on mount and after a full read that
  brought rows; no role special case (the Officers room's `{ ok: true }` on
  no row is the route's).
- **Hooks.** Every component calls its hooks before any return (`RoomComposer`
  returns `null` after its `useEffect`; `RoomThread` / `BoardView` after
  their refs and states; `ClubSpace` runs `useRoomPoll` before the space
  effect); no state is set in an effect body (the space read, the fold read
  and the clock set state in callbacks); every interval / listener is
  cleared in its cleanup; the hook's interval reads `stateRef`, never a
  render's `messages`; a read that outlives its room is dropped by `gen`.
- **Refusal toasts** all go through `toastSendFailure` / the RSVP sheet's
  non-quiet `vibeRequest` (no `REFUSAL_SENTENCES` row exists for its codes,
  so `chatRefusalLine` would fall to the same mapped line).

## The builder's STOPPED / SIBLING entries, judged

- **STOPPED 1** (the Board's failure line needs a hook option) — right: 11.4
  and 11.5 name two sentences for one hook whose option object 11.5 pins;
  `line?` is the smallest additive answer.
- **STOPPED 2** (`hasEarlier`) — right: "while the last earlier page was
  full" is unknowable from `messages` alone.
- **STOPPED 3** (`replace` / `remove`) — right: the temp-row and remove flows
  of 11.4/11.5 have no writer in the pinned shape.
- **STOPPED 4, 5** — readings, correct (`gte` confirmed at `message-read.ts:857`).
- **STOPPED 6** (`initialPage` cannot reach the hook) — right and the
  contract's own contradiction (11.3's props vs 11.3 Reads / 2.3 / 9.3); the
  one-extra-GET default is the safe side; S1 asks for the same prop (R4).
- **STOPPED 7** (`lostAccess`) — right: 11.6's close needs a signal 11.5's
  "silent tick" withholds.
- **STOPPED 8** (16px) — right, 11.0 is explicit.
- **STOPPED 9** — a reading of S3's `CardBubble` props, correct.
- **SIBLING** — none recorded; the build collision was handled by 13.3's
  rule (one 90-s wait, then exit 0).
