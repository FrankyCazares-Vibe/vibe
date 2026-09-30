# W2-S3 notes (the screens batch, cards and the tray)

Branch `claude/relaxed-davinci-9d11h3`, started at `7779e9e` (S2's first commit
`3bf4695` + its notes line, on top of S1's `7678656` and `a9355d1`). The
contract is `handoffs/chat-redesign/wave-2-contracts.md` (final); the facts are
`wave-2-asis/mockups-map.md` (MK) and `messages-mobile-map.md` (MM); the
mockups `boards/W0_Tray.dc.html`, `W0_Cards.dc.html`, `W0_NewPoll`,
`W0_NewSignup`, `W0_ShareEvent`.

## Part 1 — the first commit (serial prelude, contract 13.1)

Built alone after S2's first commit and before the three screen batches run
side by side. Three files, all under W2-S3's ownership (13.2:
`messages/cards/*`, `messages/compose/*`), with pinned signatures so W2-S2's
`RoomComposer` / `RoomThread` mount them from their first line:

1. `src/components/mobile/messages/compose/CardTray.tsx` — the FULL tray of
   11.7 (small): props `{ roomKind: RoomKind; roomName: string; clubName:
   string; open: boolean; onClose(): void; onPick(kind: "poll" | "signup" |
   "event"): void }`. In flow above the composer with the tail, the scrim
   from `palette(night).scrim` over the thread, `<nav aria-label="Add to
   …">` per room kind, three 72px rows with 1.2's exact captions.
2. `src/components/mobile/messages/compose/ComposeSheets.tsx` — the mount
   point for the three sheets: props `{ kind: "poll" | "signup" | "event" |
   null; roomId; roomKind; roomName; clubName; orgHandle; onClose();
   onPosted(message: ChatMessage); onReload(); returnFocusTo? }`. Renders
   nothing for now (the main W2-S3 batch fills it with `CardSheet` and the
   three sheets).
3. `src/components/mobile/messages/cards/CardBubble.tsx` — EXACTLY the 11.8
   props; renders the fallback `content` as a plain 292px bubble with the
   11.8 header line (`<Name> · Poll | Sign-up | Event`; `You` / `Someone`),
   theirs with the 28px avatar and the left-tail radius, mine right-aligned
   with no avatar; its own 500 ms long-press opening `ReactionPicker` with
   `onRemove` / `onReport`.

Gates (13.3): `npm run typecheck`, `npm test`, `npm run build`, `npx eslint
<files>`. One commit: `feat(chat): CardBubble fallback bubble (W2-S3 first
commit)`.

### Facts read before the first edit

- `ChatMessage` (types.ts:276-317): `content`, `user_id`, `users: Person |
  null`, `reactions: ReactionGroup[]` (same shape as `MessageReaction`, so
  `ReactionPicker`'s `existing` takes it), `kind: "text" | "poll" |
  "event_card"`, `card: Card | null`, `hidden`, `removed`.
- `ThreadRoom` (types.ts:320), `RoomKind` (types.ts:22: board | lounge |
  officers | event | room).
- The fallback text (`cards/fallback.ts`): `Poll: <q>`, `Sign-up: <title>`,
  `Event: <title> · <when>[ — <note>]`. With `card === null` the header word
  comes from `card?.type` when present, else from `message.kind`
  (`event_card` → Event) and, for `kind: "poll"`, from the fallback prefix
  (`Sign-up:` → Sign-up, else Poll).
- `ReactionPicker` props: `{ darkMode, isMine, existing, onPick, onReply?,
  onReport?, onRemove?, onClose }`; positioned absolute against the nearest
  positioned ancestor (`offsetParent`), `left: 32` for theirs, `right: 0`
  for mine; it walks up to the scrolling list to decide above / below.
- `MessageBubble`'s press (`:84-158`): 500 ms timer, a 10 px drift cancels,
  `contextmenu` suppressed, the click that ends a fired press is swallowed in
  the capture phase, `navigator.vibrate(8)` in a try. Not reused (11.8):
  `CardBubble` has its own copy of the gesture without `listScrolledAtRef`
  (not in the pinned props).
- `palette(night)` (v2-tokens.ts): `scrim` is the tray's scrim in both
  themes (`rgba(8,7,7,0.5)` / `rgba(20,20,22,0.35)`); `surface`, `hairline`,
  `muted`, `secondary`, `ink`; `SERIF` / `FONT`.
- `personColor(id)` / `initialsOf(name)` (avatar.ts, format.ts) for the 28px
  disc when `avatar_url` is null.
- Mockup tray (`W0_Tray:57-98`, MK:8): scrim absolute `z-index:1`; nav in
  flow `margin:0 12px 8px; padding:8px; radius 20; border 1px
  rgba(255,255,255,0.10); background #1C1A1A; shadow 0 -10px 30px
  rgba(0,0,0,0.55); gap 8`; caption 20px tall 12px/700; rows `min-height:72px;
  padding:0 10px 0 12px; radius 14; border 1px rgba(255,255,255,0.07);
  background rgba(255,255,255,0.04); gap 12`; 44px icon disc
  `rgba(255,255,255,0.07)` with a 20px icon (bars / clipboard-check /
  calendar-check); title Fraunces 700 17px; 13px line; a 14px chevron; the
  tail 12px rotated square at `left:18px; bottom:-7px` with the right and
  bottom borders.
- Mockup card chrome (MK:0.2, W0_Cards:39-43, 91-93): row `align-items:
  flex-end; gap:8px`; 28px avatar 10px/700 initials; card `width:292px;
  padding:10px 12px 9px; radius 18 18 18 6 (theirs) / 18 18 6 18 (mine);
  border 1px rgba(255,255,255,0.08); background #161515`; header 11.5px/600
  muted `gap:6px; line-height:15px; white-space:nowrap` with a 13px icon
  (bars 2.6 / clipboard-check 2.2 / calendar 2.2, stroke secondary) and
  `<b secondary>Name</b> · Poll`.
- Light chrome for the tray is not drawn (MK:8 "the Board/Room variants are
  not drawn", MK:0.1 has Night's `#1C1A1A` only): built on the app's tokens
  — surface `var(--paper)`, hairline `var(--hairline)`, tinted rows and
  discs `rgba(var(--scrim-rgb), 0.04 / 0.07)` (white in Night, ink in
  Light), the shadow softened to `rgba(20,20,22,0.18)` in Light.

### STOPPED (part 1)

1. **A reaction picked on a card has nowhere to go.** 11.8 says a long-press
   on a card "opens the same picker as a text bubble (reactions, Reply,
   Report, Remove)", but the pinned 11.8 props carry neither
   `onToggleReaction` nor `onReply` (`{ message, roomId, room, viewerId,
   isMine, night, onCard, onRefresh, onOpenEventChat, onRemove?, onReport?
   }`), and the task pins the signature EXACTLY. `ReactionPicker` always
   draws the emoji row and requires `onPick`. Built: `onPick` closes the
   picker and does nothing; no `onReply` row (undefined). The integration
   review decides: add `onToggleReaction?` / `onReply?` to 11.8 (a one-line
   pass-through in `CardBubble`, then `RoomThread` wires today's reaction
   flow as it does for `MessageBubble`, 11.5), or accept no reactions on
   cards in v1.
2. **The tray's caption for the Officers room is not pinned.** 1.2 gives four
   captions: `Add to the Lounge` / `Add to the Board` / `Add to the event
   chat` / `Add to <room name>` (the composer placeholders follow the same
   four, with `<room name>` "for kind `room`"); `RoomKind` has a fifth kind,
   `officers`, whose `can_post` is true for officers. Built: `officers`
   takes the `<room name>` form (`Add to Officers`, the room's name), the
   only reading that adds no new sentence. Same for the `<nav aria-label>`.

### Log
- 2026-09-30T08:04:42Z notes written; starting compose/CardTray.tsx
- 2026-09-30T08:05:24Z compose/CardTray.tsx written; starting compose/ComposeSheets.tsx
- 2026-09-30T08:05:57Z compose/ComposeSheets.tsx written (renders null); cards/CardBubble.tsx part 1 (props, cardWord, cardAuthorName, HeaderIcon) written
- 2026-09-30T08:06:55Z cards/CardBubble.tsx parts 2 (press) and 3 (render) written; ComposeSheets typed as a const (no unused param); running typecheck + eslint
- 2026-09-30T08:08:06Z gates: typecheck 0, npm test 1590/1590, build 0, eslint 0 (no warnings); S3-gate.md part 1 written; committing
- 2026-09-30T08:08:28Z COMMITTED 36a1ccd feat(chat): CardBubble fallback bubble (W2-S3 first commit). First-commit prelude done; the main S3 builder continues from here (CardSheet + NewPollSheet / NewSignupSheet / ShareEventSheet inside ComposeSheets; PollCardView / SignupCardView / EventCardView routed from CardBubble when card !== null; the aria-live announcements; the STOPPED entries above are its first reading).

## Part 2 — the main batch (cards, the sheet chrome, the three sheets)

Continues from `36a1ccd` (+ `24ca304`, the notes line). Three batches run side by
side on this tree; W2-S3 edits ONLY `messages/cards/*` and `messages/compose/*`.
The siblings' mounts on the branch (kept, name for name): `RoomComposer`
imports `CardTray`, `CardTrayKind`, `ComposeSheets`; `RoomThread` and
`BoardPost` mount `CardBubble` with the 11.8 props.

### Plan (in build order; one commit per step)

1. `cards/card-rules.ts` + `cards/card-rules.test.ts` — pure (no React, no
   DOM): `pollBarWidth`, `votesWord`, `optionAriaLabel` (1.2's three-way
   rule), `pollFooter`, `pollCardLabel`, `signupTwoLine` (14.34: any label
   > 12 characters), `signupCounts`, `signupProgress` (min(Σ capacity, 12)
   segments, else continuous), `openWord`, `takeSpotLabel`, `visibleTakers`
   (3 + `+N`), `signupCardLabel`, `fallbackEventTitle` (between `Event: `
   and ` · `), `eventCardLabel`, `whenParts` (the Share-an-event tile from
   `eventWhen`'s text), `announceVotes` / `announceFilled` / `announceRsvp`.
2. `compose/sheet-rules.ts` + test — `sheetRoomLine` (`<club> · the Lounge`
   …), `shareCta` (`Share to …`), `charCount` (code points, as the route),
   `counterLabel` (`<n> of 200 characters`), `spotsWord`, `pollValid`,
   `signupValid`, `eventValid`.
3. `cards/PollCardView.tsx`, `cards/SignupCardView.tsx`,
   `cards/EventCardView.tsx`; `cards/CardBubble.tsx` dispatches by
   `card.type`, owns the card box (padding per type, the event card's
   `overflow: hidden` and no padding, the 70 % opacity of a closed poll /
   sign-up), the header line (passed to the views as `header`), the ONE
   `aria-live="polite"` span (`visuallyHiddenStyle`) whose text the views set
   through `onAnnounce(text)` after each answer.
4. `compose/CardSheet.tsx` — the shared chrome (a vaul `Drawer.NestedRoot`:
   the composer always sits inside `ClubSpace`'s or `EventChat`'s
   `Drawer.Root`, and a plain root closing inside another drawer runs vaul's
   unlock — ConversationView's note, RsvpSheet's precedent; it is the same
   vaul root with `nested`), `useHideTabBar()`, focus back to
   `returnFocusTo` on unmount, and `useCardPost()` — the one POST with 1.2's
   refusal table (content_blocked / invalid_card outline the named field;
   board_officers_only / room_closed / not_found close; try_again closes +
   `onReload()`; 201 → `onPosted(message)`; a sheet never re-submits after a
   503 because it closes).
5. `compose/NewPollSheet.tsx`, `compose/NewSignupSheet.tsx`,
   `compose/ShareEventSheet.tsx`; `compose/ComposeSheets.tsx` mounts them by
   `kind`.
6. Gates (13.3), `S3-gate.md` part 2, this file's log.

### Props defined for the siblings (unchanged from part 1, plus one optional)

- `CardTray { roomKind, roomName, clubName, open, onClose(), onPick(kind) }`,
  `CardTrayKind = "poll" | "signup" | "event"`.
- `ComposeSheets { kind: CardTrayKind | null, roomId, roomKind, roomName,
  clubName, orgHandle, onClose(), onPosted(message), onReload(),
  returnFocusTo?, orgId? }` — `orgId` is NEW and optional: the 14px club dot
  on the sheet's `<club> · <room>` line (`clubGradient(orgId)`, the same
  colour as the club's avatar) draws only when it is passed (REQUESTS 1).
- `CardBubble`: exactly 11.8's props.

### Decisions read from the contract (not changes)

- The card's own `aria-label` (1.2 gives one example per side): theirs
  `Poll from <Name>: <q>. N voted, names shown | anonymous`; mine `Your
  anonymous poll: <q>. N voted` / `Your poll: <q>. N voted, names shown`;
  closed replaces the count clause with the footer's own words, `Closed, N
  voted`. Sign-up: `Sign-up from <Name>: <title>, K of M spots filled` /
  `Your sign-up: …`. Event: `Event shared by <Name>: …` / `Event you shared:
  …`; cancelled: `… : <fallback title>. This event was cancelled.`
- The vote spinner is a 36 px element with −9 px margins so it takes the
  18 px mark's slot without moving the label (11.8 "a 36px spinner in the
  mark's place"); drawn with SVG SMIL (`animateTransform`), since no
  `className` and no stylesheet keyframe is allowed (11.0).
- The date line of the Event card and the Share-an-event tile use
  `eventWhen(starts_at, deviceZone())` (1.4: "the screens format in the
  device's zone"; the stored fallback text keeps the campus zone).
- A closed event (`state === "closed"`): pills hidden, `Open event chat`
  kept, and the `You'll appear in the event chat.` line hidden too (there is
  nothing to join; 14.41's condition is about the pills' state).
- `Remove <label>` on a blank option reads `Remove Option <i>` (the
  pinned input name); `Spots for <slot>` on a blank slot reads `Spots for
  Slot <i>`.
- The RSVP pills' refusals (`campus_visiting`, `terms_required`, the
  events route's own `not_found` sentence) go through `toastSendFailure`
  as every other refusal (11.0): the chat codes' sentences, else the mapped
  line.

### STOPPED (part 2)

3. **The `content_blocked` toast line.** 1.2 pins the toast as `That
   includes words that aren't allowed on Vibe` (the server's own `error`,
   `moderation/access.ts:138`); 11.0 says every refusal toast goes through
   `toastSendFailure`, whose line for a 422 `content_blocked` is
   `failure-copy.ts:198`'s `That includes words that aren't allowed on Vibe.
   Edit it and try again.` (the code is not in `REFUSAL_SENTENCES`, so
   `chatRefusalLine` answers null and the mapped line shows). Built: the
   sheet shows 1.2's exact sentence (`r.error`, the server's) through
   `toast()` for `content_blocked` alone; every other code goes through
   `toastSendFailure`. The integration review picks one (either add
   `content_blocked` handling to `chatRefusalLine`, or accept the mapped
   line).

### REQUESTS

1. `RoomComposer` (W2-S2): pass `orgId={room.org.id}` (or the space's
   `org.id`) to `ComposeSheets` so the sheet's club dot draws in the club's
   colour. Without it the dot is simply absent (no wrong colour).
2. Contract 11.8 / `RoomThread`: `onToggleReaction?` / `onReply?` on
   `CardBubble` (STOPPED 1 of part 1 stands: a reaction picked on a card
   still only closes the picker).

### Log (part 2)
- 2026-09-30T08:47:17Z part 2 plan written; starting cards/card-rules.ts
- 2026-09-30T08:48:36Z cards/card-rules.ts part 1 (poll, sign-up) written
- 2026-09-30T08:49:16Z cards/card-rules.ts part 2 (event, announcements, share rows) written; writing its test
- 2026-09-30T08:49:16Z compose/sheet-rules.ts written
- 2026-09-30T08:50:26Z cards/card-rules.test.ts written
- 2026-09-30T08:50:26Z compose/sheet-rules.test.ts written; running the two tests
- 2026-09-30T08:51:06Z card-rules: endSentence for names/questions ending in punctuation; both tests green
- 2026-09-30T08:53:26Z cards/card-parts.tsx written (castVote, discs, marks, SMIL spinners, footer icons); starting PollCardView
- 2026-09-30T08:53:55Z cards/PollCardView.tsx written; starting SignupCardView
- 2026-09-30T08:54:30Z cards/SignupCardView.tsx part 1 written
- 2026-09-30T08:55:22Z cards/SignupCardView.tsx part 2 written; starting EventCardView
- 2026-09-30T08:55:22Z cards/EventCardView.tsx written; rewriting CardBubble with the dispatch
- 2026-09-30T08:55:50Z cards/CardBubble.tsx part 1 (props, helpers, HeaderLine) rewritten
- 2026-09-30T08:56:21Z cards/CardBubble.tsx part 2 (dispatch, aria-live span, the box per type) written; typecheck + eslint on the cards files
- 2026-09-30T08:57:40Z renderers: typecheck 0, eslint 0, npm test 1637/1637; committing
- 2026-09-30T08:59:27Z COMMITTED 65c38ed feat(chat): the three card renderers and the card rules (wave 2, W2-S3); starting compose/CardSheet.tsx
- 2026-09-30T08:59:27Z compose/CardSheet.tsx part 1 (useCardPost, props) written
- 2026-09-30T09:00:07Z compose/CardSheet.tsx part 2 (the chrome, icons, fieldStyle, FieldLabel, Counter) written
- 2026-09-30T09:00:50Z compose/CardSheet.tsx part 3 (AddButton, RemoveButton, Switch) written; starting NewPollSheet
- 2026-09-30T09:00:51Z compose/NewPollSheet.tsx written
- 2026-09-30T09:02:08Z compose/NewSignupSheet.tsx written
- 2026-09-30T09:02:08Z compose/ShareEventSheet.tsx written
- 2026-09-30T09:02:08Z compose/ComposeSheets.tsx filled (mounts the three sheets by kind); typecheck + eslint
- 2026-09-30T09:03:35Z sheets: typecheck 0, eslint 0 (no warnings after copying the + ref at mount), npm test 1637/1637; committing
- 2026-09-30T09:03:42Z COMMITTED 177974d feat(chat): card sheet chrome and the three sheets (wave 2, W2-S3); running npm run build

### Built (part 2, for the reviewer)

- `cards/CardBubble.tsx` routes `card.type` → `PollCardView` /
  `SignupCardView` / `EventCardView`; owns the box (padding per type, the
  Event card full-bleed, 70 % when closed), the header line, the one
  `aria-live` span; `card === null` keeps the fallback bubble; the 500 ms
  press → `ReactionPicker` (Report, Remove) is unchanged from part 1.
- `cards/PollCardView.tsx`: radiogroup / checkboxes, 44px hits around 36px
  rows, bar `count / max(total_voters, 1)`, the mark, `Your pick`, two 20px
  voters (none when anonymous), the count; footer variants; `PUT …/vote {
  option_id, on: !mine }` with the 36px spinner in the mark's slot and NO
  optimistic change; `poll_closed` closes locally, `not_found` →
  `onRefresh`.
- `cards/SignupCardView.tsx`: one-line vs two-line (any label > 12
  characters), chips + `+N` over 3 visible, `Leave` when mine else `Full`
  else `<K> open` + `Take a spot` (first open row coral), the footer
  segments (≤ 12) or bar, `<taken> of <total> filled`; `slot_full` /
  `not_found` → toast + `onRefresh`.
- `cards/EventCardView.tsx`: the 48px band, title 19/700 Fraunces, `<place>
  · <eventWhen>`, the note, `Your RSVP` group with `aria-pressed` pills →
  `PUT` / `DELETE /api/events/<id>/rsvp` then `onRefresh(created_at)`, the
  appear line, `<N> going`, `Open event chat`; `event === null` → the
  fallback title + `This event was cancelled.`; closed → pills hidden.
- `compose/CardSheet.tsx`: the shared chrome and `useCardPost` (the
  refusal table of 1.2; never a re-submit after a 503).
- `compose/NewPollSheet.tsx`, `NewSignupSheet.tsx`, `ShareEventSheet.tsx`:
  every field, counter, stepper, switch, limit, helper line and label of
  1.2 / 11.7; the bodies exactly as 11.7 sends them; the Share sheet reads
  `GET /api/orgs/<handle>/space?events=1` on open with skeleton / empty /
  `LoadFailed compact` states and the CTA disabled until a pick.
- Fallback `failure` lines for non-refusals (not contract copy; only a
  network failure or a 5xx shows them): `Couldn't save your vote.`,
  `Couldn't post your poll.`, `Couldn't post your sign-up.`, `Couldn't share
  this event.`, and RsvpSheet's two RSVP lines reused on the Event card.

Where a reviewer should look first: `compose/CardSheet.tsx` `useCardPost`
(the refusal table and the no-re-submit guard), `cards/PollCardView.tsx`
`vote` (no optimistic change; the 36px spinner), `cards/card-rules.ts`
`optionAriaLabel` / `signupProgress` / `fallbackEventTitle`, and the
STOPPED entries above (1: reactions on cards have no handler in the pinned
props; 2: the Officers caption; 3: the `content_blocked` toast line).
- 2026-09-30T09:04:42Z build exit 0 (attempt 1); S3-gate.md part 2 and the Built summary written; committing the docs
- 2026-09-30T09:04:59Z COMMITTED db5cb2c docs(chat): S3 gate record part 2, notes, STOPPED and REQUESTS (wave 2, W2-S3). W2-S3 main batch done: commits 65c38ed, 177974d, db5cb2c on top of 36a1ccd / 24ca304.

## Part 3 — the repair after the four reviews (one pass)

Continues from `e8435f9` on the shared tree. Reads `S3-review-contract.md`,
`S3-review-security.md`, `S3-review-behaviour.md`, `S3-review-design.md`;
every finding verified against the tree, the contract and the mockups; the
verdicts and the gates go to `S3-repair.md`. Edits ONLY `messages/cards/*`
and `messages/compose/*` (13.2).

### Plan

1. `cards/CardBubble.tsx`: clear the 500 ms timer on unmount (B2); the
   announcement re-reads an identical text (a zero-width toggle in the one
   span, B4 / D5); the border from `t.hairline` (D6); `cardWord` /
   `cardAuthorName` move to `card-rules.ts` with tests (B7).
2. `cards/PollCardView.tsx`, `cards/SignupCardView.tsx`: `poll_closed` →
   `onCard(messageId, { ...card, closed: true })`, no local flag (C2 / B1);
   `Your pick` and the picked count in `t.coralMark` (D1); chips clip at a
   chip's edge, never mid-name (D7, no rule change).
3. `cards/EventCardView.tsx`: the band name's `maxWidth` (D3; 156, not the
   review's 176: the peach radial tint lowers the ratio further).
4. `compose/CardSheet.tsx`: `aria-modal="true"` (C1 / D2); no close while a
   POST is in flight (SEC1); `try_again` closes then reloads (C4); `ctaGap`
   (D8).
5. The three sheets: no `maxLength` (SEC2 / B6: the counter and the validity
   rules carry the code-point limit); `<n> spots` spoken from a visually
   hidden span (B5).
6. Gates, `S3-repair.md`, this log.

### STOPPED (part 3)

4. **`You'll appear in the event chat.` on a closed event.** 1.2 / 11.8 /
   14.41 pin the line's condition as `viewer_status === null && room_id ===
   null`; 11.8 also hides the pills when `state === "closed"` and places the
   line "under the pills". Built (part 2, kept here): the line is hidden too
   when `state === "closed"` (`showAppearLine`, a third clause). Part 2 filed
   it under "Decisions read from the contract"; S3-CONTRACT-3 is right that
   it is a change to a pinned rule: the integration review keeps the clause
   (and 14.41 gains it) or drops it.

### REQUESTS (part 3)

3. Integration review (S3-DESIGN-7): at 292px a single-line sign-up row holds
   about two chips beside the pill; 11.8 pins `+N` past 3 visible takers.
   Built: chips now clip at a chip's edge (whole chips, never mid-name), the
   count rule untouched. If a `+N` after two chips is wanted on the
   single-line row, 11.8's "3" changes.

### Log (part 3)
- 2026-09-30T10:09:18Z part 3 plan written; reviews read, D1/D3 contrast recomputed (D3 needs maxWidth 156, not 176); starting card-rules.ts (cardWord / cardAuthorName)
- 2026-09-30T10:10:23Z card-rules.ts (cardWord / cardAuthorName moved in), CardBubble.tsx (timer cleanup, announce toggle, hairline border) written; starting the tests and the three views
- 2026-09-30T10:11:02Z card-rules.test.ts (+2 tests, 16/16), PollCardView / SignupCardView (closed through onCard, coralMark, chip line), EventCardView (band name maxWidth 156) written; starting compose/*
- 2026-09-30T10:11:11Z compose/CardSheet (aria-modal, close guard, try_again onClose, ctaGap), NewPollSheet / NewSignupSheet / ShareEventSheet (no maxLength, spoken spots, ctaGap 10) written; running typecheck + eslint + rule tests
- 2026-09-30T10:11:44Z gates: typecheck 0, eslint 0 (max-warnings 0), npm test 1639/1639; running npm run build
- 2026-09-30T10:13:15Z build exit 0 (attempt 1); S3-repair.md and S3-gate.md part 3 written; committing the code and the docs
- 2026-09-30T10:13:24Z COMMITTED 673c25b fix(chat): W2-S3 repair after review (10 files + S3-repair.md, S3-gate.md part 3, this file). Repair done: 15 FIXED (one docs-only), 0 REJECTED, 4 DEFERRED (B3 = STOPPED 1, D4 accepted on both sheets, D7's count rule = REQUESTS 3, D9 = REQUESTS 1); gates typecheck 0 / test 1639 / build 0 / eslint 0.
