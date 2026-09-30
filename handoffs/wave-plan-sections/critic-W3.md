## Critic additions — Wave 3 (§8: E2, B12S, CH1, B14t, B15) + gate G3

Checked against HEAD `15062bd` (wave 1 on disk; wave 2 still contract text). Ownership (§5) has no file owned twice in W3, and no W3 batch imports a module built in W3: E2 and CH1 import only E0's `edit.ts`, B12S only F5a/F1 files, B15 only `draft.ts` / `profile-campus-write.ts`. B12S matches the real F5a exports (`orgRowView(rel,"onboarding")`, `inviteSubText(first, expires, tz?)`, `OrgJoinControl` props `variant/source/replay/relation/pendingInviteId/onChange`, `OrgControlChange {state, following, role, declined?}`), and the real `wantsDisclosure` (`joinPolicy !== "open"`) doesn't conflict with anything in W3. Read-only SQL: Franky has 7 text-only published posts and 2 with media, so E2's text/image checks can run.

### Blockers

None found.

### High

**H1. G3 checks 4 files, but W4 imports at least 8 things from W3. PM's own section says to widen G3, and §4.3 and W3 item 1 were never updated.**
- Evidence:
  - §4.3 G3 names only `EditPostSheet.tsx`, `CampusConfirmBanner.tsx`, `onb-copy.ts`, `social-steps.ts`. W3 item 1 is `rg -c … → 4`.
  - PM §9 (plan :2903): "B15: `settingsCampusCardView` in `src/lib/profile/settings-campus-card.ts` … **Add this file to the G3 list.**"
  - B12 (:1573) imports `COLORS` + the eleven styles from `onb-theme.ts`, plus `StepClubs`, `initialClubsState`, `StepPeople`, `initialPeopleState`.
  - CM (:2208) and PM (:3045) need `PostViewerMobile`'s `onEdited` prop.
  - CH2 (:2552, :2889) keeps CH1's `useViewerCampus` and `CampusBanner`.
- Fix: rewrite G3 and W3 item 1 as:
  - `git ls-tree -r --name-only origin/main | rg -c 'src/components/mobile/(EditPostSheet|CampusConfirmBanner)\.tsx|src/components/mobile/onboarding/(onb-copy|onb-theme)\.ts|src/components/mobile/onboarding/(StepClubs|StepPeople)\.tsx|src/lib/onboarding/social-steps\.ts|src/lib/profile/settings-campus-card\.ts'` → **8**
  - `git grep -n "onEdited?:" origin/main -- src/components/mobile/PostViewerMobile.tsx` → 1
  - `git grep -n "export function useViewerCampus\|export function CampusConfirmBanner\|export function EditPostSheet\|export function settingsCampusCardView" origin/main` → 4
  - Name the export form in each contract: B14t `export function CampusConfirmBanner(): JSX.Element | null` (no props, named export); CM :2207 currently guesses.

**H2. G2 (the gate before W3 pushes) never checks that E1 and F4 are live, yet E2 and CH1 ship Edit buttons that depend on them.**
- Evidence:
  - §4.3 G2 checks only `POST /api/orgs/<hidden>/follow → 404` and `org_follow_state` on discover, and says only "B12S's controls call those routes".
  - E2's header reads "E1 live (PATCH by URL)". CH1's reads "E1 + F4 live".
  - Today's PATCH (`src/app/api/posts/[id]/route.ts:327-335`) still takes `{content}`. It trims, writes `content` only, never re-derives `tags`, has no rate limit and no empty-text guard for text posts, and never stamps or returns `edited_at` (`select("id,user_id,type,content,tags,media_url,media_thumbnail_url,status,created_at")`).
  - So if E1 was held back in W2 repair, W3's Edit "works" but leaves stale `#tags`, lets a text post be emptied by a crafted client, sends no mention notifications, and never shows " · Edited". No W3 check would notice: the canned PATCH overrides in W3 items 2–3 fake the new response.
- Fix: add to G2 (read-only, as Franky):
  - `GET /api/posts/<one of Franky's post ids>` → `jq 'has("post") and (.post|has("edited_at"))'` → true (E1 GET).
  - `GET /api/feed?limit=5` → `.feed[0].post|has("edited_at")` → true (F4).
  - `GET /api/me/posts` → rows have `edited_at` (E1).
  - `git grep -n 'post-edit:' origin/main -- 'src/app/api/posts/[id]/route.ts'` → 1 (E1's rate-limit key is on main).
  - E2 and CH1 must not push until all four pass.

### Medium/Low

**M1. CH1 halo item 6: `MajorNode` can't see `data`, so the contract's expression doesn't compile. The likely workaround (passing null) turns every bubble grey.**
- Evidence:
  - The third `schoolForMajor` site (plan :10536, HEAD :10571) is inside `function MajorNode({ major, x, y, radius, active, onClick })` (:10548). There is no `data` and no `m` in scope; the variable is `major.name`.
  - `schoolForMajorIn` (`majors.ts:387-393`) returns `OTHER_SCHOOL` whenever `campusId` isn't Indianapolis, so a `null` campus puts every bubble in "Other".
  - `/api/campus-map` does send `campus_id` (`route.ts:252`), so the data exists.
- Fix:
  - `MajorNode` gains a prop `campusId: string | null`. The `<MajorNode` mount (:9994) passes `campusId={data?.campus_id ?? null}`. Use `schoolForMajorIn(campusId, system, major.name)`.
  - Pass `system = useViewerCampus().system` (not `null`) at all three sites. Otherwise a Purdue student's ambiguous major resolves IU-first (`majors.ts:394-397`).
  - Acceptance: "no bubble uses the Other colour for a major that exists in `IU_INDIANAPOLIS_LOOKUP` or the Purdue lookup".

**M2. CH1 tour item 7: the feed bubble needs `label`, but the tour effect starts before `/api/campuses` answers. The contract doesn't say how to wait.**
- Evidence: the effect (HEAD :381-455) has deps `[searchParams]`, and it calls `window.OttoTour?.start([...])` as soon as `loadOttoTourScript()` resolves. `useViewerCampus` is async. Adding `label` to the deps re-runs the effect, and the cleanup only sets `cancelled` for a pending script load, so an already-started tour would `start` a second time. Leaving it out means the body always reads "your campus".
- Fix: inside the effect, `await Promise.race([viewerCampusPromise(), timeout(1500)])` before `start` (the same pattern as B14t's 1500 ms fetch). Export the module promise getter next to `useViewerCampus`. Don't add `label` to the deps. Also make the body's wording match the phone: fallback "What students on your campus are posting…" (B14t) vs CH1's "at your campus". Pick one, and use `shortName` on both (desktop uses `campus.name` → "IU Bloomington", phone uses `shortName` → "Bloomington").

**M3. CH1 `useViewerCampus` module cache: the W3 override check can't run as written, and the cached campus goes stale after a pick in Settings.**
- Evidence:
  - W3 item 3 says "`__getOv` on `/api/campuses` … on a fresh load". But §11.0 says "A full `goto` or reload drops the wrapper", and `CampusBanner` fetches on mount.
  - The contract caches "once per page (module-level promise cache)". The strip links to `/settings#campus` (B15). After a campus save there, a client-side return to `/campus` reuses the cached `currentCampusId:null` and still shows "Pick your campus", until a hard reload.
- Fix:
  - Cache per document with invalidation: clear the promise on `pageshow` / `visibilitychange→visible` and when every consumer unmounts, or give it a 30 s TTL.
  - Rewrite the check: "full-load `/settings` (no `/campus` visit in this document), install the harness, set `__getOv` for `/api/campuses`, then click the LeftNav `a[href="/campus"]`".
  - Same for the 500 case.

**M4. CH1 acceptance `rg -n "filter=mine" … → exactly :465 and :6997, unchanged` fails on CH1's own diff.**
- Evidence: CH1 adds `useViewerCampus` after `CampusBanner` (:3325), plus the FeedRow editor state and JSX (:5136-5662). Both land above :6997, so that line moves.
- Fix: "`rg -c 'vibeRequest<[^>]+>\("/api/orgs\?filter=mine"' src/app/campus/campus-home.tsx` → 2, and `git diff -U0 HEAD -- src/app/campus/campus-home.tsx | rg 'filter=mine'` → nothing".

**M5. E2: `bindMentionPicker` suggestions can't be tapped inside a vaul sheet.**
- Evidence:
  - vaul 1.1.2 `Root` defaults to `modal = true` (`node_modules/vaul/dist/index.mjs:879`). Radix `DismissableLayer` then sets `ownerDocument.body.style.pointerEvents = "none"` (`@radix-ui/react-dismissable-layer/dist/index.mjs:73`).
  - `_mentionPicker.js:46` appends `.vmp-popover{position:fixed;…z-index:100000}` to `body` with no `pointer-events`, so it inherits `none`.
  - Every existing picker binding is outside vaul (`campus-home.tsx:4654`, `PostComposerMobile.tsx:123`, a plain `role="dialog"` div at :340). E2 would be the first inside one.
- Fix: EditPostSheet renders `<style>{".vmp-popover{pointer-events:auto}"}</style>` inside `Drawer.Content` (it doesn't own `_mentionPicker.js`). Add to E2 acceptance at 375×812: type "@fr", tap the first suggestion, and the textarea contains "@<handle> " with the sheet still open. If it can't be made to work, drop `bindMentionPicker` from E2 and say so.

**M6. B12S's people step is a new place to show a blocked user: the suggestions route ignores a failed block read.**
- Evidence: `src/app/api/me/suggested-connections/route.ts:302-310` does `const { data: blocks } = await supabase.from("blocks")…` with the error discarded, so a transient failure yields `blockedIds = {}` and people who blocked the viewer appear by name and avatar. Mutes (`loadHiddenUsers`) are never applied. B12S's 403 → `removed[id]` only hides a row after a Follow tap. No W3 batch owns this route.
- Fix: give B14t ownership of `src/app/api/me/suggested-connections/route.ts` for a fail-closed change: blocks error → `console.error("[suggested-connections blocks]")` + 500 `{ok:false,error:"Request failed"}`, and also drop `loadHiddenUsers(supabase,user.id).hidden.ids` (fail closed). Or spawn it as its own W3 batch. Add a B12S acceptance line: "a blocks-read failure renders LoadFailed, never a list".

**M7. B12S never defines the clubs empty-state line for a student with no campus, and B13's parity check depends on that string.**
- Evidence: `ONB_COPY.clubs` has `emptyBody "…show up for everyone at {campus}."` but no `emptyBodyNoCampus`. People has one (`people.emptyBodyNoCampus`). `fillCampus(t, campus, fallback)` needs a fallback, and StepClubs's render only says "emptyTitle + emptyBody (`fillCampus`)". B13 (:2074) punts: "`<fallback>` is whatever `StepClubs.tsx` passes on `main` … if it's a literal, it joins `ONB_LOCAL_COPY`". B12 (:1582) also forbids new `ONB_COPY` strings in W4, so an invented literal can't be fixed later.
- Fix: add `clubs.emptyBodyNoCampus: "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone here.”"` to the B12S copy table. StepClubs uses `fillCampus(clubs.emptyBody, campusShortName, clubs.emptyBodyNoCampus)`. Add test (i2).

**L1. B12S StepClubs and StepPeople render `LoadFailed` without `tone="dark"` on the charcoal onboarding background.**
- Evidence: `LoadFailed.tsx:53-58` defaults `tone = "light"`: text `#5C5853` and a `rgba(28,28,30,0.14)` border, nearly invisible on `COLORS.charcoal "#1C1C1E"` (`OnboardingMobile.tsx:63`).
- Fix: both steps call `<LoadFailed tone="dark" failure onRetry />`.

**L2. B12S: which part of the response `parseSuggestions` reads, and whether steps render their own section or orb, is ambiguous.**
- Evidence: the route answers `{ok:true, suggestions:[…]}` (`suggested-connections/route.ts:427`), but B12S says only `parseSuggestions(raw)`. B12 (:1590) expects step components to "render from their `h2` down, with no section and no orb"; B12S's Render list doesn't say so.
- Fix: StepPeople calls `parseSuggestions(r.data.suggestions)`, and `parseSuggestions` returns `[]` for a non-array. Add to StepClubs and StepPeople: "no `<section>` wrapper and no `OttoOrb`; the root is a fragment starting at the `h2`".

**L3. B12S people groups and B14t People groups disagree on order and label, for the same `reason_v2` values.**
- Evidence: B12S orders `clubs, campus, major, system, more`, with `mutuals` and `new_on_vibe` → "More people on Vibe". B14t orders `org, campus, major, mutuals, system, new`, labelled "Friends of friends" and "New on Vibe".
- Fix: accept it on purpose (the onboarding list is short), and say so in both contracts. Or align B12S to add `mutuals` "Friends of friends" before `system`. Either way, B13's parity fixture follows B12S.

**L4. B15: the contract can't do its campus-lock error as written, because `vibeRequest` drops `availableAt`. `ownCampusFields` also has no `schoolVerified`.**
- Evidence:
  - `VibeFailure` is `{ok,status,code,error,message,action}` only (`request.ts:35-42`), while the route sends `availableAt` beside `code` (`api/me/profile/route.ts:375-382`). The contract says: "error text is `campusChangeTooSoonCopy(availableAt)` for `campus_change_too_soon` with `availableAt`".
  - `OwnCampusFields` is `{schoolSystem, campusId, campusBadge, campusChangeAvailableAt, campusConfirmed}` (`profile-campus-write.ts:432-438`), but `SettingsCampusInput` requires `schoolVerified`.
- Fix:
  - On `r.code === "campus_change_too_soon"`, show `r.error` (the server already sends `campusChangeTooSoonCopy(availableAt)`, :262-264) and set `locked = true` without a date.
  - page.tsx passes `campus={{...ownCampusFields(row), schoolVerified: Boolean(profile?.school_verified), onboarded}}`, and drops `campusBadge` before the prop.

**L5. B15 confirm ("Yes") and B14t's banner "Yes" silently start the 30-day campus lock.**
- Evidence: re-sending the current campus before it's stamped writes `campus_set_at = now` (`profile-campus-write.ts:16-18`, :268-274). Then `campusChangeDecision` refuses a change for 30 days once onboarded (`onboarding-prefill.ts:437-442`). Neither copy says so, and B15 immediately shows "You can change your campus again on …".
- Fix: add a line under both callouts, e.g. "Confirming locks your campus for 30 days." (B15 `settings-campus-card.ts` constant, which B14t copies verbatim). Or accept it and note it for B21's legal and onboarding draft.

**L6. B14t renames "Connect" only on the phone People screen. Desktop still says "Connect", and two other phone sheets change without being listed.**
- Evidence:
  - Still "Connect": `src/components/network/UserCard.tsx:499` (`label = "Connect"`, `"Connect back"` :495), `src/app/campus/campus-home.tsx:3856`, `:3895` (desktop search), `public/html/profile.html:3306`, `:6613`, `:9858`.
  - Changed silently: the exported `UserRow` is also rendered by `MutualsSheet.tsx:8` and `PostAudienceSheet.tsx:7,90`.
- Fix: say in Q13/B14t that desktop keeps "Connect" until a named later batch (CH2 owns campus-home in W4, PH owns profile.html in W5), or add those lines to their contracts. List MutualsSheet and PostAudienceSheet under B14t's "also changes".

**L7. Two W3 live checks can't run as written: B14t's 500-override tour check and E2's "last recorded request" body check.**
- Evidence:
  - W3 item 4: "With `__getOv` on `/api/me/onboarding-state` returning 500 (installed before the soft navigation)". The tour only starts on `?welcome=1` or `vibe_tour_pending`, and the tab-bar link is `a[href="/campus"]`, with no `welcome`.
  - W3 item 2: `Object.keys(JSON.parse(__nonGet.at(-1).body))`. `__nonGet` also logs background writes (the view ping, `bg:true`), which can land after the PATCH.
- Fix:
  - B14t check: install on `/settings`, `localStorage.removeItem("vibe_campus_tour_seen_v1")`, `localStorage.setItem("vibe_tour_pending","campus")`, set `__getOv`, then click the tab-bar `/campus` link. Expect the fallback body.
  - E2 check: use `__nonGet.filter(e => e.m === "PATCH").at(-1)`.

**L8. B14t's `CampusConfirmBanner` ships in W3 with no render check until W4, and its "Yes" failure path is only asserted in CM.**
- Evidence: B14t acceptance says "The banner has no screen yet (CM mounts it)". CM is W4, and CM (:2201) may not edit the file ("defects go to the orchestrator").
- Fix: B14t adds a scratch-only harness page (not committed) or a localhost `/campus` render with a temporary mount that is reverted before commit. Screenshot all three states: confirm, pick, hidden (`campus_confirmed:true`). Check "Yes" with the non-GET blocker: one PATCH `{"campus_id":"indianapolis"}` → 418 → toast, banner stays. Also check that "Not now" sets `sessionStorage.vibe_campus_confirm_dismissed`.

**L9. E2: between W3 and W4 deploys, an edit made in the phone viewer doesn't reach the card underneath.**
- Evidence: `onEdited` is optional, and the three mounts (`CampusMobile.tsx:600`, `ProfileMobile.tsx:1990`, `PostPageClient.tsx:17`) don't pass it until CM/PM in W4.
- Fix: accept it and write it down in E2 ("cards refresh on next load until W4"), so a W3 tester doesn't file it as a bug.

**L10. CH1 anchors past :8136 are 35–42 lines stale after H1's campus-home diff.**
- Evidence: the H1 hunks `@@ -8136,10 +8136,49`, `@@ -8214,9 +8253,12`, `@@ -8444,14 +8486,11`, `@@ -9100,15 +9139,11`. Rule §4.1.6 allows re-grepping, but CH1 still cites raw lines. At HEAD `15062bd`:
  - "Organizations · IU" is :8297 (plan :8255); subtitle :8299 (:8257); Verified hint :8417 (:8375, text "Officially recognized orgs at IU.")
  - map eyebrow :9819 (:9784); map empty line :9882 (:9847)
  - `schoolForMajor(` :9553 / :10091 / :10571 (:9518 / :10056 / :10536)
  - `IU_SCHOOLS.filter` :9560 (:9525); `IU_SCHOOLS.map` :10339 / :10384 (:10304 / :10349)
  - `MapSummary` :9432-9439 (:9394-9404)
  - `EmptyState` "Campus · IU" :13552 (:13517); "Browse clubs and orgs at IU." :13625-13626 (:13590-13591)
  - tour `endLabel` :434 (plan :427 is `title: "Switch lanes anytime."`); `window.location.href = "/network?welcome=1"` :444
- Fix: replace the line numbers in CH1 items 5–7 with these, or with the quoted strings.

**Anchor spot-check (≥15, at HEAD `15062bd`).** Correct:
- campus-home: `SCHOOL` :293, tour body :423, `filter=mine` :465 / :6997, `<CampusBanner />` :681, `CampusBanner` :3325, crimson :3396, `FeedPost` :4310, `FeedTabBody` :4377, "Feed · IU" :4523, `<FeedRow` :4608, `FeedRow` :5136, `deleting` :5203, `viewerOwnsPost ?` :5474, `relativeTime` :5624, `post.content ?` :5640, "Events · IU" :7028, `bindMentionPicker` import :20-24
- PostViewerMobile: `PostDetail` :47-60, props :93-110, state :137-138, sub-line `relTime` :525, Delete ~:640-650, `SharePostSheet` mount ~:955
- `SharePostSheet.tsx:61-62`, `:196-243`; `CampusMobile.tsx:426`, `:974-976`; `ProfileMobile.tsx:2268-2270`
- `helpers.ts:101`; `PostComposerMobile.tsx:506`; `OnboardingMobile.tsx:62-76`, `:766`, `:1523-1851`; `api/orgs/route.ts:326-330`
- `use-mobile-tour.ts:87-104`, `:129`; NetworkMobile `:29-43`, `:586`, `:620-631`, `:666-672`, `:826`, `:937-960`
- SettingsClient `:12`, `:24`, `:515-523`, `:538`, `:549-554`, `:577-586`, `:150-151`, `:931-937`, `:1001`; `settings/page.tsx:26-28`, `:46`; `accept-terms-form.tsx:64-74`
- `draft.ts:250`; `profile-campus-write.ts:158`, `:448`; `majors.ts:387`; `majors-purdue-indianapolis.ts:35`; `finish.test.ts:17-45`

Stale: the CH1 lines in L10.
