# Phone tour fixes and first light (Sat Oct 24, 2026, evening)

Franky tried Deploy A and said, roughly: on a phone the feed bubble's Next wouldn't take a tap because of the
scrolling, the highlights looked a little off, and "I'm Otto" sat next to the + button. Then his vision for both
devices: "once you join, all you see is Otto", and as the tour goes the feed bursts into existence, then the
left side (the announcements board, Your clubs), then the right side (school and club events, Tonight).

## 1. Bug fixes (main 16be4ba, live)
- **Next on phones:** the tour engine (`public/html/_otto-tour.js`) re-ran the whole step on every scroll event,
  scrolling again and rebuilding the bubble, so the Next button was replaced under the finger. Now scrolling,
  resizing and a target changing size only move the spot and the bubble; each step renders once.
- **Highlights:** a step scrolls only when its target is off screen (a target taller than the screen only needs
  its top in view), smooth unless reduced motion is on; the spot is clipped to the screen (the phone's feed made
  a 1,800px spot) and follows its target as it grows (ResizeObserver, visualViewport, two settle re-measures).
- **"I'm Otto" by the +:** the phone's + is hidden while a tour runs (`body.otto-tour-active`), and the first
  bubble says "That's me down here, the otto tab".
- Checked: a phone tap on Next after scrolling lands on the same button; the computer campus tour and the static
  profile tour (same engine) still run.
- **a0b83e5:** an open dialog hides the phone's tab bar, so a phone step whose target isn't drawn is now skipped
  (no "the otto tab" bubble pointing at nothing).

## 2. First light (main eb5006a, plus a0b83e5; live)
- **Order is Franky's (Oct 24 evening):** Otto, then the feed, then the left (Your clubs), then the right
  (Tonight). This replaces PLAN.md's "Tonight then Your clubs" (Q2). At 1100-1399px the clubs strip and Tonight
  share the right column and come in one after the other; under 1100px the clubs bubble points at the tabs and
  "Show me clubs" opens Orgs. Where Tonight is on screen the tour ends there with "Got it".
- **Phone:** the Otto tab, then the feed, then the Tonight card (when something is on), then the tabs.
- **How:** `src/lib/tour/first-light.ts`. A script before the first paint (root layout, beside the theme script,
  with the nonce) marks `<html data-first-light="feed clubs tonight">` on /campus when the tour is about to run
  (the same rule as `tourStartDecision`). `globals.css` holds each part with `visibility: hidden` (keeps its space,
  can't be clicked or focused). Each bubble's `onShow` brings its part in with a burst: scale from 94% on
  SPRING_POP while it fades in on SPRING_SOFT (CSS twins pinned by `spring-curve.test.ts`), transform and opacity
  only, nothing left behind; reduced motion only fades. An arrival inside the app (tapping Campus after the club
  page) is held by a layout effect before the paint, by the same rule.
- **Ways out, each shows everything:** Done, Skip, the tour script failing, no tour running within 4 s, a tab
  change, a visit where no tour starts. Nothing new is stored; no database change; Privacy Policy unchanged.
- **Off switch:** `FIRST_LIGHT=off` on Vercel, then redeploy: the hold and its mark are left out, and the tour
  runs over the full page as in Deploy A.

## Checked (local dev server, local Supabase)
Headless Chromium against the local dev server, seed non-admin `blake_iu` plus a brand-new local sign-up
(`qa_fresh1027`, non-admin) through onboarding into `/campus?welcome=1`:
- The hold is on <html> at DOMContentLoaded (before the first paint), on a full load and on an in-app arrival
  (club page → Campus) on both devices; a returning visit is never held.
- **1440px:** Otto alone (feed, left and right empty) → the feed bursts in → Your clubs (left) → Tonight
  (right), "Got it"; no scrolling at any step. **1200px Night:** the clubs strip, then Tonight, in the right
  column. **1000px:** Otto → feed → the tabs ("Find your clubs"), "Show me clubs" opens Orgs.
- **375px phone:** Otto tab alone (no feed, no +) → the feed → the Tonight card → the tabs; zero scrolling; every
  tap on Next lands, including right after a scroll.
- Ways out: Skip on the first bubble, the tour script blocked, a tab change before the tour starts, each show
  everything. Reduced motion: a plain fade, no transform. Full motion: the burst leaves no transform behind.
- The static profile tour on the same engine still runs.
- Two adversarial reviewers (lifecycle; engine, layout and motion) found no path to a permanently empty page;
  fixed from their reports: a last-resort timer outside React (5 s) set by whatever sets the hold, no re-hold in
  a page whose tour failed to start, no burst on a part not drawn at that width, no early reveal when a phone
  remounts mid-tour, the spot following the burst frame by frame, a remounted target found again, no double
  finish on a double tap, reduced motion scrolling instantly on the profile page, and the phone's full-width
  feed rising without an overshoot.
- Tests: `first-light.test.ts` (new), `campus-tour-steps.test.ts`, `spring-curve.test.ts`; 4,047 pass;
  typecheck clean; lint shows only the four errors already on main.

## Live (connectvibe.app)
Served pages carry `data-first-light-on` and the boot script. In Franky's signed-in browser (a copy of its
profile, deleted after; an admin account, so the non-admin walk is the local one above) with the tour flag set:
the computer and the phone were both held at first paint, lit bubble by bubble, and showed everything at the end;
the phone's first bubble sits on the otto tab with the tab bar showing (measured over 2.5 s, steady). One early
frame showed the tab bar missing; it didn't happen again in two re-runs, and a0b83e5 makes that case drop the
step rather than point at nothing.

**Franky walked the new tour on his phone and laptop (Sat Oct 24, late): "it looks good."**

## Left for later
- Franky's live sign-up test on the new flow, before more club links go out. If anything feels wrong on launch
  weekend, `FIRST_LIGHT=off` on Vercel and redeploy turns the hold off; the tour still runs.
- On iOS the bubble doesn't yet dodge the on-screen keyboard (no keyboard is open during the tour).
- The engine's bubble still fades on a fixed 240 ms curve, not a spring, and its hover lift ignores reduced
  motion: week 1's engine pass (tokens, Escape, focus, springs).
- The phone has no Your clubs row, so its tour goes feed → Tonight → tabs (a phone Your clubs row is week 1).
