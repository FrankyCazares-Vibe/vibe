# Batch 2: existing event routes, lists, data checks (Oct 19)

Owner of: `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`
(itemFor + imports), `src/app/api/events/[id]/attendees/route.ts`,
`src/lib/events/event-item.ts`, the four tests in `src/lib/events/`
(`event-checkin`, `checkin-migration`, `event-item`, `attendees-route`) and
`scripts/sql/event-checkins-check.sql`.

## Progress

- Read CONTRACT.md in full, AGENTS.md, the Next 16 route-handler guide.
- `event-route.test.ts`: its fake `rpc` answers every name with the RSVP
  count rows; `parseCheckinStateRows` reads those as "not open, no count",
  so it needs no edit (checked when the tests run, below).
- `event-item.ts`: `ctx.checkin?: CheckinStateRow`; `...checkinListFields(ctx.checkin)`
  after `org`; header comment's key-order line updated.
- `api/events/route.ts`: `past` (org_id + `when=past`), `baseQuery(embed, pastView)`
  (the campus branch passes `false` explicitly), `event_checkin_state` in the
  RSVP-counts `Promise.all`; an error logs `[events GET checkin state]` with
  `{ code }` only and leaves an empty map (never a 500). Docblock updated.
- `api/events/[id]/route.ts`: `itemFor` only + one import; the state RPC in its
  `Promise.all`; an error gives `checkin: undefined`.
- `attendees/route.ts`: limiter right after getUser (429 with the shared
  "Too many check-in requests..." line, no code); event read selects
  `id,starts_at,ends_at`; after the gate, ONE `Promise.all` of the RSVP read,
  the `event_checkins` read and the state RPC (contract says RSVP read, then
  the two together; running all three at once saves a round trip on a 20 s
  poll and changes no answer). Every answer carries `Cache-Control: no-store`
  (3.0). Walk-ins are sorted by name then id (their rows carry no time, so
  without an order the list could reshuffle on every poll). A "no" RSVP who
  checked in is a walk-in. `tsc` clean.
- Tests written and green: `event-checkin.test.ts` (15), `checkin-migration.test.ts`
  (14; also redoes derive's HMAC in Node and matches the post-check's fixed
  values `7710/UVxx...` and `5852/qlMy...`, and checks the list's MAX_LIMIT 200
  sits under the state RPC's 1000-id cap), `event-item.test.ts` (4),
  `attendees-route.test.ts` (11). `event-route.test.ts` still 20/20, unedited.
- Next: `scripts/sql/event-checkins-check.sql` on the local stack.
- SQL check in progress: fixtures, O (open), S (self_as), D (door), M (mark)
  all pass on the local stack. Note for batch 4: someone who said "Can't go"
  and checked in with the code is a walk-in (`status: null`); the database
  refuses to mark them (`not_on_list`) but unmark works on anyone.
- `scripts/sql/event-checkins-check.sql` (530 lines): fixtures, O, S, D, M, F,
  R, Y, U, C, X. Run twice on the local stack:
  `event-checkins-check: all 119 cases passed`, exit 0, and afterwards no
  `ecc-` account, no `ECC` club, no check-in row and no session left (it
  ends in ROLLBACK). S3 (an s-2 code) skips itself only if that code happens
  to equal a live one; it did not.

## Results

- `npm test`: 3279 / 3279 pass. `npx tsc --noEmit -p .`: 0 errors (whole
  project, once batch 3's sheet landed). `npx eslint` on every batch-2 file:
  clean. `npm run lint`: 33 errors, all in old files no batch touches
  (src/components/ui/*, mobile/*, the-map, a handoffs/ support.js).
- Local PostgREST (127.0.0.1:54321, anon, read-only): the
  `users!event_checkins_user_id_fkey` embed resolves (42501 for anon, not
  PGRST200), and `rpc/event_checkin_state` answers `[]` for anon.
- The dev server at localhost:3000 refused connections from this sandbox, so
  there was no browser or curl pass here; the list's `when=past` wiring was
  checked with a throwaway stub test (not committed): the past chain is
  `lt ends_at now, gte ends_at now-30d, order starts_at desc, limit min(n,20)`,
  the upcoming chain unchanged, and a failed state read answers 200 with
  "nothing known" and logs `{ code }` only.

## For the other batches

- Batch 1: the service role holds NO privilege on `event_checkins` or
  `event_checkin_sessions` (R3/R4 prove it): every read or delete of the
  table must use the viewer client; only `event_checkin_self_as` runs on the
  service client.
- Batch 4 (AttendeesModal): the attendees GET now answers `AttendeesResponse`
  with `Cache-Control: no-store`; walk-ins come sorted by name then id; a
  "Can't go" RSVP who checked in is a walk-in (`status: null`), which the
  database refuses to mark (`not_on_list`) but unmark works on anyone;
  `checkin.count` is the state RPC's exact number, else the rows read. Its
  429 (eventAttendeesRead, 240 / 10 min) carries no `code`.
- Orchestrator: the migration header's `REHEARSED:` line is still the
  placeholder (Batch 0's file; not edited here).

## Review round 1 (Oct 19, later)

- Dev server: nothing listens on localhost:3000 (no next process, curl exit 7).
  Not started here (the brief says never start another): the orchestrator
  needs to start it for Batch 1's curl check and the browser pass.
- Attendees route: (1) "not installed" codes PGRST202 / PGRST205 / 42P01 /
  42883 on the check-in read or the state RPC now mean "nobody checked in"
  (200, logged `[events/:id/attendees checkin not installed] { code }`); any
  other error stays a 500. Local PostgREST answers PGRST205 for a missing
  table and PGRST202 for a missing function (probed). (4) the id is
  lower-cased right after isUuid. (6) the 429 now says no-store too.
- Events list (7): GET is now a two-line wrapper over `listEvents(req)` that
  sets `Cache-Control: no-store` on every answer (200, 400, 401, 403, 500);
  POST is untouched.
- Tests (8): new `src/lib/events/events-list-route.test.ts` (7 cases: the
  past chain lt/gte/order desc/limit min(n,20) for limit 50, default and 5;
  upcoming chain unchanged for no `when`, `when=soon` and `when=PAST`; `when`
  ignored without `org_id`; hidden club and non-uuid org list nothing in the
  past view; state rows on the items; a failed state read (PGRST202 or
  XX000) answers 200 with false/null/false, counts kept, log `{ code }` only;
  no-store on every answer). `event-route.test.ts`: the fake RPC answers
  `event_checkin_state` when a test sets it, plus two PATCH cases (a state
  row lands on `event`, last three keys; a failed state read still answers
  200 with false/null/false and a code-only log). `attendees-route.test.ts`:
  the 500 cases now use real failures (57014, XX000), PGRST200 stays a 500,
  a "not installed" case, an upper-case id case, and `{ allow: false }` in
  the no-store test.
- Rejected / not mine: (2) suspended officer reads the list, (3) count vs
  rows, (5) storage order: see "For the orchestrator" below.

### Round 1 results

- `npm test` 3292 / 3292 pass; `npx tsc --noEmit -p .` 0 errors; eslint on
  every batch-2 file clean; `npm run lint` still 33 errors, none in a
  batch-2 file.

### For the orchestrator (round 1)

- Migration header line 8 and contract section 1: "either order is safe"
  now holds for every EXISTING feature (list, PATCH and attendees all treat
  a missing check-in table or function as "no check-in"). The NEW check-in
  routes still need the migration; before it, "Start check-in" only fails
  with its toast. Suggest: "...the new build's events list, PATCH and
  attendee list treat missing check-in objects as 'no check-in', so either
  order keeps every existing screen working; the new check-in buttons only
  work once this is applied (apply first, as planned)." Batch 0's file, not
  edited here.
- (2) A suspended officer can still GET the attendee list, walk-ins'
  names included. Not changed, because the proxy's rule is written down
  (`src/proxy.ts:308-310`): "Reading is still reading - what a restriction
  stops is writing". The RSVP half was already like this, and the door hides
  codes because codes let other people write. My pick for Franky: keep it,
  and add to D8 "A suspended officer keeps read access to the RSVP and
  check-in lists, the same as today." The other option is a 403
  `account_restricted` on the whole attendees GET (RSVPs too).
- (3) `checkin.count` (the state RPC: every row) can be larger than the
  rows listed: `users_select_authenticated` is own OR `user_visible(id)`,
  and `user_visible` hides restricted accounts, so the `!inner` embed drops
  a suspended student. Same as today's RSVP counts (`event_rsvp_counts`
  counts every RSVP; the Going list drops the same people). Kept the state
  count (it is the truth). For Batch 4 and contract 4.2: section headings
  count ROWS (`splitAttendees(...)` lengths), never `checkin.count`;
  "Clear check-ins" on `count > 0` is still right (there is a row to
  clear, even if hidden); a Past events "1 was there" with no visible row
  can happen for an officer. No `hidden_count` added (a Batch 0 type
  change, and the modal has nothing to do with it).
- (5) `event_checkins` is readable over REST by the event's managers
  (policy `event_checkins_select_own_or_manager`), and an unordered read
  comes back in storage order, close to check-in order. The attendees route
  leaks no order (RSVP order for Going/Interested, name order for
  walk-ins). Batch 0's policy; my pick: accept it and add a line to D3
  ("officers can watch arrivals live anyway: the door count, and the list
  re-reads every 20 s"). The other option is dropping the manager arm and
  serving officers through a SECURITY DEFINER read ordered by user_id.
- Dev server: not running (see top of round 1). Batch 1's curl check and
  the browser pass need it started.

### For the other batches (round 1)

- Batch 1 (`readViewerState`) and Batch 3 (the landing page's `initial`):
  `isUuid` accepts upper case, but `parseCheckinStateRows` keys are the
  database's lower-case ids, so `.get(id)` misses for a hand-typed
  upper-case URL ("row missing -> 404" / "That event isn't available").
  Lower-case the id right after `isUuid`, as the attendees route now does.
- Batch 4: the attendees GET's 429 now carries `Cache-Control: no-store`
  too (still no `code`). With check-in not installed it answers 200 with
  `walk_ins: []` and `checkin: { open: false, count: 0, ... }`.
