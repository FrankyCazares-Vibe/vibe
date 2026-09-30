# Session 23 — Persistence layer + landing page

End-of-session state for picking up cold in Session 24. Bullets only.

## What shipped
- **NEW:** `~/vibe/public/html/_persistence.js` — shared layer:
  - `VIBE_KEYS = { user: 'vibe_user_v1', posts: 'vibe_posts_v1' }` (grow per-page)
  - `vibeLoad/Save/Clear/ClearAll`, `seedDemoData()`, `exitDemoMode()`, `vibeInit()`, `vibeShowDemoPill()`
  - `window.vibePersist` console API
- **NEW:** `~/vibe/public/html/landing.html` — entry point with two CTAs ("View demo site" → seeds Maya → `/html/feed.html` ; "Create your profile" → `/html/profile.html`)
- **MODIFIED:** all 6 pages — `<script src="/html/_persistence.js">` + per-page init
  - `profile.html` — empty-state UI in-page (Otto invitation); "Exit demo profile" replaces "Share profile" when in demo
  - `feed/network/campus/opportunities/messages.html` — redirect to landing if no user; floating "Demo mode · Exit" pill if in demo
- **MIRRORED:** all 8 files copied to `~/Desktop/VIBE HUB/ACTIVE/`
- **UPDATED:** `sync.command` now copies `*.html` AND `*.js`
- **UPDATED:** `DOCS/FOLDER_STRUCTURE.md` — rule broadened from "HTML only" to "runtime assets only"
- **UPDATED:** `DOCS/ROADMAP.md` — reflects current priorities (Otto v1 next)
- **UPDATED:** `SESSIONS/journal/vibe_journal.html` to v3.5 with Session 23 entry
- **UPDATED:** memory `feedback_docs_location.md` to match the new ACTIVE/ rule

## Live test flow (hard refresh first)
1. `localhost:3000/html/landing.html` → hero + 2 CTAs
2. "View demo site" → seeds Maya → feed.html with pill top-right
3. Click pill OR navigate to profile and click "Exit demo profile" → wipes → back to landing
4. Visit `/html/network.html` (or any non-profile page) directly with no data → bounces to landing
5. From landing → "Create your profile" → profile.html empty state with Otto invitation

## Decisions locked in this session
- **Hybrid demo model**: empty by default, `?demo=1` URL OR landing CTA seeds, `?clear=1` resets, `vibePersist.clearAll()` console API for testing
- **Schema scope grows per-page** (not big-bang upfront): added `vibe_user_v1` + `vibe_posts_v1`; remaining keys (connections, messages, opportunities, vibes) added when each page adopts persistence
- **Landing IS the pre-auth gate**: profile.html is the only page that exists pre-onboarding. All other pages redirect to landing if no user.
- **Two demo-exit affordances by audience**: profile uses inline button (replaces "Share"); other pages use floating pill from `vibeShowDemoPill()`
- **`_isDemo` flag** distinguishes demo Maya from a future real user — exit-demo affordances only show when `user._isDemo === true`
- **`ACTIVE/` rule broadened**: was "HTML only", now "runtime assets only" (HTML + JS). Docs still in `DOCS/` only.

## Sequencing decision (end-of-session conversation)

**Otto v1 is Session 24 — not per-page persistence reads.** Three reasons:
- **Strategic alignment.** Otto IS the new positioning ("the network where your AI agent lives"). Without it in the prototype, demos read as LinkedIn-with-better-UI — the thing that makes Vibe defensible isn't visible.
- **Mockups are already designed.** Otto build is execution work (translate 8 reference files in `~/Desktop/VIBE HUB/otto_mockups/`, start with `05_otto_agent_tab.html`), not design exploration. Cleaner than going page-by-page through 5 different existing pages and rethinking each.
- **Inner empty states are demo-invisible.** "No posts yet" / "no connections yet" only triggers for sparse real users. Prototype lives in demo mode for the foreseeable future (showing IU Director, investors, friends) — those empty states never trigger anyway in the demo.

**Inner empty states are NOT blocked by Otto.** Per-page persistence reads (Medium priority) are independent infrastructure work. Could happen before, after, or in parallel — sequenced after only because Otto delivers more strategic value first. Tradeoff acknowledged: when persistence reads happen later, Otto-touched pages will need a small retrofit.

## What's hardcoded vs persisted

| Page | Reads from persistence? | Inner empty state? |
|---|---|---|
| profile | No (Maya text in markup) | YES — full Otto invitation in-page |
| feed, network, campus, opportunities, messages | No (hardcoded mock content shown when demo) | NO — gates at user existence only |

Inner empty states ("no posts yet", "no connections yet") wait until pages adopt persistence reads. Per-page work:
1. Move hardcoded data → into `seedDemoData()` writes to that page's key
2. Refactor page render → reads from `vibeLoad(KEY)`, falls back to inner empty state UI when array is empty

## Open / next
- **Session 24+ = Otto v1 build** per the v3.4 roadmap. Mockups in `~/Desktop/VIBE HUB/otto_mockups/` are the visual source. Start with `05_otto_agent_tab.html`. Will need a NEW 7th HTML page for the Agent tab — left navs across all pages will need an Otto link target that doesn't exist yet.
- **Onboarding flow** required before "Start with otto" button on profile empty state can be enabled. Per Session 22 spec: 6 steps, ~3 min, ends with Otto generating a real draft from voice samples.
- **Per-page persistence reads** — see table above; tackle as each page is otherwise touched.

## Bug traps that surfaced
- Stale demo data from before `_isDemo` flag → requires one-time `vibePersist.clearAll()` then re-seed via `?demo=1` or landing CTA to migrate
- Visual flash on the redirect-to-landing pages: bounce happens fast; consider adding a brief "redirecting…" state if it becomes annoying

## Files touched
- NEW: `_persistence.js`, `landing.html`
- MODIFIED: `profile.html`, `feed.html`, `network.html`, `campus.html`, `opportunities.html`, `messages.html`
- MIRRORED to `~/Desktop/VIBE HUB/ACTIVE/`: all 8 above
- UPDATED: `sync.command`, `DOCS/FOLDER_STRUCTURE.md`, `DOCS/ROADMAP.md`, `SESSIONS/journal/vibe_journal.html`, memory `feedback_docs_location.md`
