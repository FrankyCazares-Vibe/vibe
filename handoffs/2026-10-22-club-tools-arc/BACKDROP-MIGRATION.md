# The five new club backgrounds: the database change (Oct 22, 2026)

**The call:** a yes to apply `supabase/migrations/20261026100000_club_backdrop_presets.sql` to production.
**Recommendation: yes, before launch night.** It is one rule, it changes no club, and nothing in the app
depends on it until we flip one line of code afterwards.

## What it changes
The database keeps one rule listing the background names a club may save (`orgs_backdrop_preset_check`).
Today it allows six: the five the picker offers (Dusk, Midnight, Violet, Ember, Forest) and the old light
"cream". This change lets five more names be saved: **Rose, Cardinal, Lantern, Canal, Onyx**. Nothing else.

## What it doesn't change
- No club's background. No row is written.
- No permissions (no grants), no new column, no function, no policy.
- No Privacy Policy change: a club's background is its page's setting, not anyone's personal data.
- The colours stay in code (`src/lib/orgs/backdrops.ts`); the database only ever holds the name.

## Before applying (read-only checks on production, counts only)
The full queries are in the file's header, "PRE-FLIGHT on PRODUCTION". What they should say:
1. The rule today lists exactly the six: cream, sand-purple, ember, deep-violet, forest, midnight, and it is
   the only rule on that column.
2. Clubs per background: every club is on one of those six.
3. Clubs outside the new list of eleven: 0.
4. The column is still text, required, default `sand-purple` (Dusk).
5. Signed-in and signed-out browsers can't edit club rows directly (only our server can).

Any other answer: stop and look first. The file also runs these checks itself and refuses to change
anything if one is off.

## Applying it
The main session applies it with the Supabase connector and renames its history row to `20261026100000`.
It holds the clubs table for milliseconds; if it has to wait more than 5 seconds it gives up whole, changes
nothing, and can simply be run again. Running it twice is safe.

## Right after: the one-line flip
In `src/lib/orgs/backdrops.ts`, `NEW_BACKDROPS_LIVE = false` becomes `true` (and the matching guard line in
`backdrops.test.ts`), then commit and push. The picker then shows all ten.
**Order matters: database first, then the flip.** If the flip went out first, picking a new background
would say it isn't ready yet (the server answers 409) and not save; nothing else breaks.

## How to undo it
1. Flip `NEW_BACKDROPS_LIVE` back to `false` and deploy, so nobody can pick a new one.
2. Count the clubs on a new background (the query is in the header); they go back to Dusk.
3. Run the ROLLBACK in the file's header: one transaction that moves those clubs to Dusk, puts the six-name
   rule back and removes the history row.

## Rehearsed (local stack only, Oct 22)
Checks, apply, checks, apply again (no change), the five new names save and junk is refused, the undo with
one club on Rose (it went back to Dusk), then apply again. The local database keeps it applied. A test
(`src/lib/orgs/backdrop-migration.test.ts`) fails if the file's list and the code's list ever disagree.
Production was not touched.
