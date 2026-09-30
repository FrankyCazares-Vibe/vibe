# Session 67 (2026-09-26): design canvas + wave 1 (feed cards, rolling newsletter)

## START HERE — session 68

1. **Wave 1 is committed locally and NOT pushed** (commit "feat(campus): feed cards + the rolling newsletter (S67 wave 1)"). Finish the wave procedure in `handoffs/wave-plan-s67/waves.md` before pushing:
   - 375px as blake (local dev server, `npm run dev`, sign in via the local magic-link trick in memory `reference_live_verification.md`): tap a strip tag chip → only that tag's posts, chip charcoal; tap again → cleared; tap a post-card `#tag` → the plain "#tag ×" chip appears above the posts; tap an event chip (blake needs an RSVP first) → Events tab, card scrolled to. In the built-in browser pane, `left_click`/`scroll` coordinates are **CSS pixels**, not the 2× screenshot frame; prefer `find` → click by ref. Escape does NOT close the phone post viewer; click its "Close" button.
   - 1280px: centered 720 column, cards, composer card, the search pill row between the campus name and the pills (not on Chat), kebab menu opens on a one-line post, strip rolls only when overflowing and pauses on hover, `/campus?post=<id>` still flashes.
   - Then `git push`, wait for the Vercel deployment sha, re-walk Feed on the live URL, and curl the served CSS for `--tag-ink` (locally the production build served it: `/_next/static/chunks/*.css` had `--tag-ink:#b83a1a`).
2. Design canvas (Franky approved, "these are fire"): https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ. Decisions recorded in `handoffs/wave-plan-s67/plan.md` + `contracts.md` and memory `reference_design_canvas.md`.
3. Next waves, in order: 2 profile widgets → 3 dark mode (Auto / Light / Night, default Light until wave 5) → 4 view any campus + 45-day lock → 5 legacy dark → 6 close (journal v7.9, memory, sentinels). Plan, batches, owners and the per-wave walk are in `handoffs/wave-plan-s67/`.

## What happened this session

- **Marketing workspace** created at `~/vibe-marketing` (own git repo; brand kit, product story, feature inventory, 28 screenshots, meeting ideas). Live-site problems found on the way: `handoffs/2026-09-25-marketing-pass-site-findings.md` (the public journal, the retired career tagline in `layout.tsx`, no OG image, SAE page copy).
- **Sept 26 founders' meeting notes** recorded: `handoffs/2026-09-25-founders-meeting-product-notes.md` (club roles + ownership transfer, club badges on profiles, the slim rolling strip, profile widgets, nearby campuses, Butler implied).
- **Six-reader understand pass** → `handoffs/s67-understand/` (first run lost to the Mac sleeping; agents now write to disk in ≤110-line chunks).
- **Four-lens plan critique** → `handoffs/wave-plan-s67/critique-*.md`; all findings folded into plan/waves/contracts (tokens in wave 1 with non-colliding names, `profile_layout` in the first-tier select, parent-owned strip hook, search bar as a sibling row, `withCampus`, theme script sets the attribute only, real verify commands, rollback lines, wave 6).
- **Wave 1 built** by a 13-agent workflow (3 batches, gate, review, 2 repair rounds). My own fixes after the walk: removed scroll-snap from the strip (it parked at 16px and clipped "today."), added a non-passive wheel guard so a horizontal wheel over the strip never reaches the pane scroller, gave tag chips an `aria-label` (the title alone read as "1 post this week").

## Known, not fixed (pre-existing)

- Phone `FeedCard` root is a `<button>` with buttons inside → React hydration warning ("2 Issues" in dev). Fix in W3c (CampusMobile) or a hardening pass: root becomes a `div` with `role`/keyboard handling.
- `node --test` fails on `src/lib/otto/parse-reminder.test.ts` (extensionless import) and `src/lib/profile/self-write-columns.test.ts:144` (limiter runs after the Terms gate in `/api/me/profile` — a real ordering bug for the hardening list). The new `npm test` glob uses `git ls-files`, so untracked test files aren't run until `git add`.
- Desktop search row also renders above the Chat tab? No: W1b gated it (`tab !== "chat"`); verify on the 1280 walk.

## Open with Franky

- Tagline: "Your campus. Your people. Yourself." (recommended for the main account) vs "Your campus. Your profile. Yourself." (customization teasers). Both on the brand board.
- D-U-N-S: he planned to submit Sat 9/26 or Sun 9/27; ask whether it went in.
- Wave 4 defaults he hasn't confirmed: all 11 campuses viewable (incl. closed ones), Map hidden on closed campuses, Request-to-join stays while visiting.
