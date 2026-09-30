# Wave plan: club following, onboarding redesign, post editing, campus clients

2026-09-16 · planned at HEAD `f23bc5d` (deployed, clean tree) · live DB through migration `20260916120000` (M1d)

Sources: `handoffs/2026-09-16-org-following-spec.md` (§2, §4, §5, §6, critic C1–C27), `supabase/migrations/20260916120000_org_followers.sql` header, `handoffs/2026-09-15-indy-campus-onboarding-plan.md` (§3, §6, §7, critic A–D), `handoffs/2026-09-15-org-invites-audience-spec.md` (§3.2, §4, §5.1, critics), `handoffs/2026-09-15-session-60-email-verification.md` §6c, and five reader re-anchor passes at `f23bc5d`. Where the reader notes disagreed, §2.4 records what this plan picked. Founder decisions override critic items, and critic items override spec bodies.

Five waves, five batches each, 25 batches total.

---

## 1. Plain-English summary for Franky

- **Wave 1 fixes what's broken today.** Invite and "request approved" notifications read as blank rows; they'll say "Franky invited you to join SAE" and open the club. Non-members stop seeing the red "Couldn't load this org's channels." SAE's page and desktop cards stop offering a "Request to join" button that fails; an invited student gets "Accept invite" instead. Hidden test clubs stop showing up in search and at their page links. Behind the scenes the Follow system goes in (follow, unfollow, the officer follower list, remove a follower), along with the shared buttons and invite sheet every screen will use.
- **Wave 2 turns following on where it matters.** Club pages get Follow next to Join, followed clubs' posts reach your feed, the club lists learn who follows what, and officers' invite sheet opens on the club's followers. Editing a post becomes safe on the server: tags update, an "Edited" marker gets stamped, and nobody can change a post's date or photo behind the app's back.
- **Wave 3** lets you edit posts from the phone post viewer and the desktop feed, and relabels the desktop campus home for Indianapolis (no more "· IU"). It also builds the onboarding pieces for clubs and people, fixes the Settings campus card, and updates the phone tour and People suggestions.
- **Wave 4** is the new six-step onboarding on phone and desktop: campus, profile, photo, clubs, people. It saves as you go, keeps Back and Skip always visible, and has no "Skip to resume". The same wave covers the phone Orgs tab (Follow, plus Join on open clubs, and "Invited you" at the top), the desktop Orgs tab, and Edit on your own posts in the phone feed and phone profile.
- **Wave 5** adds officer tools on desktop (Followers tab with Remove, Invites tab, "Who can join / Open to"), the desktop profile's campus picker, Edit in the desktop post viewer, removal of the fake calendar events, the "IU · Purdue" landing chips, and the legal-draft updates.
- **You do by hand:** say yes before the one database change between waves 1 and 2; send the first real SAE invite; make the first real SAE post and the first real post edit. Agents never write to production.

---

## 2. Decisions applied

### 2.1 Founder decisions → where they land

| Founder decision | Lands in |
|---|---|
| Replace Instagram; social first | Order of the waves: follow + feed (W1–W2) before the onboarding social steps (W3–W4) |
| Indianapolis is one shared campus (IU Indy + Purdue Indy); the university comes from the verified email; campus picked within your university; Fort Wayne shared but not open | Onboarding step 2 cards with a "not open yet" pill (B12, B13); Settings, phone and desktop profile pickers (B15, PM, PH); neutral banner colour for shared campuses (CH1) |
| Only campus things are university-limited; profiles, search, follows, DMs stay global | F1: follow has no audience, verification or campus check. F4: a followed club's posts reach you from any campus. H1: search stays global and only drops hidden clubs |
| Purdue students with only @iu.edu get "verify your @purdue.edu instead" | B12 StepCampus in-page panel; B13 mirror |
| Onboarding: remove "Skip to resume" | B12, B13 (acceptance `rg`) |
| Save as you go | B12 (draft + `POST /api/me/onboarding-step` per step), B13 draft mirror, B15 clears the draft on sign-out |
| A real photo step | Step 4 (B12 StepPhoto, B13) |
| Always-visible header with Back; Skip on step 1 | OnbHeader (B12), B13 header. Skip shows on every step, per plan §7 answer 3 option B |
| Ask campus explicitly | Step 2 (B12, B13) |
| Keep all 13 profile fields; require only name + handle | Step 3 (B12 StepProfile, B13) |
| Steps 3–4 become social: photo → clubs/orgs → follow people | Steps 4, 5, 6 (B12S builds 5–6, B12 wires them, B13 mirrors) |
| Skip asks for name + handle first | SkipSheet "identity" variant (B12), B13 two-variant sheet |
| Only SAE is real; test clubs hidden, not deleted | H1: org page 404, metadata, search filter. B27: notifications for hidden clubs dropped. F1: follow 404. F4: hidden clubs lose attribution and never enter the feed through a follow |
| SAE joins by invitation only | H1 "Invite only" label; F5a copy; F6 page |
| Every club has an audience (both / IU only / Purdue only) set by officers | F6 Edit details; CH3 create + settings |
| Invite-only clubs are visible | F2 discover keeps them; CM and CH2 list them |
| Owner + admins invite; no invite links in v1 | F5a OrgInviteSheet (no link generation); F6 "Invite people" (owner/admin); CH3 Invites tab for `canManage` |
| Following is not membership; anyone can follow any visible club | F1 POST /follow (step 7: no checks) |
| Public events stay visible to everyone | No change. No batch touches events visibility |
| Membership unlocks the club chats | H1: channels GET answers 403 `members_only`. F6: channels gate copy |
| Followed clubs' posts go into the feed | F4 |
| Joining follows automatically; a member cannot unfollow (409 `member_follows`) | Trigger live (migration :802-843); F1 DELETE → 409; F5a "Joined ✓" with no unfollow |
| Leaving drops only the join-made follow | Trigger live (migration :826-834); CH3 leave-confirm copy |
| Open clubs show Follow and Join together | F5a `orgRowView` (phone row, card, onboarding); used by CM, CH2, B12S, F6 |
| Invites are to JOIN: "invited you to join {club}" | B27 (all three renderers) |
| No "X followed your club" notification in v1 | F1 sends no notification (explicit non-goal) |
| Officers (owner/admin) see followers; students are told near Follow on non-open clubs | F1 `GET /followers`; CH3 Followers tab; F5a `FOLLOW_DISCLOSURE` on request/invite clubs |
| "Following" (you → club) vs "Invited you" (club → you) | F5a chips; used by CM, CH2, B12S, F6 |
| Edit in the ⋯ menu on your own posts: phone feed, phone profile, desktop feed, post viewer | Server: E0 + E1. Phone feed: CM. Phone profile: PM plus E2's viewer. Desktop feed: CH1. Post viewers: E2 (phone), E6 (desktop) |

### 2.2 Following-spec critic items C1–C27

| Item | Resolution |
|---|---|
| C1 diversity cap | F4 adds pure `feedDiversityKey()` and replaces `feed/route.ts:417` (today `entry.post.org?.id ?? entry.post.user_id`), with a unit test |
| C2 org identity via embeds | F4 removes both user-client `org:orgs(...)` embeds (`feed/route.ts:221`, `:254`); names come from service `loadVisibleOrgCards` with `hidden_at is null` |
| C3 blocks in follower lists | F1 `GET /followers` and F3 followers mode call `loadHiddenUsers` (user client) and fail closed |
| C4 remove a follower | F1 `DELETE /api/orgs/[slug]/followers/[userId]`; CH3 "Remove". Reversible in v1 (open question Q1) |
| C5 keyset ties | F1/F3 order and cursor on `(first_followed_at desc, id desc)`; the student's own list uses `(created_at desc, id desc)`; CH3 renders server order |
| C6 index | Resolved in SQL (`org_followers_org_first_followed`, migration :693-704) |
| C7 leave keeps a follow nobody chose | Resolved in SQL (leave trigger, migration :826-834); CH3 leave-confirm copy says so |
| C8 `follow_state` collision | New org fields are `org_follow_state` / `org_follow_source` / `follows_since` everywhere (§4.2). No route sends an org value named `follow_state` |
| C9 hidden state | F1: hidden → 404 for non-members. F5a: explicit `hidden` rows, and the test walks all 10 display states |
| C10 lane field | F4 passes club ids as a parameter, not a `FeedLane` field |
| C11 counts on lists | F2: one `followers:org_followers(count)` embed on the existing service query |
| C12 hidden leak via profile/page | F2 keeps the profile route's hidden gate first (`profile/route.ts:101-106`); H1 gives hidden clubs a 404 on the page and a generic title |
| C13 count of 1 is an identity | Floor 5: F1 `publicFollowerCount`, F5a `followerCountText`. No count on browse cards (CM, CH2) |
| C14 following is visible to officers | F5a `FOLLOW_DISCLOSURE` under Follow on request/invite clubs (F6, CM, CH2, B12S) |
| C15 re-rollable sort | Resolved in SQL (`first_followed_at` via `org_follow_firsts`); F1 never writes timestamps; POST and DELETE share one rate-limit key |
| C16 Join hidden behind Follow | F5a `orgRowView`: `can_join` rows carry Follow + Join |
| C17 "can never fail" | F1 keeps Terms on POST; F5a and B12S handle 403/404/409/429; no copy claims a follow can't fail |
| C18 channels misdiagnosis | H1 fixes both halves (service-client lookup + no fetch for non-members); F6 adds the gate copy |
| C19 renderers | B27: both org types in OttoSidePanel, OttoActivity and `_otto.js` |
| C20 URL budget | F4 `FOLLOWED_ORG_FILTER_CAP = 50`, newest follows kept, truncation logged |
| C21 stale anchors | Everything re-anchored at `f23bc5d`; later waves re-grep by function name (§4.1 rule 6) |
| C22 function revoke | Resolved in SQL (migration :286-292). No batch |
| C23 dead assertion | Resolved in SQL (migration :858). No batch |
| C24 unproducible sources | Resolved in SQL (CHECK trimmed, migration :684); F1 `normalizeFollowSource`; clients send only `profile` / `discover` / `onboarding` |
| C25 unbounded followed-orgs | F1 `GET /api/me/followed-orgs` is rate limited and keyset-paged |
| C26 admin-added members follow | Settled as a decision in SQL (migration :86, :812). No batch |
| C27 member_count honesty | F2: `member_count` is null on a failed read (discover, `[slug]`, profile). F6: the page omits a null count. CH2 and CM omit null |

### 2.3 Other critic items still in play

| Item | Resolution |
|---|---|
| Onboarding plan A4 (old bundles send `school`) | PM and PH send `campus_id` only when the student changed the pick; never `''`, never the current id |
| A5 / A7 (posts writes; campus pinning) | E0: column-level UPDATE grants (`content, tags, status`) and an `edited_at` trigger that never touches campus columns |
| A8 (campus-less accounts never prompted) | B14t `CampusConfirmBanner` (mounted by CM); CH1 "Pick your campus" strip; B15 Settings confirm/pick modes |
| B1 (`{campus}` copy) | B12S people groups "At {campus}"; B14t and CH1 tour copy |
| B3 (Purdue link has no page) | B12 / B13 in-page code panel on step 2 |
| B4 (Purdue copy before the flip) | Moot: `PURDUE_SIGNUPS_ENABLED = true` (`school-email-domains.ts:44`) |
| C1 (`users.school` readers) | Left alone until M3 (E1 keeps the posts GET author embed; B20 keeps `messages.html:1877`, `:2664`) |
| C3 (IU-only strings) | CH1 labels + `campus/page.tsx:7`; B20 landing chips + sentinel context |
| C4 (people "same school" group) | B14t NetworkMobile switches to `reason_v2` with a one-release fallback |
| C5 (sign-out sites) | B15 clears the draft at three sign-out/delete sites |
| C7 (tours disagree) | B14t (phone) and CH1 (desktop) both end on /campus with "Got it" |
| C8 (map halos need both taxonomies) | CH1 + B20: `schoolForMajorIn` + in-file `HALO_SCHOOLS` |
| C9 (owners can't leave) | Onboarding never offers leave; member rows are locked |
| D2 (who can read) | B21 honesty sentence in the privacy draft |
| D5 (handle-check wording) | B12 / B13 status set; a failed check never reads "taken" |
| D8 (legacy `next`) | B12 / B13 navigate to the server `next` verbatim |
| Invites spec A6 (free-text org name in innerHTML) | B27 escapes in `_otto.js` |
| Invites spec A7 (null inviter) | F5a renders "an officer" |
| Invites spec A9 (audience help copy) | F5a `AUDIENCE_HELP` "…when they join." |
| Invites spec A10 (renderers ship first) | B27 is wave 1 |
| Invites spec A11 (requested rows) | F5a sheet calls `/requests/{id}` approve, never the invite POST |
| Invites spec C1 (labels) | F5a `WHO_CAN_JOIN_OPTIONS` / `openToOptions` |
| Invites spec C2 (invites owner/admin) | F6 admin bar + CH3 Invites tab gated on owner/admin |

### 2.4 Where the reader notes disagreed, and what this plan picked

1. **Org follow field names.** `org_follow_state` ("following" | "not_following"), `org_follow_source`, `follower_count`. Every client reads `org_follow_state`. `viewer_follows` is NOT used anywhere (client readers had proposed it). See §4.2.
2. **Followers list row shape.** The server shape wins: `{…UserCard fields, follows_since, org_follow_source, member_role}` plus `next_cursor` and `follower_count`. CH3 reads `member_role != null` for the "Member" chip and `follows_since` for "Follows since".
3. **One rule source for club buttons.** Onboarding does NOT get its own `clubRowView`. F5a's `orgRowView` gains an `"onboarding"` surface, and `OrgJoinControl` gains `variant: "onboarding"` and `replay`. B12S renders F5a's control; B13 mirrors F5a's copy and the onboarding row table, and a parity test compares them.
4. **Member row on onboarding:** a disabled "Joined ✓" with sub "Members follow automatically" and no "Joined" chip (F5a: no Joined chip in v1).
5. **Optimistic vs confirmed buttons.** Club follow/join controls wait for the server ('…', `aria-busy`) everywhere, onboarding included. Person follows on the onboarding people step stay optimistic (their existing pattern).
6. **Desktop post edit:** the post-edit reader's version (inline editor, " · Edited" marker, failure "Couldn't save your changes.") replaces B19 item 9.
7. **Desktop interim "Request to join" fix** moves from B19 to H1 (wave 1), because it is a live dead button.
8. **Desktop discover.** F5c1 and B19-orgs-a merge into CH2. The "Following" filter chip shows the `?filter=following` list, member clubs included; they render "Joined ✓".
9. **Desktop officer settings.** F5c2 and B19-orgs-b merge into CH3. The Requests tab shows for staff under every policy (visiting students can request on open clubs). Per-follower "Invite to join" goes through the Invites tab, which opens on the same followers.
10. **`loadHiddenUsers` shape** is `{ok:true, hidden:{ids}}` (`hidden-users.ts:26-58`); F1/F3 contracts use `hiddenRes.hidden.ids`.
11. **Org page counts.** F6 uses F1's `loadFollowerCount` and `loadViewerFollow`; there is no `loadFollowerCounts`.
12. **Tour feed bubble** (phone B14t, desktop CH1) reads "…People and clubs you follow rise to the top." F4 is live by wave 3, so the extension the onboarding reader deferred applies now.
13. **B14's two CampusMobile edits** (banner mount, events empty line) move into CM (wave 4), so CampusMobile has one owner per wave.
14. **The discover `DiscoverOrg` type** is at `campus-home.tsx:8123-8140` (one reader cited `:122-139`, which is wrong).
15. **Search leak** (hidden clubs returned by `/api/search`, `search/route.ts:201-209`) was flagged outside every reader's area; H1 owns it.
16. **Admin hide/unhide UI** (B28) is not in this plan (open question Q9).

---

## 3. Open questions

Founder decisions don't settle these. Implementers use the **default** unless Franky says otherwise.

**Following**
- **Q1. Is removing a follower permanent?** Default: no. Removal is a soft mute; the student can follow again and keeps their first-follow date. No ban table (`org_follow_blocks`) until you ask.
- **Q2. Public follower-count floor.** Default: 5. Below 5, only the club's owner and admins see the number.
- **Q3. A student who joined first, then leaves, loses the club's posts** (their follow was made by joining). Default: yes. POST /follow never upgrades an existing row, and the leave dialog says so. No "keep getting posts" option in v1.
- **Q4. Posts by a hidden club.** Default: shown as the author's own post with no club name, not dropped.
- **Q5. Request-to-join clubs in lists.** Default: follow first. Not following → "Follow". Following → "Request" on phone rows, "Following ✓" + "Request to join" on desktop cards. Onboarding never shows Request.
- **Q6. Old invite / approval notifications for a club that was later hidden.** Default: dropped from the list.
- **Q7. The "Officers can see who follows this club." line.** Default: only on request and invite-only clubs, as decided. Open clubs' officers can also see followers, and the line isn't shown there.

**Onboarding and campus**
- **Q8. Purdue student with an @iu.edu email.** Default: an in-page panel on the campus step that sends a real code to their @purdue.edu address. No new page.
- **Q9. Admin hide/unhide screen.** Default: not in this plan. The hide route already works and the four test clubs are already hidden.
- **Q10. Step 5 title.** Default: "Follow clubs" (capitalised, from the newer spec). The other step titles stay lowercase Otto voice.
- **Q11. Empty clubs step.** Default: “you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone at {campus}.” There is no create-club screen on the phone.
- **Q12. "Confirm your campus" banner on phone /campus.** Default: yes. 14 verified accounts are unconfirmed or campus-less.
- **Q13. People screen "Connect" button.** Default: renamed to "Follow" (a follow is one-way). "Connected ✓" stays for mutuals.
- **Q14. Settings "Replay tour" copy.** Default: "Walk through vibe again with Otto. Takes about a minute."
- **Q15. Shared-campus banner look.** Default: title "Indianapolis", monogram "IN", a neutral Vibe colour for shared campuses, IU crimson only for IU-only campuses, black/gold for Purdue-only. Stats read "{n} at Indianapolis · {m} active now", falling back to "{total} on Vibe" with no campus.
- **Q16. Majors at campuses without a curated list.** Default: a free-text major box, the same as onboarding.

**Post editing**
- **Q17. Do @mentions added in an edit notify?** Default: yes, once per person. Handles already mentioned or re-added never re-notify.
- **Q18. Time limit, edit count, "Edited" marker.** Default: no window and no count limit. Every edit to a published post shows "Edited", with a server limit of 30 edits per 10 minutes.
- **Q19. Phone profile post cards.** Default: a new ⋯ on your own cards with "Edit post", "Delete post" and "Cancel". The phone feed card sheet gets Edit only; Delete stays in the viewer there.
- **Q20. Desktop profile post cards.** Default: no Edit control on the card. Edit lives in the post viewer those cards open.
- **Q21. The posts column lock** (the app can then change only a post's text, tags and draft status). Default: ship it in the same migration as "Edited" (E0). It closes a live gap: a student can currently change their own post's date or photo key directly.
- **Q22. Reports and edits.** Default: out of scope. A reported post can be edited before review. A follow-up adds a text snapshot to reports.

**Legal**
- **Q23. The live Terms name Monroe County and the drafts say Marion County.** Default: flag it for counsel inside the drafts (B21). Nothing changes on the live pages.

---

## 4. Rules for every batch

### 4.1 Shared rules

1. **One owner per file per wave.** The ownership matrix in §5 is authoritative. A batch touches only its owned files. Reading any file is fine.
2. **No production writes by agents.** No follows, joins, invites, approvals, follower removals, campus saves, post edits, uploads, onboarding step saves or Finish/Skip on `https://www.connectvibe.app`. Positive-path checks run in one of three places:
   - the local dev server against a Supabase branch or local stack;
   - in-page fetch overrides (the live verification recipe: install a wrapper that blocks and records every non-GET before the first tap);
   - done by Franky himself.
   Read-only SQL uses the Supabase MCP `execute_sql`, never selects emails or personal data, and shows ids as `left(id::text,8)`.
3. **Checks every batch runs:**
   - `npx tsc --noEmit` exits 0.
   - `npx eslint <changed files>` is not above the HEAD baseline. Recorded baselines at `f23bc5d`: OnboardingMobile 1, CampusMobile 4, ProfileMobile 11, campus-home 8, SettingsClient 2, accept-terms-form 1; 0 for NetworkMobile, use-mobile-tour, campus/page.tsx, settings/page.tsx, MapMobile, home-landing, draft.ts. Any other file: record the count before editing.
   - Pure libs: `node --test --experimental-strip-types <file>.test.ts`, using the `registerHooks` resolver from `src/lib/iu/community-scope.test.ts:15-43` or `src/lib/onboarding/finish.test.ts:17-45`. A module a test loads must not `import "server-only"`, and client-copy modules must use type-only imports (`join-state.test.ts:9-14`).
   - Static HTML/JS: `node --check` on each extracted inline `<script>` and on each `.js` file.
4. **Error shape** for new or edited routes: `{ok:false, error, code}`, following the local `fail()` at `join/route.ts:20-27`. A 429 from `tooManyRequests(rl, "Too many tries. Try again in a minute.")` (`rate-limit.ts:133`) has no `code`, so clients detect it by HTTP status.
5. **Client requests** go through `vibeRequest` (`src/lib/feedback/request.ts`; it reads `code` from the body at :94) or `window.vibeRequest` on static pages, with `quiet:true` wherever the batch maps codes itself.
6. **Anchors.** Every `file:line` here was read at `f23bc5d`. A batch whose file was edited by an earlier wave re-greps by function or constant name before editing (this matters most for campus-home.tsx: W1 H1 → W3 CH1 → W4 CH2 → W5 CH3).
7. **Wave flow.** Implement → adversarial review → repair. The orchestrator then commits and pushes the whole wave; Vercel deploys from `main`. Batches don't push. The gates in §4.3 must pass before the next wave's push.
8. **Server-only modules** (`membership.ts`, `notification-orgs.ts`) are never imported by client components. `src/lib/orgs/following.ts` must NOT `import "server-only"`, because node tests load it.

### 4.2 The org-follow contract every batch shares

- **Org rows** from `/api/orgs?filter=discover|following`, `/api/orgs/[slug]` (inside `org`), and `/api/orgs/[slug]/profile` (inside `viewer`):
  - `org_follow_state: "following" | "not_following"`; `null` only on the profile route when signed out.
  - `org_follow_source: "join"|"profile"|"discover"|"onboarding"|null` (on `[slug]` and profile).
  - `follower_count: number | null`. Null when the read failed, or when the count is below 5 and the viewer isn't that club's owner/admin.
  - `member_count: number | null`. Null when the read failed.
- **Follow routes** (F1):
  - `POST /api/orgs/[slug]/follow {source?}` → `{ok, org_follow_state:"following", already, follower_count}`.
  - `DELETE` the same URL → `{ok, org_follow_state:"not_following", follower_count}`.
  - Codes: 401 `unauthorized`, 403 `terms_required` (POST only), 404 `not_found`, 409 `member_follows` (DELETE), 429 (no code), 500.
- **Officer routes** (F1):
  - `GET /api/orgs/[slug]/followers?limit&cursor` → `{ok, followers:[{id,name,handle,avatar_url,banner_url,banner_gradient,major,year,mutual_count,follow_state /*PERSON follow*/, follows_since, org_follow_source, member_role}], next_cursor, follower_count}`.
  - `DELETE /api/orgs/[slug]/followers/[userId]` → `{ok, removed, follower_count}`.
  - Codes: 403 `officers_only`, 409 `member_follows`, 400 `invalid_user_id` / `invalid_cursor`.
- **Student's own list** (F1): `GET /api/me/followed-orgs?limit&cursor` → `{ok, orgs:[{id,handle,name,logo_url,verified,join_policy,audience,campus_id,followed_at,org_follow_source,member_role}], next_cursor}`.
- **Invite sheet** (F3): `GET /api/orgs/[slug]/invite-candidates` with no `q` or with `?source=followers` returns `{…, source:"followers", next_cursor, users:[{…, follows_since}]}`; `?q=` of 2+ characters returns `source:"search"`.
- **Clients derive** `following = role != null || org_follow_state === "following"`. Follow sources: org page `"profile"`; phone and desktop Orgs tabs and quick view `"discover"`; onboarding `"onboarding"`.
- **The floor** is duplicated on purpose: `FOLLOWER_COUNT_FLOOR = 5` in both `src/lib/orgs/following.ts` (F1) and `src/lib/orgs/join-copy.ts` (F5a). Each file carries a comment pointing at the other.

### 4.3 Gates between waves

- **G1 (after W1 deploys, before W2 pushes):**
  1. Franky says yes.
  2. The orchestrator applies `supabase/migrations/20260916130000_post_edited_at.sql` through the management API with curl, plus a `schema_migrations` row.
  3. E0's post-check SQL passes.
  W2's E1 and F4 select `edited_at`; pushing them before G1 makes `/api/feed` and `/api/posts/[id]` return 500 (42703).
- **G2 (after W2 deploys, before W3 pushes):**
  - Live, no-write checks show `POST /api/orgs/<hidden handle>/follow` → 404.
  - `/api/orgs?filter=discover` rows carry `org_follow_state`.
  B12S's controls call those routes.
- **G3 (after W3 deploys, before W4 pushes):** `EditPostSheet.tsx`, `CampusConfirmBanner.tsx`, `onb-copy.ts` and `social-steps.ts` exist on `main`. They're imported by W4.
- **G4 (after W4 deploys, before W5 pushes):**
  - The live onboarding replay check passes: `/onboarding?replay=1` (phone) and `/onboarding/classic?replay=1` (desktop) record zero non-GET requests (§11.1 W4).
  - `/api/orgs?filter=mine` for Franky returns the same ids as at `f23bc5d`.
  - CH2 is on `main` (CH3 edits the same file).

---

## 5. Wave overview and file ownership

| Wave | Batch | Owned files | Depends on |
|---|---|---|---|
| **1** | **F1** following lib + routes | `src/lib/orgs/following.ts`, `src/lib/orgs/following.test.ts`, `src/app/api/orgs/[slug]/follow/route.ts`, `src/app/api/orgs/[slug]/followers/route.ts`, `src/app/api/orgs/[slug]/followers/[userId]/route.ts`, `src/app/api/me/followed-orgs/route.ts` (all new) | none |
| 1 | **B27** notification renderers | `src/lib/orgs/notification-orgs.ts` (new), `src/app/api/me/notifications/route.ts`, `src/app/api/me/otto/route.ts`, `src/components/network/OttoSidePanel.tsx`, `src/components/otto/OttoActivity.tsx`, `public/html/_otto.js` | none |
| 1 | **H1** live leak hotfixes | `src/app/api/orgs/[slug]/channels/route.ts`, `src/app/orgs/[handle]/ChannelsSection.tsx`, `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/join-button.tsx`, `src/app/api/search/route.ts`, `src/app/campus/campus-home.tsx` (join labels only) | none |
| 1 | **F5a** shared org client | `src/lib/orgs/join-copy.ts`, `src/lib/orgs/join-copy.test.ts`, `src/components/orgs/OrgJoinControl.tsx`, `src/components/orgs/OrgInviteSheet.tsx`, `src/components/orgs/OrgInviteBanner.tsx` (all new) | none (routes by URL) |
| 1 | **E0** edited_at + posts lock + edit lib | `supabase/migrations/20260916130000_post_edited_at.sql`, `src/lib/posts/edit.ts`, `src/lib/posts/edit.test.ts` (all new) | none. The migration is applied at G1 |
| **2** | **F2** org route follow fields | `src/app/api/orgs/route.ts`, `src/app/api/orgs/[slug]/route.ts`, `src/app/api/orgs/[slug]/profile/route.ts` | F1 |
| 2 | **F3** invite sheet on followers | `src/app/api/orgs/[slug]/invite-candidates/route.ts` | F1 |
| 2 | **F4** followed clubs in feed (+ E1f `edited_at`) | `src/app/api/feed/route.ts`, `src/lib/iu/community-scope.ts`, `src/lib/iu/community-scope.test.ts` | F1, G1 |
| 2 | **E1** post edit route | `src/app/api/posts/[id]/route.ts`, `src/app/api/me/posts/route.ts`, `src/app/api/users/[handle]/posts/route.ts`, `src/lib/composer/helpers.ts` | E0, G1 |
| 2 | **F6** org page | `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/join-button.tsx`, `src/app/orgs/[handle]/admin-actions.tsx`, `src/app/orgs/[handle]/ChannelsSection.tsx`, `src/app/api/orgs/[slug]/channels/route.ts` | F5a, F1, H1; F3 by URL |
| **3** | **E2** phone edit sheet + viewer | `src/components/mobile/EditPostSheet.tsx` (new), `src/components/mobile/PostViewerMobile.tsx` | E0 (lib), E1 |
| 3 | **B12S** onboarding social pieces | `src/lib/onboarding/social-steps.ts`, `src/lib/onboarding/social-steps.test.ts`, `src/components/mobile/onboarding/onb-copy.ts`, `…/onb-theme.ts`, `…/StepClubs.tsx`, `…/StepPeople.tsx` (all new) | F5a, G2 |
| 3 | **CH1** desktop campus home: campus identity + feed edit | `src/app/campus/campus-home.tsx`, `src/app/campus/page.tsx` | H1 (same file), E0 lib, E1, F4 |
| 3 | **B14t** tour, people groups, confirm banner | `src/components/mobile/use-mobile-tour.ts`, `src/components/mobile/NetworkMobile.tsx`, `src/components/mobile/CampusConfirmBanner.tsx` (new) | none |
| 3 | **B15** settings campus + sign-out draft clear | `src/components/settings/SettingsClient.tsx`, `src/app/settings/page.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/lib/profile/settings-campus-card.ts` (new), `src/lib/profile/settings-campus-card.test.ts` (new) | none |
| **4** | **B12** phone onboarding shell | `src/components/mobile/OnboardingMobile.tsx`, `src/components/mobile/onboarding/OnbHeader.tsx`, `StepCampus.tsx`, `StepProfile.tsx`, `StepPhoto.tsx`, `SkipSheet.tsx` (new), `src/lib/onboarding/draft.ts`, `src/lib/onboarding/draft.test.ts` | B12S, G3 |
| 4 | **B13** desktop onboarding | `public/html/onboarding.html` | B12S, F5a |
| 4 | **CM** phone CampusMobile (F5b + B14 edits + E3) | `src/components/mobile/CampusMobile.tsx` | F5a, F2, E2, B14t, CH1 (CampusBanner export), G3 |
| 4 | **CH2** desktop Orgs tab (student side) | `src/app/campus/campus-home.tsx` | CH1, F5a, F2, H1 |
| 4 | **PM** phone profile (B16m + E5) | `src/components/mobile/ProfileMobile.tsx` | E2, E0 lib |
| **5** | **CH3** desktop officer settings | `src/app/campus/campus-home.tsx` | CH2, F5a, F1, F3 |
| 5 | **PH** desktop profile (B16d + E7) | `public/html/profile.html` | E6 (event, same wave, by contract), E1 |
| 5 | **E6** desktop post viewer edit | `public/html/_postViewer.js` | E1 |
| 5 | **B20** map halos, landing, messages, sentinel | `src/components/mobile/MapMobile.tsx`, `src/components/landing/home-landing.tsx`, `public/html/messages.html`, `.claude/workflows/security-sentinel.js` | none |
| 5 | **B21** legal drafts (local, gitignored) | `handoffs/legal-drafts/2026-09-07-privacy-policy.md`, `…-terms-of-service.md`, `…-reviewer-questions.md` | ships after W1–W4, so it describes shipped behaviour |

Files touched in more than one wave (always one owner per wave):
- `campus-home.tsx`: H1 (W1) → CH1 (W3) → CH2 (W4) → CH3 (W5)
- org page files and the channels route: H1 (W1) → F6 (W2)

Files NOT touched by any batch: `src/app/orgs/[handle]/OrgEventsSection.tsx`, `src/app/posts/[id]/PostPageClient.tsx`, `src/lib/orgs/join-state.ts`, `src/lib/orgs/membership.ts`, `join/route.ts`, `globals.css`, `src/lib/iu/campuses.ts`, `src/lib/iu/majors.ts`, `src/app/api/campuses/route.ts`, `/api/me/notifications/count`.

---

## 6. Wave 1: live hazards, the follow server, shared client pieces, post-edit groundwork

### F1 · following lib + follow / unfollow / officer list / officer removal / own list

**Owns (all new):** `src/lib/orgs/following.ts`, `src/lib/orgs/following.test.ts`, `src/app/api/orgs/[slug]/follow/route.ts`, `src/app/api/orgs/[slug]/followers/route.ts`, `src/app/api/orgs/[slug]/followers/[userId]/route.ts`, `src/app/api/me/followed-orgs/route.ts`
**Depends on:** nothing. M1d is live: 7 `org_followers` rows, all `source='join'`; policy `org_followers_select` = own rows OR owner/admin of the org; no client write grants.

**Rules for every route**
- Errors are `{ok:false, error, code}` through a local `fail()` like `join/route.ts:20-27`.
- 429 comes from `tooManyRequests(rl, "Too many tries. Try again in a minute.")` (`rate-limit.ts:133`).
- The org is ALWAYS loaded with `createSupabaseServiceClient()` (migration :131-152).
- Counts and lists ALWAYS use the service client (COUNTS RULE, migration :161-169).
- Routes insert only `{org_id, user_id, source}` and never send `created_at` / `first_followed_at` (column comment :685-686).
- The user client is used only for `auth.getUser`, `loadHiddenUsers`, and the viewer's own rows in `/api/me/followed-orgs`.

**Lib `src/lib/orgs/following.ts`**
NO `import "server-only"` (node tests load it; see `membership.ts:1`). Imports: `import type { SupabaseClient } from "@supabase/supabase-js"`, `isUuid` from `@/lib/pgrest` (`pgrest.ts:15`), `type OrgRole` from `@/lib/orgs/join-state` (`join-state.ts:65`). Never creates a client; never throws; loaders log `"[orgs/following <fn>]"` and return `{ok:false,error}` or null.

Exports:
- `FOLLOWER_LIST_ROLES: readonly OrgRole[] = Object.freeze(["owner","admin"])`. Comment: mirrors `org_followers_select` (migration :726-731) and must change with it.
- `canSeeFollowers(role: OrgRole|null|undefined): boolean`
- `type FollowSource = "join"|"profile"|"discover"|"onboarding"`; `FOLLOW_SOURCES` (all four, mirrors CHECK :676-677); `type ClientFollowSource = Exclude<FollowSource,"join">`; `CLIENT_FOLLOW_SOURCES = ["profile","discover","onboarding"]`; `isFollowSource(v): v is FollowSource`
- `normalizeFollowSource(v: unknown): ClientFollowSource`. Anything outside `CLIENT_FOLLOW_SOURCES`, `"join"` included, becomes `"profile"`.
- `type OrgFollowState = "following"|"not_following"`
- `FOLLOWER_COUNT_FLOOR = 5`, with the comment "keep equal to `join-copy.ts` FOLLOWER_COUNT_FLOOR".
- `publicFollowerCount(raw: number|null|undefined, viewerRole: OrgRole|null|undefined): number|null`
  - If `canSeeFollowers(viewerRole)`, return `raw` (non-finite → null).
  - Otherwise return null when `raw` is null, non-finite or below the floor; else `raw`.
- `flattenCountEmbed(embed: unknown): number|null`. `[{count:n}]` with finite n ≥ 0 gives n; anything else gives null.
- `PAGE_LIMIT_DEFAULT = 30`, `PAGE_LIMIT_MAX = 50`; `parsePageLimit(raw: string|null): number` (non-numeric or <1 → default; clamp to max).
- `type FollowCursor = {t: string; i: string}`
- `encodeFollowCursor(ts, id)`: base64url of JSON `{t,i}`. `ts` is the RAW PostgREST timestamptz string with microseconds (e.g. `"2026-05-06T06:24:44.908587+00:00"`); never pass it through `Date`.
- `decodeFollowCursor(raw: string|null): {ok:true; cursor: FollowCursor|null} | {ok:false}`
  - null or `""` → `{ok:true, cursor:null}`.
  - Otherwise require length ≤ 256, base64url JSON, `isUuid(i)`, and `t` matching `/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)$/`. Anything else → `{ok:false}`.
- `followKeysetOrFilter(column: "first_followed_at"|"created_at", c: FollowCursor): string` returns exactly `` `${column}.lt."${c.t}",and(${column}.eq."${c.t}",id.lt.${c.i})` `` (quotes are required; `pgrest.ts:3-8`).
- `loadViewerFollowedOrgIds(client, viewerId, opts?: {limit?: number}): Promise<{ok:true; ids: string[]}|{ok:false; error: unknown}>`
  - Query: `from("org_followers").select("org_id").eq("user_id", viewerId)`. The filter is ALWAYS applied: under the user client the policy also returns the follower rows of clubs the viewer owns or admins.
  - Then `.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(opts?.limit ?? 1000)`.
  - Ids are newest follow first, deduplicated.
- `loadViewerFollow(client, orgId, viewerId): Promise<{ok:true; row: {source: FollowSource; created_at: string; first_followed_at: string}|null}|{ok:false; error: unknown}>`: `.eq org_id .eq user_id .maybeSingle()`.
- `loadFollowerCount(service, orgId): Promise<number|null>`: `select("id",{count:"exact",head:true}).eq("org_id",orgId)`; on error log and return null.
- `type OrgCard = {id; handle; name; logo_url: string|null; verified: boolean; is_public: boolean}`
- `loadVisibleOrgCards(service, orgIds: string[]): Promise<{ok:true; byId: Map<string,OrgCard>}|{ok:false; error: unknown}>`
  - Filter ids with `isUuid` and dedupe; if none remain, return an empty map without querying.
  - Query: `select("id,handle,name,logo_url,verified,is_public").in("id", ids).is("hidden_at", null)`.
  - Never selects or returns `hidden_at`. `logo_url` comes back raw; callers proxy it.

**`POST /api/orgs/[slug]/follow`**
1. Auth, else 401 `unauthorized`.
2. `rateLimit(`org-follow:${uid}`,{limit:60,windowSec:600})`, else 429.
3. `requireTermsAccepted(uid)` (`require-terms.ts:27`), else its 403 `terms_required`.
4. Body JSON is optional (empty or invalid → `{}`); `source = normalizeFollowSource(body.source)`.
5. Service `orgs.select("id, handle, hidden_at").eq("handle",slug).maybeSingle()`. Error → 500 `load_failed` "Failed to load org". No row → 404 `not_found` "Not found".
6. If `hidden_at` is set: service read of the viewer's `org_members.role`. Error → 500 `load_failed`. No role → 404 `not_found` (platform admins included).
7. NO audience, verification, campus or block check.
8. Service insert `{org_id, user_id, source}`.
   - On `isUniqueViolation` (`join-state.ts:346`) set `already=true` and update nothing (source never changes).
   - Any other error → 500 `follow_failed` "Couldn't follow. Try again."
9. `follower_count = publicFollowerCount(await loadFollowerCount(service, org.id), null)`.

Response 200 `{ok:true, org_follow_state:"following", already:boolean, follower_count:number|null}`.

**`DELETE /api/orgs/[slug]/follow`**
1. Auth, else 401.
2. The SAME key `org-follow:${uid}` 60/600s, else 429.
3. NO Terms gate.
4. Service org load (`id, hidden_at`): 500 `load_failed` / 404 `not_found`.
5. Service role read. Error → 500 `load_failed`. Any role → 409 `member_follows` "Members follow their clubs automatically. Leave the club to stop following."
6. Service delete `.eq(org_id).eq(user_id)` with `{count:"exact"}`.
   - Error → 500 `unfollow_failed`.
   - `hidden_at` set and count 0 → 404 `not_found`.
   - Never touch `org_follow_firsts`.
7. `follower_count` as in POST.

Response 200 `{ok:true, org_follow_state:"not_following", follower_count}`. Deleting 0 rows on a visible club is still 200.

**`GET /api/orgs/[slug]/followers?limit=&cursor=`**
1. Auth, else 401.
2. `rateLimit(`org-followers:${uid}`,{limit:60,windowSec:60})`, else 429.
3. Service org load (`id, handle, hidden_at`): 500 `request_failed` / 404 `not_found`.
4. Service viewer-role read (error → 500).
   - Hidden club and no role → 404 `not_found`.
   - `!canSeeFollowers(role)` → 403 `officers_only` "Only owners and admins can see who follows this club." (mods get 403).
5. `limit = parsePageLimit(...)`. `decodeFollowCursor`; if `!ok`, 400 `invalid_cursor` "Invalid cursor".
6. `const hiddenRes = await loadHiddenUsers(supabase /*USER client*/, uid)` (`hidden-users.ts:26`). If `!hiddenRes.ok` → 500 `request_failed` (fail closed). `hiddenIds = hiddenRes.hidden.ids`.
7. Service query:
   - `from("org_followers").select("id, user_id, source, first_followed_at").eq("org_id", org.id)`
   - `+ .notIn("user_id", hiddenIds)` when non-empty (before the limit)
   - `+ .or(followKeysetOrFilter("first_followed_at", cursor))` when a cursor was given
   - `.order("first_followed_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1)`
   - Never order by `created_at`. Error → 500.
8. `page = rows.slice(0, limit)`. `next_cursor = rows.length > limit ? encodeFollowCursor(last.first_followed_at, last.id) : null` (last row of the page).
9. In parallel:
   - `hydrateUserCards(supabase, uid, pageUserIds)` (`src/lib/connections/queries.ts:324`; identity only, it applies no blocks)
   - service `org_members.select("user_id, role").eq("org_id").in("user_id", pageUserIds)`
   - `loadFollowerCount(service, org.id)`
   Members read error → 500. `cards.length !== pageUserIds.length` → 500 `request_failed` (the hydrator swallows errors, `queries.ts:334-364`).

Response 200 `{ok:true, followers:[{id, name, handle, avatar_url, banner_url, banner_gradient, major, year, mutual_count, follow_state /*PERSON follow, UserCard meaning*/, follows_since /*first_followed_at raw*/, org_follow_source, member_role: OrgRole|null}], next_cursor, follower_count /*raw for officers; null on read error*/}`.

**`DELETE /api/orgs/[slug]/followers/[userId]`** (officer removal, migration :195-223)
1. Auth, else 401.
2. `rateLimit(`org-follower-remove:${uid}`,{limit:30,windowSec:600})`, else 429.
3. NO Terms gate.
4. `!isUuid(userId)` → 400 `invalid_user_id` "Invalid user id".
5. Service org load: 500 `remove_failed` / 404 `not_found`.
6. Viewer role (service; error → 500). Hidden club and no role → 404. `!canSeeFollowers` → 403 `officers_only` "Only owners and admins can remove followers."
7. Target role (service; error → 500). Any role (self and owner included) → 409 `member_follows` "Members follow their club automatically. Remove them from the club instead."
8. Service delete from `org_followers` `.eq(org_id).eq(user_id)` with `{count:"exact"}`.
   - Error → 500 `remove_failed`.
   - No DELETE policy or grant is added, `org_follow_firsts` is not touched, and no notification is sent.
9. `follower_count = loadFollowerCount` (raw).

Response 200 `{ok:true, removed:boolean, follower_count}`.

**`GET /api/me/followed-orgs?limit=&cursor=`**
1. Auth, else 401.
2. `rateLimit(`me-followed-orgs:${uid}`,{limit:60,windowSec:60})`, else 429.
3. Limit and cursor; a bad cursor → 400 `invalid_cursor`.
4. USER client query:
   - `from("org_followers").select("id, org_id, source, created_at").eq("user_id", uid)` (mandatory filter)
   - `+ .or(followKeysetOrFilter("created_at", cursor))` when a cursor was given
   - `.order("created_at",desc).order("id",desc).limit(limit+1)`
   Error → 500 `request_failed`. `next_cursor` comes from the raw page.
5. Service reads in parallel (either error → 500):
   - `orgs.select("id, handle, name, logo_url, verified, join_policy, audience, campus_id").in("id", ids).is("hidden_at", null)`
   - `org_members.select("org_id, role").eq("user_id", uid).in("org_id", ids)`
6. Drop rows whose club did not come back (hidden or deleted). Pages may be short.

Response 200 `{ok:true, orgs:[{id, handle, name, logo_url /*orgAssetProxyUrl(handle, logo_url, "logo")*/, verified, join_policy, audience, campus_id, followed_at, org_follow_source, member_role}], next_cursor}`. No `join_state` here: surfaces with a Join control use `?filter=following` (F2).

**Acceptance**
- `node --test --experimental-strip-types src/lib/orgs/following.test.ts` passes, with these cases:
  - `normalizeFollowSource("join"|undefined|"map")` → "profile"
  - `publicFollowerCount(4,null)`=null, `(5,null)`=5, `(1,"owner")`=1, `(null,"admin")`=null
  - encode/decode keeps `…44.908587+00:00` exactly
  - decode rejects a non-uuid `i`, a `t` containing `",id.gt.`, and input over 256 chars
  - `followKeysetOrFilter` returns the exact string
  - a fake client proves `loadViewerFollowedOrgIds` always calls `.eq("user_id", viewerId)` and both orders
  - `flattenCountEmbed([{count:3}])`=3, `(null)`=null
- `npx tsc --noEmit` exits 0; eslint on the new files: 0 problems.
- Grep over the 5 route files: every `from("orgs")` and every `org_followers` count or list uses the service client. `createSupabaseServerClient` appears only for `auth.getUser`, `loadHiddenUsers` and the own-row read.
- Prod checks with NO writes (in-page fetch as a signed-in account):
  - POST `/api/orgs/test-f7ae4129/follow` as a non-member → 404 `not_found`
  - DELETE `/api/orgs/sae/follow` as SAE's owner → 409 `member_follows`
  - GET `/api/orgs/sae/followers` as a non-officer → 403 `officers_only`
  - GET `/api/orgs/sae/followers` as the owner → 200 with the owner row (`org_follow_source:"join"`, `member_role:"owner"`)
  - DELETE `/api/orgs/sae/followers/<owner uuid>` → 409
  - DELETE `/api/orgs/sae/followers/not-a-uuid` → 400 `invalid_user_id`
  - GET `/api/orgs/sae/followers?cursor=garbage` → 400 `invalid_cursor`
- Branch or local only (§7.2 seed): an unverified, non-member Purdue student POSTs follow on the invite-only club → 200 `already:false`; the second POST → `already:true`; DELETE twice → 200 both times; unfollow + refollow keeps `first_followed_at`; the 61st call in 10 min → 429; without Terms, POST → 403 `terms_required` but DELETE works; officer removal → `removed:true` then `false`; 60 followers sharing one `first_followed_at` page through `limit=25` with no duplicates and no gaps.

**Do not touch:** `join/route.ts`, `membership.ts`, `join-state.ts`, any migration, any notification code. No "X followed your club" notification.

---

### B27 · notification read path + the three Otto renderers (live hazard)

**Owns:** `src/lib/orgs/notification-orgs.ts` (new), `src/app/api/me/notifications/route.ts`, `src/app/api/me/otto/route.ts`, `src/components/network/OttoSidePanel.tsx`, `src/components/otto/OttoActivity.tsx`, `public/html/_otto.js`
**Depends on:** nothing.

**Why this ships now:** `notifyOrg` callers are live (`invites/route.ts:607`, `requests/[id]/route.ts:275`), and today:
- `OttoSidePanel.tsx:8` lacks both types and `verbFor` returns `''` (:846-847)
- `OttoActivity.tsx:59-60` renders "did something"
- `_otto.js:782` has an empty verb and opens the officer's profile (:842-844)

Per the M1c contract (`20260916103000_org_join_policy_invites.sql:66-92`), nothing from `orgs` is embedded under the user client.

**Contract**

1. **NEW `src/lib/orgs/notification-orgs.ts`** (`import "server-only"`)
   - `export type NotificationOrg = { handle: string; name: string; logo_url: string | null }`
   - `export async function attachNotificationOrgs<T extends { org_id?: string | null }>(service: SupabaseClient, rows: T[]): Promise<Array<T & { org: NotificationOrg | null }>>`
   - Collect distinct non-null `org_id`s. If there are none, every row gets `org:null`.
   - Otherwise ONE service read: `from('orgs').select('id, handle, name, logo_url, hidden_at').in('id', ids)`.
   - On a read error: `console.error('[orgs/notification-orgs]', error)` and return every row with `org:null` (rows are kept).
   - On success, drop rows whose `org_id` resolves to no row or to `hidden_at != null` (Q6), and attach `{handle, name, logo_url: orgAssetProxyUrl(handle, logo_url, 'logo')}`.
   - Never returns `hidden_at`. Never throws.
2. **`src/app/api/me/notifications/route.ts`**
   - Add `org_id` to the FULL_SELECT column list (:42-46) only, with no embed. FALLBACK_SELECT (:47-51) is unchanged; its rows get `org:null`.
   - After the query, run `attachNotificationOrgs(createSupabaseServiceClient(), rows)` BEFORE the `withPostMediaUrls` map (:96-99).
   - Each notification gains `org_id` and `org`. Nothing else changes. `/count` is not edited.
3. **`src/app/api/me/otto/route.ts`**
   - `ActivityRow` (:55-63) gains `org: NotificationOrg | null`.
   - `ACTIVITY_SELECT` (:196-200) gains `org_id`; `RawActivity` (:214-223) gains `org_id`.
   - Run `attachNotificationOrgs` on `activityRes.data` (the service client is already imported, :5) before mapping (:224-232).
   - `unreadActivityCount` (:234-236) counts the rows left after the drop.
4. **`OttoSidePanel.tsx`**
   - `NotifType` (:8) adds `"org_invite" | "org_request_approved"`.
   - `NotifRow` (:33-45) gains `org_id?: string|null; org?: {handle; name; logo_url: string|null} | null`.
   - `verbFor` (:834-849) adds:
     - `org_invite` → `` `invited you to join ${n.org?.name ?? "a club"}` ``
     - `org_request_approved` → `` `approved your request to join ${n.org?.name ?? "a club"}` ``
   - `openRow` (:902-923), first branch for both org types: `window.location.href = n.org ? `/orgs/${encodeURIComponent(n.org.handle)}` : "/campus?tab=orgs"; onClose(); return;`
   - Stats tiles and FilterPills unchanged.
5. **`src/components/otto/OttoActivity.tsx`**
   - `describe` (:32-62) adds:
     - `case "org_invite": return `${actor} invited you to join ${n.org?.name ?? "a club"}`;`
     - `case "org_request_approved": return `${actor} approved your request to join ${n.org?.name ?? "a club"}`;`
   - Rows (:78-95):
     - org types are wrapped in `<Link href={n.org ? `/orgs/${encodeURIComponent(n.org.handle)}` : "/campus?tab=orgs"}>`
     - rows with `post_id` are wrapped in `<Link href={`/posts/${encodeURIComponent(n.post_id)}`}>` (the same destination as `OttoSidePanel.tsx:908-915`)
     - other rows unchanged
6. **`public/html/_otto.js`**
   - The `_ottoRenderNotifRow` switch (:775-783) adds:
     - `case 'org_invite': verb = 'invited you to join ' + _ottoEsc((n.org && n.org.name) || 'a club'); break;`
     - `case 'org_request_approved': verb = 'approved your request to join ' + _ottoEsc((n.org && n.org.name) || 'a club'); break;`
     The verb is interpolated into innerHTML at :804, so the escape is mandatory.
   - `__ottoOpenNotif` (:814-847), after `closeOttoPanel()`, first branch for both org types: `window.location.href = (n.org && n.org.handle) ? '/orgs/' + encodeURIComponent(n.org.handle) : '/campus?tab=orgs'; return;`

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint not above baseline; `node --check public/html/_otto.js` passes.
- `grep -n "orgs!\|org:orgs" src/app/api/me/notifications/route.ts src/app/api/me/otto/route.ts` returns nothing.
- Live read-only, as Franky: GET `/api/me/notifications` and `/api/me/otto` return 200 with the same rows as before, plus `org_id` and `org:null` on every existing row (0 org notifications live).
- In-page fetch override injecting one `org_invite` row `{actor:{name:"Franky Cazares",handle:"franky"}, org:{handle:"sae",name:"SAE",logo_url:null}}` and one `org_request_approved` row:
  - The desktop Otto panel reads "Franky Cazares invited you to join SAE" and "Franky Cazares approved your request to join SAE"; clicking opens `/orgs/sae`.
  - `/otto` reads "Franky invited you to join SAE" and the row links to `/orgs/sae`.
  - The static profile page panel (`_otto.js`) reads the same and routes to `/orgs/sae`.
- An override with org name `<img src=x onerror=alert(1)>` renders as literal text in `_otto.js`.
- An override with `org:null` renders "invited you to join a club" and routes to `/campus?tab=orgs`. No row reads "did something" or a blank verb.

**Do not touch:** `/api/me/notifications/count`, `OttoCorner.tsx` (mentions only, :65), `membership.ts notifyOrg`.

---

### H1 · live leak hotfixes: org page, channels, search, desktop dead button

**Owns:** `src/app/api/orgs/[slug]/channels/route.ts`, `src/app/orgs/[handle]/ChannelsSection.tsx`, `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/join-button.tsx`, `src/app/api/search/route.ts`, `src/app/campus/campus-home.tsx` (join label edits listed below ONLY)
**Depends on:** nothing. F6 (W2) rebuilds the four org-page files on top of this, so keep changes minimal and typed.

**Live hazards confirmed at `f23bc5d`:**
- **Channels.** `channels/route.ts:29-36` resolves the handle with the USER client, so every SAE non-member gets 404. `ChannelsSection.tsx:51-73` fetches even though it already receives `viewerIsMember` (`page.tsx:248`), and renders the red "Couldn't load this org's channels."
- **Hidden clubs.** `page.tsx:87-94` loads any org with the service client and has no `hidden_at` check, so hidden test clubs render for anyone, including their title in `generateMetadata` (:66-81). `search/route.ts:201-209` reads orgs with the service client without `hidden_at is null`.
- **Dead join buttons.** `join-button.tsx:132` shows "Request to join" to SAE non-members, which 403s `invite_only`. The same happens on desktop in `campus-home.tsx:9103-9111` and `:8447-8454`.
- **Invites can't be accepted.** B27 routes invite notifications to `/orgs/sae`, so the page must offer "Accept invite".

**Contract**

1. **`channels/route.ts` GET (:21-50)**
   - After auth (:22-27): `const service = createSupabaseServiceClient()` (already imported :5).
   - `service.from("orgs").select("id, hidden_at").eq("handle", slug).maybeSingle()`:
     - error → 500 `{ok:false, error:"Failed to load channels", code:"load_failed"}`
     - no row → 404 `{ok:false, error:"Not found", code:"not_found"}`
   - `service.from("org_members").select("role").eq("org_id", org.id).eq("user_id", user.id).maybeSingle()`:
     - error → 500 `load_failed`
     - no role → `hidden_at ? 404 not_found : 403 {ok:false, error:"Channels are for members", code:"members_only"}`
   - The channels read (:38-44) stays on the USER client, so `can_view_org_channel` keeps filtering private channels.
   - Add `code:"unauthorized"` to the 401 and `code:"load_failed"` to the existing 500.
   - POST (:59+) unchanged.
2. **`ChannelsSection.tsx`**
   - The effect (:51-73) returns without fetching when `!viewerIsMember` (add it to the deps).
   - Non-members see the section card with its "Channels" heading and one muted line, "Chats are for members.", and nothing else.
   - Delete the visitor hint "Join the org above to chat in these channels." (:225-238) and the non-member branches of `ChannelRow` (:287-320).
   - The member path is unchanged.
3. **`page.tsx`**
   - `generateMetadata` (:66-81): select `name, description, is_public, hidden_at`. If `hidden_at`, return `{ title: "Vibe" }`.
   - Org load (:87-94): add `join_policy, audience, hidden_at, campus_id` to the select.
   - Replace the viewer block (:131-156). When signed in:
     - `const ctx = await loadViewerOrgContext(service, org.id, user.id)` (`membership.ts:106`)
     - `const decision = orgJoinState({org:{join_policy, audience, hidden_at, campus_id}, viewer: ctx.viewer, role: ctx.role, pendingInvite: ctx.pendingInvite, pendingRequest: ctx.pendingRequest})` (`join-state.ts:376`)
   - Hidden gate, before anything renders: `if (orgRaw.hidden_at && (!user || !ctx.ok || decision.state === "not_found")) notFound();`
   - `viewerRole = user && ctx.ok ? ctx.role : null` (the admin bar :197 and ChannelsSection :246-249 keep reading it).
   - Button (:207-215): `<OrgProfileJoinButton orgHandle signedIn joinState={!user ? "signed_out" : ctx.ok ? decision.state : null} joinPolicy={join_policy} audience={audience} />`. `decision.state` is never `not_found` here because of the gate.
   - `PrivateOrgNotice`, the chips (:455-461) and Facts (:828-845) stay as they are; F6 rewrites them.
4. **`join-button.tsx`**, whole component. Props `{ orgHandle: string; signedIn: boolean; joinState: JoinDisplayState | null; joinPolicy: JoinPolicy; audience: OrgAudience }` (types from `join-state.ts:59-104`). Keep `buttonBase` styles.
   - `signed_out` → Link to `/auth/login?next=` + `encodeURIComponent('/orgs/'+handle)`, labelled "Sign in to join" (open), "Sign in to request" (request) or "Sign in" (invite).
   - `null` → muted span "Couldn't load your membership."
   - `member` → the existing "✓ Joined" badge (:57-79).
   - `invited` → button "Accept invite".
   - `can_join` → button "Join".
   - `can_request` → button "Request to join".
   - `requested` → span "Request pending".
   - `invite_only` → disabled span "Invite only".
   - `audience_blocked` → disabled span "IU students only" or "Purdue students only".
   - `unverified` → Link "Verify your school email to join" → `/auth/school-email`.
   - `hidden` → disabled span "Hidden".
   - Buttons call `vibeRequest(`/api/orgs/${encodeURIComponent(orgHandle)}/join`, {method:"POST", json:{}, quiet:true, failure: <"Couldn't accept the invite." | "Couldn't join this org." | "Couldn't send your join request.">})`:
     - `data.joined` → member
     - `data.pending` → requested
     - code `invite_only` → invite_only
     - `audience_mismatch` → audience_blocked
     - `school_unverified` → unverified
     - otherwise show `r.message` under the button (existing :133-135 style)
5. **`search/route.ts`**
   - Orgs query (:201-209): add `.is("hidden_at", null)` and select `join_policy,audience`.
   - `OrgRow` and `orgsOut` (:315-341) gain `join_policy` and `audience`.
   - Nothing else in the file.
6. **`campus-home.tsx`**, only these edits:
   - `DiscoverOrg` (:8123-8140) gains `join_state?: string; join_policy?: "open"|"request"|"invite"; audience?: "both"|"iu"|"purdue"`.
   - Add a module-level helper `discoverJoinLabel(org: DiscoverOrg, status: "joined"|"pending"|undefined): { label: string; disabled: boolean }`:
     - `status==="joined" || org.role` → "Joined", disabled
     - `status==="pending" || join_state==="requested"` → "Requested", disabled
     - `invited` → "Accept invite"
     - `invite_only` → "Invite only", disabled
     - `audience_blocked` → "IU students only" / "Purdue students only" (by `audience`), disabled
     - `unverified` → "Verify school email", disabled
     - `can_join` → "Join"
     - `can_request` → "Request to join"
     - no `join_state` → today's `is_public` logic
   - Use the helper in `OrgQuickViewModal` (`ctaLabel`/`ctaDisabled`, :8447-8454) and `DiscoverCard` (`label`/`disabled`, :9103-9111), OR-ing `disabled` in.
   - `handleJoin` (:8211-8232) failure copy by `join_state`: `invited` → "Couldn't accept the invite."; `can_join` → "Couldn't join this org."; else "Couldn't send your join request."
   - Nothing else in the file.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint: campus-home ≤ 8, the other files not above baseline.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/orgs/sae/channels` (anon) → 401. In-page fetch as a non-member test account → 403 `members_only`; as SAE's owner → 200.
- `/orgs/sae` as a signed-in non-member:
  - no request to `/api/orgs/sae/channels` in the network log
  - no red line
  - "Chats are for members."
  - disabled "Invite only"
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/orgs/test-f7ae4129` (anon) → 404. The same URL as a signed-in non-member → 404.
- In-page fetch `/api/search?q=club&kinds=orgs` as a signed-in non-member: none of Finance Club, CS Club, Private equity club, Kelley Floor - University Tower; `q=sae` returns SAE with `join_policy:"invite"`.
- Desktop `/campus` Orgs tab as a non-member: SAE card and quick view show disabled "Invite only". With an in-page override of `/api/orgs?filter=discover` setting `join_state:"invited"`, they show "Accept invite".
- `/orgs/sae` with a page-level override is not possible (server-rendered). Verify `invited` on localhost against a branch invite row, or leave it for Franky's first real invite.

**Do not touch:** `admin-actions.tsx`, `OrgEventsSection.tsx`, any other campus-home function, `profile/route.ts`, `[slug]/route.ts`.

---

### F5a · shared org client: copy, the join/follow control, invite sheet, invite banner

**Owns (all new):** `src/lib/orgs/join-copy.ts`, `src/lib/orgs/join-copy.test.ts`, `src/components/orgs/OrgJoinControl.tsx`, `src/components/orgs/OrgInviteSheet.tsx`, `src/components/orgs/OrgInviteBanner.tsx`
**Depends on:** nothing. Calls routes by URL only and imports nothing from F1/F3. Nothing mounts these until W2, and the runtime needs F1 (W1) and F3 (W2).

**A) `src/lib/orgs/join-copy.ts`: PURE, ZERO runtime imports**

Only `import type { JoinState, JoinPolicy, OrgAudience, OrgRole } from "./join-state"`. Re-declare the literal `"signed_out"`.

Types:
- `OrgDisplayState = JoinState | "signed_out"`
- `FollowSource = "profile" | "discover" | "onboarding"`
- `OrgActionKind = "follow"|"unfollow"|"join"|"request"|"accept"|"decline"|"sign_in"|"verify_email"|"status"`
- `OrgAction = { kind; label: string; sub: string|null; tone: "filled"|"outline"|"quiet"; disabled: boolean; href: string|null }`
- `OrgRelation = { handle: string; orgName: string; state: OrgDisplayState; following: boolean; role: OrgRole|null; reason: "policy"|"visiting"|null; audience: OrgAudience; joinPolicy: JoinPolicy|null }`. `joinPolicy` is null only for `/api/me/org-invites` rows; callers force `following` true when `state==="member"`.

Constants:
- `FOLLOWER_COUNT_FLOOR = 5`, commented "keep equal to following.ts".
- `FOLLOW_DISCLOSURE = "Officers can see who follows this club."`
- `ORG_COPY`: a frozen object holding every string below, so B13 can copy it character for character.

**F (the follow toggle)** = `following ? {kind:'unfollow', label:'Following ✓', tone:'quiet'} : {kind:'follow', label:'Follow', tone:'filled'}`.

`orgHeaderView(rel) -> { follow: OrgAction|null; followSub: string|null; membership: OrgAction[]; disclosure: string|null }` (the org page; first match wins):
- `signed_out`: follow `{sign_in 'Sign in to follow', filled, href '/auth/login?next=' + encodeURIComponent('/orgs/' + handle)}`; membership `[]`.
- `member`: follow `{status 'Following ✓', quiet, disabled}`, followSub 'Members follow automatically'; membership `[{status 'Joined ✓', quiet, disabled}]`.
- `hidden`: follow null; membership `[{status 'Hidden', disabled, sub 'Hidden by Vibe. Only members can see it.'}]`.
- `invited`: F; `[{accept 'Accept invite', filled}, {decline 'Decline', outline}]`.
- `can_join`: F; `[{join 'Join', outline}]`.
- `can_request` with reason `policy`: F; `[{request 'Request to join', outline, sub 'Officers approve requests'}]`. With reason `visiting`: sub "You're visiting, so officers approve requests".
- `requested`: F; `[{status 'Requested', quiet, disabled}]`.
- `invite_only`: F; `[{status 'Invite only', disabled, sub 'Officers invite members'}]`.
- `audience_blocked`: F; `[{status 'IU students only' | 'Purdue students only', disabled, sub '{org} is open to IU students only.' | '{org} is open to Purdue students only.'}]`.
- `unverified`: F; `[{verify_email 'Verify your school email to join', outline, href '/auth/school-email'}]`.
- `disclosure = FOLLOW_DISCLOSURE` iff joinPolicy is `request` or `invite` AND state is not member, hidden or signed_out.

`orgRowView(rel, surface: "phone_row"|"card"|"onboarding") -> { chip: "Invited you"|"Following"|null; actions: OrgAction[]; layout: "slot"|"line"; disclosure: string|null; meta: string[]; sub: string|null }`:

| state | phone_row | card | onboarding | chip |
|---|---|---|---|---|
| signed_out | [sign_in 'Sign in to follow'] slot | same | same | null |
| member | [status 'Joined ✓' quiet disabled] slot | same | same; `sub` 'Members follow automatically' | null |
| hidden | [status 'Hidden' disabled] slot | same | same | null |
| invited | [accept 'Accept' filled] slot | [accept 'Accept invite' filled, decline 'Decline' outline] slot | [accept 'Accept' filled] slot | 'Invited you' |
| can_join, not following | [follow 'Follow' filled, join 'Join' outline] LINE | same two, slot | same two, LINE | null |
| can_join, following | [unfollow 'Following ✓' quiet, join 'Join' filled] LINE | same two, slot | same two, LINE | null |
| can_request, not following | [follow 'Follow' filled] slot | same | same | null |
| can_request, following | [request 'Request' filled] slot | [unfollow 'Following ✓' quiet, request 'Request to join' outline] slot | [unfollow 'Following ✓' quiet] slot | phone_row 'Following'; card and onboarding null |
| requested / invite_only / audience_blocked / unverified | [F] slot | [F] slot | [F] slot | null |

Rules for `orgRowView`:
- At most one `tone:'filled'` action per view.
- The chip never repeats a rendered control. There is no 'Joined' chip in v1.
- `sub` is non-null only for onboarding + member.
- `meta`: the caller prefixes '@handle' and, on phone_row and card, appends `memberCountText`; onboarding shows no counts. Order:
  1. policy: `request` → 'By request', `invite` → 'Invite only'
  2. 'Requested' iff state is requested
  3. audience: `iu` → 'IU only', `purdue` → 'Purdue only'
  4. 'Hidden' iff state is hidden
- `disclosure = FOLLOW_DISCLOSURE` iff joinPolicy is `request` or `invite` AND the actions include follow or unfollow.

Text helpers (all return `string|null` unless noted):
- `policyChip(p)`: 'Open' / 'By request' / 'Invite only'
- `audienceChip(a)`: 'IU only' / 'Purdue only' / null
- `followerCountText(n)`: null when n is null or below 5, else '{n} followers'
- `memberCountText(n)`: null when null; '1 member'; '{n} members'
- `followsSinceText(iso)`: 'Follows since {Mon D}' (`toLocaleDateString('en-US',{month:'short',day:'numeric'})`; invalid → null)
- `inviteSubText(firstName, expiresIso)`: 'Invited by {first name} · Expires {Mon D}' or 'Invited by an officer · Expires {Mon D}'
- `whoCanJoinFact(p)`: 'Anyone' / 'By request' / 'By invitation'
- `openToFact(a)`: 'Anyone' / 'IU students' / 'Purdue students'
- `WHO_CAN_JOIN_OPTIONS`: open 'Anyone can join' (sub 'Join instantly') · request 'Request to join' (sub 'Officers approve requests') · invite 'Invite only' (sub 'Officers invite members')
- `openToOptions(campus: {name: string; shared: boolean} | null)`: both → `shared ? 'All of {name} (IU + Purdue)' : 'IU and Purdue students'`; iu 'IU students only'; purdue 'Purdue students only'
- `OFFICER_FOLLOW_HELP = "Anyone can follow your club. This only sets who becomes a member."`
- `AUDIENCE_HELP = "Checked against each student's verified school email when they join."`
- `MOD_READONLY = "Only owners and admins can change this."`
- `joinPolicyNotice({state, joinPolicy, audience, orgName, hidden})`:
  - hidden → "This org is hidden. Only its members can find it. It's out of lists, search and events."
  - member → null
  - audience_blocked → '{org} only takes IU students as members. You can still follow.' / '{org} only takes Purdue students as members. You can still follow.'
  - invite → 'Invite only. Anyone can follow this club — officers add members.'
  - request → 'Anyone can follow this club. Officers approve members.'
  - open → null
- `channelsGateCopy(rel) -> {line: string; inline: OrgAction|null} | null`:
  - member → null
  - can_join → 'Chats are for members. Join to start talking.' with inline {join 'Join'}
  - can_request → 'Chats are for members. Officers approve who joins.' with inline {request 'Request to join'}
  - requested → 'Chats are for members. Officers approve who joins.'
  - invite_only → 'Chats are for members. Officers invite members.'
  - invited → 'Chats are for members. Accept the invite to start talking.'
  - unverified → 'Chats are for members. Verify your school email to join.'
  - audience_blocked / hidden / signed_out → 'Chats are for members.'
- `orgErrorCopy(code)`:
  - not_found → "This org isn't available."
  - 429 → 'Too many tries. Try again in a minute.'
  - member_follows → 'Members follow automatically.'
  - org_hidden → 'This org is hidden, so nobody new can join it.'
  - invite_not_found / invite_not_pending → 'This invite is no longer open.'
  - invite_only / audience_mismatch / school_unverified → null (the state flips; no toast)

**B) `join-copy.test.ts`** (`node --test --experimental-strip-types`; dynamic import through a specifier variable as in `join-state.test.ts:20`)

Walk all 10 `OrgDisplayState` × following {true,false} × joinPolicy {open, request, invite, null} × surface {phone_row, card, onboarding}, plus `orgHeaderView`. Assert:
- 1–2 actions with non-empty labels
- at most one filled
- no follow/unfollow action for member, hidden or signed_out
- `line` layout only for phone_row/onboarding + can_join
- `disclosure` non-null iff (request | invite) and a follow control is rendered
- the chip never duplicates a control
- the onboarding surface never has a `request` action

Plus:
- `followerCountText(null)=null`, `(4)=null`, `(5)='5 followers'`; `memberCountText(1)='1 member'`
- source-text assertion: every `import` line in `join-copy.ts` starts with `import type`

**C) `src/components/orgs/OrgJoinControl.tsx`** (`'use client'`)

Props: `{ relation: OrgRelation; variant: "header"|"phone_row"|"card"|"onboarding"; axis?: "both"|"membership" (header only, default both); source: FollowSource; pendingInviteId?: string|null; replay?: boolean; onChange?: (next: { state: OrgDisplayState; following: boolean; role: OrgRole|null; declined?: true }) => void }`.

Rendering:
- Header renders `orgHeaderView`; the others render `orgRowView(...).actions` for their surface.
- Header renders ONE wrapper element, because `globals.css:2733-2736` forces `.vibe-org-header-join > *` to width 100%. Inside it, flex-wrap rows: a follow column (button + followSub + disclosure at 12px muted) and a membership column (buttons + sub).
- Every tappable control is at least 44px tall; the follow toggle has `aria-pressed`.
- `line` layout: two pills, `flex:1`, side by side.

Behaviour:
- No optimistic flips: the pressed control shows '…' with `aria-busy` until the server answers (`MessagesMobile.tsx:1203-1234` pattern).
- `replay` true: no request at all. Compute the next state locally (follow ⇄ unfollow; join/accept → member + following; request → requested; decline → declined) and call `onChange`.
- Every call goes through `vibeRequest` with `quiet:true`. Codes below are handled; anything else toasts `r.message` with `r.action` (keeps terms_required's Review Terms action).
- **follow:** POST `/api/orgs/{handle}/follow` json `{source}`, failure "Couldn't follow this club."
  - ok → following=true
  - `not_found` → toast "This org isn't available." and disable
- **unfollow:** DELETE the same URL, failure "Couldn't unfollow this club."
  - ok → following=false
  - 409 `member_follows` → state member, following true, toast 'Members follow automatically.'
- **join / request / accept:** POST `/api/orgs/{handle}/join` json `{}`, failures "Couldn't join this org." / "Couldn't send your join request." / "Couldn't accept the invite."
  - `{joined:true, role}` → member, role, following true; accept also toasts "You're in. Welcome to {org}."
  - `{pending:true}` → requested
  - `invite_only` → invite_only
  - `audience_mismatch` → audience_blocked (relation.audience = response audience)
  - `school_unverified` → unverified
  - `not_found` → toast + disable
  - `org_hidden` → toast
- **decline:** `window.confirm("Decline the invite to {org}? An officer can invite you again later.")`, then POST `/api/me/org-invites/{pendingInviteId}` json `{action:'decline'}`, failure "Couldn't decline the invite."
  - ok → `onChange({... declined:true})` with state `joinPolicy open ? can_join : invite ? invite_only : can_request`
  - `invite_not_found` / `invite_not_pending` → toast 'This invite is no longer open.' + declined
- 429 anywhere → toast 'Too many tries. Try again in a minute.'
- `sign_in` and `verify_email` render as `next/link` anchors.

**D) `OrgInviteBanner.tsx`**

Props `{ orgName; inviterFirstName: string|null; expiresAt: string }`. Title "You're invited to join {org}", sub `inviteSubText(...)`. No buttons (the org page header carries Accept + Decline). Styled like `MessagesMobile.tsx:1657-1723`.

**E) `OrgInviteSheet.tsx`** (`'use client'`)

Props `{ handle; orgName; audience: OrgAudience; presentation: "sheet"|"modal"|"inline"; onClose?: () => void }`.
- `sheet` = vaul Drawer (as `MutualsSheet.tsx:4`); `modal` = centered dialog; `inline` renders in place.
- Title 'Invite people'. Search placeholder 'Search by name or @handle', 250ms debounce, one AbortController per query.

Lists:
- **q empty:** GET `/api/orgs/{handle}/invite-candidates?source=followers` (F3). Section label 'Followers'. Row sub `followsSinceText(follows_since)`. 'Show more' when `next_cursor`. Empty: 'Nobody follows {org} yet. Share the club's page — people who follow it show up here.'
- **q of 1 char:** 'Type at least 2 letters'.
- **q ≥ 2:** GET `?q=`. Empty: 'No one found. Check the spelling of their handle.'
- **Load failure:** `<LoadFailed failure={{message:"Couldn't load people."}} onRetry>`.
- **`can_invite` false:** a banner, with every Invite button disabled.
  - `org_unverified` → 'Get this org verified before inviting people. Message Vibe to start that.'
  - `org_hidden` → "This org is hidden, so it can't invite anyone."

Row button: decide by `state` FIRST, and look at `eligible` only when state is 'none' (`invite-candidates/route.ts:113-131`):
- none + eligible → 'Invite'. POST `/api/orgs/{handle}/invites` `{user_id}` → 'Invited ✓' plus an 'Undo' link (DELETE `/api/orgs/{handle}/invites/{id}`, toast 'Invite revoked'); toast 'Invite sent'.
- invited → 'Invited', disabled.
- member → 'Member', disabled.
- requested → 'Approve request'. POST `/api/orgs/{handle}/requests/{request_id}` `{action:'approve'}` → 'Member' + toast "They're in. Their request was approved." Never the invite POST.
- declined_recently → 'Declined', disabled, sub 'You can invite again {Mon D}'.
- invite_cap_reached → 'Invited enough', disabled, same sub.
- none + ineligible → 'Not eligible', disabled, sub '{org} is open to IU students only.' / '{org} is open to Purdue students only.' / "They haven't verified a school email yet."

Invite POST codes flip the row instead of showing a failure:
- `already_member` → Member
- `has_pending_request` → requested
- `recently_declined` / `invite_cap_reached` → those states
- `audience_mismatch` → Not eligible
- 429 → toast "You've sent a lot of invites. Try again in an hour."
- `org_hidden` / `org_unverified` → toast the server message

Pending invites, below the results:
- 'Pending invites ({n})' from GET `/api/orgs/{handle}/invites`.
- Row text: 'Invited {relative} by {first name}' or '… by an officer'.
- 'Revoke' → confirm 'Revoke this invite?' with buttons 'Revoke' / 'Keep'.
- Empty: 'No pending invites.'

**Acceptance**
- `node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts src/lib/orgs/join-state.test.ts` passes; `npx tsc --noEmit` exits 0; eslint on the new files: 0 problems.
- `grep -n "^import" src/lib/orgs/join-copy.ts` → only `import type` lines.
- `grep -rn 'from "@/app/api' src/components/orgs` → nothing.
- The components are not mounted in W1. Visual checks happen in F6 (W2), CM and CH2 (W4) with in-page overrides.

**Do not touch:** `join-state.ts`, `globals.css`, any page.

---

### E0 · `posts.edited_at`, posts UPDATE column lock, pure edit lib

**Owns (all new):** `supabase/migrations/20260916130000_post_edited_at.sql`, `src/lib/posts/edit.ts`, `src/lib/posts/edit.test.ts`
**Depends on:** nothing. The migration is written and reviewed in W1 and applied at gate G1 with Franky's yes.

**Live state:**
- Posts columns: id, user_id, org_id, type, content, media_url, media_thumbnail_url, created_at, tags, view_count, edit_metadata (clip text overlays, 2 rows; NOT an edit marker), status, campus_id, school_system. No `edited_at`.
- Triggers: `posts_stamp_campus` (BEFORE INSERT OR UPDATE), `bump_org_activity_on_post` (AFTER INSERT).
- Policy `posts_update_own`.
- relacl `authenticated=arwdDxtm` and `anon=arwdDxtm`, so a student can PATCH their own row's `created_at`, `tags`, `view_count` or `media_url` straight through PostgREST (security gap, Q21).
- The only user-client posts writer is `src/app/api/posts/[id]/route.ts:356-363` (`.update(patch)` at :358). Grep at `f23bc5d` found no other.

**Migration SQL**

The header documents the live state above and the gap it closes.

1. `alter table public.posts add column if not exists edited_at timestamptz;` No backfill; NULL means never edited.
2. The stamp function:
   ```sql
   create or replace function public.posts_stamp_edited() returns trigger language plpgsql set search_path = public as $$
   begin
     if old.status = 'published' and new.content is distinct from old.content then new.edited_at := now();
     else new.edited_at := old.edited_at; end if;
     return new;
   end $$;
   ```
   NOT security definer. It always overwrites the client value. Draft edits and the draft→published flip do not stamp.
3. `create trigger posts_stamp_edited before update on public.posts for each row execute function public.posts_stamp_edited();`
4. `revoke update on public.posts from anon, authenticated; grant update (content, tags, status) on public.posts to authenticated;`
5. `revoke all on function public.posts_stamp_edited() from public, anon, authenticated;` (critic C22's lesson)
6. `notify pgrst, 'reload schema';`

A PRE-CHECK comment and a POST-CHECK query go in the file:
- `has_column_privilege('authenticated','public.posts',c,'UPDATE')` is true for content, tags, status and false for every other column including `edited_at`.
- anon is false everywhere.
- The trigger row and the column exist.

**`src/lib/posts/edit.ts`** (pure, NO imports)
- `export const POST_MAX_CHARS = 2000;`
- `export function extractPostTags(text: string): string[]`: byte-for-byte the algorithm at `src/lib/composer/helpers.ts:81-94` (`/#[A-Za-z0-9_]{1,32}/g`, lowercase, dedupe, max 10).
- `export type PostEditCheck = { ok: true; content: string } | { ok: false; error: string };`
- `export function checkPostEdit(input: unknown, hasMedia: boolean): PostEditCheck`
  - a non-string → "Invalid content"
  - trims the input
  - more than 2000 characters → "Post exceeds 2000 characters"
  - empty and `!hasMedia` → "Post needs text, an image, or a video" (same string as `publish-post/route.ts:154`)
- `export function addedHandles(prior: string[], next: string[]): string[]`: entries of `next` not in `prior`, lowercased.
- `export type EditedPost = { id: string; content: string; tags: string[]; edited_at: string | null };`
- `export function editedPostFrom(raw: unknown): EditedPost | null`: `id` must be a string; `content` falls back to ""; `tags` keeps only strings; `edited_at` is a string or null.
- `export const EDITED_LABEL = "Edited";`

**Acceptance**
- `node --test --experimental-strip-types src/lib/posts/edit.test.ts` passes, covering:
  - extractPostTags parity (dedupe, case, 10 cap, 32 truncation)
  - checkPostEdit: whitespace with and without media, 2000 vs 2001 characters, non-string
  - addedHandles: re-adding an existing handle → []
  - editedPostFrom on junk input
- The SQL file parses (`psql --set ON_ERROR_STOP=1 -f` against a local stack or branch if one is available; otherwise reviewer read-through).
- G1 post-check (after apply, read-only):
  - `has_column_privilege` returns exactly the expected set
  - `select tgname from pg_trigger where tgname='posts_stamp_edited'` → 1 row
  - `select count(*) from posts where edited_at is not null` → 0
- G1 regression, read-only as Franky right after apply: `/api/feed?limit=20` → 200; open one post viewer → view count still increments (`record_post_view` is SECURITY DEFINER).

**Do not touch:** any route (E1 is W2), `edit_metadata`.

---

## 7. Wave 2: follow fields on org routes, invite sheet, feed, post-edit route, org page

Push only after gate G1 (E0 applied).

### F2 · follow fields and counts on `/api/orgs`, `/api/orgs/[slug]`, `/api/orgs/[slug]/profile`, plus `filter=following`

**Owns:** `src/app/api/orgs/route.ts`, `src/app/api/orgs/[slug]/route.ts`, `src/app/api/orgs/[slug]/profile/route.ts`
**Depends on:** F1 (imports `loadViewerFollowedOrgIds`, `loadViewerFollow`, `loadFollowerCount`, `publicFollowerCount`, `flattenCountEmbed`, `type OrgFollowState`).

**Contract** (field names per §4.2; never `follow_state`, which means a person follow at `UserCard.tsx:27`)

1. **`src/app/api/orgs/route.ts` GET**
   - (a) **Filter parsing (:134):** becomes `raw === "discover" ? "discover" : raw === "following" ? "following" : "mine"`. Document `filter=following` in the docblock (:91-125).
   - (b) **`filter=mine` (:175-231): NO CHANGE**, byte-identical response. Its callers are the chat rail `campus-home.tsx:465`, the post-as-club picker `campus-home.tsx:6997` and phone chats `CampusMobile.tsx:1517`.
   - (c) **Discover:**
     - The Promise.all (:241-257) gains a 4th entry, `loadViewerFollowedOrgIds(supabase, user.id)` (user client). On error: `console.error("[orgs GET discover follows]")` and continue with an empty set; a wrong button self-corrects because POST answers `already:true`.
     - The service select (:350-352) appends `, followers:org_followers(count)`. If the embed errors, the query fails into the existing 500 `load_failed` (:365-368), never a silent 0.
     - Row mapping (:391-446): destructure `followers` next to `members` (:392). Add `org_follow_state: followed.has(o.id) ? "following" : "not_following"` and `follower_count: publicFollowerCount(flattenCountEmbed(followers), role)`.
     - C27: `member_count: members?.[0]?.count ?? null` (was `?? 0` at :426).
     - Sort (:461): invited 0, everything else 1. `audience_blocked` rows no longer sink; they're followable.
     - Move the row mapping into ONE local function that discover and following both call.
   - (d) **New `filter=following`:**
     - Runs after the `?campus` forbidden check (:168-173). Not campus-scoped. A `me` read error → 500 `load_failed` (as :154-156).
     - `const FOLLOWING_FILTER_CAP = 100`. `ids = loadViewerFollowedOrgIds(supabase, user.id, {limit: CAP + 1})`; `!ok` → 500 `load_failed` "Failed to load orgs". `has_more = ids.length > CAP`, then slice to CAP. No ids → 200 `orgs: []`.
     - The same membership, request, invite, inviter-name and hidden-user reads as :241-320.
     - Service orgs query: the same columns plus both count embeds, `.in("id", ids).is("hidden_at", null)`, with `q` applied as at :359-363. No campus filter, no `INVITE_ONLY_ORGS_IN_DISCOVERY` filter, no dormancy filter.
     - Rows come back in `ids` order (newest follow first) and include member clubs (`role` non-null).
     - Response 200 `{ok:true, orgs:[discover row shape, org_follow_state always "following"], has_more, viewerCampus, viewerCampusId, viewerSystem, campusScope: ALL_CAMPUSES}`.
2. **`src/app/api/orgs/[slug]/route.ts` GET (:210-308)**
   - The Promise.all (:246-252) becomes `[ctx, memberCountRes, loadViewerFollow(service, org.id, user.id), loadFollowerCount(service, org.id)]`.
   - A failed follow read → 500 `load_failed`, the same rule as `ctx.ok` at :253-257. Nothing new is sent before the not_found check (:266-268).
   - `org` gains `org_follow_state` (row ? "following" : "not_following"), `org_follow_source: row?.source ?? null` and `follower_count: publicFollowerCount(raw, ctx.role)`.
   - C27: `member_count: memberCountRes.error ? null : (memberCountRes.count ?? null)` (was `count ?? 0` at :292).
   - PATCH and DELETE are untouched.
3. **`src/app/api/orgs/[slug]/profile/route.ts` GET** (works signed out)
   - The hidden gate (:101-106) stays FIRST; every new read runs after it (C12).
   - The member count read (:108-111) runs in parallel with `loadFollowerCount(service, org.id)` and, when signed in, `loadViewerFollow(service, org.id, user.id)`. A failed follow read for a signed-in viewer → 500 `load_failed` shaped like :73-81.
   - The `org` literal (:149-168, field by field, never spread) gains `follower_count: publicFollowerCount(raw, ctx?.role ?? null)`.
   - C27: `member_count: error ? null : count ?? null` (was `?? 0` at :167).
   - `viewer` (:169-183) gains `org_follow_state: user ? (row ? "following" : "not_following") : null` and `org_follow_source: row?.source ?? null`.

**Acceptance**
- `/api/orgs?filter=mine` JSON for the same account is identical before and after (save both, `diff`).
- Discover rows carry `org_follow_state` and `follower_count`. SAE's `follower_count` is null for a non-officer (1 < 5) and 1 for SAE's owner. `member_count` is still a number.
- `/api/orgs?filter=following` as SAE's owner → SAE with `role:"owner"`, `org_follow_state:"following"`, `has_more:false`; hidden followed clubs absent. `?filter=following&campus=purdue-west-lafayette` as an IU viewer → 403 `campus_not_in_system`.
- `/api/orgs/sae` as the owner → `org_follow_state:"following"`, `org_follow_source:"join"`. As a non-member → `"not_following"`, null.
- Unauthenticated `curl /api/orgs/sae/profile` → `org.follower_count` null, `viewer.org_follow_state` null, `viewer.join_state` null. Unauthenticated `curl /api/orgs/test-f7ae4129/profile` → 404 `not_found`.
- With `loadFollowerCount` forced to fail on a dev run, `follower_count` is null, never 0. A forced member-count failure makes `member_count` null on `[slug]` and profile.
- `npx tsc --noEmit` exits 0; eslint not above baseline.

**Do not touch:** the `filter=mine` branch, PATCH/DELETE in `[slug]/route.ts`, POST create in `orgs/route.ts`.

---

### F3 · invite-candidates opens on the club's followers

**Owns:** `src/app/api/orgs/[slug]/invite-candidates/route.ts`
**Depends on:** F1 (imports `decodeFollowCursor`, `encodeFollowCursor`, `followKeysetOrFilter`), plus `loadHiddenUsers` from `@/lib/safety/hidden-users`.

**Unchanged:** the rate limit `org-invite-search` 60/60 (:141-144), `requireInviteOfficer` (:147-149), `blocked_reason` (:152-156), and every existing error code.

**Mode:** `mode = (q.length >= Q_MIN && source !== "followers") ? "search" : "followers"`, where `q` comes from :158 and `source` from `?source=`. This replaces the early empty return (:159-166); nothing calls this route at HEAD. In followers mode `q` is ignored. `decodeFollowCursor(?cursor)`; `!ok` → 400 `invalid_cursor` "Invalid cursor". The cursor is ignored in search mode.

**Followers mode**
1. `const hiddenRes = await loadHiddenUsers(supabase, user.id)`; `!hiddenRes.ok` → 500 `request_failed` (C3, fail closed).
2. Service query:
   - `from("org_followers").select("id, user_id, first_followed_at").eq("org_id", org.id).neq("source","join").neq("user_id", user.id)`
   - `+ .notIn("user_id", hiddenRes.hidden.ids)` when non-empty
   - `+ .or(followKeysetOrFilter("first_followed_at", cursor))` when a cursor was given
   - `.order("first_followed_at",{ascending:false}).order("id",{ascending:false}).limit(MAX_RESULTS + FILTER_HEADROOM)` (30)
   - Never order by `created_at` (C5, C15). Error → 500 `request_failed`.
3. Service `users.select(CANDIDATE_COLUMNS).in("id", followerIds)`, with no `school_verified` filter in SQL. In TypeScript keep only `isDiscoverableAccount(row) && !isTriggerDefaultHandle(row.handle)` (same rule as :212), in follow-row order. Error → 500.
4. Run the existing standings Promise.all (:241-261) over the survivors and fail closed exactly as :263-275.
   - Drop anyone with a member role, and anyone blocked either way against the officer or the owner.
   - Compute `state`, `eligible`, `reason`, `available_at`, `request_id` exactly as :310-375.
5. Walk the follow rows in order and emit up to `MAX_RESULTS` (20). `next_cursor`:
   - output stopped at 20 → the cursor of the last follow row read
   - otherwise, 30 raw rows came back → the cursor of the last raw row
   - otherwise null
6. `follows_since` = that follow row's raw `first_followed_at`.

**Search mode:** unchanged, except the standings Promise.all gains a service read `from("org_followers").select("user_id, first_followed_at").eq("org_id", org.id).in("user_id", ids)`. Its error joins `readErr` and fails closed. Each row gains `follows_since: string|null`. `loadHiddenUsers` is NOT added here: a typed name must still find a muted person, and blocks are already dropped.

**Response 200** `{ok:true, can_invite, blocked_reason, source:"followers"|"search", next_cursor /*null in search*/, users:[{id, name, handle, avatar_url, major, year, state, eligible, reason, available_at?, request_id?, follows_since}]}`. New error: 400 `invalid_cursor`. Update the docblock (:101-132).

**Acceptance**
- No `q`, as SAE's owner → 200 `source:"followers"`, `next_cursor:null`, users contain no members (the owner's own join row is gone).
- `?q=ab` → `source:"search"`; rows carry `follows_since` (null for non-followers); states match the pre-change response.
- `?source=followers&q=ab` → followers mode. `?cursor=garbage` → 400 `invalid_cursor`.
- A mod → 403 `officers_only`; a non-member on a hidden club → 404 (unchanged).
- Branch/local (§11.2 seed):
  - forced `loadHiddenUsers` failure → 500
  - a follower who blocked the owner is absent
  - follow-then-join is absent
  - 45 followers with shared `first_followed_at` page through without duplicates or gaps
  - unfollow/refollow doesn't move a student up
- `npx tsc --noEmit` exits 0; eslint not above baseline.

---

### F4 · followed clubs in the feed lane; club names via the service client; `edited_at` on feed posts (E1f folded in)

**Owns:** `src/app/api/feed/route.ts`, `src/lib/iu/community-scope.ts`, `src/lib/iu/community-scope.test.ts`
**Depends on:** F1 (imports `loadViewerFollowedOrgIds`, `loadVisibleOrgCards`, `type OrgCard`); G1 (E0 applied; the selects name `edited_at`).

**`src/lib/iu/community-scope.ts`** (stays pure)
- `export const FOLLOWED_ORG_FILTER_CAP = 50` next to :294. Docblock: 300 author uuids is about 11.1 KB; 50 club uuids add about 1.9 KB; blocked/muted ids come on top; the newest 50 follows are kept; the route logs truncation (C20).
- `feedLaneOrFilter(lane, followedAuthorIds: string[] = [], followedOrgIds: string[] = [])` (:358). Inside `if (lane.includeFollowed)` (:369-372), after the user_id clause: `ids` = unique, `isUuid`-filtered `followedOrgIds`, `.slice(0, FOLLOWED_ORG_FILTER_CAP)`; if non-empty, `parts.push(`org_id.in.(${ids.join(",")})`)`.
  - A parameter, NOT a `FeedLane` field (C10). `FeedLane` (:296-318) and `feedLaneFor` (:334-349) stay unchanged.
  - `trending/hashtags/route.ts:92` and `campus-request.test.ts:197` need no edit.
- `postInFeedLane(post: {user_id?; org_id?: string|null; campus_id?; school_system?}, lane, followedAuthorIds, followedOrgIds: ReadonlySet<string> = EMPTY_SET)` (:384-401). The final return ORs in `(lane.includeFollowed && typeof post?.org_id === "string" && followedOrgIds.has(post.org_id))`.
- `scoreFeedRow(post: {...existing, org_id?: string|null}, nowMs, viewerFollowingIds, homeCampusId, followedOrgIds: ReadonlySet<string> = EMPTY_SET)` (:467-489). Replace :485 with `if (viewerFollowingIds.has(post.user_id) || (post.org_id != null && followedOrgIds.has(post.org_id))) score *= 1.6;` (one 1.6, never 2.56). Update the docblock (:424-464).
- NEW `export function feedDiversityKey(post: {user_id: string; org_id?: string|null}): string` → `post.org_id ? `org:${post.org_id}` : `user:${post.user_id}`` (C1).

**`src/app/api/feed/route.ts`**
1. The Promise.all (:153-162) gains `followedOrgsRes = loadViewerFollowedOrgIds(supabase, user.id)` (user client). `!ok` → `console.error("[feed followed-orgs]")` + 500 `{ok:false, error:"Request failed"}` (same rule as :178-181).
2. `const service = createSupabaseServiceClient()`. If there are followed ids:
   - `visible = await loadVisibleOrgCards(service, ids)`; `!ok` → 500.
   - `followedOrgIds = ids.filter(id => visible.byId.has(id))`, order kept.
   - `> FOLLOWED_ORG_FILTER_CAP` → `console.warn("[feed] followed orgs truncated", {count})`.
   - `followedOrgSet = new Set(followedOrgIds)`.
3. :210 → `feedLaneOrFilter(lane, Array.from(viewerFollowingIds), followedOrgIds)`.
4. **Posts select** (:218-221): REMOVE `org:orgs(id,handle,name,logo_url,verified,is_public)` and ADD `edited_at` after `created_at`. **Reposts select** (:251-255): REMOVE the nested org embed and ADD `edited_at` in the nested post columns. `PostRow` (:44-61) loses `org` and gains `edited_at?: string|null`. Nothing in the file embeds `orgs` under the user client afterwards (C2).
5. :294-296 → `postInFeedLane(p, lane, viewerFollowingIds, followedOrgSet)`.
6. **Attribution.** After `postRows`, collect `attrIds` = unique non-null `org_id`s. If any: `attribution = await loadVisibleOrgCards(service, attrIds)`; `!ok` → 500 (precedent `events/route.ts:290-306`). In `renderPost` (:345-374) replace :352 and :370-372 with `card = row.org_id ? attribution.byId.get(row.org_id) ?? null : null; org: card ? {...card, logo_url: orgAssetProxyUrl(card.handle, card.logo_url, "logo")} : null`. A hidden or unknown club gives `org:null`. Output keys stay `{id,handle,name,logo_url,verified,is_public}`; `hidden_at` is never sent.
7. :401 → `scoreFeedRow(entry.post, now, viewerFollowingIds, homeCampusId, followedOrgSet)`.
8. :417 (today `entry.post.org?.id ?? entry.post.user_id`) → `const key = feedDiversityKey(entry.post);`. Correct the comment at :409-412. Never key on `entry.post.org_id` alone: 21/21 live posts have a null `org_id`.
9. No new response field besides `post.edited_at`, which reaches clients through the `withPostMediaUrls(row)` spread.

Stated behaviour:
- A viewer with no verified university gets `{kind:"everything"}` (:341), so the club clause adds nothing, but following still boosts ranking.
- A blocked or muted officer's club posts stay out through :239-241.

**Acceptance**
- `node --test --experimental-strip-types src/lib/iu/community-scope.test.ts` passes with new tests:
  - the club clause appears only when `includeFollowed` (home lane yes; `laneFor("iu-bloomington", IU_INDY)` gives exactly `"campus_id.in.(iu-bloomington)"`)
  - `{kind:"everything"}` still gives null
  - the cap holds at 50
  - non-uuid or injection strings never reach the filter
  - an empty lane with empty ids is still `"id.is.null"`
  - the 2-argument call yields the same string as before
  - `postInFeedLane` admits a followed club's off-campus post in the home lane and rejects it in a browse lane
  - `scoreFeedRow` for a followed author posting as a followed club = 1.6× base
  - `feedDiversityKey` gives distinct keys for two personal posts by different users and the same key for one club's posts by two officers
- `npx tsc --noEmit` exits 0 with `trending/hashtags/route.ts` and `campus-request.test.ts` unedited. `grep -n "org:orgs" src/app/api/feed/route.ts` → nothing.
- Prod read-only, as Franky: `/api/feed?limit=50` → 200 with the same post ids as before the diff (0 club posts live); `feed[i].post.edited_at` is present (null); a page from several authors is not cut to 3.
- Branch/local (§11.2 seed):
  - a non-member whose home campus is NOT Indianapolis follows the SAE-copy club and sees its post with `org:{handle,name,logo_url}`; it's gone after unfollow
  - an Indianapolis viewer sees it via the campus rule either way
  - a hidden club's post shows `org:null` and never enters through a follow
  - forced `loadVisibleOrgCards` failure → 500

**Do not touch:** `trending/hashtags/route.ts`, `events/route.ts`, `campus-request.test.ts`.

---

### E1 · the post edit route: rate limit, server-derived tags, empty guard, mention notify once, `edited_at` in reads

**Owns:** `src/app/api/posts/[id]/route.ts`, `src/app/api/me/posts/route.ts`, `src/app/api/users/[handle]/posts/route.ts`, `src/lib/composer/helpers.ts`
**Depends on:** E0 (imports `src/lib/posts/edit.ts`); G1 applied.

**Contract**
- **`helpers.ts:81-94`:** `extractHashtags` becomes `return extractPostTags(text)` (import from `@/lib/posts/edit`). The signature is unchanged.
- **PATCH** (`posts/[id]/route.ts`, docblock :272-279, function :280), rewritten in this order:
  1. id check (400)
  2. `getUser` (401)
  3. `const rl = await rateLimit(`post-edit:${user.id}`, { limit: 30, windowSec: 600 }); if (!rl.allowed) return tooManyRequests(rl);` (the same order as `publish-post/route.ts:83-87`)
  4. `requireTermsAccepted`
  5. JSON parse (400 "Invalid JSON")
  6. Read `prior` with `const EDIT_COLS = "id,user_id,type,status,content,tags,media_url,media_thumbnail_url,created_at,edited_at"`. 500 on error; 404 "Post not found"; 403 "Not your post" (strings unchanged).
  7. If `"content" in body`: `c = checkPostEdit(body.content, !!prior.media_url)`. Failure → 400 `{ok:false, error:c.error}`. If `c.content !== prior.content`: `patch.content = c.content; patch.tags = extractPostTags(c.content)`. Any client-sent `tags` is IGNORED.
  8. Status logic unchanged (:338-350). Edit clients never send `status`.
  9. Empty patch → 200 `{ ok: true, post: withPostMediaUrls(prior) }` (fixes :352-354, which returned the raw R2 key).
  10. `.update(patch).eq("id", id).eq("user_id", user.id).select(EDIT_COLS).single()`; error → 500 "Request failed".
  11. Mentions:
      - `didPublish` → the existing fan-out (:372-393).
      - Else, if `prior.status === "published" && typeof patch.content === "string"`:
        - `handles = addedHandles(extractMentionHandles(prior.content ?? ""), extractMentionHandles(patch.content))`
        - `ids = await resolveMentionedUserIds(supabase, handles, user.id)`
        - If `ids` is non-empty AND `isSupabaseServiceConfigured()`: service read `notifications.select("user_id").eq("type","mention").eq("post_id", id).eq("actor_id", user.id).in("user_id", ids)`, then insert only the missing ids via `insertMentionNotifications` (kind "post").
        - Service client unconfigured or a read error → notify nobody.
      - try/catch everything and log `"[posts/:id PATCH mentions]"`.
  12. Respond `{ ok: true, post: withPostMediaUrls(row) }`.
  Docblock: edits caption text only; tags are re-derived server-side; "Edited" is stamped by the `posts_stamp_edited` trigger; newly added mentions notify once.
- **GET:** the post select (:75) adds `edited_at`. The author embed (`school`, onboarding critic C1) stays.
- **`me/posts/route.ts:38`** and **`users/[handle]/posts/route.ts:81`:** add `edited_at` to the select strings.

**Acceptance** (localhost against a branch/local DB; prod only by Franky)
- `npx tsc --noEmit` exits 0; eslint on the touched files not above baseline; `node --test --experimental-strip-types src/lib/posts/edit.test.ts` still passes.
- Own text post: PATCH `{content:"fixed #Hello @someone"}` → 200, `post.tags == ["hello"]`, `post.edited_at` non-null. The same content again → 200 with `edited_at` unchanged.
- PATCH `{content:"   "}` on a text post → 400 "Post needs text, an image, or a video"; on an image post → 200, tags [].
- 2001 characters → 400 "Post exceeds 2000 characters". Another user's post → 403 "Not your post". `{tags:["x"]}` alone → no change.
- The 31st PATCH in 10 min → 429 with Retry-After. Unsigned → 401. No consent → 403 `terms_required`.
- An added @handle inserts one mention notification; remove + re-add inserts none (read-only count by `post_id`/`actor_id`).
- A direct PostgREST `PATCH /rest/v1/posts?id=eq.<own>` with `{"created_at":"2030-01-01"}` using a user JWT → 401/403 permission denied (column lock from E0; branch/local only).
- GET `/api/posts/<id>`, `/api/me/posts`, `/api/users/<handle>/posts` include `edited_at`. Draft publish via PATCH `{status:"published"}` still fans out mentions.

**Do not touch:** DELETE in `posts/[id]/route.ts`, `publish-post/route.ts`, `posts/[id]/media/route.ts`.

---

### F6 · org page: Follow next to Join, invite banner, officer invite + policy fields, channels gate copy

**Owns:** `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/join-button.tsx`, `src/app/orgs/[handle]/admin-actions.tsx`, `src/app/orgs/[handle]/ChannelsSection.tsx`
**Depends on:** F5a (imports `OrgJoinControl`, `OrgInviteSheet`, `OrgInviteBanner`, `join-copy`); F1 (imports `loadFollowerCount`, `loadViewerFollow`); H1 (same files; re-anchor on top of H1's diff). F3 by URL (the invite sheet's default list).

(`channels/route.ts` is NOT owned here: H1 already made the service lookup + 403 `members_only`, and nothing else changes.)

**`page.tsx`** (not forked by viewport)
- Keep H1's `generateMetadata` hidden rule, hidden gate and `loadViewerOrgContext` / `orgJoinState` wiring.
- **`OrgProfile` type** (:39-54): stop using `is_public`. Add `join_policy`, `audience`, `hidden: boolean`, `campus_id`, `member_count: number|null`, `follower_count: number|null`.
- **Member count** (:96-99, :127): `{count, error}`; error → null (C27).
- **Follower count:** `await loadFollowerCount(service, org.id)` (null on error).
- **Viewer follow** (signed in, in parallel with `ctx`): `loadViewerFollow(service, org.id, user.id)`. `following = !!ctx.role || (res.ok && res.row !== null)`; a failed read renders Follow (POST is idempotent).
- **Inviter name:** exactly as `src/app/api/orgs/[slug]/route.ts:270-283` (`visibleInviterFirstName` + `loadHiddenUsers`; a failed hidden read → null).
- `displayState = user ? decision.state : "signed_out"`. If `user && !ctx.ok`, render `<LoadFailed tone="dark" failure={{message:"Couldn't load your membership. Try again."}} />` in the header slot and pass `relation={null}` to ChannelsSection.
- `relation: OrgRelation = {handle, orgName: name, state: displayState, following, role: ctx.role, reason: decision.reason ?? null, audience, joinPolicy: join_policy}`.
- **Admin bar** (:197-204): render when `isSettingsOfficer(role)` (`join-state.ts:236`). New props: `orgName, joinPolicy, audience, hidden, openToCampus: {name, shared}|null` (via `campusRowById(org.campus_id)` + `isSharedCampus` from `@/lib/iu/campuses`).
- **Header slot** (:207-215): `<OrgProfileJoinButton relation={relation} pendingInviteId={ctx.pendingInvite?.id ?? null} />`.
- **Chips** (:455-461): VerifiedBadge; `policyChip(join_policy)` with the lock icon for 'By request' and 'Invite only'; `audienceChip`; 'Hidden' when `org.hidden`; 'Invited you' when state is invited; 'Dormant' unchanged.
- **Handle line** (:486-488): '@{handle}', then `followerCountText(follower_count)`, then `memberCountText(member_count)`, with ' · ' only between parts that are present. The floor applies to every viewer here; officers see the exact number in CH3's Followers tab.
- **Invite banner:** above the description when state is invited: `<OrgInviteBanner orgName inviterFirstName={invitedByName} expiresAt={ctx.pendingInvite.expires_at} />`.
- **Notice** (:220; `PrivateOrgNotice` :587-634, renamed `JoinPolicyNotice`): text = `joinPolicyNotice({state, joinPolicy, audience, orgName, hidden})`; render nothing on null. Keep the lock glyph; drop the bold 'This community is private.' lead.
- **ChannelsSection** (:246-249): props `{orgHandle, relation}`.
- **FactsSection** (:828-845), rows in order:
  1. 'Followers' = String(n), omitted when `followerCountText` is null
  2. 'Members', omitted when null
  3. 'Who can join' = `whoCanJoinFact`
  4. 'Open to' = `openToFact`
  5. 'Status' (unchanged)
  6. 'Last activity' (unchanged)
  'Visibility' is removed.

**`join-button.tsx`:** replace H1's component. `export function OrgProfileJoinButton({ relation, pendingInviteId })` renders `<OrgJoinControl variant="header" source="profile" relation pendingInviteId onChange={() => router.refresh()} />` (`useRouter` from `next/navigation`).

**`ChannelsSection.tsx`:** props `{ orgHandle: string; relation: OrgRelation | null }`.
- `relation` null → `<LoadFailed tone="dark" failure={{message:"Couldn't load this org's channels."}} onRetry={router.refresh} />`, NO fetch.
- `relation.state !== "member"` → NO fetch. Render the card with `channelsGateCopy(relation).line` and, when `inline` is non-null, `<OrgJoinControl variant="header" axis="membership" source="profile" relation onChange={router.refresh} />`.
- Member → today's fetch, groups and '+ Join all public'.

**`admin-actions.tsx`** (`OrgProfileAdminBar` :50-146)
- Props add `orgName, joinPolicy, audience, hidden, openToCampus`.
- Eyebrow (:98) 'Owner / admin tools' → 'Officer tools'; hidden → 'Hidden org'.
- Buttons (:65-70):
  - not hidden → ['Invite people' (person-plus icon, FIRST), 'Banner', 'Logo', 'Edit details', 'New post']
  - hidden → ['Edit details'] only
- 'Invite people' opens `<OrgInviteSheet handle orgName audience presentation={window.matchMedia('(max-width: 720px)').matches ? 'sheet' : 'modal'} onClose />`. Owner/admin only; the bar already renders for those roles only.
- `EditDetailsModal` (:148-245):
  - add Field 'Who can join' (`WHO_CAN_JOIN_OPTIONS`, segmented, label + sub)
  - add Field 'Open to' (`openToOptions(openToCampus)`) with `AUDIENCE_HELP` under it
  - `OFFICER_FOLLOW_HELP` under both
  - both fields hidden when the org is hidden
- PATCH body (:172-180) adds `join_policy` / `audience` ONLY when changed. A non-ok response shows the server `error` in the existing ErrorBanner.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint not above baseline. `grep -n "is_public\|isPublic" 'src/app/orgs/[handle]/'*.tsx` → at most `generateMetadata`'s description fallback.
- `/orgs/sae` as a signed-in non-member (prod, read-only):
  - 'Follow' + disabled 'Invite only' (sub 'Officers invite members')
  - 'Officers can see who follows this club.'
  - notice 'Invite only. Anyone can follow this club — officers add members.'
  - Channels card 'Chats are for members. Officers invite members.'
  - no request to `/api/orgs/sae/channels`
  - handle line '@sae · 1 member' (no follower count)
  - Facts: 'Who can join: By invitation', 'Open to: Anyone', no 'Followers' row
- Signed out: 'Sign in to follow' → `/auth/login?next=%2Forgs%2Fsae`. `curl` of `/orgs/test-f7ae4129` → 404.
- As SAE's owner (Franky; read-only walk, no saves):
  - eyebrow 'Officer tools', first button 'Invite people'
  - the sheet opens as a bottom sheet at 375px and a modal at 1280px, on the Followers list (empty today)
  - Edit details shows 'Invite only' selected and 'All of Indianapolis (IU + Purdue)'
  - editing only the description (not saved) builds a body with no `join_policy`/`audience` (check via a non-GET blocker)
- Page-level states that need data (`invited`, `can_join`, `member`) are verified on localhost against the §11.2 branch seed at 375×812 and 1280px:
  - invited: banner, 'Invited by …', 'Accept invite' + 'Decline', chip 'Invited you'
  - can_join: Follow + Join, channels inline Join
  - member: 'Following ✓' disabled + 'Members follow automatically' + 'Joined ✓'
- Network log: the follow POST body is exactly `{"source":"profile"}`, and no label changes before the response.

**Do not touch:** `OrgEventsSection.tsx`, `channels/route.ts`, `globals.css`.

---

## 8. Wave 3: phone edit sheet, onboarding social pieces, desktop campus home, tour/people, settings

Push only after gate G2.

### E2 · `EditPostSheet` + Edit in the phone post viewer

**Owns:** `src/components/mobile/EditPostSheet.tsx` (new), `src/components/mobile/PostViewerMobile.tsx`
**Depends on:** E0 (imports `EditedPost`, `editedPostFrom` from `@/lib/posts/edit`); E1 live (PATCH by URL).

**NEW `src/components/mobile/EditPostSheet.tsx`** (`"use client"`)

Signature: `export function EditPostSheet({ postId, initialContent, hasMedia, nested = false, onClose, onSaved }: { postId: string; initialContent: string; hasMedia: boolean; nested?: boolean; onClose: () => void; onSaved: (p: EditedPost) => void })`.

Structure:
- vaul `<Drawer.Root open nested={nested} dismissible={!dirty && !saving} onOpenChange={(o)=>{ if(!o) onClose(); }}>`. Overlay zIndex 10400, Content zIndex 10401, maxHeight "85dvh", cream #FAF7F2, rounded top 20, safe-area bottom padding. Layering and nesting follow `SharePostSheet.tsx:61-62`, `:196-243`.
- `Drawer.Content` gets `onClick={(e)=>e.stopPropagation()}` and `onPointerDown={(e)=>e.stopPropagation()}`. The host cards are `<button onClick>` (`CampusMobile.tsx:974-976`, `ProfileMobile.tsx:2268-2270`), and React bubbles through portals.
- Top row: left "Cancel"; centered `<Drawer.Title>` "Edit post" (Fraunces 800 16px); right "Save" (coral #FF5C35, 800). Save is disabled when unchanged, invalid or saving; it reads "Saving…" while saving.

Textarea:
- autoFocus, fontSize 16 (prevents iOS zoom), minHeight 160, `value={draft}`, `onChange={e=>setDraft(e.target.value.slice(0, 2000))}`.
- placeholder: `hasMedia ? "Write a caption…" : "Say something…"`.
- `bindMentionPicker(ta)` on mount (`src/lib/composer/helpers.ts:101`).
- Counter `{draft.length}/2000` (format of `PostComposerMobile.tsx:506`).
- `hasMedia` → note "You can change the words. The photo or video stays."
- `!hasMedia && draft.trim()===""` → hint "Your post can't be empty."
- `dirty = draft.trim() !== initialContent.trim()`.
- Cancel while dirty → `window.confirm("Discard your changes?")`.

Save:
- `const r = await vibeRequest<{ post?: unknown }>(`/api/posts/${postId}`, { method: "PATCH", json: { content: draft }, failure: "Couldn't save your changes." })`.
- ok with `editedPostFrom(r.data.post)` non-null → `onSaved(p); toast({ message: "Post updated", tone: "info" }); onClose();`
- Failure → keep the sheet and draft and re-enable Save (vibeRequest already toasted; 403 `terms_required` carries the Review Terms action).

**`PostViewerMobile.tsx`**
- `PostDetail` (:47-60): add `edited_at?: string | null;`.
- Props (:93-110): add `onEdited?: (p: EditedPost) => void;` (the caller patches its own list in place).
- State next to :137-138: `const [editOpen, setEditOpen] = useState(false);`.
- Owner menu block (:636-645): insert BEFORE Delete `<ViewerMenuItem label="Edit post" disabled={!post} onClick={() => { setMenuOpen(false); setEditOpen(true); }} />`. Non-owners keep Report (:614).
- Header sub-line (:525): append `${post?.edited_at ? " · Edited" : ""}` after relTime.
- Next to the SharePostSheet mount (:952): `{editOpen && post ? <EditPostSheet nested postId={postId} initialContent={post.content ?? ""} hasMedia={!!post.media_url} onClose={() => setEditOpen(false)} onSaved={(p) => { setPost(prev => prev ? { ...prev, content: p.content, tags: p.tags, edited_at: p.edited_at } : prev); onEdited?.(p); }} /> : null}`.
- `src/app/posts/[id]/PostPageClient.tsx` needs no change.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint not above baseline.
- 375×812, `/posts/<id>` with in-page overrides only (no prod PATCH):
  - own post: ⋯ shows Send to chats, Copy link, Edit post, Delete post
  - someone else's post: Report, no Edit
- Edit opens "Edit post" above the viewer. Save stays disabled until the text changes. A PATCH override returning 200 with `{post:{id, content, tags:["x"], edited_at:"<iso>"}}` updates the body and #chips in place, adds " · Edited" and toasts "Post updated".
- A text-only post cleared to spaces → Save disabled + "Your post can't be empty.". An image post shows the note.
- A PATCH override returning 403 `{ok:false,code:"terms_required"}` → the toast "Accept the Terms first, then try again." and the sheet stays open with the draft.
- Swipe-down or overlay tap does nothing while dirty; Cancel asks "Discard your changes?".
- iOS Safari (Franky's phone test): closing the sheet leaves the viewer full-screen with no jump behind it; textarea focus doesn't zoom.

**Do not touch:** `SharePostSheet.tsx`, `PostPageClient.tsx`, `CampusMobile.tsx`, `ProfileMobile.tsx` (CM and PM wire `onEdited` in W4).

---

### B12S · onboarding social pieces: copy table, theme, pure helpers, clubs step, people step

**Owns (all new):** `src/lib/onboarding/social-steps.ts`, `src/lib/onboarding/social-steps.test.ts`, `src/components/mobile/onboarding/onb-copy.ts`, `src/components/mobile/onboarding/onb-theme.ts`, `src/components/mobile/onboarding/StepClubs.tsx` (contains `OrgPickRow`), `src/components/mobile/onboarding/StepPeople.tsx` (contains `PersonPickRow`)
**Depends on:** F5a (imports `OrgJoinControl`, `orgRowView`, `inviteSubText`, `ORG_COPY`, types); F1 + F2 live (G2).

**Allowed imports:**
- `@/lib/feedback/request` (`vibeRequest`, `copyText`)
- `@/lib/feedback/toast`
- `@/components/feedback/LoadFailed`
- `@/lib/iu/campuses` (`campusRowById`, `SYSTEM_LABEL`, `type SchoolSystem`)
- `@/lib/orgs/join-copy`
- `@/components/orgs/OrgJoinControl`
- type-only `@/lib/orgs/join-state`

Must NOT import NetworkMobile, CampusMobile or OnboardingMobile.

**1) `onb-copy.ts`**

`export const ONB_COPY = Object.freeze({...})` (nested, plain strings) and `export function fillCampus(t: string, campus: string | null, fallback: string): string` (replaces `{campus}`; returns `fallback` when campus is null). Strings are verbatim; curly quotes are part of them.

- **header:** back "Back", progress "{n} of 6", skip "Skip", replay "REPLAY MODE".
- **hello:**
  - intro: moved verbatim from `OnboardingMobile.tsx:766`
  - note "about two minutes: your campus, your profile, a photo, then your people"
  - cta "Let's go →"
- **campus:**
  - title "which campus is yours?"
  - ottoIu "“your school email says IU. pick your campus. Indianapolis is shared with Purdue students.”"
  - ottoPurdue "“your school email says Purdue. pick your campus. Indianapolis is shared with IU students.”"
  - note "Your school email shows you're at {system}. You can move to another {system} campus later in Settings."
  - fromEmailTag "from your school email"; notOpen "not open yet"
  - required "Pick your campus to continue."; invalid "Pick one of your university's campuses."
  - purdueLink "Purdue student with an IU email? Verify your @purdue.edu instead"
  - switchLabel "Your @purdue.edu email"; switchPlaceholder "you@purdue.edu"
  - switchSend "Send code"; switchSending "Sending…"; switchWrongDomain "Use your @purdue.edu address."; switchSent "Check your school inbox."
  - switchCodeLabel "8-digit code"; switchVerify "Verify"; switchVerifying "Verifying…"
  - switchDone "You're verified as a Purdue student."; switchCancel "Never mind"
  - continue "Continue →"; saving "Saving…"
- **profile:**
  - title "let's pin down your profile"
  - sub "“same fields as your Vibe profile. name and handle are the must-haves. a photo is next.”"
  - labels: name "Name (required)", handle "Handle (required)", bio "Bio (optional)", major "Major (optional)", department "Department / school (optional)", year "Year (optional)", interests "Interests & projects (optional)", skills "Skills (optional)", lookingFor "What are you here for? (optional)"
  - majorHintList "From the {label} list, or type your own"; majorHintFree "Type your major"
  - handleChecking "checking…"; handleAvailable "✓ available"; handleTaken "✗ taken"; handleReason "✗ {reason}"; handleFormat "✗ 3–20 letters, numbers or _"; handleUnchecked "couldn't check. we'll check when you continue"
  - errors: nameRequired "Add your name. It's how people recognize you.", handleRequired "Pick a handle so friends can find you.", handleInvalid "3–20 letters, numbers or _.", handleTaken "That handle is taken. Try another.", handleReserved "That handle is reserved."
  - changeLater "you can change anything later"; continue "Continue →"; saving "Saving…"
- **photo:**
  - title "put a face to the name"
  - otto "“people follow faces. add a photo so classmates know it's you. swap it any time.”"
  - choose "Choose a photo"; skip "Skip for now"; uploading "Uploading…"; change "Change photo"; continue "Continue →"
  - Errors come from `PHOTO_ERROR_COPY` in `avatar-upload.ts:26`; don't duplicate them.
- **clubs** (button, chip, meta and disclosure strings come from F5a `ORG_COPY`, not from here):
  - title "Follow clubs" (Q10); sub "Their posts show up in your feed. You can join the ones that let you."
  - search "Search clubs by name"
  - sparse "Clubs are just getting started at {campus}. Follow the ones you like — posts land in your feed."; sparseNoCampus "Clubs are just getting started here. Follow the ones you like — posts land in your feed."
  - emptyTitle "no clubs here yet"; emptyBody "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone at {campus}.”" (Q11)
  - loadFailed "Couldn't load clubs."; continue "Continue →"; skipForNow "Skip for now"
- **people:**
  - title "follow a few people"
  - ottoShared "“students at {campus}, IU and Purdue both. follow a few and their posts rise to the top of your feed.”"
  - ottoSingle "“students at {campus}. follow a few and their posts rise to the top of your feed.”"
  - ottoNoCampus "“students on vibe. follow a few and their posts rise to the top of your feed.”"
  - groupClubs "From your clubs"; groupCampus "At {campus}"; groupCampusFallback "On your campus"; groupMajor "Same major"; groupSystem "Elsewhere at {system}"; groupMore "More people on Vibe"
  - follow "Follow"; following "Following ✓"
  - sparse "“it's early here. only a few people have joined so far. bring a friend and you'll have someone to follow.”"
  - emptyTitle "no one to follow yet"; emptyBody "“you're one of the first at {campus}. share vibe with a friend and they'll show up here.”"; emptyBodyNoCampus "“you're one of the first here. share vibe with a friend and they'll show up here.”"
  - share "Share Vibe"; copied "Link copied."
  - loadFailed "Couldn't load people."; followFailed "Couldn't follow this person."; unfollowFailed "Couldn't unfollow this person."
  - finish "Finish →"; finishing "Saving…"; finishFailed "Couldn't finish setting up."
- **skip:**
  - title "Skip the rest?"
  - bodySaved "Everything you've added so far is saved. You can finish your profile any time from your profile page."
  - bodyIdentity "Add a name and handle first. It's how people find you."
  - keepGoing "Keep going"; skipAnyway "Skip anyway"; skipping "Skipping…"; saveAndSkip "Save & skip"; saving "Saving…"; failed "Couldn't skip onboarding."

**2) `onb-theme.ts`:** move `COLORS` verbatim from `OnboardingMobile.tsx:62-76` (copy; B12 deletes the original in W4), plus the style constants from OM:1523-1851 (`stepSectionStyle`, `h2Style`, `subIntroStyle`, `formStyle`, `labelStyle`, `hintBelowStyle`, `inputStyle`, `textareaStyle`, `fieldErrorStyle`, `primaryCtaStyle`, `secondaryLinkStyle`). CSSProperties objects only, no React.

**3) `social-steps.ts`** (pure, client-safe, no fetch; runtime imports only `@/lib/iu/campuses`)
```ts
export type ClubRowInput = { id: string; handle: string; name: string; logo_url: string | null; verified?: boolean; join_policy: "open"|"request"|"invite"; audience: "both"|"iu"|"purdue"; join_state: JoinState; join_reason: "policy"|"visiting"|null; role: OrgRole | null; pending_invite: { id: string; expires_at: string; invited_by_name: string | null } | null; org_follow_state?: "following"|"not_following" };
export function parseClubRows(raw: unknown): ClubRowInput[];            // drops rows missing id/handle/name
export function isFollowingOrg(r: ClubRowInput): boolean;              // org_follow_state==="following" || role != null || join_state==="member"
export function clubBand(r: ClubRowInput): 0|1|2|3|4;                  // invited 0; member or following 4; open 1; request 2; invite 3
export function orderClubRows(rows: ClubRowInput[]): ClubRowInput[];   // stable sort by band; the caller orders ONCE on load
export type ClubLocal = { state?: OrgDisplayState; following?: boolean; role?: OrgRole | null };
export function relationFor(r: ClubRowInput, local: ClubLocal | undefined): OrgRelation; // {handle, orgName:name, state: local.state ?? join_state, following: local.following ?? isFollowingOrg(r), role: local.role ?? role, reason: join_reason, audience, joinPolicy: join_policy}; following forced true when state is member
export function anyClubFollowed(rows: ClubRowInput[], local: Record<string, ClubLocal>): boolean;
export type SuggestionInput = { id: string; name: string | null; handle: string | null; avatar_url: string | null; major: string | null; campus_id?: string | null; school_system?: "iu"|"purdue"|null; reason_v2?: string };
export function parseSuggestions(raw: unknown): SuggestionInput[];
export type PeopleGroup = { key: "clubs"|"campus"|"major"|"system"|"more"; label: string; people: SuggestionInput[] };
export function groupPeople(list: SuggestionInput[], o: { system: "iu"|"purdue"|null; campusShortName: string | null }): PeopleGroup[];
export function listState(n: number): "empty"|"sparse"|"full"; // 0 / 1-2 / >=3
```
`OrgDisplayState` and `OrgRelation` are type-only imports from `@/lib/orgs/join-copy`.

`groupPeople` maps `reason_v2`:
- `from_your_clubs` → clubs
- `same_campus` → campus: label "At {campus}", where campus = `o.campusShortName ?? campusRowById(first.campus_id)?.shortName`; if neither exists, "On your campus"
- `same_major` → major
- `same_system` → system: label "Elsewhere at " + `SYSTEM_LABEL[o.system ?? first.school_system]`; if both are null, the row goes to the "More people on Vibe" bucket
- anything else → more

Group order: clubs, campus, major, system, more. Server order is kept within a group; empty groups are dropped.

**4) `StepClubs.tsx`**

Exports:
- `export type ClubsState = { status: "idle"|"loading"|"ready"|"failed"; rows: ClubRowInput[]; failure: LoadFailure | null; local: Record<string, ClubLocal> }`
- `export const initialClubsState`
- `export function StepClubs(p: { replay: boolean; campusShortName: string | null; state: ClubsState; setState: React.Dispatch<React.SetStateAction<ClubsState>> })`

The parent (B12) owns the state and resets it when the saved campus changes.

Load (when idle): `vibeRequest<{orgs?: unknown}>("/api/orgs?filter=discover", {cache:"no-store", quiet:true, failure: ONB_COPY.clubs.loadFailed})`.
- ok → ready with `orderClubRows(parseClubRows(orgs))`
- fail → failed with `asLoadFailure`
- Retry sets idle. Replay loads too (reads are allowed).

Render:
- h2 title and sub
- loading: 3 skeleton rows
- failed: `<LoadFailed failure onRetry>`, NEVER the empty state
- ready with 0 rows: emptyTitle + emptyBody (`fillCampus`)
- `listState` sparse: the sparse line above the rows
- more than 8 rows: a client-side name/handle search input. Never send `q` (discover's `q` widens to the whole university, `api/orgs/route.ts:326-330`).

`OrgPickRow`:
- `rel = relationFor(row, local[row.id])`, `view = orgRowView(rel, "onboarding")`
- 40px round logo (first letter when null), name (one line, ellipsis) + verified ✓, `view.chip` pill
- meta line `["@"+handle, ...view.meta].join(" · ")` (no counts)
- sub line: `view.sub` ?? (state invited ? `inviteSubText(first name of pending_invite.invited_by_name, pending_invite.expires_at)` : null)
- `view.disclosure` at 12px muted
- controls: `<OrgJoinControl variant="onboarding" source="onboarding" replay={replay} relation={rel} pendingInviteId={row.pending_invite?.id ?? null} onChange={(n) => setState(s => ({...s, local: {...s.local, [row.id]: {state: n.state, following: n.following, role: n.role}}}))} />`. The `line` layout puts the two pills on a full-width row under the text.
- The row body is NOT a link.

**5) `StepPeople.tsx`**

Exports:
- `export type PeopleState = { status: "idle"|"loading"|"ready"|"failed"; people: SuggestionInput[]; failure: LoadFailure | null; followed: Record<string, boolean>; busy: Record<string, boolean>; removed: Record<string, boolean> }`
- `initialPeopleState`
- `export function StepPeople(p: { replay: boolean; campusShortName: string | null; campusShared: boolean; system: SchoolSystem | null; state: PeopleState; setState })`

Behaviour:
- **Load:** `vibeRequest("/api/me/suggested-connections?limit=25", {cache:"no-store", quiet:true, failure: people.loadFailed})`, cached in the parent.
- **Otto line:** campusShortName null → `ottoNoCampus`; `campusShared` → `ottoShared`; else `ottoSingle`.
- **Groups:** a section header per group. `PersonPickRow`: 40px avatar, name (fallback "@handle"), meta "@handle · major", Follow / Following ✓ (`aria-pressed`).
- **Toggle:** optimistic, then `vibeRequest("/api/me/follow", {method: was ? "DELETE" : "POST", json:{target_id:id}, quiet:true, failure: …})`.
  - failure → roll back
  - 403 (block) → `removed[id]=true`, no toast
  - other failures → toast `r.message` with action
  - replay → local only
- **List states:** failed → LoadFailed + Retry; empty → emptyTitle + emptyBody + [Share Vibe]; sparse → sparse Otto line + [Share Vibe] above the rows. No "Follow all".
- **Share:** `navigator.share?.({ title: "Vibe", url: window.location.origin })`; AbortError → silent; a missing API or other error → `copyText(window.location.origin, {success: people.copied})`.
- The Finish button is NOT rendered here (B12's footer owns it).

**Acceptance**
- `npx tsc --noEmit` exits 0 (the new files compile; nothing imports them yet). eslint on all six files: 0 problems.
- `node --test --experimental-strip-types src/lib/onboarding/social-steps.test.ts` passes (resolver from `src/lib/onboarding/finish.test.ts:17-45`), covering:
  - (a) an SAE-shaped row `{join_policy:invite, join_state:invite_only, verified:true}` → `relationFor` following false, band 3
  - (b) the same row with `org_follow_state:"following"` → following true, band 4
  - (c) member → band 4, following forced true
  - (d) invited → band 0
  - (e) `orderClubRows` is stable: invited < open < request < invite < following
  - (f) `anyClubFollowed` counts `local.following` and members
  - (g) `groupPeople` maps all six `reason_v2` values, labels "At Indianapolis" and "Elsewhere at Purdue", and drops empty groups
  - (h) `listState(0/2/3)`
  - (i) `fillCampus` falls back on null
- `rg -n "NetworkMobile|CampusMobile|OnboardingMobile" src/components/mobile/onboarding src/lib/onboarding/social-steps.ts` → comments only.
- A reviewer diffs every `onb-copy.ts` string against this contract.

**Do not touch:** `OnboardingMobile.tsx`, `draft.ts`, F5a's files.

---

### CH1 · desktop campus home: campus identity, labels, halos, tour, feed Edit post

**Owns:** `src/app/campus/campus-home.tsx`, `src/app/campus/page.tsx`
**Depends on:** H1 (same file; keep `discoverJoinLabel` intact for CH2); E0 (imports `EditedPost`, `editedPostFrom`); E1 + F4 live (PATCH by URL; `edited_at` in feed rows).
**Scope limit:** CH1 does NOT touch OrgsTabBody join logic, DiscoverCard/QuickView controls, CreateOrgModal or OrgSettingsModal (CH2/CH3).

1. **Viewer campus hook.** Add an exported `useViewerCampus()` next to `CampusBanner` (:3325):
   - fetches `GET /api/campuses` once per page (module-level promise cache, credentials include)
   - returns `{system, campusId, campus: Campus|null (campusRowById), label: string|null}` with `label = campus.name` ('Indianapolis', 'IU Bloomington', 'Purdue West Lafayette'); never 'IUI', 'PUI' or 'Jaguars'
   - failure or null → label null; never fall back to 'IU'
2. **`SCHOOL` constant (:293-296):** delete it. `CampusBanner` (:3325-3450) renders from `useViewerCampus`:
   - title = `label ?? 'Vibe'`
   - monogram = initials of `campus.shortName` (one word → first two letters 'IN'; several words → initials)
   - background (:3396-3398), per Q15: IU crimson only when `campus.systems` is `['iu']`; neutral Vibe ink for shared or no campus; black/gold for Purdue-only
   - shared campus: sub-label 'IU + Purdue · one community'
   - `CampusBanner` is also rendered on the phone by `CampusMobile.tsx:426` (`compactSearch`): keep the compact layout at 375px, ellipsize long names, and keep the export signature stable
3. **Stats line** (:3337-3383, :3446-3449):
   - read `campusUsers` / `campusActiveNow` from `/api/stats/campus`: '{n} at {label}' · '{m} active now'
   - `campusUsers` null → '{totalUsers} on Vibe'
   - read error → render nothing (no endless 'loading…')
4. **Campus-less strip** (onboarding critic A8): when `system` is non-null and `campusId` is null, show a slim strip under `CampusBanner` in `CampusHome` (:681), not inside `CampusBanner`. Copy 'Pick your campus to see its clubs, events and map.' plus link 'Pick campus →' → `/settings#campus`.
5. **Labels:**
   - eyebrows :4523 'Feed · IU', :7028 'Events · IU', :8255 'Organizations · IU', :9784 'Campus · IU', :13517 'Campus · IU' → '{Tab} · {label}' (or '{Tab}' when label is null)
   - :8257 → 'Browse clubs and orgs at {label}.' (or 'Browse clubs and orgs.')
   - :8375 → 'Officially recognized clubs at {label}.'
   - :13590-13591 → 'Browse clubs and orgs at {label}.'
   - :9847 map empty → 'The map groups people by major at your campus. Pick yours in Settings.'
6. **Map halos** (onboarding critic C8):
   - import `PURDUE_INDIANAPOLIS_SCHOOLS` (`majors-purdue-indianapolis.ts:35`) and `schoolForMajorIn` (`majors.ts:387`); in-file `const HALO_SCHOOLS = [...IU_SCHOOLS, ...PURDUE_INDIANAPOLIS_SCHOOLS]`
   - `schoolForMajor(m.name)` → `schoolForMajorIn(data.campus_id ?? null, null, m.name)` at :9518, :10056, :10536
   - `IU_SCHOOLS.filter/map/find` → `HALO_SCHOOLS` at :9525, :10304, :10349
   - `MapSummary` (:9394-9404) gains `campus_id?: string|null`
7. **Desktop tour** (:381-455):
   - :423 body → 'What students at {label ?? "your campus"} are posting. People and clubs you follow rise to the top.'
   - :427 endLabel 'Take me to network →' → 'Got it'
   - onDone (:437-445) sets seenKey, removes `vibe_tour_pending`, strips `welcome`, and does NOT navigate to `/network?welcome=1`
8. **`page.tsx:7`** description → 'Your campus on Vibe: clubs, events, people and the map.'
9. **Feed Edit post** (founder decision, desktop feed):
   - `FeedPost` (:4310-4344) gains `edited_at?: string | null`.
   - `FeedTabBody` (:4377): `const applyPostEdit = useCallback((p: EditedPost) => setEntries(prev => prev ? prev.map(e => e.post.id === p.id ? { ...e, post: { ...e.post, content: p.content, tags: p.tags, edited_at: p.edited_at } } : e) : prev), []);`. The `FeedRow` mount (:4608-4615) adds `onEdited={applyPostEdit}`.
   - `FeedRow` (:5136): new prop `onEdited`. State next to :5203: `editing`, `editDraft`, `savingEdit`.
   - Inside `{viewerOwnsPost ? (` (:5474), BEFORE Delete: a menuitem button "Edit post" (`feedRowMenuItemStyle()` + the same hover handlers). onClick: `setShowMoreMenu(false); setEditDraft(post.content ?? ""); setEditing(true);`.
   - Content block (:5640-5662) → `{editing ? <editor/> : post.content ? <p…/> : null}`. The editor:
     - textarea: autoFocus, maxLength 2000, DM Sans 15, 1px rgba(28,28,30,0.12) border, radius 12, padding "10px 12px", auto-grow; `bindMentionPicker` (imported at :20-24)
     - left: counter `{n}/2000` + "You can change the words. The photo or video stays." (media) or "Your post can't be empty." (no media and empty)
     - right: "Cancel" (ghost) and "Save" (#1C1C1E, white; "Saving…"; disabled when unchanged, invalid or saving)
     - Escape cancels (confirm "Discard your changes?" when dirty); Cmd/Ctrl+Enter saves
   - Save: `vibeRequest<{ post?: unknown }>(`/api/posts/${post.id}`, { method: "PATCH", json: { content: editDraft }, failure: "Couldn't save your changes." })`.
     - ok + `editedPostFrom` → `onEdited(p); setEditing(false); toast({ message: "Post updated", tone: "info" })`
     - otherwise the editor stays open
   - Timestamp (:5624): after `relativeTime(post.created_at)` add `{post.edited_at ? <span title={`Edited ${new Date(post.edited_at).toLocaleString()}`}> · Edited</span> : null}`.
   - Reposts: Edit targets the original only when the viewer owns it; a repost quote isn't editable. Never send `tags` or `status`.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint campus-home ≤ 8, `campus/page.tsx` 0.
- `rg -n "SCHOOL\.|const SCHOOL =|· IU\b|at IU\b|IU wedge|Nothing here is verified|Take me to network|network\?welcome=1" src/app/campus` → 0.
- `rg -n "schoolForMajor\(|IU_SCHOOLS\.(filter|map|find)" src/app/campus/campus-home.tsx` → 0.
- `rg -n "filter=mine" src/app/campus/campus-home.tsx` → exactly :465 and :6997, unchanged.
- 1280px (signed in):
  - banner and eyebrows read 'Indianapolis' with the neutral colour; map halos render
  - `/api/campuses` override `{system:'iu', currentCampusId:null}` → the 'Pick your campus' strip
  - `/api/campuses` 500 override → banner 'Vibe', no '· IU' anywhere
- 375×812 `/campus` on phone: the shared `CampusBanner` fits and ellipsizes.
- Feed edit, with in-page PATCH overrides only (ok / 400 / 429 / 500):
  - the editor opens; Save updates text, #tags and " · Edited" without a refetch
  - an error keeps the editor open
  - Escape on unchanged text closes silently
  - others' rows show Report and no Edit
- Tour replay (remove `localStorage vibe_campus_tour_seen_v1`, `?welcome=1`) ends on /campus with 'Got it' and no redirect.

---

### B14t · phone tour copy + end, People suggestion groups, the campus confirm banner component

**Owns:** `src/components/mobile/use-mobile-tour.ts`, `src/components/mobile/NetworkMobile.tsx`, `src/components/mobile/CampusConfirmBanner.tsx` (new)
**Depends on:** nothing. `CampusMobile.tsx` is NOT touched here; CM mounts the banner and changes the events empty line in W4.

**`use-mobile-tour.ts`**
- `CAMPUS_STEPS` (:87-104) becomes:
  1. `{selector "#otto-mobile-tour-tabs", title "Everything's one swipe away.", body "Feed, Events, Orgs, Chat, and the Map. Swipe or tap to switch."}`
  2. `{selector "#otto-mobile-tour-feed", title "The campus feed.", body "What students at {campus} are posting. People and clubs you follow rise to the top."}`; fallback body "What students on your campus are posting. People and clubs you follow rise to the top."
  3. `{selector "#otto-mobile-tour-compose", title "Your turn.", body "Tap + to post text, photos, or video.", endLabel "Got it"}`
- `HANDOFFS.campus` (:129) → `{next:null, dest:null}`. The profile and network legs are unchanged.
- Start condition (:177-183):
  - read pending and seen in try/catch (storage failure → pending=null, seen=false)
  - `welcome = new URLSearchParams(location.search).get("welcome") === "1"`
  - start when `pending === leg || (leg === "campus" && welcome && seen !== "1")`
  - campus leg with welcome, seen "1" and no pending → `stripWelcomeParam()` and return
- Campus name (campus leg only), after the script loads and before `OttoTour.start`:
  - `fetch("/api/me/onboarding-state", {cache:"no-store", credentials:"same-origin", signal})` with a 1500ms timeout
  - `campus = campusRowById(j?.campus_id)?.shortName ?? null`
  - any failure → fallback body. Never read the name from the URL.

**`NetworkMobile.tsx`**
- `ListUser` (:29-43) gains `reason_v2?: "from_your_clubs"|"same_campus"|"same_major"|"same_system"|"mutuals"|"new_on_vibe"; campus_id?: string|null; school_system?: "iu"|"purdue"|null`.
- `SuggestionCategory` (:937) = `"org"|"campus"|"major"|"mutuals"|"system"|"new"`.
- `categorizeSuggestion` (:939-945):
  - with `reason_v2`: from_your_clubs → org, same_campus → campus, same_major → major, same_system → system, mutuals → mutuals, new_on_vibe → new
  - without: the legacy logic, with the literal "same school" → campus (kept for one release)
- `SUGGESTION_GROUP_ORDER` (:620-631), in order, computed per render:
  1. org "From your clubs" / "Members of orgs you're already in"
  2. campus "At {campus}" (from the bucket's first `campus_id`; fallback "On your campus") / "On campus, not yet in your circle"
  3. major "Same major" / "Other students studying what you study"
  4. mutuals "Friends of friends" / "People your connections know"
  5. system "Elsewhere at {IU|Purdue}" (fallback "Elsewhere at your university") / "Same university, another campus"
  6. new "New on Vibe" / "Just joined"
  The bucket init (:666-672) matches the six keys.
- `SuggestionReason` (:947-960): campus → "At {campus}" (fallback "On your campus"); system → "Elsewhere at {IU|Purdue}".
- Discover empty body (:586) → "We'll suggest people once more students on your campus join Vibe, or once you've joined a club or two."
- `UserRow` label (:826) "Connect" → "Follow" (Q13); update the docblock at :24. "Connected ✓" stays.

**`CampusConfirmBanner.tsx`** (new, client)
- On mount: `vibeRequest("/api/me/onboarding-state", {cache:"no-store", quiet:true, failure:"Couldn't load your campus."})`. A failure renders nothing.
- Hidden unless `data.school_verified && data.school_system && !data.campus_confirmed` and sessionStorage `vibe_campus_confirm_dismissed` !== "1" (try/catch).
- `campus_id` set:
  - title "Confirm your campus", body "Is {shortName} still right?"
  - buttons "Yes" and "Change" (Link `/settings#campus`), plus a "Not now" text button (sets the key and hides)
  - Yes → `vibeRequest("/api/me/profile", {method:"PATCH", json:{campus_id}, quiet:true, failure:"Couldn't confirm your campus."})`; ok → hide + toast "Campus confirmed."; failure → toast `r.message` with action
- `campus_id` null: title "Pick your campus", body "Your campus decides the clubs, events and map you see.", button "Pick campus" (Link `/settings#campus`) + "Not now".
- Light cream card matching CampusMobile's palette; buttons at least 44px.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint: use-mobile-tour 0, NetworkMobile 0, CampusConfirmBanner 0.
- `rg -n 'Around your school|"Connect"|Posts from people you follow, ranked' src/components/mobile/NetworkMobile.tsx src/components/mobile/use-mobile-tour.ts` → 0.
- 375×812 prod `/campus?welcome=1` after removing ONLY `localStorage vibe_campus_tour_seen_v1` (no server writes):
  - three bubbles; the second reads 'What students at Indianapolis are posting. People and clubs you follow rise to the top.'
  - 'Got it' ends with no navigation to /network
  - `vibe_campus_tour_seen_v1 === '1'`; `welcome=1` is gone from the URL
- An onboarding-state override returning 500 → the fallback body.
- Network Discover at 375×812 with a suggested-connections override returning one row per `reason_v2` → groups in order: 'From your clubs', 'At Indianapolis', 'Same major', 'Friends of friends', 'Elsewhere at Purdue', 'New on Vibe'. A legacy `reason:'same school'` row lands in the campus group.
- The banner has no screen yet (CM mounts it). Its screenshots are in CM's acceptance.

---

### B15 · Settings campus card + onboarding draft cleared on sign-out/delete

**Owns:** `src/components/settings/SettingsClient.tsx`, `src/app/settings/page.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/lib/profile/settings-campus-card.ts` (new), `src/lib/profile/settings-campus-card.test.ts` (new)
**Depends on:** nothing new. It imports existing `clearDraft` (`draft.ts:250`), `ownCampusFields` (`profile-campus-write.ts:448`), `campusChangeTooSoonCopy` (:158), `isOttoOnboardingComplete` (`@/lib/auth/post-login`), and the campus helpers (`campuses.ts:266-428`).

**`settings/page.tsx`**
- The select (:26-28) adds `school_system,campus_id,campus_set_at,otto_answers` (service role, own row).
- Compute `campus = ownCampusFields({school, school_verified, school_system, campus_id, campus_set_at})` and `onboarded = isOttoOnboardingComplete(otto_answers)`.
- Pass `campus={{...campus, onboarded}}` to SettingsClient.
- Never pass `otto_answers` or `campus_set_at` raw. Drop `school` from the Profile prop (:46; `SettingsClient.tsx:24`).

**`settings-campus-card.ts`** (pure)
```ts
export type SettingsCampusInput = { schoolVerified: boolean; schoolSystem: "iu"|"purdue"|null; campusId: string|null; campusConfirmed: boolean; campusChangeAvailableAt: string|null; onboarded: boolean };
export type SettingsCampusView = { mode: "unverified"|"pick"|"confirm"|"set"; options: Array<{ id: string; label: string }>; value: string; sub: string|null; locked: boolean; note: string|null };
export function settingsCampusCardView(i: SettingsCampusInput, now?: number): SettingsCampusView;
export function nextAvailableAfterWrite(onboarded: boolean, now?: number): string|null; // onboarded ? ISO(now + 30d) : null
```
- **mode:** `!schoolVerified || !schoolSystem` → unverified; `!campusId` → pick; `!campusConfirmed` → confirm; else set.
- **options** = `campusesForSystem(system)` with label `isOpen ? shortName : `${shortName} — not open yet``.
- **value** = `campusId ?? ""`. **sub** = `campusPickerSub(row, system)` for the current value, else null.
- **locked** = availableAt in the future. **note** = locked ? `campusChangeTooSoonCopy(availableAt)` : null.

**`SettingsClient.tsx`** `CampusCard` (:490-608, replace)
- Copy under the title (identical in PM and PH): "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." Remove "Not verified — change it any time." and "Leave it unset to see everything across IU." (:549-554).
- **unverified:** "Verify your school email to pick your campus." + Link "Verify now →" → `/auth/school-email`; no select.
- **Otherwise a select:**
  - when value is "", the first option is `<option value="" disabled>Pick your campus</option>`
  - no 'Not set' option: delete the `IU_CAMPUSES` list (:577-586) and its import (:12)
  - sub under the select; `disabled={saving || locked}`; note when locked
- **confirm mode:** a callout above the select. Title "Confirm your campus", body "Is {shortName} still right?", buttons "Yes" (PATCH `{campus_id: value}`) and "Change" (focuses the select).
- **Writes:** `vibeRequest("/api/me/profile", {method:"PATCH", json:{campus_id: next}, quiet:true, failure:"Couldn't save your campus. Try again."})`, replacing the raw fetch with `school` (:515-523).
  - ok → value, confirmed, "Saved ✓", `availableAt = nextAvailableAfterWrite(onboarded)`
  - failure → revert; error text is `campusChangeTooSoonCopy(availableAt)` for `campus_change_too_soon` with `availableAt`, else `r.error ?? r.message`
- The section keeps `id="campus"` (:538).
- **`CampusTourCard`** (:150-151) copy → "Walk through vibe again with Otto. Takes about a minute." (Q14)

**Draft clearing** (`import { clearDraft } from "@/lib/onboarding/draft"`, called with NO id):
- `SignOutCard.onSignOut`: after the `!r.ok` return (:931-935), before `window.location.href = "/auth/login"` (:937).
- `DangerZone.onDelete`: after a successful DELETE `/api/me`, before `window.location.href = "/"` (:1001).
- `accept-terms-form.tsx onSignOut`: after the try/catch (:64-72), before `window.location.href = "/auth/login"` (:74).
- Out of scope (listed so nobody assumes they're covered): `verify-school/page.tsx:235`, `EmailLinkProblem.tsx:75`, the server deletion at `api/me/route.ts:129`.

**Acceptance**
- `npx tsc --noEmit` exits 0; eslint SettingsClient ≤ 2, `settings/page.tsx` 0, `accept-terms-form.tsx` ≤ 1, new lib + test 0.
- `node --test --experimental-strip-types src/lib/profile/settings-campus-card.test.ts` passes, covering:
  - unverified (verified false; system null)
  - pick: value '', options start Indianapolis then 'Fort Wayne — not open yet'
  - confirm
  - set + locked with a future `availableAt` → 'You can change your campus again on October 15.' (fixed `now`, America/Indiana/Indianapolis)
  - a past `availableAt` → not locked
  - Purdue options have no IU-only campus
  - `nextAvailableAfterWrite(false) === null`
- `rg -n 'IU_CAMPUSES|campusByLabel|Not set — show everything|Leave it unset|school: next' src/components/settings/SettingsClient.tsx` → 0.
- `rg -n 'clearDraft\(\)' src/components/settings/SettingsClient.tsx src/app/auth/terms/accept-terms-form.tsx` → 3 hits, each directly before its `window.location.href` assignment.
- 375×812 and 1280px screenshots of `/settings` as Franky (read-only; the select is only exercised with the non-GET blocker installed).

**Do not touch:** the `IU_CAMPUSES` / `campusByLabel` exports in `campuses.ts` (PM removes the last other importer in W4, PH its static copy in W5; deleting the shims is a later cleanup).

## 9. Wave 4: onboarding shell, phone Orgs tab + feed edit, desktop Orgs tab, phone profile

### B12 · phone onboarding shell: pinned header, campus, profile, photo, skip sheet, draft glue

**Owns:** `src/components/mobile/OnboardingMobile.tsx`, `src/lib/onboarding/draft.ts`, `src/lib/onboarding/draft.test.ts`, and new `src/components/mobile/onboarding/OnbHeader.tsx`, `StepCampus.tsx`, `StepProfile.tsx`, `StepPhoto.tsx`, `SkipSheet.tsx`
**Depends on:**
- B12S (§8, on `main` by G3): imports `ONB_COPY`, `fillCampus` (`onb-copy.ts`); `COLORS` and the eleven style constants (`onb-theme.ts`); `StepClubs`, `initialClubsState`, `type ClubsState`; `StepPeople`, `initialPeopleState`, `type PeopleState`; `anyClubFollowed` (`social-steps.ts`). Re-grep those names on `main` before editing; if one differs, follow `main` and note it for review.
- F5a (§6) only through `StepClubs` (it renders `OrgJoinControl`); F1 + F2 live (G2), so Follow taps reach real routes.
- B15 (§8): calls `clearDraft()` with NO id at three sign-out/delete sites. `clearDraft`'s signature and no-id behaviour must not change.
- B14t (§8): the phone campus tour starts on `vibe_tour_pending === "campus"`, or on `welcome=1` when it hasn't been seen. B12 sets the flag and lands on the server's `next`, and never appends its own `welcome=1`.
- Same wave, no shared file: B13 mirrors this batch's draft contract (item 2), request/copy rules and step behaviour in `public/html/onboarding.html`. CM, CH2 and PM touch nothing here.

**Anchors:** no earlier wave edits any owned file. `OnboardingMobile.tsx` (OM), `draft.ts`, `draft.test.ts`, `OnboardingSwitch.tsx` and the server files cited below were re-read at HEAD `f23bc5d`. B12S/F5a files don't exist at HEAD, so they're cited by export name only. Reader-note corrections: the server shell is `OnboardingSwitch.tsx:83-84` (not :97-99). `VibeFailure` has no `field` (`request.ts:35-42`), so field errors map by `code`. The onboarding-step 429s DO carry codes (`rate_limited` :43-47, `campus_change_too_soon` :188, `handle_cooldown` :247). Franky owns SAE (live, read-only SQL 2026-09-16), so his replay shows the locked member row, not Follow.
**Scope limit:**
- no edits to `OnboardingSwitch.tsx`, `boot.ts`, `onboarding/page.tsx`, any `/api` route, `onb-copy.ts`, `onb-theme.ts`, `social-steps.ts`, `StepClubs.tsx`, `StepPeople.tsx`, F5a's files, `ImageCropperModal.tsx`, `avatar-upload.ts` or `campuses.ts`
- no new strings in `ONB_COPY` (B12S owns it and B13 copies it character for character). The few strings items 8, 9 and 12 keep local are listed there so B13 can match them.

**Contract**

1. **Props, imports, file boundaries**
   - `export type OnboardingMobileProps = { replay: boolean } & Partial<Omit<OnboardingBoot, "replay">>` stays exactly as at OM:202-204, so `OnboardingSwitch.tsx:15` and `:22` compile unchanged. Destructure `userId` as well (OM:206-211 doesn't today).
   - The phone tree mounts only after the neutral server shell (`OnboardingSwitch.tsx:83-84`) is swapped out on the client. Lazy `useState` initialisers may read localStorage (always inside try/catch, via `draft.ts`).
   - The five new files import only from: `react`, `@/lib/feedback/request`, `@/lib/feedback/toast`, `@/lib/iu/campuses`, `@/lib/iu/majors`, `@/lib/onboarding/draft`, `@/lib/profile/avatar-upload`, `@/components/ImageCropperModal`, `./onb-copy`, `./onb-theme`, and `./StepProfile` (SkipSheet needs `HandleStatus` as a type, OM needs `useHandleCheck`). They never import `OnboardingMobile` (no cycles), `NetworkMobile`, `CampusMobile` or any `server-only` module.
   - OM renders each step body inside ONE `<section style={stepSectionStyle}>`, with `<OttoOrb size="small" />` first on steps 2–6 (OttoOrb and StyleTag stay in OM, :157-196 and :1330-1381). Step components render from their `h2` down, with no section and no orb. Check `StepClubs` / `StepPeople` on `main`: if either renders its own section, wrap it with the orb only.

2. **`draft.ts` additions (tested in `draft.test.ts`; the storage contract B13 mirrors)**
   ```ts
   export const ONBOARDING_DRAFT_FIELD_KEYS = Object.freeze(["campus_id", "name", "handle", "bio", "major", "department", "year", "interests", "skills", "looking_for"] as const);
   export type OnboardingDraftFieldKey = (typeof ONBOARDING_DRAFT_FIELD_KEYS)[number];
   export type OnboardingYear = "" | "1" | "2" | "3" | "4" | "5";
   /** interests / skills are the RAW textarea text, not arrays. */
   export type OnboardingTypedFields = { campus_id: string; name: string; handle: string; bio: string; major: string; department: string; year: OnboardingYear; interests: string; skills: string; looking_for: string[] };
   export function typedDraftFields(fields: OnboardingDraftFields | null | undefined): Partial<OnboardingTypedFields>;
   export function onboardingResumeStep(
     draft: Pick<OnboardingDraft, "step" | "maxStep"> | null | undefined,
     saved: { campusId?: string | null; campusConfirmed?: boolean; hasRealHandle?: boolean; systemKnown?: boolean },
   ): number;
   ```
   - `typedDraftFields` keeps only the ten keys:
     - a string key → kept when `typeof value === "string"`
     - `year` → kept only when it's one of `"" "1" "2" "3" "4" "5"`
     - `looking_for` → kept when it's an array: strings only, deduplicated, first-seen order
     - anything else is dropped (a number `year`, an array `interests`, unknown keys)
   - `onboardingResumeStep`:
     - `s = onboardingStartStep(draft, saved)`
     - `campusSaved = !!saved.campusId && saved.campusConfirmed === true`
     - `if (saved.systemKnown !== false && s > 2 && !campusSaved) s = 2`
     - `if (s > 3 && !saved.hasRealHandle) s = 3`
     - return `s`
   - Unchanged: every existing export and behaviour, including `ONBOARDING_DRAFT_KEY_PREFIX`, the `{v:1, step, maxStep, fields, at}` schema, the 14-day TTL, `clearDraft(userId?)` (:250; no id clears every draft, which is how B15 calls it) and `onboardingStartStep` (:364; its tests at `draft.test.ts:298-316` still pass untouched).
   - `draft.ts` keeps ZERO imports. Its test resolver (`draft.test.ts:29-40`) only retries relative specifiers, so the campus-allowed check stays in OM (item 4).
   - Update the file header's STORAGE CONTRACT block to name `ONBOARDING_DRAFT_FIELD_KEYS` and the typed shapes. A key or type change here is a change in `onboarding.html` too (B13).

3. **Delete from `OnboardingMobile.tsx`**
   - `TOTAL_STEPS = 4` (:52; use `ONBOARDING_TOTAL_STEPS` from `draft.ts:53`). `COLORS` (:62-76) and the eleven styles B12S copied into `onb-theme.ts` (`stepSectionStyle`, `h2Style`, `subIntroStyle`, `formStyle`, `labelStyle`, `hintBelowStyle`, `inputStyle`, `textareaStyle`, `fieldErrorStyle`, `primaryCtaStyle`, `secondaryLinkStyle`, all within :1523-1851) become imports.
   - `WorkRow` / `EMPTY_ROW` (:78-92); `ALL_IU_MAJORS`, `ALL_IU_SCHOOLS`, `DEFAULT_CAMPUS_LABEL` (:94-113), together with the `IU_CAMPUSES`, `DEFAULT_CAMPUS_ID` and `IU_MAJORS_BY_SCHOOL` imports (:16-26); `CAMPUS_REQUIRED_COPY` / `CAMPUS_INVALID_COPY` (:116, :118; use `ONB_COPY.campus.required` / `.invalid`); `isHttpUrl` (:133-140).
   - The legacy path for an unknown system: `systemAware` (:233), the legacy `campus` label state (:253-255) and the `<select>` (:901-920). No `profile.school` is ever sent.
   - Work-experience and resume state (:326-336); the focus refs and the focus-on-step effect (:343-357), which is the autofocus that pushed the header off screen; resume upload + preview (:413-459).
   - `completeOnboarding` (:462-665: the legacy `profile` body, the `/api/me/handle` claim, the `welcome=1` append); `skipOnboarding` (:672-697); `campusAnswered` (:704-711); `progressDots` (:714-727) with `progressDotsStyle` / `dotStyle` (:1446-1477).
   - Step 2–4 markup (:774-1133); footer steps 2–4, including "Skip to resume →" (:1148-1197); the skip overlay (:1200-1232) and its old copy (:1209-1211); `ExperienceRow` (:1262-1328); `expRowStyle` … `previewImgStyle` (:1748-1807); `skipBtnStyle` (:1486-1495).
   - Move, don't copy:
     - into `StepProfile.tsx`: `HANDLE_RE` (:53), `LOOKING_FOR_OPTIONS` (:55-60), `splitLinesToArray` (:120-131), `Field` (:1242-1260), `handleWrapStyle` / `handleAtStyle` (:1629-1648), `lookingForWrapStyle` / `lookingForRowStyle` (:1725-1746)
     - into `StepCampus.tsx`: `campusListStyle` … `campusSoonStyle` (:1649-1717)
     - into `SkipSheet.tsx`: the overlay styles (:1852-1890)
   - Keep in OM: `buildOttoConfig` (:146-154), `OttoOrb`, `StyleTag`, `shellStyle`, `bg1Style` / `bg2Style`, `topBarStyle`, `logoStyle`, `progressTextStyle`, `replayPillStyle`, `mainStyle`, `h1Style`, `emStyle`, `introStyle`, `noteStyle`, `changeLaterNoteStyle`, `bottomBarStyle`, `warpOverlayStyle`. Rewrite the top docblock (:29-51) for the six-step flow.

4. **State and restore (OM)**
   - `system`: `useState<SchoolSystem | null>(isSchoolSystem(systemProp) ? systemProp : null)`. The Purdue switch (item 8) changes it.
   - `preselectId = isCampusAllowed(singleCampusId, system) ? singleCampusId : null` (as at :240-242).
   - `const draft = !replay && userId ? loadDraft(userId) : null` and `const d = typedDraftFields(draft?.fields)`, both computed once in a lazy initialiser. Replay neither loads nor saves a draft.
   - Field initial values. The base is the prefill; the draft overrides typed fields:
     - `name`, `bio`, `major`, `department`, `looking_for`: `d.<key> ?? prefill.<key> ?? ""` (`looking_for` also filtered to `LOOKING_FOR_OPTIONS` values)
     - `year`: `d.year ?? (prefill.year ? String(Math.min(5, prefill.year)) : "")`. The select tops out at "5th+ / grad", and the server accepts 1–12 (`onboarding-prefill.ts:314-327`).
     - `interests` / `skills`: `d.<key> ?? prefill.<key>.join(", ")`
     - `handle`: `prefill.hasRealHandle ? prefill.handle : (d.handle ?? "")`. The server wins for a claimed handle (`draft.ts:12-15`).
     - `campusId`, in order:
       1. `!prefill.campusConfirmed && isCampusAllowed(d.campus_id, system)` → `d.campus_id` (the student's own earlier pick, not a silent default)
       2. otherwise the rules at OM:263-270 unchanged: the single-campus preselect, a confirmed prefill campus, else `""`
     - Nothing else may preselect a campus (the ac014a3 rule).
   - Saved facts:
     - `savedCampusId = prefill.campusConfirmed && isCampusAllowed(prefill.campusId, system) ? prefill.campusId : null`
     - `identitySaved = !!prefill.hasRealHandle && !!prefill.name`
     - `avatarUrl = prefill.avatarUrl ?? null`
     - `profileDirty` (ref): true when the draft restored any profile key, set true by every step-3 field change, cleared by a successful profile save
   - `step = replay ? 1 : onboardingResumeStep(draft, { campusId: prefill?.campusId, campusConfirmed: prefill?.campusConfirmed, hasRealHandle: prefill?.hasRealHandle, systemKnown: !!system })`, and `maxStep = Math.max(step, draft?.maxStep ?? step)`.
   - `clubs` / `people`: `useState(initialClubsState)` / `useState(initialPeopleState)`. Both reset whenever `savedCampusId` or `system` changes. They're cached for the session, so Back/Continue doesn't refetch.
   - `busy = savingCampus || savingProfile || uploading || finishing || skipping`, mirrored into `busyRef` for the listeners in item 5.
   - Draft saver (not in replay, and only with a `userId`):
     - `saverRef = createDraftSaver(userId)`, created once
     - an effect calls `saver.schedule({ step, maxStep, fields: { campus_id: campusId, name, handle, bio, major, department, year, interests, skills, looking_for } })` whenever any of those change. It returns early when `doneRef.current` (set on Finish/Skip success).
     - a mount effect subscribes `flushDraftOnHide(saver)`. Its cleanup unsubscribes and calls `saver.flush()`: a `clearDraft` since the schedule makes that a no-op (`draft.ts:311`).
     - the photo is never in the draft (the server holds it)

5. **History: Back = header Back = browser Back = iOS swipe**
   - Every `pushState` / `replaceState` passes `{ ...window.history.state, onbStep: n }` with `""` and NO url. Next's app router reloads on a popstate whose state lacks `__NA` (`node_modules/next/dist/client/components/app-router.js:290-292`). Spreading the current state keeps `__NA` and the router tree, so its handler only restores the same URL.
   - On mount (one effect):
     - if `typeof window.history.state?.onbStep === "number"` (a reload mid-flow, or the second StrictMode run), just `replaceState` with `onbStep: step`
     - else `replaceState` with `onbStep: 1`, then `pushState` for `s = 2..step`, so a back stack exists down to step 1
   - `goForward(n)`: `pushState` with `onbStep: n`, `setStep(n)`, `setMaxStep(m => Math.max(m, n))`, `window.scrollTo({ top: 0 })`. No focus call on any step change.
   - Header Back calls `window.history.back()`.
   - `popstate` listener (added on mount, removed on unmount):
     - `n = clamp(e.state?.onbStep ?? 1, 1, maxStepRef.current)`
     - `busyRef.current` → `pushState` with `onbStep: stepRef.current` and ignore
     - else `setStep(n)` and `scrollTo({ top: 0 })`
     - Back never clears input or undoes a saved write
   - Sending the student back from Finish: clear busy first (`busyRef.current = false`), THEN `window.history.go(target - stepRef.current)`, so the listener doesn't swallow it.

6. **Layout and `OnbHeader.tsx`**
   - `shellStyle` (:1385-1396) drops `overflow: "hidden"` (:1394). It makes the shell a scroll container, which is why the sticky header scrolls away today.
   - The two glows (:733-734, styles :1398-1421) move inside one wrapper `{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }`.
   - `export function OnbHeader(p: { step: number; total: number; backDisabled: boolean; skipDisabled: boolean; onBack: () => void; onSkip: () => void })`:
     - `<header>` with `topBarStyle` (:1423-1436: sticky, top 0, zIndex 5, same gradient and padding), switched to `display: "grid", gridTemplateColumns: "44px 1fr auto auto", alignItems: "center", gap: 8`
     - Back: `<button type="button" aria-label={ONB_COPY.header.back}>` 44×44 with a "←" glyph. `style.visibility = "hidden"` on step 1; `disabled={backDisabled}`.
     - the logo (markup :738-740, `logoStyle`)
     - `ONB_COPY.header.progress` with `{n}` → step, in `progressTextStyle`. No dots on phone.
     - Skip: `ONB_COPY.header.skip`, min 44×44, shown on EVERY step (step 1 included), `disabled={skipDisabled}`
   - OM passes `backDisabled = busy` and `skipDisabled = busy || skipOpen`.
   - The replay pill (:755, `ONB_COPY.header.replay`) and the fixed footer (`bottomBarStyle` :1809-1823) stay. Footer buttons are disabled while `busy`.
   - Fallback: if device QA still shows the header scrolling away, switch it to `position: "fixed"` (left/right 0) and give `mainStyle` `paddingTop: calc(env(safe-area-inset-top, 0px) + 64px)`.

7. **Step 1 (inline in OM)**
   - `OttoOrb big`, the h1 (:762-764 unchanged), `ONB_COPY.hello.intro`, `ONB_COPY.hello.note`.
   - Footer: `ONB_COPY.hello.cta` → `goForward(2)`.

8. **Step 2: `StepCampus.tsx`**
   - `export function StepCampus(p: { system: SchoolSystem | null; campusId: string; preselectId: string | null; error: string | null; replay: boolean; groupRef: React.RefObject<HTMLDivElement | null>; onPick: (id: string) => void; onBusy: (busy: boolean) => void; onSystemChanged: (next: { system: SchoolSystem; currentCampusId: string | null }) => void })`
   - Local strings (B13 uses the same text):
     - `SYSTEM_MISSING_COPY = "We couldn't match your school email to a university yet. Try again later."` (identical to `onboarding-step/route.ts:166`)
     - failures "Couldn't send the code.", "Couldn't verify that code.", "Couldn't load your campuses."
   - Render:
     - `h2` `ONB_COPY.campus.title`; the Otto line (`subIntroStyle`) is `ottoIu` or `ottoPurdue` by system
     - `system === null`: `<p role="status">{SYSTEM_MISSING_COPY}</p>`, with no cards, no note and no link
     - otherwise the radio cards, moved from OM:847-900 unchanged in markup and styles: `role="radiogroup"`, `aria-label={ONB_COPY.campus.title}`, `aria-invalid`, and `aria-describedby` = `onbCampusError` when there's an error, else `onbCampusNote`
     - cards come from `campusesForSystem(system)`, so shared campuses come first. Title `shortName`; sub `campusPickerSub(c, system)`; tag `fromEmailTag` only when `c.id === preselectId`; pill `notOpen` when `!c.isOpen`. The radio's `onChange` calls `onPick(c.id)`.
     - `<p id="onbCampusError" role="alert">` when there's an error; `<p id="onbCampusNote">` = `ONB_COPY.campus.note` with EVERY `{system}` → `SYSTEM_LABEL[system]`
     - no hard-coded campus list anywhere in the file. The only campus id literal is `"indianapolis"` in the link condition below.
   - Purdue switch (founder decision; Q8). The link `ONB_COPY.campus.purdueLink` (a text button, min 44px tall) shows only when `system === "iu" && campusId === "indianapolis"`. Tapping it opens an inline panel:
     - email input: `type="email"`, `autoComplete="off"`, `autoCapitalize="off"`, label `switchLabel`, placeholder `switchPlaceholder`
     - Send (`switchSend` / `switchSending`): `email.trim()` must match `/^[^\s@]+@purdue\.edu$/i`, else the inline `switchWrongDomain`. Then `vibeRequest<{ alreadyVerified?: unknown }>("/api/auth/school-email/request", { method: "POST", json: { schoolEmail }, quiet: true, failure: "Couldn't send the code." })`:
       - ok → show `switchSent` and the code input (`inputMode="numeric"`, `autoComplete="one-time-code"`, label `switchCodeLabel`, digits only, max 8)
       - ok with `alreadyVerified === true` → skip straight to the re-read below
       - failure → inline `<p role="alert">{r.error ?? r.message}</p>` (a 429 has no human `error`, so the mapped line shows)
     - Verify (`switchVerify` / `switchVerifying`, enabled at 8 digits): `vibeRequest("/api/auth/school-email/confirm-code", { method: "POST", json: { schoolEmail, code }, quiet: true, failure: "Couldn't verify that code." })`
       - ok → the re-read: `vibeRequest<{ system?: unknown; currentCampusId?: unknown }>("/api/campuses", { cache: "no-store", quiet: true, failure: "Couldn't load your campuses." })`
         - re-read ok with `isSchoolSystem(data.system)` → `onSystemChanged({ system, currentCampusId: typeof data.currentCampusId === "string" ? data.currentCampusId : null })`, `toast({ message: ONB_COPY.campus.switchDone, tone: "info" })`, close the panel
         - re-read failed → the same toast, then `window.location.reload()`. The pagehide flush keeps the draft, and the new boot carries the new system.
       - failure → inline `r.error ?? r.message`
     - `switchCancel` closes the panel and clears both inputs
     - `onBusy(true/false)` wraps each request
     - replay: the panel opens and validates the domain, but Send and Verify make NO request (Send shows the code input, Verify shows the `switchDone` toast and changes nothing)
     - Agents never submit the panel on prod: it sends a real email.
   - OM `onSystemChanged(next)`:
     - `setSystem(next.system)`
     - if `!isCampusAllowed(campusId, next.system)` → `setCampusId("")`
     - `savedCampusId` survives only when it's allowed in `next.system` AND `=== next.currentCampusId`; otherwise null. This deviates from the reader note (which set it to `currentCampusId`): `schoolSystemPatch` keeps a shared campus WITHOUT stamping `campus_set_at` (`school-email-apply.ts:46-59`), so an unconfirmed kept campus must still go through the campus save.
     - clubs and people reset (item 4)
   - Footer "Continue →" (`ONB_COPY.campus.continue`; `saving` while busy):
     1. `system === null` → `goForward(3)` with no request
     2. `!campusId` → error `campus.required`; `!isCampusAllowed(campusId, system)` → `campus.invalid`. Both: `groupRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })` and stay.
     3. replay → `goForward(3)`, no request
     4. `campusId === savedCampusId` → `goForward(3)`, no request. The step route's limiter is 30 per 10 min, shared with profile saves (`onboarding-step/route.ts:94-98`).
     5. else `vibeRequest("/api/me/onboarding-step", { method: "POST", json: { step: "campus", campus_id: campusId }, quiet: true, failure: "Couldn't save your campus." })`
        - ok → `savedCampusId = campusId` (clubs/people reset), `goForward(3)`
        - code `campus_invalid` | `campus_change_too_soon` | `system_missing` | `campus_not_ready` → inline error `r.error ?? ONB_COPY.campus.invalid`, scroll to the group, stay
        - else → `toast({ message: r.message, tone: "error", action: r.action })`

9. **Step 3: `StepProfile.tsx`**
   - Exports:
     - `type ProfileFields = Omit<OnboardingTypedFields, "campus_id">`
     - `type HandleStatus = { kind: "checking" | "available" | "taken" | "reason" | "format" | "unchecked"; text: string } | null`
     - `profileStepBody(f: ProfileFields)` → `{ name: f.name.trim(), handle: f.handle, bio: f.bio, major: f.major, department: f.department, year: f.year === "" ? null : Number(f.year), interests: splitLinesToArray(f.interests, 10, 40) ?? [], skills: splitLinesToArray(f.skills, 12, 30) ?? [], looking_for: f.looking_for }`. Every key is always sent, because an empty value clears the column on purpose (`onboarding-prefill.ts:232-238`), so Back-and-erase works.
     - `useHandleCheck()` → `{ status, setStatus, onHandleInput(raw): string }`. OM calls the hook, so the status survives the step unmounting. SkipSheet's handle input uses the same `onHandleInput`.
     - `StepProfile(p: { fields: ProfileFields; onField: <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => void; onHandleInput: (raw: string) => void; handleStatus: HandleStatus; errors: { name: string | null; handle: string | null }; nameRef: React.RefObject<HTMLInputElement | null>; handleRef: React.RefObject<HTMLInputElement | null>; majorList: CampusMajors | null })`
   - Handle check (replaces OM:359-411):
     - `onHandleInput`: `v = raw.trim().toLowerCase().slice(0, 20)`; abort the previous `AbortController` and clear the timer; return `v` (OM sets `handle`, marks `profileDirty`, clears the handle error)
     - `v === ""` → status null
     - `!HANDLE_RE.test(v)` → `format` / `ONB_COPY.profile.handleFormat`
     - else `checking` / `handleChecking`. After 280ms: `vibeRequest<{ available?: unknown; reason?: unknown }>(`/api/handle/check?h=${encodeURIComponent(v)}`, { cache: "no-store", quiet: true, failure: "Couldn't check that handle.", signal })`. Ignore the result if `signal.aborted`.
       - ok and `available === true` → `available` / `handleAvailable`
       - ok and not available → `reason = String(data.reason ?? "taken").toLowerCase()`: `"taken"` → `taken` / `handleTaken`; otherwise `reason` / `handleReason` with `{reason}`
       - !ok → `unchecked` / `handleUnchecked`. A failed check never reads "taken" (critic D5).
     - abort and clear on unmount
     - status colour: `COLORS.green` for available; `COLORS.red` for taken / reason / format; `COLORS.mutedText` otherwise
   - Render:
     - `h2` `profile.title`, sub `profile.sub`, `<div style={formStyle}>`
     - in OM's order: Name, Handle, Bio, Major, Department, Year, Interests, Skills, then What are you here for?, with labels from `ONB_COPY.profile.labels`
     - `Field` gains `htmlFor`; ids `onbName`, `onbHandle`, `onbBio`, `onbMajor`, `onbDept`, `onbYear`, `onbInterests`, `onbSkills`. Looking-for is a `<fieldset>` whose `<legend>` uses `labelStyle`.
     - kept verbatim from OM: the hints ("how friends find you (3-20, letters/numbers/_)", "up to 600 characters", "up to 10 items — comma or new-line separated", "up to 12 items, 30 chars each"), the placeholders (:791, :808, :842, :930, :950, :986, :1000), the year options (:963-972), `maxLength`s, and `autoComplete` / `spellCheck` / `autoCapitalize`
     - major hint: `majorList ? ONB_COPY.profile.majorHintList.replace("{label}", majorList.label) : ONB_COPY.profile.majorHintFree`. Datalists `onbMajors` / `onbSchools` come from `majorList.majors` / `.schools` and are omitted when `majorList` is null. OM computes `majorList = system && campusId ? majorsForCampus(campusId, system) : null`.
     - errors: `<p id="onbNameError" | "onbHandleError" role="alert" style={fieldErrorStyle}>`; the input gets `aria-invalid` and `aria-describedby`
     - `profile.changeLater` note at the end. No `autoFocus` anywhere.
   - Footer "Continue →" (in OM; `profile.saving` while busy):
     1. Client checks, in order: `!name.trim()` → `nameRequired` (focus `nameRef`); `!handle` → `handleRequired`; `!HANDLE_RE.test(handle)` → `handleInvalid` (focus `handleRef`). Focusing here answers a tap, so it isn't autofocus.
     2. replay → `goForward(4)`
     3. `vibeRequest("/api/me/onboarding-step", { method: "POST", json: { step: "profile", ...profileStepBody(fields) }, quiet: true, failure: "Couldn't save your profile." })`
        - ok → `identitySaved = true`, `profileDirty = false`, `goForward(4)`
        - `name_required` → name error `r.error`
        - `handle_required` | `handle_invalid` | `handle_reserved` | `handle_taken` | `handle_cooldown` → handle error `r.error` (`handle_taken` also sets status `taken`); focus the field
        - `profile_invalid` → `toast({ message: r.error ?? r.message, tone: "error" })`
        - else → toast `r.message` with `r.action`

10. **Step 4: `StepPhoto.tsx`**
    - `export function StepPhoto(p: { replay: boolean; avatarUrl: string | null; initial: string; fileInputRef: React.RefObject<HTMLInputElement | null>; error: string | null; onError: (m: string | null) => void; onUploading: (b: boolean) => void; onSaved: (url: string) => void })`
    - Render:
      - `h2` `photo.title`; Otto line `photo.otto`
      - a 132px circle showing `<img alt="">` of `avatarUrl`, or `initial` (first letter of the name, uppercased; "?" when empty) on `COLORS.charcoalSoft`
      - `<p role="alert">` for `error`
      - a hidden `<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp">`. No `capture` attribute, so iOS offers both library and camera. `onClick` resets `value` to `""`, so the same file can be picked again.
    - `onChange`:
      - no file → return
      - `file.type` is set and doesn't start with `"image/"` → `onError(PHOTO_ERROR_COPY.wrongType)`
      - otherwise → `onError(null)` and open the cropper with this file
      - This deviates from the reader note (which checked `AVATAR_CONTENT_TYPES` before cropping): an `image/heic` the browser can decode must reach the cropper, whose JPEG output then passes `preflightAvatarBlob` (`avatar-upload.ts:76-93`) inside `uploadAvatar`.
    - Cropper: `<ImageCropperModal src={file} aspect={1} shape="circle" outputMaxSize={768} outputQuality={0.92} dismissOnBackdrop={false} onCancel={close} onError={(m) => { close(); onError(m); }} onConfirm={...} />`.
      - The modal stays open on its own errors (`ImageCropperModal.tsx:72-82`). Closing it here matters: otherwise a decode failure leaves a black frame over the step.
      - `onConfirm(blob)`: close first.
        - replay → `onSaved(URL.createObjectURL(blob))`. OM revokes the previous `blob:` URL when it's replaced and on unmount. No request.
        - otherwise → `onUploading(true)`; `const r = await uploadAvatar(blob, { signal })`; `onUploading(false)`
          - `r.ok` → `onSaved(r.url)`
          - `!r.ok && !r.aborted` → `onError(r.message)`, plus `toast({ message: r.message, tone: "error", action: r.action })` only when `r.action` is set
      - One `AbortController`, aborted on unmount.
    - The photo saves before the step can advance, and the draft's `step: 4` is what lands an iOS "Take Photo" tab reload back on this step.
    - Footer (OM):
      - uploading → one disabled primary `photo.uploading`. Back, Skip and the footer are disabled (busy), and popstate is ignored.
      - no `avatarUrl` → primary `photo.choose` (`fileInputRef.current?.click()`) plus secondary `photo.skip` → `goForward(5)`
      - `avatarUrl` set → primary `photo.continue` → `goForward(5)` plus secondary `photo.change` (clicks the input)

11. **Steps 5 and 6 (B12S components, wired in OM)**
    - `campusForSteps = savedCampusId ?? (isCampusAllowed(campusId, system) ? campusId : null)`
    - `campusShortName = campusRowById(campusForSteps)?.shortName ?? null`
    - `campusShared = (campusRowById(campusForSteps)?.systems.length ?? 0) > 1`
    - Step 5: `<StepClubs replay={replay} campusShortName={campusShortName} state={clubs} setState={setClubs} />`. The footer is one primary button that reads `anyClubFollowed(clubs.rows, clubs.local) ? ONB_COPY.clubs.continue : ONB_COPY.clubs.skipForNow` and always calls `goForward(6)`.
    - Step 6: `<StepPeople replay={replay} campusShortName={campusShortName} campusShared={campusShared} system={system} state={people} setState={setPeople} />`. Footer: `people.finish` (`people.finishing` while busy) → `finish()`.
    - Both lists load once and live in OM state. Back to step 4 and forward again doesn't refetch. They reset only on a saved-campus or system change (item 4).

12. **Finish**
    - replay → `setWarping(true)`; after 700ms `leave("/campus")`. No draft, no tour flag, no request.
    - Otherwise `finishing = true`, then `vibeRequest<{ next?: unknown }>("/api/me/onboarding-complete", { method: "POST", json: { v: 2, otto_answers: buildOttoConfig() }, quiet: true, failure: ONB_COPY.people.finishFailed })`. v:2 goes through `finishV2` (`onboarding-complete/route.ts:98-100`, `:119-191`); the rules are in `finishDecision` (`finish.ts:132`).
    - ok → `succeed(r.data.next)`, shared with Skip, in this order:
      1. `doneRef.current = true`
      2. `saverRef.current?.cancel()`
      3. `clearDraft(userId)`
      4. `try { localStorage.setItem("vibe_tour_pending", "campus") } catch {}`
      5. `dest = typeof next === "string" && isSafeRelativePath(next) ? next : "/campus?welcome=1"`
      6. `setWarping(true)`, and after 700ms `leave(dest)`
      - `dest` is used VERBATIM (the server sends `ONBOARDING_NEXT_PATH`, `finish.ts:47`); never append `welcome=1` (critic D8).
    - Failure (`finishing = false` and `busyRef.current = false` before any `history.go`):
      - `name_required` | `handle_required` → that field's error = `r.error`, then `history.go(3 - step)`
      - `campus_required` | `campus_invalid`:
        - `system` set → campus error = `r.error`, then `history.go(2 - step)`
        - `system === null` → `toast({ message: r.error ?? r.message, tone: "error" })` and stay; Skip still works. There were 0 such accounts on 2026-09-16.
      - anything else → `toast({ message: r.message, tone: "error", action: r.action })`. `terms_required` keeps Review Terms; a 429 `rate_limited` (`:104-109`) shows the mapped line.
    - `leave(dest: string)` is the ONE place that assigns `window.location.href`. That keeps eslint at the baseline 1.

13. **Skip: `SkipSheet.tsx` + OM `runSkip`**
    - `export function SkipSheet(p: { open: boolean; variant: "saved" | "identity"; busy: boolean; name: string; handle: string; handleStatus: HandleStatus; nameError: string | null; handleError: string | null; onName: (v: string) => void; onHandleInput: (raw: string) => void; onKeepGoing: () => void; onSkipAnyway: () => void; onSaveAndSkip: () => void })`
    - Markup and behaviour:
      - the old overlay and card styles (:1852-1890)
      - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="onbSkipTitle"`
      - on open, focus moves to the primary button (never to an input, so the keyboard doesn't pop)
      - backdrop tap and Escape call `onKeepGoing` ONLY when `!busy`. Today the sheet closes mid-save (OM:1204-1206).
    - `saved` variant: title `skip.title`, body `skip.bodySaved`, primary `skip.keepGoing`, secondary `skip.skipAnyway` (`skip.skipping` while busy).
    - `identity` variant: title `skip.title`, body `skip.bodyIdentity`, then the Name input (`id="onbSkipName"`, label `profile.labels.name`, `autoComplete="name"`) and the Handle input (`id="onbSkipHandle"`, label `profile.labels.handle`, the `@` prefix, the status text). Both are bound to the SAME OM state as step 3; errors are `role="alert"`. Primary `skip.saveAndSkip` (`skip.saving` while busy), secondary `skip.keepGoing`.
    - Variant (OM):
      - `forceIdentity ? "identity" : (replay ? (!!name.trim() && HANDLE_RE.test(handle)) : identitySaved) ? "saved" : "identity"`
      - In replay nothing is saved, so the local values decide. That's what lets an agent open the identity variant in replay by clearing Name on step 3.
      - `forceIdentity` resets when the sheet closes
    - The header Skip opens the sheet (disabled while busy, so never during Finish or an upload).
    - `runSkip()` runs for both Skip anyway and Save & skip, in order:
      1. replay: the identity variant runs the step-3 client checks (errors in the sheet; stop on a failure); then `leave("/campus")`. No request.
      2. `skipping = true`
      3. if `isCampusAllowed(campusId, system) && campusId !== savedCampusId` → POST the campus step (quiet). ok → `savedCampusId = campusId`. A failure is ignored: campus is optional on skip (`finish.ts:145`).
      4. if the variant is identity OR `profileDirty.current`:
         - run the step-3 client checks. A failure → `forceIdentity = true`, errors under the sheet fields, stop.
         - POST the profile step with `profileStepBody(fields)`
         - field codes (item 9) → `forceIdentity = true` + `r.error` under the sheet field, stop
         - other failures → toast `r.message` + `r.action`, stop
         - ok → `identitySaved = true`, `profileDirty = false`
      5. `vibeRequest<{ next?: unknown }>("/api/me/onboarding-complete", { method: "POST", json: { v: 2, otto_answers: buildOttoConfig(), skip: true }, quiet: true, failure: ONB_COPY.skip.failed })`
         - ok → `succeed(r.data.next)` (item 12)
         - `name_required` | `handle_required` → `forceIdentity = true` + that field's error = `r.error`
         - else → toast `r.message` + `r.action`
      6. `skipping = false` on every path that doesn't navigate

**Acceptance**
- `npx tsc --noEmit` exits 0, and `git diff --quiet f23bc5d -- src/app/onboarding/OnboardingSwitch.tsx src/lib/onboarding/boot.ts` exits 0 (both unchanged and still compiling).
- eslint:
  - `OnboardingMobile.tsx` ≤ 1 (the baseline 1 is the `window.location.href` warning at :519)
  - `OnbHeader.tsx`, `StepCampus.tsx`, `StepProfile.tsx`, `StepPhoto.tsx`, `SkipSheet.tsx`, `draft.ts`, `draft.test.ts`: 0 each
- `node --test --experimental-strip-types src/lib/onboarding/draft.test.ts src/lib/onboarding/boot.test.ts src/lib/onboarding/finish.test.ts` passes.
  - The existing tests are untouched: `git diff f23bc5d -- src/lib/onboarding/draft.test.ts | grep '^-[^-]'` shows only the destructured-import lines (:42-53).
  - New `onboardingResumeStep` cases:
    - `({step:5,maxStep:5}, {})` → 2
    - `({step:5,maxStep:5}, {campusId:"indianapolis", campusConfirmed:true})` → 3
    - `({step:6,maxStep:6}, {campusId:"indianapolis", campusConfirmed:true, hasRealHandle:true})` → 6
    - `({step:4,maxStep:4}, {systemKnown:false, hasRealHandle:true})` → 4
    - `({step:4,maxStep:4}, {systemKnown:false})` → 3
    - `({step:5,maxStep:3}, {campusId:"indianapolis", campusConfirmed:true, hasRealHandle:true})` → 3
    - with NO draft, every combination of campusId {null, "indianapolis"} × campusConfirmed {true, false, undefined} × hasRealHandle {true, false} × systemKnown {true, false, undefined} equals `onboardingStartStep(null, saved)`
  - `ONBOARDING_DRAFT_FIELD_KEYS` deep-equals the exact ten-key list above, in order, and `Object.isFrozen` is true.
  - `typedDraftFields`:
    - `null` → `{}`
    - keeps `name: "Ana"` and `year: "3"`; drops `year: 3`, `year: "7"`, `interests: ["a"]` and the unknown key `work_experience`
    - `looking_for: ["exploring","exploring","finding-clubs"]` → `["exploring","finding-clubs"]`
    - a `saveDraft` → `loadDraft` round trip of all ten keys comes back unchanged
- `grep -n "^import" src/lib/onboarding/draft.ts` → nothing.
- Let `FILES` = `src/components/mobile/OnboardingMobile.tsx src/components/mobile/onboarding/OnbHeader.tsx src/components/mobile/onboarding/StepCampus.tsx src/components/mobile/onboarding/StepProfile.tsx src/components/mobile/onboarding/StepPhoto.tsx src/components/mobile/onboarding/SkipSheet.tsx`:
  - `rg -n 'Skip to resume|then your documents|photo, banner|Finish & open my profile|IU_CAMPUSES|DEFAULT_CAMPUS_ID|IU_MAJORS_BY_SCHOOL|api/me/handle|profile\.school|work_experience|resume_url|welcome=1' $FILES` → exactly one hit, the `"/campus?welcome=1"` fallback in `succeed`
  - `rg -n 'autoFocus|capture=' $FILES` → 0
  - `rg -n 'window\.location\.href\s*=' $FILES` → 1 (inside `leave`)
  - `rg -n 'overflow: "hidden"' src/components/mobile/OnboardingMobile.tsx` → 1 (the glow wrapper)
  - `rg -n 'pushState|replaceState' src/components/mobile/OnboardingMobile.tsx` → every hit spreads `window.history.state` and passes no url (the reviewer reads each one)
  - `rg -n '"indianapolis"' src/components/mobile/onboarding/StepCampus.tsx` → 1 (the Purdue link condition); `rg -n 'campusesForSystem\(' src/components/mobile/onboarding/StepCampus.tsx` → at least 1
  - `rg -n 'OnboardingMobile|NetworkMobile|CampusMobile' src/components/mobile/onboarding/{OnbHeader,StepCampus,StepProfile,StepPhoto,SkipSheet}.tsx` → comments only
- **Live replay check, zero writes** (375×812, signed in as Franky). Run it on `http://localhost:3000/onboarding?replay=1` before the wave pushes, and again on prod after deploy for G4. Before the first tap, install:
  ```js
  window.__onbProbe = 1; window.__nonGet = [];
  const __rec = (m, u) => { window.__nonGet.push([m, u]); try { sessionStorage.setItem("__nonGet", JSON.stringify(window.__nonGet)); } catch {} };
  const __f = window.fetch.bind(window);
  window.__overrides = {}; // url substring -> {status, body}, for GET overrides below
  window.fetch = (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (m !== "GET" && m !== "HEAD") { __rec(m, url); return Promise.reject(new TypeError("blocked by check")); }
    const hit = Object.keys(window.__overrides).find((k) => url.includes(k));
    if (hit) { const o = window.__overrides[hit]; return Promise.resolve(new Response(JSON.stringify(o.body), { status: o.status, headers: { "content-type": "application/json" } })); }
    return __f(input, init);
  };
  navigator.sendBeacon = (u) => { __rec("BEACON", String(u)); return false; };
  ```
  - Walk steps 1→6 with the footer. Use header Back 3→2 and `history.back()` 5→4, then go forward again. Tap every control:
    - every campus card; the Purdue link, then Send and Verify with `x@purdue.edu` / `12345678`
    - every profile field and a few handle edits
    - Choose a photo → crop → Confirm, then Change photo
    - the club row control, one person Follow, Share
    - both skip-sheet variants and Keep going
  - Finish last. On the resulting `/campus` page, `JSON.parse(sessionStorage.getItem("__nonGet") || "[]").length === 0`.
  - After every Back, `window.__onbProbe === 1` (no reload) and the earlier step still shows the typed values.
  - On each of the six steps, after `window.scrollTo(0, document.body.scrollHeight)`: `document.querySelector("header").getBoundingClientRect().top === 0`. Back is `visibility: hidden` only on step 1; Skip shows on all six.
  - Campus step: Franky's `campus_set_at` is null (read-only SQL 2026-09-16), so NO card starts selected. The IU cards come in `campusesForSystem("iu")` order with Indianapolis first. The Purdue link appears only while Indianapolis is picked and disappears when another card is picked.
  - Photo: his avatar shows with "Continue →" + "Change photo"; a crop swaps the circle to a `blob:` preview.
  - Skip sheet: the "saved" variant as-is. For "identity", clear Name on step 3 and tap Skip: the sheet's Name/Handle show step 3's values, and Escape closes it.
  - Clubs, live data: exactly one row, SAE — disabled "Joined ✓", sub "Members follow automatically", meta "@sae · Invite only", no chip, no officers line — and the footer reads "Continue →" (Franky is the owner).
  - Clubs with GET overrides set before entering step 5, one at a time:
    - SAE row with `role: null, join_state: "invite_only", org_follow_state: "not_following"` → "Follow", "Officers can see who follows this club.", footer "Skip for now". Tapping Follow → "Following ✓" and footer "Continue →".
    - `{ok:true, orgs:[]}` → "no clubs here yet" plus the Q11 body
    - status 500 → `LoadFailed` with Retry, never the empty state
  - Network: across Back/forward between steps 4–6 there's exactly one `/api/orgs?filter=discover` GET and one `/api/me/suggested-connections` GET.
  - Screenshots: each step at the bottom of its scroll, both skip variants, photo empty/done, the clubs rows above.
- **Code review confirms:**
  - no focus call on step entry
  - Back, Skip and the footer are disabled during an upload, and popstate is ignored while busy
  - `clearDraft(userId)` runs before `leave` on both the Finish and Skip success paths
  - replay never calls `loadDraft`, `createDraftSaver` or `clearDraft`, and never sets `vibe_tour_pending`
  - field errors map by `code`, never by `r.field`
  - no campus request when the pick equals `savedCampusId`
  - `onSystemChanged` doesn't mark an unconfirmed kept campus as saved
- **Franky's phone test** (writes, by hand, on a fresh account; never an agent):
  - a reload on step 3 comes back to step 3 with the typed values
  - "Take Photo" from the camera returns to step 4 with the photo saved
  - Finish lands on `/campus?welcome=1` with one `welcome`, the phone tour starts once, and `localStorage` has no `vibe_onb_draft_v1:` key
  - Skip from step 1 shows the identity variant, and Save & skip lands on `/campus?welcome=1`
  - the header stays pinned on iOS Safari while scrolling step 3
- **Wave review with B13** (after both land): `public/html/onboarding.html` has the same ten draft keys in the same order, and the local strings in items 8, 9 and 12 appear verbatim.

**Do not touch:** `src/app/onboarding/OnboardingSwitch.tsx`, `src/app/onboarding/page.tsx`, `src/app/onboarding/classic/*`, `src/lib/onboarding/boot.ts`, `src/lib/onboarding/finish.ts`, `onb-copy.ts`, `onb-theme.ts`, `social-steps.ts` (+ test), `StepClubs.tsx`, `StepPeople.tsx`, F5a's files, `src/components/ImageCropperModal.tsx`, `src/lib/profile/avatar-upload.ts`, `src/lib/profile/onboarding-prefill.ts`, `src/lib/iu/campuses.ts`, `src/lib/iu/majors.ts`, every `/api` route. That includes the legacy finish branch (`onboarding-complete/route.ts:218-282`), which stays for bundles cached on phones. Also `use-mobile-tour.ts`, `SettingsClient.tsx` and `public/html/onboarding.html` (B13).

---

### B13 · desktop onboarding: the same six steps in `public/html/onboarding.html`

**Owns:** `public/html/onboarding.html` (nothing else; the parity script and the fixture harness below live in the scratchpad and are never committed)
**Depends on:**
- B12S (§8, on `main` by G3): `ONB_COPY` + `fillCampus` (`src/components/mobile/onboarding/onb-copy.ts`) and `parseClubRows`, `isFollowingOrg`, `clubBand`, `orderClubRows`, `relationFor`, `anyClubFollowed`, `parseSuggestions`, `groupPeople`, `listState` (`src/lib/onboarding/social-steps.ts`). B13 mirrors them in plain JS; the scratchpad parity script (Acceptance) proves they match.
- F5a (§6): `ORG_COPY`, `orgRowView(rel, "onboarding")`, `inviteSubText`, `orgErrorCopy` (`src/lib/orgs/join-copy.ts`) and the control behaviour and failure lines of `OrgJoinControl.tsx` §C (`variant:"onboarding"`, `replay`). Plan §2.4 #3: onboarding has no club-row rule set of its own.
- F1 + F2 live (G2): `POST/DELETE /api/orgs/{handle}/follow` and `org_follow_state` on `/api/orgs?filter=discover` rows (§4.2).
- B12 (same wave, no shared file): the draft contract (`ONBOARDING_DRAFT_FIELD_KEYS`, `typedDraftFields`, `onboardingResumeStep` added to `src/lib/onboarding/draft.ts`), the request/code/copy rules per step, and the strings B12 keeps local. Where B12's section and this one disagree, B12 wins and the reviewer fixes this file.
- Existing, unchanged: `draft.ts` storage contract (`ONBOARDING_DRAFT_KEY_PREFIX`, `ONBOARDING_DRAFT_TTL_MS`, `readDraft`, `saveDraft`, `clearDraft`), `PHOTO_ERROR_COPY` + `uploadAvatar` (`src/lib/profile/avatar-upload.ts:26-31`, `:176-248`), `isSafeRelativePath` (`src/lib/auth/login-next.ts:22-36`), the boot tag (`src/app/onboarding/classic/route.ts:112-127`, `src/lib/onboarding/boot.ts` `injectOnbBoot`).

**Anchors:** no earlier wave edits `onboarding.html`; every `onboarding.html:N` below was re-read at HEAD `f23bc5d`. `draft.ts`, `onb-copy.ts`, `social-steps.ts`, `join-copy.ts` and `OrgJoinControl.tsx` are cited by export name (B12 edits `draft.ts` in this wave; the others don't exist at HEAD). Reader-note corrections: `.onb-skip[disabled]` is :52 (not :51); old steps 3–4 are :459-529; the skip overlay is :536-546; the confirmed-save `vibeSave` calls are :1406-1407 (not :1397); `completeOnboarding` is :1301-1444. The static `window.vibeRequest` twin (`public/html/_persistence.js:259-296`) ignores `signal` and `cache` and returns only `{ok, status, code, error, message, action}` on failure (no `field`, no `audience`), so field errors map by `code` and an `audience_mismatch` keeps the row's own `audience`. The desktop page is an iframe (`OnboardingSwitch.tsx:100-101`, viewports ≥ 900 px), so leaving goes through `window.__vibeTopNav` (`_persistence.js:56`) and `history.pushState` entries join the top window's Back stack.
**Scope limit:**
- no edits to `_persistence.js`, `_imageCropper.js`, `_iu-majors.js`, `OnboardingSwitch.tsx`, `classic/route.ts`, `boot.ts`, any `/api` route, or any TS file B12S/F5a/B12 own. Copy drift found in a TS source is reported to the orchestrator, never fixed here.
- no new student-facing strings beyond `ONB_COPY`, `ORG_COPY`, `PHOTO_ERROR_COPY`, `ORG_CONTROL_COPY` and `ONB_LOCAL_COPY` (item 1). Keep the custom cursor (:926-952), the boot reader (:575-586) and the hyperdrive (:1446-1473, CSS :279-330).

**Contract**

1. **One pure mirror block (evaluated by the parity script)**
   - Inside the page's one inline `<script>`, directly after the boot reader (:586), put a block fenced by the exact lines `/* ONB-PURE-MIRROR:START */` and `/* ONB-PURE-MIRROR:END */`. The block holds ONLY constants and pure functions: no `document`, `window`, `localStorage`, `location`, `fetch` or `navigator`, and no call at load time besides `Object.freeze`.
   - Contents, each a top-level `const`/`function` with exactly this name:
     - `ONB_COPY` = `Object.freeze({...})` whose `JSON.stringify` equals `onb-copy.ts`'s `ONB_COPY` (curly quotes, `—`, `…`, `→`, `✓`, `✗` included), and `fillCampus(t, campus, fallback)`.
     - `ORG_COPY`: `JSON.stringify` equal to `join-copy.ts`'s `ORG_COPY`. `PHOTO_ERROR_COPY`: equal to `avatar-upload.ts:26-31`.
     - `ORG_CONTROL_COPY = Object.freeze({ followFailed: "Couldn't follow this club.", unfollowFailed: "Couldn't unfollow this club.", joinFailed: "Couldn't join this org.", acceptFailed: "Couldn't accept the invite.", welcome: "You're in. Welcome to {org}.", busy: "…" })`, the F5a §C lines that live in `OrgJoinControl.tsx`, not in `ORG_COPY`.
     - `ONB_LOCAL_COPY = Object.freeze({ systemMissing: "We couldn't match your school email to a university yet. Try again later.", sendFailed: "Couldn't send the code.", verifyFailed: "Couldn't verify that code.", campusesLoadFailed: "Couldn't load your campuses.", campusSaveFailed: "Couldn't save your campus.", profileSaveFailed: "Couldn't save your profile.", handleCheckFailed: "Couldn't check that handle.", hintHandle: "how friends find you (3-20, letters/numbers/_)", hintBio: "up to 600 characters", hintInterests: "up to 10 items — comma or new-line separated", hintSkills: "up to 12 items, 30 chars each" })`. These are the strings B12 keeps local; re-read B12's items on `main` and match them character for character.
     - `orgRowViewOnboarding(rel)`: same output as `orgRowView(rel, "onboarding")` (the §6 table's onboarding column: `chip`, `actions` with `kind/label/sub/tone/disabled/href`, `layout`, `disclosure`, `meta`, `sub`). Plus `inviteSubText(firstName, expiresIso)` and `orgErrorCopy(code)`, same outputs as F5a.
     - The B12S helpers, same names and outputs: `parseClubRows`, `isFollowingOrg` (reads `org_follow_state`, `role`, `join_state`; never `follow_state` or `viewer_follows`), `clubBand`, `orderClubRows`, `relationFor`, `anyClubFollowed`, `parseSuggestions`, `groupPeople`, `listState`.
     - The campus model MOVED here unchanged from :595-651: `SYSTEM_LABEL`, `CAMPUS_ROWS`, `CAMPUS_FORMERLY`, `campusRowById`, `campusesForSystem`, `campusPickerSub`. `campusAllowed(id, system)` = `campusesForSystem(system).some(c => c.id === id)`.
     - Draft mirror: `DRAFT_KEY_PREFIX = "vibe_onb_draft_v1:"`, `DRAFT_TTL_MS = 14*24*60*60*1000`, `DRAFT_FIELD_KEYS` (the same ten keys, same order as `ONBOARDING_DRAFT_FIELD_KEYS`), `draftKey(userId)`, `readDraftRecord(raw, now)` (the `readDraft` rules: `v === 1`, finite `at`, expired at `now - at >= TTL`, future skew > 24 h rejected, step 1–6, `maxStep = max(step, valid maxStep ?? step)`, `sanitizeFields` caps 64 fields / 8000 chars / 100 list items / unsafe keys dropped), `buildDraftRecord({step, maxStep, fields}, now)` (the `saveDraft` record, or null when the step is invalid), `typedDraftFields(fields)` and `onboardingResumeStep(draft, saved)` (B12 item 2 rules).
     - `HANDLE_RE = /^[a-z0-9_]{3,20}$/`, `splitLinesToArray` (moved unchanged from :1006-1013), `isSafeRelativePath(next)` (same rules as `login-next.ts:22-36`), `safeImgSrc(v)` → `v` when it's a string starting with `https://`, or with `/` but not `//`; else null. `firstName(full)` → first whitespace-separated word of a trimmed string, or null.

2. **Delete (dead after the redesign)**
   - Markup: old steps 3–4 (:459-529: work experience, resume, `#btnFinish`); the campus block inside the profile step (:404-410); "Skip to resume" (:454); step 1's "Maybe later" (:370; the header Skip replaces it, and B12's step 1 has no second skip); the hard-coded texts of the step 1 intro and note (:367, :372) and the old skip-card copy (:539-540), which now come from `ONB_COPY` (item 3).
   - CSS: `.name-input*` / `.suggest-chip*` (:148-168), `.wx-*` and `.resume-*` (:213-251), `.onb-skip[disabled]{display:none}` (:52); drop `.suggest-chip` from `bindCursorHover`'s selector (:945).
   - Script: `state` (:560-565), `TOTAL_STEPS = 4` (:567; use `ONB_COPY.header.progress` with 6), `campusPicker` (:659-665), `IU_CAMPUSES` / `DEFAULT_CAMPUS_ID` (:671-682), `campusPickValue` / `setCampusError` / `onCampusChange` / `populateCampuses` (:684-778, legacy branch :725-738 included), `IU_MAJORS` (:781-802), `populateIuMajors` (:850-854), `IU_SCHOOLS` + `populateIuSchools` (:857-924), the three focus timers in `goToStep` (:973-975), `collectWorkExperience` (:989-1004), `collectProfileDraft` (:1048-1088, with its legacy `out.school` send :1076), the resume functions (:1090-1206), `bailOnboarding` (:1216-1232, its hard-coded `/campus` :1231), `FINISH_LABEL` / `setFinishBusy` / `sendBackToHandle` / `sendBackToCampus` / `campusRefusalCopy` (:1256-1299), and `completeOnboarding` (:1301-1444: the legacy `profile` body, the `/api/me/handle` claim :1415, the `welcome=1` append :1441).
   - Kept and reused: `readOnbBoot` / `ONB_BOOT` / `ONB_PREFILL` (:575-586), `IS_REPLAY` (:553; also true when `ONB_BOOT.replay === true`), `fillDatalist` (:804-815), `refreshMajorList` rewritten per item 7, `buildOttoConfig` (:1246-1254), `leaveViaLogo` (:1236-1239), `triggerHyperdrive`.

3. **Head, frame and header (CSS + markup)**
   - After `_iu-majors.js` (:18) add `<script src="/html/_imageCropper.js" defer></script>` (same include as `profile.html:22`). `window.openImageCropper` is read at tap time, never at load.
   - `.onb-top` (:43) becomes a full-width bar: `top:0; left:0; right:0; padding:22px 24px 18px; background:linear-gradient(to bottom, rgba(28,28,30,.96) 60%, rgba(28,28,30,0)); display:grid; grid-template-columns:44px auto 1fr auto; align-items:center; gap:8px`. `.progress-dots` (:66-71) keeps its fixed centre spot with `z-index:11` so it sits on the bar.
   - Header markup (:338-341), in order:
     - `<button type="button" class="onb-back" id="onbBack" aria-label="Back">←</button>` (44×44, `aria-label` set from `ONB_COPY.header.back` at boot); `style.visibility = "hidden"` on step 1
     - the logo link unchanged (`leaveViaLogo`, which now does nothing while busy)
     - an empty grid cell
     - `<button type="button" class="onb-skip" id="onbSkip">` with text `ONB_COPY.header.skip`, `min-height:44px; min-width:44px`, on EVERY step. `.onb-skip:disabled { opacity:.4 }`.
   - Dots (:343-349): six `.dot` elements; `#progressText` = `ONB_COPY.header.progress` with `{n}` → the step.
   - Replay pill (:351): text `ONB_COPY.header.replay`.
   - `.onb-step` (:78-83): `padding: 96px 20px 48px`. `.onb-step[data-step="2"]` (:171) → `[data-step="3"]`. The campus, clubs and people steps get `max-width:560px`, and their lists are `text-align:left; width:100%`.
   - Every static string on the page comes from the copy objects: elements carry `data-copy="hello.note"` (a dotted path into `ONB_COPY`), and one boot function `applyCopy()` sets `textContent` from it. Placeholders are set in JS from the same objects. The h1 "i'm otto." (:366) stays as markup.
   - New CSS, dark palette, every tappable control `min-height:44px`: `.onb-back`; `.campus-list` / `.campus-card` (a label row with the radio, a title row, a sub-line; selected = `border-color: var(--accent)`) / `.campus-tag` / `.campus-soon` (pills); `.pick-row` (40 px round logo or avatar, text column, controls) / `.pick-chip` / `.pick-meta` / `.pick-sub` (12 px, `rgba(255,255,255,.5)`) / `.pick-actions` (`.line` = full-width row under the text with two `flex:1` pills; `.slot` = right-hand column) / `.pick-btn.filled|outline|quiet`; `.skel` rows; `.group-label`; `.photo-circle` (132 px).

4. **State, restore and the draft mirror**
   - Module state (one object `onb`): `system` (from `ONB_BOOT.system` when `"iu"|"purdue"`, else null), `preselectId` (`ONB_BOOT.singleCampusId` when `campusAllowed`), `campusId`, `savedCampusId`, `identitySaved`, `profileDirty`, `avatarUrl`, `step`, `maxStep`, `busy` (`savingCampus || savingProfile || switching || uploading || finishing || skipping`), `clubs = {status:"idle", rows:[], local:{}, disabled:{}}`, `people = {status:"idle", list:[], followed:{}, busy:{}, removed:{}}`, `done` (set on Finish/Skip success).
   - Restore, the same rules as B12 item 4 (not in replay; not without `ONB_BOOT.userId`):
     - `raw` = `localStorage.getItem(draftKey(userId))` in try/catch; `draft = readDraftRecord(raw, Date.now())`; an unreadable or expired draft is removed (try/catch). `d = typedDraftFields(draft?.fields)`.
     - Inputs: name, bio, major, department → `d.<key> ?? prefill.<key> ?? ""`; `looking_for` → `d.looking_for ?? prefill.looking_for`, filtered to the four checkbox values; year → `d.year ?? (prefill.year ? String(Math.min(5, prefill.year)) : "")`; interests / skills → `d.<key> ?? prefill.<key>.join(", ")`; handle → `prefill.hasRealHandle ? prefill.handle : (d.handle ?? "")`.
     - `campusId`: `!prefill.campusConfirmed && campusAllowed(d.campus_id, system)` → `d.campus_id`; else the phone's order at `OnboardingMobile.tsx:263-270` (the allowed single-campus preselect, then a confirmed allowed prefill campus), else `""`. Nothing else preselects (ac014a3). This flips today's desktop order at :766 (confirmed first); the two only differ for a confirmed campus plus an @pfw.edu / @pnw.edu address, and the reviewer confirms B12 kept that order.
     - `savedCampusId = prefill.campusConfirmed && campusAllowed(prefill.campusId, system) ? prefill.campusId : null`; `identitySaved = !!prefill.hasRealHandle && !!prefill.name`; `avatarUrl = safeImgSrc(prefill.avatarUrl)`; `profileDirty` = the draft restored any profile key.
     - `step = IS_REPLAY ? 1 : onboardingResumeStep(draft, {campusId: prefill.campusId, campusConfirmed: prefill.campusConfirmed, hasRealHandle: prefill.hasRealHandle, systemKnown: !!system})`; `maxStep = max(step, draft?.maxStep ?? step)`.
   - Saving (never in replay, never after `done`, only with a userId):
     - `scheduleDraft()` on every `input`/`change` in steps 2–3 and the skip sheet, and on every step change: clear the timer, then after 300 ms write `JSON.stringify(buildDraftRecord({step, maxStep, fields}, Date.now()))` with `fields = {campus_id, name, handle, bio, major, department, year, interests, skills, looking_for}` (interests / skills as the raw textarea text).
     - `flushDraft()` runs the pending write now; it's called on `visibilitychange` → hidden and on `pagehide`.
     - `clearDraftNow()`: clear the timer, set `done = true`, `removeItem(draftKey(userId))`. Every storage touch is in try/catch. The photo is never in the draft.

5. **History and busy (Back = header Back = browser Back)**
   - Every `pushState` / `replaceState` passes `Object.assign({}, history.state, {onbStep: n})`, `""`, and NO url (the iframe URL never changes).
   - On load (replay included; its `step` is 1): if `typeof history.state?.onbStep === "number"` (a reload mid-flow) → `replaceState` with `onbStep: step`; else `replaceState` with `onbStep: 1`, then `pushState` for `s = 2..step`.
   - `showStep(n)` replaces `goToStep` (:955-976): toggles `.active`, replays the step animation (:964-965), `updateProgress()`, `#onbBack` visibility, `bindCursorHover()`, `window.scrollTo({top:0})`, `scheduleDraft()`, then the step's enter hook (step 3 → `refreshMajorList()`; step 5 → `loadClubs()` when idle; step 6 → `loadPeople()` when idle). No focus call on any step change.
   - `goForward(n)`: `pushState` with `onbStep: n`, `maxStep = max(maxStep, n)`, `showStep(n)`.
   - `#onbBack` click → `history.back()`.
   - `popstate`: `n = clamp(e.state?.onbStep ?? 1, 1, maxStep)`. While `busy`, `pushState` with `onbStep: step` and ignore. Else `showStep(n)`. Back never clears input or undoes a saved write.
   - `setBusy(flag, value)`: updates the flag, then disables `#onbBack`, `#onbSkip`, the logo's leave and every footer CTA while any flag is set.
   - Sending the student back from Finish/Skip: clear busy FIRST, set the target field's error text (all steps stay in the DOM), THEN `history.go(target - step)`.

6. **Steps 1–2: hello and campus**
   - Step 1: the orb and h1 as today; `.intro` = `hello.intro`; `.note` = `hello.note`; one CTA `hello.cta` → `goForward(2)`.
   - Step 2 markup (new `<section class="onb-step" data-step="2">`): `otto-sm` orb; `h2#onbCampusTitle` = `campus.title`; `.sub-intro#onbCampusOtto` = `campus.ottoIu` or `campus.ottoPurdue` by `system`; `div#onbCampusGroup.campus-list` with `role="radiogroup"`, `aria-labelledby="onbCampusTitle"`, `aria-describedby="onbCampusNote"`; `p#onbCampusError.pf-error` `role="alert"` hidden; `p#onbCampusNote.pf-hint` = `campus.note` with every `{system}` → `SYSTEM_LABEL[system]`; `p#onbSystemMissing` hidden; the Purdue link and panel; CTA `#onbCampusContinue`.
   - `renderCampusCards()` (createElement only), one card per `campusesForSystem(system)` in that order: `<label class="campus-card">` holding `<input type="radio" name="onb-campus" value={id}>` (checked when `id === campusId`), a title row with `shortName`, then `span.campus-tag` = `campus.fromEmailTag` when `id === preselectId`, then `span.campus-soon` = `campus.notOpen` when `!isOpen`, and a sub-line `campusPickerSub(row, system)`. A change sets `campusId`, clears the error, re-renders the Purdue link, `scheduleDraft()`.
   - `system === null`: no cards, no note, no Purdue link; show `#onbSystemMissing` (`role="status"`) = `ONB_LOCAL_COPY.systemMissing` (identical to `onboarding-step/route.ts:166`).
   - Errors: `setCampusError(text)` fills `#onbCampusError`, sets `aria-invalid="true"` on the group and switches `aria-describedby` to `onbCampusError`; empty text reverses both.
   - Purdue switch (Q8; B12 item 8 is the source of truth), rendered only when `system === "iu" && campusId === "indianapolis"`:
     - `button#onbPurdueLink` (text button, min 44 px) = `campus.purdueLink` opens `div#onbPurdueSwitch`: `label` `campus.switchLabel` for `input#onbPurdueEmail` (`type=email`, `autocomplete=off`, `autocapitalize=off`, placeholder `campus.switchPlaceholder`), `button` `campus.switchSend`, a code row hidden until sent (`label` `campus.switchCodeLabel`, `input#onbPurdueCode` `inputmode=numeric autocomplete=one-time-code`, digits only, max 8; `button` `campus.switchVerify`, enabled at 8 digits), `button` `campus.switchCancel` (closes, clears both inputs), and `p#onbPurdueMsg` `role="alert"`. Each request sets `setBusy("switching", …)` around it.
     - Send (`switchSend` / `switchSending`): `email.trim()` must match `/^[^\s@]+@purdue\.edu$/i`, else the message `campus.switchWrongDomain`. Then `window.vibeRequest("/api/auth/school-email/request", {method:"POST", json:{schoolEmail}, quiet:true, failure: ONB_LOCAL_COPY.sendFailed})`: ok → message `campus.switchSent` and the code row shows; ok with `r.data.alreadyVerified === true` → straight to the re-read; fail → message `r.error || r.message`.
     - Verify (`switchVerify` / `switchVerifying`): `POST /api/auth/school-email/confirm-code` `{schoolEmail, code}` (quiet, failure `verifyFailed`). ok → the re-read `GET /api/campuses` (quiet, failure `ONB_LOCAL_COPY.campusesLoadFailed`):
       - ok with `r.data.system` in `"iu"|"purdue"` → `system` = it; `campusId` = `""` unless still allowed; `savedCampusId` survives only when allowed in the new system AND `=== r.data.currentCampusId`, else null (B12 item 8: a kept shared campus isn't stamped confirmed); `preselectId` = null unless allowed; reset clubs and people (item 9); re-render cards, Otto line and note; close the panel; `vibeToast(campus.switchDone)`
       - re-read failed → the same toast, `flushDraft()`, then `location.reload()` (the new boot carries the new system)
       - verify fail → message `r.error || r.message`
     - Replay: the panel opens and checks the domain, but Send and Verify send NOTHING (Send shows the code row; Verify toasts `switchDone` and changes nothing).
     - Agents never submit this panel on prod: it sends a real email.
   - `#onbCampusContinue` (`campus.continue`; `campus.saving` while saving), in order:
     - `system === null` → `goForward(3)` with no request.
     - no pick → `setCampusError(campus.required)`; a pick not in `campusesForSystem(system)` → `campus.invalid`. Both scroll `#onbCampusGroup` into view (`block:"center", behavior:"smooth"`) and stay.
     - `IS_REPLAY` → `goForward(3)`, no request.
     - pick `=== savedCampusId` → `goForward(3)` with no request (the limiter is 30 per 10 min, shared with profile saves: `onboarding-step/route.ts:28-29`, `:94-98`).
     - else `setBusy("savingCampus", true)` and `window.vibeRequest("/api/me/onboarding-step", {method:"POST", json:{step:"campus", campus_id}, quiet:true, failure: ONB_LOCAL_COPY.campusSaveFailed})`. ok → `savedCampusId = pick`, reset clubs and people, `goForward(3)`. `r.code` in `campus_invalid | campus_change_too_soon | system_missing | campus_not_ready` (`route.ts:40`, `:166`, `:188`, `:212`) → `setCampusError(r.error || campus.invalid)`. Anything else → `vibeToast(r.message, {tone:"error", action: r.action})`. Busy clears in every branch.

7. **Step 3: profile** (the old step 2 section :375-457, renumbered `data-step="3"`; B12 item 9 is the source of truth)
   - `h2` = `profile.title`; `.sub-intro` = `profile.sub`. Fields in today's order minus the campus block: Name, Handle, Bio, Major, Department, Year, Interests, Skills, What are you here for?. Keep the ids `pfName`, `pfHandle`, `pfBio`, `pfMajor`, `pfDepartment`, `pfYear`, `pfInterests`, `pfSkills`, `.pf-looking`, the `maxlength`s, the year options (:424-429), the handle box (:392-398) and the four checkbox values (:444-447).
   - Labels are plain `label.pf-label[for]` with `profile.labels.*` (the inline grey spans at :391, :401, :412, :417, :433, :438 go). Hints, as `p.pf-hint` under the field: handle `ONB_LOCAL_COPY.hintHandle`, bio `hintBio`, interests `hintInterests`, skills `hintSkills`; delete the interests hint at :435. Looking-for becomes `<fieldset>` + `<legend class="pf-label">` = `profile.labels.lookingFor`.
   - Errors: `p#pfNameError` / `p#pfHandleError` `.pf-error` `role="alert"` hidden; setting one sets `aria-invalid` + `aria-describedby` on its input, clearing reverses both. Typing in a field clears its error and sets `profileDirty = true`.
   - `refreshMajorList()` (rewrite of :824-848): `list = system && campusId && typeof window.vibeMajorsForCampus === "function" ? window.vibeMajorsForCampus(campusId, system) : null` (`_iu-majors.js:861`); datalists `iuMajors` / `iuSchools` filled from `list.majors` / `list.schools` (empty when null); `#pfMajorHint` = `list && list.majors.length && list.label ? profile.majorHintList with {label} : profile.majorHintFree`; keep the placeholder swap at :844-847.
   - Handle check (rewrite of `onHandleInput` :1021-1046; the static twin drops `signal`, so the sequence guard stays):
     - `v = raw.trim().toLowerCase().slice(0, 20)`; write it back; `++seq`; clear the timer; clear the handle error; `profileDirty = true`
     - `""` → no status; `!HANDLE_RE.test(v)` → `profile.handleFormat`
     - else `profile.handleChecking`, then after 280 ms `window.vibeRequest("/api/handle/check?h=" + encodeURIComponent(v), {quiet:true, failure: ONB_LOCAL_COPY.handleCheckFailed})`; drop the answer when `seq` moved on
     - `!r.ok` → `profile.handleUnchecked` (never "taken", critic D5); `r.data.available === true` → `profile.handleAvailable`; else `reason = String(r.data.reason ?? "taken").toLowerCase()` → `"taken"` → `profile.handleTaken`, otherwise `profile.handleReason` with `{reason}`
     - colours: `#1A9E5B` available; `#C54323` taken / reason / format; `#8A8580` otherwise (today's :1033-1044)
   - `#onbProfileContinue` (`profile.continue`; `profile.saving` while saving) and the note `profile.changeLater`:
     1. client checks in order: empty trimmed name → `profile.nameRequired` (focus `#pfName`); empty handle → `handleRequired`; `!HANDLE_RE` → `handleInvalid` (focus `#pfHandle`). Focus here answers a click.
     2. `IS_REPLAY` → `goForward(4)`.
     3. `setBusy("savingProfile", true)`; `window.vibeRequest("/api/me/onboarding-step", {method:"POST", json: Object.assign({step:"profile"}, profileStepBody()), quiet:true, failure: ONB_LOCAL_COPY.profileSaveFailed})`, where `profileStepBody()` = `{name: name.trim(), handle, bio, major, department, year: year === "" ? null : Number(year), interests: splitLinesToArray(interests, 10, 40) ?? [], skills: splitLinesToArray(skills, 12, 30) ?? [], looking_for}`. Every key is always sent: an empty value clears the column (`onboarding-prefill.ts:232-238`).
        - ok → `identitySaved = true`, `profileDirty = false`, `goForward(4)`
        - `r.code === "name_required"` → name error `r.error`
        - `handle_required | handle_invalid | handle_reserved | handle_taken | handle_cooldown` → handle error `r.error` (`handle_taken` also sets the status `profile.handleTaken`); focus the field
        - `profile_invalid` → `vibeToast(r.error || r.message, {tone:"error"})`
        - else → `vibeToast(r.message, {tone:"error", action: r.action})`

8. **Step 4: photo** (new `<section data-step="4">`)
   - `h2` `photo.title`; `.sub-intro` `photo.otto`; `div#onbPhotoCircle.photo-circle` holding an `<img alt="">` when `avatarUrl` is set (via `safeImgSrc`, or a `blob:` URL from `URL.createObjectURL` in replay, revoked when replaced and on `pagehide`), else the name's first letter uppercased (`"?"` when empty) on `rgba(255,255,255,.08)`; `p#onbPhotoError.pf-error` `role="alert"` hidden; `<input type="file" id="onbPhotoInput" accept="image/jpeg,image/png,image/webp" hidden>` with no `capture`, and its `value` reset to `""` on every click.
   - Buttons: `avatarUrl` empty → primary `photo.choose` (clicks the input) + secondary `photo.skip` → `goForward(5)`; uploading → primary disabled `photo.uploading` (Back and Skip disabled through `busy`); `avatarUrl` set → primary `photo.continue` → `goForward(5)` + secondary `photo.change` (clicks the input).
   - Input `change`:
     - no file → stop. `file.type` set and not starting with `image/` → error `PHOTO_ERROR_COPY.wrongType`; stop (B12 item 10: a decodable `image/heic` must reach the cropper, whose JPEG output then passes the preflight). Else clear the error.
     - `const blob = await window.openImageCropper(file, {aspect:1, shape:"circle", outputMaxSize:768, outputQuality:0.92, dismissOnBackdrop:false, onError: m => setPhotoError(m)})` (`_imageCropper.js:81-92`; `onError` fires before the modal closes itself and resolves null). `null` → stop.
     - Replay → revoke any earlier object URL, preview `URL.createObjectURL(blob)`, no request.
     - Else `setBusy("uploading", true)` and mirror `uploadAvatar` (`avatar-upload.ts:176-248`):
       1. preflight (`preflightAvatarBlob`, `avatar-upload.ts:69-93`): size > 0 (else `processFailed`); the type normalized (`""` / `image/jpg` → `image/jpeg`, parameters dropped) and in `image/jpeg|png|webp` (else `wrongType`); size ≤ `4 * 1024 * 1024` (else `tooBig`)
       2. `fd.set("file", <blob re-typed to the normalized type>, "avatar." + ext)`, `fd.set("kind", "avatar")`; `window.vibeRequest("/api/me/profile-upload", {method:"POST", body: fd, quiet:true, failure: PHOTO_ERROR_COPY.uploadFailed})`
       3. `r.status` 401 / 429, or 403 with `terms_required` → error `r.message` plus `vibeToast(r.message, {tone:"error", action: r.action})` when `r.action`; 413 or (400 and `r.error === "Invalid file size"`) → `tooBig`; 400 and `"Unsupported file type"` → `wrongType`; other failures, or no string `r.data.url` → `uploadFailed`
       4. `PATCH /api/me/profile` `{avatar_url: url}` (quiet, failure `uploadFailed`): 401 / 429 / `terms_required` as above; other failures → `uploadFailed`; ok with an object `r.data.profile` whose `avatar_url !== url` → `uploadFailed`
       5. success → `avatarUrl = url`, clear the error, re-render. Busy clears in every branch.

9. **Step 5: follow clubs** (new `<section data-step="5">`; mirrors B12S `StepClubs` + F5a `OrgJoinControl variant="onboarding"`)
   - Markup: `h2` `clubs.title` (Q10); `.sub-intro` `clubs.sub`; `input#onbClubsSearch.pf-input` (placeholder `clubs.search`, hidden until more than 8 rows); `p#onbClubsSparse.pf-hint`; `div#onbClubsList` (`role="list"`); `div#onbClubsEmpty` (title + body); CTA `#onbClubsContinue`.
   - `loadClubs()` when `clubs.status === "idle"` (replay loads too; reads are allowed): status `loading` → three `.skel` rows → `window.vibeRequest("/api/orgs?filter=discover", {quiet:true, failure: clubs.loadFailed})`.
     - ok → `rows = orderClubRows(parseClubRows(r.data.orgs))`, computed ONCE; taps never re-sort.
     - fail → status `failed` and `window.vibeLoadFailed(listEl, window.vibeLoadFailure(r, clubs.loadFailed), () => { clubs.status = "idle"; loadClubs(); }, {tone:"dark"})` (`_persistence.js:337-407`). NEVER the empty state on a failure.
     - Never send `q`: discover's `q` widens to the whole university (`api/orgs/route.ts`, the discover branch's `q` handling; F2 edits that file, so re-grep).
   - `resetClubs()` (after a campus save that changed `savedCampusId`, or a system switch): `{status:"idle", rows:[], local:{}, disabled:{}}` and empty the list.
   - Render (createElement + `textContent` only):
     - 0 rows → `#onbClubsEmpty`: title `clubs.emptyTitle`, body `fillCampus(clubs.emptyBody, campusShortName, <fallback>)` (Q11), where `campusForSteps = savedCampusId ?? (campusAllowed(campusId, system) ? campusId : null)` and `campusShortName = campusRowById(campusForSteps)?.shortName ?? null` (B12 item 11) and `<fallback>` is whatever `StepClubs.tsx` passes on `main` (re-read it; if it's a literal, it joins `ONB_LOCAL_COPY`).
     - `listState(rows.length) === "sparse"` → `#onbClubsSparse` = `campusShortName ? fillCampus(clubs.sparse, campusShortName, clubs.sparseNoCampus) : clubs.sparseNoCampus`.
     - search: case-insensitive substring on `name` and `handle`; rows that don't match get `hidden`.
   - One `.pick-row` per row (`role="listitem"`), re-rendered IN PLACE after each change:
     - `rel = relationFor(row, clubs.local[row.id])`, `view = orgRowViewOnboarding(rel)`
     - 40 px round logo: `<img alt="">` when `safeImgSrc(row.logo_url)`, else the name's first letter
     - name (one line, ellipsis) + `" ✓"` when `row.verified`; `view.chip` as `span.pick-chip` when non-null
     - meta `["@" + row.handle].concat(view.meta).join(" · ")`; no member or follower counts anywhere (C13, C27)
     - sub: `view.sub ?? (rel.state === "invited" && row.pending_invite ? inviteSubText(firstName(row.pending_invite.invited_by_name), row.pending_invite.expires_at) : null)`
     - `view.disclosure` as `p.pick-sub`
     - `div.pick-actions` with class `line` or `slot` from `view.layout`; one `button.pick-btn.<tone>` per action: `textContent = label`, `disabled = action.disabled || clubs.disabled[row.id]`, `aria-pressed` on `follow` (`"false"`) and `unfollow` (`"true"`), `min-height:44px`. The row body is NOT a link.
   - Tap (per-row busy: every button in the row disabled, the pressed one reads `ORG_CONTROL_COPY.busy` with `aria-busy="true"`; no optimistic flip, plan §2.4 #5). `setLocal(patch)` merges into `clubs.local[row.id]` (`{state, following, role}`), then the row and the footer label re-render:
     - `IS_REPLAY` → no request: `follow` → following true; `unfollow` → following false; `join` / `accept` → state `member`, following true, role `"member"`.
     - `follow`: `POST /api/orgs/${encodeURIComponent(handle)}/follow` `json {source:"onboarding"}`, failure `ORG_CONTROL_COPY.followFailed`. ok → following true. `r.code === "not_found"` → `vibeToast(orgErrorCopy("not_found"))` + `clubs.disabled[id] = true`.
     - `unfollow`: `DELETE` the same URL (no body), failure `unfollowFailed`. ok → following false. `r.status === 409 && r.code === "member_follows"` → state `member`, following true, toast `orgErrorCopy("member_follows")`.
     - `join` / `accept`: `POST /api/orgs/${encodeURIComponent(handle)}/join` `json {}`, failure `joinFailed` / `acceptFailed`.
       - ok `r.data.joined === true` → state `member`, role `r.data.role`, following true; `accept` also toasts `ORG_CONTROL_COPY.welcome` with `{org}` → `row.name`
       - ok `r.data.pending === true` → state `requested`
       - `invite_only` → `invite_only`; `audience_mismatch` → `audience_blocked` (the row's own `audience` stays); `school_unverified` → `unverified` (no toast for these three)
       - `not_found` → toast + disable (as above); `org_hidden` → toast `orgErrorCopy("org_hidden")`
     - any call: `r.status === 429` → toast `orgErrorCopy("429")` (F5a's 429 line; re-read its key on `main`); anything else → `vibeToast(r.message, {tone:"error", action: r.action})` (keeps `terms_required`'s Review Terms).
   - Footer `#onbClubsContinue`: `anyClubFollowed(clubs.rows, clubs.local) ? clubs.continue : clubs.skipForNow`; both → `goForward(6)`.

10. **Step 6: follow people** (new `<section data-step="6">`; mirrors B12S `StepPeople`)
   - Markup: `h2` `people.title`; `.sub-intro#onbPeopleOtto`; `div#onbPeopleTop` (sparse line + Share); `div#onbPeopleList`; `div#onbPeopleEmpty`; CTA `#onbFinish`.
   - Otto line: `campusShortName === null` → `people.ottoNoCampus`; `(campusRowById(campusForSteps)?.systems.length ?? 0) > 1` → `fillCampus(people.ottoShared, …)`; else `people.ottoSingle`.
   - `loadPeople()` when idle: `window.vibeRequest("/api/me/suggested-connections?limit=25", {quiet:true, failure: people.loadFailed})` → `list = parseSuggestions(r.data.suggestions)` (`suggested-connections/route.ts:427`); fail → `vibeLoadFailed` with Retry, never the empty state. Cached for the session; `resetPeople()` runs beside `resetClubs()`.
   - States: `listState(list.length)`: `empty` → `people.emptyTitle` + (`campusShortName ? fillCampus(people.emptyBody, …) : people.emptyBodyNoCampus`) + a Share button; `sparse` → `people.sparse` + Share above the rows. No "Follow all".
   - Groups: `groupPeople(list, {system, campusShortName})`; one `div.group-label` per group (`label`), then rows. A person row: 40 px avatar (`safeImgSrc`, else initial), name (fallback `"@" + handle`), meta `["@" + handle, major].filter(Boolean).join(" · ")`, a button `people.follow` / `people.following` with `aria-pressed`. `people.removed[id]` rows are hidden.
   - Toggle (per-person busy; optimistic, plan §2.4 #5): flip `followed[id]`, re-render, then `window.vibeRequest("/api/me/follow", {method: was ? "DELETE" : "POST", json:{target_id: id}, quiet:true, failure: was ? people.unfollowFailed : people.followFailed})` (`api/me/follow/route.ts:42`, `:107`). Fail → roll back; `r.status === 403` (block, `:87`) → `removed[id] = true`, no toast; else toast `r.message` with `r.action`. Replay → local flip only.
   - Share (`people.share`): `navigator.share` exists → `navigator.share({title:"Vibe", url: location.origin})`; a rejection named `AbortError` is silent. Missing API or any other error → `window.vibeCopy(location.origin, people.copied)` (`_persistence.js:299`).
   - The Finish button is item 11's.

11. **Finish** (`#onbFinish`: `people.finish`; `people.finishing` while busy; B12 item 12 is the source of truth)
   - `IS_REPLAY` → disable it, `triggerHyperdrive(() => window.__vibeTopNav("/campus"))`. No request, no draft, no tour flag, no `vibeSave` (today's replay writes two caches and goes to `/profile`, :1324-1330).
   - Else `setBusy("finishing", true)`; `window.vibeRequest("/api/me/onboarding-complete", {method:"POST", json:{v:2, otto_answers: buildOttoConfig()}, quiet:true, failure: people.finishFailed})` (`onboarding-complete/route.ts` `finishV2` :119-191; rules `finish.ts:132-150`).
   - ok → `succeed(r.data.next)`, shared with Skip, in this order:
     1. `clearDraftNow()` (sets `done`, so no later save can bring the draft back)
     2. `try { localStorage.setItem("vibe_tour_pending", "campus") } catch {}`
     3. `vibeSave("vibe_otto_v1", ottoConfig)` and `vibeSave("vibe_user_v1", {name, tagline:"", headline:"", location:"", vibeTags:[], _onboarded:true})`, kept from :1311-1318 and :1406-1407 because `_otto.js:24` and `profile.html:31-43` read that cache. Desktop only; the phone never wrote it.
     4. `dest = typeof next === "string" && isSafeRelativePath(next) ? next : "/campus?welcome=1"`, used VERBATIM (`finish.ts:47`; never append `welcome=1`, critic D8)
     5. `triggerHyperdrive(() => window.__vibeTopNav(dest))`
   - Failure: `setBusy("finishing", false)` FIRST, then:
     - `name_required` | `handle_required` → that field's error = `r.error`, then `history.go(3 - step)`
     - `campus_required` | `campus_invalid` → `system` set: `setCampusError(r.error)`, then `history.go(2 - step)`; `system === null`: `vibeToast(r.error || r.message, {tone:"error"})` and stay
     - else → `vibeToast(r.message, {tone:"error", action: r.action})` (`terms_required` keeps Review Terms; a 429 `rate_limited` shows the mapped line)

12. **Skip sheet** (rewrite of `#skipOverlay` :536-546 and the skip flow :1208-1243; B12 item 13 is the source of truth)
   - Markup: `div#skipOverlay.confirm-overlay` holding `div.confirm-card` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby="skipTitle"`: `#skipTitle` = `skip.title`; `#skipBody`; `div#skipIdentity` (hidden in the saved variant) with `label[for=skipName]` `profile.labels.name` + `input#skipName` (`autocomplete=name`), `p#skipNameError` `role="alert"`, `label[for=skipHandle]` `profile.labels.handle` + an `@` box with `input#skipHandle` + `span#skipHandleStatus`, `p#skipHandleError` `role="alert"`; `button#skipPrimary.btn-coral`, `button#skipSecondary.btn-skip-step`.
   - Opens from `#onbSkip` and the logo (`leaveViaLogo`: replay → `__vibeTopNav("/campus")`, else open), both ignored while busy. On open, focus `#skipPrimary` (never an input); on close, focus returns to `#onbSkip`. The backdrop click and Escape (:1241-1243) close it ONLY when `!busy`.
   - `#skipName` / `#skipHandle` are two views of the step-3 values: typing in either writes `#pfName` / `#pfHandle` (and back), runs the same handle check (item 7, status in both spans), clears the field's errors, sets `profileDirty` and schedules the draft.
   - Variant: `forceIdentity ? "identity" : (IS_REPLAY ? (!!name.trim() && HANDLE_RE.test(handle)) : identitySaved) ? "saved" : "identity"`. `forceIdentity` resets when the sheet closes.
     - saved: body `skip.bodySaved`; primary `skip.keepGoing` (closes); secondary `skip.skipAnyway` (`skip.skipping` while busy) → `runSkip()`.
     - identity: body `skip.bodyIdentity`; primary `skip.saveAndSkip` (`skip.saving` while busy) → `runSkip()`; secondary `skip.keepGoing`.
   - `runSkip()`, in order:
     1. `IS_REPLAY`: the identity variant runs the step-3 client checks (errors in the sheet; stop on a failure); then `window.__vibeTopNav("/campus")`. No request.
     2. `setBusy("skipping", true)`.
     3. `campusAllowed(campusId, system) && campusId !== savedCampusId` → POST the campus step (quiet, failure `campusSaveFailed`); ok → `savedCampusId = campusId`; a failure is ignored (campus is optional on skip, `finish.ts:145`).
     4. variant identity OR `profileDirty`: the step-3 client checks (a failure → `forceIdentity`, errors under the sheet fields, stop), then the profile step POST with `profileStepBody()`. Field codes (item 7) → `forceIdentity` + `r.error` under the sheet field, stop; other failures → toast `r.message` + `r.action`, stop; ok → `identitySaved = true`, `profileDirty = false`.
     5. `window.vibeRequest("/api/me/onboarding-complete", {method:"POST", json:{v:2, otto_answers: buildOttoConfig(), skip:true}, quiet:true, failure: skip.failed})`: ok → `succeed(r.data.next)` (item 11; this is the fix for today's hard-coded `/campus`, :1231); `name_required` | `handle_required` → `forceIdentity` + that field's error = `r.error`; else toast `r.message` + `r.action`.
     6. `setBusy("skipping", false)` on every path that doesn't navigate.

13. **Safety rules for the whole file**
   - Server-provided text (org names and handles, people names, handles and majors, `invited_by_name`, `r.error`, `r.message`, `r.data.message`) reaches the DOM only through `textContent` or `createElement`. `innerHTML` is used only to empty an element (`= ''`: `fillDatalist` :813, the warp overlay :1466). No `outerHTML`, `insertAdjacentHTML` or `document.write`. This page is same-origin with the app, so one `innerHTML` with a name is a stored-XSS hole.
   - `img.src` is only ever `safeImgSrc(value)` or a `blob:` URL the page created itself.
   - Leaving the page is only `window.__vibeTopNav(...)` (Finish, Skip, replay, logo) or `location.reload()` (the Purdue re-read fallback). No `window.location.href =` assignment remains.
   - Replay makes no non-GET request anywhere (steps, photo, clubs, people, Purdue panel, Finish, Skip) and never reads or writes the draft.
   - Org follow fields are read only as `org_follow_state` (§4.2); the follow `source` is always `"onboarding"`; no counts are rendered; `filter=mine` is never called.

**Acceptance** (`$S` = the scratchpad directory; nothing below writes to production)
- `npx tsc --noEmit` exits 0 (no TS is touched; this confirms the wave still compiles). There's no eslint baseline for this file.
- Inline scripts parse. Extract every `<script>` without `src` and not `type="application/json"`, then check each:
  `S="$S" node -e 'const fs=require("fs");const h=fs.readFileSync("public/html/onboarding.html","utf8");let i=0;for(const m of h.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g))fs.writeFileSync(process.env.S+"/onb-inline-"+(i++)+".js",m[1]);console.log(i)' && for f in "$S"/onb-inline-*.js; do node --check "$f"; done` → prints 1, no syntax errors.
- Parity: `node --experimental-strip-types "$S/onb-parity.mjs"` exits 0. The script registers the resolver from `src/lib/onboarding/finish.test.ts:17-45` with `SRC_ROOT = pathToFileURL("/Users/franciscocazares/vibe/src/")`, dynamic-imports `onb-copy.ts`, `join-copy.ts`, `social-steps.ts`, `avatar-upload.ts`, `draft.ts`, `login-next.ts`, `@/lib/iu/campuses` and `@/lib/onboarding/boot`, then slices `onboarding.html` between the two `ONB-PURE-MIRROR` lines and evaluates it SAME-REALM with `new Function(block + "\nreturn {ONB_COPY, ORG_COPY, …every item 1 name…};")()` (a `vm` context would break `deepStrictEqual` on prototypes). It asserts:
  - `JSON.stringify` equal for `ONB_COPY`, `ORG_COPY`, `PHOTO_ERROR_COPY`; `DRAFT_FIELD_KEYS` deep-equals `ONBOARDING_DRAFT_FIELD_KEYS`; `DRAFT_KEY_PREFIX` / `DRAFT_TTL_MS` equal the `draft.ts` constants
  - `orgRowViewOnboarding(rel)` deep-equals `orgRowView(rel, "onboarding")` for all 10 `OrgDisplayState` × following {true, false} × joinPolicy {open, request, invite} × reason {policy, visiting, null} × audience {both, iu, purdue} (role `"member"` for member, else null); `inviteSubText` for `("Sam", "2026-10-01T12:00:00Z")`, `(null, …)` and an invalid date; `orgErrorCopy` for `not_found`, `429`, `member_follows`, `org_hidden`, `invite_not_found`, `invite_not_pending`, `invite_only`, `audience_mismatch`, `school_unverified`, `rate_limited` and an unknown code
  - social-steps, same outputs on one fixture set: an SAE row (`join_policy:"invite"`, `join_state:"invite_only"`, `verified:true`), the same with `org_follow_state:"following"`, a member, an invited row with `pending_invite`, an open `can_join`, a `can_request`, an `audience_blocked` iu row, a row missing `name`, and a non-array input → `parseClubRows`, `isFollowingOrg`, `clubBand`, `orderClubRows` (id order), `relationFor` (local undefined and `{state:"member"}`), `anyClubFollowed`; one suggestion per `reason_v2` → `parseSuggestions`, then `groupPeople` with `{system:"iu", campusShortName:"Indianapolis"}` and with `{system:null, campusShortName:null}`; `listState(0..3)`; `fillCampus` with a null campus
  - draft: for raw values (valid; `at` exactly 14 days old; 2 days in the future; `v:2`; `step:7`; `maxStep < step`; a `__proto__` field; 70 fields; an array with numbers; not JSON) at a fixed `now`, `JSON.stringify(readDraftRecord(raw, now))` equals `loadDraft("u1", {storage: <in-memory storage holding raw>, now: () => now})`; `buildDraftRecord` equals what `saveDraft` stored; `typedDraftFields` and `onboardingResumeStep` match B12's exports on a 2×2×2×2 grid (draft present / campus saved / real handle / system known) plus draft steps 1–6
  - `isSafeRelativePath` equal for `"/campus?welcome=1"`, `"//evil.com"`, `"/\\evil"`, `"https://x.com"`, `"/a b"`, `""`, `"/ok#x"`; for `iu` and `purdue`, `campusesForSystem(s)` ids equal the TS ones and `campusPickerSub(c, s)` equals `campusOptionsForSystem(s)`'s `sharedWith ?? name`
- Greps on `public/html/onboarding.html`:
  - `rg -n "Skip to resume|then your documents|photo, banner|IU_MAJORS|IU_SCHOOLS|IU_CAMPUSES|wx-company|pfResumeUrl|Finish &amp; open|/api/me/handle'|out\.school|Maybe later"` → 0
  - `rg -n "welcome=1"` → exactly 1 hit, the `succeed` fallback
  - `rg -n "innerHTML|outerHTML|insertAdjacentHTML|document\.write"` → every hit is an `innerHTML = ''` line
  - `rg -n "location\.href\s*="` → 0
  - `rg -n "filter=mine|[?&]q=|follower_count|member_count|viewer_follows|[^_]follow_state"` → 0
  - `rg -n "source: *['\"](profile|discover)"` → 0, and `rg -n "source: *['\"]onboarding"` → 1
  - `awk '/ONB-PURE-MIRROR:START/,/ONB-PURE-MIRROR:END/' public/html/onboarding.html | rg -n "document|window|localStorage|location|fetch\(|navigator"` → 0
  - `rg -n "\.focus\("` → the reviewer confirms each hit is a Continue-error field focus or the skip sheet's open/close focus; none sits in `showStep`
- Copy review: every `ONB_LOCAL_COPY` value is found with `rg -F` in `src/components/mobile/onboarding/*.tsx` or `OnboardingMobile.tsx` (B12), and every `ORG_CONTROL_COPY` value except `busy`'s "…" in `src/components/orgs/OrgJoinControl.tsx` (F5a).
- Fixture harness (pre-merge; no request reaches any server):
  - Setup in `$S/onb-harness/site`: `html` → symlink to `public/html`; `harness.js`; `onb.html` = `onboarding.html` with two tags inserted right after `<head>`: `<script id="onbBoot" type="application/json">` (default `{"replay":false,"userId":"00000000-0000-4000-8000-000000000001","system":"iu","singleCampusId":null,"prefill":{"name":"","handle":"","bio":"","major":"","department":"","year":null,"interests":[],"skills":[],"looking_for":[],"campusId":null,"campusConfirmed":false,"avatarUrl":null,"hasRealHandle":false}}`, edited per check) and `<script src="/harness.js"></script>`. `harness.js` replaces `window.fetch` before `_persistence.js` runs: a GET is answered from `window.__fx.get[pathname]` (defaults: discover → one SAE-shaped row `{id:"o1", handle:"sae", name:"SAE", logo_url:null, verified:true, join_policy:"invite", audience:"both", join_state:"invite_only", join_reason:null, role:null, pending_invite:null, org_follow_state:"not_following"}`; suggestions → three rows with `reason_v2` `same_campus` / `same_major` / `new_on_vibe`; handle check → available). Every non-GET is pushed to `window.__writes` as `{method, path, body}` and answered from `window.__fx.write["METHOD /path"]` (default 200 `{ok:true}`). On `DOMContentLoaded` it replaces `window.__vibeTopNav` with a recorder into `window.__navs` and `window.openImageCropper` with a stub resolving a small JPEG blob. Serve with `python3 -m http.server 8765 --directory "$S/onb-harness/site"`; open `http://localhost:8765/onb.html` at 1280×800 in the Browser pane.
  - (a) Screenshots of steps 1–6, each scrolled to the bottom: `.onb-top` `getBoundingClientRect().top === 0`, Back hidden only on step 1, "N of 6", Skip on every step.
  - (b) Campus: IU boot → Indianapolis first (sub "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"), then Fort Wayne with "not open yet", then the IU campuses; nothing checked; Continue with no pick → "Pick your campus to continue.". `system:"purdue"` → sub "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)" and no IU-only card. `singleCampusId:"fort-wayne"` → Fort Wayne checked with "from your school email". `system:null` → the system-missing line; Continue advances with `__writes` empty. The Purdue link shows only once Indianapolis is picked on IU.
  - (c) Profile: step write 409 `{ok:false, code:"handle_taken", error:"That handle is taken. Try another."}` → that error under Handle, status "✗ taken", still on step 3. Handle check 500 → "couldn't check. we'll check when you continue".
  - (d) Photo: a never-resolving upload → "Uploading…" with Back and Skip disabled, and `history.back()` is ignored; upload 413 → "That photo is too big. Try another."; PATCH echoing a different `profile.avatar_url` → "That photo didn't upload. Try again.".
  - (e) Clubs: the default SAE row → Follow only, meta "@sae · Invite only", "Officers can see who follows this club.", footer "Skip for now". Tap Follow → "…" with `aria-busy="true"` until the write resolves, then "Following ✓" and footer "Continue →"; `__writes` holds `POST /api/orgs/sae/follow` with body `{"source":"onboarding"}`. Fixtures: an open `can_join` row → Follow + Join side by side; an invited row → Accept, chip "Invited you", "Invited by Sam · Expires …", listed first; a member row → disabled "Joined ✓" + "Members follow automatically"; DELETE 409 `member_follows` → the row locks as Joined; discover 500 → the load-failed box with Retry and no empty copy; `orgs: []` → the empty copy; a row named `<img src=x onerror=alert(1)>` renders as text (`document.querySelectorAll('#onbClubsList img[src="x"]').length === 0`, no alert).
  - (f) People: groups "At Indianapolis", "Same major", "More people on Vibe" in that order; follow POST 403 → the row disappears with no toast; `suggestions: []` → the empty copy + "Share Vibe".
  - (g) Finish ok `{ok:true, next:"/campus?welcome=1"}` → `__navs` is `["/campus?welcome=1"]`, the `vibe_onb_draft_v1:<id>` key is gone and `vibe_tour_pending === "campus"`. Finish 400 `handle_required` → back on step 3 with the handle error, and Back still walks to step 1.
  - (h) Skip: the blank prefill → identity variant (Name + Handle); `name:"Sam", handle:"sam", hasRealHandle:true` → saved variant; Escape is ignored while a never-resolving complete is in flight; Skip ok with `next:"/campus?welcome=1"` → navigates there (not to "/campus").
  - (i) Draft: with `campusId:"indianapolis", campusConfirmed:true`, type a name on step 3 and reload → step 3 reopens with the name. `onb.html?replay=1` → step 1, and the draft key's value is byte-identical before and after a full walk.
  - (j) Replay: on `onb.html?replay=1`, walk all six steps and tap every control (Follow, Join, Accept fixtures, person Follow, the photo choose stub, the Purdue panel Send and Verify, both skip variants with identity forced by clearing Name, Finish) → `window.__writes.length === 0` and the last `__navs` entry is `"/campus"`.
- Live, read-only, after W4 deploys (gate G4). In the signed-in browser at 1280×800, open `https://www.connectvibe.app/onboarding/classic?replay=1`. BEFORE the first tap, install a blocker that makes `fetch` and XHR (`XMLHttpRequest.prototype.open` remembers the method, `send` throws) refuse and record every non-GET, turns `navigator.sendBeacon` into a recorder, and replaces `window.__vibeTopNav` with a recorder. Then walk steps 1–6, tap every control, go Back via the header and via `history.back()`, open both skip variants, and tap Finish. The non-GET record is EMPTY and the nav record ends with `"/campus"`. Step 5 lists exactly the visible clubs from read-only SQL `select left(id::text,8) as id, handle, join_policy, audience, verified from public.orgs where hidden_at is null;` (1 row, SAE on 2026-09-16), shown to Franky as the disabled "Joined ✓" row.

**Do not touch:** `public/html/_persistence.js`, `_imageCropper.js`, `_iu-majors.js`, `_otto.js`, `profile.html`; `src/app/onboarding/OnboardingSwitch.tsx`, `src/app/onboarding/classic/route.ts`, `src/lib/onboarding/boot.ts`, `draft.ts` / `draft.test.ts` (B12), `onb-copy.ts` / `social-steps.ts` (B12S), `join-copy.ts` / `OrgJoinControl.tsx` (F5a), `avatar-upload.ts`, `campuses.ts`, and every `/api` route. Nothing from `$S` is committed.

---

### CM · phone CampusMobile: Orgs tab with Follow and Join, the campus confirm banner, Edit post on feed cards

**Owns:** `src/components/mobile/CampusMobile.tsx`
**Depends on:**
- F5a (imports `OrgJoinControl`; `orgRowView`, `memberCountText`, `inviteSubText`, `policyChip`, `audienceChip`, `type OrgRelation`, `type OrgDisplayState` from `join-copy`)
- F2 live (`org_follow_state`, nullable `member_count`, `?filter=following`)
- E2 (`EditPostSheet`; `PostViewerMobile`'s optional `onEdited` prop) and E0's lib (`type EditedPost`)
- B14t (`CampusConfirmBanner`)
- CH1 (`CampusBanner` keeps its export signature; `export type FeedPost` gains `edited_at`)
- G3
- By URL only: F1 (follow routes), E1 (PATCH `/api/posts/[id]`), F4 (`edited_at` on feed posts), H1 (search rows carry `join_policy`/`audience`).
- It folds in three reader batches: F5b (Orgs tab), B14's two CampusMobile edits (§2.4 item 13) and E3 (phone feed card Edit).

**Anchors:** no wave before W4 edits `CampusMobile.tsx` (§5). Every `:line` below was re-read at HEAD `f23bc5d`, and `git diff --quiet f23bc5d -- src/components/mobile/CampusMobile.tsx` was clean while W1 ran. The batch's own edits shift lines, so edit bottom-up or re-grep by function name. Names from other files (`CampusBanner`, `EditPostSheet`, `OrgJoinControl`, `CampusConfirmBanner`) are cited by name, because W1–W3 create or change them.

**Scope limit:**
- Don't touch `ChatPane`'s body (:1503-1749), including its `/api/orgs?filter=mine` load (:1517). Also leave `JoinedOrg` (:1769-1777), `OrgChannelsDrawer` (:1833-2167) and its channels fetch alone. `filter=mine` stays the chat list (founder decision).
- The `CampusBanner` line (:426) and the campus-home import list (:8-16) stay as they are. CH1 owns the banner.
- `CampusSearchOverlay` keeps its export and props: `ProfileMobile.tsx:10` and `:1896` import it, and PM owns that file in this same wave. Only `SearchOrg` and `SearchOrgRow` change.
- The `PostComposerMobile`, `MapPane`, `TabStrip` and `EventCard` mounts stay as they are. No Delete on the feed card (Q19).
- Don't edit `CampusConfirmBanner.tsx`, `EditPostSheet.tsx`, `PostViewerMobile.tsx`, `OrgJoinControl.tsx` or `join-copy.ts`. Report their defects to the orchestrator.

**Contract**

0. **Preconditions** (stop and report if any fails)
   - `ls src/components/mobile/EditPostSheet.tsx src/components/mobile/CampusConfirmBanner.tsx src/components/orgs/OrgJoinControl.tsx src/lib/orgs/join-copy.ts src/lib/posts/edit.ts` → all five exist (G3, plus W1 files).
   - `grep -n "export function EditPostSheet\|export function CampusConfirmBanner\|export function OrgJoinControl" src/components/mobile/EditPostSheet.tsx src/components/mobile/CampusConfirmBanner.tsx src/components/orgs/OrgJoinControl.tsx` → 3 named exports. If B14t shipped a default export, only the import line in item 1 changes.
   - `grep -n "onEdited" src/components/mobile/PostViewerMobile.tsx` → the prop exists (E2).
   - `grep -n "export function orgRowView\|export function inviteSubText\|export function memberCountText\|export function policyChip\|export function audienceChip" src/lib/orgs/join-copy.ts` → 5 hits.

1. **Imports** (:1-25). Add these, keeping the existing groups and alphabetical order:
   ```ts
   import { CampusConfirmBanner } from "@/components/mobile/CampusConfirmBanner";
   import { EditPostSheet } from "@/components/mobile/EditPostSheet";
   import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
   import { campusRowById } from "@/lib/iu/campuses";
   import { orgAssetProxyUrl } from "@/lib/org-asset-url";
   import { audienceChip, inviteSubText, memberCountText, orgRowView, policyChip, type OrgDisplayState, type OrgRelation } from "@/lib/orgs/join-copy";
   import type { JoinPolicy, JoinState, OrgAudience, OrgRole } from "@/lib/orgs/join-state";
   import type { EditedPost } from "@/lib/posts/edit";
   ```
   - Never import `@/lib/orgs/membership` (server-only), `@/lib/orgs/following` (route helpers), `@/app/api/*` or `@/lib/onboarding/*`.
   - `org-asset-url.ts` and `campuses.ts` have no `server-only` import. Both are already used from client files.

**B14: the two small edits (§2.4 item 13)**

2. **Campus confirm banner mount.**
   - Render `<CampusConfirmBanner />` directly before `<header id="otto-mobile-tour-tabs"` (:466-467). It sits after the Otto strip wrapper (:436-464) and outside the sticky `CampusBanner` wrapper (:418-427).
   - The comment above that wrapper (:416-417, "IU crimson banner — …") becomes `{/* Campus banner (shared with desktop): campus identity, live stats line, search icon. */}`. After CH1 it isn't crimson for Indianapolis.
   - Mount it bare, with no wrapper element. When the component renders nothing, the layout matches HEAD exactly.
   - It shows on every tab, because the tab strip sits below it.
   - If its card touches the screen edges at 375px, report that to the orchestrator: B14t's file has no W4 owner. Don't add a padding wrapper, which would leave a gap when the banner is hidden.

3. **EventsPane empty body** (:1484): replace `"When orgs or classmates create events, they'll surface here. Pull to refresh later."` with `"When orgs or classmates create events, they'll surface here."`. The title `"Nothing scheduled"` (:1483) stays.

**F5b: the Orgs tab**

4. **Types.**
   - `Org` (:56-65) keeps its eight fields; `member_count` becomes `number | null` (F2, C27). It gains:
     ```ts
     join_policy: JoinPolicy;
     audience: OrgAudience;
     role: OrgRole | null;
     join_state: JoinState;
     join_reason: "policy" | "visiting" | null;
     pending_invite: { id: string; expires_at: string; invited_by_name: string | null } | null;
     org_follow_state?: "following" | "not_following";
     ```
     Never add `viewer_follows` or `follow_state` (§2.4 item 1; `follow_state` means a PERSON follow).
   - New types next to `Org`:
     ```ts
     /** One row of GET /api/me/org-invites (me/org-invites/route.ts:106-119). logo_url is the RAW stored key. */
     type InviteRow = { id: string; created_at: string; expires_at: string; org: { id: string; handle: string; name: string | null; logo_url: string | null; verified: boolean; audience: OrgAudience }; invited_by: { name: string } | null };
     /** What OrgJoinControl's onChange reports (F5a §C props). */
     type OrgChange = { state: OrgDisplayState; following: boolean; role: OrgRole | null; declined?: true };
     type OrgLocal = { state: OrgDisplayState; following: boolean; role: OrgRole | null };
     type OrgLists = { discover: Org[] | null; following: Org[] | null; invites: InviteRow[] | null; campusId: string | null };
     type OrgErrs = { discover: LoadFailure | null; following: LoadFailure | null; invites: LoadFailure | null };
     const EMPTY_ORG_LISTS: OrgLists = { discover: null, following: null, invites: null, campusId: null };
     const NO_ORG_ERRS: OrgErrs = { discover: null, following: null, invites: null };
     ```

5. **Pure row helpers** (module level, directly above `function OrgsPane`, :2311)
   ```ts
   /** §4.2: following = role != null || org_follow_state === "following". A member always follows (join trigger). */
   function orgRelationFor(o: Org, local: OrgLocal | undefined): OrgRelation {
     const state: OrgDisplayState = local ? local.state : o.join_state;
     const role = local ? local.role : (o.role ?? null);
     const following = state === "member" || (local ? local.following : o.role != null || o.org_follow_state === "following");
     return { handle: o.handle, orgName: o.name, state, following, role, reason: o.join_reason ?? null, audience: o.audience, joinPolicy: o.join_policy };
   }
   /** Invite inbox rows carry no join_policy; F5a treats joinPolicy null as "no disclosure". */
   function inviteRelationFor(row: InviteRow, local: OrgLocal | undefined): OrgRelation {
     const state: OrgDisplayState = local ? local.state : "invited";
     return { handle: row.org.handle, orgName: row.org.name ?? row.org.handle, state, following: state === "member" || (local?.following ?? false), role: local?.role ?? null, reason: null, audience: row.org.audience, joinPolicy: null };
   }
   ```
   - `orgRowsFrom(raw: unknown): Org[] | null` returns null when `raw` isn't an array. Otherwise it keeps the rows whose `id`, `handle` and `name` are strings (narrowed with `typeof`, no `any`).
   - `inviteRowsFrom(raw: unknown): InviteRow[] | null` works the same way. A row needs a string `id` and `expires_at`, and an `org` object with string `id` and `handle`.
   - These must agree with B12S's `relationFor` (`social-steps.ts`), and the reviewer diffs the two. CM does not import onboarding code.

6. **State** (`orgs` :86, `orgsErr` :91) is replaced by:
   ```ts
   const [orgLists, setOrgLists] = useState<OrgLists>(EMPTY_ORG_LISTS);
   const [orgErrs, setOrgErrs] = useState<OrgErrs>(NO_ORG_ERRS);
   // What a row's control reported, painted until the next full reload answers.
   const [orgLocal, setOrgLocal] = useState<Record<string, OrgLocal>>({});
   // Bumped after a join so ChatPane remounts and re-reads filter=mine.
   const [chatKey, setChatKey] = useState(0);
   ```

7. **`refetchOrgs`** (:250-266) takes `mode: "first" | "refresh"`. It follows `refetchFeed`'s pattern (:206-228): a seq ref plus a loaded ref, and a failed refresh never wipes a loaded list.
   - Refs: `orgsSeqRef = useRef(0)`; `orgsLoadedRef = useRef({ discover: false, following: false, invites: false })`. No setState before the first `await`, so the eslint count holds at 4 (react-hooks/set-state-in-effect; HEAD hits are :117, :193, :271, :2943).
   - `const seq = ++orgsSeqRef.current;` then `Promise.all` of three requests:
     - `vibeRequest<{ orgs?: unknown; viewerCampusId?: unknown }>("/api/orgs?filter=discover", { cache: "no-store", quiet: mode !== "refresh", failure: "Couldn't load orgs." })`: the URL and failure string are unchanged
     - `vibeRequest<{ orgs?: unknown }>("/api/orgs?filter=following", { cache: "no-store", quiet: true, failure: "Couldn't load the clubs you follow." })`
     - `vibeRequest<{ invites?: unknown }>("/api/me/org-invites", { cache: "no-store", quiet: true, failure: "Couldn't load your invites." })`
   - If `seq !== orgsSeqRef.current`, return.
   - `discover = d.ok ? orgRowsFrom(d.data.orgs) : null`, and the same for `following` (`.orgs`) and `invites` (`inviteRowsFrom(i.data.invites)`). Mark each non-null list as loaded.
   - `setOrgLists(prev => …)`: each list is the new value when non-null, else `prev`'s. `campusId` = discover's `viewerCampusId` when discover answered and it is a string, `null` when discover answered without one, else `prev.campusId` (`orgs/route.ts:469`).
   - `setOrgErrs`: each key is `null` when that list answered or was loaded before, else `asLoadFailure(res, <its failure string>)`.
   - Only when all three answered: `setOrgLocal({})`, because the server lists are now the truth. Otherwise the tapped rows keep their painted state.
   - Comments: keep the `filter=discover` comment (:253-256). Replace the comment "Loads once; the only refetch is Retry after a failed first load." (:251) with "Loads on mount, on Retry, and after a row's Follow / Join / Accept." The `useCallback` at :252 gains the `mode` parameter.
   - The mount effect (:270-274) calls `void refetchOrgs("first");`. The deps stay the same.

8. **Mounts.**
   - `OrgsPane` (:528-536):
     ```tsx
     <OrgsPane
       lists={orgLists}
       errs={orgErrs}
       local={orgLocal}
       onRetry={() => { setOrgErrs(NO_ORG_ERRS); void refetchOrgs("first"); }}
       onChange={(orgId, wasMember, next) => {
         setOrgLocal((prev) => ({ ...prev, [orgId]: { state: next.state, following: next.following, role: next.role } }));
         if (!wasMember && next.state === "member") setChatKey((k) => k + 1);
         void refetchOrgs("refresh");
       }}
     />
     ```
   - `ChatPane` (:539) → `<ChatPane key={chatKey} onSelectOrg={(o) => setSelectedOrgForChat(o)} />`. Nothing inside `ChatPane` changes, and remounting re-runs its own `filter=mine` load. Without this, a club joined on the Orgs tab would be missing from Chat until a reload.

9. **`OrgsPane`** (:2311-2364), rewritten
   - Props: `{ lists: OrgLists; errs: OrgErrs; local: Record<string, OrgLocal>; onRetry: () => void; onChange: (orgId: string, wasMember: boolean, next: OrgChange) => void }`.
   - **All three lists null:** `errs.discover ? <LoadFailed failure={errs.discover} onRetry={onRetry} /> : <PaneSkeleton />`. The three loads settle together, so null with no error means loading, and a pane where everything failed shows discover's line (today's behaviour).
   - **Buckets** (no second read, no `filter=mine`):
     - `inviteRows = lists.invites ?? []` and `inviteIds = new Set(inviteRows.map(r => r.org.id))`.
     - `followingRows = (lists.following ?? []).filter(o => !inviteIds.has(o.id))`, in server order (newest follow first, F2). Never re-sorted.
     - `taken` = the invite ids plus the following ids.
     - `rest = (lists.discover ?? []).filter(o => !taken.has(o.id))`, split into `verified` (`!!o.verified`) and `others`, each sorted by `a.name.localeCompare(b.name)` (today's rule, :2334-2340).
     - If the following list failed, followed clubs stay in `rest` with their correct control. If the invite list failed, invited discover rows stay in `rest` with the "Invited you" chip and "Accept".
   - **Render order.** Put a `<div style={{ height: 6 }} />` before each header except the first thing rendered.
     1. Invites. Failed (`lists.invites === null && errs.invites`): `<LoadFailed failure={errs.invites} onRetry={onRetry} />` with NO header, because a "You're invited" header over a failure would claim there are invites. Rows: `<OrgSectionHeader label="You're invited" />`, then one `OrgRow` per invite.
     2. Following. Failed: `LoadFailed` ("Couldn't load the clubs you follow."), no header. Rows: header `"Following"`, then the rows. The reader note proposed "Yours". "Following" matches desktop's filter chip (§2.4 item 8); member clubs sit here and read "Joined ✓".
     3. Discover. Failed: `LoadFailed` ("Couldn't load orgs."). Rows: header `"Verified"`, then header `"All clubs"` (replaces "All orgs" at :2356).
   - **Copy.** `campus = campusRowById(lists.campusId)?.name ?? null` ("Indianapolis" for the shared campus). `line = campus ? `Clubs are just getting started at ${campus}. Follow the ones you like — posts land in your feed.` : "Clubs are just getting started here. Follow the ones you like — posts land in your feed."`. These sentences are character-identical to `ONB_COPY.clubs.sparse` and `sparseNoCampus` (B12S) but written as literals, because CM imports no onboarding code.
   - **Empty.** `total = inviteRows.length + followingRows.length + verified.length + others.length`; `failedAny` = any list that is null with an error.
     - `total === 0 && !failedAny` → `<EmptyTab title="No clubs here yet" body={line} />`. This replaces "No orgs here yet" / "Once orgs spin up on campus, you'll find them here." (:2326-2327).
     - `total` of 1–2 and `!failedAny` → the same `line` as a footer `<p>` under the rows: margin "6px 4px 0", DM Sans 12.5px, #8A8580, lineHeight 1.45, centered. With only SAE live, every student sees it.
     - While `failedAny` is true, neither the empty state nor the footer renders, so an error never reads as "no clubs".
   - **Row props.**
     - Invite row: `<OrgRow key={`invite:${r.id}`} orgId={r.org.id} handle={r.org.handle} name={r.org.name ?? r.org.handle} logoUrl={orgAssetProxyUrl(r.org.handle, r.org.logo_url, "logo")} verified={r.org.verified} relation={inviteRelationFor(r, local[r.org.id])} pendingInviteId={r.id} memberCount={null} inviteSub={inviteSubText(r.invited_by?.name ?? null, r.expires_at)} onChange={onChange} />`.
     - `orgAssetProxyUrl` is used ONLY on invite rows. The inbox returns the raw key (`me/org-invites/route.ts:114`); discover/following logos are already proxied (`orgs/route.ts:424`), and the helper returns null for an already-proxied `/api/orgs/…` value (`org-asset-url.ts:12-25`).
     - Discover/following row: `<OrgRow key={o.id} orgId={o.id} handle={o.handle} name={o.name} logoUrl={o.logo_url} verified={!!o.verified} relation={orgRelationFor(o, local[o.id])} pendingInviteId={o.pending_invite?.id ?? null} memberCount={o.member_count ?? null} inviteSub={null} onChange={onChange} />`.

10. **`OrgRow`** (:2384-2513), rewritten. Today the whole row is a `<Link>`, and a control nested inside it would be invalid HTML: a tap would navigate.
   - Props: `{ orgId: string; handle: string; name: string; logoUrl: string | null; verified: boolean; relation: OrgRelation; pendingInviteId: string | null; memberCount: number | null; inviteSub: string | null; onChange: (orgId: string, wasMember: boolean, next: OrgChange) => void }`.
   - `const view = orgRowView(relation, "phone_row");`. Buttons, chip, meta and disclosure all come from `view`. Never re-derive them.
   - Meta line: `(inviteSub !== null ? [`@${handle}`, inviteSub] : [`@${handle}`, ...view.meta, memberCountText(memberCount)]).filter((s): s is string => !!s).join(" · ")`.
   - `control` = `<OrgJoinControl relation={relation} variant="phone_row" source="discover" pendingInviteId={pendingInviteId} onChange={(next) => onChange(orgId, relation.state === "member", next)} />`. Source is `"discover"` for every Orgs-tab row (§4.2).
   - DOM, with no interactive element inside another:
     ```tsx
     <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "rgba(255,253,248,0.78)", border: "1px solid rgba(255,255,255,0.7)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)" }}>
       <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
         <Link href={`/orgs/${encodeURIComponent(handle)}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
           {/* logo: today's 52px block (:2406-2432), reading logoUrl / name */}
           {/* text column (:2433): name row = name span (:2441-2453, plus minWidth 0) + verified ✓ (:2454-2473) + chip; then the meta line with today's styles (:2475-2492) */}
         </Link>
         {view.layout === "slot" ? <div style={{ flexShrink: 0 }}>{control}</div> : null}
       </div>
       {view.layout === "line" ? <div style={{ width: "100%" }}>{control}</div> : null}
       {view.disclosure ? <p style={{ margin: 0, fontFamily: "DM Sans, sans-serif", fontSize: 11.5, color: "#8A8580", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{view.disclosure}</p> : null}
     </div>
     ```
   - The chevron svg is deleted, because the control takes the right edge.
   - The `line` layout (open clubs) puts the two pills on a full-width row under the name, so the name never truncates to make room for two pills at 375px. F5a's control renders the pills with `flex:1`, at least 44px tall.
   - The disclosure sits outside the Link: it stays next to Follow (C14) and out of the link's accessible name.
   - Chip (`view.chip`), after the ✓: `<span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 999, fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", background: view.chip === "Invited you" ? "rgba(255,92,53,0.12)" : "rgba(28,28,30,0.06)", color: view.chip === "Invited you" ? "#B83A1A" : "#5C5853" }}>{view.chip}</span>`.
   - What a phone row shows, all from F5a's `orgRowView` table:
     - member: "Joined ✓"
     - invited: "Accept" + chip "Invited you". Decline lives on the org page.
     - open club, not followed: "Follow" + "Join" on the action line
     - open club, followed: "Following ✓" + "Join"
     - request club, not followed: "Follow"
     - request club, followed: "Request" + chip "Following"
     - requested / invite-only / audience-blocked / unverified: "Follow" or "Following ✓"
     - The disclosure "Officers can see who follows this club." shows on request and invite-only rows that render Follow or Following ✓.
   - Live SAE (invite only, audience both, 1 member):
     - a non-member sees SAE's name + ✓, then "@sae · Invite only · 1 member", slot "Follow", and the disclosure
     - Franky (owner) sees it under "Following": "Joined ✓", "@sae · Invite only · 1 member", no disclosure

11. **Search rows** (navigate-first; still no control)
   - `SearchOrg` (:2899-2905) gains `join_policy?: JoinPolicy; audience?: OrgAudience;` (H1 made `/api/search` return them; `r.data.orgs as SearchOrg[]` at :2965 is unchanged).
   - `SearchOrgRow` meta (:3335) `@{o.handle}` → `{[`@${o.handle}`, o.join_policy && o.join_policy !== "open" ? policyChip(o.join_policy) : null, o.audience ? audienceChip(o.audience) : null].filter(Boolean).join(" · ")}`, e.g. "@sae · Invite only".

**E3: Edit post on your own phone feed cards** (founder decision; Q19: Edit only, Delete stays in the viewer)

12. **Feed types and the viewer id**
   - `type FeedPost = DesktopFeedPost;` (:54) → `type FeedPost = DesktopFeedPost & { edited_at?: string | null };`. After CH1 this is identical to the desktop field, and it keeps this file compiling on its own.
   - `FeedBody` (:700) → `{ feed?: unknown; posts?: unknown; viewerId?: unknown }`. `/api/feed` echoes `viewerId: user.id` on every 200 (`feed/route.ts:452`).
   - State next to `feed` (:84): `const [viewerId, setViewerId] = useState<string | null>(null);`
   - `refetchFeed`, inside `if (posts) {` right after `setFeed(posts);` (:221): `if (r.ok && typeof r.data.viewerId === "string") setViewerId(r.data.viewerId);`
   - The #tag effect, inside `if (posts) {` (:322-325), before `setTagFeed`: the same line. A viewer whose main feed failed but whose tag list loaded still gets Edit.

13. **In-place update, with no refetch**
   - Directly after the `tagFeed` state (:285-289):
     ```ts
     const applyPostEdit = useCallback((p: EditedPost) => {
       const patch = (x: FeedPost): FeedPost =>
         x.id === p.id ? { ...x, content: p.content, tags: p.tags, edited_at: p.edited_at } : x;
       setFeed((prev) => (prev ? prev.map(patch) : prev));
       setTagFeed((prev) => (prev && prev.posts ? { ...prev, posts: prev.posts.map(patch) } : prev));
     }, []);
     ```
   - `setFeed` re-runs the #tag effect (:299-341 depends on `feed`). With a tag filter on, expect exactly one extra `GET /api/feed?limit=50&tag=…`. A card whose edit removed the tag stays on screen until that answer lands.
   - `PostViewerMobile` mount (:600-608): add `onEdited={applyPostEdit}`, so an edit made in the viewer updates the card under it.
   - `FeedPane` mount (:507-515): add `viewerId={viewerId}` and `onEdited={applyPostEdit}`.

14. **`FeedPane`** (:715-773)
   - Props gain `viewerId: string | null; onEdited: (p: EditedPost) => void;`.
   - `<FeedCard>` (:765-770) adds `isOwner={!!viewerId && p.user_id === viewerId}` and `onEdited={onEdited}`.
   - Owner means author (`user_id`), for club-attributed posts too. That's the same rule as desktop `FeedRow`'s `viewerOwnsPost` in `campus-home.tsx` and E1's `.eq("user_id", user.id)`.

15. **`FeedCard`** (:843-852)
   - Props gain `isOwner: boolean; onEdited: (p: EditedPost) => void;`.
   - Sub-line (:1045-1047): after `{time}`, add `{post.edited_at ? " · Edited" : ""}`, before the club suffix. It reads "@handle · 2h ago · Edited", the same marker as E2's viewer and CH1's desktop row.
   - Comment (:1050-1052) → `{/* 3-dot menu: Send to chats, Copy link, and Report (others' posts) or Edit post (your own). Delete stays in the post viewer. */}`.
   - `PostActionsSheet` mount (:1448-1459) adds `isOwner={isOwner}`, `initialContent={post.content ?? ""}`, `hasMedia={!!post.media_url}` and `onEdited={onEdited}`. `hasMedia` reads `media_url`, as E2's viewer mount and E1's `checkPostEdit(…, !!prior.media_url)` do.

16. **`PostActionsSheet`** (:2580-2755)
   - Docblock (:2573-2579), first paragraph → "3-dot menu sheet: slides up from the bottom. Send to chats, Copy link, then Edit post on your own post or Report post on anyone else's. Delete lives in the post viewer." Keep the vaul paragraph.
   - Props (:2586-2592) gain `isOwner: boolean; initialContent: string; hasMedia: boolean; onEdited: (p: EditedPost) => void;`.
   - State next to `shareOpen` (:2598): `const [editOpen, setEditOpen] = useState(false);`.
   - Rows (:2721-2726): the Report row becomes `{isOwner ? <ActionSheetRow label="Edit post" onClick={() => setEditOpen(true)} /> : <ActionSheetRow label="Report post" tone="danger" onClick={() => void report("other")} disabled={reporting} />}`.
     - Row order: Send to chats, Copy link, Edit post or Report post, Cancel.
     - Owners stop seeing Report on their own post, matching `PostViewerMobile`'s owner menu and desktop `FeedRow`.
   - After the `{shareOpen ? … : null}` block (:2736-2753), still inside `Drawer.Root`:
     ```tsx
     {editOpen ? (
       <EditPostSheet
         nested
         postId={postId}
         initialContent={initialContent}
         hasMedia={hasMedia}
         onClose={() => setEditOpen(false)}
         onSaved={(p) => { onEdited(p); onClose(); }}
       />
     ) : null}
     ```
     - `nested` for the same reason the SharePostSheet comment gives (:2738-2739).
     - EditPostSheet itself toasts "Post updated" and calls its own `onClose`. `onClose()` here is FeedCard's `setMenuOpen(false)`, so both sheets close in the same tick.
     - A failed save keeps the edit sheet open with the draft (E2).
   - HAZARD: inside this function, `toast` is a local `useState<string | null>` (:2594) that shadows the imported `toast` (:25). Add no `toast({…})` call here; EditPostSheet does its own toasting.
   - Portal bubbling: `FeedCard` is a `<button onClick={handleCardClick}>` (:973-976), and React bubbles through portals. `ActionSheetRow` already stops propagation (:2775-2776), and E2's `Drawer.Content` stops click and pointerdown. CM adds nothing on the card for this, and must not remove either guard.

**Acceptance**

Static (run in the repo):
- `npx tsc --noEmit` exits 0. This also proves `ProfileMobile.tsx` still compiles against the unchanged `CampusSearchOverlay` export.
- `npx eslint src/components/mobile/CampusMobile.tsx` → at most 4 problems. The baseline at `f23bc5d` is 4, all react-hooks/set-state-in-effect (:117, :193, :271, :2943).
- `rg -n "Pull to refresh later|No orgs here yet|All orgs|Once orgs spin up|viewer_follows" src/components/mobile/CampusMobile.tsx` → 0.
- `rg -n "[^_]follow_state" src/components/mobile/CampusMobile.tsx` → 0. Only `org_follow_state` appears.
- `rg -n "filter=mine" src/components/mobile/CampusMobile.tsx` → exactly 1 hit, inside `ChatPane`.
- `rg -n "orgAssetProxyUrl" src/components/mobile/CampusMobile.tsx` → exactly 2 (the import and the invite row).
- `rg -n 'from "@/lib/orgs/(membership|following)"|from "@/lib/onboarding|from "@/app/api' src/components/mobile/CampusMobile.tsx` → 0.
- `rg -n "<CampusConfirmBanner|<EditPostSheet|<OrgJoinControl" src/components/mobile/CampusMobile.tsx` → 1, 1, 1.
- `git diff -U0 f23bc5d -- src/components/mobile/CampusMobile.tsx | grep '^@@'`: no hunk's old-side range falls inside :1503-2300, the region covering `ChatPane`, `JoinedOrg`, `OrgChannelsDrawer` and `DarkChannelRow`.
- A reviewer diffs `orgRelationFor` against B12S's `relationFor`, and the empty/footer sentences against `ONB_COPY.clubs.sparse` / `sparseNoCampus`, character by character.

Live, production, read-only. Use the signed-in gstack browser as Franky (live verification recipe): `browse viewport 375x812` BEFORE `goto`.
- **Setup.** Open `/profile`, then run `browse js` to install, before anything is tapped:
  - (a) A non-GET blocker. It wraps `window.fetch`, records `[method, url, body]` in `window.__nonGet`, and answers each non-GET with the synthetic response named in the step (default 418 `{ok:false,error:"blocked",code:"blocked"}`). Nothing non-GET reaches the network.
  - (b) GET overrides for the step: exact-URL matches that return a JSON `Response`. Every other GET passes through.
  - Then click the tab bar's `a[href="/campus"]`. That client-side navigation keeps the wrapper while `CampusMobile` mounts and runs its loads.
  - Navigate with a full `goto` afterwards to drop the wrappers.
  - Franky's account is at Indianapolis with an unconfirmed campus (read-only SQL, `campus_set_at` null), so the confirm banner shows in these screenshots.
- **Real data, no GET overrides.**
  - Orgs tab: the network log shows exactly one GET each of `/api/orgs?filter=discover`, `/api/orgs?filter=following` and `/api/me/org-invites`.
  - SAE sits under "FOLLOWING" with "Joined ✓", "@sae · Invite only · 1 member", no chip and no disclosure. No "VERIFIED" copy of SAE.
  - The footer reads "Clubs are just getting started at Indianapolis. Follow the ones you like — posts land in your feed."
  - `window.__nonGet.length === 0`.
  - `document.querySelectorAll('#otto-mobile-tour-feed > section')[2].querySelectorAll('a button, a a, button a, button button').length === 0`.
  - The Chat tab screenshot matches the one taken before the diff.
- **Overridden lists.**
  - Build the rows from the real SAE discover row plus synthetic ids:
    - R1: SAE, non-member (`role:null`, `join_state:"invite_only"`, `org_follow_state:"not_following"`, `member_count:1`)
    - R2: open, not followed (`join_policy:"open"`, `join_state:"can_join"`, name "Indianapolis Photography and Film Society")
    - R3: request, followed (`join_policy:"request"`, `join_state:"can_request"`, `join_reason:"policy"`, `org_follow_state:"following"`)
    - R4: invited (`join_state:"invited"`, a `pending_invite`), id X
    - R2–R4 have `verified:false`
  - Responses: discover `{ok:true, orgs:[R1,R2,R3,R4], viewerCampusId:"indianapolis"}`; following `{ok:true, orgs:[R3], has_more:false}`; invites `{ok:true, invites:[{id:"inv-1", created_at, expires_at:<now+10d>, org:{id:X, handle:"test-club", name:"Test Club", logo_url:"orgs/x/logo.png", verified:false, audience:"both"}, invited_by:{name:"Franky"}}]}`.
  - Sections in order:
    - "YOU'RE INVITED": Test Club, chip "Invited you", "@test-club · Invited by Franky · Expires {Mon D}", slot "Accept". The logo background is `/api/orgs/test-club/asset/logo`.
    - "FOLLOWING": R3, chip "Following", slot "Request", and NO disclosure (F5a: the line shows only when a Follow or Following ✓ control renders).
    - "VERIFIED": R1, "@sae · Invite only · 1 member", slot "Follow", "Officers can see who follows this club."
    - "ALL CLUBS": R2, with "Follow" and "Join" on a full-width line under the text. The name span is wider than 150px, and neither pill sits beside the name.
    - Club X renders exactly once. No footer (4 rows).
  - **Follow R1.** Make the overrides stateful: a synthetic POST `/api/orgs/sae/follow` → 200 `{ok:true, org_follow_state:"following", already:false, follower_count:null}` flips R1's `org_follow_state` in later discover answers.
    - `__nonGet` holds exactly one entry, `["POST", "/api/orgs/sae/follow", "{\"source\":\"discover\"}"]`.
    - The button reads "…" with `aria-busy="true"` until the answer, then "Following ✓".
    - The network log then shows one more GET of each of the three list URLs.
    - R1 still reads "Following ✓" after they answer.
  - **Join R2.** A synthetic POST `/api/orgs/<R2 handle>/join` → 200 `{ok:true, joined:true, role:"member"}`.
    - R2 shows "Joined ✓".
    - Exactly one more GET `/api/orgs?filter=mine` appears (ChatPane remounted).
    - The Chat pane still renders.
  - **Accept X.** A synthetic join 200 `{ok:true, joined:true, role:"member"}` → the invite row shows "Joined ✓", then the three lists reload.
  - **Following fails.** The following override returns 500 `{ok:false,error:"Failed to load orgs",code:"load_failed"}`.
    - "Couldn't load the clubs you follow." with Retry, and no "FOLLOWING" header.
    - "YOU'RE INVITED", "VERIFIED" and "ALL CLUBS" still render, and R3 now shows under "ALL CLUBS" with "Request" + chip "Following".
    - Retry sends the three GETs again.
  - **Empty.** All three lists return empty (`viewerCampusId:"indianapolis"`) → "No clubs here yet" + "Clubs are just getting started at Indianapolis. Follow the ones you like — posts land in your feed." With `viewerCampusId:null`, the body reads "Clubs are just getting started here. Follow the ones you like — posts land in your feed."
  - **All three fail** (500) → one LoadFailed "Couldn't load orgs." with Retry, and no "No clubs here yet".
- **Search, real data.** In the overlay, `sae` → "@sae · Invite only". No hidden test club appears for `club` (H1).
- **Confirm banner (B14 item 2).**
  - Real data (Franky, unconfirmed): "Confirm your campus" / "Is Indianapolis still right?" with "Yes", "Change" and "Not now". It sits directly above the tab strip on Feed and Orgs, and its card doesn't touch the screen edges.
  - "Yes" with the blocker (synthetic 200 `{ok:true}`): `__nonGet` holds exactly one PATCH `/api/me/profile` with body `{"campus_id":"indianapolis"}`, and the banner hides.
  - "Not now": `sessionStorage.vibe_campus_confirm_dismissed === "1"`, and the banner stays hidden after a client-side tab switch.
  - The overrides below apply to `/api/me/onboarding-state` only:
    - `campus_id:null` → "Pick your campus" / "Your campus decides the clubs, events and map you see."
    - `campus_confirmed:true` → no banner, and `document.getElementById("otto-mobile-tour-tabs").previousElementSibling` is the Otto strip wrapper, as at HEAD
    - 500 → no banner
  - The tour's feed bubble still resolves the campus name (B14t).
- **Events empty line (B14 item 3).** Override `/api/events?limit=50` → `{ok:true, events:[]}` → "Nothing scheduled" + "When orgs or classmates create events, they'll surface here."
- **Feed Edit (E3).** Real feed (Franky has 10 published posts, 4 with media; read-only SQL, ids shown as `left(id::text,8)`), blocker installed:
  - Your own card's ⋯ lists exactly "Send to chats", "Copy link", "Edit post", "Cancel". Another author's card lists "Send to chats", "Copy link", "Report post", "Cancel".
  - "Edit post" opens the "Edit post" sheet above "Post options". While you type and tap inside the textarea:
    - no post viewer opens
    - no `/api/posts/<id>/like` entry lands in `__nonGet`
  - Synthetic PATCH `/api/posts/<id>` → 200 `{ok:true, post:{id, content:"cm check #cmcheck", tags:["cmcheck"], edited_at:<now ISO>}}`:
    - both sheets close and "Post updated" toasts
    - the card shows "cm check" and a "#cmcheck" chip, and its sub-line contains " · Edited"
    - no new GET `/api/feed?limit=50` follows
    - `__nonGet` holds exactly one PATCH whose body is `{"content":"cm check #cmcheck"}` (no `tags`, no `status`)
    - `getComputedStyle(document.body).pointerEvents !== "none"`, and `window.scrollBy(0, 400)` moves the feed (vaul released its lock)
  - Synthetic PATCH → 403 `{ok:false,error:"Terms",code:"terms_required"}` → toast "Accept the Terms first, then try again.". The edit sheet stays open with the draft, and the card is unchanged.
  - An image post's sheet shows "You can change the words. The photo or video stays.".
  - With a #tag filter on (tap a card chip), a synthetic 200 edit triggers exactly one extra GET `/api/feed?limit=50&tag=<tag>`.
  - Viewer path: tap your own card, then ⋯ → "Edit post" in the viewer → synthetic 200 → close the viewer. The card underneath shows the new text and " · Edited" with no feed refetch.
  - A `/api/feed?limit=50` override setting `edited_at` on one post → that card's sub-line shows " · Edited" (0 live posts are edited today).
- **Franky's phone test** (iOS Safari, after deploy, by hand; the only real writes):
  - the Orgs rows fit at his width
  - Edit from a feed card: Save closes both sheets with no scroll jump, the textarea doesn't zoom, and the edit shows " · Edited"
  - "Yes" on the banner confirms his campus

**Do not touch:** every file except `CampusMobile.tsx`, in particular:
- `CampusConfirmBanner.tsx`, `EditPostSheet.tsx`, `PostViewerMobile.tsx` (B14t/E2; defects go to the orchestrator)
- `src/components/orgs/*`, `src/lib/orgs/join-copy.ts`, `join-state.ts` (F5a / nobody)
- `campus-home.tsx` (CH2 owns it in W4)
- `ProfileMobile.tsx` (PM, same wave)
- `src/lib/onboarding/*` and `src/components/mobile/onboarding/*` (B12/B12S)
- every API route

Inside `CampusMobile.tsx`, leave `ChatPane`'s body, `JoinedOrg`, `OrgChannelsDrawer`, `DarkChannelRow`, the `CampusBanner` line, `CampusSearchOverlay`'s export and body (only `SearchOrg` and `SearchOrgRow` change), `ComposerFab`, `MapPane` and `TabStrip` alone.

---

### CH2 · desktop campus home Orgs tab, student side: Follow next to Join, "You're invited" and "Yours", filters, quick view, rail chip, search meta

**Owns:** `src/app/campus/campus-home.tsx`
**Depends on:**
- CH1 (W3, same file, on `main` by G3). Keep its `useViewerCampus` labels: the `OrgsTabBody` eyebrow `'Organizations · {label}'` and the Verified hint `'Officially recognized clubs at {label}.'`. Also keep the feed Edit post work and `CampusBanner`.
- H1 (W1, same file). Its `discoverJoinLabel` helper, its optional `DiscoverOrg` fields and its `handleJoin` failure copy are REPLACED here.
- F5a. Imports `OrgJoinControl`, `orgRowView`, `policyChip`, `audienceChip`, `memberCountText`, `inviteSubText` and `type OrgRelation`.
- F2 live: `org_follow_state` on discover rows, `?filter=following`, nullable `member_count`.
- F1 live: the follow routes, called by URL inside `OrgJoinControl`.
- H1 live: `join_policy` / `audience` on `/api/search` org rows.
- Gate G3.

**Anchors:** H1 and CH1 both edit `campus-home.tsx` before this batch, so every site in it is named by function, type or constant, never by line. Re-grep them on `main` before editing (§4.1 rule 6). The `:line` anchors below are only in files no batch touches, and were re-read at `f23bc5d`:
- `src/app/api/me/org-invites/route.ts`
- `src/lib/org-asset-url.ts`
- `src/lib/orgs/join-state.ts`
- `src/components/feedback/LoadFailed.tsx`
- `src/lib/feedback/request.ts`

Live facts (read-only SQL, 2026-09-16):
- `sae` is `join_policy='invite'`, `audience='both'`, verified, with 1 member, 1 follower, 4 channels and 0 pending invites.
- The other four clubs are hidden.

**Scope limit:**
- CH2 does not touch `CreateOrgModal`, `OrgSettingsModal` or any of its tabs (`SettingsRequests`, the Overview form, `ReadOnlyRow 'Visibility'`). Those belong to CH3 (W5).
- It does not touch the `filter=mine` loads in `CampusHome` (chat rail) or the post-as-club picker (`EligibleOrg`).
- It does not touch `EmptyState`'s "Discover orgs" card, which CH1 already rewrote.
- It adds no follower count to any student surface.

**Contract**

1. **Imports** (top of file, next to the existing `@/lib/...` imports)
   - `import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";`
   - `import { audienceChip, inviteSubText, memberCountText, orgRowView, policyChip, type OrgRelation } from "@/lib/orgs/join-copy";`
   - `import type { JoinPolicy, JoinState, OrgAudience } from "@/lib/orgs/join-state";` (`join-state.ts:59`, `:62`, `:80-89`; pure, no imports)
   - `import { orgAssetProxyUrl } from "@/lib/org-asset-url";` (`org-asset-url.ts:12-25`; no imports, client-safe)
   - Module-level type: `type OrgControlChange = Parameters<NonNullable<React.ComponentProps<typeof OrgJoinControl>["onChange"]>>[0];`. Never re-declare F5a's shape by hand.

2. **Types**
   - **`Org`** (the rail / `filter=mine` row) gains these optional fields, which `/api/orgs?filter=mine` already sends:
     - `join_policy?: JoinPolicy`
     - `audience?: OrgAudience`
     - `hidden?: boolean`
     - `campus_id?: string | null`

     `is_public` STAYS on `Org`, because CH3's settings still read it.
   - **`DiscoverOrg`** (replace H1's optional fields; drop `is_public` and `pending_request`):
     ```ts
     type DiscoverOrg = {
       id: string; handle: string; name: string; description: string;
       logo_url: string | null; banner_url?: string | null; backdrop_preset: BackdropKey;
       verified: boolean; dormant: boolean;
       member_count: number | null;             // F2 C27: null on a failed read
       role?: Role | null;
       join_policy: JoinPolicy | null;          // null only on a row built from /api/me/org-invites
       audience: OrgAudience;
       join_state: JoinState;
       join_reason?: "policy" | "visiting" | null;
       pending_invite?: { id: string; expires_at: string; invited_by_name: string | null } | null;
       org_follow_state?: "following" | "not_following";
       follower_count?: number | null;          // typed only, NEVER rendered (C13, No vanity metrics)
       links?: Array<{ label: string; url: string }>; philanthropy?: string;
     };
     ```
   - **`DiscoverFilter`** = `"all" | "following" | "open" | "request" | "invite"`.
   - **`type MeInvite`**, the shape `/api/me/org-invites` answers (`me/org-invites/route.ts:95-122`): `{ id: string; created_at: string; expires_at: string; org: { id: string; handle: string; name: string | null; logo_url: string | null /*RAW key*/; verified: boolean; audience: OrgAudience }; invited_by: { name: string } | null }`.
   - **`type OrgOverride`** = `{ state: JoinState; following: boolean; role: Role | null; approx?: true }`.
   - **`SearchOrg`** gains `join_policy?: JoinPolicy; audience?: OrgAudience`. `is_public` stays in the type; it is no longer read.

3. **Delete dead code.**
   - Remove H1's `discoverJoinLabel`.
   - Remove `OrgsTabBody`'s `pending` / `busy` state, the seeding block inside the discover effect, and `handleJoin`.
   - After the edit, `rg -n "discoverJoinLabel|handleJoin" src/app/campus/campus-home.tsx` must return 0.

4. **`OrgsTabBody` state and loads**
   - **Keep:** `results`, `searchInput`, `debouncedQ`, `showDormant`, `previewOrg`, `loadErr`, `loadKey`, `loadedRef`.
   - **Keep the discover effect:** `filter=discover`, `q`, `include_dormant`; same quiet failure handling and same deps.
   - **One change in its success branch**, after `setResults(orgs)`: `setOverrides((prev) => dropApprox(prev))`. `dropApprox` is a module-level pure helper that removes the entries with `approx: true`.
   - **New state:**
     - `overrides: Record<string /*org id*/, OrgOverride>` (`{}`)
     - `followingOrgs: DiscoverOrg[] | null`, `followingHasMore: boolean`, `followingErr: LoadFailure | null`
     - `invites: MeInvite[] | null`, `invitesErr: LoadFailure | null`
     - `sideKey: number` (`0`)
     - `const YOURS_PREVIEW = 6` (module level)
   - **Following effect** (deps `[debouncedQ, sideKey]`):
     - Request: `vibeRequest<{ orgs?: DiscoverOrg[]; has_more?: boolean }>(`/api/orgs?${new URLSearchParams(debouncedQ ? { filter: "following", q: debouncedQ } : { filter: "following" })}`, { cache: "no-store", quiet: true, failure: "Couldn't load the clubs you follow." })`
     - Cancelled check exactly like the discover effect.
     - On `!r.ok || !Array.isArray(r.data.orgs)`, with `failure = asLoadFailure(r, "Couldn't load the clubs you follow.")`:
       - no list yet (`followingOrgs === null`) → `setFollowingErr(failure)`
       - otherwise → keep the rows and `toast({ message: failure.message, tone: "error", action: failure.action })`
     - On ok: `setFollowingErr(null); setFollowingOrgs(r.data.orgs); setFollowingHasMore(r.data.has_more === true)`.
     - Rows come back newest follow first and include member clubs. Never re-sort them.
   - **Invites effect** (deps `[sideKey]`):
     - Request: `vibeRequest<{ invites?: MeInvite[] }>("/api/me/org-invites", { cache: "no-store", quiet: true, failure: "Couldn't load your invites." })`
     - Handle failure the same way, into `invitesErr` / toast.
   - **Where "Yours" comes from.** Neither effect replaces `filter=mine`. The "Yours" list comes ONLY from `?filter=following` (hazard: `filter=mine` is the chat rail).
   - **Selecting the "Following" chip** calls `setSideKey((k) => k + 1)` as well as `setFilter("following")`, so that list is fresh.

5. **One relation per org** (a `useCallback` in `OrgsTabBody`, deps `[overrides]`)
   ```ts
   const relationOf = (o: DiscoverOrg): OrgRelation => {
     const ov = overrides[o.id];
     const state = ov?.state ?? o.join_state;
     const role = ov ? ov.role : (o.role ?? null);
     const following = state === "member" || role != null || (ov ? ov.following : o.org_follow_state === "following");
     return { handle: o.handle, orgName: o.name, state, following, role, reason: o.join_reason ?? null, audience: o.audience, joinPolicy: o.join_policy };
   };
   ```
   - This is §4.2's `following = role != null || org_follow_state === "following"`, with F5a's "force following when member".
   - An override is always the latest answer the server confirmed, so it wins over row data for the life of the tab.
   - The card and the quick view call the SAME `relationOf`, so both show one state.

6. **`handleChange(org: DiscoverOrg, prev: OrgRelation, next: OrgControlChange)`**
   - `if (next.state === "signed_out") return;` (the tab is signed-in only).
   - **`next.declined`:**
     - `setOverrides((p) => ({ ...p, [org.id]: { state: next.state, following: next.following, role: next.role, approx: true } }))`
     - then `setLoadKey((k) => k + 1)` and `setSideKey((k) => k + 1)`
     - F5a's decline state is a guess (it can't know `visiting` or `audience_blocked`). The discover refetch replaces it, and its success branch drops `approx` entries. The effect cleanup cancels any older in-flight discover response, so only the post-decline response lands.
   - **`next.state !== prev.state`** (join, request or accept):
     - set a non-approx override
     - `setSideKey((k) => k + 1)`: the invite inbox drops the accepted invite, and "Yours" gains the club through the join trigger
   - **Otherwise** (follow ⇄ unfollow only): set the override and reload NOTHING. The card stays where it is and shows its new control; it never jumps between groups on the tap.
   - Never call `/api/orgs?filter=mine` from here. Never toast from here: `OrgJoinControl` owns every toast (F5a C).

7. **`OrgsTabBody` render**
   - **`SceneHeader`:**
     - keep CH1's eyebrow
     - `subtitle` → `"Follow any club to get its posts. Join to get its chats."`
   - **The list source.**
     - `filter === "following"` → `followingOrgs`
     - otherwise → `results`, narrowed by `join_policy === filter` when the filter is `open` / `request` / `invite`
     - The client never reads `is_public`.
   - **Side groups** show only when `filter === "all" && !debouncedQ`. Call that `showSide`.
     - **`invitedRows`:**
       - When `invites` is non-null, map each invite IN ORDER:
         - if `results` or `followingOrgs` has a row with that org id, use it, with `pending_invite: row.pending_invite ?? { id: inv.id, expires_at: inv.expires_at, invited_by_name: inv.invited_by?.name ?? null }`
         - otherwise build a row with the module-level `orgFromInvite(inv)`:
           - `{ id, handle, name: org.name ?? org.handle, description: "", logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"), banner_url: null, backdrop_preset: DEFAULT_BACKDROP, verified, dormant: false, member_count: null, role: null, join_policy: null, audience, join_state: "invited", join_reason: null, pending_invite: {…from inv}, org_follow_state: "not_following" }`
           - Proxy ONLY here: `orgAssetProxyUrl` is not idempotent, and it returns null for an already-proxied `/api/orgs/…` value (`org-asset-url.ts:18-24`).
           - A synthesized "Follow" that is really already followed self-corrects, because POST answers `already:true`.
       - Then append any `results` / `followingOrgs` row whose effective `relationOf(o).state === "invited"` and that isn't in the list yet.
       - Finally keep only rows where `relationOf(o).state === "invited"`, so an accepted card leaves the group as soon as its override lands.
     - **`yoursRows`** = `(followingOrgs ?? [])` minus the ids in `invitedRows`, in server order.
     - **`shownIds`** = ids of `invitedRows` ∪ (`followingOrgs` ids when non-null). The Verified / Student communities / Dormant groups exclude `shownIds` only when `showSide`.
   - **Loading.**
     - Show "Loading orgs…" (today's element) while `results === null`.
     - When `showSide`, also show it while `followingOrgs === null && !followingErr` or `invites === null && !invitesErr`. SAE must not render under Verified and then jump to "Yours".
     - When `filter === "following"`, show it while `followingOrgs === null && !followingErr`.
     - A first-load discover failure keeps today's `DarkGlassCard` + `LoadFailed`.
     - A first-load following failure while `filter === "following"`: the same card with `followingErr`, and Retry does `setFollowingErr(null); setSideKey((k) => k + 1)`.
   - **Groups, in order, when `showSide`:**
     1. `"You're invited"`, hint `"Accept to become a member and get the chats."`.
        - Renders when `invitedRows.length > 0 || invitesErr`.
        - `invitesErr` → `<LoadFailed tone="dark" compact failure={invitesErr} onRetry={() => { setInvitesErr(null); setSideKey((k) => k + 1); }} />` under the title, above any cards. Discover rows that say `invited` still render here.
        - `titleStyle={{ color: "#FF5C35" }}`.
     2. `"Yours"`, hint `"Clubs you follow or belong to."`.
        - Renders when `yoursRows.length > 0 || followingErr`.
        - `followingErr` → the same compact dark `LoadFailed` in place of the cards. Retry runs `setFollowingErr(null); setSideKey((k) => k + 1)`.
        - Cards: `yoursRows.slice(0, YOURS_PREVIEW)`.
        - `count={yoursRows.length}`.
        - Footer when `yoursRows.length > YOURS_PREVIEW || followingHasMore`: a text button `"See all clubs you follow →"` that runs the "Following" chip handler (item 4).
     3. `"Verified"`: hint unchanged from CH1.
     4. `"Student communities"`: hint → `"Groups created by verified students. Anyone can follow them."`.
     5. `"Dormant"`: hint unchanged.
   - **When `filter === "following"`:** ONE group, `"Following"`, hint `"Every club you follow, including the ones you joined."`, with all rows. When `followingHasMore`, a muted 12px line under the grid: `"Showing the 100 clubs you followed most recently."`.
   - **When `open` / `request` / `invite`, or any query:** today's Verified / Student communities / Dormant split with no exclusion.
   - **Empty copy.** This replaces the three-way ternary. It shows when no group has a card and no group-level error is showing:
     - `filter === "following"`, with a query → `` `No clubs you follow match “${debouncedQ}”.` ``; without → `"You don't follow any clubs yet."`
     - another filter with a query → `` `No clubs match “${debouncedQ}”.` ``
     - `open` → `"No open clubs here yet."`
     - `request` → `"No clubs here take requests yet."`
     - `invite` → `"No invite-only clubs here yet."`
     - `all` → unchanged: `"No orgs to discover yet — be the first to create one."`
   - **`OrgQuickViewModal` mount:** `org={previewOrg}`, `relation={relationOf(previewOrg)}`, `onClose`, `onChange={(prev, next) => handleChange(previewOrg, prev, next)}`. The modal STAYS OPEN after a change and repaints from the override.

8. **`DiscoverFilterChips`**
   - Options, in order:
     - `all` "All"
     - `following` "Following"
     - `open` `policyChip("open")`
     - `request` `<LockIcon size={11} /> {policyChip("request")}`
     - `invite` `<LockIcon size={11} /> {policyChip("invite")}`

     That renders as All · Following · Open · By request · Invite only.
   - Each chip button gains `aria-pressed={on}`. The styles don't change.
   - The `onChange` prop stays `(f: DiscoverFilter) => void`. `OrgsTabBody` passes `(f) => { if (f === "following") setSideKey((k) => k + 1); setFilter(f); }`.

9. **`DiscoverGroup`**
   - **Props:** `{ title; hint; orgs: DiscoverOrg[]; count?: number; relationOf: (o: DiscoverOrg) => OrgRelation; onChange: (o: DiscoverOrg, prev: OrgRelation, next: OrgControlChange) => void; onPreview: (o: DiscoverOrg) => void; error?: { failure: LoadFailure; onRetry: () => void } | null; footer?: React.ReactNode; titleStyle?: React.CSSProperties }`.
   - `pending`, `busy` and `onJoin` are removed.
   - The count badge shows `count ?? orgs.length`.
   - `error` renders the compact dark `LoadFailed` between the header and the grid.
   - `footer` renders under the grid.
   - Each card: `<DiscoverCard key={o.id} org={o} relation={relationOf(o)} onChange={(prev, next) => onChange(o, prev, next)} onPreview={() => onPreview(o)} />`.

10. **`DiscoverCard`** (`view = orgRowView(relation, "card")`)
    - **Props:** `{ org: DiscoverOrg; relation: OrgRelation; onChange: (prev: OrgRelation, next: OrgControlChange) => void; onPreview: () => void }`.
    - **Delete** `memberCount = org.member_count ?? 0`, the `label` / `disabled` computation (H1's `discoverJoinLabel` call) and the whole "Joined" div / join `<button>` branch.
    - **Card keyboard handler:** `onKeyDown` acts only when `e.target === e.currentTarget`. Without that, Enter or Space on an inner Follow button calls `preventDefault()` while bubbling, which cancels the button's own activation and opens the preview instead.
    - **Name line:**
      - after `VerifiedBadge` and the dormant pill, when `view.chip` is set: a pill styled like the dormant pill, with color `#FFD9CC`, background `rgba(255,92,53,0.18)`, border `1px solid rgba(255,92,53,0.4)`, and text `view.chip`
      - on cards that chip is only "Invited you"
    - **Meta line**, parts joined by the existing `·` separator spans, with a separator only between parts that are present:
      1. `@{handle}`
      2. each `view.meta` string, with `<LockIcon size={10} />` before "By request" / "Invite only"
      3. `memberCountText(org.member_count)` when non-null (C27)
      4. `<RoleChip role={relation.role} />` when `relation.role`
    - **No** `follower_count`, `followerCountText` or "followers" anywhere on the card (C13).
    - **Invite line.** When `relation.state === "invited" && org.pending_invite`, one 12px `COLORS.glassMuted` line under the meta: `inviteSubText(org.pending_invite.invited_by_name, org.pending_invite.expires_at)`, e.g. "Invited by Franky · Expires Oct 16".
    - **Controls row** (replaces the join branch; keeps the "Profile" `Link` and its `stopPropagation`):
      - The row gets `flexWrap: "wrap"`.
      - Controls: `<div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ flex: "1 1 auto", minWidth: 0 }}><OrgJoinControl relation={relation} variant="card" source="discover" pendingInviteId={org.pending_invite?.id ?? null} onChange={(next) => onChange(relation, next)} /></div>`
    - **Disclosure.** When `view.disclosure` is set, a 12px `COLORS.glassMuted` line under the controls row: "Officers can see who follows this club." It shows only on request and invite-only clubs with a follow control (F5a, Q7).
    - **Dark surface.** CH2 does NOT restyle, fork or re-implement `OrgJoinControl`'s buttons, and does not edit F5a files. If the shipped `card` styling assumes a light surface and reads poorly on `DARK_GLASS_SURFACE`, attach a 1280px screenshot to the batch report. The orchestrator decides on an additive `tone` prop in repair.

11. **`OrgQuickViewModal`**
    - **Props:** `{ org: DiscoverOrg; relation: OrgRelation; onClose: () => void; onChange: (prev: OrgRelation, next: OrgControlChange) => void }` (`status`, `busy` and `onJoin` are removed).
    - **Delete** `memberCount = org.member_count ?? 0` and `ctaLabel` / `ctaDisabled` (H1's `discoverJoinLabel` call).
    - **Name line:** `view.chip` pill as on the card, where `view = orgRowView(relation, "card")`.
    - **Meta line:** exactly the card's parts, in the card's order. The Private/Public branch is gone.
    - **Invite line:** the card's invite line, directly above the CTA row.
    - **CTA row:**
      - `display: flex`, `gap: 8`, `flexWrap: "wrap"`
      - the control wrapper and `OrgJoinControl` exactly as on the card (the modal content already stops click propagation)
      - then the existing `"Open profile →"` Link, unchanged
      - `view.disclosure` under the row, 12px muted
    - The "Joined" green div and the join `<button>` are removed.

12. **`ChannelRail` header meta** (the line that renders `Private` / `Public` and `` ` · ${channels.length} channels` ``)
    - Parts in order:
      1. `"Hidden"` when `org.hidden`
      2. when `org.join_policy` is set: `<LockIcon size={11} />` (request/invite only) followed by `policyChip(org.join_policy)`
      3. unless `loadErr`: `` `${channels.length} ${channels.length === 1 ? "channel" : "channels"}` ``
    - ` · ` goes only between present parts. With no `join_policy` (an old cached row), the policy part is simply left out.
    - The "no count while the list failed" rule and its comment stay.
    - Expected for SAE's owner: `Invite only · 4 channels`.
    - The rail's data source is unchanged: `filter=mine` in `CampusHome`.

13. **`CampusSearchBar` dropdown, "Clubs & Orgs" rows**
    - The `EntityRow` `role` becomes `[memberCountText(o.member_count), o.verified ? "Verified" : null, o.join_policy && o.join_policy !== "open" ? policyChip(o.join_policy) : null, o.audience ? audienceChip(o.audience) : null].filter(Boolean).join(" · ")`.
    - The `action` stays "View" and `goOrg` is unchanged.
    - This also fixes today's "1 members".
    - Expected for `sae`: `1 member · Verified · Invite only`.

**Acceptance**

Static (run on the batch's tree):
- `npx tsc --noEmit` exits 0.
- `npx eslint src/app/campus/campus-home.tsx` is not above the count on `main` after CH1. Record it before editing; it is expected to be ≤ 8.
- `node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts src/lib/orgs/join-state.test.ts` still passes. CH2 edits neither file.
- The student-side scope check prints nothing:
  ```sh
  awk '/^function (OrgsTabBody|OrgQuickViewModal|DiscoverGroup|DiscoverFilterChips|DiscoverCard|ChannelRail)\(/{f=1;next} /^(export )?(async )?function /{f=0} f&&/is_public|follower_count|followerCountText|discoverJoinLabel|handleJoin|member_count \?\? 0|Private|"Public"/{print NR": "$0}' src/app/campus/campus-home.tsx
  ```
  (At `f23bc5d` the same script prints 21 lines, so it does catch the old code.)
- `rg -n "discoverJoinLabel|handleJoin" src/app/campus/campus-home.tsx` → 0 hits.
- `rg -c "<OrgJoinControl" src/app/campus/campus-home.tsx` → 2.
- `rg -n 'source="discover"' src/app/campus/campus-home.tsx` → 2 hits.
- `rg -n "follower_count|followerCountText" src/app/campus/campus-home.tsx` → exactly 1 hit: the `DiscoverOrg` type field.
- `rg -n "filter=mine" src/app/campus/campus-home.tsx` → exactly 2 hits (the rail load and the post-as-club picker).
- `git diff origin/main -- src/app/campus/campus-home.tsx | rg "filter=mine|EligibleOrg"` → no output.
- `rg -n "Anyone can join the public ones|No orgs match" src/app/campus/campus-home.tsx` → 0 hits.
- `rg -n 'api/me/org-invites|filter: "following"' src/app/campus/campus-home.tsx` → at least 2 hits.

Live, read-only (1280px, prod, signed in as Franky, who owns SAE, in the gstack browser):
- Setup (§4.1 rule 2):
  - Before opening the Orgs tab, install a `window.fetch` wrapper that records every non-GET `{method, url, body}` and answers it from a canned table. Nothing non-GET reaches the network.
  - The same wrapper serves the GET overrides named below.
  - `window.confirm` is stubbed to return true only for the decline check.
  - No real follow, join, accept, decline or invite happens.

1. **No overrides** (real data):
   - Opening the tab fires exactly one each of `GET /api/orgs?filter=discover`, `GET /api/orgs?filter=following` and `GET /api/me/org-invites`, and no non-GET.
   - "Yours" shows SAE: disabled "Joined ✓", the OWNER role chip, meta `@sae · Invite only · 1 member`, and NO "Officers can see who follows this club." line.
   - SAE is not repeated under "Verified".
   - There is no "You're invited" group.
   - Chips:
     - "Open" → "No open clubs here yet."
     - "Invite only" → SAE under "Verified"
     - "Following" → one "Following" group holding SAE
   - The SAE chat rail reads `Invite only · 4 channels`.
   - Typing `sae` in the campus search shows the row `1 member · Verified · Invite only`.
   - `/\bfollowers?\b/i.test(document.body.innerText)` → false.
2. **Non-member by override.**
   - Overrides:
     - discover: SAE with `role:null, join_state:"invite_only", org_follow_state:"not_following", follower_count:12`
     - following: `{ok:true, orgs:[], has_more:false}`
     - invites: `{ok:true, invites:[]}`
   - SAE under "Verified" shows "Follow" only, meta `@sae · Invite only · 1 member`, and the line "Officers can see who follows this club.". No "12" and no "followers" on the card or in the quick view.
   - Clicking the card body opens the quick view with the same chip, meta, control and line, plus "Open profile →".
   - Clicking "Follow" (canned `{ok:true, org_follow_state:"following", already:false, follower_count:null}` after 800ms):
     - records exactly `POST /api/orgs/sae/follow` with body `{"source":"discover"}`
     - the button reads "…" until the answer, then "Following ✓"
     - the quick view does not open
     - NO new GET to `filter=following` or `/api/me/org-invites` follows the POST
   - Tab to "Follow" and press Enter: the POST is recorded and no quick view opens.
   - A canned 404 `{ok:false, error:"Not found", code:"not_found"}` → toast "This org isn't available." and the label stays "Follow".
3. **State matrix.** Start from scenario 2's three overrides, including `role:null` (Franky really owns SAE, and a leftover `role` would force `following`). Then change these SAE fields, one reload each:
   - `join_policy:"open", join_state:"can_join"` → "Follow" + "Join", no disclosure, meta `@sae · 1 member`.
   - `join_policy:"request", join_state:"can_request", org_follow_state:"following"` → "Following ✓" + "Request to join", meta `@sae · By request · 1 member`, disclosure shown.
   - `join_state:"requested"` → "Follow", and the meta includes "Requested".
   - `join_state:"audience_blocked", audience:"iu"` → "Follow", meta `@sae · Invite only · IU only · 1 member`.
   - `member_count:null` → meta `@sae · Invite only` (no "0 members").
4. **Invites.**
   - Overrides, on top of scenario 2's:
     - discover: SAE with `role:null`, `join_state:"invited"` and `pending_invite:{id:"00000000-0000-4000-8000-000000000001", expires_at:"2026-10-16T16:00:00Z", invited_by_name:"Franky"}`
     - invites, two rows in this order:
       - that same invite for `sae`
       - `{id:"00000000-0000-4000-8000-0000000000aa", …, org:{id:"00000000-0000-4000-8000-0000000000bb", handle:"zz-fake-club", name:"Fake Club", logo_url:null, verified:false, audience:"both"}, invited_by:null}`
   - "You're invited" is the first group, with count 2 and SAE first:
     - chip "Invited you"
     - line "Invited by Franky · Expires Oct 16"
     - "Accept invite" + "Decline"
     - SAE is absent from "Verified"
   - The Fake Club card shows "No description yet.", meta `@zz-fake-club` only, "Invited by an officer · Expires …", and no broken logo request.
   - "Accept invite" on SAE (canned `{ok:true, joined:true, role:"member"}` after 800ms):
     - records `POST /api/orgs/sae/join` with body `{}`
     - then "Joined ✓"; SAE leaves "You're invited"
     - after the POST resolves, exactly one new GET each to `filter=following` and `/api/me/org-invites`
   - "Decline" on Fake Club (confirm stubbed to true, canned ok):
     - records `POST /api/me/org-invites/00000000-0000-4000-8000-0000000000aa` with body `{"action":"decline"}`
     - then new GETs to `filter=discover`, `filter=following` and `/api/me/org-invites`
5. **Failures.**
   - Following override 500 `{ok:false, error:"Failed to load orgs", code:"load_failed"}`:
     - "Yours" shows its title plus "Couldn't load the clubs you follow." and Retry
     - "Verified" still renders (SAE included)
     - Retry fires exactly one new following GET
   - Invites override 500 → "You're invited" shows its title plus "Couldn't load your invites." and Retry; the rest of the tab renders.
   - A "Following" chip with a following 500 on first load → the dark card `LoadFailed`, and no "You don't follow any clubs yet."
   - Following override `has_more:true`:
     - "Yours" shows "See all clubs you follow →", which selects the "Following" chip and fires a new following GET
     - that view ends with "Showing the 100 clubs you followed most recently."
6. **Regression.**
   - `/api/orgs?filter=mine` returns the same ids as the G4 recording.
   - The rail lists the same clubs.
   - The composer's post-as-club picker still offers SAE (open it; don't post).
   - The recorded non-GET list contains only the requests the steps above tapped on purpose.

**Do not touch:**
- **CH3 (W5):** `CreateOrgModal`, `OrgSettingsModal` and all its tabs (Overview form, `ReadOnlyRow 'Visibility'`, `SettingsRequests`), the settings tab rule that reads `org.is_public`, and `Org.is_public`.
- **In `CampusHome`:** the `filter=mine` rail load, the channels loads, and the `EligibleOrg` post-as-club picker. In `ChannelRail`, only the header meta line changes.
- **CH1's work:** `useViewerCampus`, `CampusBanner`, the `SCHOOL` removal, eyebrows, the Verified hint, the tour, map halos, the feed Edit post work, `EmptyState`, `page.tsx`.
- **`MapTabBody` / `ZonePanel`.** The following spec's "Members only. Follow to get their posts." zone footer (B19-orgs-a item 9) is NOT built. `MapOrg` carries only `is_public`, `/api/campus-map` selects no `join_policy` (`campus-map/route.ts:208`), and no wave owns that route. It is left for a later map batch.
- **Other files:** F5a's files (`join-copy.ts`, `OrgJoinControl.tsx`, `OrgInviteSheet.tsx`, `OrgInviteBanner.tsx`), `join-state.ts`, `org-asset-url.ts`, `globals.css`, and every API route.
- **Exports used by other files keep their signatures:** `CampusBanner`, `EventCard`, `OttoFeedStrip`, `BACKDROP_PRESETS`, `CampusEvent`, `FeedPost` (CampusMobile), and `CreateEventModal`, `EligibleOrg` (`OrgEventsSection.tsx`).

---

### PM · phone profile: campus and major pickers follow your university (B16m), Edit post on your own cards (E5)

**Owns:** `src/components/mobile/ProfileMobile.tsx`
**Depends on:**
- E0: `type EditedPost` from `src/lib/posts/edit.ts`.
- E1 live: PATCH `/api/posts/[id]`, and `edited_at` in `/api/me/posts` and `/api/users/[handle]/posts`.
- E2: `EditPostSheet`, plus the optional `onEdited` prop on `PostViewerMobile`.
- B15: `settingsCampusCardView` in `src/lib/profile/settings-campus-card.ts`. The phone profile and Settings pickers then share one source for rules and copy (the reader notes flagged three pickers with duplicated strings). **Add this file to the G3 list.**
- The wave 2 B6 campus server rules. No server change.

**Live state (read-only, 2026-09-16):**
- Users:
  - 7 are IU-verified with a campus that isn't confirmed yet.
  - 7 are IU-verified with no campus.
  - 5 are unverified, with no system.
  - 0 rows have `campus_set_at`. Nobody is in a cooldown, and any real campus write by an agent would be the first stamp.
- Posts: 20 published, 4 with media.
- eslint on ProfileMobile.tsx gives 11 problems at `f23bc5d` (recounted).

**Anchors:**
- W1–W3 leave `ProfileMobile.tsx` alone (E2's Do not touch lists it), so every `:line` below is at `f23bc5d`.
- `PostViewerMobile.tsx` (E2, W3) and `CampusMobile.tsx` (CM, same wave) are cited by function name.

**Contract**

1. **Imports** (:18-19)
   - Delete the `IU_CAMPUSES, campusByLabel` import and the `IU_MAJORS_BY_SCHOOL` import.
   - Add:
     - `import { allowedCampusId, isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";`
     - `import { majorsForCampus } from "@/lib/iu/majors";`
     - `import { settingsCampusCardView } from "@/lib/profile/settings-campus-card";`
     - `import { EditPostSheet } from "@/components/mobile/EditPostSheet";`
     - `import type { EditedPost } from "@/lib/posts/edit";`
   - Import no server-only module, and don't import `profile-campus-write.ts` directly.

2. **Own campus state** (replaces the legacy label, :347-356)
   - Module scope, next to `pick` (:222-227):
     ```ts
     type OwnCampus = { schoolSystem: SchoolSystem | null; campusId: string | null; campusChangeAvailableAt: string | null; campusConfirmed: boolean };
     const NO_OWN_CAMPUS: OwnCampus = { schoolSystem: null, campusId: null, campusChangeAvailableAt: null, campusConfirmed: false };
     function readOwnCampus(d: Record<string, unknown> | null | undefined): OwnCampus
     ```
     - `schoolSystem`: `isSchoolSystem(d?.schoolSystem) ? d?.schoolSystem : null` (narrow via a local `const raw = d?.schoolSystem`)
     - `campusId`: `allowedCampusId(d?.campusId, schoolSystem)`
     - `campusChangeAvailableAt`: a string, else null
     - `campusConfirmed`: `d?.campusConfirmed === true`
   - `const [campus, setCampus] = useState<string | null>(null)` (:351) becomes `const [ownCampus, setOwnCampus] = useState<OwnCampus>(NO_OWN_CAMPUS)`. Rewrite the comment above it (:347-350): the four fields come top-level from `/api/me/profile-bootstrap` (`profile-bootstrap/route.ts:159-172`, `ownCampusFields`). Owner only.
   - Delete `campusTouched` (:352-356) and each use (:919, :957, :1011, :1620). The "changed from the bootstrap" rule in item 4 replaces it.
   - Mount bootstrap (:371-384):
     - generic: `{ vibeUser?: VibeUser; schoolSystem?: unknown; campusId?: unknown; campusChangeAvailableAt?: unknown; campusConfirmed?: unknown }`
     - `setCampus(…)` becomes `setOwnCampus(isVisitor ? NO_OWN_CAMPUS : readOwnCampus(r.data))`. The visitor bootstrap sends none of these fields.
   - This file stops reading the legacy top-level `campus` label. The badge keeps `vibeUser.studentVerification.school` (:1067, :1447).

3. **`EditDraft.campus`** (:216-218)
   - Now a campus id; `""` means no pick yet.
   - New doc comment: "Campus id from the student's university, or "" before a pick. Sent as `campus_id` only when it differs from the bootstrap's `campusId`."
   - `seedDraftFromUser` (:590-591): `campus: ownCampus.campusId ?? ""`. Delete the `campusByLabel` fallback and its comment (:587-589).

4. **Save** (`commitEdit`, :922-1016)
   - Delete the `school` block (:950-959). In its place:
     ```ts
     // Only a DIFFERENT campus picked in this edit session goes out. Never ""
     // and never the current id: re-sending an unconfirmed campus confirms it
     // and starts the 30-day lock (profile-campus-write.ts:14-18).
     const sentCampusId =
       snapshot.campus && snapshot.campus !== (ownCampus.campusId ?? "") ? snapshot.campus : null;
     if (sentCampusId) body.campus_id = sentCampusId;
     ```
   - Transport stays as it is: a raw `fetch` POST to `/api/me/profile-sync` (:961-966). A non-ok body still throws `j.error` verbatim (:967-971).
     - This client always sends name, bio and the other fields, so a campus rejection comes back as 200 with `campusError` (`profile-sync/route.ts:377`, `:470`, `:476`).
     - The non-ok campus-only answer can't happen here. If it did, the verbatim throw would still show the server's text.
   - Before the re-bootstrap (:976), declare `let freshCampus: OwnCampus | null = null;`.
   - Inside `if (rb.ok && jb?.ok && jb.vibeUser)`, replace :984-986 with `freshCampus = readOwnCampus(jb); setOwnCampus(freshCampus);`.
   - Keep the major (:991-997) and year (:998-1003) round-trip throws as they are.
   - Delete the campus mismatch throw (:1004-1008). After the `if (rb.ok …)` block, in order:
     - `const campusError = typeof j?.campusError?.error === "string" ? j.campusError.error : null;`
     - If `campusError` is set:
       - `setDraft((prev) => (prev ? { ...prev, campus: (freshCampus ?? ownCampus).campusId ?? "" } : prev));`
       - `setEditError(campusError);`
       - `return;`
       - Edit mode stays open; `finally` still clears `savingEdit`.
       - The other fields count as saved, and the picker goes back to the saved campus.
       - Example texts: "That campus isn't part of your university." and "You can change your campus again on October 15.".
     - Else, if `sentCampusId && freshCampus && freshCampus.campusId !== sentCampusId`: `throw new Error("Couldn't save your campus. Try again.")`. The words match `CAMPUS_WRITE_COPY.campus_save_failed` (`profile-campus-write.ts:70`).
   - `cancelEdit` (:916-921) drops `setCampusTouched(false)`. `setDraft(null)` already resets the pick.

5. **Campus picker** (replaces the comment, select and hint at :1612-1657)
   - Computed in the render body next to `const feedPosts = posts ?? [];` (:1110), after the early returns (a plain call, not a hook). JSX reads it only inside `editMode && effectiveDraft`:
     ```ts
     const campusView = !isVisitor && effectiveDraft ? settingsCampusCardView({
       schoolVerified: user.studentVerification?.status === "verified",
       schoolSystem: ownCampus.schoolSystem,
       campusId: effectiveDraft.campus || null,
       campusConfirmed: ownCampus.campusConfirmed,
       campusChangeAvailableAt: ownCampus.campusChangeAvailableAt,
       onboarded: true,
     }) : null;
     ```
     - `campusId` is the draft pick, so `sub` follows what the student just chose.
     - `onboarded` is read only by `nextAvailableAfterWrite`, which PM never calls: the re-bootstrap returns the new `campusChangeAvailableAt`.
     - PM treats `confirm` like `set`. The "Confirm your campus" tap lives in Settings (B15) and on the /campus banner (B14t, mounted by CM).
     - If B15 landed a different signature, re-read `settings-campus-card.ts` on `main` and adapt. The goal is identical rules and copy, not this exact call.
   - New comment: "Campus, chosen within the university your verified school email proved. Same rules and copy as Settings (settings-campus-card.ts)." It must not contain "self-declared", "never verified" or "proves IU membership".
   - `campusView?.mode === "unverified"` (or `campusView` null):
     - no select
     - a line in the hint `<p>` style (:1646-1653), color #5C5853, 12px: "Verify your school email to pick your campus."
     - then `<Link href="/auth/school-email">Verify now →</Link>` (coral #FF5C35, weight 700)
   - Every other mode renders the `<select>` with its current style (:1623-1637) plus `opacity: savingEdit || campusView.locked ? 0.6 : 1`:
     - `value={effectiveDraft.campus}`
     - `onChange={(e) => updateDraft({ campus: e.target.value })}`
     - `disabled={savingEdit || campusView.locked}`
     - when `effectiveDraft.campus === ""`, a first option `<option value="" disabled>Pick your campus</option>`
     - then `campusView.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)`, e.g. "Indianapolis", "Fort Wayne — not open yet"
     - no "Campus — not set" option
   - Under the select, each line in the hint `<p>` style:
     - `campusView.sub` when non-null, e.g. "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"
     - `campusView.note` when locked, color #C0392B, e.g. "You can change your campus again on October 15."
     - the hint, verbatim, on one source line so grep finds it: `{"Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students."}`. This is B15's sentence; it replaces :1655-1656.

6. **Major picker** (:1533-1582)
   - Next to `campusView`: `const majors = effectiveDraft ? majorsForCampus(effectiveDraft.campus || null, ownCampus.schoolSystem) : null;`
   - `majors === null` means no system, or a campus without a curated list (Fort Wayne, Columbus, West Lafayette, …; Q16):
     - the select becomes `<input value={effectiveDraft.major} onChange={(e) => updateDraft({ major: e.target.value.slice(0, 200) })} placeholder="Your major" maxLength={200} />`
     - same flex slot and pill style, without `appearance` and `textOverflow`
   - Otherwise the select keeps `<option value="">Major</option>` and the "saved major isn't in the list" option. That test becomes `!majors.majors.includes(effectiveDraft.major)` (:1562-1569).
     - `majors.groups.length > 0` (Indianapolis, IU or Purdue): `<optgroup key={g.school.id} label={g.school.shortLabel}>` per group
     - `majors.groups.length === 0` (IU Bloomington): a flat `majors.majors.map(…)`
   - The year select (:1583-1610) doesn't change. The major round-trip check stays; profile-sync trims to 200 (`profile-sync/route.ts:102-104`).

7. **In-place post edits**
   - `PostRow` (:141-148) adds `tags?: string[] | null; edited_at?: string | null;`.
   - Right after `refetchPosts` (:473), before any early return:
     ```ts
     const applyPostEdit = useCallback((p: EditedPost) => {
       setPosts((prev) => prev ? prev.map((x) => x.id === p.id ? { ...x, content: p.content, tags: p.tags, edited_at: p.edited_at } : x) : prev);
       setSavedPosts((prev) => prev ? prev.map((x) => x.id === p.id ? { ...x, content: p.content, tags: p.tags } : x) : prev);
       setReposts((prev) => prev ? prev.map((r) => r.post.id === p.id ? { ...r, post: { ...r.post, content: p.content, tags: p.tags } } : r) : prev);
     }, []);
     ```
   - No refetch after an edit.

8. **Who counts as the viewer's owner** (:332, :1829, :1841, :1851, :1989-1996)
   - The HEAD bug, closed here before Edit reaches it:
     - The mount passes `canDelete={!isVisitor}` for every post opened from your own profile.
     - `PostViewerMobile` computes `owner = canDelete || isOwner`.
     - So a post by someone else, opened from your Saved or Reposts tab, offers "Delete post" today. After E2 it would also offer "Edit post". Both fail with 403 "Not your post".
   - `openPostId` (:332) becomes `const [openPost, setOpenPost] = useState<{ id: string; mine: boolean } | null>(null);`:
     - PostsGrid (:1829): `onOpenPost={(id) => setOpenPost({ id, mine: !isVisitor })}`
     - RepostsList (:1841) and SavedGrid (:1851): `(p) => setOpenPost({ id: p.id, mine: false })`. The viewer's server-computed `is_owner` still gives you Edit and Delete on your own post there.
   - Mount (:1989-1996): `{openPost ? <PostViewerMobile postId={openPost.id} onClose={() => setOpenPost(null)} canDelete={openPost.mine} onDeleted={() => void refetchPosts()} onEdited={applyPostEdit} /> : null}`

9. **`PostsGrid`** (:2202-2256)
   - New props: `onEdited: (p: EditedPost) => void; onDeleted: () => void;`.
   - The mount (:1819-1830) passes `onEdited={applyPostEdit}` and `onDeleted={() => void refetchPosts()}`.
   - Cards: `<PostFeedCard key={p.id} post={p} isOwner={!isVisitor} onTap={() => onOpenPost(p.id)} onEdited={onEdited} onDeleted={onDeleted} />`.
   - The owner's empty state (:2231-2236) doesn't change.

10. **`PostFeedCard`** (:2258-2341)
    - Props add `isOwner: boolean; onEdited: (p: EditedPost) => void; onDeleted: () => void;`. State: `const [actionsOpen, setActionsOpen] = useState(false);`.
    - Wrap the root `<button>` (:2268-2339) in `<div style={{ position: "relative" }}>`. The card button's style adds `width: "100%"`, because a button inside a block div no longer stretches (box-sizing is already global, `globals.css:32`).
    - When `isOwner`, add a ⋯ button as a SIBLING after the card button, never nested inside it:
      - `<button type="button" aria-label="Post actions" onClick={() => setActionsOpen(true)}>`
      - style: `position: "absolute", top: 8, right: 8`, plus the 30×30 look of the "More actions" button in CampusMobile's `FeedCard` (at `f23bc5d`: radius 999, 1px rgba(28,28,30,0.06) border, rgba(255,255,255,0.62) fill, color #5C5853, the 16px three-circle svg)
    - `isOwner && post.content`: the content `<p>` (:2302-2318) adds `paddingRight: 34`. On an image-only post the ⋯ sits over the image corner.
    - Timestamp (:2337): `{post.created_at ? relTimeForCard(post.created_at) + (post.edited_at ? " · Edited" : "") : ""}`. Visitors see " · Edited" too (Q18) but get no ⋯.
    - Mount `{actionsOpen ? <OwnPostActionsSheet postId={post.id} content={post.content ?? ""} hasMedia={!!post.media_url} onClose={() => setActionsOpen(false)} onEdited={onEdited} onDeleted={onDeleted} /> : null}` inside the wrapper div and OUTSIDE the card button. A tap inside the portal then bubbles to the div, which has no handler, and never opens the viewer.

11. **NEW `OwnPostActionsSheet`** (same file, just above `SafetySheetRow` :5151; Q19)
    - Props: `{ postId: string; content: string; hasMedia: boolean; onClose: () => void; onEdited: (p: EditedPost) => void; onDeleted: () => void }`.
    - State: `editOpen`, `deleting`, `const savedRef = useRef(false)`.
    - Chrome copies the safety sheet (:4903-4953):
      - `<Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>`
      - `Drawer.Portal` containing `Drawer.Overlay style={sheetOverlayStyle}` and `Drawer.Content style={sheetContentStyle} aria-describedby={undefined}` (consts at :5199-5238)
      - inside the content: `Drawer.Title style={sheetHiddenTitleStyle}` reading "Post options", `Drawer.Handle style={sheetHandleStyle}`, then `<div style={{ padding: "4px 0 12px" }}>`
    - Rows (`SafetySheetRow`):
      - "Edit post" → `setEditOpen(true)`; disabled while `deleting`
      - "Delete post" (danger; reads "Deleting…" and is disabled while deleting) → `handleDelete`
      - "Cancel" (bold) → `onClose`
    - After `Drawer.Portal`, still inside `Drawer.Root`, following the `PostActionsSheet` + `SharePostSheet` pattern in CampusMobile:
      ```tsx
      {editOpen ? (
        <EditPostSheet nested postId={postId} initialContent={content} hasMedia={hasMedia}
          onClose={() => { setEditOpen(false); if (savedRef.current) onClose(); }}
          onSaved={(p) => { savedRef.current = true; onEdited(p); }} />
      ) : null}
      ```
      - EditPostSheet toasts "Post updated" and calls its own `onClose` after `onSaved` (E2), so a save closes both sheets.
      - Cancel, or a clean dismiss, closes only the edit sheet.
    - `handleDelete` copies `PostViewerMobile`'s `handleDelete` word for word:
      - `window.confirm("Delete this post?")`
      - `vibeRequest(`/api/posts/${postId}`, { method: "DELETE", credentials: "include", failure: "Couldn't delete this post." })`
      - `!r.ok` → `setDeleting(false)`; the sheet stays open
      - ok → `onDeleted(); onClose();`
    - No Report row (the sheet is only for your own posts). The sheet never sends `tags` or `status`.
    - The phone feed card sheet keeps Edit only (CM). Delete on the profile card is Q19's default.

**Acceptance**
- `npx tsc --noEmit` exits 0.
- `npx eslint src/components/mobile/ProfileMobile.tsx` shows ≤ 11 problems.
- `rg -n "IU_CAMPUSES|campusByLabel|IU_MAJORS_BY_SCHOOL|campusTouched|Campus — not set|change it any time|self-declared|proves IU membership|body\.school|Campus didn't save" src/components/mobile/ProfileMobile.tsx` → 0.
- `rg -n "body\.campus_id" src/components/mobile/ProfileMobile.tsx` → exactly 1 hit, directly under the `sentCampusId` guard.
- `rg -nF "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." src/components/mobile/ProfileMobile.tsx` → 1. A reviewer diffs this string against B15's `CampusCard` in SettingsClient.
- `rg -n "canDelete=\{!isVisitor\}" src/components/mobile/ProfileMobile.tsx` → 0.
- `rg -n "<EditPostSheet" src/components/mobile/ProfileMobile.tsx` → 1 hit, with `nested`.
- `rg -n "onEdited=\{applyPostEdit\}" src/components/mobile/ProfileMobile.tsx` → 2 hits (viewer mount + PostsGrid mount).
- Read-only SQL, run before and after the live checks, must return the same numbers. This proves no agent wrote anything:
  - `select count(*) from public.users where campus_set_at is not null;` (0 at planning)
  - `select count(*) from public.posts where edited_at is not null;` (needs G1)
- **Live checks on prod.** Signed-in gstack browser as Franky, per the live verification recipe. `browse viewport 375x812` goes BEFORE `goto /profile`.
  - Install the wrapper before the first tap:
    - every non-GET is recorded (method, URL, parsed body) and answered with a synthetic response; nothing is forwarded
    - GET `/api/me/profile-bootstrap` may be rewritten from the real JSON for the state under test
  - To make ProfileMobile re-read the bootstrap through the wrapper, client-navigate: tap the tab bar's Campus tab, then Profile. Never reload, because a reload drops the wrapper.
  - Tap the pencil to enter edit mode.
  - **IU, real bootstrap** (rewrite `campusId:"indianapolis"` if the row has none):
    - options in order: Indianapolis, Fort Wayne — not open yet, Bloomington — not open yet, Columbus — not open yet, East — not open yet, Kokomo — not open yet, Northwest — not open yet, South Bend — not open yet, Southeast — not open yet
    - no "not set" option
    - sub "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)", then the hint
    - majors grouped by IU Indianapolis school
  - **Bio-only save:** the recorded POST `/api/me/profile-sync` body has no `campus_id` and no `school` key. The wrapper answers `{ok:true, profile:null}`.
  - **Purdue** (rewrite `schoolSystem:"purdue"`, `campusId:"indianapolis"`):
    - options: Indianapolis, Fort Wayne — not open yet, West Lafayette — not open yet, Northwest — not open yet
    - no IU-only campus
    - sub "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)"
    - majors show the Purdue Indianapolis groups
  - **Pick mode** (rewrite `campusId:null`):
    - the disabled "Pick your campus" option is selected
    - choosing Indianapolis and saving records exactly `campus_id:"indianapolis"`
  - **Change a campus** (IU, pick Bloomington): majors switch to the flat IU Bloomington list. Pick Columbus: the major becomes a "Your major" text box that still holds the saved major.
  - **Cooldown** (rewrite `campusConfirmed:true`, `campusChangeAvailableAt:"2026-10-15T16:00:00.000Z"`): the select is disabled, with "You can change your campus again on October 15." under it.
  - **Unverified** (rewrite `schoolSystem:null`, `campusId:null`, and delete `vibeUser.studentVerification`):
    - no select
    - "Verify your school email to pick your campus." with "Verify now →" linking to `/auth/school-email`
    - the major is a text box
  - **campusError:** pick Fort Wayne and save, with the wrapper answering 200 `{ok:true, profile:null, campusError:{status:400, code:"campus_not_in_system", error:"That campus isn't part of your university."}}`.
    - edit mode stays open
    - the red line reads that text verbatim
    - the select is back on Indianapolis
    - repeat with `{status:429, code:"campus_change_too_soon", error:"You can change your campus again on October 15.", availableAt:"2026-10-15T16:00:00.000Z"}`: that text, verbatim
  - **Mismatch:** pick Fort Wayne, wrapper answers `{ok:true, profile:null}`, and the real bootstrap still says Indianapolis → "Couldn't save your campus. Try again."
  - **Posts tab, own profile:**
    - every card has a ⋯ (`[aria-label="Post actions"]`)
    - `document.querySelectorAll("button button").length === 0`
    - tapping ⋯ opens "Edit post / Delete post / Cancel" and does NOT open the viewer
  - **Edit from a card:**
    - Save stays disabled until the text changes
    - with PATCH answered 200 `{ok:true, post:{id:<that id>, content:"<new text> #x", tags:["x"], edited_at:"<iso>"}}`:
      - the card text updates, the timestamp ends " · Edited", and "Post updated" toasts
      - both sheets close
      - no GET `/api/me/posts` fires after the PATCH
    - with PATCH answered 403 `{ok:false, code:"terms_required"}`: the toast "Accept the Terms first, then try again." shows, and the edit sheet stays open with the draft
  - **Delete from a card:**
    - dismiss the confirm: nothing is recorded
    - with `window.confirm = () => true` and DELETE answered 200 `{ok:true}`: the sheet closes and one GET `/api/me/posts` refetch fires
    - with DELETE answered 500: the toast "Couldn't delete this post." shows and the sheet stays
  - **Edit from the viewer opened on a card** (E2's menu, PATCH answered as above): after closing the viewer, the card shows the new text with no refetch.
  - **Saved tab:** open a post by someone else (rewrite GET `/api/me/bookmarks` if Franky has none). The viewer's ⋯ shows Report and no Edit post or Delete post.
  - **Visitor `/profile/<another handle>`:** no ⋯ on cards. Rewriting GET `/api/users/<handle>/posts` to add `edited_at` shows " · Edited".
- **Franky's iPhone (Safari), after deploy:**
  - an edit from a card needs no zoom on focus
  - closing both sheets leaves the profile at the same scroll position with no jump
  - the campus select is readable and shows the sub line

**Do not touch:**
- `EditPostSheet.tsx` and `PostViewerMobile.tsx` (E2)
- `CampusMobile.tsx` (CM, same wave). Keep the `CampusSearchOverlay` import as it is, and CM must keep that export's signature.
- `settings-campus-card.ts` and `SettingsClient.tsx` (B15)
- the `IU_CAMPUSES` / `campusByLabel` / `IU_MAJORS_BY_SCHOOL` exports: `campus-scope.ts`, `normalize-profile-view.ts` and `OnboardingMobile.tsx` still import them
- `profile-campus-write.ts`, the `profile-sync` and `profile-bootstrap` routes, and every posts route
- `public/html/profile.html` (PH, W5)
- the portfolio editors, avatar/cover upload, and the owner empty-state CTA (reader B16m item 6 is not in this plan)
- the Reposts/Saved card layouts (no " · Edited" there: those routes don't send `edited_at`)

---

## 10. Wave 5: desktop officer settings, desktop profile + viewer edit, map/landing, legal drafts

### CH3 · desktop officer settings: Who can join / Open to, Followers tab with Remove, Invites tab, Requests eligibility, leave copy

**Owns:** `src/app/campus/campus-home.tsx`, officer surfaces only: the `Org` type, `CreateOrgModal`, `OrgSettingsModal`, `SettingsOverview`, `SettingsRequests`, `SettingsDanger`, `ROLE_PERMS`, plus new `ChoiceField` and `SettingsFollowers`
**Depends on:**
- CH2 (W4, same file). G4 requires CH2 on `main`; re-grep every function by name on top of CH2's diff.
- CH1: `useViewerCampus()`.
- F5a: imports `OrgInviteSheet` and the `join-copy` helpers.
- F1 by URL: `GET /api/orgs/[slug]/followers`, `DELETE /api/orgs/[slug]/followers/[userId]`.
- F3 by URL: the inline invite sheet's default followers list.
- F2 by URL: `follower_count` on `GET /api/orgs/[slug]`, used only by the read-only view.

**Scope limit:** the student side stays CH2's: `OrgsTabBody`, `DiscoverGroup`, `DiscoverCard`, `OrgQuickViewModal`, `DiscoverFilterChips`, the `ChannelRail` header chip, the search dropdown and the map zone footer. CH3 never edits them or the two `?filter=mine` fetches (the chat rail in `CampusHome`, the post-as-club picker).

**Anchors.** `campus-home.tsx` sites are named by function or constant only, because H1 → CH1 → CH2 move every line. The `orgs/route.ts` and `orgs/[slug]/route.ts` anchors are named by handler and block, because F2 edits those files in W2. Other `file:line` anchors were read at `f23bc5d`, in files no batch touches.

**Contract**

1. **Imports and types.**
   - `import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";`
   - One import from `@/lib/orgs/join-copy`: `WHO_CAN_JOIN_OPTIONS`, `openToOptions`, `AUDIENCE_HELP`, `OFFICER_FOLLOW_HELP`, `MOD_READONLY`, `whoCanJoinFact`, `openToFact`, `followerCountText`, `followsSinceText`, `orgErrorCopy`. Merge into CH2's line if one exists.
   - `import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state"` (`join-state.ts:59`, `:62`). Merge into CH2's import if it already brings them in.
   - `campusRowById` and `isSharedCampus` from `@/lib/iu/campuses` (`campuses.ts:266`, `:233`; `isSharedCampus` takes a `Campus` row). Merge into CH1's import line.
   - Never import `@/lib/orgs/following`, `membership` or `notification-orgs` (§4.1 rule 8). This client needs none of them.
   - **`Org` type:** grep it first. It must end up with `join_policy?: JoinPolicy; audience?: OrgAudience; hidden?: boolean; campus_id?: string | null;`. CH2 may already have added these, so don't duplicate them. Every source of an `Org` value carries these fields:
     - `?filter=mine` (the mine-branch select in `orgs/route.ts`)
     - the create 201 (`join_policy`, `audience`, `campus_id`)
     - the PATCH 200, which also adds `hidden`
   - Read them as `const basePolicy: JoinPolicy = org.join_policy ?? "open"` and `const baseAudience: OrgAudience = org.audience ?? "both"`.
   - After items 3–6, delete `is_public` from `Org` only if `rg -n "\bis_public\b"` finds no remaining reader of an `Org` value. `SearchOrg`, `FeedOrg`, `MapOrg` and anything CH2 left in `DiscoverOrg` keep their declarations.

2. **`ChoiceField` (new, beside `Field`).** `Field` renders a `<label>`. Clicking its label or hint text activates the first `<button>` inside it; today that's how the Visibility field flips to "Public". The new pickers must not sit inside a `<label>`.
   - Props: `{ label: string; hint?: string; options: ReadonlyArray<{ value: string; label: string; sub?: string; disabled?: boolean }>; value: string; onChange: (v: string) => void }`.
   - Markup:
     - An outer `<div>` whose label and hint spans copy `Field`'s styles.
     - Inside it, `<div role="radiogroup" aria-label={label}>` with `display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8`.
     - One `<button type="button" role="radio" aria-checked>` per option, styled `modalSegmentStyle(value === o.value)`: label at 700 13px, sub at 11px `COLORS.glassMuted`.
     - A disabled option gets `disabled`, `opacity: 0.45` and `cursor: "not-allowed"`.
   - Map F5a's exported option shapes onto `{value, label, sub}`. Read `join-copy.ts` first: `WHO_CAN_JOIN_OPTIONS` carries subs, and `openToOptions` may not.
   - No read-only variant. Hidden clubs and non-managers get `ReadOnlyRow`s.

3. **`CreateOrgModal`.**
   - State: `isPublic` is replaced by `joinPolicy: JoinPolicy` (default `"open"`) and `audience: OrgAudience` (default `"both"`).
   - `const { system, campus } = useViewerCampus();` and `openToCampus = campus ? { name: campus.name, shared: isSharedCampus(campus) } : null`. The POST handler in `orgs/route.ts` stamps the creator's own campus via `allowedCampusId(viewerRow.campus_id, creatorSystem)`, so the label names the right campus.
   - Replace the "Visibility" `Field` with, in order:
     1. `ChoiceField` "Who can join", options `WHO_CAN_JOIN_OPTIONS`.
     2. `ChoiceField` "Open to", options `openToOptions(openToCampus)`, hint `AUDIENCE_HELP`.
        - Disable the options the POST refuses with 400 `audience_excludes_owner` (`audience !== "both" && audience !== creatorSystem`).
        - `system === "iu"` → `purdue` disabled. `system === "purdue"` → `iu` disabled. `system === null` → both narrow options disabled.
     3. One muted line (11px, `rgba(255,255,255,0.4)`): `OFFICER_FOLLOW_HELP`.
   - POST body: `{ name, handle, description, join_policy: joinPolicy, audience, backdrop_preset }`. No `is_public` key.
   - Errors:
     - Check `res.status === 429` first and show "Too many tries. Try again in a minute." (the 429 body has no `code`).
     - Any other non-ok response keeps showing `data.error` in the existing error line. That covers `audience_excludes_owner`, `invalid_join_policy` and `handle_taken`.
   - `onCreated({ ...data.org, role: "owner", hidden: false } as Org)`.
   - Width stays `min(480px, 92vw)`. The Open to grid wraps "All of Indianapolis (IU + Purdue)" onto two lines instead of overflowing.

4. **`OrgSettingsModal` tabs.**
   - `type SettingsTab = "overview" | "channels" | "members" | "followers" | "invites" | "requests" | "danger";`
   - `tabs`, in this order:
     1. Overview: always
     2. Channels: `canManage`
     3. Members: always
     4. Followers: `canManage` (owner/admin). This mirrors `FOLLOWER_LIST_ROLES`; F1 gives mods 403 `officers_only`.
     5. Invites: `canManage && !org.hidden`. Same rule as F6, whose hidden-club officer bar drops "Invite people"; the invite POST also refuses `org_hidden`.
     6. Requests: `isStaff`, under every policy (§2.4 item 9). Delete the `!org.is_public` condition.
     7. Danger: always
   - Tab bodies:
     - `followers` → `<SettingsFollowers org={org} canInvite={canManage && !org.hidden} onInvite={() => setTab("invites")} />`
     - `invites` → item 7
   - The nav keeps `overflowX: "auto"`. Seven pills fit in 760px.

5. **`SettingsOverview` for owner/admin.**
   - State: `isPublic` is replaced by `joinPolicy` (starts at `basePolicy`) and `audience` (starts at `baseAudience`).
   - `openToCampus`: from `campusRowById(org.campus_id)` plus `isSharedCampus`; null when there's no row.
   - **Visible club:** replace the "Visibility" `Field` with:
     1. `ChoiceField` "Who can join" (`WHO_CAN_JOIN_OPTIONS`)
     2. `ChoiceField` "Open to" (`openToOptions(openToCampus)`, hint `AUDIENCE_HELP`). No disabled options: an admin can't know the owner's university, so the server's 400 is the check.
     3. The muted `OFFICER_FOLLOW_HELP` line
   - **Hidden club (`org.hidden`):** replace it with:
     1. `ReadOnlyRow` "Who can join" = `whoCanJoinFact(basePolicy)`
     2. `ReadOnlyRow` "Open to" = `openToFact(baseAudience)`
     3. A muted line "This org is hidden, so its join settings can't change." This is the same sentence as the PATCH's 409 `org_hidden`.
   - **Pending-requests line**, directly under "Who can join":
     - Show it only when `joinPolicy === "invite" && basePolicy !== "invite"`.
     - On the first such render, fetch once (guarded by a ref): `vibeRequest<{ requests?: unknown[] }>(`/api/orgs/${org.handle}/requests`, { cache: "no-store", quiet: true, failure: "Couldn't load join requests." })`.
     - Count = the array's length, or null on failure.
     - Copy:
       - 0 or null → nothing
       - 1 → "1 pending request stays in Requests until you approve or deny it."
       - n → "{n} pending requests stay in Requests until you approve or deny them."
   - **`dirty`:** the `isPublic` term becomes `joinPolicy !== basePolicy || audience !== baseAudience`.
   - **`save`:** `vibeRequest<{ org?: Partial<Org> }>(`/api/orgs/${org.handle}`, { method: "PATCH", json, quiet: true, failure: "Couldn't save your changes." })`.
     - `json` = `{ name, description, backdrop_preset, philanthropy, links }`, with today's trimming and link filter.
     - Add `join_policy` only when `joinPolicy !== basePolicy`, and `audience` only when `audience !== baseAudience`. Add neither when `org.hidden`.
     - Never send `is_public`. The PATCH's "Join policy" block maps a stray `is_public` into a policy.
     - ok → `onOrgUpdated({ ...org, ...r.data.org })` (the response has `join_policy`, `audience` and `hidden` but no `role`), then msg "Saved.".
     - failure → the err msg is `r.status === 429 ? "Too many tries. Try again in a minute." : (r.error ?? r.message)`.
       - When `r.action` is set (`terms_required`), also `toast({ message: r.message, tone: "error", action: r.action })`.
       - `audience_excludes_owner` (400) and `org_hidden` (409) show the server's sentence.

6. **`SettingsOverview` read-only view (mod/member).**
   - Remove the "Visibility" `ReadOnlyRow`. After "Description" add:
     - "Who can join" = `whoCanJoinFact(org.join_policy)`
     - "Open to" = `openToFact(org.audience)`
     - Omit either row when its field is undefined.
   - **"Followers" row:** one quiet GET on mount, `vibeRequest<{ org?: { follower_count?: number | null } }>(`/api/orgs/${org.handle}`, { cache: "no-store", quiet: true, failure: "Couldn't load this club." })`.
     - Render `ReadOnlyRow` "Followers" = `String(n)` only when `followerCountText(n)` is non-null. F2 already floors the count for non-officers.
     - Failure or null → no row and no toast.
     - Never widen `?filter=mine` for this (F2 rule).
   - Under the `PermissionsCard`: a muted 12px line, `MOD_READONLY` ("Only owners and admins can change this.").

7. **Invites tab.**
   - Markup: `<div style={{ background: "#FBF8F3", color: "#1C1C1E", borderRadius: 14, padding: 12 }}><OrgInviteSheet handle={org.handle} orgName={org.name} audience={baseAudience} presentation="inline" /></div>`.
   - F5a gives the sheet no `tone` prop and styles it for light surfaces (org page modal, phone sheet); the light panel keeps its text readable inside this dark modal. If F5a shipped a `tone` prop, pass `tone="dark"` and drop the panel.
   - The tab remounts on every visit (conditional render), so its followers list refetches after a Remove.
   - No other invite UI here. `ChannelAccess`'s private-channel `@handle` add stays: it grants channel access, not org membership.

8. **`SettingsFollowers` (new, beside `SettingsMembers`).** Props: `{ org: Org; canInvite: boolean; onInvite: () => void }`.
   - **Row type:** `FollowerRow = { id: string; name: string | null; handle: string; avatar_url: string | null; follows_since: string; org_follow_source: string; member_role: Role | null }`. This is the §4.2 shape. CH3 ignores `follow_state` (a PERSON follow), `mutual_count`, the banners, `major` and `year`.
   - **State:** `rows: FollowerRow[] | null`, `cursor: string | null`, `count: number | null`, `loadErr: LoadFailure | null`, `loadingMore`, `busyId`, `reloadKey`, `loadedRef`. Same pattern as `SettingsMembers`.
   - **Load:** `vibeRequest<{ followers?: FollowerRow[]; next_cursor?: string | null; follower_count?: number | null }>(`/api/orgs/${org.handle}/followers?limit=30${after ? `&cursor=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", quiet: true, failure: "Couldn't load followers." })`.
     - First page ok → `rows = followers`, `cursor = next_cursor ?? null`, `count = follower_count ?? null`.
     - "Show more" ok → append only rows whose `id` isn't already present, in response order. Update `cursor` and `count`.
     - First-page failure with no rows yet → `<LoadFailed tone="dark" failure={asLoadFailure(r, "Couldn't load followers.")} onRetry={…} />`. A failure never shows "0 followers" or the empty copy.
     - "Show more" failure → toast `failure.message` with its action; rows and cursor stay.
     - NEVER sort, group or filter rows on the client. The server order is `first_followed_at desc, id desc` (C5, C15).
   - **Header row:**
     - Left, Fraunces 800 16px white: `count === null ? "Followers" : count === 1 ? "1 follower" : `${count} followers``. The count is exact, with no floor; only officers reach this tab.
     - Right, when `canInvite`: a button "Invite followers" (`modalSubmitStyle(true)`) → `onInvite()`.
     - Under the row, muted 12px: "Only owners and admins can see this list."
   - **Row** (same box as a `SettingsMembers` row):
     - 32px avatar, with the `initialsForOrg` initials as the fallback.
     - Line 1: `name || `@${handle}``, a `next/link` to `/profile/${encodeURIComponent(handle)}`.
     - Line 2: `@{handle}`.
     - Line 3, muted: `followsSinceText(follows_since)`, omitted when null.
     - `member_role != null` → a "Member" pill (11px 700, `rgba(255,255,255,0.08)` background, `rgba(255,255,255,0.14)` border) and NO Remove.
     - Otherwise → a "Remove" button (`modalCancelStyle`), which reads "Removing…" and is disabled while `busyId === row.id`.
   - **Remove:**
     1. Confirm with `window.confirm(`Remove ${row.name || "@" + row.handle} from ${org.name}'s followers? They'll stop getting its posts. They can follow again.`)`. Removal is reversible (Q1).
     2. `vibeRequest<{ removed?: boolean; follower_count?: number | null }>(`/api/orgs/${org.handle}/followers/${row.id}`, { method: "DELETE", quiet: true, failure: "Couldn't remove this follower." })`.
     3. Handle the response:
        - ok → drop the row and set `count = follower_count` when it's a number. Toast "Follower removed" when `removed` is true. When `removed` is false, drop the row silently; they had already unfollowed.
        - 409 `member_follows` → set that row's `member_role` to `"member"` if it was null, and toast `orgErrorCopy("member_follows")` ("Members follow automatically.").
        - 404 `not_found` → toast `orgErrorCopy("not_found")`.
        - status 429 → toast "Too many tries. Try again in a minute."
        - anything else (403 `officers_only` after a demotion, 400, 500) → toast `r.message` with `r.action`.
     - Nothing is removed before the response arrives (no optimistic removal), and nothing is refetched afterwards.
   - **Show more:** a "Show more" button (`modalCancelStyle`) under the list whenever `cursor` is non-null. It reads "Loading…" while fetching.
   - **Empty** (first page ok, zero rows, no cursor): "Nobody follows {org.name} yet. Share the club's page — people who follow it show up here." The invite sheet's empty state uses the same words.

9. **`SettingsRequests`.**
   - `RequestRow` gains `eligible?: boolean; ineligible_reason?: "audience_iu" | "audience_purdue" | "unverified" | null`. Sources: `requests/route.ts:23` and `:166-167`; no batch touches that route.
   - When `eligible === false`, hide Approve and put a muted 12px label in its place. Deny stays.
     - `audience_iu` → "Not eligible (Purdue student)"
     - `audience_purdue` → "Not eligible (IU student)"
     - `unverified` → "Not eligible (no verified school email)"
   - Approve/deny failures still show `data.error` in the existing `err` line, then `refresh()` so each row's eligibility is re-read. The approve 409s are in `requests/[id]/route.ts`: `org_hidden` at :164, `school_unverified` at :209, `audience_mismatch` at :219.
   - "No pending requests." stays as it is.

10. **`SettingsDanger`.**
    - Leave confirm → `Leave ${org.name}? You'll lose access to its chats. Its posts stop too, unless you followed it before joining.` (Q3). The leave trigger deletes only the `source='join'` follow.
    - Non-owner `DangerCard` desc → "You'll lose access to its chats and chat history. Its posts stop too, unless you followed it before joining." This drops "You can rejoin later if it's public."
    - The owner cards and `destroy` stay as they are.

11. **`ROLE_PERMS`.**
    - owner: "Edit org name, description, visibility, backdrop" → "Edit name, description, who can join, backdrop". After "Promote, demote, and remove anyone", insert "See followers, remove them, and invite people".
    - admin: insert the same line after "Promote/demote mods + members; remove non-admins".
    - mod and member stay as they are. `RoleLegend` shows each role's first line.

**Where the reader notes disagreed, and what CH3 does** (§2.4 items 2 and 9 settle the first and fourth)
- **Follower row shape.** F5c2 used `first_followed_at`, `is_member` and `count`. CH3 uses F1's `follows_since`, `member_role` and `follower_count`.
- **B19-orgs-b's per-row "Invite to join" and "Joined {Mon D}" sub.** Dropped. Invites go through the Invites tab, which is the one place invite states render, and F1's rows carry no join date.
- **B19-orgs-b's "hide the header count below 5".** CH3 shows the exact count. The floor protects followers from the public, and officers are who it's meant to leave the count for: F1 returns it raw, and F6 sends officers to this tab.
- **B19-orgs-b's Requests rule** (request policy, or pending > 0). CH3 shows Requests to staff under every policy.
- **Invites on hidden clubs.** The tab is hidden, to match F6's hidden-club officer bar.

**Acceptance**
- `npx tsc --noEmit` exits 0.
- `npx eslint src/app/campus/campus-home.tsx` is not above the count recorded on CH2's merged file before editing, and not above 8 (the `f23bc5d` baseline).
- `node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts` still passes (a sanity check; CH3 doesn't edit it).
- Greps on `src/app/campus/campus-home.tsx`:
  - `rg -n "is_public|isPublic" src/app/campus/campus-home.tsx | rg -v ':\s+is_public\??: boolean;$'` → 0. Only type-field declarations remain.
  - `rg -n '"Visibility"|label: "Public"|label: "Private"|if it.s public|visibility, backdrop' src/app/campus/campus-home.tsx` → 0.
  - `rg -n 'key: "requests".*show: isStaff \}' src/app/campus/campus-home.tsx` → 1.
  - `rg -n "filter=mine" src/app/campus/campus-home.tsx` → exactly 2 lines, text unchanged from CH2's file.
  - `rg -n "viewer_follows" src/app/campus/campus-home.tsx` → 0.
  - `rg -n "/followers" src/app/campus/campus-home.tsx` → hits only inside `SettingsFollowers` (the GET and the DELETE).
  - `awk '/^function SettingsFollowers/,/^}/' src/app/campus/campus-home.tsx | rg -c '\.sort\(|\.reverse\('` → 0.
  - `awk '/^function ChoiceField/,/^}/' src/app/campus/campus-home.tsx | rg -c '<label'` → 0.
  - `rg -n 'from "@/lib/orgs/(following|membership|notification-orgs)"' src/app/campus/campus-home.tsx` → 0.
- **Live walk, read-only.** Sign in as Franky, 1280px, `https://www.connectvibe.app/campus?tab=chat`. Before the first click, install the non-GET blocker (it records and rejects every non-GET) and stub `window.confirm` / `window.prompt` to record their text and return false / null. Open each club's settings from the rail gear.
  - **SAE (owner):**
    - Tabs read "Overview · Channels · Members · Followers · Invites · Requests · Danger".
    - Overview:
      - "Invite only" and "All of Indianapolis (IU + Purdue)" have `aria-checked="true"`. `AUDIENCE_HELP` and `OFFICER_FOLLOW_HELP` are visible.
      - Clicking the Open to hint text changes nothing, and Save stays disabled.
      - Click "Request to join", then Save. The blocker records one PATCH `/api/orgs/sae` whose body has `join_policy:"request"` and no `audience` or `is_public` key.
      - Reopen the modal and change only the Name. The recorded PATCH body has no `join_policy`, `audience` or `is_public`.
    - Followers:
      - `GET /api/orgs/sae/followers?limit=30` → 200. The header reads "1 follower".
      - One row (Franky) with a "Member" pill and "Follows since {Mon D}", no "Remove", no "Show more".
      - "Invite followers" switches to the Invites tab.
    - Invites: the inline sheet sits on the light panel, with section "Followers" and the empty copy "Nobody follows {SAE's name} yet. …". A screenshot shows the text readable.
    - Requests: "No pending requests."
    - Danger: owner cards only.
  - **`test-6e881851`** (hidden; Franky is owner):
    - Tabs read "Overview · Channels · Members · Followers · Requests · Danger" (no Invites).
    - Overview shows read-only "Who can join: By request", "Open to: Anyone" and "This org is hidden, so its join settings can't change."
  - **`test-6ca4ec6e`** (hidden; Franky is a member):
    - Tabs read "Overview · Members · Danger".
    - Read-only rows "Who can join: Anyone" and "Open to: Anyone"; no "Followers" row (2 is below the floor); the line "Only owners and admins can change this."
    - Danger → "Leave org": the recorded confirm text equals item 10's string, and no DELETE is recorded.
  - **Create** (Orgs tab create entry):
    - "Anyone can join" and "All of Indianapolis (IU + Purdue)" are selected, and "Purdue students only" is disabled (Franky is IU).
    - Submit → the recorded POST `/api/orgs` body has `join_policy:"open"`, `audience:"both"` and no `is_public`. The blocker rejects it, so nothing is created.
- **In-page overrides** (same session, blocker still on; overridden non-GETs are answered by the wrapper and never reach the network):
  - **Paging:** `/followers` returns 30 rows with `next_cursor:"c1"`, then 30 rows (one id repeated from page 1) with `next_cursor:null`, with names deliberately out of alphabetical order → 59 rows in response order, and "Show more" disappears.
  - **Header count:** `follower_count` null / 1 / 12 → "Followers" / "1 follower" / "12 followers".
  - **Load failures:** first page 500 → LoadFailed "Couldn't load followers." with Retry and no empty copy. Page 2 500 → a toast, and the 30 rows stay.
  - **Remove** on a non-member row: the recorded confirm text matches item 8. With confirm returning true:
    - DELETE answered `{ok:true, removed:true, follower_count:11}` → the row is gone, the header reads "11 followers", toast "Follower removed".
    - 409 `{ok:false, code:"member_follows"}` → "Member" pill, no Remove, toast "Members follow automatically.".
    - 429 → toast "Too many tries. Try again in a minute."
  - **Requests:** a `/requests` row with `eligible:false, ineligible_reason:"audience_iu"` → "Not eligible (Purdue student)", Deny shown, no Approve.
  - **Pending-requests line:** a `?filter=mine` override gives SAE `join_policy:"request"`, and `/requests` returns 2 rows. Click "Invite only" → "2 pending requests stay in Requests until you approve or deny them." With `/requests` returning 500 instead → no line.
  - **PATCH errors:**
    - 400 `{ok:false, error:"The owner has to be able to join. …", code:"audience_excludes_owner"}` → that sentence in the error line.
    - 429 → "Too many tries. Try again in a minute."
- Agents send no follows, follower removals, invites, approvals, policy or audience saves, leaves or creates to production (§4.1 rule 2). Franky sends the first real SAE invite.

**Plan conflicts to fix outside CH3** (not CH3's files)
- **The sheet has no `tone` prop.** F5a's `OrgInviteSheet` has no `tone` prop, and CH3 mounts it inline in a dark modal. CH3 wraps it in a light panel (item 7). A later F5a follow-up could add `tone`.
- **The `audience_excludes_owner` copy doesn't match the labels.** When the owner has no university, both `audienceExcludesOwnerMessage` copies (`orgs/route.ts`, `orgs/[slug]/route.ts`) tell the officer to pick "IU and Purdue students". On a shared campus, `openToOptions` labels that option "All of {campus} (IU + Purdue)". Create avoids the dead end by disabling the options (item 3). Settings can still show the mismatched sentence until F2's owner (or a later batch) aligns it.

**Do not touch:**
- CH2's surfaces: `OrgsTabBody`, `DiscoverGroup`, `DiscoverCard`, `OrgQuickViewModal`, `DiscoverFilterChips`, the `ChannelRail` header chip, the search dropdown and the map zone panel.
- CH1's surfaces: `CampusBanner`, `useViewerCampus`, the `FeedRow` edit and the tour.
- The two `?filter=mine` fetches.
- `SettingsMembers` (including `kick`), `SettingsChannels`, `ChannelSettingsModal`, `ChannelAccess` and `Field`. `ChoiceField` is added beside `Field`.
- Every file other than `campus-home.tsx`, including `OrgInviteSheet.tsx`, `join-copy.ts`, the org, follower and requests routes, and `globals.css`.

---

### PH · desktop profile: campus and majors from your university, fake calendar purge, search meta, post-edit sync

**Owns:** `public/html/profile.html`
**Depends on:**
- E1 live: `/api/me/posts` and `/api/users/[handle]/posts` return `edited_at`. G1 must be applied first; at planning time `posts.edited_at` does not exist live.
- E6, same wave, by event contract only. After a successful PATCH, `_postViewer.js` fires `window.dispatchEvent(new CustomEvent('vibe:post-edited', { detail: { id, content, tags, edited_at } }))`. PH listens for it and never imports or edits the viewer.
- H1 live: `/api/search` org rows carry `join_policy` and `audience`, and hidden clubs are gone.
- B15 is the copy source for the hint sentence, the cooldown line and the option label format. B20 (same wave, `messages.html`) carries the identical fake-event pairs; the two batches share no file.

**Scope limit:** no Edit control on profile cards (Q20: Edit lives in the viewer the cards open), no server or `src/` file, no `_postViewer.js`.

Anchors: no earlier wave touches `profile.html`, so every `file:line` below was read at `f23bc5d` and holds until PH starts. Live data at planning time: 19 users (7 `iu` + `indianapolis`, 7 `iu` with no campus, 5 with no system), 0 Purdue, 0 confirmed campuses.

**Contract**

1. **Campus state.** Hazard: `profile-html-bridge.tsx:62` stores only `vibeUser`, so on first paint the page knows no system, campus id or cooldown.
   - Declare with `var`, directly above `(function initProfilePage(){` (:7163), for the same TDZ reason as :7062-7064 and :7780-7783: `var _campusCtx = null; var _campusCtxPromise = null; var _campusPick = null;`.
   - `_campusCtx` shape: `{ system: 'iu'|'purdue'|null, campuses: Array<{id,name,shortName,city,shared,sharedWith,isOpen}>, currentCampusId: string|null, availableAt: string|null }`.
   - New `function _ensureCampusContext()`:
     - returns early when `window.viewingRealUser` or `!_isAppShell()` (:5909)
     - returns `_campusCtxPromise` when already set
     - otherwise runs `Promise.all([fetch('/api/campuses', {credentials:'include'}), fetch('/api/me/profile-bootstrap', {credentials:'include'})])`
   - `/api/campuses` must answer `ok:true`. It sets `system`, `campuses` and `currentCampusId`.
   - The bootstrap is optional and sets only `availableAt = typeof j.campusChangeAvailableAt === 'string' ? j.campusChangeAvailableAt : null`. It's the only source of the cooldown, since `/api/campuses` has none and is owned by nobody. If it fails, `availableAt` stays null and the server's `campusError` is the backstop.
   - When `/api/campuses` fails (non-2xx, 503 `campus_not_ready`, network), set `_campusCtx = null` and `_campusCtxPromise = null` so the next edit-mode entry retries.
   - Once the promise settles (either way), call `_renderCampusPicker()` and `_hydrateMajorPicker(vibeLoad('vibe_user_v1') || {})`.
   - `toggleEdit` (:3974), after `if (editMode) _profileSyncLastOk = null;` (:3997): `if (editMode && typeof _ensureCampusContext === 'function') _ensureCampusContext();`. This one hook covers every entry: the button at :3193 and the calls at :4955, :5701, :5708 and :7346.
   - Nothing campus-related is written to `vibe_user_v1` any more.

2. **Markup and CSS.**
   - :3365, inside `.meta-campus-edit`, before `#campusSelect`: add `<span class="meta-campus-static" data-campus-static></span>`. Change the display span's default text from `Not set` to empty.
   - :3367, the hint becomes `<span class="meta-campus-hint" style="display:none"><span data-campus-hint-copy>Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students.</span><span data-campus-sub></span><span data-campus-note></span></span>`. The copy is verbatim from B15 and PM, and "Not verified — change it any time." is gone.
   - :3364, after `#majorSelect`: `<input type="text" id="majorInput" class="meta-major-select" maxlength="200" placeholder="Your major" aria-label="Major" onchange="_onMajorYearChange()" style="display:none;cursor:text">`.
   - CSS next to :400-402: `.meta-campus-hint [data-campus-sub]:not(:empty), .meta-campus-hint [data-campus-note]:not(:empty) { display:block; margin-top:2px; }` and `.meta-campus-static { font-size:12.5px; color:var(--muted); }`.

3. **Picker render.** Delete `IU_CAMPUSES` (:7065-7075), `_campusOptionText` (:7079-7083), `_canonicalCampusLabel` (:7088-7093), `_currentCampusLabel` (:7100-7105) and `_populateCampusPicker` (:7107-7125).
   - New `function _campusBadgeText(user)`: `const s = user && user.studentVerification && user.studentVerification.school;`. Return `typeof s === 'string' && s && !/^(IU|Purdue) verified$/.test(s) ? s : ''`. The badge is server-rendered by `campusBadgeForProfile` (`build-vibe-user-v1.ts:117-124`) for owners and visitors alike.
   - `_hydrateCampusPicker(user)` (:7127-7141, rewrite) sets the display text:
     - the badge when there is one
     - else, owner with `studentVerification`: `Pick your campus`
     - else, owner: `Not set`
     - visitor with no badge: the chip hides, as :7137-7139 does today
     Then it calls `_renderCampusPicker()`.
   - New `function _renderCampusPicker()`, owner only. It is safe before `_campusCtx` exists.
     - **No context** (loading, failed, or not app shell): hide `#campusSelect`. `[data-campus-static]` shows the badge (or empty), and `[data-campus-sub]` and `[data-campus-note]` are emptied. It never shows `Not set` as an option and never builds a static list.
     - **`system === null`:** hide the select. `[data-campus-static]` reads `Verify your school email to pick your campus.` (verbatim from B15).
     - **Otherwise:** show the select and empty the static span. Rebuild the options every render.
       - When `value === ''`, the first option is `<option value="" disabled selected>Pick your campus</option>`.
       - Then one option per campus: `value = c.id`, `textContent = c.isOpen ? c.shortName : c.shortName + ' — not open yet'`. This matches B15 and the shipped `onboarding.html:760`. There is no `Not set` option.
       - `value = _campusPick || _campusCtx.currentCampusId || ''`.
       - `[data-campus-sub]` shows the selected row's `sharedWith || name` (for example "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"), or empty.
       - `locked = Date.parse(availableAt) > Date.now()`. Set `sel.disabled = locked`.
       - When locked, `[data-campus-note]` shows `_campusTooSoonCopy(availableAt)`; otherwise it's empty.
   - New `function _campusTooSoonCopy(iso)` mirrors `campusChangeTooSoonCopy` (`profile-campus-write.ts:158-168`) word for word:
     - an invalid date gives `You changed your campus recently. Try again later.`
     - otherwise `You can change your campus again on ${new Date(ms).toLocaleDateString('en-US', {month:'long', day:'numeric', timeZone:'America/Indiana/Indianapolis'})}.`

4. **Change and payload.**
   - `_onCampusChange` (:7143-7160, rewrite):
     - `if (!_campusCtx) return;`
     - `const v = sel.value;` and return if `!v` or `!_campusCtx.campuses.some(c => c.id === v)` (never `''`)
     - `_campusPick = (v === _campusCtx.currentCampusId) ? null : v;`
     - then `_renderCampusPicker(); _hydrateMajorPicker(vibeLoad('vibe_user_v1') || {}); scheduleProfileServerSync();`
     - no `vibeSave`, no `u.campus`, no `_campusCleared`
   - `buildProfileSyncPayload` (:7819), campus block (:7862-7872), replaced whole: `if (_campusPick && _campusCtx && _campusPick !== _campusCtx.currentCampusId && _campusCtx.campuses.some(c => c.id === _campusPick)) payload.campus_id = _campusPick;`.
   - `payload.school` is never set. Onboarding critic A4: re-sending an unstamped current campus would confirm a backfilled row and start the 30-day lock (`profile-campus-write.ts:14-18`).

5. **Sync result and adoption.**
   - `_runProfileServerSync` (:8160), right after `_profileSyncLastOk = true;` (:8179) and BEFORE the `localIsNewer()` early return (:8188-8189). Otherwise an edit made mid-flight would swallow the campus result.
     `if (typeof payload.campus_id === 'string') _afterCampusSync(payload.campus_id, r.data && r.data.campusError);`
   - New `function _afterCampusSync(sent, err)`:
     - **Rejected** (`err && typeof err.error === 'string'`):
       - `window.vibeToast(err.error, { tone: 'error' })`, using the server copy verbatim (for example "That campus isn't part of your university." or "You can change your campus again on October 15.")
       - if `typeof err.availableAt === 'string'`, set `_campusCtx.availableAt = err.availableAt`
       - `currentCampusId` is unchanged
     - **Accepted:** `_campusCtx.currentCampusId = sent`.
     - Either way: `if (_campusPick === sent) _campusPick = null;` (a newer pick made during the flight stays), then `_renderCampusPicker(); _hydrateMajorPicker(vibeLoad('vibe_user_v1') || {});`. On rejection this reverts the select to the server campus.
   - `!r.ok` (:8174-8178): leave `_campusPick` set, so the retry flush re-sends it. `vibeRequest` already toasted. On desktop a campus-only body can't happen, because the payload always carries the other fields (`profile-sync/route.ts:374-386`).
   - Adoption at :8202-8204: delete the three `nu.campus` / `_campusCleared` lines and add `if (_campusCtx) { if (!_campusPick) _campusCtx.currentCampusId = (typeof jb.campusId === 'string') ? jb.campusId : null; _campusCtx.availableAt = (typeof jb.campusChangeAvailableAt === 'string') ? jb.campusChangeAvailableAt : null; }`. The existing `hydrateProfileFields(nu)` (:8245) then repaints the badge and picker.
   - Empty-storage branch (:7301): delete `nu.campus = …` and its two-line comment. The page reloads straight after, and edit mode fetches the context.

6. **Majors** (:7548-7610). This replaces the IU-only `window.IU_MAJORS_BY_SCHOOL` build. `_iu-majors.js` loads synchronously at :23.
   - `_populateMajorPicker(campusId, system)` (:7548, rewrite):
     - `const list = typeof window.vibeMajorsForCampus === 'function' ? window.vibeMajorsForCampus(campusId, system) : null;`
     - `key = (campusId || '') + '|' + (system || '')`. Return when `sel.dataset.populatedFor === key`. This replaces the `populated === '1'` early return, so a campus change re-populates.
     - `list === null`: hide `#majorSelect`, show `#majorInput`, set `populatedFor = key`, return.
     - Otherwise show the select (`sel.disabled = false`) and hide the input.
     - Options: blank `Major`, then for `list.groups.length` one `<optgroup label=g.school.shortLabel>` per group; otherwise a flat list of `list.majors`. Then `sel.dataset.populatedFor = key`.
   - `_hydrateMajorPicker(user)` (:7572, rewrite):
     - pending means `_campusCtxPromise !== null && _campusCtx === null`: show `#majorSelect` empty and disabled, hide `#majorInput`, set `sel.dataset.populatedFor = ''`, and return. `_ensureCampusContext` calls `_hydrateMajorPicker` once right after creating the promise, so a free-text box from first paint never flashes before the list
     - otherwise call `_populateMajorPicker(_campusPick || (_campusCtx && _campusCtx.currentCampusId) || null, _campusCtx ? _campusCtx.system : null)`
     - a failed context gives `(null, null)`, which is free text
     - keep the "saved major not in the list" extra option (:7577-7587) and `sel.value = cur`; the input takes `input.value = cur`; year unchanged
   - Verified at HEAD: `vibeMajorsForCampus('indianapolis','iu')` gives 11 groups (first `Kelley`); `('indianapolis','purdue')` gives 6 groups (first `Engineering`); `('iu-bloomington','iu')` gives 0 groups and 163 flat majors; `('fort-wayne','iu')` and `(null,null)` give null.
   - `_onMajorYearChange` (:7595): `u.major = (input && input.style.display !== 'none') ? input.value.trim().slice(0, 200) : (sel ? sel.value : '');`. The rest is unchanged.

7. **Fake calendar events.**
   - Delete the `seedEvents` IIFE (:6729-6737). `calendarEvents` (:6728) starts empty.
   - Next to `CAL_KEY` (:6872), add:
     `const FAKE_SEED_CAL_EVENTS = [['IU Spring Career Fair','IMU Alumni Hall'],['Goldman Sachs Info Session','Kelley School of Business 100'],['Weekly Design Critique','Luddy Hall 1106'],['IU Hackathon 2025','Assembly Hall']];`
     B20 puts the identical four pairs in `messages.html`, and a reviewer diffs the two.
   - `_calLoad` (:6881-6890), after `JSON.parse`:
     - return unless `saved` is a plain object
     - for each key: `kept = (Array.isArray(saved[k]) ? saved[k] : []).filter(e => !(e && FAKE_SEED_CAL_EVENTS.some(([n, l]) => e.name === n && e.location === l)))`
     - when `kept` is empty, delete the key; else `saved[k] = kept`
     - if anything was dropped or deleted, `localStorage.setItem(CAL_KEY, JSON.stringify(saved))` inside the existing try
     - then the existing merge
     The purge runs on every load and is idempotent. The four fakes persist because `_calSave` (:6874-6879) wrote them for anyone who ever added or removed an event.
   - Placeholder :9188 `e.g. Goldman Sachs Info Session` → `e.g. Club info session`.

8. **Search** (following spec §5.6).
   - Comment :6395-6397 → `// Org rows navigate (View); following and joining live on the org page.`
   - `_profSearchOrgToRow` (:6398-6412): `meta` (:6399) becomes `[typeof o.member_count === 'number' ? (o.member_count === 1 ? '1 member' : o.member_count + ' members') : null, o.verified ? 'Verified' : null, o.join_policy === 'invite' ? 'Invite only' : o.join_policy === 'request' ? 'By request' : null, o.audience === 'iu' ? 'IU only' : o.audience === 'purdue' ? 'Purdue only' : null].filter(Boolean).join(' · ')`.
   - This is the F5a `memberCountText` / `policyChip` / `audienceChip` wording and order. It has no follower count (C13), and it's tolerant: missing fields render nothing. It fixes today's "1 members".

9. **Post cards carry a swappable text node** (E7).
   - `_profileMapDbRow` (:8430-8452):
     - `bodyHTML` (:8448) → `'<span class="ppost-text">' + bodyText + '</span>' + mediaHTML`
     - `date` (:8447) → `_formatRelativeDate(row.created_at) + (row.edited_at ? ' · Edited' : '')`
     - This covers own posts (`hydrateProfilePostsFromAPI` :8338) and visited profiles, which map through the same function.
   - `_publishProfilePostLocal` (:5998-6016): `bodyHTML` (:6014) → `'<span class="ppost-text">' + bodyText + '</span>' + imageHTML`.
   - `_renderPostCard` (:8700-8729), `savePostsToStorage` (:8262), `postExcerpt` and `_profilePrefillFromCard` (:5768) need no change. `.ppost-body` `textContent` is the same with the span.

10. **`vibe:post-edited` listener** (new, directly after `_profilePrefillFromCard`, top level; it runs only on the event, so there's no TDZ).
    - Guard: `const d = ev && ev.detail;` and return unless `d && typeof d.id === 'string' && d.id`. `content = typeof d.content === 'string' ? d.content : ''`. `tags = Array.isArray(d.tags) ? d.tags.filter(t => typeof t === 'string') : []`.
    - `const cards = document.querySelectorAll('#profilePostsList .profile-post-card[data-post-id="' + CSS.escape(d.id) + '"]');`. Return when there are none.
    - For each card, new `function _applyPostEditToCard(card, content, tags)`:
      - `textHTML = _esc(content).replace(/\n/g, '<br>')`. Content always goes through `_esc` (:7618) and is never inserted raw.
      - If `.ppost-body > .ppost-text` exists, set its `innerHTML = textHTML`.
      - Legacy cached card (no span): `body.innerHTML = '<span class="ppost-text">' + textHTML + '</span>' + [...body.children].filter(el => el.tagName === 'IMG' || el.tagName === 'VIDEO').map(el => el.outerHTML).join('')`.
      - Tags: when `tags.length`, `html = tags.map(t => '<span class="ppost-tag">#' + _esc(t) + '</span>').join('')`. Create `div.ppost-tags` right after `.ppost-readmore` if missing, then set its innerHTML. With no tags, remove `.ppost-tags`.
      - `.ppost-date`: append ` · Edited` unless its text already ends with it.
      - `_measureReadMore(card)` (:8744).
    - Then `populateAllGrid()` (:5806), which rebuilds the All feed from the updated list.
    - Pinned slot, IN PLACE:
      - if `profilePinnedId === d.id` (:5549), find `#pinnedContent .pinned-post-card[data-pin-id="<CSS.escape(id)>"]`
      - set `.pin-post-body` innerHTML to `cards[0].querySelector('.ppost-body').innerHTML` (already escaped)
      - create, update or remove `.pin-post-tags` after `.pin-post-body` from the card's `.ppost-tags` innerHTML (same markup as :5612-5613)
      - Do NOT call `pinFromProfile(id)` as the E7 note proposed. Its programmatic path runs `saveProfileToStorage()` → `scheduleProfileServerSync()` (:7777), which would send a full `/api/me/profile-sync` POST on every post edit. `pinnedId` doesn't change, so nothing needs saving.
    - `savePostsToStorage()` (:8262; a no-op on visited profiles).
    - E6 owns the viewer; PH adds no Edit control, and the owner card × (`deleteProfilePost` :8761) stays.

11. **Comments.** Rewrite them system-neutral, dropping "IU-grouped", "self-declared, never verified", "@iu.edu proves IU membership" and "MIRROR of IU_CAMPUSES":
    - CSS :383-384 → `/* Major picker: display text in normal mode; in edit mode the student's campus list (grouped when it has schools) or a free-text box. */`
    - CSS :396-399 → `/* Campus picker: the university comes from the verified school email; the campus is chosen within it (GET /api/campuses). Same display/edit flip as the major picker. */`
    - JS :7050-7064 → one block saying the options and the student's university come from `GET /api/campuses` (no static mirror), writes send `campus_id` only when the student changed it, the cooldown comes from the own bootstrap, and the `var` state sits above `initProfilePage` for TDZ.
    - JS :7543-7547 → the list comes from `window.vibeMajorsForCampus(campusId, system)` (`_iu-majors.js`, generated from `majors.ts`); a campus with no curated list gets free text.

**Acceptance** (agents never write to prod: every non-GET in a live check goes through the blocker; Franky makes any real campus change or post edit)
- Static: extract every inline `<script>` without `src=` (6 at HEAD) into the scratchpad, then run `node --check` on each. All pass:
  `OUT=<scratchpad>/ph node -e 'const fs=require("fs");const h=fs.readFileSync("public/html/profile.html","utf8");let i=0;for(const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)){if(/application\/(ld\+)?json/.test(m[1]))continue;fs.writeFileSync(process.env.OUT+"/profile-inline-"+(i++)+".js",m[2]);}console.log(i)' && for f in <scratchpad>/ph/profile-inline-*.js; do node --check "$f" || echo FAIL "$f"; done`
- `rg -n "IU_CAMPUSES|_campusCleared|payload\.school|_canonicalCampusLabel|_campusOptionText|_currentCampusLabel|nu\.campus|IU_MAJORS_BY_SCHOOL|public follow API|seedEvents|Not verified — change it any time" public/html/profile.html` → 0, and `rg -ni "self-declared" public/html/profile.html` → 0 (3 hits at HEAD: :396, :7051, :7862).
- `rg -n "IU Spring Career Fair|Goldman Sachs Info Session|Weekly Design Critique|IU Hackathon 2025" public/html/profile.html` → exactly 1 line, the `FAKE_SEED_CAL_EVENTS` constant.
- `rg -n "payload\.campus_id\s*=" public/html/profile.html` → 1, and `rg -n "school:" public/html/profile.html` → 0 (0 at HEAD).
- `rg -n "vibe:post-edited" public/html/profile.html` → 1 (the listener). `rg -n "pinFromProfile\(d\.id|pinFromProfile\(id\)" public/html/profile.html` → 0.
- `rg -n "ppost-text" public/html/profile.html` → hits in `_profileMapDbRow`, `_publishProfilePostLocal` and the listener only.
- Copy parity with B15 and PM: `rg -F "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." public/html/profile.html src/components/settings/SettingsClient.tsx src/components/mobile/ProfileMobile.tsx` → one hit per file. `rg -F " — not open yet" public/html/profile.html public/html/onboarding.html` → both files.
- `node --test --experimental-strip-types src/lib/iu/majors.test.ts` still passes (`_iu-majors.js` untouched). `npx tsc --noEmit` exits 0 (no TS touched). No eslint target.
- Read-only SQL, before the W5 push: `select column_name from information_schema.columns where table_schema='public' and table_name='posts' and column_name='edited_at'` → 1 row (G1). `select school_system, count(*) from users group by 1` shows the Purdue count, which was 0 at planning, so the Purdue picker is checked only by override.
- **Live, 1280px, signed in as Franky** (`/profile`, which bridges to `/html/profile.html?app=1`). Install the blocker after load and BEFORE the first Edit click. It passes GETs through, answers matching overrides, and records and fakes every non-GET:
  `window.__nonGet=[];window.__ov={};const _f=window.fetch.bind(window);window.fetch=async(u,o={})=>{const url=String(u&&u.url||u),m=String(o.method||'GET').toUpperCase();for(const k in window.__ov){const v=window.__ov[k];if(url.includes(k)&&(v.method||'GET')===m)return new Response(JSON.stringify(v.body),{status:v.status||200,headers:{'content-type':'application/json'}});}if(m!=='GET'){window.__nonGet.push({m,url,body:o.body});return new Response('{"ok":true,"profile":null}',{status:200,headers:{'content-type':'application/json'}});}return _f(u,o);};`
  1. **IU picker** (no override). Edit shows a select on `Indianapolis` with options `Indianapolis`, `Fort Wayne — not open yet`, `Bloomington — not open yet`, …; the sub-line "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"; the hint sentence; no `Not set` option; majors grouped, first optgroup `Kelley`. `__nonGet` is empty. Screenshot.
  2. **Pick `Fort Wayne — not open yet`.** Majors swap to the free-text box prefilled with the saved major. After about 1.5s, `__nonGet` holds exactly one POST `/api/me/profile-sync` whose body has `"campus_id":"fort-wayne"` and no `school` key. The select returns to Indianapolis once the real bootstrap GET is adopted, because the write was faked.
  3. **Reload, re-install, edit only the bio.** The recorded profile-sync body has neither `campus_id` nor `school`.
  4. **Purdue.** Set `__ov['/api/campuses']={body:{ok:true,system:'purdue',preselect:null,currentCampusId:'indianapolis',campuses:[{id:'indianapolis',name:'Indianapolis',shortName:'Indianapolis',city:'Indianapolis',shared:true,sharedWith:'Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)',isOpen:true},{id:'fort-wayne',name:'Fort Wayne',shortName:'Fort Wayne',city:'Fort Wayne',shared:true,sharedWith:'Purdue Fort Wayne · one community with IU Fort Wayne',isOpen:false},{id:'purdue-west-lafayette',name:'Purdue West Lafayette',shortName:'West Lafayette',city:'West Lafayette',shared:false,sharedWith:null,isOpen:false},{id:'purdue-northwest',name:'Purdue Northwest',shortName:'Northwest',city:'Hammond / Westville',shared:false,sharedWith:null,isOpen:false}]}}` on a fresh load, then Edit. Expect options `Indianapolis`, `Fort Wayne — not open yet`, `West Lafayette — not open yet`, `Northwest — not open yet`; the Purdue sub-line; first majors optgroup `Engineering`. Screenshot.
  5. **No campus yet.** The same override with `currentCampusId:null` → the first option is a disabled, selected `Pick your campus`.
  6. **Unverified.** `{ok:true,system:null,campuses:[],preselect:null,currentCampusId:null}` → no select, and the text `Verify your school email to pick your campus.`
  7. **Route down.** `__ov['/api/campuses']={status:500,body:{ok:false,code:'request_failed',error:'Request failed'}}` → no select and no `Not set`; the badge text only; the major is free text. Leave edit mode, drop the override, re-enter: the picker appears (retry).
  8. **Cooldown.** `__ov['/api/me/profile-bootstrap']={body:{ok:true,campusChangeAvailableAt:'2026-10-15T16:00:00Z'}}` before the first Edit → select disabled, note `You can change your campus again on October 15.` Screenshot.
  9. **Rejected campus.** `__ov['/api/me/profile-sync']={method:'POST',body:{ok:true,profile:null,campusError:{status:400,code:'campus_not_in_system',error:"That campus isn't part of your university."}}}`, then pick Fort Wayne → the error toast with that text, and the select back on Indianapolis.
- **Fake events** (`/html/profile.html?app=1`, or `/messages` for B20's twin): run `localStorage.setItem('vibe_cal_events_v1', JSON.stringify({"2026-09-20":[{"name":"IU Hackathon 2025","time":"09:00","location":"Assembly Hall","notes":"","color":"#FF5C35"},{"name":"Study group","time":"18:00","location":"Library","notes":"","color":"#FF5C35"}],"2026-09-22":[{"name":"Weekly Design Critique","time":"19:00","location":"Luddy Hall 1106","notes":"","color":"#7C5CFC"}]}))` and reload. The calendar shows only "Study group", and the stored JSON is `{"2026-09-20":[{…"Study group"…}]}` (the 09-22 key is gone). A second reload writes nothing new.
- **Search.** A real GET for `sae` in the profile search shows the meta `1 member · Invite only` (H1 live; add ` · Verified` only if SAE is verified). Under `__ov['/api/search']` returning `{ok:true,users:[],events:[],orgs:[{id:'x',handle:'x',name:'X',member_count:12,verified:false}]}` (no policy fields; the page needs one of the three arrays, :6354), the meta is exactly `12 members`.
- **Post-edit sync, with no PATCH.** On own `/profile`, with the blocker installed, take the id of a post that shows in both Posts and All:
  - run `window.dispatchEvent(new CustomEvent('vibe:post-edited',{detail:{id:'<id>',content:'<img src=x onerror=alert(1)> fixed #fresh',tags:['fresh'],edited_at:new Date().toISOString()}}))`
  - the Posts card and the All clone show the literal `<img …>` text, the chip `#fresh` and ` · Edited` in the date; no alert fires
  - the image or video under the text is still there (for a media post)
  - dispatching again doesn't double ` · Edited`
  - with that post pinned, the pinned slot shows the new text
  - `__nonGet` stays empty (no profile-sync from the pin path)
  Reload afterwards: `/api/me/posts` repaints the real text; the dispatch touched only this browser's `vibe_posts_v1`.
- **With E6 on the same build.** Open the post in the viewer, ⋯ → Edit post, and save under `__ov['/api/posts/']={method:'PATCH',body:{ok:true,post:{id:'<id>',content:'edited in viewer #x',tags:['x'],edited_at:'2026-09-20T12:00:00Z'}}}`. Close the viewer: the card and the clone already read "edited in viewer", with `#x` and ` · Edited`, and there was no reload.
- **Reload (Franky's own real edit, or a GET override of `/api/me/posts` adding `edited_at` to one row):** the card date reads `… · Edited`. A visited profile (`/profile/<handle>`) shows the same through `/api/users/[handle]/posts`.

**Do not touch:**
- `public/html/_postViewer.js` (E6), `public/html/messages.html` (B20)
- `public/html/_persistence.js`, `public/html/_iu-majors.js` (generated; `majors.test.ts` guards it), `public/html/onboarding.html` (the shipped `ac014a3` picker)
- `src/app/profile/profile-html-bridge.tsx`, `src/app/api/campuses/route.ts`, `src/app/api/me/profile-sync/route.ts`, `src/app/api/me/profile-bootstrap/route.ts`, `src/app/api/search/route.ts` (H1)
- the `IU_CAMPUSES` / `campusByLabel` shims in `src/lib/iu/campuses.ts`
- in `profile.html`:
  - `deleteProfilePost` (:8761) and the owner card ×
  - `_profilePrefillFromCard` (:5768)
  - the composer's `_extractHashtags` (:5895). Its Unicode `#tag` rule differs from the server's ASCII rule, so a non-ASCII tag changes on its first edit (0 live rows); that's a follow-up, not this batch.
  - the calendar render functions (their unescaped `e.name` in the modal pills, :6818-6821, is self-only localStorage and out of scope)

---

### E6 · desktop post viewer: Edit post, the " · Edited" marker, and the `vibe:post-edited` event

**Owns:** `public/html/_postViewer.js`
**Depends on:** E1 live (PATCH `/api/posts/[id]` by URL; `edited_at` in the GET `post` and in the PATCH `post`), which needs G1. It mirrors E0's `editedPostFrom` and copy from `src/lib/posts/edit.ts` but doesn't import them (static JS). No earlier wave edits this file, so every `_postViewer.js` anchor below is HEAD `f23bc5d`, re-read for this section. PH (same wave) listens for the event defined in item 10. Neither batch waits for the other: the event without a listener does nothing, and the listener without the event never fires.

**Context at HEAD** (read-only facts the contract relies on)
- **Loaders.** `profile.html:20` loads the file; desktop `/profile` redirects top-level to `/html/profile.html?app=1` (`profile-html-bridge.tsx`). `messages.html:17` loads it too; that page runs inside the CampusAppShell iframe (`html.vpv-iframe`, :34-38). The header comment at :4 still says "profile.html + campus.html".
- **Owner menu.** It comes only from the server's `is_owner` (`renderFromServer`, :704, :711-718). Today the owner sees only "Delete post" (:718); everyone else gets Report / Mute / Block (:719-733).
- **Stale menu on open.** `openPostViewer` (:508-566) resets ownership and counts at :528-533. Only the no-prefill path runs `renderLoading` (:535-536), which is where ⋯ and the menu get hidden (:643-646). Profile cards always pass a prefill (`profile.html:5664`, `:5859`, `:5876`, `:8593`), so post A's ⋯ menu stays on screen over post B until B's GET answers.
- **Painting.** `paintBody` (:811-828) writes `.vpv-text` (:813), then media (:815-823, only when `type === "post"`), then `.vpv-tags` (:824-826), all in one `innerHTML` (:827). `paintHeader` (:781-795) builds the sub-line at :791-794.
- **Shared busy flag.** `state.inflight` (:467) is shared by like (:878), save (:910) and delete (:988).
- **Escape and close.** One document keydown listener (:426-434) closes the audience sheet first, then the post. `window.__vpvClose = closeViewer` (:613) is called by the X button (:348), an overlay click (:423-425), Escape (:433), popstate with `true` (:441) and the Block callback (:731). Delete calls `closeViewer()` directly (:1000).
- **Mention picker.** `vibeBindMentionPicker` (`_mentionPicker.js:303-316`) adds a CAPTURE keydown listener on the textarea (:310). While its popover is open, Escape only calls `preventDefault()` (:283-285), and Enter/Tab call `preventDefault()` + `stopPropagation()` (:278-282). Neither stops other listeners on the same textarea.
- **Requests and toasts.** `window.vibeRequest` (`_persistence.js:259-305`) sends `json` as the body. It returns `{ok,status,data}` or `{ok:false,status,code,error,message}`, and when not quiet it toasts through `describeFailure` (:129-148):
  - 403 `terms_required` → "Accept the Terms first, then try again." plus Review Terms (:134)
  - 429 → "You're going a little fast. …" (:139)
  - 400 passes `exceeds N characters` through; any other 400 shows the `failure` line (:145)
  - 5xx → the `failure` line + " Try again." (:146-147)
  `vibeToast` (:190) sits at z 11600, above the viewer (9999).
- **PATCH answer after E1.** `{ok:true, post: withPostMediaUrls(row)}` with columns `id,user_id,type,status,content,tags,media_url,media_thumbnail_url,created_at,edited_at`. It carries no author, so after a save the viewer repaints only the text, the tags and the sub-line.
- **Live data** (read-only SQL, 2026-09-16):
  - Franky has 7 published text posts, 2 image posts and 1 published legacy `clip` with a video key. The desktop viewer renders no media for `clip` (:815-823), but its `media_url` is non-null.
  - No `type='post'` video post exists for anyone.
  - `edited_at` does not exist yet (it lands at G1).
- **eslint baseline** for this file at `f23bc5d`: 2 warnings, 0 errors (`catch (_)` at :338 and :608). New code uses `catch {}` with no binding.

**Contract**

1. **Styles.** Append inside `STYLE`, before the `.vpv-toast` rule (:317). The tokens match `.vpv-composer textarea` / `button` (:225-237).
   - `.vpv-edit { display:block; width:100%; box-sizing:border-box; min-height:120px; max-height:360px; resize:vertical; border:1px solid rgba(28,28,30,.14); border-radius:12px; padding:10px 12px; font-family:inherit; font-size:15px; line-height:1.55; background:white; color:#1C1C1E; outline:none; }`
   - `.vpv-edit:focus { border-color: rgba(28,28,30,.35); }`
   - `.vpv-edit-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }`
   - `.vpv-edit-hint { font-size:12px; color:#8A8580; min-width:0; }`
   - `.vpv-edit-actions { display:flex; gap:6px; flex-shrink:0; }`
   - `.vpv-edit-btn { background:transparent; color:#1C1C1E; border:1px solid rgba(28,28,30,.14); font-family:inherit; font-size:12px; font-weight:700; padding:7px 14px; border-radius:999px; cursor:none; }`
   - `.vpv-edit-btn.primary { background:#1C1C1E; color:white; border-color:#1C1C1E; }`
   - `.vpv-edit-btn[disabled] { opacity:.4; cursor:default; }`

2. **State** (:446-468) adds:
   - `editing: false`
   - `editSaving: false`. This is its own flag. Never reuse `state.inflight`: a like still in flight would make Save return silently.
   - `tags: []`, `hasMedia: false`, `authorHandle: ""`, `createdAt: null`, `editedAt: null`

3. **Helpers** (next to `formatBodyText`, :802-809):
   - `tagChipsHtml(tags)` returns exactly the chip markup from :825 (`<span class="vpv-tag">#${esc(t)}</span>`, joined with ""). `paintBody` (:824-826) switches to it, so the two paths can't drift.
   - `paintSub(handle, created_at, edited_at)`:
     - `#vpvSub.textContent = [handle ? "@" + handle : "", relTime(created_at), edited_at ? "Edited" : ""].filter(Boolean).join(" · ")`
     - title: `"Edited " + new Date(edited_at).toLocaleString()` when `edited_at` is set; otherwise `removeAttribute("title")`
   - `editedPostFromWire(raw)` sits under the comment `// Mirror of editedPostFrom in src/lib/posts/edit.ts — change both together.` It returns null unless `raw` is an object with a string `id`. `content` is kept if it's a string, else `""`. `tags` keeps only string entries (a non-array becomes `[]`). `edited_at` is kept if it's a string, else null.
   - `editDirty()`: `state.editing`, `#vpvEditInput` exists, and `ta.value.trim() !== (state.content || "").trim()`. This is the same dirty rule as E2 and CH1.
   - `editCanSave()`: `!state.editSaving && editDirty() && ta.value.length <= 2000 && (state.hasMedia || ta.value.trim() !== "")`.
   - `confirmDiscardEdit()`: `!editDirty() || window.confirm("Discard your changes?")`.

4. **Header.**
   - `paintHeader` takes `{ author, created_at, edited_at }`. It paints the avatar and name as today (:782-790), then calls `paintSub(a.handle, created_at, edited_at)` in place of :791-794.
   - `renderFromPrefill` (:654-657) passes `edited_at: p.edited_at || p.editedAt || null`. The DB-row prefill at `profile.html:8593` carries `edited_at` once E1 is live.
   - `renderFromServer` (:670) passes `edited_at: typeof p.edited_at === "string" ? p.edited_at : null`.

5. **`renderFromServer`** (:668-735):
   - Set `state.editing = false` BEFORE `paintBody` (:671), because `paintBody` wipes any editor.
   - After :683, add:
     - `state.tags = Array.isArray(p.tags) ? p.tags.filter(t => typeof t === "string") : []`
     - `state.hasMedia = !!p.media_url`. This matches E1's `!!prior.media_url`, and it's true for the legacy clip even though the viewer shows no media for it.
     - `state.authorHandle = (p.author && p.author.handle) || ""`
     - `state.createdAt = p.created_at || null`
     - `state.editedAt = typeof p.edited_at === "string" ? p.edited_at : null`
   - The owner branch (:717-718) becomes:
     ```js
     menu.innerHTML = `<button type="button" onclick="window.__vpvCloseMenu();window.__vpvStartEdit()">Edit post</button><button type="button" class="danger" onclick="window.__vpvDeletePost()">Delete post</button>`;
     ```
   - The non-owner branch (:719-733) and the default menu markup (:350-352) stay unchanged.

6. **Open and close.**
   - The `openPostViewer` reset block (:528-533) adds `state.editing = false;` and removes `show` from `#vpvMore` and `#vpvMenu`, exactly as `renderLoading` does at :643-646. While post B loads, it never offers post A's owner menu.
   - `closeViewer` (:592-612) sets `state.editing = false` right after `state.openId = null` (:595). `renderLoading` (:629) sets it too.
   - :613 becomes `window.__vpvClose = function (viaPopstate) { if (!viaPopstate && !confirmDiscardEdit()) return; closeViewer(viaPopstate); };`. This gives parity with E2, where a dirty sheet can't be dismissed by accident:
     - The X button, an overlay click, and Escape outside the textarea ask "Discard your changes?" when the draft is dirty.
     - Back (popstate) has already popped history, so it discards silently.
     - `__vpvDeletePost` keeps calling `closeViewer` directly.

7. **`window.__vpvStartEdit()`**
   - **Guards, in order:**
     - `!state.openId || state.editing` → return
     - `!state.isOwner` → return
     - `!isAppShell()` → `toast("Sign in to edit")`
     - `!isRealPostId(state.openId)` → `toast("This post can't be edited")` (mirrors delete, :982-983)
   - **Build.** Set `state.editing = true`, then build the editor with `document.createElement` only:
     - `div#vpvEditWrap.vpv-edit-wrap` containing:
       - `textarea#vpvEditInput.vpv-edit`: `maxLength = 2000`, `rows = 4`, `aria-label` "Edit post text", `placeholder = state.hasMedia ? "Write a caption…" : "Say something…"`. `value = state.content` is set through `.value`, never through markup.
       - `div.vpv-edit-row` holding `span#vpvEditHint.vpv-edit-hint` and `div.vpv-edit-actions`, which holds `button#vpvEditCancel.vpv-edit-btn` "Cancel" and `button#vpvEditSave.vpv-edit-btn.primary` "Save"
     - Both buttons are `type="button"` and wired with `addEventListener` (Cancel → `__vpvCancelEdit()`, Save → `__vpvSaveEdit()`).
   - **Placement.** In `#vpvBody`, `body.querySelector(":scope > .vpv-text")` is `replaceWith`'d by the wrap. When there's no text node, the wrap is `prepend`ed. `.vpv-image`, `.vpv-video` and `.vpv-tags` are never re-rendered, so a playing video keeps playing.
   - **Setup.**
     - Call `window.vibeBindMentionPicker(ta)` when it exists.
     - Focus the textarea, put the caret at the end (`setSelectionRange(len, len)`), then run `paintEditControls()`.
   - **`input` listener:** auto-grow (`style.height = "auto"`, then `Math.min(scrollHeight, 360) + "px"`), then `paintEditControls()`.
   - **`keydown` listener** (bubble phase, on the textarea):
     - `e.isComposing` → return.
     - Escape → `e.stopPropagation()`, so :426 never closes the post. If `e.defaultPrevented`, return (the mention picker just closed its popover). Otherwise `window.__vpvCancelEdit()`.
     - `(e.metaKey || e.ctrlKey) && e.key === "Enter"` → if `e.defaultPrevented`, return. Otherwise `e.preventDefault()` and `window.__vpvSaveEdit()`.
   - **`paintEditControls()`:**
     - The hint reads `${ta.value.length}/2000`, followed by:
       - " · You can change the words. The photo or video stays." when `state.hasMedia`
       - " · Your post can't be empty." when there's no media and `ta.value.trim() === ""`
       - nothing otherwise
     - Save: `disabled = !editCanSave()`; label "Saving…" while `state.editSaving`, else "Save".
     - Cancel: `disabled = state.editSaving`.
     - `ta.readOnly = state.editSaving`.

8. **`window.__vpvCancelEdit(force)`**
   - If `!state.editing || state.editSaving`, return. If `!force && !confirmDiscardEdit()`, return.
   - Then `restoreText()` and `state.editing = false`.
   - `restoreText()` replaces `#vpvEditWrap` with a new `div.vpv-text` whose `innerHTML = formatBodyText(state.content)` when `state.content` is non-empty. Otherwise it removes the wrap.
   - An unchanged Escape closes the editor silently: nothing is dirty, so no confirm.

9. **`window.__vpvSaveEdit()`**
   ```js
   window.__vpvSaveEdit = async function () {
     const id = state.openId;
     const ta = document.getElementById("vpvEditInput");
     if (!id || !state.editing || !ta || !editCanSave()) return;
     const value = ta.value;
     state.editSaving = true;
     paintEditControls();
     try {
       const r = await window.vibeRequest("/api/posts/" + encodeURIComponent(id),
         { method: "PATCH", json: { content: value }, failure: "Couldn't save your changes." });
       if (!r.ok) return; // vibeRequest already toasted the mapped line
       const p = editedPostFromWire(r.data && r.data.post);
       if (!p || p.id !== id) {
         window.vibeToast("Couldn't save your changes. Try again.", { tone: "error" });
         return;
       }
       window.dispatchEvent(new CustomEvent("vibe:post-edited",
         { detail: { id: p.id, content: p.content, tags: p.tags, edited_at: p.edited_at } }));
       window.vibeToast("Post updated", { tone: "info" });
       if (state.openId !== id || !state.editing) return; // closed or switched mid-save
       state.content = p.content;
       state.tags = p.tags;
       state.editedAt = p.edited_at;
       state.editing = false;
       restoreText();
       repaintTags();
       paintSub(state.authorHandle, state.createdAt, state.editedAt);
     } finally {
       state.editSaving = false;
       if (state.editing && state.openId === id) paintEditControls();
     }
   };
   ```
   - The body is ONLY `{content}`. Never send `tags` (the server derives them) or `status` (PATCH still honours published→draft).
   - `repaintTags()`: the `:scope > .vpv-tags` node under `#vpvBody` gets `innerHTML = tagChipsHtml(state.tags)`. When it's missing and there are tags, create it and append it at the end of `#vpvBody` (the order :827 uses). Remove it when there are no tags.
   - A failure keeps the editor, the draft and a re-enabled Save.
   - `state.content` also feeds the share title (:950), so a share after an edit carries the new text.

10. **The event PH listens for** (cross-batch contract; PH's section cites this item):
    - **Name and target:** `"vibe:post-edited"`, dispatched on `window` of the document that loaded `_postViewer.js`. Desktop profile is top-level. Nothing is posted to `window.parent`, and the messages iframe has no listener.
    - **Payload:** `CustomEvent` with `detail = { id: string, content: string, tags: string[], edited_at: string | null }`. The values come from the server's answer (trimmed content, server-derived tags), never from the draft.
    - **When it fires:** exactly once per PATCH that returned 2xx with a valid `post` whose `id` matches. Never on a failure or a malformed 2xx. It still fires when the viewer was closed or switched mid-save, because the save happened and the card has to catch up.
    - **Escaping:** `content` and each tag are raw text, and every listener escapes them (PH uses `_esc`).
    - **Boundary:** `_postViewer.js` never edits page DOM outside `#vpvOverlay` for an edit. Contrast `_vpvScrubPostFromPage` for delete (:1010-1023). Syncing cards is PH's job.

11. **Doc comment at :4:** "Loaded on profile.html + messages.html." Comment text only.

**Acceptance**

*Static checks*
- `node --check public/html/_postViewer.js` passes.
- `npx eslint public/html/_postViewer.js` shows at most 2 problems and 0 errors (baseline). `npx tsc --noEmit` exits 0.
- `git diff --name-only` for the batch lists exactly `public/html/_postViewer.js`.

*Greps*

| Command | Expected |
|---|---|
| `rg -n '"vibe:post-edited"' public/html/_postViewer.js` | 1 hit (the dispatch) |
| `rg -n 'method: "PATCH"' public/html/_postViewer.js` | 1 hit |
| `rg -n 'json: \{[^}]*(tags\|status)' public/html/_postViewer.js` | 0 |
| `rg -n '>Edit post<' public/html/_postViewer.js` | 1 hit, inside the `isOwner` branch |
| `rg -n "Discard your changes\?" public/html/_postViewer.js` | at least 1 |
| `rg -n "Post updated" public/html/_postViewer.js` | 1 |
| `rg -n "Couldn't save your changes\." public/html/_postViewer.js` | at least 1 |
| `rg -n "The photo or video stays\." public/html/_postViewer.js` | 1 |
| `rg -n "Your post can't be empty\." public/html/_postViewer.js` | 1 |
| `rg -n 'editedPostFrom in src/lib/posts/edit.ts' public/html/_postViewer.js` | 1 |
| `rg -c 'state\.inflight' public/html/_postViewer.js` | 9, the same count as `git show f23bc5d:public/html/_postViewer.js \| rg -c 'state\.inflight'`, so the edit never uses the shared flag |
| `rg -n 'innerHTML[^;]*state\.content' public/html/_postViewer.js` | only `formatBodyText(state.content)` hits |

*Browser checks.* Run at 1280px, signed in as Franky, on `/profile` (which lands on `/html/profile.html?app=1`), against the W5 deploy or localhost.

Before the first click, install this wrapper with `browse eval <file>` or the DevTools console. It answers every non-GET in the page, so nothing reaches production.
```js
(function () {
  window.__nonGet = []; window.__edits = []; window.__confirms = []; window.__confirmAnswer = true;
  window.__patch = { status: 200, body: { ok: true }, delay: 0 };
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, i = {}) => {
    const m = String((i && i.method) || "GET").toUpperCase();
    if (m === "GET" || m === "HEAD") return realFetch(u, i);
    const url = String(u);
    window.__nonGet.push({ m, url, body: i && i.body });
    const r = (m === "PATCH" && /\/api\/posts\/[^/?]+$/.test(url)) ? window.__patch : { status: 204, body: null };
    return new Promise((res) => setTimeout(() => res(new Response(r.body == null ? null : JSON.stringify(r.body),
      { status: r.status, headers: { "content-type": "application/json", ...(r.headers || {}) } })), r.delay || 0));
  };
  window.addEventListener("vibe:post-edited", (e) => window.__edits.push(e.detail));
  window.confirm = (msg) => { window.__confirms.push(msg); return window.__confirmAnswer; };
})();
```

1. **Menus.**
   - Franky's own text post (Posts tab): ⋯ reads "Edit post", then "Delete post".
   - Someone else's post (`/html/profile.html?handle=<other>&app=1`, or a shared post on `/messages`): Report / Mute / Block, no Edit. Calling `window.__vpvStartEdit()` from the console there creates no `#vpvEditInput`.
2. **Opening the editor.**
   - Edit swaps the text for a textarea holding the exact post text. Save is disabled and the hint reads "{n}/2000".
   - Typing enables Save.
   - On a text-only post, clearing to spaces disables Save and the hint adds " · Your post can't be empty.".
3. **Success.** Set `__patch.body = {ok:true, post:{id:"<open id>", content:"hi #New @franky", tags:["new"], edited_at:"2026-09-20T12:00:00.000Z", media_url:null}}`, type `  hi #New @franky  `, then click Save.
   - `__nonGet` ends with a PATCH to `/api/posts/<id>`, and `Object.keys(JSON.parse(body))` is `["content"]`.
   - The body shows "hi #New @franky" with a `.vpv-mention` link and the chip "#new". No editor remains.
   - `#vpvSub` text ends with "· Edited" and its `title` starts with "Edited ".
   - The toast reads "Post updated".
   - `__edits` holds exactly one entry, `{id:"<open id>", content:"hi #New @franky", tags:["new"], edited_at:"2026-09-20T12:00:00.000Z"}`. These are the server's values, not the draft's.
4. **Media untouched.**
   - On an own image post that has text, save `const img = document.querySelector('#vpvBody .vpv-image')` before Edit.
   - After Edit, the hint shows "You can change the words. The photo or video stays.".
   - Clearing the text keeps Save enabled.
   - A success with `content:""` removes `.vpv-text`.
   - `document.querySelector('#vpvBody .vpv-image') === img` holds before and after the save.
   - Video: no `type='post'` video exists live. On localhost against a branch with one: play, Edit, Save → the same `<video>` node, with `paused === false`.
5. **Keys and closing.**
   - Escape in an unchanged textarea closes the editor and the modal stays open. A second Escape closes the modal.
   - Dirty + Escape pushes "Discard your changes?" into `__confirms`. With `__confirmAnswer = false`, the draft stays.
   - Type "@fr" until the picker opens, then press Escape: the popover closes, the editor stays, and `__confirms` is unchanged.
   - The X button or an overlay click while dirty asks the same confirm. With `false`, the modal stays open.
   - Cmd/Ctrl+Enter records exactly one PATCH.
6. **Failures.** In every case below, the editor and draft stay, Save is re-enabled, and `__edits` is unchanged.

   | `__patch` | Expected toast |
   |---|---|
   | `{status:400, body:{ok:false, error:"Post exceeds 2000 characters"}}` | "Post exceeds 2000 characters" |
   | `{status:403, body:{ok:false, error:"Accept the Terms", code:"terms_required"}}` | "Accept the Terms first, then try again." with Review Terms |
   | `{status:429, body:{ok:false, error:"Too many tries. Try again in a minute."}, headers:{"retry-after":"42"}}` | starts "You're going a little fast." |
   | `{status:500, body:{ok:false, error:"Request failed"}}` | "Couldn't save your changes. Try again." |
   | `{status:200, body:{ok:true}}` | "Couldn't save your changes. Try again." |

7. **Escaping.**
   - Type `<img src=x onerror="window.__xss=1"> "quotes"` as the draft. The reply echoes that content with `tags:["<b>x</b>"]`.
   - `window.__xss` stays undefined, `.vpv-text` textContent contains the literal `<img src=x`, and the chip's textContent is `#<b>x</b>`.
   - Opening Edit again shows the same literal text in the textarea.
8. **Race.**
   - Set `__patch.delay = 2000` with a valid success body, click Save, then at once press Escape (`__confirmAnswer = true`) and open a different own post.
   - After 2 s, the second post's body and sub-line are unchanged and it has no editor.
   - `__edits` has one entry carrying the FIRST id, and "Post updated" toasts.
9. **Loading guard.** Open own post A, then open post B from the grid. Until B's GET answers, `#vpvMore` lacks `show`.
10. **Messages page.** On `/messages` (desktop iframe), open a shared post: the viewer opens with no console errors from `_postViewer.js`.
11. **No prod writes.**
    - Every `__nonGet` entry was answered by the wrapper. Navigate away afterwards to drop the overrides.
    - Read-only SQL `select count(*) from posts where edited_at is not null` returns the same number before and after the run.

**Do not touch:**
- `public/html/profile.html` (PH owns it). PH adds the `vibe:post-edited` listener, the `.ppost-text` wrap and " · Edited" on cards. Note for PH: `_profilePrefillFromCard` (:5780) passes the card's display date text as `created_at`, so `relTime` briefly paints "Invalid Date" until the GET answers. That's pre-existing, and it's PH's file.
- `public/html/messages.html` (B20), `_persistence.js`, `_mentionPicker.js`, `_sharePicker.js`, `_safetyActions.js`.
- In this file: the audience sheet (:1158-1497), the like / save / comment / reply handlers (:874-1156), and `__vpvDeletePost` / `_vpvScrubPostFromPage` (:980-1023), apart from item 6's `__vpvClose` wrapper, which delete doesn't call.
- `src/app/api/posts/[id]/route.ts` (E1), `src/lib/posts/edit.ts` (E0; mirrored, not imported), `src/components/mobile/PostViewerMobile.tsx` (E2), `src/app/campus/campus-home.tsx` (CH3 this wave).

---

### B20 · map halos, landing chips, messages.html fake events, sentinel context

**Owns:** `src/components/mobile/MapMobile.tsx`, `src/components/landing/home-landing.tsx`, `public/html/messages.html`, `.claude/workflows/security-sentinel.js`
**Depends on:** nothing to import from earlier waves (§5: none). Item 1 mirrors CH1 item 6 (§8): the same `schoolForMajorIn` call, an in-file `HALO_SCHOOLS`, and the same map-empty sentence, so the phone and desktop group the shared Indianapolis map the same way. PH (same wave) owns `public/html/profile.html`, and its calendar purge must match item 3 exactly, because both pages share one localStorage key. Item 4's new context lines describe F1 routes (W1) and the E0 posts column lock (applied at G1), which are live by W5.
**Anchors:** no earlier wave edits these four files. Every `:line` below was re-read at HEAD `f23bc5d` (`git diff --quiet f23bc5d --` was clean for all four while W1 ran).
**Scope limit:**
- no edits to `majors.ts`, `majors-purdue-indianapolis.ts`, `campuses.ts`, `school-email-domains.ts`, `globals.css` or `/api/campus-map`
- no lens added to or removed from the sentinel
- no org bubbles and no "Members only. Follow to get their posts." line on the phone map. MapMobile draws no org bubbles, and its only `setSelection` (:356-361) builds `kind:"major"`, so no phone user could ever see that line.

**Contract**

1. **`MapMobile.tsx`: halos for IU and Purdue majors** (onboarding critic C8)
   - Imports (:13): `import { IU_SCHOOLS, schoolForMajor } from "@/lib/iu/majors";` becomes `import { IU_SCHOOLS, schoolForMajorIn } from "@/lib/iu/majors";`. Add `import { PURDUE_INDIANAPOLIS_SCHOOLS } from "@/lib/iu/majors-purdue-indianapolis";` (`:35`; its ids are prefixed `purdue-`, so they never collide with IU ids).
   - Directly above `function computeLayout` (:116), add `const HALO_SCHOOLS = [...IU_SCHOOLS, ...PURDUE_INDIANAPOLIS_SCHOOLS];`.
   - `MapSummary` (:56-68) gains `campus_id?: string | null;`. The route returns it at `campus-map/route.ts:252`. It is null only for `?campus=all`, and MapMobile's fetch (:276) sends no query.
   - `computeLayout`:
     - comment :119 → `// Bucket majors by school (IU and Purdue share the Indianapolis map).`
     - :122 → `const s = schoolForMajorIn(data.campus_id ?? null, null, m.name).id;`
     - :127: `IU_SCHOOLS.filter` → `HALO_SCHOOLS.filter`
   - In `MapMobile`, right after `noSchool` (:296): `const campusId = data?.campus_id ?? null;`.
   - `pickMajor` (:353-362): `schoolId: schoolForMajorIn(campusId, null, m.name).id`, and its deps change from `[]` to `[campusId]`.
   - `SchoolHalos` :549: `IU_SCHOOLS.find` → `HALO_SCHOOLS.find`.
   - `MajorBubble` (:616-629): new prop `campusId: string | null`, and :629 becomes `const school = schoolForMajorIn(campusId, null, major.name);`. The mount (:454-461) passes `campusId={campusId}`.
   - `ZoneSheet` accent (:775): `IU_SCHOOLS.find` → `HALO_SCHOOLS.find`.
   - The system argument stays `null`, so the IU list is tried first, then Purdue's (`majors.ts:376-386`). `/api/campus-map` doesn't return `school_system`, and B20 doesn't own that route. With 0 Purdue accounts live, a major that exists in both lists (e.g. "Computer Science") takes the IU halo. A later additive route field fixes that; it is out of scope here.
   - What changes for real students. Checked at planning time with the `majors.test.ts` resolver:
     - The six majors saved on live Indianapolis profiles (Finance, Health Sciences, Management, Marketing, Political Science, Supply Chain Management) get the same school id under both functions: kelley, health, kelley, kelley, liberal, kelley. No live halo moves.
     - Purdue-only names that fell into "other" now get their own group: "Artificial Intelligence" → `purdue-science`, "Multidisciplinary Technology" → `purdue-polytechnic`.
     - Don't use "Mechanical Engineering" as the proof. It was already in `engtech`, not "other", and it becomes `purdue-engineering`.
   - Off the Indianapolis campus, `schoolForMajorIn` returns "Other" (the legacy function used the IU Indianapolis list everywhere). Live impact is 0. Read-only SQL on 2026-09-16 found 7 accounts at `indianapolis` and 12 with no campus, which get the `no_school` overlay; no account has any other campus.
   - `no_school` overlay body (:415): `The map groups people by major at your campus. Nothing here is verified — you can change it any time.` becomes `The map groups people by major at your campus. Pick yours in Settings.` (the same string as CH1's desktop map). The title (:412) "Pick your campus in Settings to see your map" and the Link to `/settings#campus` (:417-418) stay.
   - The `zoneEmpty` copy (:943-945) doesn't change.

2. **`home-landing.tsx`: "IU · Purdue · live" chips** (onboarding plan §3.5 table row, critic C3)
   - Imports: `import { enabledSchoolSystems } from "@/lib/auth/school-email-domains";` and `import { SYSTEM_LABEL } from "@/lib/iu/campuses";`. Both modules are client-safe, and `src/app/auth/school-email/page.tsx:7` (a `"use client"` page) already imports the first.
   - Module level, next to `LOGIN_HREF` / `SIGNUP_HREF` (:13-14): `const LANDING_SCHOOL_LABELS: readonly string[] = enabledSchoolSystems().map((s) => SYSTEM_LABEL[s]);`
     - It reads the code flag `PURDUE_SIGNUPS_ENABLED` (`school-email-domains.ts:44`), so switching Purdue off also removes its chip.
     - Never call `schoolEmailDomains()` or `schoolEmailDomainsLabel()`. They read `process.env`, which makes the server render and the hydrated page disagree (see the comment at `school-email-domains.ts:272-279`).
   - Render (:185-188). Replace the hard-coded `<span>IU</span>` with:
     ```tsx
     {LANDING_SCHOOL_LABELS.map((label, i) => (
       <Fragment key={label}>
         {i > 0 ? <span aria-hidden="true">·</span> : null}
         <span>{label}</span>
       </Fragment>
     ))}
     ```
     Then keep `<span className="vibe-landing-schools-soon">live</span>` as is. `Fragment` comes from `react` (extend the :4 import).
   - No CSS change. `.vibe-landing-schools` (`globals.css:831-842`) already has `gap:10px`, `flex-wrap:wrap` and `justify-content:center`.
   - The footer line (:190-192) "Sign up with your school email. Your campus, your career, one profile." stays.

3. **`messages.html`: remove the fake calendar events, including copies already saved**
   - Delete the `seedEvents` IIFE (:1523-1531). Keep `const calendarEvents = {};` (:1522), `_storeEvent`, `addCalEvent`, `dateKey` and `fmtTime` (:1532-1545) unchanged.
   - Deleting the seed alone isn't enough. `removeCalEvent` (:1577-1586) calls `_calSave` (:1634), which writes the whole object, fakes included, under `vibe_cal_events_v1`, and `profile.html` saves under the same key. Anyone who ever removed an event keeps the fakes forever.
   - In the CALENDAR SYNC block, between `_calSave` (:1634) and `_calLoad` (:1635), insert this block verbatim. PH inserts the byte-identical block in `profile.html`, from `const CAL_SEED_PURGE` through the closing `}` of `_calPurgeSeed`:
     ```js
     // Demo events an old build seeded into every calendar. Anyone who ever added
     // or removed an event saved them under CAL_KEY, so deleting the seed alone
     // left them forever. profile.html and messages.html carry this exact block:
     // change both or neither.
     const CAL_SEED_PURGE = [
       ['IU Spring Career Fair', 'IMU Alumni Hall'],
       ['Goldman Sachs Info Session', 'Kelley School of Business 100'],
       ['Weekly Design Critique', 'Luddy Hall 1106'],
       ['IU Hackathon 2025', 'Assembly Hall'],
     ];
     function _calPurgeSeed(saved) {
       let changed = false;
       Object.keys(saved).forEach(k => {
         const list = Array.isArray(saved[k]) ? saved[k] : [];
         const kept = list.filter(e => !(e && CAL_SEED_PURGE.some(([n, l]) => e.name === n && e.location === l)));
         if (kept.length) {
           if (kept.length !== list.length) { saved[k] = kept; changed = true; }
         } else {
           delete saved[k];
           changed = true;
         }
       });
       return changed;
     }
     ```
   - `_calLoad` (:1635) becomes: `function _calLoad(){try{const r=localStorage.getItem(CAL_KEY);if(!r)return;const saved=JSON.parse(r);if(!saved||typeof saved!=='object'||Array.isArray(saved))return;if(_calPurgeSeed(saved))localStorage.setItem(CAL_KEY,JSON.stringify(saved));Object.assign(calendarEvents,saved);}catch(e){}}`
   - The purge runs on every load, with no "already purged" flag. It is idempotent, and it also cleans up after an old tab (either page) that re-saves the fakes before its reload.
   - An event is dropped only when BOTH its name and its location match a pair. A student's own "IU Hackathon 2025" at another location stays.
   - Cross-batch conflict rule: if PH's text names the constant or the function differently, the reviewer picks one spelling, and both files carry it byte-identical before the wave commits (see Acceptance).
   - Leave `peer.school` (:1877) and `u.school` (:2664) alone. They read the dual-written label until M3 (§2.3, C1).
   - `removeCalEvent`'s unescaped `${e.name}` in innerHTML (:1574, :1624) is out of scope. It is self-only data from localStorage.

4. **`security-sentinel.js`: context strings only** (critic C3; no lens restructure, still 11 lenses)
   - :78 (single-quoted string, so no apostrophes):
     - `.edu school-email verification` → `@iu.edu / @purdue.edu school-email verification`
     - `src/lib/supabase/{server,browser,middleware,service,env}.ts, middleware.ts. Check assumptions` → `src/lib/supabase/{server,browser,middleware,service,env}.ts, src/proxy.ts (the Next 16 request proxy; there is no root middleware file). Check assumptions`
   - :79 (double-quoted): `(users, orgs, org_members, channels, channel_members, messages).` → `(users, orgs, org_members, org_followers, org_invites, channels, channel_members, messages, posts). Club rules to confirm: only a club's owner or admins can list or remove its followers (src/app/api/orgs/[slug]/followers/**); a hidden club (orgs.hidden_at set) stays invisible to non-members (404 on its page and follow routes, absent from search); org lookups for non-members use the service client, so the route itself must re-check hidden_at and membership; only owners and admins send invites (org_invites); a student can change only the text, tags and draft status of their own posts (posts column UPDATE grants, migration 20260916130000).`
   - :83 (single-quoted): `mass-follow. Assess whether` → `mass-follow of people and clubs (club follow and unfollow share one rate limit), repeated post edits (PATCH /api/posts/[id]). Assess whether`
   - :87 (double-quoted): `(pilot: IU Indianapolis)` → `(pilot: Indianapolis — one shared campus for IU Indianapolis and Purdue Indianapolis students; the university comes from a verified @iu.edu or @purdue.edu address)`
   - :88 (single-quoted): `Files: next.config.ts, middleware.ts, src/lib/supabase/**` → `Files: next.config.ts, src/proxy.ts, src/lib/supabase/**`. The reader notes missed this second `middleware.ts`.
   - :121 (template literal): `(note that the pilot campus is IU Indianapolis and some first-year students may be minors)` → `(note that the pilot campus is Indianapolis, one community for IU and Purdue students, and some first-year students may be minors)`
   - :227 (template literal): `"an outsider could pass as a verified IU student"` → `"an outsider could pass as a verified IU or Purdue student"`
   - Unchanged: `meta` (:1-11, "11 attacker lenses"), ROE, STACK, schemas, and every prompt's structure. `feature-sentinel.js` and the `audit-sentinels` skill have no IU-only strings (grep at HEAD) and aren't touched.

**Acceptance**
- **Static checks**
  - `npx tsc --noEmit` exits 0.
  - `npx eslint src/components/mobile/MapMobile.tsx src/components/landing/home-landing.tsx` → 0 problems each (baseline 0 at `f23bc5d`, re-run at planning time).
  - `node --check .claude/workflows/security-sentinel.js` passes (it passes at HEAD).
- **MapMobile greps**
  - `rg -n "schoolForMajor\(|IU_SCHOOLS\.(filter|find|map)|Nothing here is verified" src/components/mobile/MapMobile.tsx` → 0.
  - `rg -n "HALO_SCHOOLS" src/components/mobile/MapMobile.tsx` → 4 (the definition plus `computeLayout`, `SchoolHalos`, `ZoneSheet`).
  - `rg -n "schoolForMajorIn\(" src/components/mobile/MapMobile.tsx` → 3.
  - `rg -nF "The map groups people by major at your campus. Pick yours in Settings." src/components/mobile/MapMobile.tsx src/app/campus/campus-home.tsx` → one hit per file (CH1 is on `main` since W3).
- **Halo lookups**
  - `node --test --experimental-strip-types src/lib/iu/majors.test.ts` passes (the lib is unchanged; this guards the lookups the halos use).
  - Halo parity script in the scratchpad: a `.mts` that registers the resolve hook from `majors.test.ts:24-40` and dynamically imports `majors.ts` and `majors-purdue-indianapolis.ts`. It must show:
    - `schoolForMajor(n).id === schoolForMajorIn("indianapolis", null, n).id` for Finance, Health Sciences, Management, Marketing, Political Science and Supply Chain Management
    - "Artificial Intelligence" → `purdue-science` and "Multidisciplinary Technology" → `purdue-polytechnic`
    - the 19 ids of `[...IU_SCHOOLS, ...PURDUE_INDIANAPOLIS_SCHOOLS]` are unique
- **Landing greps:** `rg -n "<span>IU</span>|schoolEmailDomains\(|schoolEmailDomainsLabel\(|process\.env" src/components/landing/home-landing.tsx` → 0.
- **messages.html**
  - `S=<scratchpad>; awk '/<script>[[:space:]]*$/{f=1;next} /<\/script>/{f=0} f' public/html/messages.html > $S/messages-inline.js && node --check $S/messages-inline.js` passes. The page has one inline script (HEAD :1068-3427), and this exact extraction passes at `f23bc5d`.
  - `rg -n "seedEvents" public/html/messages.html` → 0.
  - `rg -n "IU Spring Career Fair|IU Hackathon 2025" public/html/messages.html` → exactly 2 hits, both inside `CAL_SEED_PURGE`.
  - The block sits at column 0: `rg -n "^const CAL_SEED_PURGE = \[$|^function _calPurgeSeed\(saved\) \{$" public/html/messages.html` → 2.
  - Purge unit check: `sed -n '/^const CAL_SEED_PURGE/,/^}/p' public/html/messages.html > $S/purge-block.js` (20 lines). Load it with `vm.runInNewContext(src + ';this.p=_calPurgeSeed;', ctx)` and check:
    - one day holding a fake and "Study group" → only "Study group" is left
    - a fake-only day → the key is deleted
    - "IU Hackathon 2025" at "Luddy Hall" → kept
    - first call → `true`; second call on the result → `false`
  - Parity with PH (run once both batches are in the wave tree): `diff <(sed -n '/^const CAL_SEED_PURGE/,/^}/p' public/html/messages.html) <(sed -n '/^const CAL_SEED_PURGE/,/^}/p' public/html/profile.html)` → no output.
  - `rg -n "peer\.school \|\| peer\.bio|u\.school, u\.major" public/html/messages.html` → still 2 hits (the M3 readers are untouched).
- **Sentinel greps**
  - `rg -n "pilot: IU Indianapolis|pilot campus is IU Indianapolis|verified IU student|middleware\.ts" .claude/workflows/security-sentinel.js` → 0.
  - `sed -n '/^const DIMENSIONS = \[/,/^\]/p' .claude/workflows/security-sentinel.js | grep -c "{ key: '"` → 11 (unchanged).
  - `rg -n "org_followers|src/proxy\.ts|@purdue\.edu|verified IU or Purdue student" .claude/workflows/security-sentinel.js` → hits on the :78, :79, :87, :88 and :227 lines only.
- **Live checks.** These run read-only after the wave deploys, or on localhost. Install the non-GET blocker first; agents make no server writes.
  - **Landing `/`**, signed out is fine, at 375×812 and 1280:
    - `[...document.querySelectorAll('.vibe-landing-schools > span')].map(s => s.textContent)` → `["IU","·","Purdue","live"]`
    - screenshots show the chips centred, with nothing overlapping at 375 (wrapping is allowed)
    - `read_console_messages` with pattern "hydrat" → 0
  - **Phone map at 375×812, as Franky.** Every CampusMobile pane, the map included, mounts and fetches on arrival (`CampusMobile.tsx:541-543`), so an override installed after a hard load of `/campus` is too late.
    - Load `/network` and install the blocker plus a GET override for `/api/campus-map` returning `{ok:true, you:{id:"x",name:"Test",handle:"test",major:null,avatar_url:null}, majors:[{name:"Finance",total:3,connected:0,mutuals:0},{name:"Artificial Intelligence",total:2,connected:0,mutuals:0},{name:"Multidisciplinary Technology",total:1,connected:0,mutuals:0}], orgs:[], campus_id:"indianapolis", campus_scope:"indianapolis"}`.
    - Tap Campus in `MobileTabBar`. It's a `next/link` soft navigation, so the override survives. Then tap the Map tab. The override's log shows `/api/campus-map` served, and the blocker recorded 0 non-GETs.
    - Colours, via `getComputedStyle(document.querySelector('button[aria-label^="<name>"]')).backgroundImage`:
      - "Artificial Intelligence" contains `101, 163, 13` (#65A30D)
      - "Multidisciplinary Technology" contains `234, 179, 8` (#EAB308)
      - Finance contains `198, 40, 40` (Kelley #C62828)
      - At HEAD both Purdue bubbles read `156, 163, 175` (Other).
    - The screenshot shows three separate halos. Tapping "Artificial Intelligence" opens the zone sheet with the green accent.
    - Same flow with `{ok:true, you:{…}, majors:[], orgs:[], reason:"no_school"}` → the overlay reads "Pick your campus in Settings to see your map" / "The map groups people by major at your campus. Pick yours in Settings.", and its link points at `/settings#campus`.
    - With no override, Franky's real map screenshot keeps its current grouping.
  - **Calendar purge on desktop `/messages` at 1280, as Franky.** Browser storage only.
    - Save the current `localStorage.vibe_cal_events_v1`.
    - Set it to `{"2026-09-20":[{"name":"IU Spring Career Fair","time":"10:00","location":"IMU Alumni Hall","notes":"","color":"#1A9E5B"},{"name":"Study group","time":"18:00","location":"Library","notes":"","color":"#FF5C35"}],"2026-09-25":[{"name":"IU Hackathon 2025","time":"09:00","location":"Assembly Hall","notes":"","color":"#FF5C35"}],"2026-09-30":[{"name":"IU Hackathon 2025","time":"09:00","location":"Luddy Hall","notes":"","color":"#FF5C35"}]}`.
    - Load `/messages`, which iframes `/html/messages.html?app=1`. The stored JSON's keys become exactly `2026-09-20` (Study group only) and `2026-09-30`. `document.querySelector('iframe').contentWindow.eval('Object.keys(calendarEvents)')` agrees, and the mini calendar marks only those two days.
    - With the key removed: no event dots anywhere.
    - Then load `/messages` → `/profile` → `/messages` (PH's page). The stored JSON is identical after each load.
    - Restore the saved value, or remove the key if there was none.

**Do not touch:**
- **Libraries:** `src/lib/iu/majors.ts`, `majors-purdue-indianapolis.ts`, `public/html/_iu-majors.js`, `src/lib/iu/campuses.ts`, `src/lib/auth/school-email-domains.ts`
- **Styles and routes:** `src/app/globals.css`, `src/app/api/campus-map/route.ts` (the `school_system` field is a later additive change)
- **Files other batches own:** `src/app/campus/campus-home.tsx` (CH3 owns it in W5), `public/html/profile.html` (PH), `src/components/mobile/CampusMobile.tsx`, `MobileTabBar.tsx`
- **Sentinel neighbours:** `.claude/workflows/feature-sentinel.js`, `.claude/skills/audit-sentinels/**`
- **Inside messages.html:** `peer.school` / `u.school` (:1877, :2664), `_storeEvent` / `addCalEvent`, and the calendar render and innerHTML code

---

### B21 · legal drafts: IU + Purdue, campus, club following, invites, onboarding, post editing (local, gitignored)

**Owns:** `handoffs/legal-drafts/2026-09-07-privacy-policy.md`, `handoffs/legal-drafts/2026-09-07-terms-of-service.md`, `handoffs/legal-drafts/2026-09-07-reviewer-questions.md` (all existing). `/handoffs/` is gitignored (`.gitignore:68`), so nothing here is committed, pushed or deployed.
**Depends on:** W1–W4 deployed and G4 passed, so every sentence describes shipped behaviour: F1 follow routes + M1d policies, H1 hidden clubs, F2/F6 follower counts, E0/E1 post editing, B12/B13 onboarding, B15 draft clearing, CH1 campus banner, F5a `FOLLOW_DISCLOSURE`. No code import. It shares no file with CH3, PH, E6 or B20, so it runs in parallel with them. Wording says what the routes and database policies allow, never which screen shows it, so it stays true whether or not CH3's Followers tab lands in the same deploy.
**Anchors:** no wave edits the three drafts; their `:line`s were read at `f23bc5d`. Code anchors in files W1–W4 edit (`campus-home.tsx`, `CampusMobile.tsx`, `draft.ts`, org page files, `posts/[id]/route.ts`, `following.ts`, `join-copy.ts`) are cited by function or constant name. Re-grep them on post-W4 `main`. Line-cited code files (`src/app/legal/terms/page.tsx:142`, `src/lib/legal/terms.ts:1`, `onboarding-prefill.ts:394-438`, `join-state.ts:199`, the M1c migration) are touched by no batch.
**Scope limit:** no change to the live legal pages, no `TERMS_VERSION` bump, no new promise the code doesn't already keep. Every new assumption gets one marker in the drafts' existing style: `**[DECISION: … Draft assumes: ….]**` for product choices, `**[REVIEWER: … Draft assumes: ….]**` for counsel.

**Live state** (grep + read-only SQL at `f23bc5d`, 2026-09-16)
- **The drafts are IU-only and dated September 7.**
  - Privacy: :11, :24-25, :39, :49 ("school"), :72, :103, :110, :160-162 (§6c "Indiana University"), :191, :289.
  - Terms: :35-37, :42, :52, :143, :145-146, :193, :210 (Marion County).
  - Reviewer questions: :7 ("8 accounts", "@iu.edu/@iupui.edu"), :12, :33, :44-46, :48.
- **Legal status.** The live Terms page still names Monroe County (`src/app/legal/terms/page.tsx:142`). `TERMS_VERSION = "2026-05-07"` (`src/lib/legal/terms.ts:1`). `public.users` has 19 rows.
- **School email** (`src/lib/auth/school-email-domains.ts`):
  - `SYSTEM_DOMAINS` maps iu → `iu.edu` and purdue → `purdue.edu`, subdomains included; `PURDUE_SIGNUPS_ENABLED = true`.
  - `RETIRED_IU_DOMAINS` (iupui.edu, indiana.edu, iuk.edu, iupuc.edu, ius.edu, iun.edu, iusb.edu, iue.edu, iufw.edu) are always refused. `schoolEmailRejection` answers "IU retired @iupui.edu addresses on Jan 1, 2026. Use your @iu.edu address."
  - @pfw.edu / @pnw.edu are not in `SYSTEM_DOMAINS`.
  - `users_school_email_key` is UNIQUE, so one account per school address.
  - Verifying at the other university switches `school_system`. The campus is kept when it belongs to both universities and cleared otherwise; `campus_set_at` is never reset (`schoolSystemPatch`).
- **Verification lifetimes** (`src/lib/auth/school-email-token.ts`): the signed link lasts 48 h (`ttlSeconds = 60 * 60 * 48`). The 8-digit code lasts 30–60 min (`SCHOOL_CODE_WINDOW_SEC = 1800`; the current and previous window are accepted).
- **Campus:**
  - `CAMPUS_CHANGE_COOLDOWN_MS` is 30 days (`campusChangeDecision`, `src/lib/profile/onboarding-prefill.ts:394-438`). Writes before onboarding is done start no cooldown (B15 `nextAvailableAfterWrite(false) === null`).
  - Column grants: authenticated may SELECT `school_system` and `campus_id`; anon may not. `campus_set_at` is service-only.
  - `src/app/api/users/[handle]/bootstrap/route.ts` serves anonymous visitors. It returns `school_system,campus_id` (`PUBLIC_PROFILE_CAMPUS_COLUMNS`) and deliberately not `campus_set_at`.
- **Policies** (`pg_policies`; no anon policy on any of these):
  - `users`, `events`, `rsvps`: SELECT `true` for authenticated.
  - `posts`: SELECT published-or-own.
  - `orgs_select` = `(is_public OR member) AND (hidden_at IS NULL OR member)`. M1c narrowed it, so the onboarding plan's critic D2 line "orgs are readable by any signed-in user" is STALE. Don't name clubs in the honesty sentence.
  - `org_members_select` = member OR (the club is `is_public` AND `open` AND not hidden).
  - `org_followers_select` / `org_invites_select` = the row's student OR that club's owner/admin.
- **Foreign keys:** `org_followers.user_id`, `org_follow_firsts.user_id` and `org_invites.invitee_id` are ON DELETE CASCADE. `org_invites.invited_by` and `.resolved_by` are ON DELETE SET NULL. Every `org_id` FK cascades.
- **Follows and invites:**
  - `org_follow_firsts` keeps the first-follow date across an unfollow or an officer removal (M1d header item 2; F1 removal leaves it untouched).
  - F1 officer list rows: card fields, `follows_since`, `org_follow_source` (join/profile/discover/onboarding), `member_role`. Owner/admin only.
  - Removal sends no notification.
  - `org_invites.expires_at` defaults to `now() + interval '30 days'`. Statuses: pending / accepted / declined / revoked / expired (`supabase/migrations/20260916103000_org_join_policy_invites.sql:807-810`).
  - `DECLINE_COOLDOWN_DAYS = 14` (`src/lib/orgs/join-state.ts:199`).
- **Notifications:** `notifications_type_check` allows follow, connection, like, comment, mention, org_invite, org_request_approved. There is no org-follow type.
- **Rate-limit keys:** `org-follow:`, `org-follower-remove:` (F1), `org-invite:` / `org-invite-org:` / `org-invite-to:` (invites route), `onboarding-step:`, `post-edit:` (E1).
- **Heartbeat:** `POST /api/me/heartbeat` fires inside `CampusBanner` in `campus-home.tsx`, every 30 s while visible, and `CampusMobile.tsx` renders `<CampusBanner compactSearch …>`. The phone /campus page therefore pings too. Privacy :72 ("the phone layout, do not send this ping") is ALREADY wrong at HEAD.
- **Onboarding draft** (`src/lib/onboarding/draft.ts`, which B12 edits):
  - localStorage key `ONBOARDING_DRAFT_KEY_PREFIX` + user id; `ONBOARDING_DRAFT_TTL_MS` = 14 days; an expired draft is removed only when next loaded.
  - Cleared after Finish/Skip (B12/B13), and at three B15 sites: Settings sign-out, Settings delete, Terms-screen sign-out. The `verify-school` and `EmailLinkProblem` sign-outs do NOT clear it.
- **Club pages:** the org page and `/api/orgs/[slug]/profile` serve up to 12 recent posts with author identity, plus the member count, for every non-hidden club under every join policy. Hidden clubs 404 for non-members.
- **Live clubs:** `sae` (invite, both, 1 member, 1 follower) and four hidden `test-*` clubs.

**Contract**

1. **Before writing anything:**
   - Record the marker baseline: `grep -o '\*\*\[\(DECISION\|REVIEWER\):[^]]*\]\*\*' <file> | grep -vc 'Draft assumes'`. At `f23bc5d` it is 2 / 2 / 0 (privacy / terms / reviewer).
   - Re-run every grep and SQL in **Acceptance** on post-W4 `main` and note the short sha. If a fact differs from **Live state**, the draft says what the code does, and the difference goes in the batch report. Never write the planned sentence over it.
   - Any sentence you add or rewrite says "video posts", not "clips". Leave untouched sentences as they are.
   - `{n}` below = `select count(*) from public.users` on the edit date; `{date}` = the edit date; `{sha}` = post-W4 `main`.

2. **Header notes.**
   - Privacy :5 and Terms :5: after "as of September 7, 2026", insert ", and re-checked on {date} against commit `{sha}` for Purdue, campuses, club following, club invites, onboarding and post editing".
   - Reviewer :3: append " · updated {date} for Purdue, campuses, club following and invites, onboarding and post editing".
   - The filenames and the `2026-09-07` version strings stay.

3. **Privacy §1 (:11).** Replace the paragraph with:
   > Vibe is a campus social app for students, clubs and organizations at **Indiana University** and **Purdue University**. It is piloting in **Indianapolis**, which is one shared campus community for IU Indianapolis and Purdue Indianapolis students. Vibe is built and operated independently; it is **not affiliated with, endorsed by, or operated by Indiana University or Purdue University**, and neither university receives any data from Vibe.

4. **Privacy §2.**
   - :24 becomes:
     > - **Vibe is open to IU and Purdue students.** You can sign up with any email address, but to use Vibe you must complete four steps in order: (1) confirm that email; (2) accept the Terms; (3) prove you control an **@iu.edu or @purdue.edu** address (including subdomains such as @mail.iu.edu); and (4) finish or skip onboarding, which Otto, Vibe's built-in assistant, walks you through. Without one of those school addresses you cannot get past step 3. IU retired @iupui.edu addresses on January 1, 2026, so we refuse them, and IU's other retired addresses, and ask for your @iu.edu address instead. Other schools' addresses, including @pfw.edu and @pnw.edu, are not accepted.
   - New bullet right after it:
     > - **What onboarding asks.** You pick your campus from your university's campuses and give a display name and a handle. The name and handle are the only required fields; finishing also needs a campus. A photo, the rest of your profile, clubs, and people to follow are optional. Each step is saved to your account when you continue, a photo when you save it, and each follow or join when you tap it. **Skip** ends onboarding once you have a name and a handle, and leaves your campus for later.
   - :25 becomes:
     > - **What that check does and does not prove.** Your school email proves which **university** you attend, IU or Purdue, not your campus: every IU campus uses @iu.edu, and Purdue's campuses share @purdue.edu. You **choose your campus** from your university's campuses, and we do not verify it. Indianapolis is one community for both universities. After onboarding you can change your campus at most once every 30 days, and we store when you last set it. If you later verify an address at the other university, your university changes with it; your campus stays if it belongs to both universities and is cleared if it doesn't. The "school verified" badge means your IU or Purdue address was confirmed, nothing more.

5. **Privacy §3a table (:39).** Replace the school-email row, then add two rows under it:
   > | School email address (@iu.edu / @purdue.edu) — required to use Vibe | To confirm which university you attend (IU or Purdue) and give you the "school verified" badge; it does not identify your campus, one address can verify only one account, and the address itself is never shown to other users |
   > | Your university (IU or Purdue), taken from your verified school email | To decide which campuses you can pick, and which clubs you can join when a club is open to only one university's students. It does not limit who you can follow, message, or find in search |
   > | Your campus, which you pick within your university, and when you last set it | To show your campus's clubs, events, map and people first, and to allow one campus change every 30 days. Your campus is part of your profile (section 5); when you last set it is visible only to you |

6. **Privacy §3b (:49).** Change "display name, handle, school, year, major, department;" to "display name, handle, university and campus (see 3a), year, major, department;".

7. **Privacy §3c.**
   - After the Posts bullet (:59), add:
     > - **Edits to your posts.** When you edit a post, we replace its text, re-read its tags from the new text, and record when you edited it. We do not keep the earlier text.
   - After the follows bullet (:60), add:
     > - **Clubs you follow.** You can follow any club Vibe shows you, whatever its campus and whoever it lets join. We store which clubs you follow; how you started following each one (by joining it, from its page, from the clubs list, or during onboarding); when; and the date you first ever followed it. Joining a club follows it automatically, and a member can't unfollow; leaving a club removes the follow only if joining created it.
   - After the memberships bullet (:63), add:
     > - **Club invites.** When a club's owner or an admin invites you to join, we store the invite, who sent it, and what happened to it (waiting, accepted, declined, withdrawn, or expired).

8. **Privacy §3d.**
   - :72 becomes the text below. Re-verify first: `api/me/heartbeat` must still be called only inside `CampusBanner`, and the banner must still read `campusActiveNow` (CH1). If CH1 kept the global number, keep "the campus "active now" count" and report it.
     > - **Last active time.** While the Campus page is open and on screen, on a computer or a phone, your browser pings us every 30 seconds. We store the time of your last ping and use it for the "active now" count on your campus's banner, which counts people at your campus, and for recent-activity ordering. Signed-in users can see it. Other pages do not send this ping.
   - :73 becomes:
     > - **Notifications** generated when someone follows, likes, comments on, mentions, or connects with you; when a club invites you to join; when a club approves your request to join; and when someone newly @mentions you by editing a post. Following a club doesn't notify anyone.
   - :74: in the list of counted actions, after "org creation," insert "following and unfollowing clubs, removing a club's follower, sending club invites, editing posts, saving onboarding steps,". Club invites are also counted per club and per invited student, so change "keyed by your user id" to "keyed by your user id (club invites are also counted per club and per invited person)".

9. **Privacy §5a.**
   - :99: before its `[DECISION` marker, insert "That includes your university and campus badge, but not when you last set your campus."
   - :103 becomes:
     > - **Club (org) pages:** the club's description, links, logo, banner, member count, its follower count once it has 5 or more followers, and its most recent posts (up to 12), including the name, handle, and avatar of whoever posted them. This is true for every club, including clubs you must ask or be invited to join. Clubs we have hidden are shown only to their own members. **[DECISION: keep as-is, or hide member posts / author identity for clubs that are not open to everyone. Draft assumes: as-is, disclosed.]**

10. **Privacy §5b.**
    - :110: replace "— campus-wide." with "— to every signed-in user, at every campus."
    - After :110, add the two bullets below. They are the honesty sentence, corrected by critic D2 and by the live `orgs_select`. They don't name clubs.
      > - **Your campus decides what Vibe shows you first, not who can look.** Vibe puts your own campus's clubs, events, map and people first, and a club can let only one university's students join. But any signed-in Vibe user, at any campus or university, can read your profile, your published posts, the events you create, and your RSVPs, even where the app would not show them. People who are not signed in cannot read these from our database directly; what they can see is listed in 5a.
      > - **Membership in open clubs.** The members of a club anyone can join are visible to every signed-in user. The members of a club you must ask or be invited to join are visible only to that club's members. Because every member follows their club automatically, anyone who can see a member list can tell those members follow the club.

11. **Privacy §5c (:116-119).** After "personal calendar entries," insert "when you last set your campus,". After :119, add the line "(The clubs you follow and the club invites you receive are *not* only-you either; see 5f.)"

12. **New Privacy §5f**, after §5e (:128):
    > ### 5f. A club's owner and admins
    >
    > The owner and admins of a club (not its moderators or other members) can see:
    >
    > - **That you follow the club**, when you first followed it, how you started (by joining, from its page, from the clubs list, or during onboarding), whether you are also a member, and the profile card they would see anywhere else on Vibe: name, handle, photo, banner, major, year, and how many connections you share. If you unfollow and follow again, they see your first follow date. On clubs that are not open to everyone, the app tells you this next to the Follow button.
    > - **Invites to join that club** that its owner or admins sent you, and whether you accepted, declined, or let the invite expire.
    >
    > No one else can see which clubs you follow, except as described for club members in 5b. Clubs don't get a notification when you follow them. An owner or admin can remove you as a follower. You are not notified, and you can follow the club again.

13. **Privacy §6c (:160-162).** The heading becomes `### 6c. Indiana University and Purdue University`, and the body becomes:
    > Vibe sends nothing to IU or Purdue. Neither university can see your Vibe account, your messages, or whether you verified. Verification works by us emailing a link and a code to your school address; the university is not involved beyond delivering that email.

14. **Privacy §7 (:176).** After "flags for which onboarding tours you've seen," insert "a draft of what you've typed during onboarding (so a refresh doesn't lose it),". After the paragraph's last sentence, add:
    > The onboarding draft is removed when you finish or skip onboarding, and when you sign out or delete your account from Settings or sign out from the Terms screen. A draft left untouched for 14 days is ignored and removed the next time onboarding opens.

15. **Privacy §8.**
    - After :187, add:
      > - **Clubs you follow:** until you unfollow, a club's owner or an admin removes you, you leave a club whose follow came from joining it, or your account or the club is deleted. The date you first followed a club is kept after you unfollow or are removed, so following again keeps your original date. It is deleted with your account or the club.
      > - **Club invites:** an invite you don't answer expires after 30 days. The invite and its outcome are kept until your account or the club is deleted. After you decline, the same club can't invite you again for 14 days.
      > - **Edited posts:** each edit overwrites the earlier text; only the time of the latest edit is kept.
    - :191 becomes:
      > - **School-verification links:** valid for 48 hours. **School-verification codes** (typed instead of tapping the link): valid for 30 to 60 minutes. **Password-reset and signup-confirmation links:** valid for 1 hour.

16. **Privacy §9b (:205).** After "Reports go to us; we review them by hand.", insert: "If a post is changed after you report it, we review the post as it is when we look." At the end of the paragraph add (the same marker goes in Terms §6, word for word):
    > **[DECISION: a post can be edited after it is reported and before we review it, and a report does not keep a copy of the post's text. Draft assumes: disclosed as-is in both documents; a later change may store the reported text with the report.]**

17. **Privacy §9d.**
    - :221 becomes:
      > - *Orgs and events:* org (club) memberships, the clubs you follow and the dates you first followed them, join requests, club invites sent to you, events you created (and everyone's RSVPs to them), your own RSVPs.
    - After :230, add:
      > - Club invites you sent or withdrew as a club's owner or admin keep existing for that club, with the "invited by" / "withdrawn by" field cleared.
    - Before writing, re-verify with the FK query in **Acceptance**. `org_invites.resolved_by` is the invitee on accept/decline, and the officer (or a platform admin hiding the club) on revoke: `me/org-invites/[id]/route.ts`, `orgs/[slug]/invites/[id]/route.ts`, `orgs/[slug]/route.ts`, `admin/orgs/[slug]/hide/route.ts`, `membership.ts`. An invite you received is deleted with your account (`invitee_id` cascades).

18. **Privacy §12 (:289).** Change "some IU first-year students are 17" to "some IU and Purdue first-year students are 17".

19. **Terms §2.**
    - :35: "IU admits some 17-year-old first-year students" → "IU and Purdue admit some 17-year-old first-year students".
    - :36 becomes:
      > - **Vibe is built for IU and Purdue students, and you need a school address from one of them to use it.** Our pilot is Indianapolis, one shared community for IU Indianapolis and Purdue Indianapolis. Verifying your address proves which university you attend, not which campus: you pick your campus from your university's campuses, and we do not verify it. You can sign up with any email address, but to use Vibe you must complete four steps in order: (1) confirm that email; (2) accept these Terms; (3) verify that you control an **`@iu.edu` or `@purdue.edu` address** (including subdomains like `@mail.iu.edu`); and (4) finish or skip onboarding, which Otto, Vibe's built-in assistant, walks you through (Otto runs on our servers and sends nothing to an outside AI service). Without one of those addresses you cannot get past step 3 — you can create a login but only ever reach the limited pages (Section 1). IU's retired addresses, such as `@iupui.edu`, and other schools' addresses are not accepted.
    - :37 becomes:
      > - **Vibe is independent.** Vibe is not affiliated with, endorsed by, or operated by Indiana University, Purdue University, or any of their campuses. We do not send your information to either university, and neither sends us anything about you.

20. **Terms §3–§4.**
    - :42: "each IU address can verify only one account" → "each school address can verify only one account".
    - :52: "a club, IU, or Vibe itself" → "a club, IU, Purdue, or Vibe itself".
    - :64: append "You can also follow a club (Section 8)."
    - New paragraph right after :64:
      > **Editing posts.** You can edit the text of your own posts. The new text replaces the old everywhere the post appears, including its link preview; a published post then shows "Edited"; and we do not keep the earlier text. People you newly @mention in an edit are notified once. An edit does not change copies other people already made, and what you write in an edit must follow these Terms like anything else you post.

21. **Terms §6 (:120).** At the end of the paragraph, add the §9b marker from item 16, word for word.

22. **Terms §8.**
    - :143: "This is true today even for orgs marked private." → "This is true today for every club, including clubs you must ask or be invited to join; clubs we have hidden are the exception (see below)." After "member count," insert "its follower count once it has 5 or more followers,".
    - :144: after "approve join requests," insert "invite students to join, see who follows the club and remove a follower,".
    - After :144, add:
      > - **Following a club.** Anyone signed in can follow any club Vibe shows, whatever its campus and whoever it lets join. Following puts the club's posts in your feed; it is not membership, and club chats are for members only. Joining a club follows it automatically, and members can't unfollow; leaving removes the follow only if joining created it. A club's owner and admins can see who follows it, when each person first followed, and how, and can remove a follower (Privacy Policy §5f).
      > - **Joining and invites.** Each club decides who can join: anyone, anyone who asks and is approved, or only people it invites. It also decides whether IU students, Purdue students, or both can join, and we check that against the university your school email shows. If you have picked a campus and the club belongs to a different campus, you ask to join even when the club is open to anyone. A club's owner and admins can invite you to join. An invite expires after 30 days, and after you decline, that club can't invite you again for 14 days.
      > - **Hidden clubs.** We can hide a club, for example a test club. A hidden club's page is shown only to its members, and nobody can start following it.
    - :145: "It is not an endorsement by IU or by us." → "It is not an endorsement by IU, Purdue, or us."
    - :146: "Think of RSVPs as public within the campus." → "Think of RSVPs as public to everyone on Vibe, at every campus."

23. **Terms §9 and §10.**
    - :159 becomes "   - *Orgs and events:* org (club) memberships, the clubs you follow and the dates you first followed them, join requests, club invites sent to you, events you created (and everyone's RSVPs to them), your own RSVPs." (the same as Privacy §9d).
    - After :167, add "- **Club invites you sent or withdrew** as an owner or admin keep existing for that club, with the "invited by" / "withdrawn by" field cleared."
    - :193: "confirmed an IU email address" → "confirmed an IU or Purdue school email address".

24. **Terms §13 (:210).** After the existing `[REVIEWER` marker, add:
    > **[REVIEWER: the live Terms page, published May 7, 2026, names Monroe County courts; this draft names Marion County, where the Indianapolis pilot is. Pick one before publishing, and make this section and reviewer question 5 agree. Draft assumes: Marion County.]**

25. **Terms founder notes (:243-253).**
    - Note 1 (:245): append "Publishing any change to the live pages needs this bump in the same deploy, and every bump re-prompts all {n} accounts (S54)."
    - Note 3 (:247): append "; a reported post can be edited before review, and reports keep no copy of the text".
    - Add a note 10:
      > 10. **Shipped since September 7, re-checked {date} at `{sha}`:** Purdue verification (@purdue.edu) and the refused @iupui.edu; a campus picked within your university, changeable once every 30 days after onboarding; club following (visible to the student and the club's owner/admins only, members follow automatically, public count hidden below 5, silent and reversible removal, first-follow date kept); club invites (30-day expiry, 14-day wait after a decline); hidden clubs; onboarding (campus, name + handle, photo, clubs, people; saved as you go; Skip needs a name and handle); post editing (text only, "Edited", no history, new mentions notified once). These are in Privacy §2, §3, §5, §7, §8, §9 and Terms §2, §4, §8, §9.

26. **Reviewer questions.**
    - :7:
      - "profiles, posts and clips," → "profiles, posts and video posts, clubs you can follow or join,"
      - "piloting at IU Indianapolis with 8 accounts as of September 6, 2026" → "piloting in Indianapolis (one shared campus for IU Indianapolis and Purdue Indianapolis) with {n} accounts as of {date}"
      - "verify an @iu.edu/@iupui.edu address" → "verify an @iu.edu or @purdue.edu address"
    - :12: "IU Indianapolis admits some 17-year-olds" → "IU Indianapolis and Purdue Indianapolis admit some 17-year-olds".
    - :33: "independent of Indiana University" → "independent of Indiana University and Purdue University".
    - :34 (If different): append the counsel flag:
      > **Counsel flag:** the live Terms (published May 7, 2026; `src/app/legal/terms/page.tsx:142`) name Monroe County courts, while both drafts name Marion County (Terms §13). Pick one before anything is published.
    - New question after question 6 (:39). Quote the disclosure line from `FOLLOW_DISCLOSURE` in `src/lib/orgs/join-copy.ts` verbatim:
      > **7. Is our notice that club officers can see followers enough?**
      > *Why:* following a club is one tap and feels passive, but the club's owner and admins can see each follower's name and profile card, when they first followed, and how; on an invite-only club that list names the students it courted. Officers can also remove a follower without telling them.
      > *Default:* the line "Officers can see who follows this club." next to Follow on request-to-join and invite-only clubs, plus Privacy §5f. No line on open clubs, and no notice on removal (Privacy §5f, §8; Terms §8).
      > *If different:* showing the line on every club, or notifying a removed follower, is a small code change plus a Privacy §5f update.
    - :44 (Consent record): append "Any change to the live pages needs `TERMS_VERSION` (`src/lib/legal/terms.ts:1`) bumped in the same deploy, and each bump re-prompts all {n} accounts (S54)."
    - :45 (Login) becomes:
      > - **Login:** any sign-in email; verification accepts only @iu.edu and @purdue.edu (and subdomains); @iupui.edu and IU's other retired domains are refused with a message pointing to @iu.edu; @pfw.edu and @pnw.edu are not accepted; one school address per account (unique in the database), and verifying at the other university switches the account's university; the email proves the university, and the student picks the campus (changeable once every 30 days after onboarding); email confirmation on; password minimum 8 characters; no two-factor.
    - :46 (Deletion): after "join-request "resolved by"", insert ", club invite "invited by" and "resolved by"". Before "Purge failure", insert "Club follows, first-follow dates and invites received are deleted."
    - :48 (Public exposure): "even for "private" orgs" → "for every club except hidden ones, including invite-only clubs; a club's follower count is public only at 5 or more".
    - New fact bullet after :48:
      > - **Clubs, campus and post edits:**
      >   - Following a club is open to any signed-in user; the database lets only the student and that club's owner/admins read the follow.
      >   - Members follow automatically. An officer's removal is silent and reversible, and the first-follow date survives it.
      >   - Club invites expire after 30 days; a decline blocks re-invites for 14 days.
      >   - Hidden clubs 404 for non-members and can't be followed.
      >   - `users`, `events`, `rsvps` and published `posts` are readable by every signed-in user at every campus; campus is a relevance setting, not a boundary.
      >   - A post edit overwrites the text, re-derives tags, is stamped `edited_at` by a trigger, and keeps no history. Database grants let a student change only a post's text, tags and draft status.
    - :50 (Not in the code): append ", post edit history, a copy of the reported text inside a report".

**Acceptance**
- **Scope.** Each of these exits 0, and `git status --porcelain` lists nothing from this batch:
  - `git check-ignore -q handoffs/legal-drafts/2026-09-07-privacy-policy.md handoffs/legal-drafts/2026-09-07-terms-of-service.md handoffs/legal-drafts/2026-09-07-reviewer-questions.md`
  - `git diff --quiet HEAD -- src/app/legal src/lib/legal`
- **Stale text is gone.** Each → 0:
  - `rg -n '@iu\.edu/@iupui|@iu\.edu / @iupui|or .@iupui\.edu. address' handoffs/legal-drafts`
  - `rg -n 'Indiana University community|every IU campus is welcome|some IU first-year students are 17|IU admits some|IU Indianapolis admits|8 accounts|phone layout, do not send|campus-wide\.|public within the campus|even for orgs marked private|marked .not public|confirmed an IU email address' handoffs/legal-drafts`
  - At `f23bc5d` these two patterns hit Privacy :24, :39, :72, :103, :110, :289; Terms :35, :36, :143, :146, :193; and Reviewer :7, :12, :45. That proves the patterns match the old text.
- **Retired domain.** `rg -n 'iupui' handoffs/legal-drafts` → every hit is inside a retired / refused / not-accepted sentence (Privacy §2, Terms §2, Reviewer :45).
- **Required text is present:**
  - `rg -c 'Purdue'` on each of the three files → ≥ 1 each.
  - `rg -n 'Monroe' handoffs/legal-drafts/2026-09-07-terms-of-service.md handoffs/legal-drafts/2026-09-07-reviewer-questions.md` → the new §13 REVIEWER flag and the reviewer counsel flag (plus the reviewer's existing :32 and :50 mentions).
  - `rg -n '^### 5f\. |^### 6c\. Indiana University and Purdue University' handoffs/legal-drafts/2026-09-07-privacy-policy.md` → 2.
  - `rg -n 'Officers can see who follows this club\.' handoffs/legal-drafts/2026-09-07-reviewer-questions.md src/lib/orgs/join-copy.ts` → 1 hit in each file.
  - `rg -n 'a post can be edited after it is reported' handoffs/legal-drafts` → 2 (Privacy §9b, Terms §6).
- **Markers.** The item 1 count of markers without "Draft assumes" is unchanged (2 / 2 / 0).
- **Every number matches the code on post-W4 `main`:**
  - `rg -n 'CAMPUS_CHANGE_COOLDOWN_MS = 30 \* 24' src/lib/profile/onboarding-prefill.ts` → 1
  - `rg -n 'FOLLOWER_COUNT_FLOOR = 5' src/lib/orgs/following.ts src/lib/orgs/join-copy.ts` → 2
  - `rg -n "interval '30 days'" supabase/migrations/20260916103000_org_join_policy_invites.sql` → 1
  - `rg -n 'DECLINE_COOLDOWN_DAYS = 14' src/lib/orgs/join-state.ts` → 1
  - `rg -n 'ttlSeconds = 60 \* 60 \* 48|SCHOOL_CODE_WINDOW_SEC = 1800' src/lib/auth/school-email-token.ts` → 2
  - `rg -n 'purdue: Object.freeze\(\["purdue.edu"\]\)|PURDUE_SIGNUPS_ENABLED = true' src/lib/auth/school-email-domains.ts` → 2
  - `rg -n 'post-edit:' 'src/app/api/posts/[id]/route.ts'` → 1
  - `rg -n 'org-follow:|org-follower-remove:|org-invite:|onboarding-step:' src/app/api` → ≥ 4
  - `rg -n 'api/me/heartbeat' src` → only inside `CampusBanner`
  - `rg -n '<CampusBanner' src/components/mobile/CampusMobile.tsx` → 1
  - `rg -n 'ONBOARDING_DRAFT_TTL_MS = 14' src/lib/onboarding/draft.ts` → 1
  - `rg -n 'clearDraft\(' src/components/settings/SettingsClient.tsx src/app/auth/terms/accept-terms-form.tsx` → 3
- **Read-only SQL** (MCP `execute_sql`, no emails):
  - `pg_policies` for users / events / rsvps / posts / orgs / org_members / org_followers / org_invites → the quals in **Live state**, and no role list contains `anon`.
  - The `pg_constraint` FK query on org_followers / org_follow_firsts / org_invites → cascade vs set-null exactly as in **Live state**.
  - `has_column_privilege('authenticated','public.users','campus_set_at','SELECT')` → false; the same for `school_system` and `campus_id` → true; anon → false for all three.
  - `pg_get_constraintdef` of `notifications_type_check` → no org-follow type.
  - `has_column_privilege('authenticated','public.posts','created_at','UPDATE')` → false, and `edited_at` exists (E0 applied at G1).
  - `select count(*) from public.users` → the `{n}` written in reviewer :7, :44 and Terms note 1.
- **Live, GET only.** No page is driven. If a browser page is opened anyway, install the non-GET blocker first (live verification recipe).
  - `curl -s https://www.connectvibe.app/legal/terms | grep -c 'Monroe County'` → ≥ 1 (the flag is still true)
  - `curl -s -o /dev/null -w '%{http_code}' https://www.connectvibe.app/api/orgs/test-6ca4ec6e/profile` → 404
  - `curl -s https://www.connectvibe.app/api/orgs/sae/profile | jq '[.. | objects | select(has("follower_count")) | .follower_count]'` → only nulls (1 follower, below the floor, anonymous viewer)
  - `curl -s -o /dev/null -w '%{http_code}' https://www.connectvibe.app/api/orgs/sae/followers` → 401
- **Review.** A second agent reads every added or changed sentence against **Live state** and this contract. A sentence with no code or SQL source is cut or turned into a marker. Each disagreement between drafts is listed (Privacy §9d vs Terms §9; the §9b / §6 marker; §5f vs Terms §8 and reviewer Q7).

**Do not touch:**
- `src/app/legal/**` and `src/lib/legal/terms.ts`: no `TERMS_VERSION` bump. Publishing is Franky's call after counsel, and it re-prompts every account.
- Any file outside the three drafts, including `.gitignore`. No `git add -f` of anything under `handoffs/`.
- The `2026-09-07` filenames and version strings.
- The existing `[DECISION]` / `[REVIEWER]` markers, except the text this contract appends.
- Anything live: no page interaction, no DB write.

---

## 11. Verification

What to check on `https://www.connectvibe.app` after each wave deploys, before the next wave pushes. Everything here is read-only for agents (§4.1 rule 2). The batch sections' own Acceptance lists stay authoritative for their batch; this section is the per-wave live pass that the orchestrator runs once the whole wave is on `main`, plus the gate checks (§4.3) and the branch seed the batch sections point at (§11.2). What Franky does by hand is §12, and each §12 item names the checks below that it unlocks.

**Owns:** no repo file. Outputs (saved JSON, screenshots, fingerprint results) go to `handoffs/wave-plan-verification/` (gitignored); the harness lives in the scratchpad.
**Depends on:** the wave under test deployed from `main` (Vercel `success`); the §4.3 gates in order; §12 S0 before the W1 walk; the other §12 seeds only where an item says "after §12 Sn".

Live facts at planning (read-only SQL, 2026-09-16; ids as `left(id::text,8)`):
- Orgs: `sae` (`923896fb`, name "SAE", `join_policy='invite'`, `audience='both'`, verified, campus `indianapolis`, 1 member, 1 follower row `source='join'`, 0 invites, 0 requests, 0 posts, has a logo). Four hidden test clubs: `test-6ca4ec6e` (open), `test-6e881851` (request), `test-a73bee3e` (request), `test-f7ae4129` (open).
- Franky (`df5ab44e`): owner of `sae`, `test-6e881851`, `test-a73bee3e`, `test-f7ae4129`; member of `test-6ca4ec6e`. IU verified, campus `indianapolis`, `campus_set_at` null (unconfirmed).
- 19 users: 14 IU verified (7 at `indianapolis`, 7 campus-less), 5 unverified, **0 Purdue**. 12 have consent at `TERMS_VERSION` `2026-05-07`.
- 21 posts (20 published), 0 with `org_id`, no `posts.edited_at` column (max migration `20260916120000`). 0 `org_invite` / `org_request_approved` notifications. 0 tapped follows.

### 11.0 The live harness (every wave)

**Browser.** The signed-in gstack browser as Franky (live verification recipe). Phone checks: `browse viewport 375x812` BEFORE `goto`. Desktop: `browse viewport 1280x800`. Restore `1200x745` at the end. Checks "as B" run in a SECOND browser profile that Franky signed into as the §12 S0 account; agents never type a password. Screenshots and saved JSON go to `handoffs/wave-plan-verification/w<N>/` (gitignored).

**Deploy confirmed** before any check: `gh api repos/FrankyCazares-Vibe/vibe/commits/<sha>/status --jq '.statuses[] | select(.context=="Vercel") | .state'` → `success`, then `curl -s -o /dev/null -w '%{http_code}' https://www.connectvibe.app/` → `200`.

**The non-GET harness.** Save this as `$S/nonget-harness.js` (`$S` = the scratchpad) and install it with `browse eval $S/nonget-harness.js` BEFORE the first tap on every page. It blocks and records every same-origin non-GET, whatever sends it, and answers it from a canned table; nothing non-GET reaches production. Batch sections that carry their own snippet (E6, PH, B12, CM) may keep it; the assertions below use these names.
```js
(() => {
  if (window.__harness) return "already installed";
  window.__harness = 1;
  const KEY = "__nonGet";
  let prior = []; try { prior = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  window.__nonGet = prior; window.__telemetry = [];
  window.__canned = [];  // [METHOD, RegExp on pathname+search, status, body, delayMs?]
  window.__getOv = [];   // [RegExp on pathname+search, status, body | (realJson) => json]
  const BACKGROUND = [/^POST \/api\/me\/heartbeat$/, /^POST \/api\/posts\/[^/]+\/view$/, /^POST \/api\/me\/notifications\/mark-read$/];
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(window.__nonGet)); } catch {} };
  const res = (s, b) => new Response(b == null ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  const rec = (m, u, body) => {
    const url = new URL(String(u), location.href);
    if (url.origin !== location.origin) { window.__telemetry.push([m, url.host]); return null; }
    const path = url.pathname + url.search;
    const e = { m, path, body: typeof body === "string" ? body : body == null ? null : "[non-string]", bg: BACKGROUND.some((r) => r.test(m + " " + url.pathname)), t: Date.now() };
    window.__nonGet.push(e); save(); return e;
  };
  const real = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const u = input instanceof Request ? input.url : String(input);
    const m = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = new URL(u, location.href), path = url.pathname + url.search;
    if (m === "GET" || m === "HEAD") {
      const ov = window.__getOv.find(([re]) => re.test(path));
      if (!ov) return real(input, init);
      if (typeof ov[2] === "function") { const r = await real(input, init); return res(ov[1], ov[2](await r.json())); }
      return res(ov[1], ov[2]);
    }
    const e = rec(m, u, init.body);
    if (!e) return res(200, null);
    const c = window.__canned.find(([cm, re]) => cm === m && re.test(path));
    if (c && c[4]) await new Promise((r) => setTimeout(r, c[4]));
    return c ? res(c[2], c[3]) : e.bg ? new Response(null, { status: 204 }) : res(418, { ok: false, error: "blocked", code: "blocked" });
  };
  navigator.sendBeacon = (u, b) => { rec("BEACON", u, b); return true; };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__m = String(m).toUpperCase(); this.__u = u; return xo.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function (b) { if (this.__m !== "GET" && this.__m !== "HEAD") { rec(this.__m, this.__u, b); return this.abort(); } return xs.call(this, b); };
  document.addEventListener("submit", (ev) => { const f = ev.target; const m = String(f.method || "get").toUpperCase(); if (m !== "GET") { ev.preventDefault(); rec("FORM-" + m, f.action, null); } }, true);
  window.__unexpected = (allowed = []) => window.__nonGet.filter((e) => !e.bg && !allowed.some((re) => re.test(e.m + " " + e.path)));
  window.__resetLog = () => { window.__nonGet.length = 0; save(); };
  return "installed";
})();
```

Rules for using it:
- **Background writes** are still blocked, but they don't fail a check: `POST /api/me/heartbeat` (`CampusBanner`'s `beat()` in `campus-home.tsx`, on every `/campus` mount and every 30s; it writes only `users.last_active_at`), `POST /api/posts/<id>/view` (the view-ping effect in `PostViewerMobile.tsx`), and `POST /api/me/notifications/mark-read` (fired when the Otto panel opens, in `OttoSidePanel.tsx` and `_otto.js`). "Zero non-GET" in a check means `__unexpected().length === 0`; the G4 onboarding check (§11.1) is stricter and allows nothing, background included.
- **Telemetry.** Sentry envelopes (`src/instrumentation-client.ts:5`) are cross-origin: they land in `__telemetry`, are answered 200 and never counted.
- **Install timing.** A full `goto` or reload drops the wrapper; the log survives in `sessionStorage` for the tab. On pages that write on mount (every `/campus` page), install on another page first (`/settings` or `/profile`) and client-navigate with a click on the tab bar's `a[href="/campus"]`, or accept that the mount-time heartbeat reached prod and is visible in the network log (it's normal page traffic).
- **Second witness.** For every page visit, also read the browser network log (`read_network_requests`, or `browse network`) and filter to non-GET requests to `www.connectvibe.app`. Anything there that isn't a background write sent before install is a STOP: record it, don't retry, tell Franky.
- **iframes.** Desktop `/onboarding` iframes `/onboarding/classic` (`OnboardingSwitch.tsx:101`); desktop `/profile` lands on `/html/profile.html?app=1`; desktop `/messages` iframes `/html/messages.html?app=1`. Either load the frame URL top-level, or install inside the frame with `document.querySelector('iframe').contentWindow.eval(<file text>)` after it loads.
- **Refused probes.** A few checks send a deliberate non-GET that the server must refuse from state alone (401 / 400 / 403 / 404 / 409). They're listed by name per wave, sent once per wave as an explicit in-page `fetch` or `curl` (never by a tap), and use only rate-limit budget. If one answers 2xx, STOP and tell Franky what it may have written; agents don't undo it.

**The no-write fingerprint.** Run this read-only SQL before and after every agent walk; the two results must be identical. §12 seeds happen only between walks, never during one.
```sql
select (select count(*) from org_followers) followers, (select count(*) from org_follow_firsts) firsts,
  (select count(*) from org_members) members, (select count(*) from org_invites) invites,
  (select count(*) from org_join_requests) requests, (select count(*) from connections) connections,
  (select count(*) from notifications) notifs, (select count(*) from notifications where read_at is null) unread,
  (select count(*) from posts) posts, (select coalesce(sum(view_count),0) from posts) views,
  (select count(*) from users where campus_set_at is not null) campus_set,
  (select md5(concat_ws('|', name, handle, year, major, department, bio, avatar_url, interests::text, skills::text,
     looking_for::text, otto_answers::text, school_system, campus_id, campus_set_at::text))
     from users where id::text like 'df5ab44e%') franky_row;
```
At planning: `followers 7, firsts 7, members 7, invites 0, requests 0, connections 26, notifs 53, unread 15, posts 21, views 141, campus_set 0`. After G1, add `(select count(*) from posts where edited_at is not null) edited` (0 until §12 S4). `unread` and `views` also move when real students use the app; if only those two moved, compare `notifications.created_at` / the post ids against the walk window before calling it a write.

**Baseline, captured on the live `f23bc5d` build BEFORE wave 1 pushes** (as Franky, harness installed, into `handoffs/wave-plan-verification/baseline/`):
- `mine.json` = `GET /api/orgs?filter=mine`. Expected today: 5 rows, `sae` owner, `test-6ca4ec6e` member, `test-6e881851` / `test-a73bee3e` / `test-f7ae4129` owner, `hidden:true` on the four test clubs. Also `mine-ids.txt` = `jq -r '.orgs[] | "\(.id) \(.role) \(.hidden)"' mine.json | sort`.
- `discover.json` (`/api/orgs?filter=discover`), `feed-ids.txt` (`/api/feed?limit=50` post ids, in order), `notifications-ids.txt` (`/api/me/notifications`), `otto-activity-ids.txt` (`/api/me/otto`), `search-club.json` (`/api/search?q=club&kinds=orgs`, which today still returns the four hidden clubs).
- Screenshots: phone Chat tab (375×812), desktop chat rail and Orgs tab (1280), `/orgs/sae` at both widths, `/settings` at both widths.
- The fingerprint result.

### W1 · after wave 1 deploys (F1, B27, H1, F5a, E0)

Needs §12 S0 (the second account "B") for every "as B" line.

1. **B27, notifications read path** (as Franky, harness on):
   - `GET /api/me/notifications` → 200; ids equal `notifications-ids.txt`; every row has an `org_id` key and `org` (`null` on every live row); no row has `hidden_at`.
   - `GET /api/me/otto` → 200; activity ids equal `otto-activity-ids.txt`; `unreadActivityCount` unchanged.
   - Renderers, with `__getOv` entries that clone the real JSON and prepend two rows: `{type:"org_invite", org_id:"00000000-0000-4000-8000-0000000005ae", org:{handle:"sae", name:"SAE", logo_url:null}, actor:{name:"Franky Cazares", handle:<Franky's handle>}, read_at:null, created_at:<now>}` and the same with `type:"org_request_approved"`:
     - desktop `/campus` (1280), the Otto side panel opened from the bottom-right Otto corner (`OttoCorner` → `OttoSidePanel`): "Franky Cazares invited you to join SAE" and "Franky Cazares approved your request to join SAE"; clicking the first navigates to `/orgs/sae`. Opening the panel records `POST /api/me/notifications/mark-read` (background, blocked).
     - `/otto` (375×812): "Franky invited you to join SAE"; the row is a link to `/orgs/sae`.
     - `/html/profile.html?app=1` (1280), the `_otto.js` panel: the same two sentences; click → `/orgs/sae`.
     - Org name `<img src=x onerror="window.__xss=1">` in the `_otto.js` panel: literal text, `window.__xss === undefined`.
     - `org:null`: "invited you to join a club", click → `/campus?tab=orgs`.
     - On all three surfaces `/did something/.test(document.body.innerText) === false`.
2. **H1, live leaks:**
   - `curl -s -o /dev/null -w '%{http_code}' https://www.connectvibe.app/api/orgs/sae/channels` → `401`; `…/orgs/test-f7ae4129` → `404`; `…/orgs/sae` → `200`.
   - As Franky: `GET /api/orgs/sae/channels` → 200 with channels; `/orgs/test-f7ae4129` still renders (he owns it; the hidden gate admits members).
   - As B: `GET /api/orgs/sae/channels` → 403 `members_only`. `/orgs/sae` at 375 and 1280: no request to `/api/orgs/sae/channels` in the network log, no "Couldn't load this org's channels.", the line "Chats are for members.", a disabled "Invite only". `/orgs/test-f7ae4129` → 404 page, and the tab title is not "Finance Club" (or any test club name).
   - As B: `GET /api/search?q=club&kinds=orgs` returns none of Finance Club, CS Club, Private equity club, Kelley Floor - University Tower; `q=sae` returns SAE with `join_policy:"invite"`, `audience:"both"`.
   - Desktop `/campus` Orgs tab as B: SAE card and quick view show a disabled "Invite only". As Franky with a `__getOv` on `/api/orgs?filter=discover` setting SAE `role:null, join_state:"invited"`: "Accept invite".
3. **F1 refused probes** (one each):
   - As B: `fetch("/api/orgs/test-f7ae4129/follow",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})` → 404 `not_found`.
   - As Franky: `DELETE /api/orgs/sae/follow` → 409 `member_follows`. (A 200 here means his join follow row was deleted: STOP, Franky restores it with service SQL.)
   - As Franky: `DELETE /api/orgs/sae/followers/not-a-uuid` → 400 `invalid_user_id`; `DELETE /api/orgs/sae/followers/<Franky's full uuid>` → 409 `member_follows`.
   - `curl -s -X POST https://www.connectvibe.app/api/orgs/sae/follow` (no cookie) → 401 `unauthorized`.
4. **F1 reads:**
   - As Franky: `GET /api/orgs/sae/followers` → 200, one row with `member_role:"owner"`, `org_follow_source:"join"`, `follows_since` a raw timestamp with microseconds, `next_cursor:null`, `follower_count:1`. `?cursor=garbage` → 400 `invalid_cursor`.
   - As B: `GET /api/orgs/sae/followers` → 403 `officers_only`.
   - As Franky: `GET /api/me/followed-orgs` → 200, `orgs` is exactly `[sae]` with `org_follow_source:"join"`, `member_role:"owner"`; none of the four hidden clubs he joined appear. As B → `orgs:[]`.
5. **F5a and E0 (nothing mounted, nothing applied):** `git ls-tree -r --name-only origin/main src/components/orgs src/lib/orgs/join-copy.ts src/lib/orgs/following.ts src/lib/posts/edit.ts supabase/migrations/20260916130000_post_edited_at.sql` lists all of them. Read-only SQL: `select count(*) from information_schema.columns where table_schema='public' and table_name='posts' and column_name='edited_at'` → 0.
6. **Regression:** `GET /api/orgs?filter=mine` → `diff <(jq -S . mine.json) <(jq -S . now.json)` prints nothing. `/api/feed?limit=50` ids equal `feed-ids.txt` (unless a real student posted since; then the old ids are a subsequence). Desktop chat rail and phone Chat tab match the baseline screenshots. Fingerprint unchanged.

**Gate G1, between W1 and W2** (§4.3): Franky says yes; the orchestrator applies `20260916130000_post_edited_at.sql` and its `schema_migrations` row; then, read-only:
- E0's post-check: `has_column_privilege('authenticated','public.posts',c,'UPDATE')` is true for exactly `content`, `tags`, `status`; false for every other column, `edited_at` included; `anon` false everywhere. `select tgname from pg_trigger where tgname='posts_stamp_edited'` → 1 row. `select count(*) from posts where edited_at is not null` → 0.
- `GET /api/feed?limit=20` as Franky → 200 (W1 code doesn't select `edited_at` yet).
- By hand, Franky opens one post he hasn't opened today; the fingerprint's `views` goes up by 1 (`record_post_view` is SECURITY DEFINER and must still write through the new column lock).

### W2 · after wave 2 deploys (F2, F3, F4, E1, F6), including gate G2

1. **F2, org route fields** (harness on):
   - `filter=mine` as Franky: `diff <(jq -S . baseline/mine.json) <(jq -S . w2/mine.json)` prints nothing (F2 rule b).
   - `filter=discover` as Franky: every row has `org_follow_state` and `follower_count`; SAE `org_follow_state:"following"`, `follower_count:1` (owner sees the raw count), `member_count:1` (a number). As B: SAE `org_follow_state:"not_following"`, `follower_count:null` (1 < 5). No row has a key named `follow_state` or `viewer_follows`.
   - `filter=following` as Franky → `orgs` = `[sae]` with `role:"owner"`, `org_follow_state:"following"`; `has_more:false`; none of the four hidden clubs. As B → `orgs:[]`. `filter=following&campus=purdue-west-lafayette` as Franky → 403 `campus_not_in_system`.
   - `GET /api/orgs/sae` as Franky → `org.org_follow_state:"following"`, `org.org_follow_source:"join"`, `org.follower_count:1`; as B → `"not_following"`, `null`, `null`.
   - `curl -s https://www.connectvibe.app/api/orgs/sae/profile | jq '{c:.org.follower_count, f:.viewer.org_follow_state, j:.viewer.join_state}'` → all three null. `curl -s -o /dev/null -w '%{http_code}' https://www.connectvibe.app/api/orgs/test-f7ae4129/profile` → `404`.
2. **Gate G2:**
   - Refused probe as B: `POST /api/orgs/test-6ca4ec6e/follow` body `{}` → 404 `not_found` (a different hidden club from W1's probe, so both hidden-open clubs have been tried).
   - `filter=discover` rows carry `org_follow_state` (item 1). Both pass → W3 may push.
3. **F3, invite sheet list** (as Franky):
   - `GET /api/orgs/sae/invite-candidates` → 200 `source:"followers"`, `next_cursor:null`, `users:[]` (his own join row is excluded). After §12 S1: exactly one user, B, with `state:"none"`, `eligible:true`, `follows_since` set. After §12 S2: B's `state:"invited"`.
   - `?q=ab` → `source:"search"`, every row has a `follows_since` key (null for non-followers). `?source=followers&q=ab` → `source:"followers"`. `?cursor=garbage` → 400 `invalid_cursor`.
   - As B: `GET /api/orgs/test-6e881851/invite-candidates` → 404.
4. **F4, feed** (as Franky, then as B):
   - `/api/feed?limit=50` → 200; the ids equal the W1 list; every `post` has an `edited_at` key (null); every `post.org` is null (0 club posts); no object anywhere has `hidden_at`.
   - The page is not cut to 3 posts per author when several authors posted.
   - After §12 S3 (the real SAE post), as B: that post has `org` with exactly the keys `id, handle, name, logo_url, verified, is_public` (`handle:"sae"`, `name:"SAE"`, `verified:true`), where `logo_url` is `/api/orgs/sae/asset/logo` or an https URL, never a raw `orgs/…` key, and no `hidden_at`; the same post as Franky has the same `org`.
5. **E1, post reads** (as Franky): `GET /api/posts/<one of his post ids>`, `/api/me/posts`, `/api/users/<his handle>/posts` → every post carries `edited_at` (null). Refused probe: `curl -s -X PATCH -H 'content-type: application/json' -d '{"content":"x"}' https://www.connectvibe.app/api/posts/<that id>` (no cookie) → 401. Every positive PATCH path is localhost-against-§11.2 only, or §12 S4 by Franky.
6. **F6, org page** (harness on; F6's own acceptance has the full string list):
   - As B at 375 and 1280, `/orgs/sae`: "Follow" + disabled "Invite only" with "Officers invite members"; "Officers can see who follows this club."; notice "Invite only. Anyone can follow this club — officers add members."; channels card "Chats are for members. Officers invite members."; no `/api/orgs/sae/channels` request; handle line "@sae · 1 member"; Facts "Who can join: By invitation", "Open to: Anyone", no "Followers" row.
   - As B, with `__canned = [["POST", /^\/api\/orgs\/sae\/follow$/, 200, {ok:true, org_follow_state:"following", already:false, follower_count:null}, 800]]`: tap "Follow" → exactly one recorded `POST /api/orgs/sae/follow` with body `{"source":"profile"}`; the button reads "…" (`aria-busy="true"`) for the 800ms, never "Following ✓" before the answer. Then a full `goto` (drops the fake) and the page shows "Follow" again (nothing was written).
   - Signed out (fresh profile, no cookie): "Sign in to follow" with `href="/auth/login?next=%2Forgs%2Fsae"`.
   - As Franky: "Following ✓" disabled + "Members follow automatically" + "Joined ✓"; eyebrow "Officer tools"; first button "Invite people"; the sheet is a bottom sheet at 375 and a modal at 1280, opening on "Followers" with "Nobody follows SAE yet. Share the club's page — people who follow it show up here." (before §12 S1) or B's row with "Invite" (after S1); Edit details shows "Invite only" and "All of Indianapolis (IU + Purdue)"; edit only the description, Save → one recorded `PATCH /api/orgs/sae` whose body has no `join_policy` or `audience` key (answered 418; nothing saved).
   - The `invited` header, banner and "Decline" are server-rendered, so no override reaches them: they're checked as B after §12 S2 (see §12).
7. **Regression and fingerprint:** chat rail and phone Chat tab screenshots match the baseline; `__unexpected()` is empty on every page; fingerprint unchanged.

### W3 · after wave 3 deploys (E2, B12S, CH1, B14t, B15), including gate G3

1. **Gate G3:** `git ls-tree -r --name-only origin/main | rg -c 'src/components/mobile/(EditPostSheet|CampusConfirmBanner)\.tsx|src/components/mobile/onboarding/onb-copy\.ts|src/lib/onboarding/social-steps\.ts'` → 4. B12S's pieces are not mounted until W4, so they have no live check here.
2. **E2, phone post viewer** (375×812, as Franky; install the harness on `/profile`, then open his post from a card so the wrapper survives):
   - Own post, ⋯: "Send to chats", "Copy link", "Edit post", "Delete post". Someone else's post (open one from the feed): "Report", no "Edit post".
   - The view ping is recorded as background and blocked, so the fingerprint's `views` doesn't move.
   - "Edit post" opens the "Edit post" sheet; Save stays disabled until the text changes. With `__canned = [["PATCH", /^\/api\/posts\/[^/]+$/, 200, {ok:true, post:{id:"<that id>", content:"fixed #x", tags:["x"], edited_at:"2026-09-20T12:00:00.000Z"}}]]`: the body and chips update in place, the sub-line ends " · Edited", the toast reads "Post updated", and `Object.keys(JSON.parse(__nonGet.at(-1).body))` is exactly `["content"]` (no `tags`, no `status`).
   - A text-only post cleared to spaces: Save disabled, "Your post can't be empty.". An image post shows "You can change the words. The photo or video stays.".
   - PATCH canned 403 `{ok:false, error:"Accept the Terms", code:"terms_required"}`: toast "Accept the Terms first, then try again.", the sheet stays open with the draft.
   - Dirty: overlay tap and swipe-down do nothing; "Cancel" pushes "Discard your changes?" (stub `window.confirm` to record and return false).
3. **CH1, desktop campus home** (1280 unless noted, as Franky; harness installed on `/settings`, then client-navigate):
   - Banner title "Indianapolis", monogram "IN", neutral colour (not IU crimson), sub-label "IU + Purdue · one community"; stats "{n} at Indianapolis · {m} active now".
   - `/\bIU\b/.test` over the eyebrow and subtitle nodes of Feed, Events, Orgs and Map → false; the eyebrows read "Feed · Indianapolis", "Events · Indianapolis", "Organizations · Indianapolis", "Campus · Indianapolis".
   - `__getOv` on `/api/campuses` returning `{ok:true, system:"iu", currentCampusId:null, campuses:[]}` on a fresh load → the strip "Pick your campus to see its clubs, events and map." with "Pick campus →" linking to `/settings#campus`. A 500 override → banner title "Vibe", and no "· IU" anywhere.
   - 375×812 phone `/campus`: the shared `CampusBanner` fits on one line and ellipsizes.
   - Feed edit on his own row with the PATCH canned as in item 2: the inline editor opens, Save updates the text, `#x` and " · Edited" with no new `/api/feed` GET; canned 400 / 429 / 500 keep the editor open; Escape on unchanged text closes silently; a row by someone else shows "Report" and no "Edit post".
   - Tour replay: `localStorage.removeItem("vibe_campus_tour_seen_v1")`, `goto /campus?welcome=1`; the feed bubble reads "What students at Indianapolis are posting. People and clubs you follow rise to the top."; the last button is "Got it"; after it, the URL is `/campus` with no `welcome`, and there's no navigation to `/network`.
4. **B14t, phone tour and People** (375×812):
   - Tour: remove ONLY `localStorage.vibe_campus_tour_seen_v1`, `goto /campus?welcome=1`: three bubbles; the second reads "What students at Indianapolis are posting. People and clubs you follow rise to the top."; "Got it" ends with no navigation to `/network`; afterwards `localStorage.vibe_campus_tour_seen_v1 === "1"` and `welcome=1` is gone.
   - With `__getOv` on `/api/me/onboarding-state` returning 500 (installed before the soft navigation): the fallback body "What students on your campus are posting. People and clubs you follow rise to the top.".
   - `/network` Discover with a `__getOv` on `/api/me/suggested-connections` returning one row per `reason_v2` (with `campus_id:"indianapolis"` and `school_system:"purdue"` on the `same_system` row): group headers in order "From your clubs", "At Indianapolis", "Same major", "Friends of friends", "Elsewhere at Purdue", "New on Vibe"; the row buttons read "Follow", never "Connect".
5. **B15, Settings** (as Franky, harness installed before the first tap):
   - 375×812 and 1280 screenshots of `/settings`. The campus card is in confirm mode (his `campus_set_at` is null): "Confirm your campus", "Is Indianapolis still right?", buttons "Yes" and "Change"; the select has no "Not set" option.
   - Tap "Yes" → exactly one recorded `PATCH /api/me/profile` with body `{"campus_id":"indianapolis"}`, answered 418 → the card stays unconfirmed and shows an error line; `campus_set` in the fingerprint stays 0. Franky must NOT tap Yes for real before W5 is verified (§12 S7).
   - Sign-out draft clear: `localStorage.setItem("vibe_onb_draft_v1:probe", "{}")`; `__canned = [["POST", /^\/api\/auth\/logout$/, 200, {ok:true}]]`; tap "Sign out" → one recorded `POST /api/auth/logout`, the page navigates away from `/settings` (to `/auth/login`, which may bounce a still-signed-in browser onward), and on the page it lands on `Object.keys(localStorage).filter(k => k.startsWith("vibe_onb_draft_v1:"))` is empty. The real session is untouched (the logout was faked): `goto /settings` still renders signed in.
   - "Replay tour" card copy: "Walk through vibe again with Otto. Takes about a minute."
6. **Fingerprint** unchanged; `__unexpected()` empty on every page.

### 11.1 W4 · onboarding replay (gate G4) and the rest of wave 4 (B12, B13, CM, CH2, PM)

Gate G4 is items 1–4. All four pass before W5 pushes. Items 1–2 run as Franky first; they're repeated as B once §12 S1 + S2 exist, and as the Purdue account once §12 S6 exists.

1. **G4.1 · phone replay records zero non-GET requests** (375×812, `browse viewport 375x812` before `goto`).
   - Before: run the fingerprint; save `Object.keys(localStorage).filter(k => /^vibe_onb_draft_v1:|^vibe_tour_pending$|^vibe_campus_tour_seen_v1$/.test(k))` and the values.
   - `goto https://www.connectvibe.app/onboarding?replay=1`; wait until the pinned header shows "1 of 6"; install the harness; `__resetLog()`. The replay page sends nothing before the first tap (B12 item 4), and the network log over the load proves it: no non-GET to `www.connectvibe.app`.
   - All six steps render. Walk them with the footer, then header Back 3→2, `history.back()` 5→4, and forward again:
     - step 1: h1 "i'm otto.", CTA "Let's go →"
     - step 2: h2 "which campus is yours?"
     - step 3: h2 "let's pin down your profile"
     - step 4: h2 "put a face to the name"
     - step 5: h2 "Follow clubs"
     - step 6: h2 "follow a few people", CTA "Finish →"
     - the header reads "{n} of 6" and the "REPLAY MODE" pill shows on every step
   - Back and Skip always visible: on each step, after `window.scrollTo(0, document.body.scrollHeight)`, `document.querySelector("header").getBoundingClientRect().top === 0`; the Back button is `visibility: hidden` on step 1 only and visible on 2–6; Skip is visible on all six, and both buttons measure at least 44×44 (`getBoundingClientRect`).
   - No "Skip to resume": `/Skip to resume|then your documents|photo, banner/.test(document.body.innerText) === false` on every step.
   - Campus picker is system-aware (ac014a3 must not regress). As Franky (IU):
     - the radiogroup's cards, in order: Indianapolis, Fort Wayne, Bloomington, Columbus, East, Kokomo, Northwest, South Bend, Southeast (`campusesForSystem("iu")`, `campuses.ts:217-226`); no West Lafayette
     - every card except Indianapolis carries the "not open yet" pill
     - Indianapolis's sub-line reads "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"; no card has the "from your school email" tag
     - no card starts checked (his `campus_set_at` is null)
     - the note reads "Your school email shows you're at IU. You can move to another IU campus later in Settings."
     - "Continue →" with nothing picked shows "Pick your campus to continue." and stays on step 2
     - "Purdue student with an IU email? Verify your @purdue.edu instead" shows only while Indianapolis is picked
   - Tap everything B12's live replay check lists (every card, the Purdue panel's Send and Verify with `x@purdue.edu` / `12345678`, profile fields and handle edits, Choose a photo → crop → Confirm, the club control, one person Follow, Share, both skip-sheet variants, Keep going), then Finish last.
   - Clubs, real data: one row, SAE: disabled "Joined ✓", sub "Members follow automatically", meta "@sae · Invite only", no chip, no "Officers can see who follows this club.", footer "Continue →".
   - After Finish lands on `/campus`: `JSON.parse(sessionStorage.getItem("__nonGet") || "[]").length === 0`. This count allows NOTHING, background included (the log only covers the onboarding page; the `/campus` heartbeat after landing is ordinary page traffic and isn't in it).
   - Network witness for the whole walk: the only requests to `www.connectvibe.app` are GETs. In particular no `/api/me/onboarding-step`, `/api/me/onboarding-complete`, `/api/orgs/*/follow`, `/api/orgs/*/join`, `/api/me/follow`, `/api/auth/school-email/*`, avatar upload, or `/api/me/profile*` request of any method. Exactly one GET each of `/api/orgs?filter=discover` and `/api/me/suggested-connections?limit=25`.
   - After: the fingerprint is identical (including `franky_row`, which proves no step save and no Finish); the saved localStorage keys and values are identical (replay writes no draft and no `vibe_tour_pending`).
2. **G4.2 · desktop replay records zero non-GET requests** (1280×800).
   - `goto https://www.connectvibe.app/onboarding?replay=1`: the page renders one iframe whose `src` is `/onboarding/classic?replay=1` (`OnboardingSwitch.tsx:101`), and the parent page sends no non-GET.
   - `goto https://www.connectvibe.app/onboarding/classic?replay=1` top-level (so the harness sits in the page that sends requests); install; `__resetLog()`.
   - All six steps: `.onb-step[data-step="n"]` becomes `.active` for n = 1…6; `#progressText` reads "{n} of 6"; six `.dot`s; the same h1/h2 texts as item 1.
   - Back and Skip: `#onbBack` is `visibility: hidden` on step 1 only; `#onbSkip` is visible and enabled on all six; both at least 44×44; the header bar stays at the top after scrolling each step.
   - `document.body.innerText` never matches `/Skip to resume|Maybe later|then your documents/`.
   - Campus: `#onbCampusGroup .campus-card` titles in the same IU order as item 1; `.campus-soon` "not open yet" on every card but Indianapolis; no `input[name="onb-campus"]:checked` on arrival; the note with "IU". The Purdue link is not rendered in replay on desktop (B13 renders it only when `!IS_REPLAY`); that difference from the phone is expected.
   - Escaping: with a `__getOv` on `/api/orgs?filter=discover` returning one row named `<img src=x onerror="window.__xss=1">` (set before entering step 5), the row shows that literal text and `window.__xss === undefined`. Then remove the override and reload.
   - Walk and tap as in item 1, then Finish. `JSON.parse(sessionStorage.getItem("__nonGet") || "[]").length === 0` (read it before the page leaves, or on the landing page in the same tab); the network witness shows only GETs; the fingerprint and the localStorage keys are unchanged.
3. **G4.3 · `filter=mine` unchanged.**
   - As Franky: `jq -r '.orgs[] | "\(.id) \(.role) \(.hidden)"' w4/mine.json | sort | diff baseline/mine-ids.txt -` prints nothing.
   - On `origin/main`: `rg -c "filter=mine" src/app/campus/campus-home.tsx` → 2 (the chat rail load in `CampusHome`, the post-as-club picker); `rg -c "filter=mine" src/components/mobile/CampusMobile.tsx` → 1 (inside `ChatPane`); `rg -n "filter=mine" public/html/onboarding.html src/components/mobile/onboarding src/components/orgs` → nothing.
   - The desktop chat rail and the phone Chat tab list the same clubs as the baseline screenshots.
4. **G4.4 · CH2 is on `main`:** `git show origin/main:src/app/campus/campus-home.tsx | rg -c "<OrgJoinControl"` → 2, and `rg -c "discoverJoinLabel"` on the same blob → 0.
5. **Replay as B** (after §12 S1 + S2, invite still pending), items 1–2 repeated in B's browser profile: the fingerprint and B's localStorage keys are unchanged, and zero non-GETs are recorded. Clubs step real data: SAE is the first row with chip "Invited you", sub "Invited by Franky · Expires {Mon D}", one filled "Accept"; tapping it in replay turns the row into a disabled "Joined ✓" locally, with no request. The campus step shows B's own university's list, with nothing preselected unless B's campus is confirmed.
6. **Purdue account** (after §12 S6; its first run is real, so the Purdue tester does the non-replay walk by hand, and the agent checks a later `/onboarding?replay=1` for that account at 375 and 1280): campus cards Indianapolis, Fort Wayne, West Lafayette, Northwest, in that order (`campuses.ts:217-218`, `:228-229`), with no IU-only campus; the Otto line "“your school email says Purdue. pick your campus. Indianapolis is shared with IU students.”"; Indianapolis's sub-line "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)"; no "Verify your @purdue.edu instead" link. With no Purdue account, this stays a localhost check against the §11.2 seed, and the live G4 proves IU only.
7. **CM, phone Orgs tab and feed** (375×812; CM's acceptance has the full list):
   - As Franky, real data: one GET each of `/api/orgs?filter=discover`, `/api/orgs?filter=following`, `/api/me/org-invites`; SAE under "FOLLOWING" with "Joined ✓", "@sae · Invite only · 1 member", no chip, no disclosure; footer "Clubs are just getting started at Indianapolis. Follow the ones you like — posts land in your feed."; no nested interactive elements in the Orgs pane.
   - The confirm banner shows for Franky: "Confirm your campus", "Is Indianapolis still right?". Tapping "Yes" records one `PATCH /api/me/profile` `{"campus_id":"indianapolis"}` (blocked); `campus_set` stays 0.
   - As B after §12 S1 + S2: "YOU'RE INVITED" holds SAE with chip "Invited you" and "Accept"; SAE appears nowhere else. After the §12 S2 close-out (B declines): SAE moves under "FOLLOWING" with "Following ✓", meta "@sae · Invite only · 1 member" (B never joins), and the line "Officers can see who follows this club.".
   - Feed card ⋯ on Franky's own post: "Edit post" only (no Delete, Q19); edit with the PATCH canned as in W3 item 2 updates the card text and " · Edited" with no `/api/feed` refetch. After §12 S4, the really edited post's card shows " · Edited" with no override.
8. **CH2, desktop Orgs tab** (1280; CH2's acceptance has the override matrix): as Franky, real data per CH2 item 1 (SAE under "Yours" with "Joined ✓" and the owner chip, no "You're invited" group, `/\bfollowers?\b/i` absent from the tab). As B after §12 S1 + S2: "You're invited" first, SAE with "Invited you", "Invited by Franky · Expires {Mon D}", "Accept invite" + "Decline", and SAE absent from "Verified". Tapping "Accept invite" as B with `__canned` for `POST /api/orgs/sae/join` → `{ok:true, joined:true, role:"member"}` flips the card locally and records `{}` as the body; nothing is written.
9. **PM, phone profile** (375×812; PM's acceptance has the picker matrix): every own card has a ⋯ (`[aria-label="Post actions"]`); `document.querySelectorAll("button button").length === 0`; ⋯ opens "Edit post / Delete post / Cancel" without opening the viewer; an edit with the PATCH canned updates the card and fires no `/api/me/posts` GET. The campus select as Franky: Indianapolis first, "Fort Wayne — not open yet" next, no "not set" option. After §12 S4, the edited post's card shows " · Edited" with no override.
10. **Fingerprint** unchanged across items 5–9; `__unexpected()` empty on every page except for the deliberately canned taps named above.

### W5 · after wave 5 deploys (CH3, PH, E6, B20, B21)

1. **CH3, desktop officer settings** (1280, as Franky, `/campus?tab=chat`, harness installed before the first click, `window.confirm` / `window.prompt` stubbed to record and return false / null; CH3's acceptance has the full walk):
   - SAE settings tabs "Overview · Channels · Members · Followers · Invites · Requests · Danger"; Overview has "Invite only" and "All of Indianapolis (IU + Purdue)" `aria-checked="true"`.
   - Followers, real data. Before §12 S1: "1 follower", one row (Franky) with the "Member" pill and no "Remove". After S1: `GET /api/orgs/sae/followers?limit=30` → 200, header "2 followers", rows in server order (B first, newest `first_followed_at`), B's row has "Follows since {Mon D}" and "Remove", Franky's row has "Member" and no "Remove". "Remove" on B with confirm returning false records nothing; with `window.confirm = () => true` and `__canned` for `DELETE /api/orgs/sae/followers/<B uuid>` → `{ok:true, removed:true, follower_count:1}`, the row disappears, the header reads "1 follower", toast "Follower removed", and a full reload shows B again (nothing was removed).
   - Invites tab after §12 S2 (still pending): the inline sheet lists B under "Followers" with a disabled "Invited", and "Pending invites (1)" with "Invited {relative} by Franky" and "Revoke" (tap it with confirm false: nothing recorded).
   - Hidden `test-6e881851` (owner): no Invites tab; read-only "Who can join: By request". Hidden `test-6ca4ec6e` (member): tabs "Overview · Members · Danger"; "Leave org" records only the confirm text and no DELETE.
   - Create: the recorded `POST /api/orgs` body has `join_policy:"open"`, `audience:"both"` and no `is_public`; it's blocked, so nothing is created.
2. **E6, desktop post viewer** (`/profile` → `/html/profile.html?app=1`, 1280; install inside that page; E6's wrapper or this harness):
   - Own post ⋯: "Edit post", then "Delete post". Someone else's post: Report / Mute / Block, no Edit.
   - With the PATCH canned `{ok:true, post:{id, content:"hi #New @<Franky's handle>", tags:["new"], edited_at:"2026-09-20T12:00:00.000Z", media_url:null}}`: the body re-renders with the mention link and "#new", `#vpvSub` ends "· Edited", toast "Post updated", exactly one `vibe:post-edited` event, and the recorded body's keys are `["content"]`.
   - After §12 S4, opening the really edited post shows "· Edited" in `#vpvSub` with no override.
3. **PH, desktop profile page** (same page; PH's acceptance has the picker matrix):
   - Edit shows the campus select on "Indianapolis" with "Fort Wayne — not open yet" next and no "Not set"; a bio-only save records a `POST /api/me/profile-sync` body with no `campus_id` and no `school`.
   - `window.dispatchEvent(new CustomEvent("vibe:post-edited", {detail:{id:"<own post id>", content:"<img src=x onerror=alert(1)> fixed #fresh", tags:["fresh"], edited_at:new Date().toISOString()}}))` → the Posts card and its All-tab clone show the literal text, "#fresh" and " · Edited"; no alert; `__unexpected()` stays empty. Reload repaints the real text.
   - After §12 S4: the edited post's card date reads "… · Edited" from `/api/me/posts` with no override; `/profile/<Franky's handle>` from B's profile shows the same.
   - Fake calendar events: after seeding `localStorage.vibe_cal_events_v1` with PH's fixture and reloading, only "Study group" remains, and a second reload writes nothing new.
4. **B20:** landing `/` at 375 and 1280: `[...document.querySelectorAll('.vibe-landing-schools > span')].map(s => s.textContent)` → `["IU","·","Purdue","live"]`, no hydration warning in the console. The phone map halo colours and the `/messages` calendar purge per B20's acceptance (storage only; restore `vibe_cal_events_v1` afterwards).
5. **B21, local only:** nothing deploys. `git diff --name-only <W4 sha> origin/main -- src/app/legal src/lib/legal` → nothing; `curl -s https://www.connectvibe.app/legal/terms | rg -c "Monroe County"` → at least 1 (the live Terms are unchanged, Q23); `TERMS_VERSION` on `main` is still `2026-05-07`.
6. **Close-out after W5:** fingerprint unchanged; then run feature-sentinel and security-sentinel (read-only, per the `audit-sentinels` skill) against the W5 `main`, before the onboarding walkthrough and testers.

### 11.2 Branch and local seed (for the positive paths agents can't run on production)

F1, F3, F4, E1 and F6 point here (F1 still says "§7.2 seed"; it means this list). Build it on a Supabase branch or a local stack (`supabase start`, then every migration through `20260916130000`). Never on production, and never through the management API used for prod migrations. Rows are written with the service role; the app runs on `localhost:3000` against it.

- **Accounts** (all with consent at `TERMS_VERSION`): `O` owner (IU verified, `indianapolis`, `campus_set_at` set); `AD` admin and `MD` mod of `sae-copy`; `F` IU verified, non-member, home campus `iu-bloomington` (set directly in SQL, so no picker write, `campus_change_too_soon` or 30-day lock is involved); `P` Purdue student with `school_verified=false`, non-member; `PV` Purdue verified at `indianapolis`; `T` without consent; `BL` who blocked `O`; `MU` whom `O` muted; `R` IU verified who will request.
- **Clubs:** `sae-copy` (invite, both, `indianapolis`, verified, owner `O`, logo key `orgs/…`); `open-club` (open, both, `indianapolis`); `request-club` (request, `audience='iu'`); `hidden-club` (`hidden_at` set, `O` a member).
- **Follows:** `F` follows `sae-copy` and `hidden-club` (source `profile`; the `hidden-club` row stands for a follow made before the club was hidden); `BL` and `MU` follow `sae-copy`; 60 extra accounts follow `sae-copy` with ONE shared `first_followed_at` (write their `org_follow_firsts` rows first with one timestamp, then insert the `org_followers` rows; the stamp trigger copies it); one account follows `sae-copy`, then joins it (follow-then-join).
- **Posts:** `O` posts as `sae-copy` (`org_id` set) and as `hidden-club`; `O` has a text-only post containing `#hello`, an image post, and a draft.
- **Invites and requests:** a pending `org_invites` row `sae-copy` → `F`; a pending `org_join_requests` row `request-club` ← `R`; a declined invite for a third account inside the cooldown.
- **What it unlocks:** F1's follow/unfollow/429/Terms/removal/60-row paging cases; F3's blocked, follow-then-join and 45-row paging cases; F4's off-campus follow (viewer `F`), hidden-club `org:null` and forced-failure cases; E1's PATCH matrix, mention-once and the PostgREST column-lock probe; F6's `invited`, `can_join` (`open-club`) and `member` headers at 375×812 and 1280; the onboarding Purdue picker (`PV`); and the visiting request copy (`F`, home campus `iu-bloomington`, on `open-club`: both campuses set and different, `join-state.ts:258`).

**Do not touch (all of §11):** production data of any kind. No follow, unfollow, join, accept, decline, invite, revoke, approve, follower removal, campus save, profile save, onboarding step save, Finish, Skip, photo upload, post edit or post delete reaches `www.connectvibe.app` from an agent; no Purdue switch panel submit (it sends a real email); no `browse restart` (it loses Franky's cookie); no SQL other than read-only `select`s that never name `email` or `school_email` (G1's migration apply is the orchestrator's gate step with Franky's yes, not part of a walk).

---

## 12. Seeding

Every new branch in this plan has run on zero live rows: 0 tapped follows, 0 invites, 0 join requests, 0 club posts, 0 post edits, 0 Purdue accounts. Agents never write to production (§4.1 rule 2), and the founder rule is that content must be real: no fake clubs, no fake posts, no unhiding a test club to borrow its data. So the rows below are made by Franky, by hand, through the shipped UI, between agent walks (never during one). After each seed, the orchestrator re-runs the §11.0 fingerprint and records the new numbers as the baseline for the next walk.

**Owns:** nothing in the repo. Every row below is written by Franky (or the named real person) through the shipped UI.
**Depends on:** the wave named in each row's "When" deployed and its §11 walk passed.

| # | What Franky does | When | Rows it adds |
|---|---|---|---|
| S0 | Sign a second browser profile into a second, non-member account ("B") | before the W1 walk | none |
| S1 | As B, tap Follow on `/orgs/sae` | after the W2 walk passes | 1 `org_followers` (`profile`), 1 `org_follow_firsts` |
| S2 | As Franky, invite B from "Invite people" → Followers; B leaves it pending until the W5 walk, then declines | after S1 | 1 `org_invites` (pending), 1 `org_invite` notification |
| S3 | As Franky, post one real SAE post as the club | after the W2 walk passes | 1 `posts` row with `org_id` = SAE |
| S4 | As Franky, edit his own post: once without a new @mention, once adding one | after the W3 walk passes | `edited_at` set on 1–2 posts; exactly 1 `mention` notification |
| S5 | Request-to-join club: nothing to seed today | when a real officer makes one | 1 `org_join_requests` row, then 1 `org_request_approved` notification |
| S6 | A real Purdue tester signs up and onboards | after G4 passes | 1 user, `school_system='purdue'` |
| S7 | Hold-offs: things Franky must NOT do until the W5 walk is done | throughout | none |

### S0 · a second, non-member account ("B")

- **What:** an account Franky already holds the login for, school-verified (IU), with consent at `TERMS_VERSION` and no club memberships, signed in to a second gstack/Chromium profile so Franky's own cookie stays in the first. Read-only SQL shows `ec07943e` fits (IU verified, `indianapolis`, consent `2026-05-07`, member of nothing); Franky confirms he holds it, or picks another account with the same four facts. Don't use a real student's account.
- **Why:** every "non-member" branch needs a signed-in viewer who isn't in SAE, and Franky is SAE's owner and a member of all four hidden clubs. B must be verified, or S2's invite is refused as "They haven't verified a school email yet.".
- **Unlocks:** W1 items 2 (403 `members_only`, the non-member `/orgs/sae`, the hidden-club 404, search) and 3–4 (the non-member probes, `officers_only`, B's empty `/api/me/followed-orgs`); W2 items 1–2 (B's `not_following` / null count, the G2 hidden-follow probe) and 6 (the non-member org page and the canned Follow tap); §11.1 item 5.

### S1 · B follows SAE

- **What:** as B, open `/orgs/sae` and tap "Follow" once. Don't unfollow afterwards (the optional C15 check below is the exception).
- **Check it landed** (read-only SQL): `select source, first_followed_at is not null from org_followers where org_id = (select id from orgs where handle='sae') and left(user_id::text,8) = '<B>'` → one row, `profile`, true. Fingerprint `followers` +1, `firsts` +1.
- **Optional C15 check:** as B, tap "Following ✓" (unfollow), then "Follow" again. `org_follow_firsts.first_followed_at` for B is unchanged, and so is `org_followers.first_followed_at`.
- **Why:** it's the first real tapped follow, and the only way officers ever see a non-member follower.
- **Unlocks:** F1 POST `already:false` on real data; F2 SAE `follower_count:2` for Franky and still null for B (2 < 5), and `filter=following` returning SAE with `role:null` for B; F3's followers list with B (`state:"none"`, `eligible:true`, `follows_since`) (W2 item 3); F6's invite sheet showing B instead of the empty copy (W2 item 6); CH3's "2 followers", B's "Follows since" and "Remove" (W5 item 1); CM's and CH2's "FOLLOWING" row for B; the `org_follow_source:"profile"` value on `GET /api/orgs/sae` as B.

### S2 · a real invite to B, left pending, then declined

- **What:** as Franky, on `/orgs/sae` → "Invite people", B shows under "Followers"; tap "Invite" (toast "Invite sent"). Don't tap "Undo". B leaves it pending through the W5 walk. After W5 item 1 is recorded, B opens `/orgs/sae` and taps "Decline" (confirm OK).
- **Check it landed** (read-only SQL): `select status, left(invited_by::text,8) from org_invites where org_id = (select id from orgs where handle='sae')` → `pending`, `df5ab44e`; `select read_at is null from notifications where type='org_invite' and left(user_id::text,8)='<B>'` → true. After the decline: `status` = `declined`, and B's `org_followers` row is still there.
- **Checks only this seed makes possible** (as B, harness on so opening the Otto panel doesn't mark the row read):
  - B27 on a real row: the desktop Otto panel reads "{Franky's name} invited you to join SAE", `/otto` reads "{first name} invited you to join SAE", the `_otto.js` panel reads the same; each opens `/orgs/sae`.
  - `/orgs/sae` is server-rendered, so no fetch override can fake `invited`: at 375 and 1280, the banner "You're invited to join SAE" with "Invited by Franky · Expires {Mon D}", "Accept invite" + "Decline", the chip "Invited you", and the channels line "Chats are for members. Accept the invite to start talking.". Taps stay canned (`POST /api/orgs/sae/join`, `POST /api/me/org-invites/<id>`).
  - After the decline: F3 lists B with a disabled "Declined" and "You can invite again {Mon D}"; CM and CH2 move SAE under "FOLLOWING" / "Yours" for B.
- **Why decline, not accept:** B is a test account. Accepting would publish "@sae · 2 members" with a fake member. The accept path runs on the first real SAE invite (the one §1 says Franky sends) to a real brother, who accepts on his own. Read-only follow-ups after that: `org_members` +1 with role `member`; his `org_followers` row exists (`join`, or his earlier tapped source if he followed first); his `org_invite` notification has `read_at` set; `/orgs/sae` reads "@sae · 2 members"; Franky's CH3 Followers tab shows him with "Member" and no "Remove".
- **Unlocks:** W2 item 6's `invited` header (the only live proof of H1's and F6's "Accept invite"); B27 on real rows; F3's `invited` row and "Pending invites (1)" (W2 item 3, W5 item 1); §11.1 items 5, 7 and 8 ("Invited you" in onboarding, CM and CH2); after the decline, F5a's decline path and F3's `declined_recently`.

### S3 · one real SAE post

- **What:** as Franky on desktop `/campus`, write a real SAE post (an actual announcement, with one `#tag`), pick SAE in the post-as-club picker, publish.
- **Check it landed:** `select count(*), bool_and(status='published') from posts where org_id = (select id from orgs where handle='sae')` → 1, true. SAE's "Last activity" moves (the `bump_org_activity_on_post` trigger); that's expected.
- **Why:** 0 club posts exist, so F4's service-client attribution, `feedDiversityKey`'s `org:` key and every club-name render on a feed card have never run.
- **Unlocks:** W2 item 4's `org` object check as B and as Franky; the club name on the phone feed card (CM) and the desktop feed row (CH1); "only the author can edit a club post" (Franky sees "Edit post" on it, B sees "Report").
- **Still branch-only (§11.2):** a follow bringing in a club post from another campus (B is at Indianapolis, so the campus rule shows B the post either way, and moving B's campus would stamp `campus_set_at`), and a hidden club's post rendering with `org:null`.

### S4 · the first real post edits

- **What:** after the W3 walk passes, on ONE of Franky's own published text posts that has no @mention today (read-only SQL shows two such posts):
  1. Phone `/posts/<id>` → ⋯ → "Edit post": reword it and add a `#tag`. No new @mention. Save.
  2. Desktop `/campus` feed row → ⋯ → "Edit post" on the same post (if it isn't in his first feed page, use the phone viewer again): add `@<B's handle>`. Save.
  3. Same post: delete that @mention and save; add it back and save.
  Mention only B, never a real student: a mention sends a notification.
- **Check after each step** (read-only SQL, `<id>` = that post):
  1. `select edited_at is not null, tags from posts where id = '<id>'` → true, the new tag lowercased; `select count(*) from notifications where type='mention' and post_id='<id>'` → unchanged.
  2. That mention count +1, and `select count(*) from notifications where type='mention' and post_id='<id>' and left(actor_id::text,8)='df5ab44e' and left(user_id::text,8)='<B>'` → 1; `edited_at` moved forward.
  3. The same count → still 1 after both saves.
  Then `select count(*) from posts where edited_at is not null` → 1. Optionally edit the S3 SAE post's text once as well (proves a club post edits and keeps its `org_id`); the count becomes 2.
- Don't edit his draft or his clips: drafts never stamp "Edited", and video posts are parked.
- **Why:** E0's trigger and column lock and E1's mention-once rule have never touched a real row, and every " · Edited" check needs one.
- **Unlocks:** W3 items 2–3 without overrides (the E2 viewer sub-line, the CH1 feed row); §11.1 items 7 and 9 (the CM feed card and PM profile card " · Edited"); W5 items 2–3 (E6's `#vpvSub`, PH's card and `/profile/<handle>` through `/api/users/[handle]/posts`). PM and E6 compare `count(*) where edited_at is not null` before and after their own runs, so S4 never happens during one.

### S5 · a request-to-join club: none to seed today

- **Today:** SAE is invite-only, and the only request clubs (`test-6e881851`, `test-a73bee3e`) are hidden test clubs. Don't unhide one, don't create a club to test with, and don't switch SAE's "Who can join" (that changes a real club's rules for real students).
- **Coverage until then:** the overrides in CH2 item 3, CM's R3 row and CH3's pending-requests line, plus §11.2 (`request-club`, `R`).
- **When real officers create a real request club:** a consenting student taps "Follow" then "Request to join"; the officer approves in CH3's Requests tab or from the invite sheet's "Approve request". Read-only checks: the `org_join_requests` row goes `pending` → `approved`; before approval the student's CM / CH2 meta includes "Requested"; after it, the student's three Otto renderers read "{officer} approved your request to join {club}" and open `/orgs/<handle>`; the officer's sheet row reads "Member"; the onboarding clubs step, replayed by another student, shows that club with "Follow" and never "Request".
- **Unlocks:** B27's `org_request_approved` on a real row; F5a's approve path; CH3's Requests rows; Q5's follow-first rule on real data.

### S6 · a Purdue test account

- **Today:** 0 Purdue accounts (`select school_system, count(*) from users group by 1`).
- **What:** a real person with a real @purdue.edu inbox (a consenting Purdue Indianapolis student or tester) signs up, verifies that address, and does the real, non-replay onboarding on their own phone while Franky watches. No aliases, no borrowed domains, no agent-made account. After G4 passes and before testers.
- **Check it landed:** `select school_system, school_verified, campus_id from users where school_system = 'purdue'` → one row `purdue`, true, `indianapolis`. No emails selected.
- **Why:** G4 proves the system-aware picker (ac014a3) only for IU, because the onboarding boot is server-rendered and no fetch override can make Franky a Purdue student. Every Purdue list in this plan (onboarding, Settings, the phone and desktop profile pickers) is otherwise override-only.
- **Unlocks:** §11.1 item 6 on live data; PM, PH and B15 Purdue options without overrides (Indianapolis, "Fort Wayne — not open yet", "West Lafayette — not open yet", "Northwest — not open yet"); the People step's "At Indianapolis" group mixing IU and Purdue students; F1's "no audience check" on a real follow if the tester chooses to follow SAE; F3 `eligible:true` for a Purdue student on an `audience='both'` club.
- **Still not live after S6:** the IU → Purdue switch panel (Q8) needs one person with both an @iu.edu and a @purdue.edu inbox and sends a real email, so it stays on localhost against §11.2 unless such a student volunteers. No club has `audience` `iu` or `purdue`, so `audience_blocked` stays override-only.

### S7 · hold-offs until the W5 walk is recorded

- Franky doesn't tap "Yes" on the campus confirm banner or in Settings, and doesn't change his campus. Any campus write stamps `campus_set_at`, starts the 30-day lock, removes the confirm banner that W3 item 5 and §11.1 item 7 expect, and changes §11.1 item 1's "no card starts checked".
- Franky doesn't join, leave or change a role in any club, and doesn't unhide a test club: G4.3 compares his `filter=mine` with the `f23bc5d` baseline.
- B doesn't accept or decline the S2 invite, and doesn't unfollow SAE, until W5 item 1 is recorded.
- Nobody finishes a real (non-replay) onboarding on Franky's account: Finish rewrites `otto_answers` and breaks the fingerprint's `franky_row`.
- If a seed has to happen out of order, re-run the fingerprint, note which §11 expectations moved (the table above lists the rows each seed adds), and tell the orchestrator before the next walk.

**Do not touch (all of §12):** no fake clubs, posts or members; no unhiding a test club; no change to SAE's "Who can join" or "Open to"; no agent-driven seed; no seed while an agent walk is in progress; never @mention or invite a real student for testing.

---

