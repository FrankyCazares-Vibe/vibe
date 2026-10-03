**begin-frame prototype: the real method is blocked on macOS; a labelled fallback produced the reel at true 3x.**

1. **Blocked (ran it):** Chrome 145 headless shell answers `Target.createTarget {enableBeginFrameControl:true}` with "BeginFrameControl is not supported on MacOS yet". On an ordinary target `HeadlessExperimental.beginFrame` never replies, and full Chrome refuses too (`probe/p1.out`).
2. **What would unlock it:** a Linux Chromium in Docker. I did not try it: it needs a download nobody approved, and Linux fonts and emoji would not look like an iPhone.
3. **Fallback, "virtual-time stepper":** the page clock is paused and advanced exactly 1/60 s per frame, then one PNG screenshot is piped to ffmpeg. It needs four pieces:
   - `Emulation.setVirtualTimePolicy` for `performance.now`, `Date.now` and timers.
   - `Animation.setPlaybackRate(0)` plus an in-page seek of every CSS animation and transition each frame.
   - `requestAnimationFrame` replaced by a queue run once per frame.
   - Smooth scrolling re-done in JS on the same clock.
4. **Why all four (ran):** virtual time alone leaves rAF timestamps and CSS animations on the wall clock (`probe/p2b.out`). With all pieces, six test boxes driven six different ways sat exactly where expected after 500 ms of page time, with 80 ms of real time wasted per frame (`probe/p3.out`).
5. **`out.mp4` (ffprobe):** H.264 High, level 5.1, yuv420p, 1170x2532 (real 3x), constant 60 fps, 498 frames, 8.30 s, 6.25 MB.
6. **Wall clock:** 76 s for the 3x reel, about 132 ms per frame (123 ms of that is the screenshot), 9.2x slower than real time. At 2x it took 35–37 s, about 60 ms per frame. All timings were taken under load (load average 6–17), so they are pessimistic.
7. **Unique frames:** scroll down 117 of 120 captured (120 of 120 distinct in the mp4), scroll up 36 of 36, hero scene 180 of 180. The three repeats are at the slow ends of the ease, because Chromium rounds script-set scroll positions to whole CSS px.
8. **Lights at true speed (read from the mp4's pixels):** the six lights first brighten at frames 21, 31, 41, 52, 62, 72. That is a fitted 171 ms apart against 170 ms in `night-sky.tsx`, with the first at 0.35 s against 350 ms in the code. The page clock advanced 2983.2 ms over 179 frames (expected 2983.33). Frame 0 is dark because the clock is held nearly still during load (about 21 ms passes).
9. **CSS runs on the page clock (per-frame probes):**
   - Hero copy rise finishes at frame 40–41 (CSS: 42).
   - Label fades start at frames 53, 63, 73, 83, 94, 104 (CSS: 54 + 10.2 per label).
   - Finger dot fades in 33 frames (CSS: 0.55 s = 33).
   - Pane slide after the Events tap takes 20 frames (Chromium's own rule gives 19.7).
10. **Sharpness:** the steepest text-edge luma step is 209 of 255 natively, against 78 for the same frame squeezed to 390 px wide and scaled back up (`runs/crop-compare.png`).
11. **End state (ran):** "Blitz Night" is on screen at x 39, y 154; the Next overlay is hidden; no page errors.
12. **App behaviour that broke under this method:**
    - Native smooth scroll runs on the wall clock: the pane slide collapsed to about 5 frames at 2x until I replaced it (`runs/native-scroll-2x.*`).
    - A page load stalls completely while the clock is paused, so every wait must go through `take.pump` or `take.until`.
    - Screenshots hang with the animation timeline frozen unless the browser has `--run-all-compositor-stages-before-draw` (`probe/p3g.out`).
    - A second DevTools session returns 1x screenshots until it is given the device override itself.
    - Tap down and up must be sent back to back in real time, or the browser reads a long press.
13. **Still on the wall clock:** gesture detection (swipes, drags, long-press), video, animated images, and the network (fetches look 4–9x faster on camera).
14. **Other limits:**
    - The landing canvas caps itself at 2x, so at 3x the sky is 2x art and only text and UI are true 3x.
    - Two runs match in speed but are not pixel-identical (86 of 180 hero frames identical).
15. **DB writes:** the reel taps nothing that writes, but loading the feed makes the app record post views (an eye counter showed "1" on Priya's post).
16. **Multi-screen check (`extra.mjs`, ran at 2x, 425 frames, no errors):** search, then "rylan" typed at 5 frames per key, then a client-side jump to Rylan's profile (URL changed 6 frames after the touch), a profile scroll, and the Messages home.
17. **Not exercised:** opening a DM or club chat (it would mark them read), sending a message, swipes, Orgs, and the Events pane beyond the tap.
18. **What a 30-second take needs:**
    - Time: 1800 frames is about 4 minutes of wall time at 3x, or about 2 minutes at 2x, plus loads.
    - Every wait written as `take.until` or `take.pump`.
    - On-screen locator picks: feed cards carry people's names too, which broke my first profile tap.
    - Cleanup of any sent message, as `record.mjs` already does.
    - Its own timing for any swipe.
19. **`REPORT.md` was not written:** the harness refuses report files from subagents. The same facts are in `out.measurements.json`, the header of `capture.mjs`, and `probe/*.out`.
20. **Nothing outside the prototype folder was touched:** repo and worktree untouched, no server restarted, local stack only.

Files are in `/private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/proto-begin-frame/`:
- out.mp4
- capture.mjs
- inpage.js
- reel.mjs
- analyze.mjs
- extra.mjs
- out.measurements.json
- out.frames.json
- runs/crop-compare.png

`node reel.mjs` was confirmed from a clean folder holding only `reel.mjs`, `capture.mjs` and `inpage.js`.