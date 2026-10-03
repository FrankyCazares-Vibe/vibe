# Skeptic verdict: virtual-time

```json
{
 "method": "virtual-time",
 "reproduced": true,
 "resolution": "780x1688",
 "fps": 60,
 "trueHiRes": true,
 "animationsAtTrueSpeed": true,
 "eventsPaneShownAtEnd": true,
 "duplicateFramePctDuringScroll": 2.5,
 "wallClockSecPerVideoSec": 5.9,
 "scores": {
  "sharpness": 9,
  "smoothness": 9,
  "fidelity": 7.5,
  "robustness": 7,
  "easeOfDrivingA30sTake": 7.5
 },
 "recommend": true,
 "appBehaviourIssues": [
  "Route changes flash a loading skeleton for 1-2 frames (Messages: frames 338-340, Profile: frame 836 of the longer trial). This is a capture artifact: data loads take zero video time, so the skeleton that would normally sit for a few hundred ms becomes a one-frame flicker. The driver has to stop recording across each route change or wait before resuming.",
  "The /campus page logs a hydration error in the console (a <button> nested inside a <button>). It is what triggers the two POST /__nextjs_original-stack-frames requests. The overlay is hidden, so it does not show on camera.",
  "Feed text shows through the bottom tab bar (the bar is 96% opaque with no blur), so a post's lines are legible behind the Campus/Network/Messages labels. Same in an ordinary screenshot, so it is the app, not the capture.",
  "The orange + button sits on top of a post's three-dot button near the bottom of the feed.",
  "Header subtitle is cut off: '13 at IU Bloomington \u00b7 1 acti...'. Orgs rows are cut off too ('Tower...', '@sae \u00b7 Invite only \u00b7 3 me...').",
  "The top of the feed is three text-only posts; the first picture only appears after roughly 500 px of scrolling. Cast avatars in the feed are initials, not photos.",
  "The SAE org page shows an empty rounded panel (blank banner area) above the logo.",
  "With the read-only switch on, the app's presence heartbeat and 'mark thread read' calls are refused, so 'active now' will not count Franky and unread markers never clear.",
  "The page fetches its fonts from fonts.googleapis.com / fonts.gstatic.com, so the capture needs internet even though everything else is local."
 ]
}
```

VERDICT: the author's claims hold up. Recommended, with three things to fix before a real take (skeleton flashes, no watchdog, read-only gap).

Everything is in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/verify-virtual-time/ (my clean copy; nothing in the repo, the worktree or the prototype folder was touched; no commits, no server restarts).

WHAT I RAN

1. Reproduction. Copied the four .mjs files only (no out.mp4), ran `node reel.mjs`: exit 0, 48.8 s wall at load average 5-6, 497 frames, 0 forced steps, 0 page errors.

2. File shape (ffprobe). H.264 High, yuv420p, 780x1688, 60/1 fps, 497 frames, 8.283 s, every frame 1/60 s. Scene 1 is 180 frames (3.0 s); scene 2 is 317 frames.

3. Is it really 2x? Yes.
- Feed-at-rest frame 200, scaled to half and back: PSNR 27.9 dB, SSIM 0.955 (it loses a lot, so the detail is real).
- Control, the same frame deliberately faked as an upscale: 39.8 dB, SSIM 0.994.
- An ordinary Playwright 2x screenshot of the same screen gives 27.9 dB on the same round trip, and matches the video frame at SSIM 0.989.
- I looked at small text at 4x zoom: edges sit on the 2x pixel grid.
- 3x also reproduced (`SCALE=3`): 1170x2532, 71.6 s wall. It loses 6.5 dB more going through 1/3 than through 2/3, so it holds real 3x detail.

4. Smoothness.
- Scroll down (frames 222-341): 3 of 120 frames repeat the one before (223, 339, 341) by both mpdecimate and an exact frame-to-frame difference. All three are at the eased ends, where motion is under one device pixel.
- Visible motion runs from frame 224 to 341, which is 1.97 s. Scroll up: 0 repeats in 36 frames.
- Holds are perfectly still (difference below 0.003).
- Against the author's file, about 10 scroll frames differ by one device pixel (PSNR about 22 dB on those frames, above 47 elsewhere). That is rounding of the 0.1 ms clock, not a glitch; each run is smooth on its own.

5. Fidelity.
- Lights, measured in my mp4: first glow at 367, 533, 700, 883, 1033, 1200 ms. The code (night-sky.tsx line 132) says 350 + 170 per light.
- Frames at 0.2 / 0.8 / 1.5 / 2.8 s show 0, 3, 6 and 6 lights, with labels by the end.
- The moon on the "Tonight" light travels along its orbit between frames 120 and 179.
- Tap dot is visible for 11 frames before the touch.
- The Events pane with "Blitz Night" is on the last frame.
- No Next overlay.
- The feed shows two photo posts by the end of the scroll.

6. Events pane slide. It is the shim's imitation of a smooth scroll, not the browser's own. I measured the real one in an ordinary browser: 308 ms, against 317 ms in the video. Duration is right; the real curve is more front-loaded with a longer tail. Not noticeable.

7. Longer trial. `exp/e7.mjs` reproduced: 955 frames (15.9 s) in 52.6 s wall, 0 forced steps. It covers feed, Orgs chip, SAE page, Messages, SAE club space (reached from Messages, not Campus), a James DM with a typed line (not sent) and own profile. Typing appears one key at a time and the caret behaves normally. It does not visit another person's profile, and nothing was sent.

8. Stall probe (hang.mjs). The author's claim 26 is too cautious: ordinary Playwright calls (`tap`, `hover`, `scrollIntoViewIfNeeded`, `waitForSelector`, `page.screenshot`) all returned in under 110 ms on the frozen clock. They only stall when the thing they wait for needs the page's clock to move.

9. Realtime. The author's claim that no realtime socket is opened is true in an ordinary browser as well: in Messages and inside a DM the only websocket is Next's HMR.

WEAK POINTS FOR A 30-SECOND TAKE

- Skeleton flashes on route changes: see the first item in appBehaviourIssues. `navigate()` keeps recording while it settles.
- No watchdog. `Page.captureScreenshot` has no timeout (read in capture.mjs line 186). The author says it hangs forever without the one-pixel heartbeat; if it ever hangs, the whole take hangs silently.
- The read-only switch only covers localhost:3102 (capture.mjs line 126). A write sent straight from the browser to Supabase on 127.0.0.1:54321 would pass. None happened in my runs: the only non-GET requests logged were the heartbeat, mark-read and Next's stack-frame call.
- Sending a DM line was not run by me or the author. It needs read-only off and a database clean-up afterwards, as record.mjs does. The bubble would appear with zero delay.
- Not on the virtual clock: video, animated images, touch flings and swipes (the chat's week swipe would need a scripted drag). None were exercised.
- It is a hybrid: a 140-line page shim replaces requestAnimationFrame and every scroll call and freezes the animation timeline. It works on Chromium 145 today; an app change (a library reading document.timeline, a native scroll the shim does not patch) could break it quietly.
- One cosmetic effect: at the tail of the hero text's rise the text moves in whole device pixels (uneven frame-to-frame change over frames 19-34).

SPEED
- Reel at 2x PNG: 5.9 s wall per video second, including launch and page loads.
- Longer trial: 3.3.
- 3x: 8.6.
- A 30 s take is roughly 2-3 minutes at 2x.
