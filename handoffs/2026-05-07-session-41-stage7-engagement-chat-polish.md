# Session 41 handoff — Stage 7 engagement, events, calendar, map, image cropper, full chat polish (2026-05-07)

This handoff covers **Session 41**, the longest single-session push so far. We took the campus tab from "static demo with org profiles" all the way to a near-launch-ready social product: post engagement (likes / comments / reposts / views), an Events tab gated to verified orgs, a custom-built calendar widget + modal that mirrors the legacy `campus.html` design, a Tron-glass campus map with force-directed major zones + org clusters, an image cropper applied to every upload surface, real "people-to-connect" suggestions, and a complete chat overhaul (reactions, replies, iMessage drag-to-reveal timestamps, hour:minute + date separators, hover-delay pickers, bubble-width fixes, and 134 commits of compounding polish).

Production deploys: continuous via `git push` → Vercel during the session. **All shipped.**

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for ship loops + multi-file work. |
| **`[Cursor]`** | Cursor agent — small targeted fixes / lint nits. |
| **`[Either]`** | Either tool. |
| **`[You]`** | Human / dashboard — Supabase SQL editor, Vercel, R2, etc. |

---

## 1) What shipped, Session 41

### Phase A — Post engagement (Stage 7 P1-019/P1-020/P1-021)

- **`post_reposts` table** (migration `20260508100000_post_reposts.sql`) — single repost button, optional quote text, surfaces on profile alongside originals.
- **`post_views` table** (migration `20260508110000_post_views.sql`) — per-user-per-day dedupe to keep view counts honest.
- **`comment_likes_and_replies`** (migration `20260508120000`) — heart any comment + reply to any comment via `parent_comment_id`. Threaded.
- **Profile revamp** for reposts: new content tab, repost cards attribute the original author + your quote.
- **Default campus tab → Feed.**

### Phase B — Feed composer

- Single paperclip handles text / photo / clip uploads — same UX as the profile post composer.
- Trending hashtags clickable → filtered feed view with back button.
- Mentions, comment hearts, replies wired across every post surface (post viewer modal, campus feed cards, profile grid clones).

### Phase C — Events tab + RSVPs

- **Verified-orgs-only event creation** — gated server-side (`orgs.verified = true`).
- **`personal_events`** (migration `20260508130000`) — local-only events users add to their own calendar.
- **Calendar widget** in the left rail rebuilt from scratch to match the legacy `campus.html` design — month grid, hover preview, RSVPs from real events appear alongside personal events.
- **Calendar modal** — full-screen overlay (above the custom cursor), color-picker for personal events (7 colors), Apple/Google/Outlook export popover (RFC 5545 iCalendar generation).
- **Org-admin attendees panel** — per-attendee DM + group DM for the whole guest list.
- **`CALENDAR_CHANGED_EVENT` window event** keeps the rail widget in sync with the modal and other surfaces.

### Phase D — Campus map (Tron-glass)

- Force-directed layout for **major zones** (no overlap, collision avoidance).
- **Org center cluster** — auto-collapses when a zone panel opens to avoid overlap.
- Drilling into a zone reveals: connected people, mutuals, discover (people in the zone you don't follow yet).
- Demo toggle removed; auto-fallback only (the live data path is the canonical one now).
- SVG topographic backdrop + glass cards; high-contrast on cream backdrop.

### Phase E — Image cropper everywhere

- **`public/html/_imageCropper.js`** — vanilla cropper for legacy pages (profile.html, etc.). Pan/zoom, aspect-ratio picker, retina output.
- **`src/components/ImageCropperModal.tsx`** — React port with same API.
- **Output sizing fix** — was capped at the on-screen viewport (~540px max) which made every crop blurry; now sized off `outputMaxSize`, capped at the source resolution.
- Wired surfaces: org banner (3:1 / 2400px), org logo (1:1 / 1024px), profile avatar, profile cover banner, post composer images.

### Phase F — Backdrop / cream palette pass

- **Cream as default chat backdrop** (was dark); backdrop changes moved to **org settings only** (was chat-level).
- Added `'cream'` to the `org_backdrop` CHECK constraint (migration `20260508140000_orgs_cream_backdrop.sql`) and to `VALID_BACKDROPS` in API allowlists.
- `tone="dark"` on Events/Orgs/Map SceneHeaders so headings read on cream.
- **`DARK_GLASS_SURFACE` + `DarkGlassCard` primitives** — events/orgs/map cards are dark-translucent on cream so they don't wash out.
- **Verified header** = gold gradient. **Student communities header** = solid orange.
- **Show dormant** toggle = grey (was red).
- **Search bar / filter pills / Create CTA** all dark glass on cream.
- **Settings tab pill alignment** fix.
- **Channel rail org name** = clickable + wrappable, links to org profile.

### Phase G — Org profile polish

- Banner full-bleed → constrained 3:1 inside a rounded container.
- "Return to Organizations" → `/campus?tab=orgs` (deep link added: `feat(campus): deep-link to campus tabs via ?tab= query param`).

### Phase H — Real "people to connect" in OttoPanel

- Was hardcoded; now hits `/api/me/suggested-connections` (already shipped in session 34, just wasn't wired here).
- Auto-pulls from friends-of-friends → same-major peers → same-school peers.

### Phase I — Chat reactions + replies (P1-022 polish)

- **`message_reactions` table** with allowed emojis ❤️ 👍 👎 😂 🔥 (migration `20260508150000_message_reactions_and_replies.sql`).
- **`messages.parent_message_id`** for quote-replies.
- **`POST/DELETE /api/me/threads/[id]/messages/[messageId]/react`** — idempotent on `(message_id, user_id, emoji)`.
- **RLS extension** for org channels (migration `20260508160000_message_reactions_org_channels.sql`) — original RLS only checked `is_channel_member` which returns false for org channels; now ORs in `can_view_org_channel`.
- **Hover picker pill** with 5 reactions + Reply trigger.
- **Reaction chips below bubbles** with viewer-reacted highlight (orange tint).
- **Twitter-style inline quote-replies** — composer pill shows the parent, post becomes a reply to it.
- Wired in **all three chat surfaces**: campus channel chat (React), legacy `/messages` page (vanilla JS), mini messenger (vanilla JS).

### Phase J — Chat polish (the long tail)

This was the bulk of the session. Each fix was small but the surface area was every chat path.

| Fix | Why |
|---|---|
| `pendingReactions` guard in all 3 surfaces | A poll firing during a reaction toggle returned a stale messages array (no chip yet) and clobbered the optimistic flip — chip looked stuck on the old state. |
| Render sig in `/messages` includes reactions | The bubble re-render is sig-based (perf, so attachment `<img>`/`<video>` don't reflow each poll). Sig was id-only, so reactions mutating in place left the DOM stale until you reopened the channel. |
| iMessage drag-to-reveal timestamps | Pull message column left → time chips slide in from the right. Engages only when motion is mostly horizontal so it doesn't fight scroll. |
| Exact hour:minute timestamps in chat | Was relative ("2h"). Wall-clock is what users actually want when reading recent threads. Thread-list previews kept relative time. |
| iMessage-style date separators | "Today 3:42 PM" / "Yesterday 7:05 PM" / weekday / "May 7" — emitted on day change OR > 1h gap (matches iMessage's heuristic). |
| Bubble width collapse fix in `/messages` and mini | `max-width: 78%` of an inline-flex parent that was sized to the bubble = circular sizing → "test" rendering as "te/st". Cap moved to the message-row stack (70%); `overflow-wrap: anywhere`. |
| Orange ring on already-reacted emojis in the picker | Visual cue for "I picked this one — clicking again removes it." All 3 surfaces. |
| Cursor stays orange on hover (not charcoal) | Was disappearing on dark surfaces. Applied to 7 legacy pages (`/messages`, `/feed`, `/campus`, `/opportunities`, `/otto`, `/network`, `/profile`). |
| Picker no longer reflows long bubbles | Was inline-flex sibling, forcing bubbles to give up width when picker appeared. Now `position: absolute` floating beside (or above for long messages). |
| Picker above bubble on long messages | > 60 chars or multi-line → picker stacks above. Beside-placement was running off the chat's right edge. |
| Hover-delay so picker doesn't vanish mid-slide | 250ms hide delay; mouseEnter on either row or pill cancels it. React state in campus, delegated `mouseover/mouseout` listener with a `.show-actions` class in legacy. |
| `.btime` color fix for `/messages` cream backdrop | White was invisible. Now `rgba(28,28,30,0.7)`. |
| Mini messenger panel size | 360×520 → 420×600. Cramped before, especially with the reaction chrome. |
| Bubble spacing | Final values: campus 5/14, mini 9/14, /messages 10px. Discovered `.msgs` has a `.msgs-bubbles` wrapper inside — gap on the outer was only spacing the wrapper from the footer, not actual rows. |
| Chat backdrop dark-glass everywhere | Bubbles are always dark-glass regardless of backdrop. Previous version flipped to white-on-cream which was illegible. |
| Pin-to-bottom on chat open + don't yank scrolled-up users | Initial mount → pin to newest. New message arrives → only pin if user was already near the bottom. |

### Phase K — Network suggestions API (in-progress, non-breaking)

- **Extended `/api/me/suggested-connections`** to include shared-org members as a third suggestion source, ranked between mutuals and same-school fallback. New field `shared_org_count` on the response (additive, backwards-compatible).
- The Network page itself is still a stub (next session) — see §6.

### Production deploy

- Pushed at the end of every Phase. **All of §1 is on production** as of 2026-05-07.
- Migrations applied to prod through `20260508160000_message_reactions_org_channels`.

---

## 2) Migrations applied this session

```
20260508100000_post_reposts.sql
20260508110000_post_views.sql
20260508120000_comment_likes_and_replies.sql
20260508130000_personal_events.sql
20260508140000_orgs_cream_backdrop.sql
20260508150000_message_reactions_and_replies.sql
20260508160000_message_reactions_org_channels.sql
```

Confirm on prod with:

```sql
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 10;
```

---

## 3) Repo state

- **134 commits on main** as of pickup.
- All deployed via Vercel auto-deploy on push.
- `npx tsc --noEmit` clean.
- `npx eslint src/app/campus/campus-home.tsx` — one pre-existing warning (`'GlassCard' is defined but never used`), no errors.

---

## 4) Known issues / debt at end of session

- **Mobile responsive sweep** — never tested at 375 / 414. Several places probably wrap badly: campus map, calendar modal, attendees panel, channel rail, reaction picker placement on long messages, mini messenger.
- **Notifications panel** (#29 in user's action items) — chat reactions, replies, mentions, RSVPs are silent unless the user is on the page. Currently the only signal is Otto's corner ring counter.
- **Otto reminder system** (#28) — RSVPs + calendar deadlines should ping. Not yet built.
- **Settings + Logout + Account deletion** (#33) — required for legal compliance before public launch.
- **TOS + Privacy Policy pages** (#34) — required to put .edu emails in production.
- **Custom domain** (#35) — `vibe-app.vercel.app` is the current URL.
- **Discover Browse + Departments views** (#30, #31) — empty stubs. See §6 for the related Network page work.
- **localStorage migration** (#8 — In Progress) — carry-over from earlier sessions; finish so nothing's stuck client-side.
- **Realtime subscriptions** — chat is still 2s polling. Supabase Realtime is wired in the project but not used here. Switch would remove the entire `pendingReactions` race surface.
- **Campus group chat reactions silently failing** — was reported during session, root cause turned out to be the polling race + missing org-channel RLS (both fixed). Verified saving on prod.
- **Reactions appear under message ABOVE not under target** — was reported during session, root cause was the optimistic flip painting in the wrong row state. Fixed by including reactions in the render sig.

---

## 5) Stage 7 plan — what's left

Per the user's action-items spreadsheet, **complete after this session**:

- #6, #7, #9–22, #24–27, #32, #37 — all done (database, auth, profile, connections, post viewer, clip viewer, composer, feed, bookmarks, channels, org membership, calendar wired, block + report, "vibes"→"clips" rename).
- #23 (Messages tab consolidation) — done.

**Still open:**

| # | Item | Notes |
|---|---|---|
| 8 | Migrate localStorage data layer to Supabase | In-progress carry-over |
| 28 | Otto reminder system (RSVPs + calendar deadlines) | Engagement |
| 29 | Notifications panel (Otto reminders + connection requests + RSVPs) | Engagement — biggest silent-loop hole |
| 30 | Discover Browse view (filter + student grid) | Discoverability |
| 31 | Discover Departments view (index + per-department) | Discoverability |
| 33 | Settings + Logout + Account deletion | Launch blocker |
| 34 | TOS + Privacy Policy | Launch blocker |
| 35 | Buy + connect custom domain | Launch blocker |
| 36 | Mobile-responsive sweep on every page | Launch blocker |
| 38 | Polish + QA + final deploy | The launch |

**Recommended sequence for next session(s):**

1. **Network page** (this was about to start in session 41 — see §6 below). Stubbed page exists, suggestion API extension already shipped.
2. **#33 + #34 together** — Settings/Logout/Account deletion + legal pages. Same Supabase user paths and same UI surface.
3. **#36 mobile sweep** — single longest-tail item; likely 1–2 sessions.
4. **#29 notifications panel** — unlocks every silent engagement loop already shipped.
5. **#28 Otto reminders** — natural follow-on after #29.
6. **#35 custom domain + #38 final deploy** — last 5%, pure plumbing.
7. **#30, #31 Discover views** — can ship as v1.1 after launch.
8. **#8 localStorage migration** — finish whenever; not blocking launch unless something breaks.

---

## 6) Network page — half-built, design pending

The user wants the Network page (`src/app/network/page.tsx`) built out next. We started in this session (Phase K above) but stopped at the API extension to scope the page properly.

**What exists:**

- Page route is a stub (just a title + placeholder text + back-to-campus link).
- Connections data model + helper queries (`src/lib/connections/queries.ts`): `getCountsFor`, `getFollowState`, `getMutualCount`.
- API: `POST/DELETE /api/me/follow` (idempotent), `GET /api/me/connections-summary`, `GET /api/me/suggested-connections` (now extended with shared-org dimension).
- Profile stats row already shows real counts (followers / following / connections) via `profile-bootstrap`.

**What's missing (next session work):**

- **Three new paginated list endpoints** —
  - `GET /api/me/connections?limit=20&offset=0` — mutuals only
  - `GET /api/me/followers?limit=20&offset=0`
  - `GET /api/me/following?limit=20&offset=0`
  - Each returns `[{ id, name, handle, avatar_url, major, year, mutual_count, follow_state }]`.
- **Network page UI** — 4 tabs: Connections / Following / Followers / Suggestions. User cards with avatar + name + major+year + mutual count or shared-org reason + action button (Follow / Unfollow / Connect / Accept).
- **Reusable user-card component** — `src/components/UserCard.tsx`. Shared between Network page, OttoPanel, and (future) Discover Browse view.
- **Empty states** with CTAs pointing at Discover and Orgs as the natural ways to grow the graph.

**Design decisions (settled at end of session 41):**

- **Visual language:** continue the dark-glass-on-cream treatment from Events / Orgs / Map / Chat. Cream page bg, dark-translucent `UserCard`, gold/orange accents. Keeps consistency across the post-Stage-7 surfaces.
- **Layout:** vertical list, not grid. Discover orgs uses a grid because orgs need banner + logo + description to make sense; people in your Network only need avatar + name + one line of context + one action button. Lists scroll faster and render 3× more cards per viewport than a grid would.
- **Tabs in this order:** **Connections / Following / Followers / Suggestions**. Connections first because that's the most-used surface once the graph is established.
- **Tab counts visible** (per user request) — small number badges next to each tab label like `Connections (12)`, `Following (28)`, etc. Not a big stats banner; just light counters so the user sees their graph size at a glance. Source: `/api/me/connections-summary` (already shipped — returns followers/following/connections counts).
- **Card anatomy:**
  ```
  [avatar 56px]   Name @handle                        [Action button]
                  Major · Year  ·  3 mutuals  /  in 2 orgs
  ```
  Action button switches by `follow_state`:
    - `connected` → "Message" (opens the campus chat with them — *not* unfollow; too destructive as the primary action)
    - `following` → "Following" pill that hovers to "Unfollow"
    - `followed_by` → "Connect back" (gold outline)
    - `none` (suggestion) → "Connect" (orange filled)
  Card body click → routes to `/profile/<handle>`.
- **Mutuals expansion** — clicking the "3 mutuals" text expands a small inline strip showing 3 avatars + "and 5 more." Quick way to see *which* mutuals.
- **Search inside the tab** — single search bar at the top of the page, filters the active tab via ILIKE on name + handle.
- **Connection-state filter pills inside Suggestions tab only** — "From your orgs" / "Mutuals" / "Same major" — so the user can scope the suggestion list.
- **No "Pending requests" tab** — current follow model is immediate; adding requests is a separate feature change. Defer.
- **No bulk actions** — "follow back all" / "unfollow inactive" feels Twitter-bro; college users don't need it.

**Architecture / file plan:**

```
src/app/network/page.tsx                ← convert to client component (or server + client island)
src/components/network/                 ← NEW directory
  ├─ NetworkTabs.tsx                    ← tab bar with count badges
  ├─ NetworkPanel.tsx                   ← list container, handles paging + filter
  └─ UserCard.tsx                       ← reusable; migrate OttoPanel to use this too
src/app/api/me/connections/route.ts     ← NEW: GET paginated mutuals
src/app/api/me/followers/route.ts       ← NEW: GET paginated followers
src/app/api/me/following/route.ts       ← NEW: GET paginated following
src/app/api/me/suggested-connections/   ← ALREADY extended this session (shared-org dim)
```

**Discover Browse (#30) vs Network Suggestions** — both show "people you might want to connect with" but with different intents:
- **Network Suggestions** = personalized (mutuals + your orgs + your major). Answers "who should I add to my graph?"
- **Discover Browse** = exploratory (filter by major / year / interests, browse anyone in your school). Answers "who else is at my school?"

Both share the `UserCard` component. Build Network first, Discover Browse reuses the card.

---

## 7) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-07-session-41-stage7-engagement-chat-polish.md
and pick up the Network page build (see §6 — design is settled).
The suggestions API is already extended to include shared-org members.
Need: 3 paginated list endpoints (/api/me/connections, /followers,
/following), the Network page UI with 4 tabs (with small count
badges per tab), and a reusable UserCard component.
```

Lint + typecheck pass before pickup:

```
npx tsc --noEmit 2>&1 | head -10
npx eslint src/app src/lib src/components 2>&1 | tail -20
```

Dev server is on port 3000.

---

## 8) Key files touched / created this session

### New API routes
- `src/app/api/posts/[id]/repost/route.ts`
- `src/app/api/posts/[id]/view/route.ts`
- `src/app/api/comments/[id]/like/route.ts`
- `src/app/api/comments/[id]/reply/route.ts`
- `src/app/api/me/personal-events/route.ts`
- `src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts`
- `src/app/api/orgs/[slug]/events/route.ts`

### Extended API routes
- `src/app/api/me/threads/[id]/messages/route.ts` — added MESSAGE_SELECT with parent_message_id, hydrateReactions, hydrateParentPreviews
- `src/app/api/me/suggested-connections/route.ts` — added shared-org dimension

### New components
- `src/components/ImageCropperModal.tsx`
- `public/html/_imageCropper.js`

### Major edits
- `src/app/campus/campus-home.tsx` — bulk: FeedComposer, EventsTabBody, EventCard, CreateEventModal, AttendeesModal, MapTabBody (force-directed layout), MajorNode, OrgCenterCluster, ZonePanel, ChannelChat (reactions, replies, drag-reveal, hover-delay), all chat polish
- `src/components/LeftNav.tsx` — CalendarWidget + CalendarModal + AddPersonalEventForm + ExportPopover
- `src/app/orgs/[handle]/admin-actions.tsx` — wired ImageCropperModal
- `src/app/orgs/[handle]/page.tsx` — banner constraint + Return-to-orgs deep link
- `public/html/messages.html` — full chat polish: bubble width fix, drag-reveal, date separators, reactions/replies, hover-delay, spacing
- `public/html/_miniMessenger.js` — same polish surface, panel size bump

### Migrations
- `supabase/migrations/20260508100000` through `20260508160000` (7 files this session)

---

## 9) Deploy state — ON PRODUCTION

Everything in §1 is **on the live Vercel site** as of session end. 134 commits on main, all deployed.

Sanity checks done at end of session:
- `/campus?tab=feed` loads with feed
- React + comment + repost work end-to-end
- Events tab shows verified-org events; calendar widget reflects RSVPs + personal events
- Campus map renders force-directed major zones
- Chat: reactions persist on click, drag reveals timestamps, picker stays open while crossing the gap, long bubbles get picker above

The next handoff should pick up at the **Network page** (see §6).
