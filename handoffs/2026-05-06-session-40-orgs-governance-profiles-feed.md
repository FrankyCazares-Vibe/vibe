# Session 40 handoff — Org governance, profiles, admin controls, feed wiring (2026-05-06)

This handoff covers **Session 40**, which picked up where session 39 left off — Stage 6 P1-023 (Discord-style org channels) was already mid-flight. We took P1-023 to completion and then **deviated heavily** from the original Stage 6 plan to build out org governance, public profile pages, admin controls, and the campus feed integration. The remaining Stage 5/6 leftovers (email, edit posts, mobile, SEO, realtime DMs) are still pending — see §5.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for ship loops + multi-file work. |
| **`[Cursor]`** | Cursor agent — small targeted fixes / lint nits. |
| **`[Either]`** | Either tool. |
| **`[You]`** | Human / dashboard — Supabase SQL editor, Vercel, R2, etc. |

---

## 1) What shipped, Session 40

The session covered seven distinct work streams. Each is a self-contained slice you could ship independently.

### Phase A — Channel-level controls (closes P1-023)

- **`channels.pinned boolean`** — pinned channels float to a "📌 Pinned" group at the top of the rail.
- **`org_channel_members` table** — per-channel allow list. Owner/admin can grant specific members access to a private channel even if they aren't staff. Used for "exec channel that includes the chair (a regular member)."
- **Tightened `can_view_org_channel`** — previously mods auto-passed any private channel; now mods must be explicitly invited like everyone else. Owner/admin always pass.
- **Channel settings modal** ([campus-home.tsx — `ChannelSettingsModal`](src/app/campus/campus-home.tsx)) with three tabs:
  - **Overview** — rename, edit topic, public/private toggle, pin toggle, ↑/↓ reorder buttons (only for non-pinned channels)
  - **Access** *(only when private)* — list allowed members, add by `@handle`, revoke
  - **Danger** — delete channel
- **Hover ⚙ cog + right-click context menu** on channel rows in the rail (managers only) → opens the settings modal.

### Phase B — Org governance + dormancy

- **`orgs.verified boolean`** (gold ✓ — flipped only by platform admins)
- **`orgs.last_activity_at timestamptz`** (auto-bumped by triggers on `messages` + `posts` insert; `DEFAULT now()` so new orgs aren't pre-condemned)
- **`orgs.links jsonb`** + **`orgs.philanthropy text`** (profile-surface fields)
- **`users.is_platform_admin boolean`** — single platform-level role; gates `/admin` and verify endpoints
- **Discover ranking**: `verified DESC, last_activity_at DESC`, with three groups (Verified / Student communities / Dormant). Verified orgs are **never** dormant — handles summer + winter quiet periods for legit chapters.
- **60-day dormancy threshold** for community orgs. NULL `last_activity_at` is treated as fresh (not dormant) — fixed a bug where new orgs disappeared the moment they were created.

### Phase C — Platform admin tooling

- **`/admin`** ([admin-orgs-client.tsx](src/app/admin/admin-orgs-client.tsx)) — list of every org with verified / community / dormant filter, search, one-click Verify/Unverify toggle. Soft-redirects non-admins to `/campus` (no leaked existence).
- **`POST /api/admin/orgs/[slug]/verify`** + **`GET /api/admin/orgs`** — gated on `is_platform_admin`.
- **Admin link in `LeftNav`** ([LeftNav.tsx](src/components/LeftNav.tsx)) — gold-tinted pill, fetched from `/api/me/profile-bootstrap` (extended to return `isPlatformAdmin`). Renders only for platform admins; not even in the DOM for everyone else.

### Phase D — Org public profile page

- **`/orgs/[handle]`** ([orgs/[handle]/page.tsx](src/app/orgs/%5Bhandle%5D/page.tsx)) — public, signed-out-friendly. Server-rendered for SEO.
- Layout: Banner → logo + name + verified ✓ + visibility/dormant chips → description → 2-column (recent clips + recent posts on the left, links + philanthropy + facts on the right).
- **Private orgs show the same public profile** (description, posts, clips, links, philanthropy) — the privacy boundary is *channels*, not the profile. A small lavender notice explains: "This community is private. Profile is public — request access above to see the channels and join the chat."
- **Quick-view modal in Discover** ([campus-home.tsx — `OrgQuickViewModal`](src/app/campus/campus-home.tsx)) — click any Discover card to open a 560px overlay with the same shape as the profile page (without the posts/clips columns).

### Phase E — Owner/admin profile controls

- **Admin toolbar** on `/orgs/[handle]` for owner/admin only. Four buttons:
  - **Banner** — file picker (10MB max, jpg/png/webp/gif), preview, R2 upload
  - **Logo** — same flow (5MB max)
  - **Edit details** — description / links (label+URL pairs, max 10) / philanthropy
  - **New post** — Post / Clip toggle. Caption + optional image (15MB) for posts; required video (200MB max, mp4/mov/webm) for clips
- **R2 helpers** ([r2.ts](src/lib/r2.ts)):
  - New `ORG_ASSET_KEY_PREFIX = "orgs/"`, `signOrgAssetPutUrl`, `signOrgAssetGetUrl`
  - Folder shape: `orgs/<org_id>/(banner|logo|posts)/<uuid>.<ext>`
- **`POST /api/orgs/[slug]/upload-url`** — admin-gated, validates type + size per kind, returns signed PUT URL + object key.
- **`POST /api/orgs/[slug]/posts`** — admin-only, creates a `posts` row with `org_id` set + `user_id` = the staff member who hit publish. Trigger auto-bumps `last_activity_at`.

### Phase F — Asset proxying convention

R2 stores object keys, not public URLs. To keep the rest of the app naive of signing:

- **`/api/orgs/[slug]/asset/[kind]`** ([asset/[kind]/route.ts](src/app/api/orgs/%5Bslug%5D/asset/%5Bkind%5D/route.ts)) — GET 307-redirects to a freshly signed R2 URL for `banner` or `logo`. 1h TTL.
- **`/api/posts/[id]/media[?variant=thumbnail]`** ([posts/[id]/media/route.ts](src/app/api/posts/%5Bid%5D/media/route.ts)) — same pattern for post media. Routes through `signOrgAssetGetUrl` or `signClipGetUrl` based on object-key prefix.
- **`orgAssetProxyUrl`** ([org-asset-url.ts](src/lib/org-asset-url.ts)) and **`postMediaProxyUrl`** ([post-media-url.ts](src/lib/post-media-url.ts)) — server-side helpers that convert stored object keys to stable proxy URLs.
- Every API endpoint that emits `banner_url` / `logo_url` / `media_url` runs the value through one of these. The browser never sees a raw R2 key, never has to handle signed URLs.

### Phase G — Campus feed wired up

- `/api/feed` ([api/feed/route.ts](src/app/api/feed/route.ts)) extended:
  - `IN ('post', 'clip')` instead of just `post`
  - Joins org info: `org:orgs(id, handle, name, logo_url, verified, is_public)`
  - Signs `org.logo_url` and `media_url` / `media_thumbnail_url` via the proxies
- **`FeedTabBody`** ([campus-home.tsx](src/app/campus/campus-home.tsx)) — replaced the three mock posts with a real fetch + render.
- New **`FeedRow`** component handles both:
  - **Author posts** — round avatar, name, `@handle · 2h`
  - **Org posts** — squircle org logo, org name (linked to `/orgs/[handle]`), gold ✓ if verified, `posted by @member` attribution
  - **Clips** — purple "Clip" pill, inline `<video>` player
- Empty + loading states.

### Phase H — UX polish across the whole flow

- **Server rail glassmorphism** — vertical luminance gradient, 48px blur, top specular rim, diagonal sheen overlay, `ServerPill` org icons with hover lift + active capsule indicator + colored ambient glow.
- **Channel rail** — matching glass treatment.
- **`LockIcon` SVG component** — replaced 🔒 emoji at 6 sites.
- **Discover rebuild**:
  - Tier groups (Verified / Student communities / Dormant)
  - Search bar (debounced 220ms)
  - Filter chips (All / Public / Private)
  - Show-Dormant glass toggle pill
  - Cards now clickable → opens quick-view modal
  - Joined orgs included with green ✓ "Joined" pill + role chip (instead of being filtered out)
  - "Profile" link beside Join button
- **Banner-doesn't-overlap-logo fix** — both modal and profile page logos sit below banners with a small gap (was a heavy negative-margin overlap).
- **Top nav cleanup** on profile page — only "Sign in" for anonymous viewers; signed-in users rely on contextual card actions instead of a duplicate "Open Campus".
- **Verified badge** in the channel rail header next to the org name.
- **Permissions card** + **role legend** in OrgSettings → Overview / Members tabs explaining "what you can do."
- **Create-org banner** at the top of the Orgs tab so new users have an obvious entry point.

---

## 2) Migration ledger (apply in order, all on prod Supabase)

```
20260507100000_org_channels_schema.sql       — schema for pinning prep + roles + org_join_requests
20260507110000_org_channels_helpers_rls.sql  — is_org_member / can_view_org_channel + RLS
20260507120000_fix_org_members_rls_recursion.sql  — drops the recursive EXISTS clause
20260507130000_org_channel_pinning_and_access.sql — channels.pinned + org_channel_members + helper update
20260507140000_private_channel_owner_admin_only.sql  — mod no longer auto-passes private channels
20260507150000_org_governance.sql             — verified, last_activity_at, links, philanthropy, is_platform_admin, triggers
20260507160000_orgs_last_activity_default.sql — DEFAULT now() + backfill NULLs
```

**Manual SQL** to bootstrap the founder as platform admin:

```sql
UPDATE public.users
   SET is_platform_admin = true
 WHERE id = 'df5ab44e-174f-4c53-a8bc-261c1c67e10b';
```

(Founder UUID = `df5ab44e-174f-4c53-a8bc-261c1c67e10b`, handle `frankycazares`. The `auth.users.email` is `fgcazares04@gmail.com` — IU email lives in `school_email`. See [user_emails memory](../.claude/projects/-Users-franciscocazares-vibe/memory/user_emails.md).)

All migrations were applied during the session — confirm with:

```sql
-- Should return 7 rows, all with `verified`, `last_activity_at`, `pinned`, etc.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name='orgs' AND column_name='verified') AS has_verified,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='channels' AND column_name='pinned') AS has_pinned,
  (SELECT count(*) FROM information_schema.tables WHERE table_name='org_channel_members') AS has_channel_members_table,
  (SELECT count(*) FROM information_schema.tables WHERE table_name='org_join_requests') AS has_join_requests_table;
```

---

## 3) Conventions / architecture

- **R2 storage** — all assets stored as object keys (never raw URLs in the DB). Prefixes: `clips/`, `groups/`, `messages/`, `orgs/`. Signed on read via proxy routes (or directly server-side in profile pages).
- **Asset proxies** — `/api/orgs/[slug]/asset/[kind]` and `/api/posts/[id]/media`. 307 redirect to fresh signed URL. Browser caches the redirect target via standard HTTP cache.
- **Discover endpoint** uses **service role** to bypass `orgs_select_visible` RLS. RLS protects channels + messages + member rosters; the org row itself (name, description, banner, etc) is intentionally browseable.
- **Defensive try/catch** on optional columns when reading from prod — the [Session 39 handoff §3 rule](2026-05-06-session-39-stage5-messaging-safety-mentions.md) still applies. New columns (`verified`, `pinned`, `links`, etc) wrap their reads where deploys can outpace migrations.
- **Activity tracking** — Postgres triggers on `messages` and `posts` insert auto-bump `orgs.last_activity_at`. SECURITY DEFINER so even regular members posting to a channel can update the org row.
- **Permission tiers**:
  - **Platform** — `users.is_platform_admin` (currently 1 user). Gates `/admin` + verify.
  - **Org-level** — `org_members.role` ∈ `owner | admin | mod | member`.
  - **Channel-level** — public channels open to all members; private channels restricted to owner/admin + explicitly invited members from `org_channel_members`.

---

## 4) Permission matrices (cheat sheet)

### Platform

| Action | Platform admin | Everyone else |
|---|---|---|
| Visit `/admin` | ✓ | redirect to `/campus` |
| Verify / unverify orgs | ✓ | — |
| See "Admin" link in LeftNav | ✓ | — |

### Org

| Action | Owner | Admin | Mod | Member |
|---|---|---|---|---|
| Create org | school_verified user | school_verified user | n/a | n/a |
| Edit org overview | ✓ | ✓ | — | — |
| Create / rename / delete channels | ✓ | ✓ | — | — |
| Promote to admin | ✓ | — | — | — |
| Demote/promote mod ↔ member | ✓ | ✓ | — | — |
| Approve/deny join requests | ✓ | ✓ | ✓ | — |
| Upload banner / logo / new post | ✓ | ✓ | — | — |
| Delete org | ✓ | — | — | — |

### Channel (within an org)

| Action | Owner | Admin | Mod | Member |
|---|---|---|---|---|
| See public channel | ✓ | ✓ | ✓ | ✓ |
| See private channel | ✓ | ✓ | only if invited | only if invited |
| Grant / revoke channel access | ✓ | ✓ | — | — |

---

## 5) Stuff explicitly NOT shipped this session

The user picked these as next priorities for tomorrow ("polish + new features that natural extend"):

### Polish (priorities tomorrow)

- **Likes / comments wired to feed** — `EngagementAction` icons render but click does nothing. Posts table already has `post_likes` infrastructure.
- **Edit / delete your posts** — only create works. Need `PATCH /api/posts/[id]` + `DELETE /api/posts/[id]` (with org-admin gate when `org_id` is set).
- **Member roster on org profile** — show 6–8 avatars + an "All members" link. Officers (owner/admin/mod) get a separate small "Officers" callout.
- **Inline post composer in Feed tab** — currently a static "What's happening on campus?" placeholder. Wire to actually compose; let users tag a post to one of their orgs.
- **Mobile responsive sweep** — never tested at 375 / 414. Admin toolbar in particular probably wraps badly.

### Natural extensions

- **Org events** — new `org_events` table. Show on profile + Events tab. RSVPs.
- **Org follow without joining** — get announcements without being in the channels.
- **Notifications when an org you joined posts** — reuse `notifications` table with a new type.
- **Email digests via Resend** — daily/weekly digest of new posts from joined orgs.
- **OG images** for `/orgs/[handle]` — `@vercel/og`.

### Bigger items deferred (not tomorrow)

- **Realtime DMs (P1-028)** — still polling at 2s. Cost story OK at current scale.
- **Onboarding "find your org" step** — surface earlier so new users land in a community.
- **Post-engagement analytics** for org admins — views, likes, member growth.

### From original session 39 Stage 5/6 plan, still untouched

- **P1-024 Email notifications via Resend** — same scope as session 39 §5.2.
- **P1-025 Edit posts** — same as above polish item.
- **P1-026 Mobile responsive sweep** — same as above polish item.
- **P1-027 Public profile SEO + OG images for users** — note: orgs now have OG potential too.
- **P1-028 Realtime DMs** — deferred indefinitely.

---

## 6) Stage 7 plan (recommended order)

1. **Likes + comments wiring** to the feed — most value per hour, makes the feed feel alive.
2. **Edit / delete posts** — covers both user posts and org posts.
3. **Member roster on `/orgs/[handle]`** — small but visually important.
4. **Inline post composer in Feed tab** — with optional org tag picker for staff.
5. **Mobile sweep** — probably 1–2 days.
6. **Org events** — bigger, ~1.5 days for schema + UI.
7. **Notifications + email digests** — together, ~1 day. Resend already wired.
8. **OG images** — ~0.5 day.

Item 1 alone (`likes` + `comments` + the inline composer) takes the campus feed from "static demo" to "actual social product."

---

## 7) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-06-session-40-orgs-governance-profiles-feed.md
and pick up Stage 7 polish — start with likes/comments wired to the campus
feed (existing post_likes table + comments). Then edit/delete posts, then
the member roster on /orgs/[handle].
```

Lint + typecheck pass before pickup:

```
npx eslint src/app src/lib src/components 2>&1 | tail -20
```

Dev server is on port 3000 (process started this session). Check it's still
alive — if not, `npm run dev` will pick the same port.

---

## 8) Related files / state

### Server pages
- [`src/app/orgs/[handle]/page.tsx`](src/app/orgs/%5Bhandle%5D/page.tsx) — public org profile
- [`src/app/orgs/[handle]/admin-actions.tsx`](src/app/orgs/%5Bhandle%5D/admin-actions.tsx) — admin toolbar + modals (client)
- [`src/app/orgs/[handle]/join-button.tsx`](src/app/orgs/%5Bhandle%5D/join-button.tsx) — join CTA (client)
- [`src/app/admin/page.tsx`](src/app/admin/page.tsx) — platform admin dashboard
- [`src/app/admin/admin-orgs-client.tsx`](src/app/admin/admin-orgs-client.tsx) — admin client island

### API
- `src/app/api/orgs/route.ts` — list (mine + discover, with all the new fields)
- `src/app/api/orgs/[slug]/route.ts` — GET / PATCH / DELETE
- `src/app/api/orgs/[slug]/profile/route.ts` — public profile data
- `src/app/api/orgs/[slug]/upload-url/route.ts` — R2 signed PUT (admin)
- `src/app/api/orgs/[slug]/posts/route.ts` — create org post/clip (admin)
- `src/app/api/orgs/[slug]/asset/[kind]/route.ts` — banner/logo proxy
- `src/app/api/orgs/[slug]/channels/[channelId]/route.ts` — channel PATCH/DELETE
- `src/app/api/orgs/[slug]/channels/[channelId]/members/...` — channel allow list
- `src/app/api/orgs/[slug]/channels/reorder/route.ts` — bulk reorder
- `src/app/api/orgs/[slug]/members/...` — org member role + kick
- `src/app/api/orgs/[slug]/requests/...` — join requests
- `src/app/api/admin/orgs/...` — platform admin
- `src/app/api/posts/[id]/media/route.ts` — post media proxy
- `src/app/api/feed/route.ts` — extended for clips + org info

### Helpers / lib
- `src/lib/r2.ts` — added `ORG_ASSET_KEY_PREFIX` + signers
- `src/lib/org-asset-url.ts` — proxy URL helper for banner/logo
- `src/lib/post-media-url.ts` — proxy URL helper for post media

### Migrations
- `supabase/migrations/20260507100000` through `20260507160000` (7 files this session)

### Major edits
- `src/app/campus/campus-home.tsx` — bulk: ChannelSettingsModal, OrgQuickViewModal, FeedTabBody real data, Discover tiers, server rail glass, role chips, etc.
- `src/components/LeftNav.tsx` — Admin link
- `src/app/api/me/profile-bootstrap/route.ts` — emit `isPlatformAdmin`

---

## 9) Deploy state — NOT yet on production site

Everything in this session is **local only**. The code lives on `main` (or wherever the working branch is) but **none of it has been pushed / deployed** to the live Vercel site that real users hit.

What's still on the live site is the **Session 39 cut** — DMs + safety + @mentions, *without*: pinning, channel access lists, profile pages, admin tools, governance tiers, dormancy, feed integration, etc. Everything in §1 of this handoff is unshipped.

### What needs to happen before this hits prod

1. **All 7 migrations applied** to prod Supabase (already done during the session — confirm with the SQL snippet in §2).
2. **Bootstrap platform-admin row** (also done — see §2).
3. **Push to main / deploy via Vercel** — `git push` triggers the auto-deploy. Currently the working tree has uncommitted changes; first commit them.
4. **R2 env vars** are already wired (banner/logo uploads work locally → same env vars work in prod).
5. **Sanity check on prod** after deploy:
   - Sign in as a verified user, create a test org, verify it via `/admin`.
   - Upload a banner + logo + post on `/orgs/[your-handle]`.
   - Confirm post shows in the campus Feed tab with the org logo + verified ✓.
   - Verify a private channel restricts a non-staff member.
6. **Set the founder as platform admin** if the prod row's UUID differs from local. The auth.users.id on prod and local *should* be the same (you sign in with the same email), but worth double-checking.

### Deploy nuance — Resend / email isn't wired yet

No email-related deploy concerns this session. Resend env vars (if any) untouched.

### Deploy nuance — env vars

Confirm these are set on Vercel prod:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

All of these existed pre-session (since DMs already use R2). New session 40 code only adds new keys *under* the existing R2 bucket — no new env vars needed.

### Recommended deploy order

```
1. Commit working tree (review diff first; substantial changes across ~15 files)
2. Push to main
3. Wait for Vercel build to finish
4. Confirm migrations are already on prod (they were applied during dev to prod Supabase)
5. Sanity-check the live site (steps 5 above)
6. Update handoff §9 to "shipped" and write a journal entry
```

### Why we deferred shipping

Active development across multiple intertwined surfaces (channels, orgs, governance, profile, feed) — wanted to land a coherent slice rather than partial pieces. We're at a clean checkpoint now.

---

## 10) Known issues / gotchas

- **Migration order matters** — must apply in date order. Specifically `20260507120000` (recursion fix) must come *after* `20260507110000` (the one that introduced the recursion).
- **`react-hooks/purity`** lint rule fires on `Date.now()` in server components. Suppressed inline at [`src/app/orgs/[handle]/page.tsx:98`](src/app/orgs/%5Bhandle%5D/page.tsx#L98). Same suppression in `src/app/admin/page.tsx`.
- **The `[handle]` dynamic route segment shadows local `handle` variables.** If you destructure `const { handle } = await params` and then try to declare a sibling `const handle = ...`, the build fails with "the name 'handle' is defined multiple times". Rename to `orgHandle` (already done in profile page).
- **Old uploaded assets aren't garbage-collected.** Replacing a banner leaves the old object key in R2. Out of scope for v1.
- **Redirect cache** — when a banner/logo changes, the browser may show the cached redirect target until it expires. `router.refresh()` plus the 5-minute signed URL TTL means this rarely surfaces, but not zero.
