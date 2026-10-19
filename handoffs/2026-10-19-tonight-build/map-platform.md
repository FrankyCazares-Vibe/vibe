# Map: platform pieces (Tonight build, Oct 19 2026)

Lens: switch pattern, server fetch + cache, ICS parser, Jaguars feed, IU LiveWhale,
rate-limit budgets + tests, CSP, featured-pick storage. READ-ONLY notes.

## 3. The Jaguars feed (fetched ONCE, 2026-10-19 05:30 UTC, saved as `jaguars.ics`)

- URL `https://iuindyjags.com/calendar.ashx/calendar.ics?sport_id=0` -> 200, `text/calendar`,
  88 KB, 221 VEVENTs, Sept 19 2026 to Apr 26 2027 (whole season, past results included).
- Behind Imperva CDN (sets `visid_incap_*` cookies). `cache-control: private`. No ETag/Last-Modified
  seen in the headers (`jaguars.headers.txt`), so no conditional GET: just re-fetch every 2h.
- `X-WR-CALNAME:IU Indy Athletics`, `X-PUBLISHED-TTL:PT120M` (the feed itself says 2h: matches the brief).
- SIDEARM Sports generator. CRLF line endings. Lines are NOT folded (77 lines are longer than
  75 chars and there are no continuation lines) but a parser should still unfold to be safe.
- Fields on every VEVENT: UID, DTSTAMP, DTSTART, DTEND, LOCATION, SUMMARY, DESCRIPTION, URL, PRIORITY.
  No TZID anywhere, no RRULE, no VTIMEZONE, no CATEGORIES, no STATUS.
- Times: 147 events are `DTSTART:20261022T190000Z` (UTC, Z). 74 are all-day/TBA
  `DTSTART;VALUE=DATE:20261019` with `DTEND;VALUE=DATE:20261020` (end is exclusive next day).
  DTEND for timed games is synthetic (start + 2h or 3h), not a real end.
- SUMMARY shape: `[R] IU Indy <Sport> <vs|at> <Opponent>[ - <Promo>]`
  - `[W]` `[L]` `[T]` `[N]` prefix = RESULT on past events (N = no W/L, e.g. invites). Upcoming
    events have no prefix. Strip `^\[[A-Z]\]\s*`.
  - `vs` = home or neutral site, `at` = away. Opponent follows. Promo after ` - `
    (e.g. "Fan Appreciation Night", "Senior Day"). Tournaments: "vs Horizon League Tournament".
  - Sport list: Men's/Women's Basketball, Volleyball, Men's/Women's Soccer, Swimming, Golf,
    Cross Country, Tennis.
- HOME test = LOCATION starts `Indianapolis\, Ind.` Home venues seen: James T. Morris Arena (35),
  IU Natatorium (26), Michael A. Carroll Stadium (11), The Jungle (2), bare "Indianapolis, Ind." (2).
  Away LOCATION is just "City\, State". "This week at the arena" = home + timed + next 7 days.
- LOCATION has an escaped comma (`\,`) -> unescape.
- DESCRIPTION repeats the SUMMARY, then `\n` lines: result score ("L 2-3"), "TV: ESPN+",
  "Streaming Video: <espn url>", "Tickets: <ticketmaster url>". Plain-text only: we should not
  render these links (keep to the one URL credit-back), maybe parse "TV: ESPN+" at most.
- URL is the game page `https://iuindyjags.com/calendar.aspx?game_id=17430&amp;sport_id=14`:
  it carries a literal HTML entity `&amp;` -> decode `&amp;` to `&` before linking.
- Next two weeks (from the saved file): Oct 22 swim vs Ball State at the Natatorium (19:00Z = 3pm ET),
  Oct 29 Volleyball vs Northern Kentucky at the Arena (23:00Z = 7pm ET), Nov 2 Men's Basketball
  vs Miami (Middletown) at the Arena (16:00Z = noon ET). Everything else is away. So most nights
  the athletics part will be EMPTY: the UI must handle zero school items.
- Courtesy note: my one request to iuindyjags.com carried a User-Agent that included Franky's IU
  email as a contact (a mistake on my part: his address should not have gone to an outside site).
  The IU fetch used a generic one. The build should send a plain User-Agent (product name + site
  URL, no personal email) and fetch at most every 2h.

## 1. Switch pattern (how "school events on/off" should look)

- `src/lib/feature-flags.ts` (13 lines) only holds `NEXT_PUBLIC_SHOW_GLOBAL_FEED`: a build-time public
  flag. NOT the pattern to copy (public, baked into the client bundle).
- The real pattern is `src/lib/chat/flag.ts` + `flag-server.ts` (and `src/lib/push/config.ts`, the
  original): PURE module, no imports, every reader takes `env = process.env` so `node --test` passes
  a fake env (flag.test.ts).
  - `chatV2MayRunHere(env)` flag.ts:57 = `VERCEL_ENV === "production" || NODE_ENV === "development"`
    (a Preview build shares the PROD database, so a copied switch must do nothing there).
  - `chatV2Enabled(env)` flag.ts:65 = `env.CHAT_V2_ENABLED === "true" && chatV2MayRunHere(env)`
    (exactly "true"; "TRUE", "1", " true" are off).
  - `chatV2Everyone(env)` flag.ts:74 = enabled AND `ALLOWLIST.trim() === "*"` (star must be the whole value).
  - Server-only wrapper `chatV2For(userId)` flag-server.ts:75 (imports "server-only"), fails closed,
    warns once per instance about odd lists (flag-server.ts:57).
  - Client gets it as a SERVER PROP, never NEXT_PUBLIC_: `src/app/campus/page.tsx:47`
    `const desktopChat = await chatDesktopFor(userId)` -> `<CampusSwitch desktopChat={...}>` (:56-60).
  - Documented in `.env.example:225-254` (Production only, never Preview, server-only, "a changed
    value applies from the next deploy").
- School events are not per-person, so the needed shape is the push/chat "enabled" half only, e.g.
  `src/lib/events/school/flag.ts` (pure): `schoolEventsMayRunHere(env)` (same rule as flag.ts:57) and
  `schoolEventsEnabled(env) = env.SCHOOL_EVENTS_ENABLED === "true" && mayRunHere`. Memory rule
  "switches are off buttons set to *": an allowlist var adds nothing for a campus-wide calendar; if the
  team wants symmetry use `SCHOOL_EVENTS_ALLOWLIST=*` with the flag.ts:74 semantics, but one switch is enough.
- SPEED of the off button: a Vercel env change needs a redeploy (full build; Turbopack build cache is
  OFF, next.config.ts:88), i.e. minutes. A faster no-deploy off already exists as a PATTERN:
  `public.app_settings` (see section 6) read with a 30s module memo (`src/lib/waitlist/signup-open.ts:22-63`).
  Suggested: env switch = ON/OFF at deploy; an OPTIONAL `app_settings` row `school_events_off`
  (jsonb boolean) that, when present and true, hides them within 30s. Absent row = no override, so
  shipping needs NO prod DB write; a founder inserts the row only if he ever needs the fast kill
  (that insert is a prod DB write -> Franky's OK at that time).
- Recommended flow: the server decides; the client never reads a flag. The Tonight read (server
  component or route) returns `school: []` plus `schoolOn: false` when off, and the UI hides the
  School chip and the "This week at the arena" block when `schoolOn` is false.

## 2. Server-side fetch + cache in THIS app (Next 16.3.4, no Cache Components)

- `next.config.ts:80-89`: `experimental` has only `turbopackFileSystemCacheForBuild: false`.
  NO `cacheComponents`. Nothing in src uses `"use cache"`, `unstable_cache`, `cacheLife`,
  `cacheTag` or `fetch(..., { next: ... })` today (grep: zero hits).
- Docs (node_modules/next/dist/docs/01-app/):
  - `03-api-reference/01-directives/use-cache.md:27`: `use cache` is a Cache Components feature, needs
    `cacheComponents: true` in next.config. Turning that on changes the whole app's rendering model:
    do NOT do it for this feature.
  - `03-api-reference/04-functions/unstable_cache.md:5-8`: "This API has been replaced by `use cache`
    in Next.js 16." Treat as deprecated: avoid.
  - `02-guides/caching-without-cache-components.md` ("Previous Model", the model this app is in) and
    `03-api-reference/04-functions/fetch.md`: `fetch(url, { next: { revalidate: 7200, tags: [...] } })`
    persists the response in Next's Data Cache across requests, stale-while-revalidate (serves the
    cached copy, refreshes in the background once older than 7200s). Opt-in works even after cookies()
    (explicit caching). "Only responses with a 200 HTTP status code are stored" (fetch.md). Do not
    combine `revalidate` with `cache: 'no-store'` (both ignored). Memoization does NOT apply inside
    Route Handlers (fetch.md "Memoization" note), the Data Cache still does.
  - `revalidateTag(tag, 'max')` takes a second argument now (guide, "revalidateTag" section), if an
    admin "refresh now" is ever wanted.
- App precedent: `src/lib/waitlist/signup-open.ts:5-16,22-58` uses "a plain module memo; no Next cache
  API" with an in-flight promise to dedupe. Recommended shape for the feeds:
  1. `fetch(FEED_URL, { headers: { "user-agent": "<product>/1 (+https://www.connectvibe.app)" },
     next: { revalidate: 7200, tags: ["school-events"] }, signal: AbortSignal.timeout(5000) })`
     (Data Cache = shared 2h window, the "at most every 2h" rule for the site).
  2. Parse into a small array and keep it in a module memo keyed by fetch time (parse once per
     instance per refresh, plus an in-flight promise so a cold instance fetches once).
  3. Any failure (non-200, timeout, parse error, oversize body > ~1 MB) -> return the last good memo
     or `[]`; never throw into the page; log once per instance (flag-server.ts:34-40 shape).
  - Caveat: stale-while-revalidate across several cold instances can let a few refreshes happen close
    together; at 2h that is a handful of requests a day, well inside a 30s crawl delay in practice. A
    strict guarantee would need a cron + a store (DB write -> not v1).
  - Dev: `next dev` serves fetch from the HMR cache; a hard refresh (`cache-control: no-cache`) bypasses
    revalidate (fetch.md "Hard refresh"), so local testing CAN hit the site often: test against the
    saved `jaguars.ics` fixture instead.
- CSP: server-side fetches are not governed by the browser CSP. `src/lib/security/csp.ts:192`
  connect-src = self, supabase, r2, sentry; :206 img-src. Plain `<a href>` links back to
  iuindyjags.com / events.iu.edu are navigations (no directive covers them). No CSP change needed as
  long as the browser never fetches the feed or loads a logo (the brief says no logos).

## 4. IU LiveWhale (events.iu.edu)

- Docs: `documentation.events.iu.edu/feed-and-linked-calendars/ical-feed.html` documents ONE iCal form:
  `https://events.iu.edu/live/ical/events/group_id/<N>`. `.../feeds.html` documents (for rss; same
  LiveWhale path grammar) `/group/<Exact Title>/`, `/tag/<Tag>` (case-sensitive, repeatable) and
  `/only_starred/true` ("events starred as a featured event"). No documented max/start/end params,
  no rate limits, no terms. Questions -> events@iu.edu.
- Group ids from `documentation.events.iu.edu/groups/groups-list.html` (the trailing number after each
  name). Relevant IU Indianapolis ones:
  - **24 IU Indianapolis Student Affairs** (fetched, see below; id CONFIRMED: its event URLs are
    `events.iu.edu/studentaffairs-indianapolis/event/...`)
  - **342 IU Indianapolis Featured Events** (NOT fetched; the best candidate for "Featured by your
    school"; the feed builder lists it as "IU Indianapolis Featured Events")
  - 4 IU Indianapolis (top-level "IU Indianapolis Calendar"), 50 IU Indianapolis Athletics (overlaps
    the Jaguars feed: don't use both), 484 Student Services, 460 Undergraduate Student Government,
    388 Jagathon, 440 Gamers Hall, 481 First-Year Experience, 555 LGBTQ+ Center, 40 Events and
    Conference Services, 117 Academic Calendar.
  - There is no "Student Life" or "Student Involvement" or "Housing" group in the list. Purdue only has
    "Purdue School of Engineering and Technology - 70": NO Purdue Indianapolis student-life source.
  - Confidence: 24 is confirmed. 342's id is the same list's number, so very likely right, but what it
    contains (how many, student-facing or not) is UNKNOWN until one fetch.
- Fetched ONCE: `https://events.iu.edu/live/ical/events/group_id/24` at 05:37 UTC Oct 19 -> 200,
  `text/calendar;charset=UTF-8`, 176 KB, 125 VEVENTs, Oct 19 2026 to Mar 18 2027 (future only).
  Saved as `iu-group-24.ics` (+ `iu-group-24.headers.txt`). CloudFront; `x-throttle-*: 1` headers and
  `x-smart-cache-bot: 1` (they tag bots; keep it to every 2h). `X-WR-CALNAME:Indiana University Events`
  (generic: the calendar name does NOT identify the group; the URLs do).
- Format differences from the Jaguars feed (the parser must handle BOTH):
  - Lines ARE folded at 75 octets (CRLF + space): unfolding is required (URL, DESCRIPTION, TAGS all fold).
  - Timed events are UTC `DTSTART:20261019T190000Z`; all-day `DTSTART;VALUE=DATE:`. No TZID lines;
    `X-LIVEWHALE-TIMEZONE:America/New_York` on every event (same offset as Indianapolis).
  - 25 events carry `RRULE:FREQ=WEEKLY;UNTIL=...Z;INTERVAL=1` (all fitness classes). LiveWhale writes
    DTSTART as the NEXT occurrence (all start Oct 19+), so for "tonight" DTSTART alone is right; for
    "this week" expand WEEKLY up to 7 days (or skip expansion: a weekly series has one hit per 7 days).
  - Multi-day all-day events are emitted ONCE PER DAY with per-day UIDs
    (`20261019T040000Z-2278983@events.iu.edu`, same X-LIVEWHALE-ID 2278983): dedupe by X-LIVEWHALE-ID.
  - Text carries HTML entities INSIDE the ICS escaping (`&#160\;`, so after unescaping `&#160;`), and
    `X-ALT-DESC;FMTTYPE=text/html`, `X-LIVEWHALE-SUMMARY` (HTML), `X-LIVEWHALE-CONTACT-INFO` (HTML with
    staff emails). Use SUMMARY + LOCATION + URL only; decode a few entities; never render HTML fields.
  - Extra fields: CATEGORIES (comma list), `X-LIVEWHALE-TAGS` (pipe list), GEO, ATTACH /
    `X-LIVEWHALE-IMAGE` (images: do not load: brief says no logos, and the CSP img-src would refuse it),
    `X-LIVEWHALE-COST`, `X-LIVEWHALE-RSVP:1` (the school's own RSVP, not ours), `X-LIVEWHALE-ID`.
  - No STARRED/featured marker in this feed.
- CONTENT of group 24 is NOT student-night material as-is: 42 of 125 are staff conferences
  (tags `Conference`, `Professional Development Page - National`, `Travel Required`, locations like
  Minneapolis/Toronto), 25 are weekly Campus Rec fitness classes (`Group Fitness Classes`), 4 are
  `Internal Events` (staff, e.g. a United Way cook-off). With the ranking rule "#1 = soonest school
  event", a Zumba class would be #1 most evenings. If 24 is used: drop tags `Conference`,
  `Professional Development*`, `Internal Events`, `Travel Required` and probably `Group Fitness Classes`,
  and drop all-day items from "Tonight". Real student items this week: Graduate School Fair (Oct 21,
  Campus Center), Flu Shot Clinic (Oct 21, Inlow Hall), Stress Busters Week items, Sober October.
- RECOMMENDATION: v1 school sources = Jaguars HOME games + LiveWhale group 342 (Featured Events, which
  is also the natural "Featured by your school" #1) and optionally group 24 with the tag filter above.
  Before relying on 342, fetch it ONCE (and events.iu.edu/robots.txt) during the build and look.
  `/only_starred/true` on a group (e.g. `.../group_id/24/only_starred/true`) is a second, documented way
  to get the school's own starred picks (form documented for rss; the ical form is inferred, unverified).
- Campus scope: both feeds are IU Indianapolis. The Indianapolis campus is shared IU Indy + Purdue Indy
  (memory): show them to both, credit "IU Indianapolis" / "IU Indy Athletics" by name.

### Files in this folder (fixtures)
- `jaguars.ics`: the raw Jaguars feed (no personal data; ticket/stream links only).
- `iu-group-24.trimmed.ics`: the IU group 24 feed with ONLY the fields we use, re-folded at 75 octets
  with CRLF (so it still tests unfolding). The raw copy held 118 staff contact lines
  (`X-LIVEWHALE-CONTACT-INFO`, mailto links), so it was moved OUT of the repo folder (handoffs are in
  git) to the session scratchpad. Use the trimmed file as the test fixture; do not commit raw feeds.

## 3. ICS parser

- package.json: NO ical library (no ical.js / node-ical / rrule). Deps list package.json:13-44.
  Don't add one: the two feeds use a tiny subset and a hand parser is ~150 lines of pure TS.
- PROTOTYPED (scratchpad, not the repo) and run on both saved feeds: Jaguars 221 events (74 all-day,
  221 with URL, 0 RRULE), IU group 24 125 events (75 all-day, 25 RRULE), times print right in campus
  time (e.g. Oct 22 19:00Z -> Thu 3:00 PM). Edge cases checked: a folded SUMMARY, `\,` and `\;`,
  `&amp\;` entity, a `javascript:` URL (dropped), a VALARM inside VEVENT (ignored), STATUS:CANCELLED
  (dropped), `TZID=America/New_York` at the DST fall-back hour (01:30 Nov 1 -> 05:30Z, first instance),
  quoted `TZID="America/Chicago"` (19:00 -> 00:00Z).
- Shape to build (pure module, no imports, erasable TS only, so `node --test` loads it directly, like
  `src/lib/chat/flag.ts`), e.g. `src/lib/events/school/ics.ts`:
  1. Size guard first: refuse bodies over ~1-2 MB, stop after ~2000 VEVENTs.
  2. Unfold: `text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "")` then split on `\n` (RFC 5545 3.1).
  3. Walk lines; inside VEVENT track nested BEGIN/END (VALARM) and skip their properties.
  4. Split each line at the first `:` NOT inside a double-quoted param value (char loop with a quote
     flag; avoid a lookahead regex). Name = up to first `;`, upper-cased; params = the rest.
     Keep the FIRST occurrence of each name.
  5. Text values (SUMMARY, LOCATION, DESCRIPTION): unescape `\\ \; \, \n \N`, then decode a small
     entity set (`&amp; &lt; &gt; &quot; &apos; &nbsp; &#NNN; &#xHH;`, 160 -> space, reject 0 and
     surrogates), strip `<...>` tags, strip control and bidi-override chars (U+202A-202E, U+2066-2069),
     collapse spaces, cap ~200-500 chars. React escapes on render, so this is about clean text, not XSS.
  6. Dates: `VALUE=DATE` or 8 digits -> all-day, midnight in campus zone; `...Z` -> `Date.UTC`;
     floating or `TZID=` -> wall time in that IANA zone via `Intl.DateTimeFormat` two-pass offset
     (unknown zone -> campus zone). Campus zone constant already exists:
     `CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis"` at `src/lib/push/event-notice.ts:51`
     (that file may not be import-free; copy the string into the pure module or a tiny shared const).
     DTEND missing -> treat as start + 2h for "has it ended" (Jaguars ends are synthetic anyway);
     all-day DTEND is exclusive.
  7. URL: decode entities (`&amp;` in the Jaguars URLs), `new URL()`, keep only `https:` and only the
     feed's own host (`iuindyjags.com`, `events.iu.edu`): the link-back credit can never point elsewhere.
  8. Drop STATUS:CANCELLED. Dedupe by `X-LIVEWHALE-ID` (falls back to UID).
  9. RRULE: honor only `FREQ=WEEKLY|DAILY` with `INTERVAL`, `UNTIL`, `COUNT`, no BY* parts, expanded
     only inside the 7-day window; anything else -> DTSTART only (LiveWhale already sets DTSTART to
     the next occurrence). No EXDATE appears in either feed.
- Jaguars post-processing: strip `^\[[A-Z]\]\s*` from SUMMARY; `home = /^Indianapolis\\?,\s*Ind\./`
  on LOCATION; "This week at the arena" = home + timed + start within 7 days; credit "IU Indy Athletics".
- IU post-processing: tag filter (section 4), drop all-day from "Tonight", credit "IU Indianapolis events".
- `src/lib/push/event-notice.ts:51` has only `import type` (line 22), so a pure module can import
  `CAMPUS_TIME_ZONE` from it without pulling a runtime dependency into the test.

## 5. Rate-limit budgets, tests, CSP

- `src/lib/limits/budgets.ts:18-43`: 12 named per-account budgets for signed-in WRITES
  (`prefs`, `react`, `orgOfficer`, ...), `limitFor(budget, userId)` :53 -> `rateLimit("budget-<name>:<uid>")`.
  It says on purpose that views/typing/read marks have no budget (Privacy Policy 3d) :9-14.
- A signed-in GET READ declares its own constant and key, after getUser (the precedent to copy):
  `src/app/api/me/clubs/route.ts:22` `const LIST_LIMIT = { limit: 60, windowSec: 60 };` and :73-79
  `getUser()` -> `rateLimit(\`me-clubs:${user.id}\`, LIST_LIMIT)` -> `tooManyRequests(rl, "Too many tries. Try again in a minute.")`.
  Same in `src/app/api/me/followed-orgs/route.ts:29,68-74`. (GET `/api/events` route.ts:105 has NO
  limiter on GET; only POST at :401.) So for `GET /api/campus/tonight` (or whatever it is called):
  `const TONIGHT_LIMIT = { limit: 60, windowSec: 60 }` + key `campus-tonight:${user.id}`, OR add a
  named `tonightRead` entry to BUDGETS if the brief's "budget in budgets.ts" is meant literally
  (either passes the tests). If the Tonight data is read in the server component
  (`src/app/campus/page.tsx`) instead of a route, no limiter is needed for it.
- Limiter rules enforced by tests:
  - `src/lib/rate-limit.test.ts:362` source-scans every `windowSec` in src/: must divide 86,400 and be
    <= a day, and be a literal or same-file constant (60, 600, 3600, 86400).
  - `src/lib/rate-limit-keys.test.ts:1-20`: no key built from an IP / `clientIp(` / `headers.get(`.
    Key on the user id (signed-in only) and never an address.
  - Signed-out reads have their own cap (`src/lib/security/anon-read-limit.ts`): the Tonight route
    should be signed-in only (401 otherwise), like `/api/me/clubs`.
- Test conventions: `package.json:10` `"test": "node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')"`
  (untracked tests run too). Node here is v25.9.0. Pure modules (no imports) are imported directly.
  Anything that imports `@/...`, `server-only`, `next/server` or Supabase uses the RESOLVE HOOK:
  `module.registerHooks` (Node >= 22.15) mapping `@/x` -> `src/x.ts` and adding `.ts` to bare
  relative specifiers (`src/components/campus/rolling-strip-view.test.ts:10-43`), plus a `STUBS` map of
  `data:text/javascript,` modules for `server-only` (empty), `next/server`, the two Supabase clients and
  `@/lib/rate-limit` reading fakes from `globalThis` (`src/lib/limits/social-limits.test.ts:42-60`,
  `src/lib/security/anon-read-limit.test.ts:47-60`). Only erasable TypeScript (no enums, no
  parameter properties, no namespaces). Header comment says "Run with: node --test <file>" and why the hook.
  - Suggested tests: `ics.test.ts` (pure, against `iu-group-24.trimmed.ics` and `jaguars.ics` copied
    to a test fixture or inlined snippets: unfolding, escapes, entities, Z/DATE/TZID/DST, cancelled,
    URL host lock, size cap), `flag.test.ts` for the school switch (exactly "true", Preview off, dev on),
    `tonight-rank.test.ts` (featured first, then happening-now, soonest school, then clubs; counts
    under 5 -> null; never by popularity), and a route test with the hook if a route is added.
- CSP: no change for server fetches (`src/lib/security/csp.ts:192` connect-src is for the browser).
  Only if the browser ever fetched a feed or showed a feed image would `connect-src`/`img-src`
  (:192, :206) need the host. Links out are fine.

## 6. Featured pick storage (no schema change?)

- YES, a key/value table exists: `public.app_settings` (`supabase/migrations/20261003100000_waitlist.sql:135-150`):
  `key text primary key check (key ~ '^[a-z0-9_]{1,64}$')`, `value jsonb not null`, `updated_at`, `updated_by uuid`.
  CHECK constraints only bind the two existing keys (`signup_open` boolean, `waitlist_email_viewers`
  array) :141-145, so a new key like `tonight_featured` or `school_events_off` needs NO schema change.
  RLS on, all grants revoked from anon/authenticated (:221-225): service role only.
  The migration's post-check (:477-480) that pins the key set runs once at apply time only.
- Readers today: `src/lib/waitlist/signup-open.ts:30` (rpc `signup_is_open`, 30s memo) and
  `src/lib/waitlist/store.ts:86-96` (`readEmailViewers`, service client `.from("app_settings")`).
- NOBODY WRITES IT FROM THE APP: there is no admin UI or route that updates `app_settings`; the
  launch switch is flipped by hand SQL (`signup-open.ts:6-7`, table comment :227-229). The admin
  routes are under `src/app/api/admin/*` (orgs, users, images, reports, waitlist, usage, numbers,
  content, actions): none for settings.
- So a FOUNDER-chosen "featured event of the day" would need either (a) hand SQL each day (a prod DB
  write -> Franky's explicit OK each time: not workable daily), or (b) a new admin route
  `POST /api/admin/tonight-featured` (pattern: `src/app/api/admin/orgs/[slug]/verify/route.ts:34-75`:
  `requirePlatformAdmin()`, JSON body check, `rateLimit(\`admin-...:${gate.userId}\`, { limit: 30, windowSec: 600 })`,
  service-client write, `logModerationAction`). Catch: `logModerationAction` takes a `ModerationAction`
  union (`src/lib/auth/require-platform-admin.ts:138-162`) and the DB has `moderation_actions_action_check`
  (last rewritten in the waitlist migration :241-242), so LOGGING a new action type is a MIGRATION.
  Writing the row without a log breaks the "every admin write is logged" norm.
- RECOMMENDATION: "Featured by your school" should be the SCHOOL's own pick, which needs no DB at all:
  LiveWhale group 342 "IU Indianapolis Featured Events" (or `/only_starred/true` on a group). Rule:
  the soonest not-ended item from that feed today = #1 with the "Featured by your school" label;
  otherwise fall back to the soonest school event (happening-now first). A founder override can be
  v2 (route + migration for the log type, with Franky's OK).
