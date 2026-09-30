# Session 38 handoff — Stage 4 close + Stage 5 plan (2026-05-04)

This handoff covers **Sessions 35-38** (one continuous chat from after the Session 34 handoff through close-out). The most important section is **§5 Stage 5 plan** at the bottom — that's what the next chat picks up.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for ship loops, multi-file P1 work, gstack skills. Default for long sessions on Max. |
| **`[Cursor]`** | Cursor agent — small targeted fixes, in-thread follow-ups, linter nits. |
| **`[Either]`** | Either tool — pick whichever you have open. |
| **`[You]`** | Human / dashboard — Vercel env UI, Supabase console, secrets, approvals, interactive `supabase login`. |

---

## 1) What shipped, Sessions 35-38

### Session 35 (v4.7) — P1-017 Composer + P1-017a one-table feed loop

- **`POST /api/me/publish-post`** (2000-char cap, ≤10 normalized tags, optional `media_url`).
- **`POST /api/me/clip-upload-url`** (signed R2 PUT, mp4/mov/webm, ≤200MB after the bump, key shape `clips/<user_id>/<uuid>.<ext>`).
- **`POST /api/me/publish-clip`** verifies the object key prefix matches user, inserts `type='clip'`, stores R2 key in `media_url`.
- **`GET /api/me/posts`** (own profile hydration), **`GET /api/feed`** (school-scoped via PostgREST `!inner` author join, falls back to viewer-only when school is empty).
- **Migration `20260504120000_posts_tags.sql`** adds `posts.tags text[]` + GIN index.
- One `posts` table, two surfaces: profile composer + campus composer both insert via `/api/me/publish-post`. Campus composer in `campus.html` rewired (was in-memory only).
- Profile.html clip pipeline: signed PUT → browser-side `<canvas>` poster → publish-clip. Real upload progress via XHR (was hung-feeling fetch). 5-min timeout.
- Saved tab on profile (own-only, lazy-hydrated on first click). New `GET /api/me/bookmarks` route.

### Session 36 (v4.8) — P1-015 Post viewer modal

- **Migration `20260504130000_post_likes_comments.sql`** adds `post_likes` (PK on post_id+user_id) and `post_comments` (1-1000 char check, indexed by post_id+created_at).
- **Five new routes** under `/api/posts/[id]`: `GET` (post + counts + viewer state), `POST/DELETE /like`, `GET/POST /comments`, `POST/DELETE /save` (writes to existing `bookmarks`).
- **`public/html/_postViewer.js`** — shared modal, self-injects CSS + markup, exposes `window.openPostViewer(postId, prefill?)`. Optimistic UI for like/save with revert on failure. Esc / outside-click / X / browser-back close.
- Click handlers wired on profile post-thumb cells, profile post cards, campus posts.
- Type-aware delete confirm + "..." menu in modal (owner-only). Cascades through R2 cleanup for clips.
- **All tab restored** as a vertical mixed feed (clips as full-width cards w/ poster + posts as cards with Read More truncation). Clips/Posts/Saved drill-down.

### Session 37 (v4.9) — P1-016 Clip viewer modal

- Same shared `_postViewer.js` handles both `type=post` and `type=clip`. `paintBody` branches: post → `<img>`, clip → `<video controls playsinline muted loop autoplay>` with poster painted instantly via `media_thumbnail_url`.
- New **`GET /api/clips/[id]/view-url`** verifies the post is `type='clip'`, key starts with `clips/`, mints a 5-min signed R2 GET. Defensive against corrupt keys.
- Modal close pauses + clears `src` so audio doesn't bleed.
- Click handlers wired on `.vibe-grid-thumb` in both `#profileVibesGrid` and the All grid.

### Session 38 (v5.0) — Stage 4 closes; handles + notifications + pin land

The longest chunk by far. Breaking it down:

#### P1-011b real `/profile/<handle>`

- React route at `src/app/profile/[handle]/page.tsx` now auth-gates and redirects to `/html/profile.html?app=1&handle=<handle>` (lowercase).
- Static prototype's init detects `?handle=`, fetches **`GET /api/users/[handle]/bootstrap`** (public-only fields — no email, no school_email, no otto_answers), sets `window.viewingRealUser = {id, handle, name, _pinnedPostId}`, and renders in viewer mode.
- Bootstrap also returns `_viewerFollowState` (none / following / followed_by / connected / self) so the Connect button initializes correctly without a second roundtrip. `self` bounces back to `/profile`.
- 404 (handle not found) renders inline with a back-to-campus link.
- New **`GET /api/users/[handle]/posts`** hydrates the visited user's real posts + clips into the panes. Without this, the visited profile rendered the visitor's own cached posts.

#### P1-013 follow button

- `handleVibConnect` / `handleSoftFollow` route through `POST/DELETE /api/me/follow` when `viewingRealUser.id` is set. Optimistic UI with revert on failure.
- `'following'` state renders as **⌛ Pending** (matches the demo flow); a second click on Pending unfollows.
- Mock-user demo path (3-second auto-accept) preserved as fallback.
- Profile bootstrap for own profile also passes through `id` + `handle` so the post viewer modal can detect "is the viewer the author" for the Delete affordance.

#### Handles (user-chosen, 14-day cooldown)

- **Migration `20260504140000_handle_metadata.sql`** adds `users.handle_changed_at timestamptz` + format CHECK `^[a-z0-9_]{3,20}$` OR legacy `u<32 hex>` so existing trigger-generated handles stay valid until claimed.
- Shared validator **`src/lib/profile/handle.ts`** (`validateHandle`, `handleCooldownDaysLeft`, `RESERVED` list) drives both client and server.
- New **`GET /api/handle/check?h=<x>`** for live availability (auth-gated, treats viewer's own current handle as available).
- New **`PATCH /api/me/handle`** validates → 14-day cooldown (waived when `handle_changed_at IS NULL` so existing auto-gen users get a free claim) → uniqueness re-check.
- Onboarding step 3 grew a Handle field with the same live-check UX. Submitted right after `/api/me/onboarding-complete` (best-effort — failure doesn't block onboarding).
- Profile shows `@handle` under the name (muted, smaller font); in edit mode it swaps to a live-checking input + save on exit. Cooldown disabled state shows "can change again in N days".

#### Notifications surfaced through Otto

- **Migration `20260504150000_notifications.sql`** adds `notifications` (id, user_id, actor_id, type, post_id, comment_id, read_at, created_at). Partial index on (user_id) WHERE read_at IS NULL keeps the dot-poll cheap. RLS: SELECT/UPDATE/DELETE own only; no INSERT policy at all (writes only via SECURITY DEFINER triggers).
- Three triggers fan out automatically: `connections` → `'follow'` notif for the followed user; `post_likes` → `'like'` notif for the post owner; `post_comments` → `'comment'` notif for the post owner. Self-actions filtered server-side.
- **Migration `20260504160000_notifications_connection_type.sql`** adds `'connection'` to the type CHECK and updates `notify_on_connection_insert` to ALSO insert two `'connection'` notifications when a mutual just formed (one for each party).
- Three new routes: `GET /api/me/notifications` (list with actor + post + comment text joined), `GET /api/me/notifications/count` (returns `{unread, totals: {follow,connection,like,comment}}` for last 30 days — five batched COUNT queries), `POST /api/me/notifications/mark-read` ({all:true} or {ids:[...]}).
- Otto wiring (in `_otto.js`):
  - Corner-ring `.otto-notif` dot now hidden by default; `.has-unread` class shows it. Polled every 30s, gated on `document.hidden`.
  - Side panel: drafts/briefing block REPLACED with a 4-tile stats grid (Follows · Connections · Likes · Comments). Filter pills (All / Follows / Connections / Likes / Comments). Per-type verb wording.
  - Comment notifications show the comment text (`n.comment.content`). Like notifications show the post snippet.
  - Click routing: like/comment opens the post viewer modal (or navigates to `/profile?post=<id>` if the modal isn't loaded on the current page); follow/connection goes to actor's `/profile/<handle>`. Mark-as-read fires on panel open.
  - Otto profile hero on profile.html now shows live notification stats ("3 new · 12 likes · 5 comments · 2 new connections this month") instead of the hardcoded "syndicated 4 posts · 2 drafts" line. Subscribes to Otto's count cache via `window.__ottoSubscribeCount`.
  - Platform pills (LinkedIn/IG/X/TikTok) dropped from Otto panel header.
  - Otto stays visible on visitor profiles too (the notifications shown are the viewer's own activity).

#### Pin persists server-side

- **Migration `20260504170000_user_pinned_post.sql`** adds `users.pinned_post_id uuid REFERENCES public.posts ON DELETE SET NULL`.
- **`PATCH /api/me/pinned`** verifies the post belongs to the viewer (you can only pin your own posts).
- Both bootstraps return `pinnedPostId`. Bootstrap-by-handle stashes it on `window.viewingRealUser._pinnedPostId` so visitors see your pin too.
- New `_restorePinIfPossible(id)` helper retries after async hydration so the pin lands once the source thumb is in the DOM. Fires from both own-hydration and visited-user-hydration paths.
- Pin buttons added to the All feed: `buildFeedClipCard` includes `.vibe-pin-btn` (top-right of poster, owner+edit-mode gated, `event.stopPropagation`); cloned post cards keep `.ppost-pin` (only `.ppost-delete` is stripped). `refreshPinButtons` walks both `.vibe-grid-thumb` and `.feed-clip-card` ancestors.
- Pinned card click opens the viewer (via new `_openPinnedItem(id, type)` helper); Unpin button has `event.stopPropagation` so removing the pin doesn't also open the viewer.

#### Real user search

- **`GET /api/users/search`** does ILIKE on name + handle (prefix-biased: prefix matches first, then contains-anywhere). Excludes the viewer's own row. Batches a connections lookup so each result carries `rel` ∈ {none, following, followed_by, connected}. Returns public columns only.
- Profile search dropdown debounces 220ms, merges real Supabase users with the existing static demo suggestions.
- Action button per row: `Connect` / `Pending` / `Connect back` / `Message` based on `rel`.
- Recently searched section in the empty-state dropdown (capped at 8 in localStorage, dedup by handle). Clicking a real-user result pushes them to the list and navigates to `/profile/<handle>`.

#### Polish + bug fixes (long list)

- Connect+Mutual+Stats reordered in `.avatar-row-right` so action pills sit at the avatar bottom (no banner overflow). Avatar-row negative margin reduced -70 → -50. Tighter pill padding in viewer mode.
- Subnav active state locks for 900ms during smooth scroll so the Posts pill stops bouncing back to Skills. Lower IntersectionObserver thresholds + wider sweet spot for tall sections. Bottom-of-page fallback for the last section.
- Broken duplicate Posts-pane composer removed. Working unified composer moved above the tabs.
- "Vibe only" badge dropped from new posts (and from Maya p3 hardcoded markup).
- Play badge / Pin button overlap in clip edit mode fixed by hiding play in edit mode.
- `.ppost-save` duplicate button removed (bookmark icon in modal is the one source of truth).
- Empty states for Clips and Posts panes (owner vs viewer text swap).
- `.rec-stat-row` switched to grid + `word-wrap` so Snapshot card no longer overflows. Top skills capped at 5.
- Onboarding char limits tightened (Bio 600, Major 60, Department 80, Interests/Skills as items × max chars).
- OWN clips now hydrate from DB (parity with posts) — they survive logout/login.
- Clip composer is two-phase: pick → upload → preview → user clicks Publish. No more accidental auto-post on file pick.
- Delete in modal "..." menu with type-aware confirm wording.
- Otto hidden on `/messages` so the corner ring doesn't cover chat header in landscape.
- Composer cap raised: clips up to 2 min / 200MB (was 60s / 100MB).
- FK embed errors fixed by naming the constraint explicitly: `users!posts_user_id_fkey!inner(...)` (the implicit `!inner` form ambiguates with multiple FK paths).
- Demo-id guard: post viewer skips API calls when the post id isn't a UUID (Maya p1/p2/p3, campus seed posts), so the modal opens cleanly without a "invalid input syntax for type uuid" error.

#### Stability work

- Migration-deploy-lag protection: optional `pinned_post_id` column is fetched in a separate try/catch in both bootstrap routes — a column-missing error no longer 404s the whole route.
- Viewer-mode write guard added to every `save*ToStorage` so visiting a real user can never overwrite the owner's localStorage. (Caught a real bug: visiting James's profile + the new pin-restore was clobbering the visitor's `vibe_user_v1` with James's name, bio, skills, pinned_post_id.)
- Auto re-bootstrap when localStorage is empty but the cookie session is alive — drops the pre-paint guard, fetches `/api/me/profile-bootstrap`, saves to localStorage, reloads (with `?clear` stripped). Means `?clear=1` is a real recovery path now.
- Hoisted `profileServerSyncTimer` from `let` to `var` to escape a TDZ ReferenceError that blanked profiles after a real pin landed (the new pin-restore in `renderUserSections` triggered the chain init → renderUserSections → pinFromProfile → saveProfileToStorage → scheduleProfileServerSync, which hit the let before its declaration line was reached).

---

## 2) Migrations to apply (in order)

For a fresh Supabase project, apply these in order. For your existing project, you've already applied 1-7; I'll assume only 8 might be pending depending on when you read this.

| # | File | What it does |
|---|---|---|
| 1 | `20260430190000_phase1_initial_schema.sql` | Initial Phase 1 schema (already applied) |
| 2 | `20260503120000_profile_extension_storage.sql` | Profile fields + storage bucket (already applied) |
| 3 | `20260504120000_posts_tags.sql` | `posts.tags text[]` + GIN |
| 4 | `20260504130000_post_likes_comments.sql` | `post_likes` + `post_comments` + RLS |
| 5 | `20260504140000_handle_metadata.sql` | `users.handle_changed_at` + format CHECK |
| 6 | `20260504150000_notifications.sql` | `notifications` table + 3 triggers |
| 7 | `20260504160000_notifications_connection_type.sql` | Add `'connection'` type + mutual detection in trigger |
| 8 | `20260504170000_user_pinned_post.sql` | `users.pinned_post_id uuid` |

All migrations applied during Session 38 in the user's prod Supabase. Copy/paste workflow via the SQL Editor.

---

## 3) Local-only paths (still `.gitignored`)

- `DOCS/`, `handoffs/` — keep in your normal backup (Conductor / Dropbox / private notes)
- `public/journal/vibe_journal.html` — **tracked**, ships with the site
- `QA_CHECKLIST.md` — **tracked** at repo root
- `supabase/.temp/` — gitignored as of session 35

---

## 4) Stage 4 — what shipped vs spec

| Ticket | Status | Notes |
|---|---|---|
| P1-007 Migrate localStorage | ✅ profile slice; other domains migrate per-ticket |
| P1-008 URL polish | ✅ |
| P1-009 Otto onboarder | ✅ |
| P1-010 Otto corner ring | ✅ |
| P1-011 Profile revamp | ✅ |
| P1-011b Real /profile/[handle] | ✅ Session 38 |
| P1-012 Connections | ✅ |
| P1-013 Follow buttons | ✅ Session 38 |
| P1-014 Stats wiring | ✅ |
| P1-015 Post viewer modal | ✅ Session 36 |
| P1-016 Clip viewer modal | ✅ Session 37 |
| P1-017 Composer | ✅ Session 35 |
| P1-017a One-table feed loop | ✅ Session 35 (extra) |
| **Handles** (not in original spec) | ✅ Session 38 (extra) |
| **Notifications via Otto** (P1-021 in spec) | ✅ Session 38 — early since the user prioritized it |
| **Pin server-side** | ✅ Session 38 (extra) |

**Stage 4 is closed.** Two unscheduled features (handles + notifications) shipped early because they unlock daily-use polish.

---

## 5) Stage 5 plan — agreed order, do these next ⭐

This is the most important section. Read it before opening a new chat.

### The order (5-6 tickets, ~10-14 days total)

```
1. P1-022 DMs                    (~3d)   ┐
2. Email notifications via Resend (~1d) │  Stage 5 main arc — daily-use depth
3. Edit own posts                 (~0.5d) │
4. Mobile responsive sweep        (~1-2d)│
5. Public profile SEO             (~0.5d)┘
6. Block / Report / Mute          (~1d)    safety floor before public population
```

### Why this order

- **DMs first** because connecting with someone is meaningless if Message goes to a hardcoded Maya thread. The `messages` / `channels` / `channel_members` tables are already in the schema from Session 29.
- **Email notifications second** because Resend is wired (Session 28) but never used. Cheap unlock — welcome email + "X started following you" makes the app feel alive.
- **Edit posts** is a common UX ask and small in scope. Modal already has the "..." menu (just add Edit alongside Delete).
- **Mobile sweep** before opening to a real population. Worth a single day to surface broken layouts.
- **Public profile SEO** so /profile/<handle> URLs are shareable and indexed. Small change to the React route to render meta tags + OG image.
- **Block / Report / Mute** before any real public population. Adds `blocks` table + RLS rules that exclude blocked users from feeds and search.

### Acceptance criteria per ticket

#### 1. P1-022 — DMs ⭐ start a fresh chat for this

**Goal:** users can send and receive real DMs through Supabase Realtime (or polling for v1).

- Schema: `messages`, `channels`, `channel_members` already exist. May need a small migration if `channels.type` enum is missing values.
- Wire `submitMessage` (today: `messages.html` line ~1617 just appends to a local in-memory array) to `POST /api/me/messages` which inserts into `messages` (and creates a 1:1 `dm` channel + memberships if missing).
- Hydration: `GET /api/me/threads` returns the user's channel list with last-message preview. `GET /api/me/threads/[id]/messages` returns messages for a channel.
- Realtime: Supabase realtime channel subscription on `public.messages` filtered by channel_members. Or polling every 5s for v1 simplicity.
- Message requests: incoming DMs from non-connections go to a "requests" tab; accepting moves them to the main thread list.
- Delete the hardcoded Maya threads in `messages.html` once real threads hydrate.
- Profile **Message** button on connected users — currently stubbed, point at `/messages?to=<handle>` which auto-creates/opens that thread.

**Files likely to touch:**
- `supabase/migrations/<new>` — only if `channels.type` enum needs values added
- `src/app/api/me/messages/route.ts` (new)
- `src/app/api/me/threads/route.ts` (new)
- `src/app/api/me/threads/[id]/messages/route.ts` (new)
- `public/html/messages.html` — rewire the in-memory array
- `public/html/profile.html` — Message button → /messages?to=<handle>
- Journal v5.1 entry

**Pre-build [You] task:** confirm `channels.type` includes `'dm'` already; if not, run a quick `ALTER TYPE` migration.

#### 2. Email notifications via Resend (~1d)

**Goal:** Welcome email on signup + "X followed you" rollup email.

- Resend client already wired (`src/lib/resend.ts` from P1-003). Just needs senders.
- New `src/lib/email/templates/` with React Email components (or plain HTML strings — Resend supports both).
- Trigger paths:
  - On `auth.users` insert OR `public.users` insert → welcome email (server-side, possibly via Postgres trigger calling a Supabase Edge Function, OR via the existing `handle_new_user` flow + a Next.js API route).
  - Daily cron job → query unread notifications older than 24h, send digest email per user. Vercel Cron Jobs (https://vercel.com/docs/cron-jobs) handle this — `/api/cron/email-digest` route.
- Add `users.email_prefs` JSONB or `users.email_digest_enabled` bool so users can opt out (eventually).

**Files likely to touch:**
- `src/app/api/cron/email-digest/route.ts` (new)
- `src/lib/email/welcome.ts`, `src/lib/email/follow-digest.ts` (new)
- `src/app/api/auth/post-signup/route.ts` (or a Postgres trigger calling an Edge Function)
- `vercel.json` — cron schedule
- Journal v5.2 entry

#### 3. Edit own posts (~0.5d)

**Goal:** edit a post's content/tags after publishing.

- New `PATCH /api/posts/[id]` body `{content?, tags?, media_url?}`. RLS already enforces `posts_update_own`.
- "..." menu in `_postViewer.js` gets an Edit option (only shown when viewer is author). Clicking it swaps the body for an inline textarea + Save/Cancel.
- Update `_postViewer.js` to re-render the body after a successful PATCH.
- Don't allow editing post type (no post → clip switch).

**Files likely to touch:**
- `src/app/api/posts/[id]/route.ts` (extend with PATCH)
- `public/html/_postViewer.js` (add Edit affordance)
- Journal v5.3 entry

#### 4. Mobile responsive sweep (~1-2d)

**Goal:** profile, campus, modals don't break at phone widths.

- Manual sweep at 375px (iPhone SE), 414px (iPhone 14 Pro), 768px (iPad portrait).
- Profile cover banner + avatar-row likely overflow at narrow widths.
- Otto side panel is `width: 380px max-width: 92vw` — good but the corner ring + dot may stack with content.
- Post viewer modal is `width: min(680px, 100%)` — should be OK but verify.
- Campus shell is 3-col grid on desktop (200px / 300px / 1fr) — needs to collapse on phone.
- Chat layout especially fragile.

**Files likely to touch:**
- Several `.html` files in `public/html/` — each needs media-query passes
- Journal v5.4 entry

#### 5. Public profile SEO (~0.5d)

**Goal:** /profile/[handle] is a real server-rendered page with meta tags + OG image.

- Currently the React route auth-gates and redirects to `/html/profile.html?handle=<h>`. Change to: server-fetch the user via the public bootstrap, render a minimal SSR page with proper `<title>`, `<meta property="og:*">`, `<meta name="description">`, then either:
  - Option A: keep the redirect to the static prototype (search engines see the SSR meta + bots don't follow redirects much, so they index the SSR HTML)
  - Option B: full SSR the profile (bigger lift, deferred to later)
- For now: Option A.
- Generate OG images via `@vercel/og` from the user's avatar + name + tagline.

**Files likely to touch:**
- `src/app/profile/[handle]/page.tsx` — add SSR meta + remove the redirect when User-Agent looks like a crawler
- `src/app/profile/[handle]/opengraph-image.tsx` (new) — `@vercel/og` template
- Journal v5.5 entry

#### 6. Block / Report / Mute (~1d)

**Goal:** safety floor before public launch.

- New `blocks (blocker_id, blocked_id, created_at)` table with `UNIQUE(blocker_id, blocked_id)` and `CHECK (blocker_id <> blocked_id)`.
- `POST /api/me/block { target_id }` and `DELETE` for unblock.
- RLS rule on every read query (or a database VIEW) that excludes posts/comments where the author is in the viewer's blocks list. Maybe a Postgres function `is_blocked(viewer_id, author_id)` for reuse.
- Report: `reports (id, reporter_id, target_type, target_id, reason, created_at)` table, no RLS exposure (only admins query). Report button in post viewer "..." menu and on profile pages.
- Mute is similar to block but lighter (don't see their content; they don't know).

**Files likely to touch:**
- `supabase/migrations/<new>` — `blocks` + `reports` tables + RLS rules
- `src/app/api/me/block/route.ts` (new)
- `src/app/api/me/reports/route.ts` (new)
- `public/html/_postViewer.js` — Report option in non-owner "..." menu
- `public/html/profile.html` — Block button in viewer-mode actions
- Journal v5.6 entry

---

## 6) Open questions to resolve during Stage 5

- **DM realtime vs polling:** Realtime is the IG-grade UX but adds Supabase Realtime cost + connection management. Polling every 5s is cheaper but feels laggy. Pick during P1-022.
- **Email digest cadence:** daily, or batched at 1h after first unread arrives? Pick during email-notifications work.
- **Mute vs block scope:** does muting hide notifications too? Probably yes — a Postgres function makes both blocked and muted users invisible to notification queries.
- **Public profile crawler detection:** the easiest cross-fingers way is to detect `User-Agent` containing "bot" / "Googlebot" / "facebookexternalhit" and serve SSR HTML; everyone else gets the redirect. Might want a small allowlist instead.

---

## 7) Operational reminders before Stage 5 ships

- **Supabase migrations:** anything new in Stage 5 (`blocks`, `reports`, possibly `channels.type` ALTER) must be applied to the linked Supabase project (`supabase db push` or SQL Editor) before that ticket goes live on prod.
- **R2 access:** unchanged from Stage 4.
- **Vercel env:** mirror anything new in `.env.example` to Vercel UI.
- **Vercel Cron Jobs:** the email digest needs a `vercel.json` `crons` entry (Hobby tier supports daily, Pro supports per-minute). Confirm tier before promising frequency.
- **Resend domain auth:** before sending real outbound mail, confirm the sending domain is verified in Resend (DNS records: SPF, DKIM, DMARC). The from address is currently noreply@send.connectvibe.app or similar — verify.
- **`QA_CHECKLIST.md` extension:** add §7 (DMs), §8 (Email), §9 (Block/Report) when those ship.

---

## 8) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-04-session-38-stage4-close-handles-notifications-pin.md
and the Session 38 entry in public/journal/vibe_journal.html, then start
P1-022 DMs. Plan the work as a thread in the handoff's §5.1 acceptance
criteria. Confirm channels.type already includes 'dm' before writing
the API.
```

That's enough context — the handoff carries the rest.

---

## 9) Related files

- `handoffs/2026-05-04-session-34-connections-stage4-plan.md` — Stage 4 plan, what came before
- `handoffs/2026-05-03-session-31-profile-storage-feed-flags-handoff.md` — earlier Stage 3 work
- `public/journal/vibe_journal.html` — v5.0, Session 38
- `QA_CHECKLIST.md` — manual QA sweep at repo root
- `DOCS/PHASE_1.md` (gitignored) — original spec
- `DOCS/PHASE_1_TASKS.csv` (gitignored) — same data as the user's spreadsheet

---

## 10) Stuff explicitly NOT shipped this stage (so the next chat doesn't reinvent)

- **Otto v2 backend** (voice training, platform OAuth, posting queue, real metrics) — own large phase later.
- **Calendar↔campus RSVP sync** — RSVP doesn't auto-add to calendar yet.
- **For You ranking** — labels are still hardcoded "94% match" / "Matched for you".
- **Repost / Send (DM share) buttons** in post viewer action row — Repost deferred indefinitely; Send waits for P1-022.
- **Comment editing / deletion** — comment composer is post-only for now.
- **Real .edu verification** — still the demo "I clicked the link" button. Replace with real one-time-link email send + click confirmation.
- **Per-school campus content** — verified non-IU students still see IU's feed/jobs/events.
- **Account settings page** — change email, password, delete account.
- **Forgot password flow** — auth has password reset per Session 30; verify it works end-to-end.
- **Drafts UI** — explicitly scrapped. The platform pills + Review link are gone from Otto. `renderDraftsHTML` and `generateVariants` are still in `_otto.js` but no longer wired to the panel render path; can be deleted in a future cleanup pass or revived if drafts come back.
