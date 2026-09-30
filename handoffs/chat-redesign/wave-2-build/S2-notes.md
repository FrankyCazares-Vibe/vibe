# W2-S2 notes (the screens batch, the club space)

Branch `claude/relaxed-davinci-9d11h3`, started at `7678656` (S1's first commit
on top of `a9355d1`). The contract is `handoffs/chat-redesign/wave-2-contracts.md`
(final); the facts are `wave-2-asis/mockups-map.md` (MK) and
`messages-mobile-map.md` (MM); the mockups `boards/W0_Club.dc.html`,
`W0_Club_Light.dc.html`.

## Part 1 — the first commit (serial prelude, contract 13.1)

Built alone before S3's first commit and the three screen batches. Files (13.2):

1. `src/components/mobile/messages/club/ClubSpace.tsx` — the shell with EXACTLY
   the 11.3 props (`{ orgHandle; initialRoomId; initialRoomKind; onClose() }`),
   `"use client"`, the drawer chrome of `ConversationView` (`Drawer.Root
   direction="right" handleOnly`, overlay 1099 / content 1100), `useHideTabBar()`
   on mount, `useNightTheme()`, rendering only the 11.3 header skeleton for now
   (52px + safe-area: Back 44px circle, a 40px disc, two bars). W2-S1 imports it.
2. `src/lib/chat/use-room-poll.ts` — `useRoomPoll(roomId, { enabled, initialPage? })`,
   the 11.5 return shape and the 9.3 schedule.
3. `src/lib/chat/page-merge.ts` + `page-merge.test.ts` — `mergeFullPage(state, page)`
   exactly as 9.3.
4. `onRemove?: () => void` on `messages/ReactionPicker.tsx` (a row under Report,
   `pickerRowStyle(darkMode, true)`, label `Remove`) and its pass-through on
   `messages/MessageBubble.tsx` — 10.2 rule 5, the only edits in moved files.

Gates (13.3): `npm run typecheck`, `npm test`, `npm run build`, `npx eslint <files>`,
`node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4`
(report read, exit code ignored: CHANGED must hold MessageBubble and
ReactionPicker with the onRemove lines only, next to B3's MessageRow /
ConversationView).
One commit: `feat(chat): club space shell, room polling hook, page merge, Remove row (W2-S2 first commit)`.

### Facts read before the first edit

- `ThreadMessagesResponse` (types.ts:340): `{ ok, messages (oldest first), viewer_id,
  peer_last_read_at, peer_typing, room: ThreadRoom | null, viewer: ViewerInRoom }`.
- The thread GET (`messages/route.ts:107-122`): `before`, `after` (cleaned; a bad one
  → 400 `invalid_after`), `root`, `limit` (1..200, default 50; 200 under `root`).
  `after` is `gte("created_at", after)` (`message-read.ts:857`): the cursor row
  comes back too (the client drops ids it has) and `?after=<createdAt>&limit=1`
  returns that very row (`refreshOne`).
- Mark-read: `POST /api/me/threads/<id>/read` → `{ ok: true }` (matches nothing on a
  room with no row for me; `read/route.ts:19-23`). `ConversationView:195` does it
  quiet with `vibeRequest`.
- `asLoadFailure(r, line)` (`LoadFailed.tsx:33`) maps a `VibeResult`; `vibeRequest`
  never throws, `quiet: true` keeps the toast away.
- `useHideTabBar()` (`use-hide-tabbar.ts`), `useNightTheme()` (`messages/theme.ts`),
  `palette(night)` / `SERIF` / `FONT` (`messages/v2-tokens.ts`), `clubGradient`
  (`messages/avatar.ts`), `vaulOverlayStyle` / `visuallyHiddenStyle`
  (`messages/sheet-styles.ts`).
- `ReactionPicker` draws the separator and the card radius on `onReply || onReport`;
  `pickerRowStyle(darkMode, true)` is Report's (danger) row style. `MessageBubble`
  passes `onReply` / `onReport` with a `temp_` guard (`:772-789`).
- `split-check --base 507d6b4` before this batch: changed 2 (MessageRow,
  ConversationView — W2-B3's hunks), added 13 (S1's flat files), missing 0, dup 0.
- Mockup header (`W0_Club:15-27`): 52px, `padding:4px 10px 0 10px; gap:8px`; Back
  44px circle (`border 1px rgba(255,255,255,0.10); background rgba(22,21,21,0.86)`),
  40px avatar disc, `<h1>` 20px/800 Fraunces line-height 1.1 letter-spacing -0.4px,
  12px/600 line `Your hat: Officer · 48 members`, a 44px right button.

### STOPPED (part 1)

Each is a gap in 11.5's hook shape against the flows 11.4 / 11.5 describe; the
ten members the contract names are built exactly (names, order, types). What
the flows need beyond them was added ADDITIVELY and is listed here so the
integration review can strike or keep it; nothing named in the contract was
changed.

1. **The Board's failure line.** 11.5 says the hook's first read failing gives
   `Couldn't load this chat.`; 11.4 says the Board's read (through the same
   hook) fails with `Couldn't load the Board.`. The line is baked into the
   request (`vibeRequest`'s `failure` → `asLoadFailure`), so the hook must
   know it. Built: an optional third option `line?: string` (default the 11.5
   sentence); the option object 11.5 names is `{ enabled, initialPage? }`.
2. **`Earlier messages` needs a flag.** 11.5: "the `Earlier messages` button
   shows while the last earlier page was full" — the view cannot know a page's
   size from `messages` alone. Built: `hasEarlier: boolean` (true after a
   first page or an earlier page of 50 rows).
3. **The optimistic row and the remove flow need two writers.** 11.5: the
   `temp_` row is "replaced by the answer, removed on failure"; 11.4/11.5: a
   removed message or a `board_post_missing` post is "dropped". The shape has
   `append(message)` and `replaceCard(id, card)` only. Built: `replace(id,
   message)` (drops the temp row instead when the answer's id already arrived
   by a poll) and `remove(id)`.
4. **Not a stop, a reading:** `?after=` is `gte` on the server
   (`message-read.ts:857`), so the 4-s poll's cursor row comes back every tick
   and is dropped by id, as 9.3 says ("the client drops ids it already has");
   `refreshOne(createdAt)` with `limit=1` therefore returns that very row.
   The `temp_` rows' `created_at` (the client's clock) never feeds the cursor
   or the `before` bound.
5. **Not a stop, the split-check at integration (10.3):** the report after
   this commit is CHANGED = MessageRow, ConversationView (W2-B3's landed
   hunks), MessageBubble, ReactionPicker (this commit's `onRemove` lines
   only); the task text names the last two alone, the contract's integration
   paragraph names all four. ADDED = S1's 13 flat-file declarations. Report
   below.

### Log
- 2026-09-30T07:53:50Z notes written; starting page-merge.ts
- 2026-09-30T07:54:07Z page-merge.ts written
- 2026-09-30T07:54:33Z page-merge.test.ts written and run
- 2026-09-30T07:55:54Z use-room-poll.ts part 1 (types, constants, helpers) written
- 2026-09-30T07:56:18Z use-room-poll.ts part 2 (reads, the schedule effect) written
- 2026-09-30T07:56:42Z use-room-poll.ts part 3 (loadEarlier, refreshOne, append, replace, remove, replaceCard, reload, return) written
- 2026-09-30T07:57:15Z fixed: test imports via a specifier variable (repo pattern), lineRef written in an effect (react-hooks/refs); tsc + eslint clean on the three lib files
- 2026-09-30T07:57:41Z club/ClubSpace.tsx part 1 (props, drawer chrome, hooks) written
- 2026-09-30T07:58:03Z club/ClubSpace.tsx part 2 (header + body skeletons) written
- 2026-09-30T07:58:44Z onRemove edits applied to ReactionPicker.tsx (+row) and MessageBubble.tsx (pass-through); running split-check + gates
- 2026-09-30T07:59:26Z gates so far: typecheck 0, npm test 1590/1590, eslint 0 (baselines clean), split-check CHANGED = MessageRow, ConversationView (B3), MessageBubble, ReactionPicker (mine); running build

### split-check report after this commit (`--base 507d6b4`, exit code ignored at integration)

```
split-check: 51 declarations in 507d6b4:src/components/mobile/MessagesMobile.tsx; 64 across src/components/mobile/MessagesMobile.tsx + src/components/mobile/messages
  missing 0 · changed 4 · added 13 · duplicate 0
  CHANGED   MessageRow (507d6b4:src/components/mobile/MessagesMobile.tsx:150 -> src/components/mobile/messages/types.ts:98) at char 1302
            before: …removed_at?: string | null; removed_reason?: string | null; };…
            after:  …removed_at?: string | null; removed_reason?: string | null; /** * A stub: a message hidden from the viewer by a block in a club room * (wave…
  CHANGED   ConversationView (507d6b4:src/components/mobile/MessagesMobile.tsx:1057 -> src/components/mobile/messages/ConversationView.tsx:49) at char 16913
            before: …d ? threadAvatar(thread) : { url: null, initials: "?" }; // handleOnly: vaul lets a side drawer drag from anywhere, so a // sideways drift w…
            after:  …d ? threadAvatar(thread) : { url: null, initials: "?" }; // A stub (a message hidden by a block, wave-2 contract 8.1) leaves the // array be…
  CHANGED   MessageBubble (507d6b4:src/components/mobile/MessagesMobile.tsx:3968 -> src/components/mobile/messages/MessageBubble.tsx:12) at char 198
            before: …listScrolledAtRef, parentIsMine = false, onReply, onReport, }: { message: MessageRow; isMine: boolean; topGap: number; /** Only true on the …
            after:  …listScrolledAtRef, parentIsMine = false, onReply, onReport, onRemove, }: { message: MessageRow; isMine: boolean; topGap: number; /** Only tr…
  CHANGED   ReactionPicker (507d6b4:src/components/mobile/MessagesMobile.tsx:4780 -> src/components/mobile/messages/ReactionPicker.tsx:36) at char 83
            before: …({ darkMode, isMine, existing, onPick, onReply, onReport, onClose, }: { darkMode: boolean; isMine: boolean; existing: MessageReaction[]; onP…
            after:  …({ darkMode, isMine, existing, onPick, onReply, onReport, onRemove, onClose, }: { darkMode: boolean; isMine: boolean; existing: MessageReact…
  ADDED     CLUB_GRADIENTS (src/components/mobile/messages/avatar.ts:19)
  ADDED     PersonColor (src/components/mobile/messages/avatar.ts:26)
  ADDED     PERSON_COLORS (src/components/mobile/messages/avatar.ts:29)
  ADDED     hashId (src/components/mobile/messages/avatar.ts:39)
  ADDED     clubGradient (src/components/mobile/messages/avatar.ts:49)
  ADDED     personColor (src/components/mobile/messages/avatar.ts:54)
  ADDED     SERIF (src/components/mobile/messages/v2-tokens.ts:18)
  ADDED     FONT (src/components/mobile/messages/v2-tokens.ts:20)
  ADDED     Palette (src/components/mobile/messages/v2-tokens.ts:22)
  ADDED     CORAL (src/components/mobile/messages/v2-tokens.ts:61)
  ADDED     NIGHT (src/components/mobile/messages/v2-tokens.ts:63)
  ADDED     LIGHT (src/components/mobile/messages/v2-tokens.ts:92)
  ADDED     palette (src/components/mobile/messages/v2-tokens.ts:122)
```
- 2026-09-30T08:00:28Z build exit 0; STOPPED written (5 entries); S2-gate.md part 1 written; committing
- 2026-09-30T08:00:53Z COMMITTED 3bf4695 feat(chat): club space shell, room polling hook, page merge, Remove row (W2-S2 first commit). First-commit prelude done; the main S2 builder continues from here (the space read, UpNext, RoomChips, BoardStrip, BoardView/BoardPost, RoomThread/RoomComposer, EventChat/EventAbout, RsvpSheet, ClubEmpty; the officer remove flow through onRemove; the STOPPED entries above are its first reading).
