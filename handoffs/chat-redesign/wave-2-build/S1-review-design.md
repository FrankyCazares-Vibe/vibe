# W2-S1 review — lens "design" (fidelity to W0_Home, W0_EmptyWeek, W0_EmptyClubs at 375px, Light and Night)

Reviewed on branch `claude/relaxed-davinci-9d11h3` at `e8435f9` (S1's commits
`7678656`, `22d920e`, `92a0810`, `005020d`, `048cb1f`, `b47a72b`, `866ab0a`).
Read: the contract (1.2, 1.4, 2, 11.0, 11.1, 11.2, 11.9, 11.10, 13.2, 13.3),
MK 0.1, 0.2, 1, 2, 3, 13, 14, 16, the three mockup sources line by line
(`W0_Home.dc.html`, `W0_EmptyWeek.dc.html`, `W0_EmptyClubs.dc.html`), every
S1 file (`v2-tokens.ts`, `avatar.ts`, `week.ts`, `use-hide-tabbar.ts`,
`use-chat-v2.ts`, `home/*`, the `MessagesMobile.tsx` and `CampusMobile.tsx`
diffs against `a9355d1`, `layout.tsx:96`), `globals.css` for every token the
palette resolves to, `S1-notes.md`, `S1-gate.md`, `S1-contrast.md`. Nothing
rendered (no browser here): every size, token and label below is reasoned
from the code against the mockup's CSS.

Run here (read-only on the tree): `node --test src/lib/chat/week.test.ts
src/components/mobile/messages/home/home-rules.test.ts` → 17 pass;
`npx eslint` over `home/`, `week.ts`, `v2-tokens.ts`, `use-hide-tabbar.ts`,
`use-chat-v2.ts`, `avatar.ts` → exit 0, no output; three contrast ratios of
`S1-contrast.md` recomputed (below). Typecheck and build were not re-run (two
sibling batches are editing the checkout; the contract lens re-ran them).

## Verdict

**PASS with fixes.** No HIGH: no contract size, token or aria-label changed,
no hooks-rule break, nothing white-flashing in Night, no horizontal overflow
at 375px, every touch target ≥ 44px, every state (skeleton, empty, LoadFailed)
in place, the tab bar visible on the home and hidden by the counted hook on
every new layer. Two MEDIUM (a pinned rule missed: a `className`; a copy
string's apostrophe) and four LOW (one token choice on a club row's time, the
empty block's centring, a clipped RSVP mark on a long time, one edge). Each
STOPPED entry was judged right.

## Findings

### S1-DESIGN-1 — MEDIUM — `className` on the week's card row (pinned rule 11.0: "no `className`")

- where: `src/components/mobile/messages/home/YourWeek.tsx:158`
  (`className="vibe-no-scrollbar"`), against the mockup's inline
  `scrollbar-width: none` (`W0_Home:39`).
- what: 11.0 says "inline styles like the rest of the file (no `className`,
  MM:6)" and the batch brief repeats it; the row already carries
  `scrollbarWidth: "none"` and `overflowY: "hidden"` inline (`:167-168`). The
  class is the only one in `messages/*` (grep: no other `className=` under
  `src/components/mobile/messages/`). It exists in `globals.css:2886`, so it
  renders, but it is the rule the contract pinned. (S1-CONTRACT-1 files the
  same line.)
- fix: delete line 158. Firefox honours the inline `scrollbarWidth: "none"`;
  iOS Safari draws no persistent scrollbar on a horizontal row; the 28px mask
  (`:169-170`) already fades the row's right edge. If a desktop WebKit
  scrollbar is ever seen in the visual pass, record it there rather than keep
  the class.

### S1-DESIGN-2 — MEDIUM — a curly apostrophe in an "exact" 1.2 string

- where: `src/components/mobile/messages/home/HomeEmpty.tsx:62`
  (`you&rsquo;re`); contract 1.2 line 79 (`you're`, a straight apostrophe);
  the mockup `W0_EmptyClubs:52` has the curly one.
- what: 1.2 says every copy string is exact and a batch may not change one;
  the contract wrote `you're`. Every other S1 string keeps the contract's
  straight quote (`RSVP'd`, `you're going`, `Couldn't …`), so this one line is
  also inconsistent with its neighbours on the same screen. (S1-CONTRACT-3
  files it as LOW; rated MEDIUM here because it is a pinned string on a
  reviewed screen — one glyph, one-line fix.)
- fix: `you&apos;re` (or `{"you're"}`), so the rendered text equals 1.2's.

### S1-DESIGN-3 — LOW — the club row's time brightens for `N new` too; the mockup brightens it only for an unread Board post

- where: `src/components/mobile/messages/home/ClubRow.tsx:118`
  (`color: unread ? t.secondary : t.muted` with `unread = board.unread ||
  lounge.unread_count > 0`, `:37`); the mockup: Salsa Club and Jag Robotics
  (unread Board post) `#CFC8BE` (`W0_Home:101`, `:126`), Film Society (`4
  new`, no Board post) `#9C958C` (`:141`), Pre-Med Society `#9C958C`
  (`:168`).
- what: the mockup's rule is "secondary ink when the Board is unread, muted
  otherwise"; a row whose only news is `N new` keeps the muted time (the pill
  carries the news). Not pinned by 1.2 (it pins the person row's time
  colours only), so LOW; the mockup is the design.
- fix: `color: club.board.unread ? t.secondary : t.muted`.

### S1-DESIGN-4 — LOW — the no-clubs block is a 380px box, not the list area

- where: `src/components/mobile/messages/home/HomeEmpty.tsx:26`
  (`minHeight: 380`); the mockup `W0_EmptyClubs:50` (`flex-grow: 1;
  min-height: 0; … justify-content: center`) centres the block in whatever
  is left under the filter row.
- what: 380 is exactly the leftover on a 667px phone (667 − 52 − 126 − 45 −
  64), so an iPhone SE matches the mockup; on an 844px phone the block sits
  in the top 380px of a 557px area, 88px above the mockup's centre. The list
  `<section>` (`MessagesHome.tsx:391`) already has `flexGrow: 1` inside the
  `100dvh` column but is not itself a flex column, so the block cannot grow.
- fix: on `MessagesHome.tsx:391` add `display: "flex", flexDirection:
  "column"`; on `HomeEmpty.tsx:26` replace `minHeight: 380` with `flexGrow:
  1`. (The main's `minHeight: "100dvh"` then counts the tab bar's 64px, so
  the centre lands 32px low; `minHeight: "calc(100dvh - 64px -
  env(safe-area-inset-bottom, 0px))"` on `MessagesHome.tsx:283` fixes that.)

### S1-DESIGN-5 — LOW — a week card's RSVP mark is what gets clipped when the time is long

- where: `src/components/mobile/messages/home/YourWeek.tsx:227-247` (line 1
  of the card: `whiteSpace: nowrap; overflow: hidden`, `line.text` a bare
  text node, the Going / Maybe span without `flexShrink: 0`); the mockup's
  samples (`Fri 7 PM`, `Sat 2 PM`, `W0_Home:46`, `:51`) fit the 122px content
  box (142 − 2 × 10).
- what: `eventTimeShort` can answer `Sat 11:30 PM` (12 glyphs ≈ 79px at
  12px/600) — with the ` · ` (≈ 14px) and the check + `Going` (≈ 47px) the
  line is ≈ 140px, so the last ≈ 18px are cut: the word `Going` loses its
  tail while the time stays whole. 11.0's "shape AND label" rule wants the
  mark and its word intact; the time is the part that can shorten. Rare
  (only a :30 time on a weekday card), so LOW.
- fix: wrap `line.text` in `<span style={{ minWidth: 0, overflow: "hidden",
  textOverflow: "ellipsis" }}>` and give the RSVP span `flexShrink: 0`, so
  the time truncates first and the mark + word always show.

### S1-DESIGN-6 — LOW — the `Requests` count pill's tint on the active chip is a guess the mockups never draw

- where: `src/components/mobile/messages/home/MessagesHome.tsx:372-373`
  (`active ? "rgba(var(--scrim-rgb),0.14)"` with `t.activeChip.ink`); the
  mockup draws the count on the inactive pill only (`W0_Home:62`) and
  `W0_EmptyClubs:47` draws Requests with no count.
- what: on the active (inverted) chip the scrim is the SAME colour as the
  chip (Night: white .14 on `#F6F1EA` → `#F7F3ED`; Light: `28,28,30` .14 on
  `#141416` → `#151517`), so the count pill is nearly invisible as a pill
  (the number itself passes at 17.79 / 17.05). Cosmetic; the visual pass will
  see it.
- fix: on the active chip use the page's scrim inverted — Night
  `rgba(12,11,11,0.10)` on the cream chip, Light `rgba(250,247,242,0.16)` on
  the ink chip — or today's `TabPill` rule (`rgba(255,255,255,0.18)` +
  `var(--paper)`), which the contract's "as today" already allows for the
  All badge.

## STOPPED and SIBLING (S1-notes.md), judged from this lens

| entry | judgement |
|---|---|
| part 1: four club gradients, not "six" | RIGHT. `grep -oh "linear-gradient(145deg, …)" boards/W0_*.dc.html \| sort -u` → exactly four (`#C23A72→#962858` ×16, `#1F7580→#155158` ×2, `#337A5A→#245942` ×1, `#8A6A22→#664C14` ×2). Six is the person-colour count (MK:0.2). Nothing invented; `avatar.ts` carries the four and the six. |
| 11: the unread pill with no number | RIGHT. `ThreadEntry.unread?: boolean` (`messages/types.ts:40`), no count anywhere in `GET /api/me/threads`. The blank 20px coral pill (`PersonRow.tsx:125-136`) reads as a dot; the row label says `unread`. |
| 12: the chip reads `Sat 2 PM · Build Night`, not `Sat · Build Night` | RIGHT. 11.1 names `eventTimeShort`, which never answers a bare weekday (1.4); the contract contradicts the mockup and the pinned function wins. The chip has `minWidth: 0` + ellipsis (`ClubRow.tsx:160, 183`), so the longer text cannot push `Going` or `N new` out. |
| 13: the spoken time as the last clause | RIGHT. 1.2's examples carry no time clause and then say the time is spoken with `rowTimeSpoken`; appending it last keeps every example verbatim. |
| 14: `coralMark` for `Going` on the live card and the live chip; the dots at 2.88:1 recorded | RIGHT. Recomputed here: `#C8401E` on `#FFE9E0` = 4.27 (fails), `#B5381A` on `#FFE9E0` = 5.07; `#C8401E` on the chip's tint over cream (`#FBE1D8`) = 4.01, `#B5381A` = 4.76; `#FF8A66` on the Night chip tint (`#2E1611`) = 7.33. 11.0's own definition of the mark token is "on a tinted surface", so this is the contract's token, not a swap. The coral dots (`#FF5C35` on `#FAF7F2` = 2.88) are redundant marks beside `Board:`, `Live now`, the day label — WCAG 1.4.11 exempts a graphic whose meaning the adjacent text carries. |
| 15: the disabled pencil while the flag is unknown | RIGHT. 2.1 asks for "the pencil" with nothing to open; `role="button" aria-disabled="true"` with no handler is the honest control. 40px as today (it is today's chrome, not a new screen). |
| 16 (a reading): `?tab=` via `useSearchParams` | Not this lens; the build gate (S1-gate.md) says no Suspense complaint. |
| 17: the failure box at the top of the list under `All` | RIGHT. With clubs interleaved by recency there is no "club position"; the top is the one place a reader finds it. |
| SIBLING: none | Right at its time (typecheck 0 repo-wide on the first run). |

## Contrast (S1-contrast.md), three ratios recomputed

WCAG 2.x relative luminance, sRGB, blends over the page as the table says:

| pair | table | here |
|---|---|---|
| `--ink-sub` `#5A564F` on `#FAF7F2` (the Light muted) | 6.83 | 6.83 |
| `#B5381A` on `#FFE9E0` (Going / Live now on the Light live card) | 5.07 | 5.07 |
| `#FF8A66` on the Night live chip's tint over `#0C0B0B` | 7.31 | 7.33 (`#2E1611`; the .02 is rounding of the blend) |

Also checked: `#140806` on `#FF5C35` = 6.40 (the All badge's ink; white would
be 3.07 and fail), `#C8401E` on `#FAF7F2` = 4.67 (`Find events`, `Going` on
the page), `rgba(250,247,242,0.80)` over `#141416` = 11.24 (today's weekday
in Light), `#5C5853` on the Light `N new` pill (`#E8E5E1`) = 5.62. The table
holds.

## Holds (tried to refute, could not)

**Sizes (11.1, 11.2, MK:1-3), Night and Light alike**
- Header: `calc(52px + env(safe-area-inset-top))` with the safe area folded into the top padding (`MessagesHome.tsx:288-289`); `Messages` Fraunces 30px/800, line-height 1, −0.8px (`:295` = `W0_Home:16`); the pencil 44×44 (`:301-302`), `aria-label="New message"`, its 18px icon path verbatim from `W0_Home:18`; no search button (1.2, 14.13).
- Your week: `padding: 6px 0 8px` (`YourWeek.tsx:64`), heading row 18px (`:69`), strip `margin-top: 2px; height: 44px` (`:78`), card row `padding: 8px 16px 10px; margin: 0 0 -10px` around 64px cards (`:161-163`) → 6+18+2+44+72+8 = **150**; empty line `margin-top: 4px; height: 44px` (`:141`) → **126**; the failure row `minHeight: 82` − 10 = 72, so the block keeps 150 with `LoadFailed compact` in the cards' place and the strip still drawn (11.2 Failure); the skeleton row is three 142×64 discs in `rgba(var(--scrim-rgb),0.06)` (`:135-138`) with `overflow: hidden` (3×142 + 2×8 + 32 = 474 > 375 clipped, no page scroll).
- Day buttons 44×44, radius 14, weekday 10.5px/600 (700 today), number 15px/700 (800 today), 5px dot (`:92-124` = `W0_Home:30-36`); seven × 44 + 24 padding = 332 < 375; `justify-content: space-between`.
- Cards 142×64, `padding: 7px 10px`, radius 18, three lines `space-between`; title Fraunces 15.5px/17px −0.2px ellipsis (`:249`); club dot 14px on `clubGradient` (`:252`); the right-edge mask `calc(100% − 28px)` on both `-webkit-mask-image` and `mask-image` (`:169-170`).
- Filter row 45px with the top hairline, `padding: 0 12px; gap: 2px` (`MessagesHome.tsx:326`); tabs 44px `padding: 0 3px` wrapping 30px pills 13px/700 `padding: 0 14px`, `All` `min-width: 46px`, the count pill 18px 11.5px/800 with `padding: 0 8px 0 14px; gap: 6px` (`:340-384` = `W0_Home:58-62`); widths sum ≈ 340 < 375 with all four labels and a Requests count.
- List `padding-top: 2px` (`:391`); person row `gap: 14px; padding-left: 16px`, text `padding: 11px 16px 11px 0; gap: 2px`, 44px avatar, group = two 30px discs with the 2px page-colour ring → 66px (`PersonRow.tsx:50-73, 184-191` = `W0_Home:66-85`); club row `gap: 12px; padding-left: 14px`, 48px avatar with Fraunces 18px/800 initials and the `inset 0 0 0 1px rgba(255,255,255,0.16)` ring, text `padding: 10px 16px 11px 0; gap: 3px`, name 16.5px/800 −0.3px at `align-items: baseline`, the 8px coral dot `margin-right: 7px; vertical-align: 1px`, chips 22px, `N new` 20px (`ClubRow.tsx:50-216` = `W0_Home:96-150`).
- The 36px fade: fixed, `bottom: calc(64px + env(safe-area-inset-bottom))`, `transparent → var(--cream-92)` (`MessagesHome.tsx:395-407`; `--cream-92` is `rgba(12,11,11,0.92)` in Night, `rgba(250,247,242,0.92)` in Light, `globals.css:190, :114`), `aria-hidden`, `pointer-events: none`, z 5 — under every layer (`ConversationView` and `ClubSpace` are fixed at z 1100).
- No clubs: `padding: 0 32px 36px`, centred; h2 Fraunces 24px/700 1.15 −0.4px; the sentence 14.5px/500 1.45 `max-width: 306px` in `--ink-2` (a sentence, never muted — B5 F1); `Find clubs on campus` 48px `padding: 0 24px` gradient pill 15px/800 `margin-top: 22px`; `Start a club` 44px 14px/600 underlined at .45 with `text-underline-offset: 4px`, `margin-top: 6px`; both → `/campus?tab=orgs` (`HomeEmpty.tsx` = `W0_EmptyClubs:50-54`, 11.9.2, 14.14). `Find events` coral as W0_EmptyWeek (MK:16.12), → `/campus?tab=events`.

**Tokens (11.0, MK:0.1)**
- `palette(night)` is the only source (`v2-tokens.ts`): page/ink/secondary/surface/hairline are the app's vars; muted is `var(--ink-sub)` in Light (`#5A564F`, `globals.css:115`) and `var(--ink-muted)` in Night (`#9C958C`, `:191` shows `--ink-sub` is `#CFC8BE` in Night, so the builder was right NOT to use `--ink-sub` in both themes); `--ink-muted` is never used in Light. Coral `#FF5C35`; coral text `#FF8A66` / `#C8401E`; coral mark `#FF8A66` / `#B5381A`; the button gradient + `#140806`; the active chip `#F6F1EA/#0C0B0B` ↔ `#141416/#FAF7F2`; live / quiet card chrome and the bloom are MK:0.1's two columns verbatim. The mockups' Light ink literals (`#141416 / #4A4541 / #6B645C`) appear nowhere but as the Night today-chip's weekday `#4A4541` on `#F6F1EA` (the mockup's own pair, `W0_Home:33`).
- Where each token is spent: coral text on the page (`Find events`, `Going` on a quiet card and on a club row); coral MARK on tinted surfaces (`Live now` and `Going` on the live card, the live chip); the active chip on the active filter and today's day; the bloom drawn ONLY when a `room_state === "live"` card exists (`YourWeek.tsx:50, 66-68`); every translucent chrome (`N new`, the next-event chip, the inactive pill border, the count pill) on `rgba(var(--scrim-rgb), …)` so Night gets the mockup's white and Light the app's ink.
- The Home mockup's live card and bloom are STRONGER than MK:0.1's club column (`W0_Home:22` bloom .56/.20, `:40` border .55 + `0 0 0 3px .08, 0 6px 18px .30`); the contract pins "the two columns of MK:0.1" for both, and the build follows the contract. Not a finding; the visual pass may raise it as a design question.
- No `className` but S1-DESIGN-1; no `SOFT`; no Discord word (`channel` appears only in the pinned `?channel=` URL).

**Fonts and weights**
- `SERIF` on `Messages` (800), `Your week` (700), the card title (700), the club name (800), club initials (800), the no-clubs heading (700); `FONT` on every body run; `font-family: inherit` on every `<button>`; `layout.tsx:96` is exactly 11.0's string (Fraunces 0,800 and DM Sans 800 added, one line).

**States, every screen**
- Skeleton until BOTH threads and inbox answered (`MessagesHome.tsx:206`), the week's own three-card skeleton; `Couldn't load your messages.` / `Couldn't load your clubs.` / `Couldn't load your week.` each in its own place with `tone={night ? "dark" : "light"}` and Retry; both list reads failing → one box; Clubs + `[]` → `HomeEmpty`; Chats empty → `EmptyState tab="all"`; Requests empty → `tab="requests"`; a refetch failure keeps the rows (`quiet: true`, the error set only before the first success).
- Nothing white in Night: `main` is `var(--cream)` (`:283`), `FlagPending` is today's `var(--feed-backdrop)` (`#0C0B0B`-based in Night, `globals.css:161`), `HomeEmpty` paints no background, `LoadFailed` takes the dark tone, the skeletons use the scrim tokens.

**Accessibility (11.0, 1.2, MK:14)**
- `role="tablist" aria-label="Show"` with four `role="tab" aria-selected`; `Requests, N waiting` only with a count; `<nav aria-label="Your week, <spoken>">`; `aria-current="date"` on today; day labels per 1.2 incl. `today, nothing planned`, `: <title>, going, live now`, `; ` between two events (`home-rules.ts:276-285`, tested); `role="group" aria-label="Event rooms you RSVP'd to this week"`; card labels `<title> room, <club>, live now, you're going` (no club clause when `org` is null); row labels of 1.2 with `rowTimeSpoken`; the pin `aria-label="Pinned"` as 1.2 asks; every dot, avatar, icon and the unread pill `aria-hidden`; Going = check + word, Maybe = dot + word, Live = glowing dot + word (shape and label, never colour alone).
- Touch targets: 44 (days, tabs, pencil, `Find events`, `Start a club`), 48 (`Find clubs on campus`), 64+ (rows, cards). No input on the home (16px rule moot).

**Layout at 375px**
- No fixed element wider than 142px; the strip and the filter row sum under 375; the bloom's negative left (−92px) is unreachable overflow (no scrollbar); the week row and the skeleton are the only horizontally overflowing boxes and both clip/scroll themselves.

**The tab bar**
- Visible on the home (nothing on the home touches `document.body.classList`); hidden by the counted `useHideTabBar()` on `ClubSpace`, `EventChat`, `RsvpSheet`, `CardSheet` (the only callers); a conversation over the home keeps today's boolean (`ConversationView`, untouched). The hook is a module-level count with `Math.max(0, …)` on unmount, first mount adds / last unmount removes.

**Navigation chrome (2.1, 11.10, 2.2)**
- The fork is one hook then three components (`MessagesMobile` → `FlagPending` / `MessagesMobileV2` / `MessagesMobileV1`); the bare header is today's chrome verbatim (28px/900, the sticky blur, the 40px pencil) + `ListSkeleton`, no pills, no week; `CampusMobile` drops `chat` from both tab orders on `true`, mounts a `ListSkeleton` in the pane while `null` with a chat param, and never mounts `ChatPane` / `OrgChannelsDrawer` / the `# name` view with the flag on.

## Gates (this review)
- `node --test` over `week.test.ts` + `home-rules.test.ts`: 17 pass, 0 fail.
- `npx eslint` over the S1 home files, `week.ts`, `v2-tokens.ts`, `use-hide-tabbar.ts`, `use-chat-v2.ts`, `avatar.ts`: exit 0.
- Typecheck / build: not re-run here (siblings editing); S1-gate.md records 0 / 0 at `b47a72b`, the contract lens re-ran them.
