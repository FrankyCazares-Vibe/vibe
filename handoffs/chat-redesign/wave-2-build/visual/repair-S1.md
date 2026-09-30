# W2-S1 visual repair — the Messages home after `review-S1.md` (2026-09-30)

Repairer: the S1 batch (owns `MessagesMobile.tsx`'s flag fork, `messages/home/*`,
`v2-tokens.ts`, `avatar.ts`, `week.ts`, `use-chat-v2.ts`, `use-hide-tabbar.ts`).
Base `b81aa29`. Each finding was checked against its shot, the mockup
(`W0_Home.dc.html`, MK:1) and the contract (11.0 / 11.1 / 11.2 / 1.2; the
contract's pinned sizes, tokens and strings win) before a decision. No
contract string, size or token was changed to anything but the contract's.

Re-shot with the visual harness copied to the scratchpad (Playwright
installed there, never in the tree), the same frozen clock, `--only=home` and
`--only=24-skeleton`, both themes; measured with a small script on the same
setup (card widths, the bloom's centre before and after a 103px scroll of the
row, row and skeleton heights). The evidence shots are in `repair-S1/`
(`01-home-all-{light,night}`, `03-home-clubs-night`, `24-skeleton-light`,
`scrolled-night` = the row scrolled 103px, the bloom still on the live card).

## The table

| # | sev | verdict | where | what was done / why not |
|---|---|---|---|---|
| VIS-S1-1 | HIGH | **FIXED** | `home/YourWeek.tsx` `WeekCard` style + the title and club-line spans | The pinned `● Live now · ✓ Going` (1.2, N5) needs ~134px of text at 12px/700 and a 142 card leaves 120: the string was cut on the default state (`Live n… · ✓ Going` in every shot 01–05, 23, 24). Line 1 alone now sizes the card: `width: "max-content", minWidth: 142, maxWidth: 184`; the title and the club line are `contain: "inline-size"` so they contribute nothing to the width and keep their ellipsis; line 1 keeps its own `overflow: hidden` + ellipsis past 184. Measured: the live card 146.5px with no overflow on line 1, `Ended · ✓ Going` and `9:30 PM · ● Maybe` stay 142, `Late Night Social` still ellipsizes on its 142 card. 142 remains the floor and the skeleton tile (11.2's size), so a card that fits the mockup's strings draws exactly the mockup's card. The row scrolls, so a wider live card costs nothing at 375. |
| VIS-S1-2 | MEDIUM | **FIXED** | `home/YourWeek.tsx` the bloom `div`, a layout effect | The bloom sat at the mockup's `left: -92` (the first-card case) while the sort by `starts_at` (11.2) put the live card second: the halo was around `Ended · ✓ Going`. Now: `bloomLeft` state = the live card's `offsetLeft + offsetWidth / 2 − 170 − row.scrollLeft`, measured in a `useLayoutEffect` keyed on the live id and the card ids, again after `document.fonts.ready` (the cards size to their text) and on the row's `scroll` (a passive listener attached in the effect). Drawn only when a live card exists and has been measured. Measured: bloom centre 239 = live card centre 239.2 at rest; after `scrollTo(120)` (103 effective) both at 136. `top: 54`, 340×118, `zIndex: -1` and the token unchanged. A `useCallback` version was refused by the React Compiler lint (`preserve-manual-memoization`), hence the effect-local `place`. |
| VIS-S1-3 | MEDIUM | **DEFERRED** | `src/components/feedback/LoadFailed.tsx:125-126` | Verified: `#FAF7F2` on `#FF5C35` is 2.9:1 at 13px/12px, under 11.0's 4.5:1; it shows in `23-load-failed-*` and every other `LoadFailed` the new screens mount. The file is shared and not S1's (13.2), so the one-line fix (`color: "#140806"`, the `coralButton.ink` of `v2-tokens.ts`, ≈ 9.6:1) is written as a REQUEST in `S1-notes.md` Part 4 for the file's owner / the integration review, with the alternative (record the 2.9:1 as an accepted inheritance in `S1-contrast.md`). Nothing in S1's files changed for it. |
| VIS-S1-4 | LOW | **FIXED** (cheap) | `home/ClubRow.tsx` | Chess Club (`next_event: null`, `unread_count: 3`) grew to three lines for a lone right-aligned `3 new` (`01-*`, `03-*`); no mockup draws a lone pill (`W0_Home:147` pairs it with a chip). Now the preview line is a flex row (`gap: 10`, as `PersonRow`), the preview `flexGrow: 1, minWidth: 0`, and when there is no chip the same 20px pill sits at its right; with a chip the chip line keeps the pill as before; with no preview at all the pill still gets its own line (no fixture reaches it). Measured: the Chess Club row 66px, the preview ellipsizes before the pill (`Anyone up for blitz ton…`). |
| VIS-S1-5 | LOW | **REJECTED** (conformant) | `home/MessagesHome.tsx` Requests branch | 11.1 pins `Requests = requests (today's rows)` and S1-notes STOPPED records the choice; `ThreadRow` is the contract's row there. Switching to `PersonRow` would drop the request's own age (`relativeTime`) for the list's one clock and change a screen the contract fixed. Left as built; recorded by the review for the follow-up. |
| VIS-S1-6 | LOW | **FIXED** (cheap) | `home/MessagesHome.tsx` `HomeSkeleton` | 74px `ListSkeleton` rows resolved into 66px rows (a visible jump). A home-local `HomeSkeleton` with the same shape and the same three scrims (11.0 "the `ListSkeleton` shape"): a 44px disc, `padding: 11px 16px`, the 55%×14 / 85%×11 bars, `aria-hidden`. Measured: five rows of 67px (66 + the hairline). `ListSkeleton` itself is untouched (the old list keeps it). |
| VIS-S1-7 | LOW | **REJECTED** (conformant) | `v2-tokens.ts` `bloom` | 11.0 pins "bloom: the two columns of MK:0.1" = `.36 → .13 → 0` Night, `.22 → .08 → 0` Light, which is what the tokens hold; `W0_Home:22`'s `.56 → .20` is the mockup's own stronger halo that the contract did not adopt. Changing the token to the mockup's would be changing a contract token. If Franky wants the glow, a second `bloomHome` token is a one-line addition for the follow-up; noted here so the Mac review reads the softer halo as the contract's. |

## What the re-shot home shows (both themes)

- `01-home-all`: `Ended · ✓ Going` (142) · `● Live now · ✓ Going` (146.5, live chrome, the bloom centred on it) · `9:30 PM · ● Maybe` (142); the strip, the filter row and the rows as before; Chess Club two lines with `3 new` at the right of `Priya Shah: Anyone up for blitz ton…`.
- `03-home-clubs`: Salsa Club (chip line with `12 new`) and Chess Club (66px, the pill on the preview line).
- `scrolled-night`: the row scrolled 103px, the halo still around Fall Formal, the mask on the right edge.
- `24-skeleton`: the week's cards, `All` with no badge, five 66px skeleton rows under the filter row.
- `02`, `04`, `05`, `06` re-shot and unchanged apart from the week row (01's fixes) — the no-clubs block, the requests row and the empty week line are as the first pass judged them.

## Gates

`npm run typecheck` 0 · `npm test` 1639/1639 · `npx eslint` on `home/YourWeek.tsx`,
`home/ClubRow.tsx`, `home/MessagesHome.tsx` 0 errors. `npm run build` not run
here (no server-only import touched; the orchestrator runs it once after the
three repairs).

## Files

- `src/components/mobile/messages/home/YourWeek.tsx` — VIS-S1-1, VIS-S1-2
- `src/components/mobile/messages/home/ClubRow.tsx` — VIS-S1-4
- `src/components/mobile/messages/home/MessagesHome.tsx` — VIS-S1-6
- `handoffs/chat-redesign/wave-2-build/S1-notes.md` — Part 4, the REQUEST for VIS-S1-3
- `handoffs/chat-redesign/wave-2-build/visual/repair-S1/*.png` — the evidence shots
