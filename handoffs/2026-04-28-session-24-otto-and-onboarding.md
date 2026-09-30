# Session 24 — Otto v1 + onboarding + full profile persistence

End-of-session state for picking up cold in Session 25. Bullets only.

## What shipped

### NEW pages / shared modules
- **NEW:** `~/vibe/public/html/otto.html` — the seventh page. Cream shell + dark Otto hero (animated orb, briefing quote, 3 KPIs) + Today view (drafts queue, Otto's Inbox, activity log on the left; metrics, insights, performance, voice sliders, leash on the right). Five sub-tabs (Today live; Metrics / Insights / Customize / Platforms as placeholder panels). Calendar widget + full modal + create-event modal ported from feed.
- **NEW:** `~/vibe/public/html/onboarding.html` — 6-step Otto introduction flow per mockup 07. Single-page, JS-driven step transitions, dark cinematic shell, animated orb at three sizes, top progress dots, fade-in on each step. Skip preserved through step 4 with a confirm dialog; gone after. On completion saves to `vibe_user_v1` (sparse real user) + new `vibe_otto_v1` key (Otto config) and routes to `/html/profile.html`.
- **NEW:** `~/vibe/public/html/_otto.js` — shared Otto companion. Auto-injects pulsing corner ring (bottom-right) + dark slide-out panel into every non-Otto, non-landing page. Lazy-builds the panel on first open. Self-suppresses on `otto.html` and `landing.html`. `window.otto = { open, close }` for debugging.

### MODIFIED
- **`_persistence.js`** — added `vibe_otto_v1` to VIBE_KEYS, new `vibeHydrateSidebar()` (auto-runs on DOMContentLoaded across every page; rewrites the sidebar profile chip's avatar + name + headline from `vibe_user_v1`; precedence: uploaded photo → initials), and a synchronous `vibePrePaintSidebar()` IIFE that adds `html.vibe-pre-paint-sidebar` + injects CSS to hide the sidebar identity until hydration finishes. Eliminates flash-of-Maya on every page nav.
- **All 6 existing pages (feed/network/campus/opportunities/messages/profile)** — Otto link added to left navs (cream sidebar style for 5; top-nav text link on profile). `<script src="/html/_otto.js" defer>` added to all 6.
- **`profile.html`** (the big one):
  - Otto status hero (mockup 04) between the identity block and the section subnav: dark surface, mini orb, "active" tag, status line, four platform tiles, coral Review CTA. Auto-hides in recruiter view.
  - Per-post Otto badges on the three main post cards: orange `otto · 3 platforms` (with platform-stats row showing per-platform views), purple `otto drafted · review`, gray `vibe only`.
  - Empty-state "Start with otto" button enabled → routes to onboarding.
  - "Share profile" pill replaced with "Exit" / "Exit demo" — runs `exitDemoMode()` (clears `vibe_user_v1` + `vibe_otto_v1`, returns to landing).
  - Pre-paint guard added (synchronous `<head>` script + CSS) — hides `.profile-wrap` and `.profile-cover` until `initProfilePage` finishes wipe + hydrate, then fades in.
  - Avatar emoji option removed entirely. Picker is photo-only. Default avatar shows user's initials (live-updates as you type into the name field).
  - Identity fields tagged with `data-user-field` (name, tagline, location, headline, website) — hydrate from user, persist on edit.
  - Full snapshot persistence: `saveProfileToStorage()` walks the DOM and writes the canonical state to `vibe_user_v1` (identity, bio, avatar+avatarPhoto, vibeTags, skills, currentlyOn, workExperience, resumePortfolio, coverPhoto/coverGradient). Hooked into the debounced input listener AND every add/remove handler (saveTag, removeTag, saveSkillModal, removeSkill, saveWork, deleteWork, saveCurrent, deleteCurrent, applyAvatarPhoto, applyLogoFromInput, handleResumeUpload, applyCoverPhoto, applyGradient). `renderUserSections(user)` rebuilds the DOM from saved data on load.
  - File uploads (avatar, work logos, cover, resume/portfolio) are base64-encoded via `_fileToDataURL()` so they survive reloads. `URL.createObjectURL()` blob URLs replaced.
  - White cover-overlay fade hidden when an uploaded photo is the cover (kept for gradients).
  - Fresh-onboarded UX: when `_onboarded && !user.name`, body gets `.fresh-onboarded` class, `clearFreshUserExtras()` wipes Maya's preset content (work, skills, vibe tags, posts, vibes thumbs, currently-on, recruiter snapshot, at-a-glance stats, connection counts), auto-enters edit mode after 250ms, shows a dark welcome banner ("welcome — let's fill this in / click any field to edit. otto's already set up and watching"). The wipe runs on every reload for `_onboarded && !_isDemo` users (until those sections get persistence in the next session).
  - Calendar create-event modal markup added (was missing entirely — clicking "+ New Event" was a silent no-op). `.create-event-modal` z-index bumped to 10000 so it sits above the calendar modal's 9999. `miniSelectDay` made null-safe (profile only has the full modal, no mini widget). `saveNewEvent` now calls `_calSave()`; replaced undefined `showFeedToast` with `showToast`.
- **`landing.html`** — `enterCreate()` routes to `/html/onboarding.html`. Footnote rewritten.
- **All 6 calendar-bearing pages** (feed/network/campus/opportunities/messages/profile) — `removeCalEvent()` now calls `_calSave()`. Deletions used to be in-memory only and came back on reload.

### MIRRORED to `~/Desktop/VIBE HUB/ACTIVE/`
All edited HTML + JS files mirrored after each change.

## Live test flow (hard refresh + `vibePersist.clearAll()` first)
1. `localhost:3000/html/landing.html` → "Create your profile" → onboarding.html
2. Step through onboarding (Otto name → platform → voice samples → leash → draft preview → "let's set up your profile →")
3. Lands on profile in edit mode with empty fields, dark welcome toast, "no tags yet —" hint
4. Type a name → sidebar avatar (in `?` state) live-updates to your initials
5. Edit bio, add a skill, add a work entry, upload an avatar photo + a work logo → navigate to feed → back to profile → everything persists
6. Open calendar (top nav icon) → create event → save → modal closes, event saved to `vibe_cal_events_v1`. Navigate to Otto → calendar widget shows the event. Delete it on Otto → reload profile → still gone.
7. Click "Exit" in profile top nav → wipes everything → back to landing.

## Files touched
- NEW: `otto.html`, `onboarding.html`, `_otto.js`
- MODIFIED: `_persistence.js`, `landing.html`, `profile.html`, `feed.html`, `network.html`, `campus.html`, `opportunities.html`, `messages.html`
- All 11 mirrored to `ACTIVE/`

## Decisions locked in this session
- **Onboarding is the canonical "Create your profile" path.** Empty profile's "Start with otto" button + landing's CTA both route to onboarding. Saves a sparse user object (`_isDemo: false`, `_onboarded: true`) plus `vibe_otto_v1` config. Lands on profile (not Otto) so user fills in identity next.
- **Profile state lives on the user object.** Identity + bio + tags + skills + currently-on + work + avatar + cover + resume all serialize into `vibe_user_v1`. Posts / vibes / connections / messages stay as their own keys (per the persistence schema doc). One snapshot function (`saveProfileToStorage`), one hydrate function (`renderUserSections`), called from every add/remove/edit path.
- **Demo Maya is markup-driven; onboarded users are data-driven.** Demo never gets `clearFreshUserExtras()` — her hardcoded content stays unless she edits it. Onboarded users always get the wipe on load, then `renderUserSections` fills in whatever they've saved.
- **Avatar = photo or initials.** Emoji option removed entirely. Initials derive from `user.name`. Photo overrides via `applyAvatarPhoto()` and an `<img>` swap in `vibeHydrateSidebar()`.
- **All file uploads are data URLs.** `URL.createObjectURL()` blobs don't survive reload. Avatar, work logos, cover banner, resume/portfolio all base64-encoded via `_fileToDataURL()`. Storage cost is fine within the ~5MB localStorage cap for prototype-scale image counts.
- **One calendar storage key (`vibe_cal_events_v1`) shared across all calendar pages.** Add on Otto → shows on feed. Delete on profile → gone everywhere.
- **Pre-paint guards beat post-paint cleanup.** A synchronous `<head>` script that adds an `html.*` class is the right tool for FOUC-style flashes. Used in two places: `_persistence.js` for sidebar identity, `profile.html` for the cover + profile-wrap. JS removes the class via `requestAnimationFrame` once content is ready.
- **Otto status hero hides in recruiter view.** Otto is the user's tool, not a recruiter-facing surface. CSS rule: `body.recruiter-mode .otto-profile-hero { display: none }`. Same for per-post Otto badges and platform stats.

## What's hardcoded vs persisted

Profile sections — current state:

| Section | Persistence wired? |
|---|---|
| Identity (name, tagline, location, headline, website) | YES |
| Bio | YES |
| Avatar emoji | (removed — photo only) |
| Avatar photo | YES (data URL) |
| Vibe tags | YES |
| Skills | YES |
| Currently working on | YES |
| Work experience | YES (incl. logo data URL) |
| Resume / portfolio uploads | YES (data URLs) |
| Cover banner (photo or gradient) | YES |
| Otto status hero | content is canned (not persisted) — driven by `vibe_otto_v1` later |
| Per-post Otto badges | hardcoded on 3 demo posts |
| **Posts** | NO — hardcoded markup |
| **Vibes grid** | NO — hardcoded thumbs |
| **Professional snapshot** | NO — hardcoded values |
| **At-a-glance stats** | NO — hardcoded |
| **Connection counts (847 / 32 / 1.2k)** | NO — hardcoded |
| Pinned item | NO |

Other pages: feed / network / campus / opportunities / messages still render hardcoded mock content. Inner empty states ("no posts yet", "no connections yet") never trigger because the pages don't read from persistence. Only the gating ("redirect to landing if no user") is wired up.

## Open / next (in priority order)

1. **Remaining profile sections to persistence** — posts, vibes grid, snapshot, stats, connection counts, pinned item. Mechanical work using the existing `saveProfileToStorage` / `renderUserSections` pattern. For each section: identify the DOM container, define the data shape (probably arrays of objects), capture in `saveProfileToStorage`, render in `renderUserSections`, hook into any add/remove handlers. Posts will likely move to a separate `vibe_posts_v1` key (already declared) since they're a list of resources, not user metadata. Snapshot + stats + counts can fold into `vibe_user_v1`.
2. **Connect button + viewer-mode** — view someone else's profile via URL param (e.g. `?user=mayar`). Seed 3–5 mock other-users for the demo so network.html cards have somewhere to navigate to. When viewing a non-self profile: hide owner-mode chrome (Edit, Exit, edit toggles), show Connect / Message / Follow buttons instead. The existing `viewer-mode` body class is already partially wired in profile CSS — extend it.
3. **Inner empty states** — once posts/connections/etc. are persisted on profile, wire feed/network/campus/opportunities/messages to read from those keys and show real empty-state UI when arrays are empty.
4. **Otto v1 sub-tabs** — Metrics / Insights / Customize / Platforms. Build out the four placeholder panels with real (still hardcoded for demo) content.
5. **Otto post-publish flow** — mockup 06. Wires the feed composer to Otto: user posts → Otto drafts variants → review modal → approve → confirmation.

## Bug traps that surfaced (and were fixed)
- `URL.createObjectURL()` blob URLs don't survive page reload. Replaced with base64 data URLs everywhere.
- `removeCalEvent` was missing `_calSave()` on every page. Latent bug since calendar shipped. Fixed across all 6.
- Profile's `saveNewEvent` crashed on `null.textContent` from `miniSelectDay` because profile has no mini widget — only the full modal. The crash bypassed `closeCreateEvent`, leaving the modal stuck open. Fixed by null-guarding `miniSelectDay`.
- Profile was missing the `.create-event-modal` markup entirely. Calendar's "+ New Event" was a silent no-op. Markup added.
- Profile's `.create-event-modal` z-index was 900 but `.cal-modal-backdrop` had been bumped to 9999 to clear profile chrome. New event form rendered behind the calendar. Bumped to 10000.
- `showFeedToast` is referenced in `saveNewEvent` but never defined anywhere. Replaced with `typeof showToast === 'function'` guard. (Latent bug still present in feed/network/etc. — they have a similar `showFeedToast` call. Worth a sweep.)
- Maya's hardcoded sidebar identity flashed on every page nav before `vibeHydrateSidebar` ran at DOMContentLoaded. Fixed with a pre-paint script in `_persistence.js`.
- Maya's hardcoded profile content (cover gradient, name, bio, work, etc.) flashed on profile nav before `initProfilePage` ran. Fixed with a pre-paint script in `profile.html` itself.
- The "no tags yet —" hint persisted after the first tag was added. Now stripped in `saveTag` and `renderUserSections`.
- `clearFreshUserExtras` was gated on `!user.name`, so it stopped firing once you typed a name → demo content reappeared on reload. Now runs whenever `_onboarded && !_isDemo`.

## Memory notes
- New feedback memory saved 2026-04-28: don't update the journal mid-session. Wait for an explicit handoff request. (See `feedback_journal_voice.md`.) This handoff was the trigger for the journal update above.

## How to brief the next chat
- Read `DOCS/ROADMAP.md` for big-picture priorities (still v3.4-era; could use a refresh).
- Read `_persistence.js` and `profile.html`'s `saveProfileToStorage` / `renderUserSections` to understand the persistence pattern. Adding a new section is mechanical: capture from DOM in save, rebuild DOM from data in render, hook into add/remove handlers.
- The Otto mockup folder (`~/Desktop/VIBE HUB/otto_mockups/`) is the visual source of truth for unbuilt Otto pieces. Files 02 + 03 already shipped (corner ring + slide-out). 05 shipped (Today view). 04 shipped (profile additions). 07 shipped (onboarding). Files 01 and 06 are still open: 01 is a 4-state Otto orb reference; 06 is the post-publish flow storyboard.
- Demo Maya and onboarded users behave differently. Always test both flows after touching profile init logic.
