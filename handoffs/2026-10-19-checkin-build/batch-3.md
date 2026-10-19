# Batch 3 (student UI): notes

Started Oct 19 2026. Contract read in full (sections 0 to 8). Owned files per
section 8, Batch 3.

## Plan

- `use-checkin-state.ts`: the hook plus its pure helpers (state from the list
  fields, the 30 s re-read throttle, how the code form words a refusal). The
  helpers live here so node --test can load them without JSX.
- `CheckinCodeForm.tsx`, `CheckinSheet.tsx`, `CheckinSlot.tsx`,
  `CheckinLanding.tsx`, `src/app/campus/checkin/[id]/page.tsx`,
  `src/components/settings/CheckinsCard.tsx`, the SettingsClient mount.
- One extra file of my own: `src/components/events/checkin/use-checkin-state.test.ts`
  (tests the pure helpers above; nobody else's file).

## Written (first pass)

- All eight owned files plus `use-checkin-state.test.ts` (9 tests, pass).
- `npx tsc --noEmit -p .`: clean. `npx eslint` on my files: clean (the one
  warning in SettingsClient.tsx:1258 is old code, not mine).

## Choices worth knowing

- **Desktop scrim is black (`rgba(0,0,0,0.45)`), not `rgba(var(--scrim-rgb),0.45)`.**
  In Night `--scrim-rgb` is 255,255,255, so the contract's value would wash
  the page white instead of dimming it. The phone sheet's overlay
  (sheet-styles.ts) and every campus modal scrim are dark for the same reason.
- **`checkin_unavailable` re-enables the field after 60 s** (the words say
  "Try again in a minute"); `checkin_too_many_tries` stays off (the day's).
- **The card's tick pops only when it turns on in this session**, not on
  every list load (same for the landing's 56 px disc).
- **Landing header time is campus time** (`campusDateTime`, campus-time.ts):
  the same on server and browser, so the header can render before hydration.
  `opensAtLine` there uses `campusClock` too, for one clock on the page.
- **Landing page reads the club and the state in parallel** (Promise.all)
  after the event read; a failed club read fails closed (event = null).
- **The token is used for one tap**: after a check-in or a removal the
  landing's form starts from the code box (a dead token would only bounce).
- **Failure lines** for removals and loads use `CHECKIN_ERRORS.request_failed`,
  so every sentence still comes from the shared words.
- `useCheckinState` also returns `phase` (CheckinSlot needs it anyway).

## Checks (Oct 19, end of batch)

- `node --test src/components/events/checkin/use-checkin-state.test.ts`: 9/9.
- `npm test`: 3279/3279 pass (every batch's tests on disk at that moment).
- `npx tsc --noEmit -p .`: clean. `npx eslint` on my 9 files: 0 errors.
- **Live check NOT run: no dev server was listening on :3000** (Claude
  Browser lists the "vibe" preview as "stopped by the app" at 13:28Z, and
  nothing listens on the port). I did not start one, per the rules. The
  local Supabase API (:54321) is up.
- Instead, a server-render smoke test (jiti, scratchpad only, the clock
  stubbed): every landing view (before / after / not open / code box /
  token "I'm here" / checked in with "6 checked in" / checked in after with
  3, which shows no count) and every slot case (before: nothing; closed with
  2: nothing; open with 7: count + Check in; checked in; officer at 3: "3
  checked in"; after: nothing) render the contract's words.

## For the orchestrator's browser pass

- Landing: open `/campus/checkin/<id>?checkin=<token>` signed in; the token
  should leave the address bar at once; "I'm here" checks in; an old link
  shows the expired line then the code box.
- Card: "Check in" opens a vaul sheet under 900 px, a dialog above it.
- Settings: "Event check-ins" sits between Blocked users and Help.

## Review round 1 (Oct 19): eight findings

Verified each against the code and the contract before changing anything.

- 1 (focus/announce after a card check-in): REAL. The opener pill is
  replaced, so focus lands on body; the slot's text was in no live region.
- 2 (sheet closed while the POST is out): REAL. `aliveRef` returned before
  `onCheckedIn`.
- 3 (token step doesn't hold the reload): REAL. page-snapshot.ts counts
  `[data-holds-reload]:not([data-holds-reload="false"])`; token mode wrote "false".
- 4 (Settings "Remove" has no event name; confirms drop focus): REAL.
- 5 (sheet never names the event): REAL.
- 6 (a GET per card mount, throttle per instance; landing re-reads): REAL.
- 7 (too-many-tries words send walk-ins to an officer who can't mark them):
  REAL, but the words are Batch 0's file. Flagged, not edited.
- 8 (Settings shows LoadFailed if the mine function is missing): REJECTED for
  Batch 3. The plan applies the migration before the push; 4.5 asks for
  LoadFailed on a failed read; a quiet fallback would be Batch 1's route.

### Fixed (round 1)

- **1. CheckinSlot.** The row keeps one shape whether checked in or not,
  with an always-mounted `<span role="status" tabIndex={-1}>` (visually
  hidden while empty), so "Check in" turning into "You're checked in" is
  read out. After a check-in from the sheet, focus goes to that status line,
  NOT to "Remove my check-in" as the reviewer suggested: while check-in is
  open that pill deletes with no question, so a stray Enter after the 4th
  digit would undo the check-in. Focus only moves if it has nowhere to be
  (body or a detached node). Also: Remove → Keep on the inline confirm,
  Keep → back to "Remove my check-in", a removal → the "Check in" pill.
- **2. CheckinCodeForm.** A successful POST calls `onCheckedIn` even after
  the form has unmounted; only the form's own setState waits for it. A
  refusal after unmount is still dropped (nobody to show it).
- **3. CheckinCodeForm.** `data-holds-reload=""` also while the "I'm here"
  step shows, for at most `4 * CHECKIN_STEP_SEC` s (120 s, the longest a
  token can still work, D4). After that a reload costs nothing. This goes
  one step past contract 4.1's guard wording, on purpose.
- **4. CheckinsCard.** Every row's "Remove" has
  `aria-label="Remove my check-in: <title>"` (visible word first, so the
  label-in-name rule holds); the Remove / Keep pair is a `role="group"` with
  the same name. Focus: Keep when the pair opens, the row's "Remove" on
  Keep, after a removal the next row's "Remove" (or the one before, or the
  empty line). For a row whose check-in window is over, the pair shows
  `removeConfirm` under the row's details and points `aria-describedby` at
  it; for a live event it shows no line (the sentence would be false).
  The landing's inline confirm got the same focus moves and a labelled group.
- **5. CheckinSheet.** The event's title shows under "Check in" in both
  shapes (data, not a sentence, so the words rule holds): `Drawer.Description`
  on the phone, a `<p>` the dialog's `aria-describedby` points at on desktop.
- **6. use-checkin-state.ts.** The 30 s rule is now per event for the whole
  page (a module Map, browser only, written only from effects and
  handlers). A remount inside 30 s sends no read and starts from the last
  answer when the list hasn't changed since; a read still out is shared
  (React's dev double-mount would otherwise drop it). A tap's answer
  (`set`) is remembered too, so a tab switch can't show a stale "Check in".
  New option `useCheckinState(ev, { serverFresh })`: the landing passes
  `initial !== null` and skips its mount read when the window is on at the
  first clock reading. New pure helper `mountPlan`, with a test.

### For the orchestrator (round 1)

- **7, Batch 0 words:** `CHECKIN_ERRORS.checkin_too_many_tries` sends
  everyone to an officer, but a mark needs a Going/Interested RSVP
  (migration :455-462, `not_on_list`; HereToggle hides for walk-ins).
  Suggested: "Too many tries today. If you said Going or Interested, ask
  someone running check-in to mark you as here." Batch 3 shows the line as
  given; nothing in my files changes when it's reworded.
- **8, rejected for Batch 3:** keep the planned order (apply, then push).
  4.5 asks for LoadFailed on a failed read, and an empty list on a 500
  would hide a real failure. If wanted, Batch 1's mine route could map a
  missing function (PGRST202 / 42883) to `{ ok: true, checkins: [] }`.

### Checks (round 1)

- `node --test src/components/events/checkin/use-checkin-state.test.ts`: 10/10.
- `npm run typecheck`: clean. `npm test`: 3295/3295.
- `npx eslint` on my files: 0 problems (SettingsClient.tsx:1258's warning
  is old code). `npm run lint`'s 33 errors are all in files no batch owns.
- Server-render smoke (scratchpad `b3-smoke/`, clock fixed, requests
  stubbed): the slot's status span is the same second child in both
  states; token mode renders `data-holds-reload=""`, the code box "false".
- Still no dev server on :3000 (curl 000, nothing listening; the Browser
  pane's `vibe` preview "stopped by the app" at 13:28Z). Not started, per
  the rules: the focus moves need the orchestrator's browser pass.
