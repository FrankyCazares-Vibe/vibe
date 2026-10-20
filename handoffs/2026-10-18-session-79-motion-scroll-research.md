# Session 79 (Oct 18, 2026): the motion pass, per-tab scroll, and the sponsor research

**Session 80: read `2026-10-19-session-79-close-checkin-and-critique.md` first** (event check-in, the
17-item critique, the doc update, the open calls); this file still holds for motion, scroll, research,
the side space, fonts and Tonight. The S78 close (`2026-10-18-session-78-close-and-next-up.md`) still holds for
the older owed items.

**Where things stand.** Main is `d4bffc2`, deployed (Vercel success; the live CSS carries the new press
rule). 3,033 tests. Nothing about what the app collects changed, so no Privacy Policy change.

## Shipped

| Commit | What |
|---|---|
| `49ce2d9` | Each phone tab keeps its own scroll (Campus, People, Otto, profiles); the app motion pass, phone and desktop |
| `d4bffc2` | Research doc: `handoffs/2026-10-18-research-sponsors-greek-athletics.md` |

**The scroll bug Franky reported.** The phone tabs are panes side by side under ONE page scroll, so Feed
read far down left Orgs past the end of its list (blank). `src/components/mobile/use-tab-scroll-memory.ts`
saves each tab's place (sessionStorage, per campus on screen), opens a tab never read at the top, and puts
the page back on return from a post or profile. The open tab now rides in the address (`?tab=orgs`), so Back
reopens it. A swipe switches the tab only when the pager comes to rest. Checked in headless Chromium at
375x812 on the local copy: Orgs opens at 0, Feed comes back at 2,500px, Orgs keeps its own 150px, back
navigation restores, no console errors.

**Motion.** Shared springs in `src/lib/motion/springs.ts` (SNAPPY, SOFT, POP); `Reveal`, `LikeBurst`,
`MotionRoot` (reduce motion follows the device). CSS press: `.vibe-press` / `.vibe-toggle` in globals.css,
a spring sampled into `linear()` (a test fails if it drifts; older Safari gets an ease-out fallback).
- Phone: tab pills slide (hand-driven, not `layoutId`: a sticky strip plus the scroll restore made
  `layoutId` fly in from far down the page), tab bar icons settle, the heart pops with dots, cards and rows
  rise in once (first screenful staggered), empty states crossfade, the post viewer fades and scales in
  inside vaul's slide, new comments rise in, Join/Follow and the action chips press.
- Desktop: tab fills crossfade in place (a slide would hide the labels: inactive text is the fill's
  colour), feed rows and event cards rise in, the heart pops, ModalShell, ConfirmDialog and five other
  modals open on a spring with a fading tint (the blur itself never animates).
- Built by three file-owned agents, then a 14-agent review (7 lens reviewers, skeptics, repairs).

**For Franky's phone (only a real phone can judge the feel):** swipe Feed → Orgs → back after scrolling far
down; tap tabs quickly; like a post; open a post; open a desktop modal. Watch for frosted cards (events,
profile posts) that only pick up their frost once the fade ends; it should be faint.

## The research (Franky asked; ran as a workflow)

Plain-English doc for the three founders, 89 sources, two skeptics' corrections applied (83). Short version:
users first; ask Jaguars athletics and IU Licensing for a written OK for the "What's the vibe tonight?" card
and a Club & Greek Night (aim at January or Winter Homecoming, Feb 7); SAE then other IFC chapters one by one,
with Franky sitting out IFC discussion of Vibe; national HQs and insurers are 2028 at the earliest; local
businesses after real daily users. **The Jaguars publish a live iCal feed** (`iuindyjags.com/calendar.ashx/
calendar.ics?sport_id=0`, men's basketball `sport_id=1`); Sidearm's terms want written permission for
commercial use, so the card stays off until athletics says yes in writing.

An empty Claude Docs doc was created for it (https://claude.ai/artifact/RuwML2Wak7RDeDGfTvjXQs); filling it
was blocked by the permission check. Ask Franky: fill it, or delete it (his call).

## Next (Franky's order, Oct 18)

1. **Choose what goes in the desktop feed's empty side space and the "What's the vibe tonight?" card**,
   with the research in hand. Mock first.
2. The pipeline tracker when Franky gives the detail; security wave 4; feed speed second half.

## Small leftovers

- `LikeBurst` callers in `campus-home.tsx` (two) and `PostViewerMobile.tsx` pass only `liked`, so a refused
  unlike that flips the heart back on pops it. Pass a `burst` counter like CampusMobile's FeedCard.
- The static profile (`public/html/_postViewer.js`) has none of the motion; it's a hand twin.
- Testing note: the built-in Browser pane, when the session isn't on screen, runs no animation frames and
  fires no scroll events. Use headless Chromium from gstack's `playwright-core` with
  `handoffs/chat-redesign/wave-1-build/tools/cookie.mjs <name>` for the local seed cookie.

## Later the same night (Oct 18-19): mockups picked, fonts fixed

**Side space + tonight card.** Canvas: https://claude.ai/artifact/TcM2bx35HJuD6ydt2kuchA (Round 1 = four
options A-D; Round 2 = what Franky reacted to). Sources and renders in `handoffs/2026-10-18-side-space/`
(BRIEF.md, ROUND2.md). **Franky's picks:** desktop = **C2** (both sides, each in its own framed panel,
the feed stays centered); phone = **A's card on Feed that opens C's sheet**; and **yes, the same Tonight
section at the top of Events** (phone and desktop, All · School · Clubs chips). He asked for the desktop
Events Tonight block to be a bit smaller (done on the board: 28 → 22px title, tighter).
The ranking rule we proposed (not yet confirmed in words, but he liked the boards drawn on it): the card
is about SCHOOL events (sports and non-sports equal); #1 = the school's one featured pick of the day if
any ("Featured by your school"; founders set it until a school signs on), else the soonest school event
that hasn't ended, a live one first; then the other school events, then club events (counts only, 5+).
Never ranked by popularity, never paid. **Open question for Franky:** does a pin hold #1 while another
school event is live? (Boards: the pin holds, the live one shows "Happening now".)
Data: the Jaguars' iCal feed and IU's LiveWhale group feeds (events.iu.edu/live/ical/events/group_id/N);
both need the office's written OK before the card ships (research doc). Not built yet.

**Fonts (`5d3ddc6`, live).** One Google link in `src/lib/theme/fonts.ts` (GOOGLE_FONTS_HREF), pasted
byte-identical into profile.html, messages.html and onboarding.html (`fonts.test.ts` fails on drift).
Franky's picks: **all Fraunces titles soft** (SOFT 100 pinned, same bytes) and **coral accent words
upright** at the title's weight. The logo is a 1.4 KB face `public/fonts/vibe-wordmark-v1.woff2`
(opsz 144, SOFT 100, 900; class `.vibe-wordmark`, token `--font-wordmark`); a re-cut ships as -v2.
`font-synthesis-weight: none` everywhere; static pages now get real Bold/ExtraBold and DM Sans buttons;
JetBrains Mono loads only on the landing; auth arrows are SVG (`src/components/brand/Arrow.tsx`).
Left for later: other symbols DM Sans lacks (⌄ ⋯ ✓ ↗ ▶ ❤ ↻, the orgs/plus arrows) still draw one glyph
from a system font; the admin map wasn't renderable with seed accounts; Safari/iPhone not yet checked
(old iOS before 16.4 still fakes bold, same as before); the logo face uses font-display block with no
preload, so on a very slow connection the login logo can be invisible for a moment.

## Built and live (Oct 19): Tonight + Your clubs (`5248efe`)

Contract and maps: `handoffs/2026-10-19-tonight-build/` (CONTRACT.md is the source of truth; §7 lists
what v1 leaves out). Franky turned the school and athletics part ON (Oct 19), against the research's
"get written OKs first": the email to athletics and IU Licensing is still worth sending.
- `GET /api/school-events` (signed in; 401 signed out, checked live): Jaguars iCal (home games only),
  IU LiveWhale group 24 (Student Affairs, filtered) and 342 (Featured, empty today, drives "Featured by
  your school"). Server fetch cached 2 h, 4 s timeout, never 500s. Budget `schoolEventsRead` (day window).
- Off switch: env `SCHOOL_EVENTS_OFF` (`true` or a list of keys; next deploy) or the `app_settings` row
  `school_events_off` (30 s; a production write, so ask Franky). Shipping wrote no row.
- Desktop Feed: `src/components/campus/tonight/FeedSideLayout.tsx` (C2): "Your clubs" left, Tonight right,
  folds 1100-1399, hidden under 1100. Phone: `TonightCard` above "today." opens `TonightSheet`.
  Events: `TonightSection` + `EventFilterChips` (All · School · Clubs), school cards in Coming up.
- Each surface sits in `QuietBoundary` (renders nothing on a crash; the app has no error boundary).
- Checked locally in headless Chromium (real calendars, fake clock `?tonight_now=` in dev only) at
  390, 1280, 1440, 1920, Night and Light; no console errors. NOT checked: signed in on production, a real
  iPhone (sheet scroll, VoiceOver), Safari.
- Open for Franky: does a school pin hold #1 while another school event is live (built: the pin holds)?
