# Motion 1 + the old draft (ship record)

- Branch `claude/otto-motion-1` (worktree `.claude/worktrees/otto-wave-1`), from `main` 29bf1bb2.
- Commit eff4cf4d. **SHIPPED Nov 12** on Franky's "Ship motion 1": `main` fast-forwarded 29bf1bb2 → d753f404, Vercel deploy succeeded.

## What he said (Nov 12)
"when clicking from settings/messages and the other tabs into otto it shows i have a draft? Also it is possible to
make smooth motions and happy feedback motions for example when clicking from tab to tab it glides/ slides/
smoothens over to the next thing/tab/ whatever your clicking on, and same for when opening and closing otto"

## The draft
- A counts-only read of the live database found exactly one draft post in all of Vibe: his own, personal (no club),
  from May 14, from before the composer stopped making drafts. Every club desk listed the person's personal drafts
  too, so it showed on each one. Now: personal drafts show only on the "You" desk, club drafts only on that club's
  desk, and drafts older than 30 days don't show. His post itself was not touched.

## What's built (motion)
- **The app's tabs glide.** The computer's left menu and the phone's tab bar move their highlight to the tab you
  pick, and pages slide in the direction of travel (React view transitions); the menu, tab bar and corner Otto stay
  put. The static profile and messages pages fade across (the browser's own page-to-page transition, CSS only).
  Moving into Otto no longer blanks the screen (an empty loading boundary on /otto was removed).
- **Inside Otto:** his tabs glide on the phone and computer; the side panel springs open from the corner and closes
  quickly, its parts rising in turn, and Planet gives one small bounce; the panel's Otto | Messages pill glides;
  sections fold open with their rows fading in (no height animation).
- **Happy feedback:** Accept lands the done stamp, Planet in the sky goes "done" for a moment, the row leaves and the
  next rises into place; a saved reminder rises in; cleared rows slide out and Undo slides them back; picking a look
  pops Planet. Celebrations wait for the server's yes.
- Transform and opacity only, on the app's springs. With reduced motion everything is instant.

## What you need to approve
- Ship = merge to `main` and push. No database change, no Privacy Policy change.

## Checks
- `npm test`: 4,207 pass. Typecheck clean. eslint 0 errors on changed files. `npm run build` passes.
- Four builders (the navigation builder's run ended on a network outage after finishing its files; its work was
  reviewed and repaired with the rest), two adversarial reviews (correctness and performance; feel, signed in, with
  frame-by-frame captures), a repair pass, and my own look at the frame sequences.
- Fixed from the reviews: moving into Otto blanked the screen and didn't glide (the path he named), long jumps on the
  phone's Otto tabs drew two panes over each other, pills hid the tab labels mid-glide, the left menu's Admin row,
  profile card and calendar flickered on every move, page moves dissolved instead of gliding, the phone celebrated a
  reminder before the server answered, other buttons went dead during a celebration, the corner's press shrink ran
  with reduced motion.

## Not done, or not checked
- His walk on the live app (desktop Chrome/Safari and his phone). View transitions animate in Chromium 125+ and recent
  Safari and Firefox; elsewhere pages simply change, nothing breaks.
- Known, left: Messages and Profile still load their content after they appear, so they slide in and then fill; the
  static profile fades in twice (the page's own fade-up after the cross-page fade); the panel shows "Opening your
  desk…" for a moment on first open; the static panel's pill isn't re-measured after a window resize.

## Shipped (Nov 12)
- Franky: "Ship motion 1". `main` fast-forwarded to d753f404; Vercel success (build `dpl_EtBrDLSoFpr3RHTUDGmxNNtTWEDT`).
- Live checks, signed out: the site-wide CSS carries the view-transition styles; `/html/_otto.js` matches `main`.
- Not checked: his walk on the live app (tab glides, moving into Otto, the panel opening and closing, Accept, a
  reminder, clear + Undo, picking a look; and that the old draft is gone from his club desks).
