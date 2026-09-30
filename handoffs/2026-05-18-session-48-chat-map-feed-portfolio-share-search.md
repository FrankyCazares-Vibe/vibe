# Session 48 handoff — chat polish, map rebuild, feed engagement, portfolio editing end-to-end, share + deep links, search (2026-05-14 → 2026-05-18)

Five-day session. ~40 commits across six broad threads, layered:

1. **Campus chat mobile** — Discord-style drill-down (orgs → channels → conversation), Otto strip collapse animation on chat/map/orgs, channel reactions, dark-mode chat chrome per org backdrop, sender chips, conversation stacking + scroll fixes on desktop.
2. **Mobile campus map** — native rebuild of the social map (school-clustered bubbles, pinch-zoom + pan, vaul zone sheet). Tightened cluster math so zones sit close to "you."
3. **Feed engagement + ranking** — like / repost / save + comment as a 3-dot menu, double-tap-to-like, friend-repost social-proof pill ("X and N others reposted this"), Tier-1 ranking algorithm with engagement decay + follow boost + diversity cap.
4. **Profile portfolio editing on mobile** — work experience, "Working on," and resume docs are fully editable. Sheets with sticky save, inline drag-to-reorder on the read pane in edit mode, multi-doc resume (`users.resume_docs` jsonb), per-doc redaction bars + mobile draw editor, tap-to-upload logos on both viewports.
5. **`/posts/[id]` page + share plumbing** — real share-link target with OG meta, in-app "Send to chats" picker on every 3-dot menu, notifications now route to the post viewer directly.
6. **Profile mobile search bar** — magnifying-glass in the floating actions opens the unified search overlay (people + orgs/clubs).

Plus the Obsidian vault setup: `~/vault` exists with handoffs symlinked in via a directory symlink so future sessions auto-appear in Obsidian without per-file wiring. Vault capture rules (`save this` / proactive offer / end-of-session catch) are saved to memory.

Two migrations were committed AND pushed to remote DB this session:
`20260518000000_work_order_manual.sql`, `20260518100000_resume_docs.sql`. Migration tracking was empty before; user ran `supabase migration repair` to backfill all 46 historical migrations as applied. Local + remote tracking now in full sync.

The session ended with the user explicitly trimming the search bar down to **People + Orgs/Clubs only** (Chats and Events removed). Pick up wherever you want next — see "What's still open" at the bottom.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary, did every commit below. |
| **`[You]`** | Human — product direction, on-phone QA, every "this still doesn't work" report that forced a different angle. |

---

## 1) What shipped

### Phase A — Campus chat mobile polish

- `2ad82e6` **Real Chat tab on CampusMobile.** Replaced the placeholder. Lists the viewer's joined orgs as Discord-style server cards; tap an org → opens the channels drawer.
- `5718b33` **Discord-style drill-down.** OrgChannelsDrawer (vaul `direction="right"`) lists Public/Private channels with dark chrome (`#1A1B1F → #16171B`). Tap a channel → mounts `ConversationView` from `MessagesMobile` over it with a synthesized thread for "#channel-name" in the top bar. Z-index ladder: drawer 1080/1081, conversation 1099/1100 so the chat sits on top of the channels list, channels list reappears when the chat closes (no extra navigation state).
- `73bb877` **Otto strip collapses on orgs / chat / map.** Outer wrapper max-height eases to 0; inner content scales to 0.04 and translates 48vh down with `transform-origin: 50% 100%` so it appears to swoop into the bottom Otto tab icon. TabStrip's sticky offset slides up 8px to fill the gap.
- `57e0e8f` **Conversation stacks above channels drawer.** Z-index fix for the case above + hide bottom tab bar while the drawer is up. Synthesized thread uses `type: "org"`.
- `4b7c31c` **Org backdrop applied on mobile + sender chips.** Each org's `backdrop_preset` (cream / sand-purple / ember / deep-violet / forest / midnight) now paints both the channels drawer and the conversation. ConversationView gained an optional `backdropCss` prop. Group/org-channel messages now render a sender avatar + name above the first message in each sender's run. Also: `body.vibe-hide-otto` hides `#otto-corner` while CampusHome is on the chat tab (was using `useSearchParams` which doesn't fire because tab state isn't in the URL).
- `52343e8` **Long-press reactions on chat bubbles + dark-mode chrome.** 360ms hold pops a 7-emoji picker (`❤️ 👍 👎 😂 🔥 😮 😢`). Optimistic POST/DELETE `/api/me/threads/[id]/messages/[messageId]/react` with rollback. Bubbles flip to dark glass (`rgba(20,16,28,0.62-0.66)` with `backdrop-filter: blur`) when the chat has a non-cream backdrop; sender chips, header, input bar, and send button all flip white-on-glass. Cream backdrops keep the original cream+dark treatment.
- `ef2eb45` **Reaction picker dismiss-too-early fix.** Outside-tap handler was using `{ once: true }` and firing on taps INSIDE the picker → emoji clicks never landed. Switched to a ref-based check + skip when target is inside picker.
- `363e2f7` + `94eacc1` **Desktop campus chat layout.** Outer wrapper `height: 100dvh + overflow: hidden` on the chat tab so the composer pins to the viewport. `ServerRail` + `ChannelRail` asides `height: 100%` to fill grid cells. `ChannelMain` `height: 100% + minHeight: 0 + overflow: hidden` so the message composer + ChannelRail footer no longer get clipped by the outer overflow.

### Phase B — Mobile campus map

- `9ecac0c` **Native MapMobile rebuild.** ~600 lines at `src/components/mobile/MapMobile.tsx`. Dark space-y canvas with school-colored radial halos under each cluster, "You are here" avatar at center, school-clustered major bubbles fanned around. Gestures: one-finger pan, two-finger pinch-zoom anchored at midpoint. Tap-and-drag past 8px suppresses bubble click. Recenter FAB bottom-right. Tap a bubble → vaul bottom sheet (max 82dvh) with Discover / Mutuals / Connected tabs from `/api/campus-map/zone`, default-tabbed to the strongest signal.
- `c0b3dc7` + `0d82553` **Cluster tightening (twice).** Pulled in `YOU_KEEPOUT` 92 → 60 → 38, `PAD_BETWEEN` 26 → 14 → 8, cluster cap 200 → 140 → 92, local fan distance 52+24 → 34+18 → 18+12, node padding 10 → 4. End result: zones hug the center on a phone screen instead of bleeding off-canvas.
- `c0b3dc7` also **scoped composer FAB to Feed + Clips only.** Events / Orgs / Chat / Map no longer get a `+` covering content (it was sitting on top of the chat composer's send button + map bubbles).

### Phase C — Feed engagement + actions row

- `0817752` **Like + repost + save + double-tap + swipe-back on FeedCard.** Heart button with optimistic toggle through `/api/posts/[id]/like`. Repost button next to heart with green active state. Save bookmark pinned far right. Double-tap (240ms window) toggles like. `PostViewerMobile` wrapped in a vaul `Drawer.Root direction="right"` so it can be swipe-dismissed from the right edge.
- `10d5501` **Dropped the Instagram-style heart burst overlay.** Double-tap still toggles like, only the heart pill updates.
- `72e5710` **Double-tap toggle (was force-like).** Repeated double-taps on a liked post were stacking the count — fixed to use `toggleLike()` (toggle) instead of `toggleLike(true)` (force).
- `79546a9` **Action row reorder.** `heart | repost | comments | views(eye) | save→`. Like + repost adjacent; eyeball icon matches desktop.
- `076fe08` **3-dot menu top-right + restructured action row on both viewports.** Mobile vaul bottom action sheet with Copy link / Report post / Cancel. Desktop dropdown ungated from owner-only — Copy link + Report (non-owners) + Delete (owners). Share button removed from desktop engagement bar.
- `b680eba` **Comments open by default in PostViewerMobile.** Tapping into a post almost always means "read/join the conversation."
- `cd7dcc5` **viewer_saved hydration on feed payload.** Was always starting false; now seeds from `bookmarks` table per post. Save state survives reloads. Also: desktop tap-to-expand-comments on the post body / image (skip if click target is `closest("a, button")`).
- `aa41243` **Friend-repost social-proof pill** (Instagram-style). New `loadFriendReposters` helper on `/api/feed` joins `connections` against `post_reposts`, returns up to 3 most-recent friend samples + total count. New `FriendRepostPill` desktop component + matching pill in mobile FeedCard. "Alice reposted this" / "Alice and 4 others reposted this." Only paints when ≥1 friend reposted — generic popularity intentionally not surfaced.
- `6629841` **Profile Posts sub-tabs.** "Posts / Reposts / Saved" inside the Posts pane. Reposts public (visitor sees), Saved owner-only. Feed API stopped emitting "repost"-kind entries — reposts are now profile-only + the social-proof pill.
- `40643fb` **Tier-1 feed ranking.** Replaces strict ORDER BY created_at. Formula: `engagement = 1 + likes + 2*reposts + comments; base = engagement / (age_hours + 2)^1.5; score = base * (1.6 if viewer follows author) + 3 * friend_reposter_count`. Candidate pool expanded to `max(limit*4, 80)`. Diversity cap: max 3 posts per author. `?sort=recent` escape hatch + tag filters bypass ranking.

### Phase D — Profile portfolio editing on mobile

- `8936e88` **Editable portfolio (experience, working-on, resume).** Each PortfolioSubsection grew an `action` slot for owner-only EditPill buttons. Two new full-screen vaul drawers: `ExperienceEditSheet` (15-card cap, full WorkExp fields) and `WorkingOnEditSheet` (10-icon-and-text-row cap). Resume upload mirrors the avatar/banner flow (kind=resume; PDF + image). Shared `PortfolioEditorShell` for the cancel/title/save chrome. `savePortfolioPatch` round-trips through `/api/me/profile-sync` → re-bootstrap.
- `7d7cc35` **Resume viewer mobile zoom polish.** Pinch-zoom was already wired. Added double-tap (1×↔2× toggle, 320ms + 30px window) and a top-right Reset pill that shows current zoom% when zoom > 1.02.
- `bf43f88` **Cross-device manual order via `users.work_order_manual`.** Drag-to-reorder used to live in localStorage on desktop. New boolean column flips to true on reorder; UI on both viewports preserves stored array order when set, otherwise auto-sorts by parsed end date. Mobile `ExperienceEditSheet` gained ↑/↓ buttons per card. Desktop `buildProfileSyncPayload` now sends the flag through. Hidden `.slice(0, 4)` removed from mobile render — was capping entries 5+ silently.
- `727dafa` **Multi-doc resume (`users.resume_docs jsonb`).** Up to 3 docs per user (capped in `lib/profile/resume-docs.ts`; cap is tunable without a migration). Legacy `users.resume_url` stays as a fallback for users who haven't populated the array. `build-vibe-user-v1` prefers `resume_docs` when present, falls back to wrapping `resume_url`. Mobile `handleResumeUpload` now APPENDS instead of clobbering; per-doc × delete with confirm.
- `ff9d6e7` **Edit pills gated behind edit mode + in-sheet drag.** EditPill, per-doc × delete, etc. all hide until owner taps the pencil. ExperienceEditSheet ALSO got drag-to-reorder via a 6-dot handle per card (pointer-capture + sibling midpoint hit-test). Source card fades + lifts a shadow.
- `64ec7e0` **Per-doc redaction bars + mobile draw editor.** Fixes the bug where doc 1 inherited doc 0's bars (filter was hardcoded to `docIndex === 0`). Viewer now takes `docIndex` and filters by it. New "Edit bars" toggle in the viewer top bar (owner only): drag to draw a rect (≥1.5% on both axes); tap a bar to delete; pinch + double-tap suppressed while editing. Bars merge back into `users.resume_redactions` keyed by `docIndex`.
- `2e03a72` **Inline drag-to-reorder on the read pane (edit mode).** Each row in Experience and Working-on grows a 6-dot drag handle when editMode is on. Generic `buildDragHandlers` shared between the two lists. Internal `expDraft` / `currentOnDraft` state holds live order during drag; persists on drop via parent callback that hits `/api/me/profile-sync`. Experience cards also pick up a card outline in edit mode so the rows read as draggable.
- `11478ad` **Tap-to-upload logos for experience + working-on (mobile).** New `UploadableLogo` helper with avatar-style image + orange camera badge overlay. Experience uses 40×40 squared (company logo style); Working-on uses 32×32 circular. Tap → file picker → uploads to `/api/me/profile-upload?kind=logo` → patches into the relevant list at the relevant index via `handlePortfolioLogoUpload`.
- `2374b7b` **Sticky add button (revert later in this same session).** Initial attempt at putting "+ Add role / item" in a sticky footer because iOS rubber-band was making the in-list button hard to reach. Also: desktop now PRESERVES `logoUrl` for current-on items (was wiping it on every save because the persist loop only read `textContent` from the icon span).
- `c6e2302` **Reverted sticky footer; bumped bottom padding instead.** User preferred the button at the end of the list. Scroll container now has `calc(80px + env(safe-area-inset-bottom, 0px))` bottom padding + `overscrollBehavior: contain` so rubber-band can't yank past the target.
- `bc4238d` **Desktop tap-to-upload for current-on logos.** Mirrors mobile. New `.current-icon-wrap` wrapper with CSS `::after` orange "+" badge when `body.edit-mode`. Click triggers a hidden file input → `_uploadWorkLogo` (the existing kind=logo endpoint) → renders an `<img>` with `data-logo-url` so the persistence loop picks it up.

### Phase E — `/posts/[id]` page + share + deep links

- `2a27f43` **`/posts/[id]` route + mobile `?post=<id>` deep link.**
  - New server component at `src/app/posts/[id]/page.tsx` with `generateMetadata` rendering OG + Twitter meta (author + 60-char title + 140-char description + media thumbnail). Meta fetch uses the service client so unauthenticated previewers still see the meta. Auth gate: unauthed users redirect to `/auth/login?next=/posts/<id>`. Existence check via service client → 404 if post is gone.
  - `PostPageClient` renders `PostViewerMobile` for the id; close/delete navigates to `/campus`.
  - CampusMobile gained mount-time effect to detect `?post=<id>` / `?clip=<id>` → opens the viewer + strips the query so refresh doesn't re-open. Desktop already had a scroll+flash handler.
  - Copy Link targets updated everywhere to use `/posts/[id]` instead of `/campus?post=<id>`. The `/campus?post=` deep link still works inbound as a fallback.
- `e3c3cb8` **In-app `SharePostSheet`.** New vaul bottom drawer at `src/components/mobile/SharePostSheet.tsx`. Loads `/api/me/threads`, lists DMs + groups + org channels (skips request threads), multi-select rows + optional caption, parallel POST to each `/api/me/threads/[id]/messages` with `attachment_id` + `attachment_kind`. Partial-failure toasts. Wired into:
  - Mobile FeedCard 3-dot menu ("Send to chats" above Copy link)
  - Mobile PostViewerMobile 3-dot ("Send to chats")
  - Desktop FeedRow more menu ("Send to chats")
  Same React component on every surface — no separate desktop implementation.
- `dd7d26e` **Notification taps now open the post viewer.** OttoSidePanel + OttoCorner toast + ClipViewerMobile all route to `/posts/<id>` instead of `/campus?post=<id>`. Works for posts of any age (the old deep link silently no-op'd for posts outside the 50-row feed window) AND the viewer mounts with comments already expanded by default, so "X commented on your post" lands you exactly on the conversation.

### Phase F — Profile mobile search bar (last batch)

- `5af1676` **Magnifying-glass button in the floating top-right actions.** Visitor + owner both see it; hidden in edit mode so it doesn't fight Cancel/Save. Opens the existing `CampusSearchOverlay` (now exported from CampusMobile).
- `5af1676` **Overlay extended with a "Chats" section.** `/api/me/threads` fetched once on mount, filtered client-side. DMs route to `/messages?to=<handle>`, channels to `/campus?tab=chat&channel=<id>`. (Later reverted, see below.)
- `2395ec5` **Search rows switched from `<Link>` to `<button + router.push>` + deferred close.** `<Link>`'s navigation was racing the overlay's `setSearchOpen(false)` when clicking a profile result from another profile page; the click was being dropped on some renders. Imperative push first, `setTimeout(onPick, 0)` second.
- `c0d06d3` **People above Chats + dedupe DM/profile.** Searching "alex" was surfacing the DM with Alex above Alex's profile. Reordered (People first); DMs whose peer is in People get dropped from Chats.
- `57ed7ca` **Trimmed to People + Orgs/Clubs only.** User's call — Chats and Events removed entirely. ~340 lines deleted. Placeholder + hint copy updated. `/api/search?kinds=users,orgs` only.

### Phase G — Schema + infra

- `bf43f88` **`users.work_order_manual` boolean column.** Migration `20260518000000_work_order_manual.sql`. Default false. Drives the "preserve stored order" path in the experience render.
- `727dafa` **`users.resume_docs jsonb` column.** Migration `20260518100000_resume_docs.sql`. Default `'[]'`. Validation in `lib/profile/resume-docs.ts` (http/https URLs only, ≤3 items, ≤80 char name).
- New libs: `lib/profile/resume-docs.ts` (ResumeDocRow + sanitizer), `current-on.ts` extended with optional `logoUrl`.
- All four routes that SELECT user columns (profile-sync, profile-bootstrap, users/[handle]/bootstrap, plus the normalizer) updated to include the new columns.

### Phase H — Obsidian vault setup (not in git)

User asked for help with personal note-taking. Set up:

- `brew install --cask obsidian` (Obsidian 1.12.7 in /Applications)
- Vault at `~/vault` with folders: `Inbox`, `Daily`, `Founder`, `Product`, `People`, `Reference`, `Templates`. README + `.gitignore` (ignores `.obsidian/workspace*.json`, cache, trash) + 4 templates (Daily, Decision, Interview, Idea) + a starter daily note + `Founder/Vibe.md` anchor.
- Existing artifacts imported as symlinks: handoffs as a **directory symlink** (`~/vault/Founder/Handoffs → vibe/handoffs`) so new handoffs auto-appear; `vibe_journal.html` symlinked into `Founder/` with a `Journal.md` TOC; `~/Downloads/otto_mockups/*` symlinked into `Reference/Mockups/` with a `Mockups.md` index.
- Vault capture rules saved to memory ([feedback-vault-capture]): three modes — explicit "save this" / proactive "want me to save that?" / end-of-session batch catch.

---

## 2) What broke / what we had to chase

- **Migration tracking was empty on the remote.** All 46 historical migrations had been applied via Dashboard SQL Editor, not `supabase db push`, so `schema_migrations` had zero rows. `supabase db push` tried to re-apply everything from scratch + crashed on `CREATE TABLE users`. Fix: user ran `supabase migration repair --status applied <version>` for every historical timestamp. Now in full sync (46 local files, 46 remote tracked).
- **Picker dismiss timing on reaction picker.** Outside-tap handler used `{ once: true }` → emoji clicks inside the picker were unmounting it before the click could fire. Fixed with ref-based target check.
- **Vaul-vaul z-index for chat stack.** Channels drawer at 1200/1201, conversation at 1099/1100 — drawer covered conversation. Lowered drawer to 1080/1081.
- **Search row navigation race.** `<Link onClick={overlayClose}>` was unmounting parent before Next.js Link finished pushing. Switched to imperative push + deferred close.
- **`?post=` deep link mobile gap.** Desktop scrolled, mobile did nothing. CampusMobile gained a mount-time effect.
- **iOS rubber-band on sheet bottom button.** Tried sticky footer first, user preferred in-list. Fixed via 80px bottom padding + `overscrollBehavior: contain`.
- **Desktop persistence loop was dropping current-on `logoUrl`.** Only read `textContent` from the icon span. Renderer now emits `<img data-logo-url>`; persist loop reads it back.

---

## 3) Quick reference — key file pointers

| Surface | File |
|---|---|
| Mobile campus chat (Discord-style) | `src/components/mobile/CampusMobile.tsx` (CampusSearchOverlay also here, exported) |
| Mobile conversation view + reactions | `src/components/mobile/MessagesMobile.tsx` |
| Mobile campus map (native) | `src/components/mobile/MapMobile.tsx` |
| Mobile post viewer (vaul drawer) | `src/components/mobile/PostViewerMobile.tsx` |
| Mobile resume viewer + redaction editor | `src/components/mobile/ResumeViewerMobile.tsx` |
| Mobile profile (editable portfolio + search) | `src/components/mobile/ProfileMobile.tsx` |
| Share to chats picker | `src/components/mobile/SharePostSheet.tsx` |
| Public post page | `src/app/posts/[id]/page.tsx` + `PostPageClient.tsx` |
| Feed ranking + friend reposters | `src/app/api/feed/route.ts` (`scoreFeedRow`, `loadFriendReposters`, `loadViewerFollowings`) |
| Resume docs sanitizer | `src/lib/profile/resume-docs.ts` |
| Work order flag column | `supabase/migrations/20260518000000_work_order_manual.sql` |
| Multi-doc resume column | `supabase/migrations/20260518100000_resume_docs.sql` |

---

## 4) X algorithm repo evaluation

User asked whether `xai-org/x-algorithm` (24.4k stars, Rust + Python) is worth wiring in. Conclusion: **not viable for Vibe right now**.

- Infra mismatch — assumes Kafka, GPU-backed transformer inference, gRPC microservices in Rust. Vibe is Next.js + Supabase.
- Scale mismatch — designed to pick ~50 posts from hundreds of millions; Vibe has tens of thousands across hundreds of users.
- No training data — Phoenix transformer is trained on X's engagement traces, completely different domain; pre-trained mini-model is 3GB Git LFS.

Path forward (already done): Tier-1 hand-tuned ranking. Future ladder: Tier-2 candidate-pool query (1k+ daily active); Tier-3 xgboost sidecar (10k+ users); Tier-4 selectively port specific algorithms like author-diversity attenuation (100k+ users).

---

## 5) What's next — explicit pickup

**Mobile onboarding.** User's call at session wrap. The current
onboarding lives at `/onboarding` (used to land at it after
auth/school-email) and is desktop-tuned — likely needs a fresh
mobile-native rebuild on the same MobileShell pattern as
`CampusMobile` / `ProfileMobile`. Open questions for the next
session:

  - What's the current onboarding flow? (Otto Q&A + major picker +
    profile prefill?) — read `src/app/onboarding/` to map it.
  - Should the mobile rebuild be a full component fork, or just a
    media-query overhaul of the existing surface? (Likely fork, to
    match the pattern of every other route.)
  - Does Otto's onboarding sequence need any new copy / order
    changes, or is it pure visual polish?
  - Anything in the post-onboarding redirect chain (school-email
    verify → campus) that also needs mobile attention?

Then, whatever else seems valuable from the punch list below.

---

## 6) What's still open

Real things, not stale punch list:

1. **Text-on-clip overlays.** Promised in session 47 wrap, still TBD. Schema (`posts.text_overlays jsonb`), composer UI, viewer renderer.
2. **`/posts/[id]` for unauthenticated visitors.** Currently bounces to login. OG meta works for previewers (uses service client). If you want public-readable post pages (e.g. for marketing / SEO), would need a new "is_public" gate + DB policy + a non-logged-in viewer mode.
3. **Algorithm Tier-2.** When Vibe has 1k+ daily active, build a candidate-pool query that pulls in-network + popular-with-friends + tag-matches and re-ranks with the current formula + a viewer's like-history signal. Still pure Postgres, no new infra.
4. **Lint warnings** — three pre-existing `react-hooks/set-state-in-effect` in CampusMobile (initialChannelId switch, refetchFeed/Events/Orgs, search overlay's setUsers([]) clear). Cosmetic, but they clutter `npm run lint` output.
5. **Mobile work-experience date picker** — `dates` is a free-text input today. A real date-range picker would normalize the sort key (currently best-effort regex parsing in `parseExperienceEndDateMs`).
6. **Desktop search overlay** — there's a legacy `_searchOverlay.js` on profile.html. Mobile's `CampusSearchOverlay` is now exportable; if you want desktop to use the same React component, that's a small port.

---

## 7) Open product threads (not coding work)

Stuff from conversation that's not code:

- **Obsidian as personal notes habit.** Vault is set up. Recommendation was to start there for solo founder thinking and add Notion later only when something needs sharing. Vault is local-only — `git init` inside `~/vault` whenever you want backup.
- **Algorithm decision.** Tier-1 is live; stay there until there's engagement data to actually train on.
- **Share-link OG previews** — `/posts/[id]` ships meta now. Worth pasting a link into iMessage / Discord to confirm preview cards render.

---

## 8) Memory updated

- New: `feedback-vault-capture` — three-mode routing of conversational thoughts to `~/vault/Inbox`.
- New: `reference-obsidian-vault` — vault location + structure + the handoffs directory symlink.
- Unchanged: handoffs naming + location memory still says "latest is session 38" — should be **session 48 (this file)** going forward. Update opportunistically.
