# Visual pass harness — working notes (wave 2, W2-V)

Written before the first step and appended after every step. The README.md
beside it is the finished index; this file is the log of how the harness was
built and what it hit.

## Step 1 — what stands between a request for /messages and the first paint

Server side (read `src/proxy.ts`, `src/lib/supabase/middleware.ts`,
`src/lib/auth/campus-access.ts`, `src/lib/supabase/{server,service,env}.ts`,
`src/app/messages/page.tsx`):

1. `proxy()` → `updateSession(request)` → `@supabase/ssr` `createServerClient`
   (cookie storage) → `supabase.auth.getUser()` → **`GET <SUPABASE_URL>/auth/v1/user`**
   with `Authorization: Bearer <access_token>` from the cookie. The session in the
   cookie must have `expires_at` in the future or the client tries a refresh
   (`POST /auth/v1/token?grant_type=refresh_token`). The proxy reads
   `user.app_metadata.restriction` (absent → not restricted) and nothing else
   for `/messages`.
2. `MessagesPage` → `enforceCampusAccess("/messages")`:
   - `createSupabaseServerClient().auth.getUser()` → the same **`GET /auth/v1/user`**;
   - `createSupabaseServiceClient().from("users").select("otto_answers, school_verified, terms_version, terms_accepted_at, age_attested_at").eq("id", user.id).maybeSingle()`
     → **`GET /rest/v1/users?select=…&id=eq.<id>`** (service role key in `apikey` /
     `Authorization`). Gates, in order: `hasRecordedConsent(row)` (needs
     `terms_accepted_at`, `age_attested_at`, `terms_version === "2026-05-07"`),
     `school_verified` truthy, `isOttoOnboardingComplete(otto_answers)` (a
     non-empty object). Any miss → `redirect()` to /auth/terms, /auth/school-email
     or /onboarding.
3. Nothing else on the server for `/messages`; the page is then `MessagesSwitch`
   (client) → `useIsMobile()` (matchMedia `(max-width: 899px)`) → `MobileShell` +
   `MessagesMobile`. SSR renders the desktop tree (the `messages.html` iframe);
   the phone tree replaces it on hydration — the iframe request is blocked in the
   harness so it never loads.

Env the server needs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase/env.ts`, `service.ts`). No other
env is read on this path (`chat_v2` is answered by the mocked `/api/me/features`).

Cookie: `@supabase/ssr` 0.6 reads `sb-<first hostname label>-auth-token` (chunks
`.0`, `.1`… optional), value `base64-<base64url(JSON session)>`; the session
must be `{ access_token, refresh_token, expires_at (number, seconds), … }`.
With `NEXT_PUBLIC_SUPABASE_URL=http://localhost:<port>` the key is
`sb-localhost-auth-token`.

Client side — every fetch the shell and the new screens make (grep of
`vibeRequest(` / `fetch(` under `src/components/mobile/messages`, `MobileShell.tsx`,
`MessagesMobile.tsx`, `src/lib/chat/*.ts`):

- `GET /api/me/features` (the flag; `use-chat-v2.ts`)
- `GET /api/me/threads?scope=chats`, `GET /api/me/inbox`,
  `GET /api/me/calendar?from=&to=` (the home; `MessagesHome.tsx`)
- `GET /api/me/threads/<id>/messages?limit=50` (a `?channel=` deep link,
  `MessagesMobile.tsx`; the room's first read, `use-room-poll.ts`), then
  `?after=<iso>&limit=200` every 4 s, `?before=` (Earlier), `?root=<id>&limit=200`
  (a Board fold), `POST …/read`
- `GET /api/orgs/<handle>/space` (the space), `…/space?events=1` (Share an event)
- `POST /api/me/threads/<id>/cards`, `PUT …/cards/<mid>/vote`
- `PUT|DELETE /api/events/<id>/rsvp` (the RSVP sheet, the event card)
- `DELETE /api/me/threads/<id>/messages/<mid>` (Remove), `POST …/react`
- `POST /api/me/threads` (`?to=`), `GET /api/me/suggested-connections`,
  `GET /api/users/search` (the compose overlay — not shot)
- `MobileShell` / `MobileTabBar` fetch nothing.

Everything under `/api/**` is answered by Playwright `page.route` from
`fixtures.mjs`; anything not in the table is logged and answered 404 JSON.

Theme: `<html data-theme>` is set before paint by `THEME_BOOT_SCRIPT` from
`localStorage.vibe_theme` (`light | dark | system`). The harness sets
`localStorage.vibe_theme = "dark"` (Night) or `"light"` in `addInitScript`
before every load; the screens read `useNightTheme()` = `data-theme === "dark"`.

## Step 2 — the fake Supabase works; no scratch page needed

`tools/fake-supabase.mjs` (port 54321) answers `GET /auth/v1/user`, `POST
/auth/v1/token`, and `GET /rest/v1/users?…&id=eq.<harness id>` (the consent /
school / otto row); every other PostgREST read answers `[]` (or PostgREST's
406 "0 rows" for a single-object read) and is logged `UNMOCKED`.
`tools/harness-session.mjs` prints the cookie: `sb-localhost-auth-token=base64-…`
(the key is `sb-${hostname.split(".")[0]}-auth-token`, `@supabase/supabase-js`
`dist/index.mjs:373`; `@supabase/ssr` 0.6 wraps the JSON session as
`base64-` + base64url).

`next dev -p 3111` with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY=harness-anon-key`,
`SUPABASE_SERVICE_ROLE_KEY=harness-service-role-key` (no other env; there is no
.env.local in the cloud):

    curl -H "Cookie: $(node tools/harness-session.mjs)" http://localhost:3111/messages
    → status=200, no redirect; the fake saw GET /auth/v1/user ×2 (the proxy, then
      enforceCampusAccess) and one GET /rest/v1/users?select=otto_answers,school_verified,
      terms_version,terms_accepted_at,age_attested_at&id=eq.<id>.

So the real `/messages` page renders behind the real gates; the scratch
`src/app/_visual/page.tsx` fallback was not needed and no source file is touched.

Fonts: Chromium in the cloud cannot reach Google Fonts (outbound goes through an
agent proxy with its own CA). `curl` can, so the two stylesheets (the app's from
`layout.tsx`, the mockups' from `W0_*.dc.html`) and their 14 woff2 files were
downloaded once into `tools/fonts/` and `shoot.mjs` serves them by `page.route`
for `fonts.googleapis.com` / `fonts.gstatic.com`. Same glyphs as production.

Playwright: the repo has none; `playwright@1.55` was installed in the scratchpad
(never in the repo) and launched with `executablePath: /opt/pw-browsers/chromium`
(the installed build is revision 1194; 1.55 looks for 1193).

Clock: the browser's `Date` is frozen with `page.clock.setFixedTime` at
**Thu 2026-10-08 18:12 America/Indiana/Indianapolis** (timers keep running, so
polling and vaul's animations are unaffected) and every fixture timestamp is
computed from that same instant, so `Live now`, `Tonight · 9:30 PM`, `Ended ·
chat open N more days`, `Yesterday`, `Tue`, `Oct 5 – 11` all come out the
same on every run. `--real-time` shoots against the wall clock instead (the
fixtures shift with it; some labels then depend on the hour).

## Step 3 — fixtures

`tools/fixtures.mjs` builds every answer from `NOW` (harness-notes step 2):
- viewer `11111111-…` (Harness Student, an officer — `admin` — of Salsa Club,
  so `viewer.can_moderate` is true and the picker shows `Remove`);
- clubs: **Salsa Club** (pinned 2 days ago, unread Board post, 12 new in the
  Lounge, next event Fall Formal LIVE, the viewer going), **Chess Club** (muted
  7 days, a Lounge preview by Priya, 3 new), **Night Hikers** (the officer's
  brand new club: 1 member, no events, empty rooms);
- events: Fall Formal (live, started 30 min ago), Late Night Social (tonight
  9:30 PM, within 24 h → `Soon`, the viewer maybe), Beginner Lesson (next
  Tuesday, quiet, no room), Open Practice (ended 2 days ago, chat open),
  Welcome Mixer (ended 19 days ago, closed), Salsa Social (live, the viewer
  NOT going — the Lounge's event card);
- `/api/me/calendar`: 3 `rsvp` entries this week (live / maybe / ended);
- `/api/me/threads?scope=chats`: 2 dms (Sam, pinned, `You:` preview; Dana,
  unread), 1 group (Study Buddies, 3 members), 1 request (Ava);
- the Lounge: 13 rows — text runs by three people (one with a 🔥 reaction), a
  poll with voters (the viewer picked one), an anonymous multi poll that is
  closed, a sign-up (a full slot, one the viewer took, one open), a live event
  card (viewer not going), a cancelled event card, a stub, the viewer's own
  removed message, a quote, an own text;
- the Board: 4 posts (owner / admin bylines, one a card post, `reply_count`
  12 / 3 / 0 / 3), `?root=` → 2 replies + a stub;
- event rooms: Fall Formal (live, 6 rows, `going` 5 people), Open Practice
  (`after`), Welcome Mixer (`closed`, `can_post: false`);
- `PUT …/vote` echoes the card; `POST …/cards` answers 201 with a fresh poll
  row; `PUT|DELETE /api/events/<id>/rsvp`, `POST …/read`, `…/react`,
  `DELETE …/messages/<mid>` answer `{ ok: true }`.
Variants (set per state): `clubsEmpty`, `weekEmpty`, `inbox500`, `inboxDelayMs`,
`shareEmpty`. The canonical answers are dumped to `tools/fixtures/*.json` on
every run.

## Step 4 — shooting (what went wrong on the way)

- The Next dev-tools badge (`<nextjs-portal>`, bottom-left) sat over the
  composer's "+" and Playwright's click on the "+" timed out on "receives
  pointer events"; it also showed in every shot. Hidden from page start by an
  `addInitScript` style (`nextjs-portal{display:none!important}`) and removed
  before each screenshot. Nothing in the app is touched.
- `waitForSelector('[role="status"]')` for the event chat's state pill timed
  out although the pill was on screen: the first `[role="status"]` in the DOM
  is the toast host's hidden live region. The closed chat now waits for the
  tile text `This chat is closed.`.
- The frozen clock makes the SSR desktop tree (the calendar widget the
  `MessagesSwitch` renders before hydration) hydrate with a different month
  than the server rendered ("Oct 2026" vs "Sep 2026") → React logs a hydration
  mismatch in the console (`console.json`). It is the harness's clock, not the
  app: the phone tree replaces that widget on the first client render and the
  screens are unaffected. `--real-time` makes it go away.

## Step 5 — the run, the records, the copy

- Full run: 24 states × 2 themes = 48 app shots + 13 mockups = 61 PNGs, all
  under 300 KB (five were palette-quantized by sharp from 300–580 KB:
  `08-club-lounge-full-*`, `11-event-live-night`, `21-long-press-remove-night`,
  `mockup-W0_Room`). `unmocked.json` is `[]`.
- Two states needed a second try: `12-event-closed` (the wait on
  `[role="status"]` hit the toast host's hidden live region first; now waits
  for the closed tile's text) and `22-empty-club` (the screen writes `It’s`
  with a typographic apostrophe; now a regex). Both were re-shot with
  `--only=`, which merges into `shots.json` / `console.json`.
- `--real-time` check on `01-home-all`: zero console entries, so the hydration
  mismatch in `console.json` is the frozen clock (the SSR desktop calendar
  widget), not the screens.
- Copied into `handoffs/chat-redesign/wave-2-build/visual/`: the PNGs, the
  three records, `README.md`, and `tools/` (`fake-supabase.mjs`,
  `harness-session.mjs`, `fixtures.mjs`, `shoot.mjs`, `build-readme.mjs`,
  `package.json`, `fonts/`, `fixtures/` = the canonical JSON answers dumped by
  the run). `shoot.mjs`'s default paths for the mockups and sharp are relative
  to that `tools/` folder; `MOCKUPS_DIR` / `SHARP_DIR` override them.
- `git status` after `next dev`: only the new `visual/` folder; nothing under
  `src/`, and `AGENTS.md` unchanged (its `next dev` block was already committed).

## Step 6 — run 2, after the three repairs (HEAD `4066fd1`)

- Same harness, fixtures and frozen clock; the tools copied to the scratchpad
  again (Playwright there), `next dev -p 3111` against the fake on 54321, the
  real `/messages` behind the real gates (200, no redirect).
- The first full pass at HEAD measured `window.innerWidth` = `scrollWidth` = 409
  on 30 of 36 states: the week bloom, now centred on the live card (VIS-S1-2),
  reaches past the week section and mobile Chromium widens the layout viewport
  (S2-notes R8 / S3-notes REQUEST 5, not landed). The composer's "+" then sits
  off the 375 visual viewport and Playwright's click times out: 14 (15, 16),
  17, 18, 19, 25, 35 FAILED. Every shot now records `layout` so the number is
  in the record, and `--clip-week` injects the one-line R8 clip harness-side so
  a second pass (`run2/clip/`) shows every state at 375. Both are kept.
- Twelve states added from the reviews' "not shot" lists (25–36) with six new
  fixture variants. Two needed a second try: `34-board-failed` — a 500 on the
  `?channel=` deep link's thread GET never opens the club (`MessagesMobile`
  resolves the room through it), so the state opens the Lounge and taps the
  Board chip; `28-member-lounge-picker` — the picker's Report button is
  `aria-label="Report this message"`, and the 700 ms `page.mouse` press did not
  open the picker on Chess's two-row Lounge (it does on Salsa's, 21), so the
  bubble's `Message actions` button opens it instead.
- `build-readme.mjs` gained a "layout" column (and a TDZ bug on the way: the
  helper was declared after its first use; fixed).
- Records: `run2/` 81 PNGs (56 app shots, 12 FAILED, 13 mockups) + 3 records, `run2/clip/` 72 app shots + 3 records; `unmocked.json` `[]` in both.

## Step 7 — run 3, the integrated head, no clip (HEAD `2cdcfbe`)

- `npm run build` first: exit 0 (no env; the Supabase env is read lazily).
  Then the same setup as run 2: the tools copied to the scratchpad (Playwright
  installed there, never in the repo), `node fake-supabase.mjs` on 54321,
  `next dev -p 3111` against it, `/messages` 200 behind the real gates.
- One pass, `OUT_DIR=../run3 node shoot.mjs --no-mockups` — no `--clip-week`,
  no other workaround. 72 shots, 0 FAILED, 0 unmocked; `window.innerWidth` =
  `scrollWidth` = 375 on all 72 measurements. The clip is in the app now
  (`home/YourWeek.tsx:96`, INT-ADJUDICATE-1), so the composer's "+" is on the
  visual viewport and the eight click-blocked states of run 2's HEAD pass shoot
  without help.
- `shoot.mjs` now also writes `viewport.json` (per state and theme, the two
  widths; a FAILED shot would carry its note instead) so the number the repair
  is judged by is one file, not a column inside `shots.json`.
- Pixel-compared `run3/` against `run2/clip/` (a scratchpad script over the
  repo's sharp, 8-level threshold): 44 of 72 identical; the 28 that differ are
  the other integration repairs (the Board's post layout on 09/10, the inverted
  "+" on 14, the club dot on the sheets 15–19/25, the Retry pill's ink on
  23/32–35) plus quantization noise on two Night PNGs. Nothing from the clip.
- The Monitor filter on the shoot log first matched `Error` in React's
  hydration stack (`RedirectErrorBoundary`); re-armed on `FAILED` / a layout
  other than `375/375` / the exit line. `pkill -f "next dev"` matched the shell
  running it (exit 144); `pkill -f "[n]ext dev"` does not.
- `git status` after: `run3/`, `README.md`, this file and `tools/shoot.mjs`;
  nothing under `src/`, `AGENTS.md` unchanged.

