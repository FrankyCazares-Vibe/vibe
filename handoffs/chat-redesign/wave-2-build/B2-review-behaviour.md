# W2-B2 review — lens: behaviour

Reviewer of commits 7a5e9e5, 31db684, f4ff2f4, 892d869, fa27554, 885612f,
0a43db1 against `wave-2-contracts.md` sections 3.2, 3.10, 4, 5, 8, 9, 12,
13. Method: refute. A (route × condition → answer) table from 4 and 3.10
checked line by line against the two card routes and the thread GET;
`hydrateCards`, `buildChatMessages`, `readReplyCounts`, `eventRefsFor`,
`snapshotCard` simulated by reading and by running the tests; the callers
of every changed signature grepped; the validator run on the fixtures and
on three mutations; the three gates run here.

## Log
- Read: B2-notes.md, B2-gate.md, the seven commits' stats, contract 1.3,
  1.4, 3.1-3.5, 3.10, 4, 5, 8, 9, 12, 13.1-13.3; hydrate.ts, event-refs.ts,
  stub.ts, blocks.ts, snapshot.ts, rpc-refusal.ts, the two card routes, the
  messages/route.ts and reports/route.ts diffs, the message-read.ts diff and
  its unchanged neighbours (roomOf, readChatMessage, readRoomEvent,
  hydrateParentPreviews), B1's migration (the RPC names and columns).
- Gates run here: `npm run typecheck` exit 0; `npm test` 1523/1523 (the
  tree holds B1, B3, B4 too now); `npm run build` started (result below).
- `npm run build` exit 0 (both card routes in the manifest); `npx eslint`
  over the batch's files exit 0; `node --test tools/validate-thread.test.mjs`
  17/17; the eight fixtures exit 0 through the CLI; three mutations exit 1
  with the right paths (a stub with a `user_id` → `messages[1].user_id: a
  stub pins user_id at ""`; a sign-up option with `voters_more: 2` and a
  lying `full` → both named; a poll card with an extra key, no
  `total_voters`, and a card on a `kind: "text"` row → four problems).

## The (route × condition → answer) table, checked line by line

`POST …/cards` (4.1): 401 → flag 404 `not_found` → `message-send` bucket
→ `requireCanPublish` → "Invalid JSON" (null / array / non-object too) →
`readCreateCardBody` 400 `invalid_card` + `field` → `checkText` in the
order question, `options.<n>`, note → 422 `content_blocked` + `field` →
`ensureMember` "Not a member" with its status → `!isOrgChannel` 400
`cards_club_rooms_only` → `roomOf`: failed 503, room null + kind 503, room
null + no kind 404 → Event card: `events` read `id, title, starts_at,
org_id, ends_at`, missing / other club / `ends_at <= now` → 404
`event_not_found` → the RPC (`p_mode` = type, sign-up `p_anonymous false`,
`p_multi true`, matching the RPC's own line 317) → `rpcRefusal` (P0C21
`postRefusal(room, null, clubRole)` 403; P0C22 400 + field; P0C23 404;
P0C24 404; P0C25 409; P0C26 409; missing function 404; else 503 logged) →
`readChatMessage` twice → 503 → 201 `{ ok, message }`. Every row matches.

`PUT …/vote` (4.3): 401 → 404 flag → 2b non-uuid `[messageId]` 404 (before
the bucket, as written) → `card-vote` 120/600 → `requireNotRestricted` →
JSON → `option_id` / `on` 400 with the field → `ensureMember` →
`cards_club_rooms_only` → `roomOf` as 4.1.10 → the cookie re-read `id,
kind, user_id, card_event_id, removed_at` `.eq(id).eq(channel_id).limit(1)`;
no row / not `poll` / removed → 404; `42703` → 404 (3.10's without-A row);
other → 503 → `blockedIdsFor` null → 503 → `chat_cast_vote(p_poll,
p_option, p_user, p_on)` → `rpcRefusal` with `field: "option_id"` →
`hydrateCards(supabase, [row], user.id, { room, blocked })` → no card or
an event → 503 → 200 `{ ok, card }`. Every row matches.

Thread GET (9.1, 9.2): `invalid_after` at the route's own check and in
`readChatMessages` (`cleanAfterParam` unchanged); `roomOf` → the ONE
`blocks` read only when `found.room` (a dm hands `new Set()` down and
nothing is read: pinned by the dm test, `service.log.length === 0`) → null
503 → `readChatMessages(…, { …, blocked })` + `describeRoom(…, blocked)`
side by side.

3.10 rows: card routes without B → the RPC's `PGRST202` → 404 (tested in
`rpc-refusal.test.ts`); vote without B → same; without A → `roomOf` room
null, kind null → 404 in both; `hydrateCards` → empty map warned once
(`42P01`, `PGRST205`, `42703` tested); `snapshotCard` → null (tested);
the report → `card: null`, the six-column retry on `isMissingChatSchema`
(read: `readTarget` keeps `lastError`, warns once, retries `messages`
only); `readReplyCounts` → `walkReplyCounts` on `PGRST202` / `42883`
(tested; no `messages` read when the function answers).

## Simulations (by reading, confirmed by the tests where one exists)

`hydrateCards` on one page: a text row → skipped (no read when only text
rows); a single poll → `mine` on the one option the viewer picked,
`voters` in vote order minus blocked and unreadable, `voters_more =
visible − 12` (tested: 15 votes, one blocked → 12 named, 2 more); a multi
poll with two of the viewer's picks → `mine` true on both (`all.some`
per option; correct by reading, no test); anonymous → `voters: []`,
`voters_more: 0`, counts and `mine` kept (tested); closed → `closes_at <=
now` by `Date.parse`, or an event room whose `roomState` is `closed`
(tested both, and the Board never); a full slot → `full = count >=
capacity` counting the blocked voter (tested, `plates`); a blocked voter →
counted, never named (tested); an unreadable voter → `users` row absent on
the cookie client → counted, never named (tested, `RESTRICTED`); an event
card, live event → `event` = the `EventRef` from `eventRefsFor` with
`room_id` when the viewer holds a row (tested: `state: "soon"`,
`viewer_status: "going"`); cancelled → `card_event_id` null → `{ type:
"event", note, event: null }` and its id never asked of `events` (tested).

`buildChatMessages`, blocked = {x}: Lounge — x's message → `asStub(row)`
whole, its card dropped; a reply quoting x → `parent_preview: null`,
`parent_message_id` kept (tested, `m3`); a quote of anyone else kept.
Board — x a current owner/admin, top-level → visible with `author_role`
and `reply_count`; x's reply → stub keeping `thread_root_id`; a demoted
x's post → stub; a quote of x's post → null, no exception (tested, the
Board-exception test). A dm — `room === null` → `NO_BLOCKS`, no read, no
roles, no cards (tested). A failed `blocks` read → `complete: false` → the
page 503; `toChatMessages` → the row with `hidden: false`, `parent_preview:
null`, cards not read (tested).

`readReplyCounts` with the RPC missing → `walkReplyCounts` for the whole
list (tested); any other error → null → `reply_count: null` on every post,
the page 200 (tested; see STOPPED below).

`readGoing` with blocked = {going[1]} → the first 8 VISIBLE, the next room
member going takes the blocked one's place, `going_count` unchanged, the
blocked id never asked on the cookie client (tested).

Callers of the changed signatures (grep over `src`): `describeRoom` —
`messages/route.ts:148` (4 args) and `readThreadRoom` (reads the set
itself); `readRoomEvent` / `readGoing` — file-private, both callers updated;
`readChatMessages` — the thread GET (passes `blocked`) and B4's space route
(`board_latest`, no `blocked` → `buildChatMessages` reads it: the stubs the
contract wants there); `toChatMessages` — the send's answer (unchanged
code, 9.1's rule applies); `readChatMessage` — the card POST's read-back;
`eventRefsFor` — hydrate, the inbox, the space, the calendar (`counts:
false`). `npm run typecheck` exit 0 with all four batches in the tree.

## STOPPED / SIBLING, judged

- STOPPED, 9.4 "(the caller answers 503, as today)": RIGHT. At 75500e3
  `buildChatMessages` returned `complete: room === null || roles !== null`
  — `replyCounts === null` never made a page incomplete, and the comment at
  `:388` says the null is so a screen never shows a wrong number. The
  contract's parenthetical contradicts the code it cites; the builder kept
  the main clause (null) and today's behaviour (200 with `reply_count:
  null`), pinned it in a test and wrote the one-line change if the 503 is
  wanted. Nothing to repair unless the contract's author says 503.
- SIBLING: none recorded; my own runs of the three gates agree (typecheck
  0, 1523/1523, build 0 with B1, B3, B4 in the tree).

## Findings

No HIGH: every route answer, every stub, quote, voter and going rule reads
as the contract writes it; no leak found; the gates are green here.

- **B2-BEHAVIOUR-1** · MEDIUM · `src/app/api/me/threads/[id]/cards/route.ts:59`,
  `cards/[messageId]/vote/route.ts:44` · The two route handlers have no
  test: their gate ORDER and statuses are verified by reading only (the
  harness covers `rpcRefusal`, `hydrateCards`, `readChatMessages`). The
  builder's reason is right (`node --test` reads `[id]` as a glob), but a
  test under `src/lib/chat/cards/` can import the handler by a relative
  path exactly as `rpc-refusal.test.ts` does. Fix: one test per route,
  the resolve hook of `message-read.test.ts` faking `@/lib/chat/flag-server`,
  `@/lib/rate-limit`, `@/lib/moderation/access`, `@/lib/messages/channel-access`
  and the two Supabase clients, walking the 13 / 12 gates in order with
  a `Request` and `{ params: Promise.resolve({ id, messageId }) }`. Until
  then the Mac's step 2 is the only proof.
- **B2-BEHAVIOUR-2** · MEDIUM · `src/lib/chat/cards/hydrate.test.ts:313` ·
  Two paths of my lens are untested: a LIVE event room (the closed test
  uses only a room that ended in September and a Lounge; `roomState ===
  "live"` → `closed: false` is by reading) and a multi poll where the
  viewer holds two picks (`mine` true on two options). Both read right in
  `toPollCard`. Fix: add `[null, liveRoom, false]` with `starts_at` before
  `NOW` and `ends_at` after it to the cases at `:319-327`, and one multi
  poll with two viewer votes asserting `mine` on both and `total_voters` 1.
- **B2-BEHAVIOUR-3** · LOW · `src/lib/chat/message-read.ts:622` · The
  viewer's OWN removed card rows are handed to `hydrateCards` (`shown`
  keeps `row.user_id === viewerId` removed rows), while 5.2 says a removed
  message is never given to it. No leak (it is their card; `removed` is
  set and the screens draw `RemovedContentCard`), one side-table read plus
  a voters read per own removed card. Fix: `.filter((row) => !row.removed_at
  && messageKind(row.kind) !== "text")`.
- **B2-BEHAVIOUR-4** · LOW · `src/lib/chat/cards/hydrate.ts:259` · The
  voters' `users` rows are read on the cookie client for anonymous polls
  too; nothing of it is returned (`voters: []`), one round trip for
  nothing. Fix: build `voterIds` from the votes of polls whose
  `anonymous !== true` only.
- **B2-BEHAVIOUR-5** · LOW · `src/app/api/me/reports/route.ts:530` ·
  `snapshotCard` (up to four service-role reads) runs before the "your
  own" refusal and the `alreadyOpen` dedupe, so a refused or repeated
  report still pays it. Still after `readTarget`, so no leak. Fix: move the
  hunk below `if (await alreadyOpen(…)) return ok();`, above
  `withOwnerHandle`.
- **B2-BEHAVIOUR-6** · LOW · `src/lib/chat/message-read.ts:523`, `:675` ·
  `Built.blocked` is filled and read by nobody (`readChatMessages` and
  `readChatMessage` use `messages`, `complete`, `roles`). Fix: drop the
  field and its comment, or leave it with a one-line note that it is for
  a later caller.

## Holds

- 4.1 and 4.3 gate by gate (the table above); `POST_REFUSAL_STATUS`
  mirrored (its test pins it against `messages/route.ts`); P0C22's `field`
  (`closes_at` / `note` / `option_id`) is the builder's documented call
  where the contract is silent.
- 3.10, every row of the batch's; the six-column retry of the report read.
- 5.2 field by field, the hidden-voter rule, the four side tables and
  `events` on the service role, the voters on the viewer's client
  (asserted: `users` never read with the service role), chunks of 100,
  `closed` (past `closes_at`, an event room `closed`, never for a Board),
  cancelled → `event: null`; an id missing from `events` → `event: null`
  logged; a failed `events` / `rsvps` read → null → 503 (the builder's
  reading of "an event that cannot be read"; the safer one: a transient
  failure must not draw a live event as cancelled).
- 5.3: no ids of people (`option_id` only), text / missing / without-B →
  null. 5.4 `blockedIdsFor`: one `.or()` read, both directions, the viewer
  removed. 5.5: the four reads, `counts: false`, the cap at 500 with the
  per-event fallback, the `room_id` rule.
- 8.1 the stub shape (asserted field by field, and by the validator's
  `STUB_PINNED`); 8.2 `room !== null` first; 8.3 every row that is B2's.
- 9.1: one `blocks` read per thread GET handed to the page and the room;
  `toChatMessages` never 503s; hydrate → `complete: false` → 503; 9.2 both
  places with the sentence; 9.4 with the STOPPED (right).
- The validator: accepts the eight fixtures, rejects the three mutations
  with exact paths; key sets read from `types.ts`.
- Gates: typecheck 0, tests 1523/1523, build 0, eslint 0, validator test
  17/17 — all run here, with the four batches in the tree.

Verdict: PASS. Nothing wrong for a viewer; two MEDIUM coverage gaps, four
LOW costs, no contract name changed, no gate red.
