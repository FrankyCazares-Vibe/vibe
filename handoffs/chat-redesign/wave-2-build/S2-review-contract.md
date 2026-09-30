# W2-S2 review — lens "contract"

Reviewer of the W2-S2 commits (3bf4695 … 94bcb1d) against
`handoffs/chat-redesign/wave-2-contracts.md` (1.2 "Inside a club", 1.4, 2.3,
9.3, 10.2 rule 5, 11.0, 11.3–11.6, 11.9.3, 12, 13.3), the mockups map (MK) and
the code on the branch. Read-only on the tree but this file.

Method: refute line by line — every copy string and aria-label, the reads and
the polling schedule, `mergeFullPage`, Up next, the chips, the strip, the
composer, the Board, the thread, the event layer, the RSVP sheet, every
`LoadFailed` line, the split-check report; the gates re-run.

## Log
- started; contract sections and S2-notes/S2-gate read; use-room-poll.ts and page-merge.ts read
- all club/* files, use-room-poll, page-merge, MessageBubble/ReactionPicker diffs, S1's MessagesMobile history code, failure-copy, send-failure, types read
- gates run: typecheck exit 0; npm test 1637/1637; eslint (S2 files + the two baselines) exit 0; split-check --base 507d6b4: missing 0 · changed 5 (MessageRow, MessagesMobile, ConversationView, MessageBubble, ReactionPicker) · added 20 · duplicate 0; build started
- build: `npm run build` exit 0 (one attempt, no collision)

## Verdict

**PASS with one repair (S2-CONTRACT-1, MEDIUM) and five LOW notes.** Every copy string and
aria-label of 1.2 "Inside a club" that the batch draws is the contract's, word for word
(checked one by one against helpers.ts and the JSX); the 9.3 schedule, `mergeFullPage`'s
`temp_` rule, Up next's `slice(0, 2)` and the `isSoon` rule, the chip order and the
event-chip rule, the Board strip rule, the composer's null-viewer rule and its two tiles,
the Board's newest-first display and its fold, the thread's separators and `MessageBubble`
props, the remove gating and confirm copy, the event layer's z-index / history / header /
pill / Plans / Who's going / RSVP sheet, the closed-chat rules and every `LoadFailed` line
hold. The split-check report is as 10.3 expects. All four gates are green.

## Findings

### S2-CONTRACT-1 — MEDIUM — `src/components/mobile/messages/club/ClubSpace.tsx:169`
**What.** 11.3 States: "403 `members_only` / 404 → `LoadFailed` with `retryable: false` and
its sentence". The read's failure is built as `asLoadFailure(r, SPACE_LINE)`, which hands the
body to `describeFailure` (failure-copy.ts:77-83, :16): a 403 whose `error` is not a
"human sentence" (`isHumanSentence` wants ≥ 3 words; `Members only.` has two) becomes
`You don't have access to do that.`, and every 404 becomes `That's no longer available.`.
So the box never shows `Members only.` / `That's not there anymore.` (1.3). `retryable:
false` is right (NO_RETRY_STATUSES). The later-403 toast path (`toastSendFailure`, :173)
is correct: `chatRefusalLine` picks the code's sentence.
**Fix.** In the read's failure branch: `const line = chatRefusalLine(r); setSpace({ data:
null, failure: line ? { message: line, retryable: false } : asLoadFailure(r, SPACE_LINE) });`
with `import { chatRefusalLine, toastSendFailure } from "../send-failure";` (`r` is the
`VibeFailure` there; `chatRefusalLine` answers null for any status/code it does not know,
so the 5xx line + Try again is unchanged).

### S2-CONTRACT-2 — LOW — `src/components/mobile/messages/club/RsvpSheet.tsx:420`
**What.** The sheet shows a visible title `Your RSVP`. 1.2 pins the sheet's rows (`Going`,
`Maybe`, `Not going`) and the line under the first two only; `Your RSVP` exists in the
contract as the card's pill-group `aria-label`, not as sheet copy. A dialog needs an
accessible name (11.0), so the title is right to exist.
**Fix.** Either keep it and record it as the sheet's title for Franky, or render the
`Drawer.Title` with `visuallyHiddenStyle` so no unpinned copy is drawn. (No sentence of
the contract changes either way.)

### S2-CONTRACT-3 — LOW — `src/lib/chat/use-room-poll.ts:277-281`
**What.** The interval increments `tickRef` before `run` checks `inFlightRef`; a tick
skipped because the previous read is still in flight still counts, so the every-5th full
read can be the one skipped (then the next is tick 10). 9.3 says every 5th poll is a full
read.
**Fix.** Count only ticks that run: move `tickRef.current += 1` and the `full` decision
inside `run` after the in-flight guard (or `if (inFlightRef.current) return;` before the
increment).

### S2-CONTRACT-4 — LOW — `src/components/mobile/messages/club/BoardPost.tsx:194`
**What.** 11.4: a card post is drawn "full width inside the post". `CardBubble` (W2-S3's)
draws at `width: 292` with its own `<Name> · Poll` header, so a card post shows the byline
twice and is not full width. Not fixable in S2's files; the builder recorded it.
**Fix.** A request to W2-S3 for the integration review: a `layout?: "bubble" | "post"`
prop on `CardBubble` (no header, `width: 100%`), consumed here.

### S2-CONTRACT-5 — LOW — `src/components/mobile/messages/club/ClubSpace.tsx:243`
**What.** `officerEmpty` (the dashed `Add your first event` in Up next) is officer +
`member_count === 1` + `up_next: []`, without the "Lounge's first page is empty" clause
11.9.3 puts on the brand-new-club state (1.2 lists "no messages" too). 11.3 reads the
other way ("the officer's empty club shows the dashed button"). Two readings; the wider
one was built (an officer alone with Lounge messages and no event still sees the button).
**Fix.** None required; record for the integration review. If the strict reading is wanted,
the button needs the Lounge page's emptiness, which Up next cannot know while the Board is
the active room — the contract would have to say which.

### S2-CONTRACT-6 — LOW — `src/components/mobile/messages/club/EventChat.tsx:322`
**What.** 11.6 lists "a card's `Open event chat`" among the layer's openers; inside the
layer an Event card's link is a no-op (`onOpenEventChat={() => undefined}`) because one
layer level (depth 2) exists. The builder recorded it. No pinned behaviour for a second
event from inside a layer.
**Fix.** Record for the integration review; an option is a callback to `ClubSpace` that
swaps `eventRoomId` (a `replaceState` at depth 2).

### S2-CONTRACT-7 — LOW — `handoffs/chat-redesign/wave-2-build/S2-notes.md` (STOPPED 6)
**What.** The deep link's resolving read cannot reach the hook (11.3's props carry no
`initialPage`), so an arrival on `?channel=<roomId>` reads the room twice (S1's resolving
GET, then the hook's first GET); SCREENS-L10 is not met. The builder was right not to add
a prop the contract pins, and S1 (`MessagesMobile.tsx`) asks for the same prop.
**Fix.** At integration: `initialPage?: ThreadMessagesResponse` on `ClubSpaceProps`, handed
to `useRoomPoll(hookRoomId, { …, initialPage })` when `hookRoomId === initialRoomId`; S1
passes the body it already holds.

## STOPPED / SIBLING judged

- STOPPED 1 (`line?` on the hook): right — 11.4 and 11.5 give two failure lines for one hook; additive, the pinned `{ enabled, initialPage? }` members are unchanged.
- STOPPED 2 (`hasEarlier`), 3 (`replace`, `remove`): right — the flows of 11.4/11.5 need them and the pinned ten members are built as named; additive.
- STOPPED 4, 5: readings, not stops; both correct (the `gte` cursor row is dropped by id; the split-check CHANGED set at integration is 10.3's five, which the report above confirms).
- STOPPED 6 (`initialPage` cannot reach the hook): right not to improvise; S2-CONTRACT-7 carries the fix.
- STOPPED 7 (`lostAccess`): right — 11.6's "next read answers 403 → the layer closes" needs a signal 11.5's silent ticks do not give; additive.
- STOPPED 8 (16px input): right — 11.0 wins over MK:0.2's 15px.
- STOPPED 9: a reading; correct.
- REQUESTS R1–R3: honoured by S1 (`MessagesMobile.tsx:217`, `:293-297`, `closeLayer`); R4 = S2-CONTRACT-7.
- SIBLING: none recorded; none needed (typecheck, tests, build, eslint all green on the shared tree).

## Holds (checked line by line, nothing to fix)

- 1.2 strings and labels: `Back to Messages`, `Back to <club>`, `Your hat: … · N members` (`1 member`), `Open <club>'s page` → `/orgs/<handle>`, `Up next` with no right text, the Up next line 1 / `Soon` ring / labels (`…, soon, tonight 7:30 PM, you're going`), group `<club> events`, `<nav aria-label="Rooms in <club>">`, `Board, 1 unread post`, `Officers, only officers see this room`, `<title>, event chat, <state>` (tonight / today / live now / ended / `eventTimeShort`), the strip `Board · <Author> · <text>` + `Latest from the Board, unread. …. Open the Board`, the four placeholders (= `aria-label`), `Send` / `Post to the Board`, `Add a poll, sign-up or event` / `Close the tray`, `Everyone in <club> sees this`, the member tile, the byline (`Someone` on null `users`, the role word, `rowTime`), the post label with `rowTimeSpoken`, `N replies` / `1 reply` / `Reply`, `Replies stay quiet`, `Show/Hide N replies. Replies don't notify anyone.`, `Replies`, `Reply quietly` / `Reply quietly to <Name>'s post` / `Send reply`, `Couldn't load replies.` (compact, Retry), the state pill four texts (`1 more day`), `Where` / `No place yet` / `When`, `Who's going: N going, M maybe`, `<N> going` `· <M> maybe`, the RSVP pill texts and labels, the sheet rows and `You'll appear in the event chat.`, `Couldn't load this event chat.`, `You left the event chat.`, `This chat is closed.`, the brand-new-club five strings and targets, the three empty lines, `Couldn't load this club.` / `Couldn't load this chat.` / `Couldn't load the Board.`, `<club> · event chat`, `Earlier messages` (above the first row / under the last post), `Remove` + `Remove this message for everyone in the room?` / `Remove` / `Cancel`, `RemovedContentCard by=`.
- 1.4: one `isSoon(starts_at, ends_at, now)` signature everywhere; `eventTime` / `eventTimeShort` / `rowTime` / `rowTimeSpoken` / `moreDays` from `when.ts`; every clock takes `now` (a 60-s state tick).
- 9.3 / 11.5: `?after=<cursor>&limit=200` every 4 s while visible, the every-5th and on-visible full read (`?limit=50`) through `mergeFullPage` (page rows replace by id; state rows `>=` the page's oldest and absent are dropped except `temp_`; older rows stay; sorted oldest first; 10 tests), `room` / `viewer` from full reads only, `loadEarlier` `?before=&limit=50` prepended, `refreshOne` `?after=&limit=1`, silent ticks, first-read `failure`, mark-read on mount and after a full read that brought rows, pause while hidden, `initialPage` honoured when given.
- 11.3: props exactly `{ orgHandle; initialRoomId; initialRoomKind; onClose }`; `Drawer.Root direction="right"` 1099/1100; `useHideTabBar()` on mount (the only writer of the class in the club stack: ClubSpace, EventChat, RsvpSheet); the space read on open / visible / 20 s; the deep link's room read first; `up_next.slice(0, 2)`, live chrome + `Soon` only on live / `isSoon`, quiet chrome otherwise, tap only with `room_id`, bloom only when a drawn card is hot (tokens 0.36→0.13→0 / 0.22→0.08→0); chips in the server's order, `aria-current="page"`, an event chip opens the layer and is never active, the Board dot from `unread`, no Officers dot, 44px hits; the strip on every room but the Board when `board_latest !== null`, text = `content`; the composer 64px, nothing while `viewer` is null, the tile only on `can_post === false`, the "+" only with `can_post`; the role word; skeleton / failure / later-403 close with `Members only.` toast.
- 11.4: newest first from an oldest-first hook; `<article>` top-anchored; `?root=&limit=200` once on open, re-read every 5th tick and on Retry; all-stubs fold → the field only; `can_reply` gates the field (its one reader); reply POST `{ content, thread_root_id }`, 200 appended, `board_post_missing` → toast + drop; new rows at the top with `Reply` (`reply_count: 0`); the officer line / member tile; skeleton / empty / failure.
- 11.5: separators (`shouldShowChatSep`'s rule) over non-stub rows; `MessageBubble` with `groupMode`, `showSender` on a sender's first row, `darkMode`, reactions as today, `onReply` (quote), `onReport`, `onRemove` only when `can_moderate && m.user_id !== viewerId` (never on `temp_` or a stub); `toMessageRow` carries `hidden`; a stub renders nothing; cards → `CardBubble`; `removed` → `RemovedContentCard`; optimistic `temp_` row → `replace` / `remove` + toast; refused `board_officers_only` / `room_closed` → the tile until the next full read.
- 11.6: 1101/1102 over the space; `pushState` depth 2 unless S1's deep-link entry is there; Back / swipe → `history.back()`; `popstate` below depth 2 is the one closer; header per 1.2, no right button; About `<section aria-label="About this event">`, the 96px gradient hero, bloom on live only, `role="status"` pill, Plans; Who's going with ≤ 5 avatars (`aria-hidden`, `personColor`); RSVP sheet (`Drawer.NestedRoot`, `useHideTabBar()`, PUT / DELETE, `reload()` on 200, the mapped toast on a refusal); the strip under About; the thread top-anchored; closed tile; skeleton per 11.6; `lostAccess` → the toast + close.
- 11.9.3 / 11.0 / 2.3 / 12 / 10.2.5 / 13.2: every new file `"use client"`, inline styles only, `palette(night)`, `SERIF` / `FONT`, `useNightTheme()`, 16px inputs, 44px targets, `LoadFailed tone={night ? "dark" : "light"}`, `toastSendFailure` for every refusal, no Discord word, no new dependency; chip taps `replaceState` at the current depth; the moved-file edits are `onRemove?` on `MessageBubble` (pass-through with the `temp_` guard) and `ReactionPicker` (the row under Report, `pickerRowStyle(darkMode, true)`, and the two `|| onRemove` conditions the row needs); only S2-owned files in the ten commits.
- Gates: typecheck 0 · tests 1637/1637 · build 0 · eslint 0 (+ both a9355d1 baselines 0) · split-check CHANGED = MessageRow, MessagesMobile, ConversationView, MessageBubble, ReactionPicker (10.3's five), MISSING/DUPLICATE empty, ADDED 20 (S1's flat files).
- A contract wording note (not a finding): 1.2's chip rule gives `today` to any `isSoon` event that starts before 17:00, including one tomorrow morning; helpers.ts follows the literal and its test says so.
