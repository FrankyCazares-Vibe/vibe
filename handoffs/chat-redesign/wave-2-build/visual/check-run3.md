# Visual run 3 — the check (wave 2)

Run 3 (`run3/`, HEAD `2cdcfbe`, the integrated head, no `--clip-week`, no other
harness-side workaround) against run 2 (`run2/` for the states that shot there;
`run2/clip/` for 14, 16, 17, 18, which run 2 proper marked FAILED or never
reached). Both themes of every state below were opened and read side by side.
`run3/viewport.json`: `viewport: 375`, `clipWeek: false`, and all 36 states ×
2 themes report `innerWidth: 375, scrollWidth: 375` — no measurement is 409.
`run3/unmocked.json` is `[]`, identical to run 2.

**Verdict: PASS.** The right edge is whole on every state that run 2 clipped,
the tray opens from `run3/` proper, the Board's card post draws full width
without the second avatar, the three sheets carry the club dot, and nothing
that was right in run 2 has regressed.

## The four questions

| question | answer |
|---|---|
| Is the right edge whole now? | Yes. The club-page button (↗) in the space header (07, 08, 09, 10, 21, 22), the Board post times `5:32 PM` / `Yesterday` / `Tue` (09, 10), `Replies stay quiet` (09, 10), the Going pill in the event chat (11), and the second Up next card `Late Night … ○ Soon` (07, 08, 09, 10, 21) are all fully drawn at 375 in both themes. Run 2 cut every one of them at the 375 edge of its 409 layout. |
| Is the tray reachable without the clip? | Yes. `run3/14-tray-{light,night}.png` exist (no `-FAILED`, no `clip/`) and show the `Add to the Lounge` tray with Poll / Sign-up / Event over the Lounge, the composer's "+" inverted to × (the INT repair; run 2's clip twin had a light ×). Run 2 proper: `14-tray-*-FAILED.png` (the "+" was off the visual viewport). |
| Does a Board card post draw full width without a second avatar? | Yes (09, 10). The Fall Formal event card fills the post's width (band edge to edge inside the post's padding), has no inner `Priya Shah · Event` byline (the post header already carries it), and the second `PS` avatar at the card's bottom-left is gone. Run 2 drew the 292px Lounge bubble indented in the avatar column with the byline twice. Matches INT-ADJUDICATE-3 (`layout="post"`: no header, `width: 100%`). |
| Do the sheets show the club dot on `<club> · the Lounge`? | Yes. `New poll` (16), `New sign-up` (17) and `Share an event` (18) each draw the Salsa Club olive dot before `Salsa Club · the Lounge` in both themes; run 2's clip twins had the text alone. |

## State by state

| state | run 2 | run 3 | verdict |
|---|---|---|---|
| 01-home-all | Layout 409: the tab bar (Campus / Network / otto / Messages / Profile) was pushed off and absent; the compose pencil and the week strip drew as now. | Tab bar present at the bottom in both themes; week strip, three cards (third peeking by design, a horizontal strip), chips, five rows identical to run 2. | PASS — gains the tab bar; no regression |
| 07-club-lounge | ↗ button half cut; second Up next card cut at `Late Night So… Soo`; Board banner without its chevron; `Removed by a club officer` bubble and the own coral bubble cut at the right; no composer. | ↗ whole; `Tonight · 9:30 PM · Maybe / Late Night … ○ Soon` whole; banner `… at th… ● ›`; removed bubble whole (`Only you can see this message.`); own bubble whole; composer `+ / Message the Lounge / ↑`. | PASS |
| 08-club-lounge-full | Same cuts as 07 over the 4600px page (header ↗, second Up next card, removed bubble, no composer). | Every element whole; `Remember to bring your ID for the door` now wraps to two lines (the bubble's max-width at a true 375, expected); polls, sign-up, both event cards, the quote, composer all present. Large blank band above `Today` is present in both runs (full-page capture of the bottom-pinned list), not new. | PASS |
| 09-board | ↗ cut; `5:32 P…`, `Yesterda…`, `Tu…` cut; `Replies stay quie…` cut on all three posts; card post = 292px Lounge bubble indented with `Priya Shah · Event` byline and a second `PS` avatar; no composer. | ↗ whole; `5:32 PM`, `Yesterday`, `Tue` whole; `Replies stay quiet` whole with the bell-off; card post full width, no inner byline, no second avatar; `Everyone in Salsa Club sees this` + `Post to the Board` composer visible. | PASS |
| 10-board-fold-open | Same edge cuts as 09; fold open (`3 replies ^`, Jay Kim, Maya Reyes, `Reply quietly`) drawn but the reply field ran to the cut edge. | Fold open and whole (`Reply quietly` with ↑ inside the post); Maya's reply wraps to two lines at 375; card post below is full width, no second avatar; composer visible. | PASS |
| 11-event-live | Hero band, `When` tile, `Going` pill, banner, and the own `Walking over no…` bubble cut at the right; no composer. | Hero band whole with `Live now`; `Where` / `When` tiles equal width; `18 going · 6 maybe` with the `✓ Going` pill whole; banner with chevron; `Walking over now` whole; `Message the event chat` composer visible. | PASS |
| 14-tray | run 2 proper FAILED (the "+" off the visual viewport); run 2/clip showed the tray with a light × on the "+". | Tray open from run 3 proper: `Add to the Lounge`, Poll / Sign-up / Event rows with chevrons, pointer to the "+", the "+" inverted (dark × in Light, light × in Night). | PASS — reachable without the clip |
| 16-new-poll-filled | run 2 proper: not shot; run 2/clip: sheet complete, `Salsa Club · the Lounge` without the dot. | Sheet identical plus the club dot before `Salsa Club · the Lounge`; question `24 / 200`, three options, `Add option`, Anonymous On, multi Off, `Post poll`. | PASS |
| 17-new-signup | run 2 proper FAILED; run 2/clip: sheet complete, no club dot. | Sheet identical plus the club dot; title `19 / 200`, two slots with steppers `2` / `3`, `Add slot`, `Names show to everyone in this room.`, `Post sign-up`. | PASS |
| 18-share-event | run 2 proper FAILED; run 2/clip: sheet complete, no club dot. | Sheet identical plus the club dot; three upcoming events with Late Night Social selected, note `26 / 200`, `Share to the Lounge`. | PASS |
| 21-long-press-remove | ↗ cut; second Up next card cut; removed bubble and own bubble cut; no composer; picker (Remove / Report / Reply + 7 reactions) drawn. | Picker identical (Remove in coral, Report, Reply, 7 reactions) over the same message; every edge element whole; composer visible. | PASS |
| 22-empty-club | ↗ cut; `Add your first event` dashed button ran past the edge; the three checklist rows' chevrons cut. | ↗ whole; dashed button whole with a right edge; `It's just you so far.` + the three rows with their chevrons whole; composer `Message the Lounge` visible. | PASS |

## Regressions

None. Every difference between run 2 and run 3 on these twelve states is one of:
the clip landing in the app (the right edge, the composer, the tab bar), one of
the other integration repairs (the card post's `layout="post"`, the inverted
"+", the club dot), or text re-wrapping at a true 375 (08's ID bubble, 10's
second reply). The console diff between the runs is only the harness's known
frozen-clock hydration notice moving between states (28, 34, 35) and the
fixture 500s that 34/35 request on purpose; nothing new on the twelve states
checked.

## Files read

`run3/viewport.json`, `run3/console.json` vs `run2/console.json`,
`run3/unmocked.json` vs `run2/unmocked.json`, `harness-notes.md` (steps 6–7),
`README.md` "Re-running it", `integration-adjudicate.md` (A1, A3, A4), and the
PNGs: `run2/` and `run3/` for 01, 07, 08, 09, 10, 11, 21, 22; `run2/clip/` and
`run3/` for 14, 16, 17, 18 — Light and Night of each.
