# Session 34 handoff — Connections backbone, real stats, and the Stage 4 plan (2026-05-04)

This handoff covers Sessions **32, 33, and 34** (no handoff was written for 32 or 33 — recaps included below). The most important section is **§4 Stage 4 plan** at the bottom — that's what the next chat picks up.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for ship loops, multi-file P1 work, gstack skills (`/ship`, `/qa`, browse). Default for long sessions on Max. |
| **`[Cursor]`** | Cursor agent — small targeted fixes, in-thread follow-ups, linter nits. |
| **`[Either]`** | Either tool — pick whichever you have open. |
| **`[You]`** | Human / dashboard — Vercel env UI, Supabase console, secrets, approvals, interactive `supabase login`. |

---

## 1) What shipped, Sessions 32–34

### Session 32 (v4.4) — P1-007 close + P1-008 URL polish + QA checklist

- **P1-007 confirmed.** Profile data model + RLS audited end-to-end against the static prototype. Every field used by `vibe_user_v1` (name, tagline, headline, location_text, website, bio, interests/skills, work_experience, recruiter_snapshot, avatar/banner/resume URLs, banner_gradient) is mapped via `buildVibeUserV1FromProfile()` → `profile-bootstrap`. Storage RLS on the `profiles` bucket enforces `{auth.uid()}/...` path prefix; reads are public.
- **P1-008 polish.** `middleware.ts` now redirects `/html/landing.html → /` and short-circuits signed-in `/feed → /campus` when `NEXT_PUBLIC_SHOW_GLOBAL_FEED` is off (no React-mount + client-redirect roundtrip). Decision recorded: keep `src/app/feed/` (real flag-gated surface) and `src/app/the-map/` (founder-internal doc).
- **QA_CHECKLIST.md** tracked at repo root — manual sweep for clean URLs, signup → school verify → Otto → profile gate, feed flag both states, profile upload + sync, edge cases (cookieless email browser, `?next=` sanitizer, handle conflict).

### Session 33 (v4.5) — P1-011 IG-style profile content card

- **All / Clips / Posts tabs** with **All** as default. New `populateAllGrid()` zipper-merges clip thumbs and themed post thumbs and reruns on hydrate + every publish/delete (`publishProfilePost`, `addVibeFromUpload`, `deleteVibe`, `deleteProfilePost`).
- **3-col 1:1 square grid.** Cells lift on hover with a soft shadow; play badge in top-right of clip thumbs. `.post-thumb-cell` for text-only posts uses six themed buckets keyed off the first hashtag (`coral / purple / mint / gold / sky / lavender`).
- **Stats row, IG-style.** Repositioned **inside `.avatar-row`** (was: above tabs, then absolutely positioned at top:120px). Numbers centered above labels, no vertical dividers. Connections shown prominently (28px accent orange).
- **Connect + Mutual layout fixes.** Side-by-side instead of stacked; `.avatar-row-actions` dodges the global `.viewer-only { display:block !important }` rule by gating visibility via `body.viewer-mode .avatar-row-actions { display:flex }`. Pending state shows `⌛ Pending` plus `Following ✓` immediately (sending Connect implies follow).
- **Rebrand local to the card.** `Vibes → Clips` in subnav anchor, tab label, composer button, upload tile, toasts. Data-layer keys (`vibe_vibes_v1`, `profileVibesGrid`, `#vibes` section id) stay backward-compatible. Global rename is still **P1-036**.
- **Recruiter view → "View as visitor"**, button id `viewerBtn`, calls existing `toggleViewerMode()`. Recruiter-specific chrome (banner, dimmed personality section, recruiter-card visibility) is parked for a later phase. `toggleRecruiter()` kept as a thin shim.
- **Profile-shell housekeeping.** Dropped Feed / Opportunities / Otto from the profile top nav (only Network and Campus remain). Search bar dead-centered with `position:absolute; left:50%; transform:translate(-50%,-50%)`. Placeholder updated to **"Search for people, clubs, events, orgs"**.

### Session 34 (v4.6) — P1-012 backbone + P1-014 real stats; P1-013 deferred

- **`src/lib/connections/queries.ts`** — `getCountsFor` (followers / following / connections via mutual intersection of A→B and B→A), `getFollowState` (returns one of `self / none / following / followed_by / connected`), and `getMutualCount` for "you have N mutuals" surfaces.
- **API routes:**
  - `POST /api/me/follow` — accepts `target_id` or `target_handle`. Idempotent (duplicate POST returns 200 with `{ already: true }`).
  - `DELETE /api/me/follow` — same payload. Idempotent (missing-row delete returns 200).
  - `GET /api/me/connections-summary` — `{ counts: { followers, following, connections } }` for the signed-in user.
- **P1-014 — real counts in the stats row.** `/api/me/profile-bootstrap` now calls `getCountsFor` and stamps `counts: { followers, following, connections, mutual: '0' }` onto `vibeUser` before returning. The existing `renderUserSections` hydration path in `profile.html` writes those into `#statFollowers / #statFollowing / #statConnections`. Maya's demo "1.2k / 312 / 847" is gone for real users — they see live counts.
- **P1-013 deferred** with a marker comment in `profile.html:4700`. The follow API is server-side ready, but no surface yet supplies a real other-user target — `/profile/[handle]` is a stub, the static prototype only knows mock users via `_mockUsers.js`. Hooking `handleVibConnect` to the API now would just add dead code paths.

---

## 2) Spreadsheet reconciliation (current ground truth)

| Sheet row | Spec ID | Sheet says | Reality |
|---|---|---|---|
| 2 | P1-001 Supabase | ✅ | ✅ |
| 3 | P1-002 R2 | ✅ | ✅ |
| 4 | P1-003 Resend | ✅ | ✅ |
| 5 | P1-004 Sentry | ✅ | ✅ |
| 6 | P1-005 Schema | ✅ | ✅ |
| 7 | P1-006 Auth flow | ✅ | ✅ |
| 8 | P1-007 Migrate localStorage | ✅ | ⚠️ Profile slice; other domains migrate per-ticket |
| 9 | P1-008 URL polish | ❌ | **✅ flip to Complete** |
| 10 | P1-009 Otto onboarder | ❌ | **✅ flip to Complete** (live in `public/html/onboarding.html` since Session 24; `/api/me/onboarding-complete` persists answers since 30/31) |
| 11 | P1-010 Otto corner ring | ❌ | **✅ flip to Complete** (`_otto.js` loaded on every HTML page since Session 24) |
| 12 | P1-011 Profile revamp | ❌ | **✅ flip to Complete** (Session 33; static-prototype IG-style content card) |
| 13 | P1-012 Connections | ❌ | **✅ flip to Complete** (Session 34; data layer + API) |
| 14 | P1-013 Follow buttons | ❌ | ⏸️ Deferred — API ready, hook needs P1-011b |
| 15 | P1-014 Stats wiring | ❌ | **✅ flip to Complete** (Session 34) |
| 16+ | P1-015 onward | ❌ | ❌ next |

**Action for [You]:** flip rows 8 (with note), 9, 10, 11, 12, 13, 15 to Complete on the sheet so the next chat sees an accurate ground truth.

---

## 3) Local-only paths (not in `git push`)

- `DOCS/`, `handoffs/` — **`.gitignored`**, do not deploy with Vercel. Keep both in your normal backup (Conductor / Dropbox / private notes repo).
- `public/journal/vibe_journal.html` — **tracked**, ships with the site. Always at `/journal/vibe_journal.html` on prod.
- `QA_CHECKLIST.md` — **tracked** at repo root.

---

## 4) Stage 4 plan — agreed order, do these next ⭐

This is the most important section. Read it before opening a new chat.

### The order (5 tickets, ~7–9 days total):

```
1. P1-017 Composer            (~2d)   ┐
2. P1-015 Post viewer modal   (~1d)   │  Stage 4 main arc
3. P1-016 Clip viewer modal   (~1d)   │
4. P1-011b /profile/[handle]  (~0.5d) ┘  ← unblocks P1-013
5. P1-013 Follow button hook  (~0.5d)    automatic after P1-011b
```

### Why this order

- **Composer first** because the post + clip viewers have nothing to render until users can publish.
- **Viewers second** because they're the natural follow-on: tap a thumb in the All grid → expanded modal.
- **`/profile/[handle]` after viewers** because visiting someone else's profile is more interesting once they have content to display.
- **Follow button hook last** because once `[handle]` is real, the Connect button has a real Supabase target to send to `POST /api/me/follow`.

### Acceptance criteria per ticket

#### 1. P1-017 — Composer ⭐ start a fresh chat for this

**Goal:** users can publish posts and clips through Supabase + R2.

- Posts:
  - Composer textarea with **character limit** (suggest 2000 — pick during build, document in journal).
  - Optional image upload (use the existing `profiles` bucket pattern, or a new `posts` bucket — decide during build; new bucket recommended for cleaner separation).
  - Tags chip input (writes to `posts.tags` text array — needs a small migration to add `posts.tags text[]` if missing, **CHECK SCHEMA**).
  - On publish: insert row into `public.posts` (`type='post'`, `content`, `media_url` if image, `media_thumbnail_url` for grid).
- Clips:
  - File picker accepting MP4/MOV up to ~100MB (cap during build).
  - **R2 signed URL upload** path — request signed URL from a new `/api/me/clip-upload-url` route, PUT directly to R2, then POST `/api/me/publish-clip` with the R2 object key.
  - Cap clip length at **60s** per spec.
  - Generate poster frame thumbnail (browser-side `<canvas>` from first frame, upload to `profiles` bucket or alongside the clip — decide during build).
- Wiring:
  - The static-prototype composer at `#vibes-pane > .profile-composer` is the existing UI surface.
  - `publishProfilePost()` in `profile.html` is the current handler — reroute it to the new APIs.
  - After publish, `populateAllGrid()` must rerun (already wired).
- Acceptance: I can publish a post and a clip on the live site, reload, and they persist. R2 stores the clip; Supabase stores the post row + R2 object key.

**Pre-build [You] task:** confirm `posts.tags text[]` exists in the schema or write a migration. Apply migration before composer ships.

**Files likely to touch:**
- `supabase/migrations/<new>` — `posts.tags` if missing, possibly a `clip_uploads` audit table
- `src/app/api/me/publish-post/route.ts` (new)
- `src/app/api/me/publish-clip/route.ts` (new)
- `src/app/api/me/clip-upload-url/route.ts` (new) — signed URL issuer
- `src/lib/r2.ts` — likely already has signed-URL utility from P1-002; verify
- `public/html/profile.html` — `publishProfilePost`, `addVibeFromUpload`, composer markup
- Journal v4.7 entry

#### 2. P1-015 — Post viewer modal

**Goal:** clicking a post thumbnail opens a full-screen modal with the post body, action row, and comment thread.

- Modal opens when:
  - Tap a `.post-thumb-cell` in the All grid
  - Tap a `.profile-post-card` in the Posts pane
- Modal shows:
  - Header: avatar + name + handle + timestamp
  - Body: post content (text + image if present)
  - Action row: Like (with count) · Comments (with count) · Repost · Send (DM share) · Save (top-right of content area, IG-style)
  - Comments thread expands below the action row
- Close: Esc / outside-click / back gesture / explicit X
- Data:
  - Likes / comments tables don't exist yet — add migrations: `post_likes (post_id, user_id, created_at)` with `UNIQUE(post_id, user_id)`, and `post_comments (id, post_id, user_id, content, created_at)`. Add RLS.
  - APIs: `POST /api/posts/[id]/like`, `DELETE /api/posts/[id]/like`, `POST /api/posts/[id]/comments`, `GET /api/posts/[id]/comments`.

**Files likely to touch:**
- `supabase/migrations/<new>` — likes + comments tables
- `src/app/api/posts/[id]/like/route.ts` (new)
- `src/app/api/posts/[id]/comments/route.ts` (new)
- `public/html/profile.html` — modal markup, click handlers in `populateAllGrid`'s post cells
- Journal v4.8 entry

#### 3. P1-016 — Clip viewer modal

**Goal:** clicking a clip thumbnail opens a full-screen modal with video controls and the same action row.

- Identical action row + comment thread API as post viewer (reuse).
- Video element with controls (play/pause/scrub/volume/fullscreen). HTML5 native controls are fine for v1.
- Source: signed R2 URL fetched per view from a new `/api/clips/[id]/view-url` route. Short expiration (~5 min).
- Tap-on-mobile opens the viewer (already noted in P1-011 spec — currently scrolls to Posts tab as a placeholder; remove that placeholder during this ticket).

**Files likely to touch:**
- `src/app/api/clips/[id]/view-url/route.ts` (new) — signed-URL issuer with permission check
- `public/html/profile.html` — clip modal markup, click handler in `populateAllGrid`
- Journal v4.9 entry

#### 4. P1-011b — Real `/profile/[handle]` render

**Goal:** visiting `/profile/<handle>` shows that user's real Supabase profile (in viewer mode).

- Approach: replace the React stub at `src/app/profile/[handle]/page.tsx` with a server component that fetches the user by handle, then **renders the static prototype with that user's data seeded** (mirror the bridge pattern but for a different user). Two options:
  - **Option A (recommended):** server-side fetch the user row by handle, then return a small bridge component that calls `/api/users/[handle]/bootstrap` (a new route — basically `profile-bootstrap` but for an arbitrary handle, only public fields), seeds `vibe_user_v1` with `_isViewerMode=true`, and full-navigates to `/html/profile.html?app=1&handle=<handle>`. The static prototype reads `?handle=` and respects `_isViewerMode`.
  - **Option B:** build a real React render with the IG grid component. Bigger lift; defer to a later phase.
- Add `window.viewingRealUser = { id, handle, name }` global on bootstrap so P1-013's `handleVibConnect` hook can detect a real target.
- Permission: the new bootstrap-by-handle route returns ONLY public profile fields (NO `email`, NO `school_email`, NO `otto_answers`, NO `voice_samples`). Confirm against `normalizeProfileView` shape.

**Files likely to touch:**
- `src/app/profile/[handle]/page.tsx` — replace stub with bridge
- `src/app/profile/[handle]/handle-bridge.tsx` (new) — client bridge component
- `src/app/api/users/[handle]/bootstrap/route.ts` (new) — public bootstrap by handle
- `src/lib/profile/build-vibe-user-v1.ts` — extend for viewer-mode shape (no edit fields)
- Journal v4.10 entry

#### 5. P1-013 — Follow button hook lights up automatically

**Goal:** clicking Connect on `/profile/<someone>` actually inserts a row into `public.connections`.

- Modify `handleVibConnect` in `profile.html` to:
  - Detect `window.viewingRealUser?.id` or `?.handle`
  - Call `POST /api/me/follow` with the target
  - On success → `setVibeRelState('following')` (or `'connected'` if mutual — query state separately or re-bootstrap)
  - Keep the localStorage demo path for `viewingMockUser` as a fallback (so the demo Maya flow keeps working until mock users get retired)
- Same wiring for `handleSoftFollow`.
- Marker comment at `profile.html:4700` shows where to splice in.
- Acceptance: I sign in as user A, navigate to `/profile/<userB-handle>`, click Connect; both users see updated counts on next reload.

**Files likely to touch:**
- `public/html/profile.html` — `handleVibConnect`, `handleSoftFollow`
- Journal v4.11 entry — closes Stage 3

---

## 5) Open questions to resolve during Stage 4

- **Clip storage:** R2 bucket name + path convention (e.g. `clips/<user_id>/<clip_id>.mp4`). Confirm before P1-017.
- **Poster frames:** browser-side capture vs. server-side (FFmpeg in a Vercel function). Browser-side is simpler but less reliable across formats. Pick during P1-017.
- **Post tags table:** spec says `posts.tags text[]`. Schema currently doesn't have it (last we checked). Add migration before composer ships.
- **DM sharing in action row (Send button):** the spec includes "Send (DM share)" in the post viewer. DMs ship in P1-022. For P1-015, either disable the Send button with a "Coming soon" tooltip, or omit it entirely. Recommend omit for now.
- **Likes data model:** simple `post_likes` row OR aggregate count column on `posts`. Aggregate is faster but harder to keep consistent. Recommend simple row table + a view for counts.
- **Realtime updates for likes/comments:** Supabase realtime works but costs more. v1 can poll on modal open / close.

---

## 6) Operational reminders before Stage 4 ships

- **Supabase migrations:** anything new in Stage 4 (post_likes, post_comments, posts.tags, etc.) must be applied to the linked Supabase project (`supabase db push` or SQL Editor) before that ticket goes live on prod.
- **R2 access:** `src/lib/r2.ts` has the signed-URL utility from P1-002. Confirm the bucket name and that env vars are set on Vercel prod (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`).
- **Vercel env:** mirror anything new in `.env.example` to Vercel UI.
- **`QA_CHECKLIST.md` extension:** add §7 (Composer) and §8 (Viewers) when those ship.

---

## 7) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-04-session-34-connections-stage4-plan.md
and the Session 34 entry in public/journal/vibe_journal.html, then start
P1-017 (Composer). Plan the work as a thread in the handoff's §4.1 acceptance
criteria. Confirm posts.tags exists in schema before writing the API.
```

That's enough context — the handoff carries the rest.

---

## 8) Related files

- `handoffs/2026-05-03-session-31-profile-storage-feed-flags-handoff.md` — previous handoff; Sessions 32 & 33 had no handoff
- `handoffs/2026-05-01-session-30-auth-onboarding-routing.md`
- `public/journal/vibe_journal.html` — v4.6, Session 34
- `QA_CHECKLIST.md` — manual QA sweep at repo root
- `DOCS/PHASE_1.md` (gitignored) — original spec
- `DOCS/PHASE_1_TASKS.csv` (gitignored) — same data as the user's spreadsheet
