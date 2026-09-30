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
