# The club's view: design board (Oct 20, 2026)

Franky's ask after the Parker meeting (`../2026-10-20-parker-meeting-notes.md`): design what a club and its officers
see and do in Vibe, phone and desktop. Board first, no building; Franky picks.

## Status, Oct 23, 2026
**Built and live.** Lines further down that say "nothing is built yet", "four waves" or "not merged" were true
when written. The full record: `../2026-10-23-session-80-club-view-shipped-and-launch-priorities.md`.
- **Wave 1** shipped Oct 21 (main `64004a1`), with the sign-up pre-registration fix. **Wave 2** shipped Oct 21
  (main `4948ce6`). **Wave 3** shipped Oct 23 (`02e0fed`, merged as `3d8d3cd`; event icons `50a49ea`).
- **Extras built Oct 21 to 23** (Franky's asks, all shipped; plans in `../2026-10-22-club-tools-arc/`): club pages
  inside the app frame on a computer, the Club tools Arc, Members only events, the Look with 10 backgrounds, and
  the phone's Club tools tray under the row.
- **The hand-over (wave 4) moved to week 1** (Franky, Oct 23), so there were three waves before launch, not four.
- **Event cover pictures** were pulled forward by Franky's Oct 23 ask: **in progress (Oct 23)** in another session;
  back to week 1 if not ready by Tue Oct 27. Icons shipped in wave 3.
- **The cut list is empty:** nothing was cut.
- **Production database changes: 11**, Oct 21 to 23, each with Franky's yes at the time:
  `20261021100000_club_officers`, `20261021110000_club_links`, `20261021120000_club_links_gate`,
  `20261022100000_password_needed_column`, `20261022110000_first_confirm_drops_password`,
  `20261022120000_no_self_service_email_change`, `20261023100000_club_meeting_time`,
  `20261024100000_org_join_request_notification`, `20261025100000_event_visibility`,
  `20261026100000_club_backdrop_presets`, `20261027100000_event_icons`. The Privacy Policy is effective
  October 23, 2026.

- **The board (private Design canvas):** https://claude.ai/artifact/FZQgjLYfoBojmPFuKF3NKe
- **Decisions:** `DECISIONS.md`.
- **Build order:** `BUILD-ORDER.md` (four waves before launch night, then weeks 1 to 3; the cut order if late). Also the `R2_Build` board.
- **Start on `Main`:** the four options, the pick (B, with D's event card and the share kit) and 11 calls, each with a recommendation.
- **What exists today, with file references:** `INVENTORY.md` (and the `Today` board).
- **The builders' brief:** `SPEC.md` (sample club, look, rules, the three jobs).

## Round 2 (Oct 20, after Franky's notes: "a lot going on", club emails, an owner tab, several clubs)
The canvas opens on Round 2 (`R2_*` boards); Round 1 is its own page.
- **The club on the phone (revised the same evening: a sixth tab crowded the bar):** no new tab. Tap your name on your profile, or hold the Profile tab, and switch to a club, like switching to a club's Instagram account; the Profile tab then becomes the club's own page, Instagram-style (banner, counts, posts, events, Edit page and Share page), with only two officer things on it: a "needs you" line and the Up next card; posting sits behind +. Desktop's "Clubs you run" opens the same page. A row in Messages and a card on the profile are drawn for comparison (`R2_Entry_Others`). Desktop: "Clubs you run" in the left nav, next to Admin (Admin stays founders-only).
- Its first screen has three things: Needs you, Up next (one card from posted to thank-you), Write to members. Everything else is in Club tools.
- **Several clubs:** the same switcher lists you first, then each club you run (phone); one nav line per club (desktop); a dot where you're needed; only clubs where you're an officer.
- **Setup:** people sign in as themselves, never with a shared club login; the club's email is optional (proof and recovery). The first 20 get a one-time setup link from Admin › Clubs, handed over in person (checks the club, gets the president past the waitlist, makes them owner).
- **Decided by Franky, Oct 20:** officers switch to their club from the Profile tab, no sixth tab. "Keep the rest of Round 2 as drawn": the one-time setup link from Admin › Clubs for the first 20, no club logins (the club's email is optional, for proof and recovery), and mods can switch with only their role's tools.
- **Every call is answered (Oct 20):** see `DECISIONS.md` (the design, Round 1's eight calls, and what each one touches). Nothing is built yet.

## Files
- `project/*.dc.html` + `project/canvas.json`: the canvas source, exactly as published.
- `project/support.js` is NOT kept here: it is the Design type's runtime (`artifact-type/dc-runtime.js`, 188 KB). To render
  locally, fetch it with the Artifact tool (`read`, `path: artifact-type/dc-runtime.js`) and save it as `project/support.js`.
- `shots/*.png`: each board as rendered locally on Oct 20 (what was published).
- `render.mjs` (one board to `shots/`) and `clip.mjs` (a horizontal band of a tall board) use gstack's playwright-core.
  A "Fetch API cannot load file://" console error and `{{…}}` SVG path warnings are normal.

Nothing here touches the app. Sample club and people are invented (Sixty-Four Chess, the same cast as the app screens).

**Wave 1 built Oct 20 (branch `claude/club-wave-1-ae4772`):** `../2026-10-20-club-view-wave-1.md` (what shipped, what Franky approves, reviews); how it's built: `WAVE1-DESIGN.md`.

**Wave 2 built Oct 21 (branch `claude/cool-jang-f223da`, not merged):** `../2026-10-21-club-view-wave-2.md` (what's built,
what Franky approves: one migration, the policy date, the merge); how it's built: `WAVE2-DESIGN.md`.

**Wave 3 shipped Oct 23 (main `02e0fed`, merged as `3d8d3cd`; event icons `50a49ea`):**
`../2026-10-23-club-view-wave-3/HANDOFF.md` (what shipped, the live checks); the plan: `../2026-10-23-club-view-wave-3/PLAN.md`.
