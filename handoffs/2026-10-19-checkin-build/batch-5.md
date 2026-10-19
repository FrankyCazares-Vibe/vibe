# Batch 5: Privacy Policy draft (event check-in)

Contract section 5. Draft only: Franky reviews before it ships. The date stays
`<SHIP DAY>` in both places until the ship push (D15).

## Progress

- [x] Text file `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`:
  the date line, and changes 1 to 11 of contract section 5, in its words.
- [x] Page `src/app/legal/privacy/*.tsx`: the date line (`<SHIP DAY>`), and the
  same 11 changes word for word (3c bullet, 3e, section 5 table cell + new row,
  5a, 5b, 5f list item + sentence, section 6 Vercel, section 8 new row,
  section 9 "See and change", step 3, "What do other people lose").
  The new "Settings lists ..." sentence links Settings, like the next one.
- [x] Delete-account page: the two lines (contract change 12). Its own
  `effectiveDate="October 5, 2026"` is left alone: the Oct 16 edit of that
  page (c06b304) did not bump it either. Franky's call if he wants it moved.
- Nothing else in `src/`, `scripts/` or the checker pins a sentence that
  changed (grep for the old wordings found none).
- [x] Test `src/lib/legal/event-checkin-policy.test.ts` (8 tests since the review round, green): the
  contract's 10 phrases plus 8 more (one per remaining change) in both copies
  (text file, and every `src/app/legal/privacy/*.tsx` joined), whitespace
  folded; no ". "-split sentence with "check-in"/"checked in" says "safety"
  (and at least 10 such sentences exist, so the check can't pass empty); the
  old "Three things come close" / "see four more lists" are gone; the
  delete-account page's two lines; the page's EFFECTIVE_DATE equals the text
  file's "Effective ..." line (both `<SHIP DAY>` now).

## The word-for-word checker

The dev server the brief described was NOT running (nothing listened on
:3000, checked inside and outside the sandbox; `.next/dev/logs` last written
08:31, trace 09:28; it was 17:04). I did not start one. Instead I rendered
the page to static HTML (jiti + react-dom/server, `next/link` swapped for a
plain `<a>`; scripts in my scratchpad, not the repo), served it on
127.0.0.1:4517 and pointed `check.mjs --url` at it.

- Method proof: the HEAD page rendered this way against the HEAD text gives
  exactly the committed report (1215 sentences, 464 blocks, 102 mentions,
  PASS). `--selftest` on the new render fails with 22 differences, so the
  checks bite.
- Provisional date run (`October 20, 2026` in both places, then put back):
  PASS. 1230 sentences, 470 blocks (+6: the 3c bullet, 2 cells in table 1,
  the 5f item, 2 cells in table 4), 103 section links (+1, the new 3c link
  in 3e), 5 tables.
- Then `<SHIP DAY>` again, and the run kept in `check/report.txt` and
  `report.json`: also PASS, same counts. Their `page:` line says
  `http://127.0.0.1:4517/privacy.html` (the static render), not next dev.
- **The contract expected `<SHIP DAY>` to fail the date rule. It doesn't:**
  the header check compares "Effective <SHIP DAY>" with itself and the date
  pattern ignores it. So neither the checker nor the new test will catch a
  forgotten placeholder. Before the ship push: `grep -rn "SHIP DAY" src
  handoffs/legal-2026-10-04-privacy-v3` must come back empty.
- At ship time, re-run against next dev as the contract says:
  `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs --url http://localhost:3000/legal/privacy`.

## Checks run

- `node --test src/lib/legal/event-checkin-policy.test.ts`: 7/7 pass.
- `npm test`: 3229/3229 pass (at 17:0x, with whatever the other batches had
  on disk then).
- `npx tsc --noEmit -p .`: clean.
- `npx eslint` on my files: clean. `npm run lint` repo-wide: 33 errors, none
  in my files. They were already there (src/components/ui/*, mobile/*) plus
  two in progress elsewhere: a parse error in Batch 3's
  `src/components/events/checkin/CheckinLanding.tsx:156` (mid-write when I
  looked) and `handoffs/2026-10-18-side-space/project/support.js:46`
  (untracked, not this build).

## For the orchestrator and Franky

- **Do not push these files before the ship push.** The page now says
  "Effective <SHIP DAY>" on screen. Since the review round a production
  build carrying them fails (the page.tsx guard) instead of going live, so
  an early push would stop that deploy, an unrelated fix in it included.
- Two review points for Franky (I kept the contract's words):
  1. (Superseded: the review round's finding 2 rewrote it.) Section 6 named only the QR link as putting the event in Vercel's log.
     Checking in by code (and removing one) is also a request whose address
     holds the event id (`/api/events/<id>/checkin`), logged with the time
     and IP like any RSVP. The general sentence ("Its visit logs record the
     web address requested, your IP address and browser") already covers it;
     say so explicitly only if he wants.
  2. The delete-account page changed but keeps `effectiveDate="October 5,
     2026"`, as the Oct 16 edit of it did. Moving it is his call.
- Unchanged on purpose, as the contract says: the short version, Start here,
  4, 3d, 5e, 5g, 5h, 7, section 8's lead-in, the Terms, `TERMS_VERSION`,
  `check/checks.mjs`.

## Review round (Oct 19, 17:2x): 8 findings

Fixed in my files (both copies of the policy changed together, test phrases
with them; the contract's own words changed in four places, listed below for
Franky):

1. **Placeholder date not caught (real).** `page.tsx` now throws at module
   load when `VERCEL_ENV === "production"` and `EFFECTIVE_DATE` isn't
   "<Month> <d>, <yyyy>". Tried: the page renders as usual locally and with
   `VERCEL_ENV=preview`; with `production` it throws `[privacy]
   EFFECTIVE_DATE is "<SHIP DAY>", not a date...`; a copy dated October 20,
   2026 renders under `production`. Next's build loads every page module
   (collecting page data, then the prerender), so a production deploy fails
   instead of going live with "<SHIP DAY>". The test pins the guard and its
   pattern, and now also refuses a malformed date ("Oct 20"). The date line
   stays line 24, so ship step 4 is unchanged.
   - Not done (not my files): the checker rule in `check/checks.mjs`, and
     the reviewer's other option, a guard in `next.config.ts`. Either is
     the orchestrator's; the page guard already blocks the deploy.
2. **3c and section 6 said less than the logs hold (real).**
   - 3c: "We do not store the time..." became "Our database does not store
     the time you checked in or which way you did it, but Vercel's visit
     logs can show both (section 6)." (mirrors 3d's "Search words are not
     stored in our database, but Vercel can log them").
   - Section 6, Vercel: "Opening the link on a club's check-in screen..."
     became "Checking in at an event, with the link or the code, puts that
     event in the log, with the time and your IP address. When the club's
     owner or an admin marks you as here, or takes your check-in off, the log
     holds that event and your account ID (a random label), with the time."
     Checked: POST/DELETE `/api/events/<id>/checkin` and PUT/DELETE
     `.../checkin/marks/<userId>` are request paths, logged like any other.
   - Sentry: the marks path keeps the account ID in the officer's trail and
     ~1 in 10 speed reports (`redactDbCallValues` only rewrites /auth/v1 and
     /storage/v1). Not new to check-in: `/api/orgs/<slug>/members/<userId>`
     and `followers/<userId>` already do the same, and 3d's last line ("an
     account ID that is part of the web address of one of our own pages")
     is the disclosure. It reads "pages", not requests: a wording point for
     Franky's next policy pass, not this draft.
   - The `budget-eventCheckin:<uid>` limiter row (3 days, per UTC day) is
     already 3d's "Abuse counts". It names no event; left as is.
3. **Report not from next dev (real, can't fix here).** Nothing listens on
   :3000 again (17:24, curl inside and outside the sandbox, no process). I
   did not start one. The report in `check/` is re-run on the static render
   of the current files: PASS, 1232 sentences, 470 blocks, 104 mentions (+2
   sentences: section 5's cell and section 6; +1 mention: 3c's section 6),
   `page: http://127.0.0.1:4517/privacy.html`, date `<SHIP DAY>`. Treat it
   as a DRAFT. Provisional run (copies in my scratchpad dated October 20,
   2026, no repo file touched): PASS, same counts. `--selftest`: FAIL, 22.
   At ship time (orchestrator): start next dev, set the date in both places,
   run `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs --url
   http://localhost:3000/legal/privacy`, commit that report.
4. **"Safety" filter missed 3e (real).** Now `/check(?:-ins?|ed in| in| you
   in)\b/i` (21 sentences, 3e's "to check you in" included; it was 19 and
   missed it), plus: every sentence holding one of the 21 phrases is checked
   for "safety", and the test asserts the 3e sentence is in the filtered set.
   Mutation tried: "...to check you in, for your safety." is caught.
5. **Door screen shows the exact count (real).** `DoorView.tsx:146,254`
   draw `checkinCountLine(n, …, true)`, so below 5 everyone at the door
   reads it. The policy now matches the code: the section 5 row's right cell
   adds "So does anyone who can see the check-in screen at the door". If the
   orchestrator instead hides the number below 5 on the door (Batch 4's
   file), take that sentence out of both copies and the test.
6. **Section 13's "aim to tell" vs no notice (not a draft defect).** The
   draft follows the contract (call #4: no notice). It goes to Franky with
   call #4: officers can now create a record about anyone with a Going or
   Interested RSVP, RSVPs made before the ship day included. "Aim to" keeps
   the draft consistent if he keeps no notice; if not, a one-line in-app
   note on the ship day.
7. **Being taken out of the club (real).** `org_members_drop_club_access`
   (local body read) deletes only RSVPs to events that haven't ended, never
   check-ins. Section 8's row now reads "Leaving the club, or being taken
   out of it, does not remove them" (the "Title" row's "you leave or are
   taken out of the club" wording). Test phrase changed.
8. **Delete-account page date (Franky's call, unchanged).** Still
   `effectiveDate="October 5, 2026"` though two lines now name check-ins.
   If he wants it moved, ship step 4 sets it to the same real day.

### Where the draft now differs from the contract's words (for Franky)

- 3c's last sentence (finding 2), section 6's Vercel sentence (finding 2),
  section 5's new row (finding 5), section 8's new row (finding 7). Every
  other change is the contract's text.
- `page.tsx` now holds the production guard beside the date line (finding
  1), more than "the date line only".

### Checks run (after the review fixes)

- `node --test src/lib/legal/event-checkin-policy.test.ts`: 8/8 pass.
- `npm test`: 3280/3280 pass (17:3x, with whatever the other batches had
  on disk).
- `npx tsc --noEmit -p .`: clean. `npx eslint` on my files: clean.
- Checker: PASS on the static render, `<SHIP DAY>` and provisional.
- Before the ship push, `grep -rn "SHIP DAY" src handoffs/legal-2026-10-04-privacy-v3`
  still helps. Today it lists `page.tsx:24`, md line 3, the draft
  `report.txt`, and the test (which names the placeholder on purpose and
  keeps doing so). Once the day is set and the checker re-run, only the
  test's lines are left.
