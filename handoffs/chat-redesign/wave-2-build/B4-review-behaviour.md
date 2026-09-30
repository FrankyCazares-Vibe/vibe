# W2-B4 review — lens "behaviour" (contract section 7, 8.3, 3.10, 13.3)

Reviewer: Claude (cloud, read-only on the tree; this file is the only write). Branch `claude/relaxed-davinci-9d11h3`,
HEAD 28c9b4b. Commits reviewed: 35554ab, 90043bf, a478b73, 0f4d7e1, 208effe, 28c9b4b (`git diff 75500e3 -- <files>`).
Files: `src/lib/chat/reads.ts` + `reads.test.ts`, `src/lib/chat/reads-routes.test.ts`, `src/app/api/me/inbox/route.ts`,
`src/app/api/orgs/[slug]/space/route.ts`, `src/app/api/me/calendar/route.ts`, `B4-notes.md`, `B4-gate.md`.

## Gates, re-run by the reviewer (13.3)

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0 |
| tests | `npm test` | 1523 tests, 1523 pass, 0 fail (`reads.test.ts` 9, `reads-routes.test.ts` 12 among them) |
| build | `npm run build` | exit 0; `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar` in the manifest (ƒ Dynamic); one run, no collision |
| eslint | `npx eslint` over the six files | exit 0 |
| signatures | `git log 35554ab..HEAD -- message-read.ts event-refs.ts blocks.ts stub.ts types.ts` | empty: no sibling changed a callee after B4 started; the routes call `readChatMessages(client, id, { limit }, ReadKnown)`, `eventRefsFor(rows, viewer, { counts? })`, `blockedIdsFor(client, viewer)`, `loadRoom(id)`, `isHiddenFrom(row, blocked, room, role)` as they are declared today |

## Method

The contract's 7.1 / 7.2 / 7.3 were walked step by step against the routes, then the scenarios of the brief were run
through the code by hand and against the stub harness (`reads-routes.test.ts`, whose fake clients log every
`select` / filter / `limit`, so the pinned reads could be checked call by call):

- inbox: a member of two clubs, one pinned (`L2.pinned_at = T5`), one muted (`L1.muted_until = T20`); the Board with an
  unread officer post by a blocked admin; the Lounge with 3 unread by others (the fake count says 150 → capped 99);
  an event room the viewer holds a row on; a blocked author's message newest in the Lounge;
- space: as a member (`role: member`) and as the owner; Officers only for the owner (RLS on the cookie `channels`
  read — the route cannot add a chip RLS did not give); a closed event room absent; `can_post` on the Board; `board_latest`
  when the Board's newest of the latest 6 is a stub;
- the calendar with the flag off and on, and with `eventRefsFor` failing.

## Verdict

**PASS with one repair.** No HIGH. One MEDIUM (a pinned rule missed on the space's failure path: an event room whose
`EventRef` is missing keeps its chip and `can_post: true` even when its event is over, although the route holds the
event's dates and could apply `roomState`). Two LOW. Every field of the three answers otherwise matches section 7,
including the order of the inbox and of the space's rooms; the gates are green; both STOPPED entries were right;
"SIBLING: none" was right.

## Findings

### B4-BEHAVIOUR-1 — MEDIUM — space: an event room without an `EventRef` is never "closed" and always `can_post: true`

- where: `src/app/api/orgs/[slug]/space/route.ts:237-243` (`event = refOfRoom(...)`, `can_post: spaceCanPost(kind, role, event?.state ?? null)`) and `src/lib/chat/reads.ts:195` (`orderSpaceRooms` drops only `room.event?.state === "closed"`).
- what: 7.2.3 pins `can_post` for an `event` room as `roomState(...) !== "closed"` and the order as "event rooms with `state !== "closed"` by `starts_at` asc ... closed event rooms are left out". The route takes the state from the `EventRef` only. When `refs` is null (one of `eventRefsFor`'s four service reads failed, line 215/229) or `readEventsById` failed (line 51-58 → `roomEvents` empty → no ref for the room), every event room of the club — the ones whose events ended weeks ago included — gets a chip with `event: null` and `can_post: true`, ordered after the dated ones (`reads-routes.test.ts` ~line 535 pins this: "no ref: an unknown state is not closed"). The notes call it a decision ("an unknown state is not closed"); but the state is not unknown when `roomEvents` was read: the route holds `starts_at` / `ends_at` for each room's event and `roomState` is pure. Reach: the failure path only (a transient service-role failure); the happy path is right.
- fix: in `space/route.ts`, after the `Promise.all` of line 181, `const stateOf = new Map(roomEvents.map((ev) => [ev.id, roomState(ev.starts_at, ev.ends_at)]))` (`import { roomState } from "@/lib/chat/room-state"`); in the `rooms` map, `const state = event?.state ?? (row.event_id ? (stateOf.get(row.event_id) ?? null) : null)` and `can_post: spaceCanPost(kind, role, state)`; give `SpaceRoomWithPosition` a `state: RoomState | null` and a `starts_at: string | null` (from the ref or the `roomEvents` row) and let `orderSpaceRooms` filter on `room.kind === "event" && room.state === "closed"` and sort event rooms by `starts_at` — so a room whose ref failed but whose dates are known takes its right place. A room whose event row could not be read either stays as built (kept, after the dated ones). Flip the expectation at `reads-routes.test.ts` ~535 (`SP.closed` out, `SP.open` kept with `can_post` by its state) and add one `orderSpaceRooms` case in `reads.test.ts` with `event: null, state: "closed"`.

### B4-BEHAVIOUR-2 — LOW — inbox: the officer-exception read failing on its own is not tested (rows must stay hidden)

- where: `src/app/api/me/inbox/route.ts:182-192`; `src/lib/chat/reads-routes.test.ts` "a failed preview window, a failed count, failed events or no service role never answer 500".
- what: the route's rule (notes, "Decisions taken while reading") is that a failed service-role `org_members` read keeps a blocked officer's Board row hidden (fail closed on visibility, logged). The test that fails the service client also fails the cookie `messages` reads, so every preview is null before the exception is reached; the only assertion on the exception's failure path is the `service: null` case (line ~373, `m-b1-old`). The error-answer path (`data` null, `error` set, rows hidden, `latest` = the next visible row) has no assertion.
- fix: one more case in that test: `install({ cookie: inboxCookie, service: (t, c, n) => (t === "org_members" ? { error: { code: "XX000", message: "boom" } } : inboxService(t, c, n)) })` → `clubs[1].board.latest?.id === "m-b1-old"` and status 200.

### B4-BEHAVIOUR-3 — LOW — contract note (not the batch's to change): the viewer's own removed message can be their preview

- where: `src/app/api/me/inbox/route.ts:159-165` (the pinned 7.1.4 read), `src/app/api/orgs/[slug]/space/route.ts:232` (7.2.4 `lastShown`).
- what: `messages_select_org_member` shows a member every non-removed message plus their OWN removed ones (DM:7). 7.1.4 pins the preview window as `thread_root_id is null` only (no `removed_at` filter; the counts of 7.1.5 do filter it), and 7.2.4 takes "the last message that is not `hidden`" (a removed row is not `hidden`). So a member whose own Lounge message was just removed by a mod sees its text as `lounge.latest` in the inbox, and an officer whose own Board post was removed sees it as `board_latest` (with `removed` set, which the strip may not render). Nobody else sees it (RLS). The batch built the pinned reads exactly; the old inbox (12.4) behaves the same. For the integration review to record; the fix, if wanted, is the contract's: `.is("removed_at", null)` on the two preview windows and `!m.hidden && m.removed === null` in `lastShown`.
- fix: none in this batch.

## The builder's STOPPED and SIBLING entries, judged

- **STOPPED 1 (7.1.4's preview select has no `channel_id`) — right.** One read per kind over `channel_id in (...)` must give
  "per room, the newest row"; without `channel_id` in the answer the rows cannot be put back on their rooms. The thread
  list's read that 7.1.4 says it copies (`threads/route.ts:669`) selects `channel_id`. The batch added the one column and
  nothing else (`PREVIEW_SELECT`, the harness asserts the exact string). The contract's select is a slip, not a rule.
- **STOPPED 2 (7.2.3's `channel_members` read names `channel_id, last_read_at` only) — right.** Section 7's opening rule
  and 7.1.5 (which 7.2.3 reuses) read a null `last_read_at` as the row's `created_at`; without `created_at` in the select the
  rule cannot be applied. Built with the one column; `readSince` is shared with the inbox and tested.
- **SIBLING: none — right.** Typecheck, tests and build are green with the siblings' files present (re-run above).
- The notes' other decisions (preview windows soft-fail to `latest: null`; a failed `channel_members` read in the space →
  `unread: false` everywhere; the space's 404s all through `refusalBody("not_found")`; one `eventRefsFor` call over the
  rooms' events + `up_next` + `upcoming`) are each traced to a contract line or to the pattern the contract names, and
  the contract review (B4-CONTRACT-1/2) already records the two soft-fails for the integration review; not repeated here.

## Holds (the scenarios, field by field)

**Inbox (7.1), the simulated member** — walked through `inbox/route.ts` and the harness's "happy path" test:
- Gates: 401 `{ ok: false, error: "Unauthorized" }`; flag off → 404 `refusalBody("not_found")` (tested).
- Step 1: `channel_members` select `channel_id, created_at, last_read_at, pinned_at, muted_until, channels!inner(id, org_id, kind, name)`,
  `user_id = me`, `channels.org_id not null` (the `.not("channels.org_id", "is", null)` embedded filter); the no-`kind`
  retry answers `{ ok: true, clubs: [] }` (3.10's row), a failing retry 500 (tested). `groupClubRooms`: a club needs a
  Board AND a Lounge row; event rooms ride along; `officers` / `room` rows take no part (tested with a board-only club).
- Step 2: `orgs` (cookie, `orgAssetProxyUrl` on logo and banner, `verified === true`) and `org_members` (cookie) →
  `viewer_role`; a club without its ref or role is left out at assembly (the counts for it were read first: harmless,
  a few head counts). Either read failing → 500 (tested).
- Step 3: `blockedIdsFor` null → 500 (tested).
- Step 4: two windows, the pinned select + `channel_id`, `thread_root_id is null`, `created_at desc`, `limit ids*5`, Board
  ids then Lounge ids (tested call by call). Per room the first row `isHiddenFrom` lets through: the blocked admin's
  Board post shows (`officerRole` from ONE service `org_members` read over the blocked authors met, `in org_id`), the same
  person's Board post in the club where they are a member is skipped (`latest: null` when nothing else is in the window),
  the blocked author's newest Lounge message is skipped and the next row (an `event_card`, author `""` because `users` is
  null) is the preview (tested). `Preview = { id, text, author_name, created_at, kind }`, nothing more (deepEqual).
- Step 5: service head counts, `thread_root_id is null`, `removed_at is null`, `user_id <> me`, `created_at > last_read_at ?? created_at`
  (tested: `T2` for the Board, the row's `created_at` for the legacy Lounge row); `board.unread = count > 0`,
  `lounge.unread_count = min(count, 99)` (150 → 99, tested); a failed count / no service role → 0 / false (tested).
- Step 6: `events` service read `in org_id`, `ends_at > now`, `starts_at asc`, `limit clubs*10` (20 for two clubs, tested);
  `firstPerClub`; `eventRefsFor(<first per club>, me)` counts on (the call's arguments are asserted); null → `next_event`
  null everywhere, 200.
- Step 7: `last_activity_at` = newest of `board.latest.created_at`, `lounge.latest.created_at` (the SHOWN previews, so a
  blocked author's newer row does not move the club) and the event rooms' newest top-level row (cookie read,
  `limit ids*3`; the event room's `T12` wins, tested); null when all three are null (tested, the second club).
- Step 8: `pinned_at`, `muted_until` from the Lounge row (`T5`, `T20`, tested).
- Step 9: `orderInboxClubs` — pinned first, newest pin first, then `last_activity_at` desc with nulls last, then `org.name`
  (six-club unit test; the route test sees the pinned club first).
- The service role is used for counts, events and the blocked authors' roles only; nothing read with it is sent except
  counts and `EventRef`s; no roster.

**Space (7.2), member and owner** — walked through `space/route.ts` and the harness's sweep / happy-path / owner tests:
- The sweep is the channels list's, copied: 401 with `code: "unauthorized"`; flag off → 404; service `orgs` by `handle`
  with the pinned seven columns → missing 404 `not_found`; `org_members.role` error → 500 `load_failed` with
  "Couldn't load this club."; no role → `hidden_at ? 404 : 403 members_only` ("Members only.") (all tested).
- `org`: `OrgRef` + `member_count` from the service head count, a failed count → 0. `viewer`: `{ role, can_moderate }`
  (`member` → false, `owner` → true; tested).
- `rooms`: cookie `channels` select `id, kind, name, event_id, position`, `org_id = org.id`, `type = 'org_channel'`; rows
  without a room kind dropped; a database without A → 404 (tested), another failure → 500 (tested). Officers appears for
  the owner and not for a member exactly as the cookie read gives it (RLS `can_view_org_channel`; the harness cannot
  simulate the policy, the Mac's step 2 does). My `channel_members` rows (`channel_id, last_read_at, created_at`) → per
  room `unread` = the 7.1.5 head count `> 0` for rooms I hold a row on, `false` without a row (Officers: no row, no dot,
  the owner included; tested: counts asked for the three held rooms only, a null `last_read_at` read as `created_at`).
  `can_post`: Board by `BOARD_POSTER_ROLES` (member false, owner true — tested), event by state (`live` → true), the rest
  true. `event` from the one `eventRefsFor` call (`room_id` = the room's own id when I hold a row or am an officer).
  Order: lounge, board, officers, open event rooms by `starts_at`, rooms by `position` then `name`; the closed event
  room out; `position` stripped from the answer (both tests). See B4-BEHAVIOUR-1 for the no-ref path.
- `board_latest`: no Board → null + one log line, 200 (tested); `loadRoom` null → 503 `try_again` (tested);
  `readChatMessages(supabase, board.id, { limit: 6 }, { viewerId, access: { ok: true, isOrgChannel: true, orgId, accepted_at: null, cleared_at: null, kind: "board", eventId: null }, room })`
  (the exact `ReadKnown` is asserted); a refusal passes through with its status (tested); the page is the latest 6
  oldest first (`readChatMessages` reads desc and reverses), `lastShown` takes the last non-`hidden` — the stub newest →
  the post before it (`p2`, tested). Never `toChatMessages`.
- `up_next`: service `events`, `ends_at > now`, `starts_at asc`, `limit 3`, in that order through the refs (tested);
  `?events=1` adds `upcoming` with `limit 50`, absent otherwise (tested); a null `eventRefsFor` empties both, 200.

**Calendar (7.3)** — walked and tested:
- The RSVP select gains `org_id` inside the `events!inner(...)` embed, `org:orgs(...)` untouched (asserted).
- Flag off: `chatV2For` asked after the rows, `eventRefsFor` never asked, every `rsvp` entry `org_id: null, room_id: null, room_state: null`,
  the rest of the entry byte for byte as before (`color`, `viewer_status`, `org`), `personal` entries untouched, the
  order by `starts_at` unchanged (tested).
- Flag on: `eventRefsFor(<rsvp events>, me, { counts: false })` with the six `EventRow` fields (asserted); `org_id: ev.org_id`,
  `room_id: ref.room_id`, `room_state: ev.org_id ? ref.state : null` (a personal event with no club → all null, tested);
  a null answer → the three fields null on every entry, 200, one log line (tested). Not gated (401 only).

**Other holds**
- 3.10 rows: inbox without A → `clubs: []`; space without A → 404; the calendar without A → nulls through `eventRefsFor`.
- Both preview windows and the event-room activity read are cookie reads; `author_name` is `""` when `users` is null
  (a restricted account), never a service-role name.
- No Board exception outside the Board (`isHiddenFrom` ignores `authorRole` for a Lounge row); replies never reach the
  previews (`thread_root_id is null` on both windows).
- `reads.ts` is pure (imports `room-rules` and types only) and its nine tests run under `npm test`; the route harness keeps
  `stub`, `blocks`, `room-rules`, `schema`, `org-asset-url` real and fakes only the clients, the flag, `event-refs`,
  `rooms`, `message-read`, `next/server`, `server-only`.
- Ownership: `reads.ts`, `reads.test.ts`, `reads-routes.test.ts` are outside 13.2's W2-B4 row; the task brief allowed the
  helper and the tests, the notes say so, and no sibling file was touched (B4-CONTRACT-3 already records it).
