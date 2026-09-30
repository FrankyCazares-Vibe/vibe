# Session 26 — Otto sub-tabs + post-publish flow + .edu verification + empty states

End-of-session state for picking up cold in Session 27. Bullets only.

## What shipped

### Priority 1 — Otto v1 remaining sub-tabs (Metrics / Insights / Customize / Platforms)
- **`otto.html`** — replaced the four `coming-soon` placeholder panels with real, content-rich tabs. Reused existing visual primitives (`section-eyebrow`, `card-white`, `card-dark`, `metric-bar-row`, `perf-row`, `slider-row`, `leash-row`) plus added new ones (`tab-body-grid`, `kpi-strip`, `kpi-tile`, `range-toggle`, `bar-chart-tall`, `aud-row`, `top-post-row`, `pattern-card`, `otto-narrative`, `reco-card`, `voice-sample`, `chip` / `chip-list`, `win-day` / `win-slot`, `toggle`, `setting-row`, `persona-input`, `plat-card`, `avail-card`, `pred-list`).
- **Metrics:** range pills (7d / 28d / quarter), 4-up KPI strip (views / profile views / engagement / followers) with deltas, 28-day daily bar chart with Wednesdays in purple + a 2.4× outperformance footnote, top-5 performing posts ranked, per-platform breakdown w/ growth %, audience composition by industry, content-type comparison.
- **Insights:** "Otto's read of the month" big dark italic narrative card up top, six pattern cards (cadence / voice / timing / vibes-on-IG / X-flat / profile-depth), four forecast predictions in a dark card, three actionable reco cards with action buttons.
- **Customize:** voice training (3 trained samples + retrain/add buttons), 5 tone sliders (casual/formal, concise/thorough, earnest/witty, playful/serious, technical/accessible), posting windows (day-of-week toggles + 24-slot time grid), off-limit topic chips with add/remove, dark "Otto's persona" card with name/sign-off inputs and 3 toggle settings.
- **Platforms:** 4 connected platform cards (LinkedIn/IG/TikTok/X) with status pills, per-platform stats (posts / avg views / followers · 28d), Otto's read per platform, settings + disconnect/pause buttons; 5 available platforms (YouTube, Substack, Threads, Bluesky, Medium); 4 cross-post rule toggles.
- **Interactivity wired:** range pills, all `.toggle` switches, `.win-day` / `.win-slot` selection, chip removal (`.chip-x`), chip-add prompt. Cursor hover bound for new interactive elements.

### Priority 2 — Otto post-publish flow (mockup 06)
- **`_otto.js`** — extended with the 5-frame storyboard. New module-scoped state (`pubFlowActive`, `pubBubble`, `pubPanel`, `pubBackdrop`, `pubToast`, `pubPcard`, `pubApproved`). New `PLATFORM_META` map. `generateVariants(text)` produces LinkedIn (original) / Instagram (lowercase + casual outro) / X (first sentence + "thoughts?") variants from the user's actual post text — text length capped at 220 chars per variant.
- **Frame 1:** `publishFlow(pcard, text)` adds `.otto-just-posted` (coral inset border) + a `.otto-posted-badge` ("POSTED" pill) to the new post card. 1.5s beat.
- **Frame 2:** `showAskBubble()` injects `#ottoAskBubble` (dark rounded card with arrow) above the corner ring; corner gets `.otto-glow` class. "want me to send this to your other 3 platforms?" with [Yes, draft them] / [Skip].
- **Frame 3:** `showThinkingPanel()` injects `#ottoPubBackdrop` + `#ottoPubPanel` (slides from right, 380px). Otto in "thinking..." state. Three `.opp-pp-row` rows for the platforms — staggered timeouts (1.1s, 2.4s, 3.3s) cycle each from queued → drafting (spinner) → ready (green check).
- **Frame 4:** `morphToDrafts(variants)` swaps the panel body for the drafts view: briefing line ("linkedin's the strongest. i'd skip x — your audience isn't there."), three `.opp-draft` cards (LinkedIn recommended w/ PICK badge, Instagram, X with "i'd skip"), per-draft Approve / Edit, footer "Approve all 2 →" / "Skip all".
- **`approveDraft()`** marks a card with `.approved` (green border), swaps PICK → APPROVED green check, replaces actions with "✓ scheduled to post". `editDraft()` swaps the text into a `<textarea>`, blurs to commit, Cmd+Enter shortcut.
- **Frame 5:** `finalizeFlow()` removes the post highlight, injects an `.otto-syndicated-badge` into the post header ("otto · N platforms" with a pulsing coral dot), and calls `showSyndicatedToast()` which slides in `#ottoPubToast` with green check + Italic message ("shipped to LinkedIn & Instagram. I'll watch how they do."). Toast auto-fades after 4.5s.
- **Backdrop click / × button / Skip all → `cancelFlow()`** — closes panel cleanly, calls `finalizeFlow([])` so highlight clears with no badge.
- **`feed.html` `submitPostB()`** — new line at end: `window.otto?.publishFlow?.(d, v)` hands the new post card + text to the flow.
- **Window export updated:** `window.otto = { open, close, publishFlow }`.

### Priority 3 — Standard Otto side panel learns from your last post
- Old behavior: hardcoded Maya-Next.js drafts in the slide-out panel, no matter what you'd published.
- **`publishFlow()` now persists** `vibeSave('vibe_otto_lastpost_v1', { text, ts })` at the start of every run.
- **`buildPanel()` body emptied** — replaced the inline drafts HTML with an empty `.otto-panel-body` div.
- **New `renderPanelBody()`** called from `openOttoPanel()` on every open. Reads from `vibe_otto_lastpost_v1`, generates variants, and rebuilds the body (briefing + 3 drafts + activity).
- **New `renderDraftsHTML(latest)`** — if no last post, returns a friendly empty state ("haven't seen a post yet — when you publish something, your platform drafts will live here. try the composer over in feed →"). If a post exists, returns the briefing + LinkedIn (PICK) / Instagram / X (skip) drafts populated with `escapeHTML(v.linkedin)` etc.
- **Result:** publish a post → open the side panel → see drafts of YOUR text. Reload → still your text. The post-publish flow and the side panel share the same `generateVariants()` so they stay consistent.

### Priority 4 — Student .edu verification flow
- **NEW: `_studentVerify.js`** — shared module that exports `window.studentVerify = { open, close, isVerified, getStatus, getSchool, getEmail, setVerified, clearVerification, deriveSchool }`.
- **Modal: 3 states**
  - State 1: `.edu` email input with regex validation (`^[^\s@]+@[^\s@]+\.edu$`), inline coral error if invalid, "Send verification link" button, microcopy footer.
  - State 2: "Check your email" — purple icon, "I clicked the link →" demo button + "Use a different email" ghost button, microcopy explaining demo mode.
  - State 3: "You're verified" — green check, school pill with pulsing dot, "Open Campus" / "Go to Campus →" CTA (text differs based on origin page).
- **`SCHOOL_LOOKUP`** — 24 common US schools mapped (iu.edu / mit.edu / berkeley.edu / nyu.edu / etc.). `deriveSchool(domain)` falls back to `<root>.University` for unknown domains.
- **Persistence:** `vibe_user_v1.studentVerification = { status: 'verified', email, school, ts }`. Folded into the existing user object; doesn't need a new key.
- **Custom event:** `document.dispatchEvent(new CustomEvent('vibeStudentVerified', { detail: { email, school } }))` fires on success. Pages listen + refresh their UI.
- **Esc / backdrop click / × close the modal at any state.**

### Priority 4b — Campus tab gates on verification
- **`campus.html`** — loads `_studentVerify.js` (between `_persistence.js` and `_otto.js`).
- New `.campus-gate` panel inside `.shell` that uses `grid-column: 2 / -1` to span the center+right area.
- Gate content: "Campus is for verified students" h2, subhead about .edu unlocking, four feature tiles (events & deadlines / jobs & internships / your classmates / campus chat) in a 2×2 grid, IU-red "Verify with your .edu email" CTA → calls `window.studentVerify.open()`. "Not a student? Back to your feed →" link below.
- **`applyVerificationGate()`** — runs on page load. If verified: hide gate, show `.center` + `.right`, swap `.campus-bar-info h2` text to the user's actual school. If unverified: show gate, hide `.center` + `.right`.
- Listens for `vibeStudentVerified` to re-apply (so verifying from the modal updates the page live without reload — though modal also offers a "reload" via the "Open Campus" button to be safe).

### Priority 4c — Profile shows badge / verify CTA
- **`profile.html`** — loads `_studentVerify.js`. Wrapped the existing `<h1.profile-name>` in `.identity-name-row` flex container with a sibling `<span#studentBadgeSlot.student-badge></span>`.
- **`renderStudentBadge(userObj, isOwn)`** — runs at end of init in both branches (mock-user view + own profile).
  - Verified user/mock → shows coral badge: "🎓 Student · {school}" with school in bold.
  - Own profile + unverified → injects a small dashed `<button.student-verify-cta>+ Verify your student status</button>` that opens the modal.
  - Mock-user view + unverified → renders nothing (no CTA on visitor view).
- **Listens for `vibeStudentVerified`** — re-renders the badge live (drops the CTA, shows the badge).

### Priority 5 — Empty states for fresh-onboarded users
- **All trigger on `user._onboarded && !user._isDemo`**. Demo Maya keeps every hardcoded item.
- **`feed.html`** — hides `#votdWrap` (Vibe of the Day), `.match-bar` (Ranked-by-match banner), and every `.post-card` inside `#postFeedB`. Shows `#feedEmpty`: "📡 Your feed is quiet" + Find people CTA + Otto microcopy footer ("the easiest way to bootstrap a feed is to find five people who think like you. then five who challenge you. — otto"). Composer stays. New `hideFeedEmptyState()` called from `submitPostB()` after insert — empty state vanishes the moment user publishes their first post.
- **`opportunities.html`** — hides every direct child of `.opp-list` except `#oppEmpty`, plus hides `.search-row` and `.filter-bar`. Shows `#oppEmpty`: "💼 No opportunities yet" + Edit-your-profile CTA + Otto microcopy ("the more otto knows about how you work, the better i can match you to roles. — otto").
- **`messages.html`** — hides `.req-banner` (3 message requests), `.t-tabs` (All/Unread/Connections), `#tScroll` (5 hardcoded threads). Shows `#tEmpty` in left column: "💬 No conversations yet" + Find people CTA. Right-column `#emptyState` copy softened: "Pick someone to message" / "Once you connect with people on Vibe, your conversations will live here." The "Open a conversation" button (which would have opened a non-existent Kwame thread) is removed.
- **`campus.html`** — skipped. Its verification gate handles the empty case (unverified users hit the gate; verified users see IU content for now until per-school content lands).

### MIRRORED to `~/Desktop/VIBE HUB/ACTIVE/`
- `otto.html`, `_otto.js`, `feed.html`, `campus.html`, `profile.html`, `messages.html`, `opportunities.html`, NEW `_studentVerify.js`.

## Live test flow (hard refresh + `vibePersist.clearAll()` first)

**Demo Maya flow (everything hardcoded, no empty states):**
1. `localhost:3000/html/landing.html` → "View demo site" → feed
2. Feed shows VOTD + Kwame/Priya/Luca/Zara posts (unchanged)
3. Profile shows "+ Verify your student status" pill next to "Maya Chen"
4. Click pill → modal opens → type `something@iu.edu` → Send → "I clicked the link →" → "Open Campus"
5. Campus.html shows full IU content (header now reads "Indiana University" — matches demo)
6. Profile reload → coral 🎓 Student · Indiana University badge replaces the verify pill

**Otto post-publish flow:**
7. From feed.html, type any post and hit Publish → coral border + POSTED badge appears
8. After ~1.5s → Otto bubble pops above corner ring → click "Yes, draft them"
9. Side panel slides in: "thinking..." → platforms cycle queued → drafting → ready → drafts view
10. Approve LinkedIn individually OR click "Approve all 2 →" → panel collapses, post card now has "otto · 2 platforms" badge in header, green toast appears bottom-right
11. Click the corner ring → standard Otto panel opens → briefing + drafts now reflect YOUR post (not Maya's hardcoded one)

**Fresh-onboarded flow (empty states + verification gate):**
12. `vibePersist.clearAll()` → landing → "Create your profile" → onboarding → land on profile
13. Visit feed → "📡 Your feed is quiet" empty state with Find people CTA
14. Visit opportunities → "💼 No opportunities yet" with Edit profile CTA
15. Visit messages → "💬 No conversations yet" left column, "Pick someone to message" right column (no broken button)
16. Visit campus → verification gate panel (no IU content)
17. Click Verify → enter `you@anything.edu` → walk through modal → Campus unlocks
18. Publish a post on feed → empty state vanishes, post appears, Otto post-publish flow kicks in

**To wipe verification only without nuking the user object:** `window.studentVerify.clearVerification()` in console.

## Files touched
- NEW: `_studentVerify.js`
- MODIFIED: `otto.html`, `_otto.js`, `feed.html`, `campus.html`, `profile.html`, `messages.html`, `opportunities.html`
- All mirrored to `ACTIVE/`

## Decisions locked in this session
- **Otto sub-tabs use the same visual language as Today.** New components extend the existing system rather than introducing a fresh design vocabulary. Cards stay white-on-cream or dark-on-cream; the eyebrow + section-meta pattern carries throughout.
- **Post-publish flow is invoked, not autonomous.** The flow only runs when feed.html's `submitPostB` calls `window.otto.publishFlow(card, text)`. Otto doesn't decide on its own to start the flow — keeps the boundary clean and lets other surfaces (campus composer, future composers) opt in.
- **Variants are generated client-side (demo).** No real LLM call yet — `generateVariants(text)` does deterministic transforms (lowercase for IG, first sentence + "thoughts?" for X). Real generation is part of the Otto v2 backend phase.
- **Side panel state is per-last-post, not per-session.** Reload the page → side panel still shows drafts for your most recent post. Wipes only when the user publishes a new one (which overwrites the key).
- **Verification persistence folds into vibe_user_v1.** Doesn't get its own key — it describes the user, same pattern as snapshot/glance/counts.
- **Campus gate replaces center+right, not the entire shell.** Left nav stays so the user can navigate elsewhere. Gate matches the IU red accent color via gradient + CTA.
- **Profile badge is rendered for both own and mock views.** Removed `.owner-only` from the badge slot so verified mock users would also show the badge if their data had it (none do today; future-proofing).
- **Verify CTA is own-profile only.** Mock users in viewer mode never see the CTA — only the badge if they're verified.
- **Empty states branch on `_onboarded && !_isDemo`.** Same trigger as profile.html's `clearFreshUserExtras`. Demo Maya is the canonical "everything populated" state for screenshots and walkthroughs.
- **Feed empty state hides on first publish.** Once the user adds content, the empty state shouldn't reappear that session. `hideFeedEmptyState()` is idempotent.
- **Campus empty state skipped.** Gate handles the unverified case; verified users see IU content. Per-school content is its own next-step.
- **Mock-roster fill is dropped.** Five mocks (ka, ps, lm, ao, dn) is enough demo coverage. Effort better spent on backend work, per Franky's call this session.

## Open / next (in priority order)

1. **Connect-side polish** — replace the demo 3-second auto-accept with a real pending-request state and an incoming view on the other person's side. Add a notification when accepted.
2. **Per-school campus content** — verified non-IU students currently still see IU content. Either a "your school doesn't have campus content yet" empty state, or seed a few additional mock schools alongside IU.
3. **Backend phase: Otto v2** — voice training pipeline, platform OAuth (LinkedIn, Instagram Business, TikTok, YouTube, X), posting queue, real metrics ingestion. The platform-strategy notes (`otto_mockups/otto_platform_strategy.md`) cover authorization concerns. Larger separate phase.
4. **Real .edu verification** — replace the demo "I clicked the link" with an actual one-time-link email send + click confirmation. Handle alumni domains, faculty, staff edge cases.
5. **For You algorithm** — currently the "94% match", "Matched for you", "Ranked by match" labels are hardcoded text. Real ranking signals: skills overlap, mutuals, same field, campus proximity, recent activity. Backend.
6. **Viewer-mode polish** — wire the Relevant Skills strip on profile (currently hidden for onboarded users) to derive from `snapshot.topSkills`. Sweep for any remaining owner-only chrome leaking into visitor view.
7. **Calendar / campus RSVP sync** — RSVP on campus events auto-adds to calendar.
8. **Notifications** — connection requests, RSVP reminders, new org posts, Otto inbox alerts.

## How to brief the next chat
- Read this handoff and `DOCS/ROADMAP.md` for big-picture priorities.
- The two big new files this session are `_studentVerify.js` (verification modal + helpers) and the publish-flow extension at the bottom of `_otto.js` (everything below the comment "POST-PUBLISH FLOW (mockup 06)").
- Pattern for adding a new shared overlay: copy `_studentVerify.js`'s structure — IIFE, injectStyles() lazily, expose `window.<name>` API, dispatch a `vibe<Thing>Done` custom event for pages to listen on.
- Pattern for adding a new persistence field on the user: add to `vibe_user_v1` (not a new key) if it describes the user; new key only for list resources (posts, vibes, relationships, otto-lastpost).
- The Otto mockup folder (`~/Desktop/VIBE HUB/otto_mockups/`) is still the visual source of truth. Files 02 + 03 + 04 + 05 + 06 + 07 have all shipped now. File 01 (4-state Otto orb reference) is informational, not unbuilt.
- `otto_mockups/otto_platform_strategy.md` (uploaded by Franky this session) covers future platform-account-authorization concerns — read before the Otto v2 backend phase.
- Three different user states still need to test on every Otto / profile / campus / feed change: demo Maya, fresh-onboarded, viewer-mode visiting a mock user.

## Memory notes
- No new memory files added this session. Existing memory still holds:
  - `feedback_docs_location.md` — DOCS/ for .md, ACTIVE/ for runtime assets only, mirror Claude Code edits
  - `feedback_journal_voice.md` — warm-professional editorial voice for journal updates
  - `project_relevant_skills_strip.md` — Relevant Skills strip is hidden for onboarded users; pending wire-up during viewer-mode polish
- Decision recorded in this session (no memory written, captured here): **mock-roster fill is dropped.** Future Claude should not reintroduce it as a priority.
