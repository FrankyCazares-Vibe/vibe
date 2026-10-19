# Round 2 (Oct 18, 2026): Franky's notes on round 1, and what to draw

Franky: "I like A and C, maybe if C had a bit more separation or graphic element so that it doesn't feel like
it's bleeding into the main feed. I like how on the right it has the school's sporting events, but also keep
in mind non-sporting school events. Do we always want sports at #1? Do we want schools to decide what they
want as #1? I like how it looks on A mobile, and how it opens on C mobile. Should we make these events show
up in the Events page too?"

## The rule we are proposing (draw it; the boards must make it visible)

"What's the vibe tonight?" is about SCHOOL events (sports and everything else the school runs), not only
sports. Club events stay under it as "Also tonight from clubs". The #1 slot is chosen like this:

1. **Featured by the school.** The school's official account (a verified office such as Student Involvement
   or Athletics; Vibe's founders until a school signs on) may pin ONE event per day. It is labeled
   "Featured by your school" in small muted text, so the pick is honest. Never paid, never a club.
2. **Otherwise, what's next.** The school event that starts soonest and hasn't ended. One that is on right
   now ("Happening now", a quiet coral dot) leads. Sports and non-sports are equal.
3. **The rest** follow under "Also tonight": school events first, then club events (counts only, 5+).

Never ranked by popularity. A school event carries a small text tag "School event" (never a logo or a
school mark) and its host office ("Student Involvement", "Athletics"). Sports lines still read "IU Indy vs
UT Martin" with the sport, time and place.

## Sample content (Sat, Nov 7, 2026). The games are real; the non-sport school events are SAMPLES

- Men's basketball, IU Indy vs UT Martin, 5:00 PM, James T. Morris Arena, Athletics (real; "38 going").
- Sample: "Herron student art show opening", 6:00 PM, Eskenazi Hall, Herron School of Art + Design
  ("21 going").
- Sample: "Late Night at the Campus Center", 9:00 PM to midnight, Campus Center, Student Involvement
  (free food, games; "64 going").
- Club events tonight (fictional clubs): Climbing Club "Bouldering night" 8:00 PM, Rec Center, 12 going;
  Chess Club "Blitz night" 9:00 PM, University Library, 6 going.
- This week at the arena (real): Thu Nov 5 women's basketball vs SIUE 6:30 PM; Fri Nov 6 volleyball home
  match [TIME]; Sat Nov 7 men's basketball vs UT Martin 5:00 PM; Wed Nov 11 men's basketball vs Southern
  Indiana 6:30 PM. Past days read as past (muted, "Final" without a score is fine, or simply dimmed).

## The boards to draw (new files; never edit the round-1 boards)

- `C2_Desk.dc.html`: concept C ("Both sides", feed exactly centered) with clear SEPARATION from the feed.
  Today the side columns sit straight on the page and read as part of the feed. Give each side its own
  surface or frame (e.g. a paper panel with a hairline and the app's 18px radius, or a quiet tinted column
  with a hairline divider), and one small graphic element that marks the "tonight" side as its own thing
  (the logo's open orbit mark, the coral dot, a soft top glow: pick one, keep it calm). Default rule: the
  game leads (soonest at 5:00 PM). Show Also tonight with the two sample school events and the two club
  events.
- `C2_Desk_Featured.dc.html`: the same board with rule 1: the school pinned "Late Night at the Campus
  Center" (labeled "Featured by your school"), so it leads and the game is second. Same layout.
- `A2_Desk.dc.html`: concept A (right rail) with the same content and labels as C2_Desk, plus A's "Your
  clubs" Board lines. A already reads as separate cards; keep that.
- `P2_Card.dc.html`: phone Feed with A's compact card above the "today." strip, now generic: the #1 item's
  title, time, place, count, plus a quiet "+3 more tonight" and a chevron. Tapping it opens the sheet.
- `P2_Sheet.dc.html`: the same phone screen with C's half-height sheet open from that card: "Tonight · Sat,
  Nov 7" with the #1 item big (Going button, Tickets / Watch on ESPN+ only for the game), then Also tonight
  (school events then club events), then "This week at the arena". No chats.
- `P2_Events.dc.html`: the phone EVENTS tab. Yes, these events show in Events too, from the same source so
  Going stays in sync: a "Tonight" section at the top in the same order as the card (school events with the
  "School event" tag, then club events), filter chips "All · School · Clubs" (All on), then "Coming up" with
  the live EventCard look.
- `D2_Events.dc.html`: the desktop Events tab (Events pill active in the top bar; read EventsTabBody and
  EventCard in src/app/campus/campus-home.tsx): the same "Tonight" section and chips at the top, then the
  live "What's coming up" grid.

All rules from BRIEF.md and BOARD-RULES.md still hold (Night default with the Light tweak, fluid desktop
PAGE at 1440x900 that works at 1280 and 1920, phone 390x844, counts only and 5+, no logos, no chats, the
Otto corner clear on desktop feed boards).
