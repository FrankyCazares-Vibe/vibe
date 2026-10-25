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

## 3. The leftovers (Oct 24, late; all live)
- **3a93ff2, the tour engine:** the bubble arrives on SPRING_SOFT and the button lifts on SPRING_SNAPPY (CSS twins
  kept inside `_otto-tour.js`, since the static profile page loads it without the app's stylesheet; pinned by
  `spring-curve.test.ts`); transform and opacity only; reduced motion: no rise, no hover lift. The bubble is
  placed inside the visual viewport, so the iOS keyboard (or a zoom) never covers it (checked with a simulated
  keyboard: the visible area cut to 420px, the bubble stayed above it). The static profile tour still runs.
- **c16d44e, the phone's Your clubs (Franky's yes on the 375px screenshots):** `YourClubsRow.tsx` +
  `your-clubs-phone.css`, the desktop panel's reads and words as one band above the Tonight card: a sideways row
  of club tiles (mark, name, age, the newest Board line), each opening its Board; no clubs yet: "Find clubs on
  campus", which opens Orgs; both reads failed: nothing. First light holds it with the "clubs" parts and the
  phone tour has its own bubble, in Franky's order: Otto tab, feed, Your clubs, Tonight, tabs.
- Checked: non-admin local accounts at 375 (Light, Night, reduced motion), 1000, 1200 and 1440; 4,053 tests;
  live, the row fills in with the account's clubs once its two reads answer (the inbox read took 2-5 s on a cold
  start, the still tiles hold its place meanwhile).

## Supabase dashboard steps: DONE (Sun Oct 25, Franky, each screen checked by screenshot)
The P0 list's dashboard steps (`handoffs/2026-10-21-signup-preregistration-fix.md`, "Dashboard"):
- Confirm signup: code only, no link (matches `supabase/templates/confirmation.html`).
- Change email address (was the old button-and-link email), Reset password and Magic link: replaced with the
  link-free notices from `supabase/templates/` and their subjects. The magic-link text first landed on
  Reauthentication by mistake; that one goes back to a code (Supabase's default or a Vibe-styled code email).
- Site URL `https://www.connectvibe.app`. Redirect URLs: the two host wildcards
  `vibe-*-fracazar-1988s-projects.vercel.app` (and `/**`) removed (a stranger could name a Vercel project to
  match them; preview builds can't sign in anyway); 11 exact URLs left.
- Confirm email ON, Secure email change ON, the Before User Created hook `auth_hooks.hook_waitlist_gate` enabled,
  all seven Security notification emails OFF (Password changed and Email changed stay off through launch).
Next for Franky: the live sign-up test with a fresh school address (Inbox AND Junk), then club links.

## Left for later
- Franky's live sign-up test on the new flow, before more club links go out. If anything feels wrong on launch
  weekend, `FIRST_LIGHT=off` on Vercel and redeploy turns the hold off; the tour still runs.
- Week 1's engine pass: colour tokens, Escape, focus and a screen-reader label for the bubble.
