# Brief: the desktop feed's side space, and "What's the vibe tonight?" (Oct 18, 2026)

Franky asked for mockups to pick from. Two asks, from his own words:

1. **Desktop main feed side space** (from the Kaki meeting): "incorporate more on the main feed desktop side
   of things, we have a lot of empty space on the side we could utilize." Today (ref/desk-1440-*.png): a
   200px left nav, then the feed as a centered 672px column; at 1440 wide about 280px is empty on each
   side, far more at 1920 (ref/desk-1920-light.png). The Otto orb floats bottom right (64px disc, 24px in)
   and the mini messenger opens there: a rail must leave that corner clear or take Otto's place on purpose.
2. **"What's the vibe tonight?"**: the school's athletic events this week or tonight, at the very top or to
   the side of the Campus feed, in Events, or both: **who's playing who, where, and what time. No chats in
   it.** On the phone, a compact card above the feed or in Events.

Kaki's lens (Franky's mentor, keep it): orgs running themselves through Vibe deserve priority; keep it
simple; campus-first; every feature must make the campus experience better. Users before monetization: no
ads, no sponsors in these mocks.

## Real data to use (no lorem ipsum, no invented stats)

- The Jaguars publish a live calendar. Mock "tonight" as **Saturday, Nov 7, 2026**: men's basketball vs
  UT Martin, 5:00 PM, home. Earlier that week: women's basketball vs SIUE, Thu Nov 5, 6:30 PM (home);
  volleyball home match Fri Nov 6 (evening, time [TIME]); men's basketball vs Southern Indiana, Wed Nov 11,
  6:30 PM (home). Venue: the new arena, "James T. Morris Arena". Plain text only: team names, time, place.
  **No logos, no school marks, no "Jaguars" wordmark styling.** Write the home team as "IU Indy".
  A "Tickets" link and a "Watch on ESPN+" link are fine as plain text links (no ESPN logo).
- Clubs: fictional sample clubs only: Salsa Club (mark `#C23A72,#962858`), Film Society (`#8A6A22,#664C14`),
  Climbing Club (`#1F7580,#155158`), plus neutral invented ones if needed (Robotics Club, Chess Club, Indy
  Hiking). Never a real campus group's name, and never a club name with "Jag" or "Jaguar" in it (that word
  is IU athletics only).
- People: initials only (MR, DO, JK, PS, ST, AL) and first names; the viewer is "Franky C." (FC).
- The campus is "Indianapolis" (IU + Purdue, one community). The header is the diagonal crimson/black bar
  exactly as live.

## Privacy rules (the Privacy Policy is a promise; the mocks must not imply new data)

- "Going" is a COUNT, never names or faces of who is going. A count under 5 is not shown at all ("<5"
  floors): show counts like "38 going", or nothing.
- Nothing about where a person is. No "friends at the game". No live location.
- Club announcements come from the club's Board (followers read the Board; members take part).
- Suggestions ("clubs to follow") come from public club info, not from tracking.

## The look (match the live app exactly; tokens below are from handoffs/chat-redesign/desktop/SHELL.md)

Night (default for every board): page `#0C0B0B`, paper `#161515`, ink `#F6F1EA`, ink-2 `#CFC8BE`, muted
`#9C958C` (never dimmer for text), coral `#FF5C35`, coral text `#FF8A66`, hairlines `rgba(255,255,255,0.10)`,
card border `rgba(255,255,255,0.08)`, ONE soft coral bloom from a corner (radial, behind everything).
Light: page `#FAF7F2`, paper `#FFFFFF`, ink `#1C1C1E`, ink-2 `#5C5853`, muted `#5A564F`, hairline
`rgba(28,28,30,0.08)`, card border `rgba(20,20,22,0.10)`, coral text `#C8401E`, same bloom at ~2/3.
Type: Fraunces (titles, always `font-variation-settings: 'SOFT' 100`), DM Sans (everything else); load both
from Google Fonts css2 in `<helmet>`. The live campus header: crimson `#990000` left with cream `#EEEDEB`
text, a diagonal seam with a gold `#CFB991` line, black `#000` right holding the tab pills (Feed active =
gold fill `#CFB991` with near-black text). Radii: pills 999, cards 18, rows 14, nav items 12.
The live sources, read them for exact values: `src/app/campus/campus-home.tsx` (CampusTopBar ~5543,
FeedTabBody ~6933, FeedRow ~7850, EventCard ~10437), `src/components/LeftNav.tsx`, `src/components/campus/RollingStrip.tsx`
(the "today." strip at the top of the feed: RSVP'd events + trending tags; the tonight card must not
duplicate it), `src/components/mobile/CampusMobile.tsx` (the phone feed), `src/app/globals.css` tokens.

Franky's motion rules (for any motion note): springs, transform and opacity only, no blur, reduce motion.

## Board files (the Design canvas format)

- Work ONLY in `/Users/franciscocazares/vibe/handoffs/2026-10-18-side-space/project/`. `support.js` there is
  the canvas runtime: every board's head line is exactly `<script src="./support.js"></script>`.
- Format rules: `FORMAT.md` in this folder (read it all before writing a board). The skeleton and the rules
  that fail silently are in `BOARD-RULES.md`.
- Desktop boards are PAGES: fluid root (no px width on the root; `max-width` containers, flex/grid),
  `$preview` 1440x900, and they must also look right at 1920x1080 and 1280x800. Phone boards are fixed
  390x844 roots.
- Every board has a `night` boolean tweak (default true) that switches the whole board to Light; no other
  tweaks unless they are real levers.
- Accessible as drawn: real `<button>`, `<a href>`, `<input>`+`<label>`; `aria-label` on icon-only buttons;
  icons are inline stroke SVG (never emoji); text contrast 4.5:1.
- Render to check your work: `node render.mjs <Board.dc.html> [w] [h]` (from this folder) writes
  `shots/<Board>.png`; one "Fetch API cannot load file://" console error is normal. Look at the PNG with
  your Read tool. Render desktop boards at 1440x900 AND 1920x1080 (rename the second shot
  `shots/<Board>@1920.png`), phone boards at 390x844.
