## Critic additions — W4 clients (CM, CH2, PM) and gate G4

Checked at HEAD `15062bd` against the real W1 code (`join-copy.ts`, `OrgJoinControl.tsx`, `edit.ts`, `following.ts`), the live DB (read-only), and 70+ `file:line` anchors in `CampusMobile.tsx`, `ProfileMobile.tsx`, `campus-home.tsx`, `orgs/route.ts`, `me/org-invites/route.ts`, `org-asset-url.ts`, `profile-sync/route.ts`, `profile-bootstrap/route.ts`, `profile-campus-write.ts`, `campuses.ts`, `majors.ts`, `feed/route.ts`, `PostViewerMobile.tsx`. Almost all anchors hold (drift noted under Low). eslint baselines hold at HEAD: CampusMobile 4 (:117, :193, :271, :2943), ProfileMobile 11, campus-home 8. No file has two W4 owners, no W4 batch imports a module built in W4, and no path shows a hidden club, a blocked inviter or a follower count below 5.

### Blockers

**1. G4.3 (and CM's Chat-tab check) compare against a baseline nobody captured, and W1 is already pushed.**
- Evidence: §11.0 says "Baseline, captured on the live `f23bc5d` build BEFORE wave 1 pushes … into `handoffs/wave-plan-verification/baseline/`". That directory doesn't exist (`ls handoffs/wave-plan-verification/` → No such file), and no `mine-ids.txt` exists under `handoffs/` or the scratchpads. W1 is on `main` (`7c9958d..15062bd`). G4.3 runs `diff baseline/mine-ids.txt -`. CM's acceptance says "The Chat tab screenshot matches the one taken before the diff". CH2 item 6 compares against "the G4 recording". S7 relies on "the `f23bc5d` baseline".
- The baseline can still be made honestly: `git diff --stat f23bc5d HEAD -- src/app/api/orgs/route.ts src/components/mobile/CampusMobile.tsx` is empty, and H1 touched only join labels in `campus-home.tsx`.
- Fix: amend §11.0 and §4.3 G4. Capture `mine.json`, `mine-ids.txt`, the phone Chat-tab screenshot and the desktop chat-rail screenshot on the live W1 build, BEFORE W2 pushes (F2 is the first batch that edits `orgs/route.ts`). Record that W1 didn't touch the `filter=mine` branch. G4.3 then compares against the "pre-W2" baseline. If W2 has already pushed, diff the saved `/api/orgs?filter=mine` JSON against F2's own before/after `diff` (F2 acceptance) instead.

### High

**2. CM's and CH2's zero-write assertions can't pass: `CampusBanner` POSTs a heartbeat on every `/campus` mount and every 30s.**
- Evidence: `campus-home.tsx:3345` `await fetch("/api/me/heartbeat", { method: "POST", cache: "no-store" })`, run on mount and in `setInterval(…, 30_000)`. `CampusMobile.tsx:426` mounts `CampusBanner`.
- CM's own blocker "records `[method, url, body]` in `window.__nonGet`" with no background filter. CM installs it on `/profile`, then client-navigates to `/campus`, so the mount heartbeat IS recorded. That breaks:
  - "Real data … `window.__nonGet.length === 0`"
  - "Follow R1 … `__nonGet` holds exactly one entry"
  - "'Yes' … `__nonGet` holds exactly one PATCH" (only if read as a total count)
- CH2 installs "before opening the Orgs tab" on an already-loaded `/campus`, so every 30s tick is recorded, and CH2 item 1 ("and no non-GET") and item 6 ("contains only the requests the steps above tapped on purpose") fail.
- The §11.0 harness does tag `POST /api/me/heartbeat` as `bg`. But CM keeps its own snippet (§11.0 allows it), and neither batch's assertions use `__unexpected()`.
- Fix: in CM and CH2 acceptance, replace every raw count with `__unexpected().length === 0`, or `__unexpected().filter(e => e.m !== "GET")` for "exactly one". Use the §11.0 harness (object entries `{m, path, body, bg}`), not CM's array-entry snippet, and rewrite CM's expected entry as `{m:"POST", path:"/api/orgs/sae/follow", body:"{\"source\":\"discover\"}"}`.

**3. CM acceptance tells Franky to make the campus write that §12 S7 forbids until W5, and it would break G4.1 and PM.**
- Evidence: CM "Franky's phone test (iOS Safari, after deploy, by hand; the only real writes): … 'Yes' on the banner confirms his campus". §12 S7: "Franky doesn't tap 'Yes' on the campus confirm banner or in Settings … Any campus write stamps `campus_set_at`, starts the 30-day lock, removes the confirm banner that W3 item 5 and §11.1 item 7 expect, and changes §11.1 item 1's 'no card starts checked'."
- G4.1 runs after W4 deploys, the same window as CM's phone test. PM's acceptance also requires `select count(*) from users where campus_set_at is not null` to be unchanged (live: 0; Franky `campus_set_at` null).
- Fix: drop "Yes on the banner confirms his campus" from CM's Franky phone test. Replace it with "the banner renders at his width and 'Not now' hides it". Keep the real confirm as a §12 hold-off, released after the W5 walk.

**4. CH2's two new effects read state they don't list as deps, which either raises eslint over the baseline or makes a fetch loop.**
- Evidence: CH2 item 4, following effect "(deps `[debouncedQ, sideKey]`) … no list yet (`followingOrgs === null`) → `setFollowingErr(failure)`; otherwise → keep the rows and toast". The invites effect "(deps `[sideKey]`)" follows "the same way" (`invites === null`).
- `react-hooks/exhaustive-deps` is active at `warn` (`eslint-config-next/core-web-vitals`; the repo carries disables at `CampusMobile.tsx:133`, `ProfileMobile.tsx:323`), so each effect adds a warning over the "≤ 8" gate.
- Adding `followingOrgs` / `invites` to the deps re-runs the effect after every `setFollowingOrgs`: an infinite GET loop against `filter=following` and `/api/me/org-invites`. The latter UPDATEs on every GET: `expireStaleInvites`, `membership.ts:354-358`.
- The existing discover effect avoids this with `loadedRef` (`campus-home.tsx:8221`: `if (!loadedRef.current) setLoadErr(failure)`).
- Fix: add `followingLoadedRef` and `invitesLoadedRef` (useRef false; set true on success), and branch on the refs. Deps stay exactly `[debouncedQ, sideKey]` and `[sideKey]`. Add an acceptance line: the eslint JSON for campus-home shows 0 `react-hooks/exhaustive-deps`.

**5. A comment CM is told to add breaks CM's own `filter=mine` grep and gate G4.3.**
- Evidence: CM item 6 requires the comment `// Bumped after a join so ChatPane remounts and re-reads filter=mine.` next to `chatKey`. CM acceptance: `rg -n "filter=mine" src/components/mobile/CampusMobile.tsx` → "exactly 1 hit, inside `ChatPane`". G4.3: `rg -c "filter=mine" src/components/mobile/CampusMobile.tsx` → 1. At HEAD the only hit is `:1517`, so this comment makes it 2 and fails both checks.
- Fix: word the comment "…so ChatPane remounts and reloads its own club list." Add to CM's rules: no new comment or string in the file may contain `filter=mine`. Give CH2 the same rule, because its acceptance and G4.3 also count exactly 2.

### Medium/Low

**6. (Medium) CH2's quick view repaints a declined invite as still pending.**
- Evidence: CH2 item 7: "`relation={relationOf(previewOrg)}` … The modal STAYS OPEN after a change and repaints from the override." But `previewOrg` is the object snapshot taken on click (`previewOrg` state at `campus-home.tsx:8190`, set by `onPreview={setPreviewOrg}` :8422). CH2 item 6 makes the Decline override `approx:true`, and item 4 drops every approx override once discover answers (`setOverrides((prev) => dropApprox(prev))`).
- Result after "Decline" in the modal: the override is gone, `relationOf(previewOrg)` is `invited` again, and the modal shows chip "Invited you" and the "Invited by … · Expires …" line (from `org.pending_invite`). `OrgJoinControl` meanwhile resurrects its own basis-matched `local` (`OrgJoinControl.tsx:90`, `:95`: `const live = local && local.basis === basis ? local : null`), so a "Follow" button sits under an "Invited you" chip.
- Fix: keep `previewId: string | null` in state. Resolve the org on each render from `invitedRows`, then `followingOrgs`, then `results`, falling back to the snapshot. Or keep approx overrides for `previewId` until the invites refetch answers. Acceptance: decline from the quick view shows no "Invited you" chip and no invite line after all three GETs answer.

**7. (Medium) CM refetches all three lists after every Follow or Unfollow, so the tapped row jumps sections. Its overrides test around that.**
- Evidence: CM item 8 `onChange` always runs `void refetchOrgs("refresh")`. Item 9 puts `following` rows above Verified / All clubs. So a Follow under "VERIFIED" moves the row to "FOLLOWING" at the top once the answer lands, and Unfollow moves it back. CH2 item 6 deliberately does the opposite: "follow ⇄ unfollow only: set the override and reload NOTHING … it never jumps between groups".
- CM's acceptance makes only the discover override stateful ("flips R1's `org_follow_state` in later discover answers"), so the jump never shows in the test.
- The Join R2 and Accept X steps use non-stateful overrides. After the refresh, `setOrgLocal({})` puts the row back on `can_join` / `invited` (layout, chip and meta come from that), while `OrgJoinControl` repaints its stale `local` because the relation key equals the tap-time basis. The assertions pass by accident on a mixed row.
- Fix: refetch only when `next.state !== relation.state` or `next.declined` (the join, request and accept cases), the same as CH2. Follow and unfollow keep `orgLocal` only. Make every override in CM's acceptance stateful (following and invites too), and assert the row's section after the reload.

**8. (Medium) `CampusConfirmBanner` has no margin rule, and in W4 nobody may fix it.**
- Evidence: B14t's contract says only "Light cream card matching CampusMobile's palette; buttons at least 44px". CM item 2: "Mount it bare, with no wrapper element … If its card touches the screen edges at 375px, report that to the orchestrator: B14t's file has no W4 owner." §5 lists no owner for `CampusConfirmBanner.tsx` after W3, and W5 has none either. The neighbours inset themselves: the Otto strip wrapper `paddingLeft: 12, paddingRight: 12` (`CampusMobile.tsx:436-445`), panes `padding: "12px 16px 96px"`. CM's live check "its card doesn't touch the screen edges" can then fail with no batch allowed to repair it.
- Fix: amend B14t (W3, not yet built) so the banner's root carries `margin: "10px 12px 0"` and renders `null` (not an empty box) when hidden. Or let CM wrap it, with the banner exposing an `onVisibleChange` or `style` prop so the wrapper collapses to nothing.

**9. (Medium) E2 ships "Edit post" on other people's posts in the phone profile's Saved and Reposts tabs for a whole wave.**
- Evidence: `ProfileMobile.tsx:1993` `canDelete={!isVisitor}` for every post opened from your own profile, Saved (:1851) and Reposts (:1841) included. `PostViewerMobile.tsx:367` `const owner = canDelete || isOwner;`. E2 (W3) puts Edit inside that owner block (E2: "Owner menu block (:636-645): insert BEFORE Delete"). PM item 8 fixes `canDelete` only in W4 and admits "After E2 it would also offer 'Edit post'. Both fail with 403". From the W3 deploy to the W4 deploy, Franky's live Saved tab (2 bookmarks, both other authors) offers Edit.
- Fix: amend E2 to gate "Edit post" on the server `isOwner` alone (`{isOwner ? <ViewerMenuItem label="Edit post" …/> : null}`) and leave Delete's `owner` rule to PM. Add to E2's acceptance: from `/profile` Saved, another author's post shows no "Edit post".

**10. (Medium) PM's dependency on B15 isn't in gate G3 or in §5, and PM has no precondition step.**
- Evidence: PM "B15: `settingsCampusCardView` … **Add this file to the G3 list.**" §4.3 G3 still reads "`EditPostSheet.tsx`, `CampusConfirmBanner.tsx`, `onb-copy.ts` and `social-steps.ts` exist on `main`". §5's PM row says "Depends on: E2, E0 lib" (no B15, no E1). CM has an item 0 with `ls` / `grep` preconditions; PM has none. PM relies on `settingsCampusCardView`, the `SettingsCampusView` fields `mode/options/sub/note/locked`, `EditPostSheet`'s `nested`, and `PostViewerMobile`'s `onEdited`.
- Fix: add `src/lib/profile/settings-campus-card.ts` to G3 in §4.3, and "B15, E1 (live)" to PM's §5 row. Give PM an item 0:
  - `ls src/components/mobile/EditPostSheet.tsx src/lib/profile/settings-campus-card.ts src/lib/posts/edit.ts`
  - `grep -n "export function settingsCampusCardView\|mode:\|locked:\|note:" src/lib/profile/settings-campus-card.ts`
  - `grep -n "onEdited\|nested" src/components/mobile/PostViewerMobile.tsx src/components/mobile/EditPostSheet.tsx`
  - stop on any miss.

**11. (Low) CM's comment about null `joinPolicy` contradicts the real `join-copy.ts`.**
- Evidence: CM item 5: "Invite inbox rows carry no join_policy; F5a treats joinPolicy null as 'no disclosure'." Actual `join-copy.ts:371-386` `wantsDisclosure` returns `rel.joinPolicy !== "open" && showsFollow && …`, with the doc "An unknown policy (null) gets the line too". Phone invite rows only render "Accept" (`orgRowView` invited → `ORG_COPY.buttons.accept`), so nothing visible changes today. A future Follow on an inbox row WOULD show the line.
- Fix: correct the comment to "joinPolicy null → the disclosure shows wherever a Follow control renders (F5a errs toward telling)".

**12. (Low) CM and CH2 re-declare a type the W1 code already exports.**
- Evidence: `join-copy.ts:900` `export type OrgControlChange = { state: OrgDisplayState; following: boolean; role: OrgRole | null; declined?: true }`. CM item 4 hand-writes `type OrgChange = { … }` with the same shape. CH2 item 1 derives `type OrgControlChange = Parameters<NonNullable<React.ComponentProps<typeof OrgJoinControl>["onChange"]>>[0]`, shadowing the export's name, while its own rule says "Never re-declare F5a's shape by hand".
- Fix: both import `type OrgControlChange` from `@/lib/orgs/join-copy`. CM drops `OrgChange`.

**13. (Low) CH2's override type won't take `next.state` without a local.**
- Evidence: CH2 `type OrgOverride = { state: JoinState; … }`, and item 6 does `if (next.state === "signed_out") return;` then `setOverrides((p) => ({ …, state: next.state …}))`. `OrgControlChange.state` is `OrgDisplayState` (`JoinState | "signed_out"`). The narrowing of the property `next.state` isn't kept inside the arrow callback, so tsc reports `'"signed_out"' is not assignable to 'JoinState'`.
- Fix: `const state = next.state; if (state === "signed_out") return;` and use `state` in the updater.

**14. (Low) CM's live facts are wrong in two spots, and its claim about client use of `org-asset-url` is false.**
- Evidence: CM "Franky has 10 published posts, 4 with media". Read-only SQL today: Franky 10 published, **3** with media (4 is the platform-wide number PM quotes).
- CM item 1 says `org-asset-url.ts` and `campuses.ts` are "Both … already used from client files". `grep -rln org-asset-url src` finds only API routes and the server component `src/app/orgs/[handle]/page.tsx`, so no `"use client"` file uses it. Harmless: it has no `server-only` import and reads only `NEXT_PUBLIC_SUPABASE_URL`.
- Fix: correct both sentences.

**15. (Low) Anchor drift.**
- CM `refetchOrgs` "(:250-266)" is `:251-268` at HEAD (comment :251, `useCallback` :252, `}, []);` :268).
- PM `campusTouched` uses "(:919, :957, :1011, :1620)": the third is `:1012` (`setCampusTouched(false)`).
- CH2's awk note "At `f23bc5d` the same script prints 21 lines" is true, but it prints 20 at HEAD (H1 removed one), so the implementer's baseline run shows 20.
- Everything else spot-checked matched. CampusMobile: :54, :56-65, :84, :86, :91, :221, :270-274, :285-289, :322, :416-417, :426, :466-467, :507-515, :528-536, :539, :600-608, :700, :715, :843, :973-976, :1045-1047, :1448-1459, :1483-1484, :1503, :1517, :1769-1777, :1833, :2311, :2326-2327, :2356, :2384, :2580, :2594, :2598, :2721-2726, :2738, :2775-2776, :2899-2905, :2965, :3335. ProfileMobile: :18-19, :141-148, :216-218, :332, :347-356, :371-384, :473, :590-591, :916-1008, :1067, :1110, :1447, :1533-1657, :1819-1851, :1896, :1989-1996, :2202-2341, :4903-4953, :5151, :5199-5238. Also `me/org-invites/route.ts:95-122`, `org-asset-url.ts:12-25`, `orgs/route.ts:424`, `:469`, `feed/route.ts:452`, `profile-sync/route.ts:102-104`, `:377`, `:470`, `:476`, `profile-campus-write.ts:14-18`, `:70`, `join-state.ts:59`, `:62`, `:80`, `globals.css:32`, `campus-map/route.ts:208`, `OnboardingSwitch.tsx:101`, `campuses.ts:217-229`.

**16. (Low) CM loads three org lists on every phone `/campus` visit (Feed is the default tab) and after every row tap.**
- Evidence: CM item 7: the mount effect runs `refetchOrgs("first")`, which is three GETs, one of them `/api/me/org-invites`. That route runs `expireStaleInvites` (an UPDATE sweep, `membership.ts:354-358`) on every call, and it has no rate limit. HEAD made one discover GET.
- Fix: optional. Load the lists on the first switch to the Orgs tab (`tab === "orgs"` with an effect guarded by a ref) or on `?tab=orgs`. Keep the mount load only for discover if the tour needs it.

**17. (Low) A tap on the edit sheet's overlay can reach the feed card underneath.**
- Evidence: CM mounts `EditPostSheet` inside `PostActionsSheet`, which is itself rendered inside `FeedCard`'s `<button onClick={handleCardClick}>` (`CampusMobile.tsx:974-976`, `:1448-1459`). React bubbles clicks through portals. E2 stops click and pointerdown only on `Drawer.Content`, and the overlay has no guard (neither does `PostActionsSheet`'s overlay, `:2650-2657`).
- CM's acceptance checks taps INSIDE the textarea only.
- Fix: add a CM acceptance line: with the edit sheet clean, tap its overlay; the sheet closes, no post viewer opens and no `/like` is recorded. If it fails, report it to E2's owner (no W4 owner may edit `EditPostSheet.tsx`); the fix is `onClick` stopPropagation on `Drawer.Overlay`.

**18. (Low) §11.1 item 7's "after the §12 S2 close-out" can't run in W4.**
- Evidence: item 7 says "After the §12 S2 close-out (B declines): SAE moves under 'FOLLOWING'…". But §12 S2 says "B leaves it pending through the W5 walk", and S7 says "B doesn't accept or decline the S2 invite … until W5 item 1 is recorded". §11.1 item 8 (CH2) is affected the same way.
- Fix: move the post-decline CM and CH2 checks to the W5 list.

**19. (Low) CM's "character-identical to `ONB_COPY.clubs.sparse`" holds only for Indianapolis.**
- Evidence: CM fills `{campus}` with `campusRowById(id)?.name`, e.g. "IU Bloomington" (`campuses.ts:220`). B12 passes `campusShortName` ("Bloomington") to `StepClubs`.
- Fix: CM uses `?.shortName` so both surfaces say the same thing. Indianapolis is unchanged either way.

**20. (Low) CH2's following list refetches on every debounced keystroke, even when it is hidden.**
- Evidence: CH2 item 4 gives the following effect deps `[debouncedQ, sideKey]`, and it passes `q`. But "Side groups show only when `filter === "all" && !debouncedQ`". So while typing under "All", each pause fires a following GET whose rows are not shown. After the query is cleared, `yoursRows` / `shownIds` briefly come from the last q-filtered list until the new answer lands. That can put a followed club under "Verified" for one paint.
- Fix: include `q` only when `filter === "following"` (deps `[filter === "following" ? debouncedQ : "", sideKey]`), and treat the list as loading while its q doesn't match.
