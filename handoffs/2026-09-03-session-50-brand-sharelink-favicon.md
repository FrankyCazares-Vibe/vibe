# Session 50 handoff — brand polish, share-link fix, Google favicon (2026-09-03)

Short-but-high-impact session. Three distinct problems caught and fixed:
1. Every profile share link unfurled as "Maya Chen — Vibe Profile."
2. The Vibe icon was still the default Next.js triangle in some contexts.
3. Google Search was ignoring the favicon (too small, SVG-only).

All four commits landed on `main` and are live on `https://www.connectvibe.app`.

---

## Commits shipped

| SHA       | Title |
|-----------|-------|
| `14f1430` | `docs(brand): add the Vibe / Otto mood board` |
| `13f33ca` | `fix(brand): replace the default triangle at /favicon.ico` |
| `baf3b3f` | `chore(brand): drop accidental live-icon dumps from more/` |
| `70274f2` | `fix(profile): stop share links from unfurling as Maya Chen` |
| `e07af03` | `feat(brand): use vibe-icon.svg as the tab and app mark` |
| `29292a6` | `fix(seo): give Google a 48px PNG favicon instead of SVG` |

---

## §1 — Maya Chen share-link bug (root cause + fix)

**Symptom:** Sending any `/profile/<handle>` link via iMessage (or any app that
reads OG tags) showed "Maya Chen — Vibe Profile" regardless of whose profile it
was.

**Root cause:** `middleware.ts` was rewriting every unauthenticated
`/profile/[handle]` request to `/html/profile.html?user=<handle>`. That HTML
file had a hardcoded `<title>Maya Chen — Vibe Profile</title>` and only loaded
dynamic data when `?handle=` was present — which the middleware never set.
So iMessage's crawler saw Maya Chen every time.

**Files changed:**

- **`middleware.ts`** — Removed the `else if (isProfile && !session)` rewrite.
  Unsigned visitors now fall through to the Next.js App Router page.

- **`src/app/profile/[handle]/page.tsx`** — Added `generateMetadata` that calls
  `loadPublicProfile(handle)` (via `cache()` + `createSupabaseServiceClient`) and
  returns proper `openGraph` + `twitter` metadata with the real person's name,
  tagline, and avatar.

- **`src/app/api/users/[handle]/bootstrap/route.ts`** — Unauthenticated callers
  now get a service-role reader instead of a 401, so the profile actually renders
  after the client mounts.

- **`src/app/api/users/[handle]/posts/route.ts`** — Same pattern: service-role
  reader for logged-out requests.

- **`src/components/mobile/ProfileMobile.tsx`** — Follow/unfollow button now
  redirects to `/auth/login?next=...` instead of silently failing for
  unauthenticated users.

- **`public/html/profile.html`** — Fixed the `?user=` fallback so a live handle
  that isn't a mock character is treated as a real handle (not a Maya Chen
  fallback).

---

## §2 — vibe-icon.svg as canonical app mark

`brand/vibe/vibe-icon.svg` (the V-in-orbit design) is now the single source of
truth. All PNG/ICO assets are rasterised from it.

**Assets updated:**

| File | Size | Purpose |
|------|------|---------|
| `src/app/icon.svg` | SVG | Next.js route handler for SVG icon |
| `public/vibe-icon.svg` | SVG | Publicly served, referenced from HTML files |
| `src/app/icon.png` | 192×192 | General browser icon |
| `src/app/apple-icon.png` | 180×180 | iOS home-screen |
| `src/app/favicon.ico` | 16/32/48/64px multi-frame | Browser tab + Google |
| `public/favicon.ico` | same | Static fallback |
| `public/favicon-48.png` | 48×48 | Explicit Google-preferred size |
| `brand/vibe/icon-192.png` | 192×192 | Brand kit copy |
| `brand/vibe/apple-icon-180.png` | 180×180 | Brand kit copy |

---

## §3 — Google Search favicon fix

Google ignores SVG icons and requires a square raster icon **larger than 48×48 px**
linked from the homepage. The old `.ico` was 32 px only.

**Changes:**

- `favicon.ico` rebuilt with 16/32/48/64 px frames.
- `public/favicon-48.png` created (48 px PNG).
- `src/app/layout.tsx` — `metadata.icons` updated:
  ```ts
  icon: [
    { url: "/icon.png", type: "image/png", sizes: "192x192" },
    { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
    { url: "/favicon.ico", sizes: "48x48" },
    { url: "/vibe-icon.svg", type: "image/svg+xml" },
  ]
  ```
- All `public/html/*.html` files updated to use the same icon priority order
  (PNG before SVG so Google picks the raster versions).
- `src/app/robots.ts` created — allows `Googlebot-Image` to crawl
  `/favicon.ico`, `/icon.png`, and `/favicon-48.png`.

**Remaining step:** Go to Google Search Console → URL Inspection → submit
`https://www.connectvibe.app` for re-indexing so Google recrawls the favicon.
Google may take a few days to update the favicon in search results.

---

## §4 — Desktop VIBE HUB copy sync

The `~/Desktop/VIBE HUB copy` folder is now automatically kept in sync.

- **`scripts/sync-vibe-hub.sh`** (new) — one-way `rsync` from `~/vibe` to
  `~/Desktop/VIBE HUB copy` for: `brand/`, `public/html/`, `public/journal/`,
  `DOCS/`, `handoffs/`, `otto_mockups/`.
- **`.cursor/rules/vibe-hub-copy.mdc`** (new) — Cursor rule telling the agent to
  run the sync script at the end of any session that touches those folders.
- **`~/Desktop/VIBE HUB copy/sync.command`** updated to call the script.
- **`~/Desktop/VIBE HUB copy/READ ME.txt`** updated to document the new setup.

---

## §5 — Session 51 pick-up list

**Top priority — active in Claude Code as of this handoff:**
- [ ] **Security review.** Full audit of RLS policies, service-role exposure,
  API auth, rate limiting, input validation, and session management.

**High priority (do next in Cursor after security is done):**
- [ ] QA mobile onboarding (`OnboardingMobile.tsx`) + Otto tour (`use-mobile-tour.ts`)
  on a real phone with a live Supabase backend.
- [ ] Hand-test video-in-feed and video-in-DM on a phone (legacy `clips/` R2 prefix).
- [ ] Re-enable Supabase "Confirm email" + point at Resend custom SMTP.
- [ ] Get one real IU student through signup → post → send to a friend on
  `www.connectvibe.app`.
- [ ] Request indexing in Google Search Console for `www.connectvibe.app` if not
  already done.

**Medium priority:**
- [ ] `/posts/[id]` for unauthenticated visitors (OG + page render).
- [ ] Feed ranking Tier-2 (signals beyond recency).
- [ ] Mobile work-experience date picker.
- [ ] Desktop search overlay.
- [ ] Rename `clip*` → `video*` in shared R2 plumbing (cosmetic, not urgent).
- [ ] First-class Notifications panel (#29).
- [ ] Real `.edu` email verification.

---

## §6 — Tech debt notes

- `react-hooks/set-state-in-effect` lint warning still present. Low urgency.
- `QA_CHECKLIST.md` at repo root — the Maya Chen entry was updated to reflect
  the new behavior (logged-out `/profile/<handle>` is a live profile, not a demo).
- Service-role client is now used in three API routes. Ensure the
  `SUPABASE_SERVICE_ROLE_KEY` env var is always set in Vercel (it is, confirmed).
  Never expose it to the client bundle.
