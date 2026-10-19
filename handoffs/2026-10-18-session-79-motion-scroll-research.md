# Session 79 (Oct 18, 2026): the motion pass, per-tab scroll, and the sponsor research

Read this first in session 80. The S78 close (`2026-10-18-session-78-close-and-next-up.md`) still holds for
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
