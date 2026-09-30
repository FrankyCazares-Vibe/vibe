# W2-B4 review — lens "contract" (section 7, 3.10, 1.3, 5.4/5.5, 8.3, 13.2/13.3)

Reviewer: Claude (cloud session; read-only on the tree except this file). Reviewed at HEAD 28c9b4b
(the six B4 commits 35554ab, 90043bf, a478b73, 0f4d7e1, 208effe, 28c9b4b on `claude/relaxed-davinci-9d11h3`).
Method: refute every field of `InboxClub`, `SpaceResponse` (+ `upcoming`) and `CalendarRoomFields` against
7.1-7.3, the pinned client per read, limits, orders, the preview hint, the officer exception, the unread rules,
`can_post`, the closed-room exclusion, `board_latest`, the gates and codes, 3.10's missing-schema rows; compare
with `types.ts`; re-run the gates.

## Gates, re-run by the reviewer (13.3)

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1523 tests, 1523 pass, 0 fail |
| `npm run build` | exit 0; `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar` in the manifest (ƒ Dynamic); one run, no collision |
| `npx eslint` over the six B4 files | exit 0, 0 problems |

The builder's `B4-gate.md` records the same four results; they reproduce.

## Verdict

**PASS.** No HIGH, no MEDIUM. Three LOW notes (two documented soft-fail choices, one ownership note). Both
STOPPED entries are right (the contract omits a column each read needs; the builder added exactly that column
and nothing more). SIBLING: none, and none was needed (typecheck and build are green with the siblings' files).

## Findings

### B4-CONTRACT-1 — LOW — inbox preview windows soft-fail to `latest: null` instead of 500
- where: `src/app/api/me/inbox/route.ts:166-169`
- what: section 7's opening rule says "a failed cookie read that decides visibility → 500 `{ ok: false, error:
  "Request failed" }`"; the two preview reads are cookie reads of messages. The builder answers `[]` for the
  failed window (every room of that kind gets `latest: null`) and one log line, following the pattern 7.1.4
  itself cites ("the thread list's own pattern, `threads/route.ts:646-692`", whose comment reads "Soft-fail:
  still render the list without previews"). The two sentences of the contract pull apart here; the builder
  picked the cited pattern and wrote it in B4-notes ("Decisions taken while reading"). Nothing leaks: a failed
  window shows less, never more. Steps 1, 2 and 3 (memberships, refs + roles, the block set) do 500.
- fix: the integration review pins one of the two. To follow the opening sentence literally: in `readPreviews`
  replace `return [];` after the log line with a thrown sentinel caught at the `Promise.all` and answered by
  `requestFailed()`. To keep the builder's reading: no code change; record the acceptance in the integration
  notes (a 7.1.4 footnote: "a failed window → `latest: null` for its rooms, logged").

### B4-CONTRACT-2 — LOW — space: a failed cookie `channel_members` read → every room `unread: false`, not 500
- where: `src/app/api/orgs/[slug]/space/route.ts:190-192`
- what: 7.2.3 reads my rows on the cookie client and says nothing about its failure; the builder logs and
  treats every room as "no row → `unread: false`" (the rule of 7.2.3 for a missing row). The read decides a
  dot, not visibility, so section 7's 500 rule does not reach it; a failure hides dots, never rooms or text.
  Written in B4-notes ("Decisions a reviewer should know").
- fix: none required; the integration review records the acceptance next to B4-CONTRACT-1 (same footnote).

### B4-CONTRACT-3 — LOW — `src/lib/chat/reads.ts` is not in 13.2's W2-B4 row
- where: `src/lib/chat/reads.ts:1` (new file, 227 lines) and its tests `reads.test.ts`, `reads-routes.test.ts`
- what: 13.2 gives W2-B4 the three route files only. The builder put the pure decisions (previews, `readSince`,
  `newestOf`, grouping, both orders, `spaceCanPost`, `lastShown`) in a new module so `node --test` reaches
  them (a route file may export only handlers), and says the task brief allowed "this one file". The tests are
  covered by 13.3 ("add your tests as `src/**/*.test.ts`"). No other batch owns or touches `reads.ts`
  (`git log --all -- src/lib/chat/reads.ts` shows only B4), so there is no collision; the routes' behaviour is
  exactly the contract's whether the helper lives in the route or beside it.
- fix: the integration review adds `src/lib/chat/reads.ts` + `reads.test.ts` + `reads-routes.test.ts` to
  W2-B4's row in its notes (no code change).

## The builder's STOPPED entries, judged

- **STOPPED 1 (7.1.4's preview select has no `channel_id`) — right.** One read per kind over `channel_id in
  (<the Board ids>)` must give "per room, the newest row"; without `channel_id` in the answer no row can be put
  back on its room. The pattern 7.1.4 cites (`threads/route.ts:669`) selects `channel_id`. The builder added
  exactly that column (`PREVIEW_SELECT`, `inbox/route.ts:37-38`) and nothing else; the join hint
  `users:users!messages_user_id_fkey(name)` is as pinned (N2).
- **STOPPED 2 (7.2.3's `channel_members` read names `channel_id, last_read_at` only) — right.** Section 7's
  opening rule ("a null `last_read_at` is read as the row's `created_at`") and 7.1.5's count, which 7.2.3
  reuses, need `created_at`. Added exactly that column (`space/route.ts:183`). Without it a legacy row would
  count every message as unread.
- **SIBLING: none** — correct; the reviewer's own typecheck and build are green with the siblings' files.

## Holds (checked line by line)

**Shapes (`types.ts:371-435`)**: `Preview`, `InboxClub`, `InboxResponse`, `CalendarRoomFields`, `SpaceRoom`,
`SpaceResponse` (+ `upcoming?`) are produced field for field; no name, field or code changed. `EventRef` comes
from `eventRefsFor` untouched. `orderSpaceRooms` strips the sort-only `position` before answering (`reads.ts:212`).

**7.1 `GET /api/me/inbox`** (`inbox/route.ts`)
- Gates: auth 401 → `chatV2For` 404 `refusalBody("not_found")` (`:72-77`).
- 7.1.1 cookie `channel_members` select `channel_id, created_at, last_read_at, pinned_at, muted_until,
  channels!inner(id, org_id, kind, name)`, `user_id = me`, `channels.org_id not null` (`:81-90`); the threads
  route's no-`kind` retry (`:92-101`) → `{ ok: true, clubs: [] }` (3.10's inbox row); a failed retry → 500.
  Grouping by `org_id`, a club without both `board` and `lounge` rows left out (`reads.ts:110-132`).
- 7.1.2 cookie `orgs` select `id, handle, name, logo_url, banner_url, verified` → `OrgRef` with
  `orgAssetProxyUrl` (`:116, :127-134`, the `threads/route.ts:529-536` shape); cookie `org_members` `org_id,
  role`, `user_id = me` → `viewer_role` via `isClubRole`; a club with no role row (or no readable ref) left out
  (`:278`). A failed read → 500 (`:119-123`).
- 7.1.3 `blockedIdsFor(supabase, user.id)` once; null → 500 (`:142-143`).
- 7.1.4 TWO cookie preview reads, Board ids then Lounge ids, `thread_root_id is null`, `created_at desc`,
  `limit(ids.length * 5)` (`:157-172`); per room the newest row not hidden by `isHiddenFrom(row, blocked, room,
  authorRole)` (`:193-199`, `reads.ts:52-60`); the Board officer exception through ONE service-role
  `org_members` read `org_id, user_id, role` for the blocked authors met in the Board window, keyed by
  club + author (`:180-192`); `Preview = { id, text: content, author_name: users?.name ?? "", created_at,
  kind }` (`reads.ts:35-44`); a window of hidden rows → `latest: null`.
- 7.1.5 service-role head counts `count: "exact", head: true`, `channel_id`, `thread_root_id is null`,
  `removed_at is null`, `user_id <> me`, `created_at > (last_read_at ?? created_at)` (`:203-218`,
  `readSince`); `board.unread = count > 0`, `lounge.unread_count = min(count, 99)` (`:279-280`); a failed
  count or no service key → 0 / false, logged, never 500.
- 7.1.6 service-role `events` select `id, title, starts_at, ends_at, location, org_id`, `org_id in (…)`,
  `ends_at > now()`, `starts_at asc`, `limit(clubs.length * 10)` (`:222-236`); first per club
  (`firstPerClub`) → `eventRefsFor(…, user.id)` with counts on (the default, `event-refs.ts:144`) →
  `next_event` or null (`:268-282`).
- 7.1.7 `last_activity_at` = newest of `board.latest`, `lounge.latest` and the cookie read `channel_id,
  created_at` over the event rooms I hold a row on, `thread_root_id is null`, desc, `limit(ids.length * 3)`,
  newest per room (`:240-259`, `:283-287`); null when all null; NOT `orgs.last_activity_at`.
- 7.1.8 `pinned_at`, `muted_until` from the Lounge row (`:295-296`).
- 7.1.9 order pinned first (newest pin first), `last_activity_at` desc nulls last, `org.name`
  (`reads.ts:153-165`).
- 3.10: needs only A; without A → `{ ok: true, clubs: [] }`.

**7.2 `GET /api/orgs/[slug]/space`** (`space/route.ts`)
- Gates in order: 401 `{ ok: false, error: "Unauthorized", code: "unauthorized" }` → `chatV2For` 404
  `not_found` → the copied sweep (`channels/route.ts:41-95`): service `orgs` select `id, handle, name,
  logo_url, banner_url, verified, hidden_at` by `handle` → missing 404 `not_found`; service `org_members.role`
  error → 500 `{ code: "load_failed", error: "Couldn't load this club." }`; no role → `hidden_at ? 404
  not_found : 403 refusalBody("members_only")` ("Members only.", 1.3) (`:97-142`). The `not_found` sentence is
  `refusalBody`'s ("That's not there anymore."): 1.3 keeps the old sentence for wave-1 routes only and this
  route is new.
- 7.2.1 `org` = `OrgRef` + `member_count` service head count `select("user_id", { count, head })`
  (`orgs/[slug]/route.ts:278-281`'s shape); failed → 0 (`:149, :155-163`).
- 7.2.2 `viewer: { role, can_moderate: canModerate(role) }` (`:254`).
- 7.2.3 cookie `channels` select `id, kind, name, event_id, position`, `org_id = org.id`, `type =
  'org_channel'` (`:150`); cookie `channel_members` for those ids and `user_id = me` (`:183`); `unread` =
  7.1.5's service head count `> 0` for rooms I hold a row on, **no row → `unread: false`** with no count asked
  (`:210-213`); `can_post`: board → role in `BOARD_POSTER_ROLES`, event → state `!== "closed"`, else true
  (`reads.ts:175-179`); `event` from `eventRefsFor` over the rooms' events, counts on (`:215, :237`);
  `room_id` is the room's own id for every event room RLS shows me: `can_view_org_channel`'s event arm
  (`20261001100000:1331-1334`: owner/admin OR a `channel_members` row) is the rule `eventRefsFor` applies
  (`event-refs.ts:188, :213-214`). Order lounge, board, officers, open event rooms by `starts_at` asc, rooms
  by `position` then `name`; closed event rooms left out (`reads.ts:194-213`).
- 7.2.4 no `board` → `board_latest: null` + one log line, no throw (`:200-201`); `loadRoom(board.id)` null →
  503 `try_again` (`:202-204`); `readChatMessages(supabase, board.id, { limit: 6 }, { viewerId, access: { ok:
  true, isOrgChannel: true, orgId, accepted_at: null, cleared_at: null, kind: "board", eventId: null }, room })`
  exactly (`:217-226`; signature `message-read.ts:812-817`); `!ok` → its status and body (`:231`); the last
  non-`hidden` of the oldest-first array (`lastShown`, `reads.ts:216-221`); never `toChatMessages`.
- 7.2.5 `up_next`: service `events`, `org_id = org.id`, `ends_at > now()`, `starts_at asc`, `limit 3` →
  `EventRef[]` (`:35-48, :186, :257`).
- 7.2.6 `?events=1` → `upcoming` with `limit 50`; absent otherwise (`:177, :187, :259`).
- One `eventRefsFor` call over the rooms' events + `up_next` + `upcoming` (`:215`): the function is per-event
  deterministic for one viewer and one `now` and dedups ids (`event-refs.ts:135-141`), so each ref is what
  three calls would give; null → the three empty, one log line (`:229, :248-249`).
- 3.10: the `channels` read's `42703` → `isMissingChatSchema` → 404 `not_found`, warned once (`:164-169`);
  another failure → 500.

**7.3 `GET /api/me/calendar`** (`calendar/route.ts`)
- NOT gated. The RSVP select gains the plain column `org_id` inside the `events!inner(...)` embed; `org` stays
  the RLS embed (`:86-90`).
- After the rows: `chatV2For(user.id)`; flag off → `org_id: null, room_id: null, room_state: null` on every
  `rsvp` entry, `eventRefsFor` not asked (`:116-125, :131-133`); flag on → `eventRefsFor(events, user.id,
  { counts: false })` → `org_id: ev.org_id`, `room_id: ref.room_id`, `room_state: ev.org_id ? ref.state :
  null` (`:130-132`; a ref exists for every event given, `event-refs.ts:211-228`); a null build → the three
  null on every entry and one log line, 200 (`:122, :133`). `personal` entries, `color` and the rest untouched.
- `CalendarEntry`'s `rsvp` arm gains `& CalendarRoomFields` (additive; desktop "My Calendar" typechecks).

**Clients**: cookie for memberships, refs, roles, blocks, previews, event-room activity, rooms, my rows and
the Board page; service role for the counts, the officer-role check, `events`, `member_count` and inside
`eventRefsFor`; never a roster (the only `org_members` reads by service role are `role` of me, a head count,
and the roles of the blocked Board authors met).

**Codes and sentences (1.3)**: `not_found`, `members_only`, `try_again` through `refusalBody`;
`unauthorized` / `load_failed` in the copied sweep's shape (N20); nothing renamed.

**Tests (13.3 stub harness)**: `reads.test.ts` (9) covers every pure rule incl. null `last_read_at`, the
orders, the closed-room exclusion, `lastShown`; `reads-routes.test.ts` (12) walks the decision tables of the
three routes with fake cookie / service clients: the 401/404 gates, the no-A retry → `clubs: []`, the
fail-closed 500s, the happy path field by field with the pinned selects / filters / limits (10 and 3 for the
windows, 20 for events), the officer exception kept and a blocked member skipped, the soft-fails, the space
sweep (401, flag 404, `load_failed`, `not_found`, `members_only`, hidden club), the `42703` → 404, no row →
`unread: false`, the order with the closed room out, the last non-hidden Board post, no Board → null,
`loadRoom` null → 503, the page refusal passed through, `?events=1`, the calendar's flag off / on / failed
build. No path of section 7 is left untested.

**Commits**: six, named, on the branch, files added by path; the tree holds no uncommitted B4 file.
