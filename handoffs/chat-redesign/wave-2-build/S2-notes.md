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

## Part 2 — the club space (the main S2 batch, after the three first commits)

Resumed on `24ca304` (S3's first commit + notes on top of `3bf4695`). Nothing of
part 2 was on the branch; `git status` showed only S1's notes modified.

### Plan (files, in build order; every file `"use client"`, inline styles, `palette(night)`)

1. `club/helpers.ts` (PURE, no React; imports `@/lib/chat/when`, `@/lib/chat/types`
   as types, `@/lib/chat/room-state`) + `club/helpers.test.ts`: `roleWord(role)`,
   `chipStateWord(event, now)` (1.2's event-chip state word), `chipAriaLabel(room, now)`,
   `upNextLabel(event, now)`, `isHot(event, now)` (live or isSoon), `shouldShowSep`
   (`shouldShowChatSep`'s rule, campus-home.tsx:17098) + `sepLabel(iso, now)`
   (`Today` / `Yesterday` / `Wed` / `Oct 5`), `separatorIndexes(rows)` over non-stub
   rows, `repliesToggleText(n)` / `repliesToggleLabel(n, open)`, `statePill(event, now)`,
   `whoIsGoingLabel`, `composerPlaceholder(kind, name)`, `emptyLine(kind, club)`,
   `boardStripLabel`, `rsvpPillLabel`, `postAriaLabel`. The tests cover the
   separators rule and the chip state word (as the task asks) plus the labels.
2. `club/RoomChips.tsx` — `<nav aria-label="Rooms in <club>">`, the server's order,
   `aria-current="page"`, the Board dot, 44px hits, event chips open the layer.
3. `club/UpNext.tsx` — `slice(0, 2)`, the Soon ring + live chrome only when hot, the
   bloom only when a drawn card is hot, the officer's dashed button (11.9.3).
4. `club/BoardStrip.tsx` — 44px, `Board · <Author> · <text>`, the dot, the chevron.
5. `club/RoomComposer.tsx` — 64px: "+" (only when `can_post`; mounts `CardTray` +
   `ComposeSheets`), the 16px input, the gradient send; nothing while `viewer` is
   null; the quiet tile on `can_post === false`; the send (temp_ row → POST →
   `replace` / `remove`), the reply pill.
6. `club/RoomThread.tsx` — oldest first, bottom- or top-anchored, separators over
   non-stub rows, `MessageBubble` (groupMode, showSender, reactions as today, Reply,
   Report, Remove with the confirm), `CardBubble`, `RemovedContentCard by=`, the
   `toMessageRow` adapter, `Earlier messages` above, the empty line.
7. `club/BoardPost.tsx` + `club/BoardView.tsx` — newest first, articles, the replies
   fold (`?root=` read, re-read every 5th tick, LoadFailed compact), the reply field,
   `Earlier messages` under the last post, the officer line / the member tile.
8. `club/EventAbout.tsx` + `club/RsvpSheet.tsx` + `club/EventChat.tsx` — the layer
   at 1101/1102, its own hook, the hero, the pill, Plans, Who's going, the RSVP sheet
   (a `Drawer.NestedRoot`), the Board strip, the thread top-anchored, the closed tile.
9. `club/ClubEmpty.tsx` — the officer's three rows.
10. `club/ClubSpace.tsx` — rewritten in full: the space read (open / visible / every
    20 s = 5 ticks of 4 s), the deep-link order, the header, everything above, the
    history writes of 2.3, the event layer, the states.

Commits: one per step or two, `feat(chat): <what> (wave 2, W2-S2)`; gates at the
end; `S2-gate.md` part 2.

### Decisions taken where the branch has no callback (REQUESTS to W2-S1 below)

- **History (2.3, 11.10).** `MessagesMobile` on the branch does not mount `ClubSpace`
  yet and defines no replaceState / pushState callback; the 11.3 props are pinned
  (`{ orgHandle; initialRoomId; initialRoomKind; onClose }`). So `ClubSpace` writes
  history itself on 2.3's exact state shape `{ vibeChat: <id>, depth: n }`: a chip
  tap → `history.replaceState({ vibeChat: roomId, depth: history.state?.depth ?? 1 },
  "", "/messages?channel=<roomId>")`; opening the event chat layer →
  `history.pushState({ vibeChat: eventRoomId, depth: 2 }, "", "/messages?channel=<id>")`
  unless `history.state` already is `{ depth: 2, vibeChat: <that id> }` (a deep link
  where `MessagesMobile` pushed it first, 2.3); the layer's Back / swipe →
  `history.back()` when `history.state?.depth === 2`, else a direct close; a
  `popstate` whose `state?.depth ?? 0` is below 2 closes the layer (the one closer
  for the layer). The space's own Back / swipe calls `onClose()` only (S1's
  `MessagesMobile` owns that `history.back()`).
- **Every 5th tick (11.3 Reads).** The hook's option object is pinned; the space read
  runs on its own 20-s timer while visible (`ROOM_POLL_MS × ROOM_FULL_READ_EVERY`),
  the same period as the room's every-5th full read, plus on `visibilitychange` →
  visible and on open. No hook shape change for it.
- **The room under the layer** pauses its polling while the event chat layer is open
  (`enabled: eventRoomId === null`): 9.3 polls "the open room"; the layer's hook
  polls the event room. The state is kept, so Back shows the room at once.
- **`ClubEmpty` = officer** means `viewer.role` is `owner` or `admin` (1.1's "officer";
  a mod is not one).

### STOPPED (part 2)

6. **A deep link's `initialPage` cannot reach the hook.** 11.3 / 2.3 / SCREENS-L10:
   "the resolving thread GET's body is the hook's `initialPage`, so the room is read
   once on arrival". The 11.3 props carry no such field (`{ orgHandle; initialRoomId;
   initialRoomKind; onClose }`), so `ClubSpace` cannot receive it. Built: the room is
   read on mount by the hook (one more thread GET on a deep link). A fifth optional
   prop `initialPage?: ThreadMessagesResponse` is the fix; not added (the props are
   pinned and W2-S1 builds against them).
7. **A later 403 on the event room needs a signal from the hook.** 11.6: the next read
   answering 403 "Not a member" closes the layer with `You left the event chat.`; the
   hook's later reads are silent by 11.5 ("a tick that fails is silent"). Built,
   additively: `lostAccess: boolean` on the hook's return, true once a read after the
   first answered 403 or 404; `EventChat` closes on it. `ClubSpace` uses the space
   read's own 403 for `Members only.` (11.3) and does not read `lostAccess`.
8. **The composer's font size.** 11.0 says inputs are 16px (the iOS zoom guard),
   MK:0.2 says 15px; built at 16px as 11.0 says (11.0 wins over the mockup).
9. **`ReactionPicker` draws no Remove for a card in this commit set beyond `onRemove`**
   (S3's STOPPED 1: no reaction / reply handler on `CardBubble`): `RoomThread` passes
   `onRemove` and `onReport` to `CardBubble`, nothing else can be passed.

### REQUESTS (to W2-S1, for the integration review)

- R1. `MessagesMobile`'s `popstate` handler must NOT close the club space on a
  `popstate` whose `state.depth` is 1 (that is the event chat layer's Back; the
  layer closes itself). It closes the space on depth 0 / no `vibeChat` state.
- R2. For an event-room deep link, `MessagesMobile` may `replaceState` depth 1 and
  `pushState` depth 2 as 2.3 says, or only the first: `ClubSpace` pushes depth 2 for
  the layer unless `history.state` already reads `{ depth: 2, vibeChat: <room> }`.
- R3. `onClose` of `ClubSpace` is called for the space's Back and its swipe; 2.3's
  `history.back()` for those belongs to `MessagesMobile`.
- R4. STOPPED 6: an optional `initialPage` prop, if the integration review wants
  the deep link's room read once.

### Log
- 2026-09-30T08:18:12Z part-2 plan, decisions, STOPPED 6-9 and REQUESTS written; starting club/helpers.ts
- 2026-09-30T08:21:49Z club/helpers.ts + helpers.test.ts written (7 tests green; eslint 0); lostAccess added to use-room-poll.ts (STOPPED 7); committing
- 2026-09-30T08:24:18Z RoomChips.tsx, UpNext.tsx, BoardStrip.tsx written (tsc + eslint 0); committing
- 2026-09-30T08:27:35Z RoomComposer.tsx (send flow, tray + sheets mount, the quiet tile) and RoomThread.tsx (toMessageRow, separators, bubbles, cards, removed rows, Remove confirm, Report, reactions) written; tsc + eslint 0; committing
- 2026-09-30T08:31:13Z BoardPost.tsx, BoardView.tsx (newest first, folds with ?root= read + every-5th re-read, reply field, the officer/member footers via the composer), ClubEmpty.tsx, RsvpSheet.tsx written; RemoveConfirm exported from RoomThread; tsc + eslint 0; committing
- 2026-09-30T08:34:17Z EventAbout.tsx (hero, state pill, Plans, Who's going, RSVP pill) and EventChat.tsx (the 1101/1102 layer, its own hook, lostAccess → You left the event chat.) written; tsc + eslint 0; committing
- 2026-09-30T08:36:47Z ClubSpace.tsx rewritten in full (space read on open/visible/20 s, deep-link order, header, Up next, chips, strip, room, composer, the event layer, history writes of 2.3, the states, ClubEmpty); tsc + eslint 0; committing
- 2026-09-30T08:38:48Z self-review fixes: the welcome-row focus waits for the composer's input (ready dep, token reset on a chip tap); onClose held in a ref so the space read's effect never re-arms on an inline arrow; gates so far: typecheck 0, npm test 1614/1614, eslint 0 on every owned file, baselines 0; committing, then the build
- 2026-09-30 build: attempt 1 `Another next build process is already running` (a sibling's build) → 90 s → attempt 2 exit 0. S2-gate.md part 2 written.

### Closing (part 2)

**Built** (every file `"use client"`, inline styles, `palette(night)`, `SERIF` / `FONT`,
`useNightTheme()`; 375px, Light and Night; 44px targets; 16px inputs):
`club/helpers.ts` (+ test), `RoomChips.tsx`, `UpNext.tsx`, `BoardStrip.tsx`,
`RoomComposer.tsx`, `RoomThread.tsx`, `BoardPost.tsx`, `BoardView.tsx`,
`EventAbout.tsx`, `EventChat.tsx`, `RsvpSheet.tsx`, `ClubEmpty.tsx`,
`ClubSpace.tsx` (rewritten in full); `use-room-poll.ts` gained `lostAccess`
(STOPPED 7). S1's `MessagesMobile` (005020d) honours R1–R3 exactly: its
`popstate` ignores `depth >= 1`, it writes `replaceState` 1 + `pushState` 2
for an event deep link (my `pushLayerHistory` guard then skips), and it asks
for the same `initialPage?` prop as STOPPED 6 / R4 — left to the integration
review (the 11.3 props are pinned; not improvised).

**What a reviewer should look at first**
1. `ClubSpace.tsx`: the space read effect (open / 20 s / visible; a later 403 →
   `Members only.` + close), `hookRoomId` (a deep link's room reads before the
   space answers), the history helpers and the `popstate` listener (2.3).
2. `RoomThread.tsx`: `toMessageRow`, the separators over non-stub rows, the
   Remove confirm → `DELETE`, the reaction flow (today's, moved), `CardBubble`
   / `RemovedContentCard by=` branches.
3. `BoardPost.tsx`: the `?root=` effect (open / Retry / every 5th tick; the
   all-stubs fold shows the field only), the reply POST with `thread_root_id`,
   `board_post_missing` → drop.
4. `RoomComposer.tsx`: the optimistic `temp_` row → `replace` / `remove`; the
   refused-send memory against the `viewer` object; the tray + `ComposeSheets`.
5. `EventChat.tsx` / `EventAbout.tsx` / `RsvpSheet.tsx`: `lostAccess` → `You left
   the event chat.`; the state pill; PUT / DELETE rsvp → `reload()`.

**Readings a reviewer may want to strike**
- A card post on the Board renders `CardBubble` as it is (292px wide, its own
  avatar), inside the post's padding — "full width" is not reachable without
  a `CardBubble` prop (S3's file).
- `repliesToggleLabel(0, …)` reads `Reply. Replies don't notify anyone.` (1.2
  gives the N form only).
- `Open event chat` on a card INSIDE the event chat layer does nothing (one
  layer level, depth 2, exists).
- The `officerEmpty` Up next button needs `isOfficer && member_count === 1 &&
  up_next: []`; the Lounge block additionally needs the Lounge's page empty.
- `EventChat` mounts once the space read answered (it needs the club's name
  for `Back to <club>`); a deep-linked event chat shows the space skeleton for
  that one read.

**Props defined for the siblings** (S1 mounts `ClubSpace` only; S3's `CardTray`,
`ComposeSheets`, `CardBubble` are consumed with their pinned props unchanged):
- `ClubSpace` — exactly 11.3: `{ orgHandle; initialRoomId; initialRoomKind; onClose }`.
- `useRoomPoll(roomId, { enabled, initialPage?, line? })` → the 11.5 shape +
  `hasEarlier`, `replace`, `remove`, `lostAccess` (additive, STOPPED 1-3, 7).
- `MessageBubble` / `ReactionPicker`: `onRemove?: () => void` (the first commit).
- 2026-09-30T08:42:04Z closing notes written; committing the gate record and notes (the last commit)
