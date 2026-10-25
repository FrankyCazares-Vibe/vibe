# Otto's wormhole and the 7-20 handle rule (Sun Oct 25, 2026)

Franky, Oct 25: "lets make the cap 7-20 charachters, lets make it a little more aestheitcially pleasing once you
sign up, make otto appear on the screen, like a wormhole creating a solar system with lgithspeed or something, where
he says im otto bla bla bla, and then maybe add a same thing ut reverse where you transform into the app/site itsel
when you finish setting up your account." He approved it from recordings ("Looks good now, ship the wormhole and the
7-20 handle rule"). Live on main 630c517 (445117a handles, 9f44f64 wormhole, 630c517 the doubling fix).

## The handle rule (445117a)
- A new or changed handle needs 7-20 characters (`NEW_HANDLE_MIN` in `src/lib/profile/handle.ts`). A handle someone
  already has (3-6 characters) is still recognised everywhere (`HANDLE_FORMAT_RE` stays 3-20) and can be kept.
- Server: `handle-change.ts` refuses a new short one; `/api/handle/check` answers "Too short — 7 characters minimum"
  (your own handle is always available). Clients: phone and computer onboarding (keep your current handle via
  `keepHandle` / `KEEP_HANDLE`), Settings, the static profile page.

## The wormhole (9f44f64, 630c517)
- **One engine, both devices:** `public/html/_otto-wormhole.js` (`OttoWormhole.arrive` / `.depart`). The computer's
  static onboarding loads it with a script tag; the phone loads it at mount through `src/lib/onboarding/wormhole.ts`.
  It replaces the computer's old hyperdrive.
- **Arrival** (a page that opens on step 1): the page holds its words, header and bar (`visibility: hidden`, so
  nothing can be tapped), light streaks pour into Otto's place, flare, three rings with planets and the orb pop in,
  then the dark clears and "i'm otto." and the rest rise in on SPRING_SOFT. A tap or key skips. If the script never
  comes, the page shows at once; a 4 s last resort lets go whatever happens.
- **Leave** (Finish, and the replay's Finish): the step folds into Otto, his rings pull in, light shoots out, a disc
  in the app's page colour (Light #FAF7F2 / Night #0C0B0B, globals `--cream`) swallows the screen, then Campus opens
  with first light. Otto scrolled off screen (Finish at the bottom of a long step) pops in mid-screen instead. No
  script: the old warp.
- **Motion:** transform and opacity only; SPRING_SOFT/SPRING_POP sampled into the engine and pinned by
  `spring-curve.test.ts`; streaks accelerate (ease-in). Reduced motion: no streaks, nothing moves, a plain fade.
- **The doubling Franky caught (630c517):** each step slides up 14px (phone 10px) as it opens, and the engine's copy
  of Otto was placed at the start of that slide, spinning on its own clock: two Ottos at the hand-over. The copy now
  follows the real orb every frame and takes its animations' current time (measured 0px / in phase; the old engine
  measured 14px off), and the rings and copy fade with the dark instead of cutting out (Otto's brightness measured
  steady frame by frame).
- Nothing new stored; no database change; the Privacy Policy is unchanged.

## Checked
- Fresh local non-admin sign-ups filmed on both devices (`otto-wormhole-phone.mp4`, `otto-wormhole-computer.mp4` in
  this folder, not committed); 375 Light/Night/reduced motion, 1000 Night, 1200 reduced motion, 1440 Light; every leave
  lands in the right colour; no page errors. Tests: `wormhole.test.ts` (new), `spring-curve.test.ts`,
  `handle-change.test.ts`; 4,062 pass; typecheck clean.
- Live (connectvibe.app, Franky's signed-in profile copy, deleted after, replay mode only, nothing clicked): the
  engine loads on the phone and the computer with no Content-Security-Policy refusal and no page error; the phone held
  its words, Otto formed, the words came in; the computer was caught mid-hand-over with one Otto.

## Left for later
- Franky's live sign-up test with a fresh school address (Inbox AND Junk) now also shows the arrival and the leave.
- The computer page's custom cursor sits at the top-left corner until the mouse first moves (it was there before;
  it now shows above the dark of the arrival).
