# W2-S3 review — lens "contract"

Reviewed commits `65c38ed`, `177974d`, `db5cb2c`, `e8435f9` (plus the first-commit
files `CardTray.tsx` / `ComposeSheets.tsx` / `CardBubble.tsx` they build on), read
against `wave-2-contracts.md` 1.2 (Cards / tray / sheets), 1.3, 1.4, 11.0, 11.7,
11.8, 14 (26, 34, 41, 44) and the mockups map MK:7–11; the routes on the branch
(`cards/route.ts`, `cards/[messageId]/vote/route.ts`, `orgs/[slug]/space/route.ts`,
`events/[id]/rsvp/route.ts`), `send-failure.ts`, `request.ts`, `LoadFailed.tsx`,
`moderation/access.ts:134-144`, `failure-copy.ts:196-200`, and the sibling's
mount (`club/RoomComposer.tsx:237-338`, read only).

## Gates (re-run by the reviewer, 2026-09-30)

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0 |
| tests | `npm test` | 1637 / 1637 pass, 0 fail |
| build | `npm run build` | exit 0, first attempt |
| eslint | `npx eslint src/components/mobile/messages/cards/ src/components/mobile/messages/compose/` | exit 0, no warnings |

`S3-gate.md` is accurate. No moved file was edited (10.2 rule 5); the four commits
touch only `messages/cards/*`, `messages/compose/*` and the S3 notes (13.2).

## Verdict

PASS with two MEDIUM fixes (one a11y attribute, one state that does not reach
the bubble) and two LOW notes. No HIGH: no string, size, token, route, payload
field or code of the contract is changed; no hooks-rule break; every gate green.

## Findings

### S3-CONTRACT-1 — MEDIUM — `compose/CardSheet.tsx:157`
**What.** 11.0 pins sheets as `role="dialog" aria-modal="true" aria-labelledby`.
`Drawer.Content` (vaul over Radix Dialog) emits `role="dialog"` and
`aria-labelledby={titleId}` (`@radix-ui/react-dialog/dist/index.mjs:223-226`) but
never `aria-modal` (no occurrence in vaul's or Radix's dist). The file's own
comment (`:23`) assumes vaul provides all three.
**Fix.** Add `aria-modal="true"` to the `<Drawer.Content …>` props (it passes
through to the DOM node). (The same gap exists in W2-S2's `RsvpSheet.tsx:69`;
outside this batch, noted for the integration review.)

### S3-CONTRACT-2 — MEDIUM — `cards/PollCardView.tsx:67`, `cards/SignupCardView.tsx:88` vs `cards/CardBubble.tsx:198,261`
**What.** 11.8: `Closed · <N> voted` "with the whole card at 70% and no taps when
`closed`", and "`poll_closed` also marks the card closed locally". After a
`poll_closed` refusal the view sets `closedLocally`: the footer reads `Closed · …`
and taps stop, but the 70% lives in `CardBubble`, which reads `card.closed`
only — the card stays at full opacity until the next `?after=` / full read
replaces it. Half of the pinned closed state is missing for the local case.
**Fix.** Drop `closedLocally` in both views and, on `poll_closed`, call
`onCard(messageId, { ...card, closed: true })` (the room's `replaceCard` then
carries `closed`, so the bubble's opacity, the footer and the no-taps rule all
follow from one source, and the state survives the next render of the list).
Equivalent alternative: lift the flag into `CardBubble` and pass `onClosed()`.

### S3-CONTRACT-3 — LOW — `cards/card-rules.ts:214-216` (`showAppearLine`)
**What.** 1.2, 11.8 and 14.41 pin the rule as exactly
`viewer_status === null && room_id === null`. The built rule adds
`event.state !== "closed"`. The narrowing is sensible (the pills are hidden on a
closed event, so "You'll appear in the event chat." would promise nothing), but
it is a change to a pinned rule and the notes file it under "Decisions read from
the contract (not changes)" instead of STOPPED.
**Fix.** Keep the clause; move the entry to STOPPED (part 2, item 4) so the
integration review rules on it and 14.41 gets the third clause if accepted.

### S3-CONTRACT-4 — LOW — `compose/CardSheet.tsx:102-106` (`useCardPost`, `try_again`)
**What.** 11.7 / 1.2: on a 503 "the sheet closes, the room calls `reload()`".
The hook calls `onReload()` only and sets `doneRef`; the sheet closes because
`RoomComposer.tsx:333-336` does `setSheet(null)` inside `onReload` (and
`ComposeSheets`' doc asks for that). Correct on the branch, but a mounter that
wires `onReload` to a bare `reload()` would leave a sheet open whose CTA is
dead for good.
**Fix.** In the `try_again` case call `onClose()` before `onReload()` (both are
idempotent `setSheet(null)` calls on the branch), so the close is the hook's
own, as the sentence reads.

## STOPPED / REQUESTS — were they right?

- **STOPPED 1 (a reaction picked on a card has nowhere to go).** Right. 11.8's
  prose ("the same picker as a text bubble (reactions, Reply, Report, Remove)")
  contradicts its own pinned props (no `onToggleReaction` / `onReply`), and the
  task pins the signature exactly. Building nothing on `onPick` and no `Reply`
  row is the only non-improvised reading. For the integration review: the
  one-line pass-through the builder proposes (`onToggleReaction?` on
  `CardBubble`, wired in `RoomThread` as for `MessageBubble`) is the cheap fix;
  `onRefresh(created_at)` after a direct call to the reactions route would also
  work without a prop change, but it re-reads the message instead of reusing
  the room's reaction flow.
- **STOPPED 2 (the Officers caption).** Right. 1.2 gives four captions for five
  `RoomKind`s; `Add to <room name>` for `officers` (`Add to Officers`) is the
  reading that adds no sentence. `sheetRoomLine` and `shareCta` take the same
  reading (`<club> · Officers`, `Share to Officers`), consistently.
- **STOPPED 3 (the `content_blocked` line).** Right, and the built choice is the
  better one: 1.2 pins the exact string (`That includes words that aren't allowed
  on Vibe`, the server's own `error`, `access.ts:138`), while `toastSendFailure`
  would show `failure-copy.ts:198`'s longer mapped line because
  `content_blocked` is not in `REFUSAL_SENTENCES`. The sheet shows `r.error`
  and falls back to the same literal. For the integration review: either add
  `content_blocked` to `chatRefusalLine`'s table (then this one `toast()` call
  becomes `toastSendFailure` and 11.0 holds to the letter) or accept.
- **SIBLING.** None recorded; none was needed (typecheck green on my run too).
- **REQUESTS 1 (`orgId` for the club dot).** Right to request rather than
  guess: the 14px dot is the mockup's (MK:9), not pinned by 11.7; without the
  prop the line reads `<club> · the Lounge` with no dot, no wrong colour.
  `RoomComposer.tsx:320-338` does not pass it today.
- **REQUESTS 2** = STOPPED 1.

## Holds (checked line by line; each is as the contract pins it)

**1.2 Cards.** Header `<Name> · Poll | Sign-up | Event`, `You` when mine,
`Someone` when `users` is null (`CardBubble.tsx:62-76`); label `Poll from
someone: …` via `authorForLabel = null` (`:190`). Poll: `Your pick`; `1 vote` /
`N votes`; option label = `<label>[, your pick]. N votes` + `: A and B.` (every
visible voter) · `, including A and B.` (more exist) · `.` alone (anonymous or
nobody) — `optionAriaLabel` reproduces MK:7.1's two examples exactly, the
`Priya S.` case included (`endSentence`); footer `<N> voted · names shown |
anonymous`, `Closed · <N> voted`; card labels `Poll from <Name>: <q>. N voted,
names shown` / `Your anonymous poll: <q>. N voted` (MK:7.1, 7.2 verbatim).
Sign-up: `Full` · `<K> open` (`1 open`) · `Take a spot` with `Take a spot in
<slot>, K spots open` on the raw label (`1 spot open`, as MK:7.3's own label) ·
`Leave` / `Leave <slot>` on a `mine` slot, full or not; footer `<taken> of
<total> filled`, `Closed · …`; card label `Sign-up from <Name>: <title>, K of M
spots filled`; no `+N` for hidden people (only `option.voters` is counted).
Event: band with the club name, `<place> · <Thu Oct 8, 7:30 PM>` (place omitted
when empty), the note line, `Going` / `Maybe` `aria-pressed` in `role="group"
aria-label="Your RSVP"`, the 12px `--ink-2` appear line, `<N> going`, `Open
event chat` when `room_id`; cancelled = band + fallback title + `This event was
cancelled.` and no buttons; label `Event shared by <Name>: <title>, <place>,
<Thursday October 8, 7:30 PM>. N going, you're going` (MK:7.4 verbatim).
Announcements `<N> voted` · `<taken> of <total> filled` · `You're going` / `You
said maybe` / `RSVP removed`, ONE `aria-live="polite"` span per card with
`visuallyHiddenStyle` (`CardBubble.tsx:272`).

**1.2 Tray and sheets.** `<nav aria-label="Add to the Lounge">` + the four
captions; `Poll — Ask the room a question`, `Sign-up — Shifts, rides, who brings
what`, `Event — Share an event with Going / Maybe`. `New poll`, `<club> · the
Lounge` / `· the Board` / `· <event title>` / `· <room>`, `Question`, `<n> / 200`
with `aria-label="<n> of 200 characters"`, `Options`, `Option <i>`, `Remove
<label>` (blank → `Remove Option <i>`), `Add option`, `2 to 10 options`,
`Anonymous` + `Off: the room sees who picked what. On: counts only.`, `Allow more
than one answer`, both `role="switch" aria-checked aria-labelledby`, `Post poll`,
close `aria-label="Close"`. `New sign-up`, `Title` + counter, `Slots` / `Spots`,
`Slot <i>`, stepper `role="group" aria-label="Spots for <slot>"` with `One less
spot` / `One more spot` / `<n> spots` (`1 spot`), 1–50 default 2, `Remove <slot>`
down to 1, `Add slot` up to 10, `1 to 10 slots`, `Names show to everyone in this
room.`, `Post sign-up`. `Share an event`, `Upcoming events` `role="radiogroup"`
of `role="radio" aria-checked` rows, label `<title>, <Thursday October 8, 7:30
PM>[, <place>][, selected]` (MK:11 verbatim), `No upcoming events.`, `Couldn't
load your events.` as `LoadFailed compact` with `tone`, Retry re-reads, CTA
disabled in the loading / empty / failed states; `Add a line (optional)` with
`aria-label="Add a line, optional"` + counter; `Members who tap Going or Maybe
join the event chat.`; `Share to the Lounge` / `the Board` / `the event chat` /
`<room>`; `Posting…` in flight; no `New event · Officers only` (14.19).

**11.7 bodies.** Poll `{ type: "poll", question, options: [{ label }],
anonymous, multi }` — no `closes_at`; sign-up `{ type: "signup", question:
title, options: [{ label, capacity }] }`; event `{ type: "event", event_id,
note? }` with `note` omitted when blank. Valid = question 1–200 and 2–10
non-blank labels ≤ 80 (`pollValid`); title 1–200, 1–10 slots, capacity 1–50
(`signupValid`); a pick + note ≤ 200 (`eventValid`); lengths in code points as
the route's `body.ts`. The read is `GET /api/orgs/<handle>/space?events=1 →
upcoming` (the route reads `events === "1"`, `space/route.ts:178`).

**11.7 refusals (1.2 / 1.3).** One POST in `useCardPost`; `content_blocked` →
the line + the named field outlined (`question` / `options.<n>` / `note`, the
same names `cards/route.ts:blockedField` sends); `invalid_card` → its sentence +
the field; `board_officers_only` / `room_closed` / `not_found` → sentence, close;
`try_again` → sentence + `reload()` (see S3-CONTRACT-4), `doneRef` makes a second
tap a no-op — never a re-submit (N8); 201 → `onPosted(message)`.

**11.8.** `CardBubble` props are exactly the pinned eleven; 292px, theirs with
the 28px avatar and the left tail, mine right-aligned without; its own 500 ms
press → `ReactionPicker` with `onReport` / `onRemove`, none on a `temp_` row;
`card === null` → the fallback bubble. Poll: `radiogroup` / `radio` `aria-checked`
(`checkbox` when `multi`), 44px hit around the 36px row, bar
`count / max(total_voters, 1)` per option (14.26), coral disc / grey ring, two
20px voters hidden when anonymous, `PUT …/vote { option_id, on: !mine }`, no
optimistic change, the 36px spinner in the mark's slot (−9px margins), the
answer's `card` through `onCard`, `poll_closed` closes locally (footer + taps;
see S3-CONTRACT-2 for the 70%), `not_found` → `onRefresh(created_at)`; 70% and no
taps on `card.closed`. Sign-up: two-line when any label > 12 code points
(14.34), chips + `+N` past 3 visible, `Leave` (mine) else `Full` else `<K> open`
+ `Take a spot` with the first open row coral (14.34), segments `min(Σ cap, 12)`
else the continuous bar, `on: true` / `on: false`, `slot_full` → toast +
`onRefresh`. Event: `PUT /api/events/<id>/rsvp { status }`, the pressed pill →
`DELETE`, then `onRefresh(created_at)` and the announcement; `state === "closed"`
→ pills hidden, `Open event chat` kept; `eventWhen(starts_at, deviceZone())`
(1.4: the screens format in the device's zone). Every refusal toast on the cards
goes through `toastSendFailure` (the only direct `toast()` is STOPPED 3's line).

**11.0.** Every new `.tsx` starts with `"use client"`; inline styles only; `SERIF`
/ `FONT` and `palette(night)` tokens; `useHideTabBar()` in `CardSheet`; focus into
the sheet (vaul) and back to the "+" (`returnFocusTo`) on unmount; inputs 16px;
targets ≥ 44px (the 32px pills inside 44px buttons, 44×44 steppers, X, close);
hooks before every early return (`ComposeSheets`, `EventCardView`, the sheets);
the Share sheet's state set in the read's callback, never in the effect body;
no `className`, no Discord words, no new dependency (vaul was present; the
spinners are SMIL). Pure tests import with `.ts` and nothing that needs the DOM.
