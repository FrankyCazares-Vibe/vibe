# Vibe — Broken Features Report

**Prepared:** September 7, 2026  |  **Target:** https://www.connectvibe.app  |  **Method:** read-only breakage audit — 10 lenses over code, live database state, and the running site, with every user-impacting finding independently re-checked before it was kept.

> **What this is.** The sibling of the security report. That one asks "can someone attack this?"; this one asks "does this still work?" It hunts the failures that do not throw — a feature that renders nothing, a filter on data that is always empty, a defensive header that blocks a real screen — because those are invisible to type checks, to builds, and to a security review.
>
> **Scope.** Read-only: nothing was modified, no data was written, no migration was run. **No signed-in session was available**, so anything behind login was assessed from code and database state only — findings marked "needs authed test" are unconfirmed and should be checked with a real account.

**At a glance:** 50 live findings — 38 confirmed broken, 11 needing a live check. Verification dropped 0 already fixed and 4 false positives.

---

## Executive Summary

Vibe is usable right now — a student can sign up, land on a campus, post, browse and read messages — but it is not a product you would hand to a new tester without standing next to them. The worst thing a tester hits is the campus email verification gate: the 3-per-hour rate limit counts rejected and failed attempts, so a student who mistypes their IU address three times is locked out for an hour, has received zero emails, and is told only "too many requests" with no indication of how long to wait or what went wrong. That is a hard stop at the front door, before the student has seen anything worth staying for.

There is a clear pattern, and it is mostly self-inflicted. The recent security hardening pass tightened the database and the routes faster than the UI caught up: tables got RLS enabled without the policies the app needs (view counts read as zero, declining a message request silently fails), routes got consent gates before the Terms screen they point to existed (Settings shows a raw "Accept the Terms to continue" with nothing to click), and a rate limiter meant for abuse now punishes typos. A second, older pattern sits underneath: the app is really two front-ends — static HTML pages for desktop and React for mobile — and features live in only one of them. Notification badges, profile-view counting, message attachments, and the `?channel=` deep link each exist on one side and quietly do nothing on the other. Third, several counters and panels were built against assumptions that no longer hold — Otto's stat tiles window to 30 days while the list under them does not, so most users see zeros above a full inbox, and the Map tab still renders fabricated majors, orgs and headcounts with no "preview" label.

Three things cost the most trust with a real pilot user. First, the verification lockout, because it happens before any value is delivered and reads as "this app is broken" rather than "I made a typo." Second, the empty states that lie: when an API returns 401 or 500, the campus feed says "No posts yet," the network page says you have no followers, and mobile messages wipes an already-loaded conversation list to "No conversations yet." A student cannot distinguish an outage from data loss, and the natural reading is that their account got wiped. Third, the fabricated Map data, because it is the one break that damages credibility rather than function — a student clicks a "700-member CS club," finds a blank profile, and concludes the whole app's numbers are made up, including the real ones.

Plenty is not broken, and that matters. Signup, session handling and the authenticated app shell work. Posting, commenting and the feed itself work when the API responds — the failures above are display-layer honesty problems, not write failures. Desktop messaging works end to end, including attachments, shared posts and reply quotes. The server-side redaction work from the last session holds: viewers only receive burned-in derivatives. Profile bootstrap, onboarding data capture, uploads and the private resume proxy all function. Otto's notification list is populated with real data — it is the counters above it that are windowed wrong, not the feed beneath.

What this run could not check is significant. No signed-in session was available, so every finding behind auth is inferred from source, migrations and API contracts rather than observed in a browser. That means the mobile resume-preview finding is unverified (marked needs_authed_test), and the reported behavior of Otto's panels, the Settings cards, the messages surfaces and the Map tab is read from code paths rather than from a real student's account with real data. No live testing against production was performed, no multi-user flows were exercised (send-and-receive, connection requests, message request accept/decline round trips), and nothing was checked on a physical phone — mobile conclusions come from the React components and viewport rules, not from a device. Severity ordering here is a judgment call about pilot trust; a half hour in a real logged-in session would likely both confirm most of this and surface things source reading cannot see.

---

## Blocking — a user cannot do this at all

### School email verification locks you out after a few typos

**What breaks.** A student typing their campus address into the verification screen fat-fingers it two or three times, and the app stops accepting anything: "too many requests." No retry window, no hint of how long — and the address they were mistyping was never even accepted in the first place. The verification screen is now dead to them for a full hour. This gate sits in front of every new signup, so it is a first-run experience, not an edge case.

**Why.** In `src/app/api/auth/school-email/request/route.ts`, the rate limiter runs at line 62 — before the body is validated, before the consent gate at line 74, before the `isSchoolEmail` domain check at line 98, and before the duplicate check at line 150. The limit is 3 requests per hour per user. The counter itself is unconditional: `supabase/migrations/20260903100000_security_hardening.sql:299-310` does `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` and only then compares against the limit, so a call spends budget no matter what the route decides afterward. A typo that gets rejected for having the wrong domain costs exactly as much as a real verification email. Three rejections and the hour is gone. The message the user sees comes from `src/lib/rate-limit.ts:55-66`, which says "Try again shortly" while the actual Retry-After is 3600 seconds.

**Fix.** Move the per-user `rateLimit` call below the body parse and below the `isSchoolEmail` and duplicate checks, so only requests that actually send mail spend the budget. If raw request volume still needs a ceiling, keep a separate, much looser cap on that. Separately, surface the real Retry-After in the copy — "try again in about an hour" — instead of "shortly," which reads as seconds.

**Where.** `src/app/api/auth/school-email/request/route.ts:62` (limiter) against `:98` (domain check) and `:150` (duplicate check); `supabase/migrations/20260903100000_security_hardening.sql:299-310` (unconditional increment); `src/lib/rate-limit.ts:55-66` (copy and Retry-After). The limiter placement predates the domain allowlist; `91e322a` (IU-only verification, S53 A3) is what made rejection — and therefore lockout — the common path. All 8 production users are already on `iu.edu`, so nobody has hit this yet, but every new signup now walks through this gate.

---

## Degraded — it works, but gives the wrong result

### The campus Map invents students, clubs and people — and links to profiles that don't exist

**What breaks.** "The campus map says there are 240 CS students and a 700-member CS club at my school — but when I click into a zone and tap a person, their profile is blank." Every user sees this today, on desktop and mobile, with nothing on screen saying the data isn't real.

**Why.** `src/app/api/campus-map/route.ts` returns `DEMO_MAJORS`/`DEMO_ORGS` when the viewer's `users.school` is empty (lines 59-71), and line 188 (`showDemo = forceDemo || majors.length === 0`) does the same when the viewer *has* a campus but no peer shares it. Both branches are live right now: all 8 users in the database have `school = ''`. The fake rosters come from `buildDemoBuckets()` in `src/app/api/campus-map/zone/route.ts:178-218`, and the UI renders those rows as real `<Link href={/profile/<handle>}>` entries (`src/app/campus/campus-home.tsx` around line 10626). The clients read the API's `demo: true` flag only to forward `&demo=1` (`campus-home.tsx:9698`, `src/components/mobile/MapMobile.tsx:465`) — there is no badge. The one absolutely-positioned control in that corner still carries the comment "Demo toggle" (`campus-home.tsx:9647-9689`) but renders a "Recenter" button.

**Fix.** Either render the badge the code implies — a visible "Preview data" pill whenever the API returns `demo: true`, in both `campus-home.tsx` and `MapMobile.tsx` — or drop the demo fallback and show the "No zones yet" empty state that already exists at `campus-home.tsx:9377-9386` and is currently unreachable because the API substitutes demo rows before it can fire. Do not ship fabricated people with clickable profile links; at absolute minimum, make demo rows non-navigable.

**Where.** `select count(*) filter (where coalesce(school,'')='') from users` returns 8 of 8. `curl -s https://www.connectvibe.app/profile/mayachen12` returns HTTP 200 with `<title>@mayachen12 · Vibe</title>`, where a real handle returns `Francisco Cazares (@frankycazares) · Vibe` — so a fake-person link lands on a populated-looking but empty shell rather than a 404. Grepping `demo` in `campus-home.tsx` returns only lines 8959, 8997, 9696, 9698 and 10405-10449; no badge string exists anywhere.

### Declining a message request doesn't decline it

**What breaks.** "I hit Decline on a message request, it disappeared for a second, and then it came right back in my inbox." The unwanted request is still there, and nothing reports a failure.

**Why.** `src/app/api/me/threads/[id]/decline/route.ts:23` runs `supabase.from('channel_members').delete()` on the RLS-scoped cookie client. In the live database, `channel_members` has row-level security on and exactly two policies — `channel_members_select_member` (SELECT) and `channel_members_update_own` (UPDATE) — while `authenticated` still holds the DELETE grant. Postgres therefore deletes zero rows and returns no error, so the route's `if (error)` branch never runs and it answers `ok: true`. `public/html/messages.html:2340-2351` hides the thread locally, awaits that ok, then calls `__dmLoadList()`, which repaints the still-present request straight from the server.

**Fix.** Move the delete to the service client, matching how member add/remove already works in `src/app/api/me/threads/[id]/members/[userId]/route.ts:61` — or add `CREATE POLICY channel_members_delete_own ON public.channel_members FOR DELETE TO authenticated USING (user_id = auth.uid())`. Either way, have the route call `.select()` on the delete and assert a non-zero affected-row count, so a future policy or grant change fails loudly instead of returning `ok: true` over a no-op.

**Where.** `src/app/api/me/threads/[id]/decline/route.ts:23`; `public/html/messages.html:2349`. `pg_policies` for `channel_members` returns only the SELECT and UPDATE policies; `aclexplode(pg_class.relacl)` shows `authenticated` holding DELETE. `supabase/migrations/20260505240000_channel_members_update_own.sql` even notes the table "had INSERT + SELECT policies but no UPDATE policy" and adds only UPDATE — DELETE was never covered. The surrounding grants were last touched by `20260903100000_security_hardening.sql` and `20260903110000_channel_members_column_grants.sql`, neither of which added one.

### Settings rejects your campus or handle change with "Accept the Terms" and no link to the Terms

**What breaks.** "I picked my campus in Settings and it snapped back to what it was, with a red message saying 'Accept the Terms to continue' — but there's nothing to click and I don't know where to accept them." Same for changing your handle. The user is stuck in a dead end on a page that offers no way out.

**Why.** `src/app/api/me/profile/route.ts:86` and `src/app/api/me/handle/route.ts:34` call `requireTermsAccepted()`, which returns a 403 carrying a machine-readable escape hatch: `{ code: 'terms_required', error: 'Accept the Terms to continue' }` (`src/lib/legal/require-terms.ts:8-14`). The Settings client never reads that code. `CampusCard` does `throw new Error(j?.error ?? \`HTTP ${r.status}\`)` at `src/components/settings/SettingsClient.tsx:487-497` and renders the raw server string while reverting the select; `HandleCard` repeats the pattern at lines 709-717. Every other client in the codebase handles it correctly — `public/html/_persistence.js:245-253`, `src/app/auth/school-email/page.tsx:97`, and `src/components/mobile/OnboardingMobile.tsx:384` all check `code === 'terms_required'` and redirect to `/auth/terms?next=…`. Settings was simply missed when the consent gate landed.

**Fix.** Give both Settings cards the same 403 handler the rest of the app has: when `r.status === 403` and the parsed body's `code` is `terms_required`, redirect to `/auth/terms?next=` plus the current path instead of throwing, so the user lands on the interstitial and returns to Settings with their change ready to retry. Since this branch now appears in five places, it is worth extracting one shared helper and having every fetch caller route its 403s through it.

**Where.** `src/lib/legal/require-terms.ts:8-14`; `src/app/api/me/profile/route.ts:86`; `src/app/api/me/handle/route.ts:34`; `src/components/settings/SettingsClient.tsx:487-497` and `:709-717`, against the working pattern at `public/html/_persistence.js:245-253`. Desktop only. This one still needs a live signed-in check to confirm which real accounts currently lack a consent record and therefore hit the gate — the code path itself is unambiguous.

### Otto says "quiet around here" while fourteen notifications sit right below it

**What breaks.** "Otto says 'quiet around here, go say hi to someone' and all my counters are zero, but there are fourteen notifications listed right below it." Seven of the eight users in the database see this today, and it doesn't clear over time.

**Why.** Two endpoints disagree about what "recent" means. `src/app/api/me/notifications/count/route.ts:27` sets `since = now - 30 days` and `countByType()` chains `.gte('created_at', since)` at line 35; `src/app/api/me/notifications/route.ts` applies no date filter at all. Both panels render the two side by side — `public/html/_otto.js:475-479` (stat tiles) and `:535-545` (`_ottoApplyStats`), mirrored in React at `src/components/network/OttoSidePanel.tsx:164-168` and `:488`. The briefing line makes it worse in two ways: `_ottoBriefingLine` (`_otto.js:547-552`) tests `total === 0` *before* it tests `unread > 0`, so the unread count can never be spoken, and its total omits `mention` entirely — a user whose only activity is mentions always reads as quiet.

**Fix.** Make the two endpoints agree: either drop the 30-day window from the count route's totals (keeping it only behind an explicitly labelled "last 30 days" figure), or window the list endpoint to match. Separately, in `_ottoBriefingLine` and at `OttoSidePanel.tsx:164`, check `unread > 0` before the `total === 0` early return, and add `mention` to the sum.

**Where.** Across the whole `notifications` table: oldest 2026-05-05, newest 2026-09-02, 45 rows total, 7 unread — and exactly 1 row inside the last 30 days. Per user: `df5ab44e` (founder) has 14 notifications and 0 in the window; `e3afb560` has 15 notifications, 3 of them unread, and 0 in the window.

### "Views 7d" and "Views 30d" are always zero, on every post, for everyone

**What breaks.** "My post has 61 views all time, but Otto says I got 0 views in the last 7 days and 0 in the last 30 days — every single day." The all-time number is right, which makes the zeros read as a real drop-off rather than a bug.

**Why.** `src/app/api/me/creator-stats/route.ts:108-109` counts `post_views` using `supabase`, the RLS-scoped cookie client. In the live database `post_views` has row-level security enabled and **zero policies** — `select tablename, policyname from pg_policies where tablename='post_views'` returns no rows — while SELECT is still granted to `authenticated`. A role holding a grant with no matching policy sees zero rows and gets no error, so `views7Res.count` and `views30Res.count` come back 0 and the route's `?? 0` fallback makes that indistinguishable from a genuine zero. This has been true since the table shipped: `supabase/migrations/20260508110000_post_views.sql:28` enables RLS and never adds a policy.

**Fix.** Read `post_views` with the service client in `creator-stats` and `REVOKE SELECT` on the table from `anon`/`authenticated` — simpler, and consistent with the S51-53 model where the grant, not the route, is the boundary. The alternative is `CREATE POLICY post_views_owner_select ON public.post_views FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_views.post_id AND p.user_id = auth.uid()))`. Worth adding a guard either way: a count query returning 0 against a ledger known to be non-empty should be logged, not silently rendered.

**Where.** `src/app/api/me/creator-stats/route.ts:108-109`. `public.post_views` holds 137 rows spanning 2026-05-08 to 2026-09-08; for user `df5ab44e` (frankycazares) the true 30-day count is 9 while `sum(posts.view_count)` is 61 — so the panel shows 61 all-time next to 0/0. The sibling table got this right: `profile_views_owner_select` exists. Consumers: `src/components/network/OttoSidePanel.tsx:114`, `src/components/otto/OttoMetrics.tsx:70`, `public/html/_otto.js:591`. Introduced by commit `ed0c0ff`.

### Otto never tells you when you connect with someone

**What breaks.** "I connected with people but Otto never told me — the Connections tab in Otto is always empty and the Connections counter is always 0." There are 7 mutual connections in production and not one of them produced a notification.

**Why.** The production database is running an older version of the trigger function than the migration history claims. `pg_get_functiondef(public.notify_on_connection_insert)` returns a body whose only statement inserts a `'follow'` notification — the `reverse_exists` mutual check that `supabase/migrations/20260504160000_notifications_connection_type.sql:38-50` adds is simply not there, even though `schema_migrations` records that version as applied. The trigger `trg_notify_on_connection` on `public.connections` is enabled and points at that stale function, so no row of type `'connection'` is ever written. Everything downstream branches on a type that never arrives: `public/html/_otto.js:477` (Connections stat tile), `:492` (filter pill), `:686-688` (which is why it renders "no connections yet."), and `src/components/network/OttoSidePanel.tsx:474` and `:663`.

**Fix.** Re-apply the function body from `20260504160000_notifications_connection_type.sql` to production — `CREATE OR REPLACE` only, no table changes — and confirm with `pg_get_functiondef`. Then add a smoke check asserting that the live definition contains `reverse_exists`, so re-running an older migration file can't silently revert it again; given that migrations are applied by hand through the management API, that is the most likely cause of the drift. Backfilling `'connection'` rows for the 7 existing mutual pairs is optional — decide whether the history matters or the gap is acceptable.

**Where.** `select count(*) from connections a join connections b on a.follower_id=b.following_id and a.following_id=b.follower_id where a.follower_id < a.following_id` returns 7 mutual pairs. `select type, count(*) from notifications group by 1` returns follow 19, comment 10, like 9, mention 7 — and zero rows of type `'connection'`.

---

## Quiet failures — outages that look like emptiness

### The campus feed says "No posts yet" when it actually failed to load

**What breaks.** "My feed says there are no posts yet, but I know people have been posting." Every failure of the feed request — an expired session, a 401, a 500 from the database — renders as the same friendly empty state: "No posts yet — orgs you follow and people from your school will show up here once they post." The user has no way to tell an outage from a quiet campus, so they blame themselves or the app's popularity rather than retrying.

**Why.** `src/app/campus/campus-home.tsx:4256-4267` and `4271-4285` do `setEntries(data?.ok && Array.isArray(data.feed) ? data.feed : [])`. `data.ok === false` is the shape *every* failure returns, and it collapses straight to an empty array. The render at `4429-4455` only distinguishes `entries === null` (loading) from `entries.length === 0` (empty) — there is no third branch for "the request failed", so line 4452 prints the empty copy. `src/components/mobile/CampusMobile.tsx:144-163` repeats the same pattern with `setFeed([])`.

**Fix.** Give the feed a fourth state. Track `error` alongside `entries`, and only set `[]` when `res.ok && data.ok && data.feed.length === 0`; on any other outcome set the error and render "Couldn't load the feed" with a Retry button. Apply the same three-way split (loading / empty / failed) to `CampusMobile.refetchFeed`. As a cheap global backstop, add a shared `fetchList()` helper that throws on `!res.ok || !json.ok`, so no call site can accidentally read a failure as emptiness.

**Where.** `curl https://www.connectvibe.app/api/feed` returns HTTP 401 with body `{"ok":false,"error":"Unauthorized"}` — byte-for-byte the payload the client turns into `[]`. The route also returns `{ok:false}` with a 500 at `src/app/api/feed/route.ts:123` (viewer row read) and `:184` (posts query). In production there are 20 rows in `posts` where `type='post'`, and `src/app/api/feed/route.ts:145-152` applies no school filter — so a working feed is never empty for any of the 8 accounts. Every "No posts yet" any of them has seen was a failure.

### The desktop messages sidebar goes completely blank when the thread list fails

**What breaks.** "The messages page is blank — my conversations are gone and there's a little empty orange circle where a number should be." Not an error, not an empty state: nothing. The conversation rail is wiped, the tabs and request banner are left in whatever half-initialised state the boot path put them in, and the user reasonably concludes their messages were deleted.

**Why.** `public/html/messages.html:2008-2017` — the loader does `if (!j.ok) throw ...` and the catch is `console.error('[dm.loadList]', e); return null;`. That path never reaches `__dmRenderList`. By then the boot sequence at `:3117-3118` has already run `tScroll.innerHTML = ''` and `:3115-3116` has stripped the retry button's handler with `rb.removeAttribute('onclick')`. `__dmRenderList` (`:1967-2006`) is the only code that ever adds `visible` to `#tEmpty` or hides `.req-banner` / `.t-tabs`, and the CSS defaults are `.t-empty{display:none}` (`:405`), `.req-banner{...display:flex}` (`:194`), `.t-tabs{display:flex}` (`:199`). So on failure: list cleared, empty state hidden, retry dead, banner stuck visible.

**Fix.** In `__dmLoadList`'s catch, render a failure state instead of returning null — paint a retry row into `#tScroll` ("Couldn't load conversations — Retry") and leave `#tEmpty` hidden. Separately, move the reveal of `.t-empty` and the hiding of `.req-banner` / `.t-tabs` out of the success-only path so the sidebar chrome can never be left half-initialised. The code path is deterministic, but an authenticated pass would confirm the exact rendered result.

**Where.** `curl https://www.connectvibe.app/api/me/threads` returns HTTP 401 `{"ok":false,"error":"Unauthorized"}` — precisely the `!j.ok` condition that throws. In production the owner account (`frankycazares`) has 9 non-org channel memberships and `james` has 6, across 22 channels and 51 messages, so a blank rail is never a truthful render for those accounts. Desktop-only: `src/app/messages/MessagesSwitch.tsx:40-44` iframes `/html/messages.html?app=1` above 900px.

### The Map tab invents majors, clubs and classmates, and never says they aren't real

**What breaks.** "The campus map says there are 240 CS students and a 700-member CS club at my school — but when I click into a zone and tap a person, their profile is blank." The map presents fabricated rosters as real campus data, with clickable profile links to people who do not exist. There is no "preview" or "sample data" badge anywhere on the surface. This is the worst finding in the section: it doesn't just hide a failure, it manufactures a false one and hands the user a dead end to click into.

**Why.** `src/app/api/campus-map/route.ts:59-71` returns `DEMO_MAJORS`/`DEMO_ORGS` whenever `users.school` is empty, and line 188 (`showDemo = forceDemo || majors.length === 0`) does the same when the viewer *has* a campus but no peer shares it — which is the case for everyone today, since every other user has `school=''`. Both clients read `data.demo` only to forward `&demo=1` onward (`campus-home.tsx:9698`, `MapMobile.tsx:465`); they never render a badge. The one absolutely-positioned control in that corner (`campus-home.tsx:9647-9689`, whose comment still says "Demo toggle") renders a "Recenter" button instead. The fake rosters come from `buildDemoBuckets()` in `src/app/api/campus-map/zone/route.ts:178-218`, and those rows are rendered as `<Link href={/profile/<handle>}>` at roughly `campus-home.tsx:10626`.

**Fix.** Either render the promised badge — a visible "Preview data" pill whenever the API returns `demo: true`, on both `campus-home.tsx` and `MapMobile.tsx` — or drop the demo fallback entirely and show the real "No zones yet" empty state, which already exists at `campus-home.tsx:9377-9386` but is unreachable while the API substitutes demo rows. Whichever path you take, do not ship fabricated people with clickable profile links; at minimum make demo rows non-navigable.

**Where.** `select count(*) filter (where coalesce(school,'')='') from users` returns 8 of 8, so the demo branch is live for every account right now. `curl -s https://www.connectvibe.app/profile/mayachen12` returns HTTP 200 with `<title>@mayachen12 · Vibe</title>` — a real handle returns `Francisco Cazares (@frankycazares) · Vibe` — so a fake-person link lands on a populated-looking but empty shell. Grepping `demo` in `campus-home.tsx` returns only lines 8959, 8997, 9696, 9698 and 10405-10449: no badge string exists anywhere in the file.

### /network says you have no followers when the request failed

**What breaks.** "Vibe says I have no followers and isn't following anyone — did my account get wiped?" All four tabs — followers, following, connections, suggestions — answer an API failure with empty-state copy that blames the user for not participating: "No followers yet. Post a clip, RSVP to an event, or join a club — your graph fills in once you show up." The one thing that would tell them to just try again is missing.

**Why.** `src/components/network/NetworkPageClient.tsx:219-274` clears `users` in three places and never records that anything went wrong: `setUsers([])` at `:224` before the fetch even starts, `setUsers([])` in the non-ok else at `:262`, and `setUsers([])` in the catch at `:268`, with `setLoading(false)` in the finally at `:271-273`. The render guards at `:622-626` and `:680-684` are `if (loading && users.length === 0) return <SkeletonList/>` followed by `if (users.length === 0) return <EmptyState .../>` — no error branch exists, so failure and emptiness are indistinguishable. Copy at `:748-768`.

**Fix.** Add an `error` state to `NetworkPageClient`, set it in both the non-ok else and the catch, and render a "Couldn't load — Retry" card instead of `EmptyState` when it's set. Also stop clearing `users` at `:224` before the fetch resolves: keeping the previous rows avoids flashing an empty graph on every tab switch and stops a transient failure from erasing correct data on screen. Mirror the fix in `NetworkMobile.tsx:147`.

**Where.** `/api/me/followers`, `/api/me/suggested-connections` and `/api/search?q=a` all return HTTP 401 `{"ok":false,...}` — exactly the `data?.ok` failure the else branch swallows. Connection counts in production: `frankycazares` 6, `james` 3, `vibecqo` 3, `henryodie` 2, `mariman20134` 1, `leah` 1, `tyler` 1. Every account has a non-empty graph, so "no followers yet" is never a true statement for any of them.

### Otto's counters read 0 while fourteen notifications sit right below them

**What breaks.** "Otto says 'quiet around here, go say hi to someone' and all my counters are zero, but there are fourteen notifications listed right below it." Seven of eight users see this today. The stat tiles and the briefing line disagree with the list they sit on top of, which makes Otto look broken and makes its summary worthless.

**Why.** Two endpoints answer the same question with different windows. `src/app/api/me/notifications/count/route.ts:27` sets `since = now - 30 days` and `countByType()` chains `.gte('created_at', since)` at line 35, while `src/app/api/me/notifications/route.ts` applies no date filter at all. Both panels consume them side by side — `public/html/_otto.js:475-479` (stat tiles), `:535-545` (`_ottoApplyStats`), `:547-552` (`_ottoBriefingLine`), and the React mirror at `src/components/network/OttoSidePanel.tsx:164-168` / `:488`. Two extra bugs live in the briefing line itself: its `total === 0` early return runs *before* the `unread > 0` check, so an unread count can never be reported, and its sum omits `mention` entirely, so a user whose only activity is mentions always reads as "quiet".

**Fix.** Make the two endpoints agree — either drop the 30-day window from the count route's `totals` (keeping it only for an explicitly labelled "last 30 days" figure), or window the list endpoint to match. Separately, in `_ottoBriefingLine` (and `OttoSidePanel.tsx:164`) check `unread > 0` before the `total === 0` early return, and include `mention` in the total.

**Where.** Across the whole `notifications` table: oldest row 2026-05-05, newest 2026-09-02, 45 rows total, 7 unread — and exactly 1 row inside the last 30 days. Per user: the founder account `df5ab44e` has 14 notifications and 0 in the window; `e3afb560` has 15 notifications, 3 of them unread, and 0 in the window. Every one of those users sees 0/0/0/0 above a full inbox.

### Otto's Connections tab is permanently empty — the notification type is dead in production

**What breaks.** "I connected with people but Otto never told me — the Connections tab in Otto is always empty and the Connections counter is always 0." Mutual connections do happen; Otto simply never learns about them, so the tab renders "no connections yet." forever.

**Why.** The live database trigger function is the *pre-migration* version. `pg_get_functiondef(public.notify_on_connection_insert)` returns a body whose only statement is `INSERT INTO public.notifications (user_id, actor_id, type) VALUES (NEW.following_id, NEW.follower_id, 'follow')` — the `reverse_exists` mutual check from `supabase/migrations/20260504160000_notifications_connection_type.sql:38-50` is simply absent. The trigger `trg_notify_on_connection` on `public.connections` is enabled and points at that stale function, so no row of type `'connection'` is ever written. Consumers that branch on the missing type: `public/html/_otto.js:477` (stat tile), `:492` (filter pill), `:686-688` (the "no connections yet." render), and `src/components/network/OttoSidePanel.tsx:474` / `:663`. The likely cause is a re-run of the earlier `20260504150000` migration file after `160000` had already been recorded as applied — migrations here are applied by hand through the management API, so an older file can silently overwrite a newer function body.

**Fix.** Re-apply the function body from `supabase/migrations/20260504160000_notifications_connection_type.sql` to production — `CREATE OR REPLACE` only, no table changes — then verify with `pg_get_functiondef`. Add a smoke check that asserts the live definition contains `reverse_exists`, so a re-run of an older migration can't quietly revert it again. Then decide whether to backfill `'connection'` rows for the 7 existing mutual pairs or accept the gap and note it.

**Where.** `select count(*) from connections a join connections b on a.follower_id=b.following_id and a.following_id=b.follower_id where a.follower_id<a.following_id` returns 7 mutual pairs. `select type, count(*) from notifications group by 1` returns follow 19, comment 10, like 9, mention 7 — and zero rows of type `'connection'`. `schema_migrations` contains version `20260504160000`, so the migration is recorded as applied while the live function body predates it.

---

## Cosmetic and latent

### Every avatar in Otto's "Asking for you" list is a broken image

**What breaks.** "The people asking to connect with me on Otto have no profile pictures — just empty circles, even though I know they have photos." Every avatar in the connection-request list renders as an empty box, on desktop and on mobile.

**Why.** `src/components/otto/OttoRequests.tsx:60-66` renders each avatar with next/image (`<Image src={r.avatar_url} width={32} height={32} />`), and those URLs point at the Supabase storage host. `next.config.ts` has no `images` block at all — no `remotePatterns` — so Vercel's image optimizer refuses every external URL it is handed. Nothing about the images themselves is wrong; the optimizer never gets permission to fetch them.

**Fix.** Either add `images: { remotePatterns: [{ protocol: "https", hostname: "rqopjkimxbjkwdkpkbfq.supabase.co", pathname: "/storage/v1/object/public/**" }] }` to `next.config.ts`, or swap this one `<Image>` for a plain `<img>` with the eslint-disable the codebase already uses (see `src/components/mobile/OnboardingMobile.tsx:784`). Every other avatar in the app is already a plain `<img>`, so option two matches existing practice; option one keeps optimization. Whichever you pick, add a grep guard or lint rule, because the next `<Image>` anyone adds breaks the same silent way.

**Where.** Live: `GET https://www.connectvibe.app/_next/image?url=…supabase.co/storage/v1/object/public/profiles/…avatar-….jpg&w=256&q=75` returns HTTP 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`; the same file fetched directly returns `200 image/jpeg 124899`. `grep -n images next.config.ts` finds nothing, and `git log -S remotePatterns -- next.config.ts` shows no commit ever added it. The DB confirms this fires today: three one-way follows exist (james→mariman20134, vibecqo→mariman20134, henryodie→vibecqo) and all three followers have a non-null Supabase avatar URL. Mounted on both viewports via `src/components/otto/OttoPageClient.tsx:191` and `src/components/mobile/OttoMobile.tsx:317`. Broken since `7746498` (2026-05-11), the commit that introduced the component.

### The "you" card in the sidebar goes blank after the Terms gate

**What breaks.** "The 'you' card in the sidebar is a blank grey placeholder — no name, no photo — even though I'm signed in." On desktop `/profile` it is worse: a fatal card reading "Could not load your profile (Accept the Terms to continue)" whose only two links are "Sign in again" and "Back to campus" — neither of which gets you to the Terms page. A platform admin in this state also silently loses the Admin link in the left nav.

**Why.** `src/lib/legal/require-terms.ts:8-14` and `src/app/api/me/profile-bootstrap/route.ts:64-65` now return 403 with `code:'terms_required'`. Four React callers read any non-OK response as "no data": `src/components/nav-identity-chip.tsx:80-83` falls back to the generic placeholder chip, `src/components/LeftNav.tsx:210-221` swallows it in a bare catch and drops the Admin link, `src/app/profile/profile-html-bridge.tsx:41-59` handles only 401 and otherwise shows the fatal card, and `src/components/mobile/ProfileMobile.tsx:327-330` sets "Could not load profile". None of them check the `code`.

**Fix.** Handle 403 + `terms_required` in all four callers the way `public/html/_persistence.js` already does. A redirect is too aggressive for the chip and the nav, so at minimum distinguish "blocked by consent" from "no data" — the chip can say "Accept the Terms" and link to `/auth/terms`. The cleaner shape: since profile-bootstrap is a read, and the consent interstitial itself needs identity to render, have it return the profile with `termsAccepted:false` and let the write routes hold the line.

**Where.** Production SQL: 7 of 8 users have NULL `terms_accepted_at` / `age_attested_at`, so almost everyone is in this state right now. Grepping src and public for `terms_required` finds only five client-side handlers (`public/html/_persistence.js:247`, `public/html/onboarding.html:971`, `src/app/auth/school-email/page.tsx:97`, `src/components/mobile/OnboardingMobile.tsx:384`) — none of the four above. The gated pages redirect first via `enforceCampusAccess`, but `/settings` renders the same shell with no consent gate (`src/app/settings/page.tsx:31-33`), so that is the reliable repro. Introduced by `0f39bcc` (2026-09-06).

### Shared-profile cards in DMs show a name and nothing else

**What breaks.** "Someone shared a profile in our chat and the card is half empty — it shows their name and photo but the line under it is just their @handle, no major or year, and the banner is the grey default even though their profile has a coloured cover." Affects desktop `/messages` and the mini-messenger popover on profile, campus and network.

**Why.** `public/html/_profilePreview.js:96-99` reads four keys off the bootstrap's `vibeUser` that the server has never sent: `banner_gradient`, `major`, `year`, `school` (plus a `studentMeta` fallback). `src/lib/profile/build-vibe-user-v1.ts` emits `coverGradient` (lines 119-121) and `studentVerification` (lines 104-110) instead, and emits no `major`, `year`, `school` or `studentMeta` at all. So `banner_gradient` is always empty and falls through to `DEFAULT_BANNER` at `_profilePreview.js:118-122`, and the meta builder at `:139-146` has nothing left but the handle.

**Fix.** Read the keys the server actually sends — `banner_gradient: v.coverGradient || ''` — and either derive the meta line from `v.headline`, which already reads "Marketing · Year 2", or add `major` and `year` to the vibeUser payload. Adding the two fields server-side is the lower-risk change, since the payload is shared by profile.html and ProfileMobile. Drop the dead `studentMeta` fallbacks either way.

**Where.** Anonymous `GET https://www.connectvibe.app/api/users/tyler/bootstrap` returns `coverGradient='linear-gradient(135deg, rgb(28,28,30) 0%, …)'` and no `banner_gradient`, `major`, `year`, `school`, or `studentMeta` key at all; same for `/api/users/james/bootstrap`. SQL over `public.users` shows 6 of 8 live users have a non-empty `major` and a non-null `year`, so real data is being dropped on the floor. @tyler has a `banner_gradient` set with no `banner_url`, which is why his card shows the grey default. Deployed `/html/*.js` matches HEAD, working tree clean at `cf8b73a`.

### Otto notification toggles never confirm they saved

**What breaks.** "I turned off the daily summary and it's still emailing me." The toggle flips instantly and stays flipped whether or not the server accepted the change.

**Why.** `src/components/otto/OttoSettings.tsx:106-115` fires the PATCH and discards the result: `fetch("/api/me/otto/settings", {method:"PATCH", …}).catch((e) => console.error(…))`. The response is never inspected, and `setKey`/`applyPreset` (lines 118-127) call `setState` before queuing, so the UI is always ahead of the server. `src/app/api/me/otto/settings/route.ts` can legitimately return 401 or either of two 500s, and none of those reaches the user.

**Fix.** Await the PATCH, check `res.ok && json.ok`, show a small saved/failed indicator, and revert the toggle on failure. The existing debounce already coalesces keystrokes, so one round-trip per settle is cheap.

**Where.** `src/components/otto/OttoSettings.tsx:109-113`; the failure paths it ignores are at `src/app/api/me/otto/settings/route.ts:90-107` (two 500s) and `:66` (401).

### A bad profile link returns a normal-looking page instead of a 404

**What breaks.** "My friend sent me a Vibe profile link, the preview looked normal, and when I opened it the page just said the user doesn't exist." `/profile/<unknown-handle>` responds HTTP 200 with a real Vibe title, so link previews in iMessage and Slack render as if the profile is real.

**Why.** `src/app/profile/[handle]/page.tsx:116-122` wraps the existence check in a try/catch meant to survive a Supabase outage: `try { const row = await loadPublicProfile(handle); if (!row) notFound(); } catch { /* still mount the client */ }`. But `notFound()` signals by throwing, so the catch intended for service-role failures swallows Next's own control-flow error and the 404 never propagates. The same pattern done correctly is at `src/app/orgs/[handle]/page.tsx:93`, where `notFound()` sits outside a try — and `/orgs/<bogus>` does return 404.

**Fix.** Hoist the existence check out of the try: assign `row` inside the try, then call `notFound()` after it. Alternatively re-throw when the caught error carries Next's `digest` marker. The org route is the working reference.

**Where.** `src/app/profile/[handle]/page.tsx:116-122` versus `src/app/orgs/[handle]/page.tsx:93`, plus the live contrast between a bogus profile handle (200) and a bogus org handle (404).

### Resume thumbnail is a broken box while the PDF loads

**What breaks.** "When I open my resume the little page thumbnail on the left is empty/broken for a few seconds before the page appears — and if the resume fails to load it just stays a broken box." Desktop profile only, on your own resume and other people's.

**Why.** `public/html/profile.html:5316` computes `const firstPage = (doc.pages && doc.pages[0]) || doc.url;` and line 5326 drops that straight into `<img src="${_esc(firstPage)}">`. `doc.pages` is undefined on a fresh load because the server never sends it — `src/lib/profile/build-vibe-user-v1.ts:128-132` maps `resume_docs` to exactly `{ name, type, url }`. So `firstPage` is the PDF URL, and an `<img>` cannot decode a PDF. The main viewing pane gets this right at `profile.html:5350-5362`; only the thumbnail strip is missing the branch.

**Fix.** Give the thumbnail the same branch the main pane has: when `doc.type === 'pdf'` and `doc.pages` is empty, render a small placeholder tile (doc name plus a spinner) instead of an `<img>`. One conditional at `profile.html:5316-5326`.

**Where.** Code is unambiguous — `profile.html:5316`/`:5326` (no PDF branch) against `:5350-5362` (correct branch), and `build-vibe-user-v1.ts:128-132` emitting only name/type/url. DB confirms the fallback is the only path: `resume_docs` for `frankycazares` is `[{"url":"/api/resume/…/resume-….pdf","name":"Resume","type":"pdf"}, {…"Schedule"…}]` with no `pages` key on either entry. **This one still needs a live signed-in check** — load `/profile` as a signed-in user with a PDF attached and watch the thumbnail strip during the first two seconds to confirm how visible the broken box actually is.

---

## Fix Order

I'll write the fix order directly from the findings — no code changes needed for this task.

FIX ORDER — Vibe breakage triage

## Right now
Blocking a real tester's core flow. Both are one-file changes.

**1. School-email verification burns its 3/hour budget on typos.** Move the `rateLimit('school-email:<uid>', …)` call in `src/app/api/auth/school-email/request/route.ts:62` to *below* the body parse, the `isSchoolEmail` check (:98) and the duplicate check (:150), so only sends that actually dispatch mail spend budget — and pass the real `Retry-After` through to the copy in `src/lib/rate-limit.ts:55-66` ("try again in about an hour", not "shortly").
*Confirm:* with a fresh test account, submit `foo@gmail.com` four times — each should return the domain rejection, not "too many requests"; then submit a valid `@iu.edu` and confirm mail sends. Then send three valid ones and confirm the fourth is limited with an hour in the message.

## This week
Three separate bugs, one shared root cause: **RLS is enabled on tables that have grants but no matching policy, so the query silently returns 0 rows / affects 0 rows and no error fires.** Fix them together — the pattern is the same and the verification is the same.

**2. `post_views` has RLS on with zero policies → all "Views 7d/30d" render 0.** In `src/app/api/me/creator-stats/route.ts:108-109`, read `post_views` with the service client and `REVOKE SELECT` on the table from `anon`/`authenticated` (matches the S51–53 model), or add an owner-select policy if you'd rather keep the cookie client.
*Confirm:* as `frankycazares`, the panel should show 30d = 9 against all-time 61 — not 0.

**3. Decline on a message request does nothing — `channel_members` has no DELETE policy.** In `src/app/api/me/threads/[id]/decline/route.ts:23`, switch the delete to the service client (mirroring `src/app/api/me/threads/[id]/members/[userId]/route.ts:61`), or add `channel_members_delete_own`.
*Confirm:* have a second account DM you, hit Decline, hard-refresh `/messages` — the request must not reappear.

**4. While you're in there: make silent zero-effect writes fail loudly.** Add `.select()` to the decline delete and assert a non-zero affected-row count; log (don't render) a count query that returns 0 against a ledger you know is non-empty. This is what turned all three of the above from a 500 into a year of quiet wrong numbers.
*Confirm:* temporarily point the decline route back at the RLS client and check that it now 500s instead of returning `ok:true`.

**5. The `connection` notification type is dead in prod — the live trigger function is the pre-migration body.** `CREATE OR REPLACE` the function from `supabase/migrations/20260504160000_notifications_connection_type.sql` against production (no table changes). Migrations are applied by hand here, so an old file re-run is the likely cause.
*Confirm:* `pg_get_functiondef(public.notify_on_connection_insert)` contains `reverse_exists`; then create a mutual follow between two test accounts and check a `type='connection'` row lands. Add that `pg_get_functiondef` string check to your smoke checks so a re-run can't silently revert it again.

## When convenient
**6. Otto's stat tiles are windowed to 30 days while the list below them isn't — 7 of 8 users see all zeros above a full inbox.** Make `src/app/api/me/notifications/count/route.ts:27` and `src/app/api/me/notifications/route.ts` agree (drop the 30-day window from `totals`, or label the tiles as a 30-day window and window the list too). Two smaller bugs in the same code path, fix in the same pass: `_ottoBriefingLine` in `public/html/_otto.js:547-552` checks `total === 0` *before* `unread > 0`, so the unread count is unreachable, and it omits `mention` from its sum entirely — a mentions-only user always reads as "quiet." Mirror any change into `src/components/network/OttoSidePanel.tsx:164-168`.
*Confirm:* on an account with notifications older than 30 days, the tiles and the list below them must tell the same story; an account whose only activity is mentions must not say "quiet around here."

## Needs a decision, not a fix
**7. The Map tab serves fabricated majors, orgs and clickable fake people to everyone, with no "preview" badge.** This is working as designed — `src/app/api/campus-map/route.ts:59-71` and `:188` fall back to `DEMO_MAJORS`/`DEMO_ORGS` whenever no peer shares your campus, which is *every* user today (all 8 have `school=''`). The code comments still promise a demo toggle that no longer exists. Three real options, and it's a product call, not a bug: (a) render the promised "Preview data" pill in `campus-home.tsx` and `MapMobile.tsx` whenever the API returns `demo:true`; (b) drop the fallback and show the "No zones yet" empty state that already exists at `campus-home.tsx:9377-9386` but is currently unreachable; (c) keep demo data but strip the `<Link href={/profile/<handle>}>` wrapper so fake people aren't navigable. Whatever you pick, (c) is the floor — `curl https://www.connectvibe.app/profile/mayachen12` returns a 200 with a real-looking empty profile shell, which is the part that reads as broken rather than as a preview.
*Decision needed:* does an empty map or a labelled fake map do more for a first-time visitor? That's a founder call about the cold-start story, and it changes when the pilot campus fills in.

**One caveat on scope:** the findings list was truncated mid-item 6 (the Otto windowing entry cuts off at "keep it only for an explicitly-labelled 'la…"). If there were items after it, they're not in this order.

---

## Appendix A — All findings

| # | Finding | Impact | Status | Surface | Viewport | Lens |
|---|---------|--------|--------|---------|----------|------|
| 1 | School-email verification: the 3-per-hour budget is spent by rejected attempts, so three typos lock a student out for an hour | Blocking | confirmed_broken | campus email verification (/auth/school-email) | both | hardening-fallout |
| 2 | post_views has RLS enabled with zero policies, so every "views in the last 7/30 days" number renders 0 | Degraded | confirmed_broken | Otto metrics panel / creator stats ("Views 7d", "Views 30d") | both | hardening-fallout |
| 3 | Declining a message request silently does nothing — channel_members has no DELETE policy | Degraded | confirmed_broken | desktop messages — the "Decline" button on a message request | desktop | hardening-fallout |
| 4 | The 'connection' notification type is dead in production — live trigger function is the pre-migration version | Degraded | confirmed_broken | Otto panel / notifications (desktop static panel + React side panel) | both | inert-data |
| 5 | The Map tab shows fabricated majors, orgs and people to every user, with no "preview" badge | Degraded | confirmed_broken | campus Map tab (/campus → Map, desktop and mobile) | both | inert-data |
| 6 | Otto's stat tiles and briefing line are windowed to 30 days while the list beneath them is not — 7 of 8 users see 0/0/0/0 above a full inbox | Degraded | confirmed_broken | Otto panel (desktop static panel + React side panel) | both | inert-data |
| 7 | Settings' Campus and Handle cards call consent-gated routes and surface the raw 403 with no way forward | Degraded | confirmed_broken | Settings → Campus, Settings → Handle | desktop | contract-drift |
| 8 | /html/onboarding.html serves the real onboarding flow to anyone, then throws the work away at a login wall | Degraded | confirmed_broken | onboarding (direct URL / search result) | both | dead-ends |
| 9 | Desktop onboarding never escapes its iframe — finishing onboarding leaves the whole app running inside the /onboarding frame | Degraded | confirmed_broken | onboarding → profile handoff (desktop) | desktop | dead-ends |
| 10 | School-email verification burns its 3/hour quota on requests that never send an email | Degraded | confirmed_broken | campus email verification (/auth/school-email) | both | dead-ends |
| 11 | Campus feed renders "No posts yet" for 401/403/500 — outages are invisible | Degraded | confirmed_broken | the campus feed (desktop /campus and the mobile campus tab) | both | empty-state-lies |
| 12 | Desktop messages sidebar goes completely blank on any /api/me/threads failure — no list, no empty state, no error | Degraded | confirmed_broken | desktop messages (the /html/messages.html iframe behind /messages) | desktop | empty-state-lies |
| 13 | /network followers, following, connections and suggestions show user-blaming empty copy when the API fails | Degraded | confirmed_broken | the People / Network page (desktop /network and its mobile twin) | both | empty-state-lies |
| 14 | Mobile messages erases an already-loaded thread list on a single failed refetch | Degraded | confirmed_broken | mobile messages (/messages under 900px) | mobile | empty-state-lies |
| 15 | Mobile onboarding's resume "Preview" is a raw <iframe> pointing at a PDF — a black 360px box on phones | Degraded | needs_authed_test | mobile onboarding, step 4 (resume / portfolio upload) | mobile | render-blockers |
| 16 | Mobile conversation view renders only message text — photos, videos, shared posts and reply quotes are dropped | Degraded | confirmed_broken | messages (mobile), and the org Chat tab on mobile campus | mobile | cross-viewport |
| 17 | Every desktop "Message" button hands off /messages?channel=<id>, which the desktop messages page ignores | Degraded | confirmed_broken | desktop network page, desktop campus event attendees, desktop profile connections list → messages | desktop | cross-viewport |
| 18 | The only unread-notification badge in the product lives in a desktop-only component, and mobile never marks notifications read | Degraded | confirmed_broken | every mobile screen (missing notification bell / badge) | mobile | cross-viewport |
| 19 | Profile views are recorded by a script that exists only in the static desktop page, so mobile visits are never counted | Degraded | confirmed_broken | profile views metric on /otto Stats and the Otto side panel | mobile | cross-viewport |
| 20 | Desktop onboarding runs inside a full-viewport iframe, and finishing it navigates the iframe instead of the page | Degraded | confirmed_broken | onboarding (desktop) | desktop | cross-viewport |
| 21 | "Report post" never checks the response and never confirms — on two of the three report surfaces | Degraded | confirmed_broken | mobile post viewer + /posts/[id] share page + desktop campus feed post menu | both | write-paths |
| 22 | Mobile "Repost" button produces no state change and no error, and is blocked twice over for most users | Degraded | confirmed_broken | mobile post viewer (feed, profile, /posts/[id]) | mobile | write-paths |
| 23 | DM request Accept/Decline tears down the UI before the write and never checks whether it landed | Degraded | confirmed_broken | desktop messages (message requests bar) | desktop | write-paths |
| 24 | Desktop profile "Follow instead" claims success without reading the follow API's answer | Degraded | confirmed_broken | desktop profile page, viewing someone else | desktop | write-paths |
| 25 | Otto reminder Done/Dismiss and "Follow back" delete the row from the list and never verify the write | Degraded | confirmed_broken | Otto page and Otto side panel (both viewports) | both | write-paths |
| 26 | Group chat "Add people" silently swallows every failure except one specific 403 | Degraded | confirmed_broken | desktop messages — chat info panel → Add people | desktop | write-paths |
| 27 | /profile/<handle> returns HTTP 200 for handles that don't exist — notFound() is swallowed by a bare catch | Degraded | confirmed_broken | public profile share links (/profile/<handle>) | both | recent-regression |
| 28 | The public landing page has no sign-up link at all — the only door is "Log in" | Degraded | confirmed_broken | landing page (connectvibe.app homepage) | both | live-smoke |
| 29 | "N mutual" on every visited profile is hardcoded to 0 and the "People you both know" modal is a static empty shell | Degraded | confirmed_broken | desktop profile page, viewer mode (/profile/<handle>) | desktop | live-smoke |
| 30 | Public /opportunities page confirms "✓ Applied" and closes the "Post Opportunity" form without sending anything anywhere | Degraded | confirmed_broken | the Opportunities page (connectvibe.app/opportunities) | both | live-smoke |
| 31 | Finishing Otto onboarding on desktop loads the profile inside the onboarding iframe — the URL stays /onboarding | Degraded | confirmed_broken | desktop onboarding (/onboarding) | desktop | live-smoke |
| 32 | Shared-profile cards in DMs read four field names the bootstrap API never returns | Cosmetic | confirmed_broken | the profile card that appears when someone shares a profile link in Messages (desktop /messages and the mini-messenger popover on profile/campus/network) | desktop | contract-drift |
| 33 | /api/me/profile-bootstrap gained a 403, and three of its React callers still read it as "no data" | Cosmetic | confirmed_broken | the sidebar "you" card, the Admin link in the left nav, and the desktop /profile loading screen | desktop | contract-drift |
| 34 | Every avatar in Otto's "Asking for you" list is a broken image — next/image has no remotePatterns for the Supabase host | Cosmetic | confirmed_broken | the Otto page ("Asking for you" / connection requests), desktop and mobile | both | render-blockers |
| 35 | Desktop resume viewer's thumbnail strip puts a PDF URL inside <img src> — broken thumbnail on every fresh page load | Cosmetic | needs_authed_test | desktop profile → Resume / Portfolio viewer (own profile and other people's) | desktop | render-blockers |
| 36 | Otto notification settings toggles never confirm they saved | Cosmetic | confirmed_broken | Otto settings panel | both | write-paths |
| 37 | /profile/<unknown-handle> returns HTTP 200 with a real-looking Vibe title instead of 404 | Cosmetic | confirmed_broken | profile share links (/profile/<handle>) | both | live-smoke |
| 38 | The 10-per-hour per-IP school-email cap is shared by everyone behind campus NAT | Latent | confirmed_broken | campus email verification during any in-person signup push | both | hardening-fallout |
| 39 | The desktop profile shell is not behind the consent gate, and its bootstrap 403 is swallowed | Latent | confirmed_broken | desktop profile (/html/profile.html?app=1) | desktop | hardening-fallout |
| 40 | All six Otto notification settings are write-only — nothing in the codebase ever reads them to send anything | Latent | confirmed_broken | /otto → Settings card (desktop and mobile) | both | inert-data |
| 41 | Trending hashtags uses strict campus equality, so the rail will go permanently blank for the first user who picks a campus | Latent | needs_authed_test | campus feed → Otto strip, "Trending" card | both | inert-data |
| 42 | Search drops every event whose creator has no campus, so event search will return zero results once a viewer picks a campus | Latent | needs_authed_test | search (campus / network search bar), Events results section | both | inert-data |
| 43 | The desktop messages iframe kicks the whole tab to the marketing landing page when localStorage is empty | Latent | needs_authed_test | desktop messages | desktop | dead-ends |
| 44 | Events tab says "No upcoming events on campus — be the first to post one" when /api/events fails | Latent | needs_authed_test | the campus Events tab and the clubs/orgs directory | both | empty-state-lies |
| 45 | The server-side redaction renderer has never successfully produced an object in production, and it is now the only way a non-owner can see 3 of 8 users' resumes | Latent | needs_authed_test | viewing another student's resume / portfolio (desktop profile.html and mobile ResumeViewerMobile) | both | render-blockers |
| 46 | Pinning a post to your profile is unverifiable end-to-end: the client ignores the response and the route returns ok:true even on a zero-row update | Latent | needs_authed_test | desktop profile — pin a post | desktop | write-paths |
| 47 | Server-side resume redaction has never successfully produced a derivative in production, and there is no fallback — any render failure is a permanent 503 for viewers | Latent | needs_authed_test | viewing someone else's resume / portfolio on their profile (desktop and mobile) | both | recent-regression |
| 48 | Campus hard-scoping on orgs and events runs entirely in its "no campus set" fallback — the filtering path has never executed in production | Latent | needs_authed_test | Campus page club discovery and the events list | both | recent-regression |
| 49 | maxLength={20} on the signup and update-password fields silently truncates a pasted password | Latent | uncertain | signup and password reset | both | recent-regression |
| 50 | Desktop Messages throws a signed-in user out to the marketing landing page if localStorage is empty | Latent | needs_authed_test | desktop messages (/messages) | desktop | live-smoke |

## Appendix B — Method & coverage

- **Lenses (10):** Hardening fallout; Inert data and dead branches; Client/server contract drift; Dead ends, dead links and gate traps; Empty states that are actually errors; Render blockers: frames, assets, scripts, media; Desktop vs mobile divergence; Writes that silently fail; Recent-change regression sweep; Live smoke test of the running site.
- **Verification:** every Blocking or Degraded finding was re-checked by an independent agent instructed to disprove it; already-fixed and false-positive items were dropped before this report.
- **Impact scale:** Blocking = the feature cannot be used. Degraded = usable but wrong or incomplete. Cosmetic = looks wrong, still works. Latent = fine today, breaks on a foreseeable condition.
- **Not covered:** performance and load, real device testing, anything requiring a POST or a state change, and every authenticated surface (no session this run).
- **Inventory basis:** Vibe is a Next.js 16 App Router app on Vercel with a hard 900px desktop/mobile fork and a second, orthogonal fork in middleware: logged-OUT visitors to /feed, /network, /campus, /messages are silently rewritten to static demo prototypes under public/html/**, while logged-IN users get React pages or iframes. Only three static pages are real product surfaces (profile.html, messages.html, onboarding.html); the rest are anon-only marketing/demo shells with mock data and no API calls. Every campus-shelled route now passes enforceCampusAccess (login → consent → school_verified → otto_answers) and 27 write APIs call requireTermsAccepted. BIGGEST LIVE FACT for the breakage lenses: production DB has 8 users, ALL school_verified=true, but only 1 has a complete consent record (terms_accepted_at + age_attested_at + terms_version='2026-05-07'). The other 7 are currently bounced to /auth/terms on EVERY gated page and 403 'terms_required' on EVERY write API. That gate shipped 24h ago (0f39bcc) and its interstitial is behind login — it cannot be live-tested this run and is the highest-value target for an authenticated pass. Also: all 8 users and all 5 orgs have school='' , so the new IU campus scoping (91e322a, shipped today) is running entirely in its "no campus set → show everything" fallback; the filtering path has zero production coverage. Confirmed-now bug found during recon (proved against a live response): GET https://www.connectvibe.app/profile/<nonexistent-handle> returns HTTP 200 with the profile shell instead of 404. Cause is at /Users/franciscocazares/vibe/src/app/profile/[handle]/page.tsx:116-120 — `if (!row) notFound();` sits inside a `try {}` whose bare `catch {}` swallows the NEXT_HTTP_ERROR_FALLBACK that notFound() throws. Fix: hoist the notFound() call outside the try, or rethrow when the caught value is Next's not-found error. Live anon probe results (~35 GETs, no writes): / 200, /feed /campus /network /messages 200 (static demo), /opportunities 200, /the-map 200, /auth/{login,signup,forgot-password,update-password,callback,verify-school} 200, /legal/{terms,privacy} 200, /html/profile.html 200 (Maya Chen demo). Gated: /otto /profile /settings /admin /onboarding /onboarding/classic /auth/terms /auth/school-email all redirect to /auth/login. /posts/<id> is intentionally login-gated (307) though its OG meta renders anon. Every /api/** probed returns 401 anon except /api/users/<handle>/bootstrap (200, public share data) and the media/asset proxies (404 for missing assets). Security headers present on every response: HSTS, nosniff, X-Frame-Options SAMEORIGIN (regressed to DENY in S51, fixed yesterday in 1f883ef — the self-framing seam), Referrer-Policy, Permissions-Policy. No CSP by design (inline scripts in public/html). `npx tsc --noEmit` is clean; the static prototypes are not type-checked at all. Working tree is clean and HEAD (cf8b73a) == origin/main, so live matches repo. Minor: /sitemap.xml has no route and returns the app HTML shell with HTTP 200 while robots.txt allows all.
