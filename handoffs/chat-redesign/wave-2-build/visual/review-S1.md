# Design review W2-S1 — the Messages home as the real app draws it (visual pass, 2026-09-30)

Scope: batch W2-S1 — the Messages home on All / Chats / Clubs / Requests, "Your week"
(with cards; empty), the club and person rows, the no-clubs block, the skeleton and
the `LoadFailed` state. Judged from the app shots in this folder (375×812 @2x, Light
and Night, HEAD `b81aa29`, the frozen clock of `README.md`) against the mockups
`mockup-W0_Home.png`, `mockup-W0_EmptyWeek.png`, `mockup-W0_EmptyClubs.png` (390
wide), the contract `wave-2-contracts.md` 11.0 / 11.1 / 11.2 / 11.9 / 11.10 and
1.2, and `wave-2-asis/mockups-map.md` (MK) 1–3 and 0.1; then the code:
`src/components/mobile/messages/home/*`, `messages/v2-tokens.ts`, `messages/avatar.ts`,
`src/lib/chat/week.ts`, `use-chat-v2.ts`, `use-hide-tabbar.ts`, and the flag fork of
`src/components/mobile/MessagesMobile.tsx`.

One thing was measured rather than eyeballed: the week card's first line, rendered
in Chromium with the production DM Sans (the harness's `tools/fonts/`) at the
built sizes and at three alternatives (scratchpad script, not committed). The
numbers are in VIS-S1-1.

**Verdict: fix before the Mac gate — 1 HIGH, 2 MEDIUM, 4 LOW.** The screens are the
mockups' screens: the header, the week block (150 / 126px), the strip, the filter
row, both row kinds, the no-clubs block and the failure box all land within a few
pixels of the design once the 375-vs-390 difference is allowed for, the tokens are
the contract's in both themes, nothing flashes or reads wrong in Night, and every
visible string is 1.2's. The HIGH is one pinned string the pinned card cannot hold.

## Per state

| # | shot | verdict | deviations |
|---|---|---|---|
| 01 | `01-home-all-light` | fix | Week card 2 reads `Live n… · ✓ Going` (VIS-S1-1). The bloom sits behind card 1 (`Ended`, Open Practice), not the live card (VIS-S1-2; faint in Light). Chess Club's `3 new` alone on a third line (VIS-S1-4). Else matches W0_Home: header 52px, `Messages` 30/800 Fraunces, one 44px pencil (no search, per 1.2); strip 44px buttons, today inverted `#141416` with the shadow, coral dots Tue/Thu; cards 142×64 radius 18, live chrome `#FFE9E0→#FFF` + coral .55 border, quiet white; filter pills 30px in 44px, `All 3` coral badge with `#140806` ink, `Requests 1` tinted; rows: pin icon, `Yesterday`, `6:07 PM`, `Board:` bold with the 8px coral dot, live chip `Live now · Fall Formal` in `#B5381A` on the coral tint, `✓ Going` `#C8401E`, `12 new` pill; group double avatar; unread pill. |
| 01 | `01-home-all-night` | fix | Same three (the bloom's misplacement is plain here: the halo is around `Ended · Going`). Night tokens right: page `#0C0B0B`, ink `#F6F1EA`, `--ink-2` secondary, `#9C958C` muted, today chip `#F6F1EA`/`#0C0B0B`, live card `rgba(58,22,20)→rgba(30,20,19)` with coral .45 border, quiet `rgba(22,21,21,.92)`, `#FF8A66` marks. No white flash, no Light leak. |
| 02 | `02-home-chats-light` | fix (inherits 1, 2) | Chats = dm/group only, `PersonRow`: 44px avatars, name 15/700 DM Sans, `You:` plain, `Maya Reyes:` bold in the group, 66px rows, hairline under the text column only (avatar gutter clear, as the mockup). The unread pill is an empty 20×20 coral disc — the threads read sends `unread: boolean`, no count (S1-notes STOPPED); accepted, noted in the table only. |
| 02 | `02-home-chats-night` | fix (inherits 1, 2) | As Light, Night tokens. |
| 03 | `03-home-clubs-light` | fix (inherits 1, 2, 4) | Clubs only; `ClubRow` 48px avatar with 18/800 Fraunces initials on the club gradient + inset ring, name 16.5/800 Fraunces, chip line 22px. Chess Club (no `next_event`, 3 new) shows the pill alone on line 3 (VIS-S1-4). |
| 03 | `03-home-clubs-night` | fix (inherits 1, 2, 4) | As Light. |
| 04 | `04-home-requests-light` | ok by contract (VIS-S1-5 LOW) | Requests uses today's `ThreadRow` as 11.1 says: 50px `#FFD3C2` avatar with the white ring, Fraunces 16px name, coral `1h` (`relativeTime`, not the home's one clock), an 8px dot — a visible style break against the four other rows of the same list. `Requests 1` count on the active pill reads (tinted `.12` disc). Empty Requests not shot (fixture has one request). |
| 04 | `04-home-requests-night` | ok by contract (VIS-S1-5 LOW) | As Light. |
| 05 | `05-home-no-clubs-light` | ok (inherits 1, 2) | W0_EmptyClubs: `Your clubs will live here.` 24/700 Fraunces, the sentence 14.5/500 `--ink-2` wrapped inside 306px, `Find clubs on campus` 48px gradient pill with `#140806` ink, `Start a club` 44px underlined at `.45`; block centred in the list area above the tab bar as the mockup's `flex-grow:1`. `All 2` (threads only) — right, clubs are gone. Week keeps its cards (the fixture's; the mockup pairs this state with an empty week, a fixture choice, not a defect). |
| 05 | `05-home-no-clubs-night` | ok (inherits 1, 2) | As Light; `Start a club` underline `rgba(207,200,190,.45)` as `W0_EmptyClubs:54`. |
| 06 | `06-home-empty-week-light` | ok | W0_EmptyWeek: no bloom, every dot transparent, the 44px line `Nothing on your week yet.` 13.5/500 `--ink-2` + `Find events ›` 13.5/700 coral text (`#C8401E`; the contract picks W0_EmptyWeek's coral over W0_EmptyClubs's white, MK:16.12). Block 126px: the filter row's top border lands at y=178 = 52 + 126. Today chip keeps its raised chrome. |
| 06 | `06-home-empty-week-night` | ok | `Find events` `#FF8A66` = `W0_EmptyWeek:39`. |
| 23 | `23-load-failed-light` | ok (VIS-S1-3 MEDIUM on the shared pill) | `/api/me/inbox` 500 alone: the `LoadFailed` box in the club position (`padding 12px 16px 4px`), `Couldn't load your clubs. Try again.` — the ` Try again.` is `asLoadFailure`'s own 5xx rule, 1.2 pins the line through `asLoadFailure`, so it is right; threads still list under it; `All 2` counts threads only. The Retry pill is `#FAF7F2` on `#FF5C35` = 2.9:1 at 13px (VIS-S1-3). |
| 23 | `23-load-failed-night` | ok (VIS-S1-3) | `tone="dark"`: dashed `rgba(255,255,255,.14)`, text `.7`. Right. |
| 24 | `24-skeleton-light` | ok (VIS-S1-6 LOW) | Threads and calendar answered, inbox pending: the week's cards draw, the filter row draws (`All` with no badge yet — right, the badge needs both reads), the list is `ListSkeleton` (five 50px discs + 55%/85% bars in scrim `.06/.08/.05`), the contract's shape. Rows are 74px against the 66–72px rows that replace them (VIS-S1-6). |
| 24 | `24-skeleton-night` | ok (VIS-S1-6) | Skeleton tints read on `#0C0B0B` (`--scrim-rgb` 255,255,255). |

Not shot in this pass (not judged): Chats empty (`EmptyState tab="all"`), Requests
empty, the week's own skeleton (three 142×64 tiles) and `Couldn't load your week.`,
both reads failing (one box), the flag-pending header, a muted club, a club with
`logo_url`, a week card with `org: null` / `room_id: null`.

## Copy checked against 1.2 (every visible string on the eight states)

`Messages` · `Your week` · `Oct 5 – 11 · your RSVPs` (en dash, spaces) · `Mon … Sun` + day
numbers · `Ended` / `Live now` / `9:30 PM` + ` · ` + `Going` (check) / `Maybe` (dot) ·
`Salsa Club` on the club line · `All` `Chats` `Clubs` `Requests` with counts · `Board:`
prefix + text with the coral dot · `Priya Shah:` prefix · `Live now · Fall Formal` ·
`12 new` / `3 new` · `You: …` / `Maya Reyes: …` · `Yesterday` / `6:07 PM` / `5:47 PM` ·
`Nothing on your week yet.` `Find events` · `Your clubs will live here.` · `Join a club to
get its Board, its Lounge and a chat for every event you're going to.` · `Find clubs on
campus` · `Start a club` · `Couldn't load your clubs.` (+ ` Try again.` by rule) ·
`Retry`. All exact. The Requests row's `1h` is today's `ThreadRow` (by 11.1).

## Findings

### VIS-S1-1 — HIGH — the week card truncates the pinned `Live now` (`Live n… · ✓ Going`)
- **Where**: `src/components/mobile/messages/home/YourWeek.tsx:207-223` (the card `style`, `width: 142` at `:208`), `:248` (the title span), `:250` (the club line). Rules: `home-rules.ts:292-296` (`weekCardLine`).
- **What**: every shot with the fixture week (01–05, 23, 24, both themes) shows the live card's first line as `Live n… · ✓ Going`. Measured with the production DM Sans: at the built 12px/700 the line `● Live now · ✓ Going` needs ~134px and the card gives 142 − 20 = 120px (122 at 9px padding); it still does not fit at 11.5px (129) or 11px (127), so shrinking type is not a fix. Worse strings are ordinary in a week: `Wed 11:30 PM · ● Maybe` needs ~159px (`eventTimeShort` within 6 days is `<Wkd> <h:mm PM>`). The mockup's 142 was drawn for `Fri 7 PM · Going` (119px) and `Live · 18 going`; the contract replaced the latter with `Live now` + the RSVP mark (1.2, N5) without widening the card. A pinned string cut on the default state is a wrong string.
- **Fix** (measured: `Live now · ✓ Going` → a 146px card, `Wed 11:30 PM · ● Maybe` → 161px, a 40-character title stays 142 and ellipsizes): let line 1 alone size the card between 142 and 184.
  - `:208` `width: 142` → `width: "max-content", minWidth: 142, maxWidth: 184`;
  - `:248` add `contain: "inline-size"` to the title span (its `whiteSpace: nowrap` otherwise drives the width; with `contain` it contributes 0 and keeps its ellipsis);
  - `:250` add `contain: "inline-size"` to the club-line span for the same reason;
  - keep line 1's `overflow: hidden` + the text span's ellipsis as the guard past 184 (no same-week string reaches it).
  - `scrollToDay` (`:53-59`) reads `offsetLeft`, so uneven widths cost nothing there. If a fixed width is preferred instead, the smallest that holds every same-week string at 12px is 180 — a bigger departure from the mockup than cards of 142–161.

### VIS-S1-2 — MEDIUM — the bloom is fixed at the mockup's spot, not behind the live card
- **Where**: `YourWeek.tsx:66-68` (the bloom `div`: `left: -92, top: 54, width: 340, height: 118`), `:154-175` (the scrolling row).
- **What**: `W0_Home:22` puts the bloom at `left:-92px` because in the mockup the live card is the FIRST card. The app sorts cards by `starts_at` (11.2), so with an ended morning event the live card is second: in `01-home-all-night` the halo sits around `Ended · ✓ Going` / Open Practice and the live Fall Formal card is outside it; in Light the same, fainter. 11.2: "the live one … gets the live chrome and the bloom". A tap on a strip day also scrolls the row (`scrollToDay`) and the bloom stays put.
- **Fix**: anchor it to the live card and follow the row's scroll. In `YourWeek`:
  - `const liveIndex = sorted?.findIndex((e) => e.room_state === "live") ?? -1;` and `const [scrollLeft, setScrollLeft] = useState(0);`
  - the row `div` gets `onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}`;
  - the bloom's `left` becomes `16 + liveIndex * 150 + 71 - 170 - scrollLeft` (card pitch 142 + 8; the bloom's 340 centred on the card's 142 → `-99` for index 0, which is the mockup's `-92` within a hair) — with VIS-S1-1's uneven widths, read the live card's `offsetLeft` from `cardRefs` instead of `liveIndex * 150` and centre on its `offsetWidth`;
  - keep `top: 54`, `width: 340`, `height: 118`, `zIndex: -1`, and draw it only when `liveIndex >= 0` (as now).

### VIS-S1-3 — MEDIUM — the `Retry` pill fails the contract's 4.5:1 on the new screens (shared component)
- **Where**: `src/components/feedback/LoadFailed.tsx:125-126` (`background: "#FF5C35", color: "#FAF7F2"`, 13px/700 — 12px/700 compact).
- **What**: `#FAF7F2` on `#FF5C35` is 2.9:1. 11.0 asks ≥ 4.5:1 for every text under 18px on the new screens, in both themes; `S1-contrast.md` lists no `Retry` pair. It shows in `23-load-failed-*` and in every other `LoadFailed` the new screens mount (`Couldn't load your week.`, `… this club.`, `… the Board.`, `… replies.`, `… your events.`). The file is shared (not S1's to own by 13.2), so this is either a one-line change there or an accepted inheritance — the review flags it, Franky decides.
- **Fix**: `LoadFailed.tsx:126` `color: "#FAF7F2"` → `color: "#140806"` (the coral button ink the mockups and `v2-tokens.ts` already use on the same coral; ≈ 9.6:1). Every `LoadFailed` in the app gains the same pill the no-clubs CTA has.

### VIS-S1-4 — LOW — `N new` with no event chip sits alone on a third line
- **Where**: `src/components/mobile/messages/home/ClubRow.tsx:155-219` (the chip line renders when `chip || newText`), `:198-217` (the pill at `marginLeft: "auto"`).
- **What**: Chess Club (`next_event: null`, `lounge.unread_count: 3`) in `01-*` and `03-*`: the row grows to three lines for a lone right-aligned `3 new` pill under the preview, the left of the line empty. No mockup draws this case (a club with no event has two lines, `W0_Home:163-172`; `N new` is only ever drawn beside a chip, `:147`).
- **Fix**: when `!chip && newText`, drop the chip line and put the pill at the right of the preview line: wrap the preview span in `display: "flex", alignItems: "center", gap: 10` (as `PersonRow.tsx:346`), the preview `flexGrow: 1, minWidth: 0`, the same 20px pill after it with `flexShrink: 0`. The row stays 66px like its neighbours; the chip line keeps the pill when a chip exists.

### VIS-S1-5 — LOW — the Requests filter draws today's `ThreadRow` beside the new rows (by contract)
- **Where**: `src/components/mobile/messages/home/MessagesHome.tsx:252-256` (`<ThreadRow …>` for `requests`).
- **What**: 11.1 pins `Requests = requests (today's rows)`, so this is conformant; visually (`04-*`) it is the one filter whose rows have a 50px `#FFD3C2` avatar with a white ring, a Fraunces name, an 8px dot instead of the pill and a coral `1h` from `relativeTime` rather than the list's one clock (`rowTime`; 1.2 "one clock for the whole list"). Recorded for the follow-up, not a defect against the contract.
- **Fix** (if wanted): `:254` `<ThreadRow key={r.id} thread={r} onTap={…} />` → `<PersonRow key={r.id} thread={r} now={d.now} onTap={…} />` (a request is a `ThreadEntry`; the row's label then says `unread` instead of a count, as on Chats).

### VIS-S1-6 — LOW — the list skeleton is 8px taller per row than the rows it stands in for
- **Where**: `MessagesHome.tsx:242` (`<ListSkeleton />`), `src/components/mobile/messages/ThreadList.tsx:208-253`.
- **What**: `24-*`: five rows of `padding 12px 16px` + a 50px disc = 74px, resolving into 66px person rows / 72px club rows with 44/48px avatars — a visible jump on resolve. 11.0 asks for "the `ListSkeleton` shape", which this is; polish only.
- **Fix**: a home-local skeleton (or props on `ListSkeleton`): disc 44px, `padding: "11px 16px"`, bars `55%×14` and `85%×11`, the same tints — 66px rows.

### VIS-S1-7 — LOW — the Home's bloom is the club's strength, not `W0_Home`'s (by contract)
- **Where**: `src/components/mobile/messages/v2-tokens.ts:84` (Night bloom `.36 → .13 → 0`), `:110` (Light `.22 → .08 → 0`).
- **What**: `W0_Home:22` draws the Home's bloom at `.56 → .20 → 0` ("stronger than the club's .36 because the live event is here", MK:1.2); 11.0 pins "bloom: the two columns of MK:0.1", i.e. the club's `.36`. In `01-home-all-night` the halo is a soft tint rather than the mockup's glow. Conformant; noted so the Mac review does not read the softer halo as a rendering fault.
- **Fix** (only if Franky wants the mockup's glow on the Home): a second token `bloomHome` — Night `radial-gradient(closest-side, rgba(255,92,53,0.56) 0%, rgba(255,92,53,0.20) 52%, rgba(255,92,53,0) 100%)`, Light `… 0.34 … 0.12 …` (the same 1.55× step the Light column applies to the club's) — used by `YourWeek.tsx:67` only.

## Checked and fine (so nobody re-checks)

- Header: 52px + safe-area, `padding 4px 10px 0 16px`, `Messages` 30/800 Fraunces −0.8px, the 44px pencil (`aria-label="New message"`), no search (1.2). Not sticky (11.1).
- Week block: 6+18+2+44+72+8 = 150 with cards, 126 empty; heading 16/700 Fraunces, right text 12/600 muted; strip 44×44 radius 14, weekday 10.5/600, number 15/700 (800 today), 5px dots coral/grey/none, past days muted (`--ink-sub` in Light, 6.8:1), today `aria-current="date"`; the row's right-edge mask; cards radius 18, `7px 10px`, three lines 12/15.5 Fraunces/12, the 14px club dot from `clubGradient`, the glowing 7px dot on live, the check + `Going` in `coralMark` on the tinted live card and `coralText` on the quiet one (both ≥ 4.5:1 per S1-contrast), `Maybe` with the 6px muted dot.
- Filter row: 45px, top hairline, 44px tabs wrapping 30px pills, 13/700, `All` min-width 46, active chip inverted per theme, count pills 18px 11.5/800, `aria-label="Requests, 1 waiting"`.
- Rows: person 44px avatar / group double 30px discs with the page-colour ring; club 48px with 18/800 initials and the inset ring; name 15/700 DM Sans vs 16.5/800 Fraunces; hairline under the text column; times 12/600 (`--ink-2` when unread, muted otherwise); previews 13.5 / 1.35 ellipsized; pin 12px muted; live chip coral-tinted with `coralMark`, next-event chip scrim-tinted with the 12px calendar; `N new` pill 20px scrim `.08`.
- No-clubs block, empty-week line, `LoadFailed` in place with the rest of the screen kept, the 36px bottom fade to `--cream-92`, the fixed tab bar. Touch targets: every tappable thing ≥ 44px in one dimension. No horizontal page scroll at 375 (the week row scrolls inside its mask). Nothing white in Night; `main` paints `t.page`.
- Code: `SERIF`/`FONT` constants only (no literals in `home/*`); `palette(night)` read once per component; `useNightTheme()` on every screen; `useHideTabBar` untouched by the home (right — the home shows the bar); `HomeFilter` is its own type; `weekRange` Monday–Sunday in the device zone with the en-dash label; `clubGradient`/`personColor` by FNV-1a of the id (the week card uses `org_id ?? org.handle` — the fixture carries `org_id`, so the dot matches the row's avatar; a calendar entry without `org_id` would draw a different gradient than the club's row — worth a fixture on the Mac, not a visual fault here).
