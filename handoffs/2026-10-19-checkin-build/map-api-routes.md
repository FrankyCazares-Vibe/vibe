# Map: API routes and rate limits (event check-in)

Lens: API routes + rate limits. READ-ONLY pass, Oct 19 2026. Notes written in chunks.

## 0. Name clash to avoid

"Check-in" is already taken in the code: the yearly SCHOOL email check-in
(`src/app/api/me/school-checkin/route.ts`, `src/app/api/cron/school-checkin/route.ts`,
`src/lib/auth/school-checkin-job.ts`, migration `20261008140000_school_checkin.sql`,
email kind `school_checkin`). And `src/lib/limits/budgets.ts:10-14` says
"Views, typing, read marks and the check-in have no budget here on purpose"
(that is the school/day-tally sense). Use `event_checkin(s)` / `eventCheckin*`
everywhere (table, functions, budgets, files, email kinds) so greps and the
budgets comment stay unambiguous. Update that budgets.ts comment to say
"the school check-in" when the new budgets land.

## 1. Existing event routes: auth, errors, limits

### src/app/api/events/[id]/attendees/route.ts (96 lines)
- GET only. `isUuid` 400 first (:35), `createSupabaseServerClient()` +
  `supabase.auth.getUser()` 401 (:39-46), event read on the viewer's client 404 (:48-59),
  then `supabase.rpc("can_manage_event", { p_event_id })` 403 unless `=== true` (:61-70).
- Reads `rsvps` with embedded `user:users!rsvps_user_id_fkey!inner(id,name,handle,avatar_url,major,year)` (:72-79),
  splits into `going` / `interested` (:86-95). RLS `rsvps_select_own_or_manager` is the real gate.
- Error shape: `{ ok:false, error }` WITHOUT `code` (older style).
- NO rate limit today. Every new route needs a budget (house rule), and this one
  will grow a `checked_in` flag per row, so add one when it is touched
  (suggest `eventCheckinOfficer` read share or a separate `attendeesRead`).

### src/app/api/events/[id]/rsvp/route.ts (226 lines)
- Local `fail(status, code, error)` -> `{ ok:false, error, code }` (:13-15). This is the
  shape to copy for the new routes (code for the client to word the refusal).
- PUT: isUuid 400 (:132) -> getUser 401 (:136-143) -> `rateLimit(\`rsvp:${user.id}\`, {limit:60, windowSec:600})`
  (:147-148, raw rateLimit, NOT a named budget) -> `requireTermsAccepted(user.id)` (:150-151)
  -> JSON parse 400 -> `rsvpBlocked()` (:38-116): SERVICE-role reads of event/org/users;
  hidden org = 404 `not_found`; other campus = 403 `campus_visiting` unless a member of the club.
- DELETE: no Terms/hidden/campus gate on purpose ("Taking something back is never the
  write a consent gate is protecting", :186-196); same limiter key. Same reasoning applies
  to "remove my check-in".
- Write goes through the viewer's client (`supabase.from("rsvps").upsert`), RLS decides.

### src/app/api/events/[id]/route.ts (391 lines): DELETE + PATCH, officer tools
- Local `fail()` adds `message` too: `{ ok:false, error, code, message }` (:55-57).
- `loadForOfficer()` (:77-126): SERVICE role reads event (EVENT_ROW_COLUMNS), org, `loadOrgRole`.
  Org-less event -> 404 (:93). Hidden org -> officers 403 `org_hidden`, others 404 (:111-121).
  Not owner/admin -> 403 `org_role_required` (:122-124).
  NOTE: this TS gate does NOT let an org-less event's creator in, while `can_manage_event()`
  does. For check-in, use the DB's `can_manage_event()` (as attendees does, :61) so the
  route and RLS can't disagree, and add the hidden-org 403/404 split from :111-121 on top.
- DELETE (:155-231): limiter `event-delete:${user.id}` 30/600 (:166) BEFORE the role step;
  `requireNotRestricted` AFTER the role step (:172, "a stranger hears 403/404 only").
  Delete goes through the viewer's client (`events_delete_manager` RLS, :192-201).
  rsvps cascade with the event (:136-137) -> event_checkins must `on delete cascade` from
  events too ("deleting the event deletes them").
- PATCH (:306-391): `event-edit:${user.id}` 30/600 (:317) -> `requireCanPublish` (:320).
  `itemFor()` (:240-274) rebuilds one list item from `event_rsvp_counts`; when list items
  grow check-in fields, `itemFor` must add them too or an edited card loses its count.

### src/app/api/events/route.ts (528 lines): list GET + create POST
- GET (:105-380): getUser 401 -> NO rate limit on the list read today.
- `.gte("ends_at", nowIso)` (:164): AN EVENT LEAVES EVERY LIST THE MOMENT IT ENDS.
  Check-in runs until 1 h after the end and officers want "who came" afterwards, but the
  card (and its Manage attendees button) is gone by then. The API needs a past-events read
  for officers (see design, section 4.6). The org-scoped branch (:208-222) has the same filter.
- Counts: `event_rsvp_counts(p_event_ids)` on the VIEWER's client (:341-358; numbers only,
  re-applies event_visible, max 1000 ids). A new `event_checkin_counts` must follow the
  same contract (viewer client, auth.uid(), numbers only, <=1000 ids) AND apply the
  from-5 floor INSIDE the function: a client can call the RPC over REST directly, so a
  floor in TS alone would leak "2 were there" to anyone with devtools.
- Items built by `toEventListItem()` (src/lib/events/event-item.ts:59-89): add fields there
  (key order note at :7-9) so GET and PATCH stay one shape.
- `myAdminOrgIds` (:318-329) = club officers; org-less creator handled by `viewerCanManage`.
- POST (:389-528): `event-create:${user.id}` 10/3600 (:401), `requireCanPublish` (:429),
  insert with SERVICE role because INSERT on events is revoked from clients (:419-428).

### src/app/api/events/[id]/ics/route.ts (134 lines)
- GET, getUser 401, no `isUuid` (a bad id goes to PostgREST), no rate limit, and it returns
  `error?.message` raw in the 404 body (:46-50). Not part of check-in; noted only.

## 2. Limits: how they are declared

- `src/lib/limits/budgets.ts:18-49` named budgets `{limit, windowSec}`; `limitFor(name, userId)`
  (:59-61) keys `budget-<name>:<userId>` (:54-56): ONE dimension (the account). Per-event
  keys (needed for code guessing) must use `rateLimit()` directly with a custom key, as
  rsvp/event routes do (`rsvp:${user.id}`, `event-delete:${user.id}`), or budgets.ts gains a
  keyed variant. Recommendation: add the numbers to BUDGETS (one place for the numbers) and
  a small `limitForEvent(name, userId, eventId)` -> `budget-<name>:<userId>:<eventId>`.
- `src/lib/rate-limit.ts`: `rateLimit(key, {limit, windowSec, failClosed?, failLocal?})` (:81-86);
  windows must divide 86,400 (:42-46, refused otherwise; `rate-limit.test.ts:362` scans
  every `windowSec` literal in src/). `failClosed: true` = refuse when the DB can't count
  (:15-17): REQUIRED for the code-guess limiter (precedent: typed school code,
  `src/app/api/auth/school-email/confirm-code/route.ts:121-139`, 5 per user per window,
  failClosed; `src/app/api/me/school-checkin/route.ts:97` 5/900 failClosed).
- Deny cache (:26-30): once refused, the same key is refused in memory until the window ends.
- `tooManyRequests(result, message?, code?)` (:447-462): 429 + Retry-After; pass a message
  and code for the code-guess lockout, or the client shows the generic "You're going a
  little fast." (failure-copy.ts:188-190), which is wrong for "too many wrong codes".
- `src/lib/rate-limit-keys.test.ts`: no key may hold an IP or a header read; per-network
  limiters must use `clientNetworkCode(req, "<prefix>")` and the test pins the count of
  per-network limiters at 10 (:136-164). Adding one means editing NETWORK_LIMITS there.
- Limiter rows live in `public.rate_limits`; keys hold account ids + event ids only (no IP).
  A per-user-per-event key IS a small record ("this account tried a code at this event in
  this 10-min window"); rows are purged after 3 days (20261015120000_rate_limits_purge.sql).
  Worth one line in the Privacy Policy draft (the abuse-counts part already covers keys).

## 3. Function grants: the crash rule (affects every new RPC)

`supabase/migrations/20260922090000_guard_function_privileges.sql:1-51`: on this Postgres
image, calling a function the caller has NO EXECUTE on crashes the backend. Standing rule:
never revoke EXECUTE from anon/authenticated; grant it and refuse INSIDE with
`raise exception 'not allowed' using errcode = '42501'`. Service-only functions check
`current_setting('role', true) in ('anon','authenticated')` (pattern:
`20261016120000_views_as_service.sql:274-278`, grants :420-423). Table-level revokes are
safe (a refused write answers 42501, connection stays up).

## 4. DESIGN: check-in routes

### 4.1 Route map (all under src/app/api/events/[id]/ unless noted)

| Who | Method + path | Does | Budget (4.3) |
|---|---|---|---|
| student | `POST checkin` body `{code:"1234"}` or `{via:"link"}` | check in (idempotent) | code: 3 limiters, failClosed; link: `eventCheckinLink` |
| student | `DELETE checkin` | remove MY check-in (idempotent) | `eventCheckinSelf` |
| student | `GET checkin` | the check-in page/sheet: event title+club, `open`, `opens_at`, `closes_at`, `viewer_checked_in(_at)`, `count` (floored), `viewer_can_manage`, `pass_waiting` | `eventCheckinRead` (day window) |
| officer | `GET checkin/session` | `open`, `opened_at`, current `{code, link, window_ends_at}`, `next {code, link, starts_at}`, `server_now`, live `checked_in_count` | `eventCheckinScreen` |
| officer | `POST checkin/session` | open check-in (NEW secret every open, so old QR photos die) | `eventCheckinOfficer` |
| officer | `DELETE checkin/session` | close (check-ins kept) | `eventCheckinOfficer` |
| officer | `PUT checkin/marks/[userId]` | "Mark as here" (target must hold a going/maybe RSVP on this event) | `eventCheckinOfficer` |
| officer | `DELETE checkin/marks/[userId]` | undo one mark / remove one check-in | `eventCheckinOfficer` |
| officer | `DELETE checkin/marks` | clear ALL check-ins of the event -> `{cleared:n}` | `eventCheckinClear` |
| officer | `GET attendees` (extend) | + `checked_in_at` on each going/interested row, + `walk_ins[]` (checked in, no RSVP), + `checkin:{open,count}`; "Going but didn't come" = going rows with `checked_in_at:null`, derived client-side | new `attendeesRead` |
| anyone | `GET /c/[id]?t=<token>` (src/app/c/[id]/route.ts, NOT /api) | QR landing: park a signed 15-min pass in a cookie, 303 to `/events/[id]/checkin` | none needed: no DB call (4.4) |
| page | `/events/[id]/checkin` (src/app/events/[id]/checkin/page.tsx) | the student page (code box, or "Check in" when a pass waits) | via the API routes |
| lists | `GET /api/events` items (+ PATCH `itemFor`) | + `checkin_open`, `checked_in_count` (null <5 unless manager), `viewer_checked_in` | none today (see 4.6) |
| lists | `GET /api/events?org_id=<uuid>&when=past` | ended in the last 30 days, newest first, with `checked_in_count`; how officers reach "who came" after the card disappears, and where "N were there" is shown | as list |

Static segments win over `[userId]`, but `marks/` keeps the officer collection apart from
`session/` anyway. Next 16: `params` is a Promise (as today); a route.ts can't share a
segment with page.tsx (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:39),
hence `/c/[id]/route.ts` and `/events/[id]/checkin/page.tsx` live apart; cookies can be SET
only in a Route Handler or Server Function, READ in a Server Component
(node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:6,74,81).
No `/events` or `/c` page exists today (`src/app/events`, `src/app/c` absent).

### 4.2 Gate order (copy the precedents)

Student POST checkin:
1. `isUuid(id)` else 404 `not_found` (the [id] route's choice, :157).
2. `getUser()` else 401 `unauthorized`.
3. Parse JSON (400 `invalid_json`); exactly one of `code` / `via:"link"`.
   code: strip spaces and dashes, must be `/^\d{4}$/`, else 400 `checkin_code_format`
   BEFORE any limiter (confirm-code precedent :110-119: malformed input costs nothing).
4. Limiters (4.3), before any database read.
5. `requireNotRestricted(user.id)` (Terms + restriction, src/lib/moderation/access.ts:203).
   NOT requireCanPublish: checking in is not publishing.
6. Link path only: read + verify the pass cookie (4.4); bad/missing/expired -> 409
   `checkin_link_expired`.
7. SERVICE role: `rpc("event_checkin_as", { p_user: user.id, p_event_id, p_code, p_token, p_seen_at })`.
   Service-only on purpose: if a browser could call the checker over REST it would skip
   the route's attempt limits, so 4-digit guessing would be unlimited. Grant EXECUTE to
   anon/authenticated/service_role and refuse the two browser roles INSIDE (crash rule, 3).
   The function re-checks everything except attempts: event exists, not a hidden club,
   visible to p_user (event_visible rewritten for p_user: event_visible/can_manage_event read
   auth.uid(), which is NULL under the service role; precedent views_as_service.sql:27-34),
   session open, now within [starts_at - 1 h, ends_at + 1 h], code/token valid for window
   w or w-1 (w = floor(epoch/30)), then insert ... on conflict do nothing.
   Returns one word: `checked_in | already | wrong_code | closed | outside_window | not_found`.
8. Map: checked_in/already -> 200 `{ok:true, checked_in_at, already}`; wrong_code -> 400;
   closed / outside_window -> 409; not_found -> 404. Link path success clears the cookie.
- No campus gate (unlike RSVP's `campus_visiting`): the code IS the proof of being there.
- No location of any kind: no geolocation call, no "verify you're nearby".

Student DELETE checkin: isUuid -> getUser -> `eventCheckinSelf` -> delete own row (viewer
client if RLS has a delete-own policy, else a tiny auth.uid() function). No Terms, hidden-
club or window gate (RSVP DELETE reasoning, rsvp/route.ts:186-196). A restricted account is
refused by the proxy like RSVP DELETE (proxy.ts:203-210 allowlist, gate at :318-328); deleting the account
removes the rows anyway. Leave the proxy allowlist unchanged.

Officer routes: isUuid -> getUser -> limiter -> (writes) `requireNotRestricted` -> viewer
client RPCs that check `can_manage_event(p_event_id)` INSIDE (auth.uid()), plus the frozen
club split from [id]/route.ts:111-121 (officer 403 `org_hidden`, else 404). These can be
browser-callable security-definer functions: a manager calling them over REST only does
what the route does. The session secret never leaves the database; officers get derived
codes only. Every officer write returns the new state so the screen needs no re-read.

### 4.3 Budgets (all windows divide 86,400; keys hold account and event ids only, no IP)

Proposed additions to `BUDGETS` (src/lib/limits/budgets.ts:18-49), plus a keyed helper
`limitForEvent(name, userId, eventId)` -> key `budget-<name>:<userId>:<eventId>` that can
pass `failClosed`:

| Budget | Key | Limit / window | failClosed | Used by |
|---|---|---|---|---|
| `eventCheckinCode` | user + event | **5 / 600 s** | yes | POST checkin {code} |
| `eventCheckinCodeDay` | user + event | **10 / 86,400 s** | yes | POST checkin {code} |
| `eventCheckinCodeAny` | user | **20 / 3,600 s** | yes | POST checkin {code}, any event (stops one account spraying every event on campus) |
| `eventCheckinLink` | user | 30 / 600 s | no | POST checkin {via:"link"} (96-bit token: guessing is not the threat) |
| `eventCheckinSelf` | user | 30 / 600 s | no | DELETE checkin |
| `eventCheckinRead` | user | 1,000 / 86,400 s | no | GET checkin (a DAY window, as `schoolEventsRead`, so the count never says WHEN someone looked) |
| `eventCheckinScreen` | user | 120 / 600 s | no | GET checkin/session (the door screen polls once per 30 s window: 20 per 10 min per device; two devices plus wake-ups stay far under) |
| `eventCheckinOfficer` | user | 120 / 600 s | no | open/close, mark/unmark (a 100-person Going list ticked by hand fits) |
| `eventCheckinClear` | user | 10 / 600 s | no | DELETE checkin/marks (all) |
| `attendeesRead` | user | 120 / 600 s | no | GET attendees (no limit today) |

All three code limiters run on every code attempt (right or wrong), before any read.
Each refusal answers `tooManyRequests(rl, <line>, "checkin_too_many_tries")`; a refusal
with `reason === "unavailable"` (limiter down, failClosed) gets its own line and code
`checkin_unavailable` ("Check-in is busy right now. Try again in a minute."), never "too
many tries" (the same distinction rate-limit-keys.test.ts:17-20 enforces for the school
email and the school check-in).

No per-network limiter for check-in, on purpose: a whole party on campus Wi-Fi can sit
behind one address, and a network cap would lock out a real crowd. Accounts are the
scarce thing (waitlist codes, school email, human check). If one is wanted later: a high
ceiling (`eventCheckinNet` 600 / 600 s via `clientNetworkCode(req, "event-checkin-net")`),
fail-open, and NETWORK_LIMITS in rate-limit-keys.test.ts:136-164 goes from 10 to 11.

### Code guessing: the numbers

- Code = 4 digits from HMAC-SHA256(session secret, "code:" || w), w = floor(unix_seconds/30),
  first 4 bytes as an unsigned int mod 10,000, zero-padded (bias about 1 in a million).
  The checker accepts w and w-1, so a typed code works for 30 to 60 s and at most 2 of the
  10,000 codes are live at once: p <= 2/10,000 = 0.02% per guess.
- One account, one event, 10 minutes: <= 5 guesses -> <= 0.1%.
- One account, one event, one UTC day: <= 10 -> <= 0.2%. An Indiana evening event (7-11 pm
  EDT = 23:00-03:00 UTC) straddles UTC midnight, so it can see two day windows: <= 20
  guesses -> <= 0.4%.
- Worst legal case: a 14-day event (events_max_duration CHECK) with check-in left open the
  whole time, about 15 day windows -> <= 150 guesses -> <= 3% for that one account.
- Across events: <= 20 guesses an hour per account, whatever the event.
- N accounts multiply linearly (10 accounts on one evening event <= 4%), and every
  account had to get through the waitlist, a school email and the human check. The prize
  is a line on a list only officers see, and an officer can remove it.
- Brute force over REST is closed because the checker is service-role only (4.2 step 7).
- Option if Franky wants it tighter: 6 digits (same budgets -> 100x smaller), or auto-close
  a session 12 h after it opens (bounds the 14-day case).

### QR token

- Token = HMAC-SHA256(session secret, "qr:" || w), first 12 bytes, base64url = 16 chars
  (96 bits). Different prefix from the code, so one never reveals the other.
- Valid for w and w-1 AT THE TIME OF THE SCAN (60 s at most). A photo of the screen
  forwarded to a group chat dies within a minute, and a new secret on every "Start
  check-in" kills all earlier photos.
- Only the database knows the secret (new `event_checkin_sessions.secret`, no client
  grant); the officer's screen gets derived codes + the link from `checkin/session`, with
  `server_now` so the countdown follows server time, and `next` so one missed poll never
  blanks the screen.

### 4.4 The QR link and the signed-out visitor

THE PROBLEM. A token lives 60 s at most, and signing in takes longer (the school code
email takes ~30 s to a minute and can land in Junk; the human check; Terms; maybe the
school-email step). Carrying `?t=` through `next` would arrive dead. And on iPhone the
camera opens Safari, whose cookies are NOT the home-screen app's, so many students who
live in the installed app will be signed out there.

How signed-out pages work today: the proxy does NOT redirect React pages (only `/profile`
and the /html shells, proxy.ts:346-402); each page calls `enforceCampusAccess(currentPath)`
(src/lib/auth/campus-access.ts:23-55), which sends a signed-out visitor to
`/auth/login?next=<path+query>` and carries the same `next` through Terms
(/auth/terms), school email and onboarding. `sanitizeLoginNextParam`
(src/lib/auth/login-next.ts:37-42) keeps the query; `getPostLoginDestination` honours a safe
relative `next` (src/lib/auth/post-login.ts:26-28). So the return path IS kept; only the
token's clock is the issue.

THE DESIGN.
1. QR text: `${getSiteUrl()}/c/<eventId>?t=<token>` (getSiteUrl, src/lib/auth/site-url.ts:31;
   never the Host header). About 80 characters: a small, easy QR on a phone screen.
2. `GET /c/[id]` (src/app/c/[id]/route.ts): checks the shapes only (uuid; token
   `/^[A-Za-z0-9_-]{16}$/`), NO database call. Sets cookie
   `vibe_checkin_pass = <eventId>.<token>.<seenAtMs>.<sig>`,
   sig = HMAC-SHA256(server secret, "event-checkin-pass:v1|" + eventId + "|" + token + "|" + seenAtMs),
   `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`. Then 303 to
   `/events/<eventId>/checkin`: the token leaves the address bar, so copying the URL
   forwards nothing. A bad shape: 303 to the same page without a cookie (it shows the
   code box). Holds no account, no IP, no location.
   Secret: derive from an existing server secret with that purpose tag (precedent:
   `limiterNetworkCode` uses SCHOOL_EMAIL_VERIFY_SECRET per purpose, rate-limit.ts:344-355),
   so no new Vercel variable; or a new `EVENT_CHECKIN_PASS_SECRET` (cleaner, one Vercel
   step). Missing/short secret = no pass is set, the page shows the code box.
3. `/events/[id]/checkin` page: `await enforceCampusAccess(\`/events/${id}/checkin\`)` (no
   token in `next`), then reads the cookie (`await cookies()`, read-only in a Server
   Component) to set `pass_waiting` when the cookie's eventId matches. The page shows
   "Check in to <title>" with one button when a pass waits, else the 4-digit box.
   One tap, not an automatic check-in: a record of where someone was should be their own
   act, and a link preview (iMessage etc.) only ever does a cookieless GET.
4. The tap: `POST /api/events/<id>/checkin {via:"link"}`. The route reads the cookie,
   verifies sig (timingSafeEqual), eventId match, `seenAt` within the last 15 min and not
   in the future, then passes `p_token` + `p_seen_at` to `event_checkin_as`, which checks
   the token against window(seenAt) and window(seenAt)-1 and the CURRENT open + event
   window. Success or "already" clears the cookie (Max-Age=0).
   Why signed: an unsigned `seenAt` would let anyone replay an old photo with a made-up
   time. Why it is safe: the pass only proves this browser saw a live code within the last
   15 minutes, which is what standing at the door proves.
5. A signed-in visitor goes through the same `/c` -> page -> one tap, so there is one path.
6. A suspended or banned visitor: the proxy sends every page, `/c` included, to
   /account/suspended (proxy.ts:318-328; `/c` is not an /api path), and the POST is refused.
7. Later, store apps: a universal link / App Link for `/c/*` opens the native app directly
   (parked with the store work until Apple accepts).
8. Local dev: the QR uses NEXT_PUBLIC_SITE_URL, so a real phone scanning a localhost QR
   lands on production. Test the link by pasting it, or set NEXT_PUBLIC_SITE_URL to the
   LAN address for a phone test.

PRIVACY POLICY IMPACT of the pass: section 7 says "The only cookies Vibe sets are the ones
that keep you signed in" (src/app/legal/privacy/sections-6-8.tsx:42-48). The pass cookie
breaks that sentence, so the same-day policy update must add it (one line: a check-in
link leaves a note in your browser for 15 minutes, with the event and the time you opened
the link, nothing about you). The no-cookie alternative (sessionStorage pass minted by an
unauthenticated POST) needs an anon per-network limiter AND a "Kept in your browser"
line, so it is not simpler. The plain fallback (signed out = "sign in, then type the
code") needs no policy line but loses the QR for exactly the students in the app.

### 4.5 CSP (src/lib/security/csp.ts)

- Server routes: nothing. The proxy puts no policy on /api answers (proxy.ts:258).
- `/c/[id]` is a redirect; `/events/[id]/checkin` is a normal React page ("app" flavour,
  nonce): nothing new.
- QR drawn in the browser as inline `<svg>` (or an `<img src="data:image/svg+xml...">`):
  `img-src` already allows `data:` and `blob:` (csp.ts:206). No new host.
- No QR library is installed (`node_modules` has none, package.json has none). Options:
  a small bundled encoder (no CDN, so no script-src change), or a hand-written encoder in
  src/lib. Never an outside QR image service: img-src would refuse it, and it would hand
  the live token to a third party.

### 4.6 Counts on the events list, and past events

- One viewer-client RPC, `event_checkin_counts(p_event_ids uuid[])` -> rows
  `(event_id, open boolean, checked_in_count int|null, viewer_checked_in boolean)`, same
  contract as `event_rsvp_counts` (auth.uid(), numbers only, re-applies event_visible,
  <=1000 ids, 22023 past that). The floor is INSIDE: a manager (can_manage_event) gets the
  exact number, everyone else null below 5. `open` = session open AND inside the window.
- GET /api/events: call it next to `event_rsvp_counts` (route.ts:341-348) and pass three
  new fields through `toEventListItem` (event-item.ts:59-89): `checkin_open`,
  `checked_in_count`, `viewer_checked_in`. PATCH's `itemFor` ([id]/route.ts:240-274) too.
  A failure here should NOT 500 the list (unlike RSVP counts, route.ts:349-352): null and
  false mean "render nothing" and are honest; log it. Recommendation, Franky can overrule.
- Past events: `GET /api/events?org_id=<uuid>&when=past`, events that ended in the last
  30 days, newest first, same item shape + counts. Without it, an officer loses the
  Attendees button the moment the event ends (route.ts:164), and nobody ever sees
  "N were there". Same hidden-club rule as the org branch (route.ts:212-216).
- The list GET has no limit today. Every new route gets one; this is an extension, so
  optional: a day-window `eventsRead` (like `schoolEventsRead` 2000/86,400) would cover it.

### 4.7 Error codes and copy (for vibeRequest / describeFailure)

`vibeRequest` (src/lib/feedback/request.ts) reads `{code, error}` + Retry-After;
`describeFailure` (src/lib/feedback/failure-copy.ts:107-232) passes a 409/403 `error`
through when it reads as a sentence (:64-74, :221), shows the caller's fallback for most
400s (:222-227), and a generic line for 429 (:188-190). So: the code box calls with
`quiet: true` and words 400/429 itself by `code`; 409s pass through as written.

| Status | code | error (student line) |
|---|---|---|
| 400 | `checkin_code_format` | Enter the 4-digit code on the screen at the door. |
| 400 | `checkin_code_wrong` | That code didn't match. It changes every 30 seconds, so check the screen and try again. |
| 409 | `checkin_closed` | Check-in isn't open for this event right now. |
| 409 | `checkin_outside_window` | Check-in opens an hour before the event and closes an hour after it ends. |
| 409 | `checkin_link_expired` | That link has expired. Type the 4-digit code from the screen instead. |
| 429 | `checkin_too_many_tries` | Too many tries for this event. Ask an officer to mark you as here. |
| 429 | `checkin_unavailable` | Check-in is busy right now. Try again in a minute. |
| 404 | `not_found` | That event is no longer available. |
| 403 | `org_role_required` | Only the club's owner and admins can run check-in. |
| 403 | `org_hidden` | You can't change this club's events right now. |
| 403 | `checkin_not_on_list` | You can mark people who said Going or Interested. |
| 409 | `checkin_window_closed` (officer open/mark after end + 1 h) | This event's check-in window has passed. |

Shape: `{ ok:false, error, code }` like rsvp/events (plus `message` if the [id] route's
fail() is reused). Never the word "safety".

### 4.8 Calls for Franky (each with a recommendation)

1. Signed-out QR: 15-minute pass cookie + one policy line (recommended), or "sign in, then
   type the code" (no policy line, worse for app users on iPhone).
2. Pass secret: derive from SCHOOL_EMAIL_VERIFY_SECRET with a purpose tag (recommended, no
   Vercel step), or a new EVENT_CHECKIN_PASS_SECRET.
3. "Mark as here" window: same as check-in, 1 h before to 1 h after (recommended, one rule),
   or allow until 24 h after for officers tidying up the list.
4. 4 digits (as asked; <= 0.4% per account per evening event) or 6.
5. "N were there" on the club page's past events for everyone (from 5), or officers only.
6. One tap to check in from the QR (recommended) or automatic on open.

### 4.9 Tests the build should add (local stack only)

- Route tests in the resolve-hook style (src/lib/limits/social-limits.test.ts): every code
  attempt hits the three limiters in order before any read; a refusal is a 429 with the
  right code; `unavailable` gets the busy line; malformed codes never touch a limiter.
- rate-limit.test.ts window scan picks the new windows up automatically (all divide 86,400).
- rate-limit-keys.test.ts: new keys hold no header/IP (automatic scan).
- Pass cookie: forged sig, other event id, seenAt in the future, seenAt > 15 min, all 409.
- Local Supabase (http://127.0.0.1:54321): as `authenticated`, calling event_checkin_as
  over REST answers 42501 (not a crash); the floor holds over REST (4 check-ins -> null for
  a non-manager); a non-manager gets nothing from the codes RPC; deleting the event and
  deleting the user both remove the rows.
