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
