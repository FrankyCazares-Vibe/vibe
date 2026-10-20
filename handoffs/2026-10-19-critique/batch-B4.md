# Batch B4: Bloomington school events (Oct 19, 2026)

Built on decisions 6 and 7. **Not committed** (the workflow said no commits). Nothing written to any
database, production or local. No outside site was fetched: the dev server runs without
`SCHOOL_EVENTS_FIXTURES`, so the browser pass answered every `/api/school-events` call itself, with
what the new server code builds from the fixtures.

## What changed

- **Crash guard.** `SchoolEventCard`'s colour switch has a default (IU crimson), and the exported card
  wraps itself in `<QuietBoundary name="school-card">`. `useSchoolEvents` drops a row whose calendar
  isn't in the same answer's `sources`. The old crash was reproduced once by hand in the browser
  (`bloomington/phone-sim-newkeys-crash.png`); no test runs the old code. The tests show the new card
  renders for any calendar name and that everything reading the row sits inside the boundary (see the
  repair pass below).
- **Feeds per campus** (`sources.ts`). `SCHOOL_CAMPUS_ID` is gone; `feedsForCampus(id)` gives each
  campus its own calendars. Each feed has `campus_id`, `featured`, `role`, `label` and game rules
  (home place, title prefix, home label, place fallback, the "at" rule, ticket domains, link rewrite).
  - Bloomington: `iub-athletics` (iuhoosiers.com), `iub-student-life` (group 76), `iub-featured`
    (group 341, a plain calendar per decision 7).
  - Games read "IU vs Purdue"; a bare "Bloomington, Ind." shows "Bloomington"; a leading "#5 " rank
    goes (Indy too); `admin.iuhoosiers.com` links become `iuhoosiers.com`; tickets on
    `iuhoosiers.evenue.net` or Ticketmaster.
  - **Duplicates fixed (Indy too):** a LiveWhale row's id is the number in its link, since a shared
    copy gets a new X-LIVEWHALE-ID. No number: title + start. Bloomington's 76 and 341 share 80 events;
    the Oct 22 window now has no evening twice.
  - Places keep IU, IMU, LGBTQ in capitals and small words lower case ("Museum of Art").
- **Route and reader.** The route answers off only for a campus with no feeds, and reads only that
  campus's calendars. The "none kept" warning follows the `featured` flag, so Bloomington's big
  group 341 is reported.
- **Switch.** Six keys; a campus id (`iu-bloomington`, `indianapolis`) turns off that campus.
  **An unknown word now turns nothing off** (it used to turn every campus off, so a Bloomington name
  on an older build, or after a rollback, hid Indy). Only a value that names nothing (",", `[""]`,
  a number) still turns everything off. Documented in `.env.example` and `switch.ts`.
- **Labels.** "Home games this week" shows the athletics source's label ("IU Athletics" /
  "IU Indy Athletics"), found by `role`, with a key fallback for older answers. The empty Events card
  names no campus. Home-week tiles come from `kind === "game"`. New tails: football "kickoff",
  baseball and softball "first pitch".
- **Ranking (decision 7, both campuses):** featured pick, then tonight's home game, then the school
  event on now, then the soonest. A game that hasn't started leads with "Up next" and the line
  "First because it's tonight's home game." (Repair pass: only a game from 5 PM or one on now gets
  that place, and a game before 5 PM says "today's"; see item 2 below.)

## Files

- `src/lib/school-events/`: `sources.ts`, `read-server.ts`, `types.ts`, `switch.ts`, their tests
  (`sources.test.ts`, `ics.test.ts`, `switch.test.ts`), new fixtures `fixtures/iub-athletics.ics`,
  `iub-student-life.ics`, `iub-featured.ics` (copied from `bloomington/`, already trimmed).
- `src/app/api/school-events/route.ts`, `route.test.ts`
- `src/components/campus/tonight/`: `SchoolEventCard.tsx`, `use-school-events.ts`, `tonight-view.ts`,
  `tonight-view.test.ts`, `TonightSheet.tsx`, `TonightBits.tsx` (two doc comments), new
  `school-card.test.ts`
- `.env.example`
- Draft email: `vibe-marketing/outreach/2026-10-19-iub-athletics-ok/1-iu-athletics-schedule-ok.md`

## Checks

- `npm test`: 3351 pass, 0 fail (check-in tests included). `npx tsc --noEmit -p .`: clean.
  `npx eslint` on every batch file: clean.
- Browser pass, seed account blake (non-admin), Night and Light, 390x844 iPhone and 1440x900:
  `shots/B4-iub-*` (Bloomington card, sheet, sheet bottom, Events, School chip, desktop feed panel),
  `shots/B4-indy-*` (Indy unchanged apart from the new rule line), `shots/B4-unknown-*` (an unknown
  calendar's card renders crimson; a row from an unlisted calendar is dropped; no errors).
- One page error ("an async Client Component") showed once on a phone Light load and did not come
  back in three reruns. Probably the dev server recompiling other batches' files; not from B4.

## For the main session

- **No database change, no Privacy Policy change.** The policy doesn't name school calendars; the
  calendar reads carry no person's data; nothing new is collected or shown about anyone.
- **After deploy, check production** with `?campus=iu-bloomington`, signed in. Not verified: whether
  Imperva in front of iuhoosiers.com lets Vercel read the feed. If not, the logs say
  `[school-events] iub-athletics status_…` or `not_ics`, and Bloomington shows its two IU calendars
  without games. The feed address is Sidearm's standard one, not fetched by this batch.
- **Off switch for decision 6:** `SCHOOL_EVENTS_OFF=iub-athletics` (redeploy) or the
  `school_events_off` row `["iub-athletics"]` (production write, needs Franky's yes). Indy stays on.
  Before rolling production back to 9117dc6 or older, delete that row (item 7 below).
- ~~Old open tabs crash on Bloomington~~: fixed in the repair pass (`cards=any`, below).
- The plan said each batch commits and pushes; this one didn't, as the workflow asked.
- Docs to refresh later: `handoffs/2026-10-19-tonight-build/CONTRACT.md` still says Indy only.

## Repair pass (Oct 19, 2026, after the review)

Still not committed; no database or outside site touched. Every finding, in the review's order:

1. **Fixed. LiveWhale ids.** The number now comes only from the START of the link's last path part
   (`linkNumber` in `sources.ts`). "homecoming-2026-parade" and "fall-2026-career-fair" no longer share
   `iu:2026`; a bare `/live/events/2432980` equals `/live/events/2432980-slug`. Tests added.
2. **Fixed, with one call for the main session.** The rule line says "today's" before 5 PM and
   "tonight's" from 5 PM, the same split as the week tiles. I also read decision 7 ("a home game
   TONIGHT comes first") literally: only a game starting at 5 PM or later, or one on right now, jumps
   the queue. An afternoon game that hasn't started ranks like any school event. Results:
   - Indy, Thu Oct 22, 2 PM: the 3 PM Ball State meet leads as the soonest, "First because it's
     today's home game.", tile "TODAY 3:00 PM".
   - Bloomington, Fri Oct 23, 1 PM: the 7 PM soccer game leads, "tonight's"; the 2 PM meet is a row.
   - Sun Oct 25, 11 AM: the Day Hike (on since 9 AM) leads, not the noon field hockey game.
   - **If Franky meant any game today**, delete the `campusHour(...) >= EVENING_HOUR || isLive(...)`
     condition in `buildTonight` (`tonight-view.ts`); the words stay right either way.
3. **Fixed. Men's and women's meets.** The merge key drops a leading "Men's"/"Women's"; both teams in
   one meet are one item named by the plain sport ("Swimming and diving"), keeping the first row's id
   and page. Bloomington's home games go from 87 to 83 (Oct 2, 9, 23, Jan 8); Indy's Oct 3 and Oct 22
   meets are one item each. Test on the Oct 23 fixture rows.
4. **Fixed for now; needs one look by hand.** `iub-student-life` linked to `events.iu.edu/iubstudentlife/`,
   which had no source. It now links to `https://events.iu.edu/` (the host the feed comes from), so the
   credit can't open a 404. **Main session:** open `https://events.iu.edu/iubstudentlife/` once in a
   browser; if it is Student Life's real calendar, put it back in `sources.ts`. Sources of the three:
   - `iub-athletics` → `https://iuhoosiers.com/calendar.aspx`: every game row in the feed links to
     `admin.iuhoosiers.com/calendar.aspx?game_id=…`, which 301s to iuhoosiers.com (fixture, Oct 19).
   - `iub-student-life` → `https://events.iu.edu/`: the feed's own host; no group page is named anywhere.
   - `iub-featured` → `https://events.iu.edu/iub-featured/`: 75 of its 181 rows link to
     `events.iu.edu/iub-featured/event/…`, so that calendar page exists under that path.
5. **Fixed.** "(RV)" is stripped like "#5"; a trailing "(N Innings)" or pool length "(SCM)" is
   dropped; "Intrasquad (Wrestle-Offs)" reads "IU wrestling intrasquad (Wrestle-Offs)". "(Exhibition)"
   / "(Exh.)" stay on purpose (they tell a student the game doesn't count, and aren't a rank or score),
   as do a name's own brackets ("Miami University (Middletown)"). No fixture title has "#", "(RV)",
   "Innings)" or "(SCM)" now, so the email's "no scores or rankings" holds.
6. **Fixed a third way: no risk and no staged step.** Every new page asks with `cards=any`
   (`use-school-events.ts`). Without it, the route leaves out every calendar but Indy's three
   (`OLD_PAGE_KEYS` in `route.ts`), so a tab from before this deploy gets Bloomington "off", exactly as
   before, and can't reach the crash. Indy is unchanged for it. Delete `OLD_PAGE_KEYS` and the client's
   `cards=any` a week or so after the deploy. Checked in the browser: every read carried `cards=any`.
7. **Fixed (notes).** One line each in `.env.example`, `switch.ts` and the email draft's notes:
   before rolling production back to 9117dc6 or older, delete a `school_events_off` row that holds a
   Bloomington word (old builds read an unknown word as "everything off", Indy included). An instant
   rollback keeps the old deploy's env, so only a fresh redeploy would read a new env value.
8. **Fixed.** A small word right after a comma keeps its capital, a two-letter state before a ZIP or
   the end goes to capitals ("Bloomington, IN 47405"), and IUA, IUB, IUOA, IUPUI, HPER and SPEA join IU,
   IMU and LGBTQ in capitals. A list, not a "no vowels" rule, which would have made "St." read "ST.".
9. **Fixed.** The claim is corrected above. New test: the exported card's outermost element IS
   `QuietBoundary` ("school-card"), its child gets the props as they are, a row that throws on any read
   doesn't throw in the wrapper, and the child alone does. Moving the boundary inside the body, or
   swapping it for a fragment, fails the test. (No DOM library in the repo, so no client render.)
10. **Not B4's (no change).** For the batch that owns `TonightSection.tsx`/`campus-home.tsx`: on
    desktop Events, a short Tonight lead sits beside an uncapped "Also tonight" list (8+ rows on a busy
    Bloomington Friday), leaving ~400 px of empty card. Cap the list at about 5 with "+N more tonight"
    (as the phone card does), or make the lead column sticky.

**Checks:** `npm test` 3364 pass, 0 fail; `npx tsc --noEmit -p .` clean; `npx eslint` on every B4 file
clean. **Screens re-taken** (blake, sims built by the new code from the fixtures, calendar hosts
blocked, 0 page errors): `shots/B4-iub-*` (Thu Oct 22, 6 PM, both themes, both sizes),
`shots/B4-indy-*` (Thu Oct 22, 2 PM, Night), new `shots/B4-iub-fri1-*` (Fri Oct 23, 1 PM: one swim
item, soccer leads) and `shots/B4-iub-sun11-390-light-*` (the hike leads). `shots/B4-unknown-*` were
not re-taken: the crash-guard code they show didn't change.

**Privacy:** no names anywhere new; still no Privacy Policy change.

## Final check across B2, B3, B4 (Oct 19, 2026)

`npx tsc --noEmit -p .` clean (exit 0). `npm test` 3364 of 3364 pass. `npx eslint` on all 33 changed files of B2, B3 and B4: no errors, no warnings. No fixes were needed. B5/B9 were already committed (7c35593) and nothing in their files failed.
