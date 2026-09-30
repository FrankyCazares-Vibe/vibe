# Session 27 — GitHub deploy pipeline · Phase 1 spec finalized · Backend stack locked · Clips naming

End-of-session state for picking up cold in Session 28. Bullets only. This session was mostly **infrastructure + strategy**, not product UI implementation. Almost no `public/html/` files changed.

Session spanned **2026-04-29 → 2026-04-30** (overnight). The first half (Apr 29) was the GitHub/deploy pipeline + initial Phase 1 spec. The second half (Apr 30) was the dependency review, backend research, profile card spec, and safety/ops ticket additions — all captured below.

## What shipped

### Priority 1 — Site is live and shareable
- **Vercel production deploy:** https://vibe-mocha-iota.vercel.app
- **Root URL fix:** `next.config.ts` now rewrites `/` → `/html/landing.html` so the bare URL serves the landing page directly. Previously hit a Next.js dead-end.
- **Landing footer cleanup in `public/html/landing.html`:** removed "Session 23" stamp and `localhost:3000` reference so the footer reads cleanly for non-developer visitors. James and Rylan can share the URL with students.

### Priority 2 — Code is on GitHub, deploys auto-push
- **GitHub repo (private):** https://github.com/FrankyCazares-Vibe/vibe under the new `FrankyCazares-Vibe` GitHub account.
- **Single snapshot commit:** "Snapshot: Vibe prototype through session 26" — pushed all of `public/html/`, `public/journal/`, `src/app/feed/`, `src/app/the-map/`, `src/components/`, `src/lib/`, plus the `next.config.ts` root URL rewrite. Initial commit had only the Next.js boilerplate; everything beyond that (1.4MB) was untracked until now.
- **Vercel ↔ GitHub auto-deploy connected:** the Vercel GitHub app is installed on `FrankyCazares-Vibe/vibe`. Workflow is now `git push` → Vercel auto-deploys in ~30 seconds. No more `npx vercel --prod` from the CLI.
- **Workshop folders stay local-only** per existing `.gitignore`: `DOCS/`, `handoffs/`, `otto_mockups/`, `IU MEETING/`, `PITCH/`, `RESEARCH/`, `ARCHIVE/`. They are NOT backed up to GitHub. Flagged for Franky as a backup risk; unchanged.
- **Tooling installed:** GitHub CLI (`gh`) via `brew install gh`. `gh auth status` shows Logged in as FrankyCazares-Vibe with scopes `gist, read:org, repo, workflow`. Git config: `Franky Cazares <fracazar@iu.edu>`, default branch `main`.

### Priority 3 — Phase 1 spec written
- **NEW: `DOCS/PHASE_1.md`** — full build spec for the campus wedge. Self-contained so a Cursor + Claude session can pick it up cold. Sections:
  - Scope (in / deferred), naming locked in, Otto v1 spec, Supabase schema sketch, profile revamp, Discover spec, org/club profile, messages Discord pattern
  - 27 build items across 9 stages with sizing + dependencies — sized at **50-65 person-days, ~10-13 weeks**
  - Cursor + Claude workflow for shipping one item end-to-end
  - Open questions to resolve during build
- **NEW: `DOCS/PHASE_1_TASKS.csv`** — the build items table in CSV form for importing into the team master spreadsheet (one row per ticket, with ID / Stage / Title / Sizing / Depends on / Status).
- Both files are local-only (DOCS/ is gitignored).

## Strategic decisions locked this session

### Otto v1 is reframed — onboarder + reminder agent only
- Pulled back hard from the Otto-as-content-drafter direction shipped in session 26.
- **Phase 1 Otto behavior:** asks 8-12 onboarding questions, generates a **templated** profile from the answers (no real LLM call in v1 — just string interpolation), then steps aside. Stays visible in corner ring as a reminder agent — surfaces RSVPs, calendar deadlines, club meeting nudges.
- **What Otto does NOT do in v1:** no draft generation, no metrics, no cross-platform publishing, no auto-replies, no trend research. Voice samples are still **captured** during onboarding (saved to `users.voice_samples`) so v2 can use them.
- **The longer-term vision is captured in the spec.** Phases 2-5 layer in: drafting (v2), analytics coach (v3), cross-platform publish (v4), DM triage / trend research (v5). Each phase reuses the v1 schema and data — no rework.
- This keeps the differentiator visible (corner ring, "Otto onboarded me") without overpromising autonomous-agent behavior we can't ship reliably yet.

### Vibes → Clips
- The brand "Vibe" stays. The video content type renames from "vibes" to **"Clips."**
- Reasoning: "vibes" was synonymous with the platform name, blurring brand and content. Clips is universally understood, zero learning curve, fits anywhere ("post a clip" / "Clips only" filter).
- Workshopped through Drops, Waves, Cuts, Marks, Builds, Edits, Flicks, Cues, Shoots, Stamps, Prints, Plays, Rolls before landing on Clips.
- **Rename is queued late in Phase 1** (P1-026) — do it after major UI revamp work so we don't fight find/replace during build.

### Connections semantics
- **Mutual follow = connection.** When A follows B and B follows A, they auto-become "connections" (shown as a dedicated count on the profile).
- **Following / Followers** are standard one-way relationships, no approval needed (Instagram pattern).
- No separate "connect request" gesture (LinkedIn pattern was rejected — adds friction without enough benefit).

### Profile revamp — Instagram-inspired
- Keep the existing visual identity (Fraunces hero, gradient banner, custom cursor, calendar widget).
- **Below the bio:** prominent IG-style content grid with tabs **All / Clips / Posts**. Default is **All**, mixed chronologically.
- Stats row above tabs: **Followers · Following · Connections** (Connections shown prominently as the campus-relevant metric).
- Click a clip thumbnail → full-screen viewer. Click a post card → expanded view.
- Mobile: same pattern, stacked.

### Campus map → "Discover"
- The find-people feature inside `campus.html` is renamed **Discover.**
- v1 has two views: **Browse** (Concept A — filter bar + student card grid with mutuals indicator) and **Departments** (Concept B — index of departments → per-department page with featured students, recent clips/posts, related orgs, events).
- Concept C (literal map / constellation visualization) and Concept D (algo-driven discover feed) are deferred — Concept C is a future "Map view" toggle, Concept D needs the algorithm we don't have yet.
- This lives **inside `campus.html`**, NOT as a new React route. The `src/app/the-map/` constellation experiment is unrelated.

### Backend in Phase 1
- Adding **Supabase** in Phase 1 (auth + DB + storage). Stage 1 of the build spec.
- localStorage stays as a **demo-mode fallback** (e.g. for the public shareable URL where signup might be friction). When a user is logged in, reads/writes go to Supabase.
- Otto's reminder agent (server-side scheduling) and voice-sample storage need a real backend regardless. Adding it now avoids painful migration in Phase 2.

### Mobile depth
- **Phase 1 ships responsive HTML only** (P1-025). Every page must work on a phone browser.
- **Native mobile app is its own multi-month project later.** Not in Phase 1.

### Bookmarks
- IG-style: any post or clip can be saved.
- Saves go into a **default "Saved" collection.** Users can create custom collections (folders) to organize.
- Only visible to the user (private).

### Org/club profiles
- Different template from individuals. Includes: banner + logo + tags, description, **Officers** section, **Members** count + browse, **Events** (linked to Calendar), **Posts/Clips grid** (org-authored content), **Channel link** (jumps to org space in Messages), **Join button** → membership request flow.
- Default v1: simple join request, officer accepts/declines. **Application forms (Greek life style)** deferred.
- Officer / member / pledge roles supported in `org_members.role`.

### Messages — Discord pattern
- One Messages tab, three surfaces: **DMs** (1:1) + **group chats** (multi-user, no org) + **org/club channels with sub-channels**.
- Admin controls (org admins only): create/rename/delete channels, manage members, mute/pin, channel-level permissions.
- Sidebar: DMs at top, then orgs you're in with channels nested below.

## Late-session additions (2026-04-30)

### Backend stack locked: Supabase Pro + Cloudflare R2 hybrid
- Researched Supabase vs Firebase vs AWS Amplify vs raw AWS vs Azure vs GCP vs Convex vs Neon+Clerk+R2.
- **Verdict: Supabase Pro ($25/mo) for everything, Cloudflare R2 for clip videos only.**
- **Why Supabase wins:** relational data fits Postgres natively (social graph, RSVPs, channel memberships are all joins — document stores like Firestore choke). Realtime included on every table. Auth + RLS + scheduled jobs (`pg_cron`) all built-in. Lowest lock-in of managed options (`pg_dump` + go elsewhere). 3-5 days to Phase 1 foundation.
- **The "Supabase isn't good" critique investigated:** real complaints (RLS performance cliffs, connection exhaustion, dashboard slowness) are scale-gated to ~50k+ MAU. Don't apply at student-scale.
- **Why R2 for clips specifically:** Cloudflare R2 has **zero egress fees** (vs ~$0.09/GB on Supabase Storage / S3). One viral 10MB clip with 10k views = $9 on Supabase, $0 on R2. 50 viral clips/month = $450 vs $0. Video is the only content type where this math gets scary.
- **Other supporting infra locked:** **Resend** for transactional email (Supabase's built-in is unreliable / spam-prone), **Sentry** free tier for error monitoring, **Vercel** for hosting (already wired). Estimated cost at 1k students: ~$25-40/mo total.
- **Hyperscalers (AWS/Azure/GCP) explicitly rejected as a "professional" trap** at this stage — solo dev tax is days-of-life lost; benefit is zero until post-launch scale.

### Storage auth pattern (Supabase ↔ R2 bridge)
Five rules for the auth bridge — should live in a single backend utility (~50 lines) that all upload/view flows use:
1. **Never store raw R2 URLs.** `posts.media_url` holds the R2 object key (e.g. `clips/abc123.mp4`), not a public URL.
2. **Backend issues short-lived signed URLs.** Upload URLs scoped to a specific path + max file size, ~5 min expiration. View URLs only after a permission check.
3. **Permission check uses Supabase session.** Backend verifies the requester's Supabase JWT, queries the post's visibility, returns the signed URL only if allowed.
4. **R2 access keys live server-side only.** Vercel environment variables. Never bundled into client JS.
5. **Delete is two-phase commit.** Delete the Supabase post row first, then the R2 object. If R2 delete fails, log + run a cleanup job. Orphan R2 objects are recoverable; orphan posts pointing to missing clips look broken.

Documented in `DOCS/PHASE_1.md` under "Storage auth pattern" section.

### Profile post/clip card structural spec finalized

**Grid cells (clean, Instagram-style — no action buttons):**
- 3-column consistent square aspect, mobile and desktop
- Post cell: thumbnail/preview — image if the post has one, otherwise body on a colored card matching the post's primary tag
- Clip cell: poster frame thumbnail + small play badge corner + duration pill
- Hover state (desktop): subtle lift + border highlight; **clip cells start playing inline, muted, no controls** while hovered, pause + reset poster on mouse-out
- Tap on mobile (no hover): opens viewer immediately
- No like/comment/save/etc. visible on grid cells

**Viewer (opens when you click a cell):**
- Full-screen modal or dedicated route (decide during implementation; modal simpler)
- Header: avatar + name + handle + timestamp
- Content body: post body or clip with full controls (play/pause/scrub/volume/fullscreen)
- **Action row:** Like (count) · Comments (count) · Repost · Send (DM share) · Save
- **Save button positioned top-right** of the content area, IG-style
- Comment thread expands below the action row
- Esc / click outside / back gesture closes

### Phase 1 spec expanded with safety + ops baseline + dependency reorder

Spec was reordered after a dependency review caught real ordering bugs (Otto onboarder was at item 17 but is the user's first profile-creation flow; connections model was after the feed Following filter that depends on it; calendar was after Otto reminders that fire on calendar events).

**7 new tickets added** to fill gaps that would have caused launch-blocking pain later:
- Cloudflare R2 setup + storage auth utility
- Resend transactional email setup
- Sentry error monitoring
- URL polish (Next.js rewrites — clean URLs like `/feed`, `/profile/maya` instead of `/html/feed.html`)
- Composer (publish posts/clips through Supabase + R2 — was missing entirely)
- Notifications panel (Otto reminders + connection requests + RSVPs need a surface)
- Block + Report (legal/safety floor)
- Account deletion (GDPR/CCPA "delete my data" flow)
- Terms of Service + Privacy Policy pages
- Custom domain (replace `vibe-mocha-iota.vercel.app` with something real like `getvibe.app`)

**Existing tickets expanded:**
- Auth (now includes password reset)
- Otto onboarder (now includes "I'll fill this in myself" skip path)
- Messages (now includes "DMs from connections only by default")
- Settings (now includes account deletion)

**Stages restructured:** 9 → 10. Final order is Foundation / Otto onboarding / Profile + Network / Content viewers + composer + feed / Bookmarks / Messages / Orgs + Calendar / Otto reminders + Notifications / Discover / Safety + Polish.

**Sizing updated:** 50-65 person-days (~10-13 weeks) → **70-85 person-days (~14-17 weeks).** Adding the safety/legal floor and ops baseline costs ~10 days; every one of those would cost 5x more to retrofit later.

**Build-as-you-go rules added to spec:**
- Every new page/component is built mobile-aware from day one (media queries baked in). Stage 10 mobile sweep is for catching gaps, not retrofitting.
- Use the Storage auth pattern for every R2 interaction. Never store raw R2 URLs.
- Use clean URLs from P1-008 onward — no new code that links to `/html/foo.html`.

### Naming reminders cemented
- **Vibe** = brand
- **Clips** = videos (rename queued for late in Phase 1, P1-036)
- **Posts** = text/image posts
- **Discover** = find-people in `campus.html` (formerly "Campus map")
- **Connections** = mutual follow

## Files touched
- MODIFIED: `next.config.ts` (root URL rewrite — async redirects to async rewrites)
- MODIFIED: `public/html/landing.html` (footer cleanup — removed "Session 23" + localhost reference)
- NEW: `DOCS/PHASE_1.md` (the spec) — written 2026-04-29, expanded substantially 2026-04-30 with backend stack section, storage auth pattern, profile card spec, expanded Otto/Messages sections, new build table (37 items / 10 stages)
- NEW: `DOCS/PHASE_1_TASKS.csv` (build items in CSV form for the team master spreadsheet — rewritten 2026-04-30 to match the expanded spec)
- (Tooling) `~/.config/gh` populated, git global config set, repo initialized on GitHub
- (Mirrored?) `public/html/landing.html` should also be mirrored to `~/Desktop/VIBE HUB/ACTIVE/` if that mirror still applies — flag for Franky to confirm.

## Live test flow (verify the new pipeline)

**Auto-deploy works end-to-end:**
1. Edit any file in the repo
2. `git add` + `git commit` + `git push`
3. Vercel build kicks off automatically (visible in https://vercel.com/fracazar-1988s-projects/vibe)
4. Production updates at https://vibe-mocha-iota.vercel.app within ~30-60 seconds

**The shareable URL works without setup:**
1. Open https://vibe-mocha-iota.vercel.app in any browser
2. Land on the cleaned-up landing page (no "Session 23" or "localhost" tells)
3. "View demo site" → feed, full demo Maya experience
4. "Create your profile" → fresh-onboarded flow with empty states (per session 26 work)

## Open / next (in priority order)

1. **James + Rylan begin outreach** with the live demo URL. Targets noted on Franky's whiteboard: Data Science club, CS people, AZTES, USG, Chess Club, BSML, cultural orgs, housing. Brey to reach out to first.
2. **Phase 1 build kicks off — Stage 1 (Foundation).** Items P1-001 through P1-008: Supabase + R2 + Resend + Sentry setup, schema creation, auth flow with password reset, localStorage→Supabase migration, URL polish. **Do these first.** Every later item depends on most of them. Franky will likely run this in Cursor with the Claude extension.
3. **Each Phase 1 ticket should be its own commit** so the team master spreadsheet can mark items Complete one at a time, and each push triggers an isolated Vercel deploy.
4. **Open questions still to resolve** (full list at end of `DOCS/PHASE_1.md`):
   - Exact wording of Otto's onboarding question script (finalize during P1-009)
   - Clip length cap (suggest 60s for v1 — confirm with Franky before composer ships)
   - React routes decision — `src/app/feed/page.tsx` and `src/app/the-map/page.tsx` are experimental scaffolding. Delete them as part of P1-008 URL polish, or keep for future React migration?
   - Whether any orgs need application forms in Phase 1 (default: no)
   - Custom domain choice for P1-034 — `getvibe.app`, `vibe.cc`, `joinvibe.app`, `vibe.so`, `withvibe.com` — Franky picks
   - Graduation policy (when an IU student loses `.edu` access) — product decision before first graduation cohort
5. **~~Storage decision~~** — RESOLVED. Supabase Pro for small files (avatars, banners, post images, resumes), Cloudflare R2 for clip videos.
6. **Backup risk to revisit:** workshop folders (`DOCS/`, `handoffs/`, `otto_mockups/`, `PITCH/`, `RESEARCH/`, `IU MEETING/`, `ARCHIVE/`) live local-only on Franky's laptop. If hardware fails, those notes are gone. Options: separate private repo for docs, remove from .gitignore and put in main repo, or sync to a cloud backup. Discuss next session.

## How to brief the next chat

- **Read `DOCS/PHASE_1.md` end-to-end first.** It's the spec, has all the decisions and the build table. Then read this handoff for the *why* and what's already in place.
- The session's work is mostly **strategic + infra**, not product code. Almost nothing in `public/html/` changed. If the next session continues Phase 1 build (likely in Cursor), it'll be net-new code (Supabase wiring, R2 storage utility, auth, etc.) layered on top of the existing prototype.
- **Naming reminders for all new code/copy:** Vibe (brand), Clips (videos — never "vibes"), Posts (text/image), Discover (find-people in `campus.html`, formerly "Campus map"), Connections (mutual follow). The global "vibes → clips" rename happens at P1-036, but new code should already use the new vocabulary.
- **Otto v1 = onboarder + reminder agent only.** Do NOT add draft generation, metrics dashboards, or cross-platform publishing in Phase 1. Those are Phase 2-5. The spec explicitly excludes them.
- **Backend stack is locked: Supabase Pro + R2 + Resend + Sentry.** Don't propose alternatives unless something changes. Storage uses the 5-rule auth pattern in the spec — never store raw R2 URLs.
- **Profile cards: clean grid cells (no action buttons), action row lives on the viewer.** Save button top-right on the viewer, IG-style. Clip cells auto-play muted on hover.
- **Build mobile-aware as you go.** Stage 10 mobile sweep is for polish, not retrofitting.
- **The deploy pipeline is automatic.** Workflow is: edit → commit → push → Vercel auto-deploys in ~30s. Do not run `npx vercel --prod` manually.
- **Each ticket is its own commit.** Don't bundle work; the master spreadsheet tracks one row per ticket.
- **Sizing reality:** Phase 1 is 70-85 person-days (~14-17 weeks for one person). Don't try to compress; the safety + ops tickets are not optional.

## Memory notes

- New memory written this session:
  - `project_journal.md` — journal location reaffirmed at `/Users/franciscocazares/vibe/public/journal/vibe_journal.html`, edit absolute path even from worktrees
  - `project_handoffs.md` — handoffs at `/Users/franciscocazares/vibe/handoffs/`, naming pattern `YYYY-MM-DD-session-NN-<slug>.md`, leave existing structure intact
- No older memory needed updating; previous Vibe Hub folder reference is no longer applicable (folder removed).
- The **rename "vibes" → "clips"** is the most important new convention to remember in future sessions. Captured here in the handoff and in `DOCS/PHASE_1.md`; not in memory yet because it'll be code-derivable once the rename ships.
