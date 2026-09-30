# W2-B4 review — lens: security

Reviewer: Claude (cloud session, read-only on the tree; this file is the one write). Batch commits reviewed:
35554ab, 90043bf, a478b73, 0f4d7e1, 208effe, 28c9b4b (`git diff 75500e3 -- <B4 files>`). Contract:
`wave-2-contracts.md` sections 7 (7.1-7.3), 8 (8.2-8.4), 5.4, 5.5, 1.3, 12.4, 13.2, 13.3. Policies read in the
migrations: `messages_select_org_member` (20260923090000:2244, the only club-room SELECT arm on `messages`),
`channels_select_org_member` → `can_view_org_channel` (A:1319), `channel_members_select_member` →
`can_read_channel_roster` (20260928150000:255-284), `orgs_select` (20260916103000:759), `users_select_authenticated`
(20260923090000:2330), `events_select_visible` / `event_visible` (20260928110000:382-391), `blocks_select_either`.

Method: refute the batch against the contract and the code, one lens question at a time; re-run the cheap gates.

## Verdict

**PASS.** No HIGH, no MEDIUM. Three LOW notes (one is a contract-level observation for the integration review,
one a defensive guard, one an ownership disclosure). Both STOPPED entries were right. No SIBLING claimed; none needed.

Gates re-run by the reviewer (2026-09-30, tree at 28c9b4b + siblings):
`node --test src/lib/chat/reads.test.ts src/lib/chat/reads-routes.test.ts` → 21/21;
`npx eslint <the six files>` → exit 0; `npm run typecheck` → exit 0. (Build not re-run: it collides in `.next`
with sibling builds and B4-gate.md records exit 0 with the three routes in the manifest.)

## Findings

### B4-SECURITY-1 — LOW — the viewer's OWN removed rows can be a preview / `board_latest` (contract-level)
- where: `src/app/api/me/inbox/route.ts:159-165` (the two preview windows), `:244-250` (the event-activity
  read); `src/lib/chat/reads.ts:216` (`lastShown`, the space's `board_latest`).
- what: the cookie preview reads filter `thread_root_id is null` only, as 7.1.4 pins them. RLS decides the rest:
  `messages_select_org_member` is `(removed_at is null or user_id = auth.uid()) and can_view_org_channel(...)`,
  so **nobody else's removed row can reach a preview** (verified: it is the only SELECT policy that covers club
  rooms; `messages_select_member` is `org_id is null`). The one row class that slips through is the viewer's own
  removed message: it can be `board.latest` / `lounge.latest` with its raw `content` (the thread GET keeps
  `content` on such a row too, `message-read.ts:643-668`, so nothing new is exposed), it can move
  `last_activity_at`, and in the space `lastShown` skips `hidden` rows only, so the viewer's own removed Board post
  (`removed !== null`) can be `board_latest`. Not a leak (own text, own timestamps); a cosmetic wrong-row on the
  author's own screen at most. The counts DO filter `removed_at is null` (7.1.5; tested).
- fix: none for B4 (7.1.4 pins the filters; a batch may not add one). For the integration review: if the Board
  strip / previews must never show a removed row, the contract gains `.is("removed_at", null)` on the two preview
  reads and the event-activity read, and 7.2.4 says "not `hidden` and `removed === null`". Decide there.

### B4-SECURITY-2 — LOW — the calendar guards a null `eventRefsFor`, not a throw
- where: `src/app/api/me/calendar/route.ts:123-124`.
- what: 7.3 says the calendar never answers 500 for the three fields. The route handles the contract's failure
  (`null` → nulls + one log line; tested at reads-routes.test.ts:578). A thrown error is not caught. In practice
  `eventRefsFor` does not throw: `serviceOrNull` catches client creation, postgrest-js returns fetch errors as
  `{ error }`, and `roomState` returns a state for any input. Defensive only.
- fix: `try { refs = await eventRefsFor(events, user.id, { counts: false }); } catch (err) { refs = null;
  console.error("[me/calendar rooms]", err instanceof Error ? err.message : err); }` around line 123, keeping the
  existing null log line.

### B4-SECURITY-3 — LOW — three files outside B4's 13.2 row (disclosed)
- where: `src/lib/chat/reads.ts`, `src/lib/chat/reads.test.ts`, `src/lib/chat/reads-routes.test.ts`;
  `B4-notes.md:9-12` says so.
- what: 13.2 gives B4 the three route files only. The helper is pure, imports `room-rules` and types, is owned by
  nobody else, and exists because a route file may export handlers only (a real Next.js rule). No collision in the
  tree. Not a security matter; recorded so the integration review ratifies the ownership line.
- fix: add `src/lib/chat/reads.ts` + the two tests to B4's row in 13.2 (integration review), or nothing.

## STOPPED / SIBLING — judged

- **STOPPED 1 (7.1.4 preview select has no `channel_id`) — right.** The select is read once over
  `channel_id in (<the Board ids>)` and must give "per room, the newest row"; without the column the rows cannot be
  put back on their rooms, and one read per room would break 7.1.4's own "TWO reads" rule. Adding `channel_id`
  is the minimum that makes the sentence true and the thread list's read it copies (`threads/route.ts:669`) selects
  it. Security cost: none (a room id the viewer holds a row on). The integration review should amend 7.1.4's
  select by that one column.
- **STOPPED 2 (7.2.3 `channel_members` read names `channel_id, last_read_at` only) — right.** Section 7's
  opening rule ("a null `last_read_at` is read as the row's `created_at`") cannot be applied without
  `created_at`; a legacy row would otherwise count every message as unread. Own rows only (`user_id = me`), the
  cookie client: nothing of anyone else is read.
- **SIBLING: none claimed — consistent.** My re-run of typecheck and the two test files with the siblings'
  files in the tree is green.

## Holds (each refuted against the code; line numbers are the batch's files at 28c9b4b)

**Never a roster.**
- Inbox (`inbox/route.ts:274-300`): `org` (OrgRef), `viewer_role` (the viewer's own), `board` / `lounge`
  (`room_id`, a `Preview` with `author_name` only — `toPreview`, reads.ts:35-44 — and a count / flag), `next_event`
  (EventRef: counts and the viewer's own status), `last_activity_at`, own `pinned_at` / `muted_until`. No id of
  another person. The service-role `org_members` read for blocked Board authors (`:183-191`) is internal, keyed
  `${org_id}:${user_id}`, never sent.
- Space (`space/route.ts:251-260`): `member_count` is a head count (`:149`); `viewer.role` is the viewer's;
  `rooms` carry no people; `up_next` / `upcoming` are EventRefs (counts + own status); `board_latest` is the
  contract's `ChatMessage` (7.2.4) — the same page shape the thread GET gives the same member, so the Board author's
  `users` Person is nothing new. `?events=1` only widens the same events read to 50 (a member's own club).
- Calendar: `org_id`, `room_id`, `room_state` only; `personal` entries untouched (diff at `:127-146`).

**The hidden-club sweep** (`space/route.ts:104-142`, copied from `channels/route.ts:52-95`): the org and the
viewer's role load on the service client (so a hidden club's row is found and the viewer's role is not an RLS
guess); no role → `hidden_at ? 404 not_found : 403 members_only`; a missing handle → 404. A stranger to a hidden
club and a stranger to a missing handle get the same body. Auth → flag → sweep, so with the flag off the stranger
also sees 404. Tested at reads-routes.test.ts:444-461 (401, flag-off 404, load_failed, not_found, members_only,
hidden-club 404).

**Officers and private rooms only when RLS lets the cookie read see them** (`space/route.ts:150`): the
`channels` read is on `supabase` (cookie) → `channels_select_org_member` → `can_view_org_channel` (A:1319: Officers
/ a private `room` only for owner/admin or the allow-list; an event room only for an officer or a row holder). The
route filters nothing back in. My `channel_members` rows: cookie, `user_id = me` (`:183`), readable because
`can_read_channel_roster` is true for every room RLS just showed. No row → `unread: false` without any count
(`:212`), so no service-role count is ever run on a room the viewer holds no row on.

**Unread counts never include removed rows or replies** (`inbox/route.ts:203-218`, `space/route.ts:62-76`):
`thread_root_id is null`, `removed_at is null`, `user_id <> me`, `created_at > (last_read_at ?? created_at)`;
head counts only. Tested (reads-routes.test.ts:333-341, `since` per room incl. the legacy-row rule).

**Previews skip blocked authors except an officer's Board post** (`inbox/route.ts:176-199`, reads.ts:52-60):
the block set is one cookie `blocks` read (`blockedIdsFor`, 5.4; null → 500 `:142-143`); `isHiddenFrom` (8.2) is
applied with the row's real room (`roomById`, board or lounge; every preview row's `channel_id` comes from the
same `in (...)` list so `room` is never null there); the exception needs a top-level Board row AND the author's
CURRENT owner/admin role from a service-role `org_members` read keyed per club — a blocked admin of club A who is a
plain member of club B shows in A's Board and is hidden in B's (tested, `:299-311`); lounge rows are never
excepted; replies are outside the window (`thread_root_id is null`). With no service key the exception fails
closed (hidden). `author_name` of a shown officer is by design (8.4).

**The preview reads are cookie reads — verified**: `readPreviews` and `readEventActivity` call `supabase`
(`:159`, `:244`), the client from `createSupabaseServerClient()`; the test asserts them on `cookieLog`
(`:318-330`). The service client (`serviceOrNull`) is used for: `org_members` roles of blocked authors, `messages`
head counts, `events`. In the space: `orgs` (sweep), `org_members` (role, head count), `events` (by id, up_next,
upcoming), `messages` head counts, `loadRoom` (one `channels` row). `readChatMessages` for `board_latest` runs on
the cookie client (`:217`). **No message body is read with the service role anywhere in B4's files.**

**The calendar never 500s for the new fields and never leaks a `room_id`**: flag off → the three nulls with no
service read (`:116-118`; tested); `eventRefsFor` null → nulls + 200 (tested at `:578`); `room_id` comes only from
`eventRefsFor`'s rule (held row OR owner/admin of the club — `can_view_org_channel`'s event arm; leaving a club
drops the rows, `org_members_drop_club_access`, so v1 has no stale non-member row); `room_state` for an event the
viewer may not enter is derivable from the `starts_at` / `ends_at` the route already sent. `org_id` of a hidden
club the viewer left (RSVP kept) is an opaque uuid they already held; accepted, contract-pinned (7.3).

**`last_activity_at` never uses `orgs.last_activity_at`**: the `orgs` select is `id, handle, name, logo_url,
banner_url, verified` (`inbox/route.ts:116`); the value is `newestOf(board.latest, lounge.latest, event rooms'
newest)` (`:283-287`), the event-room read on the cookie client.

**Inputs and logs**: the only request input is `?events=1` (`space/route.ts:177`) and the `[slug]` param, which
goes through a parameterized `.eq("handle", slug)`; every other filter value comes from auth or the database.
Log lines carry `code` and `message`, never a body or a person's id (the calendar's pre-existing whole-object logs
at `:105-108` are unchanged code). No rate limit, the same as every sibling GET read (`threads` GET, `channels`
GET, the calendar): consistent, and the read fan-out is bounded by the viewer's few clubs.

**Fail-closed order**: memberships / club refs / roles / blocks → 500 `Request failed` (`:97-105`, `:119-123`,
`:143`); a database without A → `clubs: []` (inbox) / 404 `not_found` (space, 1.3); counts, events and preview
windows → empty values + a log line, never a 500 (tested at `:360`).
