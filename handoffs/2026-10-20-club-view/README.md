# The club's view: design board (Oct 20, 2026)

Franky's ask after the Parker meeting (`../2026-10-20-parker-meeting-notes.md`): design what a club and its officers
see and do in Vibe, phone and desktop. Board first, no building; Franky picks.

- **The board (private Design canvas):** https://claude.ai/artifact/FZQgjLYfoBojmPFuKF3NKe
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
- **Still open (Round 1's calls):** what mods can do inside the club, the members' link past the waitlist, flyers on the Board, notices for posts and events, the share kit, Events first on the club page, officer numbers, hand-over. Nothing is built yet.

## Files
- `project/*.dc.html` + `project/canvas.json`: the canvas source, exactly as published.
- `project/support.js` is NOT kept here: it is the Design type's runtime (`artifact-type/dc-runtime.js`, 188 KB). To render
  locally, fetch it with the Artifact tool (`read`, `path: artifact-type/dc-runtime.js`) and save it as `project/support.js`.
- `shots/*.png`: each board as rendered locally on Oct 20 (what was published).
- `render.mjs` (one board to `shots/`) and `clip.mjs` (a horizontal band of a tall board) use gstack's playwright-core.
  A "Fetch API cannot load file://" console error and `{{…}}` SVG path warnings are normal.

Nothing here touches the app. Sample club and people are invented (Sixty-Four Chess, the same cast as the app screens).
