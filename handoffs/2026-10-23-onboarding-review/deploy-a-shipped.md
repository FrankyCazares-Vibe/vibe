# Deploy A: shipped (Sat Oct 24, 2026)

Branch `claude/first-run-deploy-a-5ff041`, merged to `main`: feature commit 3653178, merge d676ed5. No database change, nothing new
stored, so the Privacy Policy is unchanged. Deploy B (the quiet arrival) was not started.

## What changed
1. **Onboarding words, both devices** (`onb-copy.ts` and its twin in `public/html/onboarding.html`): the hello
   mentions clubs and "who's here"; the note is "about two minutes: your campus, your name, a photo, then your clubs
   and people"; the name step is "what should your clubs call you?"; the photo line is softer; the clubs step is
   "find your clubs" / "Follow a club to get its updates and events. Join the ones that let you."; every "your feed"
   and "posts land" line is gone (the phone's Orgs empty line too); Indianapolis keeps "IU and Purdue both". The
   copy-match test now compares the whole table, not only the clubs part, and fails on "your feed" or "who's around".
2. **Profile folds to name and handle** on both devices, under a closed "Add more about you (optional)" row. Same
   fields, same save. The fold opens on its own when a draft or the prefill already filled one of them. "Showing my
   work" stays inside the fold (week 1 retires it). The bio placeholder lost "what you're building". Motion: rise
   8px and fade on SPRING_SOFT (computer: its `linear()` twin over 480ms, pinned by `spring-curve.test.ts`); reduced
   motion keeps only the fade.
3. **No skipping the campus:** Skip is hidden on steps 1 and 2 on both devices; the computer's logo no longer opens
   the skip sheet there. On the computer a quiet **Sign out** sits where Skip was; it uses the phone's and Settings'
   own sign-out (`useLeaveAccount`, lent by `OnboardingSwitch` as `window.__vibeOnbSignOut`; `signOut` now answers
   true/false). The phone keeps its ⋯ sheet.
4. **New computer tour** (`src/lib/tour/campus-tour-steps.ts` + test; `campus-home.tsx` only calls it): Otto on the
   orb → the feed's first screen (new `#campus-feed-top` wrapper, so the page never scrolls) → Tonight → Your clubs
   (left column at 1400px+, the folded strip at 1100-1399px when it has clubs, otherwise the tabs) → **Show me clubs**
   opens the Orgs tab. Steps with nothing to point at are dropped first. The phone's start rule (`tourStartDecision`,
   now shared) replaces the computer's, so a second person on a shared laptop gets the tour. Waits up to 1.5 s for
   the campus name and for a club-link guest's clubs strip.
5. **Phone tour:** the Otto tab → the feed → the tabs ("Clubs and events, one swipe over."). The dead Chat line and
   the post ask are gone. The campus leg now waits for all three targets, not only the first.
6. **The keep-your-account email card waits** out the welcome visit on both devices (`CampusAccountCard` reads
   `?welcome=1` and the pending flag once, at mount).
7. **Found and fixed on the way:** the tour engine's spotlight had never cut its hole (the spot was white inside the
   mask since May 11), so every tour dimmed the whole page evenly. One word in `_otto-tour.js` (`fill: black`);
   it fixes the profile and network tours too.
8. **From the self-review (two reviewers, state and failure paths; nothing serious):** Sign out holds the page still
   while it runs and stops the page writing a draft back afterwards; replay (`?replay=1`) keeps Skip and shows no
   Sign out; the tour's pending flag is now cleared at sign-out (`leave-device-clean.ts`), so the next person on a
   shared browser doesn't inherit it; the flag is dropped when the tour has nothing to show; Done/Skip clear the
   flag before marking the tour seen.

## Browser pass (local dev server, local Supabase, non-admin accounts made for it)
All as non-admins, identity checked with `/api/me/profile-bootstrap` (`isPlatformAdmin: false`).
- **Access code, computer, 1440px Light** (a local waitlist code): sign-up → hello (new words, Sign out, no Skip) →
  campus (no Skip; the logo does nothing) → name (fold closed; opened, a bio, a major and "Finding clubs" filled) →
  photo → clubs → people → Finish. The local database had every folded answer saved. `/campus?welcome=1`: the
  email card held; the tour ran Otto (orb) → feed → Tonight → Your clubs (left column) → "Show me clubs" opened Orgs,
  marked seen, cleared the flag and `?welcome=1`. A plain return visit: the email card shows, no tour.
- **Shared laptop, 1200px Night:** the same browser, tour already seen, flag set again → the tour ran (1 of 4). The
  feed step spotlit the feed's first screen with no scroll; Tonight spotlit; no clubs yet → the tabs and "Find your
  clubs". After the spotlight fix the cutouts show.
- **1000px Light:** three bubbles (Otto, feed, tabs); Skip tour left the Feed tab on, seen set, flag cleared.
- **Club members' link, phone, 375px Night:** `/c/<code>` sign-up → no Skip on steps 1-2, ⋯ kept → the fold (closed
  it before Continue: the bio still saved; Back reopened it with the bio in it) → clubs and people words → Finish →
  "Join Sixty-Four Chess?" → Join → club page, flag held → `/campus`: the phone tour ran Otto tab → feed → tabs →
  "Got it"; the email card held. The bubble's Next takes the tap (the + sits under it, z 50).
- **Same club member, computer 1200x700:** Your clubs pointed at the folded strip above Tonight.
- **Sign out (computer, steps 1-2):** a failed logout (faked in the page) shows "Couldn't sign you out. Try again."
  and re-arms the button; a real one holds the page ("Signing out…", Continue and Back disabled), lands on
  /auth/login, the session is gone (401) and no onboarding draft or account copy is left in the browser.
- **Replay** (`?replay=1`, seed account) keeps Skip on steps 1-2 on both devices, no Sign out.
- **Reduced motion** (headless Chromium): the computer fold only fades (`pf-more-fade`), its chevron doesn't move;
  the phone fold has no rise, only the fade. The fold starts open for a profile that already has optional answers.
- **Live on connectvibe.app** (deploy `dpl_6CwoHFLbowbsNYwgGUzQATLAnu4E`, READY): the served `_otto-tour.js` has the
  spotlight fix; in Franky's signed-in browser (a copy of its profile, deleted after; replay mode saves nothing)
  the hello and note read the new words, step 3 is "what should your clubs call you?" with the fold, and with the
  tour flag set /campus ran Otto → "This is Indianapolis, live." → "What's on tonight." → "Your clubs." with
  "Show me clubs", the clubs column spotlit. That was an admin account; the non-admin walk was the local one above.
- Not covered: a real phone, Safari, and a fresh sign-up on production (Franky's test covers it).

## Left for later
- **Franky: re-run the live sign-up test** on the new flow before more club links go out.
- Deploy B (the quiet arrival) is untouched, as asked.
- The phone's feed bubble still spotlights the whole swipe pager, so the page scrolls partway down the feed during
  it (the old phone tour did the same). Pointing it at the feed's first screen is a small week-1 change.
- A failed campus save on step 2 now has no Skip to fall back on (Sign out on the computer, ⋯ on the phone). Skip
  wouldn't get past an outage of that route either (it saves through the same route), so nothing was added.
- If the tour script never loads, the pending flag (and so the email card's hold) stays until a tour finishes. Low
  odds (same-origin script); a hold that expires after a few visits would cover it.
- Tour targets are measured when the tour starts; a club-link guest's strip landing more than 1.5 s late gets the
  tabs bubble instead (still true words). The engine's other house-rule gaps (tokens, Escape, focus) are week 1.
- Local test data: four test accounts and waitlist codes in the LOCAL database only (`qa.access1024-1026@iu.edu`,
  `qa.club1024@iu.edu`); nothing was written to production.
