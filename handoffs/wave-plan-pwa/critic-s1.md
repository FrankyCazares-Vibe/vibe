# Store wave S1 plan critic (2026-09-24)

Adversarial read of `plan.md` §4 against the repo. Read-only; no server, browser or production access (the
local stack's REST schema was read once to confirm column names). **Precedence: a RULING here overrides the
plan line it names.** Everything not named here stands as written.

**Plain English.** One contract would break the flow reviewers actually test. If the "hide on report" event
fires the moment a report lands, the phone feed removes the card, and the report sheet goes with it,
because it lives inside that card. The "Thanks" panel and its "Block this person" button disappear, and
two sliding sheets get torn down halfway through closing. Three batches can't finish without a file they
don't own:
- the club page's posts are drawn by a server file, which can't hold a button;
- the Settings delete path (the one reviewers use) is in nobody's list;
- the block helpers need the post's author, and the shared access check doesn't return it.

The plan's `403 blocked` answer goes against the two routes already doing this, which answer `404`, and it
would tell a person that someone blocked them. Unverified students still have a placeholder handle 33
characters long, so "type your handle to delete" is a trap on exactly the screen S1C fixes. The seed
script needs hard walls so no agent run can ever touch production.

---

1. **S1A + S1B — blocking — the event must not fire on success; the sheet lives inside the row it removes.**
   Phone: `FeedCard` (`src/components/mobile/CampusMobile.tsx:1039`) mounts `PostActionsSheet` (`:1674-1690`),
   which mounts `ReportSheet` (`:3313`). Desktop: `FeedRow` (`src/app/campus/campus-home.tsx:6186`) mounts it
   at `:7087`. Removing the post when the report succeeds unmounts the sheet during its "Thanks — we're on it"
   state, along with the "Block {name}" offer (`src/components/safety/ReportSheet.tsx:171-199`). It also
   unmounts two vaul drawers while they are still animating (vaul closes in 0.5 s and exposes `onAnimationEnd`).
   Today the existing delete and block flows only avoid this because they wait on a network refetch.
   **RULING (overrides the §4 contract's "after a successful report"):**
   - **Firing (S1B):** ReportSheet fires `vibe:content-reported` exactly once, when a sheet whose report was
     already sent gets closed. That happens inside `dismiss` (`ReportSheet.tsx:367-370`) when `sent` is true.
     If the sheet unmounts while sent and nothing has fired yet, it fires from that cleanup, guarded by a ref.
     It never fires on a refusal or an error.
   - **Listening (S1A):** keep a `reportedPostIds` ref Set. On the event, add the id and remove the post from
     state after **600 ms** (`setTimeout`, cleared on unmount), which is longer than vaul's 0.5 s close.
     Every later `setFeed` / `setTagFeed` / `setEntries` also filters through the Set, so a refetch already in
     flight can't bring the post back.

2. **S1A + S1B — major — the contract's names, and which lists render the phone feed.**
   At ≤899 px `/campus` renders `CampusMobile`, not `CampusHome` (`src/app/campus/CampusSwitch.tsx:22-29`,
   `useIsMobile`). CampusMobile holds **two** lists: `feed` (`CampusMobile.tsx:280-291`) and `tagFeed.posts`
   (`:432-436`). Desktop `FeedTabBody` holds `entries` (`campus-home.tsx:5416`), and its rows may be
   `kind: "repost"` (`:5658`). `PostViewerMobile` is mounted by `openPostId` (`CampusMobile.tsx:775-790`),
   not from the list, so dropping the card leaves an open viewer alone. The detail values match what the
   sheet sends: `target.type` / `target.id` (`ReportSheet.tsx:100-106`), e.g. `"post"` + the post uuid.
   **RULING:** listeners live in CampusMobile's top component and in `FeedTabBody`. They filter all three
   lists on `post.id === detail.targetId` (every entry kind) and only when `targetType === "post"`.
   S1B exports `CONTENT_REPORTED_EVENT = "vibe:content-reported"` and
   `type ContentReportedDetail = { targetType: ReportTargetType; targetId: string }` from `ReportSheet.tsx`
   (the precedent is `CALENDAR_CHANGED_EVENT`, `src/components/LeftNav.tsx:18-21`). S1A runs at the same time,
   so importing an export that doesn't exist yet would fail its `tsc` gate. S1A uses the string literal plus a
   local type this wave, with a comment naming the constant, and the repair pass switches it to the import.

3. **S1A — blocking — club-page posts are rendered by a server component.**
   `src/app/orgs/[handle]/page.tsx` has no `"use client"`. Its `PostsSection` (`:939-1030`) is plain
   `<article>`s, so a Report button (state + `ReportSheet`) and a window listener can't live there, and the
   client shell `OrgContent.tsx` isn't S1A's. The page is public: `user` may be null (`:153-160`).
   **RULING:** add a new file, `src/app/orgs/[handle]/OrgPostsList.tsx` (`"use client"`), to S1A:
   - `page.tsx` moves the card markup into it and passes `posts`, the org display fields and
     `viewerId = user?.id ?? null`.
   - Report is hidden for signed-out visitors and on the viewer's own posts (the route answers 400
     "You can't report something of your own", `src/app/api/me/reports/route.ts:303-305`).
   - Target `{ type: "post", id, authorId: p.user?.id ?? null, authorName }`, so Block reaches the officer
     who posted.
   - The variant follows the page's own 720 px breakpoint: copy the ~10-line `useSyncExternalStore` query
     from `OrgContent.tsx:15-37` (it isn't exported).
   - The listener drops the post for this session only: the page reads posts with the service role and no
     report filter, so a reload brings it back. Accepted; the feed is where hiding matters.

4. **S1A — major — `EventCard` is shared by three viewports and doesn't know which one it's in.**
   `EventCard` (`campus-home.tsx:8556`) renders on desktop, in the phone Events pane (`CampusMobile.tsx:1723`)
   and on club pages (`OrgEventsSection.tsx:165`). `ReportSheet` defaults to `"modal"`.
   **RULING:**
   - `variant={isMobile ? "sheet" : "modal"}` with `useIsMobile()` from `src/lib/use-is-mobile` (the fork
     CampusSwitch uses).
   - Hide Report when `ev.is_creator` (`campus-home.tsx:8363`; the route's owner for an event is `creator_id`,
     `reports/route.ts:128-132`).
   - No `authorId` (`NO_BLOCK` includes `event`, `ReportSheet.tsx:67`); `noun: "event"`.
   - Events need sign-in (`/api/events` answers 401), so there is no anonymous case.
   - `OrgEventsSection.tsx` needs no edit for this: it renders `EventCard`. S1A leaves it alone unless it
     finds a real reason.

5. **S1B — major — answer a blocked pair with 404, not `403 code:"blocked"`.**
   The routes already checking blocks on post engagement answer 404: the like route
   (`src/app/api/posts/[id]/like/route.ts:96-100`, "so a like can't confirm a post exists or notify across a
   block") and comment likes (`src/app/api/comments/[id]/like/route.ts:109-114`). `describeFailure` has no
   `blocked` branch (`src/lib/feedback/failure-copy.ts:117-171`). A 403 would also tell the blocked person
   they were blocked.
   **RULING:** a blocked pair gets each route's existing `postNotFound()` (404 "Post not found"). The client
   already words that as "That's no longer available." (`failure-copy.ts:204`). No `code:"blocked"`. A
   failed block read answers 500 "Request failed" (fail closed), like the like route.

6. **S1B — major — the block check needs the author, and the shared access check doesn't return it.**
   `postAccessForCaller` selects `user_id` (`src/lib/orgs/hidden-org-access.ts:166-170`) but returns only
   `{ ok, hidden }` (`:132-134`), and S1B doesn't own that file. It has six callers (reports, comments ×2,
   repost, save, view), and all of them read only `ok` / `hidden` / `reason`.
   **RULING:**
   - Add `hidden-org-access.ts` to S1B, for an **additive** `authorId: string | null` on the `{ ok: true }`
     branch and nothing else. If ownership can't widen, S1B does one extra user-client read,
     `posts.select("user_id").eq("id", id).maybeSingle()`, after access passes.
   - Then call `loadPairBlock(supabase, user.id, authorId)` (`src/lib/safety/pair-block.ts:62`; it makes no
     query for yourself, so an author on their own post is never refused).
   - **repost:** inside `gatePost`, so POST and PATCH both check it.
   - **save:** after the access check.
   - **comments POST:** right after the access check and before the body parse, which keeps a hidden post and
     a missing one indistinguishable. Check the **post author only**. Only the post owner is notified
     (`supabase/migrations/20260504150000_notifications.sql:104-121`), and item 7 hides a blocked person's
     replies from the blocker.
   - DELETE (unsave, un-repost) never checks.
   - Club posts check the officer who posted, the same key the feed hides on (`src/app/api/feed/route.ts:325-330`).
   - No admin exemption, the same as likes.

7. **S1B — major — the comments GET still shows blocked people's comments.**
   The GET query has no hidden-user filter (`src/app/api/posts/[id]/comments/route.ts:104-116`), and RLS only
   applies `user_visible` (`supabase/migrations/20260923090000_moderation_foundation.sql:2190-2196`). A reviewer
   who blocks the demo "friend" still sees the friend's comments under their own post.
   **RULING:**
   - Add `loadHiddenUsers(supabase, user.id)` (`src/lib/safety/hidden-users.ts`) to the existing
     `Promise.all` and exclude `hidden.blocked` only (not mutes) with `.notIn("user_id", ids)` inside
     `readThread`, before `.limit`.
   - A failed read answers 500. The viewer's own rows are never in the set.
   - Say in a comment that the card's `comment_count` (RPC) can be higher than the rows shown, and that replies
     under a hidden root are dropped by the existing orphan rule (`:211`).

8. **S1B — major — how the feed exclusion has to work.**
   `reports` grants nothing to `authenticated` (`moderation_foundation.sql:2121-2122`), so a user-client read
   fails. `createSupabaseServiceClient()` throws when the key is missing (`src/lib/supabase/service.ts:9`).
   The feed has no cursor: it is `limit` plus a ranking pool (`feed/route.ts:163-183`), so filtering in JS after
   the query would shrink the page and starve the ranking.
   **RULING:**
   - Read `reports.select("target_id").eq("reporter_id", user.id).eq("target_type", "post")
     .order("created_at", { ascending: false }).limit(100)` with the **service** client, inside the first
     `Promise.all` (`:189`).
   - Guard it with `isSupabaseServiceConfigured()`.
   - **Any** status: a dismissed report still hides the post from its reporter.
   - Fail closed with 500 "Request failed", like hidden users (`:209-214`). Drop anything that isn't a uuid.
   - Apply `.notIn("id", ids)` in `buildPostsQuery` next to the hidden-users `notIn` (`:329`). That puts it
     before the limit, the ranking, the per-author cap, `?tag=`, `sort=recent` and the legacy `posts` field.
   - The cap of 100 keeps the PostgREST URL bounded (`laneFilter` already carries follow ids). The query uses
     `idx_reports_reporter`.
   - `/api/me/reports` needs **no** change and isn't S1B's: leave it read-only.

9. **S1C — blocking — the delete path reviewers use isn't owned.**
   Settings delete ends with `clearDraft(); window.location.href = "/"` (`src/components/settings/SettingsClient.tsx:1254-1256`).
   It is the only other caller of `DELETE /api/me` besides `suspended-actions.tsx`, and it is the path Apple
   tests (repo-readiness a1).
   **RULING:** add `SettingsClient.tsx` to S1C for a ranged edit: `"/"` → `"/auth/signup"`, keeping
   `clearDraft()`. Make the same change at `src/app/account/suspended/suspended-actions.tsx:83-84`.

10. **S1C — major — an unverified student's handle is a 33-character placeholder.**
    Signup collects no handle, so until onboarding claims one the handle is `u<32 hex>`
    (`src/lib/profile/onboarding-prefill.ts:448-454`). `DELETE /api/me` requires `confirm_handle` to equal it
    (`src/app/api/me/route.ts:78-101`), so on `/auth/school-email` the student would have to type
    `@u3f2a9…` back.
    **RULING:**
    - Read the handle with the browser client: `users.select("handle").eq("id", userId)`. It is RLS-readable;
      the DELETE route reads it with the user client at `:87-91`.
    - When `isTriggerDefaultHandle(handle)` (pure imports; or copy its one regex), the box asks the student to
      type `delete`, and the client sends the real handle as `confirm_handle`.
    - Otherwise nothing changes. The server contract and its cross-site guard are untouched: another site
      still can't know the handle.
    - Put this in `SuspendedActions` too, since a banned student who never verified has the same placeholder.

11. **S1C — major — reuse the code, and the phone onboarding header.**
    `SuspendedActions` already holds sign-out and delete, using the `vibe-auth-*` classes `/auth/school-email`
    uses. `OnbHeader` is a `44px 1fr auto auto` grid (`OnbHeader.tsx:73-77`), and its parent passes no handle
    (`src/components/mobile/OnboardingMobile.tsx:1087-1094`, not owned). Skip already completes onboarding
    (`:811-813`), so onboarding is not a hard dead end; `/auth/school-email` is.
    **RULING:**
    - Export a `useLeaveAccount()` hook (sign out, delete, busy, error, the item 10 confirm rule) from
      `suspended-actions.tsx`.
    - Reword `SuspendedActions` so it reads right off the suspended page (drop "instead" / "on this browser",
      or make them props) and mount it on `/auth/school-email` only when `userId` is set.
    - `OnbHeader` gets one 44 px "⋯" (`aria-label="Account"`) that opens a small vaul sheet with the same two
      actions. The sheet reads the handle itself. Strings go inline with a comment (`onb-copy.ts` isn't owned).
    - The visible labels are exactly **"Sign out"** and **"Delete account"**, because S1D's page quotes them.

12. **S1D — major — `/legal/delete-account` must say what is kept (Play Data safety).**
    What survives a deletion:
    - reports **about** the student keep `target_owner_id` (no FK) and `target_snapshot` (`moderation_foundation.sql:2061-2066`);
    - reports the student **filed** survive with `reporter_id` set to null (`20260506100000_safety_block_mute_report.sql:81`);
    - a ban keeps a keyed hash of the school address (`src/lib/moderation/identity.ts`);
    - the Stripe customer is deleted (`me/route.ts:29-35`), but Stripe keeps its own records.

    **RULING:**
    - List those in plain words.
    - Write no backup-retention number unless Franky confirms one (leave a code-comment TODO, not page text).
    - The in-app steps must match the real path: Profile → gear (Settings) → "Delete account…" → type your
      handle → "Permanently delete" (`SettingsClient.tsx:1231-1238`, `1328-1407`). Add "Delete account" on the
      Verify-your-campus screen (item 11).
    - Email route: help@connectvibe.app, from the address you sign in with.

13. **S1D — minor — the landing footer overflows at 375 px, and badges must stay out of the warp.**
    `.vibe-landing-footer` is flex, `space-between`, no wrap, uppercase with `0.14em` tracking, at
    `rgba(250,247,242,0.35)` (`src/app/globals.css:910-921`, not owned).
    **RULING:**
    - Inline style overrides: `flexWrap: "wrap"`, `gap: "8px 16px"`, and links at `rgba(250,247,242,0.7)`.
    - Neither the badge block nor the footer links may carry `data-warp-trigger` or sit inside an element that
      does. `closest()` would catch them and send any non-`/` href to `/auth/login` (`home-landing.tsx:79-89`).
    - While a URL is set but official art isn't in yet, render a plain text link, never a drawn badge.

14. **S1D — minor — `/get`.**
    **RULING:**
    - Reuse `detectPlatform` + `isIosPlatform` from `src/lib/pwa/display-mode.ts` (pure) with
      `maxTouchPoints: 0`. An iPad sending a desktop UA gets `/`; accepted, the app is iPhone-only.
    - Take a store URL only if it starts with `https://apps.apple.com/` or `https://play.google.com/`.
    - Never read a destination from the query.
    - Respond with `Cache-Control: private, no-store` and `Vary: User-Agent`, so no cache hands one device's
      307 to another.
    - `.env.example` must say `NEXT_PUBLIC_*` values are inlined at build: changing one needs a redeploy.

15. **S1D — minor — `/support` for a restricted student.**
    The proxy sends a restricted student to `/account/suspended` for every page except `/legal/*`,
    `/auth/callback` and `/auth/confirm` (`src/proxy.ts:144-156`). `/legal/delete-account` passes; `/support`
    doesn't. `LegalLayout`'s footer (not owned) has no Support or delete link, and its Contact is `hello@`
    (`LegalLayout.tsx:117`) while every support surface says help@.
    **RULING:** accept for S1: the notice page prints help@ and offers Sign out and Delete. Report both to the
    owners (proxy → S3D; LegalLayout → next wave). `/support` names help@ only.

16. **S1E — blocking — walls between the seed script and production.**
    **RULING:**
    - (a) Local mode takes the URL and keys only from `supabase status -o env`, exactly as
      `scripts/local-seed.mjs:24-63` does. It reads no `.env*` file.
    - (b) The host check runs before any client is created. A non-local URL without the flags exits before
      any network call, because a dry run against production is still a production read.
    - (c) `--production` reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `process.env`
      only. It needs both flags **and** `process.stdin.isTTY` with the project ref typed back, so no
      non-interactive agent can apply it.
    - (d) Passwords come from env only (`REVIEW_PASSWORD_A` / `_B`), never argv (shell history and `ps` show
      argv). No default, never printed, and not needed for a dry run.
    - (e) Never print a key, a password or the service URL.
    - (f) Never set `is_platform_admin`: reviewers must be non-admins.

17. **S1E — major — the seed must write the real columns and respect school-email identity.**
    Confirmed on the local stack's `users` table:
    - **verified** = `school_email`, `school_verified`, `school_system`, `campus_id` (`indianapolis`),
      `school`, `campus_set_at`;
    - **onboarded** = a non-empty `otto_answers` (`src/lib/auth/post-login.ts:7-10`), plus `handle_changed_at`;
    - **Terms** = createUser metadata `{ terms_version, age_attested: true }` (the signup trigger writes the
      consent columns and a `signup` ledger row), or `terms_version` / `terms_accepted_at` / `age_attested_at`
      plus a `terms_acceptances` row whose `source` is `signup` or `interstitial`
      (`20260906120000_terms_acceptances.sql:50`).

    There is **no** `onboarded`, `onboarding_complete` or `is_verified` column. Posts need
    `status: "published", type: "post"`. Follows are `connections(follower_id, following_id)`.
    **RULING:**
    - Follow `local-seed.mjs`'s `ensureAccount`, including reading `TERMS_VERSION` from `src/lib/legal/terms.ts`.
    - Give each account a real handle matching `^[a-z0-9_]{3,20}$`, so the reviewer's delete confirmation can
      be typed.
    - Refuse if that handle already belongs to a different account.
    - The school email comes from env, with no default in production. Refuse it when its canonical form
      (lowercase, `+tag` stripped, subdomains folded into iu.edu / purdue.edu; `identity.ts:80-93`) matches
      another verified row. A service-role write skips `schoolIdentityConflict` (`src/lib/moderation/access.ts:330-360`),
      so without this check it would create a second account on one student's identity, or claim a real
      student's address for good.
    - Add one comment from B on A's post, so reporting and blocking a comment can be tried (repo-readiness a4.3).

18. **S1E — major — the Sentry handle scrub must not wreck stack frames.**
    `scrubValue` runs over every string, stack frames included (`src/lib/sentry-config.ts:47-68`, `106-112`).
    A loose `/profile/[^/]+` would rewrite `app/profile/page-<hash>.js` chunk frames and break source maps.
    Desktop also hops to `/html/profile.html?app=1&handle=<h>` (`src/app/profile/[handle]/page.tsx:104`), which
    lands in a navigation breadcrumb.
    **RULING:**
    - Write `redactHandles(s)` for `/profile/` and `/api/users/` followed by `[a-z0-9_]{3,20}`
      (`src/lib/profile/handle.ts:10`), with the lookahead `(?=[/?#&"'\s)]|$)` (never `.` or `-`).
    - Match case-insensitively, and also the `%2F` / `%252F` encodings (login `next=`).
    - Skip the fixed segments `/api/users/search` and `/api/users/by-id`, and also redact a `handle=` query
      value.
    - Chain it after `redactAuthTokens` in `scrubValue` and in the `request.data` branch.
    - Add `src/lib/sentry-config.test.ts` to S1E (the module imports only a type, so `node --test` loads it).
      It asserts: chunk paths are unchanged, an encoded `next=` is redacted, and search / by-id are untouched.

19. **S1E — minor — review notes.** `handoffs/` is gitignored (`.gitignore:68`) and mirrored into the Obsidian
    vault. **RULING:** the template holds no credentials. The credential fields read "entered in App Store
    Connect / Play Console only".

20. **S1B — minor — the save route and the sheet's wording.**
    S64 §8 noted that save has no rate limit.
    **RULING:**
    - Add `rateLimit("save:<uid>", …)`, failing open, above the access check. No Terms gate: every campus route
      already runs it, and a 403 here would undo the save silently.
    - For a sent `post` report, ReportSheet adds one line: "We'll hide it from your feed."

---

**Out of scope (report, don't fix in S1):**
- **Route block checks are UI-level only.** `post_comments_insert_own` and `post_reposts_insert_own` have no
  block clause (`moderation_foundation.sql:2198-2215`), and `authenticated` can insert over REST directly.
  `public.is_blocked_either_way` exists. The fix is a migration like the one for DMs (`messages_insert_member`);
  S1 has no migration batch.
- `GET /api/posts/[id]` has no block check, so a blocked person can open a post by its link.
- The `hello@` vs `help@` split on the legal pages, and `/support` missing from `restrictedPageAllowed` (item 15).

**DEFERRED (browser/phone, never claimable by a batch):** the report → Done → card leaves after ~0.6 s with no
frozen scroll (item 1) at 375 px as a non-admin; the event Report sheet on the phone and on a club page; Sign out
and Delete on `/auth/school-email` with a placeholder handle; `/support` and `/legal/delete-account` signed out;
the `/get` redirect per device; the footer wrapping at 375 px.
