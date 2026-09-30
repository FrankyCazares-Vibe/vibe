# Session 55 handoff — the demo is gone (2026-09-08 → 09)

Started from §4-1 of the Session 54 handoff. Ran as Fable orchestrator with
discovery and implementation workflows, finishing on Opus after the Fable
limit ran out (see §5 for what that cost and what to do differently).
**Next session starts at §4-1: DM photos and videos are invisible on a phone.**

## §1 — What shipped (all live on www.connectvibe.app)

| Commit | What | Notes |
|---|---|---|
| `2ebc276` | **No more anonymous demo.** `ANON_REWRITE_HTML` and `STATIC_ONLY_HTML` are gone; every `/html/*.html` URL is gated (anonymous → `/auth/login?next=<clean route>`; signed-in served only with `?app=1` for profile.html + messages.html, else redirected to the clean route). Only exception: `/html/profile.html?handle=<h>`, the public profile viewer desktop share links land on. Closes sentinel #8 (raw `/html/onboarding.html` served the real flow to anyone). | acceptance (a), (e) |
| `2ebc276` | **`middleware.ts` → `src/proxy.ts`.** See §2 — the root file was honoured by `next build` but silently ignored by every local dev server. | |
| `2ebc276` | **Map API stops fabricating.** `DEMO_MAJORS` / `DEMO_ORGS` / `buildDemoBuckets` / `?demo=1` deleted. No campus → `majors: [], orgs: [], reason: "no_school"`; no peers → empty arrays; empty zone → empty buckets. | sentinel #5 |
| `2ebc276` | **`/profile/<unknown>` is a 404** — `notFound()` was swallowed by the outage-tolerant catch; `loadPublicProfile` now throws on Supabase errors so a missing handle 404s and an outage still mounts the client. | sentinel #27/#37 |
| `2ebc276` | **Landing gets a sign-up door**: the sun CTA and an always-visible "New here? Create your account" pill go to `/auth/signup`; "Already have an account? Log in" stays; the warp animation navigates to the clicked element's own href. | sentinel #28 |
| `2ebc276` | **`/opportunities` → `/campus`** (next.config redirect). The prototype with its fake "✓ Applied" / "Post" had no product behind it. | sentinel #30, acceptance (c) |
| `bb86c8f` | **Six prototypes deleted**: `feed`, `campus`, `network`, `opportunities`, `landing`, `otto` `.html` — reachable only through the retired rewrites; nothing links to them. 48 persona references went with them. Git history keeps them. | acceptance (b) |
| `1794253` | **Map clients honest** (desktop + mobile): loading → "Couldn't load the map" → "Pick your campus in Settings to see your map" (link to `/settings#campus`, new anchor) → "No zones yet" → map. Zone drill-in: no more "Loading…" forever on a non-ok response; all-buckets-empty line instead of "try Discover" when Discover is empty too. Recenter hidden until zones exist. | client half of #5 |
| `2ae341b` | **`/the-map` founder roadmap is platform-admin only** (anonymous → login, non-admin → 404). It was public and indexed with stale metrics, cofounder task lists, investor targets. Dead mobile "Org settings (coming soon)" button removed. | found by the sweep |
| `7f8a405` | **messages.html**: the fabricated inbox (Kwame / Priya / Luca / Zara / "Jamie Reid · Stripe", `const T`, the fake Kwame auto-reply, the Maya sidebar chip) is gone; skeleton rows until `/api/me/threads` paints, retry state on failure. **Two front-door fixes**: a signed-in student whose first desktop page was `/messages` (empty localStorage) was bounced to the landing page — now bootstraps identity from `/api/me/profile-bootstrap` (401 → login, 403 → `/auth/terms`); and desktop now honours `?channel=<id>` (sentinel #17 — this was §4-5 work, done early because the code was open). Also `_miniMessenger.js`, `_postViewer.js` (no more "demo post" toasts), `onboarding.html` + `build-vibe-user-v1.ts` drop `_isDemo`. | |
| `ac00ff1` | **profile.html**: every Maya value is a neutral placeholder so the pre-fetch DOM equals an empty user's; the pre-paint guard also arms for `?handle=` viewers (share links fade in instead of showing Maya during the fetch); **the composer avatar now shows the owner's initials — every real owner was seeing "MC"**; edit mode gets a permanent placeholder rule; mock-user branch (`?user=`, `VIBE_MOCK_USERS`, 25 `viewingMockUser` reads) and demo branch gone; empty state is a loading/recovery state (401 → login, 403 → Terms, else "Sign in again / Try again") instead of "Load demo profile"; "N mutual" pill hidden (always 0, static modal — sentinel #29); verification CTA opens `/auth/school-email` instead of a fake modal. `_persistence.js` loses `seedDemoData` / `exitDemoMode` / `vibeShowDemoPill` / `?demo=1` / the 'Maya Chen' fallback. **Deleted:** `_mockUsers.js`, `_studentVerify.js` (a "Demo mode" modal that forged a Student badge into localStorage). | |
| `866251e` | Campus banner no longer stamps "Indianapolis, IN" on every IU campus. | |
| `d701178` | **The product journal is out of search results.** `public/journal/vibe_journal.html` documents the RLS/service-role model, past vulnerabilities and the pentest plan, and was world-readable and crawlable. robots excludes `/journal/`, responses carry `X-Robots-Tag: noindex`. The URL still works, so nobody's access breaks. | found by the sweep |
| `5d11145` | **Two live 404s a new student hits.** The campus empty state (first screen after verification) linked "Discover orgs" to `/campus/discover`, which never existed; Otto's activity card linked to `/notifications`, which does not exist. | sentinel dead-ends |
| `8cdafec` | **Fixes from the adversarial review** (see §3a) — five things this session introduced, four pre-existing ones on the screens it rewrote. | |
| `9672e7a` | **The mobile Orgs tab showed no clubs** — it asked the API for "my orgs" instead of the directory, so any student who had not joined one saw an empty tab. Rated Blocking by the second sentinel run. Also: the "No zones yet" Map copy no longer implies you are waiting on other people's majors. | report-2 #1, #10 |
| `563b5ff` | **The six design principles are back in the journal**, with the two we are not honouring recorded beside them. See §2. | recovered, not written |
| `4b6e2d6` | **Both sentinel scripts are committed.** 592 lines of project-specific tooling that was gitignored, never committed and backed up nowhere — the same failure mode as the design principles. `.gitignore` keeps the rest of `.claude` local. | |
| `f6f0912` | **Reports now explain themselves.** Every finding in both sentinels opens with an **In plain terms** paragraph: no jargon, what a student sees, why it matters, and it must stand alone. Mechanism/fix/evidence stay below for the engineer. Exec summary and fix order got the same treatment; the security risk register states consequences, not mechanisms. **New skill `audit-sentinels`** covers all three audits plus the operational rules. | Franky asked for this |
| local→committed | `.claude/workflows/feature-sentinel.js` gained `args.lenses` (subset run). | §5 |

Verification (anonymous curl, production, after each deploy): `/feed` `/campus` `/network` `/messages` → 307 login (were 200 demo); `/html/onboarding.html`, `/html/profile.html`, `/html/feed.html?app=1`, `/html/messages.html?app=1`, `/html/otto.html` → 307 login (were 200); `/html/profile.html?app=1&handle=frankycazares` → 200 (share links intact); `/html/profile.html?user=x` → 307 `/profile/x`; `/opportunities` → 307 `/campus`; `/profile/nope-nope-404` and `/profile/mayachen12` → 404 (were 200); `/the-map` → 307 login (was 200); landing HTML has both `/auth/signup` and `/auth/login`; the anonymous `/campus` body has 0 persona hits (was 11). `git grep` for every persona name, `_isDemo`, `seedDemoData`, `DEMO_*`, `VIBE_MOCK_USERS`, `studentVerify` across `src` + `public` (journal excluded) → **zero**. `tsc` clean; eslint has only pre-existing warnings; every inline `<script>` in the three surviving static pages parses.

**Not verified:** anything that needs a signed-in browser. No Chrome extension was connected and the in-app browser could not reach external sites, so the owner profile, viewer profile, desktop messages and the Map empty states were verified by code reading + syntax checks only. §4-1a below.

## §2 — Decisions and discoveries

- **The dev server never ran the middleware.** With an `src/app` layout, Next 16's dev watcher registers only `src/{proxy,middleware}.*`; `next build` also accepts the repo root. So `middleware.ts` at the root ran on Vercel and was silently skipped by every local `next dev` — every local probe of a rewrite or redirect in the project's history was meaningless. Moved to `src/proxy.ts` (Next 16's non-deprecated convention; having both names is build error E900). Memory: `project_proxy_dev_prod`. First thing to check when a local probe disagrees with production.
- **Delete, don't scrub, the pure-demo pages.** The handoff said "the pages stay"; that applies to the three that ARE the app (profile, messages, onboarding). The other six had no reachable path once the rewrites went, so scrubbing personas inside dead files was busywork. Git keeps them.
- **The design principles were lost and are now recovered.** Six principles written on 2026-04-01 lived only in `~/Downloads/vibe-journal.html`, a prose document that was never committed. Nothing in the repo, the handoffs or the vault referenced them. One of them, *No vanity metrics*, says we do not show follower counts on profiles by default, and the profile had been shipping an invented "1.2k followers / 847 connections / 32 mutual" for five months. They are now a section in the live journal with a callout naming the two we are not honouring (*Show, don't list* while Clips are parked; *Both sides must win* now that the jobs half redirects away) and the one we are (*Your signal, your control*). **Worth considering as a third sentinel question** — the two existing ones ask "can this be attacked?" and "does this still work?"; "does this break a principle?" would have caught the fabricated counts the week they shipped.
- **There is now a third audit, and it is the one that caught this session's own bugs.** The two sentinels audit the committed state as if a stranger wrote it, so a regression you introduced an hour ago looks like intended behaviour. The self-review pass — 2-3 reviewers over `git diff <pre-session>..HEAD`, each with a distinct lens, one of them driving the real pages in a browser against a stubbed API — found nine issues including five this session created. All three modes are written up in the `audit-sentinels` skill. **Run the self-review at the end of every session that changed code.**
- **`/opportunities` redirects rather than 404s** — no `not-found.tsx` exists, and old links should land somewhere sane.
- **`/the-map` gated, not deleted.** It is stale (April) and was public; whether the founders still want a roadmap page is their call — as an admin Franky can still open it.
- **`_studentVerify.js` deleted.** It was a fake verification flow (its own microcopy said "Demo mode — clicking simulates a link click") that wrote a Student badge to localStorage only. The real flow is `/auth/school-email` (A3); the CTA points there now.
- **Map cold start = honest prompt, not fake zones.** With all 8 users on `school=''`, every user's first Map view is "Pick your campus in Settings". That is the truthful state; it also means §4-7 (Franky picks a campus) is now user-visible.
- **`?channel=` on desktop messages (sentinel #17) was fixed early** because the init path was being rewritten anyway; it is desktop-only, the mobile side was not touched.

## §3a — The adversarial review that the model limit ate

The implementation workflows all finished their edits, but their reviewers died
on a usage limit. Re-running them afterwards (3 agents, one of which served
`public/html` against a stubbed API and drove the real pages in a browser,
including a parent page that iframes messages.html exactly as MessagesSwitch
does) found nine things. All are fixed in `8cdafec`.

**Introduced by this session — worth knowing how each slipped through:**

1. **The campus empty-state card I added did nothing.** `/campus?tab=orgs` is a
   same-route `<Link>`, and `tab` is seeded from `?tab=` in a `useState`
   initializer that never re-runs. The URL changed, the view did not. It is a
   button calling `setTab("orgs")` now. *Lesson: in this file, tab deep links
   only work on a fresh load.*
2. **The messages retry state turned an expired session into a permanent dead
   end.** `__dmLoadList` threw on any non-ok body including 401, and the new
   catch painted "Check your connection" with a Retry that could never work —
   forever, because a returning user's warm localStorage skips the bootstrap
   that would have caught the 401. Now 401 → login, 403 `terms_required` →
   `/auth/terms`, and the connection copy is kept for real fetch failures.
3. **The profile recovery state had no watchdog** — its buttons are revealed
   only by `_emptyFail`, so a request that never settles left the user on "one
   sec — loading your profile" with nothing to click. 8s timeout added.
4. **The Map search box floated over the new empty states** and could never
   return a result there (`majors` is `[]` in all of them). Gated on `hasData`,
   like Recenter.
5. **A `?channel=` not present in the loaded list was silently dropped.** It
   now says so in the right pane.

**Pre-existing, but on the screens this session rewrote (so they are ours now):**

6. **Links inside the messages iframe navigated the iframe.** The empty state's
   "Find people →" and every @mention in a DM rendered the whole React app
   nested inside the messages frame — two left navs, address bar still on
   /messages. Reproduced in a browser. Both use `__vibeTopNav` now.
7. **The Edit pencil was live on other people's profiles.** The viewer-mode CSS
   hides `.edit-toggle`; the button is `#editToggle` and carries no such class.
   S55 made it worse: the new pre-paint guard blanks the profile during the
   bootstrap, leaving the pencil the only visible control.
8. **The messages calendar's "New Event" threw** — it opens `#createEventModal`,
   whose markup exists only in profile.html. The affordances are removed (the
   calendar there is localStorage-only anyway).
9. Reported, deliberately **not** fixed here: `handleSoftFollow` on the desktop
   profile reports success for any non-2xx from `/api/me/follow` (that is
   report row 24, part of the §4-3 silent-writes cluster — fix it with the
   whole pattern, not one-off), and the messages sidebar loses its active-thread
   highlight on every 30s poll (cosmetic, in the polling code).

## §3b — Feature sentinel: second run (2026-09-09)

Five lenses (recent-regression, live-smoke, dead-ends, render-blockers,
contract-drift) rather than all ten, using the new `args.lenses` subset — a
targeted re-check of the surfaces this session touched. Report:
`handoffs/2026-09-09-broken-features-report-2.md`.

27 agents, ~1.4M tokens. **19 live findings, 18 confirmed broken, 2 dropped as
already fixed** (it independently re-found the two 404s fixed in `5d11145`) and
1 false positive. Nothing it found was caused by the demo strip: the anonymous
gate matrix behaves exactly as designed, verified independently by the
live-smoke lens and by the review in §3a. Findings 7 and 19 (the messages
iframe links, the calendar "New Event") were fixed in `8cdafec` while the run
was in flight; finding 1 and half of 10 are fixed in `9672e7a`.

Its own summary of the pattern is worth keeping: *the surfaces you personally
use — signed in, on desktop — are healthy, and the surfaces you don't are where
the drift accumulated.* Almost every finding is a client asking the API for a
field it does not send, and rendering empty instead of erroring.

**The two it rated Blocking, both mobile:**

- **The Orgs tab showed no clubs** (finding 1) — mobile fetched `/api/orgs`
  with no query, which defaults to `filter=mine`, so every student who had not
  already joined an org saw an empty directory and concluded the app was dead.
  Desktop always asked for `filter=discover`. **Fixed** in `9672e7a`.
- **DM photos and videos are invisible on a phone** (finding 2) — the bubble
  renders `content` only; `MessageRow` in `MessagesMobile.tsx` does not even
  declare `media_url` / `media_kind`, though the server sends and signs them
  and desktop renders them. **Not fixed here**: this is report row 16, the
  §4-5 parity cluster, and it is real component work rather than a one-liner.
  It should be the first thing in that cluster — messaging is the reason
  someone opens the app twice.

**Also worth pulling forward** (details and file:line in the report):

- **#5 four post APIs return the raw R2 object key instead of the proxy URL**,
  so post images are broken everywhere except the feed (profile posts, the
  viewer, saved posts). One shared helper, three or four call sites.
- **#3 / #10 the Map is empty for every account** because no user row has a
  campus — and picking one in Settings only swaps the empty state, since no
  peer shares it. The real fix is a back-fill: get all 8 accounts onto a
  campus at once (§4-7), not more code. The copy is honest now either way.
- **#4 a profile share link opened on a phone hard-redirects to the squashed
  desktop page**; **#11 post links unfurl as a blank "Vibe" card** because the
  page 307s to login before a crawler reads the OG tags; **#12 the homepage has
  no OpenGraph metadata at all**; **#8 every 404 is Next's stock white page**
  (there is no `not-found.tsx` anywhere). Together these are the whole sharing
  surface, which is the only organic growth channel — worth one batch.
- **#6 the mobile unread dot is computed from a field the API never sends**, so
  it never clears; **#9 DM media signed URLs expire after 5 minutes** and the
  desktop client deliberately refuses to refresh them; **#18 no cache headers
  on R2 media**, so every image re-downloads on every page load.
- **#17 trending hashtags and event search still hard-filter on raw
  `users.school`** — the S54 report's rows 41/42, still latent, and it fires
  the moment anyone picks a campus. Fix it **before** the campus back-fill.

## §4 — Pick-up list (in priority order)

Reordered after the second sentinel run. The old S54 numbering is kept in
brackets so the two reports still line up.

1. **Mobile DM media — the one Blocking break left** [S54 row 16, report-2 #2].
   Photos and videos sent in a DM are invisible on a phone: the bubble renders
   `content` only, and `MessageRow` in `MessagesMobile.tsx` does not declare
   `media_url` / `media_kind`, though the server selects and signs them and
   desktop renders them at `messages.html:1304-1306`. Messaging is why someone
   opens an app twice. Do this first. While in there: report-2 #9 says DM media
   signed URLs expire after 5 minutes and the desktop client deliberately
   refuses to refresh them.
2. **The post-image URL contract** [report-2 #5]. Four post APIs return the raw
   R2 object key instead of the proxy URL, so post images are broken everywhere
   except the feed: profile posts, the post viewer, saved posts. One shared
   helper, a handful of call sites, and it fixes three surfaces at once.
3. **Empty states that lie** [S54 rows 11–14, 44]. Distinguish "failed" from
   "empty" on feed, network, mobile messages and events; never wipe an
   already-loaded list on a failed refetch. The Map now has the pattern to copy
   (`loadFailed` → `noSchool` → `!hasData`). Do it in the same pass as the
   contract-drift siblings: report-2 #6 (the mobile unread dot is computed from
   a field the API never sends, so it never clears) and #13 (DM profile cards
   read four fields the bootstrap does not return).
4. **The sharing surface, as one batch** [report-2 #4, #8, #11, #12]. A profile
   link opened on a phone hard-redirects to the squashed desktop page; post
   links unfurl as a blank "Vibe" card because the page 307s to login before a
   crawler reads the OG tags; the homepage has no OpenGraph metadata at all;
   and every 404 is Next's stock white page because no `not-found.tsx` exists
   anywhere. Sharing is the only organic growth channel, and right now all four
   of its steps look broken.
5. **Signed-in verification of everything Session 55 touched** [§4-1a]. Still
   the biggest gap — do it the moment a logged-in browser is available, and
   before inviting anyone new. With a logged-in desktop: `/profile` (owner: no
   "MC" in the composer, name/handle/tagline hydrate, edit mode shows
   placeholders), `/profile/<handle>` signed-in and in a private window
   (fade-in, no persona text at any point, no "N mutual" pill), `/messages` on
   a fresh browser (skeleton → list, no bounce to `/`), `/messages?channel=<id>`
   opens that thread, `/campus` → Map shows the Settings prompt and the link
   lands on the Campus card. On a phone: the Map tab prompt, and the Orgs tab
   now listing all five clubs.
6. **Writes that silently fail** [S54 rows 21–26, 36, 46]. Fix as one pattern,
   not one-off: check the response, surface the failure, reconcile the
   optimistic UI. The adversarial review confirmed row 24 specifically —
   `handleSoftFollow` in `profile.html` reports success for any non-2xx from
   `/api/me/follow`.
7. **Hardening fallout** [S54 rows 2, 3, 7, 33, 34] + **inert data** [4, 6, 40].
   Includes re-applying `notify_on_connection_insert` via curl (the live
   function is the pre-migration body, so `type='connection'` notifications
   have never fired). Unchanged from S54.
8. **Remaining desktop/mobile parity** [S54 rows 18, 19, 20/31]. #16 is item 1
   above; #17 (`?channel=`) shipped this session.
9. **People.** **Franky picks a campus in Settings** — the Map now tells every
   user to, and until a few accounts share a campus the map stays empty even
   after they do (report-2 #3/#10: the fix is a back-fill, not more code).
   **Fix report-2 #17 first**: trending hashtags and event search still
   hard-filter on raw `users.school`, so they go blank for the first person who
   sets one. Also confirm the post-DMARC test email's inbox placement.
   **Decided 2026-09-09: the teammates' missing Terms acceptance is NOT a
   blocker while we are still building.** Seven of eight accounts have no
   consent record, so they are held at `/auth/terms` and cannot post or
   message. That is the gate working as designed, and those accounts are not
   needed yet. Revisit before real testers arrive, and do not spend a session
   chasing it.
10. **Legal** — unchanged from S54: Franky resolves the `[DECISION]` markers,
    a reviewer answers the six questions, then publish and bump
    `TERMS_VERSION` in the same deploy.
11. **Milestone check:** security-sentinel re-run — `src/proxy.ts` is new
    attack surface for it to read, and the gate matrix is worth a second
    opinion. Then §C from the S52 handoff.
12. **Residuals and carry-overs.**
    - `_otto.js` still contains the fabricated cross-posting flow ("shipped to
      LinkedIn & Instagram", ~lines 861-1222), unreachable now that feed.html
      is gone. Delete when convenient; verify block boundaries with grep first.
    - `/api/users/[handle]/bootstrap` hardcodes `mutual: "0"` — the seam if
      real mutuals are ever wired. The pill stays hidden until then.
    - The Map's org rail lists the 20 most-recently-active orgs **platform-wide**
      (`campus-map/route.ts` ~132, despite its comment), so a user who picks a
      campus can still click into an org from another one.
    - `messages.html` "Connections" tab is a no-op (`switchTab` only implements
      unread). Pre-existing.
    - The messages sidebar loses its active-thread highlight on every 30s poll,
      and the in-flight search filter is wiped with it.
    - report-2 #18: no cache headers on R2 media, so every image and video
      re-downloads on every page load. #16: `/auth/login` server-renders only
      "Loading…". #14, #15: two cosmetic leftovers on the desktop profile nav.
    - Optional polish skipped: `.meta-item.is-empty` (a blank Location/Web row
      shows a bare label in view mode); glance-card and People-also-viewed dead
      code in `profile.html`.
    - S50 product carry-overs unchanged: QA mobile onboarding and the Otto tour
      on a real phone, video in feed/DM on a phone, one real student end to
      end, Search Console re-index, per-campus majors taxonomies.

## §5 — Notes for whoever runs the workflows and sentinels

- **Session limits killed five workflow runs this session** (two 8-agent discovery runs, three implementation runs' verifiers). Nothing is cached when every agent is in flight. What worked: **batches of 3–5 agents with a barrier between batches**, so finished agents are journaled and `resumeFromRunId` replays them; narrow prompts with the established facts baked in ("do not re-derive"); `grep -n` + `sed -n` discipline on the 10k-line static pages. Total this session ≈ 4.7M subagent tokens, of which ≈ 2.6M produced nothing.
- **Implementers finished, reviewers did not.** Every implementation agent completed its edits and self-checks before the limit hit; the adversarial reviewers and the final gate died. The orchestrator verified in their place (greps, `node --check` of every inline script, tsc, eslint, diff reading, curl). That is a weaker guarantee than the two-lens review — 1a above is the compensation.
- **Sentinel:** `args.lenses` limits the run to a subset; unknown keys are logged and ignored. Full 10-lens milestone runs still cost ~60 agents / 5M tokens / 30 min. Resume on failure rather than restart.
- Management API for migrations: curl, not Python (Cloudflare 1010).

### Session 56 kickoff prompt

> Read the latest handoff (`handoffs/2026-09-09-session-55-strip-demo-personas.md`) and the second broken-features report next to it (`handoffs/2026-09-09-broken-features-report-2.md`), then work §4 in order. Item 1 is the only Blocking break left: photos and videos sent in a DM are invisible on a phone, because `MessageRow` in `MessagesMobile.tsx` never declares the media fields the server already sends and desktop already renders. Item 2 is the post-image URL contract, item 3 the empty states that lie. Do item 5, the signed-in verification of everything Session 55 touched, the moment a logged-in browser is available — it is still the biggest gap. Read the Principles section of the journal before making product calls; §2 explains why it is there. Orchestrator mode with ultracode workflows in small batches of 3–5 agents with barriers between them (see §5 for why); commit and push as you go.
