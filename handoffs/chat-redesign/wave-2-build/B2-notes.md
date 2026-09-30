# W2-B2 notes (card routes, the reads' plumbing, the pure modules)

Running log, newest at the bottom. The first section is the serial prelude
(13.1: "W2-B2's first commit"), built alone before the four batches start;
the main W2-B2 builder continues below it.

## Prelude plan (W2-B2's first commit; nobody else edits meanwhile)

Contract sections read: 1.3, 1.4, 4 (4.1-4.3), 5 (5.1-5.5), 8 (8.1-8.3),
9.1, 12, 13.1-13.3. Sources read: `types.ts`, `message-read.ts` (441-470,
510-600, 700-834), `push/event-notice.ts:40-75`, `safety/hidden-users.ts`,
`room-state.ts`, `room-rules.ts` (BOARD_POSTER_ROLES), `pgrest.ts` (isUuid),
the resolve-hook test pattern (`orgs/following.test.ts`).

Deliverables, in this order:
1. `types.ts`: RefusalCode + 11 codes, REFUSAL_SENTENCES + 11 rows (1.3, word
   for word), ChatRouteCode = content_blocked only, InvalidCardRefusal,
   CardSnapshot (5.3), the `hidden` comment points at 8.1. refusalBody unchanged.
2. `when.ts` + test (1.4, every function but weekRange; CAMPUS_TIME_ZONE
   re-exported from `@/lib/push/event-notice`).
3. `cards/fallback.ts` + test (5.1).
4. `cards/body.ts` + test (4.2, 4.1.6 field names).
5. `stub.ts` + test (8.1, 8.2; `isHiddenFrom` false whenever room is null).
6. `blocks.ts` (server-only, 5.4).
7. Signature stubs: `cards/hydrate.ts`, `cards/snapshot.ts`, `event-refs.ts`.
8. `message-read.ts`: `ReadKnown.blocked?`, `MessageContext.blocked?`, the
   absent-blocked read in `buildChatMessages`; the stub decision stays a no-op.
Then gates (typecheck, test, build, eslint) and ONE commit.

Decisions where the contract is silent (prelude):
- Tests of `when`, `fallback`, `body` use the repo's `module.registerHooks`
  resolve hook (the `following.test.ts` pattern) because `when.ts` re-exports
  a runtime value through `@/lib/push/event-notice` and `body.ts` uses
  `isUuid` from `@/lib/pgrest`, as the contract names them.
- Lengths (question 1-200, label 1-80, note <= 200, fallback 300) count code
  points, as Postgres `char_length` does in the RPC (3.3).
- `eventWhen` / `eventWhenSpoken` take `zone` with `CAMPUS_TIME_ZONE` as the
  default (5.1 calls `cardFallbackContent(input, zone = CAMPUS_TIME_ZONE)`).
- Time strings are assembled from `Intl.DateTimeFormat.formatToParts`, never
  from `toLocaleString`: ICU 72+ puts a narrow no-break space before AM/PM.
- `room-rules.test.ts` (wave 1, owned by nobody in 13.2) pins the 8-row
  sentence table with a `deepEqual`; the 11 new rows break it. The prelude
  runs alone, so that one assertion is extended with the 11 rows (its title,
  "the contract's, word for word", still holds). Recorded here and in the
  gate file.

## Prelude log
- types.ts: the eleven codes + sentences, ChatRouteCode = content_blocked only, InvalidCardRefusal, CardSnapshot, the hidden/card comments. room-rules.test.ts's sentence table extended by the eleven rows (see decisions). flag.test + room-rules.test green.
- room-rules.test.ts: the no-sentence test named not_found / report_open as codes without a sentence; they have one now, so it names content_blocked (the one left). Both files green (53/53).
- when.ts written (rowTime, rowTimeSpoken, eventTime, eventTimeShort, isSoon, eventWhen, eventWhenSpoken, moreDays; CAMPUS_TIME_ZONE re-exported).
- when.test.ts: 12 tests green in the container zone, TZ=Asia/Tokyo and TZ=America/Los_Angeles.
- cards/fallback.ts + test written (6 tests green): the three shapes, campus zone default, whitespace collapsed, the 300 cut in code points.
- cards/body.ts written.
- cards/body.test.ts: 11 tests green (every field name of 4.1.6, the order of 4.2, code-point lengths).
- stub.ts + stub.test.ts written (isHiddenFrom false whenever room is null, tested; asStub the 8.1 shape, every field).
- blocks.ts (server-only; one blocks read, both directions, viewer removed, null on failure), the three signature stubs (cards/hydrate.ts → empty Map, cards/snapshot.ts → null, event-refs.ts → null) written.
- message-read.ts: ReadKnown.blocked?, MessageContext.blocked?, Built.blocked (file-private), the absent-blocked read first in buildChatMessages (null → complete: false), readChatMessages / readChatMessage pass known?.blocked. Stub decision still a no-op.
- typecheck green (after narrowing the body test's helpers); eslint on the 15 prelude files exit 0.
- npm test: 1409/1409 green (1,374 + 35 new: when 12, fallback 6, body 11, stub 6).
- build exit 0. B2-gate.md (prelude section) written. Committing.
- Committed 30fcc07 "feat(chat): wave-2 pure modules, sentences and signature stubs (W2-B2 first commit)". Prelude done; the main W2-B2 builder continues from here (4.1, 4.3, 5.2, 5.3, 5.5, 9.1 stub decision + hydrate + parent_preview, 9.2, 9.4, describeRoom/readRoomEvent/readGoing signatures, the report snapshot hunk, validate-thread.mjs + fixtures).

## Main W2-B2 plan (continues from 44d3ae0; the four batches run side by side)

Read again: contract 1.3, 3.1, 3.2, 3.3-3.5 (the RPC signatures and the
`p_options` keys), 3.10, 4, 5, 8, 9, 12, 13; RM 1, 3, 9, 18, 19; DM 3.6,
5.2, 5.10-5.12; `message-read.ts` whole, `messages/route.ts` whole,
`reports/route.ts:260-575`, `rooms.ts`, `room-rules.ts`, `schema.ts`,
`room-state.ts`, `access.ts:130-235`, `rate-limit.ts`, `channel-access.ts`,
the Next 16 route doc (`route.md:60-110`, `params` is a Promise).

Order (one commit each, "feat(chat): … (wave 2, W2-B2)"):
1. `event-refs.ts` (5.5) + `event-refs.test.ts`.
2. `cards/hydrate.ts` (5.2) + `cards/hydrate.test.ts`.
3. `cards/snapshot.ts` (5.3) + `cards/snapshot.test.ts` + the report hunk.
4. `message-read.ts`: 9.1 (stub decision, `hydrateCards` in the
   `Promise.all`, `parent_preview` nulled, the never-503 rule of
   `toChatMessages`), 9.2 (`refusal("invalid_after", 400)`), 9.4
   (`chat_reply_counts` per chunk of 100, the wave-1 walk on
   `isMissingChatSchema`), `describeRoom(client, room, viewerId, blocked)` →
   `readRoomEvent` → `readGoing` with the per-step filter; `readThreadRoom`
   reads the set itself. `message-read.test.ts` (the harness: fake cookie
   and service clients). Then `messages/route.ts`: the one block read after
   `roomOf`, `invalid_after` at its own check; the POST untouched.
5. The card routes (4.1, 4.3) with `cards/_lib/rpc-refusal.ts` (the 3.2
   table as one pure function) + its test.
6. `tools/validate-thread.mjs` + `validate-thread.test.mjs` + `fixtures/`.
7. Gates (13.3), `B2-gate.md`, the closing commit.

Decisions where the contract is silent (main):
- Tests of the `server-only` modules load them through the resolve hook of
  `profile/handle-change.test.ts`: `server-only` → an empty data: module,
  `@/lib/supabase/service` → a data: module whose `createSupabaseServiceClient`
  returns the fake the test installed on `globalThis`; the cookie client is a
  fake handed in as the argument. Nothing touches a database.
- `node --test` reads its arguments as globs, so a test under
  `src/app/api/me/threads/[id]/…` never runs (`[id]` is a character class;
  checked: "pass 0"). The routes' pure SQLSTATE → code helper therefore
  lives in the owned route tree (`cards/_lib/rpc-refusal.ts`) and its test
  under `src/lib/chat/cards/` (owned "+ tests"), importing it by a relative
  path (a relative import through `[id]` works; checked).
- `POST_REFUSAL_STATUS` is file-private in `messages/route.ts` and a route
  file may export only its handlers (Next's route type check), so
  `rpc-refusal.ts` carries the same four rows with a comment naming
  `messages/route.ts:64-69`.
- The RPC's `P0C22` in the create route carries `field: "closes_at"` for a
  poll / sign-up (the one shape rule the route cannot pin: the moment may
  pass between the route's check and the RPC's) and `"note"` for an Event
  card (the one body field its RPC checks); the vote route's is
  `"option_id"` (4.3.11).
- `hydrateCards`: a poll whose `chat_polls` row is missing (never after B:
  the RPC writes both in one transaction) simply has no entry in the map;
  the vote route's "no card → 503" covers it. `eventRefsFor` answering null
  is a failed read → `hydrateCards` answers null; an event id absent from
  the `events` rows or the refs map → `event: null`, logged.
- `closes_at <= now` is compared through `Date.parse` (a `timestamptz`
  string always parses); an unparsable value is not "closed".
- `snapshotCard` reads `messages.kind, card_event_id` first with the service
  role so a text message answers null whoever calls it; the report route
  still calls it only for `kind !== "text"` (5.3).
- The report hunk: `one()` for `message` is retried with today's six
  columns on `isMissingChatSchema`; `card` is added to the message snapshot
  right after `readTarget` succeeds in `POST` (the read proved the reporter
  can see it), `null` on the six-column path.
- `readReplyCounts`: the RPC is tried on the first chunk; `isMissingChatSchema`
  there falls back to the wave-1 walk for the whole list (warned once,
  tag `chat/message-read.replyCounts`); a row for a root not asked is ignored.
- The vote route's step-9 read on a database without A (`kind` missing,
  `42703`) → 404 `not_found` (3.10's row); any other read error → 503.
- `eventRefsFor` past the 500-row cap of a chunk: the three reads of
  `readRoomEvent` (going count, maybe count, the viewer's row) per event of
  that chunk, as "asked apart" says.

## Main log
- event-refs.ts written (5.5: rsvps with count exact per chunk of 100 events and the per-event reads past 500, channels, org_members, channel_members; room_id = a row on the room OR owner/admin; counts:false; null on any failed read, a missing schema warned once). event-refs.test.ts: 12 tests green (the fake service client through the resolve hook). eslint exit 0.
- cards/hydrate.ts written (5.2: the four side tables + events with the service role in one Promise.all, chunks of 100; the voters on the viewer's client; the hidden-voter rule; every PollCard field per the table; Event cards via eventRefsFor; null on failure; empty map + warn once on isMissingChatSchema). hydrate.test.ts: 21 tests green. eslint exit 0.
