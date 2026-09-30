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
