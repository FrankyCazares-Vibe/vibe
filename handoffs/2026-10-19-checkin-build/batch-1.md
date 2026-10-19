# Batch 1: server, new check-in routes (notes)

Started Oct 19. Read the whole contract, AGENTS.md and
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
(Next 16: `params` is a Promise; route.ts can't share a segment with page.tsx).

## Files (owned)

- `src/lib/events/checkin-route.ts` (server-only helpers)
- `src/app/api/events/[id]/checkin/route.ts` (GET / POST / DELETE)
- `src/app/api/events/[id]/checkin/door/route.ts` (GET / POST / DELETE)
- `src/app/api/events/[id]/checkin/marks/route.ts` (DELETE: clear all)
- `src/app/api/events/[id]/checkin/marks/[userId]/route.ts` (PUT / DELETE)
- `src/app/api/me/event-checkins/route.ts` (GET)
- `src/lib/sentry-config.ts` (`checkin` in AUTH_PARAM_KEYS) + its test
- `src/lib/events/checkin-routes.test.ts`

## Start-of-batch observations

- Batch 0 files read: `event-checkin.ts` is byte-equal to the contract's
  section 2 block; budgets diff is in; the migration is applied locally
  (2 tables, 10 functions, schema_migrations row present).
- The dev server at http://localhost:3000 was NOT answering when this batch
  started (no listener on :3000; Supabase at :54321 answers). Per the rules I
  did not start one; the curl check waits for it (see the end of this file).

## Built (first pass)

- `checkin-route.ts` holds: `checkinFail` / `checkinFailed` (the `{ ok:false,
  code, error }` body, sentence from CHECKIN_ERRORS), `noStore`,
  `signedInViewer` (getUser on the cookie client, else 401),
  `checkinTriesRefused` (eventCheckin 429: `checkin_too_many_tries`, or
  `checkin_unavailable` when `rl.reason === "unavailable"`),
  `checkinBusyRefused` (every other budget: the plain line, no code), the word
  maps (`officerRefusal`, `doorStatusResponse`, `openWordResponse`,
  `closeWordResponse`, `markWordResponse`, `unmarkWordResponse`,
  `clearOutcome`, `selfWordOutcome`), `doorFeedFrom` + `doorResponse`,
  `readViewerState` + `viewerStateFailure` + `checkedInFallback`,
  `parseCheckinBody`, `myCheckinsFrom`.
- Every handler in the five route files wraps its answer in `noStore`, so
  every GET (errors and 429s included) carries `Cache-Control: no-store`. The
  door's POST/DELETE carry it too (they hold codes); marks and clear as well,
  harmless.
- Sentry: `checkin` added to AUTH_PARAM_KEYS, named in both doc comments;
  new test in sentry-config.test.ts (plain link, encoded next= once and twice,
  `/api/me/school-checkin` untouched). 65/65 pass.

### Small choices inside the contract (say if you disagree)

- `readViewerState` runs the events read and the state RPC together
  (Promise.all) instead of one after the other: same answers, one round trip.
- `doorFeedFrom` normalises every time to `toISOString()` (Postgres sends
  `+00:00` and microseconds), and builds `next` only when the database sent
  `next_code` AND `next_token` as strings (otherwise `next: null`, `current`
  still shown). With the real function both are always there while open.
- POST `terms_required` from event_checkin_self_as answers
  `checkinFail(403, "terms_required")` (same status and code as
  `termsRequiredResponse()`, sentence from CHECKIN_ERRORS); `restricted`
  answers `accountRestrictedResponse()` as the contract says.
- ~~After a successful Stop, the door read can still refuse ... the route
  passes that refusal through.~~ CHANGED in review round 2 (below): once
  close says `closed`, Stop always answers 200 with a feed.
- `toCount` is imported from `@/lib/events/event-item` (Batch 2's file; only
  the existing export is used).

## Tests and checks (Oct 19, ~21:20 UTC)

- `node --test --experimental-strip-types src/lib/events/checkin-routes.test.ts`:
  30/30 pass. Covers every item in contract 6's `checkin-routes.test.ts`
  list (malformed code/token cost no limiter; invalid_body / invalid_json;
  limiter -> requireNotRestricted -> service RPC order; key
  `budget-eventCheckin:<uid>` with `{ limit: 20, windowSec: 86400,
  failClosed: true }`; both 429 codes; `p_user` = the signed-in id whatever
  the body says; every self word; DELETE on the viewer client with
  `.eq("user_id", uid)` and no gate; door links from localhost vs the site
  URL (never the Host); every door status; POST/DELETE door order; marks,
  unmark, clear; me's `org` mapping; no-store on every GET incl. errors and
  429s; no log line holds a code, a token or a user id, even when the
  database's error message does).
- `node --test --experimental-strip-types src/lib/sentry-config.test.ts`: 65/65.
- `npx tsc --noEmit -p .`: exit 0 (with the other batches' files as they
  stood). `npx eslint` on my nine files: exit 0. `npm test`: 3270/3270.
- Read-only probes of the real functions over the local REST interface with
  the routes' exact argument names (scratchpad `checkin-rpc-probe.mjs`):
  10/10 (door jsonb shape as the fixture, not_manager for a member, state
  row with null count, mine array, self_as refused 42501 for a browser role
  and a word for the service role, open/mark/clear refuse a member).

## Done-when curl check: BLOCKED, not run

- No dev server on :3000 the whole batch (curl exit 7, connection refused,
  waited ~5 min with retries). The Browser pane's `vibe` preview on :3000 was
  "stopped by the app" about 7 h 45 min before this batch. The rules say
  never start another, so I didn't.
- Ready to run once `next dev` is up (writes only through the app's routes;
  deletes its own test event at the end and checks 0 rows are left):
  `node /private/tmp/claude-501/-Users-franciscocazares-vibe/76ffacf4-23bb-4896-88fa-d5279cec7dfd/scratchpad/checkin-curl-check.mjs`
  It does: avery creates "Batch 1 check-in test (delete me)" on
  chat_seed_club starting in 10 min; door GET (closed); blake's code before
  start -> 409 checkin_closed; avery Start -> feed with code + localhost
  link; blake Start -> 403; malformed code -> 400; blake checks in with the
  feed's code -> 200; again by the QR token -> already; GET state; door
  count 1; Settings list; Mark blake -> 409 not_on_list; blake DELETE;
  Stop; old code -> 409 checkin_closed; Clear -> 0; delete the event.

## Last pass

- Every word the database isn't meant to send now logs one line naming only
  the step (`[events/:id/checkin open] unexpected answer`) and answers 500.
- Re-ran: route tests + Sentry tests 95/95, tsc exit 0, eslint exit 0. No
  "safety", "location" or geolocation anywhere in my files.
- Dev server still down at hand-in (last try ~21:25 UTC). The curl check is
  the one open item.

## For the other batches

- Batch 3/4: every refusal body is `{ ok: false, code, error }` with
  `error = CHECKIN_ERRORS[code]`, except `account_restricted` (the shared
  `accountRestrictedResponse()`, sentence without the full stop) and what
  `requireNotRestricted` sends itself (`terms_required` / `account_restricted`
  / a plain 500). 429s from eventCheckin carry `code`
  (`checkin_too_many_tries` | `checkin_unavailable`); every other 429 has
  no code and the line "Too many check-in requests. Try again in a few
  minutes."
- Batch 4 (door): `current`/`next` times are `toISOString()` (`...Z`, ms);
  `opens_at`/`closes_at`/`server_now` too. Not open = both null.
- Batch 4 (Stop), CORRECTED in review round 2: any 403 or 404 from Stop
  now means "not stopped". A 200 means stopped; its feed may be the
  fallback (`opens_at`/`closes_at` "", `count` 0, `server_now` the route's
  clock) when the read after close refused or failed; the next GET brings
  the real values or its own refusal. A suspended officer's Stop is refused
  by the PROXY (403 account_restricted) and check-in stays open.

## Review round 2 (Oct 19, later)

Five findings checked against the code and the contract.

1. FIXED (my part). Stop: once `event_checkin_close` says `closed`, the
   route answers 200 with a feed even when the door read after it refuses
   (club hidden since, restricted) or fails: `stoppedResponse` +
   `closedDoorFeed` in checkin-route.ts. Comments in door, marks and clear
   routes no longer claim a suspended officer can stop/unmark/clear: the
   proxy refuses them first. OPEN FOR THE ORCHESTRATOR: D8 ("They can stop")
   contradicts D12 (proxy unchanged; `restrictedApiAllowed` has no check-in
   path). Either allowlist DELETE `/api/events/<id>/checkin/door` (and
   marks/clear) in src/proxy.ts, or strike "They can stop" from D8.
2. STILL BLOCKED (environment). No listener on :3000 at this round either
   (curl exit 7; Supabase :54321 answers 200). Rules forbid me starting one.
   The orchestrator runs
   `node /private/tmp/claude-501/-Users-franciscocazares-vibe/76ffacf4-23bb-4896-88fa-d5279cec7dfd/scratchpad/checkin-curl-check.mjs`
   once `next dev` is up (it spends 4 of blake's 20 eventCheckin tries for
   the UTC day; run it once). Its expectations still hold after this round
   (blake can see chat_seed_club's event, so his Start stays 403).
3. FIXED. `not_manager` from any officer call (door GET/POST/DELETE, mark,
   unmark, clear) now goes through `notManagerResponse`: one viewer-client
   `events.select("id").eq("id", id).maybeSingle()`; RLS hides it -> 404
   `not_found`, visible -> 403 `org_role_required`, read error -> 500. Only
   non-officers pay for the read. A narrowing of 3.3's "not_manager -> 403"
   (the attendees route's rule); the UI never sees the difference.
4. NOT CHANGED, orchestrator's call (both halves sit outside my say):
   - `CHECKIN_ERRORS.checkin_too_many_tries` (Batch 0's file) promises
     "mark you as here", which `event_checkin_mark` refuses for anyone
     without a Going/Interested RSVP. Suggested: "Too many tries today. If
     you said Going or Interested, someone running check-in can mark you as
     here."
   - Charging only real guesses means a state read (under eventCheckinRead)
     BEFORE the eventCheckin limiter, against 3.0 / 3.2's explicit
     limiter-first order and the test list's order. Security-neutral (GET
     shows open/checked_in free; any code comparison still comes after the
     charge). Ready to build on a yes: answer `checkin_closed` /
     `checkin_outside_window` / 200 `already` free only when the read shows
     the row with !open or checked_in; a missing row (not_found) falls
     through to the charged path, since self_as has no campus rule.
5. FIXED. `isSupabaseServiceConfigured()` now runs before the limiter (an
   environment check, not a database read), so a missing key is the 500 with
   its log line instead of 429 `checkin_unavailable` forever.

Checks after the fixes: route tests 32/32 (2 new: Stop's fallback; the
not_manager 403/404/500 split on all six officer calls), Sentry 65/65,
`npx tsc --noEmit -p .` exit 0, eslint on my nine files exit 0, `npm test`
3294/3294. No "safety", "location" or geolocation in my files.
