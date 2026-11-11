# Otto polish 1: Franky's walk notes (ship record)

- Branch `claude/otto-polish-1` (worktree `.claude/worktrees/otto-wave-1`), from `main` 156cb187 (Waves 1-2B live).
- Commit accacceb. NOT SHIPPED: waits for Franky's yes.

## What he said (Nov 11, after walking the live app) and what he picked
"the orb looks a little weird when it goes from back to front same with the ring not finishing around, the compose
a new message and open is to big, also the our cursor ( ring and dot) doesnt show when hovering over messages, also
make it to where if you hover over peoples names it highlights them to indicate you can go to their profile, and
make the the lists be dropdowns maybe, or like a time frame option or idk, maybe people also want to clear
notficstions and stuff to clean up their things, also im not sure how i feel about the grain texture on these boxes"
Picks: close the ring; flat paper; fold + time filter; delete with Undo.

## What's built
- **Planet:** the ring is a full loop. The moon rides it the whole way: dimmer and a touch smaller behind him,
  hidden while behind his body, and the hand-off from behind to in front happens at the ring's tips, so it reads
  as one moon (no pop, no dark outline). Waiting parks it at the top-right tip. Small sizes and reduced motion hold
  still. The static pages share the same stylesheet (byte-checked).
- **Flat paper:** no grain on any card (desk, panel, Stats, settings). The sky and the panel's ribs keep theirs.
- **Lists:** every desk section folds open/closed (remembered on the device) and shows a few rows with "Show all";
  Otto saw and Earlier get a quiet This week / 30 days / All picker.
- **Clearing:** an × on each Otto saw row (on hover on a computer, always on a phone) and "Clear all". A quiet
  "Cleared. Undo" (or "Cleared 2.") holds for 5 seconds; then they're deleted for good. "Clear all" only deletes
  up to the newest one on screen, so anything that arrives meanwhile stays. A new `DELETE /api/me/notifications`
  deletes only your own rows, with a rate limit, and is refused for suspended accounts. No database change:
  people could already delete their own notifications.
- **Names** link to the person's profile, with an underline and ink highlight on hover and focus (never for
  someone you can't see).
- **Side panel:** the Messages pencil and Open are small quiet icons (still easy to tap); the cursor's ring and dot
  follow over the Messages frame.

## What you need to approve
- Ship = merge to `main` and push. No database change. Privacy Policy: no new data is collected; this adds a way to
  delete your own notifications (the policy already lets people delete their data). Optional later: a line naming
  "clear notifications".

## Checks
- `npm test`: 4,201 pass. Typecheck clean. eslint 0 errors on changed files. `npm run build` passes.
- Four builders, two adversarial reviews (one signed in on the local database), a repair pass. I looked at the
  moon's lap frame by frame myself.
- Fixed from the reviews: "Clear all" deleting rows never seen, the static panel losing Undo on quick clears, the
  panel's Undo using the coral app toast at the bottom of the page, a failed delete hiding the next Undo, the cursor
  dot freezing at the frame's edge, the moon's outline at 28px, keyboard focus hidden under the reminder bar.

## Not checked
- The live site signed in (Franky's walk after the ship). Names on follow-backs and join requests (the local test
  accounts had none at the time); Otto saw names were checked.
- Low, left: Clear all also deletes notifications from people you've muted (your own rows, up to the cutoff);
  Earlier's "This week" can never show anything (Earlier starts at 8 days); a row cleared in the panel stays on the
  desk until reload.
