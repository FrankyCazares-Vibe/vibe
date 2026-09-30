# Wave 2 as-is — the 13 mockups, screen by screen (reader "mockups-map", S70, 2026-09-30)

Purpose: a builder reproduces each wave-2 screen at phone width without opening the canvas. Every number and string below is copied from the mockup source under `handoffs/chat-redesign/boards/W0_*.dc.html` (cited as `W0_<Name>:<line>`), and every "where the data comes from" claim maps to `src/lib/chat/types.ts` (cited `types.ts:<line>`) or the contract `handoffs/chat-redesign/wave-1-contracts.md` (cited `contracts.md:<line>`). Sibling maps: `messages-mobile-map.md` (today's component, the split), `routes-map.md` (today's routes), `database-map.md` (migration A). Nothing here was run; the mockups were read as text.

## 0. Global facts that hold for every screen

### 0.1 Canvas, fonts, the two palettes

- **The mockups are 390 × 844** (`W0_Home:14`, `W0_Club:14`, every screen's root div and `"$preview":{"width":390,"height":844}` at the end of each file). `W0_Cards` is 390 × 1100 (`W0_Cards:14,180`), a tall sheet of examples, not a phone screen. The orchestrator's target is 375px; nothing in the mockups is wider than 390 minus its 12-16px gutters, and the widest fixed element is the 292px card (`W0_Club:73`), which fits 375 − 12 − 8 − 28 − 12 = 315.
- **Fonts** (`W0_Home:11-12`): Google Fonts `Fraunces` (ital, opsz 9..144, wght 300..900, SOFT 0..100) and `DM Sans` 400/500/600/700/800. Body: `font-family:"DM Sans",system-ui,sans-serif`. Titles: `Fraunces, Georgia, serif` with `font-variation-settings: 'SOFT' 100` on the wordmark, the club name and sheet titles (`W0_Home:16`, `W0_Club:19`, `W0_NewPoll:72`). Wordmark weight is **800**, not 900 (`W0_Home:16`); the app's list header today uses 900 (`src/components/mobile/MessagesMobile.tsx:611`).
- **Night palette** (all Night screens, `W0_Home:12,14`): page `#0C0B0B`; ink `#F6F1EA`; secondary ink `#CFC8BE`; muted `#9C958C`; tertiary `#B5AEA4`; surface `#161515`; raised surface (tray) `#1C1A1A` (`W0_Tray:59`); hairlines `rgba(255,255,255,0.06 / 0.07 / 0.08 / 0.09 / 0.10 / 0.12)`; coral `#FF5C35`; coral text `#FF8A66` (links `a{color:#FF8A66}`, hover `#FF5C35`); coral button gradient `linear-gradient(180deg, #FF7B4A, #FF5C35)` with ink `#140806` on it (`W0_Club:158`); ring grey `#6E6862` (unpicked radio, `W0_Club:92`); placeholder `#9C958C` (`W0_Club:12`); scrim `rgba(8,7,7,0.5)` (`W0_Tray:57`, `W0_NewPoll:65`).
- **Light palette** (`W0_Club_Light` only; the diff against `W0_Club` is colour-only, no layout change — `diff W0_Club.dc.html W0_Club_Light.dc.html` touches lines 5, 12, 14, 16, 20-23, 26, 30, 34, 38-39, 42, 45-46, 52-56, 59-63, 67, 69, 73-74, 77-79, 86, 89-91, 98, 101-103, 110, 119, 125-127, 130, 132-134, 136, 138, 141, 143-145, 153-156):

| role | Night | Light (`W0_Club_Light`) |
|---|---|---|
| page | `#0C0B0B` | `#FAF7F2` (`:12,14`) |
| ink | `#F6F1EA` | `#141416` (`:12,14`) — NOT the app's `--charcoal` `#1C1C1E` |
| secondary ink | `#CFC8BE` | `#4A4541` (`:20`) |
| muted | `#9C958C` | `#6B645C` (`:22-23`) |
| surface (cards, bubbles, buttons) | `#161515` / `rgba(22,21,21,0.86)` | `#FFFFFF` (`:16,59,73,119`) |
| hairline | `rgba(255,255,255,0.08/0.10/0.12)` | `rgba(20,20,22,0.08/0.10/0.12)` (`:16,52,54,130`) |
| link / coral text | `#FF8A66`, hover `#FF5C35` | `#C8401E`, hover `#B5381A` (`:12`); Going check and Soon ring `#B5381A` (`:39,42`); vote count `#C8401E` (`:86`) |
| active chip | bg `#F6F1EA`, ink `#0C0B0B` | bg `#141416`, ink `#FAF7F2` (`:53`) |
| coral dot / send gradient / avatars | unchanged | unchanged (`:54`, `:158` not in the diff) |
| bloom | `rgba(255,92,53,0.36) → 0.13 → 0` | `0.22 → 0.08 → 0` (`:30`) |
| live/soon event card | `linear-gradient(120deg, rgba(58,22,20,0.96), rgba(30,20,19,0.96))`, border coral .45, glow `0 6px 18px rgba(255,92,53,0.18)` | `linear-gradient(120deg, #FFE9E0, #FFFFFF)`, border coral .55, glow .16 (`:38`) |
| quiet event card | `rgba(22,21,21,0.92)`, border white .08, inset highlight | `#FFFFFF`, border `rgba(20,20,22,0.10)`, `0 1px 2px rgba(20,20,22,0.04)` (`:45`) |
| picked poll option | border coral .50, bar `rgba(255,92,53,0.24)`, bg white .04 | border coral .55, bar `rgba(255,92,53,0.16)`, bg `#FFFFFF` (`:78-79`) |
| unpicked poll option | border white .10, bg white .04, bar white .07 | border `rgba(20,20,22,0.10)`, bg `rgba(20,20,22,0.02)`, bar `rgba(20,20,22,0.06)` (`:90-91`) |
| bubble (theirs) | `#161515`, border white .06, sender `#9C958C` | `#FFFFFF`, border `rgba(20,20,22,0.08)`, sender `#6B645C` (`:119`) |
| top fade over the message list | `#0C0B0B → transparent` | `#FAF7F2 → transparent` (`:67`) |
| placeholder | `#9C958C` | `#6B645C` (`:12`) |

- The app's own tokens map onto these one-for-one in Night (`src/app/globals.css:146-157`: `--cream #0C0B0B`, `--charcoal #F6F1EA`, `--ink-2 #CFC8BE`, `--ink-muted #9C958C`, `--paper #161515`, `--hairline rgba(255,255,255,0.09)`, `--scrim-rgb 255,255,255`, `--coral #FF5C35`) but NOT in Light (`globals.css:59-68`: `--charcoal #1C1C1E`, `--ink-2 #5C5853`, `--ink-muted #8A8580`, `--paper #FFFFFF`, `--hairline rgba(28,28,30,0.08)`, `--scrim-rgb 28,28,30`). The Light mockup's `#141416 / #4A4541 / #6B645C` have no token. See section 14.

### 0.2 Chrome shared by every "inside a club" screen (Club, Club_Light, Board, Room, Cards, Tray, the three sheets)

- **Header, 52px** (`W0_Club:15-27`): `height:52px; padding:4px 10px 0 10px; gap:8px; align-items:center`.
  - Back: 44×44 circle link, `border:1px solid rgba(255,255,255,0.10); background:rgba(22,21,21,0.86); color:#CFC8BE`, chevron 18px stroke 2.4 (`M15 5l-7 7 7 7`), `aria-label="Back to Messages"` (`:16`); on the Room it is `"Back to Salsa Club"` (`W0_Room:16`).
  - Club avatar 40×40 circle, initials in Fraunces 800 15.5px `#FAF7F2` on a per-club gradient (`linear-gradient(145deg, #C23A72, #962858)` for Salsa Club) with `inset 0 0 0 1px rgba(255,255,255,0.16)` (`:17`). `aria-hidden`.
  - Title column `gap:3px`: `<h1>` Fraunces 800 20px, line-height 1.1, letter-spacing −0.4px, SOFT 100, single line ellipsis (`:19`); under it a 12px/600 line, `line-height:15px`, `color:#CFC8BE`: `Your hat: Officer` · `48 members` (the dot and the count in `#9C958C`) (`:20-24`).
  - Right: 44×44 "more" circle, same chrome as Back, three-dot icon stroke 3, `aria-label="More about Salsa Club"` (`:26`). On the Room: `"More about this event chat"` (`W0_Room:21`).
- **Room chips row, 45px** (`W0_Club:52-57`): `<nav aria-label="Rooms in Salsa Club">`, `height:45px; padding:0 12px; gap:6px; border-top:1px solid rgba(255,255,255,0.08); overflow-x:auto; scrollbar-width:none`. Each chip is a 44px-tall hit area wrapping a **30px pill**, 13px/700, `padding:0 12px`, radius 999. Active: bg `#F6F1EA` ink `#0C0B0B` + `aria-current="page"`. Inactive: `border:1px solid rgba(255,255,255,0.12); color:#CFC8BE`. Order shown: **Lounge · Board · Officers · Fall Formal** (`:53-56`).
  - Board chip carries a **7px coral dot** after the label (`gap:6px; padding:0 10px 0 12px`) and `aria-label="Board, 1 unread post"` (`:54`).
  - Officers chip: 12px lock icon before the label (`rect x=5 y=11 w=14 h=10 rx=2.5` + arc), `padding:0 12px 0 10px; gap:5px`, `aria-label="Officers, only officers see this room"`, and it is a `<button>` while the others are `<a>` (`:55`).
  - Event chip: 12px calendar icon (`rect x=3 y=5 w=18 h=16 rx=3` + `M8 3v4M16 3v4M3 10h18`), label = event title, `aria-label="Fall Formal, event chat, tonight"` (`:56`).
- **Composer footer** (`W0_Club:153-159`): `padding:8px 12px 12px; background:#0C0B0B; border-top:1px solid rgba(255,255,255,0.06); gap:8px` → 64px tall.
  - "+" 44×44 circle, `border:1px solid rgba(255,255,255,0.10); background:#161515; color:#F6F1EA`, plus icon 20px stroke 2.4, `aria-label="Add a poll, sign-up or event"`; a `<button aria-expanded="false">` on `W0_Cards:172` and a link to the tray elsewhere (`:154`).
  - Field: 44px pill `<label>`, `padding:0 16px; border:1px solid rgba(255,255,255,0.10); background:#161515`; `<input type="text">` 40px tall, 15px, transparent, `placeholder="Message the Lounge"` and the same `aria-label` (`:155-157`). Room: `"Message the event chat"` (`W0_Room:161`). Board: `"Post to the Board"` (`W0_Board:141`).
  - Send: 44×44 circle, `background:linear-gradient(180deg, #FF7B4A, #FF5C35); color:#140806`, up-arrow icon 18px stroke 2.6 (`M12 19V5M6 11l6-6 6 6`), `aria-label="Send"` (`:158`). Disabled look (`W0_EmptyClub:82`): `background:rgba(255,255,255,0.07); color:#9C958C; aria-disabled="true"`.
- **Message list** (`W0_Club:66-69`): `padding:8px 12px 8px; gap:8px; flex-direction:column; justify-content:flex-end` with a 14px top fade `linear-gradient(180deg, #0C0B0B, transparent)` (`:67`). Date separator: centred 11px/600 `#9C958C` `Today` (`:69`).
- **Their bubble** (`W0_Club:117-120`): row `align-items:flex-end; gap:8px`; avatar 28×28 circle, initials 10px/700 on a per-person colour (`#2E4A5A/#CFE6F2` DO, `#4A3A5E/#E6D8F5` PS, `#5E4A2A/#F5E1B8` JK, `#5A3A2E/#FFD3C2` MR, `#2A4550/#CFE6F2` ST, `#2F4A3A/#CDEBD9` AL); bubble `max-width:260px; padding:7px 12px 8px; border-radius:18px 18px 18px 6px; border:1px solid rgba(255,255,255,0.06); background:#161515; font-size:14.5px; line-height:1.35`, with the sender name inside as an 11.5px/700 `#9C958C` first line (`:119`).
- **My bubble** (`W0_Tray:49`): `align-self:flex-end; max-width:260px; padding:8px 13px; border-radius:18px 18px 6px 18px; background:#FF5C35; color:#140806; font-size:14.5px; font-weight:500`. No avatar, no name.
- **Cards in the list**: `width:292px` (`W0_Club:73,126`), `padding:10px 12px 6px` (poll) / `10px 12px 4px` (sign-up) / `10px 12px 9px` (`W0_Cards:41`), `border-radius:18px 18px 18px 6px; border:1px solid rgba(255,255,255,0.08); background:#161515`. A card that follows a text bubble from the same person uses `border-radius:6px 18px 18px 6px` (`W0_Club:126`). The viewer's own card: right-aligned, `border-radius:18px 18px 6px 18px`, no avatar (`W0_Cards:91-92`).

## 1. `W0_Home` — Messages home v1, phone, Night (`W0_Home:5`)

**Purpose.** The one inbox: DMs, groups and clubs in one list, "Your week" on top, four filters. **Feeds:** `GET /api/me/threads` (dms, groups, requests; `types.ts:322` for a club room's extra fields), `GET /api/me/inbox` → `InboxResponse.clubs` (`types.ts:334-355`), `GET /api/me/calendar` `rsvp` entries + `CalendarRoomFields` (`types.ts:362-366`). Re-read every 30 s while visible (D7).

**Layout, top to bottom (heights are the mockup's, at 390 wide):**

1. **Header 52px** (`:15-19`): `padding:4px 10px 0 16px; gap:4px`. `<h1>Messages</h1>` Fraunces 800 **30px**, line-height 1, letter-spacing −0.8px, SOFT 100, `margin-right:auto` (`:16`). Two 44×44 circle buttons (`border:1px solid rgba(255,255,255,0.10); background:rgba(22,21,21,0.86); color:#CFC8BE`): search (magnifier, `aria-label="Search people, clubs and messages"`, `:17`) and compose (pencil, `aria-label="New message"`, `:18`).
2. **"Your week" block, 150px total** (`:21-56`; section `padding:6px 0 8px`; heading row 18px; nav `margin-top:2px` 44px; card row `padding:8px 16px 10px` with `margin-bottom:-10px` around 64px cards → 6+18+2+44+72+8 = 150). A coral **bloom** sits behind it: `position:absolute; z-index:-1; left:-92px; top:54px; width:340px; height:118px; radial-gradient(closest-side, rgba(255,92,53,0.56) 0%, rgba(255,92,53,0.20) 52%, transparent 100%)` (`:22`) — stronger than the club's (.36) because the live event is here.
   - Heading row (`:24-27`): `<h2>Your week</h2>` Fraunces 700 16px, letter-spacing −0.2px; right: `Oct 5 – 11 · your RSVPs` 12px/600 `#9C958C` (en dash with spaces).
   - **Day strip** `<nav aria-label="Your week, October 5 to 11">` (`:29-37`): `padding:0 12px; justify-content:space-between`, seven 44×44 buttons, radius 14, each a column `gap:2px` of: weekday 10.5px/600 line-height 12px, day number 15px/700 line-height 16px, a **5px dot**. Past days: both texts `#9C958C` (`:30-32`). Future days: weekday `#CFC8BE`, number `#F6F1EA` (`:34-36`). **Today** (`aria-current="date"`): bg `#F6F1EA`, weekday `#4A4541` 700, number `#0C0B0B` 800, `box-shadow:0 6px 16px rgba(0,0,0,0.45)` (`:33`). Dot: **coral `#FF5C35` = going**, **grey `#9C958C` = maybe**, transparent = nothing (`:33-36`). Labels: `"Monday, October 5, nothing planned"`, `"Thursday, October 8, today: Fall Formal, going, live now"`, `"Friday, October 9: Fright Night, going"`, `"Saturday, October 10: Build Night, maybe"` (`:30-36`).
   - **Event cards row** `role="group" aria-label="Event rooms you RSVP'd to this week"` (`:39`): horizontal scroll, `gap:8px`, no scrollbar, right-edge mask `linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%)`. Each card is an `<a>` **142×64**, `padding:7px 10px; border-radius:18px`, three lines `justify-content:space-between`:
     - **Live card** (`:40-44`): `border:1px solid rgba(255,92,53,0.55); background:linear-gradient(120deg, rgba(58,22,20,0.96), rgba(30,20,19,0.96)); box-shadow:0 0 0 3px rgba(255,92,53,0.08), 0 6px 18px rgba(255,92,53,0.30), inset 0 1px 0 rgba(255,255,255,0.06)`. Line 1: 7px glowing coral dot (`box-shadow:0 0 0 3px rgba(255,92,53,0.25), 0 0 8px #FF5C35`) + `Live · 18 going` 12px/700 `#FF8A66`. Line 2: title Fraunces 700 15.5px/17px, ellipsis. Line 3: 14px club dot (gradient) + `Salsa Club` 12px/500 `#B5AEA4`. `aria-label="Fall Formal room, Salsa Club, live now, 18 going, you're going"`.
     - **Going card** (`:45-49`): `border:1px solid rgba(255,255,255,0.08); background:rgba(22,21,21,0.92); box-shadow:inset 0 1px 0 rgba(255,255,255,0.04)`. Line 1: `Fri 7 PM` 12px/600 `#CFC8BE`, ` · `, then check icon 11px stroke 3 + `Going` in `#FF8A66` 700. Club line in `#9C958C`. `aria-label="Fright Night room, Film Society, Friday 7 PM, you're going"`.
     - **Maybe card** (`:50-54`): same chrome; line 1 `Sat 2 PM · ` + 6px grey dot + `Maybe` in `#CFC8BE` 700. `aria-label="Build Night room, Jag Robotics, Saturday 2 PM, you said maybe"`.
3. **Filter row 45px** `role="tablist" aria-label="Show"` (`:58-63`): `padding:0 12px; gap:2px; border-top:1px solid rgba(255,255,255,0.08)`. Four `role="tab"` buttons, 44px tall, `padding:0 3px`, each wrapping a 30px pill 13px/700 `padding:0 14px`. Active `All`: bg `#F6F1EA` ink `#0C0B0B`, `min-width:46px`. Inactive `Chats`, `Clubs`, `Requests`: `border:1px solid rgba(255,255,255,0.12); color:#CFC8BE`. **Requests carries a count pill**: `min-width:18px; height:18px; padding:0 5px; background:rgba(255,255,255,0.12); color:#F6F1EA; 11.5px/800`, pill padding becomes `0 8px 0 14px; gap:6px`, `aria-label="Requests, 2 waiting"` (`:62`).
4. **The list** `<section aria-label="All chats, pinned first">` (`:65-173`), `padding-top:2px`. Two row kinds:
   - **Person / group row** (`:66-79`, `:81-94`, `:110-119`, `:152-161`): `gap:14px; padding-left:16px`; avatar **44×44** circle with 14px/700 initials (group = two 30px circles offset, the second with `box-shadow:0 0 0 2px #0C0B0B`, `:82-85`); text column `padding:11px 16px 11px 0; border-bottom:1px solid rgba(255,255,255,0.07); gap:2px` → **66px row**. Line 1: name 15px/700 line-height 1.3; a 12px **pin icon** `#9C958C` at `margin-left:auto` when pinned (`:71`); time 12px/600 (`#CFC8BE` when unread, `#9C958C` otherwise). Line 2: preview 13.5px line-height 1.35 ellipsis (`#F6F1EA` 600 when unread, `#CFC8BE` otherwise), group previews prefixed `<b>Jonah K.:</b> `, own last message prefixed `You: ` (`:117`); an **unread count pill** `min-width:20px; height:20px; padding:0 6px; background:#FF5C35; color:#140806; 11.5px/800` (`:76`). Times shown: `8:44 PM`, `8:30 PM`, `Yesterday`, `Wed` (`:72,90,157,168`).
   - **Club row** (`:96-108`, `:121-134`, `:136-150`, `:163-172`): `gap:12px; padding-left:14px`; avatar **48×48** with Fraunces 800 18px initials on the club gradient + `inset 0 0 0 1px rgba(255,255,255,0.16)`; text column `padding:10px 16px 11px 0; gap:3px`. Line 1: club name **Fraunces 800 16.5px**, letter-spacing −0.3px, `align-items:baseline`; time at right. Line 2 (preview): when the Board is unread an **8px coral dot** (`margin-right:7px; vertical-align:1px`) then `<b>Board:</b> Formal tonight, doors at 7:30` in `#F6F1EA` (`:103`); otherwise `<b>Sam T.:</b> who has the HDMI adapter…` in `#CFC8BE` (`:143`) or `<b>Board:</b> MCAT study hall…` (`:170`). Line 3 (chips, `gap:8px; margin-top:1px`, 22px tall): **Live chip** `Live now · Fall Formal` with a 6px coral dot, `border:1px solid rgba(255,92,53,0.50); background:rgba(255,92,53,0.14); color:#FF8A66` 12px/700 (`:105`); **next-event chip** with a 12px calendar icon `Sat · Build Night` / `Fri · Fright Night`, `border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.05); color:#CFC8BE` 12px/600 (`:130,145`); then the RSVP mark: grey dot + `Maybe` (`:131`) or check + `Going` in `#FF8A66` (`:146`); and at `margin-left:auto` a **`4 new` pill** 20px tall `background:rgba(255,255,255,0.08); color:#CFC8BE; 11.5px/700` (`:147`). A club with no event and nothing unread has two lines only (`:163-172`). Row `aria-label`s: `"Salsa Club, unread Board post, Fall Formal is live now"`, `"Jag Robotics, unread Board post, Build Night Saturday, you said maybe"`, `"Film Society, 4 new in the Lounge, Fright Night Friday, you're going"` (`:96,121,136`).
   - Order shown: pinned DM, pinned group, then clubs and DMs interleaved by recency (`:66-172`).
5. **Bottom fade** 36px above the tab bar: `linear-gradient(180deg, rgba(12,11,11,0), rgba(12,11,11,0.92))` (`:175`).
6. **Tab bar 64px** (`:177-183`): `padding:6px 10px 0; background:rgba(12,11,11,0.96); border-top:1px solid rgba(255,255,255,0.08)`; five items `min-width:56px; min-height:48px`, 22px icon + 10px/700 uppercase label letter-spacing .04em: `CAMPUS`, `NETWORK`, `OTTO`, `MESSAGES` (active, `#F6F1EA`, `aria-current="page"`), `PROFILE`. This is a stand-in for the app's `MobileTabBar` (the shell reserves `calc(64px + env(safe-area-inset-bottom))`, `src/components/mobile/MobileShell.tsx:32`).

**Where each element gets its data, and the gaps:**

| element | source | gap |
|---|---|---|
| day dots (going coral / maybe grey) | calendar `rsvp` entries: `viewer_status` (`routes-map.md:240-241`), `starts_at` | none |
| "Your week" range `Oct 5 – 11` | computed from today (Mon–Sun); this week only (wave-0-decisions.md:28) | format not pinned |
| event card title, club name | entry `title`, `org.name` (`routes-map.md:240`) | `org` is null for a private club the viewer left (`routes-map.md:244-245`) |
| `Live` / time `Fri 7 PM` | `room_state` (`types.ts:365`), `starts_at` | time format not pinned |
| `18 going` on the live card | **no calendar field**; `EventRef.going_count` exists only on inbox `next_event` / space (`types.ts:51`) | **gap** |
| club dot colour, club avatar gradient | **nothing**; `OrgRef.logo_url` (`types.ts:36`) | **gap: no colour in any payload** |
| card is a link | `room_id` non-null (`types.ts:364`) | a card with `room_id` null has no pinned rendering |
| club row: name, avatar | `InboxClub.org.name`, `org.logo_url` (`types.ts:335`) | initials/gradient: gap as above |
| coral dot + `Board:` preview | `board.unread`, `board.latest.text` (`types.ts:338`) | which of `board.latest` / `lounge.latest` a row shows is not pinned |
| `Sam T.:` preview | `lounge.latest.author_name` + `.text` (`types.ts:326-332`) | none |
| `4 new` | `lounge.unread_count` (`types.ts:340`) | none |
| `Live now · Fall Formal`, `Fri · Fright Night`, Going/Maybe | `next_event.state`, `.title`, `.starts_at`, `.viewer_status` (`types.ts:41-53,342`) | none |
| row time | `last_activity_at` (`types.ts:348`) | `8:41 PM` / `Yesterday` / `Wed` format not pinned; today's `relativeTime` gives `just now / 5m / 3h / 2d / Oct 5` (`MessagesMobile.tsx:282-295`) |
| pin icon, order | `pinned_at` (`types.ts:350`); inbox is "pinned first, then last_activity_at" (`types.ts:354`) | DMs and clubs come from two routes; the merged order is not pinned |
| `Requests, 2 waiting` | `GET /api/me/threads` `requests` (`MessagesMobile.tsx:46`) | none |
| person avatar colours, `You:` prefix | thread `peer.avatar_url`, `last_message.user_id === viewer` (`MessagesMobile.tsx:58-63,77-82`) | none |
| muted state | `muted_until` (`types.ts:351`) | **no muted rendering in any mockup** |

## 2. `W0_EmptyWeek` — Messages home, nothing on your week, Night (`W0_EmptyWeek:5`)

**Purpose.** The Home when the calendar has no `rsvp` entry this week. Everything is `W0_Home` except:

- **No bloom** behind "Your week" (the section has no gradient div, `:21`).
- The day strip is unchanged but every dot is transparent and today's label reads `"Thursday, October 8, today, nothing planned"` (`:28-34`).
- The card row is replaced by a **44px line** (`:37-40`): `margin-top:4px; padding:0 6px 0 16px; gap:8px`: `<p>Nothing on your week yet.</p>` 13.5px/500 `#CFC8BE`, and at `margin-left:auto` a 44px-tall link `Find events` + 14px chevron, 13.5px/700, **`color:#FF8A66`** (`:39`), `href="#find-events"` (target not pinned; the Campus events page is the only candidate — not in any payload).
- The block is 6+18+2+44+4+44+8 = **126px** (vs 150).
- Filter row and tab bar identical to Home (`:43-48`, `:93-99`); the list shows DMs only (Maya R. pinned with `2` unread and the preview `come to salsa with me, I'll save a spot`, Orgo study group pinned, Priya S.) (`:50-91`).

**Data:** calendar answers no `rsvp` row between Monday and Sunday. Nothing else.

## 3. `W0_EmptyClubs` — Messages, Clubs filter, no clubs yet, Night (`W0_EmptyClubs:5`)

**Purpose.** The `Clubs` filter when `GET /api/me/inbox` answers `clubs: []` (`types.ts:355`). Header, week strip and tab bar are `W0_EmptyWeek`'s (`:15-41`, `:57-63`) with one difference: the `Find events` link is **`color:#F6F1EA`** here (`:39`) and coral `#FF8A66` in `W0_EmptyWeek:39` — the two mockups disagree.

- Filter row: `Clubs` is the active pill; `Requests` carries no count (`:43-48`).
- **Empty state** `<section aria-labelledby="no-clubs-heading">` (`:50-55`): fills the list area, `padding:0 32px 36px; align-items:center; justify-content:center; text-align:center`.
  - `<h2>Your clubs will live here.</h2>` Fraunces 700 **24px**, line-height 1.15, letter-spacing −0.4px, SOFT 100 (`:51`).
  - `<p>Join a club to get its Board, its Lounge and a chat for every event you're going to.</p>` 14.5px/500 line-height 1.45 `#CFC8BE`, `max-width:306px; margin-top:10px; text-wrap:pretty` (`:52`).
  - Primary: `Find clubs on campus` — 48px pill, `padding:0 24px; background:linear-gradient(180deg, #FF7B4A, #FF5C35); color:#140806; 15px/800; margin-top:22px`, `href="#find-clubs"` (`:53`).
  - Secondary: `Start a club` — 44px, 14px/600 `#CFC8BE`, `text-decoration:underline; text-decoration-color:rgba(207,200,190,0.45); text-underline-offset:4px; margin-top:6px`, `href="#start-a-club"` (`:54`).

**Data:** `clubs.length === 0`. The two link targets are not pinned by any contract (club directory / create-club live on Campus today; `POST /api/orgs` per `routes-map.md` section 13 is the create route). Compare today's `EmptyState` copy `No conversations yet` / `Search for someone in Network and tap message to start a conversation.` / `Find people` and `No message requests` / `Requests from people you don't follow yet will show up here.` (`MessagesMobile.tsx:1000-1054`) — the mockup set has **no Chats-empty or Requests-empty screen**, so those two stay as today.

## 4. `W0_Club` (Night) and `W0_Club_Light` — inside a club, the Lounge (`W0_Club:5`, `W0_Club_Light:5`)

**Purpose.** The club space opened on its Lounge: header, "Up next", room chips, the latest Board post as a strip, the Lounge thread, the composer with "+". **Feeds:** `GET /api/orgs/[slug]/space` → `SpaceResponse` (`types.ts:377-390`) for everything above the thread; `GET /api/me/threads/[id]/messages` → `ThreadMessagesResponse` (`types.ts:295-308`) for the Lounge (`id` = `rooms[kind=lounge].id`), polled every 4 s with `?after=` (D7). Light is colour-only (section 0.1 table).

**Layout, top to bottom:**

1. **Header 52px** — section 0.2. `Salsa Club` / `Your hat: Officer · 48 members` (`:19-23`).
2. **"Up next" block, 92px** (`:29-50`; `padding:6px 0 0`; heading 18px; grid `padding:8px 16px 10px` around 50px cards). Bloom `left:-66px; top:-2px; 340×118; rgba(255,92,53,0.36) → 0.13 → 0` (`:30`).
   - Heading row (`:32-35`): `<h2>Up next</h2>` Fraunces 700 16px; right: `Salsa Club · your RSVPs` 12px/600 `#9C958C`.
   - Cards: `role="group" aria-label="Salsa Club events you RSVP'd to"`, a **2-column grid** `gap:8px`, each card `height:50px; padding:7px 10px; border-radius:18px`, two lines (`:37-49`):
     - **Soon card** (`:38-44`): live-card chrome but `border:rgba(255,92,53,0.45); box-shadow:0 6px 18px rgba(255,92,53,0.18), inset …`. Line 1: `Tonight 7:30 · ` + check + `Going` (`#FF8A66`). Line 2: title Fraunces 700 15.5px, ellipsis, and at the right a **`Soon` mark**: an 8px ring `border:2px solid #FF8A66` + `Soon` 12px/700 `#FF8A66` (`:42`). `aria-label="Fall Formal room, soon, tonight 7:30 PM, you're going"`.
     - **Maybe card** (`:45-48`): quiet chrome; `Tue 7 PM · ` + 6px grey dot + `Maybe`; title `Open Practice`. `aria-label="Open Practice room, Tuesday 7 PM, you said maybe"`.
3. **Room chips 45px** — section 0.2; `Lounge` active (`:52-57`).
4. **Board strip 44px** + 6px top margin (`:59-64`): an `<a>` to the Board, `margin:6px 12px 0; height:44px; padding:0 10px 0 12px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background:#161515; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04); gap:8px`. Contents: 14px megaphone icon in `#FF8A66` (`:60`); one ellipsised line 12.5px/600 `#CFC8BE`: `<b 800 #F6F1EA>Board</b> · Maya R. · <span #F6F1EA>Formal tonight: doors at 7:30</span>` (`:61`); a 7px coral dot (`:62`); a 13px chevron `#9C958C` (`:63`). `aria-label="Pinned from the Board, unread. Maya R.: Formal tonight: doors at 7:30. Open the Board"` (`:59`).
5. **Lounge thread** (`:66-151`), section 0.2 list chrome, bottom-anchored. Shown, oldest to newest: `Today`; **a poll card** from Devin O. (section 7 describes the card anatomy; this one is the "names shown" poll `Theme for fall formal?` with the viewer's pick `Havana Nights` 7, `Masquerade` 3, `Old Hollywood` 2, header right text `12 voted · names shown`, `:71-115`); Priya S. `Havana Nights. Obviously.` (`:117-120`); Jonah K. `Tabling shifts are up. Grab one.` followed by **a sign-up card** `Tabling shifts` (`5 of 6 filled`; `Mon 11–12` Maya R., Sam T., `Full`; `Tue 12–1` Priya S. + coral `Take a spot`; `Wed 2–3` Devin O., Jonah K., `Full`) (`:122-150`). The sign-up rows here are **34px** (full) / **44px** (with the button) with a fixed 62px label column (`:130-146`) — the compact single-line layout; `W0_Room` uses a two-line 56px layout (section 6).
6. **Composer 64px** — section 0.2; `+` links to `W0_Tray`; placeholder `Message the Lounge` (`:153-159`).

**Where each element gets its data, and the gaps:**

| element | source | gap |
|---|---|---|
| `Salsa Club`, avatar | `SpaceResponse.org.name`, `org.logo_url` (`types.ts:380`) | initials-on-gradient: no colour in the payload |
| `Your hat: Officer` | `viewer.role` (`types.ts:381`) → owner `Owner`, admin `Officer`, mod `Mod`, member `Member` (`contracts.md:46`) | none |
| `48 members` | `org.member_count` (`types.ts:380`) | none |
| "More" button | — | **no target pinned** (leave/mute/report live in today's `ConversationActionSheet`, `MessagesMobile.tsx:2342`) |
| Up next cards | `up_next: EventRef[]` (`types.ts:389`): `title`, `starts_at`, `state`, `viewer_status`, `room_id` | subtitle says `your RSVPs` but `up_next` is "not ended, soonest first, max 3" regardless of RSVP (`contracts.md:528`); a card with `viewer_status` null has no rendering; `Tonight 7:30` / `Tue 7 PM` format not pinned; a card is a link only when `room_id` is non-null |
| chips | `rooms[]` (`types.ts:368-375`): `kind` → label (`lounge` Lounge, `board` Board, `officers` Officers, `event` `event.title`), `unread` → the 7px dot, order as sent (`types.ts:383-386`) | `officers` is in `rooms` only if I can enter (`types.ts:383-386`), so the mockup's `"only officers see this room"` chip for a member cannot occur; a `room` kind chip has no icon pinned; `unread` is shown on Board only in the mockups |
| Board strip | `board_latest: ChatMessage \| null` (`types.ts:387`): `users.name`, `content`; the dot from `rooms[board].unread` | the label says **Pinned** but there is no pin: it is the latest Board post; a card (`kind !== "text"`) has `content` = `cardFallbackContent` (`contracts.md:330`) |
| thread | `messages` oldest first (`types.ts:297-298`); `users.name`, `users.avatar_url`; own message = `user_id === viewer_id` (`types.ts:300`) | date separators not pinned; hidden stubs (D1) render nothing |
| composer | `viewer.can_post` (`types.ts:66-67`); the Lounge is always postable for a member | none |
| the `+` tray | `viewer.can_post` (cards are gated by `can_post_org_channel`, `contracts.md:322`) | none |

## 5. `W0_Board` — inside a club, the Board, Night (`W0_Board:5`)

**Purpose.** Officers' posts, newest first, each with its replies folded under it. **Feeds:** `SpaceResponse` for the chrome (as section 4); `GET /api/me/threads/[boardId]/messages` for the posts — the default club-room read returns **top-level rows only** (`thread_root_id is null`, `routes-map.md:131`); replies come from a second read `?root=<postId>` (limit up to 200, `routes-map.md:105-106`); `viewer.can_post` false for a non-officer, `can_reply` true (`types.ts:64-73`). Reply POST carries `thread_root_id` (`contracts.md` 6.2). The mockup has one prop, `officer` (default true), switching the footer (`:155-160`).

**Layout:** header, Up next and chips as section 4 (`:15-57`), `Board` active, Lounge inactive (`:53-54`). Then:

- **Posts** `<section aria-label="Board posts, newest first">` (`:59`): `padding:8px 12px 0; gap:8px`, top-anchored (no `justify-content:flex-end`), newest first — the reverse of the thread read's oldest-first (`types.ts:298`).
- **Post card** `<article>` (`:60`, `:95`, `:114`): `padding:10px 12px 10px` (open) or `10px 12px 0` (folded); `border-radius:16px; border:1px solid rgba(255,255,255,0.09); background:#161515; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04)`.
  - Byline row (`:61-66`): 28px avatar; name 13.5px/700; **role word** `Owner` / `Officer` 12px/600 `#9C958C`; at the right `New` (with a 7px coral dot, `#FF8A66` 700) ` · ` time `6:12 PM` 12px/600 `#9C958C` (`:65`); or just `Wed` / `Mon` (`:100,119`). `aria-label="New Board post from Maya R., Owner, 6:12 PM"`.
  - Body `<p>` 15px/500 line-height 1.35 `text-wrap:pretty` `#F6F1EA`, `margin-top:6px` (`:67`): `Formal tonight: doors at 7:30 — Campus Center 450.` (non-breaking spaces in the room name), `Open Practice is back Tuesday at 7.`, `Tabling shifts are open. Sign up in the Lounge.`
  - **Replies toggle** (`:68-72`, `:103-111`): a full-width 44px `<button aria-expanded>` with `border-top:1px solid rgba(255,255,255,0.07); margin-top:4px; gap:6px`. Folded: two stacked 18px avatars (`margin-left:-6px; box-shadow:0 0 0 2px #161515`) then `2 replies` 12.5px/700 then a 13px chevron down; open: `3 replies` + chevron up, no avatars. At `margin-left:auto`: a 12px bell-off icon + `Replies stay quiet` 12px/600 `#9C958C`. `aria-label="Hide 3 replies. Replies don't notify anyone."` / `"Show 2 replies. Replies don't notify anyone."`.
  - **Open replies** `role="group" aria-label="Replies"` (`:73-86`): `padding-left:10px; gap:6px`; each row 22px avatar (8.5px initials) + `<p>` 13px/18px `#CFC8BE` with `<b #F6F1EA>Priya S.</b> Is a plus one okay?`, `Maya R.` `Yes, as long as they RSVP first.`, `Sam T.` `See everyone there.`
  - **Reply field** (`:87-92`): `margin:8px 0 0 10px; height:44px; padding-left:14px; border-radius:999px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04)`; input 14px `placeholder="Reply quietly"`, `aria-label="Reply quietly to Maya R.'s post"`; 44×44 transparent send button `color:#9C958C`, `aria-label="Send reply"`.
- **Footer, officer** (`:136-145`; 86px): `padding:8px 12px 12px; gap:6px`; a 16px line 12px/600 `#9C958C` with the megaphone icon: `Everyone in Salsa Club sees this` (`:137`); then the composer row (`+`, field `placeholder="Post to the Board"`, coral send with `aria-label="Post to the Board"`) (`:139-143`).
- **Footer, member** (`:148-150`; 68px): `padding:10px 12px 14px`; a `min-height:44px` tile `padding:10px 14px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background:#161515; 13px/500 #CFC8BE; gap:10px` with the megaphone in `#9C958C` and the sentence **`Only officers post on the Board. You can reply to any post.`** (`:149`). Today's `ConversationView` shows `REFUSAL_SENTENCES.board_officers_only` = `Only officers post here.` in that place (`MessagesMobile.tsx:2117`, `types.ts:117`) — two different sentences for the same state.

**Data and gaps:**

| element | source | gap |
|---|---|---|
| role word | `author_role` (`types.ts:256`) → Owner / Officer / Mod / Member | `null` (no longer a member) has no rendering |
| `New` + dot | — | **no per-post unread field**; `SpaceRoom.unread` / `InboxClub.board.unread` are per room (`types.ts:372,338`); a post's own "new" needs `created_at` vs the viewer's `last_read_at`, which the API never sends (`MessagesMobile.tsx:87-89`) |
| `3 replies` | `reply_count` (`types.ts:254`) | none |
| folded avatars | — | **gap**: the repliers' avatars need the `?root=` read; `reply_count` alone cannot draw them |
| reply rows | `?root=<postId>` read, ascending (`routes-map.md:131`) | none |
| `6:12 PM` / `Wed` / `Mon` | `created_at` | format not pinned |
| footer choice | `viewer.can_post` (`types.ts:66`); `can_reply` true in a Board (`types.ts:68`) | none |
| `Everyone in Salsa Club sees this` | static; club name from `room.org.name` (`types.ts:278`) | none |
| Reply quietly | POST with `thread_root_id`; refusal `thread_root_not_allowed` / `board_post_missing` (`types.ts:121-122`) | none |

## 6. `W0_Room` — event chat v1, Night (`W0_Room:5`)

**Purpose.** An event's chat with the event's facts on top, who's going, the RSVP button, the latest Board post, the thread. **Feeds:** `ThreadMessagesResponse` with `room.kind === "event"`: `room.name`, `room.org` (`OrgRef`), `room.event` = `EventRef & { going: Person[] }` (`types.ts:275-281`: `title, starts_at, ends_at, location, state, room_id, viewer_status, going_count, maybe_count, going` = first 8 by RSVP time, room members only). One prop `state` ∈ `soon | live | after | closed` (default `live`) switches the pill, the bloom and the footer (`:174-183`).

**Layout, top to bottom:**

1. **Header 52px** (`:15-22`): Back (`aria-label="Back to Salsa Club"`), no club avatar, title column `padding-left:4px`: `<h1>Fall Formal</h1>` 20px; under it 12px/600 `#9C958C`: a 14px club dot (gradient) + `Salsa Club · event chat` (`:19`). Right: more (`"More about this event chat"`).
2. **About** `<section aria-label="About this event">` `padding:2px 12px 0` (`:24-58`):
   - Bloom **only when live**: `left:-66px; top:34px; 340×132; rgba(255,92,53,0.46) → 0.16 → 0` (`:27`).
   - **Hero 96px** (`:31`): `padding:10px; border-radius:18px; border:1px solid rgba(255,255,255,0.08); align-items:flex-end`; background = a bottom scrim `linear-gradient(0deg, rgba(12,11,11,0.50), transparent 62%)` over a dotted `repeating-radial-gradient(circle at 100% 0%, rgba(255,255,255,0.07) 0 1px, transparent 1px 15px)` over a warm glow `radial-gradient(150px 90px at 92% 0%, rgba(255,196,128,0.55), transparent 70%)` over `linear-gradient(112deg, #2A0E1E 0%, #6E1F33 42%, #C2452F 78%, #FF5C35 100%)`. **No photo**: the hero is a generated gradient.
   - **State pill** `role="status"` inside the hero, 30px tall, radius 999, `background:rgba(12,11,11,0.62)`, 12.5px/700 (`:32-45`):
     - `soon`: 9px ring `border:2px solid #F6F1EA` + `Soon` + `· starts 7:30 PM` (500, `#E4DDD3`), border `rgba(250,247,242,0.16)`, ink `#F6F1EA` (`:34`).
     - `live`: 7px glowing coral dot + `Live now`, border `rgba(255,92,53,0.60)`, ink `#FF8A66`, `box-shadow:0 0 18px rgba(255,92,53,0.45)` (`:37`).
     - `after`: 14px check-circle icon + `Ended` + `· chat open 7 more days` (`:40`).
     - `closed`: 13px lock + `Closed`, ink `#CFC8BE` (`:43`).
   - **Plans grid** `role="group" aria-label="Plans"`, `margin-top:8px`, 2 columns `gap:8px`, tiles `height:50px; padding:0 12px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background:rgba(22,21,21,0.86)` (`:48-57`): label row 11.5px/600 `#9C958C` with a 13px icon (pin / clock): `Where` → `Campus Center 450`; `When` → `Tonight · 7:30 PM`; values 14px/700 ellipsis.
3. **Who's going** `role="group" aria-label="Who's going: 18 going, 6 maybe"` (`:60-70`): `padding:4px 16px 0; gap:10px`. Five stacked 30px avatars (`margin-left:-8px; border:2px solid #0C0B0B`), `18 going` 14px/700 + `· 6 maybe` 13px/600 `#9C958C`; at `margin-left:auto` the **RSVP button**: 44px hit area around a 34px pill `padding:0 12px 0 8px; border:1px solid rgba(255,92,53,0.50); background:rgba(255,92,53,0.16); color:#F6F1EA; 13px/700` with an 18px coral check disc + `Going`; `aria-label="You're going. Change your RSVP"` (`:69`).
4. **Board strip** (`:72-77`): identical to section 4's, `margin:4px 12px 0`.
5. **Thread** (`:79-154`), top-anchored (`justify-content:flex-start`): a poll card from Maya R. `Carpool from Lot 69 or Hine Hall?` (`Lot 69` 8, picked, `Your pick`; `Hine Hall` 5; footer `13 voted · names shown` with an eye icon) (`:80-113`); Priya S. `Lot 69 pls, Hine is a hike` (`:115-118`); a **sign-up card** `Rides from Lot 69` from Devin O. in the **two-line layout** (`:120-153`): rows `min-height:56px` with the slot label on line 1 (`Leaves 6:45`, `Leaves 7:00`) and the names on line 2; a row that is full ends with `Full`; an open row shows a **dashed 20px circle** `border:1.5px dashed rgba(246,241,234,0.35)` + `2 open` in `#B5AEA4` and the coral `Take a spot` (`aria-label="Take a spot in the ride that leaves at 7:00, 2 spots open"`); footer row `padding-top:8px; border-top` with a **6-segment progress** (84px wide grid, 5px pills, filled `#CFC8BE`, empty `rgba(255,255,255,0.12)`) + `4 of 6 filled` (`:148-151`).
6. **Footer**: open states → the composer with `placeholder="Message the event chat"` (`:157-165`); `closed` → a 44px tile `padding:0 14px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background:#161515; justify-content:center; 13px/500 #CFC8BE` with a 15px lock and **`This chat is closed.`** (`:168`) = `REFUSAL_SENTENCES.room_closed` (`types.ts:118`), the sentence today's `ConversationView` already shows (`MessagesMobile.tsx:2118`).

**Data and gaps:**

| element | source | gap |
|---|---|---|
| title, `Salsa Club` | `room.name` / `room.event.title`, `room.org.name` (`types.ts:277-280`) | none |
| state pill | `room.event.state` (`types.ts:47`; `room-state.ts:5-8`: soon / live / after / closed) | `· starts 7:30 PM` from `starts_at`; **`7 more days`** is a computed count (`ends_at` + 7 d − now, `room-state.ts:30`) that no field carries |
| hero | — | **no cover image in `EventRef`** (`types.ts:41-53`); the gradient is the only rendering |
| Where / When | `location`, `starts_at` | `Tonight` wording not pinned; empty `location` has no rendering |
| avatars, `18 going`, `6 maybe` | `going` (first 8; mockup shows 5), `going_count`, `maybe_count` (`types.ts:50-52,280`) | blocked people are left out of `going` but not of the counts (D1) |
| RSVP button | `viewer_status` (`types.ts:50`); tap → existing `PUT`/`DELETE /api/events/[id]/rsvp` (`contracts.md:352`, `routes-map.md:289`), then re-read | a `maybe` viewer's button and a change-RSVP sheet are not drawn; "You'll appear in the event chat." lives in `campus-home.tsx:10253` (desktop) only |
| Board strip | — | **`ThreadMessagesResponse` has no `board_latest`** (`types.ts:295-308`); the Room would need the space read too, or the strip is dropped |
| thread, composer | `messages`, `viewer.can_post` (false past 7 days, `contracts.md` 6.0 `room_closed`) | none |
| `More` | — | not pinned |

## 7. `W0_Cards` — cards in the chat, Night, 390 × 1100 (`W0_Cards:5,14`)

**Purpose.** The reference sheet for the three card renderers inside a Lounge (chrome as section 4 but **no Up next block**, `:15-34`). Four cards, top to bottom. **Feeds:** `ChatMessage.card` (`types.ts:252`) = `PollCard` (`types.ts:192-206`) or `EventCard` (`types.ts:209`); votes `PUT /api/me/threads/[id]/cards/[messageId]/vote` `{ option_id, on }` → `{ ok, card }` (`types.ts:175-176`); RSVP → `PUT`/`DELETE /api/events/[id]/rsvp` then re-read the message (`contracts.md:352`).

### 7.1 Poll, names shown, viewer has voted (`:39-84`)

- Card `width:292px; padding:10px 12px 9px` (`:41`), `role="group" aria-label="Poll from Devin O.: Theme for fall formal? 12 voted, names shown"`.
- Header line 11.5px/600 `#9C958C`, `gap:6px`: 13px **bars icon** (`M6 20V11M12 20V5M18 20v-6`, stroke `#CFC8BE` 2.6) + `<b #CFC8BE>Devin O.</b> · Poll` (`:42`). (In `W0_Club:74` the same line also carries `12 voted · names shown` at the right; in `W0_Cards`/`W0_Room` that text moves to a footer line.)
- Question 15px/700 line-height 1.3, `margin-top:4px` (`:43`).
- **Options** (`margin-top:2px`): each a full-width **44px `<button aria-pressed>`** with `padding:4px 0` around a **36px** row `padding:0 10px; border-radius:12px; overflow:hidden; gap:7px` (`:45-46`). Inside: an absolute **result bar** from the left, `width:<count/total_voters>%` (58% = 7/12, 25% = 3/12, 17% = 2/12, `:47,59,71`); an 18px **mark** — picked: coral disc `#FF5C35` with an 11px check in `#140806`; unpicked: ring `border:2px solid #6E6862` (`:48,60`); the label 14px/700, and when picked a second line `Your pick` 10.5px/700 `#FF8A66` (`:49`); at the right up to **two 20px voter avatars** (8px initials, `gap:3px`, `aria-hidden`) then the **count** 13px/800 (`#FF8A66` when picked, `#CFC8BE` otherwise) (`:50-54`). Picked row chrome: `border:1px solid rgba(255,92,53,0.50); background:rgba(255,255,255,0.04)`, bar `rgba(255,92,53,0.24)`; unpicked: `border:rgba(255,255,255,0.10)`, bar `rgba(255,255,255,0.07)`. `aria-label="Havana Nights, your pick. 7 votes, including Maya R. and Priya S."`, `"Old Hollywood. 2 votes: Jonah K. and Ava L."` (`:45,69`).
- Footer line `margin-top:4px` 12px/600 `#9C958C`: 13px **eye icon** + `12 voted · names shown` (`:82`).

### 7.2 The viewer's own anonymous poll (`:91-115`)

- Right-aligned (`justify-content:flex-end`), `border-radius:18px 18px 6px 18px`, **no avatar** (`:91-92`). `aria-label="Your anonymous poll: Dues: Venmo or cash? 13 voted"`.
- Header `<b>You</b> · Poll` (`:93`). Options without avatars: `Venmo` 9 picked (`Your pick`), `Cash` 4 (`:96-111`); bars 69% / 31%.
- Footer: 13px **eye-off icon** + `13 voted · anonymous` (`:113`).

### 7.3 Sign-up, single-line layout (`:117-145`)

- `aria-label="Sign-up from Jonah K.: Tabling shifts, 3 of 6 spots filled"`; header 13px **clipboard-check icon** + `<b>Jonah K.</b> · Sign-up` (`:120`); title `Tabling shifts` (`:121`).
- Rows `margin-top:6px`, each `border-top:1px solid rgba(255,255,255,0.07); gap:8px; white-space:nowrap`, label column `width:62px` 12.5px/700 (`Mon 11–12`, `Tue 12–1`, `Wed 2–3`, en dashes) (`:123-138`):
  - full row **36px**: taker chips (20px avatar + name 12.5px/600 `#CFC8BE`) and `Full` 12px/600 `#9C958C` at the right (`:123-128`);
  - row with 1 open **44px**: one taker + a 44px hit area around a **32px coral pill** `padding:0 14px; linear-gradient(180deg, #FF7B4A, #FF5C35); color:#140806; 13px/800` `Take a spot`, `aria-label="Take a spot on Tuesday 12 to 1, 1 spot open"` (`:129-133`);
  - row with 2 open **44px**: dashed 20px circle + `2 open` (`#B5AEA4`), and an **outlined** `Take a spot` (`border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.04); color:#F6F1EA; 700`), `aria-label="Take a spot on Wednesday 2 to 3, 2 spots open"` (`:134-138`). Which row gets the coral pill and which the outline is **not pinned** (the first open row is coral in both `W0_Cards` and `W0_Room`).
- Footer (`:140-143`): `padding-top:8px; border-top`, the 6-segment progress (84px grid, `gap:3px`, 5px pills: filled `#CFC8BE`, empty `rgba(255,255,255,0.12)`) + `3 of 6 filled`. Segments = total capacity; nothing says what happens above 6-10 segments (capacity is 1-50 per slot, up to 10 slots: `contracts.md:296-297,311`).

### 7.4 Event card (`:147-168`)

- `<article aria-label="Event shared by Maya R.: Fall Formal, Campus Center 450, Thursday October 8, 7:30 PM. 18 going, you're going">`, `width:292px; overflow:hidden`, no padding on the article (`:149`).
- **Club band 48px** (`:150-153`): `padding:0 12px; gap:7px`, background = the hero glow + `linear-gradient(112deg, #2A0E1E, #6E1F33 42%, #C2452F 78%, #FF5C35)`; a 22px club avatar with `border:1.5px solid rgba(250,247,242,0.7)` + `Salsa Club` Fraunces 700 14px `#FAF7F2`.
- Body `padding:9px 12px 2px` (`:154-166`): header 13px calendar icon + `<b>Maya R.</b> · Event` (`:155`); `<h3>Fall Formal</h3>` Fraunces 700 **19px**, line-height 1.15, letter-spacing −0.3px, `margin-top:4px` (`:156`); `Campus Center 450 · Thu Oct 8, 7:30 PM` 13px/500 `#CFC8BE`, ellipsis, `margin-top:3px` (`:157`).
- **RSVP row** `role="group" aria-label="Your RSVP"`, `margin-top:10px`, 2-column grid `gap:8px`, two **44px** `<button aria-pressed>` pills 14px/700 `gap:7px` (`:158-161`): `Going` pressed = 18px coral check disc, `border:1px solid rgba(255,92,53,0.50); background:rgba(255,92,53,0.16); color:#F6F1EA`; `Maybe` unpressed = 18px ring `#6E6862`, `border:rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#CFC8BE`.
- Last row `min-height:44px` (`:162-165`): `18 going` 13px/700; at the right a 44px-tall link `Open event chat` + 13px chevron, 13px/700 `#FF8A66`, to the Room.

**Data and gaps (all cards):**

| element | source | gap |
|---|---|---|
| author, `· Poll` / `· Sign-up` / `· Event` | `users.name`; `card.type` (`types.ts:193,209`); `You` when `user_id === viewer_id` | none |
| question / title, options, counts, bars | `question`, `options[].label`, `.count`, `total_voters` (`types.ts:192-206`) | bar = `count / total_voters` is inferred from the numbers, not pinned; multi-choice polls sum above `total_voters` |
| picked mark, `Your pick` | `options[].mine` (`types.ts:185`) | none |
| two avatars | `options[].voters` first two (`types.ts:187`; 12 for a poll, all for a sign-up); `voters_more` unused in the mockups | `Person` has `avatar_url` but the mockups draw initials on colours |
| `names shown` / `anonymous` | `anonymous` (`types.ts:195`) | none |
| `Full`, `2 open`, `Take a spot` | `full`, `capacity - count` (`types.ts:181-183`) | a sign-up slot the viewer already took (`mine`) has no rendering; taking a second slot is allowed (`contracts.md:296`) |
| `3 of 6 filled` | Σ `count` of Σ `capacity` | none |
| **closed poll** (`closed`, `types.ts:203`) | — | **not drawn in any mockup** |
| **cancelled event** (`event: null`, `types.ts:209`) | — | **not drawn in any mockup** |
| **`note`** on an event card (`types.ts:209`; "Add a line (optional)" in `W0_ShareEvent:103`) | — | **not drawn**: the event card has no note line |
| club band | `room.org.name` / `.logo_url` (`types.ts:278`), not `EventRef` | none (cards are club rooms only, `wave-0-decisions.md:23`) |
| `Fall Formal`, place · date | `event.title`, `.location`, `.starts_at` (`types.ts:41-53`) | `Thu Oct 8, 7:30 PM` = `cardFallbackContent`'s format (`contracts.md:330`) |
| Going / Maybe, `18 going` | `event.viewer_status`, `.going_count` | `maybe_count` not shown |
| `Open event chat` | `event.room_id` non-null (`types.ts:49`) | a non-null `room_id` for a `maybe` viewer depends on the RSVP trigger (member with going/maybe, `wave-0-decisions.md:11`) |
| a removed card | `removed` (`types.ts:271`); `hydrateCards` gives a removed message no card (`contracts.md:365`) | rendered by `RemovedContentCard`, section 14 |

## 8. `W0_Tray` — the "+" tray open, Night (`W0_Tray:5`)

**Purpose.** The picker under the composer's `+`. **Feeds:** nothing; it opens one of the three sheets. Behind it the Lounge (chrome as section 4 without Up next, `:15-55`; four bubbles: Devin O. `Formal is Thursday and we still need a theme`, Priya S. `Put it to a vote?`, mine `Good call`, Jonah K. `Also need people to table this week`).

- **Scrim** over the whole screen `rgba(8,7,7,0.5)`, `z-index:1`, `pointer-events:none` in the mockup (`:57`).
- **Tray** `<nav aria-label="Add to the Lounge">` (`:59-90`): in flow above the footer, `margin:0 12px 8px; padding:8px; border-radius:20px; border:1px solid rgba(255,255,255,0.10); background:#1C1A1A; box-shadow:0 -10px 30px rgba(0,0,0,0.55); gap:8px`, plus a 12px rotated-square **tail** at `left:18px; bottom:-7px` pointing at the `+` (`:89`).
  - Caption 20px tall 12px/700 `#B5AEA4`: **`Add to the Lounge`** (`:60`). (Room name dependent; the Board/Room variants are not drawn.)
  - Three rows `min-height:72px; padding:0 10px 0 12px; border-radius:14px; border:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.04); gap:12px` (`:62-87`): a 44px icon disc `rgba(255,255,255,0.07)` with a 20px icon (bars / clipboard-check / calendar-check); title **Fraunces 700 17px** + a 13px `#B5AEA4` line; a 14px chevron. Copy, exactly:
    - **`Poll`** — `Ask the room a question` (`:65-66`)
    - **`Sign-up`** — `Shifts, rides, who brings what` (`:74-75`)
    - **`Event`** — `Share an event with Going / Maybe` (`:83-84`)
- **Footer while open** (`:92-98`): the `+` becomes a **close** button, `border:1px solid #F6F1EA; background:#F6F1EA; color:#0C0B0B`, X icon, `aria-label="Close the tray" aria-expanded="true"` (`:93`); field and send unchanged.

## 9. `W0_NewPoll` — new poll sheet, Night (`W0_NewPoll:5`)

**Purpose.** Builds `CreateCardBody { type: "poll", question, options[{label}], anonymous?, multi? }` (`types.ts:154-162`) for `POST /api/me/threads/[id]/cards` → 201 `{ ok, message }` (`types.ts:172`). Limits: question 1-200 chars, label 1-80, **2-10 options** (`contracts.md:284,296,311`). The mockup keeps `anonymous` / `multi` in local state (`:161-181`).

- Scrim `rgba(8,7,7,0.5)` at `z-index:2` over the Lounge and its footer (`:65`).
- **Sheet** `<section role="dialog" aria-modal="true" aria-labelledby="sheet-title">` pinned to the bottom: `padding:0 16px 20px; border-radius:28px 28px 0 0; background:#161515; border-top:1px solid rgba(255,255,255,0.10); box-shadow:0 -18px 44px rgba(0,0,0,0.6)` (`:67`); a 20px-tall handle row with a **40×5** pill `rgba(255,255,255,0.24)` (`:68`).
- Sheet header (`:70-76`): `<h2>New poll</h2>` Fraunces 800 **25px**, line-height 1.05, letter-spacing −0.5px, SOFT 100 (`:72`); under it 12.5px/600 `#9C958C` with the 14px club dot: `Salsa Club · the Lounge` (`:73`); right: 44×44 close circle (`border:rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:#CFC8BE; margin-right:-6px`), `aria-label="Close"` (`:75`).
- **Question** (`:78-84`, `margin-top:14px; gap:6px`): label `Question` 12.5px/700 `#CFC8BE` (`for="poll-question"`) with a counter at the right `24 / 200` 12px/600 `#9C958C`, `aria-label="24 of 200 characters"` (`:81`); input **48px** `padding:0 14px; border-radius:14px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04)`, 15.5px/600, value `Theme for fall formal?`.
- **Options** `role="group" aria-labelledby="options-label"` (`:86-113`): label `Options`; each row: a 48px `<label>` pill (`padding:0 14px 0 12px; gap:10px`) with an 18px ring `#6E6862` and a 44px input 15px/600 (`aria-label="Option 1"`, values `Havana Nights`, `Masquerade`, `Old Hollywood`), and a 44×44 transparent X button `color:#9C958C; margin-right:-8px`, `aria-label="Remove Havana Nights"` (`:88-108`). Under them a 44px text button `#FF8A66` 14px/700 with a 16px plus: **`Add option`**, and at the right `2 to 10 options` 12px/600 `#9C958C` (`:109-112`).
- **Switches** block `margin-top:6px; border-top:1px solid rgba(255,255,255,0.07)` (`:115-154`):
  - Row 1 `padding:10px 0 8px; border-bottom` : title **`Anonymous`** 15px/700 (`id="anon-label"`) and help **`Off: the room sees who picked what. On: counts only.`** 12.5px `#B5AEA4` (`id="anon-help"`); a `<button role="switch" aria-checked aria-labelledby="anon-label" aria-describedby="anon-help">` 44px tall showing the word `Off`/`On` (12px/700, `#9C958C`/`#F6F1EA`) + a **52×32 track**: off = `border:rgba(255,255,255,0.14); background:rgba(255,255,255,0.08)` with a 26px `#9C958C` knob at the left; on = track `#F6F1EA` with a 26px `#0C0B0B` knob at the right carrying a 13px check (`:118-134`).
  - Row 2 `min-height:56px`: **`Allow more than one answer`** 15px/700, same switch (`:137-153`).
- **CTA** `Post poll` — 50px pill, `linear-gradient(180deg, #FF7B4A, #FF5C35); color:#140806; 15.5px/800; box-shadow:0 6px 16px rgba(255,92,53,0.28); margin-top:10px` (`:156`).
- **Not on the sheet:** `closes_at` (`types.ts:161`) — no field; disabled/invalid CTA state; the 422 `content_blocked` with `field` (`contracts.md:335`); the `invalid_card` refusal (`types.ts:103`).

## 10. `W0_NewSignup` — new sign-up sheet, Night (`W0_NewSignup:5`)

**Purpose.** Builds `{ type: "signup", question, options[{label, capacity}] }` (`types.ts:163-168`). Limits: **1-10 slots**, capacity 1-50, label ≤ 80 (`contracts.md:296-297,311`). Chrome as section 9 (`:65-76`), title `<h2>New sign-up</h2>` (`:72`).

- **Title** field: label `Title` (`for="signup-title"`), 48px input, value `Tabling shifts` (`:78-81`). No counter shown.
- **Slots** `role="group" aria-labelledby="slots-label"` (`:83-117`): label row `Slots` and, right-aligned over a 118px column, `Spots` (`aria-hidden`) (`:84-87`). Each row `gap:8px`: a 48px input 15px/600 (`aria-label="Slot 1"`, values `Mon 11–12`, `Tue 12–1`, `Wed 2–3`) and a **stepper** `role="group" aria-label="Spots for Mon 11–12"` 118×48 pill (`padding:0 1px; border:rgba(255,255,255,0.10); background:rgba(255,255,255,0.04)`) with two 44×44 buttons (`aria-label="One less spot"` in `#CFC8BE`, `aria-label="One more spot"` in `#F6F1EA`) around the number 15.5px/800 (`aria-label="2 spots"`) (`:89-114`). Then `Add slot` (44px, `#FF8A66`, plus icon) (`:116`).
- Helper `<p>` `margin-top:6px; padding-top:12px; border-top` 12.5px/500 `#B5AEA4` with a 14px people icon: **`Names show to everyone in this room.`** (`:119`).
- CTA **`Post sign-up`**, `margin-top:14px` (`:121`).
- Not on the sheet: `closes_at`; a remove-slot button (the poll sheet has one per option; this one has none); min/max at the stepper.

## 11. `W0_ShareEvent` — share an event sheet, Night (`W0_ShareEvent:5`)

**Purpose.** Builds `{ type: "event", event_id, note? }` (`types.ts:169`; note ≤ 200, `contracts.md:346`). Chrome as section 9, `<h2>Share an event</h2>` (`:72`).

- **Upcoming events** `role="radiogroup" aria-labelledby="events-label"`, `gap:8px` (`:78-98`): label `Upcoming events`; each event a full-width `<button role="radio" aria-checked>` `min-height:66px; padding:8px 12px 8px 10px; border-radius:16px; gap:12px`: a **44×48 date tile** (`border-radius:14px; background:rgba(255,255,255,0.07)`: `Oct` 10.5px/700 `#B5AEA4` over `8` 17px/800), title Fraunces 700 16.5px, a 12.5px/500 `#CFC8BE` line `Thu · 7:30 PM · Campus Center 450` / `Tue · 7 PM`, and a 22px mark (coral disc + 13px check when selected; ring `#6E6862` otherwise). Selected chrome `border:1px solid rgba(255,92,53,0.50); background:rgba(255,92,53,0.10)`; unselected `rgba(255,255,255,0.08)` / `rgba(255,255,255,0.03)`. `aria-label="Fall Formal, Thursday October 8, 7:30 PM, Campus Center 450, selected"` (`:81`).
- **`New event`** link, 44px, `#FF8A66` 14px/700 with a plus, and at the right a 12px lock + `Officers only` 12px/600 `#9C958C`; `aria-label="New event, officers only"`, `href="#new-event"` (`:100`). No event-creation screen exists in the phone chat (`POST /api/events` is desktop's, `routes-map.md:301`).
- Note block `margin-top:4px; padding-top:12px; border-top; gap:8px` (`:102-105`): a 48px input `placeholder="Add a line (optional)"`, `aria-label="Add a line, optional"`, 15px/500; then `<p>` 12.5px/500 `#B5AEA4`: **`Members who tap Going or Maybe join the event chat.`** (`:104`).
- CTA **`Share to the Lounge`**, `margin-top:14px` (`:107`).
- **Data:** the event list has no pinned source: `SpaceResponse.up_next` is capped at **3** (`types.ts:388-389`) and the sheet may need every not-ended event of the club; the Room-state rule (event rooms exist from creation, `wave-0-decisions.md:15`) means `event_not_found` (`types.ts:104`) covers an ended or foreign event.

## 12. `W0_EmptyClub` — a brand new club, officer view, Night (`W0_EmptyClub:5`)

**Purpose.** The club space for its owner when the club has no event and one member. **Feeds:** `SpaceResponse` with `org.member_count === 1`, `up_next: []`, `board_latest: null`, rooms = lounge, board, officers (`types.ts:377-390`). This screen's chrome **differs** from the other club screens:

- **Header 64px** (`:15-28`): `padding:6px 12px 0 4px; gap:4px`; Back is a bare 44×44 chevron (no circle, 22px icon, `color:#F6F1EA`) (`:16`); 40px club avatar; title column `gap:4px`: `<h1>Salsa Club</h1>` 20px line-height 1 and **a "hat" chip** 22px tall (`padding:0 9px 0 7px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.05); color:#CFC8BE; 12px/600`) with a 12px podium icon: `Your hat: Owner` (`:21`). Right: a 44px `<button aria-label="People in Salsa Club, 1 member">` with a 24px avatar disc + `1 member` 12.5px/700 (`:24-27`). No "more" button.
- **Up next** (`:30-37`; `padding:8px 16px 12px; gap:8px`): `<h2>Up next</h2>` 16px on an 18px line; a **56px dashed button** `border:1px dashed rgba(255,255,255,0.22); background:rgba(255,255,255,0.03); border-radius:18px; padding:0 14px 0 12px; 14.5px/700` with a 30px plus disc: **`Add your first event`** (`:32-35`); `<p>` 12.5px/500 `#9C958C`: **`Every event gets its own chat for the people going.`** (`:36`).
- **Rooms as a tablist** (`:39-43`): `role="tablist" aria-label="Rooms"`, three `role="tab"` buttons (`Lounge` selected, `Board`, `Officers` with lock and `aria-label="Officers, private"`), pills `padding:0 14px` — unlike the `<nav>` of links with 12px padding on `W0_Club:52-57`.
- **Lounge start** `<section aria-labelledby="lounge-start-heading">` (`:45-75`), bottom-anchored, `padding:0 16px 12px`: `<h2>It's just you so far.</h2>` Fraunces 700 **22px**, line-height 1.15, letter-spacing −0.4px, SOFT 100 (`:46`); `<p>Three things to do before people arrive.</p>` 14px/500 `#CFC8BE`, `margin-top:6px` (`:47`); an `<ol>` (`list-style:none; margin-top:14px; gap:4px`) of three 52px rows (`:48-74`):
  1. **`Post a welcome on the Board`** — a coral gradient row `border-radius:16px; padding:0 12px; gap:12px; color:#140806`, a 28px `#140806` disc with `1` in `#FF8A66` 13px/800, label 15px/800, 16px chevron; `href="#post-a-welcome"` (`:50-54`).
  2. **`Add your first event`** — plain row, 28px ring `border:1.5px solid #6E6862` with `2` in `#CFC8BE`, label 15px/600, `border-bottom:1px solid rgba(255,255,255,0.07)` on the text span, chevron `#9C958C`; `href="#add-an-event"` (`:57-63`).
  3. **`Invite your members`** — same as 2 without the bottom border; `href="#invite-members"` (`:66-72`).
- **Composer** `role="group" aria-label="Write to the Lounge"`, `padding:8px 12px 16px` (`:77-83`): `+` (`aria-expanded="false"`), field `Message the Lounge`, send **disabled** (`aria-disabled="true"; background:rgba(255,255,255,0.07); color:#9C958C`) (`:82`).
- **Data and gaps:** the three link targets are not pinned (the Board composer; event creation is `POST /api/events` on desktop, `routes-map.md:301`; invite = the club page). A **member's** view of an empty club and a club with members but no messages are not drawn. The `1 member` button opens nothing pinned (no roster read in wave 2, `contracts.md:495`).

## 13. How the app styles the phone today (what the new screens sit next to)

All from `src/components/mobile/MessagesMobile.tsx` (4,985 lines, inline styles only, no `className`; `messages-mobile-map.md:325-327`), `src/app/globals.css`, `src/lib/theme/theme.ts`.

### 13.1 Tokens and the theme

- Light (`globals.css:59-68`): `--cream #FAF7F2`, `--charcoal #1C1C1E`, `--ink-2 #5C5853`, `--ink-muted #8A8580`, `--paper #FFFFFF`, `--hairline rgba(28,28,30,0.08)`, `--scrim-rgb 28,28,30`, `--coral #FF5C35`. Extra steps: `--paper-40/55/62/70/72/78/92`, `--cream-92`, `--ink-body #3C3A36`, `--ink-sub #5A564F`, `--ink-faint #A8A39C`, `--ink-prose #2A2620` (`:88-135`).
- Night (`globals.css:146-157,171-195,246`): `--cream #0C0B0B`, `--charcoal #F6F1EA`, `--ink-2 #CFC8BE`, `--ink-muted #9C958C`, `--paper #161515`, `--hairline rgba(255,255,255,0.09)`, `--scrim-rgb 255,255,255`, `--coral #FF5C35`, `--paper-70 rgba(22,21,21,0.70)`, `--paper-92 rgba(22,21,21,0.92)`, `--cream-92 rgba(12,11,11,0.92)`, `--ink-body #E4DDD3`, `--ink-faint #7A746C`. Tailwind's `dark:` follows `[data-theme=dark]` (`globals.css:8`).
- Truth is `<html data-theme="light"|"dark">` (`theme.ts:4-5`), set pre-paint by `THEME_BOOT_SCRIPT` (`theme.ts:100-107`), read by `currentTheme()` (`theme.ts:142-146`), announced by `THEME_EVENT = "vibe:theme"` (`theme.ts:43`); default pref `system` (`theme.ts:25`); the status bar paints `#FAF7F2` / `#0C0B0B` (`theme.ts:36-39`). `MessagesMobile` reads it through `useNightTheme()` = `useSyncExternalStore(subscribeTheme, () => currentTheme() === "dark", () => false)` (`MessagesMobile.tsx:224-235`). Two signals coexist: `night` (theme) and `onDark = !!backdropCss || night` (`messages-mobile-map.md:311-314`).
- **No FONT constant in `MessagesMobile.tsx`**: 36 literal `fontFamily: "DM Sans, sans-serif"` and 20 `fontFamily: "Fraunces, serif"` (grep count). `ReportSheet.tsx:86-87` does declare `const FONT = "DM Sans, sans-serif"; const SERIF = "Fraunces, serif";` and uses them in `RemovedContentCard`.
- **School colours** exist only for the desktop top bar and the LeftNav profile card (`src/lib/iu/school-colors.ts:1-6`): `IU_CRIMSON #990000`, `IU_CREAM #EEEDEB`, `PURDUE_BLACK #000000`, `PURDUE_GOLD #CFB991`, `schoolStripBackground()` (`:44-53`), used by `src/components/nav-identity-chip.tsx:7,82,144,266`. **`MobileShell.tsx` (40 lines) has no school colour and no header**: it only reserves `paddingBottom: calc(64px + env(safe-area-inset-bottom))` on `var(--cream)` (`MobileShell.tsx:32-33`) and leaves each page its own top safe-area (`:15-16`). The mockups use no school colour anywhere; club identity is the club's own gradient/logo.

### 13.2 The list screen today

- Header (`MessagesMobile.tsx:584-640`): sticky, `padding: calc(env(safe-area-inset-top) + 14px) 16px 6px`, background `night ? var(--tabbar-bg) : rgba(250,247,242,0.86)` with `blur(14px) saturate(160%)`, `border-bottom:1px solid rgba(var(--scrim-rgb),0.06)`; `<h1>Messages</h1>` Fraunces **28px / 900**, letter-spacing −0.8px, `var(--charcoal)`; one 40×40 compose button (`border:1px solid rgba(var(--scrim-rgb),0.10)`, bg `night ? var(--paper-70) : rgba(255,255,255,0.78)`). The mockup: 30px/800 wordmark, two 44px buttons, no blur (`W0_Home:15-18`).
- `TabPill` (`:753-808`): `padding:7px 14px; radius 999; border:1px solid rgba(var(--scrim-rgb),0.10)`; active `var(--charcoal)` on `var(--paper)`, inactive `var(--paper-70)` / `var(--ink-2)`; 13px/700; badge 18px `#FF5C35` (or `rgba(255,255,255,0.18)` when active), `99+` cap. Two tabs only, `Tab = "all" | "requests"` (`:212`).
- `ThreadRow` (`:810-951`): `<li><button>` full width, `padding:12px 16px; border-bottom:1px solid rgba(var(--scrim-rgb),0.04)`; avatar **50px** with Fraunces 800 17px initials on `#FFD3C2`, ink `#1C1C1E`, `border:1px solid rgba(255,255,255,0.6)`; title Fraunces 16px 700 (900 when unread) `var(--charcoal)`; time DM Sans 11.5px (`#FF5C35` 800 when unread, else `var(--ink-muted)` 600) from `relativeTime` (`just now`, `5m`, `3h`, `2d`, `Oct 5`, `:282-295`); preview 13px; an 8px coral dot when unread. Previews for empty content: `No messages yet`, `Video`, `Photo`, `Shared a clip`, `Shared a post`, `Attachment` (`:822-834`).
- `ListSkeleton` (`:953-998`): five rows `padding:12px 16px`, 50px disc `rgba(var(--scrim-rgb),0.06)`, bars 55%×14 (`.08`) and 85%×11 (`.05`).
- `EmptyState` (`:1000-1054`): `padding:48px 24px; text-align:center`; title Fraunces 18px/800; body 13.5px line-height 1.55 `max-width:260px`; button `Find people` → `/network`, `padding:9px 18px`, `var(--charcoal)` on `var(--paper)`.
- Re-sync of the list at most every `LIST_RESYNC_MS = 30_000` on visibility (`:372-374`); no polling of messages today (`messages-mobile-map.md:282`).

### 13.3 The conversation today (what the Lounge and the Room reuse)

- `MessageBubble` palette (`:4117-4147`): theirs on cream `rgba(255,255,255,0.88)` ink `#1C1C1E` border `rgba(28,28,30,0.06)`; theirs on dark `linear-gradient(180deg, rgba(20,16,28,0.62), rgba(14,11,22,0.66))` ink `#fff` border `rgba(255,255,255,0.08)`; mine on cream solid `#FF5C35` ink `#fff`; mine on dark a coral-tinted glass; sender name `rgba(28,28,30,0.7)` / `rgba(255,255,255,0.92)`, handle `.42` / `.5`; shadows `0 4px 14px rgba(255,92,53,0.22)` (mine) etc. Notice tiles are dashed (`:4188-4200`). Long-press 500 ms opens the reaction picker (`:4057-4075`), `REACTION_EMOJIS` = ❤️ 👍 👎 😂 🔥 😮 😢 (`:186`). The mockups' bubbles differ: `#161515` on `#0C0B0B` with a `.06` border, mine `#FF5C35` with **`#140806` ink** (not white), radius `18/18/18/6` (section 0.2).
- Composer (`:2124-2270`): `<form>` `padding:8px 12px calc(env(safe-area-inset-bottom) + 10px)`, background `onDark ? rgba(14,11,22,0.72) : rgba(250,247,242,0.96)` with `blur(20px) saturate(160%)`; a 40×40 attach button (hidden when `canAttach` is false, i.e. club rooms — `club_media_off`); `<textarea rows=1>` `min-height:38; max-height:120; padding:9px 14px; radius 18; font-size 16` (iOS zoom guard, `:2224-2226`), `placeholder` = `Message <thread.name>` for `type === "org"` else `Message…` (`:2212`); send 40×40 `#FF5C35` (disabled `rgba(var(--scrim-rgb),0.18)`), paper-plane icon (`:2244-2268`). The mockups: 44px everywhere, a pill `<input>` at 15px, an up-arrow send with the coral gradient (section 0.2).
- The quiet line replacing the composer when `canPost !== true` (`:2085-2122`): `role="note"`, `min-height:44`, `REFUSAL_SENTENCES.board_officers_only` for a Board, `room_closed` otherwise; empty while `canPost === null`.
- `RemovedContentCard` (`src/components/safety/ReportSheet.tsx:658-716`): props `kind: "post"|"comment"|"message"`, `removedAt`, `removedReason`, `compact`; renders nothing without `removedAt`; `padding:14px 16px` (compact `10px 12px`), radius 12, `rgba(var(--scrim-rgb),0.04)`, `border:1px solid var(--hairline)`; copy **`Removed by Vibe moderators`**, the reason, then `Only you can see this <kind>. Questions: help@connectvibe.app.` + a `Community Guidelines` link to `/legal/community`. D9 adds `by: "officer" | "moderator"`; the officer sentence is `OFFICER_REMOVED_REASON = "Removed by a club officer."` (`src/lib/chat/room-rules.ts:31`, matched in `message-read.ts:499`), no appeal link. No mockup draws a removed message.
- Sheets use vaul: overlay `rgba(0,0,0,0.42)` z 1200, content `var(--cream)` radius 20 top, handle 38×4 `rgba(var(--scrim-rgb),0.18)` (`:237-262`). The mockup sheets: scrim `rgba(8,7,7,0.5)`, `#161515`, radius 28, handle 40×5 `rgba(255,255,255,0.24)` (section 9).

## 14. Accessibility rules the contract pins, and what the mockups do

Pinned (`contracts.md:532`): the week strip's Going / Maybe marks differ by **shape and label**, not colour alone; a poll is a **radio group** (checkboxes when `multi`); count changes are announced with `aria-live="polite"`; touch targets ≥ 44px; every new screen in Light and Night at 375px.

What the mockups actually do (a builder keeps the first two, fixes the third):

- **Shape + label**: Going = check icon + the word `Going`; Maybe = a dot + the word `Maybe` (`W0_Home:46,51`); Live = a glowing dot + `Live`; Soon = a ring + `Soon` (`W0_Club:42`); a picked poll option = a check disc, unpicked = a ring (`W0_Cards:48,60`) plus the text `Your pick` (`:49`); a full slot says `Full`, an open one `2 open` (`W0_Cards:127,136`). The day strip's dots are colour-only (coral vs grey, `W0_Home:33-35`) but every day button carries the state in its `aria-label` (`"…Fall Formal, going, live now"`, `"…Build Night, maybe"`).
- **44px targets everywhere**: every button, chip, day, row link and stepper arm is 44px in at least one dimension (`W0_Home:17,30,59`; `W0_Club:16,53,77,139`; `W0_NewSignup:92`); pills inside are 30-36px and the 44px comes from the wrapper.
- **Roles and names**: `role="tablist"`/`tab`/`aria-selected` on the Home filters (`W0_Home:58-62`) and on `W0_EmptyClub`'s rooms (`:39-42`); `<nav aria-label="Rooms in Salsa Club">` with `aria-current="page"` on the club screens (`W0_Club:52-53`); `role="group"` with a full sentence on every card (`W0_Club:73,126`), the plans (`W0_Room:48`), who's going (`W0_Room:60`), the RSVP pair (`W0_Cards:158`), the week cards (`W0_Home:39`); `role="status"` on the event state pill (`W0_Room:32`); `role="dialog" aria-modal="true" aria-labelledby` on the sheets (`W0_NewPoll:67`); `role="switch" aria-checked` with `aria-labelledby`/`aria-describedby` (`W0_NewPoll:121,139`); `role="radiogroup"`/`radio`/`aria-checked` on the event picker (`W0_ShareEvent:78-90`); `aria-expanded` on the `+` and the replies toggle (`W0_Cards:172`, `W0_Board:68`); `aria-disabled` on the dead send (`W0_EmptyClub:82`); every icon `aria-hidden`; every avatar `aria-hidden` with the name in the row's label; the character counter has `aria-label="24 of 200 characters"` (`W0_NewPoll:81`).
- **Deviation to fix**: the poll options are `<button aria-pressed>` (`W0_Cards:45,57`), not a radio group / checkboxes as the contract pins; and **no mockup carries `aria-live`** (`grep -c aria-live W0_*.dc.html` → 0) — the vote counts and `N of M filled` need a polite live region.
- Placeholders always have an equal `aria-label` (`W0_Club:156`, `W0_Board:89`, `W0_ShareEvent:103`); inputs are 15-15.5px in the mockups while the app's composer holds **16px** to stop iOS zoom (`MessagesMobile.tsx:2224-2226`).

## 15. Discord tells to avoid (from `code-map.md:28-29`, `research.md:356`, `wave-plan.md:28`)

Never: the club icon rail, squircle pills, the white active **capsule**, a dashed `+` "Create", a channel rail, `#` and lock-as-channel icons, the copy `Text channels`, `📌 Pinned`, `Message #name`, `+ Channel`, `Pick an org from the rail.`, `Servers`, `Search servers`, `Search channels`, `Discord-style channels`, `Spin up a server…`; uppercase coloured **role chips**; blurple `#5865F2` (today at `campus-home.tsx` CM:2340, 2644); the words channel / server / thread in copy (`contracts.md:48`). In the mockups the role is a plain word (`Owner`, `Officer`, `W0_Board:64,99`) in muted ink, the rooms are round pills without `#`, the lock appears only on `Officers` (a private room, `contracts.md:40`), and "pinned" appears only in an `aria-label` (`W0_Club:59`) — replace that word too. Today's composer placeholder `Message Salsa Club · Lounge` (`MessagesMobile.tsx:2212`) becomes `Message the Lounge` / `Message the event chat` / `Post to the Board`.

## 16. Surprises (facts; each one line)

1. The mockups are **390 × 844**, not 375 (`W0_Home:14`); nothing overflows at 375 but the "Your week" cards and the 292px cards leave 8px less slack.
2. The Light palette's ink `#141416 / #4A4541 / #6B645C` (`W0_Club_Light:14,20,22`) matches no token; Light tokens are `#1C1C1E / #5C5853 / #8A8580` (`globals.css:60-62`).
3. Two sentences for the Board's non-officer footer: the mockup's `Only officers post on the Board. You can reply to any post.` (`W0_Board:149`) vs the shipped `Only officers post here.` (`types.ts:117`, shown at `MessagesMobile.tsx:2117`).
4. The Board shows posts **newest first** (`W0_Board:59`) with a per-post `New` mark (`:65`) that no payload carries; the thread read is oldest first (`types.ts:298`) and unread is per room (`types.ts:372`).
5. The Room's "Pinned from the Board" strip (`W0_Room:72`) has no source in `ThreadMessagesResponse` (`types.ts:295-308`); only `SpaceResponse.board_latest` has it.
6. "Up next" says `your RSVPs` (`W0_Club:34`) but `up_next` is the club's next 3 not-ended events regardless of RSVP (`types.ts:388-389`).
7. The `18 going` on the Home's live card (`W0_Home:41`) has no calendar field; `going_count` lives on `EventRef` only (`types.ts:51`).
8. Not drawn anywhere: a closed poll, a cancelled event card (`event: null`), the event card's `note`, a removed message, a muted club, a `maybe` viewer's Room button, a member's empty club, a Chats/Requests empty state.
9. Poll options are `<button aria-pressed>` and no mockup has `aria-live`, against `contracts.md:532`.
10. `W0_EmptyClub` uses a 64px header, a bare back chevron, a "hat" chip and a `tablist` (`:15-43`) where every other club screen uses 52px, a circled back, a text line and a `<nav>` (`W0_Club:15-57`).
11. Sign-up rows have two layouts: single-line 34/36/44px with a 62px label column (`W0_Club:130-146`, `W0_Cards:123-138`) and two-line 56px (`W0_Room:126-146`); which `Take a spot` is coral vs outlined is not pinned.
12. `Find events` is `#FF8A66` in `W0_EmptyWeek:39` and `#F6F1EA` in `W0_EmptyClubs:39`.
13. The New poll sheet caps the question at 200 and options at `2 to 10` (`W0_NewPoll:81,111`), matching migration B (`contracts.md:284,296`), but neither sheet has `closes_at` though `CreateCardBody` does (`types.ts:161,167`).
14. `W0_ShareEvent` offers `New event · Officers only` (`:100`) with no phone screen behind it; `up_next` (max 3) may be too short a list for the picker.
15. `MessagesMobile.tsx` has **no FONT constant** (36 + 20 literal `fontFamily` strings); `ReportSheet.tsx:86-87` has `FONT` / `SERIF`.
16. `MobileShell.tsx` carries no header and no school colour; school colours are desktop-only (`src/lib/iu/school-colors.ts`, `nav-identity-chip.tsx`).
17. "You'll appear in the event chat." exists only in `campus-home.tsx:10253` (desktop `EVENT_CHAT_LINE`); no wave-2 mockup shows it, and the Event card's Going button (`W0_Cards:159`) has no such hint.
18. The mockups' own-message ink is `#140806` on coral (`W0_Tray:49`); the app's is `#fff` (`MessagesMobile.tsx:4124`).
