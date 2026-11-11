# Otto Wave 2B: the corner and the side panel (ship record)

- Branch `claude/otto-wave-2b` (worktree `.claude/worktrees/otto-wave-1`), from `main` cf1ff731 (Waves 1 and 2A live).
- Commits a0f8a153 (the panel) and 5c284936 (walk fixes). **SHIPPED Nov 11** on Franky's "Ship Wave 2B": `main` fast-forwarded cf1ff731 → 8c6325fb, Vercel deploy succeeded.
- Design: the board's D3 (computer: corner Otto and side panel). Decided: the page is not dimmed (call 12).

## What's built
- **The computer's side panel no longer dims or blocks the page.** It's a solid fluted column at the right that
  stops above the corner Otto; the corner also closes it. Links on the page behind it keep working.
- **Header** "otto" with his desk line and "Acting as"; no "your agent · online" (no model yet).
- **The Otto tab is a mini desk:** the top two Ready items (the first may carry the one coral button, quiet on
  /otto where the page already has one), a few "Otto saw" rows, and "Open your desk →" / "Full breakdown →"
  pinned at the foot, keeping your club. It follows the club you picked on the desk (phone or computer).
- **The Messages tab** works as before and now follows Light and Night (it was always dark).
- **Keyboard:** Otto | Messages is a real tab list (arrow keys); Escape closes the panel only from inside it
  and gives focus back to the corner; Escape in a page field leaves it open.
- **Static pages** (/profile on a computer) have the same panel, and their corner now shows the count and the
  waiting pose right away (it used to take ~30 s).
- **Off switch:** with `OTTO_DESK=off`, the corner opens today's dark panel (moved unchanged to
  `OttoSidePanelLegacy.tsx`); nothing flashes while the switch is being asked (at most 4 s; no answer = on).

## What you need to approve
- **Ship = merge to `main` and push.** No database change, no Privacy Policy change (nothing new collected).
- One security-policy detail: the small script that keeps the old Messages frame dark changed, so its pinned
  hash in `src/lib/security/csp.ts` changed with it (the CSP tripwire test passes). Checked live after the ship.

## Checks
- `npm test`: 4,169 pass. `npm run typecheck` clean. eslint clean on changed files. `npm run build` passes.
- Two adversarial reviews (correctness and accessibility; looks), a repair pass, a Light-mode Messages fix, a
  signed-in walk on the local database (React pages, static /profile, the off switch end to end), a fix pass
  for what the walk found, and an adversarial re-check of each fix.
- Fixed along the way: Escape closing the panel from anywhere on the page, a false "couldn't load" flash with the
  off switch, the two builds looking different, the links out of sight on a 1440×900 screen, page text showing
  through the glass, the dark Messages block in Light, the panel ignoring the computer desk's club, the static
  links drawn as a bar across the top of /profile, the static corner's 30-second delay, Escape while waiting.

## Browser walk (local only)
- Computer 1440 and 1100, Avery and Blake, Night and Light, reduced motion: /campus, /otto, /network, the static
  /profile; no dimming (links behind the panel work), the mini desk, a real join request accepted from the
  panel (local data restored), Messages with a chat opened, keyboard, the off switch with slow, hung and fast
  answers. No console errors from the panel.

## Not done, or not checked
- A real computer on the live site (Franky's walk after the ship).
- Low, left: at 1440 the open panel covers the desk's own "Acting as" button on /otto; an officer whose saved
  pick is "You" sees the club desk for a moment on reload; the mention toast can cover the panel's foot; the
  settings feature flag is read twice per page.

## After this
- All three planned waves are done once this ships. Wave 3 (an action log, reminders delivered on time,
  scheduled posts, the 30-second undo, announce to members, Vibe+ insights, the model) needs database changes,
  each on Franky's yes, with the Privacy Policy the same day.
- About two weeks after shipping, if `OTTO_DESK=off` was never used: delete the `*Legacy` files and the old
  `.otto-room*` styles, and the flag.

## Shipped (Nov 11)
- Franky: "Ship Wave 2B". `main` was still cf1ff731, so the branch fast-forwarded to 8c6325fb and was pushed.
- Vercel status for 8c6325fb: success (build `dpl_9zyZwZrnrNHSYzyrF3YeVkYapHBw` on /api/version).
- Live checks, signed out: the live Content-Security-Policy on /auth/login and /messages carries the new
  night-lock hash and not the old one; `/html/_otto.js`, `_miniMessenger.js` and `_otto-planet.css` match `main`
  byte for byte. The panel itself needs a signed-in visit on a computer.
- Not checked: Franky's walk on a computer (open the corner on /campus and /profile, the mini desk, Messages in
  Light, Escape, the page behind still clickable).
