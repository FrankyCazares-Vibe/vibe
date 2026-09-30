# Wave 2 visual pass — the screens as the real app draws them (W2-V, 2026-09-30)

Every new `chat_v2` screen state at **375×812 @2x, Light and Night**, shot from
the REAL app (`next dev` on branch `claude/relaxed-davinci-9d11h3`, HEAD
`b81aa29`) with every `/api/**` call answered from fixtures, next to the
mockups (`handoffs/chat-redesign/boards/W0_*.dc.html`, 390 wide, full page).
The contract is `handoffs/chat-redesign/wave-2-contracts.md` sections 11 and
1.2; the mockup map is `wave-2-asis/mockups-map.md`. **No source file was
changed for this** (`git status` shows nothing under `src/`); how the harness
gets past the server gates is in `harness-notes.md`.

The browser clock is frozen at **Thu 2026-10-08 18:12 America/Indiana/Indianapolis**
and the fixtures are computed from that instant (`tools/fixtures.mjs`), so
`Live now`, `Tonight · 9:30 PM`, `Ended`, `Yesterday`, `Tue`, `Oct 5 – 11` are
the same on every run. The viewer is Harness Student, an **officer** of Salsa
Club (48 members), a member of Chess Club (muted), the owner of Night Hikers
(1 member, nothing yet).


## Run 2 — after the three repairs (2026-09-30, HEAD `4066fd1`)

The same harness, the same fixtures, the same frozen clock, re-run on the branch
after `6adce71` (W2-S1 repairs), `4bd44ea` (W2-S2) and `4066fd1` (W2-S3).
Everything lands under [`run2/`](./run2/) with the run-1 names, plus twelve
states (25–36) the three reviews listed as "not shot" and reachable with a
fixture variant. Still no source change from the harness (`git status` shows
nothing under `src/`).

**Run 2 is two passes, and the difference between them is the one open HIGH.**
At HEAD the home's week bloom (`home/YourWeek.tsx:93`, `left: bloomLeft` = 69
+ 340 wide, now centred on the live card by VIS-S1-2) reaches past the week
`<section>`, nothing clips it, and mobile Chromium grows the layout viewport to
the widest content: **`window.innerWidth` = `document.scrollWidth` = 409 at a
375 viewport** on every screen that has the home underneath (the club space,
the event chat, the sheets — everything but 06 / 32 / 36, where no live card is
drawn). Every shot now records that measurement (`layout` in `shots.json`, the
"layout L / N" column below). This is S2-notes REQUEST R8 / S3-notes REQUEST 5
(`overflowX: "clip"` on the week section; S1's file), found by the S2 and S3
repairers and not yet landed.

- **`run2/` (HEAD as it is)**: 409px layout on 30 of 36 states — the phone
  shows the left 375px of a 409px page, so the header's right disc, the second
  Up next card, the fifth chip, the composer's send and every sheet's right edge
  are cut, and **the composer's "+" cannot be tapped**: 14 (with 15, 16), 17,
  18, 19, 25 and 35 FAILED on the click (their `*-FAILED.png` are kept as the
  evidence). The three repairs cannot be judged here.
- **`run2/clip/` (HEAD + the one-line clip, harness-side)**: `--clip-week`
  injects `section[aria-labelledby="your-week-heading"]{overflow-x:clip}` — the
  exact R8 fix — as a `<style>` from an init script, nothing in `src/`. Every
  state measures 375/375 and every state was shot; **this is what the branch
  looks like once R8 lands, and the pass to review the repairs against.**

### What changed between run 1 and run 2, by eye (run 1 → `run2/clip/`, both themes)

| # | state | run 1 → run 2 |
|---|---|---|
| 01 | `home-all` | **VIS-S1-1 fixed**: the live card reads `● Live now · ✓ Going` whole (146px; run 1 `Live n… · ✓ Going` at 142); the Ended and 9:30 PM cards stay 142. **VIS-S1-2 fixed**: the bloom sits under Fall Formal, the live card (run 1: under the Ended card at the row's left). **VIS-S1-4 fixed**: Chess Club is two lines with `3 new` at the right of `Priya Shah: Anyone up for blitz ton…` (run 1: three lines, the pill alone on its own line). Header, strip, filter row, the other rows the same. |
| 02 | `home-chats` | The week row as 01; the list unchanged. |
| 03 | `home-clubs` | The week row as 01; Chess Club's row 66px with the pill on the preview line (Night checked: same). |
| 04 | `home-requests` | The week row as 01; the Requests row unchanged (VIS-S1-5 left by contract). |
| 05 | `home-no-clubs` | The week row as 01; the no-clubs block unchanged. |
| 06 | `home-empty-week` | Unchanged (no live card, no bloom; the only home state that measures 375 at HEAD too). |
| 07 | `club-lounge` | **VIS-S2-1 fixed**: `Tonight · 9:30 PM · ● Maybe` whole in the second card (run 1 `Tonight · 9:30 PM · ● M…`), line 1 at 11.5px; `Live now · ✓ Going` next to it, the `Soon` ring and the bloom as before. **VIS-S2-4 fixed**: the chips at 11px sides / 5px gaps — `Lounge · Board● · 🔒Officers · 📅Fall Formal` whole with the fifth chip's edge at the viewport (run 1: `Fall Formal` cut at the edge). The Board strip, the thread and the composer the same. |
| 08 | `club-lounge-full` | The head as 07; every Lounge row unchanged (no finding touched `cards/*`). |
| 09 | `board` | The head as 07 (the chips whole). The posts unchanged: the Event post is still `CardBubble`'s Lounge layout inside the post (the second `PS` disc, the 292px card) — VIS-S2-2, deferred to W2-S3 as REQUEST R7, still on screen. |
| 10 | `board-fold-open` | As 09; the fold, the two replies, the stub and the Reply quietly field unchanged. |
| 11 | `event-live` | Unchanged. |
| 12 | `event-closed` | The same picture (`Closed`, `Sep 19 · 7 PM`, the `Going` pill drawn); VIS-S2-5 made the pill inert, which does not show. |
| 13 | `event-after` | Unchanged. |
| 14 | `tray` | Unchanged (the `+` still rotates on the surface disc — VIS-S3-3, S2's file, REQUEST 4). |
| 15 | `new-poll-empty` | **VIS-S3-5 fixed**: the two empty option pills are 305px with the Remove column free at the right (run 1: 343px, full width). |
| 16 | `new-poll-filled` | The three pills at the same 305px as 15 with the 44×44 X at −8 — no jump on `Add option` (run 1: 343 → 305). |
| 17 | `new-signup` | **VIS-S3-2 fixed**: the slot input is 193px — `Leaving from Union, 6` / `Leaving from Ball Hall` with whole glyphs at the padding edge (run 1: 173px, `Leaving from Unior` / `Leaving from Ball H`); the stepper 106px (`Spots` centred over it), the X reaching −12 into the gutter. |
| 18 | `share-event` | **VIS-S3-4 fixed**: `26 / 200` sits inside the note field at its right end on one 48px row (run 1: a lone 16px row above the field). The three rows, the helper and the CTA the same. |
| 19 | `share-event-empty` | `0 / 200` inside the field with the placeholder; `No upcoming events.` and the disabled CTA as before. |
| 20 | `rsvp-sheet` | Unchanged. |
| 21 | `long-press-remove` | Unchanged. |
| 22 | `empty-club` | **VIS-S2-3 fixed**: `It's just you so far.` at 16px from the edge, the coral row 343px wide, the ringed rows' hairline to 16px from the right (run 1: 28px in, 319px wide). Night checked: same. |
| 23 | `load-failed` | The week row as 01; the failure box unchanged (the Retry pill's 2.9:1 — VIS-S1-3 — is still the shared `LoadFailed`'s, a REQUEST). |
| 24 | `skeleton` | **VIS-S1-6 fixed**: five 66px skeleton rows (44px disc, 55% / 85% bars) under the filter row, the height of the rows that replace them (run 1: 74px rows). |

The sheets (15–19) still show the bare `Salsa Club · the Lounge` line with no
club dot — VIS-S3-1, `RoomComposer` passes no `orgId` (S2's file, REQUEST 3).

### The twelve added states (new in run 2; `run2/clip/`)

| # | state | what it shows |
|---|---|---|
| 25 | `new-signup-empty` | New sign-up untouched: `0 / 200`, one empty slot (193px input, the 106px stepper at 2, no X, the Remove column held), `Add slot`, `Post sign-up` disabled. |
| 26 | `remove-confirm` | Remove tapped in the picker: the centred 320px alert dialog `Remove this message for everyone in the room?` with `Cancel` / coral `Remove` over the scrimmed Lounge. |
| 27 | `member-board` | Chess Club's Board as a member: `Lounge · Board` chips, no Up next (no events), `Nothing on the Board yet.` centred, the composer replaced by the tile `Only officers post on the Board. You can reply to any post.` |
| 28 | `member-lounge-picker` | Chess Club's Lounge as a member with the picker on Priya's bubble (opened through the bubble's `Message actions` button — the 700 ms press did not open it on this two-row Lounge in the harness): `Report` / `Reply` / the emoji row, **no `Remove`**. |
| 29 | `event-empty-soon` | Late Night Social's chat: the hero with `○ Soon · starts 9:30 PM`, `When: Tonight · 9:30 PM`, `9 going · 4 maybe`, the `● Maybe` pill, the Board strip, `Say hi to everyone going.` centred, the composer. |
| 30 | `home-chats-empty` | Chats with `threads: []`: today's `EmptyState` (`No conversations yet`, the line, `Find people`); note `All` keeps a `1` badge (Salsa's unread Board) while Chats is empty. |
| 31 | `home-requests-empty` | Requests with none: `No message requests` + `Requests from people you don't follow yet will show up here.`; the active pill has no count. |
| 32 | `week-failed` | `/api/me/calendar` → 500: the dashed `LoadFailed` box in the week row (`Couldn't load your week. Try again.` + Retry), the day strip with no dots, the list as usual. Measures 375 at HEAD too (no card, no bloom). |
| 33 | `club-failed` | `/api/orgs/salsa-club/space` → 500: the header's skeleton (discs + bars) over `Couldn't load this club. Try again.` + Retry in the dashed box; nothing else drawn. |
| 34 | `board-failed` | The Board chip tapped from the Lounge with the Board's read → 500 (a 500 on the `?channel=` deep link never opens the club, so the chip): the head and chips as 09, `Couldn't load the Board. Try again.` + Retry in the dashed box. |
| 35 | `share-events-failed` | Share an event with `space?events=1` → 500: `Couldn't load your events. Try again.` + Retry in the list's place (a compact dashed box), the note field with `0 / 200`, the CTA disabled. |
| 36 | `flag-pending` | `/api/me/features` delayed 10 s: the old header (`Messages` 28/900, the pencil, no pills) over five skeleton rows on the old feed backdrop (the radial coral wash) — `FlagPending`, 2.1. |

### run2/ — HEAD as it is (409px layout where the week has a live card)

| # | state | app · Light | app · Night | layout L / N | mockup | notes |
|---|---|---|---|---|---|---|
| 01 | `home-all` | [01-home-all-light.png](./run2/01-home-all-light.png) | [01-home-all-night.png](./run2/01-home-all-night.png) | 409/409 · 409/409 | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 02 | `home-chats` | [02-home-chats-light.png](./run2/02-home-chats-light.png) | [02-home-chats-night.png](./run2/02-home-chats-night.png) | 409/409 · 409/409 | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 03 | `home-clubs` | [03-home-clubs-light.png](./run2/03-home-clubs-light.png) | [03-home-clubs-night.png](./run2/03-home-clubs-night.png) | 409/409 · 409/409 | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 04 | `home-requests` | [04-home-requests-light.png](./run2/04-home-requests-light.png) | [04-home-requests-night.png](./run2/04-home-requests-night.png) | 409/409 · 409/409 | — |  |
| 05 | `home-no-clubs` | [05-home-no-clubs-light.png](./run2/05-home-no-clubs-light.png) | [05-home-no-clubs-night.png](./run2/05-home-no-clubs-night.png) | 409/409 · 409/409 | [W0_EmptyClubs](./run2/mockup-W0_EmptyClubs.png) |  |
| 06 | `home-empty-week` | [06-home-empty-week-light.png](./run2/06-home-empty-week-light.png) | [06-home-empty-week-night.png](./run2/06-home-empty-week-night.png) | 375/375 · 375/375 | [W0_EmptyWeek](./run2/mockup-W0_EmptyWeek.png) |  |
| 07 | `club-lounge` | [07-club-lounge-light.png](./run2/07-club-lounge-light.png) | [07-club-lounge-night.png](./run2/07-club-lounge-night.png) | 409/409 · 409/409 | [W0_Club](./run2/mockup-W0_Club.png), [W0_Club_Light](./run2/mockup-W0_Club_Light.png) |  |
| 08 | `club-lounge-full` | [08-club-lounge-full-light.png](./run2/08-club-lounge-full-light.png) | [08-club-lounge-full-night.png](./run2/08-club-lounge-full-night.png) | 409/409 · 409/409 | [W0_Club](./run2/mockup-W0_Club.png), [W0_Cards](./run2/mockup-W0_Cards.png) | the same, 375×2300 so every Lounge row shows: text runs, poll, closed anonymous poll, sign-up, event card, cancelled card, removed own message, quote |
| 09 | `board` | [09-board-light.png](./run2/09-board-light.png) | [09-board-night.png](./run2/09-board-night.png) | 409/409 · 409/409 | [W0_Board](./run2/mockup-W0_Board.png) |  |
| 10 | `board-fold-open` | [10-board-fold-open-light.png](./run2/10-board-fold-open-light.png) | [10-board-fold-open-night.png](./run2/10-board-fold-open-night.png) | 409/409 · 409/409 | [W0_Board](./run2/mockup-W0_Board.png) | the newest post's fold open: 2 replies + a stub, the Reply quietly field |
| 11 | `event-live` | [11-event-live-light.png](./run2/11-event-live-light.png) | [11-event-live-night.png](./run2/11-event-live-night.png) | 409/409 · 409/409 | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 12 | `event-closed` | [12-event-closed-light.png](./run2/12-event-closed-light.png) | [12-event-closed-night.png](./run2/12-event-closed-night.png) | 409/409 · 409/409 | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 13 | `event-after` | [13-event-after-light.png](./run2/13-event-after-light.png) | [13-event-after-night.png](./run2/13-event-after-night.png) | 409/409 · 409/409 | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 14 | `tray` | — | — |  | [W0_Tray](./run2/mockup-W0_Tray.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 15 | `new-poll-empty` | — | — |  | [W0_NewPoll](./run2/mockup-W0_NewPoll.png) | not shot |
| 16 | `new-poll-filled` | — | — |  | [W0_NewPoll](./run2/mockup-W0_NewPoll.png) | not shot |
| 17 | `new-signup` | — | — |  | [W0_NewSignup](./run2/mockup-W0_NewSignup.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 18 | `share-event` | — | — |  | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 19 | `share-event-empty` | — | — |  | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 20 | `rsvp-sheet` | [20-rsvp-sheet-light.png](./run2/20-rsvp-sheet-light.png) | [20-rsvp-sheet-night.png](./run2/20-rsvp-sheet-night.png) | 409/409 · 409/409 | — | the RSVP sheet over the live event chat |
| 21 | `long-press-remove` | [21-long-press-remove-light.png](./run2/21-long-press-remove-light.png) | [21-long-press-remove-night.png](./run2/21-long-press-remove-night.png) | 409/409 · 409/409 | — |  |
| 22 | `empty-club` | [22-empty-club-light.png](./run2/22-empty-club-light.png) | [22-empty-club-night.png](./run2/22-empty-club-night.png) | 409/409 · 409/409 | [W0_EmptyClub](./run2/mockup-W0_EmptyClub.png) |  |
| 23 | `load-failed` | [23-load-failed-light.png](./run2/23-load-failed-light.png) | [23-load-failed-night.png](./run2/23-load-failed-night.png) | 409/409 · 409/409 | — |  |
| 24 | `skeleton` | [24-skeleton-light.png](./run2/24-skeleton-light.png) | [24-skeleton-night.png](./run2/24-skeleton-night.png) | 409/409 · 409/409 | — |  |
| 25 | `new-signup-empty` | — | — |  | [W0_NewSignup](./run2/mockup-W0_NewSignup.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 26 | `remove-confirm` | [26-remove-confirm-light.png](./run2/26-remove-confirm-light.png) | [26-remove-confirm-night.png](./run2/26-remove-confirm-night.png) | 409/409 · 409/409 | — |  |
| 27 | `member-board` | [27-member-board-light.png](./run2/27-member-board-light.png) | [27-member-board-night.png](./run2/27-member-board-night.png) | 409/409 · 409/409 | [W0_Board](./run2/mockup-W0_Board.png) |  |
| 28 | `member-lounge-picker` | [28-member-lounge-picker-light.png](./run2/28-member-lounge-picker-light.png) | [28-member-lounge-picker-night.png](./run2/28-member-lounge-picker-night.png) | 409/409 · 409/409 | [W0_Club](./run2/mockup-W0_Club.png) |  |
| 29 | `event-empty-soon` | [29-event-empty-soon-light.png](./run2/29-event-empty-soon-light.png) | [29-event-empty-soon-night.png](./run2/29-event-empty-soon-night.png) | 409/409 · 409/409 | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 30 | `home-chats-empty` | [30-home-chats-empty-light.png](./run2/30-home-chats-empty-light.png) | [30-home-chats-empty-night.png](./run2/30-home-chats-empty-night.png) | 409/409 · 409/409 | — |  |
| 31 | `home-requests-empty` | [31-home-requests-empty-light.png](./run2/31-home-requests-empty-light.png) | [31-home-requests-empty-night.png](./run2/31-home-requests-empty-night.png) | 409/409 · 409/409 | — |  |
| 32 | `week-failed` | [32-week-failed-light.png](./run2/32-week-failed-light.png) | [32-week-failed-night.png](./run2/32-week-failed-night.png) | 375/375 · 375/375 | — |  |
| 33 | `club-failed` | [33-club-failed-light.png](./run2/33-club-failed-light.png) | [33-club-failed-night.png](./run2/33-club-failed-night.png) | 409/409 · 409/409 | — |  |
| 34 | `board-failed` | [34-board-failed-light.png](./run2/34-board-failed-light.png) | [34-board-failed-night.png](./run2/34-board-failed-night.png) | 409/409 · 409/409 | — |  |
| 35 | `share-events-failed` | — | — |  | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) | light: FAILED: locator.click: Timeout 30000ms exceeded. · night: FAILED: locator.click: Timeout 30000ms exceeded. |
| 36 | `flag-pending` | [36-flag-pending-light.png](./run2/36-flag-pending-light.png) | [36-flag-pending-night.png](./run2/36-flag-pending-night.png) | 375/375 · 375/375 | — |  |

15 and 16 are sub-shots of 14 (the tray's click), so they are "not shot" rather
than FAILED here. Unmocked calls: none — every call the screens made was in the fixture table.

Console:
- 69× (63 states): Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. C
- 69× (63 states): Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can
- 14× (8 states): Failed to load resource: the server responded with a status of 500 (Internal Server Error)


### run2/clip/ — HEAD + the harness clip (375px everywhere; the pass to review)

| # | state | app · Light | app · Night | layout L / N | mockup | notes |
|---|---|---|---|---|---|---|
| 01 | `home-all` | [01-home-all-light.png](./run2/clip/01-home-all-light.png) | [01-home-all-night.png](./run2/clip/01-home-all-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 02 | `home-chats` | [02-home-chats-light.png](./run2/clip/02-home-chats-light.png) | [02-home-chats-night.png](./run2/clip/02-home-chats-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 03 | `home-clubs` | [03-home-clubs-light.png](./run2/clip/03-home-clubs-light.png) | [03-home-clubs-night.png](./run2/clip/03-home-clubs-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Home](./run2/mockup-W0_Home.png) |  |
| 04 | `home-requests` | [04-home-requests-light.png](./run2/clip/04-home-requests-light.png) | [04-home-requests-night.png](./run2/clip/04-home-requests-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 05 | `home-no-clubs` | [05-home-no-clubs-light.png](./run2/clip/05-home-no-clubs-light.png) | [05-home-no-clubs-night.png](./run2/clip/05-home-no-clubs-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_EmptyClubs](./run2/mockup-W0_EmptyClubs.png) |  |
| 06 | `home-empty-week` | [06-home-empty-week-light.png](./run2/clip/06-home-empty-week-light.png) | [06-home-empty-week-night.png](./run2/clip/06-home-empty-week-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_EmptyWeek](./run2/mockup-W0_EmptyWeek.png) |  |
| 07 | `club-lounge` | [07-club-lounge-light.png](./run2/clip/07-club-lounge-light.png) | [07-club-lounge-night.png](./run2/clip/07-club-lounge-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Club](./run2/mockup-W0_Club.png), [W0_Club_Light](./run2/mockup-W0_Club_Light.png) |  |
| 08 | `club-lounge-full` | [08-club-lounge-full-light.png](./run2/clip/08-club-lounge-full-light.png) | [08-club-lounge-full-night.png](./run2/clip/08-club-lounge-full-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Club](./run2/mockup-W0_Club.png), [W0_Cards](./run2/mockup-W0_Cards.png) | the same, 375×2300 so every Lounge row shows: text runs, poll, closed anonymous poll, sign-up, event card, cancelled card, removed own message, quote |
| 09 | `board` | [09-board-light.png](./run2/clip/09-board-light.png) | [09-board-night.png](./run2/clip/09-board-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Board](./run2/mockup-W0_Board.png) |  |
| 10 | `board-fold-open` | [10-board-fold-open-light.png](./run2/clip/10-board-fold-open-light.png) | [10-board-fold-open-night.png](./run2/clip/10-board-fold-open-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Board](./run2/mockup-W0_Board.png) | the newest post's fold open: 2 replies + a stub, the Reply quietly field |
| 11 | `event-live` | [11-event-live-light.png](./run2/clip/11-event-live-light.png) | [11-event-live-night.png](./run2/clip/11-event-live-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 12 | `event-closed` | [12-event-closed-light.png](./run2/clip/12-event-closed-light.png) | [12-event-closed-night.png](./run2/clip/12-event-closed-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 13 | `event-after` | [13-event-after-light.png](./run2/clip/13-event-after-light.png) | [13-event-after-night.png](./run2/clip/13-event-after-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 14 | `tray` | [14-tray-light.png](./run2/clip/14-tray-light.png) | [14-tray-night.png](./run2/clip/14-tray-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Tray](./run2/mockup-W0_Tray.png) |  |
| 15 | `new-poll-empty` | [15-new-poll-empty-light.png](./run2/clip/15-new-poll-empty-light.png) | [15-new-poll-empty-night.png](./run2/clip/15-new-poll-empty-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_NewPoll](./run2/mockup-W0_NewPoll.png) | New poll, empty (CTA disabled) |
| 16 | `new-poll-filled` | [16-new-poll-filled-light.png](./run2/clip/16-new-poll-filled-light.png) | [16-new-poll-filled-night.png](./run2/clip/16-new-poll-filled-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_NewPoll](./run2/mockup-W0_NewPoll.png) | New poll filled: 3 options, Anonymous on, CTA enabled |
| 17 | `new-signup` | [17-new-signup-light.png](./run2/clip/17-new-signup-light.png) | [17-new-signup-night.png](./run2/clip/17-new-signup-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_NewSignup](./run2/mockup-W0_NewSignup.png) |  |
| 18 | `share-event` | [18-share-event-light.png](./run2/clip/18-share-event-light.png) | [18-share-event-night.png](./run2/clip/18-share-event-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) |  |
| 19 | `share-event-empty` | [19-share-event-empty-light.png](./run2/clip/19-share-event-empty-light.png) | [19-share-event-empty-night.png](./run2/clip/19-share-event-empty-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) |  |
| 20 | `rsvp-sheet` | [20-rsvp-sheet-light.png](./run2/clip/20-rsvp-sheet-light.png) | [20-rsvp-sheet-night.png](./run2/clip/20-rsvp-sheet-night.png) | 375/375 (clip) · 375/375 (clip) | — | the RSVP sheet over the live event chat |
| 21 | `long-press-remove` | [21-long-press-remove-light.png](./run2/clip/21-long-press-remove-light.png) | [21-long-press-remove-night.png](./run2/clip/21-long-press-remove-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 22 | `empty-club` | [22-empty-club-light.png](./run2/clip/22-empty-club-light.png) | [22-empty-club-night.png](./run2/clip/22-empty-club-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_EmptyClub](./run2/mockup-W0_EmptyClub.png) |  |
| 23 | `load-failed` | [23-load-failed-light.png](./run2/clip/23-load-failed-light.png) | [23-load-failed-night.png](./run2/clip/23-load-failed-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 24 | `skeleton` | [24-skeleton-light.png](./run2/clip/24-skeleton-light.png) | [24-skeleton-night.png](./run2/clip/24-skeleton-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 25 | `new-signup-empty` | [25-new-signup-empty-light.png](./run2/clip/25-new-signup-empty-light.png) | [25-new-signup-empty-night.png](./run2/clip/25-new-signup-empty-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_NewSignup](./run2/mockup-W0_NewSignup.png) |  |
| 26 | `remove-confirm` | [26-remove-confirm-light.png](./run2/clip/26-remove-confirm-light.png) | [26-remove-confirm-night.png](./run2/clip/26-remove-confirm-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 27 | `member-board` | [27-member-board-light.png](./run2/clip/27-member-board-light.png) | [27-member-board-night.png](./run2/clip/27-member-board-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Board](./run2/mockup-W0_Board.png) |  |
| 28 | `member-lounge-picker` | [28-member-lounge-picker-light.png](./run2/clip/28-member-lounge-picker-light.png) | [28-member-lounge-picker-night.png](./run2/clip/28-member-lounge-picker-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Club](./run2/mockup-W0_Club.png) |  |
| 29 | `event-empty-soon` | [29-event-empty-soon-light.png](./run2/clip/29-event-empty-soon-light.png) | [29-event-empty-soon-night.png](./run2/clip/29-event-empty-soon-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_Room](./run2/mockup-W0_Room.png) |  |
| 30 | `home-chats-empty` | [30-home-chats-empty-light.png](./run2/clip/30-home-chats-empty-light.png) | [30-home-chats-empty-night.png](./run2/clip/30-home-chats-empty-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 31 | `home-requests-empty` | [31-home-requests-empty-light.png](./run2/clip/31-home-requests-empty-light.png) | [31-home-requests-empty-night.png](./run2/clip/31-home-requests-empty-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 32 | `week-failed` | [32-week-failed-light.png](./run2/clip/32-week-failed-light.png) | [32-week-failed-night.png](./run2/clip/32-week-failed-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 33 | `club-failed` | [33-club-failed-light.png](./run2/clip/33-club-failed-light.png) | [33-club-failed-night.png](./run2/clip/33-club-failed-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 34 | `board-failed` | [34-board-failed-light.png](./run2/clip/34-board-failed-light.png) | [34-board-failed-night.png](./run2/clip/34-board-failed-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |
| 35 | `share-events-failed` | [35-share-events-failed-light.png](./run2/clip/35-share-events-failed-light.png) | [35-share-events-failed-night.png](./run2/clip/35-share-events-failed-night.png) | 375/375 (clip) · 375/375 (clip) | [W0_ShareEvent](./run2/mockup-W0_ShareEvent.png) |  |
| 36 | `flag-pending` | [36-flag-pending-light.png](./run2/clip/36-flag-pending-light.png) | [36-flag-pending-night.png](./run2/clip/36-flag-pending-night.png) | 375/375 (clip) · 375/375 (clip) | — |  |

Unmocked calls: none — every call the screens made was in the fixture table.

Console:
- 69× (63 states): Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. C
- 69× (63 states): Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can
- 18× (10 states): Failed to load resource: the server responded with a status of 500 (Internal Server Error)

The console lines are the harness's two hydration lines per state (the frozen
clock, see "Console while shooting") and the `500`s the failure states ask for
(23, 32, 33, 34, 35). `unmocked.json` is `[]` in both passes.

### Records in run2/

`shots.json`, `unmocked.json`, `console.json` for the HEAD pass (each shot
now carries `layout: { innerWidth, scrollWidth }` and `clipWeek`), the same
three under `clip/`, the 13 mockups (re-shot, unchanged), and `*-FAILED.png`
for the six HEAD states whose click the 409px layout blocked (12 files; 15 and
16 follow 14 and have none). The tools grew for run 2:
`fixtures.mjs` variants `threadsEmpty`, `calendar500`, `featuresDelayMs`,
`space500`, `shareEvents500`, `thread500`; `shoot.mjs` states 25–36, the
`layout` measurement on every shot and `--clip-week`; `build-readme.mjs` the
"layout" column. Re-run: `OUT_DIR=../run2 node shoot.mjs` and
`OUT_DIR=../run2/clip node shoot.mjs --clip-week --no-mockups`.

## Run 1 — the shots (HEAD `b81aa29`, before the repairs)

Light shots are checked against `W0_Club_Light` where one exists, else against
the Night mockup's layout (the contract adopts the app's Light tokens, 11.0).

<!-- generated by tools/build-readme.mjs from shots.json (NOW 2026-10-08T22:12:00.000Z) -->
| # | state | app · Light | app · Night | mockup | notes |
|---|---|---|---|---|---|
| 01 | `home-all` | [01-home-all-light.png](./01-home-all-light.png) | [01-home-all-night.png](./01-home-all-night.png) | [W0_Home](./mockup-W0_Home.png) |  |
| 02 | `home-chats` | [02-home-chats-light.png](./02-home-chats-light.png) | [02-home-chats-night.png](./02-home-chats-night.png) | [W0_Home](./mockup-W0_Home.png) |  |
| 03 | `home-clubs` | [03-home-clubs-light.png](./03-home-clubs-light.png) | [03-home-clubs-night.png](./03-home-clubs-night.png) | [W0_Home](./mockup-W0_Home.png) |  |
| 04 | `home-requests` | [04-home-requests-light.png](./04-home-requests-light.png) | [04-home-requests-night.png](./04-home-requests-night.png) | — |  |
| 05 | `home-no-clubs` | [05-home-no-clubs-light.png](./05-home-no-clubs-light.png) | [05-home-no-clubs-night.png](./05-home-no-clubs-night.png) | [W0_EmptyClubs](./mockup-W0_EmptyClubs.png) |  |
| 06 | `home-empty-week` | [06-home-empty-week-light.png](./06-home-empty-week-light.png) | [06-home-empty-week-night.png](./06-home-empty-week-night.png) | [W0_EmptyWeek](./mockup-W0_EmptyWeek.png) |  |
| 07 | `club-lounge` | [07-club-lounge-light.png](./07-club-lounge-light.png) | [07-club-lounge-night.png](./07-club-lounge-night.png) | [W0_Club](./mockup-W0_Club.png), [W0_Club_Light](./mockup-W0_Club_Light.png) |  |
| 08 | `club-lounge-full` | [08-club-lounge-full-light.png](./08-club-lounge-full-light.png) | [08-club-lounge-full-night.png](./08-club-lounge-full-night.png) | [W0_Club](./mockup-W0_Club.png), [W0_Cards](./mockup-W0_Cards.png) | the same, 375×2300 so every Lounge row shows: text runs, poll, closed anonymous poll, sign-up, event card, cancelled card, removed own message, quote |
| 09 | `board` | [09-board-light.png](./09-board-light.png) | [09-board-night.png](./09-board-night.png) | [W0_Board](./mockup-W0_Board.png) |  |
| 10 | `board-fold-open` | [10-board-fold-open-light.png](./10-board-fold-open-light.png) | [10-board-fold-open-night.png](./10-board-fold-open-night.png) | [W0_Board](./mockup-W0_Board.png) | the newest post's fold open: 2 replies + a stub, the Reply quietly field |
| 11 | `event-live` | [11-event-live-light.png](./11-event-live-light.png) | [11-event-live-night.png](./11-event-live-night.png) | [W0_Room](./mockup-W0_Room.png) |  |
| 12 | `event-closed` | [12-event-closed-light.png](./12-event-closed-light.png) | [12-event-closed-night.png](./12-event-closed-night.png) | [W0_Room](./mockup-W0_Room.png) |  |
| 13 | `event-after` | [13-event-after-light.png](./13-event-after-light.png) | [13-event-after-night.png](./13-event-after-night.png) | [W0_Room](./mockup-W0_Room.png) |  |
| 14 | `tray` | [14-tray-light.png](./14-tray-light.png) | [14-tray-night.png](./14-tray-night.png) | [W0_Tray](./mockup-W0_Tray.png) |  |
| 15 | `new-poll-empty` | [15-new-poll-empty-light.png](./15-new-poll-empty-light.png) | [15-new-poll-empty-night.png](./15-new-poll-empty-night.png) | [W0_NewPoll](./mockup-W0_NewPoll.png) | New poll, empty (CTA disabled) |
| 16 | `new-poll-filled` | [16-new-poll-filled-light.png](./16-new-poll-filled-light.png) | [16-new-poll-filled-night.png](./16-new-poll-filled-night.png) | [W0_NewPoll](./mockup-W0_NewPoll.png) | New poll filled: 3 options, Anonymous on, CTA enabled |
| 17 | `new-signup` | [17-new-signup-light.png](./17-new-signup-light.png) | [17-new-signup-night.png](./17-new-signup-night.png) | [W0_NewSignup](./mockup-W0_NewSignup.png) |  |
| 18 | `share-event` | [18-share-event-light.png](./18-share-event-light.png) | [18-share-event-night.png](./18-share-event-night.png) | [W0_ShareEvent](./mockup-W0_ShareEvent.png) |  |
| 19 | `share-event-empty` | [19-share-event-empty-light.png](./19-share-event-empty-light.png) | [19-share-event-empty-night.png](./19-share-event-empty-night.png) | [W0_ShareEvent](./mockup-W0_ShareEvent.png) |  |
| 20 | `rsvp-sheet` | [20-rsvp-sheet-light.png](./20-rsvp-sheet-light.png) | [20-rsvp-sheet-night.png](./20-rsvp-sheet-night.png) | — | the RSVP sheet over the live event chat |
| 21 | `long-press-remove` | [21-long-press-remove-light.png](./21-long-press-remove-light.png) | [21-long-press-remove-night.png](./21-long-press-remove-night.png) | — |  |
| 22 | `empty-club` | [22-empty-club-light.png](./22-empty-club-light.png) | [22-empty-club-night.png](./22-empty-club-night.png) | [W0_EmptyClub](./mockup-W0_EmptyClub.png) |  |
| 23 | `load-failed` | [23-load-failed-light.png](./23-load-failed-light.png) | [23-load-failed-night.png](./23-load-failed-night.png) | — |  |
| 24 | `skeleton` | [24-skeleton-light.png](./24-skeleton-light.png) | [24-skeleton-night.png](./24-skeleton-night.png) | — |  |

### Mockups (390 wide, full page)
- [mockup-W0_Board.png](./mockup-W0_Board.png) — W0_Board
- [mockup-W0_Cards.png](./mockup-W0_Cards.png) — W0_Cards
- [mockup-W0_Club_Light.png](./mockup-W0_Club_Light.png) — W0_Club_Light
- [mockup-W0_Club.png](./mockup-W0_Club.png) — W0_Club
- [mockup-W0_EmptyClub.png](./mockup-W0_EmptyClub.png) — W0_EmptyClub
- [mockup-W0_EmptyClubs.png](./mockup-W0_EmptyClubs.png) — W0_EmptyClubs
- [mockup-W0_EmptyWeek.png](./mockup-W0_EmptyWeek.png) — W0_EmptyWeek
- [mockup-W0_Home.png](./mockup-W0_Home.png) — W0_Home
- [mockup-W0_NewPoll.png](./mockup-W0_NewPoll.png) — W0_NewPoll
- [mockup-W0_NewSignup.png](./mockup-W0_NewSignup.png) — W0_NewSignup
- [mockup-W0_Room.png](./mockup-W0_Room.png) — W0_Room
- [mockup-W0_ShareEvent.png](./mockup-W0_ShareEvent.png) — W0_ShareEvent
- [mockup-W0_Tray.png](./mockup-W0_Tray.png) — W0_Tray

### Unmocked /api calls seen
- none: every call the screens made was in the fixture table.

### Console errors while shooting
- 42× (39 states): Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. C
- 42× (39 states): Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can
- 4× (2 states): Failed to load resource: the server responded with a status of 500 (Internal Server Error)

### Records beside the PNGs
- `shots.json` — every file with its state, theme and note, and the frozen NOW.
- `unmocked.json` — every `/api` call the fixtures did not know (answered 404).
- `console.json` — every console error / warning and page error per state.
- `harness-notes.md` — how the harness was built, step by step, and what it hit.

## Re-running it (cloud or the Mac)

Everything lives in `tools/`. Playwright is installed THERE, never in the repo.

```sh
cd handoffs/chat-redesign/wave-2-build/visual/tools
npm install                          # playwright 1.55 only
npx playwright install chromium      # on the Mac; the cloud has /opt/pw-browsers/chromium

# 1. the fake Supabase (port 54321): GET /auth/v1/user, the users row, [] for the rest
node fake-supabase.mjs &

# 2. next dev against it (shell env beats .env.local, so the real database is never touched)
( cd ../../../../.. && NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=harness-anon-key \
    SUPABASE_SERVICE_ROLE_KEY=harness-service-role-key \
    NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3111 ) &

# 3. the shots (≈4 min warm): OUT_DIR is where the PNGs and the three records land
OUT_DIR=.. node shoot.mjs                 # every state, both themes, the 13 mockups
OUT_DIR=.. node shoot.mjs --only=14-tray --themes=night --no-mockups   # one state; merges into the records
OUT_DIR=.. node shoot.mjs --real-time     # the wall clock instead of the frozen one

# 4. the table above
OUT_DIR=.. node build-readme.mjs > table.md
```

Env knobs: `APP_URL` (default `http://localhost:3111`), `NEXT_PUBLIC_SUPABASE_URL`
(the cookie's name follows it; default `http://localhost:54321`),
`PLAYWRIGHT_CHROMIUM` (an executable; unset → Playwright's own browser),
`MOCKUPS_DIR` (default `../../../boards` from `tools/`), `SHARP_DIR` (the repo's
`node_modules/sharp`, used only to palette-quantize a PNG over 300 KB).
`node harness-session.mjs` prints the auth cookie for a `curl`.

What the harness does that the app does not: freezes `Date` (`page.clock.setFixedTime`;
timers keep running), serves Google Fonts from `tools/fonts/` (Chromium cannot
reach them in the cloud; the glyphs are production's), removes the Next dev-tools
badge (`<nextjs-portal>`, it sits over the composer's "+"), answers the SSR
desktop iframe (`/html/messages.html`) with 204, and sets `localStorage.vibe_theme`
before load (the way `src/lib/theme/theme.ts` reads the preference).

## Unmocked calls

None in the frozen-clock run (`unmocked.json` is `[]`): every call the new
screens made was in the fixture table. A `--real-time` check run of the home
logged one, `GET /api/me/profile-bootstrap` — it is `LeftNav`'s fetch
(`src/components/LeftNav.tsx:216`), the SSR desktop tree that `MessagesSwitch`
renders before hydration; with the clock frozen that tree is regenerated by
React (see "Console" below) before its effect fires, without it the effect
fires once and the phone tree replaces it. Not a call of the new screens.

## States that could not be reached, and states not in this pass

Every state the brief asked for was shot. Not in this pass (all reachable with a
fixture variant in `tools/fixtures.mjs`, none needs a code change):

- the flag-pending header (`FlagPending`, 2.1) — delay `/api/me/features`;
- a member's Board (the quiet `Only officers post on the Board.` tile) and a
  member's Lounge (no `Remove` in the picker) — open Chess Club's rooms
  (`?channel=cccccccc-0011-…` / `-0012-…`; fixtures exist, not shot);
- the Officers room and a custom `room`; the `Earlier messages` button (a full
  first page of 50); the `Say hi to <club>.` / `Nothing on the Board yet.` /
  `Say hi to everyone going.` empty lines (Chess's Board and the Late Night
  Social room are empty in the fixtures, not shot);
- the other `LoadFailed`s: the space (`Couldn't load this club.`, 403
  `Members only.`), the Board, the replies, the week, the event chat, the
  Share sheet's list; the toasts (a refused send, `You left the event chat.`);
- a vote / a Take a spot / an RSVP round trip (the fixtures answer them; the
  shots are at rest); `Posting…` on a CTA; the `content_blocked` outline;
- the old conversation view opened from the home (a dm / group tap — W1 code,
  unchanged) and the compose overlay;
- the `?to=` deep link; Back / swipe / history (not visual).

## Things seen while shooting (for the review, not fixed here)

- Home week card (142×64): `Live now · ✓ Going` does not fit at 375 — the first
  line reads `Live n… · ✓ Going` (`01-home-all-*`, `23-*`, `24-*`). The mockup
  is 390 wide.
- Up next card (2-column, 50px): `Tonight · 9:30 PM · ● Maybe` + the `Soon` ring
  truncates to `● M…` (`07-club-lounge-*` and every space shot).
- Board strip: `Formal tickets are at th…` — expected, one line.
- New sign-up: the slot input is 160px wide next to the 118px stepper, so a
  label like `Leaving from Union, 6:30` scrolls inside it (`17-new-signup-*`).
- The Share-an-event list shows a LIVE event (Fall Formal, `Thu · 5:42 PM`) as
  "upcoming": `upcoming` is the not-ended list (7.2.6), so a live one is in it.
- Poll option voter avatars: the two 20px avatars sit right of the bar; the
  `Your pick` line is under the picked label (`08-club-lounge-full-*`).

## Console while shooting

Two lines per state in `console.json`, both the harness's own doing: the
frozen clock makes the SSR desktop tree's calendar widget (`LeftNav`, rendered
by `MessagesSwitch` before hydration, replaced by the phone tree on the first
client render) hydrate with a different month than the server rendered, and
React then logs the hydration mismatch and the "script tag inside a component"
warning that follows a client re-render of the layout's head. A `--real-time`
run logs nothing (checked). The four `500` lines are `23-load-failed`'s inbox.
