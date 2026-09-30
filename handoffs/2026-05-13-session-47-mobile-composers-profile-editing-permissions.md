# Session 47 handoff — mobile composers, profile editing, permissions UX (2026-05-13)

Massive session. ~55 commits across one day. Three big pushes layered
on top of each other: (1) the **profile-editing surface** filled in
end-to-end on both phones and desktop — major/year, avatar/banner,
handle, work-experience ordering; (2) **mobile composers** for posts
AND a TikTok-style clip recorder built from scratch; (3) a long tail
of fixes — banner blur, cropper safe-area guides, headline chip
de-cluttering, work-experience sort + drag, the blank-profile bug at
the very end.

Desktop got new behavior too — major picker, headline derivation
flip, drag-to-reorder, cover-fade removal — but everything is
strictly additive. No desktop regressions.

The session ended with the user explicitly flagging the **clip
composer's record-button placement, camera zoom, and overall
"jankiness"** as the next thing to clean up. Pick up there.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary, did every commit below. |
| **`[You]`** | Human — product direction, on-phone QA, every "still doesn't work" report that forced a different angle. |

---

## 1) What shipped

### Phase A — Loose-end cleanup (early session)

Stuff that came in before the bigger pushes started. Mostly damage
control from prior sessions.

- `fc1898a` **Campus feed showed only the viewer's own posts.** Root cause: per-school filter fired even when the viewer's `school` was empty string (most users). Dropped the per-school filter entirely; everyone reads from the global pool. Side benefit: API now also returns `viewerId` so the kebab Delete menu can check ownership.
- `187c172` **Resume PDF didn't load on return visits.** `_rasterizePdf` only handled `data:` URIs. Branched on URL scheme — `data:` → fetch + arrayBuffer, `https:` → pass directly to `pdfjs.getDocument({ url })`.
- `6c3106b` + `6f9c99c` **Block system rebuild.** POST `/api/me/block` now tears down both-direction connections (deletes the `connections` row regardless of who's `follower_id`), returns `removed_connection: true` so the client can update its state. New `BlockedByTargetView` on `/profile/<handle>` with TWO states: target blocked viewer ("@<name> isn't available right now"), viewer blocked target ("You blocked @<name>"). RLS migration `20260515000000_blocks_select_either_party` broadens the SELECT policy from `blocker_id = auth.uid()` to `blocker_id OR blocked_id` so the blocked person can also see the row and the UI can read it.
- `20847dc` **Recently-searched showed stale "Connect back" labels** when a connection had been added since the search. New `POST /api/me/follow-states` accepts a batch of handles and returns per-handle `{ following, follower, connected }`. profile.html's search dropdown now hits this on render to refresh chips.
- `4bc1f85` **Resume zoom + edit-mode hint banner.** `Ctrl+wheel` on desktop / pinch on mobile drives a `--doc-zoom` CSS var that scales the doc viewer. Owner-only banner above the viewer in edit mode tells them how to redact ("Click + drag a bar to black out content. Click a bar to resize, drag to move.")

### Phase B — Campus feed visual revamp

The right Otto rail collapsed into a horizontal strip at the top of
the feed, freeing the feed itself for full-width media.

- `92082a7` **Horizontal Otto strip** above the feed instead of the vertical right panel. Single unified card with **Heads up** + **Trending** sections, separator between, custom-coloured glow around it. **Custom megaphone + fire SVG icons** (user explicitly rejected emoji). Megaphone for heads-up, fire for trending — coloured fill (coral / orange-yellow) per icon, no monochrome.
- `48a3c0f` **Clickable author identity on feed rows.** Avatar, name, handle all link to `/profile/<handle>`. Was a dead row before.
- `13be09a` + `94e4915` + `c038327` + `cd87d9d` + `e76df2e` + `1bde138` **@-mention system with Otto-routed notifications.** Mentioning a connected user pops a live toast on the recipient's screen; non-connected users get a queued notification in Otto's panel. Notification body links route to `/campus?post=<id>` (the post in the feed), avatar/handle in the notification card route to `/profile/<handle>`. Counted unread badge on the Otto corner. **Orb morph: on unread mention, the orb body switches to a thinking+alert hybrid** — single outer orbit with 3 nodes, cream-inset core, persistent 52→64px expand until the user opens the panel.
- `e35e2d6` **Delete post from feed kebab.** Owner-only 3-dot menu on each feed row. DELETE `/api/posts/[id]` reused (already cleans up R2 storage on clips).

### Phase C — Admin + events polish

- `35c2565` **Admin page back-nav.** `/admin` had no way out — added a header row with a back chevron and "← Back to Vibe" label.
- `576dc8f` **"+ Create event" button was invisible** (white text on cream). Replaced styling with a solid coral gradient + white text.
- `ce38db5` **Event modal cropped on mobile.** Date inputs were `flex: 1` inside a fixed 320px wrapper, ended up 80px each with text-clipping. Bumped wrapper to `min(420px, 100vw - 32px)`, gave each date input `min-width: 130px`.

### Phase D — Campus banner + map

- `e3eb144` + `ddb547f` **Live "on Vibe" + "active now" stats** in the campus banner. Replaced the hardcoded 45,000 / 2,847 with two new endpoints: `/api/me/heartbeat` (POSTed every 30s by the campus shell, updates `users.last_active_at`), `/api/stats/campus` (returns `totalUsers` + `activeNow` counting last-5-min). City flipped from Bloomington to Indianapolis.
- `9ab90e6` → `721e484` **Campus map rebuild** (8 commits across the session). The demo "shimmery circles" became a real living map:
  - Schools cluster majors into 12 neighborhoods (Kelley, Luddy, Engineering+Tech, Media, Liberal, Science, Herron, Public Health, Nursing, Med, O'Neill, Education, plus an Other catch-all). Taxonomy is **IU Indianapolis** — Herron not Eskenazi, IU School of Medicine is prominent, Liberal Arts + Science are split, Engineering & Tech is its own school. Not Bloomington.
  - `MAJOR_TO_SCHOOL` Record maps lowercased major strings → school id. `schoolForMajor(name)` is the lookup. Both live in `src/lib/iu/majors.ts` now (extracted later in the session so the profile editor + the map share one source).
  - **Adaptive spacing.** Wedge math (`2·r·sin(wedge/2) ≥ clusterA + clusterB + padding`) so two adjacent clusters get pushed apart proportional to their sizes. Bubble radius is a function of major count (`36 + min(30, total * 0.4)` — clamped 36-66px). Big majors don't dwarf small ones; small majors don't disappear.
  - **Search-to-jump.** Type a major name → camera pans + zooms to that bubble. Reuses the wheel-zoom transform.
  - **Wheel zoom.** Cursor-anchored, `exp(-deltaY * 0.0015)` per notch, 0.5-2.5× range. `+/−` buttons added then removed at user request.
  - **Living motion.** Spring entrance on first render, idle drift (subtle sine-wave x/y per bubble), faint connection lines from "you are here" to nearby bubbles, animated stars in the gaps.
  - **Athletics ring dropped.** Built it, then user pulled it: "no coach is going to actually maintain this." Reverted.

### Phase E — Mobile profile-editing fill-in

The pencil-edit mode on mobile only covered name / tagline / bio /
location at session start. Filled it out + connected to the new
upload pipelines.

- `01639ce` **Inline pencil edit** for name, tagline, bio, vibe tags, location. Tap pencil → fields become inputs, Save/Cancel pill bar appears in the cover top-right. Effective-draft pattern (`draft ?? seedDraftFromUser(user)`) avoids the React 19 setState-in-effect lint and keeps the no-changes case clean. EditableVibeTags is a chip list with `+ Add` button + per-chip `×`.
- `fdd6eea` + many follow-ups → **Avatar + banner upload** in edit mode. Uses the existing `ImageCropperModal` (aspect-locked 1:1 / 3:1, `outputMaxSize` 768/2400 → later 3200). Multipart upload via `/api/me/profile-upload?kind=avatar|banner` → URL written to `users.avatar_url` / `users.banner_url` via `/api/me/profile-sync`. Cropper viewport now responsive (max 540, min 220, `window.innerWidth - 76`) so it doesn't overflow narrow phones.
- `fdd6eea` **Handle change in Settings.** New HandleCard with 14-day cooldown countdown + live availability check (debounced fetch to `/api/me/handle?check=...`). Uses `useMemo` for synchronous validation, `useEffect` only for the network call (the React 19 purity rules required pulling `Date.now()` into `useState`'s lazy init and gating setState behind effects). Settings bootstrap (`/api/settings/page.tsx`) now selects `handle_changed_at` and passes it to the client.
- `5f12f28` **Banner output bumped to 3200 / q0.96.** Was 2400 / q0.92. Desktop profile cover is full-bleed body width (1440-1920 CSS pixels on common monitors, 2880-3840 on retina). 2400 forced the browser to upscale; 3200 gives downscale-only headroom.
- `65762b9` + `3af3333` + `cac7f2a` **Cropper safe-area guides.** Inside the crop frame, two dashed outlines show what each surface will actually display: **Desktop** (6:1, top + bottom of the 3:1 crop get clipped) in coral, **Phone** (~2:1, left + right get clipped) in lavender. Legend chips moved from inside the rectangles to a row below the zoom slider after the Phone-guide label clipped against the viewport edge. Mirrored into the vanilla `_imageCropper.js` so desktop's banner upload gets them too.
- `9ccf675` + `7ecb500` **Cream fade overlay killed** on the banner. Mobile rendered it unconditionally; desktop hid it only when a real cover photo was set. Both now `display:none` always — user wanted zero white hue on uploads OR gradients.
- `4aada65` **Avatar/banner persistence verification.** User reported uploads didn't persist on refresh. Storage object count showed 10+ uploads but DB column stayed on the first one. Added a post-sync verification: re-fetch bootstrap, compare returned URL against what was sent; throw `"Profile photo / Cover photo didn't save. Please try again."` if they diverge. The real fix turned out to be in `uploadCroppedBlob` not the API — but the verification stayed in.
- `26fa59c` → `f27995a` → `6e45fd4` → `b9adbab` → `6abcfbb` **Major + year inline edit on mobile.** Editor surfaces `/api/me/profile-bootstrap` major/year (via `vibeUser.major` / `vibeUser.year` passthrough). `EditDraft` gets `major` (string) + `year` (1-12 \| null). `commitEdit` POSTs them. `/api/me/profile-sync` accepts them and **clears `users.headline`** when either changes — the headline column was overriding the derived "Major · Year N" string with stale text. `buildVibeUserV1FromProfile` flipped to prefer derived over stored (was the inverse), since no UI writes a custom headline anymore. **Department dropped from the chip** — was rendering "accounting · Kelley · Year 2"; now just "Marketing · Year 2".
- `f27995a` **Major picker uses IU taxonomy.** Free text was wrong because (a) it produced data the campus map couldn't reliably group ("CS" vs "Computer Science" land in different halos), and (b) onboarding had a school-specific list the editor wasn't honoring. Extracted `IU_SCHOOLS` / `IU_SCHOOL_BY_ID` / `MAJOR_TO_SCHOOL` / `schoolForMajor` / `IU_MAJORS_BY_SCHOOL` into `src/lib/iu/majors.ts`. `IU_MAJORS_BY_SCHOOL` is Title-Cased + grouped per school, purpose-built for `<optgroup>` rendering. ProfileMobile dropdown uses it. Legacy lowercase majors get prepended as a top-of-list option so the saved value doesn't silently clear.
- `1b527ac` **Desktop major picker mirrors mobile.** Vanilla mirror of the taxonomy in `public/html/_iu-majors.js` (the legacy page can't import TS). Role meta-item label flipped Role → Major. Display span shows the derived headline; in edit-mode the same item hosts a `<select>` (grouped by school) + a Year select (1-5 + Grad). CSS toggle on `body.edit-mode` flips visibility. `buildProfileSyncPayload` now ships `major` + `year`. After server round-trip `hydrateProfileFields(nu)` refreshes the chip so the new headline appears immediately without a page nav.
- `19681c2` **Darker meta labels.** "LOCATION / MAJOR / WEB" were the same `--muted` tan as the values after them; labels and values blurred together. New `.meta-label` class with `#3F3D3A`.

### Phase F — Mobile post composer

The biggest new component of the session.

- `26778b9` **Initial build: PostComposerMobile.** Full-viewport sheet via `createPortal(document.body)` with text + image (cropper) + video (R2 presigned upload) + clip (publish-clip endpoint) — full parity with desktop's `FeedComposer` at this point. Shared helpers extracted into `src/lib/composer/helpers.ts`: `capturePosterFrame`, `extractHashtags`, `classifyVideo`, `bindMentionPicker`, `VideoMode` type. campus-home.tsx refactored to import from the helpers module — ~85 lines of duplicated upload math gone. **FAB on ProfileMobile** (bottom-right, coral gradient) launches the sheet.
- `55a45db` **FAB lifted above the tabbar.** Was at `bottom: 22 + safe-area`, sat behind the ~60px tabbar. Now `bottom: 78 + safe-area`.
- `d0a1794` **Smooth slide-up entrance** + delayed autofocus. Sheet was popping in instantly ("choppy, slideshow-y"). 240ms slide-up + fade with `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (≈UIKit). Autofocus deferred until `ENTER_DURATION + 20ms` so the iOS keyboard doesn't race the sheet's own paint.
- `18efe63` **Circular reveal from FAB instead of slide-up.** User asked for "expand and engulf the page." ProfileMobile captures the FAB's `getBoundingClientRect()` at click time, passes the center coords to the composer as `origin: {x, y}`. Composer drops them onto the sheet via `--vibe-composer-x` / `--vibe-composer-y` CSS variables. `clip-path: circle(R at X Y)` animates radius from 28px (FAB radius) → 150% (covers diagonal). Reverse on close. Cubic-bezier `(0.16, 1, 0.3, 1)` for entrance, `(0.55, 0.06, 0.68, 0.19)` for exit.
- `a4db6d5` **Composer reveal slowed** 360→460ms enter, 240→300ms exit. Plus delete-from-viewer kebab menus on PostViewerMobile + ClipViewerMobile (3-dot button top-right of the header, native `window.confirm`, hits the existing `DELETE /api/posts/[id]`).
- `fd62c35` → `3a06d0d` → `ebbc3a2` **Photo/Video button visibility — three attempts.** User repeatedly reported "no button at all":
  1. First: sheet was sized to layout viewport (`inset: 0` ≈ 100vh) which iOS doesn't shrink with the keyboard. Switched to `100dvh`. Didn't fix it.
  2. Second: moved the button from a bottom-anchored bar into the scrollable body, below the textarea. Didn't fix it.
  3. Third (worked): pinned the button in its OWN top-anchored toolbar row directly under the header — not inside the scrolling body at all. Coral-tinted pill ("Photo / Video / Clip"), photo-frame icon. File input swapped from `display: none` to `position: absolute + opacity: 0 + 1×1px` because some iOS Safari builds refuse to fire `.click()` on truly display-none inputs.
- `ee594f9` **Clip path dropped from the post composer.** User: "let's remove the / clip option, keep photo/video, and make a similar tiktok post layout and composer for clips" — drag clip into its own surface. Stripped `VideoMode`, the toggle pills, the `publish-clip` branch. All videos in this composer go through `publish-post` as horizontal video posts now. Label "Photo / Video / Clip" → "Photo / Video".

### Phase G — TikTok-style clip composer

The major new build.

- `b68b9bf` **ClipComposerMobile.tsx — v1 ships.** Full-viewport vertical 9:16 sheet, launched from the FAB when the Clips tab is active (`composerOpen && tab === "clips"` swaps `PostComposerMobile` → `ClipComposerMobile`):
  - **Permission flow**: "Enable camera" CTA → `getUserMedia({ video: { facingMode, width: ideal 720, height: ideal 1280 }, audio: true })`. We don't request on mount because iOS Safari needs a real user gesture to even ask.
  - **Live 9:16 preview**, front camera mirrored (`transform: scaleX(-1)`), back unmirrored. Flip button top-right.
  - **MediaRecorder** with mp4 → webm-vp9 → webm-vp8 mime-type cascade. Picks the first one the browser advertises.
  - **mm:ss / 2:00 countdown pill** top-center, red + pulse-dot while recording, neutral while paused.
  - **Big record button** center-bottom — two interaction modes: **tap to toggle** (press-release within 140ms = "start", next tap = "stop") AND **hold to record** (press-release after 140ms = "stop"). Same handler distinguishes via elapsed-since-mousedown threshold.
  - **Pause + resume** via `MediaRecorder.pause()` / `.resume()`. Chunks recorded between them are appended to the same blob, so multi-segment clips concatenate naturally on stop.
  - **120s hard cap** matches `publish-clip` server validation. Auto-stops at the cap.
  - **Finish ✓** button appears at the bottom-right once you've captured >800ms — independent of pause/recording state so user can finish from either.
  - **Review screen**: loop-playback of the captured blob, Retake / Next.
  - **Caption screen**: vertical thumb + 2000-char textarea with `@mention` + `#hashtag` picker bound (same `bindMentionPicker` as posts).
  - **Publish flow** reuses the existing pipeline — POST `/api/me/clip-upload-url` → PUT to R2 → POST `/api/me/profile-upload?kind=poster` → POST `/api/me/publish-clip`. **No new server code needed.**
  - **Animations** share the same `vibeComposerExpand` / `vibeComposerCollapse` keyframes as PostComposerMobile so both grow out of the FAB consistently.
- `6d11058` **Bottom tabbar hidden while either composer is open.** Tabbar z-index 9988 was painting over the sheets at z-index 1100 — most noticeable on the clip composer because the record button is centered-bottom. Both composers toggle `body.vibe-composer-open` on mount/unmount; globals.css adds `display: none !important` on the tabbar when the class is present. Cleaner than bumping z-index — removes the bar from tab order + screen reader output while the sheet is up.
- `889e14e` **Black-screen bug + Instagram-style permission UI.** User: "every time I tried to compose a clip my screen would go black." Two bugs converging:
  - The pre-stream state rendered BOTH `renderRecordingChrome()` (which has a `<video ref={previewVideoRef}>`) AND `renderIntro()` (which ALSO had its own `<video ref={previewVideoRef}>`). Two video elements competing for the same ref, neither with `srcObject`, painted a black sheet OVER the intro overlay's buttons. Restructured the render switch — pre-stream renders the permission UI only; stream-live renders the chrome only. One `<video>` at a time.
  - Permission denied was setting a `permissionError` string but rendering nothing visible from it. Now switches to a dedicated **"Camera access is off"** screen (modeled on Instagram + TikTok): camera-with-red-slash icon, plain-English headline, numbered "How to fix it" panel — iOS gets "Settings → Safari → Camera + Microphone → Allow", other browsers get the lock-icon path — Not now / Try again CTAs (Try again re-fires `getUserMedia`, so a user who fixes it in iOS Settings and switches back can recover without closing the sheet). New `PermState` union (`asking | granted | denied | unsupported`) plus an `unsupported` screen for users hitting the composer in a webview without `getUserMedia` (LinkedIn / Instagram preview browser).

### Phase H — Work-experience sort + drag

The final stretch.

- `e51a4d6` **Sort work experience by date.** Display-time sort (desc), most-recent / current at top. Defensive parser: `"Present" / "Current" / "Now"` → top, `"Jan 2024"` → month/year key, `"Summer 2024"` → season-month, `"2023"` → end-of-year, unparseable → 0 (sinks). Stable sort: ties preserve input order. `src/lib/profile/work-experience.ts` adds `parseExperienceEndDateMs` + `sortWorkExperienceByRecency` (used by ProfileMobile's PortfolioPane). `public/html/profile.html` mirrors the parser in vanilla JS and sorts before the legacy render loop.
- `881ce2b` **Drag-to-reorder.** Pointer-event drag (works for mouse AND touch in one handler), visible only in edit mode, applied to both `.work-item` and `.current-item`:
  - 6-dot grip icon (`_DRAG_HANDLE_HTML` constant) injected into every dynamic template — `saveWork`, `saveCurrent`, and both bootstrap render loops.
  - `setupReorderable(listSelector, itemSelector, onChange)` uses event delegation on the list element so bootstrap rebuilds don't tear off the listener.
  - **Sort-vs-drag conflict resolution**: once the user drags the work list, we set `vibe_user_v1._workOrderManual = true` in localStorage. The bootstrap render checks the flag and skips the date-sort, trusting the stored array order. Current-projects has no auto-sort so it persists with no extra guard. Limitation: `_workOrderManual` is per-device.
- `d54b7fa` **Blank-page bug fix (end-of-session).** Adding the drag work blanked the profile page for any user with work / current data. Root cause: `const _DRAG_HANDLE_HTML` (and the new sort helpers) were declared with `const` BELOW the `(function initProfilePage(){})()` IIFE. The IIFE runs synchronously during script parsing; it calls `renderUserSections` which uses `${_DRAG_HANDLE_HTML}` in template literals. `const` declarations are in the temporal dead zone before their line is reached — `ReferenceError`, init crashes, `html.vibe-pre-paint` never gets removed, `.profile-wrap` stays at `opacity: 0`. Bug only surfaced for profiles with actual data — demo profiles never hit the templates, so it slipped past my testing. Fix: moved the const block above the IIFE.

---

## 2) Files touched (high-traffic)

| File | What |
|------|------|
| `src/components/mobile/ProfileMobile.tsx` | Inline pencil edit; avatar + banner upload; major + year edit; FAB; verification check; post + clip viewers wired with `canDelete + onDeleted`. |
| `src/components/mobile/PostComposerMobile.tsx` | New. Full-viewport sheet, circular reveal, top-anchored media toolbar, image cropper, video upload. |
| `src/components/mobile/ClipComposerMobile.tsx` | New. TikTok-style. Camera + MediaRecorder + pause/resume + 120s cap + review + caption + Instagram-style permission UX. |
| `src/components/mobile/PostViewerMobile.tsx` | Kebab Delete menu; canDelete + onDeleted props. |
| `src/components/mobile/ClipViewerMobile.tsx` | Same. |
| `src/components/ImageCropperModal.tsx` | Responsive viewport cap; safeAreaGuides prop (dashed outline + legend). |
| `src/app/campus/campus-home.tsx` | Otto strip; mention picker bind via shared helper; major taxonomy lifted out. |
| `src/app/api/me/profile-sync/route.ts` | Accepts major + year; clears stored headline when either changes. |
| `src/app/api/me/profile-bootstrap/route.ts` | Exposes major + year on vibeUser. |
| `src/lib/profile/build-vibe-user-v1.ts` | Headline derivation flipped (derived wins); department dropped from chip. |
| `src/lib/profile/work-experience.ts` | New `parseExperienceEndDateMs` + `sortWorkExperienceByRecency`. |
| `src/lib/iu/majors.ts` | New. `IU_SCHOOLS`, `MAJOR_TO_SCHOOL`, `IU_MAJORS_BY_SCHOOL`, `schoolForMajor`. Shared by campus map + profile editor. |
| `src/lib/composer/helpers.ts` | New. `capturePosterFrame`, `extractHashtags`, `classifyVideo`, `bindMentionPicker`. |
| `public/html/profile.html` | Major dropdown (vanilla); drag handle markup + setupReorderable; cream-fade kill; sort + drag helpers (positioned ABOVE the IIFE). |
| `public/html/_imageCropper.js` | Safe-area guides + legend (vanilla mirror). |
| `public/html/_iu-majors.js` | New. Vanilla taxonomy mirror. |
| `public/html/_mentionPicker.js` | Unchanged — composer just binds it via the shared helper now. |
| `src/app/api/me/feed/route.ts` | Per-school filter dropped; returns `viewerId`. |
| `src/app/api/me/block/route.ts` | Removes connection both directions; returns `removed_connection`. |
| `src/app/api/users/[handle]/bootstrap/route.ts` | One OR-query for block-either-way; returns `_blockedByTarget` + `_viewerHasBlocked`. |
| `supabase/migrations/20260515000000_blocks_select_either_party.sql` | Applied. RLS broadened. |
| `supabase/migrations/20260515100000_notifications_mention_type.sql` | Applied. New mention notification type. |

---

## 3) Known issues going into Session 48

These are the user's explicit asks at end-of-session, in order:

### Clip composer cleanup (top priority)

User quote: *"I want to clean up the vibe composer, it seems janky
and slow. The record button isn't bottom centered, the camera seems
randomly zoomed in, so many things to work on."*

Specific things to investigate:

1. **Record button not bottom-centered.** Current layout uses a flex
   row at `bottom: calc(env(safe-area-inset-bottom) + 28px)` with
   `justifyContent: center` and `gap: 32`. The PAUSE/RESUME button
   sits to the LEFT of the record, the FINISH ✓ to the RIGHT, but
   they only appear conditionally (`recording`/`paused` for pause;
   `elapsedMs > 800` for finish). When BOTH are absent (initial,
   never-recorded), the row has just the record button — but it stays
   left-aligned because we render placeholder spacers asymmetrically.
   Check `renderRecordingChrome` around the bottom-controls block.
2. **Camera "randomly zoomed in".** Two likely culprits:
   (a) `getUserMedia({ video: { width: ideal 720, height: ideal 1280 } })`
       lets the browser pick a track resolution; some iPhones default
       to a tighter FOV when 720×1280 doesn't match a native preset.
       Try `{ width: { ideal: 1080 }, height: { ideal: 1920 } }`
       (1080p portrait is native on iPhone) and / or drop the ideal
       hints entirely and just request `facingMode`.
   (b) The `<video>` element uses `objectFit: "cover"`. If the stream
       comes back wider than 9:16, `cover` crops the sides — looks
       like zoom. Switch to `contain` (letterbox) for a debugging
       pass, or compute the device viewport's aspect and ask
       getUserMedia for it.
3. **Jankiness during entrance/exit.** The clip-path circle reveal
   is GPU-cheap but the camera mounts at the same time the reveal
   plays. The first paint of the live video might be triggering a
   recomposite. Worth deferring the `videoEl.srcObject = stream`
   assignment until after the entrance animation lands.
4. **Two-finger pinch-zoom on the camera preview** would be a nice-to-have
   for parity with TikTok. Out of v1 scope; flag it if the user asks.

### Text-on-clip overlays (deferred from v1)

The very first ask for the clip composer included "add type text to
the video, all of that." V1 ships WITHOUT this because it needs
either (a) canvas-based video re-encoding in the browser (slow,
gnarly), or (b) a new DB column for overlay metadata + a renderer in
ClipViewerMobile (cleaner, but needs schema work). When you pick
this up, option (b) is the path:

- Migration: `posts.text_overlays jsonb null` (array of `{text, x, y, scale, rotation, color, font, startMs, endMs}` — 0-100 % coords like resume redactions).
- ClipComposerMobile review screen adds an "Aa" button → tap to add a draggable text node positioned on the video preview.
- ClipViewerMobile renders the same overlays positioned absolutely over the video element at playback.
- `publish-clip` accepts the array, sanitizer caps count + lengths.

### Work-experience drag on mobile

Currently desktop-only. Mobile has no edit UI for work experience
yet — when we add that (an "Edit experience" sheet probably), wire
`setupReorderable` and the `_workOrderManual` flag in the React
profile editor too. localStorage flag should move to a `users`
column (`work_order_manual boolean`) so the override syncs across
devices.

### Other open threads

- `_workOrderManual` lives in localStorage — per-device. Cross-device drag persistence needs a `users` column.
- Headline editing on desktop was removed implicitly when the Role field became a Major + Year picker. If we want users to set a custom headline, that's a separate field now.
- Mobile composer toolbar label is "Photo / Video" but it's actually only photo + horizontal video; clip lives in its own sheet. Worth thinking about whether the FAB should be a single button that asks "Photo / Video / Clip?" via an action sheet instead of switching behavior based on which profile tab is active. User chose tab-based for v1.
- The **black-screen race on permission denied** is fixed, but ClipComposerMobile still has plumbing around `permissionError` AND `permState` that could be simplified — only `permState` is consulted by the render switch now. Cleanup pass when touching it.

---

## 4) Build state at session end

- Branch: `main`, clean. All session-47 commits pushed to origin.
- TypeScript: `npx tsc --noEmit` clean.
- ESLint: only the pre-existing `GlassCard unused` warning in `campus-home.tsx`. Not mine.
- `npm run build` ran during session, ~30s. Succeeded.
- Vercel deploys: all 55+ commits pushed individually; deploys followed each push. Whether they all completed cleanly — user reported success on most. Last commit was a blank-page fix so verify before celebrating.

---

## 5) Pickup checklist for Session 48

1. **Read this handoff** — bottom of section 3 has the user's exact words on what's broken.
2. **Open the clip composer on your phone** (real device, not desktop emulation — MediaRecorder + getUserMedia behave differently).
3. **Center the record button**: empty out the conditional placeholders or use `justifyContent: space-between` with explicit blank spacers. Goal: record button always at horizontal center, pause to its left, finish to its right.
4. **Camera zoom**: try removing the `width / height: ideal` hints in `getUserMedia`. If the preview still looks tight, try `objectFit: contain` for a debug pass to confirm whether it's CSS or stream resolution.
5. **Defer `srcObject` assignment** to after the entrance animation completes — the video first-paint is probably the recomposite hitch the user is calling "janky."
6. **Smoke test the existing flows** (the blank-page fix went out at session end — verify a profile loads, work-experience displays sorted, drag still works).
7. **Then move to text-on-clip overlays** if there's time. Schema first, renderer second, editor third.

---

## 6) Commits

Chronological, oldest first:

```
fc1898a  fix(feed): show all posts when viewer has no school
187c172  fix(profile-resume): _rasterizePdf accepts HTTPS URLs
6c3106b  feat(safety): block tears down connections + blocked-by-target view
6f9c99c  fix(safety): make blocks visible to either party + add blocker-side view
20847dc  feat(search): refresh stale rel state on Recently searched
4bc1f85  feat(resume): zoom controls + edit-mode hint banner
92082a7  feat(campus-feed): unified Otto strip + full-width feed
85f8c4e  feat(onboarding-tour): call out the LeftNav profile chip + avatar/banner
48a3c0f  feat(feed): make author avatar / name / handle clickable
5941fc5  feat(left-nav): coral corner bleeds + cursor-tracking glow
d42c5a9  chore(campus-banner): remove the animated sheen sweep
35c2565  feat(admin): explicit back-out nav row at the top of /admin
b79ea85  copy(otto): friendlier hero voice line
13be09a  feat(mentions): @-mentions on posts + live Otto toast for connections
94e4915  feat(otto): counted unread badge + route mentions to author's post
c038327  feat(mentions): land on the post in feed + orb pop on new notif
e35e2d6  feat(feed): delete-post kebab menu on owner's rows
e76df2e  feat(otto): morph corner orb into thinking+alert on unread mention
1bde138  fix(otto): drop the inner orbit on alert state — it crowded the sun
cd87d9d  feat(otto): persistent orb expand when an unread mention is sitting
576dc8f  fix(events): make "+ Create event" button actually visible
ce38db5  fix(events-modal): give date inputs room to breathe
e3eb144  feat(campus-banner): live "on Vibe" + "active now" stats
ddb547f  copy(campus-banner): switch city to Indianapolis, IN
9ab90e6  feat(campus-map): living cluster — spring entrance, idle drift, lines, stars
0fe8a3b  feat(campus-map): group majors into IU school neighborhoods
14ea509  fix(campus-map): school labels stop getting covered by bubbles
c33c197  feat(campus-map): adaptive school spacing, bubble size scales with total
2b6c553  feat(campus-map): zoom in / out with wheel + buttons
09cdbb8  revert(campus-map): drop the +/- zoom buttons
118fb52  feat(campus-map): search-to-jump + Athletic Center + tighter header
fb83247  fix(campus-map): IU Indianapolis school taxonomy, not Bloomington
721e484  revert(campus-map): pull athletics — no maintainer story
294007b  feat(profile-mobile): post + clip viewers on mobile
7bf8756  feat(profile-mobile): text-only posts get a text tile, not a fake thumbnail
b0a29ad  feat(profile-mobile): single-column post-feed instead of grid
6402bcc  feat(profile-mobile): liquid-glass treatment on post feed cards
15e2446  fix(profile-mobile): darker glass tint on post cards for more contrast
bd4cd92  fix(profile-mobile): bump post card glass tint a notch darker
3dd0637  fix(profile-mobile): dial back post card tint — midpoint between light + dark
dc4518a  fix(profile-mobile): lighten post card glass — 0.06 → 0.10
d8f8446  fix(profile-mobile): light glass fill + charcoal hairline border
cd97784  feat(profile-mobile): lavender hairline on post cards
01639ce  feat(profile-mobile): inline pencil edit — name, tagline, bio, vibe tags, location
fdd6eea  feat(profile-mobile + settings): avatar/banner upload + handle card
2401cb6  fix(profile-mobile): re-upload works + cropper guarantees desktop quality
d90bac6  fix(cropper): mobile viewport overflow + bigger banner output
4aada65  fix(profile-mobile): verify avatar/banner write actually landed
9ccf675  fix(profile-mobile): drop cream fade on banner + show size hint upfront
7ecb500  fix(profile-desktop): kill cream fade on banner gradient too
5f12f28  fix(profile-mobile): bump banner cropper output to 3200px + q0.96
65762b9  feat(cropper): show Desktop + Phone safe-area guides for banner
3af3333  feat(cropper): safe-area guides on desktop + fix mobile label clipping
cac7f2a  fix(cropper): move guide labels to a legend below the zoom slider
26fa59c  feat(profile-mobile): edit major + year inline
f27995a  fix(profile-mobile): major picker uses IU Indianapolis taxonomy
693ced1  fix(profile-mobile): surface silent major/year save failures
6e45fd4  fix(profile-sync): clear stored headline when major or year changes
1b527ac  feat(profile-desktop): major + year picker matches mobile + campus map
6abcfbb  fix(profile): drop department from headline chip — major + year only
b9adbab  fix(profile): prefer derived headline over stored — kills "Kelley" leak
19681c2  fix(profile-desktop): darken meta-item labels for contrast
26778b9  feat(mobile): post composer sheet — text + image + video + clip
55a45db  fix(profile-mobile): lift compose FAB above the bottom tabbar
d0a1794  fix(composer-mobile): smooth slide-up entrance + delayed autofocus
18efe63  feat(composer-mobile): circular reveal from FAB instead of slide-up
a4db6d5  feat(mobile): delete posts + clips from viewer + slower composer reveal
fd62c35  fix(composer-mobile): keyboard hid Photo/Video — switch sheet to 100dvh
3a06d0d  fix(composer-mobile): move attach button into scrollable body
ebbc3a2  fix(composer-mobile): pin media toolbar directly under top header
ee594f9  fix(composer-mobile): drop Clip path — Photo/Video only
b68b9bf  feat(mobile): TikTok-style clip composer (v1)
6d11058  fix(composer-mobile): hide bottom tabbar while a composer is open
889e14e  fix(clip-composer): black-screen bug + Instagram-style permission UI
e51a4d6  feat(profile): sort work experience by date — most recent at top
881ce2b  feat(profile-desktop): drag-to-reorder work experience + current projects
d54b7fa  fix(profile-desktop): blank page on load — TDZ on hoisted helpers
```
