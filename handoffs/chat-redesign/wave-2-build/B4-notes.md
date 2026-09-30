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
