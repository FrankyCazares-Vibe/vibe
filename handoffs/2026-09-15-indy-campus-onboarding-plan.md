# Indianapolis campus + onboarding plan (IU and Purdue, shared Indy)

2026-09-15 · HEAD `917775f` · Built from six read-only reports (campus-code, data-model, live-data, iu-purdue-research, onboarding-impl, social-steps) plus a re-read of `handoffs/2026-09-12-decisions.md` §3 and the Session 54 handoff §2. Nothing in the repo or database was changed. Counts are live `count(*)` results from 2026-09-15. They include no emails, names or handles.

---

## 1. Plain-English summary

1. **What the email proves.** Verifying a school email tells Vibe one fact: whether the student is at IU or at Purdue. It says nothing about which campus they're on, because every IU campus uses @iu.edu and both Purdue West Lafayette and Purdue Indianapolis use @purdue.edu.
2. **Picking a campus.** Each student picks their campus on the second onboarding screen, from their own university's list, and Indianapolis is at the top of both lists. An IU student sees Indianapolis, Bloomington, Kokomo and the other IU campuses. A Purdue student sees Indianapolis, West Lafayette, Fort Wayne and Northwest.
3. **One Indianapolis.** Indianapolis is one community. IU Indianapolis and Purdue Indianapolis students share the same clubs, events, map and campus feed. Each student keeps an accurate badge that reads "IU Indianapolis" or "Purdue Indianapolis".
4. **Outside Indianapolis.** IU students can move to or browse only IU campuses, and Purdue students only Purdue ones. I recommend keeping profiles, DMs, follows and people search open to everyone (question 2).
5. **One catch.** Purdue students in Indianapolis also get an IU email account, so some will verify with @iu.edu and look like IU students. I recommend a small "verify your @purdue.edu instead" link for them (question 1).
6. **New onboarding.** It becomes six phone screens: hello, campus, profile, photo, clubs, people.
   - Name and handle are required.
   - The header stays on screen, with a step counter, Back and Skip on every screen.
   - Answers are saved as the student goes, so a refresh or an app switch loses nothing.
   - Experience and resume move to the profile page as optional extras.
7. **Seed content first.** Today a new student would find 2 clubs they can join in one tap, no events after tonight, and a newest post from May 19. No Purdue student can sign up at all yet. Before the next signup push we need real clubs, events and fresh posts, plus the code in waves 1 to 3 below.

---

## 2. Campus model

### 2.1 Recommendation at a glance

| Concept | Where it lives | Who sets it | Enforced by |
|---|---|---|---|
| **System** (`iu` / `purdue`) | `users.school_system` (new) | Server, at school-email verification, from the domain | Service-role write only. Signed-in users can read it (for badges), and `school_email` stays private |
| **Campus** | `users.campus_id` → `campuses.id` (new table) | The student, from `campusesForSystem(system)` | Route check plus a DB trigger that rejects a campus whose `systems` doesn't include the student's system |
| **Shared community** | **One** campus row, `indianapolis`, with `systems = {iu,purdue}` | Seed data | Plain equality (`campus_id = 'indianapolis'`) everywhere |
| **Badge** | Derived: system label + campus | Code (`campusBadgeLabel`) | n/a |
| **Legacy label** `users.school` / `orgs.school` | Dual-written for one release, then dropped | Server only (after revoke M2) | Revoke `UPDATE(school)` |

**Why one shared row (data-model "Shape A") and not two labels grouped into a community (the shape campus-code, onboarding-impl and social-steps sketched):**
- With two labels, all ~11 scoped reads need `IN (…)`. This codebase has already shipped exact-match campus bugs twice (`trending/hashtags/route.ts:57`, `search/route.ts:265`).
- Any site that's missed splits Indianapolis in two. The map is where that would show first (`campus-map/route.ts:43-62` uses strict `.eq("school")`).
- With one row, a missed site fails *closed onto the same community*, not apart.
- The badge still says IU or Purdue, because it comes from `school_system`.
- Decisions §3 already settled that "campus lives in a real `campuses` table", so this builds what was already agreed.

### 2.2 Email domain → system

| Domain | System | Campus behavior | Source |
|---|---|---|---|
| `iu.edu` (+ subdomains) | iu | Picker, nothing preselected | All IU campuses use @iu.edu ([IU Today](https://today.iu.edu/live/news/4257-unifying-iu-email-addresses-to-the-iuedu-domain)) |
| `iupui.edu`, `indiana.edu`, `iuk.edu`, `iupuc.edu`, `ius.edu`, `iun.edu`, `iusb.edu`, `iue.edu`, `iufw.edu` | **rejected** with a specific message | n/a | IU retired them Dec 31 2025; mail no longer delivers ([IU IT News](https://news.iu.edu/it/live/news/33836-unifying-iu-email-addresses-to-the-iuedu-domain)). Today Vibe still accepts `iupui.edu` (`school-email-domains.ts:11-14`) and advertises it (`school-email/page.tsx:432,451,566`), so a code sent there never arrives. 0 live rows use it |
| `purdue.edu` | purdue | Picker, nothing preselected | West Lafayette and Indianapolis share it ([Purdue IT](https://it.purdue.edu/about/indianapolis.php)) |
| `pfw.edu` | purdue | **Visible** preselect of Fort Wayne; one tap to confirm | [Purdue KB 622](https://service.purdue.edu/TDClient/32/Purdue/KB/ArticleDet.aspx?ID=622) |
| `pnw.edu` | purdue | Visible preselect of Purdue Northwest | [Purdue KB 1175](https://service.purdue.edu/TDClient/32/Purdue/KB/ArticleDet?ID=1175). **Student address format UNVERIFIED**: confirm before the Purdue flip |
| Purdue Global | not accepted in v1 | n/a | Online-only; domain unverified |

- **The Purdue-in-Indy / @iu.edu problem.** Purdue Indianapolis students create an IU account for their ID card ([CrimsonCard](https://crimsoncard.iu.edu/purdue.html)), and pre-split students "retain access to your IU Exchange email" ([Purdue IT](https://it.purdue.edu/about/indianapolis.php)). They'd verify as `iu`. Inside Indianapolis nothing changes, because the community is shared. Only their badge and which campuses they can switch to come out wrong. Fix: question 1.
- **Two accounts.** `users_school_email_key UNIQUE(school_email)` means one school email per account. A student holding both addresses could make two accounts. Accepted for v1; no build.
- **Purdue stays off until launch.** Purdue domains ship behind a code constant `PURDUE_SIGNUPS_ENABLED = false`, flipped by a one-line commit at launch (§5.4). No prod env change.
- **Vercel env var.** S54 recorded `SCHOOL_EMAIL_DOMAINS` as unset on Vercel, so the code default applies. Franky should re-confirm before the flip.

### 2.3 Campus list (seed)

| id | Name (badge / picker) | Systems | Open at launch |
|---|---|---|---|
| `indianapolis` | Indianapolis. Badge: "IU Indianapolis" / "Purdue Indianapolis" | iu, purdue | **yes** |
| `fort-wayne` | Fort Wayne. Badge: "IU Fort Wayne" / "Purdue Fort Wayne" | iu, purdue *(question 4; else split into `iu-fort-wayne` + `purdue-fort-wayne`)* | no |
| `iu-bloomington` | IU Bloomington | iu | no |
| `iu-columbus` | IU Columbus *(missing today from `campuses.ts:33-43`; run by IU Indianapolis)* | iu | no |
| `iu-east` | IU East (Richmond) | iu | no |
| `iu-kokomo` | IU Kokomo | iu | no |
| `iu-northwest` | IU Northwest (Gary) | iu | no |
| `iu-south-bend` | IU South Bend | iu | no |
| `iu-southeast` | IU Southeast (New Albany) | iu | no |
| `purdue-west-lafayette` | Purdue West Lafayette | purdue | no |
| `purdue-northwest` | Purdue Northwest (Hammond / Westville) | purdue | no |

**Dropped from the picker:**
- IU Online (listed today at `campuses.ts:42`; 0 rows use it).
- Purdue Global.
- Purdue Polytechnic's statewide sites. They're teaching locations, not student communities ([Polytechnic locations](https://polytechnic.purdue.edu/locations)).

**Why the ids change.** Today's bare ids (`fort-wayne`, `northwest`) collide with Purdue's campuses, so non-shared ids carry a system prefix. No client has ever sent `?campus=` (multi-campus design §2), so renaming costs nothing. The existing id `indianapolis` becomes the shared one.

**"Open" vs selectable.** "Open" is the settled admin switch. A closed campus can still be chosen as home. Its clubs and people screens show honest empty states now, and the "be the first" page arrives with wave 5.

### 2.4 Visibility and switching rules

**The allowed set** is every campus whose `systems` contains the viewer's `school_system`. Indianapolis is in both systems' sets.

| Surface | Rule | Today |
|---|---|---|
| Campus picker (onboarding, Settings, profile editors) | Allowed set only | All 9 IU campuses, Indianapolis preselected (`OnboardingMobile.tsx:89-90,179`) |
| Home campus change | Allowed set only. At most once per 30 days (settled). The onboarding pick, a first pick from empty, and the one-time confirmation for backfilled rows are free | Any IU campus, any time; the student can even write the label directly via PostgREST (`security_hardening.sql:53-54`) |
| Orgs discover, events, map, map zone, trending, campus stats | Scoped to `campus_id = viewer.campus_id`. `?campus=<id>` must be in the allowed set, otherwise 403 `campus_not_in_system`. `?campus=all` means all campuses in the allowed set | One label; `all` = every campus for everyone (`campus-scope.ts:11-24`) |
| Explicit org text search | Allowed set | Every campus (`orgs/route.ts:162-167`) |
| Campus-less orgs (`campus_id IS NULL`) | Shown nowhere in campus-scoped lists; reachable by direct link and on members' profiles. Every org gets a campus (§4) | Shown in every campus view (`campus-scope.ts:88-102`) |
| Feed | *Recommended (question 2):* posts from campuses in the allowed set, plus legacy posts with no campus, plus anyone you follow wherever they are. The home campus gets the ×1.35 boost, comparing `campus_id` | Global feed; boost compares labels exactly (`feed/route.ts:529-559`) |
| People suggestions | Home campus first, then "From your clubs", then the rest of the allowed set ("Elsewhere at IU"). Never other-system people outside Indianapolis. Exclude unverified and not-onboarded accounts | Global newest-first pool, including 5 stranded `u<hex>` accounts (`suggested-connections/route.ts:158-173`) |
| Profiles, people search, follows, DMs | Global *(question 2)* | Global |
| Visiting another campus in your allowed set (wave 5 URL `/campus/<slug>`) | Settled §3 unchanged: read, RSVP, request to join. No posting to its feed and no map presence | Not built |
| Posting | Always to your home campus. A DB trigger stamps `posts.campus_id` (org posts take the org's campus) | Posts have no campus |

**Honesty note (for the privacy page and the sentinels).** System scoping is a relevance rule, not a secret:
- `users`, `events` and `rsvps` read policies are `USING (true)`, and public orgs are readable by anyone (live `pg_policies`). A Purdue student can still read IU Bloomington rows with raw PostgREST.
- What the DB *does* enforce after this plan: nobody can put themselves on another system's campus (trigger plus revoke), and nobody can stamp a post onto another campus (trigger).

### 2.5 Badge and naming

| Case | Badge |
|---|---|
| Shared campus | `SYSTEM_LABEL[system] + " " + short_name`, giving "IU Indianapolis" / "Purdue Indianapolis" |
| Single-system campus | Campus name ("IU Bloomington", "Purdue West Lafayette") |
| Verified, no campus | "IU verified" / "Purdue verified" (today it's always "IU verified", `campuses.ts:81-83`) |
| Unverified | No badge |

The 7 existing badges keep reading "IU Indianapolis".

**Copy rules** (from research):
- Community name is **"Indianapolis"**.
- Say "formerly IUPUI" once, in the picker only.
- Never use "IUI", "PUI" or "UIndy". Students confuse Vibe's audience with the University of Indianapolis.
- **Don't brand the shared community "Jaguars".** That's IU athletics only; Purdue Indy students are Boilermakers ([Mirror Indy Q&A](https://mirrorindy.org/iupui-split-purdue-indiana-university-questions-answered/)). This corrects the memory note "Jaguars athletics".
- The shared banner uses a neutral colour, not IU crimson (`campus-home.tsx:3396`).

### 2.6 Orgs, events, posts

- **Orgs.**
  - `orgs.campus_id` is the community the org meets in. An IU Indy club and a Purdue Indy club both get `indianapolis`, and students of both systems join as home members.
  - Optional `orgs.system` ("Registered with IU / Purdue / neither") drives an "IU" / "Purdue" chip. The two schools keep separate registries: The Spot has 330+ orgs, BoilerLink 70+ in Indy. Purdue says its students "can join IU organizations" ([Purdue Student Life](https://purdue.edu/vpsl/news/featured-stories/2025-purdue-indy-fall-successes.php)).
  - Create defaults to the creator's home campus. An explicit campus must be in the creator's allowed set (`orgs/route.ts:245-251,335-349`). Moving an org gets the same check (`orgs/[slug]/route.ts:189-201`).
  - There's no UPDATE grant on `campus_id`.
- **Events.** No new column; the campus comes from the org (`events/route.ts:67-69`). All 9 live events have an org. Fix event search to use the org's campus instead of `creator.school` (`search/route.ts:101,260-265`).
- **Posts.** New `posts.campus_id`, stamped by a trigger on insert and kept on update, so "old posts stay on the campus they were posted to" (settled §3) holds in the DB.
- **Join and RSVP.**
  - `POST /api/orgs/[slug]/join` has no rate limit and no Terms gate (`join/route.ts:21-60`). Add both.
  - When `org.campus_id ≠ viewer.campus_id`, a public org files a request instead of joining (settled visiting rule).
  - Live `org_members_insert` still allows a direct instant join. This gap stays for the deferred policy-hardening pass.

### 2.7 Backfill (live counts, 2026-09-15)

| Population | Count | Action |
|---|---|---|
| `users` total | 18 | n/a |
| Verified, `school_email` domain exactly `iu.edu` | 14 | `school_system = 'iu'` |
| Unverified, no school email | 4 (all Sept, stuck at the school-email gate) | Stay null; get a system when they verify |
| `school = 'IU Indianapolis'` (all verified; 1 May, 6 Sept) | 7 | `campus_id = 'indianapolis'`, `campus_set_at` null. It was a silent default, so show a one-time "Confirm your campus" card |
| Verified, `school = ''` (all May; 6 onboarded; 0 terms rows; 0 active in 30 days) | 7 | Stay null and get prompted (settled "prompted, not guessed") |
| Purdue addresses anywhere | 0 | n/a |
| `orgs` (all `school = ''`; 2 public, 3 private; 3 verified) | 5 | **Franky assigns each org's campus** (§4); migration applies his list |
| `events` | 9 (all on orgs; 1 upcoming, tonight 22:00 UTC, private org `923896fb`, 0 RSVPs) | None; they inherit from the org |
| `posts` rows | 19 (17 posts, 1 published and 1 draft video post). By author: 9 from IU Indianapolis accounts, 10 from campus-less accounts | 9 get `indianapolis`; 10 stay null (legacy, visible to all) |
| Stranded `u<32hex>` handles | 5, none onboarded | Filter out of suggestions and search; don't delete |

### 2.8 Conflicts with prior settled decisions (Franky to confirm)

| # | Settled text (verbatim) | Source | New rule in this plan | Status |
|---|---|---|---|---|
| 1 | "**Vibe is IU-wide; campus is self-declared and never verified.** IU issues @iu.edu on every campus, so the A3 allowlist proves IU membership only." | S54 handoff §2 | Vibe is IU + Purdue. The **system** is verified from the email; the campus stays self-declared *within* the system | Replaced, confirm |
| 2 | "Campus is a relevance filter and ranking signal, **never a privacy boundary**. Orgs + events scope hard (physically bound) with an always-available 'all campuses'" | S54 §2; `campus-scope.ts:11-14` | Still not a privacy boundary (RLS is `USING (true)`), but the system is now a visibility limit. "All campuses" means all campuses in your university | Changed, confirm |
| 3 | "feed + people only rank (a hard feed filter at 8 users shows an empty app)" | S54 §2 | The feed filters by **system** (not campus) and ranks by campus. People rank by campus within the system. Profiles, search, follows and DMs stay global | Depends on question 2 |
| 4 | "Campus-less orgs appear in every campus view." | S54 §2 | Retired. Every org gets a campus; campus-less orgs show only by direct link and on members' profiles. Otherwise all 5 would show on every Purdue campus | Changed, confirm |
| 5 | "IU Indianapolis stays the pilot/default." | S54 §2 | Still the pilot (the only open campus), but **no default**: onboarding asks (decision 3) | Replaced by decision 3 |
| 6 | "the default allowlist (`iu.edu,iupui.edu` + subdomains) stays as is and `indiana.edu` is not needed" | S54 §2 | Add `purdue.edu`, `pfw.edu`, `pnw.edu`. **Remove `iupui.edu`** (dead since Jan 1 2026) and show a message pointing to @iu.edu | Changed, confirm |
| 7 | "You browse any campus's feed, orgs, events and map." | 09-12 decisions §3 | Any campus in **your university**; Indianapolis counts for both | Replaced by decision 1, confirm |
| 8 | "a `.edu` domain sets your campus automatically only when it maps to exactly one campus" | 09-12 §3 | @pfw.edu / @pnw.edu **visibly preselect** on the campus screen and the student confirms with one tap. @iu.edu / @purdue.edu never preselect. Nothing is set silently (decision 3) | Reconciled |
| 9 | "home campus changes at most once per 30 days" | 09-12 §3 | Kept. Decision 1's "switch campuses" = change home (limited) or visit (free, wave 5). The onboarding pick, a first pick and the backfill confirmation don't count. Unverified: whether Purdue students move between West Lafayette and Indy each semester | Reconciled |
| 10 | "a new campus opens behind an admin switch and shows an honest 'be the first' page" | 09-12 §3 | Kept. Only Indianapolis opens at launch; closed campuses are selectable and show honest empty states until wave 5 | Reconciled |
| 11 | "At a campus that isn't your home you may **RSVP to events** and **request to join orgs** … but you may **not post to its feed or appear on its map**." | 09-12 §3 | Kept inside your university. Cross-system visiting no longer exists, so that undefined case disappears | Compatible |
| 12 | "the 7 campus-less accounts get prompted, not guessed" | 09-12 §3 | Kept (the 7 verified May accounts). Also the 7 defaulted IU Indianapolis rows get a one-time confirm | Compatible |
| 13 | Decision 4 "PROFILE STEP keeps all 13 fields" vs decision 3 "ask for campus explicitly" | 2026-09-15 | Campus is one of today's 13 controls (onboarding map row 13). It gets **its own screen right before Profile**, because clubs, people and the majors list depend on it. The other 12 stay on Profile. Fallback if Franky objects: campus as the first control of the Profile step (5 steps) | Interpretation, flag |
| 14 | Decision 3 "allow skipping on step 1" vs decision 4 "REQUIRES a name and handle" | 2026-09-15 | Question 3 | Open |
| 15 | Memory "Jaguars athletics" | school-context memory | IU only; don't use for the shared community | Correction |

---

## 3. Onboarding redesign

### 3.1 Final step list (phone first; `public/html/onboarding.html` gets the same six steps)

| # | Screen | Required to continue | Saved when | Server call | Primary / secondary |
|---|---|---|---|---|---|
| 1 | Hello (Otto intro) | none | nothing | none | "Let's go →" |
| 2 | **Campus** | a pick (Skip still available) | on Continue | `POST /api/me/onboarding-step {step:"campus", campus_id}` | "Continue →" |
| 3 | Profile (12 controls) | name + handle | on Continue; handle claimed **before** any other field | `POST /api/me/onboarding-step {step:"profile", …}` | "Continue →" |
| 4 | **Photo** | none | the moment the crop is saved | `POST /api/me/profile-upload kind=avatar` → `PATCH /api/me/profile {avatar_url}` | "Choose a photo" / "Skip for now" → after upload "Continue →" |
| 5 | **Clubs & orgs** (home community) | none | each tap | `POST` / `DELETE /api/orgs/<handle>/join` | "Continue →" (reads "Skip for now" while nothing is joined) |
| 6 | **People on your campus** | none | each tap | `POST` / `DELETE /api/me/follow` | "Finish →" |
| Finish | none | none | once | `POST /api/me/onboarding-complete {v:2, otto_answers}` → `next` = `/campus?welcome=1` | Phone tour, campus leg |

- **Order of the social steps.** Clubs comes before People because a brand-new student has no mutuals; joining a club creates the only real "From your clubs" signal (`suggested-connections/route.ts:125-144`).
- **No extra "say hi" step.** Decision 5 names three social screens. Posting is covered by the tour's compose stop.
- **Onboarding is done only at Finish or Skip**, because any non-empty `otto_answers` means done (`post-login.ts:7-10`). Per-step saves never write `otto_answers`, so a refresh mid-flow doesn't bounce the student to `/profile`.
- **Replay** (`?replay=1`) reads nothing from the draft and writes nothing.

### 3.2 Header, Back, Skip

- **Phone.**
  - The header scrolls away today because `shellStyle.overflow:"hidden"` (OM:1107) traps `position:sticky` (OM:1137-1138).
  - Fix: move the background glows (OM:510-511) into a `position:fixed; inset:0; overflow:hidden; pointer-events:none` layer and delete `overflow:hidden` from the shell. Don't use `overflow:clip`; it needs Safari 16+.
  - Header becomes a 4-column grid: Back (44×44, `visibility:hidden` on step 1) · logo · "N of 6" · Skip.
  - Fallback if device QA still shows scrolling: `position:fixed` plus `paddingTop: calc(env(safe-area-inset-top) + 64px)`.
- **Phone autofocus.** Drop it on phone (OM:209-218). It opens the keyboard, which pushes the header off-screen.
- **Desktop.**
  - Add a Back button next to the logo (OH:329), hidden on step 1.
  - `.onb-top` gets a solid-to-transparent background and `.onb-step` gets `padding-top:96px` (OH:77).
  - Skip already shows on step 1 (OH:330,360).
  - `TOTAL_STEPS = 6` (OM:31, OH:555); dots markup gets 6 dots (OH:333-339).
- **Back.**
  - Moves to the previous step and never discards input or undoes saved writes (campus, handle, photo, joins and follows stay).
  - Disabled while a save or upload is in flight.
  - Each step change does `history.pushState({onbStep:n})`, so iOS swipe-back and the browser Back button behave the same as the header button.
- **Skip.**
  - Available on all six steps.
  - The sheet doesn't close on a backdrop tap while submitting (OM:917-919).
  - Skip goes to the server's `next` on both clients. Desktop ignores it today (OH:1002).

### 3.3 Save as they go (two layers, no draft column)

| Layer | What | When | Covers |
|---|---|---|---|
| L1 localStorage, key `vibe_onb_draft_v1:<userId>`, 14-day TTL, all access wrapped in try/catch | Every input, plus `step` and `maxStep` | 300 ms debounce; flushed on `visibilitychange→hidden` and `pagehide` (iOS doesn't reliably fire `beforeunload`) | Refresh, app switch, rotation, "Take Photo" reloading the tab, the desktop iframe (same origin, same key) |
| L2 real columns | Campus (step 2), identity + profile (step 3), avatar (4), joins (5), follows (6) | On Continue, or the moment of the tap | Browser or device change (the verify link often opens in Outlook's webview), in-app browsers with non-persistent storage |

- **Restore order.** Server prefill is the base. The L1 draft overrides *typed* fields. Server wins for saved facts (claimed handle, avatar, memberships, follows).
- **Start step.** `min(draft.step, maxStep)`. With no draft: step 4 if campus and a real handle are saved, step 3 if only campus is saved, otherwise step 1.
- **Clearing the draft.** After a 2xx from `onboarding-complete` (Finish or Skip), on sign-out (`SettingsClient.tsx:922-937`, `src/app/auth/terms/accept-terms-form.tsx:65`), and by TTL.
- **Layout picked once.** `OnboardingSwitch` chooses phone or desktop on first client render and never swaps. Today crossing 900 px remounts and wipes state (`use-is-mobile.ts:18-29`). This also stops phones from starting to load the desktop iframe.
- **Handle cooldown.**
  - `changeHandleForUser(uid, h, {onboarding:true})` skips the 14-day cooldown and writes `handle_changed_at = null` while onboarding isn't complete.
  - Finish sets `handle_changed_at = now()`, so Back-and-edit is free and the cooldown starts at Finish, as it does today.
  - Squatting is bounded by the 30 / 10 min step limiter.

### 3.4 Screen-by-screen behavior

**Step 2 · Campus**
- Radio cards from `GET /api/campuses` (allowed set, shared campuses first).
- Nothing preselected, except the visible @pfw.edu / @pnw.edu case.
- The majors list on step 3 depends on this pick.
- *If question 1 = yes:* IU-email students who pick Indianapolis see a "verify your @purdue.edu instead" link. It reruns school-email verification, and the apply helper swaps system and school email.

**Step 3 · Profile**
- Keeps Name, Handle, Bio, Major, Department/school, Year, Interests, Skills, and the four "here for" checkboxes.
- **Name and handle are required**, checked on the client and enforced on the server.
- Continue stays enabled and shows inline errors instead. Errors have `aria-invalid` and `aria-describedby`, and focus moves to the first bad field. Labels get linked to inputs with `htmlFor`/`id` (OM:966-969).
- Handle check uses `vibeRequest`, `quiet`, and an AbortController. A failed check shows "couldn't check" instead of "✗ taken" (fixes OM:244-263).
- Save order: claim the handle, then write the fields.
- Server prefill blanks the trigger defaults (a name equal to the email local part, a handle matching `^u[0-9a-f]{32}$`).
- Majors: IU Indianapolis list for IU in Indianapolis, Purdue Indianapolis list for Purdue in Indianapolis, the Bloomington list for IU Bloomington, free text elsewhere.
- Deleted: the Finish-time handle claim (OM:398-430, OH:1118-1144) and the silent regex skip (OM:403).

**Step 4 · Photo**
- `<input type="file" accept="image/jpeg,image/png,image/webp" hidden>`, with no `capture` attribute and no `image/heic`, so iOS transcodes HEIC to JPEG and offers Library / Take Photo / Files. Reset `value` on click so the same photo can be re-picked (C24).
- `ImageCropperModal` with `aspect={1} shape="circle" outputMaxSize={768} outputQuality={0.92}`. Output is about 100 KB, far under the 6 MB route cap and Vercel's ~4.5 MB body limit.
- Upload → `PATCH /api/me/profile {avatar_url}` (service role, host-pinned, `profile/route.ts:261-267,316-328`).
- States:
  - **Empty:** "Choose a photo" and "Skip for now".
  - **Uploading:** spinner; Back, Skip and Continue disabled.
  - **Done:** circular preview, "Change photo", "Continue →".
- Cropper fixes (wave 2):
  - `onError` prop (Save fails silently today, IC:306-308).
  - `dismissOnBackdrop={false}` (IC:331).
  - Card `maxHeight: calc(100dvh - 40px); overflow-y: auto`.
  - 44 px buttons (IC:531-569).
  - The same fixes in `public/html/_imageCropper.js:282-297`.
- iOS 17.0–17.4 WKWebView can crash on camera capture ([Apple 772332](https://developer.apple.com/forums/thread/772332)). Library picks still work, the step is skippable, and the photo saves before the step advances.

**Step 5 · Clubs & orgs**
- Loads `GET /api/orgs?filter=discover`, now scoped to `campus_id`. The response adds `campus_id` and `system`.
- Sort public orgs first. Show the `system` chip ("IU" / "Purdue") when set.
- Row button: `role` → "Joined ✓"; `pending_request` → "Requested" (not toggleable; no withdraw route found); public → "Join"; private → "Request", with the sub-line "Officers approve requests".
- The phone has no join control today (`CampusMobile.tsx:2384-2387` is link-only), so build a new `OrgPickRow`.
- A failed load shows `LoadFailed` with Retry, never the empty state.
- No interest-matching claims (orgs have no category column).

**Step 6 · People**
- Loads `GET /api/me/suggested-connections?limit=25`, now:
  - filtered to verified **and** onboarded accounts (service-role `otto_answers` lookup, which removes exactly the 5 stranded accounts; `school_verified` alone would leave one),
  - compared by community,
  - with reasons `from_your_clubs | same_campus | same_major | same_system`.
- Row "Follow" → "Following ✓", optimistic with rollback. It says Follow, not "Connect" (`NetworkMobile.tsx:831`), because a follow is one-way.
- No "Follow all". Finish is never blocked.
- Fewer than 3 results: show a "Share Vibe" button (`navigator.share` of the site URL, with `copyText` as the fallback).

**Finish / Skip**
- `POST /api/me/onboarding-complete {v:2, otto_answers}` (plus `skip:true` for Skip).
- The server (v:2) requires verified, a real name, a non-`u<hex>` handle and an allowed campus. Skip follows question 3.
- On success:
  - `clearDraft`
  - `localStorage.vibe_tour_pending = "campus"` (try/catch)
  - navigate to the server's `next` **verbatim** (`/campus?welcome=1`)
- Phone tour hook also starts on `?welcome=1` when the leg is unseen, for webviews that lose localStorage. `HANDOFFS.campus = {next:null}` (`use-mobile-tour.ts:127-131`), so there's no extra network-leg page load.
- This fixes C1 (the phone tour never runs) and C13 (Skip went to different places on phone and desktop).

### 3.5 Exact copy: new and changed strings

Otto lines keep today's lowercase voice and curly quotes.

| Where | Old | New |
|---|---|---|
| Step 1 line (OM:546, OH:362) | "about two minutes — profile, experience, then your documents" | "about two minutes: your campus, your profile, a photo, then your people" |
| Header | "Skip" on steps 2+ only (phone) | Back (aria-label "Back") · "N of 6" · "Skip" on every step |
| Step 2 title | n/a | "which campus is yours?" |
| Step 2 Otto (IU) | n/a | "“your school email says IU. pick your campus. Indianapolis is shared with Purdue students.”" |
| Step 2 Otto (Purdue) | n/a | "“your school email says Purdue. pick your campus. Indianapolis is shared with IU students.”" |
| Indianapolis card | n/a | Title "Indianapolis". Sub (IU): "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)". Sub (Purdue): "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)" |
| Fort Wayne card (if question 4 = shared) | n/a | Title "Fort Wayne". Sub: "IU Fort Wayne · one community with Purdue Fort Wayne" (mirrored for Purdue) |
| Other cards | n/a | Title = short name ("Bloomington"); sub = full name ("IU Bloomington") |
| Preselect tag | n/a | "from your @pfw.edu email" / "from your @pnw.edu email" |
| Step 2 footnote | "not verified…" hint (OM:624-641) | "Your school email shows you're at IU. You can move to another IU campus later in Settings." (Purdue variant) |
| Step 2 Q1 link | n/a | "Purdue student with an IU email? Verify your @purdue.edu instead" |
| Step 2 errors | n/a | Client: "Pick your campus to continue." · Server `campus_invalid`: "Pick one of your university's campuses." |
| Step 3 sub (OM:557, OH:373) | "same fields as your Vibe profile — a quick pass now; photo, banner, and fine-tuning on the next screen" | "“same fields as your Vibe profile. name and handle are the must-haves. a photo is next.”" |
| Step 3 labels | "Name", "Handle" … | "Name (required)", "Handle (required)"; all others end "(optional)" |
| Step 3 major hint (OM:643) | "IU Indianapolis list" | "From the IU Indianapolis list, or type your own" / "From the Purdue Indianapolis list, or type your own" / elsewhere "Type your major" |
| Handle status | "✗ taken" on any failure | "checking…" · "✓ available" · "✗ taken" · "✗ {reason}" · "couldn't check. we'll check when you continue" |
| Step 3 errors | "Couldn't save your profile." for every 400 | "Add your name. It's how people recognize you." · "Pick a handle so friends can find you." · "3–20 letters, numbers or _." · "That handle is taken. Try another." · server reserved: "That handle is reserved." |
| Step 3 footer (OM:874-880, OH:442) | "Continue →" + "Skip to resume →" | "Continue →" only (**"Skip to resume" removed**, decision 2) |
| Step 4 | n/a | Title "put a face to the name" · Otto "“people follow faces. add a photo so classmates know it's you. swap it any time.”" · "Choose a photo" · "Skip for now" · "Uploading…" · "Change photo" · "Continue →" |
| Step 4 errors | raw "Invalid file size" / "Unsupported file type" | "That photo is too big. Try another." · "Use a JPG, PNG or WebP photo." · "Couldn't process that photo. Try a different one." · "That photo didn't upload. Try again." |
| Step 5 | n/a | Title "find your clubs" · Otto (Indy) "“clubs and orgs at Indianapolis, from IU and Purdue both. join the ones you're in, or just curious about.”" · Otto (other) "“clubs and orgs at {campus}.”" · Search "Search clubs by name" · "Join" → "Joined ✓" · "Request" → "Requested" · "{n} members" · private sub "Officers approve requests" |
| Step 5 sparse / empty / error | n/a | 1–2 joinable: "“vibe just launched here, so only a few clubs are on it so far. run one? you can add it after setup.”" · None: title "no clubs here yet", body "“you could be the first. after setup, start your club and it'll show up for everyone at {campus}.”" · Error: "Couldn't load clubs." [Retry] · Join failures: "Couldn't join this org." / "Couldn't send your join request." |
| Step 6 | n/a | Title "follow a few people" · Otto (Indy) "“students at Indianapolis, IU and Purdue both. follow a few and their posts rise to the top of your feed.”" · Groups "From your clubs" / "At {campus}" / "Same major" / "Elsewhere at IU" (or Purdue) · "Follow" → "Following ✓" |
| Step 6 sparse / empty / error | n/a | Fewer than 3: "“it's early here. only a few people have joined so far. bring a friend and you'll have someone to follow.”" [Share Vibe] · None: title "no one to follow yet", body "“you're one of the first at {campus}. share vibe with a friend and they'll show up here.”" · Error "Couldn't load people." [Retry] · Copy fallback toast "Link copied." |
| Finish | "Finish & open my profile →" | "Finish →" · busy "Saving…" · error "Couldn't finish setting up." |
| Skip sheet (OM:924, OH:525-534) | "Skip onboarding?" / "What you've typed here won't be saved. You can fill in your profile any time from your profile page." | "Skip the rest?" / "Everything you've added so far is saved. You can finish your profile any time from your profile page." · "Keep going" / "Skip anyway". *Option B, identity missing:* "Add a name and handle first. It's how people find you." + two fields + "Save & skip" |
| Phone tour, campus leg (`use-mobile-tour.ts`) | feed: "Posts from people you follow" (wrong: the feed is global) | tabs: "Everything's one swipe away." / "Feed, Events, Orgs, Chat, and the Map. Swipe or tap to switch." · feed: "The campus feed." / "What students at Indianapolis are posting. People you follow rise to the top." · compose: "Your turn." / "Tap + to post text, photos, or video." · end "Got it" |
| Phone empty states | "Pull to refresh later." (`CampusMobile.tsx:1484`, not implemented) · "Once orgs spin up on campus…" (`:2326-2327`) | Remove the pull line · "No clubs from {campus} on Vibe yet. You can start one from your profile." |
| Suggestion reason (`suggested-connections/route.ts:307-309`; `NetworkMobile.tsx:629,943`) | "same school" / "Around your school" | "same campus" / "At {campus}" |
| Settings campus card (`SettingsClient.tsx:549-555,577`) | "Leave it unset to see everything across IU" · "Not set — show everything" | "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." · Once set there's no unset option; blank rows show a disabled "Pick your campus" · "You can change campus again on {date}." · Backfilled rows get the card "Confirm your campus" / "Is Indianapolis still right?" [Yes] [Change] |
| School-email request (`request/route.ts:28-29,85-93,129,137`) | "Use your IU email address" · "Check your IU inbox" | "Use your IU or Purdue school email." · "Check your school inbox." · retired domain: "IU retired @iupui.edu addresses on Jan 1, 2026. Use your @iu.edu address." |
| School-email page (`school-email/page.tsx:431-453,556-573`) | "add your IU email (@iu.edu or @iupui.edu)" · pill `iu.edu` · placeholder `you@iu.edu` · "IU Outlook's Quarantine" | "add your school email (@iu.edu or @purdue.edu)" (from the label helper; adds @pfw.edu / @pnw.edu once Purdue is enabled) · pill ".edu" · placeholder "you@school.edu" · "On your school's Outlook, also check Quarantine." |
| Verify / login / apply / confirm routes | "Couldn't verify your IU email" · "finish verifying your IU email" · "That address isn't an IU email…" · "This IU verification link…" | "Couldn't verify your school email" · "finish verifying your school email" · "That address isn't an IU or Purdue school email." · "This verification link…" |
| Emails (`resend-transactional.ts:124,173-220`; `supabase/templates/confirmation.html:44,71`) | "vibe · IU Indianapolis" · "Verify your IU email" · "This is Vibe, the campus app for IU Indianapolis" | "vibe · for IU and Purdue students" · "Verify your school email" · "This is Vibe, the social app for students, clubs and orgs at IU and Purdue." |
| Desktop campus labels (`campus-home.tsx:290-296,4523,7028,8255-8375,9784,13517,13590`) | `SCHOOL={initials:"IU",name:"Indiana University"}`, "Feed · IU", "Organizations · IU", "clubs and orgs at IU" | Built from the viewer's campus: "Feed · Indianapolis", "clubs and orgs at Indianapolis". Neutral banner colour for shared campuses |
| Landing chip (`home-landing.tsx:185-188`) | "IU · live" | "IU · Purdue · live" |

### 3.6 What moves to the profile page

- **Removed from onboarding:**
  - Phone steps 3–4 (OM:752-910, state OM:187-197, upload OM:274-320, assembly OM:348-366).
  - Desktop steps 3–4 (OH:448-523, OH:763-778, OH:861-977).
- **Already on the profile page as optional, nothing new to build:**
  - Phone: resume upload `ProfileMobile.tsx:775-837`, experience editor `:880-891`.
  - Desktop: "Attach" `profile.html:3701-3704`, "Add experience" `:3835-3838`.
- **Small add.** On the student's own phone profile empty state (`ProfileMobile.tsx:2231-2236`), replace "Open the feed →" with two cards: "Add a post" and "Add experience or a resume".
- **Server.** `onboarding-prefill.ts:150-174` still parses `resume_url` and `work_experience` for one release (bundles opened before the deploy), then that parsing is deleted.
- **Side effect.** This removes onboarding bugs S9, S18, D6, D7, C23–C25 and C34.

---

## 4. Content seeding

### 4.1 What a new student would see today

| Student | Campus step | Clubs | People | Feed | Events |
|---|---|---|---|---|---|
| IU Indianapolis | Silently set to IU Indianapolis | 4 shown (`6e881851` hidden by the 60-day rule), **2 joinable in one tap** (2 members each, no logo), 2 private with 1 member each. All created in May, all campus-less | Up to 12 real people after the stranded-account filter. 7 at IU Indianapolis, 0 Purdue, 9 of 13 onboarded accounts without a photo | Newest post **2026-05-19**, 0 in 90 days, 4 authors ever | 1 upcoming (tonight, private org, 0 RSVPs), then **none** |
| Purdue (any campus) | **Can't reach onboarding.** Rejected at the school-email request (`request/route.ts:85-93`) | n/a | n/a | n/a | n/a |
| IU Bloomington (after this plan) | Picks Bloomington | 0 (empty copy) | 0 same-campus people, then "Elsewhere at IU" | System feed (Indy content) | 0 |

Graph context: 26 follows (8 two-way pairs), 7 org memberships, 0 join requests. 15 of 18 accounts are in no org, and 8 of 18 follow nobody. 4 of 18 accounts have a photo.

### 4.2 What Franky should seed before the next signup push

All of it must be real, from real accounts. Fake or sample content is ruled out (`handoffs/2026-09-12-design-multi-campus.md:170-172`). Also remove the leftover fake calendar events "IU Spring Career Fair" and "IU Hackathon 2025" (`profile.html:6729-6736`, `messages.html:1523-1529`), which wave 3 and wave 4 handle.

| # | Item | Target | Why |
|---|---|---|---|
| 1 | Assign a campus to the 5 existing orgs, and decide which are test orgs | List by id prefix: `f7ae4129` (public, verified, 2 members), `6ca4ec6e` (public, 2), `923896fb` (private, verified, logo, 1, has tonight's event), `a73bee3e` (private, 1), `6e881851` (private, dormant). Suggest retiring test orgs and making `923896fb` public if people should join it | Migration M1b applies the list. Campus-less orgs vanish from campus lists under the new rule |
| 2 | Real public Indianapolis clubs | **8–10**, including **at least 2–3 Purdue Indianapolis clubs**. Each needs a logo, a one-line description, a real officer as owner, and campus + `system` set | The clubs step shows 2 joinable orgs today. Private orgs with 1 member may never answer a request |
| 3 | Upcoming events | **At least 5** in the 14 days after the push, on public orgs | 0 after tonight. Events scope by the org's campus |
| 4 | Fresh posts | **10–15** in the 72 hours before the push, from **at least 5 accounts** (cofounders, officers, the Sept 14 students), including photo posts and event announcements | Newest post is four months old. 7 of 17 posts come from one account |
| 5 | Photos | Cofounder accounts complete. Ask the 9 onboarded students without a photo to add one | The people step would be mostly grey initials |
| 6 | Club membership | Existing members join the seeded clubs | Creates "From your clubs" suggestions for new students |
| 7 | Purdue pilot | Line up **at least 3 Purdue Indianapolis students with @purdue.edu** for the flip day, plus 1 who holds only @iu.edu (tests question 1) | No Purdue account has ever existed. Agents can't create test accounts |
| 8 | Timing | Push only after waves 1–3 are live and seeding items 1–6 are done. Deploy outside the push window | Bundles opened before a deploy can fail mid-onboarding (§6 compatibility notes) |

---

## 5. Migrations and data changes

Apply each migration with curl through the Supabase management API, plus the `supabase_migrations.schema_migrations` row (the MCP `execute_sql` tool is read-only). Use the header of `20260911100000_channel_members_delete_own_pending.sql` as the template. Test every trigger's negative case on a local stack or a Supabase branch, **never with test writes on prod**. Verify prod only with SELECTs.

### 5.1 M1 · `20260916100000_campuses_school_system.sql` (additive; safe with the currently deployed code)

```sql
begin;

-- 1. campuses
create table public.campuses (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  short_name  text not null,
  city        text not null,
  systems     text[] not null
              check (cardinality(systems) between 1 and 2
                     and systems <@ array['iu','purdue']::text[]),
  is_open     boolean not null default false,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);
alter table public.campuses enable row level security;
create policy campuses_select_all on public.campuses
  for select to anon, authenticated using (true);
grant select on public.campuses to anon, authenticated;   -- no write grants: service role only

insert into public.campuses (id, name, short_name, city, systems, is_open, sort) values
 ('indianapolis','Indianapolis','Indianapolis','Indianapolis','{iu,purdue}', true,  0),
 ('fort-wayne','Fort Wayne','Fort Wayne','Fort Wayne','{iu,purdue}', false, 10),  -- Q4; else two rows
 ('iu-bloomington','IU Bloomington','Bloomington','Bloomington','{iu}', false, 20),
 ('iu-columbus','IU Columbus','Columbus','Columbus','{iu}', false, 30),
 ('iu-east','IU East','East','Richmond','{iu}', false, 30),
 ('iu-kokomo','IU Kokomo','Kokomo','Kokomo','{iu}', false, 30),
 ('iu-northwest','IU Northwest','Northwest','Gary','{iu}', false, 30),
 ('iu-south-bend','IU South Bend','South Bend','South Bend','{iu}', false, 30),
 ('iu-southeast','IU Southeast','Southeast','New Albany','{iu}', false, 30),
 ('purdue-west-lafayette','Purdue West Lafayette','West Lafayette','West Lafayette','{purdue}', false, 20),
 ('purdue-northwest','Purdue Northwest','Northwest','Hammond / Westville','{purdue}', false, 30);

-- 2. users: system, campus, change clock
alter table public.users
  add column school_system text check (school_system in ('iu','purdue')),
  add column campus_id     text references public.campuses(id) on update cascade,
  add column campus_set_at timestamptz;
grant select (school_system, campus_id) on public.users to authenticated;  -- same role as SELECT(school) today
-- deliberately NO update grant on school_system / campus_id / campus_set_at

create or replace function public.users_campus_in_system() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.campus_id is not null and not exists (
       select 1 from public.campuses c
        where c.id = new.campus_id and new.school_system = any (c.systems)) then
    raise exception 'campus_not_in_system' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger users_campus_in_system
  before insert or update of campus_id, school_system on public.users
  for each row execute function public.users_campus_in_system();

-- backfill: system first (the trigger needs it), then campus
update public.users set school_system = 'iu'
 where school_verified and school_email is not null
   and (split_part(lower(school_email),'@',2) in ('iu.edu','iupui.edu')
        or split_part(lower(school_email),'@',2) like '%.iu.edu');          -- expect 14
update public.users set campus_id = 'indianapolis'
 where school = 'IU Indianapolis';                                            -- expect 7; campus_set_at stays null

-- 3. orgs
alter table public.orgs
  add column campus_id text references public.campuses(id) on update cascade,
  add column system    text check (system in ('iu','purdue'));
-- mirror whatever SELECT grant orgs.school has today for these two columns; no UPDATE grant

-- 4. posts: stamped by the DB, not the client (posts_insert_authenticated allows direct inserts)
alter table public.posts add column campus_id text references public.campuses(id) on update cascade;
update public.posts p set campus_id = u.campus_id
  from public.users u where u.id = p.user_id and u.campus_id is not null;     -- expect 9

create or replace function public.posts_stamp_campus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.campus_id := old.campus_id;            -- posts stay on the campus they were posted to
  else
    new.campus_id := coalesce(
      (select o.campus_id from public.orgs  o where o.id = new.org_id),
      (select u.campus_id from public.users u where u.id = new.user_id));
  end if;
  return new;
end $$;
revoke all on function public.posts_stamp_campus() from public;
create trigger posts_stamp_campus before insert or update on public.posts
  for each row execute function public.posts_stamp_campus();

commit;
```

**M1b · org campus backfill.** A separate small migration, written once Franky provides the list in §4.2 item 1. For example: `update public.orgs set campus_id = 'indianapolis' where left(id::text,8) in (…)`.

**Post-apply SELECT checks** (expected values):

| Check | Expected |
|---|---|
| `select count(*) from campuses` | 11 |
| `school_system` | `iu` 14 / null 4 |
| `campus_id = 'indianapolis'` on users | 7 |
| `posts.campus_id is not null` | 9 |
| Triggers in `information_schema.triggers` | `users_campus_in_system`, `posts_stamp_campus` present |

### 5.2 M2 · `20260916110000_revoke_campus_label_writes.sql` (apply only after wave 2 is live)

```sql
revoke update (school) on public.users from authenticated;
revoke update (school) on public.orgs  from authenticated;
-- rollback: grant update (school) on public.users to authenticated;
--           grant update (school) on public.orgs  to authenticated;
```

**Pre-check.**
- Run `rg -n "from\(['\"](users|orgs)['\"]\)\s*\.update" src public/html` and confirm every `school` writer uses the service-role client. `profile-sync/route.ts:89-91` comments that `school` is "self-updatable", so read that route before revoking.

**Post-check.**
- Query `information_schema.column_privileges` for `users` / `orgs`, columns `school`, `campus_id`, `school_system`, grantee `authenticated`. Expected: SELECT only.

### 5.3 M3 · later cleanup release

`alter table public.users drop column school; alter table public.orgs drop column school;`

Run it only after one release of dual-writing, and once `rg -n "\bschool\b"` shows no readers in `src/app/api`, `src/components` or `public/html`. It isn't part of waves 1–4.

### 5.4 RLS / grant impact

| Object | Today (live) | After | Note |
|---|---|---|---|
| `campuses` | n/a | SELECT for anon + authenticated; no writes | n/a |
| `users` SELECT | Column grant incl. `school`, `school_verified` | + `school_system`, `campus_id` | `school_email` stays service-role only |
| `users` UPDATE `school` | **granted** (a student can write any label) | revoked (M2) | Routes write with the service role |
| `users` `school_system` / `campus_id` / `campus_set_at` | n/a | No UPDATE grant; trigger guard | The apply helper clears the campus when the system changes |
| `orgs` UPDATE `school` | **granted** to owners via `orgs_update` | revoked (M2) | Route checks the owner's system |
| `posts_insert_authenticated` | Direct client inserts allowed | Unchanged; trigger stamps and pins `campus_id` | n/a |
| `org_members_insert` | Anyone can instantly join any public org | **Unchanged**; the route enforces request-when-visiting | Gap goes to the deferred policy-hardening pass |
| `rsvps_insert_own` | No campus check | Unchanged | No cross-system campus is reachable in the UI |
| `users` / `events` / public `orgs` SELECT `USING (true)` | n/a | Unchanged | So system scoping is relevance, not secrecy (§2.4) |

### 5.5 Deploy order

1. **Pre-flight SELECTs.** Counts match §2.7; `campuses` doesn't exist.
2. **Apply M1**, with Franky's go-ahead. Old code is unaffected: new columns are nullable, the trigger only fires on new columns, and `handle_new_user` inserts `campus_id` null.
3. **Push wave 1.** `school-email-apply` starts stamping `school_system`. `PURDUE_SIGNUPS_ENABLED = false`.
4. **Push wave 2.**
   - Reads move to `campus_id`; writes dual-write `campus_id` + the legacy `school` label.
   - `onboarding-complete` keeps a legacy branch for bodies without `v:2`.
   - Then **apply M2** and **M1b** (org list).
5. **Push wave 3 and wave 4** (they can be built in parallel).
   - Run feature-sentinel and security-sentinel.
   - Franky pastes the new Supabase confirmation template into the dashboard (prod config, Franky only).
   - Franky confirms `SCHOOL_EMAIL_DOMAINS` is still unset on Vercel.
6. **Purdue flip.** A one-line commit, `PURDUE_SIGNUPS_ENABLED = true`. Prerequisites: question 1 answered, `pnw.edu` format verified, the 3 Purdue pilot students standing by.
7. **Later:** remove the legacy `onboarding-complete` branch and the `resume_url` / `work_experience` prefill parsing, then M3.

---

## 6. Implementation waves

**Global rules**
- Every wave runs implement → adversarial review → repair. No file belongs to two batches anywhere in the plan.
- Record per-file eslint problem counts **before** editing.
- Commit and push after each wave; Franky tests on the Vercel prod deploy.
- If a session limit kills a wave, rerun the saved script.

**Acceptance checks (every batch)**
1. `npx tsc --noEmit` exits 0.
2. `npx eslint <each touched file>` gives a problem count ≤ that file's baseline, and 0 for new files.
3. `public/html` scripts:
   - `.js` files: `node --check <file>`.
   - `.html` files: extract the inline `<script>` blocks (skip `src=` and `type="application/json"`) into the scratchpad and `node --check` each one.
4. Unit tests with the repo's existing runner: `node --test --experimental-strip-types <file>.test.ts`, the pattern from `src/lib/otto/parse-reminder.test.ts`. There's no `test` script in `package.json`.
5. Phone screenshots at **375×812** on the prod deploy in the signed-in browser.
   - Use `/onboarding?replay=1` (no writes) and in-page fetch overrides for error, empty and slow states.
   - Never create accounts. Never run positive-path writes against prod from agents.

### Wave 1 · Foundation (libs, domains, SQL, majors, onboarding server primitives)

| Batch | Files (sole owner) | Work | Contract out |
|---|---|---|---|
| **B1** Campus lib | `src/lib/iu/campuses.ts`, `src/lib/iu/campus-scope.ts`, new `src/lib/iu/campuses.test.ts` | Seed mirror of §2.3, allowed-set helpers, badge, legacy-label mapping. Keep `IU_CAMPUSES` and `normalizeCampusLabel` as **deprecated shims** so files owned by later waves still compile | See block C1 below |
| **B2** Email + verification server | `src/lib/auth/school-email-domains.ts`, new `src/lib/auth/school-email-domains.test.ts`, `src/lib/auth/school-email-token.ts`, `src/lib/auth/school-email-apply.ts`, `src/app/api/auth/school-email/request/route.ts`, `src/app/api/auth/school-email/confirm/route.ts`, `src/app/api/auth/school-email/confirm-code/route.ts` | System map, retired-domain rejection, flag, neutral server copy (§3.5). Apply stamps `school_system`; when the system changes, clear `campus_id` / `campus_set_at` in the same update unless the campus is shared | See block C2 below |
| **B3** SQL | new `supabase/migrations/20260916100000_campuses_school_system.sql`, new `supabase/migrations/20260916110000_revoke_campus_label_writes.sql` | §5.1 and §5.2 exactly. Negative tests on a local stack: wrong-system campus raises; a post update can't change `campus_id` | Column names and ids as in §5 |
| **B4** Majors | `src/lib/iu/majors.ts`, new `src/lib/iu/majors-purdue-indianapolis.ts`, new `src/lib/iu/majors-bloomington.ts` (moved out of OH:589-687), `public/html/_iu-majors.js` (regenerated) | Engineering & Technology, CS, data science, cybersecurity (Purdue side) → the Purdue list ([Purdue majors](https://www.purdue.edu/indianapolis/undergraduate-majors/)). Psychology → IU School of Science. Fix "Americansign Language" (`majors.ts:84`). Majors offered by both schools sit in the student's own system's list | `majorsForCampus(campusId, system): { schools, majors } \| null` |
| **B5** Onboarding server primitives | new `src/lib/onboarding/draft.ts`, `src/lib/profile/handle-change.ts`, `src/lib/profile/onboarding-prefill.ts`, new `src/app/api/me/onboarding-step/route.ts` | §3.3 draft module. `changeHandleForUser(uid, h, {onboarding})`. Prefill returns a discriminated result and accepts a legacy `school` label. Step route: 401 → rate limit 30 / 10 min → terms → service read → 403 `school_unverified` → validate → campus or profile (claim handle first) | See block C3 below |

**C1 · campus lib contract (B1)**

```ts
export type SchoolSystem = "iu" | "purdue";
export type Campus = { id: string; name: string; shortName: string; city: string; systems: SchoolSystem[]; isOpen: boolean; sort: number };
export const CAMPUSES: readonly Campus[];
export const SYSTEM_LABEL: Record<SchoolSystem, "IU" | "Purdue">;
export function campusById(id?: string | null): Campus | null;
export function campusesForSystem(s: SchoolSystem): Campus[];          // shared first
export function isCampusAllowed(id: string, s: SchoolSystem | null): boolean;
export function campusIdFromLegacyLabel(label: string): string | null; // "IU Indianapolis" → "indianapolis"
export function legacyLabel(id: string, s: SchoolSystem): string;      // dual-write value
export function campusBadgeLabel(id: string | null, s: SchoolSystem | null): string | null;
export function sharedWithCopy(c: Campus, s: SchoolSystem): string | null;
// campus-scope.ts
export type CampusScope = { kind: "campus"; campusId: string } | { kind: "system"; campusIds: string[] } | { kind: "none" };
export function resolveCampusScope(raw: string | null, viewer: { campusId: string | null; system: SchoolSystem | null }): CampusScope | { kind: "forbidden" };
```

**C2 · email domain contract (B2)**

```ts
export const PURDUE_SIGNUPS_ENABLED = false;
export const SYSTEM_DOMAINS: Record<SchoolSystem, readonly string[]>;
export function schoolSystemForEmail(email: string, opts?: { purdueEnabled?: boolean }): SchoolSystem | null;
export function isRetiredIuDomain(email: string): boolean;
export function singleCampusForEmail(email: string): string | null;    // pfw.edu → "fort-wayne"
export function schoolEmailDomainsLabel(): string;                     // flag-aware
```

**C3 · onboarding step route contract (B5)**

```
POST /api/me/onboarding-step
  {step:"campus", campus_id}
  {step:"profile", name, handle, bio, major, department, year, interests, skills, looking_for}
→ 200 {ok:true}
→ {ok:false, code, field?, error}
  400: name_required | handle_required | handle_invalid | handle_reserved | campus_invalid
  409: handle_taken
  403: school_unverified | terms_required
  429: rate limited
```

**Wave 1 acceptance (beyond the global checks)**
- Tests pass for:
  - `campusesForSystem("purdue")[0].id === "indianapolis"`
  - `isCampusAllowed("purdue-west-lafayette","iu") === false`
  - `campusBadgeLabel("indianapolis","purdue") === "Purdue Indianapolis"`
  - `campusBadgeLabel(null,"purdue") === "Purdue verified"`
  - `campusIdFromLegacyLabel("IU Indianapolis") === "indianapolis"`
  - `schoolSystemForEmail("a@mail.iu.edu") === "iu"`
  - `schoolSystemForEmail("a@purdue.edu") === null` with the flag off, and `"purdue"` with `{purdueEnabled:true}`
  - `isRetiredIuDomain("a@iupui.edu") === true`
  - `singleCampusForEmail("a@pfw.edu") === "fort-wayne"`
- `node --check public/html/_iu-majors.js`.
- M1 negative tests pass locally; after applying M1 to prod, the §5.1 SELECTs match.
- Size: M, about 1.5–2 dev-days.

### Wave 2 · Server reads and writes, plus the shared cropper (depends on wave 1 pushed and M1 applied)

| Batch | Files (sole owner) | Work |
|---|---|---|
| **B6** Profile read/write + badge | `src/app/api/me/profile/route.ts`, `src/app/api/me/profile-sync/route.ts`, `src/app/api/me/profile-bootstrap/route.ts`, `src/lib/profile/build-vibe-user-v1.ts`, `src/lib/profile/normalize-profile-view.ts` | Accept `campus_id` (and a legacy `school` label). Validate against the service-read `school_system`, returning 400 `campus_not_in_system` "That campus isn't part of your university.". Enforce 30 days (`campus_set_at`; a null → first set is free; returns 429 `campus_change_too_soon` with `availableAt`). Dual-write `school`. Move the `school` write to the service-role patch. Bootstrap adds `schoolSystem`, `campusId`, `campusBadge`, `campusChangeAvailableAt`, `campusConfirmed` (= `campus_set_at` not null) and never `school_email` |
| **B7** Onboarding server + campuses API | `src/app/api/me/onboarding-complete/route.ts`, `src/app/api/me/onboarding-state/route.ts`, `src/app/onboarding/page.tsx`, `src/app/onboarding/OnboardingSwitch.tsx`, `src/app/onboarding/classic/route.ts`, new `src/app/api/campuses/route.ts` | `GET /api/campuses` → `{system, campuses:[{id,name,shortName,city,shared,sharedWith,isOpen}], preselect, currentCampusId}`. **Compatibility:** `onboarding-complete` with `v:2` enforces verified, identity and campus, and sets `handle_changed_at` at Finish; without `v`, the legacy behavior stays for one release. Both return `next: "/campus?welcome=1"` (an old client appending `&welcome=1` still gets a valid URL). Page passes `{replay, userId, system, prefill, singleCampusId}`. Classic route injects `<script id="onbBoot" type="application/json">` with `<` escaped. `OnboardingSwitch` picks its layout once |
| **B8** Orgs / events / join / RSVP | `src/app/api/orgs/route.ts`, `src/app/api/orgs/[slug]/route.ts`, `src/app/api/orgs/[slug]/join/route.ts`, `src/app/api/events/route.ts`, `src/app/api/events/[id]/rsvp/route.ts` | Scope on `campus_id`. Clamp `?campus=` and org text search to the allowed set. Retire "campus-less shows everywhere". Create/move checks. Discover response adds `campus_id`, `system`. Join adds `rateLimit("org-join:"+uid)` + `requireTermsAccepted` + request-when-visiting. RSVP adds a rate limit + terms gate |
| **B9** People / feed / user search | `src/app/api/me/suggested-connections/route.ts`, `src/app/api/feed/route.ts`, `src/app/api/users/search/route.ts` | Verified + onboarded filter on all three candidate sources (after merge). Community compare. Reasons `from_your_clubs \| same_campus \| same_major \| same_system`. Feed: allowed-set posts + null-campus posts + followed authors, boost on `campus_id` (per question 2). User search stays global but drops stranded accounts |
| **B10** Map / search / trending / stats | `src/app/api/campus-map/route.ts`, `src/app/api/campus-map/zone/route.ts`, `src/app/api/search/route.ts`, `src/app/api/trending/hashtags/route.ts`, `src/app/api/stats/campus/route.ts` | `.eq("campus_id", …)` everywhere. Event search uses the org's campus. Stats count the community, with an optional `group by school_system` split |
| **B11** Cropper + avatar helper | `src/components/ImageCropperModal.tsx`, `public/html/_imageCropper.js`, new `src/lib/profile/avatar-upload.ts` | `onError`, `dismissOnBackdrop`, `maxHeight: calc(100dvh - 40px)`, 44 px buttons (both implementations). `uploadAvatar(blob: Blob): Promise<{ok:true; url:string} \| {ok:false; message:string}>` (upload → PATCH, mapped error copy) |

**Wave 2 acceptance**
- `rg -n '\.eq\("school"|school\.eq\.|author\.school|creator\.school' src/app/api` → 0 scoping hits.
- Anon `curl localhost:3000/api/campuses` → 401.
- Signed-in negative checks only, which write nothing:
  - `?campus=purdue-west-lafayette` as an IU viewer → 403.
  - `PATCH /api/me/profile {campus_id:"purdue-west-lafayette"}` → 400.
- Code review confirms the legacy `onboarding-complete` branch is byte-compatible with today's bundle.
- Suggestions response contains 0 handles matching `^u[0-9a-f]{32}$` (count only).
- `node --check public/html/_imageCropper.js`.
- After the push: apply M2 + M1b and run the grant SELECT.
- Size: M–L, about 2 dev-days.

### Wave 3 · Clients (depends on wave 2 live)

| Batch | Files (sole owner) | Work |
|---|---|---|
| **B12** Phone onboarding | `src/components/mobile/OnboardingMobile.tsx`, new `src/components/mobile/onboarding/OnbHeader.tsx`, `StepCampus.tsx`, `StepProfile.tsx`, `StepPhoto.tsx`, `StepClubs.tsx` (with `OrgPickRow`), `StepPeople.tsx` (with its own `PersonPickRow`; doesn't import `NetworkMobile`) | §3.1–3.5 in full. Draft L1, pushState Back, pinned header, Skip option per question 3, finish → `next` verbatim + `vibe_tour_pending` |
| **B13** Desktop onboarding | `public/html/onboarding.html` | Same six steps. Reads `onbBoot`. Draft mirror with the same key and schema. Back button, 6 dots, header padding. Delete steps 3–4, the Bloomington arrays and "Skip to resume". Photo via `openImageCropper` (reject non-JPEG/PNG/WebP with copy). Skip → server `next`. Disable Skip during Finish |
| **B14** Phone tour / network / campus | `src/components/mobile/use-mobile-tour.ts`, `src/components/mobile/NetworkMobile.tsx`, `src/components/mobile/CampusMobile.tsx` | Tour starts on `?welcome=1`; campus-leg copy; `HANDOFFS.campus.next = null`. Reason labels "At {campus}". Empty-state copy; remove "Pull to refresh later." |
| **B15** Settings + sign-out | `src/components/settings/SettingsClient.tsx`, `src/app/settings/page.tsx`, `src/app/auth/terms/accept-terms-form.tsx` | Campus card: allowed set, no unset, next-change date, "Confirm your campus" for unconfirmed rows. `clearDraft()` on sign-out in both places |
| **B16** Profile editors | `src/components/mobile/ProfileMobile.tsx`, `public/html/profile.html` | Pickers from bootstrap `schoolSystem` / `campusId` (drop the copied `IU_CAMPUSES`, `profile.html:7050-7150`). Majors per campus. Copy "An @iu.edu address…" → the system-neutral version. Delete the fake calendar events (`profile.html:6729-6736`). Optional own-profile empty-state cards. Optionally switch avatar upload to `uploadAvatar` |

**Wave 3 acceptance**
- `node --check` on the inline scripts extracted from `onboarding.html` and `profile.html`.
- `rg -n "Skip to resume|to resume|then your documents|photo, banner" src public/html` → 0.
- 375×812 screenshots:
  - each of the 6 replay steps, scrolled to the bottom with the header visible
  - Skip sheet (both variants)
  - photo empty and uploading (override)
  - clubs loaded / sparse / empty / failed
  - people loaded / empty / failed
  - Settings campus card
  - profile campus picker
- Desktop 1280 px screenshots of `onboarding.html` steps 2–6.
- **Franky's real-iPhone script** (prod domain, fresh account):
  1. Refresh on each step.
  2. Switch apps for 60 s.
  3. Rotate on step 3.
  4. Swipe back from step 4.
  5. Photo from Library (HEIC) and Take Photo.
  6. Snapchat or Instagram webview library pick.
  7. Join one org, follow one person, Finish → the tour fires.
  8. Skip from step 1.
- Post-check SELECT on that account (by id prefix): `school_system`, `campus_id` set; handle not `u<hex>`; `handle_changed_at` set; `otto_answers` non-empty; ≥1 `org_members` or request row; ≥1 `connections` row.
- Then run **feature-sentinel** and **security-sentinel**.
- Size: L, about 2–3 dev-days.

### Wave 4 · Copy, brand, legal (depends on wave 2; can be built in parallel with wave 3)

| Batch | Files (sole owner) | Work |
|---|---|---|
| **B17** Auth pages | `src/app/auth/school-email/page.tsx`, `src/app/auth/verify-school/page.tsx`, `src/app/auth/login/page.tsx`, `src/app/auth/signup/page.tsx`, `src/lib/auth/email-link-errors.ts` | §3.5 copy; hint from `schoolEmailDomainsLabel()`; retired-domain message display |
| **B18** Email templates | `src/lib/email/resend-transactional.ts`, `supabase/templates/confirmation.html`, `supabase/templates/confirmation.previous.html` | Neutral subjects and footers. Franky pastes the template into the Supabase dashboard |
| **B19** Desktop campus home | `src/app/campus/campus-home.tsx` (one owner; ~13k lines), `src/app/campus/page.tsx` | `SCHOOL` constant → viewer campus from bootstrap. "· IU" labels. Neutral banner for shared campuses. Map halos from both taxonomies. Meta description |
| **B20** Map, landing, static fakes, sentinel context | `src/components/mobile/MapMobile.tsx`, `src/components/landing/home-landing.tsx`, `public/html/messages.html`, `.claude/workflows/security-sentinel.js` | Halos. "IU · Purdue · live". Delete fake events (`messages.html:1523-1529`). Sentinel context "pilot: Indianapolis (IU + Purdue)" |
| **B21** Legal drafts (local, not the live pages) | `handoffs/legal-drafts/2026-09-07-privacy-policy.md`, `handoffs/legal-drafts/reviewer-questions.md` | Add Purdue, both domain sets, independence from both universities, and the §2.4 honesty note. Flag for counsel: live Terms name Monroe County courts (`src/app/legal/terms/page.tsx:140-142`) while the draft says Marion County. Publishing changes to the live pages needs a `TERMS_VERSION` bump in the same deploy (S54) |

**Wave 4 acceptance**
- `rg -n "IU email|IU inbox|IU Outlook|iupui\.edu|campus app for IU Indianapolis|Indiana University\"|· IU\b" src supabase/templates public/html` → only intended hits (the retired-domain message, system labels).
- `rg -n "Jaguar|UIndy|\bIUI\b|\bPUI\b" src public/html` → 0.
- `rg -n "IUPUI" src public/html` → only "formerly IUPUI".
- `node --check` on the `messages.html` inline scripts and the sentinel JS.
- 375×812 screenshots of the school-email page, verify-school error (fetch override), and the phone campus banner.
- Render the email HTML locally; send nothing.
- Size: S–M, about 1 dev-day.

### Wave 5 · Later, per the 09-12 design (not needed for the Indianapolis launch)

`/campus/<slug>` visiting with the settled read / RSVP / request rules, the "be the first" page, the admin open switch, the Following lane, and tightening `org_members_insert` in the deferred policy-hardening pass. The API clamp from wave 2 already enforces the system rule, so wave 5 is UI only.

**Dependencies.** W1 → (apply M1) → W2 → (apply M2, M1b) → W3 ∥ W4 → sentinels → seeding done → signup push → Purdue flip commit → later cleanup (legacy branch, M3) → W5.

---

## 7. Questions for Franky

> **ANSWERED by Franky, 2026-09-15 — all four as recommended. Settled; do not re-ask.**
> 1. **Purdue student with @iu.edu:** offer the "Verify your @purdue.edu instead" link. Keep `campus_set_at` across a system change (critic B3).
> 2. **Visibility:** campus things only. Clubs, events, map, trending and the campus lane show the **home campus** (Indianapolis = IU + Purdue; this resolves critic B1: other same-university campuses appear only when the student switches). Profiles, people search, follows and DMs stay global.
> 3. **Skip:** option B. Skip works on every screen; if name + handle aren't saved, the Skip sheet asks for just those two.
> 4. **Fort Wayne:** a second shared campus (`fort-wayne`, `{iu,purdue}`), closed at launch. Only Indianapolis opens.
>
> **Clubs (Franky, 2026-09-15, settled):**
> 5. **Only SAE (`923896fb`) is real.** Finance Club `f7ae4129`, Kelley Floor - University Tower `6ca4ec6e`, CS Club `a73bee3e` and Private equity club `6e881851` are test clubs → **hidden, not deleted**. SAE gets `campus_id = 'indianapolis'`.
> 6. **SAE joins by invitation** ("you have to be invited to join it"): a third join mode beyond public (instant) and private (request). Design pending the invite-code check.
> 8. **Post editing ships in wave 3** (Franky, 2026-09-15). `PATCH /api/posts/[id]` already exists (owner-only; edits `content`, flips `status`) but **no client calls it** — there is no Edit control anywhere. Add "Edit" to the ⋯ menu on your own posts on the phone feed and phone profile, the desktop feed, and the post viewer (both twins), reusing the existing route. Wave 3 owns those files (B12/B14/B16/B19), so it goes there, not into wave 2.
> 7. **Org audience replaces the plan's `orgs.system` chip:** "some clubs/orgs like SAE and the fraternities allow purdue and IU students, lets just keep it indianapolis for now. And then let them clarify either purdue only / iu only / or indianapolis (both campuses)". So every org has an audience of **both (default) / IU only / Purdue only**, set by its officers; joining (and requesting) checks the student's `school_system` against it. SAE = both.

1. **A Purdue Indianapolis student verifies with @iu.edu (Purdue gives them IU accounts). Do we accept "IU", or offer a way to prove Purdue?**
   - **Recommended:** the email decides. On the campus screen, @iu.edu students who pick Indianapolis see "Purdue student with an IU email? Verify your @purdue.edu instead", which reruns verification and swaps the system.
   - **Why:** "the email proves the system" stays true, with no self-declared system anyone could fake. Their community is identical either way; only the badge and switch list change. It costs one link and the campus-clearing logic already in B2.
   - **Changes the build:** whether B12/B13 show the link, and whether B2's apply helper supports replacing an already-verified school email.
2. **Does "can only see IU campuses" also cover the feed, profiles, people search, follows and DMs across IU and Purdue?**
   - **Recommended:** campus surfaces (clubs, events, map, trending, campus switcher) and the feed follow your university. Posts from the other university reach you only if they're from Indianapolis or from someone you follow. Profiles, people search, follows and DMs stay open to everyone.
   - **Why:** almost all content is in Indianapolis, which both systems share, so nobody loses anything real. A student who knows a friend at Purdue West Lafayette can still find and follow them. RLS can't hide those rows anyway (§2.4), so a hard people wall would be a promise the DB doesn't keep.
   - **Changes the build:** B9's feed filter and people pool.
3. **Skip on step 1 vs required name and handle: which wins?**
   - **Recommended (option B):** Skip works on every screen. If name and handle aren't saved yet, the Skip sheet shows just those two fields ("Add a name and handle first. It's how people find you." → "Save & skip").
   - **Why:** skipping otherwise leaves the auto `u<32hex>` handle and the email-prefix name. That's exactly the 5 stranded accounts polluting suggestions today (C3), and it makes decision 4 meaningless.
   - **Changes the build:** B7's v:2 Skip validation and B12/B13's Skip sheet. Option A (literal) skips identity entirely.
4. **Is Fort Wayne a second shared campus, and which campuses are listed?**
   - **Recommended:**
     - Fort Wayne becomes one shared community like Indianapolis. IU Fort Wayne (health sciences) sits on Purdue Fort Wayne's campus, and students share gen-ed classes and orgs ([IU News 2018](https://news.iu.edu/stories/2018/07/iu/inside/18-welcoming-iu-fort-wayne-to-the-family.html)).
     - Add IU Columbus. Drop IU Online, Purdue Global and Purdue Polytechnic's statewide sites from the picker.
     - Open only Indianapolis at launch.
   - **Why:** Fort Wayne works the same way as Indianapolis, and the shared-row model makes it one seed row. Online-only programs and teaching sites aren't student communities. Opening only Indianapolis keeps the seeding effort in one place.
   - **Changes the build:** B3's seed rows, B1's list, and `singleCampusForEmail("pfw.edu")`.

---

**Not verified (confirm before relying on them):**
- `pnw.edu` student address format.
- Whether every new Purdue Indianapolis admit gets a working @iu.edu inbox.
- Whether Purdue students switch between West Lafayette and Indianapolis each semester (affects the 30-day limit).
- Purdue Indianapolis total headcount (IU Indianapolis is 20,677 at the Fall 2025 census; the ~2,660 Purdue figure is unsourced).
- Which Purdue college owns each Indianapolis major.
- Whether IU Indianapolis has a Media School (`majors.ts:22`).
- Whether a route exists to withdraw an org join request.
- The `accept-terms-form.tsx:65` sign-out line (file located at `src/app/auth/terms/accept-terms-form.tsx`; line from onboarding-impl).

Key paths:
- `/Users/franciscocazares/vibe/src/lib/iu/campuses.ts`
- `/Users/franciscocazares/vibe/src/lib/iu/campus-scope.ts`
- `/Users/franciscocazares/vibe/src/lib/auth/school-email-domains.ts`
- `/Users/franciscocazares/vibe/src/lib/auth/school-email-apply.ts`
- `/Users/franciscocazares/vibe/src/components/mobile/OnboardingMobile.tsx`
- `/Users/franciscocazares/vibe/public/html/onboarding.html`
- `/Users/franciscocazares/vibe/src/app/api/me/onboarding-complete/route.ts`
- `/Users/franciscocazares/vibe/supabase/migrations/20260903100000_security_hardening.sql`
- `/Users/franciscocazares/vibe/handoffs/2026-09-12-decisions.md`
- `/Users/franciscocazares/vibe/handoffs/2026-09-12-design-multi-campus.md`
- `/Users/franciscocazares/vibe/handoffs/2026-09-14-onboarding-map.md`

---

## Critic additions and corrections

Read-only check against HEAD `13b3176` and live pg_catalog / pg_policies SELECTs, 2026-09-15. Ranked by severity. CONFIRMED means checked in code or the live DB. PLAUSIBLE means reasoned but not executed.

### A. Things that would break

**A1. Wave 1 fails its own `tsc` check (CONFIRMED).**
- Contract C1 changes signatures that wave-2 and wave-3 files still call:
  - `campusBadgeLabel(school)` takes one argument today (`build-vibe-user-v1.ts:1`, B6).
  - `resolveCampusScope(raw, viewerSchool)` → `{ok, scope, campusLabel, viewerCampus, explicit}` (`events/route.ts:3,101`, `orgs/route.ts:3,69`, B8).
  - `campusById` returns an object with `.label` / `.shortLabel`.
- Other exports that C1 drops but callers still import:
  - `campusByLabel`: `feed/route.ts:3`, `suggested-connections/route.ts:3`, `profile-bootstrap/route.ts:4`, `SettingsClient.tsx:12`, `ProfileMobile.tsx:18`.
  - `campusOrFilter`: `orgs/route.ts:174`, `events/route.ts:176,188`.
  - `ALL_CAMPUSES`: `events/route.ts:4`, `orgs/route.ts:4`.
  - `DEFAULT_CAMPUS_ID`: `OnboardingMobile.tsx:16`.
- B1 only shims `IU_CAMPUSES` and `normalizeCampusLabel`.
- **Fix:** keep every current export and signature unchanged until its last importer's wave, and give the changed functions new names (e.g. `campusBadgeFor(id, system)`, `resolveScopeV2`).

**A2. "Request" on private clubs returns 404, today and in the plan (CONFIRMED).**
- `join/route.ts:36-40` loads the org with the user client.
- The live `orgs_select` policy is `is_public = true OR is_org_member(id, auth.uid())`, so a non-member never sees a private org and gets "Not found" before the request insert (`:100-129`).
- Live `org_join_requests` = 0 rows.
- Discover *does* list the 3 private orgs, because it uses the service role (`orgs/route.ts:149-160`). The docblock at `:38` says "public orgs", but the query has no `is_public` filter.
- Step 5 therefore shows "Request" buttons that can't work.
- **Fix (B8):** load the org with the service client.

**A3. After M2, org campus edits fail, and the plan never gives `orgs.campus_id` a write path (CONFIRMED).**
- `orgs/[slug]/route.ts:214` writes the patch, including `school`, with the user client, relying on the column grant (comment at `:119`).
- M2 revokes `UPDATE(school)`, and M1 grants no UPDATE on `campus_id`.
- **Fix (B8):** write campus fields with the service role after the existing owner/admin check. B6 does this for users only.

**A4. Old bundles send the campus on every save, so B6's new rules would break unrelated profile saves between wave 2 and wave 3 (CONFIRMED).**
- Who sends it:
  - `ProfileMobile.tsx:955-958` sends `school` on every profile-sync save once a campus is known, and `""` after a "Not set" pick.
  - `profile.html:7866-7871` does the same.
  - `SettingsClient.tsx:520` sends `school: next`, where `""` is an option (`:577`).
- Server today: `profile/route.ts:215-218` returns 400 for the whole request on a bad campus.
- **B6 must:**
  - treat a legacy label equal to the current campus as a no-op (don't touch `campus_set_at`, don't return 429);
  - treat `""` as a no-op, not a 400, until wave 3 ships;
  - never fail a whole profile patch because of a campus-only rule.
- Otherwise every bio edit re-arms the 30-day clock or fails.

**A5. The plan's claim that "nobody can stamp a post onto another campus" is false (CONFIRMED).**
- Live `posts_insert_authenticated` checks only `auth.uid() = user_id AND has_recorded_consent()`, and `authenticated` has table-level INSERT on `posts`.
- `org_id` is never checked for membership. A direct PostgREST insert with any org's id gets that org's campus through the SECURITY DEFINER `coalesce` in `posts_stamp_campus`.
- **Fix:** use the org's campus only when `public.is_org_member(new.org_id, new.user_id)`, otherwise the author's campus. Or correct §2.4.

**A6. `on update cascade` conflicts with the campus-pinning trigger (PLAUSIBLE).**
- `posts_stamp_campus` resets `new.campus_id := old.campus_id` on every UPDATE, including the cascaded UPDATE from renaming `campuses.id`. Postgres then rejects the rename.
- The plan relies on renames: Q4's Fort Wayne split, and "renaming costs nothing".
- **Fix:** `if pg_trigger_depth() > 1 then return new; end if;` at the top of the UPDATE branch. Or use `on update restrict` and document a manual rename with the trigger disabled.
- Needs a negative test on a local stack.

**A7. Campus-less posts leak across universities forever, and campus-less viewers have no rule (CONFIRMED).**
- Campus can stay null: step 2 has Skip, Q3 option B requires only name and handle, and the 7 May accounts stay null.
- The trigger pins null on every update, so these posts stay "legacy, visible to all", including to Purdue West Lafayette, even after the author picks a campus.
- C1 has `{kind:"none"}`, but §2.4 never says what a campus-less viewer sees. Today they see everything (`campus-scope.ts:76-84`), and the map returns `reason:"no_school"` (`campus-map/route.ts:44-54`).
- **Fix:** also stamp `posts.school_system` and filter null-campus posts by system (or require a campus before the first post). Define `none` = every campus in the viewer's allowed set.

**A8. Nothing prompts the 7 campus-less onboarded accounts outside Settings (CONFIRMED).**
- `/onboarding` sends onboarded users away, and `enforceCampusAccess` checks only consent, verification and Otto (`campus-access.ts:37-45`).
- "Confirm your campus" lives only in the Settings card (B15), which students rarely open.
- **Fix:** add a campus banner on `/campus` (B19 desktop, B14 `CampusMobile.tsx`) or a gate in `campus-access.ts`. That file isn't in any batch.

### B. Conflicts with founder decisions missing from §2.8

**B1. The default feed and people step show other same-university campuses without the student choosing to switch.**
- Settled 09-12 §3 (`decisions.md:33`): "following someone at another campus puts their posts in a separate Following lane while the Campus lane stays local."
- Decision 1: "you can only see iu campuses if you choose to switch campuses" and "they can choose to see the other purdue campuses". Both read as opt-in.
- Q2's recommended feed and the onboarding "Elsewhere at IU" group show other same-university campuses by default.
- **Fix:** add §2.8 row 16. Recommended default: the Campus lane is the home campus only (Indianapolis already covers both universities). Other campuses appear via the switcher or the wave-5 Following lane.
- Tour copy "What students at Indianapolis are posting" should use `{campus}` whatever Q2 decides.

**B2. Question 4 (Fort Wayne shared) contradicts decision 1's framing, and wave 1 hard-codes the answer before Franky gives it.**
- Franky called Indianapolis "one unique thing"; the working interpretation says it is "the one campus BOTH systems share".
- Wave 1 already assumes sharing: the M1 seed row `fort-wayne {iu,purdue}` and the C2 test `singleCampusForEmail("a@pfw.edu") === "fort-wayne"`.
- **Fix:** default to split rows `iu-fort-wayne` / `purdue-fort-wayne`, and ask about sharing later.

**B3. Question 1's link has no page to land on, and switching emails would bypass the 30-day rule.**
- `enforceSchoolEmailPage` sends every verified user away from `/auth/school-email` (`campus-access.ts:73-78`).
- The link ships in B12 (wave 3), but `campus-access.ts` belongs to no batch, and `school-email/page.tsx` is B17 (wave 4).
- A verified user can already re-verify a *different* address:
  - `request/route.ts:116-126` short-circuits only when it's the same address;
  - `school-email-apply.ts:35-41,69-75` then overwrites it.
- Once Purdue is on, clearing the campus on a system change plus "a first pick from empty is free" lets a student bounce between @iu.edu and @purdue.edu to skip the 30-day limit.
- **Fix:** keep `campus_set_at` across system changes.

**B4. The copy says "Purdue" before any Purdue student can sign up.**
- Wave 4 ships before the flip, including:
  - "IU · Purdue · live" (`home-landing.tsx:185-188`);
  - email footers "for IU and Purdue students";
  - "Use your IU or Purdue school email."
- Meanwhile `PURDUE_SIGNUPS_ENABLED=false` rejects @purdue.edu.
- **Fix:** gate these strings on the flag, or move them into the flip commit.

**B5. Some §2.8 statuses ask Franky to confirm things he has already decided.**
- Rows 1 and 7 are already replaced by decision 1 ("the email proves the system"). Mark them "Replaced by decision 1", not "confirm".
- Row 6 (drop `iupui.edu`) remains a fair factual confirm.

### C. Missed files and assumptions

**C1. Files that read `users.school` but belong to no batch.**
- **Must fix:** `users/[handle]/bootstrap/route.ts:18` selects `school,school_verified` and then calls `buildVibeUserV1FromProfile` (`:176`). Once B6 derives the badge from `school_system` / `campus_id`, every *other* person's profile badge disappears unless this select changes. Add the file to B6.
- **Only block M3, since dual-write keeps them working:**
  - `users/by-id/[id]/route.ts:28`
  - `posts/[id]/route.ts:77`
  - `me/bookmarks/route.ts:41`
  - `me/threads/route.ts:31,456`
  - `MessagesMobile.tsx:41`
  - `messages.html:1877,2664`
  - `_profilePreview.js:101`
  - `lib/profile/types.ts:12`

**C2. The `SCHOOL_EMAIL_DOMAINS` env var needs a precedence rule.**
- `.env.example:31` still has `# SCHOOL_EMAIL_DOMAINS=iu.edu,iupui.edu`, and no batch owns the file.
- Today the env var *replaces* the code default (`school-email-domains.ts:25-41`), so a set value could re-enable `iupui.edu` or bypass `PURDUE_SIGNUPS_ENABLED`.
- **Fix:** C2 should state that the env var can only narrow the code's system map.

**C3. IU-only strings missing from §3.5.**
- `school-email/page.tsx:18` "Sign in to send your IU email."; `:444` "Adding an IU email to"; `:448-449`.
- `confirm-code/route.ts:94` "Enter the IU email you sent the code to." (B2).
- `email-link-errors.ts:141` "On IU Outlook, also check Quarantine." (B17).
- `request/route.ts:213` "Check your IU inbox…". The plan cites `:129,137`, which is now a comment; the copy moved in session 60.
- `campus/page.tsx:7` meta "Campus home — IU wedge." (B19).
- `NetworkPageClient.tsx:806` "once your school has more students on Vibe". Desktop network page; no batch owns it.
- Low priority: `the-map/stages.ts:164` and `the-map/page.tsx:866-890` (internal roadmap).

**C4. The people-suggestion rename breaks a phone group for one wave.**
- `NetworkMobile.tsx:943` groups on the literal `reason === "same school"`.
- B9 (wave 2) renames the reasons, so "Around your school" goes empty until B14 (wave 3).
- **Fix:** keep emitting the old string until B14, or move the NetworkMobile edit into wave 2.

**C5. Sign-out sites.**
- `SettingsClient.tsx:925` and `accept-terms-form.tsx:65` are confirmed, which settles the "not verified" item.
- Also: browser `signOut` in `verify-school/page.tsx:235` and `EmailLinkProblem.tsx:75`, plus account deletion (`api/me/route.ts:129`).
- The draft is keyed by user id, so the risk is low. Either list these sites or soften the claim.

**C6. The wave-2 acceptance `rg` misses the orgs discover filter.**
- `campusOrFilter("school", …)` at `orgs/route.ts:174` matches none of the pattern's alternatives.
- **Fix:** add `campusOrFilter\("school"`.

**C7. Desktop and phone tours would disagree.**
- The plan sets `HANDOFFS.campus.next = null` on phone (`use-mobile-tour.ts:127-131`, confirmed).
- Desktop `campus-home.tsx:436-444` still hands off to `/network?welcome=1`.
- **Fix:** decide both in B19 / B14.

**C8. The majors contract (B4) misses the map.**
- `MapMobile.tsx:13` and `campus-home.tsx:27` import `IU_SCHOOLS, schoolForMajor`.
- "Map halos from both taxonomies" needs a Purdue equivalent that the contract doesn't define.

**C9. Owners can't leave their own club.**
- `DELETE /join` returns 400 for owners (`join/route.ts:152-157`).
- **Fix:** hide the "Joined ✓" toggle in step 5 when `role = owner`, because seeded-club officers will hit it.

### D. Fact corrections and confirmations

**D1. The plan's HEAD is stale.**
- The plan says `917775f`; HEAD is `13b3176`.
- Session 60's five commits touched the school-email request / confirm / confirm-code routes, the school-email, verify-school, login and signup pages, `email-link-errors`, `resend-transactional`, both templates and `rate-limit`.
- Most citations already match the new tree (`school-email/page.tsx:432,451,566`). `request/route.ts` drifted (see C3).

**D2. §2.4 honesty note overstates who can read.**
- anon has no privileges on `orgs` or `users` (live relacl).
- `orgs`, `users`, `events` and `rsvps` are readable by any **signed-in** user, not "anyone".
- `events`, `posts` and `connections` do carry full anon table grants, but only authenticated-role policies exist, so anon reads nothing.

**D3. M2 grants are safe as written (CONFIRMED).**
- `users.school` has a column ACL (`authenticated=rw`) and no table-level UPDATE, so `revoke update (school)` takes effect.
- `orgs` UPDATE is column-level too.
- `authenticated` has table-level SELECT on `orgs`, so the §5.1 "mirror SELECT grant" step is a no-op.

**D4. M1 is safe to apply on the live data (CONFIRMED).**
- Nothing to collide with:
  - no triggers on `users`;
  - `posts` has only `bump_org_activity_on_post` (AFTER INSERT);
  - no public function references `school`;
  - `handle_new_user` doesn't set `school`.
- Backfills hold:
  - all 7 `IU Indianapolis` rows are verified with domain exactly `iu.edu`, so the campus backfill won't trip the new trigger;
  - `posts` has both `org_id` and `user_id`;
  - 0 org posts exist, so M1b needs no post restamp;
  - 19 posts, 9 by Indianapolis authors, matching the plan.
- Ordering: the latest applied migration is `20260912102000`.
- M3: `users.school` and `orgs.school` are `NOT NULL DEFAULT ''`, so the later drop is clean.

**D5. `OM:244-263` is described slightly wrong.**
- A handle that isn't available shows "✗ {reason}", which falls back to "taken" when the response has no reason (e.g. a 401 or 429).
- A network error clears the status.
- The planned fix still stands.

**D6. The discover docblock is wrong, but the plan's row states are right.**
- `orgs/route.ts:38` says "public orgs the viewer is NOT in".
- The query actually returns private and already-joined orgs, with `role` and `pending_request` (`:153-160,227-231`).

**D7. Join requests have no withdraw route (CONFIRMED).**
- `DELETE /join` only deletes `org_members` (live `org_members_delete` allows a non-owner to remove themself).
- `requests/[id]` POST is the officer's approve/decline.

**D8. Legacy `next` stays valid (CONFIRMED).**
- Both old clients append `welcome=1`: `OM:432-435` and `OH:1148-1150`.
- `/campus?welcome=1&welcome=1` works because `campus-home.tsx:326` uses `get()`.
- No `?otto=1` consumers exist, so dropping that is safe.

**D9. No batch-file overlaps.** B1–B21 have no duplicate file owners. Cross-batch imports (B12 → B11, B12/B15 → B5) all go to earlier waves.
