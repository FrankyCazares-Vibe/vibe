# Old landing cleanup: what can go, what must stay (mapped 2026-10-02)

Branch `landing-night` (26ddad7). Worktree: `.../scratchpad/landing`. Nothing in the
worktree or repo was edited. A dry run was done on an exported copy in `./sim/`.

## Short answer

- Delete 2 files and 643 lines of `src/app/globals.css`. Nothing else in the app uses them.
- Keep about 50 lines of `.vibe-landing-sun-*` + `.vibe-landing-typewriter-dot`: the /otto
  page hero (`src/components/otto/OttoHero.tsx`) still uses them.
- Keep `OttoOrb` (used by /the-map, OttoMobile, OttoHero, LyraConstellation).
- No test imports the old landing or checks its text.
- `main` merges into `landing-night` with no conflicts.
- Dry run after the cuts: typecheck clean, lint unchanged (same 57 old problems, none in
  landing or Otto files), tests 1839 / 1839 pass, the CSS parses (postcss + lightningcss).

## 1. Merge check (read-only)

`git merge-tree --write-tree --name-only landing-night main` gives tree 57da7b4, exit 0,
no conflicted files. Merge base b1a8599. landing-night is 3 ahead, 10 behind.
Main's 10 commits touch only `scripts/` and `handoffs/` (11 files: demo-seed.mjs,
scripts/demo-video/*, handoffs/s72-prep/demo-cast.md). **No `src/` file**, so the
"phone chat file" in the brief is not in this range; it is already in the merge base.
landing-night touches only home-landing.tsx, landing.css, night-sky.tsx. No overlap.
`globals.css`, the two old files, `components/otto` and `components/the-map` are
byte-identical on both branches, so the line numbers below hold on either.

## 2. What goes

| What | Where | Used elsewhere? |
|---|---|---|
| `landing-orbit.tsx` (OrbitalRingSystem, OrbitDetail, RingId) | whole file, 423 lines | No. Only importer was main's old home-landing. |
| `landing-typewriter.tsx` (TypewriterSequence) | whole file, 94 lines | No. Only landing-orbit imports it. |
| globals.css 539-615 | banner, root, stars, hero, hero-orb, typewriter, -line, -cursor | No |
| globals.css 619-896 | blink kf, scrollcue, orbit section/eyebrow/stage, orbital, moons, orbit-cw/ccw kf, detail layer, glass, card-eyebrow, inline-cta, back, CTA block, sun-cta | No |
| globals.css 925-956 | sun-typed, its typewriter/cursor overrides, sun-cta hover rules | No |
| globals.css 975-985 | `@keyframes vibe-landing-sun-appear` | No (only sun-cta) |
| globals.css 989 | `.vibe-landing-sun-cta` selector in the reduced-motion block (988 gets `{`) | No |
| globals.css 993-1236 | progress dots, schools, skip/signup pills, footer, 540px media, reduced-motion, hyperdrive warp + streak/content-warp/warp-flash kf | No |

Checked: no string-built class names (`vibe-landing-${...}`), nothing in `public/`,
`mobile/`, `scripts/`, `supabase/`, README, QA_CHECKLIST. The new landing
(`home-landing.tsx`, `night-sky.tsx`, `landing.css`) uses only its own `vln-` classes and
keyframes, nothing from globals.css.

## 3. What LOOKS like old landing but must stay

| Rule | Lines | Who uses it |
|---|---|---|
| `.vibe-landing-typewriter-dot` | 616-618 | OttoHero.tsx:37 (the coral dot in "otto.") |
| `.vibe-landing-sun-disc`, `-sun-halo`, `-halo-2`, `-halo-3`, `-sun-otto` | 897-924 | OttoHero.tsx:25-29 |
| `@keyframes vibe-landing-sun-wave`, `vibe-landing-sun-breathe` | 957-974 | the halos above; `.otto-room-section-eyebrow-dot` (line 2161) |
| reduced-motion block for halo + otto | 986-992 (minus 989) | the halos above |
| `@keyframes vibe-twinkle` | 378-381 | LyraConstellation.tsx:347 (inline style) |
| `.otto-orb-wrap .orb-*` + `vibe-orb-*` keyframes | 383-444 | OttoOrb.tsx |
| `otto-core-pulse`, `otto-orbit-spin`, `otto-breath`, `otto-orb-pop`, `otto-synapse`, `*-med` | 449-538 | campus-home, OttoCorner, OttoSidePanel, OnboardingMobile |
| `OttoOrb.tsx` | whole file | the-map/page.tsx, OttoMobile, OttoHero, LyraConstellation |

Note: OnboardingMobile.tsx has its own local `function OttoOrb`, unrelated to the import.
`/otto` is live (src/app/otto/OttoSwitch.tsx → OttoPageClient → OttoHero).

## 4. The deletions, in order

Run in the landing-night worktree only when Franky says go. The script checks the first
and last line of every range and stops if globals.css has moved.

1. `git merge main` (optional, clean: see section 1). It does not touch any file below.
2. `node <landing-work>/cleanup/apply-cleanup.mjs .` which, bottom-up:
   1. cuts globals.css 993-1236
   2. drops line 989 (`.vibe-landing-sun-cta {`) and turns 988 into `.vibe-landing-sun-otto {`
   3. cuts 975-985, then 925-956, then 619-896, then 539-615
   4. puts a 5-line banner where the landing banner was, saying the leftover is Otto's
   5. deletes `src/components/landing/landing-orbit.tsx` and `landing-typewriter.tsx`
   Result: globals.css 3089 → 2451 lines. Exact expected file: `sim/src/app/globals.css`
   (proved equal to a hand-built keep-list, `expected.css`).
3. Commit: `chore(landing): delete the old orbit landing (Otto halo stays for /otto)`.
4. Optional, recommended, separate commit: rename the leftovers so "vibe-landing" is gone
   from src and nobody deletes Otto's halo by mistake later:
   - `vibe-landing-sun-disc|halo|halo-2|halo-3|otto` → `otto-sun-disc|halo|halo-2|halo-3|core`
   - `vibe-landing-sun-wave|breathe` → `otto-sun-wave|breathe` (also old line 2161)
   - `vibe-landing-typewriter-dot` → `otto-room-hero-dot`
   - files: globals.css (the kept block + the comment at old line 1956), OttoHero.tsx 25-29, 37
   - after it, `git grep vibe-landing -- src` must print nothing.

Not part of this cleanup: `brand/vibe/landing.png` may be a picture of the old landing;
check before deleting. `@tsparticles`, `simplex-noise`, `framer-motion`, `motion` are still
used elsewhere; no dependency can be dropped.

## 5. Verify nothing broke

```sh
cd <worktree>
git grep -n -E "landing-orbit|landing-typewriter|OrbitalRingSystem|TypewriterSequence|OrbitDetail|RingId" -- src   # nothing
git grep -n "vibe-landing" -- src     # only the kept Otto block, OttoHero.tsx, the 2 Otto comments, eyebrow-dot
npm run typecheck                     # dry run: 0 errors
npx eslint src                        # dry run: 57 problems (32 errors, 25 warnings), the SAME as before; none in landing/otto
npm run lint                          # whole repo; compare with a run on main before the change
npm test                              # dry run: 1839 tests, 1839 pass
```

Browser pass (dev server at http://localhost:3102 hot-reloads; do not restart it), at 375px
and desktop, signed in as a non-admin:
- `/` the new night landing still renders (it never used these rules).
- `/otto` the hero orb still has its three expanding coral rings and the breathing glow;
  the dot in "otto." is coral; the section eyebrow dots still breathe.
- `/the-map` and the campus Otto corner orb still spin and pulse.
- With "reduce motion" on, the /otto rings stand still.

## Evidence in this folder

- `apply-cleanup.mjs` the guarded script; `globals.before.css`, `expected.css`, `globals.diff`
- `sim/` the exported branch after the cuts; `base/` an untouched export for the lint baseline
- `baseline-tsc.txt`, `after-tsc.txt` (both empty = clean), `baseline-eslint-src.txt`,
  `after-eslint-src.txt`, `after-tests.txt`
