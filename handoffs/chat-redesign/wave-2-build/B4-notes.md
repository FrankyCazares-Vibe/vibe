# W2-B4 notes — the three reads and the calendar fields (contract section 7)

Builder: Claude (cloud session, no database, no browser). Branch `claude/relaxed-davinci-9d11h3`, start HEAD 10346b3.
Owned files (13.2): `src/app/api/me/inbox/route.ts` (NEW), `src/app/api/orgs/[slug]/space/route.ts` (NEW),
`src/app/api/me/calendar/route.ts` (the three fields only).

## Plan

1. `src/lib/chat/reads.ts` (NEW, pure, W2-B4) + `reads.test.ts`: the pure parts of the three reads, so they can be
   tested under `node --test` (a route file may export only handlers and config, so no helper leaves a route file).
   Contract 13.2 names no helper module for B4; the task brief allows this one file and asks that it be said here.
   Contents: `toPreview`, `latestShownPerRoom`, `readSince` (null last_read_at → created_at), `newestOf`,
   `orderInboxClubs` (7.1.9), `groupClubRooms` (7.1.1), `firstPerClub` (7.1.6), `spaceCanPost` (7.2.3),
   `orderSpaceRooms` (7.2.3 order, closed event rooms out), `lastShown` (7.2.4), `messageKindOf`.
2. `GET /api/me/inbox` per 7.1, in the contract's step order.
3. `GET /api/orgs/[slug]/space` per 7.2, the sweep copied from `channels/route.ts:41-95`.
4. `GET /api/me/calendar` per 7.3: `org_id` in the select, `chatV2For`, `eventRefsFor(..., { counts: false })`.
5. Stub-harness route tests (a fake cookie client + a fake service client through `module.registerHooks`, the
   `event-refs.test.ts` pattern; `next/server`, `@/lib/supabase/*`, `@/lib/chat/flag-server`, and for the space route
   `@/lib/chat/rooms` / `@/lib/chat/message-read` / `@/lib/chat/event-refs` are resolved to small data: modules).
   They live under `src/lib/chat/` (`inbox-route.test.ts`, `space-route.test.ts`, `calendar-route.test.ts`) because
   `npm test` globs `src/**/*.test.ts` and a path with `[slug]` never matches (the rpc-refusal.test.ts precedent).
6. Gates (13.3): typecheck, test, build, eslint on my files; `B4-gate.md`.

## Decisions taken while reading (each traced to the contract)

- Inbox preview select gains `channel_id` (see STOPPED 1).
- Inbox preview reads (cookie) soft-fail like the pattern they copy (`threads/route.ts:646-692`: "Soft-fail: still
  render the list without previews"): a failed window → `latest: null` for those rooms and one log line. They do not
  decide visibility (RLS and the block set do), so the section-7 500 rule for "a failed cookie read that decides
  visibility" is applied to steps 1, 2, 3 (memberships, club refs + roles, the block set) as the threads route does.
- Inbox step 1 on a database without A: the read is repeated without `kind` (the threads route's retry); a retry that
  succeeds answers `{ ok: true, clubs: [] }` (no kind = no rooms); a retry that fails → 500.
- Space on a database without A (`channels.kind` missing): 404 `not_found` (1.3: "a gated route with ... the schema
  missing").
- The officer exception's `org_members` read (7.1.4) that fails → those rows stay hidden (fail closed on visibility,
  logged); it is a service-role read whose "empty value" is "no officer".
- Space `channel_members` read selects `created_at` too (see STOPPED 2).
- Space event rooms whose `EventRef` could not be built (`eventRefsFor` null, logged): `event: null`, kept in the
  event group (an unknown state is not "closed"), ordered after the rooms with a known `starts_at`.

## Log
- Notes written before the first edit.
- reads.ts written (pure helpers: previews, times, inbox grouping/order, space can_post/order/lastShown).
- inbox/route.ts written (7.1 steps 1-9; steps 5/6/7 run side by side, the fields are the same).
- space/route.ts written (7.2: the copied sweep, org+member_count, viewer, rooms, board_latest, up_next, ?events=1 upcoming; one eventRefsFor over the rooms' events + up_next + upcoming, the same per-event refs).
- calendar/route.ts edited (7.3: org_id in the select, chatV2For after the rows, eventRefsFor counts:false, nulls on flag off / failure; personal entries untouched).
- Committed: reads.ts + test + notes; inbox route; space route; calendar fields (four commits). tsc repo-wide exit 0; eslint exit 0 on the five files; reads.test.ts 9/9.
- reads-routes.test.ts written and committed (12 tests: the decision tables of the three routes against fake cookie/service clients; the fixed expectations were mine, not the routes').
- Gates run (13.3): typecheck exit 0; npm test 1523/1523; build exit 0 (three routes in the manifest); eslint exit 0 on the six files. B4-gate.md written.

## STOPPED (the contract against itself; built as noted, nothing improvised beyond the one column each)

1. **7.1.4 preview select has no `channel_id`.** The select it pins (`id, content, created_at, user_id, kind, thread_root_id,
   users:users!messages_user_id_fkey(name)`) is read ONCE over `channel_id in (<the Board ids>)` and must then give
   "per room, the newest row"; without `channel_id` in the answer the rows cannot be put back on their rooms. The thread
   list's read it copies (`threads/route.ts:669`, "the thread list's own pattern") selects `channel_id`. Built: the pinned
   select plus `channel_id` (`PREVIEW_SELECT` in `inbox/route.ts`). If the column must not be there, the previews cannot
   be built as one read per kind.
2. **7.2.3 my `channel_members` read names `channel_id, last_read_at` only,** while section 7's opening rule ("a null
   `last_read_at` is read as the row's `created_at`") and 7.1.5's count (`created_at > <my last_read_at ?? my row's
   created_at>`, which 7.2.3 reuses) need `created_at`. Built: `channel_id, last_read_at, created_at`. Without it a
   legacy row with a null `last_read_at` would count every message as unread.

## Decisions a reviewer should know (not contradictions)

- Every 404 of the space route (flag off, missing handle, hidden club to a non-member, schema missing) is
  `refusalBody("not_found")` ("That's not there anymore."): 1.3 keeps the old sentences for WAVE-1 routes only, and the
  space route is new. `unauthorized` and `load_failed` keep the copied sweep's shape (7.2, N20), with "Couldn't load
  this club." as 7.2 says.
- Space `eventRefsFor`: ONE call over the rooms' events + up_next + upcoming rows (the function is per-event
  deterministic for one viewer and one `now`, so the refs are the same as three calls would give); a null answer empties
  all three, logged.
- Inbox steps 5, 6, 7 and the two preview windows run side by side (Promise.all); the fields are the contract's.
- Space: a failed cookie `channel_members` read (my rows) → every room `unread: false`, logged (it decides a dot, not
  visibility). A failed preview window in the inbox → `latest: null` for those rooms, logged (the thread list's soft-fail).
- `viewer.role` in the space route must be a `ClubRole` (`isClubRole`); an unknown role string reads as "no role".

## REQUESTS

- None. Nothing outside the batch's files was needed; `types.ts` already carried every shape (InboxClub, SpaceResponse
  with `upcoming?`, CalendarRoomFields).

## SIBLING

- None: typecheck and build passed with the siblings' files present.

## Files (W2-B4)

- `src/app/api/me/inbox/route.ts` (new), `src/app/api/orgs/[slug]/space/route.ts` (new), `src/app/api/me/calendar/route.ts` (edited)
- `src/lib/chat/reads.ts` + `reads.test.ts` (new, pure; the task brief's allowance), `src/lib/chat/reads-routes.test.ts` (new, the stub harness)
- `handoffs/chat-redesign/wave-2-build/B4-notes.md`, `B4-gate.md`
