# W2-S2 review — lens "design"

Reviewed at `e8435f9` (the S2 commits `3bf4695` … `94bcb1d` are all on the branch; nothing of
S2's is uncommitted). Read-only on the tree except this file. Method: refute the batch against
the contract (11.0, 11.3–11.6, 11.9.3, 1.2, 1.4), the mockups (`W0_Club`, `W0_Club_Light`,
`W0_Board`, `W0_Room`, `W0_EmptyClub`, read at the cited lines; MK:0.1, 0.2, 4, 5, 6, 12) and the
code (`club/*.tsx`, `club/helpers.ts`, `v2-tokens.ts`, `theme.ts`, `use-hide-tabbar.ts`,
`sheet-styles.ts`, `LoadFailed.tsx`, `send-failure.ts`; `git diff a9355d1 HEAD -- MessageBubble.tsx
ReactionPicker.tsx`). Gates re-run here: `npx eslint src/components/mobile/messages/club/
src/lib/chat/use-room-poll.ts src/lib/chat/page-merge.ts` exit 0; `node --test club/helpers.test.ts`
7/7. Contrast computed with a WCAG script (table below).

## Verdict

**PASS with fixes.** No HIGH: no contract string, size, token or aria-label is changed, no hooks
rule is broken (every file's hooks precede its first return), no gate is red, the tab bar has one
owner (`useHideTabBar()` in `ClubSpace`, `EventChat`, `RsvpSheet`; `vibe-composer-open` /
`classList` appear nowhere in `club/`, `cards/`, `compose/`, `use-room-poll.ts`), nothing
white-flashes in Night (every layer's background is `t.page` / `t.surface`), no `className`, no
font literal, no Discord word. Three MEDIUM (a contract string that does not fit its 375px card,
a dialog without focus return, a sub-44px target) and six LOW.

## Contrast (text under 18px, both themes; the pairs the club screens add to S1-contrast.md)

| pair | where | Night | Light |
|---|---|---|---|
| muted on page | separators 11px, officer line 12px, hat line's count | `#9C958C` on `#0C0B0B` 6.64 | `#5A564F` on `#FAF7F2` 6.83 |
| muted on surface | Board byline role + time 12px, Plans labels 11.5px | `#9C958C` on `#161515` 6.15 | `#5A564F` on `#FFFFFF` 7.29 |
| coralMark on the live/soon card | `Going` / `Soon` 12px/700 | `#FF8A66` on `#381614` 7.02 | `#B5381A` on `#FFE9E0` 5.07 |
| coralMark on the quiet card | `Going` 12px/700 | `#FF8A66` on `#151414` 7.95 | `#B5381A` on `#FFFFFF` 5.92 |
| secondary on the live card | line 1 12px/600 | `#CFC8BE` on `#381614` 9.8 | `#5C5853` on `#FFE9E0` 6.04 |
| ink on the RSVP pill (going) | 13px/700 | `#F6F1EA` on `#331812` 14.6 | `#1C1C1E` on `#FBDED4` 13.4 |
| state pill on the hero (both themes, the hero is the same dark gradient) | 12.5px | `#F6F1EA` / `#FF8A66` / `#CFC8BE` / tail `#E4DDD3` on ≈`#150A0E`: 14+ / 8.4 / 11.7 / 14.4 | same |
| ClubEmpty row 1 disc | `1` 13px/800 | `#FF8A66` on `#140806` 8.51 | same |
| coral button ink | send arrow (icon) | `#140806` on `#FF5C35` 6.40 | same |

Every pair passes 4.5:1. The Light muted is `--ink-sub` everywhere (`palette(false).muted`); the
`--ink-muted` 3.5:1 grey is never used on these screens.

## Findings

### S2-DESIGN-1 — MEDIUM — `src/components/mobile/messages/club/UpNext.tsx:105-116`
**What.** 1.2 pins the Up next card's line 1 as `eventTime` (`Tonight · 7:30 PM`) + ` · ` + the
RSVP mark. In a 2-column grid at 375px a card is 167.5px wide, 147.5px inside its `7px 10px`
padding. `Tonight · 7:30 PM` at 12px/600 is ≈100px, the dot with its gaps ≈13px, the check +
`Going` ≈48px: ≈161px, so the code's `overflow: hidden; textOverflow: ellipsis` on the TIME span
(`:106`) clips it to `Tonight · 7:…` — on exactly the cards that matter (tonight / today /
tomorrow with an RSVP). The mockup fits because it writes `Tonight 7:30` (`W0_Club:39`, 12
characters); the contract's `eventTime` shape is the one that does not fit the contract's own
2-column card (11.3). The builder did not record this under STOPPED. (S1-DESIGN-5 is the same
tension on the week card; there the mark is what clips, here it is the time.)
**Fix.** Two lines now, one decision for the integration review. Now: swap what yields — the
time span `flexShrink: 0` (no ellipsis) and the RSVP group `minWidth: 0; overflow: hidden;
textOverflow: ellipsis` (the check disc `flexShrink: 0`), so `Tonight · 7:30 PM · ✓Go…` keeps the
time whole and the check still says Going by shape (the `aria-label` carries the word). Then
record under STOPPED: "1.2 Card line 1 (`eventTime`) does not fit the 11.3 2-column 50px card at
375px when the viewer RSVP'd; `eventTimeShort` (`7:30 PM`, `Tue 7 PM`) would" for Franky.

### S2-DESIGN-2 — MEDIUM — `src/components/mobile/messages/club/RoomThread.tsx:123-170` (`RemoveConfirm`)
**What.** The officer's confirm is a hand-rolled `role="alertdialog" aria-modal="true"` box: focus
moves to Cancel on open (`:126-128`, good), but nothing returns it on close (the picker that
opened it has unmounted, so focus falls to `<body>`), and Tab is not trapped (the two buttons
are the dialog's only tabbables; a third Tab leaves the fixed overlay for the thread under it).
11.0 Accessibility: "focus moves into a sheet on open and back … on close". `RsvpSheet` and the
S3 sheets get both from vaul; this dialog gets neither.
**Fix.** In `RemoveConfirm`: `const returnTo = useRef<HTMLElement | null>(null);` set in the mount
effect from `document.activeElement` BEFORE `cancelRef.current?.focus()`, and in its cleanup
`returnTo.current?.focus?.()`; in the box's `onKeyDown`, on `Tab` cycle between the two buttons
(`e.preventDefault()` + focus the other one). Six lines; no copy changes.

### S2-DESIGN-3 — MEDIUM — `src/components/mobile/messages/club/RoomComposer.tsx:275`
**What.** The reply pill's `Cancel reply` button is 36×36 (`{ ...circle, width: 36, height: 36 }`).
11.0 Layout: "touch targets ≥ 44px (pills of 30–36px inside a 44px wrapper)". Today's
`ConversationView.tsx:996` draws it 34px, but the new screens are held to the 44px rule; the pill
row is 12+… ≥ 48px tall, so 44 fits.
**Fix.** `{ ...circle, width: 44, height: 44, border: "none", background: "transparent", color:
t.muted }` and the row's padding `"2px 6px 2px 12px"` so the pill's height does not grow.

### S2-DESIGN-4 — LOW — `src/components/mobile/messages/club/RsvpSheet.tsx:72`
**What.** A visible `Your RSVP` title (22px Fraunces) on a sheet 1.2 describes as three rows and
one line; no mockup draws this sheet and section 1 is "the only words allowed". Same finding as
the contract review's S2-CONTRACT-2 (LOW there); filed here for the design lens so the fix is
counted once.
**Fix.** `style={visuallyHiddenStyle}` on the `Drawer.Title` (the dialog keeps its accessible
name; import from `../sheet-styles`), or record the title under STOPPED for Franky.

### S2-DESIGN-5 — LOW — `src/components/mobile/messages/club/ClubSpace.tsx:399`
**What.** The hat line is one `t.secondary` string (`hatLine()`); the mockup draws `Your hat:
Officer` in `#CFC8BE` and ` · 48 members` in `#9C958C` (`W0_Club:20-23`; Light `#4A4541` /
`#6B645C`, MK:0.2). The words are 1.2's; only the second half's colour is off.
**Fix.** Two spans: `<span>{`Your hat: ${roleWord(role)}`}</span><span aria-hidden style={{ color:
t.muted }}> · </span><span style={{ color: t.muted }}>{countWord(n, "member")}</span>` (both
`countWord` and `roleWord` are exported; `hatLine` stays for its test).

### S2-DESIGN-6 — LOW — border and surface literals beside the palette (six files)
**What.** 11.0 has one hairline token (`var(--hairline)`) and one surface (`var(--paper)`); the
code draws mockup literals next to them: `rgba(255,255,255,0.10)` on the header circles
(`ClubSpace.tsx:371`, `EventChat.tsx:124`), the "+" and the input pill (`RoomComposer.tsx:293,297`),
the reply field (`BoardPost.tsx:244`); `rgba(255,255,255,0.12)` / `rgba(20,20,22,0.12)` on the
inactive chip (`RoomChips.tsx:50`); `rgba(255,255,255,0.22)` / `rgba(20,20,22,0.22)` on the dashed
button (`UpNext.tsx:65`); `rgba(22,21,21,0.86)` on the header circles and the Plans tiles
(`ClubSpace.tsx:372`, `EventChat.tsx:124`, `EventAbout.tsx:99`). The Night ones are MK:0.2's own
numbers (0.01–0.03 alpha from the token: invisible), the Light `rgba(20,20,22,…)` ones come from
the Light mockup whose ink literals 11.0 does not adopt (borders are not pinned either way). Not
a wrong token, a token missing.
**Fix.** Either `t.hairline` / `t.surface` in the six places (one alpha step; nobody will see it)
or, cleaner, a request to W2-S1: `fieldBorder`, `chipBorder`, `dashedBorder`, `raisedSurface`
on `Palette` in `v2-tokens.ts` with the two columns, and the six places read them.

### S2-DESIGN-7 — LOW — `src/components/mobile/messages/club/BoardPost.tsx:176`
**What.** `padding: "10px 12px 10px"` always; the mockup folds a post to `10px 12px 0` so the 44px
toggle sits flush at the card's bottom edge (`W0_Board:95,114`; MK:5 "`10px 12px 10px` (open) or
`10px 12px 0` (folded)"). Every folded post is 10px taller than drawn.
**Fix.** `padding: open ? "10px 12px 10px" : "10px 12px 0"`.

### S2-DESIGN-8 — LOW — `src/components/mobile/messages/club/RoomComposer.tsx:94-98` (`ClosedTile`)
**What.** One footer for two tiles: `padding: 10px 12px calc(safe + 14px)` and `minHeight: 44` with
`padding: 10px 14px`. Right for the Board's member tile (`W0_Board:148-149`); the closed event
chat's footer is `8px 12px 12px` with a fixed `height: 44px; padding: 0 14px` tile (`W0_Room:168`,
MK:6), so the closed layer's footer is 4px taller than drawn and its tile can grow.
**Fix.** `padding: board ? "10px 12px calc(env(safe-area-inset-bottom, 0px) + 14px)" : "8px 12px
calc(env(safe-area-inset-bottom, 0px) + 12px)"` and, off the Board, `height: 44, padding: "0 14px"`.

### S2-DESIGN-9 — LOW — `handoffs/chat-redesign/wave-2-build/S2-notes.md` (STOPPED 8; a missing STOPPED)
**What.** STOPPED 8 ("the composer's font size: 11.0 says 16px, MK:0.2 says 15px") is not a stop:
11.0 says in so many words "inputs are 16px …, not the mockups' 15px" — the contract already
resolved it, so it is a reading. The one real contract-vs-layout conflict the batch hit
(S2-DESIGN-1) is not recorded.
**Fix.** Move STOPPED 8 to a "Readings" line; add S2-DESIGN-1's line under STOPPED.

## STOPPED / SIBLING judged

- STOPPED 1 (`line?` on the hook: 11.5's `Couldn't load this chat.` vs 11.4's `Couldn't load the
  Board.` through one hook): right, additive, the contract names two lines for one read.
- STOPPED 2 (`hasEarlier`), 3 (`replace` / `remove`): right; 11.5's return shape cannot drive
  11.4/11.5's own flows without them; nothing named was changed.
- STOPPED 6 (`initialPage` cannot reach the hook through the pinned props): right not to improvise;
  the cost is one extra thread GET on a deep link. S1 asks for the same prop (R4).
- STOPPED 7 (`lostAccess`): right; 11.6's "the next read answers 403 → the layer closes" needs a
  signal 11.5's silent ticks do not give.
- STOPPED 8: not a stop (S2-DESIGN-9).
- STOPPED 9 (`CardBubble` takes `onRemove` / `onReport` only): right; S3's file.
- No SIBLING entries; none were needed (the gate record shows one `.next` collision, handled by
  13.3's wait-and-retry).
- Missing: the Up next line-1 overflow (S2-DESIGN-1) and the `Your RSVP` title (S2-DESIGN-4) are
  both departures from a pinned string / the pinned word list that should have been written down.

## Holds (checked against the mockup line and the code line)

- **Header** (`ClubSpace.tsx:384-415` vs `W0_Club:15-27`): `calc(52px + env(safe-area-inset-top))`,
  padding `4px 10px 0` under the inset, gap 8; Back a 44px circle with the 18px/2.4 chevron and
  `aria-label="Back to Messages"`; the 40px avatar (`logo_url` or `initialsOf` on `clubGradient`,
  15.5px/800 Fraunces `#FAF7F2`, the inset ring, `aria-hidden`); `<h1>` 20px/800 `SERIF`,
  line-height 1.1, −0.4px, one line ellipsis; the 12px/600 15px line; the right 44px circle is the
  club-page link with `aria-label="Open <club>'s page"` → `/orgs/<handle>` (14.15). Skeleton bars
  and discs in `rgba(var(--scrim-rgb),0.06/0.08/0.05)` while the read is out.
- **Up next** (`UpNext.tsx:86-158` vs `W0_Club:29-50`): `slice(0, 2)` in `repeat(2, minmax(0,1fr))`
  gap 8, padding `8px 16px 10px`, heading 16px/700 `SERIF` in an 18px row, no right text (MK:16.6);
  cards 50px, `7px 10px`, radius 18, `t.liveCard` only when `isHot` (live or `isSoon`), else
  `t.quietCard`; the 8px 2px ring + `Soon` 12px/700 `coralMark` only when `isSoon`; the check
  11px/3 + `Going` in `coralMark`, the 6px muted dot + `Maybe` in secondary; the title 15.5px/700
  `SERIF` 17px; the bloom `left -66, top -2, 340×118, zIndex -1` under `isolation: isolate` only
  when a DRAWN card is hot (SCREENS-M2); `role="group" aria-label="<club> events"`; a `<button>`
  only when `room_id !== null` (else a labelled group). The officer's dashed 56px button and its
  line (`W0_EmptyClub:30-37`), the line in `--ink-2` as 11.0's sentence rule says.
- **Chips** (`RoomChips.tsx` vs `W0_Club:52-57`): 45px `<nav aria-label="Rooms in <club>">`,
  `0 12px`, gap 6, `overflow-x: auto`, no scrollbar; 44px hits around 30px pills 13px/700, active
  `t.activeChip` + `aria-current="page"`, the 7px coral dot with `0 10px 0 12px`, the 12px lock and
  calendar icons with `0 12px 0 10px` gap 5; an event chip never becomes active (`:70`);
  `chipAriaLabel` gives 1.2's four labels.
- **Board strip** (`BoardStrip.tsx` vs `W0_Club:59-64`, `W0_Room:72-77`): 44px, `6px 12px 0` /
  `4px 12px 0`, `0 10px 0 12px`, radius 16, surface + hairline + the inset highlight, the 14px
  megaphone in `coralText`, `Board` 800 ink · author · text ink at 12.5px/600 16px, dot, 13px muted
  chevron; `Latest from the Board…` label; shown on every room but the Board when `board_latest`.
- **Composer** (`RoomComposer.tsx:248-319` vs `W0_Club:153-159`, `W0_Board:136-145`,
  `W0_EmptyClub:77-83`): `8px 12px 12px` + the bottom inset, `t.page`, hairline top, gap 8 = 64px;
  the "+" 44px circle (20px/2.4 plus, `aria-label` toggling `Add a poll, sign-up or event` /
  `Close the tray`, `aria-expanded`); the 44px pill `<label>` with `0 16px`, the 40px 16px input
  (`aria-label` = placeholder, `enterKeyHint`); the 44px gradient send with `#140806` ink and the
  18px/2.6 arrow, `aria-disabled` + `rgba(var(--scrim-rgb),0.07)` / muted while empty
  (`W0_EmptyClub:82`); nothing while `viewer` is null; the officer line 12px/600 muted with the
  13px megaphone `0 4px` gap 6; the member tile `Only officers post on the Board. You can reply to
  any post.` 13px/500 secondary with the 15px muted megaphone; `This chat is closed.` with the lock.
- **Thread** (`RoomThread.tsx`): oldest first, `justify-content: flex-end` (bottom) / `flex-start`
  (the event layer), `8px 12px 8px`, the 14px sticky top fade from `t.page`, separators 11px/600
  muted over non-stub rows (`separatorIds`), `MessageBubble` unchanged but for the `onRemove`
  pass-through (the diff is 3 hunks in `MessageBubble.tsx`, 4 in `ReactionPicker.tsx`, all
  `onRemove`), `darkMode={night}`, `groupMode`, `showSender` on a run's first row; `Earlier
  messages` 44px `--ink-2` above the first row; three-bubble skeleton; `LoadFailed tone=`; the
  empty line 13.5px secondary or the officer's block.
- **Board** (`BoardView.tsx`, `BoardPost.tsx` vs `W0_Board:59-92`): newest first, top-anchored,
  `<article aria-label="Board post from …">`, radius 16 surface hairline inset; 28px avatar 10px
  initials on `personColor`, name 13.5px/700 18px, role 12px/600 muted, time `rowTime` at the
  right; body 15px/500 1.35 `text-wrap: pretty` margin-top 6 (a card post renders `CardBubble`);
  the 44px `<button aria-expanded>` toggle with the hairline top, `N replies` / `1 reply` / `Reply`
  12.5px/700, the 13px chevron, `Replies stay quiet` 12px/600 muted with the bell-off; the replies
  group `paddingLeft 10` gap 6, 22px avatars 8.5px, `<b>Name</b> text` 13px/18px secondary/ink;
  the reply field `8px 0 0 10px`, 44px, `padding-left 14`, `rgba(var(--scrim-rgb),0.04)`, 16px
  input with `Reply quietly` and `Reply quietly to <Name>'s post`, the 44px `Send reply`;
  `LoadFailed compact` under the toggle; the two-row replies skeleton; three post-shaped blocks;
  `Nothing on the Board yet.`; `Earlier messages` under the last post; an all-stub fold shows the
  field only.
- **Event layer** (`EventChat.tsx`, `EventAbout.tsx` vs `W0_Room:15-77,155-170`): its own
  `Drawer.Root direction="right"` at 1101/1102, `useHideTabBar()`; header 52px + inset, Back
  `Back to <club>`, no avatar, title column `padding-left 4`, `<h1>` 20px/800, the 14px club dot +
  `<club> · event chat` 12px/600 muted, no right button; the skeleton = the 96px block + two 50px
  tiles + three bars; the hero 96px, padding 10, radius 18, hairline, the four-layer gradient
  verbatim; the bloom `left -66, top 34, 340×132` only when live; the pill `role="status"` 30px,
  `rgba(12,11,11,0.62)`, 12.5px/700: the 9px `#F6F1EA` ring + `Soon` + `· starts 7:30 PM` 500
  `#E4DDD3`; the glowing 7px dot + `Live now` in `#FF8A66` with the coral border and the 18px glow;
  the 14px check-circle + `Ended · chat open N more days`; the 13px lock + `Closed` in `#CFC8BE`
  (the pill sits on the same dark hero in Light, so its Night literals are right in both themes);
  Plans `role="group" aria-label="Plans"`, 2 columns gap 8, 50px tiles `0 12px` radius 16, labels
  11.5px/600 muted with the 13px pin / clock, values 14px/700 ellipsis, `No place yet`; Who's going
  `role="group" aria-label="Who's going: N going, M maybe"`, `4px 16px 0` gap 10, five 30px stacked
  avatars (`-8px`, a 2px `t.page` border, `aria-hidden`), `N going` 14px/700 + `· M maybe` 13px/600
  muted, the 44px RSVP hit around the 34px pill (`0 12px 0 8px`, coral .50 border, coral .16 tint,
  the 18px coral disc with the `#140806` check / the 8px muted dot / no mark) with 1.2's three
  labels; the strip `4px 12px 0`; the thread top-anchored; `Message the event chat`; the closed tile.
- **RSVP sheet** (`RsvpSheet.tsx`): a `Drawer.NestedRoot` (dialog, `aria-modal`, named by its
  title; focus into the sheet and back by vaul), `useHideTabBar()`, `t.scrim` overlay, `t.surface`
  content, rows `Going` / `Maybe` / `Not going` ≥ 52px with `You'll appear in the event chat.`
  12px/500 secondary under the first two, `aria-pressed` on the current one; PUT / DELETE → `reload()`.
- **Empty club** (`ClubEmpty.tsx` vs `W0_EmptyClub:45-75`): `<section aria-labelledby=
  "lounge-start-heading">`, bottom-anchored inside the thread; `It's just you so far.` 22px/700
  `SERIF` 1.15 −0.4; the 14px/500 secondary line; the `<ol>` of 52px rows: 1 the coral gradient
  `#140806` row with the 28px `#140806` disc / `#FF8A66` `1` 13px/800, 15px/800, 16px chevron (a
  button → the Board chip + the composer focus); 2 and 3 the quiet rows with the 28px `ringGrey`
  ring, 15px/600, the hairline under row 2, muted chevrons, `/campus?tab=events` and
  `/orgs/<handle>`. The header stays the common one (MK:16.10); the send is `aria-disabled` while empty.
- **Shared**: `"use client"` on every `.tsx`; inline styles only; `SERIF` / `FONT` from
  `v2-tokens.ts`; `useNightTheme()` in the two layers, `night` passed down; `palette(night)` in every
  file; `LoadFailed` with `tone={night ? "dark" : "light"}` in the five places, `compact` on the
  replies; every refusal toast through `toastSendFailure`; no horizontal overflow at 375px (the
  blooms end at 274/286px, the nav scrolls, every line ellipsises, `minWidth: 0` on the grids); the
  composer above `env(safe-area-inset-bottom)`; the 60-s `now` clock.
