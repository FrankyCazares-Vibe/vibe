# Session 45 handoff — Otto's Room, profile views + creator stats, resume viewer rebuild (2026-05-11)

Stage 7 keeps closing. This was the data-and-detail session — the user-selected pickup from session 44 (Otto reminder system + dedicated `/otto` page) shipped in full, the post-launch retention play (profile views + creator stats with a baked-in premium hook) shipped right behind it, and the resume/portfolio viewer got a top-to-bottom rebuild after the user flagged the existing one as unusable. Otto's bottom-right orb is now mounted on every campus-shelled surface AND on the static profile prototype, so the same side panel (notifications + your metrics + activity) appears wherever the user is — except `/messages`, where it conflicted visually.

Two migrations were authored. The Otto reminders + settings migration was already half-applied on the remote DB from an ad-hoc earlier today; the new file codifies it and adds the missing RLS policies. The profile-views migration is fresh schema. **The user applied both migrations during this session** via the Supabase SQL editor — production data layer is live.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for everything below. |
| **`[You]`** | Human — product direction, scoping, real-time visual feedback (especially on resume viewer iterations). |

---

## 1) What shipped

### Phase A — Otto's Room (`/otto`) full rebuild

The user-selected pickup from session 44. `/otto` was a placeholder page; it's now a full command center.

#### Migration `20260512000000_otto_reminders_and_settings.sql`

Idempotent. The remote DB already had the table + column from an ad-hoc apply, but **zero RLS policies** existed on `otto_reminders` — under RLS-enabled, that blocks all authenticated access. Migration backfills the four missing policies + is safe to re-run.

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS otto_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.otto_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN
    ('manual','rsvp','mention','milestone','unanswered_dm','connection')),
  source_id uuid, source_kind text,
  title text NOT NULL, body text,
  remind_at timestamptz, surfaced_at timestamptz,
  dismissed_at timestamptz, acted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otto_reminders_user_remind_idx
  ON public.otto_reminders (user_id, remind_at NULLS LAST, created_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.otto_reminders ENABLE ROW LEVEL SECURITY;
-- + four "_own" policies on SELECT/INSERT/UPDATE/DELETE keyed to auth.uid()=user_id
```

#### Chrono-lite parser ([src/lib/otto/parse-reminder.ts](src/lib/otto/parse-reminder.ts))

~155 lines, no LLM. Recognizes today / tonight / tomorrow / `next <weekday|week|month>` / weekday alone / `in N units` / `at H[:MM] (am|pm)?` / combined. Returns `{ title, remindAt }` — unrecognized patterns preserve the full string with `remindAt: null`. 12 `node:test` cases in [parse-reminder.test.ts](src/lib/otto/parse-reminder.test.ts) against a frozen `now`.

#### API surface

- **`GET /api/me/otto`** — single-roundtrip composer ([route.ts](src/app/api/me/otto/route.ts)). Pulls notifications (activity), rsvps + events (upcoming events), dated otto_reminders (upcoming reminders), one-way followers viewer hasn't followed back (asking), unread DM count, undated reminders, and `users.otto_settings`. **Important spec adaptation**: the spec called for "pending follow requests" but `connections` is a follow model (no `status='pending'`). Adapted to "new followers viewer hasn't followed back" — same intent, fits the actual schema. The `[Follow back]` action POSTs to the existing `/api/me/follow`. Counts derived from the same payload.
- **`POST /api/me/otto/reminders`** — manual reminder create. Body `{ title, body?, remind_at? }`. Client parses time phrases via parse-reminder, sends both `title` and the resolved ISO `remind_at`. Kind is always `'manual'` here.
- **`DELETE /api/me/otto/reminders/:id`** — soft-dismiss (sets `dismissed_at`). Index is partial on `dismissed_at IS NULL` so dismissed rows drop out of the hot query.
- **`POST /api/me/otto/reminders/:id/act`** — affirmative dismiss (sets both `acted_at` + `dismissed_at`). Future Otto can mine acted-vs-dismissed for learning.
- **`PATCH /api/me/otto/settings`** — whitelisted partial JSON merge. Read current `users.otto_settings`, deep-merge, write back. Each key type-checked; unknown keys silently dropped so new toggles in newer clients don't break old deployments.

#### React tree

`/otto` server entry ([page.tsx](src/app/otto/page.tsx)) auth-gates via `enforceCampusAccess`, then does a same-origin SSR fetch of `/api/me/otto` (cookies passed through `headers()`) so the page paints fully populated on first frame. Wraps the client in `<Suspense>` because [OttoPageClient](src/components/otto/OttoPageClient.tsx) uses `useSearchParams` for tab state.

Components ([src/components/otto/](src/components/otto/)):

- **OttoPageClient** — owns live state, optimistic mutations, tab routing
- **OttoHero** — 88px orb reusing `.vibe-landing-sun-*` halos + breathing animation, name + voice + counts pill (horizontal layout)
- **OttoSection** — shared frosted-glass shell with coral-pulsing eyebrow dot, accepts `wide` prop for full-grid-row sections
- **OttoActivity** — natural-language renderer for notifications ("Tyler liked your post", etc.) with type → verb mapping
- **OttoUpcoming** — events + dated reminders merged + sorted by date
- **OttoRequests** — new followers + unread DMs row + undated reminders
- **OttoTellInput** — input wired to chrono parser, shows live preview ("otto heard: X · Tue, May 12, 9:00 AM") before submit
- **OttoSettings** — segmented Quiet/Moderate/Loud preset that bulk-sets the 5 channel toggles (debounced 350ms trailing-edge PATCH), shows "Custom — tweak the toggles below" when toggles drift off-preset

Tab state via `?tab=stats` URL param (history.replaceState; no router round-trip, no back-button churn). Hero stays visible across both tabs.

### Phase B — Profile views + creator stats (the engagement loop + premium hook)

#### Migration `20260513000000_profile_views_and_user_view_count.sql`

Mirrors `post_views` pattern exactly:

- `users.profile_view_count` integer counter (denormalized, cheap to read)
- `profile_views` ledger table keyed by `(profile_user_id, viewer_user_id, viewed_on)` — per-viewer-per-day dedupe. Also stores `referrer` text (nullable) and `first_viewed_at` timestamp
- RLS: profile owner only reads their own incoming view rows. Viewers never see each other's rows
- `record_profile_view(p_profile_user_id uuid, p_referrer text) RETURNS boolean` SECURITY DEFINER — self-views filtered server-side, anonymous viewers no-op, returns true only on first insert of the day (so counter increments are atomic)

#### API surface

- **`POST /api/profile-views`** ([route.ts](src/app/api/profile-views/route.ts)) — fire-and-forget tracker. Body `{ handle | profile_user_id, referrer? }`. Anonymous viewers return `{ ok: true, counted: false }` instead of 401 so the client can fire blindly.
- **`GET /api/me/profile-views`** ([route.ts](src/app/api/me/profile-views/route.ts)) — counts (today / 7d / 30d / all-time) + last 25 viewers with profile data (name, handle, avatar). Stamps `premium: false` so the UI can show "premium soon" footnote — the gate is ready to wire one line of client code when billing lands.
- **`GET /api/me/creator-stats`** ([route.ts](src/app/api/me/creator-stats/route.ts)) — aggregate views/likes/comments/reposts across the viewer's posts + clips. 7d/30d/all-time windowed buckets. Top 5 posts ranked by `views + 4×likes + 6×comments + 8×reposts` so the list isn't dominated by raw view counts.

#### Tracker on profile.html

Static-page surface. When `body.viewer-mode` is set (someone else's profile), a small IIFE fires `POST /api/profile-views` with the URL handle on load. Self-views are filtered in the RPC. The tracker is the only profile-views code on profile.html now — the floating pill/panel was tried briefly and pulled (it was overlapping header buttons).

### Phase C — Global Otto orb + side panel metrics

The user wanted the same Otto experience everywhere. Three threads:

#### Global mount

[CampusAppShell](src/components/campus-app-shell.tsx) now renders `<OttoCorner />` (was previously only mounted in NetworkPageClient). So the bottom-right orb appears on campus / network / profile (React routes) / settings / otto. **Excluded on `/messages`** via `usePathname` gate — the chat surface has its own bottom-right composer that conflicted visually.

#### Static profile.html parity

`/profile/<handle>` redirects to `/html/profile.html` (static prototype). That page loads the legacy `/html/_otto.js` script (1148 lines), which mounts its own orb + side panel — separate from the React `OttoCorner`. So profile.html had an orb already, just no metrics.

[Earlier this session I built a vanilla port](public/html/profile.html) of the React side panel into profile.html before realizing the legacy `_otto.js` was already there shadowing it. **Reverted the vanilla port** and instead added the metrics block to `_otto.js` itself, so every static prototype page that loads `_otto.js` (profile, campus, network, opportunities, etc.) gets the same metrics surface.

#### Metrics block — three surfaces, one shape

- **React [OttoSidePanel](src/components/network/OttoSidePanel.tsx)** — added a "your metrics" section between the notification stats grid and the activity feed. 4 tiles (Profile views 30d coral / Post views / Likes / Reposts), whole block links to `/otto?tab=stats`. Loading + failed-to-load + empty states all distinguishable.
- **Legacy [`/html/_otto.js`](public/html/_otto.js)** — same 4-tile grid in matching styling (`.otto-stat-tile--accent` coral variant), `full breakdown in /otto →` deep-link, `_ottoFetchMetrics()` runs alongside the existing notification fetch on panel open. `_otto.js` is where the orb actually renders on profile.html — adding metrics here was the unblock.
- **Otto Stats tab on `/otto`** ([OttoMetrics.tsx](src/components/otto/OttoMetrics.tsx)) — full breakdown. Two halves: profile views (today/7d/30d/all-time tiles + last 8 viewer avatars + premium-soon footnote) and posts+clips (totals tiles + 7d/30d windowed rows + top 5 posts list with view/like/comment/repost counts).

All three surfaces fetch `/api/me/profile-views` + `/api/me/creator-stats`. Numbers always agree.

### Phase D — Resume / portfolio viewer (massive rebuild)

User flagged the existing viewer as unusable. Five distinct issues, all fixed in sequence (the session ended up iterating 5+ times on this surface).

#### Two-document support

`resumePortfolio` array always allowed multiple but `handleResumeUpload` was clobbering on each new upload. Now **appends, capped at 2**. Per-doc remove × button appears in the thumbnail strip on hover in edit mode. Removing a doc shifts surviving bars' `docIndex` so they stay attached to the right attachment.

#### Redaction UX rewrite (direct manipulation)

Old: "+ Blackout bar" button → fixed-position 38×7 bar → "Edit redactions" toggle to drag → "Clear bars" to wipe all. Clunky 3-step flow.

New:
- **Draw** — click and drag anywhere on the document
- **Select** — single-click a bar exposes 8 resize handles + a coral × delete button
- **Move** — drag a selected bar
- **Resize** — drag any handle (any of the 8 anchor opposite-corner-correctly)
- **Delete** — click the ×
- **Clear all on this attachment** — only one toolbar button left
- **Deselect** — click outside any bar
- Sub-1% gestures treated as misclicks (no zero-size bars)
- No `redactionMode` toggle — editing is whatever's possible in edit mode

#### PDF.js for content-locked bars

Original bug: bars were `position: absolute` inside `.doc-view` (a `position: relative` container holding an `<iframe>`). When the user scrolled the PDF inside the iframe (Chrome's native PDF viewer scrollbar), the iframe content moved but the bars stayed put — sensitive info exposed.

The proper fix needed bars to live in the same scroll context as content, which iframes don't allow cross-origin. So:

- **PDF.js via CDN** ([cdnjs](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js) — deferred script tag in `<head>`)
- **`_rasterizePdf(dataUrl)`** helper rasterizes each PDF page to a JPEG data URL at scale 1.6. Stored as `doc.pages = [dataUrl1, ...]` alongside the original `doc.url`.
- **`_waitForPdfJs()`** polls `window.pdfjsLib` with an 8s timeout so the upload handler can await it cleanly even if the deferred CDN script hasn't resolved.
- **`_backfillRasterIfNeeded()`** self-heals legacy PDFs (uploaded before this change) on first viewer open — runs rasterization in the background and persists `doc.pages` to localStorage.

#### Viewer DOM — scrollable per-page stack

`.doc-view` is now a flex column with `overflow-y: auto`. Each page is a `.doc-page-wrap` (positioned, aspect-ratio: 8.5/11, sized via `width: min(100%, calc((92vh - 200px) * 0.7727))` so the page fits in both the viewer width AND the viewer height). The page image is absolutely positioned inside the wrap, filling it. Bars are children of the wrap, positioned with % of the wrap.

Result: scrolling `.doc-view` scrolls page wraps + bars together. Single-page docs fit entirely without scroll (the user's specific ask). Multi-page docs scroll between full-page views with bars locked to each page.

#### Bar data model

`{ docIndex, pageNumber (1-based), x, y, w, h }` — coordinates are % of the page wrap they live in. Renderer finds the matching `.doc-page-wrap[data-page="N"]` by `pageNumber` and appends the bar there. Drawing handler resolves the page wrap from `e.target.closest('.doc-page-wrap')`.

#### Modal scroll lock

The viewer modal was growing past viewport, so wheel events that missed `.doc-view` were quietly scrolling the profile underneath. Fixed:
- `#docModal .modal { display: flex; flex-direction: column; max-height: 92vh; overflow: hidden }`
- `.doc-viewer-grid` + `.doc-main` + `.doc-view` all `flex: 1` + `min-height: 0` so the scroll container is the inner `.doc-view`
- `body.doc-modal-open { overflow: hidden }` while the modal is open
- `overscroll-behavior: contain` on `.doc-view` blocks scroll chaining

#### Prev/Next nav

Inside a multi-page doc the buttons `scrollIntoView` the next/prev page-wrap. At doc edges they fall back to cycling between attached documents. `_currentVisiblePage(view)` picks the page whose top is at or above `view.scrollTop`.

#### Owner-only gating

The "Clear all bars" button, the "Click and drag…" hint below the viewer, and the "Tip: in edit mode…" hint above were all gated behind `body:not(.viewer-mode) .owner-only` so visitors to your profile see the redaction bars (that's the point) but no editing affordances.

#### Resume card simplification

Dropped the duplicate "Compact" chip under the sidebar resume card. The whole card is clickable; one "Open viewer →" chip is enough.

---

## 2) Repo state at session end

- **12 commits on `main`, all pushed to `origin/main`**. Vercel auto-deploys; live on `connectvibe.app`.
- Commit chain (oldest → newest):
  - `7746498` `feat(otto+metrics): Otto's Room + profile views + creator stats` — biggest commit, 27 files, +3720/-105
  - `c7f5d13` `fix(profile): remove on-profile views pill (was overlapping header buttons)`
  - `7d8808e` `fix(otto/sidepanel): show clear fallback when metrics endpoints fail`
  - `0775ea1` `feat(profile): vanilla Otto orb + metrics side panel on profile pages` — later superseded
  - `9b07545` `feat(otto): full panel parity on profile pages + hide orb on /messages`
  - `5f412cb` `fix(otto): metrics in the legacy _otto.js panel — the real one rendering` — the actual fix
  - `73b3e93` `fix(profile/resume): two-doc support, redaction UX rewrite, scroll anchor`
  - `8c25b59` `fix(profile/resume): pdf.js for content-locked bars + compact viewer`
  - `166c364` `fix(profile/resume): self-heal legacy PDFs + clear empty-state messaging`
  - `e8aa29d` `fix(profile/resume): scroll the doc viewer, not the profile underneath`
  - `a5a8f92` `fix(profile/resume): fit full page in viewer (single-page no scroll)`
  - `f17eeb4` `fix(profile/resume): gate top tip line behind owner-only`
- **Both migrations applied to prod Supabase by the user**:
  - `20260512000000_otto_reminders_and_settings.sql`
  - `20260513000000_profile_views_and_user_view_count.sql`
- `npx tsc --noEmit` — clean
- `npx eslint src/app src/components src/lib` — clean on Otto + metrics surface. Pre-existing warnings carry over (`LyraConstellation` Math.random, `GlassCard` unused in campus-home — both noted in handoff §3 of session 44).

---

## 3) Known issues / debt

### Carried forward
- **Mobile responsive sweep (#36)** — **launch blocker. Selected as next session pickup.** The whole app is desktop-first: Otto's Room two-column grid at 1100px+, profile (8.7k lines of CSS at desktop breakpoints), the redesigned landing, auth cards, signup 3-step indicator, the new resume viewer modal, the spotlight tour bubbles, the campus + network feeds. Probably 2–3 sessions.
- **Custom domain swap (#35)** — legal pages still reference `vibe-app.vercel.app`. ~5-min find/replace. Still untouched.
- **First-class Notifications panel (#29)** — `/notifications` is still a stub. Otto side panel covers some of it but a dedicated surface to scan history would close the gap.
- **Discover Browse + Departments (#30, #31)** — empty stubs.
- **localStorage migration (#8)** — carry-over.

### Surfaced this session
- **Premium reveal gate (monetization, mentioned by user)** — user floated "every ~3 days you get to see 3 names, rest behind paywall" as the model. Data layer already captures viewer identity in `profile_views`; the gate would be: `users.last_viewer_reveal_at` column + `/api/me/profile-views` checks `now - last_viewer_reveal_at < 3 days` and returns top 3 with names + the rest with `name: null, handle: null`. UI already reads `premium` flag — flip to `true` for paying users when billing lands. No schema churn needed.
- **PDF.js localStorage payload size** — each rasterized PDF page is ~100-300KB JPEG. Two attached PDFs with multiple pages can push localStorage close to the ~5MB cap. Probably fine for v1 (most users won't hit it) but worth keeping an eye on; long-term move to R2/Supabase storage like clips/posts.
- **PDF.js CDN dependency** — uses `cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/`. If CDN goes down, rasterization fails. Self-host as `/public/vendor/pdf.js/...` if reliability matters.
- **Old bar data orphaned** — bars created before session 45 stored `pageIndex` (doc index), not `docIndex` + `pageNumber`. The new renderer's filter `b.docIndex !== activeDocIndex` doesn't match orphaned old-format bars; they silently drop. Acceptable since no real users have bars saved yet.
- **Otto orb on `/otto` itself** — slightly redundant. Clicking the bottom-right orb on `/otto` opens the side panel, whose footer links to… `/otto`. Cosmetic only.
- **`renderDocViewer` duplicate** — there was a second copy of the function shadowing the first. Removed the dead duplicate this session. Good housekeeping.

---

## 4) Stage 7 plan — what's left

| # | Item | Notes |
|---|---|---|
| 36 | **Mobile-responsive sweep** | **Next session pickup — user explicit.** "alright fuck it, time to build this for phone." iOS + Android. Stage 7's only remaining true launch blocker. |
| 35 | Custom domain — swap legal pages | 5-min find/replace. Pair with mobile sweep PR. |
| 29 | First-class Notifications panel | Engagement loop. Partial via Otto side panel + `/otto` Activity. |
| 30 | Discover Browse view | Empty stub. |
| 31 | Discover Departments view | Empty stub. |
| 38 | Polish + QA + final deploy | The launch. |
| 8 | localStorage migration | In-progress carry-over. |
| — | **Otto's Room + reminders (#28)** | ✓ **DONE this session.** |
| — | **Profile views + creator stats (engagement + monetization seed)** | ✓ **DONE this session.** |
| — | **Resume / portfolio viewer rebuild** | ✓ **DONE this session.** |

---

## 5) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-11-session-45-otto-room-metrics-profile-views-resume-viewer.md
and start the mobile responsive sweep (#36) — user explicit pickup.
Build for iOS + Android.
```

**Before pickup, run:**

```bash
git status            # should be clean
git log --oneline -5  # confirm session 45 commits on main
npx tsc --noEmit 2>&1 | head -10
```

Dev server on port 3000. Live site on `connectvibe.app`.

**Suggested approach for the mobile sweep:**

1. Use Chrome DevTools device emulation at 375 (iPhone SE / 12 / 13 mini) and 414 (iPhone Plus / Pro Max). Android equivalents in the same range.
2. Surface inventory — sweep in this order so you tackle the highest-traffic flows first:
   - Landing (`/`) — orbital ring system collapses to vertical at narrow widths
   - Auth (`/auth/login`, `/auth/signup`, `/auth/school-email`) — frosted cards have fixed padding
   - Onboarding (`/onboarding`) — static HTML, lots of inline width values
   - Campus (`/campus`) — left nav drawer pattern, feed reflow, ClipsReel 9:16 already mobile-shaped
   - Profile (`/html/profile.html`) — 8.7k-line static page, all desktop sizing. Probably the biggest lift.
   - Otto's Room (`/otto`) — 2-column grid collapses to 1-col under 760px already (CSS added this session)
   - Network (`/network`) — UserCard grid
   - Settings, Messages (already mostly mobile-shaped via the iframe)
   - Resume viewer modal — capped at 92vh works on mobile but the side thumbnail strip might want to collapse to a horizontal scroller
3. The `<LeftNav>` is the biggest desktop-only assumption — most pages assume a fixed 200px sidebar. Mobile likely wants either a slide-out drawer or a bottom tab bar (more native-feeling on iOS). Pick one early; it affects every shelled page.
4. Custom cursor + spotlight tour are auto-skipped on coarse pointer devices — `matchMedia('(pointer: fine)')` gate is already there. Tour will need different positioning math for small screens though.
5. Test the post-onboarding hyperdrive warp on mobile — the 24-star streak math is viewport-relative so it should adapt, but worth confirming.

---

## 6) Key files touched / created this session

### New (Otto + metrics)
- `supabase/migrations/20260512000000_otto_reminders_and_settings.sql` — Otto schema + RLS
- `supabase/migrations/20260513000000_profile_views_and_user_view_count.sql` — profile views + RPC
- `src/lib/otto/parse-reminder.ts` — chrono-lite parser
- `src/lib/otto/parse-reminder.test.ts` — node:test cases
- `src/app/api/me/otto/route.ts` — composer
- `src/app/api/me/otto/reminders/route.ts` — POST manual reminder
- `src/app/api/me/otto/reminders/[id]/route.ts` — DELETE dismiss
- `src/app/api/me/otto/reminders/[id]/act/route.ts` — POST act
- `src/app/api/me/otto/settings/route.ts` — PATCH settings
- `src/app/api/profile-views/route.ts` — tracker
- `src/app/api/me/profile-views/route.ts` — counts + viewers
- `src/app/api/me/creator-stats/route.ts` — aggregator
- `src/components/otto/OttoPageClient.tsx` — owns state + tabs
- `src/components/otto/OttoHero.tsx`
- `src/components/otto/OttoSection.tsx`
- `src/components/otto/OttoActivity.tsx`
- `src/components/otto/OttoUpcoming.tsx`
- `src/components/otto/OttoRequests.tsx`
- `src/components/otto/OttoTellInput.tsx`
- `src/components/otto/OttoSettings.tsx`
- `src/components/otto/OttoMetrics.tsx` — Stats tab content

### Modified
- `src/app/otto/page.tsx` — full rewrite (server entry → SSR fetch → client tree wrapped in Suspense)
- `src/app/globals.css` — `.otto-room-*` namespace (~600 lines), `.otto-metrics-*` (~120 lines), `.otto-room-tabs` (~30 lines)
- `src/components/campus-app-shell.tsx` — global OttoCorner mount with `usePathname` gate for `/messages`
- `src/components/network/NetworkPageClient.tsx` — removed duplicate OttoCorner mount
- `src/components/network/OttoSidePanel.tsx` — added MetricsBlock + parallel fetch
- `public/html/profile.html` — viewer-mode tracker, full resume viewer rebuild (CSS + JS + HTML), removed dead duplicate `renderDocViewer`
- `public/html/_otto.js` — "your metrics" section in panel body + `_ottoFetchMetrics` / `_ottoRenderMetrics` + CSS additions

### Deleted
- Nothing.

---

## 7) Deploy state — LIVE

All 12 commits on `origin/main`, Vercel built + deployed. Both migrations applied to prod Supabase. Spot-check URLs on `connectvibe.app`:

- `/otto` — full hero + Today tab (activity / upcoming / asking / tell-otto / settings) + Stats tab (metrics breakdown). `?tab=stats` deep-link works from the side panel.
- `/profile/<your-handle>` — bottom-right orb opens side panel with notifications + your metrics + activity. Viewing someone else's profile fires a tracked profile-view.
- `/network` — same orb, same panel. OttoCorner moved up to shell.
- `/messages` — orb intentionally hidden (visual conflict with composer).
- Resume viewer — upload up to 2 docs (PDF + image, etc.). PDF gets rasterized via pdf.js; each page is a scroll-stack item with bars anchored per page. Click+drag to redact; click a bar for handles + delete X.

The next handoff should pick up at **§4 / #36 — mobile responsive sweep**.
