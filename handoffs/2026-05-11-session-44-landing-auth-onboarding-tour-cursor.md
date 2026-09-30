# Session 44 handoff — Landing rewrite, auth redesign, onboarding rewrite, spotlight tour, global cursor (2026-05-11)

This was the biggest visual swing since launch prep started. The landing page is now an Otto-as-tour-guide cosmic experience (typewriter intro → orbital ring system → cinematic dolly → sun CTA → hyperdrive into login). Login / signup / school-email got a frosted-glass redesign with hard "personal email, not your .edu" framing. Otto onboarding moved to a clean `/onboarding` URL via Route Handler, dropped the rename-Otto step, added IU-major and IU-school combobox lookups, and warps into the new profile via the same hyperdrive on Finish. A shared spotlight tour engine now walks first-time users through profile → campus → network in three legs, with a Replay button in Settings for revisits. The custom dot+ring cursor is now mounted globally at the root layout (no more native mac cursor anywhere in the React app), with a `postMessage`-based seam across the `/messages` iframe so a single cursor follows the pointer across the boundary.

Session 43's work (unified `/api/search`, Clips Reel, post-with-video, search bar wiring in both surfaces) was uncommitted at the start of this session and shipped as the first commit (`f290208`) in this batch. Everything in this handoff is **on prod (`connectvibe.app`)**.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for everything below. |
| **`[You]`** | Human — product direction, copy edits, real-time visual feedback. |

---

## 1) What shipped

### Phase A — Landing rewrite (Otto as tour guide)

The old "the network where your AI agent lives" landing got replaced with a five-act narrative. Files: [src/components/landing/home-landing.tsx](src/components/landing/home-landing.tsx) (orchestrator), [src/components/landing/landing-typewriter.tsx](src/components/landing/landing-typewriter.tsx), [src/components/landing/landing-orbit.tsx](src/components/landing/landing-orbit.tsx), [src/app/globals.css](src/app/globals.css).

- **Cosmic backdrop** — radial gradient (warm violet center → near-black edges) over a deterministic 70-star field. Stars are pre-stringified at fixed precision so SSR + client render byte-identical inline styles (the inline numeric style values were causing a hydration mismatch — server rounded, client didn't).
- **Typewriter intro** — two lines, char-by-char with a blinking 3px coral cursor that hops to the latest line. The closing period on each line is rendered as a `<span class="vibe-landing-typewriter-dot">` so it's colored coral — mirrors the `vibe.` logo dot.
  - Copy: `Hey, welcome to vibe.` / `I'm Otto. This is your campus, all in one place.`
  - **Typed exactly once now** — the inline `sentences={[...]}` array was creating a new reference every parent render, which made the typewriter's `useEffect` deps "change" after `setIntroDone(true)`. Pulled the array up to a module-level `HERO_SENTENCES` so the reference is stable.
- **Orbital ring system** — three concentric dashed SVG rings (Pulse coral / Scene gold / Connect sand-violet). Each ring rotates at a different duration (24s / 34s / 48s) and direction. Each carries a clickable moon pill sitting exactly on the orbit line — pill = the moon, no inner dot (which was previously offsetting the visual moon off the ring). A counter-rotation wrapper keeps the label upright as the ring spins.
- **Visit-all-three gate** — orbit eyebrow shows `Pick a form to see how it works · N/3`; three small colored dots above the bottom CTA fill + glow as orbits get visited. Until the third is clicked, the sun CTA isn't exposed.
- **Cinematic dolly into a focused orbit** — clicking a moon: that ring's `r` animates to a card-wrap radius (`FOCUS_RADIUS_PCT = 30`), other rings fade to `strokeOpacity: 0`. The focused moon stops rotating (animationPlayState: paused) and slides along its current angle to the new radius. Other moons keep rotating in the background (invisible) so they're at correct angles when the user clicks Back. A frosted glass feature card renders inside the focused ring with a stylized SVG illustration:
  - **Pulse** — `Your campus, live.` + a heartbeat-style waveform
  - **Scene** — `What's on tonight.` + cascading abstract date tiles (was "Calendar", renamed to fit the cosmic naming)
  - **Connect** — `Find your people.` + a 5-node network graph
- **Sun CTA on unlock** — when all three orbits visited, the central Otto orb scales from 88 → 140 px, emits three staggered ripple halos (`vibe-landing-sun-wave` 3.4s, delays 0 / 1.1s / 2.2s), breathes 1 → 1.05 scale, and a typed-in `Step inside →` label types in below it via the same `TypewriterSequence` (different size/style). The whole disc + label is one `<Link>` carrying `data-warp-trigger`.
- **Hyperdrive warp** — single document-level click delegate intercepts any `data-warp-trigger` element on the capture phase (with `stopPropagation` so it beats Next.js Link's own onClick — Link was navigating before the warp could play). 24 stars streak radially outward from page center via per-star CSS vars (`--sc` / `--ss` / `--sa` carrying cos / sin / angle). Two-phase: 0-25% stars stretch in place (scaleX 18, scaleY 1.2) — the "kicking into hyperspace" beat; 25-100% translate out by `cos*2800px` / `sin*2800px` and scale to 90×0.6. Content scales 1 → 8x with blur, white-cream radial flash overlays at the end. `router.push(LOGIN_HREF)` fires after 750ms. Modifier-clicks (cmd / ctrl / shift / middle) bail before `preventDefault`, so "open in new tab" still works.
- **Skip-to-login link** — small frosted pill at the bottom of the CTA section: `Already have an account? Log in →`. Always rendered (bypasses the visit-all-three gate). Removed the `if (!unlocked) return` check from the click handler — gating is now enforced purely at render time (which elements get `data-warp-trigger`).
- `prefers-reduced-motion` opt-out throughout.

### Phase B — Auth redesign

[src/app/auth/login/page.tsx](src/app/auth/login/page.tsx), [src/app/auth/signup/page.tsx](src/app/auth/signup/page.tsx), [src/app/auth/school-email/page.tsx](src/app/auth/school-email/page.tsx).

- **Shared visual system** — frosted glass card (rgba 0.78 white + 20px blur + 140% saturate) on a cream backdrop with coral/violet radial blooms top-left + bottom-right. Fraunces serif headline, DM Sans body, coral period mirrors the logo. 700ms `vibe-auth-arrive` settle-in animation (`opacity 0→1, translateY 18px→0, scale 0.97→1`) so coming off the hyperdrive flash eases into place. `← back` chip top-left.
- **Login** — `Welcome back.` headline. Subhead leans hard into the personal-email distinction: *"Use your **personal email** — the one you actually check. Your school `.edu` is verified separately."* The `.edu` is rendered as a small monospace coral chip. Field label says "Personal email" with a coral "not your .edu" hint inline; placeholder `you@gmail.com`. Coral submit pill with hover lift.
- **Signup** — `Create your account.` Same personal-email framing. Adds a 3-step indicator strip (`Account` → `.edu` → `Otto`) — coral background wash on the active step. Replaces the older 3-step indicator that had `today / next / last` meta labels (user wanted them dropped).
- **School-email** — `Verify your campus.` *Different* framing — drop your **school email**, the `.edu` one, not the one you signed up with. The `.edu` chip uses a gold variant (`vibe-auth-code--edu`) so it visually differs from the coral chip on signup. The 3-step indicator shows step 1 as ✓ done, step 2 as the active gold chip. Refactored to use `useSearchParams` + `router.replace` (was tripping `react-hooks/set-state-in-effect`) and wrapped in `Suspense` per Next.js requirements.
- All three pages use the `.vibe-auth-*` CSS namespace added at the bottom of [src/app/globals.css](src/app/globals.css).

### Phase C — Onboarding rewrite

Otto onboarding lives as a static HTML in [public/html/onboarding.html](public/html/onboarding.html), but the React app exposes it under a clean `/onboarding` URL.

- **Clean URL via Route Handler** — old bridge page.tsx + layout.tsx deleted. [src/app/onboarding/route.ts](src/app/onboarding/route.ts) is now a `GET` handler that runs the auth + `school_verified` + `isOttoOnboardingComplete` checks server-side, then reads the static HTML file from disk and returns it inline with `Content-Type: text/html`. URL stays `/onboarding` the whole flow — no `/html/onboarding.html` exposure.
- **`?replay=1` bypass** — the route skips the "already complete" redirect when set. The static page reads the same param and:
  - Renders a small amber preview pill: `PREVIEW · YOUR SAVED ANSWERS WON'T CHANGE`
  - `completeOnboarding` short-circuits before the API save and just fires the hyperdrive + navigates back to `/profile`
- **Otto's Step-1 bio rewrite** — old "marketing intern" framing was outdated. New copy: *"think of me as your campus compass. i'll point you to what's loud, what's tonight, and who's on your wavelength — your guide while you build out your home on vibe."* Note line dropped "name me me".
- **Step 2 (rename Otto) removed** — entire section gone, including suggestion chips. `TOTAL_STEPS = 4`. Progress dots renumbered. `state.ottoName` is permanently `'otto'`; existing accounts with custom Otto names are unaffected (they can't reach this page since they've already onboarded). Every `goToStep(...)` call updated.
- **Major dropdown** — free-text input replaced with a `<datalist id="iuMajors">` combobox. `IU_MAJORS` array has 163 curated entries — all Kelley / Jacobs / Luddy / O'Neill / SPEA / College of A&S majors, language departments, pre-professional tracks, plus an "Undecided / Exploratory" first entry. Native autocomplete + free typing for unlisted majors.
- **Department / school dropdown** — same treatment. `IU_SCHOOLS` array has 59 entries — all 15 IU Bloomington schools/colleges + 44 common departments under the College of A&S. `maxlength` bumped 80 → 120 to fit "Luddy School of Informatics, Computing, and Engineering".
- **Hyperdrive on Finish** — self-contained `.ott-warp-*` CSS (different class prefix from the landing's `.vibe-landing-*` so they can't collide). When `completeOnboarding` gets a successful response, instead of immediate navigation it calls `triggerHyperdrive()` which injects 24 streak spans with random-jitter angles, sets `body.ott-warping` (which scales the main shell up 8x + blurs), then `window.location.href = j.next + '&welcome=1'`.

### Phase D — Otto spotlight tour

Shared vanilla-JS tour engine + per-surface integration.

- **Engine** at [public/html/_otto-tour.js](public/html/_otto-tour.js) — `window.OttoTour.start(steps, options)`. Each step has `selector`, `title` (HTML allowed for `<span class="accent">` coral words), `body`, optional `nextLabel`/`endLabel`. SVG mask cuts a rounded spotlight (`rx=12`) around the target element in a dark overlay; a coral-glow speech bubble (Fraunces title + DM Sans body + step counter eyebrow with the pulsing dot motif) positions itself bottom / top / right / left based on viewport space. `resize` + `scroll` reposition the cutout + bubble live. `Next` / `Skip` controls.
- **Profile tour** — [public/html/profile.html](public/html/profile.html). Triggered by `?welcome=1` OR `localStorage.vibe_tour_pending === 'profile'`. Walks: **Banner → Avatar → Bio → Compose**. End-step navigates to `/campus?welcome=1` and writes `vibe_tour_pending='campus'`.
- **Campus tour** — [src/app/campus/campus-home.tsx](src/app/campus/campus-home.tsx). Anchors: `#campus-feed`, `#campus-tabs`, `#campus-search`. `useEffect` triggers on URL flag OR pending=campus. Initial tab forced to `feed` via the `useState` initializer so `#campus-feed` exists when the first spotlight tries to highlight it. End-step navigates to `/network?welcome=1`, pending=`network`.
- **Network tour** — [src/components/network/NetworkPageClient.tsx](src/components/network/NetworkPageClient.tsx) + [src/components/network/OttoCorner.tsx](src/components/network/OttoCorner.tsx). Anchors: `#network-tabs`, `#otto-corner`. Walks **People-sort tabs → OttoCorner**. End step clears the pending flag.
- **Welcome param forwarding** — the chain crosses through two redirects. Both [src/app/profile/[handle]/page.tsx](src/app/profile/[handle]/page.tsx) (server-side redirect to `/html/profile.html`) and [src/app/profile/profile-html-bridge.tsx](src/app/profile/profile-html-bridge.tsx) (client-side redirect via `window.location.replace`) now read `?welcome=1` from the incoming URL and append `&welcome=1` to the static-page target. The bridge was hard-coded `/html/profile.html?app=1` and was dropping the flag entirely.
- **Pending flag survives redirect chains + cached bundles** — the user hit the cached old bridge once and the URL flag was stripped, so the tour didn't fire. Switched primary trigger to a localStorage flag (`vibe_tour_pending`) which the static page checks first. URL flag is still a backup.
- **Settings → Replay tour** — [src/components/settings/SettingsClient.tsx](src/components/settings/SettingsClient.tsx). New `CampusTourCard` between Account info and Blocked users. The button clears all three `vibe_*_tour_seen_v1` keys, sets `vibe_tour_pending='profile'`, and navigates to `/profile/<handle>?welcome=1`. Kicks off the full **profile → campus → network** sequence.

### Phase E — Global custom cursor

The custom dot+ring cursor that lived only on the static prototype pages now runs everywhere in the React app.

- **Single component** at [src/components/CustomCursor.tsx](src/components/CustomCursor.tsx). Coral dot snaps to the pointer; coral ring eases behind with rAF lerp (0.22 step — same feel as the landing's old cursor). Both grow + brighten on hover over `a / button / input / select / textarea / label / [role='button'] / [role='tab'] / [data-cursor-hover]`. Click state on mousedown / mouseup. Skipped on coarse-pointer devices via `matchMedia('(pointer: fine)')`. `prefers-reduced-motion` strips the easing.
- **Mounted at the root layout** — [src/app/layout.tsx](src/app/layout.tsx) renders `<CustomCursor />` once in the body. Every React page in the app inherits it: landing, auth, campus, network, settings, feed, messages, otto. (Initially mounted only inside `CampusAppShell`, but that left landing + auth on the native mac cursor.) `CampusAppShell` no longer mounts its own.
- **Iframe seam via postMessage** — the `/messages` page embeds `/html/messages.html` in an iframe. Iframes are an event boundary (parent doc stops receiving mousemove when the pointer crosses in). To get **one** seamless cursor across LeftNav ↔ iframe content:
  - The static page detects `window.self !== window.top` and hides its own dot + ring (`display: none`). Instead it `postMessage`s mouse state up: `{ source: 'vibe-cursor', type: 'move' | 'down' | 'up' | 'hover-on' | 'hover-off', x?, y? }`.
  - The parent `CustomCursor` listens for `message` events, looks up the originating `<iframe>` by matching `event.source` against each `contentWindow`, and translates iframe-relative coords to viewport coords using the iframe's `getBoundingClientRect()`.
  - Standalone view of `/html/messages.html` (not in an iframe) still uses its own internal cursor — unchanged.
- The CSS rule `body.vibe-cursor-active *` hides the native cursor everywhere, so no mac cursor leaks through.

### Phase F — Session 43 carryover (shipped in this batch)

Documented in detail in [handoffs/2026-05-11-session-43-search-clips-reel-post-video.md](handoffs/2026-05-11-session-43-search-clips-reel-post-video.md). All of it shipped in commit `f290208` (backend) and `b2b36ca` (UI carryover folded in with the tour anchor IDs):

- `GET /api/search` — unified people / orgs / events search, school-scoped events, block-filtered users, `rel` annotation on each user
- Profile + campus search bars both wired to `/api/search`. Recently-searched per-entry × remove. Browser autocomplete suppressed
- Posts/Clips toggle in the Feed tab + TikTok-style `ClipsReel` (9:16 scroll-snap, IO-root-bound auto-play, like/comment/repost/share + double-tap, progress bar, "tap to unmute" hint, sound icons replacing emoji)
- Post-with-video flow: composer auto-classifies (vertical ≤120s → clip, else post-video) with a manual toggle. `/api/me/publish-post` accepts `video_object_key`; `/api/feed` derives `media_kind`; `FeedRow` branches on it to render `<video controls>` for horizontal video posts
- Profile clip thumbnail fallback (deterministic gradient per clip id) for clips published before session 42's `capturePosterFrame` fix

---

## 2) Repo state at session end

- **13 commits on `main`, all pushed to `origin/main`**. Vercel deploy is live on `connectvibe.app`.
- Commit chain (oldest → newest):
  - `f290208` `feat(api): unified search + post-with-video + media_kind on feed`
  - `cf6ea22` `feat(landing+auth): Otto-as-tour-guide landing, hyperdrive warp, redesigned auth flow`
  - `2ddb8d6` `feat(onboarding): clean /onboarding URL, rebrand Otto, IU dropdowns, hyperdrive on finish, replay mode`
  - `b2b36ca` `feat(tour): Otto spotlight tour across profile/campus/network + Settings replay`
  - `73315d8` `feat(ui): custom dot+ring cursor on every shelled page`
  - `3ceb82e` … `b88ca11` `653ae6f` — three cursor-fix iterations landing on the postMessage approach
  - `d9feb1d` `fix(cursor): skip React cursor on Messages — iframe runs its own internally` (later superseded by 653ae6f)
  - `91c02ce` `fix(cursor): mount CustomCursor once at root layout — global on every page`
  - `9758ca2` `feat(landing): skip-to-login link + stop double-typing the hero intro`
- `npx tsc --noEmit` — clean
- `npx eslint src/app src/components src/lib` — one pre-existing warning (`'GlassCard' is defined but never used` in campus-home, carried from earlier sessions; not introduced this session)
- **No migrations this session.** Schema unchanged from session 42.

---

## 3) Known issues / debt

### Carried forward
- **Mobile responsive sweep (#36)** — still untested at 375 / 414. Now also covers the redesigned landing (orbital ring system at small viewports), the auth cards, the 3-step indicator strip on signup, the Settings replay card. Probably 1-2 sessions.
- **Notifications panel (#29)** — still no first-class surface; Otto side panel on `/network` covers some of it.
- **Custom domain swap (#35)** — `connectvibe.app` is live but legal pages still reference `vibe-app.vercel.app`. ~5-minute find/replace.
- **Discover Browse + Departments views (#30, #31)** — empty stubs.
- **localStorage migration (#8)** — carry-over.

### Surfaced this session
- **Otto reminder system + dedicated Otto page (#28)** — **next session pickup.** Currently `/otto` is a stub. Should become: Otto's personality home, his orb at full scale, recent reminders + nudges, settings for how chatty he is. Likely also pulls in the notifications/RSVP reminder logic.
- **Onboarding `?replay=1` is via direct URL only.** No UI surface for replay other than the Settings button. Probably fine.
- **Two-typewriter render double on landing** — fixed this session (HERO_SENTENCES moved to module scope). Worth flagging the general pattern: any inline array passed to `TypewriterSequence` will re-run the typing effect after every parent re-render. Future typewriter uses should either freeze the array at module scope or `useMemo` it.
- **Tour seen-flags** can get out of sync if multiple devices log in. Local-only by design; not worth syncing now.
- **The campus tour anchors `#campus-feed` / `#campus-tabs` / `#campus-search`** assume the page is in the `feed` tab. If a user lands on /campus?welcome=1 with `?tab=events` somehow, the first spotlight target won't exist. Mitigated by forcing tab=feed in the `useState` initializer when `welcome=1` is present, but worth knowing.
- **Custom cursor + Grammarly / 1Password browser extensions** — extension overlays sometimes inject elements that don't get caught by the iframe-or-not check. Untested. Probably fine since the cursor is positioned `fixed z-index: 2147483646`.

---

## 4) Stage 7 plan — what's left

| # | Item | Notes |
|---|---|---|
| 28 | Otto reminder system + dedicated Otto page | **Next session pickup** — user explicitly called it out |
| 29 | First-class Notifications panel | Engagement, partial via Otto side panel today |
| 30 | Discover Browse view | Empty stub |
| 31 | Discover Departments view | Empty stub |
| 35 | Custom domain — swap legal pages to `connectvibe.app` | 5-min find/replace |
| 36 | Mobile-responsive sweep on every page | Launch blocker |
| 38 | Polish + QA + final deploy | The launch |
| 8 | localStorage migration | In-progress carry-over |
| — | Major dropdown + onboarding name lock | **DONE this session** |
| — | Search wiring + recents cleanup | **DONE this session** (Session 43 carryover) |

---

## 5) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-11-session-44-landing-auth-onboarding-tour-cursor.md
and start the Otto page build per §6 — the spec is locked.
```

**Before pickup, run:**

```bash
git status            # should be clean
git log --oneline -5  # confirm session 44 commits on main
npx tsc --noEmit 2>&1 | head -10
```

Dev server on port 3000. Live site on `connectvibe.app`.

---

## 6) Otto page spec — next session pickup

End of session 44 — sketched + locked with the user. Direction picked: **"Otto's Room"** (cosmic, personal) + **Surface + reminders + 'Tell Otto something' input** at v1. Voice: **Watcher** — *"here's what i've been watching."* Tell-otto input is **smart-ish** (parses common time phrases via a ~50-line chrono-lite parser, no LLM).

### Visual layout (single scrolling column on the cosmic backdrop)

```
                         ⭐         ✦              ⭐
                ⭐                                       ⭐
                ⭐               ✦
                          ┌────────────────┐
                          │   ◉ Otto orb   │       ⭐
                          │   128px        │
                          │   breathing    │           ✦
                          │   + 3 halos    │
                          └────────────────┘
                          otto.
                          your campus compass.
                          "here's what i've been watching."
                ─── N nudges · N reminders · N unread ───

                ─── Otto saw ────────────────────────────
                ● Tyler reposted your clip                  2h
                ● Sara liked your #midterms post            5h
                ● 3 new mutuals joined Astro Club           1d
                ● Maya mentioned you in CS chat             1d
                view all activity →

                ─── Coming up ───────────────────────────
                ▶ Astro Club Telescope     Fri 9PM   RSVP'd
                ▶ Spring Career Fair       Mon 10AM  38 going
                ▶ CSCI 401 Final           Dec 16    study?

                ─── Asking for you ──────────────────────
                ▶ Maya O. wants to connect  [Connect] [Pass]
                ▶ 2 unread DMs              [Open inbox →]
                ▶ Reagan replied to your post [view thread →]

                ─── Tell otto something ─────────────────
                ╭─────────────────────────────────────╮
                │  remind me to ___                   │
                ╰─────────────────────────────────────╯

                ─── How chatty should I be ──────────────
                Chattiness  Quiet ○━━━●━━━○ Loud
                ☑ Ping me about RSVPs the day before
                ☑ Ping on mentions
                ☑ Ping on like milestones (10 / 50 / 100)
                ☐ Daily summary at 9 AM
                ☐ Ping on unanswered DMs >24h
```

Each section is a frosted glass card with a thin coral divider + small section eyebrow. Otto orb reuses the landing's `vibe-landing-sun-*` DNA — breathing scale + 3 staggered ripple halos (3.4s, delays 0 / 1.1s / 2.2s).

### Migration (one new file)

```sql
ALTER TABLE public.users
  ADD COLUMN otto_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.otto_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN
    ('manual','rsvp','mention','milestone','unanswered_dm','connection')),
  source_id uuid,
  source_kind text,
  title text NOT NULL,
  body text,
  remind_at timestamptz,
  surfaced_at timestamptz,
  dismissed_at timestamptz,
  acted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otto_reminders_user_remind_idx
  ON public.otto_reminders (user_id, remind_at NULLS LAST, created_at DESC)
  WHERE dismissed_at IS NULL;
-- RLS: SELECT/INSERT/UPDATE/DELETE allowed only when user_id = auth.uid()
```

`users.otto_settings` JSON shape (defaults to empty `{}`; missing keys = preset defaults):

```json
{
  "chattiness": "moderate",
  "rsvp_day_before": true,
  "mention_pings": true,
  "milestone_pings": true,
  "daily_summary": false,
  "summary_time": "09:00",
  "unanswered_dm_pings": false
}
```

### API surface

- `GET /api/me/otto` → `{ activity[], upcoming[], asking[], settings, counts: { nudges, reminders, unread } }` — composed server-side, single roundtrip
- `POST /api/me/otto/reminders` `{ title, remind_at? }` — manual create (client parses time phrases, sends both)
- `DELETE /api/me/otto/reminders/:id` — dismiss
- `POST /api/me/otto/reminders/:id/act` — mark acted (optimistic on client)
- `PATCH /api/me/otto/settings` — partial JSON merge

### Server-side composition for `GET /api/me/otto`

No cron jobs at v1 — everything is computed live on each load:

- **activity** (Otto saw): latest 12 rows from `notifications` joined with actor + post/comment context. Reuse `notification_count` + list helpers from session 38.
- **upcoming** (Coming up):
  - `event_rsvps WHERE user_id = me AND status='going' JOIN events WHERE start_at BETWEEN now() AND now() + interval '7 days'`
  - `otto_reminders WHERE user_id = me AND dismissed_at IS NULL AND remind_at IS NOT NULL AND remind_at > now() ORDER BY remind_at ASC`
  - merged + sorted by date
- **asking** (Asking for you):
  - pending follow requests — `connections WHERE addressee_id = me AND status='pending'`
  - unread DM count from `channel_members`
  - undated reminders — `otto_reminders WHERE user_id = me AND dismissed_at IS NULL AND remind_at IS NULL`

### Chrono parser (`src/lib/otto/parse-reminder.ts`)

~50 lines, deterministic, no library. Recognized patterns:

- `tomorrow`, `tonight`, `today`
- `next (mon|tue|wed|thu|fri|sat|sun|week|month)`
- `in N (min|minute|hour|day|week)s?`
- `at H(:MM)? (am|pm)`
- weekday names alone (`monday`, `tuesday`, …) — next occurrence
- combined: `monday at 3pm`, `tomorrow at 9`

Returns `{ title: string, remindAt: Date | null }`. Unrecognized patterns → `remindAt: null`, full string preserved as `title`. Unit tests live next to the parser.

### Component files

- `src/app/otto/page.tsx` — server entry, auth gate, renders `OttoPageClient`
- `src/components/otto/OttoPageClient.tsx` — fetches data, holds settings state, owns optimistic mutations
- `src/components/otto/OttoHero.tsx` — orb + voice + stats line
- `src/components/otto/OttoSection.tsx` — shared shell (eyebrow + divider + body)
- `src/components/otto/OttoActivity.tsx` — Otto saw list
- `src/components/otto/OttoUpcoming.tsx` — Coming up list (events + dated reminders)
- `src/components/otto/OttoRequests.tsx` — Asking for you list (pending follows + DMs + undated reminders)
- `src/components/otto/OttoTellInput.tsx` — input + parser hookup + optimistic add
- `src/components/otto/OttoSettings.tsx` — chattiness segmented control + toggles, debounced PATCH

### CSS

Reuse `.vibe-landing-*` cosmic backdrop + starfield as a base, but namespace the Otto-page rules `.otto-room-*` so future landing changes don't accidentally cascade. The starfield deterministic-noise generator + per-star CSS-var pattern is already proven — copy that approach.

### What to ship in session 45

1. Migration `20260512000000_otto_reminders_and_settings.sql` — apply locally + via Supabase MCP (write access this session, hopefully)
2. `GET /api/me/otto` route handler + the three composition helpers
3. Otto page React rewrite — hero + 5 sections
4. Reminder mutation routes (POST / DELETE / POST act)
5. Settings PATCH route + segmented control + toggle wiring
6. Chrono parser + tests
7. Sanity sweep: `tsc`, `eslint`, hit each section as the founder account, verify settings round-trip

Defer to a session 45b or beyond:
- Background scheduler for time-based fanout (cron / trigger that creates `otto_reminders` rows ahead of time). For now the page computes on load.
- LLM-driven "Tell Otto something" upgrade.
- Daily-summary email via Resend.
- Connecting Otto's settings to actual notification filtering elsewhere in the app (this commit just stores the preferences).

---

## 7) Key files touched / created this session

### New
- `public/html/_otto-tour.js` — shared spotlight tour engine (~270 lines)
- `src/components/landing/landing-orbit.tsx` — `OrbitalRingSystem` + `OrbitDetail` + 3 feature cards + illustrations
- `src/components/landing/landing-typewriter.tsx` — `TypewriterSequence`
- `src/components/CustomCursor.tsx` — global cursor + iframe postMessage receiver
- `src/app/onboarding/route.ts` — Route Handler that serves the static onboarding HTML inline under `/onboarding`

### Modified
- `src/components/landing/home-landing.tsx` — full rewrite (5-act narrative, hyperdrive warp, gate, sun CTA, skip link)
- `src/app/globals.css` — `.vibe-landing-*` (~600 lines) + `.vibe-auth-*` (~300 lines) + `.vibe-cursor*` (~60 lines) + step indicator + .edu chip variant
- `src/app/auth/login/page.tsx` — full visual rewrite
- `src/app/auth/signup/page.tsx` — full visual rewrite + 3-step indicator
- `src/app/auth/school-email/page.tsx` — full visual rewrite + Suspense + useSearchParams refactor
- `src/app/layout.tsx` — `<CustomCursor />` mounted globally
- `src/components/campus-app-shell.tsx` — removed `<CustomCursor />` (now at root)
- `src/app/profile/[handle]/page.tsx` — forwards `?welcome=1` through the redirect
- `src/app/profile/profile-html-bridge.tsx` — forwards `?welcome=1` through the bridge
- `src/app/campus/campus-home.tsx` — anchor IDs, tour trigger useEffect, initial-tab override when welcome flag set
- `src/components/network/NetworkPageClient.tsx` — anchor ID, tour trigger
- `src/components/network/OttoCorner.tsx` — `id="otto-corner"` anchor
- `src/components/settings/SettingsClient.tsx` — `CampusTourCard` with Replay button
- `public/html/onboarding.html` — Step-1 bio rewrite, Step-2 removed, IU majors + IU schools datalists, hyperdrive overlay + JS, `?replay=1` preview pill + skip-save branch
- `public/html/profile.html` — welcome script replaced with tour engine wiring (+ session 43 search carryover)
- `public/html/messages.html` — embedded-mode cursor forwarder (hides own cursor, postMessages to parent)
- `src/lib/auth/email-confirm-redirect.ts` — dropped the unused `ONBOARDING_STATIC_PATH` const

### Deleted
- `src/app/onboarding/page.tsx` (replaced by `route.ts`)
- `src/app/onboarding/layout.tsx` (auth checks moved into the route handler)

### Touched (session 43 carryover, shipped in `f290208` + `b2b36ca`)
- `src/app/api/search/route.ts` (new) — unified search endpoint
- `src/app/api/feed/route.ts` — `media_kind` derivation
- `src/app/api/me/publish-post/route.ts` — `video_object_key`
- `src/app/api/clips/[id]/view-url/route.ts` — allow `type='post'` rows

---

## 8) Deploy state — LIVE

All 13 commits are on `origin/main` and Vercel has built + deployed. Spot-check URLs on `connectvibe.app`:

- `/` — full landing experience (typewriter once, orbital, sun CTA after all three clicked, hyperdrive warp on Step inside)
- `/auth/login`, `/auth/signup`, `/auth/school-email` — frosted-card redesign with personal-vs-.edu messaging
- `/onboarding` — clean URL, no `.html` in the bar; finishing the flow warps into `/profile?welcome=1`
- `/profile?welcome=1` — Otto tour fires (Banner → Avatar → Bio → Compose), end-step warps into Campus
- `/campus?welcome=1` — Campus tour fires (Feed → Tabs → Search), end-step warps into Network
- `/network?welcome=1` — Network tour fires (Tabs → OttoCorner), end clears the flag
- `/settings` → **Replay tour** button — kicks off the whole chain again
- Cursor visible coral dot+ring on every React page (no mac cursor). One cursor on `/messages` even across the iframe boundary.

The next handoff should pick up at **§6 — Otto page spec is locked**.
