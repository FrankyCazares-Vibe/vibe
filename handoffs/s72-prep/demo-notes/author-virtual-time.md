VIRTUAL-TIME PROTOTYPE: works, but only as a hybrid (virtual clock plus a page shim). `out.mp4` is real 780x1688 at a constant 60 fps. `REPORT.md` is NOT on disk: the harness refused a report file from a subagent, so this message is the report.

Folder: `/private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/proto-virtual-time/`
Files: `capture.mjs` (module), `shim.mjs` (the in-page half, imported by `capture.mjs`), `reel.mjs`, `verify.mjs` (measures the finished file), `out.mp4`, `results.json` (per-frame numbers), `exp/` (experiments e1 to e7, variant videos, contact sheets).

All numbers were taken on the shared machine at load average 4 to 8, so wall-clock figures are pessimistic.

**What plain virtual time controls (ran, `exp/e1.mjs`, both builds)**
1. `performance.now()`, `Date.now()` and timers follow the virtual clock: +16.5 to 16.8 ms per step.
2. The `requestAnimationFrame` timestamp and `document.timeline` (CSS animations, transitions) do NOT. They ran on real time (464 to 4976 ms across 1500 ms of virtual time), and rAF fired 3 to 7 times per step.
3. Native smooth scroll is not controlled either (inferred from Chromium's design, not measured). The Events chip uses one (`CampusMobile.tsx:783`).
4. So virtual time alone cannot record this app. The landing canvas subtracts a `performance.now()` start from the rAF timestamp, which mixes the two clocks.

**What the shim adds to make it work (ran)**
5. rAF becomes a queue that Node flushes once per frame with the virtual time.
6. The timeline is frozen with `Animation.setPlaybackRate 0`, and every running animation is seeked one frame per step.
7. Smooth scrolls are replaced by a rAF scroll on Chromium's curve, with scroll snapping switched off while it moves.
8. A native rAF heartbeat repaints one pixel per real frame. Without it `Page.captureScreenshot` hangs forever once the timeline is frozen and a CSS animation runs (`exp/e3.mjs`, `e4.mjs`).
9. `Page.captureScreenshot` ignored the Playwright context's scale factor and returned 390x844. It needs `Emulation.setDeviceMetricsOverride` on the same protocol session.
10. Controlled proof (`exp/e2.mjs`, 60 frames, both builds):
    - 0 frames out of step.
    - A linear keyframe bar moved 4.95 to 5.04 px per frame (5.000 expected), and the picture matched computed style within 0.03 px.
    - A 500 ms transition ended 516.7 ms after it was triggered.

**The reel (ran: `node reel.mjs` from another working directory)**
11. File: H.264, yuv420p, 780x1688, 497 frames, 8.283 s, every frame 0.016667 s. Scene 1 is 180 frames. Scene 2 is 317 frames, which is 5.28 s because the finger dot shows for 0.18 s before the touch.
12. Speed: 36.1 s wall, 63 ms per frame, of which 61 ms is the PNG screenshot. No step had to be forced.
13. Lights, measured in the finished mp4: first glow at 367 ms, then gaps of 167, 167, 183, 150, 183 ms (code says 170 each). First to last is 850 ms (code: 850).
14. CSS fades: hero copy opacity 0.012 on frame 0, reaching 1 at 700 ms. Light labels start at 933, 1100, 1267, 1433, 1600, 1783 ms (CSS: 0.9 s + 0.17 s each).
15. Scroll down: 120 frames, 117 different positions (the eased ends move under a pixel), 119 different pictures, 0 to 900 px, biggest step 15 px, never backwards. Scroll up: 36 of 36.
16. Events tap: the dot is visible, the pane slides 2 to 390 px over 19 frames (317 ms), and the "Blitz Night" card is on screen at the end. No Next overlay, no page errors.
17. No DB writes from the page: the signed-in session runs `readOnly`, which refused the app's own `POST /api/me/heartbeat` four times. Signing in still uses the cookie tool, which creates a local auth session.

**Variants (ran, same reel)**

| Variant | ms per frame | Wall |
|---|---|---|
| 2x PNG, headless shell (the default) | 63 to 66 | 36 to 40 s |
| 2x JPEG q95 | 45 | 27 s |
| 3x PNG (1170x2532) | 129 | 72 s |
| 3x JPEG | 96 | 52 s |
| 2x PNG, full Chromium | 59 | 35 s |

18. JPEG frames gave a bigger mp4 (5.3 MB against 3.7 MB) and I did not compare picture quality; PNG is the default.
19. 3x costs about twice the time; the landing canvas caps itself at 2x, so only text and UI gain.
20. Both builds behave the same with the shim. The shell is the default.

**Longer trial (ran, `exp/e7.mjs`, read-only)**
21. Route: feed, Orgs chip, SAE page, Messages tab, SAE club space, James DM with a typed line (not sent), Profile tab. The three page changes are client-side routes.
22. 15.9 s of video in 52 to 55 s wall, 0 forced steps, 0 page errors. The app's "mark thread read" POST was refused as well as the heartbeat.
23. Data loads take zero video time, because the clock pauses while a fetch is pending. Navigation looks instant, which suits "a little faster".

**What does not work or was not tested**
24. Not on the virtual clock: `<video>` playback, animated images, touch flings, anything inside an iframe. Use `glide()` instead of swipes. None of these were exercised.
25. Supabase realtime was never exercised: the only websocket the app opened was Next's HMR socket, even in chat. It did not hold the clock. No service worker registers in dev.
26. Playwright's auto-waiting calls can stall on a frozen clock. Use the module's `settle`, `waitFor` and `navigate`, which step frames while they wait.

**What a 30-second take needs**
27. About 1800 frames: roughly 2 minutes at 2x PNG or 4 minutes at 3x on this loaded machine.
28. Decide whether to keep `readOnly`. With it, the header's "active now" count will not include Franky, and unread markers never move.
29. Off-camera, scroll through each screen once first so lazy images are decoded (I did not test this; image decode is not tied to the clock).
30. Selectors as in `notes/chat.md`. Franky is not in Chess Club, so the club row is `/^SAE,/`.