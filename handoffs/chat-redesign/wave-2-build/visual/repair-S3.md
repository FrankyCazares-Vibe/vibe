# W2-S3 visual repair — the cards, the tray and the three sheets after `review-S3.md` (2026-09-30)

Repairer: the S3 batch (owns `messages/cards/*` and `messages/compose/*`).
Base `4bd44ea` (the S1 and S2 visual repairs already on the branch). Each
finding was checked against its shot, the mockup (`W0_NewPoll`, `W0_NewSignup`,
`W0_ShareEvent`, `W0_Tray`; MK:8–11) and the contract (11.0 / 11.7 / 1.2; the
contract's pinned sizes, tokens and strings win) before a decision. No contract
string, size or token was changed to anything but the contract's.

Re-shot with the visual harness copied to the scratchpad (Playwright there,
never in the tree), the same frozen clock, `--only=14-tray` (15, 16),
`--only=17-new-signup`, `--only=share-event` (18, 19), both themes; measured
with a small Playwright script on the same setup (`getBoundingClientRect` of
the slot input, the stepper, the arms, the X, the option pills before and
after `Add option`, the note counter; `scrollWidth` vs `clientWidth` of the
slot input for the fit). The evidence shots are in `repair-S3/`
(`15-new-poll-empty-night`, `16-new-poll-filled-night`, `17-new-signup-{light,night}`,
`18-share-event-light`, `19-share-event-empty-night`).

**One thing to know before reading the shots**: at `4bd44ea` the "+" cannot be
clicked at 375×812 under mobile emulation, because W2-S1's repaired bloom
(`home/YourWeek.tsx:93`, `left: bloomLeft` = 70 with the fixtures, width 340)
widens the document to 410px behind the club layer; the layout viewport grows
to 410×888 and every screen renders scaled (the club header's right disc cut,
the composer at y 832). It is S1's file (REQUESTS 5 in `S3-notes.md`, with the
measurements and the one-line fix); the shots here were taken in a scratch
worktree with that one file at `5d0e424` and nothing else changed, so they show
the sheets as they will look once S1's overflow is clipped.

## The table

| # | sev | verdict | where | what was done / why not |
|---|---|---|---|---|
| VIS-S3-1 | MEDIUM | **DEFERRED** | `club/RoomComposer.tsx:324` (W2-S2) | Verified: every sheet in 15–19 shows the bare `Salsa Club · the Lounge`; `CardSheet` draws the 14px dot only when `orgId` is passed (`CardSheet.tsx:140`, the prop is threaded through `ComposeSheets` and the three sheets), and `RoomComposer` still passes none after the S2 repair. Nothing to change in S3's files; the request stands as REQUESTS 1 and is restated as REQUESTS 3 in `S3-notes.md` with the exact wiring (`orgId` beside `orgHandle`, `ClubSpace` → `org.id`, `EventChat` → `club.id`). |
| VIS-S3-2 | MEDIUM | **FIXED** | `compose/NewSignupSheet.tsx` (the row, the header, the stepper), `compose/CardSheet.tsx` `RemoveButton` | Verified on 17: the slot input was 173px at 375 (`Leaving from Unior`, `Leaving from Ball H`). The mockup's 118px stepper had no Remove column beside it; the contract adds one. Now the stepper is 106×48 with `padding: 0` (the arms stay 44×44, the number `minWidth: 18`), the row and header gaps are 6, and the X reaches `−12` into the gutter — but keeps its **44×44 hit** (11.0's ≥ 44px targets; the review's `width: 40` would have broken it), via a new optional `into` prop on `RemoveButton` (default −8, the mockup's, so the poll sheet is unchanged). Measured: the slot input 193×48 (169px of text; `Leaving from Union` fits, `scrollWidth === clientWidth`), the stepper 215→321, the `Spots` header 215→321 over it, the arms 44×44, the X 44×44 ending at 371. Shot 17: `Leaving from Union, 6` / `Leaving from Ball Hall` — whole glyphs at the padding edge, both themes. |
| VIS-S3-3 | LOW | **DEFERRED** | `club/RoomComposer.tsx:297` (W2-S2) | Verified against `W0_Tray:93` (the inverted `#F6F1EA` / `#0C0B0B` disc with the X): the app rotates the plus on the surface disc. The button is S2's; the three style lines (`t.activeChip.bg` / `.ink` / the border, keep the rotation) are REQUESTS 4 in `S3-notes.md`. |
| VIS-S3-4 | LOW | **FIXED** (cheap) | `compose/ShareEventSheet.tsx` the note block | Verified on 18/19: `26 / 200` / `0 / 200` alone on a 16px row above the field. The note has no label word in 1.2 and the mockup has no counter, so the counter now sits inside the field's right end: the input in a `position: relative` wrapper with `paddingRight: 72`, the `<Counter>` (its `aria-label="<n> of 200 characters"` unchanged) absolutely placed at `right: 14`, centred on the 48px height, `pointerEvents: none`. Measured: the counter's right edge at 345 = the field's inner edge (359 − 14). Shots 18 and 19: `Come hang after the formal … 26 / 200` and the placeholder with `0 / 200` on one 48px field; the lone row is gone. |
| VIS-S3-5 | LOW | **FIXED** (cheap) | `compose/NewPollSheet.tsx` the option row | Verified on 15 vs 16: the pills were 343px at two options and 305px at three. At the minimum a 36px `aria-hidden` spacer now holds the Remove column (as the review's fix). Measured: the pill 305×48 before and after `Add option`; no jump. Shot 15: the two empty pills end at 321 with the column free at the right. The same reservation is applied to the sign-up sheet (one slot → the 32px column held, the header's spacer always drawn), so its rows do not jump either when the second slot arrives (17's single-slot moment: the input stays 193px). |

## What the re-shot sheets show (both themes)

- `15-new-poll-empty`: `New poll`, `0 / 200`, two 305px pills with the 18px ring, `Add option` / `2 to 10 options`, both switches `Off`, `Post poll` disabled. Unchanged apart from the pills' width.
- `16-new-poll-filled`: the three pills at the same 305px with the 44×44 X (`Remove Bachata-heavy` …) at −8, `Anonymous` `On`, the gradient CTA.
- `17-new-signup`: `Title` + `19 / 200`; `Slots` / `Spots` (centred over the 106px stepper); two rows = the 193px input, the 106×48 stepper (`−` secondary / `+` ink, the number 15.5/800), the 44×44 X; `Add slot` / `1 to 10 slots`; the helper; `Post sign-up` enabled.
- `18-share-event`: the three 66px rows as before; the note field with `26 / 200` inside at the right; the helper; `Share to the Lounge` enabled.
- `19-share-event-empty`: `No upcoming events.`, the field with the placeholder and `0 / 200` inside, the CTA disabled.
- The cards (08) were not re-shot: no finding touched `cards/*`.

## Not changed (holds of the review, confirmed)

The Light `t.coralMark` on the picked count / `Your pick`; the tray's scrim over the thread only; `4 open` and the tray's line in `t.secondary`; the Light tray on `t.surface`; `No upcoming events.` at 13/500 secondary.

## Gates

`npm run typecheck` 0 · `npm test` 1639/1639 · `npx eslint` on `messages/compose` and
`messages/cards` 0. `npm run build` not run here (no server-only import touched; the
orchestrator runs it once after the three repairs).
