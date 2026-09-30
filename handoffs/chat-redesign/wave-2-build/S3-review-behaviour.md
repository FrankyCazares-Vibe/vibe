# W2-S3 review — lens "behaviour"

Reviewer of commits 65c38ed, 177974d, db5cb2c, e8435f9 (W2-S3). Read-only on
the tree except this file. Method: walk every screen by reading the code
against the contract (1.2, 1.3, 1.4, 8.1, 9.3, 11.0, 11.7-11.10, 12, 14), the
mockups (W0_Tray, W0_Cards, W0_NewPoll, W0_NewSignup, W0_ShareEvent) and the
backend routes on the branch; run the gates myself.

## Log
- started: contract map, notes, gate, commits read
- read: 1.2 Cards + tray/sheets, 1.3, 1.4, 4.1-4.3, 8.1, 9.3, 10.2, 11.0, 11.7, 11.8, 14; MK:7-11; every file under cards/ and compose/; the vote route, the cards route, the rsvp route, request.ts, send-failure.ts, failure-copy.ts:198, access.ts:138, v2-tokens.ts, use-hide-tabbar.ts, RoomComposer/RoomThread/BoardPost mounts, vaul 1.1.2 dist (nested root)
- gates run by me: typecheck exit 0; npm test 1637/1637; npm run build exit 0 (one run); eslint cards/ compose/ --max-warnings 0 exit 0

## Verdict

**PASS with repairs** — nothing HIGH. The walk holds end to end (tray → sheet
→ 201 → `append`, the refusal table, the vote spinner with no optimistic
change, the returned card replacing, single / multi / anonymous / closed,
`slot_full` / `not_found` → refresh, Going ↔ DELETE, the appear line, Open
event chat, cancelled, closed, the Share sheet's three states, every control
a labelled button). Three MEDIUMs to repair (1, 2 are one-line each; 3 is
the integration review's), four LOWs.

## Findings

### S3-BEHAVIOUR-1 — MEDIUM — a `poll_closed` refusal closes the card in the footer but not at 70 %
- where: `src/components/mobile/messages/cards/PollCardView.tsx:47,67` and
  `cards/SignupCardView.tsx:62,88`; `cards/CardBubble.tsx:198`.
- what: 11.8 pins "`poll_closed` also marks the card closed locally" and
  "`Closed · <N> voted` with the whole card at 70% and no taps when
  `closed`". The views keep `closedLocally` in their own state, so the
  footer, the label (`Closed, N voted`) and the tap guard follow it — but the
  bubble draws the 70 % from `card.closed` (the prop, line 198), which the
  refusal never touches. Until the next full read the card reads "Closed" at
  full opacity: the two halves of one pinned state disagree.
- fix: drop `closedLocally` in both views; on `r.code === "poll_closed"`
  call `onCard(messageId, { ...card, closed: true })` (the hook's
  `replaceCard`, the same path a vote's answer takes). The bubble then reads
  `card.closed`, draws 70 %, the footer and label follow, and the every-5th
  full read confirms it. (`const closed = card.closed;` then.)

### S3-BEHAVIOUR-2 — MEDIUM — the 500 ms long-press timer is not cleared on unmount
- where: `src/components/mobile/messages/cards/CardBubble.tsx:123-151` (no
  `useEffect` cleanup anywhere in the file).
- what: the task's checklist item. A card that unmounts inside the 500 ms
  window after a pointer-down (a merge that drops it, a room-chip tap in the
  same gesture, the layer closing) lets the timer fire: `navigator.vibrate(8)`
  and `setPickerOpen(true)` on an unmounted component. `MessageBubble` (moved
  code, untouchable) has the same gap, so this is the precedent copied, not
  a regression — but `CardBubble` is new and the fix is three lines.
- fix: after the refs,
  `useEffect(() => () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); }, []);`
  (import `useEffect`). Hooks order stays: it sits above the first handler.

### S3-BEHAVIOUR-3 — MEDIUM — the picker's emoji row on a card is a dead control (STOPPED 1 judged RIGHT; the integration review owns the fix)
- where: `src/components/mobile/messages/cards/CardBubble.tsx:275-300`
  (`onPick={() => setPickerOpen(false)}`, no `onReply`).
- what: 11.8 says the long-press opens "the same picker as a text bubble
  (reactions, Reply, Report, Remove)" but pins props with no reaction or
  reply handler. `ReactionPicker` always draws the emoji row and requires
  `onPick`, so a tap on an emoji closes the picker and does nothing — a
  silent no-op the viewer cannot tell from a failure. The builder could not
  fix this without changing a pinned signature; stopping was right.
  `RoomThread.tsx:337-340` already has `toggleReaction(m, emoji)` and
  `onReply(replyTargetOf(m, isMine))` wired for `MessageBubble`.
- fix (integration review): add `onToggleReaction?(emoji: string): void` and
  `onReply?(): void` to 11.8's `CardBubble` props; in `CardBubble` pass
  `onPick={(emoji) => { setPickerOpen(false); onToggleReaction?.(emoji); }}`
  and `onReply={onReply && !temp ? () => { setPickerOpen(false); onReply(); } : undefined}`;
  `RoomThread` and `BoardPost` pass the two they already have. Until then,
  the handoff must name it (a reaction on a card does nothing).

### S3-BEHAVIOUR-4 — LOW — the live region does not re-announce an identical text
- where: `cards/CardBubble.tsx:122,272` with `PollCardView.tsx:60`,
  `SignupCardView.tsx:80`, `EventCardView.tsx:82`.
- what: one polite span, set once per answer — correct. But `aria-live`
  speaks only on a DOM change: on a multi poll picking A then B both answer
  `1 voted` (the same person), and a sign-up's Leave then Take can answer the
  same `K of M filled`, so the second answer is silent. The strings are
  pinned (1.2); only the delivery is at stake.
- fix: in the bubble, `setAnnounce("")` then the text on the next frame
  (`requestAnimationFrame(() => setAnnounce(text))`), or key the span by an
  answer counter so React replaces the node.

### S3-BEHAVIOUR-5 — LOW — `<n> spots` is an `aria-label` on a generic span
- where: `compose/NewSignupSheet.tsx:152`.
- what: 1.2 pins the string `<n> spots` (`1 spot`); the builder put it as
  `aria-label` on a plain `<span>` — exactly what the mockup does
  (`W0_NewSignup`, MK:10), so no contract break. But `aria-label` on a
  generic element is not read by VoiceOver / TalkBack (ARIA 1.2 prohibits
  naming `generic`), so the stepper speaks `Spots for Mon 11–12` and then a
  bare `2`. The `Counter`'s `aria-label` (`CardSheet.tsx:294`) is the same
  pattern but is pinned by 1.2 as an `aria-label`; noted for the design /
  a11y review, not changed.
- fix: keep the visible number and add a visually hidden suffix inside the
  span: `{row.capacity}<span style={visuallyHiddenStyle}>{row.capacity === 1 ? " spot" : " spots"}</span>`
  (drop the `aria-label`; `spotsWord` stays for the tests).

### S3-BEHAVIOUR-6 — LOW — the option / slot `maxLength` is a literal
- where: `compose/NewPollSheet.tsx:120`, `compose/NewSignupSheet.tsx:145`
  (`maxLength={80}`).
- what: `LABEL_MAX` exists in `sheet-rules.ts:13` and drives `labelValid`;
  the inputs repeat the number. Harmless today; drifts if the limit moves.
- fix: `maxLength={LABEL_MAX}` (import it).

### S3-BEHAVIOUR-7 — LOW — `cardWord` / `cardAuthorName` have no test
- where: `cards/CardBubble.tsx:62-76`.
- what: the two pure helpers (the header word from `card.type`, else the
  kind, else the `Sign-up:` prefix; `You` / name / handle / `Someone`) live
  in a `"use client"` `.tsx` and are untested; every other rule of the batch
  is (23 tests). The `Sign-up:` prefix reading in particular is the only
  place the fallback text's shape is relied on for a word.
- fix: move both to `cards/card-rules.ts` (pure, `Pick<ChatMessage, …>`
  input) and add two tests; `CardBubble` imports them.

## STOPPED / SIBLING entries, judged

- **STOPPED 1 (a reaction on a card has nowhere to go)** — RIGHT. The pinned
  11.8 props carry no handler and `ReactionPicker` cannot hide its emoji row;
  improvising a prop would have changed a pinned signature. Carried above as
  S3-BEHAVIOUR-3 for the integration review (the dead row is user-facing).
- **STOPPED 2 (the Officers caption)** — RIGHT. 1.2 gives four captions and
  `RoomKind` has five kinds; `Add to Officers` (the room's own name) is the
  only reading that adds no sentence, and it matches S2's
  `composerPlaceholder` (`club/helpers.ts:267-269`, `Message Officers`) and
  `sheetRoomLine` / `shareCta` (`Salsa Club · Officers`, `Share to Officers`,
  tested). One reading everywhere.
- **STOPPED 3 (the `content_blocked` toast line)** — RIGHT, a real
  contradiction: 1.2 pins the toast as `That includes words that aren't
  allowed on Vibe` (the server's `error`, `access.ts:138`), 11.0 routes every
  refusal toast through `toastSendFailure`, whose line for a 422
  `content_blocked` is `failure-copy.ts:198`'s longer sentence (the code is
  not in `REFUSAL_SENTENCES`, so `chatRefusalLine` answers null). The builder
  showed 1.2's literal (`r.error?.trim() || CONTENT_BLOCKED_LINE`,
  `CardSheet.tsx:88`) and sent every other code through `toastSendFailure`.
  The integration review picks; either way it is one line.
- No SIBLING entry was written; none was needed (typecheck was clean
  repo-wide when I ran it).

## Holds (walked by reading, against the contract, the mockups and the code)

- The tray: `<nav aria-label>` = the caption (four forms + Officers), three
  72px `<button>` rows with 1.2's exact titles and lines, the scrim
  `palette.scrim` (Night `rgba(8,7,7,0.5)`, Light `rgba(20,20,22,0.35)`), a
  row → `onPick` (closes the tray, opens the sheet), the scrim → `onClose`;
  `useNightTheme()` before the `!open` return; mounted only when
  `viewer.can_post` (`RoomComposer.tsx:153-161` returns the tile first).
- New poll: two empty rows → `pollValid` false → CTA `aria-disabled` (the
  muted chrome); the question `maxLength` 200 with `<n> / 200` and
  `aria-label="<n> of 200 characters"`; `Add option` disabled at 10, `Remove
  <label>` (`Remove Option 2` when blank) hidden at 2; `Anonymous` and
  `Allow more than one answer` as `role="switch" aria-checked
  aria-labelledby [aria-describedby]` with the exact help line; the body
  `{ type: "poll", question, options: [{ label }], anonymous, multi }`, no
  `closes_at`; `cleanText` = the route's collapse.
- New sign-up: one row, stepper 1–50 default 2 (`Spots for <slot>` /
  `Spots for Slot 1`, `One less spot` / `One more spot`, arms `aria-disabled`
  at the bounds), `Add slot` to 10, `Remove <slot>` down to 1, `1 to 10
  slots`, the helper line; body `{ type: "signup", question: title,
  options: [{ label, capacity }] }`.
- Share an event: `GET /api/orgs/<handle>/space?events=1` on mount and on
  Retry (`live` flag cleanup; the state set only in the callback);
  skeleton (two 66px bars) / `No upcoming events.` / `LoadFailed compact
  tone={night ? "dark" : "light"}` with `Couldn't load your events.`; the CTA
  disabled in all three and until a pick; rows `role="radio" aria-checked`
  in a `radiogroup` labelled `Upcoming events`, the label `<title>,
  <Thursday October 8, 7:30 PM>[, <place>][, selected]`, the 44×48 tile
  from `eventWhen` in the device zone; the note `aria-label="Add a line,
  optional"`, `placeholder="Add a line (optional)"`, counter; `Share to
  <room>` (four forms); body `{ type: "event", event_id, note? }` (the note
  only when non-blank); `New event · Officers only` not built (14.19).
- `useCardPost`: one POST; `posting` disables the CTA and shows `Posting…`;
  201 → `onPosted(message)` → RoomComposer `setSheet(null)` + `append` +
  scroll; `content_blocked` → the toast + `field` outlined (`options.2` →
  the third option's `aria-invalid` and coral 1.5px border, cleared on the
  next edit); `invalid_card` → its sentence + the field; `board_officers_only`
  / `room_closed` / `not_found` → the sentence and `onClose`; `try_again` →
  the sentence and `onReload` (RoomComposer closes the sheet and calls
  `poll.reload()`); `doneRef` makes a second tap after any of those a no-op —
  the form is never re-submitted from the same sheet (N8). Other failures
  (401, 403 "Not a member", 429, network) toast the mapped line and the sheet
  stays.
- `CardSheet`: `Drawer.NestedRoot` inside ClubSpace's / EventChat's
  `Drawer.Root` (vaul throws otherwise; both roots are on the branch),
  `Drawer.Title` = `aria-labelledby`, Radix gives `role="dialog"
  aria-modal`; the 40×5 handle, 25px/800 title, `<club> · <room>` line, 44px
  `Close`, 50px gradient CTA, `useHideTabBar()`; the focus effect reads the
  "+" once at mount and focuses it on unmount (the "+" outlives the sheet;
  `onCloseAutoFocus` prevented so Radix does not fight it). Checked in vaul
  1.1.2: a `NestedRoot` mounted with `open` never changes value, so
  `useControllableState.onChange` never fires `onNestedOpenChange(true)` —
  the parent drawer is not scaled, and closing by unmount (a 201) leaves no
  lingering transform. The same pattern as `RsvpSheet` and the old
  `MuteDurationSheet`.
- Poll card: `role="radiogroup"` + `role="radio" aria-checked` (multi:
  `group` + `checkbox`), each a 44px `<button>` around the 36px row, bar
  `round(count / max(total_voters, 1))` %, coral disc + check when `mine`
  else the grey ring, `Your pick`, two 20px voters (none when anonymous), the
  count; footer `<N> voted · names shown | anonymous` / `Closed · <N>
  voted`; tap → `PUT …/vote { option_id, on: !mine }`, no optimistic change,
  the 36px SMIL spinner in the mark's slot (−9px margins, nothing moves), the
  other options `aria-disabled` while busy; the answer's `card` → `onCard`
  (`replaceCard`) and `<N> voted` announced; a missing card → `onRefresh`;
  `not_found` → `onRefresh(created_at)`; closed → no taps (the guard and
  `aria-disabled`), the bubble at 70 %.
- Sign-up card: two-line when any label > 12 code points; chips 3 + `+N`
  (visible takers only); `Leave` (outlined, `Leave <slot>`) when `mine`,
  else `Full` (a span, not a control), else `<K> open` + `Take a spot`
  (`Take a spot in <slot>, K spots open`, `1 spot open`), the first open row
  coral; `on: true` / `on: false`; `slot_full` → toast + refresh; footer
  segments ≤ 12 else the bar, `<taken> of <total> filled`, `<taken> of
  <total> filled` announced.
- Event card: the 48px band from `room.org` (none when `room` is null), the
  19px/700 Fraunces title, `<place> · <eventWhen(device zone)>`, the note
  when `!== null`, `role="group" aria-label="Your RSVP"` with `aria-pressed`
  pills; Going → `PUT { status: "going" }`, Going again → `DELETE`, Maybe
  while going → `PUT { status: "maybe" }` (the route upserts), then
  `onRefresh(created_at)` (`refreshOne` re-reads that row) and `You're going`
  / `You said maybe` / `RSVP removed`; refusals (`campus_visiting`,
  `terms_required`, the events route's own `not_found` sentence) through
  `toastSendFailure`; the appear line while `viewer_status === null &&
  room_id === null` and not closed; `<N> going`; `Open event chat` (44px)
  when `room_id !== null` → `onOpenEventChat(room_id)`; cancelled →
  `fallbackEventTitle(content)` + `This event was cancelled.`, no buttons;
  closed → pills hidden, `Open event chat` kept. Hooks before the
  `event === null` return.
- CardBubble: exactly the 11.8 props; header `<Name> · Poll | Sign-up |
  Event` (`You` / `Someone`); theirs with the 28px avatar and `18 18 18 6`,
  mine right-aligned `18 18 6 18`, 292px, the event card full-bleed with
  `overflow: hidden`; the one `aria-live="polite"` span per card, present
  from the first render; the press: primary button only, 10px drift cancels,
  `contextmenu` suppressed, the click after a fired press swallowed in the
  capture phase (so the vote / pill under the finger does not fire);
  `ReactionPicker` with Report / Remove only when not `temp_`.
- Rules: every string of 1.2 "Cards" and "The tray and the three sheets"
  appears verbatim (checked one by one against the code and the tests); no
  Discord word; no `className`; tokens from `palette(night)`, `SERIF` /
  `FONT`; inputs 16px; every control ≥ 44px; no new dependency; 10.2 rule 5
  respected (no moved file touched: `git diff a9355d1 --stat` for the batch
  lists only `cards/*`, `compose/*` and the two docs).
- Gates (mine, on this tree): typecheck 0 · test 1637/1637 · build 0 ·
  eslint 0 (the batch's two directories). S2's `RoomComposer` / `RoomThread`
  / `BoardPost` import `CardTray`, `ComposeSheets`, `CardBubble` by the pinned
  names and typecheck together.

## Log (end)
- review written; findings 7 (0 HIGH, 3 MEDIUM, 4 LOW); verdict PASS with repairs
