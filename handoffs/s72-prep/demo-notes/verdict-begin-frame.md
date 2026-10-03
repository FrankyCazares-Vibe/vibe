# Skeptic verdict: begin-frame (in fact a virtual-time frame stepper: real begin-frame control is refused by Chrome on macOS, so this is a labelled fallback)

```json
{
 "method": "begin-frame (in fact a virtual-time frame stepper: real begin-frame control is refused by Chrome on macOS, so this is a labelled fallback)",
 "reproduced": true,
 "resolution": "1170x2532 (real 3x of 390x844); also ran at 2x = 780x1688",
 "fps": 60,
 "trueHiRes": true,
 "animationsAtTrueSpeed": true,
 "eventsPaneShownAtEnd": true,
 "duplicateFramePctDuringScroll": 3.3,
 "wallClockSecPerVideoSec": 9.8,
 "scores": {
  "sharpness": 9,
  "smoothness": 9,
  "fidelity": 8,
  "robustness": 5,
  "easeOfDrivingA30sTake": 6
 },
 "recommend": true,
 "appBehaviourIssues": [
  "Taps can miss under CPU load. The author's own multi-screen script (extra.mjs) failed 1 of 3 runs on my machine: the Search tap did nothing and the take recorded 758 dead frames before timing out. I reproduced it with 14 CPU hogs running (1 miss in 8): a frame was stepped between touch-down and touch-up and the click went to a DIV instead of the button. A variant that sends down and up with no step in between landed 10 of 10 under the same load, but the one miss was a first tap in a fresh browser, so that is suggestive, not proof.",
  "A missed tap is only caught if the script waits for a result afterwards (take.until). A tap followed by a plain hold would silently film the wrong screen.",
  "Nothing may be awaited on the page directly: the page is frozen between frames, so any Playwright call that waits (locator.click, waitFor, waitForURL) hangs unless wrapped in take.pump or take.until.",
  "Waiting on camera adds frames: while take.until waits for a route or a row, the video keeps rolling, so slow dev-server compiles become dead air (or, more often, look 4-9x faster than real because the network is on the wall clock).",
  "Swipes, drags and long-presses are not drivable: the browser's gesture detector runs on the wall clock (read in code, not tested). That rules out the club chat week swipe and swiping between campus panes; taps, scrolls and typing only.",
  "The pane slide after a chip tap, and any other smooth scroll, is the prototype's own JS re-creation of Chromium's smooth scroll (with scroll-snap switched off during the ride), not the browser's own animation. requestAnimationFrame and every CSS animation are likewise driven by an injected shim.",
  "The page's clock falls behind the real clock during a take (about 3.5 minutes over a 30 s take at 3x). A sent DM gets a server timestamp ahead of the page's clock; effect on the 'just now' label or message order is untested.",
  "Opening a DM or club chat and sending a line were never exercised by the author or by me (they write to the database). Chat uses a 4-second poll on the page clock (read in src/lib/chat/use-room-poll.ts); on /messages the only websocket I saw was Next's HMR socket, so there is no realtime socket to time out.",
  "Loading the feed makes the app record post views (the eye counter shows 1 on Priya's post in my frames): an app write, not a tap by the script.",
  "The landing sky canvas caps itself at 2x, so at 3x the sky is 2x art; text and UI are true 3x.",
  "The process hangs about 15 s after finishing every run (un-cleared 15 s timers in capture.mjs _advance; inferred from the code and from process time minus take time being 15.6-17 s on every run).",
  "Runs are not pixel-identical: 0 of 180 hero frames matched between the author's run and mine. Timing matched."
 ]
}
```

VERDICT: recommended, on conditions. The picture quality claims all held up when I measured them myself. The weak side is reliability over a multi-screen take, where I found one real fault the author did not report.

Conditions: fix the tap (send touch-down and touch-up with no frame step between, and check each tap landed), no swipes in the script, and budget for a retake or two.

Note for the orchestrator: this is not begin-frame. Real begin-frame is refused on macOS (I only read the author's probe/p1.out, I did not re-run it). What was built is a virtual-time stepper with in-page shims, so it probably overlaps the separate "virtual-time" prototype and the two should be compared directly.

WHAT I RAN (all in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/verify-begin-frame/)

1. Reproduction
- Copied only the scripts and ran `node reel.mjs`: exit 0, a playable out.mp4.
- A second run at 2x also passed.

2. ffprobe
- H.264 High, yuv420p, 1170x2532, constant 60 fps (all 497 frame gaps are 0.01667 s), 498 frames, 8.30 s, 5.96 MB.

3. Speed
- 3x: 81.6 s end to end for 8.3 s of video, which is 9.8 s per video second. Inside the take it is 65.9 s (7.9 per video second); the rest is the exit hang.
- 2x: 54.6 s end to end (38.9 s in the take).
- Screenshot cost depends on the page: about 116 ms per frame on the feed at 3x, about 41 ms on Messages.
- A 30 s take is roughly 2-4 minutes at 3x.

4. Really high resolution: yes
- Feed frame at rest, scaled to half and back: PSNR 30.2 dB, SSIM 0.972. Via 390 px wide: 26.5 dB.
- Control: a deliberately faked frame (upscaled from 1x) survives the same round trip at 44.9 dB; one faked from 2x at 36.3 dB.
- I also looked at a full-size crop of the small grey handle text: crisp, clearly unlike the fake.

5. Smoothness
- Scroll down occupies frames 222-341, exactly 2.0 s; visible motion spans 1.95 s.
- 4 of 120 frames repeat the one before (222, 224, 340, 341), all at the slow ends of the ease, because scroll positions land on whole CSS px. The author said 3.
- Scroll up: 36 of 36 frames distinct, 0.6 s.
- Scene 1: every frame differs from the last. mpdecimate's default thresholds call 29 of them duplicates, but that is its tolerance for faint dust movement, not real repeats.

6. Fidelity
- Lights: measured from the mp4's pixels, they first brighten at frames 25, 33, 42, 53, 64, 76. That is a mean of 170 ms apart, matching night-sky.tsx (350 ms + 170 ms each). The 2x run gave the same.
- At 0.2 s the sky is dark, at 0.8 s three lights are on, at 1.5 s all six with labels fading in, at 2.8 s all are lit.
- The moons move (crops at frames 90, 168, 179).
- Feed posts with pictures are visible mid-scroll.
- The tap dot is visible over the Events chip in frames 396-410, then the pane slides.
- The final frame shows the Events pane with the "Blitz Night" card.
- No Next overlay in any frame I looked at.

7. Multi-screen
- extra.mjs (search, type "rylan", his profile, Messages home): failed on run 1, passed on runs 2 and 3. Details of the tap fault are in the issues list.

DRIVING A 30-SECOND TAKE (from reading capture.mjs, plus the runs above)
- The helper API is decent: goto, settle, hold, scroll, tap, type, until, pump, onScreen.
- Feed, Events, Orgs, profiles and the Messages home are within reach.
- A profile shows its loading skeleton for a few frames on camera.
- The weak points, with detail, are in the issues list: taps under load, everything waiting through pump/until, dead frames while waiting on camera, no swipes, the untested DM and club chat open and send (plus cleanup of the sent line, as record.mjs does), and the lagging page clock.

My own diagnostics in that folder: lights.mjs, diag-tap.mjs, diag-tap2.mjs, diag-ws.mjs, fr/*.png, diffs.tsv, run1.log, run2x.log, extra*.log.

Nothing in the repo or the landing worktree was touched; no server was restarted; local stack only.
