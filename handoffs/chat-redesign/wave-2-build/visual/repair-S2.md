# W2-S2 visual repair — the club space after `review-S2.md` (2026-09-30)

Repairer: the S2 batch (owns `messages/club/*`, `src/lib/chat/use-room-poll.ts`,
`page-merge.ts`, the `onRemove` lines of `MessageBubble.tsx` / `ReactionPicker.tsx`).
Base `6adce71` (S1's visual repair on top of `b81aa29`). Each of the seven
findings was checked against its shot, the mockup (`W0_Club`, `W0_Club_Light`,
`W0_Board`, `W0_Room`, `W0_EmptyClub`; MK:4, 5, 6, 12) and the contract
(11.0 / 11.3 / 11.4 / 11.6 / 11.8 / 11.9.3 / 1.2; the contract's pinned sizes,
tokens and strings win) before a decision. No contract string, size or token
was changed to anything but the contract's; what moved is what only the mockup
drew (a 12px line, 5px gaps, 10px card sides, 12px chip sides, 6px chip gaps).

Re-shot with the visual harness copied to the scratchpad (Playwright there,
never in the tree; the fake Supabase on 54321, `next dev -p 3121`, the same
frozen clock, `--only=<state>` for 07/08, 09/10, 12, 22, 24, both themes) and
measured with two small scripts on the same setup (`window.innerWidth`,
`document.scrollWidth`, every element past 375; the Up next line's spans and
`canvas.measureText` in the loaded DM Sans at the candidate sizes). The
evidence shots are in `repair-S2/` (`07-club-lounge-*`, `09-board-*`,
`12-event-closed-*`, `22-empty-club-*`, both themes).

**One thing the re-shoot found first, outside S2 (VIS-X-1, HIGH, S1's file):**
with S1's `6adce71` at HEAD, opening the club space gives `window.innerWidth`
409 and `document.scrollWidth` 409 at a 375 viewport in mobile Chromium
(`isMobile: true`), so EVERY fixed layer — the club space, the event chat, the
sheets — drew 409px wide: the header's link button, the Up next's second card,
the Board strip's chevron, the composer's send and the closed tile's right end
were off the phone in every space shot. The cause is the home's week bloom
(`home/YourWeek.tsx:93`, `left: bloomLeft` = 69 for the live card + 340 =
409) reaching past the `<section>`, which nothing clips; the mobile layout
viewport grows to the widest content. The harness copy clips that section
(`overflow: hidden`, an injected style, nothing in `src/`) so S2's screens
could be measured at 375 — with the clip `innerWidth` is 375 and every
element is inside. The fix is S1's: REQUEST R8 in `S2-notes.md` Part 4
(`overflowX: "clip"` on the week section keeps the halo's top and bottom;
`overflow: hidden` also works). Not counted below; the seven S2 findings follow.

## The table

| # | sev | verdict | where | what was done / why not |
|---|---|---|---|---|
| VIS-S2-1 | MEDIUM | **FIXED** | `club/UpNext.tsx` line 1 of a card, the card's padding | Confirmed in every space shot: `Tonight · 9:30 PM · ● M…`. Measured in the loaded DM Sans: the mockup's set-up (12px/600, 5px gaps, `7px 10px`) needs ≈160px for `Tonight · 9:30 PM · ● Maybe` in a 146px line (167.5 − 2 borders − 20). 1.2 pins line 1 as `eventTime` + ` · ` + the word and 11.3 the 2-column 50px card, so the strings and the card stay; the line is now 11.5px/600 at −0.15 tracking with 3px gaps and the card `7px 8px` (150 inside): `Tonight · 9:30 PM` 91.7 + 3 + `·` 2.6 + 3 + `● Maybe` 47.4 = 148.7 — whole, 1.3px spare (`Live now · ✓ Going` 102). And the review's (b): the separator, the mark and the word are `flexShrink: 0`, the time span `minWidth: 0` + ellipsis, so an overlong line (`Tomorrow · 7:30 PM` is 104.6 → 161.7) reads `Tomorrow · 7:30 P… · ● Maybe`, never a cut word; the `aria-label` carries the whole line either way. Re-shot 07 both themes: `Tonight · 9:30 PM · ● Maybe` whole next to `Live now · ✓ Going`; the `Soon` ring, the live chrome and the bloom unchanged. S2-notes STOPPED 10 is closed by this. The review's alternative (`Tonight 9:30 PM`, the mockup's own shape) would change a 1.2 string; not taken. |
| VIS-S2-2 | MEDIUM | **DEFERRED** | `club/BoardPost.tsx:198` ← `cards/CardBubble.tsx:213-247` (W2-S3) | Confirmed in 09 / 10: the Event post is `CardBubble`'s Lounge layout inside the `<article>` (a second 28px `PS` disc, the 292px card behind it with the left-tail radius, a 47px dead column). 11.4 pins "full width inside the post". The avatar column and the 292px width are `CardBubble`'s own (S3's file); from S2's side there is no clean way to drop them (a negative margin would push the disc over the article's border — the review's own "hack, prefer the prop"), and `layout="post"` cannot be passed before the prop exists (typecheck). Restated as REQUEST R7 in `S2-notes.md` Part 4 with the exact S3 change and the one-line S2 change that follows it; R5 of `S2-repair.md` stands. |
| VIS-S2-3 | MEDIUM | **FIXED** | `club/ClubEmpty.tsx` the section's padding | Confirmed in 22: the heading at 28px from the edge, the coral row 319px wide, 20px under the last row. `ClubEmpty` is `RoomThread`'s `emptyBlock` inside its list box (`padding: "8px 12px 8px"`, RoomThread.tsx:303) and added `16px 16px 12px` of its own. Now `16px 4px 4px`: 16px from each edge, 12px at the bottom — the mockup's `0 16px 12px` (`W0_EmptyClub:45`). Re-shot 22 both themes: the heading at 16px, the coral row 343px wide, the ringed rows' hairline running to 16px from the right edge; the doc comment says why the 4. |
| VIS-S2-4 | LOW | **FIXED** (cheap) | `club/RoomChips.tsx` the nav's gap, the pill's padding | Confirmed in 07 / 09 / 10 / 21: the fourth chip's right edge past the viewport. Neither 11.3 nor 1.2 pins the pill's sides or the gap (the 44px hit area and the 30px pill are pinned and kept), so `gap: 5` and 11px sides (`0 11px 0 9px` with an icon, `0 9px 0 11px` with the dot, `0 11px` plain) take one pixel off each of the mockup's; the four common chips now end ≈365 at 375 and a fifth still scrolls (`overflowX: "auto"` kept). Re-shot 07 / 09: `Fall Formal` whole with the fifth chip's edge at the viewport. |
| VIS-S2-5 | LOW | **FIXED** (cheap) | `club/EventAbout.tsx` the RSVP pill's `<button>` | Confirmed in 12: the `Going` pill tappable on a `closed` chat, opening a sheet that says `You'll appear in the event chat.`; the RSVP route does not refuse by date (`rsvpBlocked` checks campus only), so the sheet would have taken the change. 11.6 is silent; 11.8 hides a closed card's pills. Kept the pill (the status still reads) but `aria-disabled` with no `onClick` and `cursor: default` when `event.state === "closed"`; the 1.2 `aria-label` and the pill's look are unchanged. Re-shot 12 both themes: same picture, nothing opens. |
| VIS-S2-6 | LOW | **FIXED** (cheap) | `club/ClubSpace.tsx` `ClubBodySkeleton` | By reading (the club skeleton is not in the fixtures): three 36px pills in `5px 12px 4px`. Now three 30px pills of the measured chip widths (70 / 74 / 90 = Lounge / Board● / Officers) with `gap: 5` in `7px 12px 8px` — the same 45px row, no jump when the read answers. |
| VIS-S2-7 | LOW | **REJECTED** (kept as is) | `club/BoardPost.tsx:266` | The review's own reading: the mockup is a bare arrow (`W0_Board:91`), both states clear 4.5:1 (`#C8401E` 6.3:1, `#5A564F` 6.8:1 on cream), and the enabled arrow already changes colour; "polish only … or keep as is". An opacity on the empty state would only lower the muted arrow's contrast for no pinned reason. Left as built. |

Also closed while here: S2-notes STOPPED 10 (the Up next line) — resolved by VIS-S2-1.

## What the re-shot screens show (both themes, at a true 375 with the harness clip)

- 07 the Lounge: `Live now · ✓ Going` / `Fall Formal` and `Tonight · 9:30 PM · ● Maybe` / `Late Night …` + `Soon` in the two 50px cards, the bloom behind; chips `Lounge · Board● · 🔒Officers · 📅Fall Formal` whole with a fifth chip's edge at the right; the strip, the thread, the composer as before.
- 09 / 10 the Board: the same head; the posts as before (VIS-S2-2 still on screen, deferred).
- 12 the closed event chat: `Closed` pill, `Sep 19 · 7 PM`, the `Going` pill drawn and inert, `This chat is closed.`
- 22 the empty club: `It's just you so far.` at 16px from the edge, the three rows 343px wide, 12px under the last.
- Nothing white-flashes in Night; no new console line beyond the harness's two hydration lines; `unmocked.json` stays empty.

## Gates

`npm run typecheck` 0 (after removing a corrupt `.next/dev/types/routes.d.ts` that two
`next dev` servers had written at once at 11:15 — a generated file, regenerated by the next
`next dev` / the build; `.next/types/` from the last build holds the same globals),
`npm test` 1639/1639, `npx eslint` 0 on `club/*`, `use-room-poll.ts`, `page-merge.ts`,
`MessageBubble.tsx`, `ReactionPicker.tsx`. `npm run build` left to the orchestrator
(no server-only import touched).
