# W2-B2 review — lens: security

Reviewer of the W2-B2 commits 7a5e9e5, 31db684, f4ff2f4, 892d869, fa27554,
885612f, 0a43db1 against handoffs/chat-redesign/wave-2-contracts.md
(1.3, 3.2, 3.10, 4, 5, 8, 9, 12) and the code at HEAD. Read-only on the
tree but this file.

## Plan

1. Which client reads what: every caller of `hydrateCards`, the voters'
   `users` read, the side tables, `snapshotCard`, `eventRefsFor`,
   `readReplyCounts`, `blockedIdsFor`.
2. The vote route: the cookie re-read scoped to `[id]` before any
   service-role write; `removed_at`; `.limit(1)`.
3. The create route: the thirteen gates in order; a dm / group, a Board as a
   member, a closed event chat; the RPC as the second wall; the RPC
   parameter names against B1's migration file.
4. Stubs and quotes: 8.1's shape, 8.2's rule, the quote of a blocked
   person, `complete` and the send's answer.
5. The report snapshot: never returned; no ids of people.
6. Rate-limit keys, no @mention parsing, `invalid_after`, 503/404 paths,
   log lines.
7. The builder's STOPPED / SIBLING.

## Log
- Read: B2-notes, B2-gate, contract 1.3/3.2/3.10/4/5/8/9/12/13, the seven
  commits' files, migration B's RPC signatures. Checked so far: the RPC
  parameter names (`p_channel, p_user, p_mode, p_question, p_options,
  p_anonymous, p_multi, p_closes_at, p_content` / `p_channel, p_user,
  p_event, p_note, p_content` / `p_poll, p_option, p_user, p_on` /
  `p_channel, p_roots, p_viewer`) match `20261001110000_chat_v2_cards.sql`
  :640-642, :722-723, :772, :841 — a mismatch would have been a silent
  `PGRST202` → 404 on every card. `ParentPreview` carries `user_id`
  (message-read.ts:215), so the quote nulling keys on a real field.
  `postRefusal` returns a non-null `PostRefusalCode` (room-rules.ts:112-126),
  so `POST_REFUSAL_STATUS[refused]` is never undefined. `ensureMember`
  refuses a non-uuid `[id]` with 403 before any read (channel-access.ts).
  `body.ts:71` checks `event_id` with `isUuid` before the service-role
  `events` read. Callers of `hydrateCards` in src: `buildChatMessages`
  (message-read.ts:629, over `shown` = the cookie page read) and the vote
  route (:145, the row of its own cookie re-read) — no other.
- Read: the RPC bodies (`chat_create_poll` :662-676 `can_post_org_channel`
  → P0C21 before any insert; `chat_create_event_card` :744-750 the club's
  own event with `ends_at > now()` → P0C23; `chat_cast_vote` :791-800
  `removed_at` + `can_view_org_channel` → P0C24, the post rule → P0C25);
  the send answer (`messages/route.ts:612` passes `room`, so
  `buildChatMessages` reads the set itself and never 503s, tested at
  message-read.test.ts:248); no `create trigger … on public.messages` in any
  migration (mentions are the send route's app code; the cards route never
  calls it); `loadHiddenUsers` (hidden-users.ts:31-34) has the same `.or`
  shape; wave-1 `complete: room === null || roles !== null` (75500e3
  message-read.ts:582) never covered `readReplyCounts`; `clubRole` never
  throws (rooms.ts:327-349). Re-ran the batch's tests here: 72/72;
  validate-thread.test.mjs 17/17.

## Findings

### B2-SECURITY-1 — MEDIUM — the two card routes have no test: the gate order, the vote route's cookie re-read and the routes' own 3.10 rows are untested
- where: `src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts:101-116`,
  `src/app/api/me/threads/[id]/cards/route.ts:59-207`
- what: 13.3 asks a route batch for a stub harness "for the 3.10
  missing-schema rows and the SQLSTATE → code table". The batch tested the
  table (`rpc-refusal.test.ts`, 7 tests) and the helpers, but nothing
  exercises the routes themselves: that the vote route's re-read is on the
  cookie client with `.eq("channel_id", channelId)` and `.limit(1)`, that
  `removed_at !== null` and `kind !== "poll"` answer 404 BEFORE
  `chat_cast_vote` is called, that a `42703` on that read is 404 (3.10),
  that `hydrateCards` is given the re-read row only, that the create route
  refuses a dm at gate 9 before the `events` read, and that the thirteen
  gates run in 4.1's order (the word filter before `ensureMember`, the RPC
  never called on a refusal). The notes explain why (`node --test` reads
  `[id]` as a glob) but the same notes prove a relative import through
  `[id]` loads (`rpc-refusal.test.ts` does it). This is the route the
  contract calls ROUTES-H2; its two security-relevant orderings (re-read
  before the write; `blockedIdsFor` before the RPC) rest on reading alone.
- fix: `src/lib/chat/cards/routes.test.ts` importing `POST` and `PUT` by
  the relative paths `../../../app/api/me/threads/[id]/cards/route.ts` and
  `…/cards/[messageId]/vote/route.ts`, with the resolve hook of
  `hydrate.test.ts` extended to map `@/lib/supabase/server` (a
  `createSupabaseServerClient` answering the fake cookie client, its
  `auth.getUser()` the viewer), `@/lib/chat/flag-server` (`chatV2For` →
  true), `@/lib/rate-limit` (`rateLimit` → allowed), `@/lib/moderation/access`
  (the gates → null), `@/lib/messages/channel-access` (`ensureMember` → the
  fixture's access), `@/lib/chat/rooms` (`loadRoom` / `clubRole`), and
  `next/server` left real. Cases: (1) the viewer's own removed poll → 404
  `not_found`, `rpc` never called; (2) a poll id of another room → the
  fake's `channel_id` filter yields no row → 404; (3) `kind: "text"` → 404;
  (4) the read's error `42703` → 404, `PGRST301` → 503; (5) a `blocks`
  read failure → 503 and `rpc` never called; (6) `hydrateCards`'s `rows`
  argument equals the re-read row; (7) POST: `isOrgChannel: false` → 400
  `cards_club_rooms_only` with no `events` read; (8) POST: a banned word
  in `options.1` → 422 `{ code: "content_blocked", field: "options.1" }`
  before `ensureMember` is called; (9) POST: `P0C21` on a Board as a
  member → 403 `board_officers_only`.

### B2-SECURITY-2 — LOW — the viewer's own removed poll is hydrated, against 5.2's "A removed message is not given to it"
- where: `src/lib/chat/message-read.ts:592` (`shown` keeps
  `row.user_id === viewerId` removed rows), `:625-627` (every non-text row
  of `shown` goes to `hydrateCards`)
- what: 5.2 says a removed message is never given to `hydrateCards`, and
  cites the filter at wave-1 `:533` — which keeps the sender's own removed
  rows (so the sender sees "Removed by an officer"). So the sender of a
  removed poll gets its full `card` (the vote counts and the voters' names
  as of the removal) with `removed` set. Not a leak: it is the sender's own
  poll, the voters are people the sender could already read, no further
  vote can land (`chat_cast_vote` P0C24 on `removed_at`; the vote route's
  step 9 before it), and a stub never carries a card. But a removed card
  that still looks live to its sender is a wrong answer against the
  sentence, and the side tables are read with the service role for a row
  the contract said would not reach them.
- fix: at `message-read.ts:625` filter the card rows by
  `!row.removed_at && messageKind(row.kind) !== "text"` (the sender's own
  removed poll then goes out as `card: null` with `removed` set, as the old
  renderers already show it: its fallback text), and add the case to
  `message-read.test.ts` ("the viewer's own removed poll: `removed` set,
  `card` null, no side-table read for it"). If the integration review reads
  5.2's citation as the intent instead, record it there; either way one of
  the two sentences has to give.

### B2-SECURITY-3 — LOW — B2-notes.md files four log lines under "## STOPPED"
- where: `handoffs/chat-redesign/wave-2-build/B2-notes.md`, the four
  bullets after the `readReplyCounts` item under `## STOPPED` ("cards/_lib/
  rpc-refusal.ts …", "cards/route.ts (POST …", "tools/validate-thread.mjs …",
  "Gates (13.3) …")
- what: a reader of the STOPPED section takes the card routes and the tool
  as stopped work. They are the main log's last four steps (the commits
  fa27554, 885612f, 0a43db1).
- fix: move the four bullets above the `## STOPPED` heading, at the end of
  `## Main log`.

## Holds (tried to refute; could not)

- `hydrateCards` has exactly two callers in `src`: `buildChatMessages`
  (message-read.ts:629, over `shown`, the page read on the client the
  caller handed — the routes hand the cookie client) and the vote route
  (:145-150, the one row of its own cookie re-read). No service-role page
  ever reaches it. Its side tables go through `serviceOrNull()`; the
  voters' `Person`s through `client.from("users")` (hydrate.ts:262) — the
  test asserts `users` is never on the service log and is the only table
  on the cookie log (hydrate.test.ts:224-227).
- The vote route: `isUuid(messageId)` at 2b (:61) after auth and the flag;
  the cookie re-read at :101-106 selects the five pinned columns with
  `.eq("id").eq("channel_id").limit(1)`; no row / `kind !== "poll"` /
  `removed_at !== null` → 404 (:116); `blockedIdsFor` (:119) → 503; only
  then `chat_cast_vote` (:128) — nothing is written before the viewer's own
  read proved the row; `chat_cast_vote` re-checks `removed_at`,
  `can_view_org_channel` and the post rule itself (migration :791-800).
- The create route's thirteen gates are in 4.1's order (:63-118, :132-187,
  :199-206): auth, flag, `message-send:<uid>` {60, 60}, `requireCanPublish`,
  JSON, shape (`InvalidCardRefusal` with `field`), `checkText` over the
  question, every option in index order, the note (:39-46; 422 with
  `field`), `ensureMember` (a non-uuid `[id]` → its 403), `isOrgChannel`
  false → 400 `cards_club_rooms_only` (a dm or a group never reaches the
  `events` read or an RPC), `roomOf`'s three answers. A Board as a member
  and a closed event chat are refused by the RPC's `can_post_org_channel`
  (P0C21) → `postRefusal(room, null, role)` → 403 `board_officers_only` /
  `room_closed` (rpc-refusal.ts:65-68, tested). An Event card's event must
  be `member.orgId`'s and not ended twice (route :143, RPC :744-750); a
  foreign, missing and ended event answer the same 404, and a member could
  read the club's own events anyway.
- No service-role `messages` read leaks a row: `snapshotCard` reads `kind,
  card_event_id` only, after `readTarget` read the message on the reporter's
  client (reports/route.ts:519-535), and its answer goes into
  `target_snapshot` only — the route answers `{ ok: true }` (:442, :541);
  no ids of people in a `CardSnapshot` (snapshot.ts:59 selects `option_id`
  alone). `readReplyCounts` calls the RPC with `p_viewer`. `eventRefsFor`
  reads `rsvps` for counts and the viewer's own row, `org_members` and
  `channel_members` for the viewer alone (event-refs.ts:178-182, :199-203).
- The block set: `blockedIdsFor` runs on the cookie client everywhere
  (messages/route.ts:133, vote :119, message-read.ts:607 and :1196), the
  `loadHiddenUsers` `.or` shape, both directions, `blocked.delete(viewerId)`;
  `viewerId` is auth-derived at every call (a uuid, safe in the filter).
- The stub is 8.1's exact shape (stub.ts:57-80; `deepEqual` at
  message-read.test.ts:204-209) and carries nothing of the row but the three
  keys; `isHiddenFrom` is 8.2 with `room !== null` first; a quote whose
  `user_id` is in the set is nulled with no Board exception
  (message-read.ts:646-647, :660); a failed block read is 503 for a read and
  "no quote, nothing hidden" for the send's answer (tested). `blocked` never
  holds the viewer, so the author of a card always sees it.
- No card text reaches @mention parsing or a notification: the cards route
  never imports the mention code, there is no trigger on `public.messages`,
  and no push / `last_read_at` bump in either route.
- `invalid_after`: checked after `ensureMember` (messages/route.ts:100-120),
  so a 400 never says anything about a room the viewer cannot read;
  `cleanAfterParam` unchanged; nothing reaches the database.
- 503 / 404 paths: every read in the batch returns an error object rather
  than throwing (supabase-js), `serviceOrNull()` and `clubRole` catch,
  `req.json()` is in try/catch, the missing-function and missing-column
  codes answer 404 in both routes (rpc-refusal.ts:82-85; vote :108-111).
- Logs: ids and `error.code` / `error.message` only (never `details`, which
  is where Postgres puts a failing row); `warnBlocksUnreadOnce` and the
  hydrate warning carry no content.
- Rate-limit keys as pinned: `message-send:${user.id}` {60, 60} (cards
  :76), `card-vote:${user.id}` {120, 600} (vote :64).
- The 1.3 sentences in `types.ts:123-143` are the contract's word for word;
  no name, column, route, field or code was changed.

## The builder's STOPPED and SIBLING

- STOPPED (9.4's "any other error → null (the caller answers 503, as
  today)"): right to stop. Wave-1's `complete` (75500e3 message-read.ts:582)
  never covered `readReplyCounts`; the parenthetical's "as today" is false,
  and 9's opening says "Additive only", so keeping today's behaviour
  (`reply_count: null`, the page 200) is the reading that changes nothing;
  the builder named the one-line alternative. Nothing in it touches the
  security lens (a null count leaks nothing). The integration review
  decides; the contract is not changed by the batch.
- SIBLING: none recorded; the gate file says typecheck and build passed
  with the siblings' files in the tree. Consistent with `git status` here
  (nothing of B2's is modified; only an untracked review file).

## Verdict

PASS with findings. No HIGH: no leak, no gate red, no contract name
changed. One MEDIUM (the two routes' own paths are untested; the security
orderings of 4.3 rest on reading), two LOW (the sender's own removed poll
is hydrated against 5.2's sentence; the notes file's STOPPED section holds
four log lines).
