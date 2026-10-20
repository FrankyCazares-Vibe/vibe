# The club's view: design board (Oct 20, 2026)

Franky's ask after the Parker meeting (`../2026-10-20-parker-meeting-notes.md`): design what a club and its officers
see and do in Vibe, phone and desktop. Board first, no building; Franky picks.

- **The board (private Design canvas):** https://claude.ai/artifact/FZQgjLYfoBojmPFuKF3NKe
- **Start on `Main`:** the four options, the pick (B, with D's event card and the share kit) and 11 calls, each with a recommendation.
- **What exists today, with file references:** `INVENTORY.md` (and the `Today` board).
- **The builders' brief:** `SPEC.md` (sample club, look, rules, the three jobs).

## Files
- `project/*.dc.html` + `project/canvas.json`: the canvas source, exactly as published.
- `project/support.js` is NOT kept here: it is the Design type's runtime (`artifact-type/dc-runtime.js`, 188 KB). To render
  locally, fetch it with the Artifact tool (`read`, `path: artifact-type/dc-runtime.js`) and save it as `project/support.js`.
- `shots/*.png`: each board as rendered locally on Oct 20 (what was published).
- `render.mjs` (one board to `shots/`) and `clip.mjs` (a horizontal band of a tall board) use gstack's playwright-core.
  A "Fetch API cannot load file://" console error and `{{…}}` SVG path warnings are normal.

Nothing here touches the app. Sample club and people are invented (Sixty-Four Chess, the same cast as the app screens).
