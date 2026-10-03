# Skeptic verdict: realtime-zoom

```json
{
 "method": "realtime-zoom",
 "reproduced": true,
 "resolution": "780x1688",
 "fps": 60,
 "trueHiRes": true,
 "animationsAtTrueSpeed": true,
 "eventsPaneShownAtEnd": true,
 "duplicateFramePctDuringScroll": 1.7,
 "wallClockSecPerVideoSec": 2.2,
 "scores": {
  "sharpness": 9,
  "smoothness": 9,
  "fidelity": 8,
  "robustness": 6,
  "easeOfDrivingA30sTake": 7
 },
 "recommend": true,
 "appBehaviourIssues": [
  "Returning to /campus from the tab bar shows a 'Chat' chip (Feed, Events, Orgs, Chat, Map) for about a quarter of a second before it disappears. I reproduced this in my own run of the walk (f/walk-return.png). Club chats are meant to be out of the campus section, so this flash would be on film.",
  "Returning to /campus also shows the grey loading skeleton for roughly half a second before the feed appears.",
  "On a cold first load of the landing page the headline is drawn in a fallback font for 0.43 s, then jumps from two lines to three when the real font arrives (the body font swaps at 0.33 s). The author said about 130 ms. Running with WARM=1 removed it completely in my run.",
  "While the feed scrolls, the Feed / Events / Orgs / Map chips float over the posts with no backing, so a post's like and comment buttons show through between the chips (f/n282.png).",
  "The bottom tab bar is slightly see-through with no blur, so post text is readable behind the Campus / Network / Messages labels. The lossless reference screenshot shows the same, so it is the app, not the capture.",
  "The orange + button sits on top of a post's three-dot button when a card lands in the bottom right (f/n200.png).",
  "The first three posts in Franky's feed are text only; the first picture only appears after scrolling about 500 px.",
  "Searching 'blitz night' from the campus search returns 'No matches', although Blitz Night is the first event card.",
  "Franky's profile shows the initials 'FC' rather than a photo.",
  "The console logs a hydration error on /campus (a button nested inside a button: the feed card and its 'More actions'). The dev overlay is hidden so it does not show on film."
 ]
}
```

**Verdict: recommended, with three conditions.** The method reproduced from a clean folder and my own measurements support the author's main claims. It is a real-time method, so a busy machine goes straight into the film, and nothing in the script stops that.

Everything below was measured by running it unless marked as read in code. All work is in `/private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/verify-realtime-zoom/` (`out.mp4`, `out-warm.mp4`, `out-stress.mp4`, stills in `f/`, measuring scripts in `m/`).

**1. Reproduction**
- **Run:** `node reel.mjs` from the clean copy exited 0 in 18.7 s (14.0 s filming, 3.6 s encoding) at load average 4.7.
- **Second run:** with `WARM=1` it took 20.3 s.
- **Cost:** about 2.2 s of wall clock per second of video.

**2. The file**
- H.264 High, yuv420p, 780x1688, constant 60 fps, 505 frames, 8.417 s, 4.2 MB.

**3. Sharpness: really 2x**
- **Round trip:** a resting feed frame scaled to half and back kept only 26.5 dB PSNR / SSIM 0.952. A control frame I deliberately upscaled kept 37.0 dB / 0.993 in the same test, so the detail is real.
- **By eye:** 13 px grey text is crisp at full size (`f/crop-text-pair.png`), and a mid-scroll frame with a photo is equally sharp.
- **Colour:** the values stored in the file match a lossless reference screenshot to within 1 level.
- **Not pixel-identical to the existing recipe:** against a `lib.mjs` phone-emulation screenshot, some text rows sit 1 to 2 device px differently. It is invisible on film.

**4. Smoothness**
- **Scroll down:** 118 consecutive frames all moved, with no frozen frame between first and last movement. The total was exactly 900 CSS px.
- **Shape and length:** the motion fits the ease curve at 2.000 s with 0.45 px rms error (about 0.4 ms of timing jitter). The largest frame-to-frame jump was 3 px.
- **Duplicates:** 2 of the 121 frames in the 2.0 s window (1.7%), both at the very ends where the ease moves under a pixel.
- **Repeatability:** my second run had 1 frozen frame of 119; the author's own file had 0.
- **Scroll up:** 36 of 37 frames new.

**5. Fidelity**
- **Lights:** they reach half brightness at 650, 783, 950, 1200, 1317 and 1450 ms. That is 800 ms first to last, against 850 ms from the page's formula (170 ms per light, read in `night-sky.tsx`).
- **Moons:** the sky changed in every one of the last 59 frames of the scene.
- **Landing repeats:** 2 repeated frames of 180 cold, 4 warm.
- **Tap and end state:** the tap dot is visible on the Events chip for about 14 frames before the pane slides. The Events pane with "Blitz Night" is on screen at the end.
- **Overlay:** the Next dev overlay is absent.

**6. Robustness**
- **Under full load:** with 12 busy-loop processes on the 12 cores (load 36), 42 of 118 scroll frames froze, the landing had 19 repeats, and encoding took 13.8 s.
- **No alarm:** the script still exited 0. Only `out.stats.json` showed the damage (77 new pictures of 122).
- **Under moderate load:** the multi-screen walk ran clean at load 22, straight after the stress test.
- **Dependencies (read in code):** it needs full Chromium (`channel: "chromium"`) and an experimental Chromium switch for 60 Hz. Both worked here.

**7. Driving a 30-second take**
- **What ran:** the author's read-only walk passed every step from my copy: Orgs chip, SAE by client-side navigation, scroll, Messages list, Profile, back to Campus, search with typing. It gave 15.4 s of film in 27.5 s wall clock.
- **Not tried by either of us:** opening a chat thread or sending a DM, because both write to the database.

Weak points, read in `capture.mjs`:
- **Page loads are filmed as they happen.** `go()` waits only for the address to change, so skeletons and flashes land on film. Hide them by pre-visiting routes off camera or by cutting segments.
- **`settle()` can stall.** It waits for network idle and then 350 ms with no new frame. A screen that polls or animates forever waits the full 10 s (the timeout is swallowed) unless called with `quiet: 0`.
- **No clean-up helper.** A sent DM, and probably the read mark from opening a thread, must be removed the way `record.mjs` does with psql.
- **Incoming messages need a second actor.** A live reply needs another signed-in browser or a database insert.
- **No finger drags.** Scrolling sets scrollTop from script, so the chat week swipe would need a new helper.
- **No on-screen keyboard.** Typing shows text appearing with the composer staying put.
- **Cut times are worked out by hand.**

**Conditions for using it**
- **Make `WARM=1` the default** so the landing never shows the fallback font.
- **Add a guard** that fails the take when new pictures fall below about 95% of slots in any moving window, then re-take.
- **Film on a quiet, awake Mac.**
