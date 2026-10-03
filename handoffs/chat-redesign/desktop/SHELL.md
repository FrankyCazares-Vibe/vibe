# SHELL: Layout A, desktop Messages (from project/D_A_Club_Night.dc.html)

Copy the hero file, rename it, change `<title>`, then replace regions. Keep the head, helmet (it carries `input::placeholder{color:#9C958C;opacity:1}`), root and closing script as they are.

## Frame (1440 x 900, measured)
Root: flex row, `position: relative; isolation: isolate; overflow: hidden; background: #0C0B0B`.
| region (data-region) | x | y | w | h | notes |
|---|---|---|---|---|---|
| bloom | 0 | 0 | 1440 | 900 | first child, `z-index: -1`, two radial corals (top-left faint 520 x 420, bottom-left main 300 x 520). It stays inside the nav: the inbox is flat. Never add a second bloom. |
| nav | 0 | 0 | 200 | 900 | padding 22/14. Items 40 tall, radius 12, gap 3, type as live (`src/components/LeftNav.tsx`). Profile card 108. `nav-calendar` 172 wide (My Calendar stays). |
| inbox | 200 | 0 | 340 | 900 | 1px hairline left and right (inner 338). |
| inbox-header | 201 | 0 | 338 | 121 | title row exactly 64 tall (title 26px and New pill centred on y 32, level with the club mark and the room-header hairline at y 64); search field y 72 to 110, 38 tall. Placeholder is "Search" (it filters the list; there is no message search). |
| week | 201 | 121 | 338 | 168 | title row 28 (title button with a 12px chevron-down, then two 28px arrows), day strip 44 (7 x 44), `week-chips` (142 x 64 chips, gap 8). |
| filters | 201 | 289 | 338 | 45 | border-top hairline; chips 30 tall. |
| rows | 201 | 334 | 338 | 566 | padding 4/8; person row 63, club row with event chip 90; text starts 66px in. |
| room (main) | 540 | 0 | 900 | 900 | column: room-header, then a flex row of room-body + details. |
| room-header | 540 | 0 | 900 | 64 | spans the middle AND details; `position: relative`; border-bottom hairline. The two 36px round buttons sit in a box pinned `position: absolute; right: 16px; top: 14px` (`details-toggle` is the last). |
| room-title | 540 | 0 | 600 | 63 | first child of room-header, as wide as room-body (600 with details open, 900 closed). Holds one row `width: 100%; max-width: 728px; margin: 0 auto; padding: 0 24px` with the 40px mark and the title, so the header shares its left edge (x 564) with chips, strip, thread and composer. |
| room-body | 540 | 64 | 600 | 836 | column, `align-items: center`. Each child is `width: 100%; max-width: 728px; padding: 0 24px` = a 552px reading column now, 680px when details is closed. |
| chips | 540 | 64 | 600 | 50 | order as on the phone: Lounge, Board, (Officers), event chats. |
| board-strip | 540 | 114 | 600 | 46 | the strip itself is 44 tall, radius 16. It is the ONLY copy of the latest Board post in the room. |
| thread | 540 | 160 | 600 | 672 | bottom-anchored (`justify-content: flex-end`), gap 8, 14px top fade. |
| composer | 540 | 832 | 600 | 68 | "+" 44, field 44, send 44. |
| details | 1140 | 64 | 300 | 836 | border-left hairline, padding 18/20, section gap 22. Holds `details-upnext` (the next event as a flat card with RSVP, then one quiet 52px card for the event after it, as the phone's Up next shows two) and `details-members` (one row, 62 tall). The space under them stays empty. |
Extra hooks: `row-selected`, `msg-poll`, `msg-hover`, `msg-mine`, `details-toggle`, `room-title`.

## Tokens (Night)
- page `#0C0B0B` · paper (bubbles, cards, fields) `#161515` · raised circle `rgba(22,21,21,0.86)` · hover toolbar `#1F1D1D`
- ink `#F6F1EA` · ink-2 `#CFC8BE` · muted `#9C958C` (never dimmer for text, placeholders included; out-of-month dates `#8A847C`)
- coral `#FF5C35` · coral text `#FF8A66` · coral button `linear-gradient(180deg, #FF7B4A, #FF5C35)` with ink `#140806`
- hairlines: columns and fields `rgba(255,255,255,0.10)`, row separators `0.07`, inactive chip border `0.12`, bubble border `0.06`, card border `0.08`
- active chip / today: bg `#F6F1EA`, ink `#0C0B0B`
- selected inbox row: `background: rgba(255,255,255,0.07); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); border-radius: 14px`
- hovered message: NO band behind the row. Only the bubble border lifts to `rgba(255,255,255,0.12)` and the toolbar pill appears beside the bubble (34 tall, `#1F1D1D`, border `0.12`, shadow `0 8px 20px rgba(0,0,0,0.5)`).
- live glow, ONE per screen, on the week chip only: bg `linear-gradient(120deg, rgba(58,22,20,0.96), rgba(30,20,19,0.96))`, border `rgba(255,92,53,0.55)`, shadow `0 0 0 3px rgba(255,92,53,0.08), 0 6px 18px rgba(255,92,53,0.30)`, haloed dot.
- Up next card in details is FLAT even when live: bg `#161515`, border `rgba(255,255,255,0.08)`, `inset 0 1px 0 rgba(255,255,255,0.04)`, plain 7px coral dot, coral "Live now" label, the Going button.
- your own bubble: `linear-gradient(180deg, rgba(255,92,53,0.30), rgba(255,92,53,0.14)), #161515`, border `rgba(255,92,53,0.32)`, radius `18px 18px 6px 18px`
- radii: pills and discs 999 · event chip, card, bubble 18 (tail corner 6) · Board strip and Board post 16 · row 14 · nav item, search, poll option 12
- club marks: Salsa `#C23A72,#962858` · Film `#8A6A22,#664C14` · Jag `#1F7580,#155158` (145deg)
- faces (bg / ink): MR `#5A3A2E/#FFD3C2` · DO `#2E4A5A/#CFE6F2` · JK `#5E4A2A/#F5E1B8` · PS `#4A3A5E/#E6D8F5` · ST `#2A4550/#CFE6F2` · AL `#2F4A3A/#CDEBD9` · you (FC) `#3A3432/#F6F1EA`
- small text links ("See all", "Open event chat", the Your week title): `min-height: 28px; display: inline-flex; align-items: center; padding: 0 6px; margin: 0 -6px`

## Type
Fraunces (always with `font-variation-settings: 'SOFT' 100` on titles): wordmark 22/900 · Messages 26/800 · room name 20/800 · club row name 16.5/800 · section titles (Your week, Up next, Members) 16/700 · event title 15.5/700 (19 on the first Up next card) · My Calendar 12/700.
DM Sans: person name 15/700 · bubble 14.5/1.35 · nav items 14 (500, active 600) · preview 13.5 · chips 13/700 · meta, times 12/600 to 700 · sender name in bubble 11.5/700 · date divider 11/600 · nav calendar: month 11/700, weekday letters 8/800, days 10/600 (today 800).

## Thread parts
- Their message: face 28 + bubble (`max-width: 320px`, paper, radius `18 18 18 6`), sender name inside, row `align-items: flex-end; gap: 8px`.
- Yours: no face, `align-self: flex-end` (copy `msg-mine`).
- Cards stay phone-size: 292px wide (copy `msg-poll`). Never stretch a bubble or card.
- Hover: copy `msg-hover` (toolbar pill only: react, reply, "..."), to the RIGHT of someone else's bubble, to the LEFT of your own. Draw it on ONE message per board. The "..." menu holds Report (and Remove for officers and mods).

## Members in details
One row, never a roster: "Members" + the count, "See all" (goes to the club page), then five overlapping 28px faces, officers first (`margin-left: -5px`, ring `box-shadow: 0 0 0 2px #0C0B0B`, initials 9.5px). No role headers, no names, no "+N more".

## Making another state
- **Details closed:** delete the `<aside data-region="details">` and set `room-title` to `width: 900px`. room-body becomes 900 wide, the reading column caps at 680 and everything (mark, chips, strip, thread, composer) starts at x 650 and ends at x 1330. On `details-toggle` set `aria-pressed="false"`, `aria-label="Show details"`, border `rgba(255,255,255,0.10)`, background `rgba(22,21,21,0.86)`, color `#CFC8BE`.
- **The Board:** keep room-header and chips, move the cream pill to the Board chip (drop its dot), remove `board-strip`, replace `thread` and the composer placeholder.
- **An event chat (decided, do it this one way):** keep the club's room-header and the chips exactly as they are and move the cream pill to the event chip. The active chip is the trail: no second header, no "Club > Event" line. Between `chips` and `board-strip` add the event banner (the phone's, with its state pill); keep `board-strip` (the phone's event chat keeps it); replace `thread`; composer placeholder "Message the event chat". Replace `details` with Where, When, who's going, RSVP, and draw event chats with details open.
- **A DM or group chat:** move the `row-selected` styles to that person's row (set its and the row above's `border-bottom` colour to transparent, restore Salsa's and Orgo's to `rgba(255,255,255,0.07)`), replace the mark and title inside `room-title`, everything in `room-body` (no chips, no Board strip; today's desktop thread look) and `details` (the person).
- **Officer view:** header line "Your hat: Officer", add the Officers chip (lock icon, see phone board W0_Club) after Board, and add the "Manage club" button as the last child of `details` with `margin-top: auto` and 18px under it.
- **Dialog (a phone sheet):** add as the LAST child of the root: a scrim `position: absolute; inset: 0; background: rgba(8,7,7,0.5)` holding a centred dialog (paper, radius 20, hairline). Leave everything under it untouched.
- **Month popover:** last child of the root, `position: absolute`, anchored under the Your week title (left 216, top 157), about 308 wide; no scrim.
- **"+" tray:** a small menu sitting 8px above the "+" button with its left edge on the "+" button's left edge (x 564 with details open, x 650 closed; bottom 70): Poll, Sign-up, Event.
- **Light:** page `#FAF7F2`, paper `#FFFFFF`, ink `#1C1C1E`, ink-2 `#5C5853`, muted `#5A564F` (placeholder rule too), hairline `rgba(28,28,30,0.08)`, chip and card border `rgba(20,20,22,0.12)` / `0.10`, coral text `#C8401E`, active chip `#141416` with ink `#FAF7F2`, live week chip `linear-gradient(120deg, #FFE9E0, #FFFFFF)` with border `rgba(255,92,53,0.55)`, picked poll bar `rgba(255,92,53,0.16)`, scrim `rgba(20,20,22,0.35)`, face ring `#FAF7F2`, your own bubble solid `#FF5C35` with white ink; same bloom at about two thirds strength. Take the rest from W0_Club_Light and ref/today-desktop-messages-light.png.

## Do not
No server rail, no "#" names, no role-grouped member list, no second copy of the Board post in details, no second glowing card, no highlight band behind a hovered message, no typing dots or "Read" in club rooms, no unread counts on room chips (the Board dot only), no online dots, no pinned messages, no room search, no caption beside the Your week title (the chevron is the only addition).
