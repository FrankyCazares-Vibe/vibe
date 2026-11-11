# The new Otto page: build order (Nov 10, 2026)

## Status
- Nov 10: plan approved by Franky. **Wave 1 SHIPPED Nov 10** (main f14a7ce0; record `wave-1.md`).
  Next: Wave 2A, the desk.

The idea behind the order: Otto's new look goes everywhere first (one small, look-only change), then the
desk page on data the app already has, then the corner and side panel. Anything that needs a database
change or the AI model comes last, each piece on its own yes.

Design: the board (Franky's private canvas) and `handoffs/2026-11-09-otto-agent-design-board.md`
("Franky's answers", round 3). The board's kit sources are backed up outside the repo, in the side-session
notes (`otto-kit-backup/`).

### Wave 1 · "Planet everywhere" · no database change
| Piece | Size | Recommendation |
|---|---|---|
| Planet kit (`src/components/otto/kit/planet.css`) and `OttoPlanet` component | M | Must: everything else draws him |
| Otto's look (colour + Still/Living) in `users.otto_settings` (JSON, no migration) | S | Must: the moon laps on every page, so people need a way to stop it from day one |
| Every orb becomes Planet: tab bar, left menu, corner, side panel mini, Otto page hero, onboarding, the map | M | Must |
| Static pages: `_otto-planet.css`, `_otto.js`, `profile.html`, `onboarding.html`, the wormhole | M | Must: they draw Otto too |
| Tests: kit rules, static drift, look and settings | S | Must |

### Wave 2A · "The desk" · no database change
| Piece | Size | Recommendation |
|---|---|---|
| Honest desk model (`src/lib/otto/desk.ts`) on existing data | M | Must |
| Sky header with soft hills, paper cards, drafts on blueprint, done stamps | M | Must |
| Phone desk (Otto tab) and computer desk (`/otto`) | L | Must |
| One honest Stats card (views on your posts, 30 days) | S | Must |
| Settings parts from the board; like-milestone notice listed, off | S | Should |
| Off switch `OTTO_DESK=off` (brings back today's page) | S | Must |

### Wave 2B · "The corner and the side panel" · no database change
| Piece | Size | Recommendation |
|---|---|---|
| Corner Otto, live Planet, waiting = moon at the ring's end | S | Must |
| Side panel: no dimming, fluted surface, mini desk, Messages tab unchanged | M | Must |
| Static twin `#ottoPanel` in `_otto.js` | S | Must |

### Wave 3 · later · each needs a database change, Franky's yes and the Privacy Policy the same day
What Otto did (an action log), reminders delivered on time (needs a scheduler: crons run once a day),
scheduled posts, the 30-second undo hold, announce-to-members with its one-a-day cap, shared club drafts,
the Vibe+ Insights page, and the AI model itself (chat, thinking steps, 30-day chat history).

## How each wave is built
4-5 file-owned batches (one builder per file), an adversarial review, a repair pass, then `npm test`,
`npm run typecheck`, `npm run lint`, `npm run build`, the CSS size before and after, and a local browser walk
(390×844 and 1440×900, Night and Light, reduced motion, Still picked). Ships on Franky's yes; then his phone
walk on the Vercel deploy.

## If it runs long, cut in this order
1. The map's and Lyra's big orbs (keep the old drawing behind a thin wrapper).
2. Wave 2B (the corner keeps the new Planet from Wave 1; the panel keeps its old layout).
3. The computer desk's "Earlier" column.

Never cut: Planet on the static pages (two Ottos would show), the off switch, Light mode, reduced motion.

## What needs Franky's yes
- Each ship to `main` (Vercel deploys from it).
- No production database change in Waves 1 to 2B.
- Privacy Policy: Otto's look is a preference (a colour and a motion switch), not new data about people. It
  is checked against the policy's wording in Wave 1; if the policy lists Otto's settings, one line is added
  the same day.

## Calls raised by the build (each with a pick)
- **"Who viewed your profile" list** on today's Stats tab: the board's rule is counts, never who. My pick:
  leave it where it is for now and raise it on its own, since removing it changes a live feature.
- **Things Otto did** on the Stats card: it would read 0 until Otto acts. My pick: show only the views
  number until Wave 3's action log exists.
