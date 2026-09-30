# W2-S2 repair after the four reviews (one pass)

Repaired at head `e8435f9` on `claude/relaxed-davinci-9d11h3`. Inputs:
`S2-review-contract.md`, `S2-review-security.md`, `S2-review-behaviour.md`,
`S2-review-design.md`. Every finding was verified against the tree, the contract
(`wave-2-contracts.md`) and the mockups before the verdict; the fixes live in the
S2-owned files only (13.2). One commit: `fix(chat): W2-S2 repair after review`.

Verdicts: FIXED = changed in an S2 file · REJECTED = the finding is wrong or asks for
something the contract does not pin (evidence given) · DEFERRED = real, but needs
another batch's file (a REQUEST) or the contract (a STOPPED entry in `S2-notes.md`).

## Contract lens

| finding | verdict | one line |
|---|---|---|
| S2-CONTRACT-1 (MEDIUM, `ClubSpace.tsx` the space read's line) | FIXED | Verified: `Members only.` is two words, so `isHumanSentence` refuses it and `describeFailure` gave `You don't have access to do that.`; a 404 gave `That's no longer available.`. `spaceFailure(r)` now returns `{ message: chatRefusalLine(r), retryable: false }` on a 403 / 404 with a known code, else `asLoadFailure`. |
| S2-CONTRACT-2 (LOW, `Your RSVP` title) | FIXED | The `Drawer.Title` is `visuallyHiddenStyle`: the dialog keeps its name, no unpinned word is drawn (same as S2-DESIGN-4). |
| S2-CONTRACT-3 (LOW, the tick count) | FIXED | A tick skipped for a read still in flight no longer counts: the increment sits after the in-flight guard, so the every-5th full read is never the one skipped. |
| S2-CONTRACT-4 (LOW, a card post not full width) | DEFERRED | `CardBubble` is W2-S3's file (292px, its own header); REQUEST R5 below: a `layout?: "bubble" \| "post"` prop. |
| S2-CONTRACT-5 (LOW, `officerEmpty` reading) | REJECTED | No change asked; 11.3 reads "the officer's empty club shows the dashed button" and Up next cannot know the Lounge's page while the Board is open. The wider reading stays; recorded for the integration review. |
| S2-CONTRACT-6 (LOW, `Open event chat` inside the layer) | REJECTED | No pinned behaviour for a second event from inside a layer (2.3 gives one depth-2 entry); the no-op stays and is recorded. |
| S2-CONTRACT-7 (LOW, `initialPage` cannot reach the hook) | DEFERRED | STOPPED 6 / R4 stand: the 11.3 props are pinned; the integration review adds `initialPage?` and S1 passes the body it holds. |

## Security lens

| finding | verdict | one line |
|---|---|---|
| S2-SECURITY-1 (HIGH, a removed Board post / reply rendered in full) | FIXED | Verified: `message-read.ts:594, 671` keep the viewer's own removed row with its text. `BoardView` now renders `RemovedContentCard kind="message" compact by=…` alone for `post.removed !== null` (no byline, text, toggle or field); `BoardPost` renders the compact card in a removed reply's place. |
| S2-SECURITY-2 (MEDIUM, the hook keeps polling a lost room) | FIXED | A tick on a room whose state reads `lostAccess` returns before any request; `lostAccess: true` is committed once (no new object per tick); `reload()` reads again as before. |
| S2-SECURITY-3 (MEDIUM, the stale space after a later 403; the 404) | FIXED | `read()` returns first when closed; a later 403 / 404 sets the box (`spaceFailure`, no Retry), `closedSpace` (the hook stops), drops the layer, toasts the code's sentence, and closes: with a depth-2 entry it pops the layer first and the popstate handler then calls `onClose` (S1's `back()` to depth 0); else `onClose` at once. The 404 is recorded as STOPPED 12. |
| S2-SECURITY-4 (MEDIUM, the fold timer under the layer) | FIXED | `BoardView` takes `paused` (the space passes `eventRoomId !== null`); the 20-s `refreshToken` interval is not armed while paused, so no fold reads under the layer. |
| S2-SECURITY-5 (LOW, a text Board post has no picker) | DEFERRED | Real, contract-silent (11.4 lists a post's parts without a picker): STOPPED 11 in `S2-notes.md` for the integration review. |
| S2-SECURITY-6 (LOW, an officer's event chip is a dead end) | REJECTED | Wrong premise: `eventRefsFor` sets `room_id` when `held.has(roomId) \|\| officerOf.has(org_id)` (`event-refs.ts:210-212`), so an officer's event ref carries the room id, and the thread GET admits an officer through `can_view_org_channel` (`channel-access.ts:104-110`), the same rule that lists the room to them. No chip opens a room the viewer cannot read. |
| S2-SECURITY-7 (LOW, the layer's Board strip skips `replaceState`) | FIXED | `openBoardFromLayer`: the Board is picked, `pendingRoomRef` holds its id, `history.back()` pops the layer, and the popstate handler `replaceState`s the Board on the depth-1 entry (after the pop, never before); without a depth-2 entry the replace is immediate (same as S2-BEHAVIOUR-1). |
| S2-SECURITY-8 (LOW, the clocks tick while hidden) | FIXED | Both 60-s clocks set `now` only while `document.visibilityState === "visible"`. |

## Behaviour lens

| finding | verdict | one line |
|---|---|---|
| S2-BEHAVIOUR-1 (MEDIUM, the Board from inside the layer) | FIXED | As S2-SECURITY-7. |
| S2-BEHAVIOUR-2 (MEDIUM, the later 403 peels one layer) | FIXED | As S2-SECURITY-3: the layer's entry is popped first, the space closes from the popstate handler. |
| S2-BEHAVIOUR-3 (LOW, mark-read twice on mount) | FIXED | `readFull` marks read only when the state already held a page (`prev.messages !== null`) and the page brought new rows; the mount's `markRead` is the one call. |
| S2-BEHAVIOUR-4 (LOW, `onReplied` writes a stale row) | FIXED | `onReplied` is `poll.refreshOne(post.created_at)`: `?after=<created_at>&limit=1` brings the row with its server `reply_count` (9.4); nothing from the render is written back. |
| S2-BEHAVIOUR-5 (LOW, an in-flight read never settles) | FIXED | `inFlightSinceRef`: an in-flight read older than four ticks (16 s) counts as settled for the next run (its late answer is dropped by generation as before). |
| S2-BEHAVIOUR-6 (LOW, `?after=` rows appended unsorted) | FIXED | The merged array is sorted by `created_at` (stable), as `mergeFullPage` leaves it; a `temp_` row keeps its client clock. |
| S2-BEHAVIOUR-7 (LOW, three timers under the layer) | FIXED (folds) / REJECTED (space read) | The folds pause with `BoardView`'s `paused` (S2-SECURITY-4); the 20-s space read stays: the layer's Board strip reads `board_latest` from it. |
| S2-BEHAVIOUR-8 (LOW, `Earlier messages` jumps) | FIXED | The click records `scrollTop` / `scrollHeight` / the first id; a `useLayoutEffect` on the prepend sets `scrollTop = top + (newHeight − oldHeight)`; the anchor is consumed by the prepend or by the first state change after a read that brought nothing. |
| S2-BEHAVIOUR-9 (LOW, a deep-linked event chat waits for the space read) | DEFERRED | The clean fix is the `initialPage?` prop (R4 / S2-CONTRACT-7): its `room.org` names the club at once. Mounting the layer without a club name would draw a Back button without 1.2's `Back to <club>`. |

## Design lens

| finding | verdict | one line |
|---|---|---|
| S2-DESIGN-1 (MEDIUM, Up next line 1 clips the time) | FIXED + STOPPED 10 | Verified (147.5px inside, ≈162px of content with `Tonight · 7:30 PM` and `Going`). The time span is `flexShrink: 0`; the RSVP group has `minWidth: 0` and ellipsises its word, the check keeps its shape; the `aria-label` carries the word. `eventTimeShort` would fit: STOPPED 10 in `S2-notes.md`. |
| S2-DESIGN-2 (MEDIUM, `RemoveConfirm` focus) | FIXED | Focus returns to the element that had it on close (when still connected); Tab cycles Cancel ↔ Remove; Escape as before. |
| S2-DESIGN-3 (MEDIUM, `Cancel reply` 36px) | FIXED | 44×44 (the `circle` base), the pill's padding `2px 6px 2px 12px` so its height does not grow. |
| S2-DESIGN-4 (LOW, `Your RSVP` title) | FIXED | As S2-CONTRACT-2. |
| S2-DESIGN-5 (LOW, the hat line's count colour) | FIXED | Two spans: `Your hat: <Role>` in `t.secondary`, ` · N members` in `t.muted` (`W0_Club:20-23`); `hatLine` stays for its test. |
| S2-DESIGN-6 (LOW, border / surface literals) | DEFERRED | The Night literals are MK:0.2's own; a token is missing, not wrong. REQUEST R6 to W2-S1: `fieldBorder`, `chipBorder`, `dashedBorder`, `raisedSurface` on `Palette`, then the six places read them. |
| S2-DESIGN-7 (LOW, the folded post's padding) | FIXED | `padding: open ? "10px 12px 10px" : "10px 12px 0"` (`W0_Board:95`, MK:5). |
| S2-DESIGN-8 (LOW, the closed tile's footer) | FIXED | Off the Board: footer `8px 12px 12px` + the inset, the tile `height: 44; padding: 0 14px` (`W0_Room:168`); the Board's member tile unchanged. |
| S2-DESIGN-9 (LOW, the notes) | FIXED | STOPPED 8 moved to "Readings"; STOPPED 10 (line 1), 11 (the Board post's picker) and 12 (the later 404) added. |

## REQUESTS (for the integration review)

- R4 (stands). `initialPage?: ThreadMessagesResponse` on `ClubSpaceProps`, handed to
  `useRoomPoll` when `hookRoomId === initialRoomId`; S1 passes the resolving read's
  body. Closes S2-CONTRACT-7 and S2-BEHAVIOUR-9.
- R5 (to W2-S3). `layout?: "bubble" | "post"` on `CardBubble`: no header, `width: 100%`
  for a card post on the Board (11.4 "full width inside the post"); `BoardPost.tsx`
  consumes it. Closes S2-CONTRACT-4.
- R6 (to W2-S1). Four tokens on `Palette` (`fieldBorder`, `chipBorder`, `dashedBorder`,
  `raisedSurface`) with a Night and a Light column; then the S2 places
  (`ClubSpace.tsx`, `EventChat.tsx`, `EventAbout.tsx`, `RoomComposer.tsx`,
  `BoardPost.tsx`, `RoomChips.tsx`, `UpNext.tsx`) read them. Closes S2-DESIGN-6.

## STOPPED (in `S2-notes.md` part 3)

- 10: Up next line 1 (`eventTime` + the RSVP mark) does not fit the 11.3 card at 375px.
- 11: a text Board post has no picker (11.4 is silent; 11.5 gives every thread row one).
- 12: a later 404 on the space read closes the view like the later 403 (11.3 names the 403 only).

## Gates

Run on the repaired tree (every S2 file as committed), in this order.

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0 (repo-wide) |
| tests | `npm test` | 1637 tests, 1637 pass, 0 fail (the 17 S2 pure tests among them: `page-merge.test.ts` 10, `club/helpers.test.ts` 7) |
| build | `npm run build` | exit 0, one attempt, no collision (run twice: after the first pass and after the `Earlier messages` refinement) |
| eslint | `npx eslint src/components/mobile/messages/club/ src/lib/chat/use-room-poll.ts src/lib/chat/page-merge.ts src/lib/chat/page-merge.test.ts src/components/mobile/messages/ReactionPicker.tsx src/components/mobile/messages/MessageBubble.tsx` | exit 0, 0 problems |
| eslint baseline | `git show a9355d1:src/components/mobile/messages/<f>.tsx \| npx eslint --stdin --stdin-filename <path>` for `ReactionPicker`, `MessageBubble` | exit 0 each (no old error; none added; the two files are untouched by this repair) |

SIBLING: none (typecheck 0 repo-wide at every run).
