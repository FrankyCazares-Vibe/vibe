# Session 43 handoff — Unified search, Clips Reel toggle, post-with-video, tooling install (2026-05-11)

This session wired the long-pending search bar (both profile and campus banner), shipped a Reels-style clips experience inside the Feed tab with full engagement parity (likes/comments/reposts/share), added X-style horizontal video posts, and installed four pieces of new design/AI tooling (Gemini CLI + Stitch + Nano Banana 2 + UI UX Pro Max + 21st.dev Magic). Next pickup is the landing page rewrite, reframing Otto as a tour guide instead of a marketing agent.

**Not yet committed.** All changes still uncommitted on `main` at session end — `git status` shows the staged work. A commit + push will trigger Vercel auto-deploy.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for everything below. |
| **`[You]`** | Human — gave direction, made product calls, supplied the 21st.dev API key. |

---

## 1) What shipped, Session 43

### Phase A — Unified search wiring (resolves §6 search wiring from session 42)

- **New endpoint `GET /api/search`** ([src/app/api/search/route.ts](src/app/api/search/route.ts)) — fans out to users + orgs + events in parallel. `?limit=6` default per kind (capped at 20). `?kinds=users,orgs,events` CSV optional. School-scoped events (matches `/api/feed` + `/api/events`). Service-role org list so private orgs surface. Block-filtered users with `rel` annotation (Connect / Pending / Connect back / Message).
- **profile.html search bar** ([public/html/profile.html](public/html/profile.html)) — switched from `/api/users/search` → `/api/search`. Renders 3 sections: People / Clubs & Orgs / Events. People → `/profile/<handle>`, Orgs → `/orgs/<handle>`, Events → `/campus?tab=events&event=<id>`. Added `autocomplete="off"` (+ `autocorrect`/`autocapitalize`/`spellcheck`) so Chrome's native dropdown stops fighting the custom one. Per-entry × on Recently Searched (hover-fade in, `event.stopPropagation()` so the row's navigate click doesn't fire).
- **Campus banner** ([src/app/campus/campus-home.tsx](src/app/campus/campus-home.tsx)) — placeholder div replaced by a real `CampusSearchBar` component. Same `/api/search` endpoint. Same dropdown layout (cream card, sections). Shares the `vibe_recent_searches_v1` localStorage with profile.html so recents follow the user across surfaces. Dropdown is `position: fixed` because the banner has `overflow: hidden` for the sheen sweep; anchors to the input's right edge so it grows leftward and never clips the viewport. Bar shifted ~80px left via `marginRight` so even very wide dropdowns stay on-screen.

### Phase B — Reels-style Clips experience inside Feed tab

- **Feed mode toggle** — two pills below the SceneHeader: **Posts** (default) and **Clips**. Tag-filter mode forces back to Posts since hashtag drilldowns mix both kinds.
- **`ClipsReel`** component — filters feed entries to clips only. Renders inside a dedicated scroll container with `scroll-snap-type: y mandatory` so each clip snaps one-per-viewport, desktop-TikTok style. The container is also the IntersectionObserver root for each card so auto-play only fires for the snapped clip, not every clip technically in the document viewport.
- **`ClipReelCard`** — 9:16 aspect ratio sized by `height: min(calc(100vh - 200px), 860px)` (width follows). Looks correct on desktop (big), narrow phone (full-width, height shrinks). Auto-plays muted when ≥60% in view, pauses otherwise. Lazy-fetches signed playback URL via the existing `/api/clips/[id]/view-url` route. Tap to toggle play/pause. Loops by default.
- **Engagement wired in-card** (all optimistic, roll back on API error):
  - **Like** — toggles via `POST/DELETE /api/posts/:id/like`. Shared `LikeIcon` fills coral when liked.
  - **Comment** — opens a bottom-sheet overlay that reuses the existing `CommentsDrawer` (same data, same composer, same threading the post column uses). Video pauses while sheet is open, resumes on close. Shared `CommentIcon`.
  - **Repost** — simple toggle via `POST/DELETE /api/posts/:id/repost` (no quote — for that, navigate to `/posts/<id>`). Shared `RepostIcon`.
  - **Share** — `ShareIcon` button. Uses `navigator.share` if available, falls back to clipboard.
  - **Double-tap to like** — 300ms tap-window; second tap inside it calls like (only if not already liked — double-tap doesn't unlike). The side heart turning coral is the indicator; no big heart-burst overlay (tried it, scratched it on user feedback).
- **Polish (Reels-only)**:
  - **Scroll-snap** — one clip per viewport.
  - **Progress bar** — slim 3px coral bar at the bottom, tracks `timeupdate`. Click to scrub.
  - **"Tap volume to unmute"** hint — small dark pill at the top, shows on the first clip only while it's muted + playing. Auto-dismisses after 3.5s. Stays dismissed once user unmutes.
  - **Sound icons** — replaced emoji 🔇/🔊 with proper SVG `SoundOffIcon` / `SoundOnIcon` (speaker with stripe-out / waves).

### Phase C — Post-with-video flow (X-style horizontal video posts)

The premise from session: clips = vertical short-form only (Reels feed). Posts = anything else, including horizontal/square video posts (X-style). The composer auto-classifies, with a manual toggle override.

- **`/api/clips/[id]/view-url`** — loosened to allow `type='post'` rows whose `media_url` is a `clips/` R2 key, not just `type='clip'`. Single signed-URL endpoint for any video on a post.
- **`/api/me/publish-post`** — accepts a new `video_object_key` field (R2 key under `clips/<user>/...`) + optional `duration_sec`. Validates the key prefix matches the viewer. Stores the R2 key in the existing `media_url` column (overloaded — column means "image URL OR R2 video key"). Rejects requests that try to send both `media_url` (image) and `video_object_key`.
- **`/api/feed`** — added `media_kind: "video" | "image" | null` to each post in the response. Derived server-side from the raw stored `media_url`: starts with `clips/` → video, starts with `http(s)://` → image. Saves the client from URL-parsing the opaque proxy URL.
- **Composer**:
  - On video pick, `capturePosterFrame()` (extended to return width/height + duration) probes the file.
  - Auto-classifies: vertical (`h > w*1.05`) + ≤120s → `clip`. Otherwise → `post-video`.
  - Toggle pills under the file label: **Clip** / **Video post**. User can override the auto-pick. Duration + dimensions shown as a hint to the right.
  - Submit branches: `clip` mode → `POST /api/me/publish-clip` as before. `post-video` mode → `POST /api/me/publish-post` with `video_object_key` + `media_thumbnail_url` (the poster).
  - Both paths share the same R2 upload (`/api/me/clip-upload-url`) and the same poster-capture step.
- **Feed renderer** — `FeedRow` now branches on `media_kind`:
  - `image` → `<div bg-image>` (existing behavior)
  - `video` → `<video controls preload="metadata">` with the poster (NEW — works for both `type='clip'` and `type='post'` with video media).

### Phase D — Profile clip thumbnail fallback

- **`_clipFallbackGradient(id)`** added in profile.html (mirrors the React `clipFallbackGradient` in campus-home). Deterministic per-id pick from the existing `CLIP_PALETTES` array, so a clip without a poster always paints the same gradient across page loads + viewer/owner views.
- Both hydration spots (`hydrateProfilePostsFromAPI` + `hydrateVisitedUserPosts`) now call this instead of using a single hardcoded purple gradient.
- New clips uploaded post-fix get a real poster (session 42's `capturePosterFrame` bug-fix). Old clips fall back to the deterministic gradient.

### Phase E — Tooling install (for the next session's design work)

Installed four tools, none committed to the repo (all global / per-machine):

| Tool | What it is | How to use |
|---|---|---|
| **Gemini CLI** v0.41.2 | `npm install -g @google/gemini-cli`. Base CLI for the next two. | `gemini` in terminal. |
| **Stitch** extension v0.1.4 | Google's design-to-code MCP. `gemini extensions install https://github.com/gemini-cli-extensions/stitch --auto-update`. | Inside `gemini`, run `/stitch <prompt>`. First use prompts for auth. |
| **Nano Banana 2** extension v1.0.12 | Image generation via Gemini 3 Pro Image. The `gemini extensions install` route silently failed to fetch the release tarball, so installed manually: `curl -sL https://github.com/gemini-cli-extensions/nanobanana/releases/download/v1.0.12/nanobanana-release.tar.gz \| tar -xz -C ~/.gemini/extensions/nanobanana`. **Needs `NANOBANANA_API_KEY` env var** ([Google AI Studio key](https://aistudio.google.com/apikey)) before use, or run `gemini extensions config nanobanana` to set persistently. Commands: `/generate`, `/edit`, `/restore`, `/icon`, `/diagram`, `/nanobanana`. |
| **UI UX Pro Max** skill | NextLevelBuilder's design intelligence skill. Installed via `npm install -g uipro-cli` + `uipro init --ai claude` in the project root. Files live in `.claude/skills/ui-ux-pro-max/`. | Auto-activates in Claude Code on UI/UX prompts. Restart Claude Code to pick it up. |
| **21st.dev Magic** MCP | UI component generation (v0 in your editor). `npx @21st-dev/cli@latest install claude --api-key <key>`. Config landed in Claude Code's global MCP. | Restart Claude Code, then prompt `/ui <description>`. |

**Security note:** The 21st.dev API key was pasted in chat → should be considered leaked. Recommend rotating it at [21st.dev/magic/console](https://21st.dev/magic/console) before broad use.

---

## 2) Repo state at session end

- **0 commits** since session 42 close. All §1 work is **uncommitted** on `main`. `git status` shows:
  - Modified: `public/html/profile.html`, `src/app/campus/campus-home.tsx`, `src/app/api/feed/route.ts`, `src/app/api/me/publish-post/route.ts`, `src/app/api/clips/[id]/view-url/route.ts`, `src/app/globals.css`
  - New: `src/app/api/search/route.ts`
  - New (per-machine, not in repo): `.claude/skills/ui-ux-pro-max/` (from `uipro init` — Claude Code skill)
- `npx tsc --noEmit` clean.
- `npx eslint src/app/campus/campus-home.tsx` clean except for one pre-existing warning (`'GlassCard' is defined but never used`).
- **Migrations** — none this session. The previous session's `20260509100000_message_delete_and_clear` is still the latest on prod.

---

## 3) Known issues / debt at end of session

### Carried forward from session 42

- **Mobile responsive sweep (#36)** — still untested at 375 / 414. Now also covers the Clips Reel view (which has explicit viewport math), the Posts/Clips toggle pills, and the campus search dropdown.
- **Notifications panel (#29)** — still no first-class surface; covered partially by the Otto side panel on `/network`.
- **Otto reminder system (#28)** — not built.
- **Custom domain (#35)** — note: site is now served from `connectvibe.app` per user observation, but Privacy + Terms still reference `vibe-app.vercel.app` — needs swap.
- **Discover Browse + Departments views (#30, #31)** — empty stubs.
- **localStorage migration (#8)** — carry-over.

### New / surfaced this session

- **No batch backfill for old clip thumbnails.** Clips published before session 42's `capturePosterFrame` fix render with the (now deterministic) gradient fallback. If we want real posters for them, would need a server-side ffmpeg job that signs each clip, extracts frame 0.1s, uploads to the profiles bucket, and stamps `media_thumbnail_url`. Not built.
- **In-app video editing (trim, text overlay, filters, music)** — discussed mid-session. Realistic to ship trim + text overlay (~3-5 days) on web. TikTok-level filters/AR effects = native app territory. **Punted to the mobile build.**
- **Composer aspect-ratio probe is best-effort.** Browsers can refuse to decode `quicktime`/`mov` metadata; in that case duration/dims come back null and we default to "clip" mode. If a user uploads a horizontal `.mov` from desktop, they may need to manually toggle to "Video post". Probably fine for v1 — flag if it surfaces.
- **Reels view doesn't have keyboard nav (↑/↓ to switch clips, space to pause, M to mute).** User declined this for now ("just two of the four polish items"). Easy to add later.
- **The big remaining product list from mid-session** — restated here for the next session:
  - Landing page rewrite (Otto as tour guide, **selected as next pickup**)
  - Dedicated Otto page (#28 reminder system + a real surface)
  - First-class Notifications panel (#29)
  - Campus map cleanup + search bar in the map
  - **Major dropdown** (currently free-text → bubble explosion on campus map; switch to preset list)
  - **Onboarding name lock** (don't let users rename Otto)

---

## 4) Stage 7 plan — what's left

| # | Item | Notes |
|---|---|---|
| 8 | localStorage migration | In-progress carry-over |
| 28 | Otto reminder system + dedicated Otto page | Engagement |
| 29 | First-class Notifications panel | Engagement |
| 30 | Discover Browse view | Discoverability |
| 31 | Discover Departments view | Discoverability |
| 35 | Custom domain + swap docs to it | `connectvibe.app` is live; legal pages still say `vibe-app.vercel.app` |
| 36 | Mobile-responsive sweep on every page | Launch blocker |
| 38 | Polish + QA + final deploy | The launch |
| — | **Landing page rewrite** | **Next session pickup** |
| — | Major dropdown + onboarding name lock | Quick wins |
| — | Campus map cleanup + map search | Discoverability |

Done this session: search wiring (covers both items from the previous session's "carried forward" list), Reels-style Clips experience (new product feature), post-with-video flow (new product feature), tooling install (enablement for next session).

---

## 5) Landing page rewrite — design brief for next pickup

### The concept

Frame the landing as **Otto giving the visitor a tour**. He's the centerpiece. The current landing positions Otto as a "marketing agent," which overpromises — for now he's a notifications + metrics tool, but he has a future as a real AI agent. The tour framing lets us hint at that future without lying about today.

### The narrative (5 acts)

1. **Otto introduces himself** — black/cream cosmos, Otto's orb breathing dead-center. Typewriter line: *"Hey. I'm Otto."*
2. **Otto teases the value** — second line types in: *"Your campus has a pulse. Want to feel it?"*
3. **Otto expands into rings** — three concentric orbital rings spiral outward from him. Each ring is a "form":
   - **Pulse** (inner, coral) — trending now, campus metrics
   - **Calendar** (middle, gold) — events, RSVPs
   - **Connect** (outer, sand violet) — people, mutual orgs
4. **Visitor picks an orbit** — clicks a ring, camera dollies into it. The chosen orbit fills the foreground with a real-data peek (e.g. "#midterms · 142 posts this hour"). Other orbits fade.
5. **CTA** — single coral pill: *"Step inside"* → `/auth/login`.

### Visual DNA (must match existing app)

- Cream + charcoal + coral (#FF5C35) + sand violet (#7B5FE0) palette
- Fraunces serif (display) + DM Sans (body)
- Liquid-glass surfaces (frosted backdrop blur)
- Otto's existing orb keyframes (`vibe-orb-pulse-core`, `vibe-orb-spin`, `vibe-orb-ring-breathe` — already in [globals.css](src/app/globals.css))

### Prompts the user prepared

The user wants to use the newly-installed tooling to ship this. Pre-baked prompts (also in the chat history):

- **Stitch full-page mockup**: see "Phase A" of the user-saved prompt block.
- **21st.dev `/ui` per-component**: typewriter sequence, OrbitalRingSystem (3 SVG rings + central orb), CinematicDolly transition, CampusPulsePreview card.
- **Nano Banana `/generate`**: Otto-Pulse, Otto-Calendar, Otto-Connect — three 1024×1024 cosmic-style images of Otto's forms (for inside-the-orbit imagery, if we want photographic feel over pure SVG).
- **UI UX Pro Max**: auto-triggers; just say "build the landing page rewrite — Otto tour guide concept" and the skill picks the right palette/motion/templates.

### Files to read first

- `src/components/landing/` — current landing
- `src/app/globals.css` lines 126-148 — Otto orb keyframes (reuse, don't rewrite)
- `public/html/_otto.js` — legacy Otto orb (for visual reference + breathing/orbit values)
- `src/components/network/OttoCorner.tsx` — React port of Otto's orb (the 52px corner version). The landing's Otto is the same character at a larger size + with the orbit rings extended outward.

---

## 6) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-11-session-43-search-clips-reel-post-video.md
and start the landing page rewrite per §5. Use UI UX Pro Max (auto-trigger),
21st.dev Magic for components (/ui ...), and Nano Banana for Otto's form
imagery (/generate via gemini). Stitch is available for a full-page mockup
if useful.
```

**Before pickup, run:**

```bash
git status   # confirm session 43 work is still uncommitted
npx tsc --noEmit 2>&1 | head -10
npx eslint src/app src/lib src/components 2>&1 | tail -20
```

Also confirm the new tools loaded after the Claude Code restart:
- 21st.dev MCP should show up in the MCP server list — try `/ui hello` to ping it.
- UI UX Pro Max should auto-trigger on UI/UX prompts (look for it in the skills list).

Dev server is on port 3000.

---

## 7) Key files touched / created this session

### New
- `src/app/api/search/route.ts` — unified people/orgs/events search
- `.claude/skills/ui-ux-pro-max/` — UI UX Pro Max skill files (machine-local, in repo via `uipro init`)

### Modified
- `src/app/campus/campus-home.tsx` — major changes:
  - `CampusSearchBar` + `CampusSearchBarInner` (with click-outside, scroll-aware coords, right-anchored dropdown)
  - `FeedTabBody` mode state (`posts` vs `clips`) + `FeedModeToggle` pills
  - `ClipsReel` + `ClipsReelInner` (scroll-snap container, IO root)
  - `ClipReelCard` (9:16 viewport-sized, signed URL fetch, IO-driven autoplay, like/comment/repost/share + double-tap, progress bar, unmute hint)
  - `ClipCommentsSheet` (bottom-sheet overlay wrapping `CommentsDrawer`)
  - `FeedRow` — branches on `media_kind` for image vs video posts
  - `FeedComposer` — video classification toggle (clip vs post-video)
  - `capturePosterFrame` — extended to return width/height
  - `SoundOnIcon` / `SoundOffIcon` (replaces emoji)
- `src/app/api/feed/route.ts` — added `media_kind` derivation per post
- `src/app/api/me/publish-post/route.ts` — accepts `video_object_key` + `duration_sec`
- `src/app/api/clips/[id]/view-url/route.ts` — allows `type='post'` rows with `clips/` keys
- `src/app/globals.css` — Otto keyframes preserved; brief `clip-heart-burst` keyframe added and then removed per user feedback
- `public/html/profile.html` — `/api/search` wiring, recently-searched × remove, `autocomplete="off"`, `_clipFallbackGradient(id)` helper, used in both hydration paths

### Per-machine (not in repo)
- `~/.gemini/extensions/Stitch/` (v0.1.4)
- `~/.gemini/extensions/nanobanana/` (v1.0.12, manual install)
- 21st.dev MCP entry in Claude Code's global config
- Global `npm` installs: `@google/gemini-cli`, `uipro-cli`

---

## 8) Deploy state — NOT YET ON PRODUCTION

Everything in §1 is **uncommitted on `main` locally.** Nothing has shipped to `connectvibe.app`. A clean commit + push at the start of the next session (or now) will trigger Vercel auto-deploy.

Sanity checks to run after deploy:

- `/campus` Feed tab: Posts/Clips toggle visible, Clips view renders 9:16 cards with scroll-snap, like/comment/repost/share all work, comment bottom-sheet opens, video pauses while open, mute toggle uses SVG icons, progress bar tracks, "tap to unmute" hint shows on first card.
- Composer: upload a vertical short video → auto-classified as Clip → publishes via `/api/me/publish-clip` and shows in Reels. Upload a horizontal video → auto-classified as Video post → publishes via `/api/me/publish-post` with `video_object_key` and renders inline in the Posts column with `<video controls>`.
- `/campus` search bar: type a few chars, get People / Clubs & Orgs / Events sections. Click each → navigates to the right place.
- `/profile/<handle>` search bar (top nav): same three sections, recently-searched × button works, browser autocomplete doesn't show up.

The next handoff should pick up at **§5 landing page rewrite**.
