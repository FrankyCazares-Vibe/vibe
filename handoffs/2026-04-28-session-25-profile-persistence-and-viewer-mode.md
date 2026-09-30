# Session 25 — remaining profile persistence + Connect / viewer-mode

End-of-session state for picking up cold in Session 26. Bullets only.

## What shipped

### Priority 1 — remaining profile sections wired to persistence
- **`_persistence.js`** — added `vibes: 'vibe_vibes_v1'` and `relationships: 'vibe_relationships_v1'` to `VIBE_KEYS`. Removed the empty-array `vibe_posts_v1` seed from `seedDemoData` so Maya's hardcoded post markup stays as the demo source until she edits.
- **Posts → own key `vibe_posts_v1`.** Wrapped 3 hardcoded post cards in `#profilePostsList`, each with `data-post-id` + delete + pin buttons. New `savePostsToStorage()` walks the list and stores `{id, ottoType, date, ottoBadgeHTML, bodyHTML, tagsHTML, platformStatsHTML, reactionsHTML}`. New `renderPostsFromStorage(postsOverride?)` rebuilds; `_renderPostCard()` is the template. New `deleteProfilePost()` removes + saves. `publishProfilePost()` now injects a real card and persists.
- **Vibes → own key `vibe_vibes_v1`.** `#profileVibesGrid` container, each thumb has `data-vibe-id` + delete button. `saveVibesToStorage` / `renderVibesFromStorage(vibesOverride?)` / `_renderVibeThumb` / `deleteVibe` / `addVibeFromUpload` (upload tile spawns a placeholder vibe with a random gradient).
- **Folded into `vibe_user_v1`:**
  - `user.snapshot` — 6 rows in `#recruiterCard` tagged `data-edit data-snapshot-key`.
  - `user.glance` — 4 rows in `#glanceCard` tagged `data-edit data-glance-key` (status row stores innerHTML to keep the avail-badge structure).
  - `user.counts` — `statConnections` / `statMutual` / `statFollowers` (no edit affordance — render-only until network features arrive).
  - `user.pinnedId` — pin/unpin in `pinFromProfile` persists; restored on load.
- **Pin rewritten** — reads body/tags/reactions from the post card or bg/title/views from the vibe thumb in DOM, plus current user identity (name/headline/avatar) from profile fields. No more hardcoded `profilePinnableContent` dict. Every post and every vibe is now pinnable. Pin avatar uses your actual photo or initials. `refreshPinButtons` updated to handle `.ppost-pin` and read parent dataset ids.
- **CSS:** `.ppost-delete` (top-right of each post card, edit-mode only) and `.ppost-pin` (next to it). `body.edit-mode .ppost-header-row { padding-right: 78px }` keeps the otto badge clear of the pin/delete buttons.
- **Relevant Skills strip** got an id (`relevantSkillsStrip`) and is now cleanly hidden for onboarded users via `clearFreshUserExtras` (replacing a broken querySelector). Deferred to the viewer-mode polish pass for the real wire-up — see `memory/project_relevant_skills_strip.md`.

### Priority 2 — Connect + viewer-mode (other people's profiles)
- **NEW: `~/vibe/public/html/_mockUsers.js`** — `VIBE_MOCK_USERS` dict with 5 full profiles, each shaped like `vibe_user_v1` plus inline `posts` and `vibes` arrays:
  - `ka` Kwame Asante — AI Founder building Atlas (Lagos → SF)
  - `ps` Priya Sinha — Independent Growth Lead (London → NYC)
  - `lm` Luca Moretti — Indie dev in Milan, boring stack evangelist
  - `ao` Aisha Okafor — Senior UX Researcher at Google (Brooklyn)
  - `dn` Diana Nguyen — Design Lead at Airbnb (SF)
  - Each has bio, vibe tags, skills, currently-on, work, snapshot, glance, counts, plus 1–3 posts and 2–3 vibes.
- **`?user=<slug>` URL param routing in profile.html.** New `viewingMockUser` global. `initProfilePage` now branches: if `?user=` is present + slug is in `VIBE_MOCK_USERS`, body gets `viewer-mode` (drops `owner-mode`), `clearFreshUserExtras` wipes Maya's markup, `renderUserSections(mockUser)` injects everything from the mock object. Render functions extended to accept optional override arrays (`renderPostsFromStorage(mockUser.posts)`, `renderVibesFromStorage(mockUser.vibes)`). Otherwise behaves as today.
- **Floating back-pill** at top center: "Viewing **Kwame Asante** · Back to your profile" — links to `/html/profile.html` with no params.
- **Top Connect button** wrapped in `.viewer-only` container — auto-shows on visitor view, auto-hides on own profile. Existing `setVibeRelState` / `handleVibConnect` / `handleSoftFollow` still drive the button states; toasts now use the viewed user's name (`_viewedName()`) instead of hardcoded "Maya Chen". Removed the old `initVibeConnect` IIFE — was setting inline `display` styles that conflicted with the new CSS-based gating.
- **Otto chrome hidden in viewer-mode:** `.otto-profile-hero`, `.op-badge`, `.op-platform-stats`, plus `#ottoCorner` / `#ottoPanel` / `#ottoBackdrop` (the sidebar widget). Otto is the owner's tool, not a visitor-facing surface.
- **Owner-write guards** on `saveProfileToStorage`, `savePostsToStorage`, `saveVibesToStorage`, `toggleEdit` — all early-return when `viewingMockUser` is set. A visitor can't accidentally clobber the owner's localStorage data even via a console call.
- **Connect/Follow persistence** — new `vibe_relationships_v1` key stores `{ slug: 'connected'|'pending'|'following' }`. `loadRelationship(slug)` reads + applies state via `setVibeRelState`. `setVibeRelState` auto-saves when on a mock user. `handleSoftFollow` persists 'following'. Reload preserves the relationship.
- **People-also-viewed cards** on profile (KA / PS / LM) wrapped in `<a href="/html/profile.html?user=...">` with `event.preventDefault();event.stopPropagation()` on the inner Follow button.
- **Network cards now navigate.** New `navMockProfile(event, slug)` helper — clicking a person card opens `/html/profile.html?user=<slug>` unless the click target is a button or anchor (so Message/Connect/Following still work). When the slug has no mock entry, it toasts "Profile not in this demo yet". Wired into `rConns`, `rFols`, `rFolrs`, `rSuggs`. All inner buttons got `event.stopPropagation()`.

### Polish
- **Network pane descriptions** — each tab now has a one-line `pane-desc` microcopy line above the list. New `.pane-desc` CSS class.
  - Connections: "Mutual connections — they accepted your request, and DMs are open both ways."
  - Following: "People you've sent a connect request to. They'll move to Connections if they accept; until then they only see your posts."
  - Followers: "Everyone who can see your posts — your connections, plus people who requested to connect with you that you haven't accepted yet."
- **Pin / vibe-only overlap fix** — header row gets `padding-right: 78px` in edit mode so the otto badge clears the absolutely-positioned pin + delete buttons.

### MIRRORED to `~/Desktop/VIBE HUB/ACTIVE/`
- `_persistence.js`, `_mockUsers.js` (new), `profile.html`, `network.html` — all mirrored after each change.

## Live test flow (hard refresh + `vibePersist.clearAll()` first)

**Demo Maya flow:**
1. `localhost:3000/html/landing.html` → "View demo site" → feed
2. Navigate to profile → edit bio + add a skill + delete a work item → reload → all persists
3. Hit Pin on any post or vibe → reload → it stays pinned (was previously broken for anything other than 4 hardcoded ids)
4. Open snapshot/glance fields, edit any value → reload → persists
5. Click any "People also viewed" card (Kwame/Priya/Luca) → opens their profile in viewer-mode

**Connect / viewer-mode flow:**
6. From Maya's profile → click "Kwame Asante" in People also viewed → loads `?user=ka`
7. Should see: floating back pill at top, no Edit button, no Otto status hero, no Otto sidebar widget, Connect button up top right
8. Hit Connect → "Request sent to Kwame Asante" → 3s later → "Kwame Asante accepted" → button shows Message
9. Reload → state persists (Message button stays)
10. Back to your profile → Network tab → click a connection card (anywhere except Message/Connected button) → opens that person's profile if mocked, otherwise toasts "Profile not in this demo yet"

**Fresh-onboarded flow** (still works as before):
11. `vibePersist.clearAll()` → landing → "Create your profile" → onboarding → land on empty profile → fill in any field → reload → persists.

## Files touched
- NEW: `_mockUsers.js`
- MODIFIED: `_persistence.js`, `profile.html`, `network.html`
- All mirrored to `ACTIVE/`

## Decisions locked in this session
- **Posts and vibes are list resources, separate keys.** `vibe_posts_v1` and `vibe_vibes_v1` follow the same shape pattern as `vibe_user_v1` sections (capture from DOM, render from data, hook into add/remove).
- **Snapshot, at-a-glance, counts, and pinnedId are user metadata.** They fold into `vibe_user_v1` since they describe the user, not list resources.
- **Pin reads from DOM, not from a hardcoded dict.** Lets every post and every vibe be pinnable. Source-of-truth is what's currently rendered in the post card or vibe thumb.
- **Mock users are markup-equivalent data.** Each `VIBE_MOCK_USERS[slug]` mirrors `vibe_user_v1` shape so the existing render path hydrates them with no special casing — except posts/vibes come inline rather than from localStorage.
- **`viewer-mode` is auto-applied when `?user=<slug>` is in the URL.** No manual toggle, no opt-in. Matches the user's mental model: clicking a person opens their profile in visitor view.
- **Owner write paths are guarded by `viewingMockUser`.** Belt and suspenders — CSS hides the chrome, but the JS functions also early-return so a console call can't corrupt the owner's data.
- **Connect/Follow state is per-slug and persists.** `vibe_relationships_v1` is a single object keyed by slug. State is restored on profile load (only when viewing a mock user).
- **Network → profile navigation skips when no mock exists.** Better demo UX than landing on an empty profile. Toasts "Profile not in this demo yet" so the click feels acknowledged.
- **Relevant Skills strip is deferred to the viewer-mode polish pass.** Hidden for onboarded users in the meantime. Memory note: `memory/project_relevant_skills_strip.md`.

## What's hardcoded vs persisted (profile, updated)

| Section | Persistence wired? |
|---|---|
| Identity (name, tagline, location, headline, website) | YES |
| Bio | YES |
| Avatar photo | YES (data URL) |
| Vibe tags | YES |
| Skills | YES |
| Currently working on | YES |
| Work experience | YES (incl. logo data URL) |
| Resume / portfolio uploads | YES (data URLs) |
| Cover banner (photo or gradient) | YES |
| **Posts** | **YES** — `vibe_posts_v1` |
| **Vibes grid** | **YES** — `vibe_vibes_v1` |
| **Professional snapshot** | **YES** — `user.snapshot` |
| **At-a-glance stats** | **YES** — `user.glance` |
| **Connection counts (847 / 32 / 1.2k)** | **YES** — `user.counts` (no edit UI) |
| **Pinned item** | **YES** — `user.pinnedId` |
| Otto status hero | content is canned (driven by `vibe_otto_v1` later) |
| Per-post Otto badges | hardcoded on Maya's 3 posts; carried via the post data on new posts |
| Relevant Skills strip | hidden for onboarded — pending viewer-mode wire-up |
| Split-pane layout (alt view) | NOT wired (alt view, decorative for now) |

## Connect / viewer-mode coverage

| Surface | Wired? |
|---|---|
| `?user=<slug>` URL param routes to mock user | YES |
| Auto-applies `viewer-mode` body class | YES |
| Renders mock identity, work, skills, snapshot, glance, counts | YES |
| Renders mock posts and vibes | YES |
| Hides edit/composer/delete/pin chrome | YES (`.owner-only` + viewer-mode CSS) |
| Hides Otto status hero, badges, platform stats, sidebar widget | YES |
| Floating back-to-own-profile pill | YES |
| Connect button visible only on visitor view | YES |
| Toasts use the viewed person's name | YES |
| Connect/Follow state persists per slug | YES (`vibe_relationships_v1`) |
| Network cards click to open mock profile | YES (with no-mock toast) |
| People-also-viewed cards click to open | YES |
| Owner can't accidentally write while viewing mock | YES (guards on save fns + toggleEdit) |
| `?user=ka` mock has full content | YES (5 mocks: ka, ps, lm, ao, dn) |

## Open / next (in priority order)

1. **Otto v1 sub-tabs** — Metrics / Insights / Customize / Platforms still placeholder panels on `otto.html`. Each needs a real build modeled on the mockup language.
2. **Otto post-publish flow** — mockup 06's 5-frame storyboard. Wires the **feed** composer to Otto: post → Otto drafts variants → review modal → approve → confirmation. Big one — touches feed.html and the Otto pipeline.
3. **Student .edu verification flow** — email confirms student status, badge unlocks campus tab and appears on profile.
4. **Inner empty states** — feed/campus/opportunities/messages still render hardcoded mock content. Wire each page to read from its `vibe_<key>_v1` key so empty arrays trigger real "no posts yet" UI.
5. **Fill in remaining mock users** — we have 5 (ka, ps, lm, ao, dn). Network references many more (zw, jr, bs, rk, sc, yw, nm, ml). Each card without a mock currently toasts "Profile not in this demo yet" — could fill in.
6. **Relevant Skills strip wire-up** — during a viewer-mode polish pass. Decide drop-vs-derive from `user.snapshot.topSkills`.
7. **Connect side polish** — Connect button auto-accepts after 3s for the demo. Eventually wire to a real "pending requests" state with the other person's incoming view.

## Bug traps that surfaced (and were fixed)
- The original `pinFromProfile` only knew the 4 hardcoded ids in `profilePinnableContent`. Newly-published posts and most vibes were silently un-pinnable. Rewrote to read from DOM.
- The "vibe only" pill / Pin button overlap — header row was justify-between with the badge flush right, while Pin/Delete are absolutely positioned at right:42px / right:10px. Fixed with `padding-right: 78px` on the header row in edit mode.
- The old `initVibeConnect` IIFE was setting `wrap.style.display` inline at script parse time, before the body's `viewer-mode` class was applied. The inline style won over the new `.viewer-only` CSS rule. Removed the IIFE entirely; visibility is now CSS-driven and state init moved into the loadRelationship call inside initProfilePage's mock branch.
- `clearFreshUserExtras`'s "Relevant Skills" wipe was querying `div[style*="..."]` for elements that are actually `<span>`s — silently no-op'd. Replaced with an `id`-based lookup (`#relevantSkillsStrip`) and a clean `display:none`.
- Save functions could be triggered while viewing someone else's profile and would walk the visible mock-user DOM, writing it into the owner's `vibe_user_v1`. Added `if (window.viewingMockUser) return` guards to all four save/edit entry points.

## How to brief the next chat
- Read this handoff and `DOCS/ROADMAP.md` for big-picture priorities.
- The two big new files are `_mockUsers.js` (mock people for the demo) and the rewritten persistence functions in `profile.html`. Pattern is the same as Session 24: capture from DOM in save, rebuild DOM from data in render, hook into add/remove handlers.
- Adding a new mock user is mechanical: pick a slug, add an entry to `VIBE_MOCK_USERS` mirroring an existing one. The render path Just Works.
- The Otto mockup folder (`~/Desktop/VIBE HUB/otto_mockups/`) is still the visual source of truth for unbuilt Otto pieces. Files 02 + 03 + 04 + 05 + 07 already shipped. Files 01 and 06 are still open: 01 is a 4-state Otto orb reference; 06 is the post-publish flow storyboard.
- Demo Maya, fresh-onboarded users, AND viewer-mode visitors all behave differently. Always test all three flows after touching profile init logic.

## Memory notes
- New project memory saved 2026-04-28: `memory/project_relevant_skills_strip.md` — Relevant Skills strip is hidden for onboarded users, pending real wire-up during viewer-mode polish (decide drop-vs-derive from `user.snapshot.topSkills`).
