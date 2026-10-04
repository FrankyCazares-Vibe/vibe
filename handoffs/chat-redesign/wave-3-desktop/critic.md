# Critic pass on the wave-3 desktop contract (Oct 3, 2026)

Two critics attacked `contract.md`: 27 findings (3 must, 24 should). All 27 were applied; eight of them with a different fix than the critic wrote, or with a choice between two findings (the last section says why). Every quoted definition was re-read in the worktree `chatdesk` before the contract was changed.

How to read: find your batch. Each line is `F<number>`: what was wrong, then what the contract says now (with the section). Old batch names are in brackets.

## Every batch
- F7. Five batches were over one agent's size. Now 22 batches in FIVE waves, renamed `W3-<wave>-<name>`; the table of old and new names opens section 8. Size rule: about 600 lines, about 6 files.
- F20 + F27. "One glowing thing per screen", "nothing on screen twice" and "tokens only" were nobody's job. Now rules in 3.2, and the Agent line **Calm** is on every batch that draws (section 8 intro).
- F19. People on the phone with `chat_v2` on (founders, SAE) get changes with this deploy and had no row. Now 2.5 row 10 lists them one by one; one deploy; Franky walks that row on a real phone before desktop is turned on (4b.3 steps 1, 2 and 5).
- F25. The calls for Franky were scattered. Now 1.4 has the five real ones, each with a recommendation; what the planner should decide is decided in 1.3 (K8).

## W3-1-types [W3-1A, types half]
- F1 (must). There are TWO exhaustive `Record<PostRefusalCode, number>` tables; the contract named one, so wave 1's typecheck would fail. You now own `cards/_lib/rpc-refusal.ts:39` and `src/lib/chat/cards/rpc-refusal.test.ts` too: both tables gain `room_posters_only: 403`, the test deep-equals five rows and gains one case (4.2, section 8).
- F24. `PinnedMessage` gains `full_text` (4.3).
- F7. You no longer own the switch files; `FeaturesResponse` stays yours because it is in `types.ts`.

## W3-1-switch [W3-1A, switch half]
- F7. A batch of its own: section 2 without the `types.ts` line. Nothing else changed for you.

## W3-1-pinsdb [W3-1B]
- F6. The header's lock note was wrong. The three foreign keys take SHARE ROW EXCLUSIVE on `messages`, `channels` AND `users` until commit; write exactly that (4b.1). You are the only batch of wave 1 that runs SQL; the other migration is in wave 2, so no two builders share the database.

## W3-1-pure [W3-1E, pure files]
- F8. The roster's row is not `Person`. `RosterRow`, `RosterResponse` and `RoomPeopleProps` are pinned in `contracts.ts` (3.3).
- F9. `closed` gains the reason `"lost"`; test it and an unknown reason (5.3).
- F14, F23. Two new page events: `escape`, `info-opened` (5.3).
- F22. `bandFit(bandWidth, fixedWidth, count)`: the fixed part is measured, not 560; test another week's wider fixed part (3.4).
- F25. `ClubPaneProps.pinnedAt` is gone (the club header has no pin toggle).

## W3-1-prep [W3-1E, phone-file prep and the dialog]
- F14. `DesktopPopover`: focus moves in on open and returns to `anchor` on every close; both components stop the Esc they handle (6.1).
- F19. Your month split is item (e) of 2.5 row 10: it reaches live phones with the deploy. The side-by-side read of `MonthSheet` matters.

## W3-2-roomsdb [W3-1C]
- F6. Moved to wave 2, after the pins file is in. You are the only batch of wave 2 that runs SQL. Re-run the pins check after your last apply.

## W3-2-roomreads [W3-1D, reads half]
- F19. Before the column reaches production, every club-room read would fail one select and retry. Now a 5-minute memory of "column missing": three pinned functions in `rooms.ts`, used by `loadRoom` and the space route, tested with `now` passed in (4.2, 4c.3).
- F7. The room routes and `room-names.ts` moved to W3-2-roomroutes.

## W3-2-roomroutes [W3-1D, routes half, plus the roster]
- F2 (must). The room list has a TWO-step fallback today; adding `post_policy` to the kind-aware select would drop `kind` and the event filter for every old Campus > Chat rail until the column exists. Now a three-step read; create writes `post_policy` only when it is not `everyone`; a non-default value on a database without the column answers 503 `try_again`; the cap count is skipped when `kind` cannot be read; PATCH on a missing column is 503 (4.2). New test file `room-routes.test.ts`.
- F26. The roster showed blocked people. `GET /api/orgs/[slug]/members?visible=1` leaves them out (`blockedIdsFor`); without the parameter it is today's list. You own `members/route.ts` (GET only).

## W3-2-pinroutes [W3-2E]
- F24. The pins list carries `full_text` (the whole message) beside the 140-character `text`; test both.

## W3-3-thread [W3-2C, thread half]
- F13. On the desktop surface `RoomChips` draws no top border and no side padding: the chips sit inside the club header's row (4c.4, 6.3).
- F14. `HoverActions` hides with `opacity` and `pointer-events` only; the row is ONE Tab stop; Enter opens the toolbar, Left / Right move, Esc returns and is stopped; names `React`, `Reply`, `More` (6.4).
- F15. Extra-room names as words in the placeholder, the "+" tray and the card sheets: one line in `RoomComposer` (`shownName`, 4c.3). `composerPlaceholder` is not edited.
- F12. You pass `anchorRef={plusRef}` to `CardTray` (pinned in 6.3); the tray itself belongs to W3-3-forms.
- F25. The megaphone is on the Board chip on BOTH devices now (C9).

## W3-3-forms [W3-2C, dialogs half, plus the card tray]
- F12 (must). The card tray was left as a phone tray. You now own `compose/CardTray.tsx`: on the desktop surface a `DesktopPopover` anchored to the "+", about 320 wide, no scrim; the phone path unchanged (6.3).
- F27. The tray's Night literal `#1C1A1A` stays on the phone path only; desktop uses `t.surface`.

## W3-3-bridge [W3-2D]
- F4. The frame made its own history entries (the post viewer). In pane mode a shared post opens in a new tab; nothing in the frame touches history; `open` and `close` close the page's overlays; `wantedId` drops a late retry (5.2 items 11 and 14).
- F5. The CSS lost to existing `!important` rules. 5.1 now has the rules word for word; `#cPinsBtn` is hidden inline and shown by one `!important` pane rule, `data-off` hides it.
- F9. A chat lost while open says `closed { reason: 'lost' }` (5.2 item 13).
- F10. `LegacyThreadPane`: a late `ready` clears the 8-second line (5.4).
- F11. `check-pwa.mjs` needs `next dev`; it is a Walk item now. Your Agent check: `src/proxy.ts`, `public/sw.js`, `_postViewer.js` not edited.
- F14. Esc in the page says `escape`; the pill shows on focus so pin works by keyboard; the two header buttons get names in pane mode (5.2 items 12 and 16, 4d.5).
- F19. The 30-second list timer changes IN PANE MODE ONLY (5.2 item 8).
- F23. Chat info says `info-opened`; `panel-state { open: true }` closes Chat info (5.2 item 15).

## W3-3-campus [W3-4A]
- Moved to wave 3; section 7 is unchanged. F21: `Manage club` is now shown to owner and admin only, but the `?manage=` door you build is the same.

## W3-4-shell [W3-2A]
- F3. `homeBelow` is true after EITHER write made from the home (3.5 rule 2); the first draft left a dead Back after opening a chat from the month popover or from New.
- F4. Rule 10: the frame adds nothing to history.
- F10. Mount the frame when both list reads have SETTLED (answer or failure), or at once when the address names a chat.
- F14. Rule 9: Esc closes the top layer, then leaves a text field, then goes home; `escape` from the page does the same.
- F9, F23. New reactions: `lost` -> home + the toast; `info-opened` -> close Pinned and Shared (5.4).

## W3-4-week [W3-2B, band and month]
- F15. The words are pinned in 6.5: the group label by `weekWord`, the two empty lines, the arrow and pill names. Call the helpers.
- F22. Measure the band's left block and hand it to `bandFit`; no 560 constant.
- F20. The live card glows only in the full band; folded, it is flat text with a plain dot.

## W3-4-lists [W3-2B, lists and New]
- F15. New's words (`New message`, `Search people`, `Create group`, ...), the filter row's tablist and `Requests, N waiting`, the search name, and the chats-empty line that does not say "tap" (6.5).
- F17. A group can only hold connections. Read `/api/me/connections` when a second person is picked; non-connections are unpickable with one line; a `not_connected` refusal names the people (section 8).

## W3-4-phonepins [W3-3E]
- F15. `PinnedSheet` has a title and its own empty line (never "Hover"); the chat-level row reads `Unpin from top` only when `onOpenPinned` is passed (4d.6).
- F24. A pin further back opens to its whole text in place.

## W3-5-club [W3-3A]
- F13 (must). The club header was specified wrongly. Now pinned: ONE row (mark, name, hat line left; chips, `+`, panel toggle right; chips drop under the name when they do not fit). Hat line by state: panel on screen -> `Your hat: <role>`; panel not on screen -> `hatLine(role, count)` plus, for owner and admin, `· Manage club` (section 8, 6.5).
- F18. An event chat with the panel not on screen (1024 and 1100 laptops) had no Where / When / RSVP at all. Now `RoomThread` gets `header={<EventAbout />}`, `anchor="top"`, as on the phone; with the panel shown, no header (4c.4).
- F8. Faces = the first five `RosterRow`s with a handle from the `?visible=1` read, mapped to `Person` (3.3).
- F20. The hat line, `Manage club` and the Board strip read the same "panel on screen" boolean; `EventAbout` is mounted in one place at a time.
- F25. No pin toggle in the header (H11); `pinnedAt` is gone.

## W3-5-panel [W3-3B, the panel]
- F21. `Manage club` was shown to mods by `can_moderate`. Now owner and admin only, under the same condition as `Manage rooms` (C11).
- F15. The empty Announcements line is `emptyLine("board", clubName)` = `Nothing on the Board yet.`
- F20. The live event card is flat (no glow); the unread mark is a plain dot.

## W3-5-people [W3-3B, the members dialog, plus the people picker of W3-3C]
- F16. Rows link to `/profile/<handle>`; there is no `/u/` route.
- F8. Both files import `RosterRow`; nobody re-derives the shape.
- F26. `MembersDialog` reads with `?visible=1`; `RoomPeople` makes no roster read (the Rooms dialog hands it the unfiltered roster).
- F15. Search placeholder `Search members`.
- F7. `dm/RoomPeople.tsx` is new and yours, with `RoomPeopleProps` pinned in 3.3.

## W3-5-rooms [W3-3C]
- F7. The people lists are `RoomPeople` now (same wave, pinned props). Build the rules and their test first, then the dialog in Edits of at most 150 lines.
- F26. Your roster read has NO `visible`: an officer deciding who may enter a room sees every member (1.3 K4).

## W3-5-pins [W3-3D]
- F24. A quote opens in place to `full_text` when the page could not jump to it, or from `Show all` when the text was cut.
- F23. The shell closes your panel when the page opens Chat info; nothing for you to send.
- F14. Every quote, Unpin, Show all, tile and Show more is a real `<button>` or `<a>`.

## The orchestrator and the walk (section 10)
- F6. One builder on the local database per wave; no seed and no check script from anyone else meanwhile (4b).
- F11. Run `node scripts/check-pwa.mjs` against `next dev` during the walk.
- F14. New part H: keyboard only (Tab order, Esc order, focus return for every dialog, the toolbar and the pin by keyboard, both themes).
- F27. Parts A, C, D and E are repeated in Light at 1440; the known Night-only literals are listed in 3.2 and in the setup.
- F3, F4, F9, F10, F17, F18, F22, F23: each has a new step in parts A to E.
- F19. Part G is 2.5 row 10 item by item; Franky repeats it on a real phone after the first deploy.

## Applied with a different fix than the critic wrote (why is in contract 1.3)
- F4. The critic offered "close the viewer through its own close" or "open the post in a new tab". Chosen: the new tab. Zero history entries from the frame cannot race the shell's own `history.back()`.
- F7. The critic allowed "one agent with small Edits" for the Rooms dialog and kept four waves in mind. Chosen: the picker is its own file in a batch with the members dialog, and FIVE waves, so every wave still has 4 to 5 batches.
- F12. The critic gave `CardTray.tsx` to old W3-2C whole. After the split it belongs to the dialogs half (W3-3-forms); the thread half only passes `anchorRef`.
- F15 (item 7). The critic suggested passing the display name from `ClubPane` or changing both. Chosen: one line in `RoomComposer`, so the phone gets the same words and `ClubSpace` is not edited.
- F19 (item 3). The critic offered a remembered "column missing" or applying the file before the deploy. Chosen: the memory (5 minutes), so the deploy does not wait for a database yes.
- F21 against F13. One wanted `Manage club` in the hat line when the panel is hidden, the other wanted officers only. Both: officers only, in whichever of the two places is on screen.
- F25. Four things the first draft called "a call for Franky" are decided: megaphone on the phone chip too, room cap 5, pin cap 20, no club pin toggle. D9 was already decided by his scope.
- F26. The critic recommended filtering "the five faces at least". Chosen: faces AND the members dialog are filtered; the Rooms dialog is not, on purpose.
