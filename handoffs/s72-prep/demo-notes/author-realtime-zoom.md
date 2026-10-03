The method works: `out.mp4` is a true 2x film (H.264, yuv420p, 780x1688, constant 60 fps, 505 frames, 8.42 s, 4.08 MB) of a page laid out at 390x844 with devicePixelRatio 2. `REPORT.md` was NOT written: the harness refused report files, so this summary stands in for it and the numbers sit in the JSON files listed at the end.

Everything below was measured by running it unless marked as read in code. The machine was shared throughout (load average 4.6 to 16), so real-time numbers may be pessimistic.

**How it gets sharp**
- **Zoom at 200%:** a throwaway profile with `partition.default_zoom_level` = 3.8018 and a 780x1688 viewport at deviceScaleFactor 1 gives innerWidth 390, devicePixelRatio 2, `(max-width: 400px)` true and 780x1688 screencast frames.
- **Per-host zoom:** `per_host_zoom_levels` for "localhost" gives identical frames.
- **Two conditions:** it needs full Chromium (`channel: "chromium"`); the old headless shell ignores the zoom. It must not be `isMobile`, which cancels the zoom. Taps still land in CSS px.
- **Second route (`mode: "dsf"`):** `--force-device-scale-factor=2` plus the ordinary phone emulation with isMobile gives the same frames and the same counts.
- **Hold the page to 60 Hz:** this Mac runs pages at 120 Hz and the screencast kept only 94 to 100 of each 120 frames, unevenly. `--enable-features=ThrottleMainFrameTo60Hz` gives 60 even frames a second, all kept (default in `capture.mjs`).

**The reel (final run, load 5.7)**
- **Wall clock:** 22.1 s (14.4 s filming, 7.7 s encoding); other runs took 18.3 to 18.7 s.
- **Scroll down:** 118 frames sent in 2.014 s; 119 new pictures in 121 output frames. The 2 repeats are the first and last frame of the ease. Longest gap 19.9 ms. All five 2x reels gave 119.
- **Scroll up:** 36 new of 37.
- **Landing:** 177 new of 180, with one real 59 ms hitch at hydration.
- **Timing error per picture in the scroll:** mean 2.85 ms, worst 3.62 ms.
- **Requirements:** dev overlay hidden, finger dot visible, Blitz Night card on screen at the end, no DB writes.

**Lights and CSS at true speed (read back from the file)**
- **Lights:** they appear at 433, 600, 750, 933, 1083 and 1267 ms; the page's formula says 392 + 170 per light. First to last is 834 ms against 850.
- **CSS fade:** the hero copy's 0.7 s fade keeps changing until 583 ms, then holds.

**Encoding (same captured frames, mid-scroll stills)**
- **This prototype (H.264 crf 14, 60 fps):** PSNR 44.7 dB, SSIM 0.990, about 10 Mbit/s in the scroll.
- **Playwright's recorder settings (VP8, 1 Mbit/s, 25 fps; settings read in its code):** 32.9 dB, SSIM 0.925, card borders smeared away.

**Limits**
- **3x is not free:** at 1170x2532 the scroll kept 112 of 121 and encoding took 8.6 s.
- **Real time cannot be re-rendered:** a busy machine or a sleeping Mac shows up in the film. One 25 s test dropped 3 of 1,500 frames.
- **Zoom mode is not mobile emulation:** `screen.width` reads 780. Rendering matched dsf mode (45 to 47.6 dB between the two films).
- **Cold landing load:** the fallback font shows for about 130 ms; `WARM=1` avoids it.
- **No iOS keyboard or status bar.**
- **The 60 Hz switch is a Chromium feature flag** and could disappear in a later build.
- **App issue seen in the walk:** returning to `/campus` by the tab bar briefly shows a "Chat" chip (Feed, Events, Orgs, Chat, Map) during the skeleton, then it goes. See `check/walk-campus-return.png`.

**What a 30-second take needs**
- A read-only walk already ran clean: Orgs, SAE by client-side navigation, Messages list, Profile, search with typed text; 15.75 s of film, 5.4 s to encode.
- **Not tried:** opening a chat thread or sending a DM. I skipped them because they would write to the database; the take must clean up after itself the way `record.mjs` does.
- **Disk:** about 0.5 MB per changing frame, up to roughly 1 GB for 30 s, deleted after encoding.
- **Settling:** a screen with a perpetual animation needs `settle({ quiet: 0 })`.
- **Cuts:** keep each cut under a minute; the 60 fps grid is aligned per cut (phase moved 0.3 ms over 25 s).

Files are in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/video/proto-realtime-zoom:
- capture.mjs
- reel.mjs
- verify.mjs
- out.mp4
- out.stats.json
- check/out-verify.json
- probe/encode-quality.json
- probe/walk-zoom.json
- variants/