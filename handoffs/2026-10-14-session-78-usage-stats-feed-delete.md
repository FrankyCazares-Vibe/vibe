# Session 78 (Oct 14, 2026): usage stats live (both steps), "active now" floors, delete from the phone feed

Read this first in session 79. The S77 handoff
(`2026-10-13-session-77-motion-notice-docs-and-next-up.md`) still holds for
everything this file does not mention. Marketing work from this session is in
`2026-10-14-marketing-video-from-code.md`.

## START HERE — session 79

**Next, in Franky's order (Oct 13):** usage stats are DONE, so next is
**rate limits and upload caps** (security report #7 to #11, untouched), then
the **pipeline tracker** when Franky gives the detail.

**First ten minutes:**
1. `git branch -r | grep claude/`.
2. Open admin > **Usage** on connectvibe.app (as a founder) and read the
   "Counted from launch on" section: the day totals started filling on
   Oct 14 evening (UTC). Nobody has looked at real numbers yet.
3. Ask Franky whether he tried delete-from-feed on his phone.

**Where things stand.** Main is `21009d7`, deployed (Vercel: success). 2,608
tests. Privacy Policy dated October 14, 2026 (page = text, 1,172 of 1,172
sentences). Two migrations applied to production today (below), both
recorded under their file versions.

## What S78 shipped

| What | State |
|---|---|
| **Usage tab, step 1** (`d3bffb9`): admin > Usage. One counts-only function `admin_usage_summary(p_days)` (migration `20261014120000`). The door, waves, coming back (rebuilt from dated actions), what gets used, clubs, where. Founders, store-review accounts, hidden test clubs and test batches left out; small cells "<5" on the server; club chat as bands. | Live. Production function checked: anon and authenticated refused (42501), 17 accounts, 1 visible club. |
| **Usage, step 2** (`21009d7`): `usage_day_tally` (day and week totals, no account, IP, user agent or time of day), `usage_touch` (service role only, called by `POST /api/me/heartbeat` with the verified account), `admin_usage_tally`, a "Counted from launch on" section. Every page checks in (`ActivityTouch` in the root layout; `public/html/_usageTouch.js` on static pages), at most every 4 minutes per tab, only while visible. Otto and map opens capped at 10 × the day's active people (at least 10). | Live (migration `20261014150000`). The browser can no longer write `users.last_active_at` (its UPDATE columns went 11 → 10). Tally empty at apply; fills from the next visits. |
| **"Active now" floors** (same commit, Franky's two calls): `users_active_count` counts campus by campus; a campus adds nothing unless ≥ 5 people besides the viewer are active AND ≥ 5 besides the viewer are not. So a campus under 10 people never shows it, and the headers drop "· N active now" below 5. | Live. Production answers 0 everywhere today, as expected. |
| **Delete from the phone feed** (`9267809`): the ⋯ sheet on your own post has Delete post (and officers on club posts, as desktop already did). Reverses the Sept 16 "Delete stays in the viewer" call at Franky's ask. | Live. Walked at 375 px as a non-admin locally. |
| **Privacy Policy**: section 1 (founders see totals, never who; a quiet day's total can be one person), 3d (check-in on every page, "Use totals", the "active now" rule), 8 (the totals outlive a deleted account). | Live, October 14, 2026. |
| **Access-codes plan** `handoffs/2026-10-14-access-codes-plan.md` (first draft): shared club and ambassador codes, policy/Terms changes, disclosure rules, abuse cases, options A/B/C with a recommendation. | Published Oct 15 as a living doc for the three founders (plain English, no code refs, reviewed as James and as Rylan): https://claude.ai/code/artifact/29e21dab-ca4b-40ca-a838-4c2f11b29c92. Private until Franky shares it. The repo file stays the engineer's version. |
| **HyperFrames + the first test ad** (marketing) | See the marketing handoff. Not safe to post. |

## Not verified (say so if asked)

- **Real numbers on production's Usage tab.** Checked through SQL only; no
  founder has opened the tab on the live site.
- **The visible-only check-in in a visible browser.** The test pane was
  hidden, so the server path was tested by direct posts and the gate by
  tests only.
- **Delete from the feed on a real phone**, and the officer path (club post,
  not the author) in a browser. The officer path is covered by tests only.
- **Feed speed (Sentry).** Still too few readings: 9 sampled `/campus` loads
  in 14 days, 3 after the Oct 12 feed change (one iPhone at 8.3 s LCP with
  a 0.1 s server answer, so the phone was slow; that release also shipped
  the animated bloom).

## Decisions made this session (Franky)

- Usage step 1 built now; step 2 right after; a section 1 policy line.
- Ambassador/club codes: a plan, not a build.
- "Active now" only from 5 up, and never on a campus under 10 people.
- Apply both migrations to production (asked each time; the auto-mode
  classifier refuses production database changes without his explicit OK).

## Open

- **Raw IPs in two rate-limit keys** (`pw-reset-net:<ip>`,
  `school-email-ip:<ip>`): the policy says the database holds no IPs beyond
  day counts. Offered as a separate task chip; not done.
- **The founders' Usage tab "Right now" number is exact** (founders only;
  the policy says the team's page shows the exact number).
- **The access-codes plan's open calls** (Franky, James, Rylan).
- Old open tabs from before `21009d7` show "0 active now" until they reload
  onto the new build.
- The route's old-way fallback in `/api/me/heartbeat` (for "function
  missing") can be removed in a later cleanup now that production has it.

## Things a new session must know

- **Usage data rules.** Counts only. Never pull Sentry's OS or visit numbers
  for usage (section 6 allows log reads only to fix a bug); the S78 inventory
  did once and the skeptic flagged it. A new counter never stores an IP or a
  per-person row (a per-account limiter key would be one: `rate_limit_hit`
  keeps an hour-by-hour row for days).
- **Anything that writes `last_active_at` goes through `usage_touch`** (via
  the heartbeat route). The browser's column UPDATE is revoked.
- **The inventory behind the stats** (what can be counted, with file:line) is
  summarized in the step 1 migration header and `src/lib/usage/view.ts`.
- **The HyperFrames skills load only in a session started in
  `vibe-marketing`.**
- **A network drop killed 6 of 9 workflow agents once** (`ENOTFOUND`); the
  files they had written were kept and a finishing run completed them.
